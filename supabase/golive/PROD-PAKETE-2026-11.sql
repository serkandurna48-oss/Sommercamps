-- Nur lesen. NACH der Prod-Migration (Runbook 3.2b): heute gueltiges Paket und aktive Camps je Verein.
-- KSV und JK muessen 'individuell' zeigen. Nur Slugs und Zaehlungen, keine Personendaten.
select o.slug,
       coalesce((select r.plan from public.organization_fee_rules r
                  where r.organization_id = o.id and r.valid_from <= current_date
                  order by r.valid_from desc, r.created_at desc, r.id desc limit 1), 'starter (Standard)') as paket_heute,
       (select count(*) from public.camps c
         where c.organization_id = o.id and c.offer_id is null and c.status = 'published'
           and c.end_date >= current_date) as aktive_camps
from public.organizations o order by o.slug;
