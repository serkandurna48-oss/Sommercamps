# CampsPilot — Migrationsstrategie (CP-S401)

> Begleitdokument zu [architecture.md](./architecture.md). Beschreibt die geplante Reihenfolge,
> in der die SaaS-Struktur aufgebaut, mit einem echten Tenant (JK) befüllt und — falls und wann
> entschieden — KSV Baunatal dorthin überführt wird.
>
> **Diese Phase (CP-S401) liefert ausschließlich Dokumentation.** Kein Schritt unten ist bereits
> begonnen. Phase 4 und 5 sind ausdrücklich **nicht** Teil dieses Tickets und benötigen jeweils
> eine eigene, explizite Freigabe, bevor irgendetwas gegen die KSV-Produktivdaten ausgeführt wird.

---

## Überblick

| Phase | Ziel | Betrifft KSV-Produktion? | Teil von CP-S401? |
|---|---|---|---|
| 1 | Leeres SaaS-System | Nein | Vorbereitet (dokumentiert), nicht gebaut |
| 2 | JK als erster Tenant | Nein | Nein |
| 3 | Stabilisierung / echte Nutzung | Nein | Nein |
| 4 | KSV-Migrationsprobe (Dry-Run) | Nein (nur Kopie/Staging) | Nein |
| 5 | KSV-Cutover mit Rollback | **Ja** | Nein |

---

## Phase 1 — Leeres SaaS-System

**Ziel:** `backend_saas/` und das separate CampsPilot-Supabase-Projekt existieren, sind
deploybar und funktional, enthalten aber noch keine echten Organisationen, Camps oder
Registrierungen. Reiner Infrastruktur- und Grundgerüst-Meilenstein.

Umfasst (grobe Reihenfolge):

