-- UC2: Benachrichtigungs-Einstellungen je Vereinsmitglied.
-- Additiv, idempotent (ADD COLUMN IF NOT EXISTS, keine bestehenden Spalten verändert).
-- Keine RLS-Änderung nötig: Backend nutzt BYPASSRLS (service-role key); die Datenschutz-
-- Einschränkung für notification_phone und notification_email wird ausschließlich auf
-- API-Ebene durchgesetzt (nur der Admin selbst und der Platform-Owner dürfen lesen,
-- siehe app/repositories/notification_settings.py und app/routers/admin.py).

ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS notification_channel text NOT NULL DEFAULT 'email'
        CONSTRAINT chk_org_members_notification_channel
        CHECK (notification_channel IN ('email', 'whatsapp', 'none')),
    ADD COLUMN IF NOT EXISTS notification_email text,
    ADD COLUMN IF NOT EXISTS notification_phone text,
    ADD COLUMN IF NOT EXISTS notification_events text[] NOT NULL
        DEFAULT ARRAY['new_registration']::text[],
    ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz;

COMMENT ON COLUMN public.organization_members.notification_channel IS
    'Benachrichtigungs-Kanal: email (Standard), whatsapp oder none (deaktiviert).';
COMMENT ON COLUMN public.organization_members.notification_email IS
    'E-Mail-Adresse für Admin-Benachrichtigungen. Datenschutz: nur über die API '
    'zugänglich – ausschließlich für den Admin selbst und den Platform-Owner '
    '(Durchsetzung in app/repositories/notification_settings.py).';
COMMENT ON COLUMN public.organization_members.notification_phone IS
    'Telefonnummer im E.164-Format (+491234567890). Datenschutz: nur über die API '
    'zugänglich – ausschließlich für den Admin selbst und den Platform-Owner '
    '(Durchsetzung in app/repositories/notification_settings.py).';
COMMENT ON COLUMN public.organization_members.notification_events IS
    'Ereignisse, für die der Admin benachrichtigt werden möchte: '
    'new_registration, cancellation, waitlist_promotion, daily_summary.';
COMMENT ON COLUMN public.organization_members.whatsapp_consent_at IS
    'Zeitstempel der expliziten Einwilligung zur WhatsApp-Benachrichtigung (DSGVO).';
