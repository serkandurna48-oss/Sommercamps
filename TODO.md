# TODO — Phase 1: Foundation Hardening

> **Ziel dieser Phase:** Alle bekannten Bugs fixen, alle KSV-spezifischen Strings in
> konfigurierbare Werte auslagern. **Keine** Multi-Tenant-Änderungen an DB oder Auth.
> KSV Baunatal läuft nach Phase 1 wie vorher — nur robuster und SaaS-bereit.
>
> **Regel:** Ein TODO = ein Commit. Kein Massenrefactoring.

---

## Kritische Bugs (zuerst!)

### T01 — Altersgrenze-Inkonsistenz beheben ✅ ERLEDIGT (siehe `docs/archive/session-notes-phase1-2026-05-19.md`)

Entschieden: 5–12 Jahre. Umgesetzt und production-verifiziert (2026-05-19): DB-Constraint
`chk_birth_date_plausible` ersetzt `chk_birth_date_range`, Backend validiert über
`camp_config.py` (`CAMP_AGE_MIN`/`CAMP_AGE_MAX`, `validate_age_at_camp_start()`) gegen den
Camp-Startdatum, Frontend über `campConfig.ts` (`isAgeValidAtCampStart()`, schaltjahressicher
via `date-fns`). Alle drei Seiten sind seitdem konsistent bei 5–12 Jahren.

---

### T02 — Camp-Preis alignen (CAMP_PRICE_DISPLAY) ✅ ERLEDIGT (siehe `docs/archive/session-notes-phase1-2026-05-19.md`)

`GET /config` liefert `price_cents` aus `STRIPE_PRICE_CENTS`, Frontend zeigt den Preis darüber
an statt über eine hartkodierte Konstante. Production-verifiziert (2026-05-19).

---

### T03 — CAMP_WEEKS DRY machen ⚠️ TEILWEISE ERLEDIGT

Validierungsseitig gelöst: Camp-Wochen leben zentral in `backend/camp_config.py`
(`CAMP_WEEKS`) und werden über `GET /config` (`weeks[]`) ans Frontend geliefert
(`campConfig.ts` → `fetchCampConfig()`), genutzt für Preis/Altersvalidierung in `page.tsx`.

**Weiterhin offen:** `frontend/app/lib/clubConfig.tsx` (`DEFAULT_CAMPS`) pflegt dieselben
Datums-Strings (Label, Anzeige-Datum, Tag) für die Landingpage-Darstellung noch einmal
separat und manuell synchron zum Backend — kein Fetch, reines Literal. Ändert sich ein
Camp-Termin nur in `camp_config.py`, driftet die Anzeige in `clubConfig.tsx` unbemerkt
auseinander. Verbleibende Arbeit: `DEFAULT_CAMPS`-Anzeige ebenfalls aus `GET /config`
speisen oder zumindest einen Konsistenz-Test zwischen beiden Quellen ergänzen.

---

## Config-Externalisierung

### T04 — Vereinsname + Campjahr konfigurierbar machen ✅ ERLEDIGT

`CLUB_NAME`, `CLUB_SUBTITLE`, `CAMP_YEAR` (und `CLUB_LEGAL_NAME`) sind als Env-Vars mit
KSV-Defaults in `backend/main.py` eingeführt und werden im FastAPI-App-Titel, E-Mail-Template
(Header, Body, Footer, Betreff) und Stripe-Produktnamen verwendet. Seit JK-102 laufen KSV und
JK zusätzlich auf getrennten Backend-Instanzen mit jeweils eigenem Wertesatz dieser Env-Vars —
siehe `docs/architecture/system-overview.md`.

---

### T05 — JERSEY_SIZES DRY machen
**Priorität: Niedrig | Dateien: `backend/main.py`, `frontend/app/components/RegistrationForm.tsx`**

Problem: Trikotnummern-Liste an 2 Stellen dupliziert (main.py:69 und RegistrationForm.tsx:31).

Lösung: Im `GET /config` Endpunkt (aus T03) auch `allowed_jersey_sizes[]` mitliefern.

---

### T06 — render.yaml korrigieren ✅ ERLEDIGT (Commit `3413173`)

