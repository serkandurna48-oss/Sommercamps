# Übergabe UE1 – öffentlicher Elternablauf

STATUS: fertig zur Prüfung

Stand: 21.10.2026. Basis-SHA: `b8cef35c6c61bd5f7e7af03dec847ba4a9362648`; geprüft wurden die uncommitteten Änderungen dieses Worktrees.

**Offener Abnahmeblocker:** Das Fertig-Kriterium ist noch nicht vollständig erfüllt: Der vorgeschriebene Python-Aufruf wird mit „Zugriff verweigert“ blockiert. pytest konnte nicht starten; eine Ergebniszeile mit 0 fehlgeschlagenen Backend-Tests liegt deshalb nicht vor. Frontend-Tests, TypeScript, Lint und der isolierte mobile Browsercheck sind erfolgreich.

## ABLAUF mit Dateien

1. **Einstieg `/pilot/[org]`:** `frontend/app/pilot/layout.tsx` stellt Pilot-Layout und StagingBanner bereit. `frontend/app/pilot/[org]/page.tsx` lädt Organisation und veröffentlichte Camps parallel über `fetchOrganization` / `fetchCamps` aus `frontend/app/lib/saasApi.ts`, setzt Metadaten, Theme und Branding und rendert `ParentFlow.tsx`. `publicTheme.css`, `publicFonts.ts`, `motion.ts` und `GrainOverlay.tsx` gestalten die öffentliche Seite. Unbekannte Organisationen führen zur `not-found.tsx`.
2. **Campauswahl:** `frontend/app/pilot/[org]/ParentFlow.tsx` zeigt Vereinsinformationen, Campübersicht, FAQ und Kontakt. FAQ-Texte: `frontend/app/lib/i18n/de.ts` (`publicUI`). `CampRow.tsx` zeigt je Camp vollständigen Zeitraum, Alter, Ort soweit hinterlegt, Preis und freie Plätze/Warteliste. Formate: `frontend/app/lib/parentFlowFormat.ts`.
3. **Campdetails oder Warteliste:** Innerhalb derselben URL schaltet `ParentFlow.tsx` zwischen `org`, `camp`, `wait`, `form` und `done`. `CampScreen` zeigt Details und Anmeldebutton; `WaitScreen` erklärt die Warteliste, zeigt Alternativen und jetzt ebenfalls alle Eckdaten über `CampSummary.tsx`. Bei geschlossenem Anmeldefenster sind beide Anmeldebuttons deaktiviert.
4. **Formular:** `frontend/app/pilot/[org]/RegistrationFormScreen.tsx` zeigt `CampSummary.tsx` vor dem Formular. Erfasst werden Kind, Geburtsdatum, optionale Trikotgröße, Elternname/E-Mail/Telefon, verpflichtende Notfallnummer, optionale Allergien/Abholberechtigte sowie die bisherigen Einwilligungen. Lokale Validierung und serverseitige Feldfehler erhalten Eingaben und setzen den Fokus. Ein synchroner Ref-Lock und deaktivierte Buttons verhindern mehrfaches Absenden während eines laufenden Requests.
5. **Übermittlung / Server-Actions:** Im öffentlichen Anmeldepfad gibt es **keine Next.js-Server-Action**. `handleSubmit` ruft den Browser-Client `submitRegistration` in `frontend/app/lib/saasApi.ts` auf. Dieser sendet direkt an das separate SaaS-Backend (`NEXT_PUBLIC_SAAS_API_URL`); Fehler werden in verständliche deutsche Gesamt-/Feldmeldungen übersetzt. `frontend/app/pilot/[org]/login/actions.ts` gehört zum Vereinslogin, nicht zur Elternanmeldung.
6. **Backend-Endpunkte:**
   - `GET /api/v1/organizations/{organization_slug}`: `backend_saas/app/routers/organizations.py`, Repository `backend_saas/app/repositories/organizations.py`.
   - `GET /api/v1/organizations/{organization_slug}/camps`: `backend_saas/app/routers/camps.py`, Repository `backend_saas/app/repositories/camps.py`.
   - Dort existiert auch `GET .../camps/{camp_slug}`; der hier geprüfte Elternpfad verwendet bereits geladene Campdaten und ruft diesen Endpunkt nicht separat auf.
   - `POST /api/v1/organizations/{organization_slug}/camps/{camp_slug}/registrations`: `backend_saas/app/routers/registrations.py`. Mandantenauflösung: `backend_saas/app/deps.py` / `tenancy.py`; Eingaben und Antwort: `backend_saas/app/schemas.py` (`RegistrationCreate`, `RegistrationCreated`).
   - `backend_saas/app/repositories/registrations.py` prüft Anmeldezeitraum und Alter, sperrt die Campzeile während der Vergabe und prüft bestehende Anmeldungen. Volle Camps erzeugen `status=waitlist`; regulär `registered`. Doppelte Anmeldung: HTTP 409. Diese bestehenden Mechanismen wurden nicht verändert. Statusregeln: `backend_saas/app/registration_lifecycle.py`.
