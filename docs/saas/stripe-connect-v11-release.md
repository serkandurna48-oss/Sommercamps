# Stripe Connect v1.1 – Release-Checkliste

## Modell
> **Stand 06.11.2026:** Neues Modell siehe Abschnitt „Abrechnung B1/B2“ unten (Express + Destination Charges mit Plattformgebühr). Das folgende Direct-Charge-Modell gilt nur noch für bereits verbundene Standard-Konten.

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

## Abrechnung B1/B2: Express + Destination Charges (06.11.2026)

**Nur Testmodus**, bis Weys Tech UG gegründet ist.

- **Modell:** Verein hat ein Stripe-Connect-**Express**-Konto (`organizations.stripe_express_account_id`, getrennt vom Alt-Feld `stripe_account_id`). Checkout-Session auf der **Plattform** mit `payment_intent_data.on_behalf_of` = Verein, `transfer_data.destination` = Verein, `application_fee_amount` = Plattformgebühr (`app/fees.py::effective_fee`, Regel zum Buchungsdatum, auf den gezahlten Betrag). Stripe-Kosten trägt die Plattform.
- **Freigabe je Verein:** beide Wege brauchen `online_payment_enabled` (Plattform-Konsole → Verein → „Plattformgebühr“ → Freigeben/Sperren, `PATCH /admin/platform/organizations/{slug}/online-payment`). Die Plattform haftet bei Destination Charges für Rückbuchungen, darum zahlt kein Verein online ohne Freigabe; Status beim Verein: „Wartet auf Freigabe“. Vereine mit freigegebenem Altkonto sind schon freigegeben.
- **Reihenfolge:** aktives Express-Konto → Destination Charge; sonst aktives Alt-Standardkonto → Direct Charge wie bisher (ohne Gebühr); sonst keine Online-Zahlung.
- **Einrichtung durch den Verein:** Einstellungen → Zahlungen → „Online-Zahlung einrichten“ (`POST /admin/organizations/{slug}/payments/stripe/onboarding`, Account Link), „Status prüfen“ (`…/sync`); Status auch per `account.updated` am Connect-Webhook.
- **Bezahlt:** nur durch den Plattform-Webhook (`checkout.session.completed` / `async_payment_succeeded`), idempotent; speichert `stripe_payment_intent_id` und den Gebühren-Snapshot (`fee_*`, `fee_collection='application_fee'`).
- **Erstattung:** `POST /admin/organizations/{slug}/registrations/{token}/refund` (`request_id` Pflicht, optional `amount_cents`, sonst Restbetrag) → `Refund.create(amount, refund_application_fee=true, reverse_transfer=true)`. Der Plattform-Webhook (`charge.refunded`) liest Erstattung und zurückgegebene Application Fee bei Stripe nach und setzt `refunded_cents`, `fee_refunded_cents`, Status „Teilweise erstattet“ bzw. „Erstattet“. Manuelle Erstattung (Überweisung/bar): Gebühr gilt als nicht geschuldet.
- **Monatsdaten:** `GET /admin/platform/organizations/{slug}/fees?month=YYYY-MM` (nur Owner): je bezahlter Buchung Gebühr, erstattete Gebühr, Netto; Summen getrennt nach einbehalten (`application_fee`) und offen (`not_collected`). Monat = Bezahltag (Europe/Berlin).
- **Stichtag:** Gebührenregel gilt nach Buchungsdatum (`created_at`). Eine neue Regel mit `valid_from = heute` gilt nicht für schon angelegte, noch offene Buchungen. Für JK beim Umstellen `valid_from` auf den ältesten offenen Buchungstag setzen (oder 2000-01-01, wenn alle offenen JK-Buchungen 5 % kosten sollen). Vor der Migration bezahlte Buchungen haben keinen Snapshot und keine Gebühr (Entscheidung offen, Serkan).
- **Gebühren:** Plattform-Konsole → Verein → „Plattformgebühr“ (`/admin/platform/organizations/{slug}/fee-rules`, nur Owner). Bestehende Vereine: Backfill Starter 6,90 % ab 2000-01-01.

### Staging einrichten (Serkan, Testmodus)

