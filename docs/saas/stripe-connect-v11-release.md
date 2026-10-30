# Stripe Connect v1.1 – Release-Checkliste

## Modell
CampsPilot ist Plattform, Vereine sind direkte Stripe-Zahlungsempfänger (Direct Charges). Keine CampsPilot-Provision auf Campbuchungen. SaaS-Gebühren werden separat abgerechnet.

## Status
- Backend: Checkout Session, verbundener Account, signierte Connect-Webhooks für bezahlte / erstattete Zahlungen.
- Frontend: optionaler Zahlungsbutton nach erfolgreicher Elternanmeldung, bestehende Überweisung bleibt sichtbar.
- Schema: additive Migration `supabase/migrations/20261030203000_stripe_checkout_v11.sql`.
- Default: `STRIPE_CHECKOUT_ENABLED=false` und `online_payment_enabled=false`.
- Die API zum Verbinden einer bestehenden Connect-Account-ID ist derzeit **nur für den Plattforminhaber**. Ein selbstständiger Verein-Onboarding-Assistent (Stripe Account Links) ist noch nicht implementiert.

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
