-- ============================================================
-- KSV Baunatal Sommercamp – Supabase Schema
-- Einmalig im Supabase SQL Editor ausführen
-- ============================================================

create table if not exists camp_registrations (

    -- -----------------------------------------------------------
    -- Identifikation
    -- -----------------------------------------------------------
    id         uuid        primary key default gen_random_uuid(),
    created_at timestamptz not null    default now(),

    -- -----------------------------------------------------------
    -- Kind
    -- -----------------------------------------------------------
    child_first_name text not null
        constraint chk_child_first_name_not_blank check (trim(child_first_name) <> ''),

    child_last_name  text not null
        constraint chk_child_last_name_not_blank  check (trim(child_last_name)  <> ''),

    -- Kinder müssen zwischen 5 und 18 Jahre alt sein
    birth_date date not null
        constraint chk_birth_date_range
            check (birth_date between (current_date - interval '18 years')
                                  and (current_date - interval '5 years')),

    -- -----------------------------------------------------------
    -- Elternteil / Kontakt
    -- -----------------------------------------------------------
    parent_name text not null
        constraint chk_parent_name_not_blank check (trim(parent_name) <> ''),

    -- Einfache syntaktische Prüfung: muss ein @ enthalten
    email text not null
        constraint chk_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

    phone text not null
        constraint chk_phone_not_blank check (trim(phone) <> ''),

    -- -----------------------------------------------------------
    -- Camp-Details
    -- -----------------------------------------------------------
    -- Werte werden zusätzlich im Backend per Enum validiert
    selected_camp_week text not null
        constraint chk_camp_week_not_blank check (trim(selected_camp_week) <> ''),

    -- Optional – Trikotnummer / Größe
    jersey_size text
        constraint chk_jersey_size_allowed
            check (jersey_size is null or jersey_size in (
                '116', '128', '140', '152', '164', '176',
                'XS', 'S', 'M', 'L', 'XL', 'XXL'
            )),

    -- -----------------------------------------------------------
    -- Optionale Zusatzinfos
    -- -----------------------------------------------------------
    allergies text,   -- Freitext; null = keine bekannten Allergien
    notes     text,   -- Sonstige Hinweise der Eltern

    -- -----------------------------------------------------------
    -- Pflicht-Zustimmung
    -- -----------------------------------------------------------
    consent_privacy boolean not null
        constraint chk_consent_given check (consent_privacy = true),

    -- -----------------------------------------------------------
    -- Verwaltungsstatus (nur vom Backend / Admin gesetzt)
    -- -----------------------------------------------------------
    status text not null default 'registered'
        constraint chk_status_allowed
            check (status in ('registered', 'confirmed', 'cancelled', 'waitlist')),

    payment_status text not null default 'open'
        constraint chk_payment_status_allowed
            check (payment_status in ('open', 'paid', 'refunded', 'waived')),

    -- -----------------------------------------------------------
    -- Öffentliches Token (Phase 1)
    -- Für Payment-Links und E-Mail-Bestätigungen.
    -- Trennt interne id von extern genutzten Identifikatoren.
    -- -----------------------------------------------------------
    registration_token uuid not null default gen_random_uuid(),

    -- -----------------------------------------------------------
    -- Mail + Payment Tracking (Phase 2 / 3)
    -- -----------------------------------------------------------
    email_sent_at    timestamptz,      -- NULL = noch nicht gesendet
    stripe_session_id text unique      -- Stripe Checkout Session ID

);

-- -----------------------------------------------------------
-- Indizes
-- -----------------------------------------------------------

-- Schnelle Suche nach Anmeldestatus (Admin-Übersicht filtern)
create index if not exists idx_camp_reg_status
    on camp_registrations (status);

-- Schnelle Suche nach E-Mail (Duplikat-Check, Eltern-Lookup)
create index if not exists idx_camp_reg_email
    on camp_registrations (email);

-- Sortierung nach Erstellungsdatum (Standard-Reihenfolge Admin-Liste)
create index if not exists idx_camp_reg_created_at
    on camp_registrations (created_at desc);

-- Lookup über registration_token (Payment-Links, E-Mail-Bestätigung)
create unique index if not exists idx_camp_reg_registration_token
    on camp_registrations (registration_token);

-- Lookup über stripe_session_id (Webhook-Abgleich in Phase 3)
create unique index if not exists idx_camp_reg_stripe_session_id
    on camp_registrations (stripe_session_id)
    where stripe_session_id is not null;

-- -----------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------

alter table camp_registrations enable row level security;

-- Eltern dürfen neue Anmeldungen einreichen (kein Auth nötig).
create policy "public_insert"
    on camp_registrations
    for insert
    with check (true);

-- Anon-Clients dürfen nichts lesen → kein Datenleak über den Browser.
-- Der Service-Role-Key des Backends umgeht RLS automatisch.
create policy "admin_select"
    on camp_registrations
    for select
    using (false);

-- Status-Updates (z.B. confirmed, cancelled) nur über Service-Role-Key.
create policy "admin_update"
    on camp_registrations
    for update
    using (false);
