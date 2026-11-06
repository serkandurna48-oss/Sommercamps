"""Builds supabase/golive/PROD-MIGRATION-2026-11.sql from the migrations missing on prod.

Usage: python scripts/ops/build_golive_migration.py <repo_root> <prod_ref> <target_ref>
Prod set = migrations in <prod_ref>, target set = migrations in <target_ref>.
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

root, prod_ref, target_ref = Path(sys.argv[1]), sys.argv[2], sys.argv[3]


def names(ref):
    out = subprocess.check_output(["git", "-C", str(root), "ls-tree", "--name-only", ref, "supabase/migrations/"], text=True)
    return sorted(Path(p).name for p in out.split() if p.endswith(".sql"))


def sha(ref):
    return subprocess.check_output(["git", "-C", str(root), "rev-parse", "--short", ref], text=True).strip()


prod, target = names(prod_ref), names(target_ref)
missing = [n for n in target if n not in prod]
assert not [n for n in prod if n not in target], "prod has migrations the target lacks"
assert all(n > prod[-1] for n in missing), "a missing migration sorts before the last prod migration"

TOP_BEGIN = re.compile(r"^begin;\s*$", re.M | re.I)
TOP_COMMIT = re.compile(r"^commit;\s*$", re.M | re.I)

out = [
    "-- ============================================================",
    "-- CampsPilot SaaS: Produktions-Migration Go-Live November 2026",
    "-- ============================================================",
    f"-- Ziel:    Supabase \"CampsPilot Production\" (Ref wkmckfbzhmihyfwiekct). NICHT Legacy-KSV/JK.",
    f"-- Prod-Stand (Annahme, siehe docs/cto/golive-2026-11.md): {prod_ref} @ {sha(prod_ref)}",
    f"--          = {len(prod)} Migrationen, letzte {prod[-1]}",
    f"-- Ziel-Stand: {target_ref} @ {sha(target_ref)} = {len(target)} Migrationen",
    f"-- Inhalt:  {len(missing)} fehlende Migrationen, in Anwendungsreihenfolge, unveraendert eingebettet.",
    "--          Jede Datei laeuft in EINER eigenen Transaktion: Dateien mit eigenem",
    "--          begin;/commit; unveraendert, alle anderen hier mit begin;/commit; umschlossen.",
    "--          Bricht eine Datei ab, sind die vorherigen schon festgeschrieben, die",
    "--          abgebrochene ist komplett zurueckgerollt. Alle Dateien sind wiederholbar",
    "--          (IF NOT EXISTS / CREATE OR REPLACE / Backfill nur fuer NULL), Neustart von vorn ist sicher.",
    "-- AUSFUEHREN: vorher Backup (Runbook Schritt 2). Bevorzugt per psql:",
    "--   psql \"$PROD_DB_URL\" -v ON_ERROR_STOP=1 -f supabase/golive/PROD-MIGRATION-2026-11.sql",
    "--   (Direct-Verbindung oder Session-Pooler, Port 5432). Keine psql-Metabefehle in dieser Datei:",
    "--   im Supabase-SQL-Editor als EIN Lauf einfuegen; Postgres bricht einen Query-String beim",
    "--   ersten Fehler ab (Annahme fuer den Editor, mit psql belegt).",
    "-- DATEN AENDERN (Backfill): 20261106100000 (players aus Anmeldungen), 20261106130000 (modules),",
    "--   20261106140000 (Gebuehrenregel starter 6,90 % fuer JEDEN Verein), 20261107100000",
    "--   (booked_price_cents = aktueller Camp-Preis), 20261107120000 (anonymized_at fuer Platzhalter-Zeilen).",
    "-- Rollback: je Datei im Dateikopf; Gesamt-Rollback = Restore aus dem Backup.",
    "-- Erzeugt mit scripts/ops/build_golive_migration.py, geprueft mit scripts/ops/verify_golive_migration.sh.",
    "-- ============================================================",
    "",
    "-- Vorbedingung: Prod-Stand muss die letzte Prod-Migration enthalten (health_data_consent).",
    "do $$",
    "begin",
    "    if not exists (select 1 from information_schema.columns",
    "                   where table_schema = 'public' and table_name = 'camp_registrations'",
    "                     and column_name = 'health_data_consent') then",
    "        raise exception 'Abbruch: Prod-Stand fehlt (20261027120000_health_data_consent nicht angewendet). Falsche Datenbank?';",
    "    end if;",
    "end",
    "$$;",
    "",
]
for i, name in enumerate(missing, 1):
    text = subprocess.check_output(["git", "-C", str(root), "show", f"{target_ref}:supabase/migrations/{name}"]).decode("utf-8-sig")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    own_tx = bool(TOP_BEGIN.search(text)) and bool(TOP_COMMIT.search(text))
    out += [
        "-- ------------------------------------------------------------",
        f"-- [{i:02d}/{len(missing)}] {name}",
        f"-- sha256 {digest}",
        f"-- Transaktion: {'eigene (begin/commit in der Datei)' if own_tx else 'hier umschlossen'}",
        "-- ------------------------------------------------------------",
    ]
    if not own_tx:
        out.append("begin;")
    out.append(text.rstrip("\n"))
    if not own_tx:
        out.append("commit;")
    out.append("")
out += [
    "-- Ende. Pruefabfrage (nur lesen):",
    "select (select count(*) from public.organization_fee_rules) as fee_rules,",
    "       (select count(*) from public.camp_registrations where booked_price_cents is null) as ohne_buchungspreis,",
    "       (select count(*) from information_schema.columns where table_schema = 'public'",
    "          and table_name = 'camp_registrations' and column_name = 'anonymized_at') as anonymized_at_spalte,",
    "       (select count(*) from information_schema.columns where table_schema = 'public'",
    "          and table_name = 'camp_registrations' and column_name = 'parent_street') as rechnungsanschrift_spalte;",
    "",
]
dest = root / "supabase/golive/PROD-MIGRATION-2026-11.sql"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text("\n".join(out), encoding="utf-8")
print(f"{dest}: {len(missing)} migrations")
for n in missing:
    print(" ", n)
