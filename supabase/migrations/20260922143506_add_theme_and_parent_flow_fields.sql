-- ============================================================
-- CampsPilot SaaS — Eltern-Flow-Theme-System (Richtung-C-Folgeticket)
--
-- Additiv zur bestehenden Schema-v1-Migration. Betrifft ausschließlich das
-- separate CampsPilot-SaaS-Supabase-Projekt — keine Berührung mit der
-- KSV-Legacy-Datenbank (backend/schema.sql) oder deren Tabellen.
--
-- Vier neue Spalten, wie im Implementierungsauftrag "Eltern-Flow" Abschnitt
-- 3.1 (theme) und den drei mit Serkan geklärten Datenfeld-Lücken
-- (jersey_size, pickup_authorized, iban) vereinbart:
--
-- - organizations.theme: welches der drei visuellen Themes die öffentliche
--   Anmeldestrecke für diesen Verein zeigt.
-- - organizations.iban: Bankverbindung für die Überweisungs-Zahlungsart
--   (kein Stripe/Payment-Provider in backend_saas — siehe README "What
--   does not exist yet"). Nullable: ein Verein ohne hinterlegte IBAN zeigt
--   auf der Bestätigungsseite keine Zahlungsdaten statt erfundener Werte.
-- - camp_registrations.jersey_size: Trikotgröße, wie im Eltern-Flow-Auftrag
--   Abschnitt 6.3 (Kind-Abschnitt) verlangt. Freitext, nicht als
--   kontrollierte Liste — Kindergrößen variieren stark zwischen Vereinen
--   und Herstellern, eine feste CHECK-Liste würde hier mehr einschränken
--   als helfen.
-- - camp_registrations.pickup_authorized: wer das Kind zusätzlich zu den
--   Erziehungsberechtigten abholen darf (Auftrag Abschnitt 6.3, "frei,
--   optional") — bewusst ein einzelnes Freitextfeld, nicht strukturiert
--   (Name+Telefon), weil der Auftrag es explizit so beschreibt und
--   mehrere Personen in einem Feld stehen können.
-- ============================================================

alter table public.organizations
    add column if not exists theme text not null default 'tradition',
    add column if not exists iban text;

alter table public.organizations
    add constraint chk_organizations_theme
        check (theme in ('tradition', 'akademie', 'kompakt'));

-- Grobe strukturelle Plausibilität (Länge, erlaubte Zeichen), keine
-- Prüfziffern-Validierung — die passiert bei Bedarf in der Anwendungsschicht,
-- nicht per DB-Constraint (ein Tippfehler soll eine verständliche
-- Fehlermeldung ergeben, nicht eine rohe CheckViolation).
alter table public.organizations
    add constraint chk_organizations_iban_format
        check (iban is null or iban ~* '^[A-Z]{2}[0-9A-Z]{13,32}$');

comment on column public.organizations.theme is
    'Welches der drei Eltern-Flow-Themes (tradition/akademie/kompakt) diese Organisation zeigt. Kein Editor — wird vorerst manuell gesetzt.';
comment on column public.organizations.iban is
    'Bankverbindung für die Überweisungs-Zahlungsart auf der Bestätigungsseite. NULL = keine Zahlungsdaten anzeigen, nichts erfinden.';

alter table public.camp_registrations
    add column if not exists jersey_size text,
    add column if not exists pickup_authorized text;

comment on column public.camp_registrations.jersey_size is
    'Trikotgröße, Freitext (Eltern-Flow-Auftrag Abschnitt 6.3). Optional.';
comment on column public.camp_registrations.pickup_authorized is
    'Wer das Kind zusätzlich zu den Erziehungsberechtigten abholen darf, Freitext (Eltern-Flow-Auftrag Abschnitt 6.3). Optional.';

-- Pilot-Zuweisung (Auftrag Abschnitt 3.1). idempotent, kein Effekt falls
-- die Zeilen (noch) nicht existieren — die Seed-Skripte in
-- backend_saas/seeds/ legen sie ohnehin schon mit den richtigen Werten an,
-- das hier deckt nur bereits vorhandene Cloud-Zeilen ab.
update public.organizations set theme = 'tradition' where slug = 'ksv-baunatal';
update public.organizations set theme = 'akademie' where slug = 'jk-performance-academy';
