# Deployment-Checkliste

## Supabase (bereits eingerichtet)

- [ ] Schema ausgeführt: `backend/schema.sql` einmalig im Supabase SQL Editor ausführen
- [ ] Connection String: `Settings → Database → Connection string → URI (Transaction Pooler, Port 6543)`
- [ ] RLS aktiv: Insert public, Select/Update nur Service-Role-Key

---

## Render (Backend – FastAPI)

### Environment Variables im Render Dashboard setzen

| Variable | Wert | Wie generieren |
|---|---|---|
| `DATABASE_URL` | PostgreSQL-URI aus Supabase (Transaction Pooler, Port 6543) | Supabase Dashboard |
| `ADMIN_PASSWORD` | Das Admin-Passwort für den Browser-Login | Frei wählen, stark halten |
| `JWT_SECRET` | Zufälliger Geheimschlüssel zum Signieren der Session-Tokens | `openssl rand -hex 32` |
| `TOKEN_EXPIRE_HOURS` | Gültigkeit eines Session-Tokens in Stunden (optional, Standard: 24) | Frei wählen |
| `CORS_ORIGINS_EXTRA` | Vercel-URL des Frontends, z.B. `https://ksv-baunatal.vercel.app` | Nach Vercel-Deployment setzen |
| `STRIPE_SECRET_KEY` | Stripe Secret Key | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Signing Secret des Stripe-Webhook-Endpoints | Stripe Dashboard → Webhooks → Endpoint |
| `STRIPE_PRICE_CENTS` | Campbeitrag in Cent, z.B. `14900` = 149,00 € | Muss zum Stripe-Produktpreis passen |
| `FRONTEND_URL` | Vollständige Frontend-URL (für Stripe-Redirect) | z.B. `https://ksv-baunatal.vercel.app` |
| `BREVO_API_KEY` | API-Key aus dem Brevo Dashboard | Brevo → Settings → API Keys |
| `EMAIL_FROM` | Absender-E-Mail (muss in Brevo verifiziert sein) | z.B. `info@ksv-baunatal.de` |
| `EMAIL_FROM_NAME` | Anzeigename des Absenders | z.B. `Fußballschule KSV Baunatal` |
| `EMAIL_REPLY_TO` | Reply-To der Bestätigungsmail (optional; Standard: `CONTACT_EMAIL`) | z.B. `info@ksv-baunatal.de` |
| `CONTACT_EMAIL` | Kontaktadresse in der Mail-Signatur | z.B. `info@ksv-baunatal.de` |
| `BANK_ACCOUNT_HOLDER` | Kontoinhaber für den Überweisungshinweis in der Bestätigungsmail | z.B. `KSV Baunatal e.V.` |
| `BANK_IBAN` | IBAN für den Überweisungshinweis | — |
| `BANK_BIC` | BIC für den Überweisungshinweis | — |
| `BANK_NAME` | Bankname für den Überweisungshinweis | z.B. `Sparkasse Baunatal` |

> **E-Mail-, Stripe- und Bank-Vars sind optional.** Fehlen sie, läuft das Backend normal weiter —
> Mailversand/Checkout/Bankdaten-Anzeige werden nur übersprungen bzw. zeigen einen Platzhalter-Hinweis.
> Kein Crash. Diese Tabelle ist die vollständige Referenz; `render.yaml` selbst listet aus
> historischen Gründen nur einen Teil der Variablen — Production-Werte werden aktuell manuell im
> Render-Dashboard gepflegt und nicht in `render.yaml` synchronisiert.

> **ADMIN_PASSWORD** ist das Passwort, das du / dein Kollege im Browser auf `/admin` eingibt.
> Es landet **nie** im Frontend-Code oder im Repo — nur auf Render.
>
> **JWT_SECRET** ist intern und wird nur vom Backend verwendet, um Session-Tokens zu signieren.
> Wähle einen langen, zufälligen String und teile ihn mit niemandem.
>
> **CORS_ORIGINS_EXTRA** erst setzen, nachdem die Vercel-URL bekannt ist.
> Ohne diese Variable lehnt das Backend alle Requests vom Produktions-Frontend ab (CORS-Fehler).

### Deployment
- Root Directory: `backend/`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Region: Frankfurt (EU)

---

## Vercel (Frontend – Next.js)

### Environment Variables im Vercel Dashboard setzen

| Variable | Wert |
|---|---|
| `NEXT_PUBLIC_API_URL` | Render-URL deines Backends, z.B. `https://ksv-baunatal-backend.onrender.com` |

> Kein Admin-Passwort oder JWT-Secret nötig im Frontend — nur die Backend-URL.
>
> Nach dem Setzen: Neues Deployment triggern (Redeploy), damit die Variable eingebettet wird.

