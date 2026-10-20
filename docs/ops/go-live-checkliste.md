# Go-Live-Checkliste — CampsPilot SaaS Backend

> Stand: T2-release. Reihenfolge ist verbindlich — Schritte bauen aufeinander auf.
> „Code" = kann automatisiert/scripted werden; „Serkan" = braucht Dashboard-Zugriff oder Entscheidung.

---

| # | Wer | Was | Prüfung |
|---|---|---|---|
| 1 | ~~Serkan~~ | ~~**Render „Sommercamps SaaS" auf bezahlten Plan** hochstufen (Free Plan schläft ein → nicht produktionstauglich). Render Dashboard → Service → Upgrade.~~ | **✓ erledigt** — Plan ist „Starter" (2026-10-18). Blueprint-Sync setzt nicht zurück (`render.yaml` trägt `plan: starter`). |
| 2 | Code | **Migration `20261018000000_add_email_tracking_to_camp_registrations.sql` auf Prod anwenden** — **vor** dem Deploy, nicht danach. Migration fügt `email_sent_at` und `email_error` an `camp_registrations` an. Supabase Dashboard → SQL Editor, oder `supabase db push --db-url <prod-url>`. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'camp_registrations' AND column_name IN ('email_sent_at','email_error');` gibt 2 Zeilen zurück. |
| 3 | Serkan | **Render-Env für Mail setzen**: `NOTIFICATION_PROVIDER=brevo`, `BREVO_API_KEY=<echter Key>`, `NOTIFICATION_FROM_EMAIL=<Absenderadresse der verifizierten Domain>`. Absendername ist dynamisch (`{Vereinsname} über CampsPilot`) — kein `NOTIFICATION_FROM_NAME` nötig. Render Dashboard → Service → Environment. | Backend-Log nach dem Neustart zeigt keinen FakeProvider-Hinweis; Test-Registrierung löst echte Mail aus, Absender lautet „[Vereinsname] über CampsPilot". |
| 3b | Serkan | **Absender-Domain in Brevo verifizieren (SPF/DKIM)** und `NOTIFICATION_FROM_EMAIL` auf eine Adresse dieser Domain setzen. Brevo Dashboard → Senders, Domains & Dedicated IPs → Add a domain. Ohne Verifikation landen Mails im Spam oder werden abgelehnt. | Brevo zeigt „Domain verified"; Test-Registrierung kommt durch SPF/DKIM-Check (z. B. Google Postmaster Tools oder Mail-Header prüfen). |
| 4 | Serkan | **`ADMIN_PASSWORD` und `JWT_SECRET` aus dem Render-Dashboard löschen** (wurden durch Supabase-Auth abgelöst, `b38ab98` und `render.yaml` enthalten sie nicht mehr). Falls noch gesetzt: Render Dashboard → Environment → jeweiligen Key löschen. | Render-Dashboard zeigt beide Keys nicht mehr. Backend startet weiterhin fehlerfrei (`/health` → 200). |
| 5 | Serkan | **Testdaten bereinigen** (eigene Freigabe erforderlich). Vor dem ersten echten Anmeldezeitraum alle Testregistrierungen aus `camp_registrations` entfernen. Supabase Dashboard → Table Editor oder SQL. | `SELECT count(*) FROM camp_registrations;` ergibt 0 (oder nur legitimierte Einträge). |
| 6 | Serkan | **Handy-Test: iPhone + Android**. Vollständige Anmeldung auf beiden Plattformen durchführen; Bestätigungsmail im Postfach prüfen. | HTTP 201 in Browser-DevTools; Bestätigungsmail erhalten. |
| 7 | Serkan | **AVV (Auftragsverarbeitungsvertrag)** mit Brevo abschließen, falls noch nicht vorhanden (DSGVO-Pflicht für Mailversand mit Personendaten). Brevo Dashboard → Compliance → DPA. | Signierter AVV liegt vor. |
| 8 | Serkan | **Rollback-Stand festhalten**: aktuellen Deploy-Commit-SHA notieren. Im Fehlerfall: Render Dashboard → Service → Deploys → vorherigen Commit deployen. | SHA bekannt und im Ticketsystem/Notiz festgehalten. |

---

## Welle 2 — zusätzliche Migrationen und Go-Live-Plan

Die ursprüngliche Checkliste oben deckt nur Schritt 2 (E-Mail-Tracking) ab.
Der vollständige Go-Live-Plan für Welle 2 (inkl. RLS-Policies, Trainer-Spalten,
Rollback-SQL, Abnahme-Checkliste und offene Punkte) liegt in:

- **[docs/ops/go-live-welle2.md](go-live-welle2.md)** — vollständige Checkliste für den
  Abend-Go-Live mit Serkan

Zusätzliche Migration in Welle 2 (nach Schritt 2 dieser Liste):
- `supabase/migrations/20261018154831_tenant_read_policies.sql` — RLS-Lesepolicies (S3)
- `supabase/migrations/20261019203000_org_trainer.sql` — Trainer-Bild und -Text auf
  `organizations` (Reihenfolge: Schemaänderungen vor Code-Deploy, da
  `repositories/organizations.py` diese Spalten bereits liest)

---

## Integrationssperre (aus KOORDINATION-jan.md)

`pilot/mail` darf erst in einen Stand mit Cloud-DB gemergt und deployed werden, **nachdem**
Schritt 2 (Migration auf Prod) abgeschlossen ist. Die Migration ist idempotent (IF NOT EXISTS),
aber die `email_sent_at`-Spalte muss vorhanden sein, bevor der Code sie schreibt.

---

## Rollback

Falls Deploy fehlschlägt oder kritischer Fehler unmittelbar nach Go-Live:

1. Render Dashboard → Service → Deploys → vorherigen Commit-SHA auswählen → Redeploy.
2. Falls Migration bereits auf Prod läuft und zurückgenommen werden muss: `ALTER TABLE camp_registrations DROP COLUMN IF EXISTS email_sent_at, DROP COLUMN IF EXISTS email_error;` — nur nach Absprache mit Serkan.