`render.yaml` nutzt jetzt korrekt `ADMIN_PASSWORD` statt `ADMIN_API_KEY`. Vollständige
Env-Var-Referenz (inkl. der in `render.yaml` weiterhin fehlenden Vars wie `STRIPE_SECRET_KEY`,
`BREVO_API_KEY`, `BANK_*`, etc.) lebt jetzt in `DEPLOYMENT.md` (siehe CP-S206).

---

### T07 — Kontaktdaten aus Frontend externalisieren
**Priorität: Mittel | Dateien: `frontend/app/page.tsx`, `frontend/app/admin/page.tsx`**

Problem: Name/E-Mail/Telefon von Ergün Ünal an 5 Stellen im Frontend hardcodiert.
Admin-Panel-Titel "KSV Baunatal – Anmeldungen" hardcodiert (admin/page.tsx:284,331).

Für Phase 1 (Single-Tenant): Zentrales Config-Objekt in `frontend/app/lib/config.ts`
für Kontaktdaten, damit Änderung an einer Stelle wirkt.

Für Phase 2: kommt aus der Tenant-DB.

---

### T08 — Camp-Wochen-Daten 2026 überprüfen
**Priorität: Mittel (zeitkritisch!) | Dateien: `backend/main.py`, `frontend/app/page.tsx`**

Die drei hardcodierten Termine (`29.06.–02.07.2026`, `03.08.–06.08.2026`, `05.10.–08.10.2026`)
müssen für 2026 korrekt sein. Nach T03 (Externalisierung) sind sie einfacher änderbar.

---

## Tests & Qualität

### T09 — Mindest-Testabdeckung Backend
**Priorität: Mittel | Dateien: `backend/test_db.py` + neue Testdateien**

Aktuell: Nur `test_db.py` (DB-Verbindungstest). Keine Tests für Endpunkte.

Neue Tests benötigt (pytest + httpx TestClient):
- `POST /registrations` — Happy Path, Validierungsfehler, Duplikat-E-Mail
- `POST /admin/login` — Richtiges / falsches Passwort
- `GET /registrations` — Mit/ohne Token, abgelaufener Token
- `PATCH /admin/registrations/{id}/payment-status` — Statusübergänge
- `POST /stripe/webhook` — Valide/invalide Signatur, checkout.session.completed

---

### T10 — migration_phase3.sql aufräumen
**Priorität: Niedrig | Dateien: `backend/migration_phase3.sql`**

`migration_phase3.sql` ist eine Teilkopie von `migration_phase1.sql` — beide fügen
`stripe_session_id` hinzu. Durch `IF NOT EXISTS` kein Produktionsproblem, aber verwirrend.

Fix: `migration_phase3.sql` mit einem Kommentar versehen, der erklärt, dass Phase 1
bereits alles enthält und diese Migration nur als Sicherheitsnetz für DBs existiert,
die vor Phase 1 angelegt wurden.

---

## Dokumentation

### T11 — DEPLOYMENT.md auf aktuellen Stand bringen ✅ TEILWEISE ERLEDIGT (CP-S206)

- ✅ Stripe/Brevo/Bank/Kontakt-Env-Vars sind jetzt vollständig in der Env-Var-Tabelle
  dokumentiert (siehe `DEPLOYMENT.md`)
- ✅ `render.yaml` ADMIN_API_KEY-Diskrepanz war bereits behoben (Commit `3413173`), jetzt auch
  in CLAUDE.md/TODO.md korrigiert
- [ ] Offen: Stripe-Onboarding-Schritte (Connect, falls Phase 5) fehlen weiterhin — bleibt
  Phase-5-Thema

---

### T12 — API-Endpunkt GET /config implementieren ✅ ERLEDIGT

`GET /config` existiert (`backend/main.py`, `ConfigResponse`) und liefert `club_name`,
`club_subtitle`, `camp_year`, Preis (`price_cents`) und `weeks[]` (Label + Start-/Enddatum).
**Noch nicht enthalten:** `allowed_jersey_sizes` — siehe T05, weiterhin offen.

---

## Production-Readiness Backlog (aus CP-S206)

> Im Rahmen des Backup/Logging/Cost-Checks (CP-S206) identifiziert. Bewusst nicht sofort
> behoben, da jeweils mehrere Call-Sites oder ein Design-Entscheid betroffen sind.

### T13 — Rohe Exception-Details in Admin-Endpunkten maskieren
**Priorität: Mittel | Dateien: `backend/main.py` (~9 Stellen: u.a. Zeilen um 903, 908, 941,
983, 1024, 1050, 1098, 1160, 1215)**

