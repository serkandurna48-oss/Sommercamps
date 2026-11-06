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

## Online-Zahlung mit Stripe Managed Risk (07.11.2026)

Ersetzt B2 (Destination Charges) für alle neuen Vereinskonten. Grund: Stripe lehnt im Sandbox-Konto
v1-Konten mit der Plattform als Verlustträger ab („Use Accounts v2 and set `losses_collector` to
`stripe`“). Managed Risk verlangt Direct Charges.

- **Konto:** `POST /v2/core/accounts` (stripe-python `StripeClient.v2.core.accounts.create`):
  `dashboard="full"` (kein Preview-API nötig), `identity.country="de"`, `identity.entity_type` =
  `non_profit` (e. V.) bzw. `company`, `defaults.currency="eur"`, `defaults.locales=["de-DE"]`,
  `defaults.responsibilities.fees_collector="stripe"`, `losses_collector="stripe"`,
  `configuration.merchant.capabilities.card_payments.requested=true`, `contact_email` =
  Rechnungs-E-Mail, sonst Kontakt-E-Mail des Vereins, `display_name` = Vereinsname,
  `metadata={campspilot:"1", organization_id}`, Idempotenz-Key `campspilot-acct-v2-<org_id>`.
  Gespeichert in `organizations.stripe_express_account_id` mit `stripe_express_account_kind='direct_fee'`.
- **Onboarding:** `POST /v2/core/account_links` mit `use_case.type="account_onboarding"`,
  `refresh_url`/`return_url` wie bisher (`/pilot/<slug>/konfiguration?stripe=refresh|return#zahlungen`).
  Der Link zeigt auf `https://accounts.stripe.com/…` (v1-Links: `connect.stripe.com`, beides erlaubt).
  Bestehende B2-Konten bekommen weiter den v1-Account-Link.
- **Status:** „Status prüfen“ liest `GET /v1/accounts/<id>` (laut Stripe für v2-Konten erlaubt, Antwort im
  v1-Format: `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements`). Dasselbe Format
  kommt per `account.updated` am Connect-Webhook (Stripe schickt für v2-Konten auch v1-Snapshot-Events,
  Bereich „verbundene Konten“). Zustände wie bisher: nicht eingerichtet / Angaben fehlen / wartet auf
  Freigabe / aktiv. Ohne Owner-Freigabe (`online_payment_enabled`) keine Online-Zahlung.
- **Checkout (Camps und Trainings):** `checkout.Session.create(..., stripe_account=<Vereinskonto>)`,
  `payment_intent_data={metadata, application_fee_amount}` (Gebühr aus `effective_fee` zum Buchungstag,
  bei 0 weggelassen), kein `on_behalf_of`, kein `transfer_data`. Session-Metadaten zusätzlich
  `charge_type="direct_fee"`. Idempotenz-Key `campspilot-dfee-<token>-<prev|first>-<betrag>-<gebühr>-<acct>`.
  Buchung: `stripe_charge_type='direct_fee'`, Gebühren-Quote in `stripe_checkout_fee`.
- **Geldfluss:** Der Verein ist Verkäufer, das Geld landet auf seinem Stripe-Konto abzüglich
  Stripe-Gebühren (zahlt der Verein, `fees_collector=stripe`) und Plattformgebühr (Application Fee an die
  Plattform). Stripe trägt Ausfälle (Managed Risk). Rechnung an Eltern weiter im Namen des Vereins.
- **Bezahlt:** Connect-Webhook `checkout.session.completed` / `async_payment_succeeded`, idempotent; liest
  den PaymentIntent auf dem Vereinskonto (nur `expand latest_charge`), schreibt Snapshot
  (`fee_collection='application_fee'`, exakt die Quote aus dem Checkout) und stößt die Rechnung an.
  Die Application Fee wird nur gelesen, wenn schon etwas erstattet wurde; scheitert das, wird trotzdem
  „bezahlt“ gebucht und die Gebührenerstattung mit dem nächsten Erstattungs-Event nachgetragen.
  Weicht `charge.application_fee_amount` von der Quote ab: gebucht, Audit `stripe.payment_needs_review`
  mit Grund `fee_mismatch`.
