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

update public.camp_registrations r
set booked_price_cents = coalesce(r.applied_price_cents, c.price_cents)
from public.camps c
where c.id = r.camp_id and c.organization_id = r.organization_id and r.booked_price_cents is null;

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
