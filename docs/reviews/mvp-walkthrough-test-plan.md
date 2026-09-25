# MVP-Walkthrough-Testplan — CampsPilot SaaS (`backend_saas` + `/pilot/[org]` + `/platform`)

> Manueller Testplan, später per Browser-Automatisierung selbst auszuführen. Betrifft
> ausschließlich das neue SaaS-System (`backend_saas/`, `frontend/app/pilot/[org]/`,
> `frontend/app/platform/`) — **nicht** `backend/` (KSV/JK-Legacy-System). Alle Texte,
> Button-Labels und Routen unten sind aus dem tatsächlichen Code entnommen (siehe
> Quellenangaben in Klammern), nicht erfunden.

## Reihenfolge & Abhängigkeiten

- **Abschnitt 1** ist eigenständig — legt seinen eigenen Wegwerf-Verein an, unabhängig von 2/3.
- **Abschnitt 2** legt den Testverein „Org A" an, der in Abschnitt 3 als *fremder* Verein
  gebraucht wird.
- **Abschnitt 3** setzt voraus, dass **Abschnitt 2 bereits gelaufen ist** (braucht Org A als
  Negativ-Beispiel).

Empfohlene Reihenfolge: 1 → 2 → 3 (oder 2 → 3, dann 1 bei Gelegenheit — 1 hat keine Abhängigkeit).

## Einmaliges Setup (für alle drei Abschnitte)

1. **Produktions-Build, nicht Dev-Server** — Pflicht für Abschnitt 1, empfohlen für 2+3, weil
   `npm run dev` durch Fast Refresh/Error-Overlay genau die Render-Timing-Effekte verschleiert,
   die `CampConfigForm.tsx` laut seinen eigenen Code-Kommentaren adressiert (Zeilen 44–111 dort).
   ```powershell
   cd backend_saas
   # in einem eigenen Terminal-Fenster laufen lassen, Fenster offen halten:
   uvicorn app.main:app --port 8001
   ```
   ```powershell
   cd frontend
   $env:NEXT_PUBLIC_SAAS_API_URL = "http://localhost:8001"
   npm run build
   npm run start
   # http://localhost:3000
   ```
   **Achtung:** `frontend/app/lib/saasApi.ts` und `saasAdminApi.ts` fallen ohne
   `NEXT_PUBLIC_SAAS_API_URL` auf `http://localhost:8000` zurück (das ist `backend/`, das
   KSV/JK-System) — ohne die Env-Var oben läuft der ganze Test gegen die falsche API.
   `NEXT_PUBLIC_*`-Variablen werden beim `build` eingebacken, deshalb vor `npm run build`
   setzen, nicht nur vor `npm run start`.

2. **Ein Platform-Owner-Testaccount muss existieren.** Falls noch keiner vorhanden ist:
   ```powershell
   cd backend_saas
   .\venv\Scripts\Activate.ps1
   python scripts/create_platform_user.py --email owner-test@example.com --role owner
   ```
   (Passwort wird interaktiv abgefragt, min. 8 Zeichen, wird nie ausgegeben.)

3. Für eindeutige Slugs unten: `<TS>` = aktueller Zeitstempel, nur `a-z0-9-`, z. B. `260924-1530`
   (Muster `org_slug`/`camp_slug`: `[a-z0-9-]+`, siehe `NewOrgForm.tsx` Zeile 50/77). Bei jedem
   Durchlauf einen neuen `<TS>` verwenden, damit Slugs nie mit vorherigen Testläufen kollidieren.

---

## Abschnitt 1 — Status-Formular Stabilität (Camp-Konfiguration → Sichtbarkeit → Status)

Betrifft `frontend/app/components/saas/config/CampConfigForm.tsx`. Die Komponente hat drei im
Code dokumentierte, im Review gefundene Bugs rund um dieses `<select>` (Zeilen 44–111) — dieser
Abschnitt prüft gezielt, dass sie behoben bleiben.

