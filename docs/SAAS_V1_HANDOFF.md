# CampsPilot SaaS v1 — Handoff (autonomer Sprint, 2026-09-23)

> Kompakt gehalten für den direkten Eigentest. Ausführlichere Architektur-
> Doku bleibt in [`docs/saas/architecture.md`](saas/architecture.md) und
> [`backend_saas/README.md`](../backend_saas/README.md) — die sind teils
> veraltet (siehe "Bekannte Fallstricke" unten), dieses Dokument beschreibt
> den tatsächlich geprüften Stand.

## 1. Ergebnis

**Teilweise testbereit.** Der komplette Ablauf Verein → Camp → Eltern-
Anmeldung → Admin-Verwaltung (Zahlung, Warteliste, Storno, Export) läuft
Ende-zu-Ende gegen echte Daten und wurde im Browser + per API verifiziert.
Ein echter Bug wurde gefunden und behoben (siehe unten). Zwei Punkte
bleiben offen: mobile Viewport-Verifikation war durch ein Tool-Problem
blockiert (nicht durch die App), und es gab kein produktives Kunden-
Onboarding (war auch nicht Auftrag).

## 2. Was in diesem Sprint tatsächlich geprüft und geändert wurde

### Gefundener und behobener Bug
- **Browser-Tab-Titel zeigte für jeden SaaS-Verein "KSV Baunatal –
  Fußballschule"** statt des echten Vereinsnamens. Ursache: das geteilte
  Root-Layout (`frontend/app/layout.tsx`) setzt einen hart codierten
  KSV-Titel, und keine `/pilot/[org]/...`-Route hatte bisher eigene
  Metadaten, die das überschreiben. Fix: `generateMetadata` in
  `frontend/app/pilot/[org]/page.tsx` (Eltern-Ansicht) und
  `frontend/app/pilot/[org]/(org-admin)/layout.tsx` (alle Admin-Seiten),
  lädt den echten Vereinsnamen dynamisch. Betrifft **nur** SaaS-Routen —
  `app/layout.tsx` selbst (von KSV/JK mitgenutzt) wurde nicht angefasst.
  Verifiziert: Tab-Titel zeigt jetzt korrekt "JK Demo – CampsPilot Test"
  bzw. "JK Demo – CampsPilot Test – Verwaltung".

### Falscher Alarm, der sich als Test-Infrastruktur-Problem herausstellte
Ein `--reload`-uvicorn-Prozess in dieser Sandbox-Umgebung hat Datei-
änderungen nicht zuverlässig erkannt (WatchFiles hat den Reload nie
ausgelöst) — dadurch lief `backend_saas` über weite Strecken der
Untersuchung mit veraltetem Code, obwohl der committete Code korrekt war
(bestätigt per Unit-Test und per direktem Funktionsaufruf). Zusätzlich lag
in dieser Windows-Umgebung auf Port 8000 ein fremder/hängender Prozess
(vermutlich Rest einer anderen Sitzung), der ebenfalls veralteten Code
auslieferte. Kein Anwendungsfehler — siehe "Bekannte Fallstricke" für den
Umgang damit.

### Neu: reproduzierbares Demo-Setup
`backend_saas/scripts/seed_demo.py` — ein eigenständiges, idempotentes
Skript (kein generisches Onboarding-Tool, Org-/Camp-/Registrierungsdaten
sind fest im Skript verankert, nicht per CLI umkonfigurierbar):
- Prüft vor jedem Schreibzugriff `GET /health` gegen `service ==
  "campspilot-saas-api"` — verweigert die Ausführung gegen einen fremden
  Dienst.
- Hartcodierter Blocklist-Check gegen die beiden echten Kunden-Slugs
  (`ksv-baunatal`, `jk-performance-academy`), die im selben Cloud-Projekt
  bereits existieren (aus früherem Onboarding, CP-S410) — dieses Skript
  kann sie technisch nicht treffen, der Check ist zusätzliche Absicherung.
- Legt Organisation + 2 Camps + 6 Anmeldungen über die echte Public-/
  Admin-API an (keine rohen SQL-Inserts) — nutzt also exakt dieselben
  Kapazitäts-/Wartelisten-/Validierungsregeln wie ein echter Eltern-Flow.
- Erneut ausführbar ohne Duplikate (prüft existierende `parent_email`s je
  Camp vor dem Anlegen).

