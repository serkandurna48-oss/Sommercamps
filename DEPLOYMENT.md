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
| `CORS_ORIGINS_EXTRA` | Vercel-URL des Frontends, z.B. `https://ksv-baunatal.vercel.app` | Nach Vercel-Deployment setzen |
| `BREVO_API_KEY` | API-Key aus dem Brevo Dashboard | Brevo → Settings → API Keys |
| `EMAIL_FROM` | Absender-E-Mail (muss in Brevo verifiziert sein) | z.B. `info@ksv-baunatal.de` |
| `EMAIL_FROM_NAME` | Anzeigename des Absenders | z.B. `Fußballschule KSV Baunatal` |
| `CONTACT_EMAIL` | Kontaktadresse in der Mail-Signatur | z.B. `info@ksv-baunatal.de` |

> **E-Mail-Vars sind optional.** Wenn `BREVO_API_KEY` oder `EMAIL_FROM` nicht gesetzt sind,
> läuft das Backend normal — Mailversand wird nur übersprungen. Kein Crash.

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
4. Backend-Terminal zeigt: `Bestätigungsmail gesendet und email_sent_at gesetzt für ...`
5. Postfach der eingetragenen E-Mail prüfen
6. In `/admin` → Mail-Spalte zeigt ✓
