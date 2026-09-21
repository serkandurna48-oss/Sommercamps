# JK Performance Academy — Isolierte Infrastruktur (JK-102)

> Ticket: JK-102 – Isolierte JK-Infrastruktur. Ziel: JK technisch vollständig von der
> produktiven KSV-Infrastruktur trennen (eigenes Supabase-Projekt, eigener Render-Service,
> eigene Env-Vars), bevor der echte Anfrage-Flow (JK-104) gebaut wird.
>
> Diese Anleitung ergänzt [`DEPLOYMENT.md`](../../DEPLOYMENT.md) um die JK-spezifischen
> Schritte. Kontext: [`docs/customers/jk-performance.md`](../customers/jk-performance.md),
> [`docs/architecture/system-overview.md`](../architecture/system-overview.md).
>
> **Kein Code-Änderungsbedarf für die Isolierung selbst:** Backend und Frontend sind bereits
> vollständig club-agnostisch konfigurierbar (`CLUB_NAME`, `CLUB_SUBTITLE`, `CAMP_YEAR`,
> `CLUB_LEGAL_NAME` als Env-Vars im Backend; `NEXT_PUBLIC_ACTIVE_CLUB=jk` im Frontend). Dieselbe
> Codebase läuft 1:1 als zweiter, komplett getrennter Service.
>
> **Wichtig:** Alle Schritte unten laufen ausschließlich in den jeweiligen Plattform-Dashboards
> (Supabase, Render, Vercel) — Secrets verlassen die Dashboards nicht, landen nie im Repo.

## Reihenfolge

### 1. Supabase — eigenes JK-Projekt

- [x] Neues Supabase-Projekt anlegen (eigener Projektname, z.B. `jk-performance-academy`),
      Region **Frankfurt/EU** wählen (DSGVO)
- [x] **`schema.sql` allein reicht nicht** — es ist veraltet gegenüber dem, was `main.py`
      braucht (fehlende Spalten `photo_permission`/`paid_at`, fehlender `'cancelled'`-Wert bei
      `payment_status`, veraltete `birth_date`-Constraint). Im SQL Editor des **neuen** Projekts
      in genau dieser Reihenfolge ausführen:
      1. `backend/schema.sql`
      2. `backend/migration_phase1.sql` (redundant, `schema.sql` hat die Spalten schon —
         schadet wegen `IF NOT EXISTS` nicht, hält aber die Reihenfolge konsistent mit der
         echten Migrationshistorie)
      3. `backend/migration_phase2.sql` (**notwendig** — ergänzt `photo_permission`,
         `paid_at` und `'cancelled'` als erlaubten `payment_status`-Wert; ohne das schlagen
         Insert bzw. Admin-Storno fehl)
      4. `backend/migration_phase3.sql` (redundant, gleicher Grund wie Schritt 2)
      5. `backend/migration_jersey_sizes.sql` (redundant, `schema.sql` hat bereits die
         finalen Trikotgrößen-Werte)
      6. `backend/migration_fix_age_constraint.sql` (**notwendig** — ersetzt die veraltete
         `chk_birth_date_range`-Constraint (5–18 Jahre) durch die aktuelle
         `chk_birth_date_plausible`-Plausibilitätsprüfung)
- [x] **Keine produktiven KSV-Daten kopieren** — das neue Projekt bleibt leer, keine
      `camp_registrations`-Zeilen aus der KSV-DB übertragen
- [x] Connection String holen: `Settings → Database → Connection string → URI
      (Transaction Pooler, Port 6543)` — **nicht** Session Pooler (Port 5432), siehe
      `CLAUDE.md` Fallstrick #2
- [ ] RLS-Status prüfen: Insert public, Select/Update nur Service-Role-Key (wie bei KSV)

### 2. Render — eigener JK-Service

- [x] Neuen Web Service anlegen, **eigener Name** (z.B. `jk-performance-backend`) — nicht den
      bestehenden `ksv-baunatal-backend`-Service wiederverwenden oder umbenennen
- [x] Root Directory: `backend/`
- [x] Build Command: `pip install -r requirements.txt`
- [x] Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- [x] Region: Frankfurt (EU)
- [x] Env-Vars setzen (Werte siehe Tabelle unten)
- [x] Deployen, Render-URL merken (z.B. `https://jk-performance-backend.onrender.com`)

#### Env-Vars für den JK-Render-Service

| Variable | Wert | Hinweis |
|---|---|---|
| `DATABASE_URL` | Connection String aus Schritt 1 (JK-Supabase, Port 6543) | **muss** auf das neue JK-Projekt zeigen, nicht auf KSV |
| `ADMIN_PASSWORD` | eigenes Passwort für JK-Admin-Login | unabhängig vom KSV-Passwort |
| `JWT_SECRET` | eigener Zufalls-String (`openssl rand -hex 32`) | **nicht** mit KSV teilen |
| `CLUB_NAME` | `JK Performance Academy` | erscheint in API-Titel, E-Mail-Templates |
| `CLUB_SUBTITLE` | `Talententwicklung` | siehe `clubConfig.jk.tsx` |
| `CAMP_YEAR` | aktuelles Jahr | analog KSV |
| `CLUB_LEGAL_NAME` | finaler Rechtsname, sobald von Jan bestätigt | Platzhalter bis dahin möglich |
| `CORS_ORIGINS_EXTRA` | Vercel-URL des `jkperformance`-Projekts | nach Schritt 3 setzen |
| `STRIPE_PRICE_CENTS` | vorläufig `0` oder Platzhalterwert | `GET /config` liefert 503, solange `<= 0` — siehe Hinweis unten |
| `FRONTEND_URL` | Vercel-URL des `jkperformance`-Projekts | nur relevant, sobald Stripe/E-Mail-Links aktiv sind |

