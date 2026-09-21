# Kundenkontext: JK Performance Academy

> Enthält keine Zugangsdaten oder geheimen Werte. Kontaktdaten in
> `frontend/app/lib/clubConfig.jk.tsx` sind zum Zeitpunkt dieses Dokuments größtenteils noch
> Platzhalter (siehe Datei) — kein Hinweis darauf, welche davon inzwischen final sind.

## Status: Landingpage-Draft / Preview

JK Performance Academy ist der zweite Kunde des Systems, aktuell im Vorschau-Status.
Serkan und Jan (JK) haben sich zur Zusammenarbeit geeinigt; Umfang und Zeitplan des Ausbaus
sind im internen Umsetzungsplan festgehalten (siehe unten).

## Technischer Zugang

- **Vercel-Projekt:** `jkperformance` (separates Projekt, nicht das KSV-Vercel-Projekt)
- **Branch:** `cp-s308-light-jk-draft` (noch nicht nach `main` gemerged)
- **Aktivierung:** Build-Zeit-Env-Var `NEXT_PUBLIC_ACTIVE_CLUB=jk` im Vercel-Projekt gesetzt
- **Lokal ansehen:** `NEXT_PUBLIC_ACTIVE_CLUB=jk` in `frontend/.env.local` setzen, `npm run dev`

Wie das technisch mit KSV zusammenhängt: [`docs/architecture/system-overview.md`](../architecture/system-overview.md).


## Geplant: Registration & Admin MVP

Folgeticket **CP-JK-101 ("Training Inquiry Flow")**: ein echtes Anfrageformular
(Training/Camp/Mitgliedschaftsinteresse), interne Benachrichtigung an eine noch zu klärende
E-Mail-Adresse. Danach ein Admin-Dashboard analog zu `frontend/app/admin/page.tsx` für JK.
Es gibt weiterhin **kein** Anmelde- oder Anfrageformular, das Daten an das Backend sendet —
"Trainingsanfrage stellen" und "Interesse an Mitgliedschaft" sind `mailto:`-Links, keine
API-Calls. Es entstehen dadurch keine JK-Datensätze.

## Abgeschlossen: getrennte Infrastruktur (JK-102)

Paket und Preis sind mit Jan final bestätigt. JK läuft jetzt auf **von KSV vollständig
isolierter** Infrastruktur: eigenes Supabase-Projekt, eigener Render-Service
(`sommercamps-1`) — kein geteilter Tenant-Zustand mehr. Verifiziert über `/health` (200, DB
erreichbar) und `/config` (200, liefert JK-eigene Werte, z.B.
`club_name: "JK Performance Academy"`). Der einzige Backend-Kontakt von JK aus bleibt der
lesende `GET /config`-Aufruf — jetzt gegen den eigenen, isolierten JK-Service statt gegen KSV.
Details inkl. Rollback: [`docs/onboarding/jk-infrastructure-setup.md`](../onboarding/jk-infrastructure-setup.md).

Vollständiger Plan inkl. Phasenschätzungen: `docs/onboarding/jk-implementation-plan-after-yes.md`.
Weitere Onboarding-Dokumente unter `docs/onboarding/`. Beide liegen aktuell nur auf Branch
`cp-s308-light-jk-draft`, noch nicht auf `main` — daher hier ohne Link.
