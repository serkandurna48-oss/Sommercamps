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