### Kleinere, während der Live-Verifikation entdeckte Nicht-Bugs
- Die Zähl-Animation der Statistik-Kacheln (Warteliste/Aufgaben) zeigt
  kurzzeitig "0", bevor sie zur echten Zahl hochzählt — bei einem
  Screenshot mitten in der 0,8s-Animation sieht das wie ein Datenfehler
  aus, ist aber die (bereits in der vorherigen Sitzung robust gemachte)
  beabsichtigte Animation. Bestätigt durch mehrfaches Warten + Neuladen.
- Ein Klick über die Referenz-ID des Browser-Automatisierungstools auf
  "Als bezahlt markieren" hatte gelegentlich keine Wirkung; ein Klick auf
  dieselbe Koordinate funktionierte zuverlässig, und die Server-Logs
  zeigen die Server-Action tatsächlich ausgeführt. Automatisierungs-
  Artefakt, kein App-Fehler — ein echter Mausklick ist davon nicht
  betroffen.

## 3. URLs

Lokal, mit laufenden Diensten (siehe Startbefehle unten):

- **Eltern-Ansicht (Demo-Verein):**
  `http://localhost:3000/pilot/jk-demo-campspilot-test`
- **Admin-Login (Demo-Verein):**
  `http://localhost:3000/pilot/jk-demo-campspilot-test/login`
- **Admin-Dashboard (nach Login):**
  `http://localhost:3000/pilot/jk-demo-campspilot-test/dashboard`
- **Backend-API-Doku:** `http://localhost:8001/docs`

## 4. Startbefehle

**Wichtig:** Backend läuft auf **Port 8001**, nicht 8000 — siehe "Bekannte
Fallstricke" unten für den Grund. `frontend/.env.local` ist bereits auf
Port 8001 eingestellt (neu in diesem Sprint angelegt).

```bash
# Terminal 1 — Backend (aus backend_saas/)
cd backend_saas
venv\Scripts\activate   # oder: source venv/bin/activate
uvicorn app.main:app --port 8001
# http://localhost:8001/health sollte {"status":"ok",...} liefern

# Terminal 2 — Frontend (aus frontend/)
cd frontend
npm run dev
# http://localhost:3000
```

Vor dem Start prüfen, ob Port 8001/3000 schon belegt sind (siehe
Fallstricke) — im Zweifel den belegenden Prozess beenden und neu starten.

## 5. Admin-Zugang ohne Secrets in dieser Datei

Das Passwort steht in `backend_saas/.env`, Schlüssel `ADMIN_PASSWORD=`.
Datei lokal öffnen und den Wert dort ablesen — er wird hier bewusst nicht
wiederholt. Login-Formular: `http://localhost:3000/pilot/jk-demo-campspilot-test/login`.

## 6. Klicktest (max. 10 Minuten)

1. **Demo-Verein ansehen (Eltern-Sicht):** `http://localhost:3000/pilot/jk-demo-campspilot-test`
   öffnen. Erwartet: Tab-Titel "JK Demo – CampsPilot Test", zwei Camps
   sichtbar — "[DEMO] Feriencamp Sommerwoche 1" zeigt "Ausgebucht" + "3 von
   3 belegt, 1 auf der Warteliste"; "[DEMO] Feriencamp Herbstwoche" zeigt
   freie Plätze.
2. **Neue Anmeldung als Eltern:** Bei Herbstwoche auf "Ansehen" → "Kind
   anmelden", Formular mit Test-Daten ausfüllen (Pflichtfelder: Name,
   Geburtsdatum, E-Mail, Telefon, Notfallnummer, Teilnahmebedingungen-
   Haken). Erwartet: Bestätigungsseite mit "angemeldet", Zahlungsreferenz
   `CP-...`, Hinweis auf Überweisung.
3. **Admin-Login:** `.../login` öffnen, Passwort aus `.env` eingeben.
   Erwartet: Weiterleitung zum Dashboard.
4. **Neue Anmeldung im Admin sehen:** Dashboard → "Alle Camps" →
   Herbstwoche → Teilnehmer. Erwartet: die gerade abgeschickte Anmeldung
   erscheint in der Liste mit "Zahlung offen".
5. **Zahlung markieren:** Zahlungen-Tab öffnen, bei der neuen Anmeldung
   "Als bezahlt markieren" klicken. Erwartet: Chip wechselt zu "Bezahlt",
   Summe "Eingegangen" steigt. Seite neu laden — Status bleibt erhalten.
