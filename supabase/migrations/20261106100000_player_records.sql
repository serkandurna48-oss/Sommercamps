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
