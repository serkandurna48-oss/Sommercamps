feat/f2-anbieter-info

STATUS: fertig zur Prüfung

COMMIT: 18b180f45b5a1f2cc37c1b47006543114726d6e5

TESTS: python -m pytest backend_saas/tests -q → 552 passed, 29 subtests passed, 0 failed

---

## Beispiel-Anbieter-Mail (status=registered)

**An:** info@jk.example (contact_email der Organisation)
**Betreff:** Neue Anmeldung – Sommercamp 2027
**Absendername:** JK Performance Academy über CampsPilot

```html
<p>Es ist eine neue Anmeldung eingegangen.</p>
<p>Camp: <strong>Sommercamp 2027</strong><br>
Termin: 05.07.2027 – 09.07.2027<br>
Status: <strong>Angemeldet</strong></p>
<p>Belegung: <strong>6 von 20 Plätzen belegt, 0 auf der Warteliste</strong></p>
<p>Verwendungszweck: <strong>CP-ABCD1234</strong></p>
<p>Details finden Sie im Admin-Bereich.</p>
<p>Mit freundlichen Grüßen,<br>JK Performance Academy über CampsPilot</p>
```

Bei status=waitlist: Betreff „Neue Wartelisten-Anmeldung – Sommercamp 2027", Status-Label „Warteliste".

---

## Änderungen

### `backend_saas/app/notifications/templates.py`
- Neue Funktion `build_provider_mail()` — baut die Anbieter-Mail ohne jegliche Personendaten (kein
  Eltern-/Kindname, keine Eltern-E-Mail). Enthält: Camp, Termin, Status, Belegungszahlen,
  Verwendungszweck, Hinweis auf Admin-Bereich. Sie-Form.

### `backend_saas/app/notifications/sending.py`
- `_FETCH_OCCUPANCY` SQL — gleiche Subquery-Logik wie `_OCCUPANCY_SUBQUERIES` in
  `repositories/camps.py`, gefiltert nach `organization_id` (Mandantenfilter).
- `_fetch_occupancy(organization_id, camp_id)` — DB-Hilfsfunktion, monkeypatchbar.
- `_send_provider_notification(...)` — best-effort, nie raises, kein `_mark_sent`/`_mark_error`.
  Läuft unabhängig nach der Elternmail-Logik.
- `send_registration_notification()` — ruft nach dem Elternmail-try/except am Ende
  `_send_provider_notification()` auf. Fehler beim Elternversand verhindern den Anbieterversand
  nicht; Fehler beim Anbieterversand werden nur geloggt.

### `backend_saas/tests/test_notifications.py`
- `_occupancy()` Hilfs-Dict und `_UNSET`-Sentinel.
- `_patch()` mockt jetzt auch `_fetch_occupancy` (Standard: `_occupancy()`).
- 7 bestehende `len == 1`-Assertions auf `== 2` aktualisiert (parent + provider).
- 11 neue Tests: Template (registered/waitlisted), Versand für beide Stati, Empfänger-Adresse,
  kein PII in Anbieter-Mail, Belegungszahlen, Anbieter-Fehler lässt email_sent_at unberührt,
  Elternmail-Fehler verhindert Anbieter-Mail nicht, Mandantenfilter in Queries.

---

## NICHT_AUSGEFÜHRT

- Kein echter Brevo-Versand (kein BREVO_API_KEY konfiguriert; lokale Umgebung sendet nicht)
- Kein DB-Push, kein Merge, kein Push nach origin