### Deployment
- Root Directory: `frontend/`
- Framework Preset: Next.js (automatisch erkannt)
- Build Command: `npm run build` (Standard)
- Output Directory: `.next` (Standard)

---

## Reihenfolge beim ersten Deployment

1. Supabase: Schema ausführen
2. Render: `DATABASE_URL`, `ADMIN_PASSWORD`, `JWT_SECRET` setzen → deployen → Render-URL merken
3. Vercel: `NEXT_PUBLIC_API_URL` auf Render-URL setzen → deployen → Vercel-URL merken
4. Render: `CORS_ORIGINS_EXTRA` auf Vercel-URL setzen → Render-Service neu starten
5. Test: Formular auf Vercel aufrufen, Anmeldung einreichen, auf `/admin` mit Passwort einloggen

---

## Admin-Zugang

- URL: `https://deine-vercel-url.vercel.app/admin`
- Login: Das `ADMIN_PASSWORD` aus Render (kein API-Key, normales Passwort)
- Das Session-Token ist **24 Stunden gültig** und wird danach automatisch ungültig
- "Abmelden" löscht das Token sofort aus dem Browser
- Dein Kollege braucht nur das `ADMIN_PASSWORD` — kein technisches Wissen über API-Keys

---

## Lokaler Test

```bash
# PyJWT installieren (einmalig nach requirements-Update)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (neues Terminal)
cd frontend
npm install
npm run dev
```

Frontend:        http://localhost:3000
Backend API-Docs: http://localhost:8000/docs
Admin:           http://localhost:3000/admin

### Login lokal testen

1. `backend/.env` — `ADMIN_PASSWORD` und `JWT_SECRET` eintragen (Platzhalter durch echte Werte ersetzen)
2. Backend starten → `http://localhost:8000/docs` → `POST /admin/login` aufrufen
3. Oder direkt `/admin` im Browser aufrufen und Passwort eingeben

---

## Brevo einrichten (Phase 2 – E-Mail)

### Einmalige Einrichtung

