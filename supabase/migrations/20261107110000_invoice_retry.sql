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
