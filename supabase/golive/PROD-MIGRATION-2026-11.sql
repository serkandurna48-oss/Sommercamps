-- ============================================================
-- CampsPilot SaaS: Produktions-Migration Go-Live November 2026
-- ============================================================
-- Ziel:    Supabase "CampsPilot Production" (Ref wkmckfbzhmihyfwiekct). NICHT Legacy-KSV/JK.
-- Prod-Stand (Annahme, siehe docs/cto/golive-2026-11.md): origin/feat/platform-foundation @ dbd0c09
--          = 16 Migrationen, letzte 20261027120000_health_data_consent.sql
-- Ziel-Stand: HEAD @ f1b28f9 = 35 Migrationen
-- Inhalt:  19 fehlende Migrationen, in Anwendungsreihenfolge, unveraendert eingebettet.
--          Jede Datei laeuft in EINER eigenen Transaktion: Dateien mit eigenem
--          begin;/commit; unveraendert, alle anderen hier mit begin;/commit; umschlossen.
--          Bricht eine Datei ab, sind die vorherigen schon festgeschrieben, die
--          abgebrochene ist komplett zurueckgerollt. Alle Dateien sind wiederholbar
--          (IF NOT EXISTS / CREATE OR REPLACE / Backfill nur fuer NULL), Neustart von vorn ist sicher.
-- AUSFUEHREN: vorher Backup (Runbook Schritt 2). Bevorzugt per psql:
--   psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/golive/PROD-MIGRATION-2026-11.sql
--   (Direct-Verbindung oder Session-Pooler, Port 5432). Keine psql-Metabefehle in dieser Datei:
--   im Supabase-SQL-Editor als EIN Lauf einfuegen; Postgres bricht einen Query-String beim
--   ersten Fehler ab (Annahme fuer den Editor, mit psql belegt).
-- DATEN AENDERN (Backfill): 20261106100000 (players aus Anmeldungen), 20261106130000 (modules),
--   20261106140000 (Gebuehrenregel starter 6,90 % fuer JEDEN Verein), 20261107100000
--   (booked_price_cents = aktueller Camp-Preis), 20261107120000 (anonymized_at fuer Platzhalter-Zeilen),
--   20261107140000 (Kontoart destination fuer vorhandene Express-Konten, auf Prod erwartet 0 Zeilen).
-- Rollback: je Datei im Dateikopf; Gesamt-Rollback = Restore aus dem Backup.
-- Erzeugt mit scripts/ops/build_golive_migration.py, geprueft mit scripts/ops/verify_golive_migration.sh.
-- ============================================================

-- Vorbedingung: Prod-Stand muss die letzte Prod-Migration enthalten (health_data_consent).
do $$
begin
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'camp_registrations'
                     and column_name = 'health_data_consent') then
        raise exception 'Abbruch: Prod-Stand fehlt (20261027120000_health_data_consent nicht angewendet). Falsche Datenbank?';
    end if;
end
$$;

-- ------------------------------------------------------------
-- [01/19] 20261030203000_stripe_checkout_v11.sql
-- sha256 84facb5963e7a926424e77d5c0a6bd6fa23d94d201b8b920ad153b700d2ef5a2
-- Transaktion: hier umschlossen
-- ------------------------------------------------------------
begin;
-- CampsPilot v1.1: Stripe Connect Checkout (additive, idempotent).
-- Apply to disposable/staging DB first. Do not modify live production without review.
alter table public.organizations add column if not exists stripe_account_id text;
alter table public.organizations add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.organizations add column if not exists online_payment_enabled boolean not null default false;

alter table public.camp_registrations add column if not exists stripe_checkout_session_id text;
alter table public.camp_registrations add column if not exists stripe_payment_intent_id text;
alter table public.camp_registrations add column if not exists stripe_checkout_amount_cents integer;
alter table public.camp_registrations add column if not exists stripe_checkout_currency text;
alter table public.camp_registrations add column if not exists stripe_checkout_account_id text;

create unique index if not exists uniq_campspilot_stripe_checkout_session
    on public.camp_registrations (stripe_checkout_session_id)
    where stripe_checkout_session_id is not null;