### 1.0 Eigenen Wegwerf-Verein anlegen

1. `http://localhost:3000/platform/login` öffnen. Erwartet: Überschrift „Plattform-Anmeldung",
   Felder „E-Mail"/„Passwort", Button „Anmelden".
2. Mit dem Owner-Testaccount anmelden. Erwartet: Redirect auf `/platform`, Überschrift „Vereine".
3. „+ Neuen Verein anlegen" klicken (führt zu `/platform/new`, Überschrift „Neuen Verein
   anlegen").
4. Formular ausfüllen:
   - Slug: `cptest-cfg-<TS>`
   - Vereinsname: `CFG-Test <TS>`
   - Kontakt-E-Mail: `cfgtest+<TS>@example.com`
   - Camp-Slug: `cfgcamp`
   - Titel: `Konfigurationstest-Camp`
   - Beginn/Ende: beliebige gültige Daten, Ende ≥ Beginn
   - Mindestalter `6`, Höchstalter `12`, Plätze `5`, Preis `50.00`
   - **„Camp sofort veröffentlichen" NICHT anhaken** (Camp soll als `draft` starten)
5. „Verein anlegen" klicken. Erwartet: Redirect auf `/platform/cptest-cfg-<TS>`, Überschrift =
   Vereinsname, Camp-Liste zeigt „Konfigurationstest-Camp" mit Chip „Entwurf".
6. Auf die Camp-Zeile klicken. Erwartet: Navigation zu
   `/pilot/cptest-cfg-<TS>/camps/cfgcamp/konfiguration`, Überschrift „Camp-Einstellungen".

Ab hier: `<ORG>` = `cptest-cfg-<TS>`, `<CAMP>` = `cfgcamp`.

### 1a — Erfolgreiches Speichern, beide Richtungen

1. Zum Abschnitt „Sichtbarkeit" scrollen, Feld „Status" (Select). Aktueller Wert: „Entwurf".
2. In das Select klicken, dann **per Pfeiltasten + Enter** (nicht nur Maus) auf
   „Veröffentlicht" wechseln — das reproduziert gezielt den Tastatur-Auswahl-Pfad, den der
   Code-Kommentar in `CampConfigForm.tsx` (Zeilen 87–111) als Race-Ursache beschreibt.
3. „Speichern" klicken. Erwartet: Button zeigt kurz „Wird gespeichert …", danach eine grüne
   Erfolgsmeldung „Gespeichert." (`de.configPage.saved`), Select zeigt weiterhin „Veröffentlicht".
4. **Mindestens 1 Sekunde beobachten**, ohne etwas zu tun. Erwartet: Select bleibt stabil auf
   „Veröffentlicht" (kein Zurückspringen — das ist genau der per `MutationObserver` nachgewiesene,
   im Code über ein 1s-Zeitfenster abgefangene Flake).
5. Denselben Wechsel in die andere Richtung: Select per Pfeiltasten + Enter zurück auf
   „Entwurf", „Speichern" klicken. Erwartet: „Gespeichert.", Select zeigt „Entwurf", bleibt
   stabil.

### 1b — Erzwungener Fehlschlag (Backend stoppen)

1. Status per Pfeiltasten + Enter auf „Geschlossen" wechseln (noch nicht speichern).
2. Im Terminal, das `uvicorn app.main:app --port 8001` ausführt, **Strg+C** drücken — Backend
   ist jetzt gestoppt. Das lässt den `fetch` in `updateCampAdmin` scheitern und trifft den
   `catch`-Block in `updateCampConfigAction` (`configActions.ts` Zeile 177–179).
