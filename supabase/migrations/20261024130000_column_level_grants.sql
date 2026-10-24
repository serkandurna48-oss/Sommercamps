-- UC6P: Column-level grants — sensible Spalten aus authenticated-Lesezugriff entfernen.
--
-- Hintergrund (Security Review 22.10.2026, portiert 24.10.2026):
-- 20261018154831_tenant_read_policies.sql hat tabellenweites SELECT auf organizations
-- und organization_members an authenticated vergeben. Da der Supabase-anon-Key und die
-- Supabase-URL im Frontend öffentlich sind, konnte ein eingeloggter Vereins-Admin über
-- die PostgREST-API ALLE Spalten seiner Organisation lesen — auch:
--   organizations.billing_notes       (interne Vertragsnotizen des Plattformbetreibers)
--   organizations.stripe_account_id   (Stripe-Connect-Konto-ID, sensibles Konfigurationsmerkmal)
--   organizations.approved_by         (user_id des freigebenden Platform-Owners, intern)
--   organization_members.notification_email      (private Kontaktdaten)
--   organization_members.notification_phone      (private Kontaktdaten, E.164-Format)
--   organization_members.whatsapp_consent_at     (DSGVO-Einwilligung — Art. 9-nahes Datum)
--
-- Neue Spalten seit der ursprünglichen UC6-Version (22.10.) eingeordnet (23./24.10.):
--   review_status, avv_accepted_at, avv_version, submitted_at, approved_at,
--   review_note, registration_questions (alle lesbar für org_admin) —
--   approved_by (intern; UUID des freigebenden Platform-Owners).
--
-- Fix: Tabellenweites SELECT für authenticated entziehen, dann nur die unbedenklichen
-- Spalten als Column-Level-Grant wiedergeben. Das Frontend liest diese Tabellen
-- ausschließlich über FastAPI-Endpunkte (nie direkt via supabase-js), daher kein
-- Frontend-Änderungsbedarf. Backend-Verbindungen mit BYPASSRLS sind nicht betroffen.
--
-- Idempotent: REVOKE ist No-Op wenn das Recht nicht (mehr) besteht;
-- GRANT ist No-Op wenn das Recht bereits exakt so existiert.

-- -----------------------------------------------------------------------
-- organizations
-- Intern (nicht gewährt): billing_notes, stripe_account_id, approved_by
-- -----------------------------------------------------------------------

REVOKE SELECT ON public.organizations FROM authenticated;

-- Falls ein früherer partieller Lauf column-level grants auf die sensiblen
-- Spalten gesetzt hatte, diese ebenfalls entfernen.
REVOKE SELECT (billing_notes, stripe_account_id, approved_by)
    ON public.organizations FROM authenticated;

GRANT SELECT (
    id,
    slug,
    name,
    legal_name,
    contact_email,
    contact_phone,
    logo_url,
    primary_color,
    plan_status,
    created_at,
    updated_at,
    theme,
    iban,
    site_published,
    contact_person_name,
    intro_heading,
    intro_text,
    hero_image_url,
    legal_address,
    trainer_image_url,
    trainer_text,
    terms_text,
    stripe_charges_enabled,
    online_payment_enabled,
    review_status,
    avv_accepted_at,
    avv_version,
    submitted_at,
    approved_at,
    review_note,
    registration_questions
) ON public.organizations TO authenticated;

-- -----------------------------------------------------------------------
-- organization_members
-- Intern (nicht gewährt): notification_email, notification_phone, whatsapp_consent_at
-- -----------------------------------------------------------------------

REVOKE SELECT ON public.organization_members FROM authenticated;

REVOKE SELECT (notification_email, notification_phone, whatsapp_consent_at)
    ON public.organization_members FROM authenticated;

GRANT SELECT (
    id,
    organization_id,
    user_id,
    role,
    created_at,
    notification_channel,
    notification_events
) ON public.organization_members TO authenticated;

-- -----------------------------------------------------------------------
-- Prüf-Block: effektive Spaltenrechte für authenticated (read-only)
-- -----------------------------------------------------------------------
SELECT
    table_name,
    column_name,
    privilege_type
FROM information_schema.role_column_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name IN ('organizations', 'organization_members')
ORDER BY table_name, column_name;