- **Gebühr < Betrag:** Stripe verlangt `application_fee_amount` kleiner als den Betrag. Eine Regel, die den
  Betrag erreicht (extreme Mindestgebühr), wird auf Betrag − 1 Cent begrenzt (Log-Warnung); Snapshot = begrenzter Wert.
- **Idempotenz Kontoerstellung:** `campspilot-acct-v2-<org_id>-<sha256(Parameter)[:12]>`: Doppelklick = gleiches
  Konto, korrigierte Angaben (Rechtsform, E-Mail) = neuer Versuch statt `idempotency_error`. Ein verwaistes
  Stripe-Konto aus dem ersten Versuch ist möglich und harmlos.
- **Fehler bei der Einrichtung:** jede 4xx-Antwort von Stripe (außer 429), auch typisierte v2-Fehler wie
  `feature_not_enabled`, erscheint als 409 mit Stripes Grund; Netzwerk und 429 als 503.
- **Erstattung:** `POST /admin/organizations/{slug}/registrations/{token}/refund` →
  `Refund.create(payment_intent, amount, refund_application_fee=true, stripe_account=<Vereinskonto>,
  idempotency_key)`, kein `reverse_transfer`. Gebucht wird per Connect-Webhook `charge.refunded` bzw.
  `charge.refund.updated`: erstatteter Betrag und zurückgegebene Application Fee werden bei Stripe gelesen
  (Fee-Objekt liegt auf dem Plattformkonto: `ApplicationFee.retrieve` ohne Stripe-Account-Header).
  Fehlt die Application Fee noch (wird bei Direct Charges asynchron angelegt),
  antwortet der Webhook 503 und Stripe wiederholt.
- **Bestehende Wege:** Altkonten (Standard, Direct Charge ohne Gebühr) unverändert. B2-Konten
  (`stripe_express_account_kind='destination'` bzw. NULL vor der Migration) laufen weiter über den
  Plattform-Webhook und brauchen `STRIPE_PLATFORM_WEBHOOK_SECRET`; es werden keine neuen angelegt.
- **Bekannte Lücke:** Rückbuchungen (`charge.dispute.*`) werden nicht ausgewertet; die Buchung bleibt
  „bezahlt“, der Verein sieht den Streitfall im eigenen Stripe-Dashboard.
- **Migration:** `supabase/migrations/20261107140000_stripe_managed_risk.sql` (Kontoart-Spalte, Backfill
  `destination` für vorhandene Express-Konten, `stripe_charge_type` erlaubt `direct_fee`, kein
  Spaltenrecht für anon/authenticated). Vorher Backup. Prod: im Bündel `supabase/golive/PROD-MIGRATION-2026-11.sql`
  als [15/15]; Staging: `supabase/golive/STAGING-MIGRATION-managed-risk.sql`.

### Webhooks