create unique index if not exists uniq_campspilot_stripe_payment_intent
    on public.camp_registrations (stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;

-- Never expose Stripe IDs through anonymous PostgREST queries. API uses its
-- restricted server DB role; RLS and the existing column grants remain.
commit;

-- ------------------------------------------------------------
-- [02/19] 20261105180000_training_offers_memberships.sql
-- sha256 3611a7dde0214e48fc1791cb1aa2d8fbe688efcc0843bcc2b7dbd325d53d1e92
-- Transaktion: hier umschlossen
-- ------------------------------------------------------------
begin;
-- Einzel-/Kleingruppentraining: Angebote, Mitgliedschaften, Preis-Felder.
-- A training session is a `camps` row with offer_id set; every training rule is
-- bound to offer_id IS NOT NULL, so classic camps are unaffected.
-- Idempotent (IF NOT EXISTS / DROP ... IF EXISTS guards).
-- Datenschutz: organization_memberships speichert Vor-/Nachname und Geburtsdatum
-- von Vereinsmitgliedern (Kinderdaten) -> Datenschutzerklärung/AVV prüfen.
-- Nur das Backend liest diese Tabelle (RLS an, keine Policy, kein Grant).

-- ------------------------------------------------------------
-- training_offers
-- ------------------------------------------------------------
create table if not exists public.training_offers (
    id                      uuid        primary key default gen_random_uuid(),
    organization_id         uuid        not null
        references public.organizations (id) on delete restrict,
    slug                    text        not null,
    title                   text        not null,
    kind                    text        not null,
    description             text,
    duration_minutes        integer     not null,
    location                text,
    price_member_cents      integer     not null,
    price_nonmember_cents   integer     not null,
    status                  text        not null default 'draft',
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    constraint training_offers_organization_id_slug_key unique (organization_id, slug),
    -- Target of the composite FK from camps (tenant-safe reference).
    constraint training_offers_id_organization_id_key unique (id, organization_id),
    constraint chk_training_offers_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    constraint chk_training_offers_title_not_blank check (trim(title) <> ''),
    constraint chk_training_offers_kind check (kind in ('einzel', 'gruppe')),
    constraint chk_training_offers_duration check (duration_minutes > 0),
    constraint chk_training_offers_price_member check (price_member_cents >= 0),
    constraint chk_training_offers_price_nonmember check (price_nonmember_cents >= 0),
    constraint chk_training_offers_status check (status in ('draft', 'published', 'archived'))
);

drop trigger if exists set_updated_at on public.training_offers;
create trigger set_updated_at
    before update on public.training_offers
    for each row
    execute function public.set_updated_at();

alter table public.training_offers enable row level security;
grant select on public.training_offers to authenticated;

drop policy if exists s3_training_offer_read on public.training_offers;
create policy s3_training_offer_read on public.training_offers
    for select to authenticated using (
        exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
        or organization_id in (select organization_id from public.organization_members
                               where user_id = (select auth.uid()) and role = 'org_admin')
    );

-- ------------------------------------------------------------
-- camps: training sessions
-- ------------------------------------------------------------
alter table public.camps add column if not exists offer_id uuid;
alter table public.camps add column if not exists starts_at timestamptz;
alter table public.camps add column if not exists ends_at timestamptz;
-- Member price frozen per session (price_cents holds the non-member price).
alter table public.camps add column if not exists price_member_cents integer;

alter table public.camps drop constraint if exists camps_offer_org_fk;
alter table public.camps add constraint camps_offer_org_fk
    foreign key (offer_id, organization_id)
    references public.training_offers (id, organization_id) on delete restrict;

alter table public.camps drop constraint if exists chk_camps_training_times;
alter table public.camps add constraint chk_camps_training_times check (
    offer_id is null
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
);

alter table public.camps drop constraint if exists chk_camps_price_member_cents;
alter table public.camps add constraint chk_camps_price_member_cents
    check (price_member_cents is null or price_member_cents >= 0);

create index if not exists idx_camps_offer on public.camps (organization_id, offer_id)
    where offer_id is not null;

-- ------------------------------------------------------------
-- organization_memberships (backend access only)
-- ------------------------------------------------------------
create table if not exists public.organization_memberships (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,
    first_name          text        not null,
    last_name           text        not null,
    birth_date          date        not null,
    member_number       text,
    active              boolean     not null default true,
    source              text        not null,
    match_key           text        not null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint organization_memberships_match_unique
        unique (organization_id, match_key, birth_date),
    constraint chk_organization_memberships_source check (source in ('csv', 'manual')),
    constraint chk_organization_memberships_names
        check (trim(first_name) <> '' and trim(last_name) <> '')
);

drop trigger if exists set_updated_at on public.organization_memberships;
create trigger set_updated_at
    before update on public.organization_memberships
    for each row
    execute function public.set_updated_at();

alter table public.organization_memberships enable row level security;
-- No policy and no grant: not readable via PostgREST by anon/authenticated.
revoke all on public.organization_memberships from anon, authenticated;

-- ------------------------------------------------------------
-- camp_registrations: price at booking time
-- ------------------------------------------------------------
alter table public.camp_registrations add column if not exists applied_price_cents integer;
alter table public.camp_registrations add column if not exists member_match boolean;
alter table public.camp_registrations add column if not exists payment_method text;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_applied_price;
alter table public.camp_registrations add constraint chk_camp_registrations_applied_price
    check (applied_price_cents is null or applied_price_cents >= 0);

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_payment_method;
alter table public.camp_registrations add constraint chk_camp_registrations_payment_method
    check (payment_method is null or payment_method in ('online', 'ueberweisung', 'bar'));
commit;

-- ------------------------------------------------------------
-- [03/19] 20261105190000_training_hardening.sql
-- sha256 86c4c427f7c62cf95d295eb164cd82a1bdcec661f0a8845f951f978a4341b7aa
-- Transaktion: hier umschlossen
-- ------------------------------------------------------------
begin;
-- Training hardening (final review M2): second privilege layer on the new tables.
--
-- Supabase grants ALL on new public tables to anon/authenticated by default. RLS blocks
-- the access today, but it should not be the only layer:
--   training_offers: anon gets nothing; authenticated keeps SELECT (policy
--     s3_training_offer_read) but loses write privileges. Writes go through the backend
--     role only.
--   organization_memberships: children's names and birth dates, backend-only. No policy,
--     no grant for anon/authenticated.
--
-- Idempotent: REVOKE is a no-op when the privilege is already gone. The backend role is
-- not affected (it is neither anon nor authenticated; BYPASSRLS/owner). The lock
-- timeout keeps the REVOKEs from queueing behind a long transaction.

set lock_timeout = '5s';

revoke all on public.training_offers from anon;
revoke insert, update, delete, truncate, references, trigger on public.training_offers from authenticated;
grant select on public.training_offers to authenticated;

revoke all on public.organization_memberships from anon, authenticated;
commit;

-- ------------------------------------------------------------
-- [04/19] 20261106100000_player_records.sql
-- sha256 770b16d80678646290ba730f3a1c0e074af710861763376d2d73197cfe990fad
-- Transaktion: hier umschlossen
-- ------------------------------------------------------------
begin;
-- Spielerakte (Stufe 2+3, Task 1): Spieler, interne Trainingsdoku, Ziele, Messwerte.
--
-- Datenschutz (Kinderdaten, Leistungs- und Mentalnotizen): alle vier Tabellen sind
-- backend-only (RLS an, keine Policy, keine Rechte fuer anon/authenticated). Jede
-- Beziehung ist ein zusammengesetzter FK mit organization_id (Mandantengrenze auch in
-- der DB). Datenschutzerklaerung/AVV pruefen: interne Trainingsdoku ueber Kinder.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards; der Backfill ist deterministisch.

set lock_timeout = '5s';

-- ------------------------------------------------------------
-- Namensnormalisierung identisch zu normalize_match_key (backend_saas/app/repositories/
-- memberships.py::_normalize_part): NFC, trim, casefold, ae/oe/ue/ss, Whitespace- und
-- Bindestrich-Folgen -> ein Leerzeichen, trim. Whitespace = Python str.isspace();
-- Bindestriche = U+002D, U+2010..U+2014, U+2212 (Liste _HYPHENS in memberships.py).
-- Tests (test_player_records_migration.py) pinnen die Gleichheit gegen Python fuer alle
-- Whitespace-/Bindestrich-Zeichen und den lateinischen Block. Bekannte Abweichung: exotische
-- Zeichen, deren casefold laenger als lower() ist (z.B. U+0130, U+0149, U+01F0, Cherokee,
-- polytonisches Griechisch). Folge waere hoechstens ein zusaetzlicher Spielerdatensatz fuer
-- ein solches Kind (manuell zusammenfuehrbar), kein Datenverlust.
-- ------------------------------------------------------------
create or replace function public.normalize_match_part(value text)
returns text
language sql
stable  -- lower() depends on the DB collation: never use in an index
set search_path = ''
as $$
    select regexp_replace(
        regexp_replace(
            replace(replace(replace(replace(replace(replace(replace(replace(
                translate(lower(regexp_replace(
                    normalize(value, NFC),
                    '^[\s\u001c-\u001f\u0085   -     　]+|[\s\u001c-\u001f\u0085   -     　]+$',
                    '', 'g')),
                    'µſς', 'μsσ'),  -- casefold maps these where lower() does not
                'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
                'Ä', 'ae'), 'Ö', 'oe'), 'Ü', 'ue'), 'ẞ', 'ss'),
            '[\s\u001c-\u001f\u0085   -     　\-‐‑‒–—−]+',
            ' ', 'g'),
        '^ +| +$', '', 'g')
$$;

revoke all on function public.normalize_match_part(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- players
-- ------------------------------------------------------------
create table if not exists public.players (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,
    first_name          text        not null,
    last_name           text        not null,
    birth_date          date        not null,
    match_key           text        not null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint players_match_unique unique (organization_id, match_key, birth_date),
    -- Target of the composite FKs (tenant-safe references).
    constraint players_id_organization_id_key unique (id, organization_id),
    constraint chk_players_names check (trim(first_name) <> '' and trim(last_name) <> '')
);

drop trigger if exists set_updated_at on public.players;
create trigger set_updated_at before update on public.players
    for each row execute function public.set_updated_at();

alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;

-- ------------------------------------------------------------
-- camp_registrations: Spielerverknuepfung + Einwilligung zur Trainingsdoku
-- ------------------------------------------------------------
alter table public.camp_registrations add column if not exists player_id uuid;
-- null = noch nicht abgefragt; true/false = Entscheidung der Eltern (Task 5).
alter table public.camp_registrations add column if not exists documentation_consent boolean;

alter table public.camp_registrations drop constraint if exists camp_registrations_player_org_fk;
alter table public.camp_registrations add constraint camp_registrations_player_org_fk
    foreign key (player_id, organization_id)
    references public.players (id, organization_id) on delete restrict;

create index if not exists idx_camp_registrations_player
    on public.camp_registrations (organization_id, player_id) where player_id is not null;

-- ------------------------------------------------------------
-- player_notes (interne Trainingsdoku)
-- ------------------------------------------------------------
create table if not exists public.player_notes (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,
    player_id           uuid        not null,
    camp_id             uuid,
    note_date           date        not null,
    focus               text[]      not null default '{}',
    body                text        not null,
    rating              smallint,
    next_steps          text,
    video_url           text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint player_notes_player_org_fk foreign key (player_id, organization_id)
        references public.players (id, organization_id) on delete restrict,
    constraint player_notes_camp_org_fk foreign key (camp_id, organization_id)
        references public.camps (id, organization_id) on delete restrict,
    constraint chk_player_notes_focus check (
        focus <@ array['technik', 'athletik', 'taktik', 'mental', 'video', 'sonstiges']::text[]),
    constraint chk_player_notes_body check (trim(body) <> '' and char_length(body) <= 10000),
    constraint chk_player_notes_rating check (rating is null or rating between 1 and 5),
    constraint chk_player_notes_next_steps check (next_steps is null or char_length(next_steps) <= 4000),
    constraint chk_player_notes_video_url check (
        video_url is null or (video_url ~ '^https://[^[:space:]]+$' and char_length(video_url) <= 2000))
);

create index if not exists idx_player_notes_player
    on public.player_notes (organization_id, player_id, note_date desc);

drop trigger if exists set_updated_at on public.player_notes;
create trigger set_updated_at before update on public.player_notes
    for each row execute function public.set_updated_at();
alter table public.player_notes enable row level security;
revoke all on public.player_notes from anon, authenticated;

-- ------------------------------------------------------------
-- player_goals
-- ------------------------------------------------------------
create table if not exists public.player_goals (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,
    player_id           uuid        not null,
    title               text        not null,
    area                text        not null,
    status              text        not null default 'offen',
    target_date         date,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint player_goals_player_org_fk foreign key (player_id, organization_id)
        references public.players (id, organization_id) on delete restrict,
    constraint chk_player_goals_title check (trim(title) <> '' and char_length(title) <= 200),
    constraint chk_player_goals_area check (
        area in ('technik', 'athletik', 'taktik', 'mental', 'video', 'sonstiges')),
    constraint chk_player_goals_status check (status in ('offen', 'erreicht', 'verworfen'))
);

create index if not exists idx_player_goals_player
    on public.player_goals (organization_id, player_id, status);

drop trigger if exists set_updated_at on public.player_goals;
create trigger set_updated_at before update on public.player_goals
    for each row execute function public.set_updated_at();
alter table public.player_goals enable row level security;
revoke all on public.player_goals from anon, authenticated;

-- ------------------------------------------------------------
-- player_measurements
-- ------------------------------------------------------------
create table if not exists public.player_measurements (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null
        references public.organizations (id) on delete restrict,
    player_id           uuid        not null,
    measured_on         date        not null,
    metric              text        not null,
    value               numeric     not null,
    unit                text        not null,
    note                text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint player_measurements_player_org_fk foreign key (player_id, organization_id)
        references public.players (id, organization_id) on delete restrict,
    constraint chk_player_measurements_metric check (trim(metric) <> '' and char_length(metric) <= 60),
    constraint chk_player_measurements_unit check (trim(unit) <> '' and char_length(unit) <= 20),
    constraint chk_player_measurements_value check (value not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
    constraint chk_player_measurements_note check (note is null or char_length(note) <= 1000)
);

create index if not exists idx_player_measurements_player
    on public.player_measurements (organization_id, player_id, metric, measured_on desc);

drop trigger if exists set_updated_at on public.player_measurements;
create trigger set_updated_at before update on public.player_measurements
    for each row execute function public.set_updated_at();
alter table public.player_measurements enable row level security;
revoke all on public.player_measurements from anon, authenticated;

-- ------------------------------------------------------------
-- Backfill / Nachverknuepfung: public.link_unlinked_registrations()
-- Legt Spieler fuer alle Anmeldungen ohne player_id an und verknuepft sie (alle Status;
-- Stammdaten, nicht Buchungen). Repraesentative Schreibweise = aelteste Anmeldung
-- (created_at, id), getrimmt. Deterministisch und idempotent: bestehende Spieler bleiben,
-- nur player_id IS NULL wird verknuepft; Rueckgabe = Anzahl neu verknuepfter Anmeldungen.
-- Das Backend ruft sie beim Start einmal best-effort auf (schliesst das Fenster zwischen
-- Migration und Deploy, in dem der alte Stand Anmeldungen ohne player_id schreibt).
-- Kein SECURITY DEFINER, search_path leer, nur fuer die Backend-Rolle ausfuehrbar.
-- ------------------------------------------------------------
create or replace function public.link_unlinked_registrations()
returns integer
language plpgsql
set search_path = ''
as $$
declare
    linked integer;
begin
    insert into public.players (organization_id, first_name, last_name, birth_date, match_key)
    select distinct on (organization_id, match_key, child_birth_date)
           organization_id, btrim(child_first_name), btrim(child_last_name), child_birth_date, match_key
    from (
        select r.*,
               public.normalize_match_part(r.child_first_name) || '|'
                   || public.normalize_match_part(r.child_last_name) as match_key
        from public.camp_registrations r
        where r.player_id is null
    ) src
    where trim(child_first_name) <> '' and trim(child_last_name) <> ''
    order by organization_id, match_key, child_birth_date, created_at, id
    on conflict (organization_id, match_key, birth_date) do nothing;

    update public.camp_registrations r
       set player_id = p.id
      from public.players p
     where r.player_id is null
       and p.organization_id = r.organization_id
       and p.birth_date = r.child_birth_date
       and p.match_key = public.normalize_match_part(r.child_first_name) || '|'
                         || public.normalize_match_part(r.child_last_name);
    get diagnostics linked = row_count;
    return linked;
end;
$$;

revoke all on function public.link_unlinked_registrations() from public, anon, authenticated;

-- Migration run: keep updated_at of the existing registrations untouched. One DO block =
-- one atomic statement, so a failure cannot leave the trigger disabled.
do $$
begin
    alter table public.camp_registrations disable trigger set_updated_at;
    perform public.link_unlinked_registrations();
    alter table public.camp_registrations enable trigger set_updated_at;
end;
$$;
commit;

-- ------------------------------------------------------------
-- [05/19] 20261106110000_training_offer_category.sql
-- sha256 9fa400a674463c9413126ebfbe9e24d6e3f7defbb6edc13c21d8a80008cd75b4
-- Transaktion: hier umschlossen
-- ------------------------------------------------------------
begin;
-- Angebotsart für Trainingsangebote (optional): fussball, athletik, mental,
-- videoanalyse, premium. Rein beschreibend (Label); "premium" hat keine eigene Logik.
-- Idempotent.

alter table public.training_offers add column if not exists category text;

alter table public.training_offers drop constraint if exists chk_training_offers_category;
alter table public.training_offers
    add constraint chk_training_offers_category
    check (category is null or category in ('fussball', 'athletik', 'mental', 'videoanalyse', 'premium'));
commit;

-- ------------------------------------------------------------
-- [06/19] 20261106120000_membership_extra_fields.sql
-- sha256 0cb7fba29954ab54fef872493a65645eeb3be3f60366c7c6b599ff6d8684cf15
-- Transaktion: hier umschlossen
-- ------------------------------------------------------------
begin;
-- Zusatzfelder fuer Vereinsmitglieder (flexibler CSV-Import): frei benannte Spalten aus
-- dem Mitglieder-Export, z. B. "Mannschaft" oder "Beitragsgruppe", als {label: wert}.
--
-- Datenschutz: nur Felder fuer Training und Preis. Die Oberflaeche raet von Gesundheits-,
-- Adress- und Telefondaten ab und waehlt solche Spalten standardmaessig ab. Die Tabelle
-- bleibt backend-only (RLS an, keine Policy, keine Rechte fuer anon/authenticated).
-- Grenzen (max. 10 Felder je Import, Label <= 40, Wert <= 200 Zeichen) prueft das Backend.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

set local lock_timeout = '5s';

alter table public.organization_memberships
    add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.organization_memberships drop constraint if exists chk_organization_memberships_extra_object;
alter table public.organization_memberships
    add constraint chk_organization_memberships_extra_object check (jsonb_typeof(extra) = 'object');

alter table public.organization_memberships enable row level security;
revoke all on public.organization_memberships from anon, authenticated;
commit;

-- ------------------------------------------------------------
-- [07/19] 20261106130000_organization_modules.sql
-- sha256 52149c772200d9b1a4fdc85abad936d8d45aae062d33ce45f6a4ddd7bc633b7f
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Module je Verein (Platform-Owner schaltet frei): camps (immer), trainings
-- (Einzel-/Gruppentrainings), members (Mitgliederliste, Mitgliederpreis), players
-- (Spielerakte: Notizen, Ziele, Messwerte).
--
-- BACKUP-HINWEIS: Diese Migration aendert Daten (Backfill der neuen Spalte). Vor dem
-- Lauf auf einer echten Datenbank ein Backup ziehen. Rollback:
--   alter table public.organizations drop constraint if exists chk_organizations_modules;
--   alter table public.organizations drop column if exists modules;
--   drop function if exists public.text_array_is_distinct(text[]);
--
-- Backfill (damit bestehende Staging-Daten weiter funktionieren): ein Verein bekommt
--   trainings, wenn er Zeilen in training_offers hat,
--   members,   wenn er Zeilen in organization_memberships hat,
--   players,   wenn er Zeilen in player_notes, player_goals oder player_measurements hat
--              ODER nach den beiden Schritten oben trainings oder members hat (Premium-Paket:
--              wer Trainings/Mitglieder nutzt, behaelt die Spielerliste).
-- Alle anderen bleiben bei '{camps}'. players-Zeilen allein zaehlen nicht: sie entstehen
-- automatisch bei jeder Anmeldung (auch Camps) und bleiben fuer die Verknuepfung bestehen.
--
-- Rechte: organizations hat RLS und spaltenweise SELECT-Rechte fuer authenticated
-- (20261024130000_column_level_grants.sql). modules ist keine sensible Angabe und wird
-- wie die uebrigen oeffentlichen Spalten lesbar gemacht; anon bekommt nichts.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Backfill nur additiv.
-- Eigene Transaktion, damit SET LOCAL lock_timeout greift und alles oder nichts gilt
-- (laeuft der Runner schon in einer Transaktion, meldet Postgres nur eine Warnung).

begin;

set local lock_timeout = '5s';

-- CHECK constraints cannot contain subqueries: duplicate test as an immutable helper.
create or replace function public.text_array_is_distinct(value text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
    select cardinality(value) = (select count(distinct x) from unnest(value) as x)
$$;

revoke all on function public.text_array_is_distinct(text[]) from public, anon, authenticated;

alter table public.organizations
    add column if not exists modules text[] not null default '{camps}';

alter table public.organizations drop constraint if exists chk_organizations_modules;
alter table public.organizations
    add constraint chk_organizations_modules check (
        modules <@ array['camps', 'trainings', 'members', 'players']::text[]
        and 'camps' = any (modules)
        and public.text_array_is_distinct(modules)
    );

comment on column public.organizations.modules is
    'Freigeschaltete Module: camps (immer), trainings, members, players. Setzt nur der Platform-Owner (PATCH /admin/platform/organizations/{slug}/modules).';

update public.organizations o
set modules = array_append(o.modules, 'trainings')
where not ('trainings' = any (o.modules))
  and exists (select 1 from public.training_offers t where t.organization_id = o.id);

update public.organizations o
set modules = array_append(o.modules, 'members')
where not ('members' = any (o.modules))
  and exists (select 1 from public.organization_memberships m where m.organization_id = o.id);

update public.organizations o
set modules = array_append(o.modules, 'players')
where not ('players' = any (o.modules))
  and (
      'trainings' = any (o.modules)
      or 'members' = any (o.modules)
      or exists (select 1 from public.player_notes n where n.organization_id = o.id)
      or exists (select 1 from public.player_goals g where g.organization_id = o.id)
      or exists (select 1 from public.player_measurements pm where pm.organization_id = o.id)
  );

alter table public.organizations enable row level security;
revoke all on public.organizations from anon;
grant select (modules) on public.organizations to authenticated;

commit;

-- ------------------------------------------------------------
-- [08/19] 20261106140000_billing_profile_fee_rules.sql
-- sha256 b3b660c0ac9bf252d3bb0df07d5b45ec492c42cd1099e47f948854e637f737d4
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Abrechnung B1: Rechnungsstammdaten je Verein, Gebuehrenmodell mit Verlauf und
-- Gebuehren-Snapshot je bezahlter Buchung.
--
-- BACKUP-HINWEIS: Diese Migration aendert Daten (Backfill: jeder bestehende Verein ohne
-- Gebuehrenregel bekommt Paket "starter" 6,90 % gueltig ab 2000-01-01). Vor dem Lauf auf
-- einer echten Datenbank ein Backup ziehen. Rollback:
--   drop trigger if exists trg_organization_fee_rules_append_only on public.organization_fee_rules;
--   drop function if exists public.organization_fee_rules_append_only();
--   drop table if exists public.organization_fee_rules;
--   drop table if exists public.organization_billing_profiles;
--   alter table public.camp_registrations
--     drop column if exists fee_rule_id, drop column if exists fee_plan,
--     drop column if exists fee_percent, drop column if exists fee_fixed_cents,
--     drop column if exists fee_min_cents, drop column if exists fee_base_cents,
--     drop column if exists fee_cents, drop column if exists fee_collection,
--     drop column if exists fee_snapshot_at;
--
-- Rechte: alle neuen Tabellen sind backend-only (RLS an, keine Policy, keine Rechte fuer
-- anon/authenticated). Achtung: camp_registrations hat tabellenweites SELECT fuer
-- authenticated (20261018154831); die neuen fee_*-Spalten werden erst durch
-- 20261106160000_billing_refunds_and_grants.sql per Spaltenrecht abgeschirmt.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Backfill nur fuer Vereine ohne Regel.

begin;

set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- Rechnungsstammdaten (Elternrechnung im Namen des Vereins)
-- ------------------------------------------------------------
create table if not exists public.organization_billing_profiles (
    organization_id        uuid        primary key
        references public.organizations (id) on delete cascade,
    legal_name             text        not null,
    street                 text        not null,
    postal_code            text        not null,
    city                   text        not null,
    tax_number             text,
    vat_id                 text,
    tax_status             text        not null,
    default_vat_rate       smallint,
    tax_exemption_text     text,
    invoice_number_prefix  text        not null,
    invoice_email          text        not null,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    -- Supabase user id of the last editor (text: audit value, no FK).
    updated_by             text
);

alter table public.organization_billing_profiles drop constraint if exists chk_billing_profiles_fields;
alter table public.organization_billing_profiles
    add constraint chk_billing_profiles_fields check (
        char_length(btrim(legal_name)) between 2 and 200
        and char_length(btrim(street)) between 3 and 200
        and postal_code ~ '^[0-9]{5}$'
        and char_length(btrim(city)) between 2 and 100
        and (tax_number is null or tax_number ~ '^[0-9][0-9 /]{8,18}[0-9]$')
        and (vat_id is null or vat_id ~ '^DE[0-9]{9}$')
        and invoice_number_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,11}$'
        and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        and char_length(invoice_email) <= 254
    );

alter table public.organization_billing_profiles drop constraint if exists chk_billing_profiles_tax;
alter table public.organization_billing_profiles
    add constraint chk_billing_profiles_tax check (
        (tax_status = 'ust_pflichtig'
            and coalesce(default_vat_rate, 0) in (7, 19)
            and tax_exemption_text is null
            and (tax_number is not null or vat_id is not null))
        or (tax_status = 'kleinunternehmer'
            and default_vat_rate is null
            and tax_exemption_text is null
            and (tax_number is not null or vat_id is not null))
        or (tax_status = 'steuerbefreit'
            and default_vat_rate is null
            and char_length(btrim(coalesce(tax_exemption_text, ''))) between 5 and 500)
    );

comment on table public.organization_billing_profiles is
    'Rechnungsstammdaten des Vereins (Absender der Elternrechnung). Pflege: Vereinsadmin und Platform-Owner (PUT /admin/organizations/{slug}/billing-profile).';

alter table public.organization_billing_profiles enable row level security;
revoke all on public.organization_billing_profiles from public, anon, authenticated;

-- ------------------------------------------------------------
-- Gebuehrenregeln (nur anfuegen; Verlauf = Aenderungsprotokoll)
-- ------------------------------------------------------------
create table if not exists public.organization_fee_rules (
    id               uuid          primary key default gen_random_uuid(),
    organization_id  uuid          not null
        references public.organizations (id) on delete cascade,
    plan             text          not null,
    percent          numeric(5,2)  not null,
    fixed_cents      integer,
    min_fee_cents    integer,
    valid_from       date          not null,
    note             text,
    created_at       timestamptz   not null default now(),
    -- Who added the rule (Supabase user id + email for a readable history; no FK so
    -- the history stays intact when an account is deleted). NULL = migration backfill.
    created_by       text,
    created_by_email text
);

alter table public.organization_fee_rules drop constraint if exists chk_fee_rules_values;
alter table public.organization_fee_rules
    add constraint chk_fee_rules_values check (
        plan in ('starter', 'verein', 'individuell')
        and percent >= 0 and percent <= 30
        and (fixed_cents is null or fixed_cents between 0 and 100000)
        and (min_fee_cents is null or min_fee_cents between 0 and 100000)
        and (note is null or char_length(note) <= 500)
        and (created_by is null or char_length(created_by) <= 64)
        and (created_by_email is null or char_length(created_by_email) <= 254)
    );

create index if not exists idx_fee_rules_org_valid_from
    on public.organization_fee_rules (organization_id, valid_from desc, created_at desc);

comment on table public.organization_fee_rules is
    'Plattformgebuehr je Verein mit Verlauf. Gueltig ist die Regel mit dem juengsten valid_from <= Buchungsdatum (bei gleichem Datum die zuletzt angelegte). Nur anfuegen; setzt nur der Platform-Owner.';

-- History rows are evidence for past fees: never update or delete them
-- (organization delete cascades are allowed via the FK).
create or replace function public.organization_fee_rules_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' and not exists (
        select 1 from public.organizations o where o.id = old.organization_id
    ) then
        return old;  -- cascade from a deleted organization
    end if;
    raise exception 'organization_fee_rules is append-only';
end
$$;

revoke all on function public.organization_fee_rules_append_only() from public, anon, authenticated;

drop trigger if exists trg_organization_fee_rules_append_only on public.organization_fee_rules;
create trigger trg_organization_fee_rules_append_only
    before update or delete on public.organization_fee_rules
    for each row execute function public.organization_fee_rules_append_only();

alter table public.organization_fee_rules enable row level security;
revoke all on public.organization_fee_rules from public, anon, authenticated;

-- Backfill: bestehende Vereine ohne Regel -> Paket starter (6,90 %).
insert into public.organization_fee_rules (organization_id, plan, percent, valid_from, note)
select o.id, 'starter', 6.90, date '2000-01-01', 'Backfill: Standardpaket Starter'
from public.organizations o
where not exists (select 1 from public.organization_fee_rules r where r.organization_id = o.id);

-- ------------------------------------------------------------
-- Gebuehren-Snapshot je bezahlter Buchung
-- ------------------------------------------------------------
alter table public.camp_registrations add column if not exists fee_rule_id uuid;
alter table public.camp_registrations add column if not exists fee_plan text;
alter table public.camp_registrations add column if not exists fee_percent numeric(5,2);
alter table public.camp_registrations add column if not exists fee_fixed_cents integer;
alter table public.camp_registrations add column if not exists fee_min_cents integer;
alter table public.camp_registrations add column if not exists fee_base_cents integer;
alter table public.camp_registrations add column if not exists fee_cents integer;
alter table public.camp_registrations add column if not exists fee_collection text;
alter table public.camp_registrations add column if not exists fee_snapshot_at timestamptz;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_fee_snapshot;
alter table public.camp_registrations
    add constraint chk_camp_registrations_fee_snapshot check (
        (fee_snapshot_at is null and fee_cents is null and fee_collection is null)
        -- coalesce: a NULL inside a CHECK would otherwise pass silently.
        or (fee_snapshot_at is not null
            and coalesce(fee_plan, '') in ('starter', 'verein', 'individuell')
            and coalesce(fee_percent between 0 and 30, false)
            and coalesce(fee_base_cents >= 0, false)
            and coalesce(fee_cents between 0 and fee_base_cents, false)
            and coalesce(fee_collection, '') in ('application_fee', 'not_collected'))
    );

comment on column public.camp_registrations.fee_collection is
    'application_fee = per Stripe Destination Charge einbehalten; not_collected = berechnet, aber nicht einbehalten (Ueberweisung/bar oder Altkonto mit Direct Charges).';

commit;

-- ------------------------------------------------------------
-- [09/19] 20261106150000_stripe_express_destination.sql
-- sha256 5e0bbaa21b54e628814d946e999a550b41d764c9554c987decea70b3355a82e2
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Abrechnung B2: Stripe Connect Express-Konten fuer Vereine und Destination Charges
-- ueber die Plattform (on_behalf_of = Verein, application_fee_amount = Plattformgebuehr).
--
-- Rein additiv (keine Datenaenderung). Bestehende Standard-Konten (stripe_account_id,
-- Direct Charges) bleiben unveraendert nutzbar, bis ein Verein auf Express umgestellt ist.
-- Rollback:
--   drop index if exists public.uniq_organizations_stripe_express_account;
--   alter table public.organizations
--     drop column if exists stripe_express_account_id,
--     drop column if exists stripe_express_business_type,
--     drop column if exists stripe_express_charges_enabled,
--     drop column if exists stripe_express_payouts_enabled,
--     drop column if exists stripe_express_details_submitted,
--     drop column if exists stripe_express_requirements_due,
--     drop column if exists stripe_express_synced_at;
--   alter table public.camp_registrations
--     drop constraint if exists chk_camp_registrations_stripe_charge_type,
--     drop column if exists stripe_charge_type,
--     drop column if exists stripe_checkout_fee;
--
-- Rechte: keine neuen Spaltenrechte fuer anon/authenticated (Stripe-IDs nie ueber
-- PostgREST lesbar). Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

begin;

set local lock_timeout = '5s';

alter table public.organizations add column if not exists stripe_express_account_id text;
alter table public.organizations add column if not exists stripe_express_business_type text;
alter table public.organizations add column if not exists stripe_express_charges_enabled boolean not null default false;
alter table public.organizations add column if not exists stripe_express_payouts_enabled boolean not null default false;
alter table public.organizations add column if not exists stripe_express_details_submitted boolean not null default false;
alter table public.organizations add column if not exists stripe_express_requirements_due integer not null default 0;
alter table public.organizations add column if not exists stripe_express_synced_at timestamptz;

alter table public.organizations drop constraint if exists chk_organizations_stripe_express;
alter table public.organizations
    add constraint chk_organizations_stripe_express check (
        (stripe_express_account_id is null or stripe_express_account_id ~ '^acct_[A-Za-z0-9]{8,}$')
        and (stripe_express_business_type is null or stripe_express_business_type in ('company', 'non_profit'))
        and stripe_express_requirements_due >= 0
    );

create unique index if not exists uniq_organizations_stripe_express_account
    on public.organizations (stripe_express_account_id)
    where stripe_express_account_id is not null;

comment on column public.organizations.stripe_express_account_id is
    'Stripe Connect Express-Konto des Vereins (Destination Charges ueber die Plattform). Getrennt von stripe_account_id (Alt: verbundenes Standard-Konto, Direct Charges).';

-- direct = Checkout auf dem verbundenen Standard-Konto (Alt), destination = Checkout auf
-- der Plattform mit transfer_data.destination. NULL bei Altdaten = direct.
alter table public.camp_registrations add column if not exists stripe_charge_type text;
alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
alter table public.camp_registrations
    add constraint chk_camp_registrations_stripe_charge_type check (
        stripe_charge_type is null or stripe_charge_type in ('direct', 'destination')
    );

-- Gebuehr, die beim Anlegen der Checkout-Session an Stripe gegeben wurde (Quelle fuer den
-- Snapshot beim Bezahlen, damit Snapshot und einbehaltener Betrag identisch sind).
alter table public.camp_registrations add column if not exists stripe_checkout_fee jsonb;

alter table public.organizations enable row level security;
revoke all on public.organizations from anon;

commit;

-- ------------------------------------------------------------
-- [10/19] 20261106160000_billing_refunds_and_grants.sql
-- sha256 d5b415361e3c8fa64c2681c1792f657293985ffb8cd0529ed16f03764518f06b
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Abrechnung B2, Fix-Runde 1: Erstattungen in den Gebuehrendaten und Spaltenrechte.
--
-- 1. payment_status bekommt 'partially_refunded' (Teilerstattung einer Online-Zahlung).
-- 2. camp_registrations: refunded_cents (erstatteter Betrag), fee_refunded_cents (von
--    Stripe zurueckgegebene bzw. nicht mehr geschuldete Plattformgebuehr), refunded_at.
--    Netto-Gebuehr je Buchung = fee_cents - coalesce(fee_refunded_cents, 0).
-- 3. Spaltenrechte: 20261018154831_tenant_read_policies.sql gibt authenticated
--    tabellenweites SELECT auf camp_registrations (RLS: eigene Org). Gebuehren- und
--    Stripe-Spalten sind intern (Gebuehrenregel, Stripe-IDs). Wie bei organizations
--    (20261024130000_column_level_grants.sql): Tabellenrecht entziehen, alle uebrigen
--    Spalten einzeln wieder freigeben. Neue Spalten sind damit kuenftig standardmaessig
--    NICHT ueber PostgREST lesbar (das Frontend liest Anmeldungen nur ueber FastAPI).
--
-- Rein additiv bis auf den erweiterten CHECK (keine Datenaenderung). Rollback:
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_payment_status;
--   alter table public.camp_registrations add constraint chk_camp_registrations_payment_status
--     check (payment_status in ('open', 'paid', 'refunded', 'waived', 'cancelled'));
--     (vorher partially_refunded-Zeilen auf 'paid' setzen)
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_refunds,
--     drop column if exists refunded_cents, drop column if exists fee_refunded_cents,
--     drop column if exists refunded_at;
--   grant select on public.camp_registrations to authenticated;
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards; Spaltenrechte nur beim ersten Lauf
-- (solange das Tabellenrecht noch besteht).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_payment_status;
alter table public.camp_registrations
    add constraint chk_camp_registrations_payment_status
    check (payment_status in ('open', 'paid', 'partially_refunded', 'refunded', 'waived', 'cancelled'));

alter table public.camp_registrations add column if not exists refunded_cents integer;
alter table public.camp_registrations add column if not exists fee_refunded_cents integer;
alter table public.camp_registrations add column if not exists refunded_at timestamptz;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_refunds;
alter table public.camp_registrations
    add constraint chk_camp_registrations_refunds check (
        (refunded_cents is null or refunded_cents >= 0)
        and (fee_refunded_cents is null
             or (fee_refunded_cents >= 0 and fee_refunded_cents <= coalesce(fee_cents, 0)))
    );

comment on column public.camp_registrations.fee_refunded_cents is
    'Plattformgebuehr, die durch Erstattung zurueckging (Stripe ApplicationFee.amount_refunded) bzw. bei manueller Erstattung nicht mehr geschuldet ist. Netto = fee_cents - fee_refunded_cents.';

-- Column-level read rights for authenticated (see header, point 3). Guard: only while the
-- table-level grant still exists (first run). A re-run after later migrations must not
-- hand out their new columns (e.g. booked_price_cents) through this block.
do $$
declare
    readable text;
begin
    if not has_table_privilege('authenticated', 'public.camp_registrations', 'SELECT') then
        return;
    end if;
    revoke select on public.camp_registrations from authenticated;
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
      into readable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'camp_registrations'
       and column_name not like 'fee\_%'
       and column_name not like 'stripe\_%'
       and column_name not in ('refunded_cents', 'refunded_at');
    execute format('grant select (%s) on public.camp_registrations to authenticated', readable);
end
$$;

commit;

-- ------------------------------------------------------------
-- [11/19] 20261107100000_parent_invoices.sql
-- sha256 02d81a3af1839166fc9d775f246911d6e6e0cb5c0d8bf24d0db4a17a7ae4efd9
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Abrechnung B3: Elternrechnungen im Namen des Vereins, Stornorechnungen,
-- Buchungspreis je Anmeldung, Erstattungsereignisse.
--
-- BACKUP-HINWEIS: Diese Migration aendert Daten (Backfill booked_price_cents fuer alle
-- bestehenden Anmeldungen = applied_price_cents bzw. aktueller Camp-Preis). Vor dem Lauf
-- auf einer echten Datenbank ein Backup ziehen. Rollback:
--   drop trigger if exists trg_invoices_immutable on public.invoices;
--   drop function if exists public.invoices_immutable();
--   drop table if exists public.registration_refund_events;
--   drop table if exists public.invoices;
--   drop table if exists public.organization_invoice_counters;
--   drop trigger if exists trg_camp_registrations_booked_price on public.camp_registrations;
--   drop function if exists public.camp_registrations_booked_price();
--   alter table public.camp_registrations
--     drop constraint if exists chk_camp_registrations_invoice_pending,
--     drop column if exists invoice_pending_reason, drop column if exists booked_price_cents;
--
-- Rechnungen sind unveraenderlich (Trigger): nur sent_at/send_error/send_attempts duerfen
-- sich aendern (Versandprotokoll), Loeschen ist verboten (Ausnahme: Loeschen des ganzen
-- Vereins). Korrektur nur per Stornorechnung.
-- Nummern: je Verein und Jahr lueckenlos (Zaehlerzeile wird in derselben Transaktion wie
-- die Rechnung hochgezaehlt; Rollback = keine Luecke; Zeilensperre = keine Doppelnummer).
-- Rechte: alle neuen Tabellen backend-only (RLS an, keine Policy, revoke). Die neuen
-- Spalten an camp_registrations bekommen kein Spaltenrecht (siehe 20261106160000).
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Backfill nur fuer NULL-Werte.

begin;

set local lock_timeout = '5s';

-- ------------------------------------------------------------
-- Buchungspreis (Preis zum Buchungszeitpunkt)
-- ------------------------------------------------------------
alter table public.camp_registrations add column if not exists booked_price_cents integer;
alter table public.camp_registrations drop constraint if exists chk_camp_registrations_booked_price;
alter table public.camp_registrations
    add constraint chk_camp_registrations_booked_price check (booked_price_cents is null or booked_price_cents >= 0);

comment on column public.camp_registrations.booked_price_cents is
    'Preis zum Buchungszeitpunkt (Camp-Preis bzw. Trainingspreis). Geschuldet ist coalesce(applied_price_cents, booked_price_cents): applied_price_cents bleibt die vom Admin korrigierbare Trainingsangabe.';

create or replace function public.camp_registrations_booked_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.booked_price_cents is null then
        new.booked_price_cents := coalesce(
            new.applied_price_cents,
            (select c.price_cents from public.camps c
             where c.id = new.camp_id and c.organization_id = new.organization_id)
        );
    end if;
    return new;
end
$$;

revoke all on function public.camp_registrations_booked_price() from public, anon, authenticated;

drop trigger if exists trg_camp_registrations_booked_price on public.camp_registrations;
create trigger trg_camp_registrations_booked_price
    before insert on public.camp_registrations
    for each row execute function public.camp_registrations_booked_price();

-- Backfill without touching updated_at (same pattern as 20261106100000_player_records.sql;
-- one DO block = one statement, a failure cannot leave the trigger disabled). Old bookings
-- get the CURRENT camp price: the price at their booking time is not recorded anywhere.
do $$
begin
    alter table public.camp_registrations disable trigger set_updated_at;
    update public.camp_registrations r
    set booked_price_cents = coalesce(r.applied_price_cents, c.price_cents)
    from public.camps c
    where c.id = r.camp_id and c.organization_id = r.organization_id and r.booked_price_cents is null;
    alter table public.camp_registrations enable trigger set_updated_at;
end
$$;

-- Rechnung blockiert (z. B. Rechnungsstammdaten fehlen); nach dem Ergaenzen erzeugbar.
alter table public.camp_registrations add column if not exists invoice_pending_reason text;
alter table public.camp_registrations drop constraint if exists chk_camp_registrations_invoice_pending;
alter table public.camp_registrations
    add constraint chk_camp_registrations_invoice_pending check (
        invoice_pending_reason is null or invoice_pending_reason in ('missing_billing_profile')
    );

-- ------------------------------------------------------------
-- Nummernkreis je Verein und Jahr
-- ------------------------------------------------------------
create table if not exists public.organization_invoice_counters (
    organization_id  uuid     not null references public.organizations (id) on delete cascade,
    year             smallint not null,
    last_number      integer  not null,
    primary key (organization_id, year),
    constraint chk_invoice_counters check (year between 2000 and 2999 and last_number >= 1)
);

alter table public.organization_invoice_counters enable row level security;
revoke all on public.organization_invoice_counters from public, anon, authenticated;

-- ------------------------------------------------------------
-- Rechnungen (Rechnung und Stornorechnung)
-- ------------------------------------------------------------
create table if not exists public.invoices (
    id                  uuid        primary key default gen_random_uuid(),
    organization_id     uuid        not null references public.organizations (id) on delete cascade,
    -- No FK: the invoice must outlive any change to the booking row.
    registration_id     uuid        not null,
    kind                text        not null,
    number              text        not null,
    year                smallint    not null,
    sequence            integer     not null,
    cancels_invoice_id  uuid        references public.invoices (id),
    -- Storno idempotency: original invoice + cumulative stornoed amount.
    storno_key          text,
    issue_date          date        not null,
    currency            text        not null default 'EUR',
    net_cents           integer     not null,
    vat_cents           integer     not null,
    gross_cents         integer     not null,
    tax_status          text        not null,
    vat_rate            smallint,
    recipient_email     text        not null,
    data                jsonb       not null,
    pdf                 bytea       not null,
    created_at          timestamptz not null default now(),
    created_by          text,
    sent_at             timestamptz,
    send_error          text,
    send_attempts       integer     not null default 0,
    constraint uniq_invoices_number unique (organization_id, number),
    constraint uniq_invoices_sequence unique (organization_id, year, sequence),
    constraint chk_invoices_values check (
        kind in ('invoice', 'storno')
        and tax_status in ('ust_pflichtig', 'kleinunternehmer', 'steuerbefreit')
        and (vat_rate is null or vat_rate in (7, 19))
        and net_cents + vat_cents = gross_cents
        and ((kind = 'invoice' and gross_cents > 0 and cancels_invoice_id is null and storno_key is null)
             or (kind = 'storno' and gross_cents < 0 and cancels_invoice_id is not null and storno_key is not null))
    )
);

create unique index if not exists uniq_invoices_one_per_registration
    on public.invoices (organization_id, registration_id) where kind = 'invoice';
create unique index if not exists uniq_invoices_storno_key
    on public.invoices (organization_id, storno_key) where kind = 'storno';
create index if not exists idx_invoices_org_created on public.invoices (organization_id, created_at desc);

comment on table public.invoices is
    'Elternrechnungen im Namen des Vereins (Absender = Rechnungsstammdaten zum Ausstellungszeitpunkt, in data eingefroren) inkl. PDF. Unveraenderlich; Korrektur nur per Stornorechnung. Plattformgebuehr erscheint nie.';

create or replace function public.invoices_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
            return old;  -- cascade from a deleted organization
        end if;
        raise exception 'invoices are immutable';
    end if;
    if (new.id, new.organization_id, new.registration_id, new.kind, new.number, new.year, new.sequence,
        new.cancels_invoice_id, new.storno_key, new.issue_date, new.currency, new.net_cents, new.vat_cents,
        new.gross_cents, new.tax_status, new.vat_rate, new.recipient_email, new.data, new.pdf,
        new.created_at, new.created_by)
       is distinct from
       (old.id, old.organization_id, old.registration_id, old.kind, old.number, old.year, old.sequence,
        old.cancels_invoice_id, old.storno_key, old.issue_date, old.currency, old.net_cents, old.vat_cents,
        old.gross_cents, old.tax_status, old.vat_rate, old.recipient_email, old.data, old.pdf,
        old.created_at, old.created_by) then
        raise exception 'invoices are immutable';
    end if;
    return new;
end
$$;

revoke all on function public.invoices_immutable() from public, anon, authenticated;

drop trigger if exists trg_invoices_immutable on public.invoices;
create trigger trg_invoices_immutable
    before update or delete on public.invoices
    for each row execute function public.invoices_immutable();

alter table public.invoices enable row level security;
revoke all on public.invoices from public, anon, authenticated;

-- ------------------------------------------------------------
-- Erstattungsereignisse (Monatszuordnung der Gebuehrenerstattung, B4)
-- ------------------------------------------------------------
create table if not exists public.registration_refund_events (
    id                   uuid        primary key default gen_random_uuid(),
    organization_id      uuid        not null references public.organizations (id) on delete cascade,
    registration_id      uuid        not null,
    refunded_delta_cents integer     not null,
    fee_delta_cents      integer     not null,
    source               text        not null,
    created_at           timestamptz not null default now(),
    constraint chk_refund_events check (source in ('stripe', 'manual', 'manual_undo'))
);

create index if not exists idx_refund_events_org_created
    on public.registration_refund_events (organization_id, created_at);

alter table public.registration_refund_events enable row level security;
revoke all on public.registration_refund_events from public, anon, authenticated;

commit;

-- ------------------------------------------------------------
-- [12/19] 20261107110000_invoice_retry.sql
-- sha256 f4951df63ccfcdd0e0100ee945387acf985334621c2ad8c3e9cdeb2bda5730df
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Abrechnung B3, Fix-Runde 1: fehlgeschlagene Rechnungslaeufe sichtbar und wiederholbar.
--
-- invoice_pending_reason bekommt 'error' (Rechnungslauf fehlgeschlagen); invoice_error
-- speichert nur den Fehlertyp (z. B. "OperationalError"), nie Daten. "Ausstehend" wird im
-- Code per Abfrage bestimmt (bezahlt + keine Rechnung), der Marker ist nur der Grund.
-- Rein additiv. Rollback:
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_invoice_pending;
--   alter table public.camp_registrations add constraint chk_camp_registrations_invoice_pending
--     check (invoice_pending_reason is null or invoice_pending_reason in ('missing_billing_profile'));
--     (vorher 'error'-Zeilen auf NULL setzen)
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_invoice_error,
--     drop column if exists invoice_error;
-- Rechte: kein Spaltenrecht fuer authenticated (siehe 20261106160000).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_invoice_pending;
alter table public.camp_registrations
    add constraint chk_camp_registrations_invoice_pending check (
        invoice_pending_reason is null or invoice_pending_reason in ('missing_billing_profile', 'error')
    );

alter table public.camp_registrations add column if not exists invoice_error text;
alter table public.camp_registrations drop constraint if exists chk_camp_registrations_invoice_error;
alter table public.camp_registrations
    add constraint chk_camp_registrations_invoice_error check (
        invoice_error is null or invoice_error ~ '^[A-Za-z_][A-Za-z0-9_]{0,99}$'
    );

-- B3 columns stay backend-only even if column grants were handed out again (defence in depth
-- next to the guard in 20261106160000). No-op when the right does not exist.
revoke select (booked_price_cents, invoice_pending_reason, invoice_error)
    on public.camp_registrations from authenticated;

commit;

-- ------------------------------------------------------------
-- [13/19] 20261107120000_registration_anonymized_at.sql
-- sha256 c3c35cabcf5c301393a8fa4685bc99e2df3efbd93762c6d807c58ccce3ca1cd0
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Release Abrechnung + Admin-Fixes: anonymisierte Buchungen markieren.
--
-- Beim Loeschen einer Spielerakte werden stornierte Buchungen anonymisiert (Name
-- "Gelöscht", Geburtsdatum = Buchungsdatum, Gesundheitsdaten leer, player_id = null).
-- Ohne Markierung verknuepfte public.link_unlinked_registrations() (Backend-Start) diese
-- Zeilen wieder mit einem neuen Spieler "Gelöscht Gelöscht" und fasste dabei verschiedene
-- Kinder zusammen. anonymized_at markiert die Zeile; Linker und Spielerzuordnung
-- ueberspringen sie.
--
-- Rechnungen (public.invoices) werden NICHT angefasst: ihr Snapshot/PDF bleibt
-- unveraendert (Aufbewahrungspflicht), der Unveraenderlichkeits-Trigger greift nicht.
--
-- Datenaenderung: Backfill fuer bereits anonymisierte Zeilen (vom Stand vor dieser
-- Migration erkennbar an Name "Gelöscht"/"Gelöscht" ohne player_id und ohne
-- Gesundheitsdaten); deren Geburtsdatum wird zugleich auf das Buchungsdatum gesetzt
-- (alter Platzhalter "heute minus 99 Jahre"). Vor dem Lauf auf einer echten Datenbank ein Backup ziehen.
-- Rollback:
--   (Funktion link_unlinked_registrations auf den Stand aus 20261106100000 zuruecksetzen)
--   alter table public.camp_registrations drop column if exists anonymized_at;
-- Rechte: kein Spaltenrecht fuer authenticated (siehe 20261106160000).
-- Idempotent: IF NOT EXISTS, CREATE OR REPLACE, Backfill nur fuer NULL-Werte.

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations add column if not exists anonymized_at timestamptz;

comment on column public.camp_registrations.anonymized_at is
    'Zeitpunkt der Anonymisierung (Spielerakte geloescht). Gesetzt: Kinddaten sind entfernt, die Zeile wird nie wieder einem Spieler zugeordnet.';

-- Backfill without touching updated_at (same pattern as 20261106100000_player_records.sql).
do $$
begin
    alter table public.camp_registrations disable trigger set_updated_at;
    -- Same UPDATE also replaces the old placeholder birth date (today minus 99 years, on
    -- staging since feat/admin-fixes), which would leave the plausibility CHECK after a year.
    update public.camp_registrations
       set anonymized_at = now(),
           child_birth_date = created_at::date
     where anonymized_at is null
       and player_id is null
       and child_first_name = 'Gelöscht' and child_last_name = 'Gelöscht'
       and allergies is null and medical_notes is null and emergency_contact_name is null;
    alter table public.camp_registrations enable trigger set_updated_at;
end
$$;

-- Same function as in 20261106100000, plus: anonymized rows are never linked.
create or replace function public.link_unlinked_registrations()
returns integer
language plpgsql
set search_path = ''
as $$
declare
    linked integer;
begin
    insert into public.players (organization_id, first_name, last_name, birth_date, match_key)
    select distinct on (organization_id, match_key, child_birth_date)
           organization_id, btrim(child_first_name), btrim(child_last_name), child_birth_date, match_key
    from (
        select r.*,
               public.normalize_match_part(r.child_first_name) || '|'
                   || public.normalize_match_part(r.child_last_name) as match_key
        from public.camp_registrations r
        where r.player_id is null and r.anonymized_at is null
    ) src
    where trim(child_first_name) <> '' and trim(child_last_name) <> ''
    order by organization_id, match_key, child_birth_date, created_at, id
    on conflict (organization_id, match_key, birth_date) do nothing;

    update public.camp_registrations r
       set player_id = p.id
      from public.players p
     where r.player_id is null
       and r.anonymized_at is null
       and p.organization_id = r.organization_id
       and p.birth_date = r.child_birth_date
       and p.match_key = public.normalize_match_part(r.child_first_name) || '|'
                         || public.normalize_match_part(r.child_last_name);
    get diagnostics linked = row_count;
    return linked;
end;
$$;

revoke all on function public.link_unlinked_registrations() from public, anon, authenticated;

-- Backend-only column, even if column grants were handed out again. No-op when absent.
revoke select (anonymized_at) on public.camp_registrations from authenticated;

commit;

-- ------------------------------------------------------------
-- [14/19] 20261107130000_parent_billing_address.sql
-- sha256 18f4765bf61b27f7a7ca08901816f8df51a04e06e275f36c6b1d3f752b108abc
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Rechnungsanschrift der Eltern (Pflicht bei kostenpflichtigen Buchungen, vollstaendige
-- Rechnung nach § 14 UStG bzw. § 34a UStDV fuer Kleinbetragsrechnungen).
--
-- camp_registrations bekommt parent_street, parent_postal_code, parent_city (alle nullable:
-- kostenlose Buchungen und Altbestand haben keine Anschrift). Pflicht bei Preis > 0 prueft
-- das Backend (RegistrationCreate + Repository), die Datenbank prueft nur Laenge/Format.
-- Bestehende Rechnungen bleiben unveraendert (Snapshot in invoices.data).
--
-- Rein additiv, keine Datenaenderung. Rollback:
--   alter table public.camp_registrations
--     drop constraint if exists chk_camp_registrations_parent_address,
--     drop column if exists parent_street, drop column if exists parent_postal_code,
--     drop column if exists parent_city;
-- Rechte: kein Spaltenrecht fuer authenticated (siehe 20261106160000).
-- Voraussetzung: 20261106160000 ist angewendet (Tabellen-SELECT fuer authenticated entzogen).
-- Solange das Tabellenrecht noch besteht, hat das Spalten-REVOKE unten keine Wirkung.
-- Release-Reihenfolge: diese Migration -> Backend -> Frontend (das Backend liest die Spalten
-- in jeder Buchung; ohne Migration scheitert jede Anmeldung mit 500).
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations add column if not exists parent_street text;
alter table public.camp_registrations add column if not exists parent_postal_code text;
alter table public.camp_registrations add column if not exists parent_city text;

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_parent_address;
alter table public.camp_registrations
    add constraint chk_camp_registrations_parent_address check (
        (parent_street is null or char_length(btrim(parent_street)) between 1 and 120)
        and (parent_city is null or char_length(btrim(parent_city)) between 1 and 80)
        and (parent_postal_code is null
             or (char_length(parent_postal_code) between 4 and 10
                 and parent_postal_code ~ '^[0-9A-Za-z][0-9A-Za-z -]*[0-9A-Za-z]$'))
    );

comment on column public.camp_registrations.parent_street is
    'Rechnungsanschrift: Strasse und Hausnummer. Zweck Rechnungsstellung; Aufbewahrung wie Rechnungen.';

-- Backend-only columns, even if column grants were handed out again. No-op when absent.
revoke select (parent_street, parent_postal_code, parent_city)
    on public.camp_registrations from authenticated;

commit;

-- ------------------------------------------------------------
-- [15/19] 20261107140000_stripe_managed_risk.sql
-- sha256 bcec3eb29392992a9270ebb43eca9ba3f3754ec2432a4c7b8c4637a38548e47d
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Online-Zahlung mit Stripe Managed Risk: Vereinskonten werden als Accounts v2 angelegt
-- (losses_collector = stripe, fees_collector = stripe, volles Stripe-Dashboard). Zahlungen
-- laufen als Direct Charges auf dem Vereinskonto mit application_fee_amount (Plattformgebuehr).
--
-- organizations.stripe_express_account_kind: welcher Zahlungsweg zum Konto in
-- stripe_express_account_id gehoert.
--   destination = Express-Konto aus B2 (Destination Charges ueber die Plattform, nur Staging)
--   direct_fee  = Accounts-v2-Konto mit Managed Risk (Direct Charge + Plattformgebuehr)
-- NULL bei vorhandenem Konto wird im Code als destination behandelt (Altbestand).
-- camp_registrations.stripe_charge_type bekommt den Wert direct_fee.
--
-- Aendert Daten (Backfill der Kontoart fuer vorhandene Express-Konten) -> vorher Backup ziehen.
-- Rollback (erst, wenn kein Konto/keine Buchung direct_fee hat):
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
--   alter table public.camp_registrations add constraint chk_camp_registrations_stripe_charge_type
--     check (stripe_charge_type is null or stripe_charge_type in ('direct', 'destination'));
--   alter table public.organizations drop constraint if exists chk_organizations_stripe_express_kind,
--     drop column if exists stripe_express_account_kind;
-- Rechte: keine Spaltenrechte fuer anon/authenticated (Backend-only).
-- Release-Reihenfolge: diese Migration -> Backend (das Backend liest die Spalte bei jedem Checkout).
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards, Backfill nur fuer NULL.

begin;

set local lock_timeout = '5s';

alter table public.organizations add column if not exists stripe_express_account_kind text;

alter table public.organizations drop constraint if exists chk_organizations_stripe_express_kind;
alter table public.organizations
    add constraint chk_organizations_stripe_express_kind check (
        stripe_express_account_kind is null or stripe_express_account_kind in ('destination', 'direct_fee')
    );

-- Existing Express accounts were created for destination charges.
update public.organizations
   set stripe_express_account_kind = 'destination'
 where stripe_express_account_id is not null and stripe_express_account_kind is null;

comment on column public.organizations.stripe_express_account_kind is
    'Zahlungsweg des Kontos in stripe_express_account_id: direct_fee (Accounts v2, Managed Risk, Direct Charge + application_fee) oder destination (B2-Express, nur Staging). NULL mit Konto = destination.';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
alter table public.camp_registrations
    add constraint chk_camp_registrations_stripe_charge_type check (
        stripe_charge_type is null or stripe_charge_type in ('direct', 'destination', 'direct_fee')
    );

-- Backend-only column, even if column grants were handed out again. No-op when absent.
revoke select (stripe_express_account_kind) on public.organizations from anon, authenticated;

commit;

-- ------------------------------------------------------------
-- [16/19] 20261110100000_fee_rule_monthly_fee.sql
-- sha256 740c79b83db933af1ee9685c8b7c4f1697d189a9c18191de3b3ecc1cdacd1644
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Preismodell: monatliche Grundgebuehr je Gebuehrenregel.
--
-- monthly_fee_cents NULL = Paketstandard (starter 0, verein 2490, individuell 0; aufgeloest in
-- backend_saas/app/fees.py). Reine Schema-Aenderung, keine Datenaenderung, kein Backup noetig.
-- Rollback:
--   alter table public.organization_fee_rules
--     drop constraint if exists chk_fee_rules_monthly_fee,
--     drop column if exists monthly_fee_cents;
--
-- Rechte: organization_fee_rules ist backend-only (RLS an, keine Policy, keine Rechte fuer
-- anon/authenticated; siehe 20261106140000). Die neue Spalte erbt das; das revoke unten
-- wiederholt es idempotent, damit die Spalte auch nach einem Tabellen-Grant nie lesbar ist.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

begin;

set local lock_timeout = '5s';

alter table public.organization_fee_rules add column if not exists monthly_fee_cents integer;

alter table public.organization_fee_rules drop constraint if exists chk_fee_rules_monthly_fee;
alter table public.organization_fee_rules
    add constraint chk_fee_rules_monthly_fee check (monthly_fee_cents is null or monthly_fee_cents >= 0);

comment on column public.organization_fee_rules.monthly_fee_cents is
    'Grundgebuehr pro Monat in Cent (zzgl. USt). NULL = Paketstandard (starter 0, verein 2490, individuell 0).';

revoke all on public.organization_fee_rules from public, anon, authenticated;

commit;

-- ------------------------------------------------------------
-- [17/19] 20261110110000_registration_self_service.sql
-- sha256 7ffe1b4af003f85917642dcbd6bd75cd2d3c590c4e64a8560a3f7edf67e10917
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- "Meine Buchung" und Erinnerungsmail (Plan 2026-11-10, Abschnitt B).
--
-- cancellation_requested_at: Eltern haben ueber den Link "Meine Buchung" eine Stornierung
--   angefragt. Storniert wird nicht automatisch, das entscheidet der Verein.
-- reminder_sent_at: die Erinnerungsmail drei Tage vor Campbeginn ist verschickt (genau einmal).
--
-- Rein additiv, keine Datenaenderung, kein Backfill. Idempotent (ADD COLUMN IF NOT EXISTS).
-- Rollback:
--   alter table public.camp_registrations
--       drop column if exists cancellation_requested_at, drop column if exists reminder_sent_at;
-- Rechte: beide Spalten sind Backend-Spalten, kein Leserecht fuer authenticated
-- (Spaltenrechte siehe 20261106160000; neue Spalten bekommen dort kein SELECT).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations
    add column if not exists cancellation_requested_at timestamptz,
    add column if not exists reminder_sent_at timestamptz;

comment on column public.camp_registrations.cancellation_requested_at is
    'Zeitpunkt, an dem die Eltern ueber "Meine Buchung" eine Stornierung angefragt haben. Nur Anfrage: der Status bleibt unveraendert, bis der Verein storniert.';
comment on column public.camp_registrations.reminder_sent_at is
    'Zeitpunkt der Erinnerungsmail drei Tage vor Campbeginn. Gesetzt = nicht noch einmal senden.';

-- Backend-only columns, even if column grants were handed out again. No-op when absent.
revoke select (cancellation_requested_at, reminder_sent_at) on public.camp_registrations from authenticated;

commit;

-- ------------------------------------------------------------
-- [18/19] 20261110120000_parent_self_cancel.sql
-- sha256 7682fb3f70c2852eb2056618f43fbce728800cd1154947e3ae97d02c5f1c9eab
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Selbststorno durch Eltern ("Meine Buchung"): Erstattung und Stornierung in einem Schritt.
--
-- parent_cancel_started_at: Die Eltern haben die Stornierung ausgeloest; gesetzt, BEVOR die
--   Erstattung bei Stripe angelegt wird. Ist es gesetzt, die Buchung aber nicht storniert, wurde
--   moeglicherweise schon erstattet: ein Retry storniert dann nur noch und erstattet nicht erneut.
-- parent_cancelled_at: Die Eltern haben selbst storniert (Storno committed, in derselben
--   Transaktion wie der Statuswechsel gesetzt). Basis fuer den Chip "Von Eltern storniert".
--
-- Rein additiv, keine Datenaenderung, kein Backfill. Idempotent (ADD COLUMN IF NOT EXISTS).
-- Rollback:
--   alter table public.camp_registrations
--       drop column if exists parent_cancel_started_at, drop column if exists parent_cancelled_at;
-- Rechte: Backend-Spalten, kein Leserecht fuer authenticated (wie 20261110110000).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations
    add column if not exists parent_cancel_started_at timestamptz,
    add column if not exists parent_cancelled_at timestamptz;

comment on column public.camp_registrations.parent_cancel_started_at is
    'Eltern haben ueber "Meine Buchung" die Stornierung ausgeloest (gesetzt vor der Stripe-Erstattung). Gesetzt und nicht storniert = Erstattung evtl. schon erfolgt, nur noch stornieren.';
comment on column public.camp_registrations.parent_cancelled_at is
    'Zeitpunkt, an dem die Eltern ihre Anmeldung selbst storniert haben (gleiche Transaktion wie der Statuswechsel).';

-- Backend-only columns, even if column grants were handed out again. No-op when absent.
revoke select (parent_cancel_started_at, parent_cancelled_at) on public.camp_registrations from authenticated;

commit;

-- ------------------------------------------------------------
-- [19/19] 20261110130000_platform_payments.sql
-- sha256 b9af20a915ff10a9effd433ed48745807826d83e5eff157f4c1c73f211bcc6ba
-- Transaktion: eigene (begin/commit in der Datei)
-- ------------------------------------------------------------
-- Plattform-Zahlung (Entscheidung Serkan 10.11.2026): kein Verein richtet Online-Zahlung selbst ein.
-- Eltern zahlen per Stripe Checkout auf dem Stripe-Konto der Plattform (kein Connect-Konto des
-- Vereins); die Plattform behaelt ihre Gebuehr und ueberweist den Rest ausserhalb des Systems an
-- den Verein (Auszahlungsliste im Owner-Bereich).
--
-- 1. camp_registrations.stripe_charge_type bekommt den Wert 'platform'.
-- 2. camp_registrations.fee_collection bekommt den Wert 'platform_collected' (Gebuehr bleibt bei
--    der Plattform, weil sie das Geld selbst einzieht).
-- 3. Neue Tabelle organization_payouts: je Verein und Monat ein Eintrag "ueberwiesen"
--    (Betrag, Datum, Verwendungszweck/Referenz). Backend-only.
--
-- Rein additiv (erweiterte CHECKs, neue Tabelle), keine Datenaenderung. Idempotent.
-- Rollback (erst, wenn keine Buchung platform/platform_collected hat):
--   alter table public.organizations drop constraint if exists chk_organizations_payment_route,
--     drop column if exists payment_route;
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
--   alter table public.camp_registrations add constraint chk_camp_registrations_stripe_charge_type
--     check (stripe_charge_type is null or stripe_charge_type in ('direct', 'destination', 'direct_fee'));
--   alter table public.camp_registrations drop constraint if exists chk_camp_registrations_fee_snapshot;
--   alter table public.camp_registrations add constraint chk_camp_registrations_fee_snapshot check (
--     (fee_snapshot_at is null and fee_cents is null and fee_collection is null)
--     or (fee_snapshot_at is not null and coalesce(fee_plan, '') in ('starter', 'verein', 'individuell')
--         and coalesce(fee_percent between 0 and 30, false) and coalesce(fee_base_cents >= 0, false)
--         and coalesce(fee_cents between 0 and fee_base_cents, false)
--         and coalesce(fee_collection, '') in ('application_fee', 'not_collected')));
--   drop table if exists public.organization_payouts;
-- Rechte: organization_payouts ist backend-only (RLS an, keine Policy, alle Rechte entzogen).

begin;

set local lock_timeout = '5s';

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_stripe_charge_type;
alter table public.camp_registrations
    add constraint chk_camp_registrations_stripe_charge_type check (
        stripe_charge_type is null or stripe_charge_type in ('direct', 'destination', 'direct_fee', 'platform')
    );

alter table public.camp_registrations drop constraint if exists chk_camp_registrations_fee_snapshot;
alter table public.camp_registrations
    add constraint chk_camp_registrations_fee_snapshot check (
        (fee_snapshot_at is null and fee_cents is null and fee_collection is null)
        -- coalesce: a NULL inside a CHECK would otherwise pass silently.
        or (fee_snapshot_at is not null
            and coalesce(fee_plan, '') in ('starter', 'verein', 'individuell')
            and coalesce(fee_percent between 0 and 30, false)
            and coalesce(fee_base_cents >= 0, false)
            and coalesce(fee_cents between 0 and fee_base_cents, false)
            and coalesce(fee_collection, '') in ('application_fee', 'not_collected', 'platform_collected'))
    );

comment on column public.camp_registrations.fee_collection is
    'application_fee = per Stripe Application Fee einbehalten; platform_collected = Zahlung lief ueber das Plattformkonto, Gebuehr bleibt bei der Plattform; not_collected = berechnet, aber nicht einbehalten (Ueberweisung/bar oder Altkonto mit Direct Charges).';

-- 4. organizations.payment_route: Zahlungsweg je Verein, vom Plattform-Owner gewaehlt.
--    platform = CampsPilot zieht auf dem Plattformkonto ein (auch wenn ein Connect-Konto existiert),
--    connect  = bisheriger Weg ueber das Vereinskonto (kein Fallback auf die Plattform).
--    Bestehende Vereine bekommen 'platform' (Entscheidung Serkan 10.11.: alles ueber uns).
alter table public.organizations add column if not exists payment_route text not null default 'platform';
alter table public.organizations drop constraint if exists chk_organizations_payment_route;
alter table public.organizations
    add constraint chk_organizations_payment_route check (payment_route in ('platform', 'connect'));
comment on column public.organizations.payment_route is
    'Zahlungsweg der Online-Zahlung: platform (Plattformkonto, Standard) oder connect (Vereinskonto, Altbestand).';
-- Backend-only column, even if column grants were handed out again. No-op when absent.
revoke select (payment_route) on public.organizations from anon, authenticated;

create table if not exists public.organization_payouts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    month date not null,
    payout_cents integer not null,
    paid_at date not null,
    reference text not null,
    created_at timestamptz not null default now(),
    constraint uq_organization_payouts_org_month unique (organization_id, month),
    constraint chk_organization_payouts_month_first check (month = date_trunc('month', month)::date),
    constraint chk_organization_payouts_reference check (length(reference) between 1 and 140)
);

comment on table public.organization_payouts is
    'Auszahlung der Plattform-Zahlungen eines Monats an den Verein (Ueberweisung ausserhalb des Systems). Ein Eintrag je Verein und Monat.';

alter table public.organization_payouts enable row level security;
revoke all on public.organization_payouts from public, anon, authenticated;

commit;

-- Ende. Pruefabfrage (nur lesen):
select (select count(*) from public.organization_fee_rules) as fee_rules,
       (select count(*) from public.camp_registrations where booked_price_cents is null) as ohne_buchungspreis,
       (select count(*) from information_schema.columns where table_schema = 'public'
          and table_name = 'camp_registrations' and column_name = 'anonymized_at') as anonymized_at_spalte,
       (select count(*) from information_schema.columns where table_schema = 'public'
          and table_name = 'camp_registrations' and column_name = 'parent_street') as rechnungsanschrift_spalte,
       (select count(*) from information_schema.columns where table_schema = 'public'
          and table_name = 'organizations' and column_name = 'stripe_express_account_kind') as kontoart_spalte;
