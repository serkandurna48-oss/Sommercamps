-- Add email tracking columns to camp_registrations.
-- email_sent_at: set after successful notification send (idempotency guard).
-- email_error:   last error message if send failed; cleared on success.
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error   TEXT;
