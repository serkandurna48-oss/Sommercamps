-- Pre-deployment check for S3 migration (20261018154831_tenant_read_policies.sql).
-- Run this query on the target Supabase project (SQL editor, role: postgres or service_role).
-- If it returns any rows the migration will abort; decide with Serkan before applying.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'platform_owners', 'organization_members', 'organizations',
      'camps', 'camp_registrations', 'audit_log'
  )
  AND policyname NOT LIKE 's3\_%' ESCAPE '\'
ORDER BY tablename, policyname;
