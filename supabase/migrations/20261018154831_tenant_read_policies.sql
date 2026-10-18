-- S3: read-only, database-backed tenant authorization for the SaaS schema.
-- Prepared and tested only on disposable local PostgreSQL. No cloud deployment.
-- Backend connections with BYPASSRLS still require explicit tenant filters.
-- No user-editable JWT metadata or client-provided organization claim is trusted.
-- All writes remain deny-by-default for anon/authenticated; the backend owns
-- validation, capacity locking, audit records and role assignment.
-- No data/columns change: no additional personal data or privacy-notice impact.

alter table public.platform_owners enable row level security;
alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;
alter table public.camps enable row level security;
alter table public.camp_registrations enable row level security;
alter table public.audit_log enable row level security;

grant select on public.platform_owners, public.organization_members,
    public.organizations, public.camps, public.camp_registrations,
    public.audit_log to authenticated;

-- Self-only lookup policies avoid recursive policies and SECURITY DEFINER.
drop policy if exists s3_owner_self_read on public.platform_owners;
create policy s3_owner_self_read on public.platform_owners
    for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists s3_membership_self_read on public.organization_members;
create policy s3_membership_self_read on public.organization_members
    for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists s3_organization_read on public.organizations;
create policy s3_organization_read on public.organizations
    for select to authenticated using (
        exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
        or id in (select organization_id from public.organization_members
                  where user_id = (select auth.uid()) and role = 'org_admin')
    );

drop policy if exists s3_camp_read on public.camps;
create policy s3_camp_read on public.camps
    for select to authenticated using (
        exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
        or organization_id in (select organization_id from public.organization_members
                               where user_id = (select auth.uid()) and role = 'org_admin')
    );

drop policy if exists s3_registration_read on public.camp_registrations;
create policy s3_registration_read on public.camp_registrations
    for select to authenticated using (
        exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
        or organization_id in (select organization_id from public.organization_members
                               where user_id = (select auth.uid()) and role = 'org_admin')
    );

-- Audit is owner-only, matching the backend /admin/audit-log endpoint.
drop policy if exists s3_audit_owner_read on public.audit_log;
create policy s3_audit_owner_read on public.audit_log
    for select to authenticated using (
        exists (select 1 from public.platform_owners where user_id = (select auth.uid()))
    );
