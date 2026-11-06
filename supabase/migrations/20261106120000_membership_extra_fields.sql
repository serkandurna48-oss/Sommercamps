-- Zusatzfelder fuer Vereinsmitglieder (flexibler CSV-Import): frei benannte Spalten aus
-- dem Mitglieder-Export, z. B. "Mannschaft" oder "Beitragsgruppe", als {label: wert}.
--
-- Datenschutz: nur Felder fuer Training und Preis. Die Oberflaeche raet von Gesundheits-,
-- Adress- und Telefondaten ab und waehlt solche Spalten standardmaessig ab. Die Tabelle
-- bleibt backend-only (RLS an, keine Policy, keine Rechte fuer anon/authenticated).
-- Grenzen (max. 10 Felder je Import, Label <= 40, Wert <= 200 Zeichen) prueft das Backend.
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS Guards.

set lock_timeout = '5s';

alter table public.organization_memberships
    add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.organization_memberships drop constraint if exists chk_organization_memberships_extra_object;
alter table public.organization_memberships
    add constraint chk_organization_memberships_extra_object check (jsonb_typeof(extra) = 'object');

alter table public.organization_memberships enable row level security;
revoke all on public.organization_memberships from anon, authenticated;