> **`STRIPE_*`-, `BREVO_*`- und `BANK_*`-Vars** sind wie bei KSV optional — solange kein echter
> Anfrage-/Zahlungs-Flow existiert (JK-104 ist ein Folgeticket), können sie leer bleiben. Eine
> Ausnahme: `STRIPE_PRICE_CENTS` muss auf einen Wert `> 0` gesetzt werden, sonst antwortet
> `GET /config` mit `503` (siehe `main.py:841-846`) — für den reinen Verbindungstest reicht ein
> Platzhalterwert wie `1` oder der bereits verhandelte Preis in Cent.

### 3. Vercel — `jkperformance`-Projekt umstellen

- [x] Im bestehenden `jkperformance`-Vercel-Projekt: `NEXT_PUBLIC_API_URL` von der
      **geteilten KSV-Render-URL** auf die **neue JK-Render-URL** (Schritt 2) ändern
- [x] `NEXT_PUBLIC_ACTIVE_CLUB=jk` bleibt unverändert gesetzt
- [x] Redeploy triggern, damit die neue Env-Var eingebettet wird
- [x] **KSV-Vercel-Projekt bleibt unverändert** — zeigt weiterhin auf `ksv-baunatal-backend`

### 4. Verifikation (Health Check & Verbindungstest)

```bash
# 1. Health Check gegen den neuen JK-Service
curl https://jk-performance-backend.onrender.com/health
# erwartet: {"status": "ok", "database": "reachable"}

# 2. Config-Endpoint liefert JK-Werte, nicht KSV-Werte
curl https://jk-performance-backend.onrender.com/config
# erwartet: club_name = "JK Performance Academy", nicht "KSV Baunatal"
```

- [x] `jkperformance.vercel.app` im Browser öffnen, Netzwerk-Tab prüfen: Requests gehen an die
      **neue** JK-Render-URL, nicht mehr an die KSV-Render-URL
- [x] KSV-Produktivseite (`main`-Branch-Deployment) unverändert erreichbar, unverändertes
      Verhalten — kurzer Smoke-Test genügt (Formular lädt, `/config` liefert weiter KSV-Werte)

## Akzeptanzkriterien-Check

- **JK nutzt kein produktives KSV-Backend** → erfüllt nach Schritt 2+3 (eigener Render-Service,
  `NEXT_PUBLIC_API_URL` zeigt auf JK-Service)
- **JK nutzt keine produktive KSV-Datenbank** → erfüllt nach Schritt 1 (eigenes, leeres
  Supabase-Projekt)
- **Secrets ausschließlich in den Plattform-Dashboards** → erfüllt, sofern alle Werte aus der
  Env-Var-Tabelle oben ausschließlich im Render-Dashboard gesetzt werden (nicht in `.env`-Dateien
  committen)
- **Deployment und Rollback dokumentiert** → Deployment: Schritte 1–4 oben. Rollback: siehe
  unten

## Rollback

- **Vercel (`jkperformance`):** `NEXT_PUBLIC_API_URL` zurück auf die alte, geteilte
  KSV-Render-URL setzen und redeployen — JK fällt zurück in den reinen Preview-Zustand
  (`GET /config` geteilt mit KSV, kein eigener Schreibpfad). KSV-Vercel-Projekt ist davon nicht
  betroffen (separates Projekt, siehe `DEPLOYMENT.md` → Monitoring & Rollback).
- **Render (JK-Service):** Service im Dashboard pausieren oder löschen — betrifft ausschließlich
  den JK-Service, keine Auswirkung auf `ksv-baunatal-backend`.
- **Supabase (JK-Projekt):** Projekt bleibt bestehen oder wird gelöscht — komplett getrennt von
  der KSV-Datenbank, kein Risiko für KSV-Produktivdaten.

## Nach Abschluss

- [x] `docs/customers/jk-performance.md` aktualisieren: Abschnitt "Kein eigener
      Backend-Schreibpfad" entfällt, sobald der Verbindungstest steht (auch wenn JK-104 den
      echten Formular-Flow erst später liefert)
- [x] `docs/architecture/system-overview.md` aktualisieren: Abschnitt „Geplant: isolierte
      JK-Infrastruktur (Track B)" von Planungsstand auf umgesetzt setzen
- [x] Render-/Supabase-Projektnamen und finale JK-Render-URL hier ergänzen, sobald bekannt
      https://sommercamps-1.onrender.com
      https://yuapavqkmcuktendprik.supabase.co
      https://jkperformance.vercel.app/
      
