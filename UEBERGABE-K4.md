fix/k4-golive-feinschliff

STATUS: fertig zur Prüfung

COMMIT: 5597bdf7b504d6506bf67962ff811cab26447159
fix: K4 Go-live-Feinschliff (C11 F1–F7)

TESTS:
  Frontend:  187 passed (187) — npm run test --prefix frontend
  Backend:   528 passed, 29 subtests — python -m pytest backend_saas/tests -q

LINT:
  0 errors, 10 warnings (pre-existente Warnings, kein neuer Fehler)
  npx tsc --project frontend/tsconfig.json --noEmit → 0 Fehler

---

ÄNDERUNGEN

F1 – ActionForm: Abbrechen disabled während pending
  Datei: frontend/app/components/saas/ui/ActionForm.tsx
  - `disabled={pending} aria-disabled={pending}` am Abbrechen-Button ergänzt
  Test: frontend/app/components/saas/ui/ActionForm.test.tsx
  - Neuer Test „Abbrechen ist disabled während pending, danach zurück zum Einstiegsbutton":
    verzögertes Promise (manuell auflösbar) → Abbrechen.disabled = true während pending,
    nach Auflösung wieder Einstiegsbutton sichtbar (kein Form)

F2 – Zahlungsempfänger payee_name
  Datei: backend_saas/app/notifications/sending.py
  - SQL-Kontext um `COALESCE(o.legal_name, o.name) AS payee_name` erweitert
  - `payee_name` an `build_registration_mail()` weitergegeben
  Datei: backend_saas/app/notifications/templates.py
  - Neuer Parameter `payee_name: Optional[str] = None`
  - `Empfänger:`-Feld nutzt `payee_name` (Fallback auf `org_name`)
  Tests: backend_saas/tests/test_notifications.py
  - `_ctx()` um `payee_name` ergänzt
  - test_payee_name_distinct_from_org_name_used_as_recipient
  - test_payee_name_used_in_no_iban_hint

F3 – Teilnahmebedingungen bereinigt
  Datei: frontend/app/pilot/[org]/teilnahmebedingungen/page.tsx
  - Abschnitte 4 (Stornierung) und 5 (Haftung und Verhalten) entfernt
  - Schlusssatz: „Es gelten die Teilnahme-, Storno- und Haftungsbedingungen von {entityName}.
    Bei Fragen: {contact_email}."
  - Inhaltsverzeichnis auf 3 Einträge reduziert
  Test: frontend/app/pilot/[org]/pages.test.tsx
  - Neuer Test: kein „haftet", kein „Erstattung/erstattet", kein „Gesundheit"
    (Hinweis: „Haftungsbedingungen" im Schlusssatz ist erlaubt, daher Test auf Verb „haftet")

F4 – Zahlungstext einheitlich
  Datei: frontend/app/pilot/[org]/teilnahmebedingungen/page.tsx (Abschnitt 3):
    „Bei einem festen Platz stehen Betrag und Zahlungsdetails in der Bestätigungs-E-Mail;
    ist dort keine Bankverbindung angegeben, sendet {entityName} die Zahlungsdetails direkt.
    Auf der Warteliste ist noch keine Zahlung fällig."
  Datei: frontend/app/pilot/[org]/DoneScreen.tsx (no-IBAN-Hinweis):
    „{payTo} sendet dir die Zahlungsdetails direkt. Bei Fragen: {contact_email}."
    (statt Aufforderung, selbst nachzufragen; Kontaktdaten bleiben)
  Datei: backend_saas/app/notifications/templates.py:
    Mail ohne IBAN: Betrag + Währung + Verwendungszweck werden nun auch im
    no-IBAN-Fall ausgegeben (amount_line + payment_ref vor dem Hinweis-Text)
  Tests: DoneScreen.test.tsx (F4-Test), test_notifications.py
    (test_registered_mail_without_iban_* angepasst: payment_ref ist jetzt in Content)

F5 – Brevo-Payload: kein Name in to[]
  Datei: backend_saas/app/notifications/mail.py
  - `to_name: str = ""` aus MailMessage entfernt
  - `if message.to_name: to_entry["name"] = ...` aus BrevoProvider.send() entfernt
  - `to_entry` ist jetzt immer `{"email": ...}` ohne name-Feld
  Datei: frontend/app/pilot/[org]/datenschutz/page.tsx (Brevo-Abschnitt):
    „Übermittelt werden die E-Mail-Adresse der Eltern sowie Camp, Termin, Zahlungsdetails
    und Kontaktdaten des Anbieters. Keine Namen von Eltern oder Kindern, keine Geburtsdaten,
    Allergien oder medizinischen Hinweise."
  Tests: test_notifications.py
  - `_sample_msg()`: to_name entfernt
  - test_brevo_payload_to_has_only_email_key: set(to[0].keys()) == {"email"}