3. „Speichern" klicken.
4. Erwartet:
   - **Keine** „Gespeichert."-Meldung.
   - Stattdessen eine rote Fehlerbox (`role="alert"`) mit exaktem Text „Konnte nicht gespeichert
     werden — Angaben prüfen und erneut versuchen." (`de.configPage.saveError`).
   - Button zeigt wieder „Speichern" (nicht dauerhaft „Wird gespeichert …").
   - **Kritisch:** Das Status-Select zeigt wieder „Entwurf" (den zuletzt tatsächlich
     bestätigten Wert aus 1a, Schritt 5) — **nicht** „Geschlossen". Das ist exakt der Bug, den
     `state.error ? camp.status : ...` (`CampConfigForm.tsx` Zeile 83) verhindern soll: ein
     fehlgeschlagener Save darf nie einen nie gespeicherten Wert als aktuell erscheinen lassen.
5. Backend neu starten: `uvicorn app.main:app --port 8001` im selben Terminal erneut ausführen.

### 1c — Seite schließen/neu laden, dann frisch öffnen

1. Sicherstellen, dass Backend wieder läuft (Health-Check: `http://localhost:8001/health`).
2. Aktuellen bestätigten Stand merken: „Entwurf" (aus 1a).
3. Den Browser-Tab schließen (oder auf eine fremde Seite wie `about:blank` navigieren) — **kein**
   Zurück-Button, damit kein clientseitiger Router-Cache greift.
4. Neuen Tab öffnen, direkt `http://localhost:3000/pilot/cptest-cfg-<TS>/camps/cfgcamp/konfiguration`
   eingeben (harte Navigation, frischer Server-Render).
5. Erwartet: Status-Select zeigt „Entwurf" — der wahre, in der DB persistierte Wert. Beweist,
   dass der nie gespeicherte „Geschlossen"-Versuch aus 1b nie in der Datenbank ankam.

---

## Abschnitt 2 — Voller Ablauf mit neuem Testverein

Verwendet einen frischen Verein „Org A". Ab hier: `<ORG_A>` = `cptest-wk-<TS>`, `<CAMP_A>` =
`testcamp-a`. **Diesen Verein für Abschnitt 3 nicht löschen.**

1. `http://localhost:3000/platform/login` öffnen, mit dem Owner-Testaccount anmelden. Erwartet:
   Redirect auf `/platform`, Überschrift „Vereine", Stats-Kacheln oben (`StatsOverview`), Button
   „+ Neuen Verein anlegen".
2. „+ Neuen Verein anlegen" klicken → `/platform/new`.
3. Formular ausfüllen:
   - Slug: `cptest-wk-<TS>`
   - Vereinsname: `CampsPilot Testverein <TS>`
   - Kontakt-E-Mail: `walkthrough+<TS>@example.com`
   - Camp-Slug: `testcamp-a`
   - Titel: `Testcamp A`
   - Beginn: ein Datum in ca. 6 Wochen; Ende: 5 Tage danach
   - Mindestalter `6`, Höchstalter `12`, Plätze `5`, Preis `99.00`
   - **„Camp sofort veröffentlichen" NICHT anhaken** (wird unten als eigener, sichtbarer Schritt
     veröffentlicht)
4. „Verein anlegen" klicken. Erwartet: Redirect auf `/platform/cptest-wk-<TS>` (Konsolen-
   Vereinsdetailseite), Überschrift = Vereinsname, Zeile „/pilot/cptest-wk-<TS> · Pilot", ein
   rötlicher Kasten „Entwurf — noch nicht öffentlich sichtbar" mit Button „Veröffentlichen",
   Abschnitt „Camps" mit einer Zeile „Testcamp A" + Chip „Entwurf".
5. Im rötlichen Kasten auf „Veröffentlichen" klicken (veröffentlicht den **Verein**,
   `site_published=true`). Erwartet: Kasten wird neutral, Text wechselt zu „Veröffentlicht",
   Button-Text wechselt zu „Zurückziehen".
6. Auf die Camp-Zeile „Testcamp A" klicken → Navigation zu
   `/pilot/cptest-wk-<TS>/camps/testcamp-a/konfiguration`, Überschrift „Camp-Einstellungen".
