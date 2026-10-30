# CampsPilot: geprüfte Änderungen zur Übernahme durch Claude

Stand: 24.09.2026, Abschluss des dreistündigen Arbeitsfensters um 17:47 UTC.

Geprüfter Basiscommit: `c17ac56e23df33e15051916cc983daf121e1df38`.
Alle Änderungen liegen uncommitted im **detached Worktree**
`C:\Users\serka\AppData\Local\Temp\sommercamps-review-c17ac56`.
Claudes Arbeitsordner und Branch `feat/platform-foundation` wurden nicht verändert;
die abschließende Kontrolle zeigte dort weiterhin denselben HEAD und nur das schon
vorher vorhandene untracked `docs/reviews/`. Keine Commits, Pushes oder Deployments,
keine Cloud-Datenänderungen und keine Unteragenten. Der spätere Arbeitsauftrag
erlaubte ausdrücklich Implementierung und Fehlerbehebung im isolierten Worktree.

## Ergebnis der drei Sicherheitsfragen

- **Vereinstrennung:** Die lokale Zugriffsmatrix deckt alle 20 Admin-Operationen mit
  anonymen und vereinsfremden Aufrufern ab (401/403). Der zusätzliche Ablauf mit echter
  PostgreSQL-Datenbank prüft reale Rollenabfragen, fremde Vereinszugriffe, falsche
  Camp-Zuordnung eines Teilnehmer-Tokens sowie Export- und Plattformbeschränkungen.
  In diesen geprüften Pfaden wurde keine vereinsübergreifende Datenfreigabe festgestellt.
- **Öffentliche Entwürfe:** Unveröffentlichte Vereine und Camps liefern öffentlich
  404 und erlauben keine Anmeldung. Eine zusätzliche Konkurrenzlücke beim Rückzug
  des gesamten Vereins wurde gefunden und behoben (Fehler 1).
- **Adminzugriff auf Entwürfe:** Owner und zuständiger Vereinsadmin können einen
  unveröffentlichten Verein verwalten. Der lokale SQL/API-Ablauf prüft außerdem nach
  erneutem Rückzug Teilnehmerkorrektur, Zahlungsstatus, XLSX-Export und Storno mit
  Wartelisten-Nachrücken. Die Frontend-Navigation verwendet den Admin-Datenpfad;
  Vereinsadmins werden nicht in die Owner-Konsole oder fremde Vereinsbereiche gelassen.

Die beiden früheren Sicherheitskorrekturen sind im Basiscommit vorhanden. Rein lesend
wurde zusätzlich bestätigt: Render läuft auf genau diesem Commit; im isolierten SaaS-
Supabase-Projekt ist RLS auf allen sechs relevanten Tabellen aktiv, ohne Policies.
Der lokale Test mit den echten Migrationen und vorhandenen synthetischen Daten belegt:
`anon` und `authenticated` sehen keine Zeilen und können weder Owner- noch
Vereinsmitgliedschaften selbst eintragen. Dies ersetzt keinen vollständigen Audit
aller Datenbankfunktionen oder zukünftigen Endpunkte.

## Fünf belegte und lokal behobene Fehler

### 1. Anmeldung nach Vereinsrückzug oder Suspendierung (hoch)

**Dateien:** `backend_saas/app/repositories/registrations.py`,
`backend_saas/app/routers/registrations.py`, `backend_saas/app/tenancy.py`.

**Auswirkung:** Nach bereits erfolgreicher öffentlicher Tenant-Auflösung konnte ein
Admin den Verein zurückziehen oder deaktivieren; die laufende Anmeldung schrieb
trotzdem Teilnehmerdaten und antwortete mit 201. Der vorhandene Camp-Status-Lock
schützte nur das Camp, nicht die Veröffentlichung des Vereins.

**Reproduktion:** `test_registration_publication_race.py` ändert den Vereinsstatus
zwischen Tenant-Auflösung und Schreibtransaktion. Vor dem Fix scheiterten drei Fälle
mit 201 statt 404. `test_review_postgres.py` hält zusätzlich eine echte uncommittete
Rückzugs-/Suspendierungstransaktion offen und beobachtet den wartenden Datenbank-Lock.

**Korrekturauftrag für Claude:** Den vorbereiteten `FOR SHARE`-Lock auf der Organisation
mit erneuter Publikations-/Planprüfung vor dem Camp-Lock und die 404-Abbildung übernehmen.
Die Statusmenge kommt gemeinsam aus `tenancy.py`. Nicht auf `FOR KEY SHARE` abschwächen:
Publikationsänderungen verändern keinen Schlüssel. Admin-Lifecycle bleibt unabhängig
vom öffentlichen Publikationsstatus. Die Tests belegen auch parallele Buchungen
verschiedener Camps und genau einen vergebenen letzten Platz.

### 2. Teilnehmer lässt sich nach Speichern nicht erneut bearbeiten (mittel)

