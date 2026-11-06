-- Angebotsart für Trainingsangebote (optional): fussball, athletik, mental,
-- videoanalyse, premium. Rein beschreibend (Label); "premium" hat keine eigene Logik.
-- Idempotent.

alter table public.training_offers add column if not exists category text;

alter table public.training_offers drop constraint if exists chk_training_offers_category;
alter table public.training_offers
    add constraint chk_training_offers_category
    check (category is null or category in ('fussball', 'athletik', 'mental', 'videoanalyse', 'premium'));
