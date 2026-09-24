-- Zweck: Plattform-Kern für echte Accounts/Rollen (feat/platform-foundation),
-- ersetzt das bisherige plattformweite ADMIN_PASSWORD. Nutzt Supabase Auth
-- (auth.users, von jedem Supabase-Projekt automatisch bereitgestellt) statt
-- eines eigenen Passwort-/Session-Systems.
--
-- Anwendungsstatus: NICHT gegen die Cloud-DB angewendet. Diese Migration
-- ausschließlich lokal geschrieben und geprüft (siehe backend_saas-Tests,
-- die Repository-Funktionen gegen diese Tabellen ausschließlich gemockt
-- testen, nie gegen eine echte DB). Exakter Anwendungsbefehl für die Cloud
-- (durch den Menschen, nicht durch den Agenten):
--   supabase link --project-ref wkmckfbzhmihyfwiekct
--   supabase db push
-- Alternativ manuell im Supabase Dashboard → SQL Editor der Cloud-DB
-- "CampsPilot SaaS" (Ref wkmckfbzhmihyfwiekct) ausführen — niemals gegen
-- das KSV- oder JK-Supabase-Projekt.
--
-- Auswirkungen: Rein additiv (drei neue Tabellen, keine bestehende Spalte
-- verändert). Ohne diese Migration liefert jede neue Rollenprüfung leere
-- Ergebnisse (kein platform_owner, kein org_admin existiert), das Backend
-- bootet aber weiterhin (kein Boot-Fehler durch fehlende Tabellen, da erst
-- zur Laufzeit abgefragt) — siehe docs/PLATFORM_FOUNDATION_HANDOFF.md für
-- den vollständigen Blocker-Status.
--
-- RLS bewusst ohne Policies (wie bei organizations/camps/camp_registrations,
-- siehe 20260917133748): dieser Dienst verbindet sich direkt per
-- Postgres-Connection-String, nicht über den Supabase-Client als
-- eingeloggter Nutzer — die App-Schicht (app/auth_deps.py) ist die
-- Durchsetzungsstelle, nicht RLS. Policies nachzuziehen bleibt ein späterer
-- Schritt, sobald der Zugriff je über den Supabase-Client selbst liefe.

create table if not exists public.platform_owners (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);
comment on table public.platform_owners is 'Mitgliedschaft statt Rollen-Enum: wer hier eingetragen ist, ist platform_owner (sieht/steuert jede Organisation). Leer = niemand ist Owner (fail-closed, nicht fail-open).';
-- Bug (Security-Review, gefunden vor Kundeneinladung): der Kommentar oben
-- (Zeile 24-29 der Originalfassung) behauptete, RLS liefe hier "wie bei
-- organizations/camps/camp_registrations" ohne Policies — dort ist RLS
-- aber tatsächlich AKTIVIERT (nur ohne Policies, macht die Tabelle für
-- anon/authenticated über PostgREST unsichtbar). Hier fehlte das
-- `enable row level security` komplett: ohne es wären diese drei Tabellen
-- über die Supabase Data API mit nur dem öffentlichen anon-Key lesbar
-- (platform_owners) bzw. beschreibbar (organization_members — jeder
-- eingeloggte Supabase-User hätte sich selbst zu org_admin machen können,
-- app/auth_deps.py komplett umgangen). RLS ohne Policies = deny-all für
-- PostgREST, aber weiterhin normaler Zugriff für backend_saas (verbindet
-- sich über DATABASE_URL/service-Verbindung, nicht als Supabase-Client).
alter table public.platform_owners enable row level security;

create table if not exists public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'org_admin' check (role in ('org_admin')),
    created_at timestamptz not null default now(),
    unique (organization_id, user_id)
);
comment on table public.organization_members is 'org_admin-Zuordnung: welcher Nutzer darf welche Organisation verwalten. platform_owners brauchen hier keinen Eintrag — ihr Zugriff ist global über platform_owners, nicht organisationsgebunden. Ein role-Enum mit nur einem erlaubten Wert ist bewusst so eng, damit ein späteres zweites Rollen-Level (z. B. read-only) eine bewusste Erweiterung dieses CHECK ist, kein stillschweigend erlaubter Freitext.';
create index if not exists idx_organization_members_user on public.organization_members(user_id);
create index if not exists idx_organization_members_org on public.organization_members(organization_id);
alter table public.organization_members enable row level security;

create table if not exists public.audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references auth.users(id) on delete set null,
    actor_email text,
    action text not null,
    organization_id uuid references public.organizations(id) on delete set null,
    target_type text,
    target_id text,
    metadata jsonb,
    created_at timestamptz not null default now()
);
comment on table public.audit_log is 'Wer hat wann was geändert (mind. Publish/Zahlungsstatus/Storno/Rollenänderungen, siehe app/auth_deps.py-Aufrufer). actor_email redundant neben actor_user_id gespeichert, damit ein Log-Eintrag lesbar bleibt, falls der auth.users-Datensatz später gelöscht wird (on delete set null würde sonst nur noch eine anonyme Zeile übriglassen).';
create index if not exists idx_audit_log_org on public.audit_log(organization_id);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;