F6 – Parametrisierter Orchestrierungstest
  Datei: backend_saas/tests/test_notifications.py
  - test_unconfigured_provider_marks_error_in_nonlocal_env (8 Parameterkombinationen):
    Provider fehlend/unbekannt × APP_ENV aus Prozess-Env/Settings × staging/production
    → genau ein _mark_error, kein _mark_sent

F7 – DoneScreen: Ankündigung statt Behauptung
  Datei: frontend/app/pilot/[org]/DoneScreen.tsx
  - „Wir schicken dir eine Bestätigung an {parentEmail}. Schau auch im Spam-Ordner nach."
    (statt „Wir haben dir … geschickt")
  Test: DoneScreen.test.tsx
  - test „kündigt Bestätigungsmail an": toContain('schicken'), not.toContain('geschickt')

---

BEISPIEL-MAIL MIT IBAN
Betreff: Anmeldebestätigung – Sommercamp 2027

Hallo,

deine Anmeldung für Sommercamp 2027 (05.07.2027 – 09.07.2027) ist bei uns eingegangen.

Betrag: 149,00 EUR
Empfänger: JK Performance Academy e. V.
IBAN: DE89370400440532013000
Verwendungszweck: CP-ABCDEF12

Bei Fragen wende dich direkt an JK Performance Academy:
E-Mail: info@jk.example
Telefon: +49 123 456

Viele Grüße,
JK Performance Academy

Absender-Name: „JK Performance Academy über CampsPilot"
to: [{"email": "max@example.com"}]  ← kein name-Feld

---

BEISPIEL-MAIL OHNE IBAN
Betreff: Anmeldebestätigung – Sommercamp 2027

Hallo,

deine Anmeldung für Sommercamp 2027 (05.07.2027 – 09.07.2027) ist bei uns eingegangen.

Betrag: 149,00 EUR
Verwendungszweck: CP-ABCDEF12

JK Performance Academy e. V. sendet dir die Zahlungsdetails direkt.
E-Mail: info@jk.example
Telefon: +49 123 456

Bei Fragen wende dich direkt an JK Performance Academy:
E-Mail: info@jk.example
Telefon: +49 123 456

Viele Grüße,
JK Performance Academy

to: [{"email": "max@example.com"}]  ← kein name-Feld

---

NEUE TEILNAHMEBEDINGUNGEN (Wortlaut der Seite für einen Verein „Demo FC",
  contact_email: demo@example.com, legal_name: null)

Demo FC
Teilnahmebedingungen

Inhalt
1. Geltungsbereich
2. Anmeldung
3. Zahlung

1. Geltungsbereich
Diese Seite beschreibt den Ablauf für Anmeldungen zu Fußball-Feriencamps von Demo FC
über das CampsPilot-Anmeldesystem.

2. Anmeldung
Die Anmeldung erfolgt ausschließlich über das Online-Formular. Nach Eingang der
vollständigen Anmeldung wird eine Bestätigung per E-Mail verschickt. Die Teilnahme
ist auf die angegebene Altersgruppe beschränkt.

Plätze werden in der Reihenfolge der vollständig eingegangenen Anmeldungen vergeben.
Bei ausgebuchten Camps besteht die Möglichkeit, sich auf die Warteliste setzen zu lassen.

3. Zahlung
Bei einem festen Platz stehen Betrag und Zahlungsdetails in der Bestätigungs-E-Mail;
ist dort keine Bankverbindung angegeben, sendet Demo FC die Zahlungsdetails direkt.
Auf der Warteliste ist noch keine Zahlung fällig.

Es gelten die Teilnahme-, Storno- und Haftungsbedingungen von Demo FC.
Bei Fragen: demo@example.com.

---

NICHT_AUSGEFÜHRT
- Kein DB-Schema-Change (payee_name kommt über COALESCE aus bestehenden Spalten)
- Kein Push auf origin (nur lokaler Commit)
- Kein Deploy (explizit nicht im Auftrag)