7. **Bestätigung:** `frontend/app/pilot/[org]/DoneScreen.tsx` verwendet den tatsächlichen Antwortstatus, zeigt Camp, Zeitraum, Preis, nächsten Schritt und die angekündigte Bestätigungsmail an die eingegebene Adresse. Regulär mit IBAN: Empfänger, IBAN und kopierbarer CP-Verwendungszweck. Regulär ohne IBAN: „Der Verein meldet sich zur Zahlung“, CP-Referenz, kein Überweisungsblock. Warteliste: noch keine Zahlung/keine IBAN, keine pauschale Nachrückgarantie. Vereins-E-Mail und Telefon, falls hinterlegt, sind in allen Fällen erreichbar.
8. **E-Mail nach Speicherung:** `backend_saas/app/routers/registrations.py` plant den bestehenden BackgroundTask. `backend_saas/app/notifications/sending.py` lädt Camp-/Vereinskontext, erstellt Eltern- und Vereinsnachricht, verwaltet Versandstatus/Fehler und Wiederholung. `backend_saas/app/notifications/templates.py` enthält die Texte (`build_registration_mail`, `build_provider_mail`). `backend_saas/app/notifications/mail.py` enthält Provider/Fake-Provider und Brevo-Anbindung. Versandmechanismus unverändert; ausschließlich Datumsdarstellung und Zahlungs-Fallbacktext angepasst. Betreff ausschließlich Bestätigungsart plus Camptitel, keine Eltern-/Kindnamen. Wartelistenmail enthält Zeitraum und den Hinweis, dass noch keine Kosten fällig sind, keine Zahlungsaufforderung.
9. **Rechtsseiten:** `frontend/app/pilot/[org]/PublicFooter.tsx` verlinkt `/impressum`, `/datenschutz` und `/teilnahmebedingungen`. Die jeweiligen `page.tsx` nutzen `LegalShell.tsx` und Vereinsdaten. Im Formular öffnen Datenschutz und Teilnahmebedingungen einen neuen Tab, damit eingegebene Daten erhalten bleiben. Die Teilnahmebedingungen zeigen vorhandenen `org.terms_text`, andernfalls den bestehenden Verweis auf Vereinsbedingungen. Pflicht-Einwilligungen und freiwillige Fotoeinwilligung bleiben inhaltlich erhalten.

## BEFUNDE a–f