6. **Warteliste aufrücken lassen:** Zu Sommerwoche 1 wechseln (Camp ist
   voll, David Beispiel wartet). Teilnehmer-Tab → bei einer bezahlten,
   aktiven Anmeldung (z. B. Mia oder Clara Beispiel) auf "Anmeldung
   stornieren" klicken. Erwartet: Storno wirkt sofort, David Beispiel
   erscheint automatisch nicht mehr auf der Warteliste (Warteliste-Tab
   zeigt "Niemand wartet mehr"), Belegung bleibt 3/3.
7. **Export:** Auf einer Teilnehmer-Seite "Exportieren" → "Als Excel"
   klicken. Erwartet: Download einer `.xlsx`-Datei mit den aktuell
   sichtbaren (gefilterten) Zeilen.
8. **Mandanten-Trennung (optional, curl):** `curl http://localhost:8001/admin/organizations/jk-demo-campspilot-test/camps` ohne `Authorization`-Header → erwartet `401`. Mit
   Token, aber Camp-Slug eines anderen Vereins → erwartet `404`, keine
   fremden Daten.

## 7. Testumgebung, Testdaten, Cleanup

- **Ziel-Datenbank:** Cloud-Supabase-Projekt "CampsPilot SaaS" (Ref
  `wkmckfbzhmihyfwiekct`), **nicht** die KSV/JK-Produktions-Datenbanken —
  das ist die im gesamten `backend_saas/`-Zweig vorgesehene, von KSV/JK
  isolierte Zielumgebung (siehe `docs/saas/architecture.md`). Dasselbe
  Projekt enthält bereits die (aus einem früheren Ticket) real
  onboardeten, aber weiterhin fiktiven Platzhalter-Organisationen
  `ksv-baunatal` und `jk-performance-academy` — **nicht** angefasst.
