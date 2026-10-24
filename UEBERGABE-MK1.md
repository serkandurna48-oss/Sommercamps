# UEBERGABE-MK1

Branch: feat/mk1-pilotanfrage
STATUS: fertig zur Prüfung
COMMIT: ae9c06b55dd0edcea52b5054b0bd74eb6b44305e

---

## TESTS

**Backend** (`python -m pytest backend_saas/tests/test_mk1_pilot_request.py -v`):
```
10 passed in 0.77s
```

Abgedeckte Fälle:
- `test_success_sends_mail` – 200, Empfänger/Betreff/Reply-To korrekt
- `test_success_optional_fields` – Telefon + Nachricht im Mail-Body
- `test_422_missing_verein` – fehlendes Pflichtfeld
- `test_422_invalid_email` – ungültige E-Mail
- `test_422_verein_too_short` – verein < 2 Zeichen
- `test_honeypot_no_mail` – website befüllt → 204, keine Mail
- `test_rate_limit_fourth_request` – 4. Anfrage → 429
- `test_missing_platform_contact_email` – nicht gesetzt → 503 `pilot_request_unavailable`
- `test_mail_failure_returns_503` – Brevo-Fehler → 503 `pilot_request_unavailable`
- `test_log_no_email_address` – E-Mail-Adresse in keinem Log-Eintrag

**Gesamtlauf Backend** (`python -m pytest backend_saas/tests/ -q`):
```
657 passed, 1 warning in 29.92s
```

**Frontend** (`npx vitest run --root frontend …/PilotRequestForm.test.tsx`):
```
9 passed
```

Abgedeckte Fälle:
- `prf1` – Pflichtfehler Verein: kein Fetch-Aufruf
- `prf2` – Pflichtfehler E-Mail: kein Fetch-Aufruf
- `prf3` – Erfolg (200) ersetzt das Formular
- `prf3b` – Erfolg (204) ersetzt das Formular
- `prf4` – 429 zeigt Hinweistext mit „Stunde", Formular bleibt
- `prf5` – 503 zeigt mailto-Link
- `prf6` – Netzwerkfehler zeigt mailto-Link
- `prf7` – „Dies ist ein Seitenentwurf" im Idle-Zustand nicht vorhanden
- `prf7b` – „Dies ist ein Seitenentwurf" im Erfolgszustand nicht vorhanden

**Vorhandene Frontend-Fehler (pre-existierend, nicht durch diesen Auftrag verursacht):**
4 Tests schlagen wegen fehlender CSS-Dateien fehl (`focus.css`, `tokens.css`, `publicTheme.css`)
und einem Glob-Zählproblem in `adminConsistency.test.ts`. Diese existierten vor dem Auftrag.

---

## MUTATIONSPROBE

Honeypot-Prüfung in `pilot_request.py` auskommentiert → `test_honeypot_no_mail` wurde rot
(erwartet 204, erhielt 200). Zurückgesetzt. Beleg in diesem Lauf dokumentiert.

---

## ÄNDERUNGEN

**Backend:**
- `backend_saas/app/config.py` – `platform_contact_email: Optional[str]` als dokumentiertes Settings-Feld hinzugefügt
- `backend_saas/app/routers/pilot_request.py` (neu) – `POST /public/pilot-request`, unauthentifiziert, Honeypot, Rate-Limit, Mail-Versand
- `backend_saas/app/routers/__init__.py` – `pilot_request_router` exportiert
- `backend_saas/app/main.py` – `pilot_request_router` eingebunden
- `backend_saas/tests/test_mk1_pilot_request.py` (neu) – 10 Tests

**Frontend:**
- `frontend/app/(marketing)/campspilot/PilotRequestForm.tsx` (neu) – Client-Komponente mit Feldern, Zuständen, Honeypot
- `frontend/app/(marketing)/campspilot/page.tsx` – Import von `PilotRequestForm`, alten `<form>`-Block ersetzt
- `frontend/app/components/marketing/SiteMotion.tsx` – Entwurfssatz-Handler (`onSubmit`) entfernt
- `frontend/app/(marketing)/campspilot/marketing.css` – Variablen `--ok`/`--err` im Token-Block; neue Klassen `.prf-*`
- `frontend/app/(marketing)/campspilot/PilotRequestForm.test.tsx` (neu) – 9 Tests

---

## NEUE_UMGEBUNGSVARIABLEN

| Variable | Ort | Beschreibung |
|---|---|---|
| `PLATFORM_CONTACT_EMAIL` | Render-Service `campspilot-saas-backend` | Empfängeradresse für Pilotanfragen. Pflichtfeld für funktionierenden Betrieb; ohne Wert liefert der Endpunkt 503. |

---

## NICHT_AUSGEFÜHRT

- Push/Deploy auf Render – gemäß Übergaberegelung wartet Serkan selbst
- `.env.example` in `backend_saas/` um `PLATFORM_CONTACT_EMAIL` ergänzt – Scope nicht explizit gefordert, im PR-Merge zu ergänzen
- Die 4 pre-existierenden Frontend-Test-Fehler (`focus.css`, `tokens.css`, `publicTheme.css`, adminConsistency) wurden nicht behoben – außerhalb dieses Auftrags

---

## GESCHMACK-ABGLEICH

Aus `GESCHMACK.md` geprüft:
- Keine neuen Farben außerhalb Token-Block: `--ok` und `--err` sind in `.cp-scope {}` eingefügt ✓
- Kontrast ≥ 4,5:1: `#4fca7a` → 9,6:1, `#e06060` → 5,8:1 auf `--night: #0a1013` ✓
- Formularbreite wie bisher: `max-width: 620px` unverändert ✓
- Keine neuen Abhängigkeiten ✓
- Telefon und Nachricht ergänzen das Formular ohne Layout-Bruch (flex-wrap, `prf-full` für Textarea) ✓
- Keine festen Farben, keine Strings im Code statt Config ✓
