# Stripe Connect v1.1 – Release-Checkliste

## Modell
CampsPilot ist Plattform, Vereine sind direkte Stripe-Zahlungsempfänger (Direct Charges). Keine CampsPilot-Provision auf Campbuchungen. SaaS-Gebühren werden separat abgerechnet.

## Status
- Backend: Checkout Session, verbundener Account, signierte Connect-Webhooks für bezahlte / erstattete Zahlungen.
- Frontend: optionaler Zahlungsbutton nach erfolgreicher Elternanmeldung, bestehende Überweisung bleibt sichtbar.
- Schema: additive Migration `supabase/migrations/20261030203000_stripe_checkout_v11.sql`.
- Default: `STRIPE_CHECKOUT_ENABLED=false` und `online_payment_enabled=false`.
- Die API zum Verbinden einer bestehenden Connect-Account-ID ist derzeit **nur für den Plattforminhaber**. Ein selbstständiger Verein-Onboarding-Assistent (Stripe Account Links) ist noch nicht implementiert.

## Nachtrag 31.10.2026 – Review-Befunde behoben

- **B1:** Checkout-Session und PaymentIntent tragen `metadata.campspilot = "1"`. Webhook-Events ohne diese Markierung (eigene Zahlungen des Vereins auf demselben Konto) werden mit 200 `ignored` beantwortet, nie mit einem Fehler.
- **S1:** Kommt die Erstattung vor der Zahlung an, liest der Webhook den Erstattungsstand beim Verbuchen direkt bei Stripe (`PaymentIntent.latest_charge`) und bucht `refunded` statt `paid`.
- **S2/S3:** Falscher Betrag, Zahlung auf stornierte/kostenlose/schon bezahlte Anmeldung: 200 ohne Retry-Schleife, Eintrag im Audit-Log (`stripe.payment_needs_review`, Plattform-Konsole → Audit-Log). Nach Storno, „Kostenlos“ oder manuell „Bezahlt“ wird eine noch offene Checkout-Session geschlossen (best effort).
- **S4:** Stripe-Aufrufe mit 10 s Timeout und 1 Wiederholung; Stripe-Abfrage nie unter Zeilensperre; Webhook-Verarbeitung im Thread-Pool statt im Event-Loop.
- **S5:** Checkout-Endpunkt begrenzt (20/h je Anmeldung und je IP).
- **Plattform-Konsole:** Verein → „Online-Zahlung (Stripe)“ → Stripe-Konto verbinden (nur Plattform-Betreiber).

## Staging einrichten (Serkan, ca. 20 Minuten, nur Testmodus)

1. **Stripe-Dashboard im Testmodus:** Connect aktivieren (Plattform-Profil ausfüllen).
2. **Testkonto für den Verein:** Connect → Konten → Konto erstellen, Onboarding mit Stripe-Testdaten abschließen, `acct_…` kopieren.
3. **Webhook:** Entwickler → Webhooks → Endpunkt hinzufügen
   - URL: `https://campspilot-staging.onrender.com/api/v1/payments/stripe/webhook`
   - „Ereignisse auf verbundenen Konten“ auswählen
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`
   - Signing Secret `whsec_…` kopieren
4. **Render `campspilot-staging` → Environment:** `STRIPE_CHECKOUT_ENABLED=true`, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…`. `APP_ENV` bleibt `staging`.
5. **Staging-Supabase → SQL-Editor:** `supabase/migrations/20261030203000_stripe_checkout_v11.sql` ausführen (idempotent, schadet nicht, falls schon gelaufen).
6. **Staging-Plattform-Konsole** → Verein → „Stripe-Konto verbinden“ → `acct_…` eintragen.
7. **Test:** Elternanmeldung auf Staging → „Online bezahlen“ → Testkarte `4242 4242 4242 4242`, beliebiges Datum in der Zukunft, beliebige Prüfziffer → im Vereinsbereich steht die Anmeldung nach wenigen Sekunden auf „Bezahlt“. Danach im Stripe-Dashboard erstatten → Status „Erstattet“.

Production erst nach erfolgreichem Staging-Test und mit Live-Schlüsseln, eigenem Live-Webhook und `APP_ENV=production`.

## Zur Freigabe notwendige Schritte

1. **Stripe Connect einrichten.** In der Stripe-Plattform die Vereinskonten anmelden/verifizieren, `charges_enabled` prüfen. Nicht einfach irgendeine Stripe-Konto-ID verwenden.
2. **Staging testen.** Render-Staging mit `sk_test_...` sowie eigenem Connect-Webhook-Secret konfigurieren. Nur in Staging `STRIPE_CHECKOUT_ENABLED=true`; Test-Connect-Account verknüpfen. Der Webhook muss Connected-account-Events liefern (mit `event.account`).
3. **Testdurchlauf:** Test-Anmeldung → Checkout → mit Stripe Testkarte bezahlen → signierter Webhook setzt `payment_status=paid`. Gleichen Webhook erneut senden (idempotent). Falscher Betrag, falsches Konto, Warteliste, stornierte und bereits bezahlte Anmeldungen müssen sicher abgelehnt werden.
4. **Erstattungen und Zahlungsfehler:** Vollerstattung setzt `refunded`; Teil-Erstattungen und strittige Zahlungen benötigen eine separate fachliche Behandlung. Admin und Verein prüfen Zahlungsstatus gegen das echte Stripe-Dashboard.
5. **Datenschutz/Verträge:** Verantwortlichkeiten zwischen Plattform und Verein, Stripe-Vertragsbeziehung, Zahlungsgebühren, Rückerstattungen, Datenschutzhinweise und Connect-Vertragsbedingungen klären.
6. **Production separat:** Migration und Env-Variablen nur nach Review; signierte Live-Webhook-Destination anlegen; mit einem kontrollierten Echtgeld-Test pro Verein prüfen. `STRIPE_CHECKOUT_ENABLED` bleibt bis dahin `false`.

## Technische Leitplanken

- Checkout-Preis wird ausschließlich aus `camps.price_cents` gelesen; niemals vom Browser.
- Nur bestätigte, offene Registrierungen bezahlen, Warteliste nie.
- Die Return-URL bestätigt **keine** Zahlung; nur der Stripe-Webhook tut das.
- Keine personenbezogenen Kinder-, Eltern- oder Gesundheitsdaten in Stripe-Metadaten.
- Stripe-Schlüssel nur in Render, nicht in öffentlichen Next.js-Variablen.
- Vereine bleiben getrennt: Stripe-Event-Konto und gespeicherte Session müssen zum selben Mandanten gehören.
- Keine Produktionstests mit realen Kinderanmeldungen.
