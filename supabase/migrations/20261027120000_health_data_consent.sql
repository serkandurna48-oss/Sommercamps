-- Additive: existing registrations and older clients without health data retain false.
alter table public.camp_registrations
    add column if not exists health_data_consent boolean not null default false;

-- Existing health data are not retroactively consented. Remediate them manually.
-- Avoid a CHECK constraint here: it would fail on historic rows with health data.