| Kriterium | Ergebnis | Befund und Umsetzung |
|---|---|---|
| a – Mobil | **behoben** | Die kombinierte Geburtsdatum-/Trikotzeile kann schrumpfen; lange Inhalte dürfen umbrechen. Öffentliche Links einschließlich Rechtsseiten haben mindestens 44 px Touchhöhe; Checkboxen 44 × 44 px. Namen, E-Mail, Telefon und Geburtsdatum haben passende Typen/Eingabemodi/Autofill-Metadaten, getrennte Autofill-Sektionen für Kind und Notfallnummer. Acht Ziffern beim Geburtsdatum werden in TT.MM.JJJJ umgewandelt. Absenden steht im normalen Dokumentfluss statt in einer klebenden Leiste, mit Safe-Area-Abstand. Browsercheck: keine horizontale Seitenscrollbarkeit/keine außerhalb liegenden Bedienelemente bei 390 px; Absenden bei 390 × 420 erreichbar. |
| b – Formular | **behoben** | Pflichtangaben mit Stern und Erklärung sowie `required` gekennzeichnet. Teilnahmebedingungen hatten keinen eigenen Fehlertext/`aria-describedby`; ergänzt. Bestehende Feldfehler wurden um strukturierte API-Validierung und Altersfehler erweitert. Erster betroffener Input erhält Fokus, allgemeine Serverfehler sind fokussierbar. Werte bleiben bei Validierungs-, Server- und Netzwerkfehlern erhalten. Pending-Button plus synchroner Lock gegen zwei Submit-Ereignisse im selben Event-Turn; Zurück während Pending deaktiviert. |
| c – Klarheit | **behoben** | Vollständiger Zeitraum jetzt bereits in der Campzeile. Gemeinsame Übersicht vor Formular und Wartelistenanmeldung zeigt Preis, Zeitraum, Ort, Alter und Verfügbarkeit. Fehlender Ort bekommt einen ausdrücklichen Vereins-Hinweis. Deutsches Kurzformat einschließlich Monats-/Jahreswechsel, z. B. „25.–29. Okt. 2027“. Warteliste wird vor Eingabe und beim Absenden ausdrücklich benannt. Widersprüchliche Hinweise zur späteren Zusage und zur sofortigen Platzreservierung in FAQ korrigiert. |
| d – Bestätigung | **behoben** | Ohne IBAN kein Überweisungsblock, stattdessen expliziter Zahlungshinweis und CP-Referenz. Mit IBAN vollständige Daten einschließlich kopierbarem Verwendungszweck. Kontakt in jedem Status ergänzt. E-Mail und weitere Schritte erklärt; pauschales „sofort nachrücken“ ersetzt. |
| e – E-Mail | **behoben; Backend-Testlauf ausstehend** | Vorhandene Sie-Anrede und namensfreie Betreffzeilen beibehalten. Datum ebenfalls im geforderten deutschen Kurzformat, auch bei Monats-/Jahreswechsel. Ohne IBAN identischer Zahlungshinweis. Camp, Zeitraum, Betrag/Referenz/IBAN bei regulärer Anmeldung bzw. Kostenfreiheit der Warteliste vorhanden. Kein Versandcode geändert. Acht zusätzliche Backend-Testfälle geschrieben, Ausführung durch Python-Zugriff blockiert. |
| f – Rechtliches | **behoben** | Teilnahmebedingungen jetzt direkt in der Pflicht-Einwilligung verlinkt; Datenschutz weiterhin vor Absenden sichtbar. Beide Links mit `_blank`/`noopener noreferrer`. Einwilligungslogik unverändert. Datenschutz nennt die tatsächlich verpflichtende Notfallnummer korrekt statt „optional“. Keine neue rechtliche Regel eingeführt. |

Nicht behoben ist die lokale Ausführungsbeschränkung für Python. Ein Test auf einem physischen Mobilgerät mit echter Bildschirmtastatur bleibt ebenfalls ausstehend; die verkleinerte Browseransicht ist dafür ein Ersatzcheck, kein Gerätenachweis.

## TESTS

### Frontend

Befehl: `npm.cmd run test --prefix frontend`

Exitcode 0. Wörtliche Ergebniszeilen des abschließenden vollständigen Laufs:

```text
 Test Files  42 passed (42)
      Tests  382 passed (382)
```

Damit 0 failed. Der bestehende `frontend/app/pilot/[org]/anrede-sie.test.tsx` ist enthalten.

Neue/erweiterte Abdeckung:

- `frontend/app/pilot/[org]/parent-journey.test.tsx`: echte React-DOM-Interaktionen für Pflichtfelder, Autofill, Rechtslinks, alle Feldfehler/ARIA, Fokus, Erhalt der Eingaben, Netzwerkfehler mit erneutem Versuch, API-Feldfehler, Pending und zwei gleichzeitige Submit-Ereignisse sowie Campübersicht/Warteliste.
- `frontend/app/lib/saasApi.test.ts`: strukturierte 422-Fehler, Altersablehnung, deutsche Fehlertexte bei 404/409/422/500, keine ungefilterten Serverwerte.
- `frontend/app/lib/parentFlowFormat.test.ts`: gleicher Monat, Einzeltag, Monats- und Jahreswechsel.
- `RegistrationFormScreen.test.tsx`, `DoneScreen.test.tsx`, `ParentFlow.test.tsx`, `pages.test.tsx` unter `frontend/app/pilot/[org]/`: Zahlungsfallback, Kontakt, Datumsdarstellung, Wartelistentext, FAQ und korrekte Pflichtangabe im Datenschutz.

### Mobiler Browser

Befehl: `node scripts/verify-parent-mobile.cjs`

Exitcode 0. Wörtliche Ergebniszeile:

