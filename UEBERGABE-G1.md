docs/g1-golive-welle2

STATUS: fertig zur Prüfung

COMMIT: 3140541 — docs: G1 Go-live-Plan Welle 2 und Schema-Probe befüllte DB

TESTS:
  python -m pytest backend_saas/tests -q
  499 passed, 29 subtests passed, 0 failed, 0 skipped

ERGEBNIS der Probe (test_schema_upgrade_populated.py, REVIEW_POSTGRES_PORT gesetzt):
  test_upgrade_preserves_data                   PASSED
  test_upgrade_is_idempotent                    PASSED
  test_rls_migration_aborts_on_foreign_policy   PASSED
  Datenhash vor/nach identisch; email_sent_at erhalten (3 von 6 Zeilen gesetzt);
  email_error NULL für alle Altzeilen; trainer_image_url/trainer_text NULL für alle Orgs;
  zweites Anwenden fehlerfrei; Fremdpolicy ohne s3_-Präfix bricht Migration ab (6 Zeilen intakt).

NICHT_AUSGEFÜHRT:
  - Kein Cloud-DB-Deploy (Migrationen nicht auf Supabase SaaS angewendet)
  - Kein Render-Deploy
  - REVIEW-C9 B3/B4 Texte: noch nicht freigegeben (warten auf Serkan/Jan)
  - Keine echte Brevo-Testmail (kein BREVO_API_KEY in dieser Umgebung)
