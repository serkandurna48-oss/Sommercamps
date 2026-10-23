feat/s1c-registrierung
STATUS: fertig zur Prüfung

COMMIT: (wird nach git commit gesetzt)

TESTS:
  python -m pytest backend_saas/tests -q
  619 passed, 0 failed, 1 warning, 29 subtests passed

MUTATIONSPROBE:
  B2: test_xff_ignored_with_proxy_hops_0_fourth_request_429
    Beschreibung: Mit TRUSTED_PROXY_HOPS=0 senden alle 3 Anfragen den Header
    X-Forwarded-For: 198.51.100.7, der ignoriert wird (HOPS=0 → client.host
    = "testclient"). Nach 3 erfolgreichen Requests wird die 4. Anfrage mit 429
    abgelehnt.
    Mutation (Rückkehr zu XFF[0]): _get_client_ip würde "198.51.100.7" liefern.
    Die 3 Anfragen zählen dann gegen "198.51.100.7", "testclient" ist nicht
    erschöpft, die 4. Anfrage gibt 201 statt 429 → Test rot.
    Dokumentiert in: backend_saas/tests/test_s1_selbstregistrierung.py, Ende der Datei.

ÄNDERUNGEN:

B1 — Bestätigungsmail nach Signup:
  backend_saas/app/supabase_auth.py
    + generate_confirmation_link(email: str) -> str
    Ruft POST /auth/v1/admin/generate_link mit type="signup" auf.
    Doku-Annahme: Supabase GoTrue gibt ein Feld "action_link" zurück (laut
    Supabase Admin API-Dokumentation für generate_link, Stand 2026-10).
    Schlägt fehl bei fehlendem SUPABASE_SERVICE_ROLE_KEY oder unerreichbarer API.

  backend_saas/app/notifications/sending.py
    + send_signup_confirmation_email(to_email, org_name, confirmation_link) -> bool
    Betreff: "Bitte bestätigen Sie Ihre Registrierung", deutsch, gesiezt,
    Vereinsname, Link, "Dieser Link ist 24 Stunden gültig."
    Gibt True bei Erfolg zurück, False bei Fehler. Niemals raised.

  backend_saas/app/routers/signup.py
    + _send_confirmation_email() — kapselt Link-Generierung + Versand (best-effort)
    + SignupResponse.confirmation_email_sent: bool
    POST /public/signup: ruft _send_confirmation_email() nach DB-Commit auf.
      Schlägt Versand fehl → 201 + confirmation_email_sent=False + Warn-Log.
      Schlägt Versand nicht fehl → 201 + confirmation_email_sent=True.
    + POST /public/signup/resend: gleiche IP-Begrenzung, immer 202, verrät
      nie ob die Adresse existiert.

B2 — Sichere IP-Begrenzung:
  backend_saas/app/config.py
    + trusted_proxy_hops: int (TRUSTED_PROXY_HOPS env var, Default 0)
    Dokumentiert mit Erklärung für Render-Betreiber.

  backend_saas/app/routers/signup.py
    + _get_client_ip(request) — neuer Helper, ersetzt alten inline-Code.
    Liest TRUSTED_PROXY_HOPS direkt aus os.environ (lru_cache-sicher).
    HOPS=0: request.client.host, X-Forwarded-For wird ignoriert.
    HOPS=n: letzter Eintrag aus XFF (position -n vom Ende).
    ALTER CODE hatte Fehler: nahm immer XFF[0] (leicht fälschbar).

B3 — review_status ohne Default:
  backend_saas/app/tenancy.py
    VORHER: org.get("review_status", "approved") — fehlend → wie approved
    JETZT: org.get("review_status") → None → Warn-Log + TenantNotApprovedError
    Fehlende review_status → 404 nach außen (fail closed).
    + import logging, logger = logging.getLogger(__name__)

  Angepasste Test-Fixtures (review_status="approved" hinzugefügt):
    backend_saas/tests/test_tenancy.py (2 Fixtures)
    backend_saas/tests/test_registrations_api.py (_org_row)
    backend_saas/tests/test_organizations_api.py (_org_row)
    backend_saas/tests/test_camps_api.py (_org_row)

  backend_saas/tests/test_s1_selbstregistrierung.py
    + autouse-Fixture _clear_signup_rate_limiter (verhindert Rate-Limit-Leck
      zwischen Tests — nötig weil HOPS=0 alle TestClient-Requests als
      "testclient" zählt)
    + test_signup_sends_confirmation_email_with_link (B1)
    + test_signup_mail_failure_returns_201_with_sent_false (B1)
    + test_resend_returns_202_for_unknown_address (B1)
    + test_resend_returns_202_for_known_address (B1)
    + test_xff_ignored_with_proxy_hops_0_fourth_request_429 (B2, Mutationsprobe)
    + test_xff_last_entry_used_with_proxy_hops_1 (B2)
    + test_org_missing_review_status_field_returns_404 (B3)
    Angepasst: test_signup_rate_limit_4th_request_returns_429
      (jetzt TRUSTED_PROXY_HOPS=1 + eindeutige XFF-IP statt Suche nach "testclient")

EINSTELLUNGEN FÜR SERKAN:
  Render → Umgebungsvariablen für Backend-Service (backend_saas / SaaS):
    TRUSTED_PROXY_HOPS = 1
    Begründung: Render stellt einen Load Balancer vor jeden Service. Dieser
    Proxy hängt die Client-IP als letzten Eintrag an X-Forwarded-For an.
    Mit HOPS=1 liest _get_client_ip genau diesen Eintrag, den ein Client
    nicht fälschen kann (eigene XFF-Header kommen VOR dem proxy-angehängten
    Eintrag). ANNAHME: Render nutzt genau einen Proxy-Hop. Falls künftig
    mehrere Load Balancer (z.B. Cloudflare + Render) vorgeschaltet werden,
    muss TRUSTED_PROXY_HOPS entsprechend erhöht werden.

NICHT_AUSGEFÜHRT:
  - Kein Deploy, kein Push nach origin/main
  - Keine echten Supabase-Calls in Tests (alles gemockt)
  - Die Supabase generate_link-Antwort-Struktur wurde anhand der GoTrue-
    Dokumentation angenommen ("action_link"-Feld); nicht gegen eine echte
    Supabase-Instanz verifiziert
  - Der resend-Endpunkt sucht den Vereinsnamen nicht aus der DB (verwendet
    "CampsPilot" als Fallback) — da der Endpunkt keine Existenz verraten darf
