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