**Datei:** `frontend/app/components/saas/data/ParticipantDetail.tsx`.

**Auswirkung/Reproduktion:** Teilnehmer bearbeiten und speichern, anschließend erneut
„Bearbeiten“ klicken. Der persistierende `saved=true`-Action-State schloss den Editor
sofort wieder; der Regressionstest fand kein Eingabefeld mehr.

**Korrekturauftrag für Claude:** Die vorbereitete Verarbeitung nur eines **neuen**
Action-State übernehmen. Test: `ParticipantRow.test.tsx`, zweimalige Bearbeitung
einschließlich zweitem erfolgreichen Speichern ohne Neuladen.

### 3. Alter Teilnehmer-Snapshot verdeckt Zahlung und Storno (mittel)

**Datei:** `frontend/app/components/saas/data/ParticipantRow.tsx`.

**Auswirkung/Reproduktion:** Teilnehmerdaten korrigieren; danach liefert eine neue
Serverantwort `payment_status=paid` und `status=cancelled`. Der alte lokale Override
zeigte weiter „Zahlung offen“ und die Stornoaktion an.

**Korrekturauftrag für Claude:** Den vorbereiteten Reset des Overrides bei neuen
Registration-Props übernehmen. Die Action-Antwort überbrückt nur die Zeit bis zur
Revalidierung. Regressionstest: `ParticipantRow.test.tsx`, frischer Zahlungs-/Stornostand.

### 4. Anmeldefrist wird in der Server-Zeitzone interpretiert (mittel)

**Dateien:** `frontend/app/components/saas/config/CampConfigForm.tsx`,
`frontend/app/components/saas/actions/configActions.ts`, neu
`frontend/app/lib/dateTimeInput.ts`.

**Auswirkung/Reproduktion:** Ein `datetime-local`-Feld mit 10:00 Uhr auf einem Berliner
Gerät schickte einen Wert ohne Offset. Ein UTC-Server interpretierte ihn als 10:00 UTC
statt 08:00 UTC im Sommer. Ein unverändert gespeichertes Camp konnte seine Fristen verschieben.

**Korrekturauftrag für Claude:** Die vorbereitete Konvertierung im Client vor der
Server-Action übernehmen; der Server akzeptiert explizit zonierte Zeitpunkte.
Unveränderte Minutenwerte bewahren den ursprünglichen Zeitpunkt einschließlich
Sekunden und zweiter Herbststunde. Nicht existierende Frühlingsstunden werden abgelehnt.
Tests: Formulartransport und `dateTimeInput.test.ts` mit UTC, Berlin, New York und DST.
Neue mehrdeutige Herbstzeiten folgen weiterhin der nativen Date-Auswahl des Geräts;
eine ausdrückliche Auswahl beider Offsets ist nicht Teil dieser Änderung.

### 5. Fehlgeschlagenes Speichern verwirft Camp-Eingaben (mittel)

**Datei:** `frontend/app/components/saas/config/CampConfigForm.tsx`.

**Auswirkung/Reproduktion:** Titel und Veröffentlichungsstatus ändern, Server Action
liefert einen Fehler zurück. React setzt unkontrollierte Formularfelder auch nach einer
aufgelösten Action mit Fehlerzustand zurück. Im Test wurde aus „Changed title“ wieder
„Review camp“; die gewünschte Auswahl ging verloren.

**Korrekturauftrag für Claude:** Die vorbereiteten eingereichten Formularwerte als
Reset-Defaults übernehmen, bis neue Camp-Props vorliegen; Status nach Fehler aus der
Eingabe behalten. Tests prüfen Fehlerfall sowie aufeinanderfolgende erfolgreiche Saves
vor einer Revalidierung. Die Eingaben bleiben lokale Formulardaten, kein Browser-Storage.

## Abschlussprüfungen und Wiederholung

- **123 Backend-Tests bestanden**, gezielt sechs Dateien, keine vollständige Suite:
  `test_registration_publication_race.py`, `test_registrations_repository.py`,
  `test_registrations_api.py`, `test_tenancy.py`, `test_admin_access_matrix.py`,
  `test_review_postgres.py`. Zwei bestehende Starlette/httpx/AnyIO-Deprecation-Warnungen.
- **24 Frontend-Tests bestanden**, vier Dateien:
  `app/lib/adminNavigation.test.tsx`, `app/lib/dateTimeInput.test.ts`,
  `app/components/saas/config/CampConfigForm.test.tsx`,
  `app/components/saas/data/ParticipantRow.test.tsx`.
- `npm.cmd run lint`: keine Fehler, fünf bestehende Warnungen zu unbenutzten
  Action-Parametern. React-Skill-Review durchgeführt; keine zusätzlichen produktiven
  Abhängigkeiten oder unberechtigten Server-Action-Pfade eingeführt.