```text
Mobile browser checks: 9 journeys and 6 legal pages passed; 9 mocked requests; no real API calls.
```

Chromium mit Touch-/Mobil-Emulation, 390 × 844 px und 390 × 420 px als Tastatur-Ersatzcheck; drei Themes (`tradition`, `akademie`, `kompakt`) × drei Fälle (Platz/IBAN, Platz/keine IBAN, Warteliste). Jeweils Übersicht → Details → Formular → Fehler → Absenden → Bestätigung. Dazu Datenschutz und Teilnahmebedingungen in allen drei Themes. Geprüft werden Scrollbreite, Position/Größe aller Bedienelemente, Fokus, erreichbarer Submit-Button, Zahlungsblock und Vereinskontakt.

Der reproduzierbare Prüflauf verwendet echte Elternkomponenten/CSS, synthetische Daten und gemockte API-Antworten. Next-Router/Bildkomponente, Webfonts und Bewegungs-Hook werden im Fixture ersetzt. Kein Next-Produktionsbuild, keine echte Anmeldung, kein Versand und keine Datenbankverbindung. Playwright/Vite werden aus den bereits verfügbaren Modulen verwendet; nichts installiert.

### Backend

Vorgeschriebener Versuch:

```powershell
$env:REVIEW_POSTGRES_PORT='55443'
& 'C:\Users\serka\AppData\Local\Programs\Python\Python313\python.exe' -m pytest backend_saas/tests -q
```

Ergebnis: Exitcode 1 vor pytest-Start. Wörtliche Fehlermeldung:

```text
Fehler beim Ausführen des Programms "python.exe": Zugriff verweigert
```

**Keine pytest-Ergebniszeile vorhanden; 0 failed kann nicht bestätigt werden.** Neue Datei `backend_saas/tests/test_parent_mail_copy.py`: acht Fälle für Datum und beide Elternmails mit/ohne IBAN. Vorhandene Versand-/Idempotenztests in `backend_saas/tests/test_notifications.py` bleiben unverändert. Der freigegebene lokale PostgreSQL-Port wurde gesetzt, wegen des Interpreterfehlers wurde kein Test gestartet und keine Datenbank angesprochen.

## LINT

- `npm.cmd run lint --prefix frontend`: Exitcode 0. Wörtlich: `✖ 9 problems (0 errors, 9 warnings)`.
- Warnungen ausschließlich in unveränderten Dateien: `configActions.ts` (2), `paymentActions.ts` (1), `waitlistActions.ts` (2), `hero-lab/HeroLab.tsx` (4).
- `npx.cmd tsc --noEmit -p frontend`: Exitcode 0, keine Fehlerausgabe.
- `git diff --check`: Exitcode 0.
- Unabhängiges Read-only-Code-Review gemäß `CLAUDE.md` durchgeführt; alle vier gemeldeten Befunde korrigiert. Ergänzende React-Prüfung nach `vercel:react-best-practices`: keine neuen Abhängigkeiten, keine bedingten Hooks, synchroner Submit-Lock pro Formularinstanz, gemeinsame Campanzeige als eigene Komponente.

## NICHT_AUSGEFÜHRT

- Backend-Testlauf: durch „Zugriff verweigert“ beim vorgegebenen Interpreter blockiert; muss vor Abnahme in einer Umgebung mit Zugriff nachgeholt werden.
- Physisches iOS-/Android-Gerät mit echter Tastatur sowie Produktionsfonts/echter Next-Navigation.
- Produktivzugriff, echte Anmeldung oder E-Mail-Zustellung; der Versandmechanismus wurde nicht verändert.
- Datenbankänderungen und neue Migrationen: keine.
- `npm install`, `pip install`, Watch-Modus: nicht ausgeführt.
- Deployment, Legacy-KSV-/JK-Builds und PR-/Remote-SHA-Abgleich: nicht ausgeführt; dies ist die lokale Umsetzung des isolierten SaaS-Elternpfads, keine Merge-/Deployment-Abnahme.
- `git add`, `git commit`, `git push`: nicht ausgeführt. Der Orchestrator übernimmt den Commit.

Nächster Schritt: Änderungen prüfen und den angegebenen pytest-Befehl mit zugänglichem Python 3.13 und lokalem PostgreSQL-Port 55443 ausführen. Erst danach ist das vollständige Fertig-Kriterium nachgewiesen.
