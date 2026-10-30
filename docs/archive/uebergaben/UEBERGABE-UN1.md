ux/un1-erstnutzung

STATUS: fertig zur Prüfung

COMMIT: 63f20bd – ux: UN1 Erstnutzung leerer Verein

## TESTS

```
 Test Files  48 passed (48)
      Tests  440 passed (440)
```

## LINT

```
✖ 9 problems (0 errors, 9 warnings)
```

Dieselben 9 Vor-Ort-Warnungen wie in UK1/UK2e – keine neuen Fehler.

`npx tsc --noEmit -p frontend` – Exit 0, keine TypeScript-Fehler.

## ÄNDERUNGEN

### Neue Dateien

- `frontend/app/components/saas/onboardingSteps.ts`
  Reine Berechnungslogik: `computeOnboardingSteps(org, camps)` → `{step1Done, step2Done, step3Done}`, `missingRequiredOrgFields(org)`.
  - Schritt 1 erledigt: `contact_email + legal_address + terms_text` alle nicht leer
  - Schritt 2 erledigt: mindestens ein Camp vorhanden
  - Schritt 3 erledigt: `site_published === true` + mindestens ein Camp mit `status === 'published'`

- `frontend/app/components/saas/onboardingSteps.test.ts`
  18 Tests – alle Kombinationen für `computeOnboardingSteps` und `missingRequiredOrgFields`:
  leerer Verein, Schritt 1–3 einzeln, Whitespace-Randfall, Schritt-3-unabhängig-von-Schritt-1, mehrere Camps.

- `frontend/app/components/saas/state/OnboardingCard.tsx`
  Startkarte mit 3 nummerierten Schritten, Haken für erledigte Schritte, je eine primäre Aktion pro aktivem Schritt.
  Links: Schritt 1 → `/konfiguration`, Schritt 2 → `/camps/new`, Schritt 3 → erstes Entwurfs-Camp `/konfiguration`.
  Nutzt `ButtonLink` (via AdminLink, Preview-kompatibel), `de.onboarding.*` aus `de.ts`.

### Geänderte Dateien

- `frontend/app/lib/i18n/de.ts`
  `de.onboarding`-Block hinzugefügt: `cardTitle`, `step{1,2,3}{Title,Body,Action}`, `missingFieldsHint`, `missingFieldsAction`, `liveLabel`, `liveOpen`.

- `frontend/app/components/saas/screens/OrgDashboardScreen.tsx`
  - `showCard = !step3Done` steuert den Branch
  - `showCard=true`: TodayRegistrations ausgeblendet, Jetzt-dran-Bereich durch `OnboardingCard` ersetzt
  - `showCard=false`: TodayRegistrations sichtbar; bei `missingFields.length > 0` kleiner Hinweis mit Ergänzen-Link vor Aufgaben; bei keinen Aufgaben Erfolgszustand (SuccessNote + `/pilot/{orgSlug}` + „Elternseite ansehen")

- `frontend/app/components/saas/dailyWorkflow.test.tsx`
  - `org`-Fixture um `site_published: true` und Pflichtfelder ergänzt (nötig, damit bestehende Dashboard-Tests weiterhin das normale Dashboard testen)
  - `'distinguishes no arrivals today from no camps'` → erwartet jetzt OnboardingCard (Schritt 2, da Org vollständig)
  - `'keeps the done state…'` → erwartet jetzt Erfolgszustand (`'Deine Anmeldeseite ist live.'`)
  - Neuer Test: `'shows onboarding card (Schritt 3) when camp exists but site not yet published'`

- `frontend/app/dev/admin-vorschau/fixtures.ts`
  Zwei neue Exportfunktionen: `getPreviewFixturesDashboardStep1()` (leerer Verein ohne Pflichtfelder), `getPreviewFixturesDashboardStep3()` (vollständige Angaben + Entwurfs-Camp, `site_published: false`).

- `frontend/app/dev/admin-vorschau/[screen]/page.tsx`
  `?schritt`-Query-Param für Dashboard ergänzt: `leer=1|schritt=1` → Schritt 1, `schritt=2` → Schritt 2 (bestehende leere Fixtures), `schritt=3` → Schritt 3 (neuer Entwurfs-Camp-Zustand).

- `frontend/app/dev/admin-vorschau/page.tsx`
  Vorschau-Index zeigt zusätzliche Links `?schritt=2` und `?schritt=3` für das Dashboard.

- `frontend/app/dev/admin-vorschau/preview.test.tsx`
  - `'shows daily arrivals…'`-Test aktualisiert: erwartet OnboardingCard-Inhalte im Leerzustand, Konfigurationslink statt Camp-neu-Link
  - Neuer Test: `'shows onboarding card steps 2 and 3 for the dashboard preview variants'` – prüft Schritt-2-Link (`camp-neu`) und Schritt-3-Link (`camp-konfiguration?camp=technikcamp`)

## NICHT_AUSGEFÜHRT

- Kein produktiver Backend-/Datenbankzugriff, kein Deployment, kein Push.
- Kein `npm install`, kein Watch-Modus.
- Kein Browserlauf mit echter Hydrierung; keine Screenshots.
- Visueller Check der neuen Karte (Haken, Badges, Opacity) nur per jsdom-Tests abgesichert, nicht per Browser-Messung.
- Backend-Änderungen: keine (Auftragsgrenze).
