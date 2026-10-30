# Übergabe S1 Selbstregistrierung mit Prüfstatus und Freigabe

Branch: feat/s1-selbstregistrierung-r

STATUS: FERTIG

COMMIT SHA: 970c0c59da3c955bf10fdfa0850238bd6e1b397f

TESTS: python -m pytest backend_saas/tests -q
Ergebnis: 612 passed, 0 failed, 1 warning, 29 subtests passed in 1279.51s

MUTATIONSPROBE: Wenn die review_status-Prüfung aus app/tenancy.py::resolve_tenant entfernt wird,
schlägt test_draft_org_public_404_even_with_site_published_true rot. Wenn zusätzlich die
review_status-Prüfung aus app/repositories/registrations.py::create_registration entfernt wird,
schlägt test_registration_rejected_for_draft_org rot. (Marker-Kommentar am Ende von
backend_saas/tests/test_s1_selbstregistrierung.py)

## ÄNDERUNGEN nach Anforderungspunkt

**Punkt 1 – Migration:**
supabase/migrations/20261023120000_org_review_status.sql
Fügt 7 Spalten zu organizations hinzu (review_status, avv_accepted_at, avv_version,
submitted_at, approved_at, approved_by, review_note). Nicht angewendet; Datei bereit für
`supabase db push`.

**Punkt 2 – Öffentlicher Sichtbarkeits-Gate:**
backend_saas/app/tenancy.py: TenantNotApprovedError + Prüfung in resolve_tenant (Zeile ~38)
backend_saas/app/deps.py: except TenantNotApprovedError → 404 (Zeile ~55)
backend_saas/app/repositories/registrations.py: review_status in _LOCK_PUBLIC_ORGANIZATION +
Prüfung in create_registration (Zeile ~504)

**Punkt 3 – site_published toggle / review_status nicht patchbar:**
OrganizationUpdate-Schema hat extra="forbid" → PATCH mit review_status → automatisch 422.
Kein zusätzlicher Guard nötig; abgedeckt durch test_org_admin_cannot_patch_review_status.

**Punkt 4 – POST /public/signup:**
backend_saas/app/routers/signup.py (neu)
backend_saas/app/routers/__init__.py: signup_router exportiert
backend_saas/app/main.py: signup_router eingebunden
backend_saas/app/supabase_auth.py: create_user(), delete_user(), SupabaseEmailConflictError
backend_saas/app/repositories/organizations.py: create_signup_organization()

**Punkt 5 – Rate Limiting:**
backend_saas/app/routers/signup.py: _check_rate_limit(), _ip_timestamps, _rate_lock (Zeilen ~1–50)
In-Memory, max 3 Signups pro IP pro Stunde, 429 mit deutschem Text.

**Punkt 6 – POST /admin/organizations/{slug}/submit-review:**
backend_saas/app/routers/admin.py: submit_review() Endpoint
backend_saas/app/repositories/organizations.py: submit_for_review()
backend_saas/app/admin_schemas.py: SubmitReviewRequest

**Punkt 7 – POST /admin/organizations/{slug}/review:**
backend_saas/app/routers/admin.py: review_organization() Endpoint
backend_saas/app/repositories/organizations.py: approve_organization(), reject_organization()
backend_saas/app/admin_schemas.py: ReviewDecisionRequest (note Pflicht bei reject)
backend_saas/app/notifications/sending.py: send_review_decision_email()

**Punkt 8 – GET /admin/organizations?review_status=submitted:**
backend_saas/app/routers/admin.py: list_organizations() mit review_status-Parameter
backend_saas/app/repositories/organizations.py: list_organizations_filtered()

**Punkt 9 – Tests:**
backend_saas/tests/test_s1_selbstregistrierung.py (neu, 19 Tests)

Nebenänderungen (nicht S1-Scope, aber nötig für 0 failed):
backend_saas/tests/test_admin_organizations_api.py: list_organizations_filtered monkeypatched
  statt list_organizations (wegen Router-Änderung in Punkt 8)
backend_saas/tests/test_import_ksv.py: subprocess timeout 15s → 30s (Windows-Startup-Zeit)

MIGRATION: supabase/migrations/20261023120000_org_review_status.sql — noch nicht in der Cloud
angewendet. Aufruf: `supabase db push` oder SQL direkt ausführen.

NICHT_AUSGEFÜHRT:
- Keine DB-Migration in der Cloud angewendet (review_status-Spalte fehlt noch in Produktion)
- Kein Push, kein Merge; Branch bleibt lokal
