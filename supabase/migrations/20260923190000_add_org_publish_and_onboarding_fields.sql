-- Zweck: Betreiber-/Onboarding-Auftrag — der Vereins-Builder braucht einen
-- Entwurfs-Zustand ("Unvollständige Entwürfe vor öffentlichem Zugriff
-- schützen") und ein paar Stammdaten-/Website-Felder, die es bisher nicht
-- gibt (contact_person_name, intro_heading, intro_text, hero_image_url,
-- billing_notes).
--
-- Anwendungsstatus: Bereits manuell gegen das CampsPilot-SaaS-Cloud-Projekt
-- (Supabase-Ref wkmckfbzhmihyfwiekct) angewendet — per einmaligem
-- psycopg2-Skript gegen DATABASE_URL, NICHT per `supabase db push`
-- (Supabase-CLI ist in dieser Entwicklungsumgebung nicht installiert). Nach
-- Anwendung verifiziert: alle 6 zu diesem Zeitpunkt bestehenden
-- Organisationen (campspilot-pilot, ksv-baunatal, jk-performance-academy,
-- jk-demo-campspilot-test, smoke-test-verify, tv-musterstadt) behielten
-- site_published=true — keine Regression. Diese Datei jetzt NICHT erneut
-- gegen dieselbe DB ausführen ("wende sie nicht erneut blind an") — die
-- `add column if not exists`-Guards machen einen zweiten Lauf zwar
-- technisch unschädlich (No-Op), aber ein erneuter manueller Lauf ist
-- trotzdem unnötig und sollte nicht ungeprüft wiederholt werden, nur weil
-- diese Datei im Repo liegt. Für ein zukünftiges zweites Environment
-- (z. B. ein separates Staging-Projekt) ist diese Datei der korrekte,
-- einmalige Anwendungsweg.
--
-- Auswirkungen: Rein additiv, keine bestehende Spalte/Zeile wird verändert
-- oder gelöscht. Weder KSV Baunatal (`backend/`, eigenes Supabase-Projekt)
-- noch JK Performance Academy (`backend_saas`-Schwester-Setup unter
-- JK-102, ebenfalls eigenes Projekt) sind von dieser Migration betroffen —
-- sie läuft ausschließlich gegen das CampsPilot-SaaS-Projekt, nicht gegen
-- die produktiven Kunden-Datenbanken.
--
-- site_published DEFAULT true, nicht false: das schützt ausschließlich neue,
-- über den Builder angelegte Vereine (die den Wert explizit auf false
-- setzen) vor ungewollter Sichtbarkeit, OHNE bereits existierende, längst
-- live genutzte Test-/Pilot-Organisationen (campspilot-pilot, ksv-baunatal,
-- jk-performance-academy, jk-demo-campspilot-test, smoke-test-verify,
-- tv-musterstadt) rückwirkend unsichtbar zu machen. Eine Migration darf
-- bestehendes Verhalten nicht stillschweigend ändern.
--
-- Alle übrigen Felder optional/nullable — "not invented data"-Prinzip wie
-- bei den camp-Feldern (siehe 20260922155045): kein Platzhaltertext, der
-- jeweilige Abschnitt erscheint nur, wenn tatsächlich befüllt.

alter table public.organizations
    add column if not exists site_published boolean not null default true,
    add column if not exists contact_person_name text,
    add column if not exists intro_heading text,
    add column if not exists intro_text text,
    add column if not exists hero_image_url text,
    add column if not exists billing_notes text;

comment on column public.organizations.site_published is 'false = Verein ist ein Entwurf, öffentliche API/Seite behandelt ihn wie nicht vorhanden (404, wie ein deaktivierter plan_status). Neue, über den Betreiber-Builder angelegte Vereine starten explizit mit false.';
comment on column public.organizations.contact_person_name is 'Name des Ansprechpartners beim Verein (Stammdaten) — getrennt von contact_email/contact_phone, die die reinen Kontaktkanäle sind.';
comment on column public.organizations.intro_heading is 'Überschrift auf der öffentlichen Vereinsseite. NULL = Standard-Überschrift (Vereinsname) wird verwendet.';
comment on column public.organizations.intro_text is 'Freitext-Einführung auf der öffentlichen Vereinsseite. NULL = Abschnitt wird nicht angezeigt.';
comment on column public.organizations.hero_image_url is 'Titelbild-URL für die öffentliche Vereinsseite. NULL = kein Titelbild (Fallback-Gestaltung greift).';
comment on column public.organizations.billing_notes is 'Freitext für manuell vereinbarte Software-Abrechnungskonditionen (Betreiber-only, nie öffentlich) — siehe plan_status für den Status selbst (pilot/active/suspended/cancelled als Vertragsstatus-Achse).';