7. Zu „Sichtbarkeit" scrollen, Status-Select **per Maus** von „Entwurf" auf „Veröffentlicht"
   setzen (veröffentlicht jetzt das **Camp** selbst), „Speichern" klicken. Erwartet:
   „Gespeichert.", Select zeigt „Veröffentlicht".
8. Auf den Tab „Teilnehmer" klicken (erster Tab im Camp-Band). Erwartet: Command-Center-Seite,
   Statkarten „Belegung 0/5", „Eingegangen / Offen 0,00 €/0,00 €", darunter „Noch keine
   Anmeldungen für dieses Camp." (`de.command.noParticipants`).
9. In einem neuen Tab die öffentliche Seite öffnen: `http://localhost:3000/pilot/cptest-wk-<TS>`.
   Erwartet: Vereinsname als H1, Abschnitt „Camps" mit „1 Termin", eine Camp-Zeile „Testcamp A".
10. Auf die Camp-Zeile klicken. Erwartet: Detailscreen mit Chip „Anmeldung geöffnet", Button
    „Kind anmelden" **aktiv** (nicht ausgegraut).
11. „Kind anmelden" klicken. Erwartet: Anmeldeformular, Fortschrittsbalken „0 von 4 Abschnitten
    ausgefüllt".
12. Abschnitt „Angaben zum Kind": Vorname `Max`, Nachname `Mustermann`, Geburtsdatum (Format
    `TT.MM.JJJJ`) so wählen, dass das Alter am Camp-Start zwischen 6 und 12 liegt (z. B. Camp
    startet 2026, Geburtsdatum `10.05.2018` → 8 Jahre), Trikotgröße `140`.
13. Abschnitt „Kontakt der Eltern": Name `Erika Mustermann`, E-Mail
    `erika.mustermann+<TS>@example.com`, Telefon `01701234567`.
14. Abschnitt „Sicherheit im Camp": Notfallnummer `01709876543` (Allergien/Abholberechtigte
    leer lassen).
15. Abschnitt „Einwilligungen": Checkbox „Teilnahmebedingungen" anhaken (Pflicht), „Fotos,
    freiwillig" leer lassen.
16. Fortschrittsbalken sollte „4 von 4 Abschnitten ausgefüllt" zeigen. „Anmeldung absenden"
    klicken. Erwartet: Button zeigt kurz „Wird gesendet …", danach Bestätigungsseite mit
    Überschrift „Max ist angemeldet", Chips „Platz reserviert" und „Zahlung offen", Karte „Jetzt
    überweisen" mit Betrag „99,00 €".
17. Zurück zum Admin-Tab wechseln, `/pilot/cptest-wk-<TS>/camps/testcamp-a` neu laden. Erwartet:
    Statkarte „Belegung 1/5", eine Teilnehmer-Zeile „Max Mustermann (2018)" mit Status-Chip
    „Zahlung offen", darunter „Erika Mustermann · erika.mustermann+<TS>@example.com".
18. Auf den Chevron/„Details öffnen"-Button der Zeile klicken. Erwartet: Zeile klappt auf,
    zeigt „Trikotgröße: 140", „Abholberechtigte: —", rechts „Alle Pflichtangaben liegen vor."
    (Notfallkontakt war ausgefüllt, keine Allergien).
19. „Bearbeiten" klicken. Erwartet: Formular mit Feldern Vorname/Nachname/Trikotgröße/
    Abholberechtigte + Allergien, Buttons „Speichern"/„Abbrechen".
20. Trikotgröße von `140` auf `152` ändern, „Speichern" klicken. Erwartet: Button zeigt kurz
    „Wird gespeichert …", Formular klappt danach automatisch wieder zur Ansicht zusammen und
    zeigt jetzt „Trikotgröße: 152".
