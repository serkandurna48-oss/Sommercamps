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

## Kein eigener Backend-Schreibpfad (Stand heute)

Die JK-Seite ist **reine Vorschau** — es gibt kein Formular, das Daten an das Backend sendet.
"Trainingsanfrage stellen" und "Interesse an Mitgliedschaft" sind `mailto:`-Links. Der einzige
Backend-Kontakt ist ein lesender `GET /config`-Aufruf (geteilt mit KSV). Es entstehen keine
JK-Datensätze in der Datenbank.

## Geplant: Registration & Admin MVP

Folgeticket **CP-JK-101 ("Training Inquiry Flow")**: ein echtes Anfrageformular
(Training/Camp/Mitgliedschaftsinteresse), interne Benachrichtigung an eine noch zu klärende
E-Mail-Adresse. Danach ein Admin-Dashboard analog zu `frontend/app/admin/page.tsx` für JK.
Voraussetzung laut Umsetzungsplan: Paket und Preis mit Jan final bestätigt, bevor bezahlte
Infrastruktur aufgesetzt wird.

## Geplant: getrennte Infrastruktur

Sobald der echte Anfrage-Flow ansteht, ist eine **von KSV vollständig isolierte**
Infrastruktur vorgesehen (eigenes Supabase-Projekt, eigener Render-Service) — kein geteilter
Tenant-Zustand wie heute. Diese Trennung existiert noch nicht.

Vollständiger Plan inkl. Phasenschätzungen: `docs/onboarding/jk-implementation-plan-after-yes.md`.
Weitere Onboarding-Dokumente unter `docs/onboarding/`. Beide liegen aktuell nur auf Branch
`cp-s308-light-jk-draft`, noch nicht auf `main` — daher hier ohne Link.
