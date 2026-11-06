INSERT INTO public.organizations(slug,name,contact_email,site_published,theme,modules)
VALUES ('jk-academy-demo','JK-Demo-Org','demo@campspilot.example',true,'akademie','{camps,trainings,members,players}')
ON CONFLICT(slug) DO NOTHING;
-- Local only: the JK demo shows every premium module (also on an existing local DB).
-- ksv-baunatal, when seeded, keeps the column default (camps only).
UPDATE public.organizations SET modules='{camps,trainings,members,players}' WHERE slug='jk-academy-demo';
INSERT INTO public.camps(organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents,status)
SELECT id,'demo-camp','Synthetisches Demo-Camp',CURRENT_DATE+90,CURRENT_DATE+92,6,14,20,14900,'published'
FROM public.organizations WHERE slug='jk-academy-demo'
ON CONFLICT(organization_id,slug) DO NOTHING;
