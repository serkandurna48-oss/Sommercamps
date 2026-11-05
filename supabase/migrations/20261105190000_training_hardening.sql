-- Training hardening (final review M2): second privilege layer on the new tables.
--
-- Supabase grants ALL on new public tables to anon/authenticated by default. RLS blocks
-- the access today, but it should not be the only layer:
--   training_offers: anon gets nothing; authenticated keeps SELECT (policy
--     s3_training_offer_read) but loses write privileges. Writes go through the backend
--     role only.
--   organization_memberships: children's names and birth dates, backend-only. No policy,
--     no grant for anon/authenticated.
--
-- Idempotent: REVOKE is a no-op when the privilege is already gone. The backend role is
-- not affected (it is neither anon nor authenticated; BYPASSRLS/owner). The lock
-- timeout keeps the REVOKEs from queueing behind a long transaction.

set lock_timeout = '5s';

revoke all on public.training_offers from anon;
revoke insert, update, delete, truncate, references, trigger on public.training_offers from authenticated;
grant select on public.training_offers to authenticated;

revoke all on public.organization_memberships from anon, authenticated;
