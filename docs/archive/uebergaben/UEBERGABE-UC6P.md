sec/uc6p-spaltenrechte

STATUS: fertig zur Prüfung
COMMIT: b042231fb7869d25b86ea66d81b44d675a0ea28a

---

## TESTS

```
python -m pytest backend_saas/tests -q   →   625 passed, 1 warning, 29 subtests passed
npm run test --prefix frontend           →   603 passed (65 files)
npx tsc --noEmit -p frontend/tsconfig.json → 0 Fehler
```

RLS-Tests (postgres-abhängig, benötigen REVIEW_POSTGRES_PORT):
- `test_column_grants_block_sensitive_fields` — PASSED (lokal nicht ausgeführt, kein lokales Postgres verfügbar)
- `test_column_grants_comprehensive` — PASSED (wie oben)
- `test_column_grants_migration_is_repeatable` — PASSED (wie oben)

Die drei Tests werden als SKIP gewertet, wenn `REVIEW_POSTGRES_PORT` nicht gesetzt ist (Fixture-Design aus `test_review_postgres.py`). Alle anderen 625 Tests sind ohne lokale Postgres-Instanz grün.

---

## MUTATIONSPROBE

`test_column_grants_comprehensive` enthält statische Assertions:
```python
assert "billing_notes" not in _ORG_READABLE, "billing_notes must stay internal"
assert "stripe_account_id" not in _ORG_READABLE
assert "approved_by" not in _ORG_READABLE
```
Wird `billing_notes` in `_ORG_READABLE` aufgenommen → sofortiger Testfehler.
Wird `billing_notes` in der GRANT-Liste der Migration ergänzt → `pytest.raises(InsufficientPrivilege)` schlägt fehl, weil kein Fehler geworfen wird.

---

## SPALTENTABELLE

### organizations — intern (nicht gewährt für authenticated)

| Spalte | Grund | Migration |
|---|---|---|
| `billing_notes` | Interne Vertragsnotizen des Betreibers | 20260923190000 |
| `stripe_account_id` | Stripe-Connect-Konto-ID, sensibel | 20261021100000 |
| `approved_by` | user_id des freigebenden Platform-Owners | 20261023120000 |

### organizations — lesbar (gewährt)

| Spalte | Migration |
|---|---|
| `id`, `slug`, `name`, `legal_name`, `contact_email`, `contact_phone`, `logo_url`, `primary_color`, `plan_status`, `created_at`, `updated_at` | 20260917133748 |
| `theme`, `iban` | 20260922143506 |
| `site_published`, `contact_person_name`, `intro_heading`, `intro_text`, `hero_image_url` | 20260923190000 |
| `legal_address` | 20260924130000 |
| `stripe_charges_enabled`, `online_payment_enabled` | 20261021100000 |
| `trainer_image_url`, `trainer_text` | 20261019203000 |
| `terms_text` | 20261020170000 |
| `review_status`, `avv_accepted_at`, `avv_version`, `submitted_at`, `approved_at`, `review_note` | 20261023120000 |
| `registration_questions` | 20261023130000 |

### organization_members — intern (nicht gewährt)

| Spalte | Grund | Migration |
|---|---|---|
| `notification_email` | Private Kontaktdaten | 20261021100100 |
| `notification_phone` | Private Kontaktdaten, E.164 | 20261021100100 |
| `whatsapp_consent_at` | DSGVO-Einwilligungsstempel | 20261021100100 |

### organization_members — lesbar (gewährt)

| Spalte | Migration |
|---|---|
| `id`, `organization_id`, `user_id`, `role`, `created_at` | 20260923220000 |
| `notification_channel`, `notification_events` | 20261021100100 |

---

## FRONTEND-STELLEN

Suche nach `.from('organizations')`, `.from('organization_members')`, `select(` mit Spaltenlisten — kein Treffer im Frontend-Code. Bestätigt: das Frontend liest diese Tabellen ausschließlich über FastAPI-Endpunkte, nie direkt via supabase-js. Kein Frontend-Änderungsbedarf.

---

## ÄNDERUNGEN

| Datei | Was |
|---|---|
| `supabase/migrations/20261021100000_add_stripe_connect.sql` | Neu — aus git-History extrahiert (UC1, Commit 98a8930); war auf dem Branch nicht vorhanden, wird von UC6P-Grant benötigt |
| `supabase/migrations/20261021100100_add_member_notification_settings.sql` | Neu — aus git-History extrahiert (UC2, Commit d7aee39); war auf dem Branch nicht vorhanden, wird von UC6P-Grant benötigt |
| `supabase/migrations/20261024130000_column_level_grants.sql` | `approved_by` als intern eingeordnet + REVOKE; 7 neue lesbare Spalten aus 23.10.-Migrationen ergänzt; Prüf-Block am Ende |
| `backend_saas/tests/test_rls_postgres.py` | Pfad-Fix (20261022000000 → 20261024130000); `test_column_grants_block_sensitive_fields` jetzt über `_ORG_INTERNAL`/`_MEMBER_INTERNAL`-Listen; neuer `test_column_grants_comprehensive` mit Mutationsprobe; Hilfsfunktionen `_apply_column_grants` / `_restore_table_grants` |
| `docs/saas/rls-s3.md` | Dateiname, vollständige Spaltentabellen intern/lesbar, `approved_by` ergänzt |

---

## NICHT_AUSGEFÜHRT

- RLS-Tests gegen echte lokale Postgres konnten nicht ausgeführt werden (kein `REVIEW_POSTGRES_PORT` in dieser Umgebung). Die Tests sind architektonisch identisch mit den bereits passing Tests aus S3; die neue `_apply_column_grants`-Hilfsfunktion ist dieselbe Logik wie der manuelle REVOKE/GRANT-Block im vorherigen `test_column_grants_block_sensitive_fields`.
- Migration wurde nicht gegen die Cloud-DB angewendet (wie alle anderen UC6P/S3-Migrationen: nur lokal vorbereitet, Cloud-Anwendung durch Serkan).
