fix/k1-mailpfad

STATUS: fertig zur Prüfung

COMMIT: 1b48653ae408066770dab12e116cf408646bc2c3

TESTS: 506 passed, 29 subtests passed, 0 failed
(keine Postgres-Tests übersprungen; alle 506 laufen mit gemockter DB in test-Env)
Neue Tests: 10 (B1: 5, B2: 3, B7: 2)

---

ÄNDERUNGEN

B1 — BrevoProvider.send() auf httpx umgestellt
  Dateien:
    backend_saas/app/notifications/mail.py
  Was:
    - `import requests` inline in `send()`
    - `requests.post(...)` mit `raise_for_status()`
  Jetzt:
    - `import httpx` als Top-Level-Import (bereits in requirements.txt ≥ 0.27)
    - `BrevoProvider.__init__` nimmt optionalen `_http_client: httpx.Client`-Parameter
      (für Tests: inject Mock-Client; für Produktion: `httpx.Client(timeout=5.0)` wird erzeugt)
    - `send()` nutzt `self._client.post(...)`, dann `raise_for_status()`
    - 4xx/5xx → `httpx.HTTPStatusError` (wie bisher `requests.exceptions.HTTPError`)
    - Netzwerkfehler → `httpx.ConnectError` o.ä. (propagiert unverändert)
  grep-Beweis: `import requests` in backend_saas/app/ → 0 Treffer
  Tests:
    test_brevo_2xx_succeeds / test_brevo_201_succeeds — kein raise bei 2xx
    test_brevo_4xx_raises / test_brevo_5xx_raises — HTTPStatusError bei 4xx/5xx
    test_brevo_network_error_raises — ConnectError propagiert
    Alle via httpx.BaseTransport-Subklassen, kein echter Netzwerkzugriff

B2 — FakeProvider nur bei NOTIFICATION_PROVIDER=fake; ehrlicher Versandnachweis
  Dateien:
    backend_saas/app/notifications/mail.py
    backend_saas/app/notifications/sending.py
  Was:
    - Kein NOTIFICATION_PROVIDER → FakeProvider als Fallback
    - FakeProvider.send() erfolgreich → _mark_sent() gesetzt → email_sent_at belegt
  Jetzt:
    - "brevo" → BrevoProvider (delivers=True)
    - "fake" → FakeProvider (delivers=False)
    - Fehlend/unbekannt + APP_ENV in ("local","test") → _LocalUnconfiguredProvider (delivers=False):
        log.warning, send() kehrt stumm zurück, kein email_sent_at, kein email_error
    - Fehlend/unbekannt + Produktion → _ProdUnconfiguredProvider (delivers=False):
        log.error, send() wirft RuntimeError → Outer-Handler setzt email_error
    - delivers-Flag-Prüfung in _do_send(): `if getattr(provider, "delivers", True):`
        nur dann wird _mark_sent() gerufen → FakeProvider-Versand bleibt retry-fähig
  Tests:
    test_missing_provider_does_not_mark_email_sent_at — email_sent_at bleibt NULL
    test_fake_provider_does_not_mark_email_sent_at — email_sent_at bleibt NULL
    test_retry_reaches_registration_after_provider_switch — retry findet Anmeldung,
      markiert nach Wechsel auf _RealMockProvider (delivers=True)

B7 — organization_id in _MARK_SENT und _MARK_ERROR WHERE-Klausel
  Dateien:
    backend_saas/app/notifications/sending.py
  Was:
    _MARK_SENT: WHERE registration_token = %s
    _MARK_ERROR: WHERE registration_token = %s
    _mark_sent(registration_token)
    _mark_error(registration_token, error)
  Jetzt:
    _MARK_SENT: WHERE registration_token = %s AND organization_id = %s
    _MARK_ERROR: WHERE registration_token = %s AND organization_id = %s
    _mark_sent(registration_token, organization_id)
    _mark_error(registration_token, error, organization_id)
    _do_send() übergibt organization_id an _mark_sent()
    send_registration_notification() übergibt organization_id an _mark_error()
  Tests:
    test_mark_sent_receives_organization_id — org_id korrekt an _mark_sent übergeben,
      ≠ _ORG_B_ID
    test_mark_error_receives_organization_id — org_id korrekt an _mark_error übergeben,
      ≠ _ORG_A_ID

---

NICHT_AUSGEFÜHRT
  - Kein Merge, kein Push nach origin, kein Deploy
  - Keine Migration ausgeführt (reine Applikationslogik-Änderung, kein DB-Schema-Änderung)
  - Keine neuen Dependencies hinzugefügt (httpx war bereits in requirements.txt)