1. Stripe-Dashboard (Testmodus) → Connect: Express-Konten aktivieren, Plattformprofil + Branding ausfüllen, Land DE.
2. **Plattform-Webhook** anlegen: URL `https://<staging-backend>/api/v1/payments/stripe/platform-webhook`, „Ereignisse auf **Ihrem Konto**“, Events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.refund.updated` → `whsec_…` = `STRIPE_PLATFORM_WEBHOOK_SECRET`.
3. **Connect-Webhook** (bestehend, `…/api/v1/payments/stripe/webhook`, „Ereignisse auf verbundenen Konten“) um `account.updated` ergänzen.
4. Render Staging: `STRIPE_CHECKOUT_ENABLED=true`, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, `FRONTEND_BASE_URL` = Staging-Frontend (Rücksprung aus Stripe).
5. Staging-DB: Migrationen `20261106140000_billing_profile_fee_rules.sql`, `20261106150000_stripe_express_destination.sql`, `20261106160000_billing_refunds_and_grants.sql`, `20261107100000_parent_invoices.sql`, `20261107110000_invoice_retry.sql` (vorher Backup; die erste und `20261107100000` ändern Daten per Backfill). Render installiert die neue Abhängigkeit `fpdf2` beim Build aus `requirements.txt`.
6. Plattform-Konsole: JK-Gebühr „Individuell 5 %“ (Stichtag siehe oben) und „Freigeben“.
7. Test: Vereinsadmin → Einstellungen → Zahlungen → einrichten (Stripe-Testdaten, Test-IBAN `DE89370400440532013000`) → zurück → „Aktiv“. Elternbuchung → Testkarte `4242 4242 4242 4242` → „Bezahlt“; im Stripe-Dashboard die Application Fee prüfen (z. B. 5 % bei JK). Erstattung per API → „Erstattet“, Gebühr anteilig zurück.

## Abrechnung B3: Elternrechnung (07.11.2026)

- **Wann:** automatisch einmal je bezahlter Buchung – nach Online-Zahlung (Plattform- und Connect-Webhook, Express und Altkonto) und wenn der Verein „bezahlt“ (bar/Überweisung) setzt. Kostenlose Buchungen bekommen keine Rechnung. Webhook-Wiederholungen erzeugen nichts Neues (eine Rechnung je Buchung, DB-Unique-Index).
- **Aussteller** ist der Verein (Rechnungsdaten aus Einstellungen, zum Ausstellungszeitpunkt eingefroren). Empfänger: Elternname + E-Mail (Adressen werden nicht erhoben). Leistung: Camp/Training, Zeitraum, Vor- und Nachname des Kindes – sonst keine Kinderdaten. Steuerblock je Status (netto/USt/brutto bei 19/7 %, § 19-Hinweis, Befreiungstext). Die Plattformgebühr erscheint nie.
- **Nummer:** `<Präfix><Jahr>-<0001>` je Verein und Kalenderjahr, lückenlos (Zähler in derselben Transaktion). Rechnungen sind unveränderlich (Trigger); Korrektur nur per **Stornorechnung** (negativ, eigene Nummer, Verweis auf das Original) bei Teil-/Vollerstattung und bei Storno einer bezahlten Buchung. Löschen bezahlter Buchungen gibt es nicht.
- **Versand:** PDF als Anhang über Brevo (`attachment`), `sent_at`/`send_error` je Rechnung; Fehler berühren die Buchung nicht, „Erneut senden“ im Admin. Außerhalb Production gilt weiter `NOTIFICATION_ALLOWED_RECIPIENTS`.
- **Ohne Rechnungsdaten:** keine Rechnung, Buchung „Rechnung ausstehend – Rechnungsdaten fehlen“; Hinweis in Einstellungen und Zahlungen, danach „Ausstehende Rechnungen erstellen“.
- **Buchungspreis:** `camp_registrations.booked_price_cents` (Trigger beim Anlegen, Backfill = bisheriger Preis). Gebühr, Rechnung und Camp-Checkout nutzen ihn; eine spätere Preisänderung trifft bestehende Buchungen nicht.
- **Gebührenrechnung (B4):** Erstattungen werden im Monat der Erstattung gebucht (`registration_refund_events`), nicht im Monat der Zahlung. `GET /admin/platform/organizations/{slug}/fees?month=` liefert dafür `refunds_in_month`.
- **Staging-Test:** Rechnungsdaten in Einstellungen speichern → Buchung „bezahlt“ setzen → Rechnung unter Zahlungen → PDF öffnen (Absender, Nummer, Steuerblock) → Mail an eine erlaubte Testadresse prüfen → Erstattung (Teilbetrag) im Buchungsdetail → Stornorechnung.
- **Wiederholung (Fix-Runde 1):** „ausstehend“ = bezahlt und keine Rechnung (per Abfrage, nicht per Markierung). Fehlschläge stehen an der Buchung (`invoice_pending_reason='error'`, `invoice_error` = nur Fehlertyp). Stripe-Wiederholungen des Zahlungs-Events und „Rechnungen erzeugen“ (Einstellungen/Zahlungen, max. 50 Buchungen je Klick) holen fehlende Rechnungen, Stornos und nicht zugestellte Mails nach. Der Mailversand wird vor dem Senden atomar beansprucht (keine Doppelmail).
- **Schrift:** Das PDF bettet DejaVu Sans ein (`backend_saas/app/fonts/`, Lizenz `LICENSE-DejaVu.txt`, frei weitergebbar) – Namen wie Ayşe, Łukasz, Çelik erscheinen korrekt.
- **Absender:** Mails kommen von der Plattformadresse (`NOTIFICATION_FROM_EMAIL`, SPF/DKIM der Plattformdomain), Anzeigename „<Verein> über CampsPilot“, Antworten gehen an die Rechnungs-E-Mail des Vereins.
- **Altbuchungen:** Der Backfill setzt `booked_price_cents` auf den *aktuellen* Camp-Preis (der Preis zum früheren Buchungszeitpunkt ist nirgends gespeichert); `updated_at` bleibt unverändert.

### Aufbewahrung und Datenschutz (zu entscheiden vor Produktivbetrieb)
- Rechnungen enthalten Elternname, E-Mail, Vor- und Nachname des Kindes und Camp/Training – keine Geburtsdaten, keine Gesundheitsdaten. Zweck: Rechnungsstellung des Vereins (Art. 6 Abs. 1 lit. b/c DSGVO). Verantwortlich ist der Verein, CampsPilot verarbeitet im Auftrag (AVV).
- Aufbewahrung: Rechnungen als Buchungsbelege derzeit 8 Jahre (§ 147 AO, § 14b UStG; Annahme, vom Steuerberater bestätigen lassen). Ein Löschwunsch der Eltern geht hier hinter die gesetzliche Aufbewahrungspflicht zurück (Art. 17 Abs. 3 lit. b DSGVO); danach löschen. Ein Löschlauf für abgelaufene Rechnungen fehlt noch (Retention-Runbook ergänzen).
- `invoices` hängt per `on delete cascade` am Verein: Wird ein Verein gelöscht, verschwinden seine Rechnungen. Vor dem Löschen eines Vereins dessen Rechnungen exportieren (PDFs) – Aufbewahrung liegt beim Verein.
- Datenschutzerklärung der Vereine/Plattform um „Rechnung per E-Mail mit PDF“ ergänzen.