21. Auf den Tab „Zahlungen" klicken (`/pilot/cptest-wk-<TS>/camps/testcamp-a/zahlungen`).
    Erwartet: Statkarten „Eingegangen 0,00 €" / „Offen 99,00 €", eine Zahlungszeile „Max
    Mustermann" mit Chip „Zahlung offen" und Buttons „Als bezahlt markieren" + „Erlassen".
22. „Als bezahlt markieren" klicken. Erwartet: Chip wechselt zu „Bezahlt", die Buttons „Als
    bezahlt markieren"/„Erlassen" verschwinden, stattdessen erscheint „Als erstattet markieren".
    Statkarten aktualisieren sich auf „Eingegangen 99,00 €" / „Offen 0,00 €" (per
    `revalidatePath` — falls nicht sofort sichtbar, Seite neu laden und erneut prüfen).
23. Zurück zur Plattform-Konsole navigieren: `http://localhost:3000/platform`. Erwartet: „Org A"
    (`CampsPilot Testverein <TS>`) erscheint in der Vereinsliste, Vereinszähler-Text hat sich um
    1 erhöht gegenüber dem Stand vor Abschnitt 2, Schritt 1.

---

## Abschnitt 3 — Rollen-Isolation `org_admin`

Braucht Org A aus Abschnitt 2 (`<ORG_A>` = `cptest-wk-<TS-2>`, `<CAMP_A>` = `testcamp-a`) als
**fremden** Verein. Legt zusätzlich einen eigenen Verein „Org C" für den Test-Account an.

### 3.0 Org C + zweiten echten `org_admin`-Testaccount anlegen

1. Als Owner (bestehende Session im ersten Browser/Profil) `http://localhost:3000/platform/new`
   öffnen und einen weiteren Verein anlegen:
   - Slug: `cptest-iso-<TS>`
   - Vereinsname: `ISO-Test <TS>`
   - Kontakt-E-Mail: `iso+<TS>@example.com`
   - Camp-Slug: `isocamp`, Titel `Isolationstest-Camp`, beliebige gültige Termine/Werte
   - Checkbox „Camp sofort veröffentlichen" spielt hier keine Rolle
   „Verein anlegen" klicken. Erwartet: Redirect auf `/platform/cptest-iso-<TS>`.
   Ab hier: `<ORG_C>` = `cptest-iso-<TS>`.
