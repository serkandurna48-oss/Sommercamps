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
