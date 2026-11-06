"""Generate idempotent SQL that re-creates ONE organization's configuration elsewhere.

Reads from a source database (e.g. staging) in a read-only transaction and prints SQL
for the operator to review and run on the target (e.g. production) by hand. This script
never connects to the target and never writes anywhere.

Exported (allowlist): organization settings, modules, billing profile (optional),
training offers, camps and training sessions (camps with offer_id).
Never exported: registrations, players and their notes/goals/measurements, club members
(Mitglieder-Import), organization members (logins), invoices, fee rules, audit log,
Stripe ids and switches, publish/review state.

Usage:
  python scripts/ops/export_org_config.py --source-dsn "$STAGING_DB_URL" --org jk-academy-demo
      -> dry run: summary only (counts, warnings), no SQL
  python scripts/ops/export_org_config.py --source-dsn "$STAGING_DB_URL" --org jk-academy-demo \
      --target-slug jk-performance-academy --sql-out jk-prod.sql
      -> writes the SQL file ("-" = stdout); review it, then run it yourself.

Conflict handling (--on-conflict): "nothing" (default) only inserts rows that are missing,
by slug; "update" also overwrites existing config rows on the target. Neither mode deletes.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extensions
from psycopg2 import sql
from psycopg2.extras import Json, RealDictCursor

PROD_REFS = ("wkmckfbzhmihyfwiekct",)  # CampsPilot Production: never a source, never touched
STAGING_MARKERS = ("asowsktznpiioaxerlta", "campspilot-staging", "-git-", "localhost", "127.0.0.1")

ORG_COLUMNS = (
    "name", "legal_name", "contact_email", "contact_phone", "logo_url", "primary_color", "theme",
    "iban", "contact_person_name", "intro_heading", "intro_text", "hero_image_url", "billing_notes",
    "legal_address", "trainer_image_url", "trainer_text", "terms_text", "registration_questions", "modules",
)
ORG_SKIPPED = (
    "id", "slug", "plan_status", "created_at", "updated_at", "site_published", "online_payment_enabled",
    "stripe_account_id", "stripe_charges_enabled", "stripe_express_account_id", "stripe_express_business_type",
    "stripe_express_charges_enabled", "stripe_express_payouts_enabled", "stripe_express_details_submitted",
    "stripe_express_requirements_due", "stripe_express_synced_at", "review_status", "avv_accepted_at",
    "avv_version", "submitted_at", "approved_at", "approved_by", "review_note",
)
BILLING_COLUMNS = (
    "legal_name", "street", "postal_code", "city", "tax_number", "vat_id", "tax_status", "default_vat_rate",
    "tax_exemption_text", "invoice_number_prefix", "invoice_email",
)
BILLING_SKIPPED = ("organization_id", "created_at", "updated_at", "updated_by")
OFFER_COLUMNS = (
    "slug", "title", "kind", "description", "duration_minutes", "location", "price_member_cents",
    "price_nonmember_cents", "status", "category",
)
OFFER_SKIPPED = ("id", "organization_id", "created_at", "updated_at")
CAMP_COLUMNS = (
    "slug", "title", "start_date", "end_date", "registration_start", "registration_end", "age_min", "age_max",
    "capacity", "price_cents", "currency", "status", "location", "care_info", "meals_info", "includes",
    "starts_at", "ends_at", "price_member_cents",
)
CAMP_SKIPPED = ("id", "organization_id", "offer_id", "created_at", "updated_at")
CASTS = {"registration_questions": "jsonb", "modules": "text[]", "includes": "text[]"}

# Counted on the source for the header (aggregate only), never exported.
NOT_EXPORTED = (
    "camp_registrations", "players", "player_notes", "player_goals", "player_measurements",
    "organization_memberships", "organization_members", "invoices", "registration_refund_events",
    "organization_fee_rules", "audit_log",
)


class ExportError(Exception):
    pass


def check_source_dsn(dsn: str) -> None:
    if any(ref in dsn for ref in PROD_REFS):
        raise ExportError("Quelle zeigt auf die Produktionsdatenbank. Dieses Skript liest nur aus Staging/lokal.")
    try:
        psycopg2.extensions.parse_dsn(dsn)
    except psycopg2.ProgrammingError as exc:
        raise ExportError(f"Ungültiger Verbindungs-String: {exc}") from None


def connect_read_only(dsn: str):
    conn = psycopg2.connect(dsn, connect_timeout=10, application_name="export_org_config (read-only)")
    conn.set_session(isolation_level="REPEATABLE READ", readonly=True, autocommit=False)
    with conn.cursor() as cur:
        cur.execute("set local statement_timeout = '30s'")
    return conn


def table_columns(cur, table: str) -> list[str]:
    cur.execute(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = %s",
        (table,),
    )
    return [row["column_name"] for row in cur.fetchall()]


def unknown_columns(cur, table: str, exported, skipped) -> list[str]:
    return sorted(set(table_columns(cur, table)) - set(exported) - set(skipped))


def read_source(conn, org_slug: str, with_billing: bool) -> dict:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            sql.SQL("select id, {} from public.organizations where slug = %s").format(
                sql.SQL(", ").join(map(sql.Identifier, ORG_COLUMNS))),
            (org_slug,),
        )
        org = cur.fetchone()
        if org is None:
            raise ExportError(f"Verein '{org_slug}' gibt es in der Quelle nicht.")
        org_id = org.pop("id")
        billing = None
        if with_billing:
            cur.execute(
                sql.SQL("select {} from public.organization_billing_profiles where organization_id = %s").format(
                    sql.SQL(", ").join(map(sql.Identifier, BILLING_COLUMNS))),
                (org_id,),
            )
            billing = cur.fetchone()
        cur.execute(
            sql.SQL("select {} from public.training_offers where organization_id = %s order by slug").format(
                sql.SQL(", ").join(map(sql.Identifier, OFFER_COLUMNS))),
            (org_id,),
        )
        offers = cur.fetchall()
        cur.execute(
            sql.SQL(
                "select {}, o.slug as offer_slug from public.camps c"
                " left join public.training_offers o on o.id = c.offer_id and o.organization_id = c.organization_id"
                " where c.organization_id = %s order by (c.offer_id is not null), c.starts_at nulls first, c.slug"
            ).format(sql.SQL(", ").join(sql.SQL("c.") + sql.Identifier(col) for col in CAMP_COLUMNS)),
            (org_id,),
        )
        camps = cur.fetchall()
        left_behind = {}
        for table in NOT_EXPORTED:
            cur.execute(sql.SQL("select count(*) as n from public.{} where organization_id = %s").format(
                sql.Identifier(table)), (org_id,))
            left_behind[table] = cur.fetchone()["n"]
        drift = {
            table: cols for table, cols in (
                ("organizations", unknown_columns(cur, "organizations", ORG_COLUMNS, ORG_SKIPPED)),
                ("organization_billing_profiles",
                 unknown_columns(cur, "organization_billing_profiles", BILLING_COLUMNS, BILLING_SKIPPED)),
                ("training_offers", unknown_columns(cur, "training_offers", OFFER_COLUMNS, OFFER_SKIPPED)),
                ("camps", unknown_columns(cur, "camps", CAMP_COLUMNS, CAMP_SKIPPED)),
            ) if cols
        }
    conn.rollback()
    return {"org": org, "billing": billing, "offers": offers, "camps": camps,
            "left_behind": left_behind, "drift": drift}


def warnings_for(data: dict) -> list[str]:
    found = []
    for col, value in data["org"].items():
        if isinstance(value, str) and any(marker in value for marker in STAGING_MARKERS):
            found.append(f"organizations.{col} verweist auf Staging/lokal: auf Prod neu hochladen bzw. anpassen")
    for table, cols in data["drift"].items():
        found.append(f"{table}: neue Spalten nicht exportiert ({', '.join(cols)}), Skript prüfen")
    sessions_without_offer = [c["slug"] for c in data["camps"] if c["starts_at"] and c["offer_slug"] is None]
    if sessions_without_offer:
        found.append(f"Termine ohne Angebot: {', '.join(sessions_without_offer)}")
    return found


def literal(conn, column: str, value) -> str:
    if column in CASTS:
        if CASTS[column] == "jsonb":
            value = Json(value)
        rendered = sql.Literal(value).as_string(conn)
        return f"{rendered}::{CASTS[column]}"
    return sql.Literal(value).as_string(conn)


def _assignments(columns, conflict_update: bool) -> str:
    if not conflict_update:
        return "do nothing"
    return "do update set " + ", ".join(f"{c} = excluded.{c}" for c in columns)


def render_sql(conn, data: dict, source_slug: str, target_slug: str, on_conflict: str) -> str:
    update = on_conflict == "update"
    org_ref = f"(select id from public.organizations where slug = {literal(conn, 'slug', target_slug)})"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "-- ============================================================",
        f"-- Vereinskonfiguration '{source_slug}' -> '{target_slug}' (export_org_config.py, {stamp})",
        "-- Nur Konfiguration: Verein, Module, Rechnungsdaten, Trainingsangebote, Camps/Termine.",
        "-- Keine Anmeldungen, keine Kinder-/Mitglieder-/Spielerdaten, keine Logins, keine Stripe-IDs.",
        f"-- Konflikte: {on_conflict} (nach slug; es wird nie gelöscht). Wiederholbar.",
        "-- Ziel danach: site_published = false, online_payment_enabled = false (bewusst einschalten).",
        f"-- Exportiert: {len(data['offers'])} Angebote, {len(data['camps'])} Camps/Termine, "
        f"Rechnungsdaten: {'ja' if data['billing'] else 'nein'}",
        "-- In der Quelle, NICHT exportiert: "
        + ", ".join(f"{t}={n}" for t, n in data["left_behind"].items()),
    ]
    lines += [f"-- WARNUNG: {w}" for w in warnings_for(data)]
    lines += ["-- ============================================================", "", "begin;", ""]

    cols = list(ORG_COLUMNS)
    values = [literal(conn, c, data["org"][c]) for c in cols]
    lines += [
        "insert into public.organizations (slug, site_published, review_status, online_payment_enabled, "
        + ", ".join(cols) + ")",
        f"values ({literal(conn, 'slug', target_slug)}, false, 'approved', false,",
        "        " + ",\n        ".join(values) + ")",
        f"on conflict (slug) {_assignments(cols, update)};",
        "",
    ]
    if data["billing"]:
        cols = list(BILLING_COLUMNS)
        values = [literal(conn, c, data["billing"][c]) for c in cols]
        lines += [
            "insert into public.organization_billing_profiles (organization_id, updated_by, " + ", ".join(cols) + ")",
            f"select {org_ref}, 'export_org_config',",
            "       " + ",\n       ".join(values),
            f"on conflict (organization_id) {_assignments(cols, update)};",
            "",
        ]
    for offer in data["offers"]:
        cols = list(OFFER_COLUMNS)
        values = [literal(conn, c, offer[c]) for c in cols]
        lines += [
            "insert into public.training_offers (organization_id, " + ", ".join(cols) + ")",
            f"select {org_ref}, " + ", ".join(values),
            f"on conflict (organization_id, slug) {_assignments([c for c in cols if c != 'slug'], update)};",
        ]
    lines.append("")
    for camp in data["camps"]:
        cols = list(CAMP_COLUMNS)
        values = [literal(conn, c, camp[c]) for c in cols]
        offer = "null"
        if camp["offer_slug"]:
            offer = (f"(select t.id from public.training_offers t where t.organization_id = {org_ref}"
                     f" and t.slug = {literal(conn, 'slug', camp['offer_slug'])})")
        lines += [
            "insert into public.camps (organization_id, offer_id, " + ", ".join(cols) + ")",
            f"select {org_ref}, {offer},",
            "       " + ", ".join(values),
            f"on conflict (organization_id, slug) "
            f"{_assignments([c for c in cols if c != 'slug'] + ['offer_id'], update)};",
        ]
    lines += [
        "",
        "commit;",
        "",
        "-- Prüfung (nur lesen):",
        "select o.slug, o.site_published, o.online_payment_enabled, o.modules,",
        "       (select count(*) from public.training_offers t where t.organization_id = o.id) as angebote,",
        "       (select count(*) from public.camps c where c.organization_id = o.id and c.offer_id is null) as camps,",
        "       (select count(*) from public.camps c where c.organization_id = o.id and c.offer_id is not null) as termine,",
        "       (select count(*) from public.organization_billing_profiles b where b.organization_id = o.id) as rechnungsdaten",
        f"from public.organizations o where o.slug = {literal(conn, 'slug', target_slug)};",
        "",
    ]
    return "\n".join(lines)


def summary(data: dict, source_slug: str, target_slug: str) -> str:
    out = [
        f"Quelle: {source_slug} -> Ziel-Slug: {target_slug}",
        f"Module: {', '.join(data['org']['modules'])}",
        f"Rechnungsdaten: {'ja' if data['billing'] else 'nein'}",
        f"Trainingsangebote: {len(data['offers'])} ({', '.join(o['slug'] for o in data['offers']) or '-'})",
        f"Camps: {sum(1 for c in data['camps'] if not c['offer_slug'])}, "
        f"Termine: {sum(1 for c in data['camps'] if c['offer_slug'])}",
        "Bleibt in der Quelle: " + ", ".join(f"{t}={n}" for t, n in data["left_behind"].items()),
    ]
    out += [f"WARNUNG: {w}" for w in warnings_for(data)]
    return "\n".join(out)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-dsn", required=True, help="Verbindung zur QUELLE (Staging/lokal), wird nur gelesen")
    parser.add_argument("--org", required=True, help="Slug des Vereins in der Quelle, z. B. jk-academy-demo")
    parser.add_argument("--target-slug", help="Slug im Ziel (Standard: wie --org)")
    parser.add_argument("--on-conflict", choices=("nothing", "update"), default="nothing")
    parser.add_argument("--no-billing-profile", action="store_true", help="Rechnungsdaten nicht exportieren")
    parser.add_argument("--sql-out", help="SQL hierhin schreiben ('-' = stdout). Ohne: nur Zusammenfassung (Dry Run)")
    args = parser.parse_args(argv)
    target_slug = args.target_slug or args.org
    try:
        check_source_dsn(args.source_dsn)
        conn = connect_read_only(args.source_dsn)
        try:
            data = read_source(conn, args.org, not args.no_billing_profile)
            if not args.sql_out:
                print(summary(data, args.org, target_slug))
                print("Dry Run: kein SQL geschrieben. Mit --sql-out DATEI erzeugen.")
                return 0
            text = render_sql(conn, data, args.org, target_slug, args.on_conflict)
        finally:
            conn.close()
    except (ExportError, psycopg2.Error) as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        return 2
    if args.sql_out == "-":
        sys.stdout.write(text)
    else:
        with open(args.sql_out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(summary(data, args.org, target_slug), file=sys.stderr)
        print(f"SQL geschrieben: {args.sql_out} (nicht ausgeführt)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