2. Zweiten Account anlegen **und direkt als `org_admin` von Org C zuweisen** (ein Schritt, per
   Skript — spiegelt exakt den DB-Write, den „Als Vereinsadmin zuweisen" in der Konsole auslöst):
   ```powershell
   cd backend_saas
   .\venv\Scripts\Activate.ps1
   python scripts/create_platform_user.py --email orgadmin-test@example.com --role org_admin --org cptest-iso-<TS>
   ```
   Passwort interaktiv vergeben (merken für Schritt 3.1). Erwartet: Konsolenausgabe
   `orgadmin-test@example.com is now org_admin for 'cptest-iso-<TS>'.`

### 3.1 Als der neue `org_admin` einloggen

Ein **separates Browser-Profil/Inkognito-Fenster** verwenden, damit die Owner-Session im ersten
Fenster nicht überschrieben wird (dasselbe Cookie `cp_admin_token`, Pfad `/`, gilt für beide
Bereiche — ein zweites Fenster mit eigenem Cookie-Jar ist nötig).

1. `http://localhost:3000/pilot/cptest-iso-<TS>/login` öffnen. Erwartet: Überschrift
   „Vereins-Anmeldung".
2. Mit `orgadmin-test@example.com` + vergebenem Passwort einloggen.

### 3.2 Zugriffsmatrix — pro Zeile prüfen

| Aufgerufene URL | Erwartetes Verhalten (Pass-Kriterium) | Warum (Code-Referenz) |
|---|---|---|
| `/pilot/cptest-iso-<TS>/login` → nach Login | Redirect auf `/pilot/cptest-iso-<TS>/dashboard`. Seite zeigt Vereinsname „ISO-Test \<TS\>" im Band, Abschnitt „Alle Camps" mit „Isolationstest-Camp". | `pilot/[org]/login/actions.ts` Zeile 50: Redirect immer auf `/pilot/{orgSlug}/dashboard`, egal welche Rolle. |
| `http://localhost:3000/platform` | Redirect auf `/pilot/cptest-iso-<TS>/dashboard` — **niemals** die Vereinsliste/„+ Neuen Verein anlegen"/Stats-Kacheln zu sehen. | `platform/(console)/layout.tsx` Zeile 34–37: `!me.is_platform_owner` → Redirect auf `admin_organization_slugs[0]`. |
| `http://localhost:3000/platform/new` | Gleicher Redirect wie oben (liegt unter derselben `(console)`-Layout-Gruppe) — das „Neuen Verein anlegen"-Formular wird nie angezeigt. | dieselbe Layout-Gate. |
| `http://localhost:3000/pilot/cptest-wk-<TS-2>/dashboard` (Org A, **fremd**) | Seite lädt, aber zeigt **keine** Org-A-Daten — stattdessen die generische Fehlerseite: Überschrift „Das hat nicht geklappt", Text „Die Daten konnten nicht geladen werden…", Button „Erneut versuchen". Org-A-Name/Camps dürfen nirgends erscheinen. | `(org-admin)/layout.tsx` prüft nur, ob überhaupt ein Cookie existiert (nicht welcher Verein). `loadOrgAdminData` → `fetchOrganizationAdmin` bekommt vom Backend 403 (`auth_deps.require_org_access`, da Org A nicht in `admin_organization_ids`) → wirft `AdminActionError` → landet ungefangen im nächsten `error.tsx` (`dashboard/error.tsx`). |
| `http://localhost:3000/pilot/cptest-wk-<TS-2>/camps/testcamp-a` (Org A Teilnehmerliste) | Gleiche generische Fehlerseite (`camps/[campSlug]/error.tsx`). **Kritisch:** „Max Mustermann", seine E-Mail, Trikotgröße dürfen an keiner Stelle im DOM/Netzwerk-Response sichtbar sein. | Gleicher Mechanismus wie oben, nur über `loadCampAdminData`. |
| `http://localhost:3000/pilot/cptest-wk-<TS-2>/camps/testcamp-a/zahlungen` (Org A Zahlungen) | Gleiche generische Fehlerseite — keine Zahlungsdaten/PII von Org A sichtbar. | dieselbe 403-Kette. |
| `http://localhost:3000/pilot/cptest-iso-<TS>/dashboard` (eigener Verein, erneut) | Lädt normal, zeigt „ISO-Test \<TS\>" + „Isolationstest-Camp" — **muss** weiterhin funktionieren (kein Kollateralschaden durch die Blockaden oben). | `require_org_access`: `auth.admin_organization_ids` enthält Org C → 200. |

### 3.3 Tiefere Verifikation (optional, aber aussagekräftig)

Browser-DevTools → Network-Tab öffnen, dann die Org-A-Dashboard-Zeile aus 3.2 erneut aufrufen.
Erwartet: Ein Request an `http://localhost:8001/admin/organizations/cptest-wk-<TS-2>` mit
**Status 403**, nicht 401/404. Das belegt, dass die Sperre serverseitig im Backend erzwungen
wird (`app/auth_deps.py`, Docstring: „The frontend hiding a button is never the security
boundary") — nicht nur eine ausgeblendete Schaltfläche im Frontend.

### 3.4 Aufräumen

Inkognito-Fenster schließen, um die `org_admin`-Session zu beenden (kein sichtbarer
„Abmelden"-Button auf den Org-Admin-Seiten selbst — nur die Plattform-Konsole hat einen).