| Endpunkt | Stripe-Einstellung | Events | Secret |
|---|---|---|---|
| `/api/v1/payments/stripe/webhook` | Ereignisse auf **verbundenen Konten** | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.refund.updated`, `account.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` (Pflicht) |
| `/api/v1/payments/stripe/platform-webhook` | Ereignisse auf **Ihrem Konto** | wie B2 | `STRIPE_PLATFORM_WEBHOOK_SECRET`, nur für B2-Konten |

v2-Thin-Events (`v2.core.account[...]`) werden nicht gebraucht: Stripe schickt für v2-Konten zusätzlich
v1-`account.updated` im Bereich „verbundene Konten“. Thin-Events liegen laut Stripe im Bereich „Ihr Konto“
und bräuchten einen eigenen Endpunkt mit anderem Format.

### Stripe einrichten (Test und Live jeweils getrennt)

1. Connect aktiv, **Plattformprofil** ausgefüllt (Land DE, Geschäftsmodell SaaS/Plattform, Vereine als
   Verkäufer). Ohne Profil lehnt Stripe die Kontoerstellung ab (`connect_profile_not_submitted`); die
   Meldung erscheint dem Verein als „Stripe hat die Einrichtung abgelehnt: …“.
2. Accounts v2 muss für das Konto freigeschaltet sein (sonst `accounts_v2_access_blocked`).
3. Managed Risk: Stripe setzt es automatisch für passende Konten (Verlustträger Stripe, `card_payments`,
   Direct Charges, Stripe-gehostetes Onboarding, volles Dashboard). Radar für verbundene Konten aktivieren.
   Keine Verlusthaftungs-Bestätigung der Plattform nötig (die ist nur für `losses_collector=application`).
4. Branding (Plattform) setzen; Checkout zeigt bei Direct Charges das Branding des Vereinskontos.
5. Webhooks laut Tabelle anlegen, `whsec_…` in Render eintragen.
6. Live zusätzlich: Live-Schlüssel `sk_live_…` (bei eingeschränktem Schlüssel Recht
   `v2_account_storer_write` für die Kontoerstellung), Live-Connect-Webhook, `APP_ENV=production`.

### Staging testen

1. Backup, dann Migration `20261107140000_stripe_managed_risk.sql`; Backend deployen.
2. Render Staging: `STRIPE_CHECKOUT_ENABLED=true`, `STRIPE_SECRET_KEY=sk_test_…`,
   `STRIPE_CONNECT_WEBHOOK_SECRET`, `FRONTEND_BASE_URL` = Staging-Frontend.
   `STRIPE_PLATFORM_WEBHOOK_SECRET` nur, wenn ein B2-Konto weiter getestet werden soll.
3. Stripe (Testmodus): Connect-Webhook auf die fünf Events oben prüfen.
4. Testverein ohne Stripe-Konto: Einstellungen → Zahlungen → „Online-Zahlung einrichten“ → Weiterleitung
   auf `accounts.stripe.com` → Testdaten, Test-IBAN `DE89370400440532013000` → zurück → „Status prüfen“
   → „Wartet auf Freigabe“. Plattform-Konsole → Verein → „Freigeben“ → „Aktiv“, Konsole zeigt
   „Direct Charge mit Plattformgebühr (Managed Risk)“.
5. Elternbuchung (Camp und Training) → Testkarte `4242 4242 4242 4242` → Buchung „Bezahlt“, Rechnung
   erzeugt (wenn Rechnungsdaten gepflegt). Stripe-Dashboard → verbundenes Konto → Zahlung: Stripe-Gebühr
   beim Verein, Application Fee = Plattformgebühr; Plattform → „Eingezogene Gebühren“.
6. Teil-Erstattung per API (`request_id`, `amount_cents`) → „Teilweise erstattet“, `fee_refunded_cents`
   anteilig; Rest → „Erstattet“, Storno-Rechnung.
7. Gegenprobe: Verein mit Altkonto zahlt weiter ohne Gebühr; Sperren in der Konsole → keine Online-Zahlung.

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
- **Löschen einer Buchung (Release Abrechnung + Admin-Fixes):** `invoices.registration_id` und `registration_refund_events.registration_id` haben bewusst keinen FK auf `camp_registrations` (Beleg muss die Zeile überdauern). Die Datenbank verhindert ein Löschen also nicht; das Backend tut es: `DELETE …/registrations/{token}` liefert 409 `has_invoice` („Für diese Buchung gibt es eine Rechnung. Bitte stornieren statt löschen.“), sobald eine Rechnung oder Stornorechnung existiert – auch bei erstatteten Buchungen (Storno vorhanden). Ohne Rechnung, aber mit erfasster Plattformgebühr (Gebühren-Snapshot oder Erstattungsereignis, z. B. Rechnung ausstehend) kommt 409 `has_fee_record`; Online-Zahlung inkl. Teilerstattung 409 `paid_online`. Die Oberfläche zeigt statt des Löschknopfs den Hinweis.
- **Spielerakte löschen:** Stornierte Buchungen werden anonymisiert (Name „Gelöscht“, Geburtsdatum = Buchungsdatum, `anonymized_at`). Rechnung und Stornorechnung bleiben unverändert – Snapshot und PDF enthalten weiter den Kindernamen wie ausgestellt (Aufbewahrungspflicht, Art. 17 Abs. 3 lit. b DSGVO). Die Anonymisierung ändert nur `camp_registrations`, der Unveränderlichkeits-Trigger von `invoices` greift nicht.
- `invoices` hängt per `on delete cascade` am Verein: Wird ein Verein gelöscht, verschwinden seine Rechnungen. Vor dem Löschen eines Vereins dessen Rechnungen exportieren (PDFs) – Aufbewahrung liegt beim Verein.
- Datenschutzerklärung der Vereine/Plattform um „Rechnung per E-Mail mit PDF“ ergänzen.
