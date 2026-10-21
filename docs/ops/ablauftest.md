# Ablauftest UC4b

Automatisierter End-to-End-Test des Hauptablaufs vor dem Go-live mit KSV und JK.
Kein echter Browser, keine echten E-Mails, kein Stripe — ausschließlich lokale
Infrastruktur.

## Was abgedeckt ist

### Backend (`backend_saas/tests/test_journey_end_to_end.py`)

Gegen eine wegwerfbare lokale PostgreSQL-Datenbank (REVIEW_POSTGRES_PORT).
Synthetische Supabase-Auth-Identitäten, FakeProvider für Mail.

| Schritt | Assertion |
|---|---|
| Verein + Camp (Kapazität 2) anlegen, veröffentlichen | HTTP 201, Camp status=published |
| `billing_notes` nicht in Vereins-Admin-Antwort (Org-Admin-Rolle) | Schlüssel fehlt im JSON |
| Kind 1 anmelden | status=registered, payment_reference=CP-{token[:8]} |
| Bestätigungsmail | FakeProvider hat Mail, kein Kind-/Elternname im Betreff |
| Kind 2 anmelden | status=registered (Camp jetzt voll) |
| Kind 3 anmelden | status=waitlist, Wartelistenmail im FakeProvider |
| Admin: Kind 1 als bezahlt markieren | payment_status=paid in Anmeldungsliste |
| Admin: Kind 2 stornieren | cancelled.status=cancelled, promoted.registration_token=tok3 |
| Kind 3 rückt nach | status=registered in Anmeldungsliste nach Stornierung |
| Kein automatischer Mail-Versand beim Nachrücken | FakeProvider-Zähler bleibt gleich |
| Tagesliste (export.xlsx?view=daylist) | enthält Kind 1 + Kind 3, nicht Kind 2 |
| Doppelte Anmeldung desselben Kindes | HTTP 409 |
| Fremder Vereins-Admin | HTTP 403 auf Registrierungsliste |
| `billing_notes` nicht in öffentlicher API | Schlüssel fehlt in GET /api/v1/.../org |

### Frontend (`frontend/app/pilot/[org]/journey-end-to-end.test.tsx`)

Vitest + jsdom, gemockte API (kein echter Server).

| Schritt | Assertion |
|---|---|
| Formular ausfüllen + absenden | onSubmitted erhält RegistrationCreated mit CP-Referenz |
| DoneScreen mit IBAN | Überweisungsblock (IBAN, Verwendungszweck CP-XXXXXXXX) sichtbar |
| DoneScreen ohne IBAN | "Der Verein meldet sich zur Zahlung", kein IBAN-Block |
| Admin PaymentSection: offene Anmeldung sichtbar | .cp-ledger-row mit CP-Referenz und Kind-Name |
| "Als bezahlt markieren" | setPaymentStatusAction aufgerufen, Quittung erscheint |

## Was NICHT abgedeckt ist

- **Echte E-Mails:** FakeProvider akkumuliert Nachrichten, sendet nichts an Brevo.
- **Echter Browser:** Kein Playwright/Selenium — kein Screenshot, kein Klick in Chromium.
- **Stripe-Zahlungsfluss:** Weder Checkout-Session noch Webhook-Verarbeitung.
- **Supabase Auth:** Identitäten werden als Fake-Token monkeygepatcht, nie verifiziert.
- **Wartelisten-Promotion per Admin-Button:** Die Route
  `POST .../waitlist/promote` ist in `test_admin_registrations_api.py` abgedeckt,
  nicht im Ablauftest (dort löst Stornierung das Nachrücken aus).
- **Mehrere Organisationen parallel:** Jeder Testlauf verwendet eine isolierte
  Wegwerf-DB; Shared-Tenant-Isolation wird in `test_tenant_access_boundaries.py`
  abgedeckt.

## Voraussetzungen

```bash
# Backend-Ablauftest (lokale Postgres-Instanz erforderlich)
REVIEW_POSTGRES_PORT=55443 python -m pytest backend_saas/tests/test_journey_end_to_end.py -v

# Ohne REVIEW_POSTGRES_PORT: Test wird übersprungen (0 failed, 1 skipped)
python -m pytest backend_saas/tests/test_journey_end_to_end.py -v

# Frontend-Ablauftest (kein externer Dienst nötig)
npm run test --prefix frontend -- --run journey-end-to-end
```

Vollständiger Check (CI-äquivalent):
```bash
python -m pytest backend_saas/tests -q
npm run test --prefix frontend
npm run lint --prefix frontend
npx tsc --noEmit -p frontend
```
