-- ============================================================
-- CP-JK-101: Trainingsanfragen
--
-- Im Supabase SQL Editor des JEWEILIGEN Mandanten ausführen.
-- Für JK Performance Academy: im JK-eigenen Supabase-Projekt.
-- Für KSV Baunatal wird die Tabelle NICHT gebraucht — dort bleibt
-- INQUIRIES_ENABLED ungesetzt, die Route existiert dann gar nicht.
--
-- Idempotent: mehrfaches Ausführen ist gefahrlos (CLAUDE.md, Migrations).
-- ============================================================

create table if not exists training_inquiries (

    id         uuid        primary key default gen_random_uuid(),
    created_at timestamptz not null    default now(),

    -- -----------------------------------------------------------
    -- Anfrage
    --
    -- Bewusst nur der Jahrgang, nicht das vollständige Geburtsdatum:
    -- Für die Einordnung einer Trainingsanfrage reicht das Jahr, und
    -- weniger personenbezogene Daten bedeuten weniger Risiko
    -- (DSGVO Art. 5 Abs. 1 lit. c, Datenminimierung).
    -- -----------------------------------------------------------
    player_name text not null
        constraint chk_inq_player_name_not_blank check (trim(player_name) <> ''),

    -- Reine Plausibilitätsgrenze, KEINE Altersregel. Die gilt pro Mandant
    -- und steht in der Backend-Konfiguration (GET /config).
    birth_year int not null
        constraint chk_inq_birth_year_plausible
            check (birth_year between 1970 and extract(year from current_date)::int),

    topic text not null
        constraint chk_inq_topic_not_blank check (trim(topic) <> ''),

    parent_email text not null
        constraint chk_inq_email_format
            check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

    message text,

    consent_privacy boolean not null
        constraint chk_inq_consent_given check (consent_privacy = true),

    -- -----------------------------------------------------------
    -- Bearbeitungsstatus (nur Backend / Admin)
    -- -----------------------------------------------------------
    status text not null default 'new'
        constraint chk_inq_status_allowed
            check (status in ('new', 'contacted', 'closed')),

    -- NULL = Benachrichtigung an den Verein noch nicht raus
    notified_at timestamptz
);

-- -----------------------------------------------------------
-- Indizes
-- -----------------------------------------------------------

create index if not exists idx_training_inq_created_at
    on training_inquiries (created_at desc);

create index if not exists idx_training_inq_status
    on training_inquiries (status);

create index if not exists idx_training_inq_email
    on training_inquiries (parent_email);

-- -----------------------------------------------------------
-- Row Level Security — identisches Muster wie camp_registrations:
-- öffentlich einreichen, lesen und ändern nur über den Service-Role-Key.
-- -----------------------------------------------------------

alter table training_inquiries enable row level security;

drop policy if exists "inq_public_insert" on training_inquiries;
create policy "inq_public_insert"
    on training_inquiries
    for insert
    with check (true);

-- Anon-Clients dürfen nichts lesen → kein Datenleak über den Browser.
drop policy if exists "inq_admin_select" on training_inquiries;
create policy "inq_admin_select"
    on training_inquiries
    for select
    using (false);

drop policy if exists "inq_admin_update" on training_inquiries;
create policy "inq_admin_update"
    on training_inquiries
    for update
    using (false);