- TypeScript-Prüfung und abschließender **KSV-Build bestanden**. Konfiguration:
  `NEXT_PUBLIC_ACTIVE_CLUB=ksv`, `NEXT_PUBLIC_SITE_MODE=platform`, sämtliche API-
  und Supabase-Adressen auf `http://127.0.0.1:1`, Fake-Anon-Key, Telemetrie aus.
  Zwei erwartete `/config`-Fetch-Warnungen durch die absichtlich unbrauchbare
  Testadresse; Build und statische Generierung liefen erfolgreich durch.
  Google-Fonts wurden für den Build heruntergeladen; keine Live-Geschäftsdaten verwendet.
- `git diff --check`: bestanden. HEAD blieb detached auf dem Basiscommit.

Backend-Aufruf im Worktree-Unterordner `backend_saas`:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:1/review'
$env:SUPABASE_URL='http://127.0.0.1:1'
$env:SUPABASE_ANON_KEY='review-fake'
$env:SUPABASE_SERVICE_ROLE_KEY=''
$env:REVIEW_POSTGRES_PORT='55439'
& 'C:\Users\serka\Desktop\Projekte\Sommercamps\backend_saas\venv\Scripts\python.exe' -B -m pytest tests/test_registration_publication_race.py tests/test_registrations_repository.py tests/test_registrations_api.py tests/test_tenancy.py tests/test_admin_access_matrix.py tests/test_review_postgres.py -q -p no:cacheprovider --tb=short
```

Die PostgreSQL-Prüfung benötigt eine separate lokale Testinstanz. Ohne
`REVIEW_POSTGRES_PORT` überspringt nur dieses Modul seine sieben Integrationstests.
Es liest nie `DATABASE_URL`, verbindet sich fest mit `127.0.0.1`, erstellt eine
zufällig benannte `review_campspilot_*`-Datenbank und entfernt genau diese wieder.
Alle sechs vorhandenen SaaS-Migrationen werden dort angewendet. `auth.users` wird
minimal lokal nachgebildet; Auth-Identitäten im API-Ablauf sind synthetisch.

Die verwendete portable PostgreSQL-17.11-Instanz wurde sauber **gestoppt**. Runtime und
Cluster verbleiben unter `C:\Users\serka\AppData\Local\Temp\sommercamps-pg17-review-runtime`
bzw. `sommercamps-pg17-review-data`. Kein Windows-Dienst wurde installiert.

Frontend-Aufruf im Worktree-Unterordner `frontend`:

```powershell
npm.cmd run test -- app/lib/adminNavigation.test.tsx app/lib/dateTimeInput.test.ts app/components/saas/config/CampConfigForm.test.tsx app/components/saas/data/ParticipantRow.test.tsx
```

**Explizite Dependency-Änderung:** `jsdom` exakt `30.1.1`, ausschließlich devDependency,
einschließlich Lockfile. Dient den tatsächlichen React-Formularinteraktionen im Test.
Keine neue Migration. Eigene `node_modules` nur im Review-Worktree.

## Offene Prüflücken / nächster Auftrag für Claude

1. **JK-Build** des endgültigen Stands fehlt zum Ende des Zeitfensters. Vor Übernahme
   beide Club-Konfigurationen gemäß CLAUDE.md berücksichtigen; KSV wurde geprüft.
2. **Externer authentifizierter Browser-Walkthrough und visuelle UX-Abnahme fehlen.**
   Die Browser-Inventur war leer; Chrome und In-App-Browser meldeten „Browser is not
   available“. Der Vercel-Preview leitet ohne Browser-Anmeldung zur SSO weiter.
   Keine Umgehung, keine behaupteten Screenshots, Mobil-, Tastatur- oder Screenreader-Tests.
   Die Navigation wurde mit echten React-Layouts und gemockten Sessions geprüft,
   nicht in einem Browser. Die Formulartests verwenden jsdom, keine reale Browserengine.
3. **Echte Supabase-Anmeldung/Session-Revalidierung** wurde nicht erneut durchgespielt.
   Der lokale Ablauf prüft reale DB-Rollen, ersetzt aber die externe Identitätsprüfung.
4. Live-Katalog und Deployment-Status sind eine Momentaufnahme des Basiscommits.
   Die hier vorbereiteten Änderungen sind absichtlich nicht deployed. Eine echte
   Pilotkunden-Abnahme bleibt erforderlich.
5. Ein verbleibendes Kontingent in Prozent wurde von den verfügbaren Werkzeugen
   nicht bereitgestellt; die gewünschte 10-%-Schwelle war technisch nicht messbar.

Claude soll die oben benannten Änderungen samt neuen, aktuell **untracked** Test- und
Helper-Dateien prüfen und gezielt in seine Arbeit übernehmen. Nicht nur `git diff`
kopieren: Das lässt untracked Dateien aus. Keine automatische Übernahme, kein Commit
und kein Deployment durch diesen Review-Lauf.
