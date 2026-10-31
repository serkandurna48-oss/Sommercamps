-- CampsPilot v1.1: Stripe Connect Checkout (additive, idempotent).
-- Apply to disposable/staging DB first. Do not modify live production without review.
alter table public.organizations add column if not exists stripe_account_id text;
alter table public.organizations add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.organizations add column if not exists online_payment_enabled boolean not null default false;

alter table public.camp_registrations add column if not exists stripe_checkout_session_id text;
alter table public.camp_registrations add column if not exists stripe_payment_intent_id text;
alter table public.camp_registrations add column if not exists stripe_checkout_amount_cents integer;
alter table public.camp_registrations add column if not exists stripe_checkout_currency text;
alter table public.camp_registrations add column if not exists stripe_checkout_account_id text;

create unique index if not exists uniq_campspilot_stripe_checkout_session
    on public.camp_registrations (stripe_checkout_session_id)
    where stripe_checkout_session_id is not null;

create unique index if not exists uniq_campspilot_stripe_payment_intent
    on public.camp_registrations (stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;

-- Never expose Stripe IDs through anonymous PostgREST queries. API uses its
-- restricted server DB role; RLS and the existing column grants remain.
