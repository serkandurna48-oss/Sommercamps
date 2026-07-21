# JK Performance Academy — Umsetzungsplan nach Zusage

Interner Plan für den Ablauf, sobald Jan sich für ein Paket entschieden hat.

## Decision Point (zuerst klären, bevor irgendetwas beauftragt wird)

- **Wenn Jan zunächst nur eine sichtbare, professionelle Webseite möchte** →
  Starter-Pfad (Landing, keine echte Anfrageverarbeitung).
- **Wenn Jan von Anfang an echte Anfragen empfangen möchte** →
  Growth-Pfad (Landing + Training Inquiry Flow).
- **Bezahlte Infrastruktur (eigene Supabase-/Render-Instanz) wird erst
  aufgesetzt, wenn Paket und Preis mit Jan final bestätigt sind** — nicht
  vorher, unabhängig davon, wie sicher die Zusage wirkt.

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

## Phase 3 — Separate JK-Instanz aufsetzen

- Eigenes, von KSV komplett isoliertes Setup (kein Shared-Tenant)
- Nur nötig für den Growth-Pfad; beim Starter-Pfad entfällt dieser Schritt
- **Schätzung:** 0,5 Tag

## Phase 4 — Training Inquiry Flow bauen

- Echtes Anfrageformular (Training/Camp/Mitgliedschaftsinteresse je nach Intake)
- Interne Benachrichtigung an die in der Intake genannte E-Mail-Adresse
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