- **Demo-Organisation:** `jk-demo-campspilot-test` ("JK Demo – CampsPilot
  Test"), Slug/Name eindeutig als Demo gekennzeichnet, Camps mit
  `[DEMO]`-Präfix im Titel.
- **Zweiter, unabhängiger Testmandant** (aus einer früheren Sitzung, für
  Isolationstests weiterverwendet): `smoke-test-verify` — ebenfalls
  eindeutig als Test gekennzeichnet, nicht Teil der eigentlichen Demo.
- **Seed erneut ausführen** (idempotent, überschreibt nichts Bestehendes):
  ```bash
  cd backend_saas
  python scripts/seed_demo.py --api-url http://localhost:8001 --admin-password "<aus .env>"
  ```
- **Cleanup:** Es gibt bewusst keinen Lösch-Endpunkt für Organisationen/
  Camps (siehe `backend_saas/README.md`, "was nicht existiert"). Um die
  Demo-Daten zu entfernen, einzelne Registrierungen über den Admin-
  Storno-Button stornieren (setzt `status='cancelled'`, löscht nicht
  physisch) oder die Organisation über `PATCH .../organizations/jk-demo-campspilot-test`
  auf `plan_status: "cancelled"` setzen (blendet sie aus der aktiven
  Nutzung aus, ohne Daten zu löschen).

## 8. Durchgeführte Tests, Ergebnisse, Einschränkungen

| Test | Methode | Ergebnis |
|---|---|---|
| Backend-Unit-/Integrationstests | `pytest` | 199 bestanden |
| Frontend-Unit-Tests | `vitest run` | 30 bestanden |
| TypeScript | `tsc --noEmit` | fehlerfrei |
| Lint | `eslint` | 0 Fehler, 3 Vorbestehende Warnungen (ungenutzter `_prev`-Parameter, Konvention von `useActionState`) |
| Production-Build | `next build` | erfolgreich |
| Verein/Camp einrichten | Browser + Seed-Skript | funktioniert, live gegen Cloud-DB verifiziert |
| Eltern-Anmeldung (voller Flow) | Browser | funktioniert, inkl. Validierung fehlender Pflichtfelder |
| Warteliste bei vollem Camp | Browser + API | funktioniert |
| Admin sieht neue Anmeldung | Browser | funktioniert, Zähler korrekt |
| Zahlungsstatus setzen + Persistenz nach Reload | Browser + Server-Log | funktioniert |
| Storno + automatisches Nachrücken | Browser | funktioniert, verifiziert über eigenen Warteliste-Tab |
| Export (Excel) | Browser + curl | funktioniert, Inhalt stichprobenartig geprüft |
| Formula-Injection-Schutz im Export | curl + gezielter Testfall (`=cmd(...)`-Payload) | funktioniert (Apostroph-Präfix greift), **nur gegen einen sauber neu gestarteten Backend-Prozess verifizierbar** — siehe Fallstricke |
| Nicht angemeldeter Zugriff auf Admin-Routen | curl (Server-Response, kein Cookie) | 401 (API) / 307-Redirect zu Login (SSR-Seiten) |
| Cross-Tenant-Manipulation (fremder Registration-Token über falschen Org-/Camp-Pfad stornieren) | curl | 404, keine Wirkung |
| Öffentliche API leakt keine PII | curl | bestätigt — nur Aggregatzahlen (`registered_count` etc.), keine Namen/E-Mails |
| Mobile Viewport | **blockiert** | `resize_window`-Tool ändert die tatsächliche Fenstergröße in dieser Sandbox nicht (`window.innerWidth` blieb bei mehreren Versuchen bei 1920px) — keine echte mobile Verifikation durchgeführt, nicht vorgetäuscht |
| E-Mail-Zustellung | **nicht anwendbar** | Es gibt keinen E-Mail-Versand in `backend_saas` (Bestätigung nur als Bildschirmtext, siehe README "was nicht existiert") — nichts zu testen |
| Konkurrierende Anmeldungen (Race auf Kapazitätsgrenze) | **nicht erneut getestet** | bereits in `backend_saas/README.md` als unter Last verifiziert dokumentiert (8 parallele Requests → exakt 1 registriert, Rest Warteliste); im Zeitbudget dieses Sprints nicht wiederholt |

## 9. Offene Blocker

- **Mobile-Viewport-Verifikation nicht möglich** mit den verfügbaren
  Browser-Werkzeugen in dieser Umgebung (siehe oben). Empfehlung: auf
  einem echten Gerät oder mit funktionierender Viewport-Emulation
  nachholen, bevor eine mobile Nutzung zugesichert wird.
- **Port-8000-Kollision:** In dieser Entwicklungsumgebung lag/liegt auf
  Port 8000 ein Prozess, der sich nicht zuverlässig per `taskkill`/
  `Stop-Process` beenden ließ und veralteten Code auslieferte. Ursache
  nicht abschließend geklärt (vermutlich Rest einer anderen, parallelen
  Sitzung in derselben Windows-Umgebung — auf demselben Rechner läuft
  mindestens ein weiteres, unabhängiges Projekt (`commandpilot`) auf Port
  8010). **Vor jedem erneuten lokalen Test:** `curl http://localhost:8001/health`
  prüfen, dass die Antwort `"service":"campspilot-saas-api"` enthält,
  bevor man sich auf Testergebnisse verlässt — im Zweifel Prozess auf dem
  Zielport beenden und neu starten, nicht einfach von "läuft ja" ausgehen.

## 10. Nicht-Blocker, aber spätere Verbesserungen (nicht in diesem Sprint)

- Login-Seite (`/pilot/[org]/login`) hat noch keine eigene
  `generateMetadata` — zeigt weiterhin den KSV-Titel im Tab (kleinerer
  Kosmetik-Fund, gleiche Ursache wie der behobene Bug, aber niedrigere
  Priorität, da die Login-Seite selten lange offen bleibt).
  Konkurrierende-Anmeldungen-Race erneut unter echter Last verifizieren,
  falls die zugrunde liegende Locking-Logik in `app/repositories/
  registrations.py` je verändert wird.
- Kein Lösch-Endpunkt für Organisationen/Camps — Demo-Daten können nur
  storniert/deaktiviert, nicht physisch entfernt werden (siehe Cleanup
  oben). Für ein Produkt mit häufigen Demo-Zyklen wäre ein echter
  Cleanup-Pfad sinnvoll, war aber nicht Teil dieses Sprints.

## Branch, Commit, Pfad

- Branch: `feat/saas-richtung-c-org-dashboard`
- Dieser Sprint's Commit: siehe `git log` (Nachricht beginnt mit
  `feat(saas): autonomous sprint`)
- Dieses Dokument: `docs/SAAS_V1_HANDOFF.md`
