# Go-Live Welle 2 — CampsPilot SaaS

> Abendlicher Live-Gang mit Serkan. Reihenfolge ist verbindlich.
> Schemaänderungen immer **vor** dem Code-Deploy, weil `repositories/organizations.py`
> die Trainer-Spalten (`trainer_image_url`, `trainer_text`) bereits liest.

---

## 1. Vorbedingungen

- [ ] **Backup / Snapshot** der Live-Datenbank  
  Supabase Dashboard → Projekt „CampsPilot SaaS" → Database → Backups → Create backup.  
  SHA oder Backup-ID notieren.

- [ ] **Rollen-Check** (Verbindungsrolle, RLS-Flags, Policy-Bestand)  
  Im Supabase SQL-Editor ausführen:

  ```sql
  -- backend_saas/scripts/check_db_role.sql
  -- Zeigt Rolle, RLS-Flags und Policy-Anzahl je Tabelle.
  -- Keine Daten, keine Änderung.
  ```

  → Datei: `backend_saas/scripts/check_db_role.sql`

- [ ] **Policy-Bestand prüfen** (Fremdpolicies erkennen, bevor die RLS-Migration läuft)  
  Im Supabase SQL-Editor ausführen:

  ```sql
  -- supabase/check_db_role.sql
  -- Gibt Zeilen zurück, wenn Policies ohne s3_-Präfix existieren.
  -- Migration würde sonst sofort abbrechen.
  ```

  → Datei: `supabase/check_db_role.sql`  
  Gibt die Abfrage Zeilen zurück: **Stop**, mit Serkan entscheiden (Fremdpolicy entfernen oder umbenennen).

---

## 2. Reihenfolge der Schritte

| # | Wer | Schritt | Prüfung |
|---|---|---|---|
| 1 | Serkan | Migrations 1–3 auf Prod anwenden (SQL-Editor, **vor** Deploy) | Spalten-Check (siehe unten) |
| 2 | Serkan | Render Deploy starten (Branch `integration/welle2` oder freigegebener SHA) | `/health` → 200 |
| 3 | Serkan | Env-Vars prüfen (siehe Abschnitt 3) | Backend-Log zeigt keinen FakeProvider-Hinweis |
| 4 | Beide | Abnahme durchführen (siehe Abschnitt 4) | Checkliste unten |

### Migrationen in dieser Reihenfolge anwenden

```sql
-- 1. E-Mail-Tracking (idempotent, IF NOT EXISTS)
-- Datei: supabase/migrations/20261018000000_add_email_tracking_to_camp_registrations.sql
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error   TEXT;
```

Prüfung nach Schritt 1:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'camp_registrations'
  AND column_name IN ('email_sent_at', 'email_error');
-- Erwartung: 2 Zeilen
```

```sql
-- 2. RLS-Lesepolicies (wiederholbar: DROP IF EXISTS + CREATE)
-- Datei: supabase/migrations/20261018154831_tenant_read_policies.sql
-- Bricht sofort ab, wenn Fremdpolicies ohne s3_-Präfix existieren.
-- → Vorbedingung Schritt "Policy-Bestand prüfen" beachten.
```

Prüfung nach Schritt 2:
```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE 's3\_%' ESCAPE '\'
ORDER BY tablename;
-- Erwartung: 6 Zeilen (eine Policy je Tabelle)
```

```sql
-- 3. Trainer-Spalten (idempotent, IF NOT EXISTS)
-- Datei: supabase/migrations/20261019203000_org_trainer.sql
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS trainer_image_url text,
    ADD COLUMN IF NOT EXISTS trainer_text text;
```

Prüfung nach Schritt 3:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('trainer_image_url', 'trainer_text');
-- Erwartung: 2 Zeilen
```

---

## 3. Env-Prüfliste Backend (Render)

Render Dashboard → Service → Environment → Variable prüfen/setzen.  
Keine Werte in dieses Dokument eintragen.

| Variable | Erwarteter Wert |
|---|---|
| `NOTIFICATION_PROVIDER` | `brevo` |
| `BREVO_API_KEY` | *(Key im Render-Dashboard hinterlegt — Name des Render-Secrets)* |
| `NOTIFICATION_FROM_EMAIL` | Adresse der verifizierten Brevo-Domain |

---

## 4. Abnahme nach Live-Gang

- [ ] **Health:** `GET /health` → 200, kein FakeProvider-Hinweis im Log
- [ ] **Öffentliche Elternseite JK:** `/pilot/jk-performance-academy` → lädt, kein 404/500
- [ ] **Öffentliche Elternseite KSV:** öffentliche Anmeldeseite (falls konfiguriert) → lädt
- [ ] **Testanmeldung** (ausschließlich mit synthetischen Daten, E-Mails `@campspilot.example`):
  - Vollständige Anmeldung über die Elternstrecke durchführen
  - Bestätigungsmail im Postfach prüfen (Absenderadresse, kein Spam)
  - Anschließende **Bereinigung nach L3e-Verfahren** (Testdatensatz aus `camp_registrations` entfernen, Serkan führt das Lösch-SQL selbst aus)
- [ ] **Admin-Login:** Supabase-Auth-Login als bekannter Org-Admin → Vereinsübersicht sichtbar

---

## 5. Rollback

Falls kritischer Fehler unmittelbar nach Live-Gang:

**Code zurück auf `08ab24d`:**
```
Render Dashboard → Service → Deploys → Commit 08ab24d → Redeploy
```

**Schemaänderungen sind additiv** — die neuen Spalten (`email_error`, `trainer_image_url`,
`trainer_text`) stören keinen alten Code. Es reicht, den Code-Stand zurückzusetzen.

**Nur wenn die RLS-Policies explizit zurückgenommen werden müssen:**

```sql
-- Rollback RLS-Welle-2-Policies (nur nach Absprache mit Serkan ausführen)
DROP POLICY IF EXISTS s3_owner_self_read      ON public.platform_owners;
DROP POLICY IF EXISTS s3_membership_self_read ON public.organization_members;
DROP POLICY IF EXISTS s3_organization_read    ON public.organizations;
DROP POLICY IF EXISTS s3_camp_read            ON public.camps;
DROP POLICY IF EXISTS s3_registration_read    ON public.camp_registrations;
DROP POLICY IF EXISTS s3_audit_owner_read     ON public.audit_log;
```

> Die neuen Spalten (`email_error`, `trainer_image_url`, `trainer_text`) können stehen
> bleiben — sie sind nullable und stören keine bestehenden Abfragen.

---

## 6. Offene Punkte (vor Freigabe zu klären)

| ID | Thema | Zuständig |
|---|---|---|
| REVIEW-C9 B3 | Texte Trainer-Abschnitt (Elternseite) — Formulierung freigeben | Serkan / Jan |
| REVIEW-C9 B4 | Texte Datenschutz/Impressum Trainer-Kontext — Formulierung freigeben | Serkan / Jan |

Diese Punkte blockieren den Live-Gang, wenn die betreffenden Texte für Endnutzer sichtbar
sind. Vor Abnahme klären und Freigabe dokumentieren.