1. Neues, separates Supabase-Projekt anlegen (eigene Instanz, kein Bezug zum KSV-Projekt).
2. Schema aus [architecture.md Abschnitt 4](./architecture.md#4-datenmodell-fachlicher-entwurf-keine-migration-ausgeführt)
   dort ausführen: `organizations`, `camps`, `camp_registrations`.
3. `backend_saas/` als eigenständiges Projekt aufsetzen (Grundgerüst: Health-Check,
   DB-Connection, Auth-Skeleton für den Plattform-Admin — wiederverwendet Muster aus
   `backend/`, siehe architecture.md Abschnitt 6.2).
4. Separates Deployment (eigener Render-Service o. ä.) aufsetzen, gegen das neue
   Supabase-Projekt verbunden.
5. Smoke-Test: `/health` erreichbar, DB-Verbindung funktioniert, keine echten Daten.

**Explizit nicht in Phase 1:** Supabase Auth, RLS-Policies scharf geschaltet, Stripe-Integration,
irgendein Frontend gegen dieses Backend.

**Exit-Kriterium:** Ein leeres, lauffähiges, isoliertes System — bereit, den ersten echten
Tenant aufzunehmen.

---

## Phase 2 — JK als erster Tenant

**Ziel:** JK Performance Academy wird der erste reale `organizations`-Datensatz im neuen
System. Kein KSV-Bezug in dieser Phase.

Umfasst:

1. `organizations`-Datensatz für JK anlegen (manuell durch Serkan als Plattform-Admin — kein
   Self-Service-Onboarding in dieser Phase).
2. Ein oder mehrere `camps`-Datensätze für JKs tatsächliches Angebot anlegen — ersetzt die
   heutige, rein clientseitige `JK_OVERRIDES.PROGRAMS`-Liste in `clubConfig.jk.tsx` durch echte
   Datensätze.
3. Entscheiden und umsetzen, wie das JK-Frontend (heute: statischer Draft über
   `NEXT_PUBLIC_ACTIVE_CLUB=jk`) gegen das neue Backend spricht — das ist der Punkt, an dem das
   in architecture.md als offene Entscheidung markierte Frontend-Migrations-Ticket beginnt.
4. Registration-Flow für JK gegen `backend_saas/` testen (zunächst ggf. ohne Stripe, je nach
   Umfang von `jk-implementation-plan-after-yes.md` Phase 4 "Training Inquiry Flow").
5. Abklären, ob der bestehende JK-Draft-Plan ("komplett von KSV isoliertes Setup, kein
   Shared-Tenant", siehe `docs/onboarding/jk-implementation-plan-after-yes.md` Phase 3) durch
   diesen Shared-Tenant-Ansatz ersetzt wird — siehe architecture.md Abschnitt 7.1.

**Exit-Kriterium:** JK kann über das neue System eine echte Anmeldung/Anfrage empfangen, ohne
dass KSV in irgendeiner Form beteiligt ist.

---

## Phase 3 — Stabilisierung / echte Nutzung

**Ziel:** JK läuft eine Zeit lang produktiv im neuen System. Fokus verschiebt sich von "bauen"
zu "beobachten und härten", bevor ein zweiter, ggf. schwierigerer Tenant (KSV) angegangen wird.

Umfasst:

1. Echten Betrieb mit JK über mehrere Wochen laufen lassen (analog zum "Feedback nach Launch"
   in `jk-implementation-plan-after-yes.md` Phase 7).
2. Bugs/Kanten aus Phase 2 beheben, die erst unter echter Nutzung sichtbar werden.
3. Monitoring/Backup-Konventionen für `backend_saas/` etablieren — analog zu den in
   Root-`CLAUDE.md`/`DEPLOYMENT.md` für `backend/` bereits dokumentierten Mustern
   (Health-Check, manuelles Backup vor riskanten Aktionen), aber für das neue System neu
   aufgesetzt.
4. Optional: einen zweiten, unabhängigen Piloten-Tenant aufnehmen, um zu verifizieren, dass die
   Tenant-Isolation nicht nur für JK "zufällig" funktioniert, sondern grundsätzlich trägt.
5. Erst am Ende dieser Phase wird ernsthaft über Phase 4 (KSV) nachgedacht — nicht vorher.

**Exit-Kriterium:** Das System hat sich mit mindestens einem echten Tenant über einen
nennenswerten Zeitraum bewährt, ohne dass Tenant-Isolation oder Datenintegrität in Frage
standen.

---

## Phase 4 — KSV-Migrationsprobe (Dry-Run)

**Ziel:** Verifizieren, ob und wie sich KSV-Daten verlustfrei in das neue Schema überführen
lassen — **ohne** die KSV-Produktion anzufassen oder echte KSV-Daten dauerhaft zu verschieben.

Umfasst (Entwurf, im Detail erst bei Beginn dieser Phase zu planen):

1. Kopie/Export der KSV-Produktionsdaten (z. B. via `pg_dump`, analog zum bestehenden
   Backup-Verfahren in `DEPLOYMENT.md`) in eine **Staging**-Instanz des SaaS-Schemas — niemals
   direkt gegen die KSV-Produktionsdatenbank oder das produktive SaaS-Schema.
2. Mapping-Skript: `selected_camp_week` (freier String) → passender `camps`-Datensatz für KSV
   (`organizations`-Eintrag für KSV anlegen, historische Camp-Wochen aus `camp_config.py` als
   `camps`-Zeilen nachbilden).
3. `jersey_size` bleibt gemäß architecture.md Abschnitt 4.3 vorerst KSV-spezifisch — Entscheidung
   aus den offenen Punkten in architecture.md muss vor diesem Schritt getroffen sein.
4. Datenintegrität verifizieren: Anzahl Registrierungen, Zahlungsstatus-Verteilung,
   Stripe-Session-IDs stimmen zwischen Quelle (KSV) und Ziel (Staging) überein.
5. Kein Cutover, kein Löschen der Quelle, keine Änderung an KSV-Produktion in diesem Schritt.

**Exit-Kriterium:** Ein dokumentierter, wiederholbarer Migrationsweg, der in einer Staging-Umgebung
nachweislich funktioniert — inklusive einer schriftlichen Abweichungsliste (welche Legacy-Felder
wie behandelt wurden).

**Freigabe-Voraussetzung:** Explizite Bestätigung des Nutzers, bevor überhaupt ein Export der
KSV-Produktionsdaten stattfindet — auch für einen reinen Dry-Run.

---

## Phase 5 — KSV-Cutover mit Rollback-Möglichkeit

**Ziel:** KSV Baunatal läuft produktiv im neuen SaaS-System, mit einem klar definierten,
getesteten Rollback-Pfad zurück zum bestehenden `backend/` + KSV-Supabase-Projekt, falls etwas
schiefgeht.

Umfasst (Entwurf, im Detail erst bei Beginn dieser Phase zu planen — abhängig vom Ergebnis von
Phase 4):

1. Wartungsfenster mit dem Verein abstimmen (DSGVO-kritische Kinderdaten, keine
   Migration "im Vorbeigehen").
2. Finalen Datenabgleich unmittelbar vor Cutover (letzte Registrierungen seit Phase-4-Export
   nachziehen).
3. DNS/Env-Umschaltung: Frontend zeigt auf `backend_saas/` statt `backend/`.
4. **Rollback-Plan, bereits vor dem Cutover schriftlich fixiert und getestet:**
   - Alter `backend/`-Service bleibt für einen definierten Zeitraum nach Cutover unverändert
     lauffähig (nicht sofort abgeschaltet).
   - Env-/DNS-Umschaltung ist in beide Richtungen möglich (zurück auf `backend/` +
     KSV-Supabase-Projekt), ohne Code-Änderung.
   - Nach Cutover eingegangene Registrierungen im neuen System müssten im Rollback-Fall
     manuell nachgezogen werden — Verfahren dafür muss vor dem Cutover feststehen, nicht danach
     improvisiert werden.
5. Nachkontrolle (analog zum bestehenden 24h-Nachkontroll-Muster aus
   `jk-implementation-plan-after-yes.md` Phase 6).
6. Erst nach einer definierten Stabilitätsphase: altes `backend/` + KSV-Supabase-Projekt
   endgültig stilllegen (eigener, separat zu entscheidender Schritt, kein Bestandteil des
   Cutovers selbst).

**Exit-Kriterium:** KSV läuft nachweislich stabil im neuen System; der alte Stack bleibt bis zu
einer separaten Freigabe als Fallback bestehen.

**Freigabe-Voraussetzung:** Explizite, gesonderte Bestätigung des Nutzers — dies ist der einzige
Schritt in diesem gesamten Plan, der die KSV-Produktivumgebung tatsächlich verändert.

---

## Nicht-Ziele dieses Dokuments

Dieses Dokument legt die Reihenfolge fest, nicht die Detail-Implementierung jeder Phase. Jede
Phase bekommt bei Beginn ihr eigenes, detailliertes Ticket mit eigenem Datenmodell-Feinschliff,
eigenen Tests und eigener Freigabe — dieses Dokument ist die Landkarte, nicht die Anleitung.