1. Konto erstellen: [app.brevo.com](https://app.brevo.com)
2. Absender-E-Mail verifizieren: **Settings → Senders & IP → Senders → Add a sender**
   - Beliebige E-Mail-Adresse eintragen (z.B. `info@ksv-baunatal.de`)
   - Brevo schickt einen Bestätigungslink an diese Adresse
   - Link anklicken → Absender ist verifiziert
   - Kein DNS-Eintrag nötig für diese einfache Sender-Verifizierung
3. API-Key erstellen: **Settings → API Keys → Generate a new API key**
4. Key in Render als `BREVO_API_KEY` setzen

### Lokal testen ohne API-Key

`BREVO_API_KEY` und `EMAIL_FROM` einfach leer lassen (oder gar nicht in `.env` eintragen).
Das Backend startet normal, loggt nur: `E-Mail-Versand übersprungen: BREVO_API_KEY oder EMAIL_FROM nicht konfiguriert.`

### Lokal testen mit API-Key

1. `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `CONTACT_EMAIL` in `backend/.env` eintragen
2. Backend neu starten
3. Formular ausfüllen → absenden
4. Backend-Terminal zeigt: `Bestätigungsmail gesendet und email_sent_at gesetzt für Anmeldung id=...`
5. Postfach der eingetragenen E-Mail prüfen
6. In `/admin` → Mail-Spalte zeigt ✓

---

## Backup & Restore

**Aktueller Stand: kein aktives Backup-Abo, keine PITR-Konfiguration bestätigt.**
Supabase läuft aktuell im **Free-Tier** — dort gibt es keine garantierten automatischen
Backups mit Retention. Vor jeder riskanten Aktion (Migration, Bulk-Update) selbst ein Backup
ziehen:

```bash
# Manuelles Backup der einzigen Kerntabelle (via psql, mit DATABASE_URL aus Render)
pg_dump "$DATABASE_URL" --table=camp_registrations --format=custom --file=camp_registrations_backup.dump

# Restore (im Notfall, nur gegen eine leere/neue Tabelle)
pg_restore --dbname="$DATABASE_URL" camp_registrations_backup.dump
```

Alternativ: Supabase Dashboard → **Database → Backups** (Snapshot-Funktion, sofern im
aktuellen Plan verfügbar — im Free-Tier eingeschränkt, im Zweifel im Dashboard prüfen).

**Konvention für alle zukünftigen `migration_*.sql`-Dateien:** Jede Migration, die Daten
verändert (nicht nur Schema/Constraints), bekommt einen Kommentar-Block am Dateianfang nach
dem Vorbild von `migration_fix_age_constraint.sql`:

```sql
-- VOR ANWENDUNG: Supabase-Snapshot nehmen (Dashboard → Database → Backups)
-- oder: pg_dump "$DATABASE_URL" --table=camp_registrations --format=custom --file=vor_migration_xy.dump
```

---

## Monitoring & Rollback

**Aktueller Stand: kein aktives Monitoring/Alerting.** Kein Sentry, kein Uptime-Check, keine
Slack-/E-Mail-Alarme bei Fehlern — das ist eine bewusste Lücke, kein Versehen. Das Backend
liefert einen einfachen Health-Check:

```bash
curl https://<deine-render-url>/health
# {"status": "ok", "database": "reachable"}  (200)
# {"status": "error", "database": "unavailable"}  (503, keine Detail-Preisgabe mehr seit CP-S206)
```

- **Empfehlung (nicht Teil dieses Checks, nur Backlog-Hinweis):** externer Uptime-Ping auf
  `/health` (z.B. per kostenlosem Cron-Ping-Dienst), da Render Free-Tier-Services bei
  Inaktivität in den Ruhezustand gehen und der erste Request danach langsam ist (Cold Start).

**Rollback:**
- **Render:** Dashboard → Service → **Deploys** → älteren erfolgreichen Deploy auswählen →
  **Redeploy**. Kein CLI-Rollback nötig.
- **Vercel:** Dashboard → Deployments → älteres Deployment → **Promote to Production**.
- **Datenbank:** kein automatischer Rollback-Mechanismus — siehe Backup & Restore oben.

---

## Rough Monthly Cost (grobe Kostenübersicht)

> Zahlen sind Richtwerte, keine Rechnungsgarantie. Vor Budget-Entscheidungen im jeweiligen
> Dashboard bestätigen.

| Dienst | Aktueller Tier (Stand dieses Checks) | Ca. Kosten/Monat |
|---|---|---|
| Render (Backend) | Paid-Plan (~7 €), **`render.yaml` sagt weiterhin `free`** — Datei ist hier veraltet gegenüber der tatsächlichen Konfiguration | ~7 € |
| Vercel (Frontend) | Free/Hobby (im Dashboard bestätigen) | 0 € |
| Supabase (DB) | Free-Tier | 0 € |
| Brevo (E-Mail) | vermutlich Free-Tier (im Dashboard bestätigen), Limit i.d.R. 300 Mails/Tag | 0 € |
| Stripe (Zahlungen) | Kein Fixpreis — nur Transaktionsgebühr (~1,5 % + 0,25 € pro europäischer Kartenzahlung), nur relevant wenn Online-Zahlung aktiv genutzt wird | variabel, transaktionsabhängig |

**Gesamt (fix, ohne Stripe-Transaktionsgebühren): ca. 7 €/Monat**, solange Vercel/Supabase/Brevo
auf den kostenlosen Stufen bleiben. Bei steigendem Anmeldevolumen zuerst Brevo-Sendelimit
(300/Tag) und Supabase-Free-Tier-Grenzen (Storage/Bandbreite) im Auge behalten.

> Hinweis: `backend/render.yaml:6` listet weiterhin `plan: free` — dies wurde bewusst **nicht**
> im Rahmen von CP-S206 korrigiert, da render.yaml aktuell nicht als Quelle der Wahrheit für
> Produktionswerte dient (siehe Env-Var-Hinweis oben). Falls `render.yaml` jemals wieder als
> Deploy-Quelle genutzt wird, muss der Plan-Wert vorher angeglichen werden.

---

## Pre-Deploy Checklist

Vor jedem Produktions-Deployment (Backend oder Frontend):

- [ ] Alle benötigten Env-Vars in Render **und** Vercel gesetzt (siehe Tabellen oben) —
      insbesondere nach dem Hinzufügen neuer Vars im Code
- [ ] Migrationen (falls neue vorhanden) in der richtigen Reihenfolge gegen Supabase ausgeführt,
      **vorher Backup gezogen** (siehe Backup & Restore)
- [ ] `python -m py_compile backend/main.py`, `npm run lint`, `npx tsc --noEmit`, `npm run build`
      laufen lokal grün
- [ ] `/health`-Endpunkt nach Deploy manuell geprüft (`curl .../health` → `200 ok`)
- [ ] Stripe-Webhook-Endpoint (falls Backend-URL sich geändert hat) im Stripe-Dashboard auf die
      neue Render-URL aktualisiert
- [ ] `CORS_ORIGINS_EXTRA` enthält die aktuelle Vercel-Produktions-URL
- [ ] Kurzer manueller Smoke-Test: Anmeldung einreichen → in `/admin` sichtbar → Login mit
      `ADMIN_PASSWORD` funktioniert
