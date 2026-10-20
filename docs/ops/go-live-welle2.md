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
  -- Backend-Rolle muss RLS umgehen, sonst bricht das Backend nach der RLS-Datei.
  SELECT rolname, rolbypassrls FROM pg_roles
  WHERE rolname IN ('postgres','service_role','authenticator');
  -- Erwartung: postgres = true, service_role = true (wie auf Staging am 20.10.)
  ```

- [ ] **Policy-Bestand prüfen** (Fremdpolicies erkennen, bevor die RLS-Datei läuft)  
  Im Supabase SQL-Editor ausführen:

  ```sql
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('platform_owners','organization_members','organizations',
                      'camps','camp_registrations','audit_log')
    AND policyname NOT LIKE 's3\_%' ESCAPE '\'
  ORDER BY tablename, policyname;
  -- Erwartung: 0 Zeilen
  ```

  Gibt die Abfrage Zeilen zurück: **Stop**, mit Serkan entscheiden (Fremdpolicy entfernen oder umbenennen).
  Zusätzlich vorhandene `s3_*`-Policies werden von der Datei nicht geprüft – Liste aller Policies einmal ansehen.

---

## 2. Reihenfolge der Schritte

| # | Wer | Schritt | Prüfung |
|---|---|---|---|
| 1 | Serkan | Migrations 1–3 auf Prod anwenden (SQL-Editor, **vor** Deploy; dieselbe Ein-Transaktions-Datei wie auf Staging: `_reports/staging/2-migrationen-welle2.sql`) | Spalten-Check (siehe unten) |
| 2 | Serkan | Freigegebenen welle2-SHA auf `feat/platform-foundation` bringen (davon deployt Render „Sommercamps“ und Vercel Prod) | Render-Deploy grün, `/health` → 200 |
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
| `APP_ENV` | nicht `local`/`test` (sonst wird fehlende Mail-Konfiguration nur still übersprungen) |
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

## Nachtrag F1: Eigene Teilnahmebedingungen je Anbieter

**Vor dem Code-Deploy dieser Änderung anwenden.**

```sql
-- Datei: supabase/migrations/20261020170000_org_terms_text.sql
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS terms_text text;
```

Prüfabfrage (Spalte vorhanden):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name = 'terms_text';
-- Erwartung: 1 Zeile
```

---

## 6. Offene Punkte (vor Freigabe zu klären)

| ID | Thema | Stand |
|---|---|---|
| REVIEW-C9 B1/B2/B7 | Mailversand (httpx, ehrlicher Versandnachweis, Mandantenfilter) | K1 behoben |
| REVIEW-C9 B5/B6 | Externe Logos, Wartelisten-Bestätigung | K2 behoben |
| REVIEW-C9 B3 | Bestätigungsseite/Mail/Teilnahmebedingungen einheitlich; keine festen Konditionen (Entscheidung Serkan 20.10.: Bedingungen legt der Anbieter fest, Mail ist Pflicht) | K3 |
| REVIEW-C9 B4 | Datenschutz: Brevo als Dienstleister, Admin-Lesezugriff | K3 |
| AVV | AVV mit Brevo (Unterauftragsverarbeiter) annehmen; Brevo im AVV mit den Vereinen nennen | Serkan |
| Mail-Test | Echte Testmail auf Staging an synthetische/eigene Adresse angekommen | vor Live-Gang |

Bei der RLS-Rücknahme bleibt RLS auf den Tabellen aktiviert; das Backend umgeht RLS (rolbypassrls), direkte Client-Lesezugriffe sind dann gesperrt.
