# JK Performance Academy — Umsetzungsplan nach Zusage

Interner Plan für den Ablauf, sobald Jan sich für ein Paket entschieden hat.

> **Aktualisiert (CP-S401A):** JK wird der **erste echte Tenant der neuen CampsPilot-SaaS-Struktur**
> (`backend_saas/` + separates Supabase-Projekt, Shared-Schema mit `organizations`/`camps`/
> `camp_registrations`), nicht mehr eine dauerhaft eigene, von KSV isolierte Einzel-Instanz. Die
> bisherige Aussage in Phase 3 unten ("eigenes, komplett isoliertes Setup, kein Shared-Tenant")
> ist überholt — siehe [`docs/saas/architecture.md`](../saas/architecture.md#71-jk-als-erster-saas-tenant)
> und [`docs/saas/migration-strategy.md`](../saas/migration-strategy.md) (Phase 2 dort)
> für die verbindliche Zielarchitektur. Der bereits existierende JK-Draft (`clubConfig.jk.tsx`,
> statische Landing Page) bleibt dabei nützlich als **UI-/Content-Referenz** (Texte, Struktur,
> Bildauswahl, Formularfelder) — er ist nur nicht mehr das technische Zielbild für das Backend.
> Die eigentliche technische Umsetzung (echte Anfragen-/Registrierungsverarbeitung) erfolgt
> später gegen die neue SaaS-Struktur, nicht gegen ein eigenes JK-Backend.

## Decision Point (zuerst klären, bevor irgendetwas beauftragt wird)

- **Wenn Jan zunächst nur eine sichtbare, professionelle Webseite möchte** →
  Starter-Pfad (Landing, keine echte Anfrageverarbeitung). Bleibt vorerst der bestehende
  statische Draft (`clubConfig.jk.tsx`), unabhängig vom SaaS-Zeitplan.
- **Wenn Jan von Anfang an echte Anfragen empfangen möchte** →
  Growth-Pfad (Landing + Training Inquiry Flow), technisch umgesetzt als erster Tenant im
  neuen `backend_saas/`-System (siehe Phase 3, aktualisiert).
- **Die SaaS-Infrastruktur (`backend_saas/` + separates Supabase-Projekt) wird erst
  aufgesetzt, wenn Paket und Preis mit Jan final bestätigt sind** — nicht
  vorher, unabhängig davon, wie sicher die Zusage wirkt. Das gilt unverändert, nur dass es
  jetzt kein rein für JK dediziertes Setup mehr ist, sondern der erste Tenant im gemeinsamen
  SaaS-System.

---

## Phase 1 — Finale Inhalte & Recht einsammeln

- Intake-Gespräch anhand `jk-client-intake.md` durchführen
- Fragen aus `jk-content-and-legal-questions.md` klären
- Bildrechte/Einwilligungen bestätigen lassen
- **Schätzung:** abhängig von Jans Rückmeldegeschwindigkeit, kein eigener Aufwand

## Phase 2 — JK-Entwurf sicher mergen

- Branch `cp-s308-light-jk-draft` nach `main` mergen
- Vorher prüfen: KSV-Verhalten bleibt bei `NEXT_PUBLIC_ACTIVE_CLUB` unset unverändert
- **Schätzung:** < 0,5 Tag

## Phase 3 — JK als ersten Tenant im CampsPilot-SaaS anlegen (aktualisiert, CP-S401A)

- ~~Eigenes, von KSV komplett isoliertes Setup (kein Shared-Tenant)~~ — **überholt.**
  Stattdessen: `organizations`-Datensatz für JK im neuen `backend_saas/`-System anlegen
  (Shared-Schema mit künftigen weiteren Tenants, siehe `docs/saas/architecture.md`)
- Voraussetzung: `backend_saas/`-Grundgerüst existiert bereits (Phase 1 aus
  `docs/saas/migration-strategy.md`) — falls noch nicht vorhanden, ist das ein
  vorgelagerter, separater Schritt und kein Teil des JK-Onboardings selbst
- `camps`-Datensätze für JKs tatsächliches Angebot anlegen (ersetzt die bisher rein
  clientseitige `JK_OVERRIDES.PROGRAMS`-Liste durch echte Datensätze)
- Nur nötig für den Growth-Pfad; beim Starter-Pfad entfällt dieser Schritt
- **Schätzung:** 0,5 Tag (setzt voraus, dass das SaaS-Grundgerüst aus einem vorgelagerten
  Ticket bereits existiert — reines Anlegen des JK-Tenants selbst ist klein)

## Phase 4 — Training Inquiry Flow bauen

- Echtes Anfrageformular (Training/Camp/Mitgliedschaftsinteresse je nach Intake), umgesetzt
  gegen das neue `backend_saas/`-System (JK-`organization_id` + passende `camp_id`), nicht
  gegen ein eigenes, JK-dediziertes Backend
- Interne Benachrichtigung an die in der Intake genannte E-Mail-Adresse
- Der bestehende JK-Draft (Formularfelder, Texte, Struktur aus `clubConfig.jk.tsx`) dient hier
  als Vorlage für Inhalt/UX, nicht als technische Grundlage
- Nur im Growth-Pfad
- **Schätzung:** 5–8 Werktage

## Phase 5 — QA & Review mit Jan

- Checkliste aus `jk-go-live-checklist.md` durchgehen
- Test-Anfrage, E-Mail-Bestätigung, Admin-Ansicht, Mobile-QA
- Finale Freigabe von Jan einholen
- **Schätzung:** 0,5 Tag

## Phase 6 — Go-Live

- Domain scharfschalten
- 24h-Nachkontrolle
- **Schätzung:** 0,5 Tag

## Phase 7 — Feedback nach Launch

- Nach einigen Wochen echten Betriebs: Rückmeldung von Jan einholen
- Weitere Schritte (z. B. editierbare Camp-Verwaltung, echtes
  Mitgliedschafts-Signup) nur bei echtem, sichtbarem Bedarf angehen — nicht
  vorab bauen

---

## Grobe Gesamtschätzungen

- **Starter-Landing live:** 2–4 Werktage nach Vorliegen von Content/Recht
- **Growth Inquiry System:** zusätzlich 5–8 Werktage
- **Echtes Mitgliedschafts-Signup:** eigener, späterer Scope, 3–5 Wochen —
  wird hier nicht mitgeplant, sondern separat evaluiert, sobald relevant
