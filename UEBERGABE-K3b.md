fix/k3b-mail-datensparsam

STATUS: fertig zur Prüfung

COMMIT: (noch nicht erstellt — nur lokale Änderungen, kein Merge ohne Freigabe)

TESTS:
  python -m pytest backend_saas/tests -q  →  515 passed, 29 subtests passed, 0 failed
  npm run test --prefix frontend          →  183 passed (24 files), 0 failed
  npx tsc --noEmit                        →  0 Fehler

---

## Geänderte Dateien

| Datei | Was |
|---|---|
| `backend_saas/app/notifications/sending.py` | `_FETCH_CONTEXT` um `c.price_cents, c.currency` erweitert; `_do_send` gibt `price_cents`/`currency` an `build_registration_mail` weiter, baut `parent_name`/`child_name` nicht mehr |
| `backend_saas/app/notifications/templates.py` | `parent_name` + `child_name` Parameter entfernt; Anrede → „Hallo,"; Körpertext ohne Kindername; `to_name` aus `MailMessage`-Konstruktor entfernt |
| `backend_saas/app/notifications/mail.py` | `to_name: str = ""` (optional mit Default); `BrevoProvider.send` schickt `name`-Feld in `to` nur noch, wenn `to_name` nicht leer |
| `backend_saas/tests/test_notifications.py` | Alle Template-Aufrufe ohne `parent_name`/`child_name`; `_ctx()` mit `price_cents`/`currency`; Escaping-Test auf `camp_title` umgestellt; 2 neue Tests (Betrag via `_do_send`, keine Namen in Subject/HTML/Brevo-Payload via `_CapturingTransport`) |
| `frontend/app/pilot/[org]/datenschutz/page.tsx` | Brevo-Abschnitt: kein Kinder-/Elternname mehr, stattdessen E-Mail + Camp/Termin/Zahlungsdetails |
| `frontend/app/pilot/[org]/pages.test.tsx` | Test ergänzt: `not.toContain('Vorname und Nachname des Kindes')` |

---

## Beispiel-Mail (HTML) mit synthetischen Daten

### Anmeldung mit IBAN + Betrag (status=registered)

**Subject:** Anmeldebestätigung – Sommer-Fußballcamp 2027  
**to_email:** elternteil@example.com  
**to_name:** "" (leer → kein `name`-Feld im Brevo-Payload)

```html
<p>Hallo,</p>
<p>deine Anmeldung für <strong>Sommer-Fußballcamp 2027</strong>
(05.07.2027 – 09.07.2027) ist bei uns eingegangen.</p>
<p>Betrag: <strong>149,00&nbsp;EUR</strong></p>
<p>Empfänger: <strong>Testverein FC Beispiel</strong><br>IBAN: <strong>DE89370400440532013000</strong><br>Verwendungszweck: <strong>CP-A1B2C3D4</strong></p>
<p>Bei Fragen wende dich direkt an Testverein FC Beispiel:<br>
E-Mail: info@beispiel.de<br>Telefon: +49 561 123456</p>
<p>Viele Grüße,<br>Testverein FC Beispiel</p>
```

Kein Kinder- oder Elternname im HTML. Kein `name`-Feld im Brevo-Payload (`to_name=""`).

### Warteliste (status=waitlist)

**Subject:** Wartelistenbestätigung – Sommer-Fußballcamp 2027

```html
<p>Hallo,</p>
<p>deine Anmeldung für <strong>Sommer-Fußballcamp 2027</strong>
(05.07.2027 – 09.07.2027) ist bei uns eingegangen. Das Camp ist aktuell ausgebucht –
die Anmeldung steht auf der Warteliste. Es sind noch keine Kosten fällig.</p>
<p>Sollte ein Platz frei werden, meldet sich Testverein FC Beispiel direkt bei dir.</p>
<p>Bei Fragen wende dich direkt an Testverein FC Beispiel:<br>
E-Mail: info@beispiel.de<br>Telefon: +49 561 123456</p>
<p>Viele Grüße,<br>Testverein FC Beispiel</p>
```

---

NICHT_AUSGEFÜHRT:
- Kein DB-Migration nötig (price_cents/currency waren bereits in der camps-Tabelle)
- Kein npm install, kein pip install
- Nicht nach origin gepusht, nicht gemergt
