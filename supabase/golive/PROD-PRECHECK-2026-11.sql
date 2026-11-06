-- Nur lesen. Vor dem Go-Live auf Prod (Supabase SQL-Editor): zeigt, welche der 15 Go-Live-Migrationen
-- schon angewendet sind (erwartet: alle f ausser der ersten Zeile) und Mengen fuer die Backfills.
-- Gibt nur Zaehlungen und Vereins-Slugs aus, keine Personendaten.
with c(tab, col) as (select table_name, column_name from information_schema.columns where table_schema = 'public')
select m, applied from (values
  ('20261027120000 health_data_consent (muss t sein)', exists (select 1 from c where tab = 'camp_registrations' and col = 'health_data_consent')),
  ('20261030203000 stripe_checkout_v11',      exists (select 1 from c where tab = 'camp_registrations' and col = 'stripe_checkout_account_id')),
  ('20261105180000 training_offers',          to_regclass('public.training_offers') is not null),
  ('20261106100000 player_records',           to_regclass('public.players') is not null),
  ('20261106110000 training_offer_category',  exists (select 1 from c where tab = 'training_offers' and col = 'category')),
  ('20261106120000 membership_extra_fields',  exists (select 1 from c where tab = 'organization_memberships' and col = 'extra')),
  ('20261106130000 organization_modules',     exists (select 1 from c where tab = 'organizations' and col = 'modules')),
  ('20261106140000 billing_profile_fee_rules', to_regclass('public.organization_fee_rules') is not null),
  ('20261106150000 stripe_express',           exists (select 1 from c where tab = 'organizations' and col = 'stripe_express_account_id')),
  ('20261106160000 refunds_and_grants',       exists (select 1 from c where tab = 'camp_registrations' and col = 'refunded_cents')),
  ('20261107100000 parent_invoices',          to_regclass('public.invoices') is not null),
  ('20261107110000 invoice_retry',            exists (select 1 from c where tab = 'camp_registrations' and col = 'invoice_error')),
  ('20261107120000 anonymized_at',            exists (select 1 from c where tab = 'camp_registrations' and col = 'anonymized_at')),
  ('20261107130000 parent_billing_address',   exists (select 1 from c where tab = 'camp_registrations' and col = 'parent_street')),
  ('20261107140000 stripe_managed_risk',      exists (select 1 from c where tab = 'organizations' and col = 'stripe_express_account_kind'))
) v(m, applied);
select (select count(*) from public.organizations) as vereine,
       (select string_agg(slug, ', ' order by slug) from public.organizations) as slugs,
       (select count(*) from public.camp_registrations) as anmeldungen,
       (select count(*) from public.camp_registrations where payment_status = 'paid') as bezahlt,
       (select count(*) from public.camp_registrations where child_first_name = 'Gelöscht' and child_last_name = 'Gelöscht') as platzhalter;