Mehrere Admin-Endpunkte geben `detail=f"...{exc}"` direkt in der HTTP-Response zurück
(psycopg2-Fehlertext kann DB-Struktur/Constraint-Namen preisgeben). Alle Stellen sind
JWT-geschützt, daher niedrigere Dringlichkeit als der öffentliche `/health`-Fall (bereits in
CP-S206 gefixt). Fix: Exception serverseitig loggen, generische deutsche Fehlermeldung an
Client zurückgeben.

---

### T14 — registration_token in URL/Access-Log
**Priorität: Mittel | Dateien: `backend/main.py` (`POST /registrations/{registration_token}/checkout-session`), `backend/render.yaml`**

Der öffentliche Identifier `registration_token` steht im URL-Pfad und landet dadurch in
uvicorns Standard-Access-Log (Method+Path pro Request) — faktisch ein Secret-Leak in Logs.
Fix erfordert entweder Routing-Änderung (Token in Body/Header statt URL) oder Access-Log-Format
anpassen. Beides bewusst nicht in CP-S206 angefasst (Routing-Design-Entscheidung).

---

### T15 — Logging-Konfiguration (Log-Level, Handler)
**Priorität: Niedrig | Dateien: `backend/main.py`**

Kein `logging.basicConfig()`/Level-Config vorhanden — `logger.info()`-Aufrufe können je nach
Uvicorn-Start-Konfiguration verloren gehen. Zwei verbliebene `print()`-Aufrufe (Webhook-Fehler)
umgehen Logging komplett. Fix: zentrale Logging-Konfiguration einführen (Level per Env-Var),
`print()` durch `logger` ersetzen. Bewusst nicht in CP-S206 angefasst, da dies das
Produktions-Log-Verhalten insgesamt ändert und eine eigene Verifikation verdient.

---

### T16 — Backup-vor-Migration als Konvention etablieren
**Priorität: Niedrig | Dateien: `backend/migration_*.sql`**

`migration_fix_age_constraint.sql` enthält vorbildlich einen Kommentar-Block
("Vor Anwendung: Supabase-Snapshot nehmen"). Andere Migrationen (z. B.
`migration_jersey_sizes.sql`, die per `UPDATE` nicht-passende Werte auf `NULL` setzt) haben
keinen solchen Hinweis. Fix: Standard-Kommentarblock für alle zukünftigen `migration_*.sql`
verbindlich machen (siehe `DEPLOYMENT.md` → Backup & Restore).

---

## Hardcoded-Schulden (für Phase 2)

Strings, die in Phase 1 neu eingeführt wurden und noch durch Tenant-Config ersetzt
werden müssen. Jede Stelle ist im Code mit `// TODO(multi-tenant): ...` markiert.

- [ ] `frontend/app/page.tsx`: hardcoded mailto `info@ksv-baunatal.de` in
  `ConfigUnavailableNotice` → ersetzen durch `organization.contact_email`
- [ ] `backend/.env.example`: `BANK_ACCOUNT_HOLDER`, `BANK_IBAN`, `BANK_BIC`, `BANK_NAME`
  sind nicht dokumentiert. Production-Werte existieren nur im Render-Dashboard.
  Drift-Risiko bei Neu-Deploys. → Phase 1 Cleanup oder spätestens Phase 2 mit
  `organization.bank_*`

---

## Empfohlene Reihenfolge

```
T01 (Bug: Alter)       ← ✅ erledigt
T12 (GET /config)      ← ✅ erledigt
T02 (Preis alignen)    ← ✅ erledigt
T04 (Club-Config)      ← ✅ erledigt
T06 (render.yaml)      ← ✅ erledigt
T03 (CAMP_WEEKS DRY)   ← ⚠️ teilweise erledigt (Anzeige-Duplikat in clubConfig.tsx offen)
T05 (JERSEY_SIZES DRY) ← Noch offen, Enabler (T12) existiert bereits
T07 (Kontaktdaten)     ← Unabhängig, weiterhin offen
T09 (Tests)            ← Kontinuierlich, parallel zu allem
T08 (Daten prüfen)     ← Zeitkritisch, vor nächster Camp-Saison
T10 (Migration Docs)   ← Kleinstes Todo
T11 (DEPLOYMENT.md)    ← Vor nächstem Deployment-Zyklus
```
