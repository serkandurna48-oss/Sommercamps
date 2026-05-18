# TODO — Phase 1: Foundation Hardening

> **Ziel dieser Phase:** Alle bekannten Bugs fixen, alle KSV-spezifischen Strings in
> konfigurierbare Werte auslagern. **Keine** Multi-Tenant-Änderungen an DB oder Auth.
> KSV Baunatal läuft nach Phase 1 wie vorher — nur robuster und SaaS-bereit.
>
> **Regel:** Ein TODO = ein Commit. Kein Massenrefactoring.

---

## Kritische Bugs (zuerst!)

### T01 — Altersgrenze-Inkonsistenz beheben
**Priorität: Hoch | Dateien: `backend/main.py`, `frontend/app/components/RegistrationForm.tsx`, `backend/schema.sql`**

Problem: Drei widersprüchliche Grenzen.
- Frontend `validate()`: max. 12 Jahre (Zeile 107–113 in RegistrationForm.tsx)
- Landing Page: "5–12 Jahre" (page.tsx Zeile 100, 122, 233)
- DB-Schema `chk_birth_date_range`: max. 18 Jahre (schema.sql Zeile 24–27)

Entscheid nötig (bitte bestätigen bevor ich ändere):
- [ ] Soll das Camp für 5–12 Jahre sein (wie Landing Page sagt)?
- [ ] Oder 5–18 Jahre (wie DB erlaubt)?

Wenn 5–12: Frontend und DB-Constraint müssen alignt werden + Migration.
Wenn 5–18: Alle Texte in Frontend anpassen.

---

### T02 — Camp-Preis alignen (CAMP_PRICE_DISPLAY)
**Priorität: Hoch | Dateien: `frontend/app/page.tsx`, `backend/.env.example`**

Problem: `const CAMP_PRICE = '149 €'` (page.tsx:53, TODO-Kommentar) ist hardcoded
und unabhängig von `STRIPE_PRICE_CENTS`. Wenn der Preis auf Stripe geändert wird,
stimmt die Landing Page nicht mehr.

Lösung:
- Backend-Endpunkt `GET /config` (öffentlich) liefert `camp_price_display` aus Env-Var
- Frontend lädt den Preis beim SSR oder per ISR
- Alternativ (einfacher): `NEXT_PUBLIC_CAMP_PRICE_DISPLAY` als Frontend-Env-Var,
  aligned mit `STRIPE_PRICE_CENTS` dokumentieren

---

### T03 — CAMP_WEEKS DRY machen
**Priorität: Hoch | Dateien: `backend/main.py`, `frontend/app/components/RegistrationForm.tsx`, `frontend/app/page.tsx`**

Problem: Identische Camp-Wochen-Daten an 3 Stellen hardcodiert.
Änderung an einer Stelle → Bug an den anderen zwei.

Lösung:
- Backend: `GET /config` Endpunkt (öffentlich) liefert `allowed_camp_weeks[]`
- Frontend: Lädt die Liste einmalig und übergibt sie an Form + Termine-Section
- Verhindert, dass Frontend ungültige Wochen zeigt / akzeptiert

---

## Config-Externalisierung

### T04 — Vereinsname + Campjahr konfigurierbar machen
**Priorität: Mittel | Dateien: `backend/main.py`**

Problem: `"KSV Baunatal"`, `"Fußballschule"`, `"2026"` sind im E-Mail-Template,
im Stripe-Produktnamen und im FastAPI-App-Titel hardcodiert.

Neue Env-Vars einführen:
```
CLUB_NAME=KSV Baunatal
CLUB_SUBTITLE=Fußballschule
CAMP_YEAR=2026
```

Betrifft:
- `main.py:44` EMAIL_FROM_NAME default
- `main.py:192` FastAPI app title
- `main.py:335-336` E-Mail HTML Header
- `main.py:346,348` E-Mail HTML Body
- `main.py:440` E-Mail HTML Footer "© 2026"
- `main.py:487` E-Mail Text Footer
- `main.py:518` E-Mail Betreff
- `main.py:949` Stripe Produkt-Name

---

### T05 — JERSEY_SIZES DRY machen
**Priorität: Niedrig | Dateien: `backend/main.py`, `frontend/app/components/RegistrationForm.tsx`**

Problem: Trikotnummern-Liste an 2 Stellen dupliziert (main.py:69 und RegistrationForm.tsx:31).

Lösung: Im `GET /config` Endpunkt (aus T03) auch `allowed_jersey_sizes[]` mitliefern.

---

### T06 — render.yaml korrigieren
**Priorität: Niedrig | Dateien: `backend/render.yaml`**

Problem: `render.yaml:14` listet `ADMIN_API_KEY` — im Code wird aber `ADMIN_PASSWORD` verwendet.
Dieses Mismatch könnte beim nächsten Render-Deployment zu Verwirrung führen.

Fix: `ADMIN_API_KEY` → `ADMIN_PASSWORD` in render.yaml, alle fehlenden Vars ergänzen.

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

### T11 — DEPLOYMENT.md auf aktuellen Stand bringen
**Priorität: Niedrig | Dateien: `DEPLOYMENT.md`**

- Stripe-Env-Vars fehlen in der Env-Var-Tabelle (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_CENTS`, `FRONTEND_URL`)
- Stripe-Onboarding-Schritte fehlen
- `render.yaml` Diskrepanz (ADMIN_API_KEY) dokumentieren

---

### T12 — API-Endpunkt GET /config implementieren
**Priorität: Hoch | Dateien: `backend/main.py`**

Öffentlicher Endpunkt, der alle dynamischen Frontend-Konfigurationen liefert.
Löst T03 (CAMP_WEEKS), T05 (JERSEY_SIZES) und T02 (Preis) auf einmal.

```
GET /config
Response:
{
  "club_name": "KSV Baunatal",
  "club_subtitle": "Fußballschule",
  "camp_year": 2026,
  "camp_price_display": "149 €",
  "allowed_camp_weeks": ["29.06.–02.07.2026", ...],
  "allowed_jersey_sizes": ["6XS–5XS (104–116)", ...]
}
```

**Abhängigkeiten:** T04 (Env-Vars einführen) muss vorher erledigt sein.
**Danach:** T03, T05, T02 können auf diesen Endpunkt umgestellt werden.

---

## Empfohlene Reihenfolge

```
T01 (Bug: Alter)       ← Entscheid nötig, erst nach Rücksprache
T12 (GET /config)      ← Enabler für T02, T03, T05
T03 (CAMP_WEEKS DRY)   ← Nach T12
T02 (Preis alignen)    ← Nach T12
T04 (Club-Config)      ← Unabhängig, kann parallel zu T03
T06 (render.yaml)      ← Klein, unabhängig
T05 (JERSEY_SIZES DRY) ← Nach T12
T07 (Kontaktdaten)     ← Unabhängig
T09 (Tests)            ← Kontinuierlich, parallel zu allem
T08 (Daten prüfen)     ← Zeitkritisch, vor nächster Camp-Saison
T10 (Migration Docs)   ← Kleinstes Todo
T11 (DEPLOYMENT.md)    ← Vor nächstem Deployment-Zyklus
```
