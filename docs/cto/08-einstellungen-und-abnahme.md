# 8. Einstellungen und Abnahme-Durchlauf (Stand 29.10.2026)

Diese Einstellungen kann nur Serkan in den Dashboards setzen. Ohne sie
funktioniert der Selbststart in Production nicht, auch mit dem neuen Code.

## A. Einstellungen (einmalig, ca. 15 Minuten)

**Geprüfter Ist-Zustand 29.10.:** In beiden Supabase-Projekten steht die Site URL
auf `http://localhost:3000`, und es gibt keine Redirect-URLs. Eigenes SMTP ist
aus. Folge heute: Bestätigungslinks aus dem Selbststart landen auf localhost.
„Passwort vergessen“-Mails stellt Supabase nur an Team-Mitglieder zu.

### 1. Supabase **Production** (`CampsPilot Production`, wkmckfbzhmihyfwiekct)
- Auth → URL Configuration → Site URL: `https://campspilot.vercel.app`
- Redirect URLs → Add: `https://campspilot.vercel.app/**`
- Auth → Emails → SMTP Settings → Enable custom SMTP (Brevo):
  Host `smtp-relay.brevo.com`, Port `587`, User = Brevo-SMTP-Login,
  Passwort = Brevo-SMTP-Schlüssel (Brevo → SMTP & API → SMTP),
  Absender `noreply@campspilot.app` (verifizierte Domain), Name `CampsPilot`.

### 2. Supabase **Staging** (`CampsPilot Staging`, asowsktznpiioaxerlta)
- Site URL: `https://campspilot-git-demo-jan-serkans-projects-a49183cd.vercel.app`
- Redirect URLs: `https://campspilot-git-demo-jan-serkans-projects-a49183cd.vercel.app/**`
- SMTP: wie Production (Brevo). Staging-Konten nutzen nur eigene Testadressen.

### 3. Render **campspilot-staging** → Environment
- `APP_ENV` = `staging` (steht heute `staging (Text)`)
- `NOTIFICATION_ALLOWED_RECIPIENTS` = `serkandurna48@gmail.com`
  (erlaubt auch `serkandurna48+irgendwas@gmail.com`)
- `FRONTEND_BASE_URL` = `https://campspilot-git-demo-jan-serkans-projects-a49183cd.vercel.app`

### 4. Render **campspilot-prod** → Environment
- `FRONTEND_BASE_URL` = `https://campspilot.vercel.app`
- Nicht setzen: `NOTIFICATION_ALLOWED_RECIPIENTS` (Production schickt echt).

### 5. Render → Account → Notifications
- Benachrichtigung bei „Service failed / unhealthy“ und „Deploy failed“ an
  Serkan (und später Ahmad) aktivieren. Das ist der Ausfall-Alarm für v1.

## B. Abnahme-Durchlauf auf Staging (ca. 15 Minuten)

Voraussetzung: A.2 und A.3 erledigt, PRs #41 und #42 gemergt, Render-Deploy
von `demo/jan` ist „Live“. Testadresse: `serkandurna48+v1test1@gmail.com`.

| # | Schritt | Erwartet |
|---|---|---|
| 1 | Staging-Vorschau `/campspilot/registrieren` öffnen, Testverein „V1 Testverein 1“ mit Testadresse registrieren | Hinweis „Bitte bestätigen Sie …“, Mail kommt an |
| 2 | Link in der Mail klicken | Landet auf `/pilot/v1-testverein-1/login` (nicht localhost) |
| 3 | Anmelden, Einrichtung durchlaufen, erstes Camp (2 Plätze) anlegen, zur Prüfung einreichen | Status „eingereicht“ |
| 4 | Als Plattform-Owner `/platform` → Verein freigeben | Freigabemail mit Login-Link kommt an |
| 5 | Camp veröffentlichen, Elternseite öffnen, 3 Testanmeldungen (Eltern-Mail `serkandurna48+eltern1/2/3@gmail.com`, Kind „Testkind“) | 2 × Bestätigung, 1 × Warteliste |
| 6 | Vereinsbereich → Teilnehmer → Anmeldung 2 stornieren | Mail „Anmeldung storniert“ an eltern2, Mail „Platz frei …“ an eltern3 |
| 7 | Eine Anmeldung mit Mail `test@example.com` (nicht freigegeben) anlegen, im Teilnehmerdetail ansehen | „Letzte Mail … nicht angekommen“, „Mail erneut senden“ zeigt Fehler |
| 8 | Export XLSX (Teilnehmer, Zahlungen) | Datei mit den Testkindern |
| 9 | Abmelden → „Passwort vergessen?“ → Mail → neues Passwort → Anmelden | Funktioniert, Link führt auf Staging |

**Fertig, wenn** alle 9 Schritte ohne Hilfe von außen klappen. Danach Release
nach Production (03, Schritt 6) und Schritt 1–4 einmal mit einem echten
Pilotverein wiederholen.
