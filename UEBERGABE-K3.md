fix/k3-elterntexte

STATUS: fertig zur Prüfung

COMMIT: noch ausstehend (dieser Branch, alle Änderungen unten)
GETESTETER SHA: f51fad5dbadd1857254909711fe9824dcf254786 (Ausgangspunkt)

---

## TESTS

| Suite | Ergebnis |
|---|---|
| `npm run test --prefix frontend` | 168 passed (22 files), 0 failed |
| `python -m pytest backend_saas/tests -q` | 500 passed, 0 failed |
| `npx tsc --noEmit` | 0 Fehler |

---

## ÄNDERUNGEN je Punkt

### 1. DoneScreen – E-Mail-Hinweis

**Datei:** `frontend/app/pilot/[org]/DoneScreen.tsx` Zeile 161  
**Datei:** `frontend/app/pilot/[org]/DoneScreen.test.tsx` (Test umbenannt/aktualisiert)

Vorher:
> Notieren Sie sich diese Seite — im Pilotbetrieb geht noch keine Bestätigungs-E-Mail raus.

Nachher:
> Wir haben dir eine Bestätigung an {parentEmail} geschickt. Schau auch im Spam-Ordner nach.

Überweisungsblock (Betrag, Empfänger, IBAN, Verwendungszweck), Ohne-IBAN-Kontakthinweis und Warteliste-Logik wurden nicht verändert.

---

### 2. Mail-Template (templates.py)

**Datei:** `backend_saas/app/notifications/templates.py`

- Neue optionale Parameter: `price_cents: Optional[int] = None`, `currency: Optional[str] = None`
- **Mit IBAN:** Block zeigt jetzt Betrag+Währung (wenn übergeben), Empfänger, IBAN, Verwendungszweck
- **Ohne IBAN:** Block zeigt „Die Zahlungsdetails erhältst du direkt von {org_name}." mit Kontakt-E-Mail/Telefon
- **Warteliste:** kein Zahlungsblock; Satz ergänzt: „Es sind noch keine Kosten fällig."
- Bestehende HTML-Escaping-Logik unverändert

---

### 3. Teilnahmebedingungen

**Datei:** `frontend/app/pilot/[org]/teilnahmebedingungen/page.tsx`

Entfernte Formulierungen:
> „Ein verbindlicher Vertrag kommt mit Eingang der Anmeldebestätigung per E-Mail zustande."

> „bis 4 Wochen vor Camp-Beginn wird der Teilnahmebetrag abzüglich einer Bearbeitungsgebühr von 20 € erstattet"

Neu (Abschnitt 4 Stornierung):
> „Es gelten die Teilnahme- und Stornobedingungen von {entityName}. Bei Fragen wenden Sie sich direkt an {entityName}: {contact_email}."

---

### 4. Datenschutz

**Datei:** `frontend/app/pilot/[org]/datenschutz/page.tsx`

**(a) Brevo ergänzt (Abschnitt 6):**

Vorher:
> „Eine Weitergabe erfolgt nur, wenn dazu eine gesetzliche Verpflichtung besteht."

Nachher:
> „Eine Weitergabe erfolgt an folgende Dienstleister zur Durchführung der Anmeldung:
> — Brevo (Sendinblue SAS, Paris, Frankreich) – für den Versand der Bestätigungsmail;
> übermittelt werden Name und E-Mail-Adresse der Eltern sowie Vorname und Nachname des Kindes,
> Camp und Termin. Keine Geburtsdaten, Allergien oder medizinischen Hinweise.
> Darüber hinaus erfolgt eine Weitergabe nur, wenn dazu eine gesetzliche Verpflichtung besteht."

**(b) + (c) Abschnitt 4 Speicherung:**

Vorher:
> „Lesender/schreibender Zugriff ist auf den Anmeldeserver beschränkt — es gibt keinen direkten Browserzugriff auf die Anmeldedaten."

Nachher:
> „Zugriff haben der Anmeldeserver und angemeldete, berechtigte Verantwortliche des jeweiligen Anbieters."

---

### 5. Tests

**Frontend – neue/geänderte Tests:**
- `DoneScreen.test.tsx`: Test `zeigt E-Mail-Bestätigungshinweis mit Eltern-Adresse` ersetzt alten „pilot"-Hinweis-Test
- `pages.test.tsx` (neu): Teilnahmebedingungen enthält kein „20"/„vier Wochen"/„4 Wochen"; Datenschutz enthält „Brevo"

**Backend – neue Tests in `test_notifications.py`:**
- `test_registered_mail_with_iban_shows_amount_and_recipient` – Betrag+Währung sichtbar
- `test_registered_mail_without_iban_shows_provider_hint` – Anbieterhinweis, kein Verwendungszweck
- `test_waitlist_mail_body_has_no_iban_block` – kein IBAN-Block bei Warteliste
- `test_html_escaping_of_malicious_child_name` – XSS-Escaping geprüft

---

## NICHT_AUSGEFÜHRT

- **price_cents / currency in sending.py nicht ergänzt** (parallele Session laut Aufgabe): `templates.py` nimmt die Parameter als `Optional[int] = None` / `Optional[str] = None` entgegen und zeigt Betrag+Währung wenn übergeben. `sending.py` übergibt sie bislang nicht, weil das `_fetch_mail_context`-Query `price_cents` und `currency` nicht aus der DB holt. Die parallele Session muss das Query und den `build_registration_mail`-Aufruf in `sending.py` ergänzen.
