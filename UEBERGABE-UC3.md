ux/uc3-feinschliff

STATUS: fertig zur Prüfung

COMMIT: (folgt nach git commit)

## TESTS

Alle 4 UC3-relevanten Testdateien einzeln geprüft (Gesamtlauf bricht auf Windows durch Worker-Start-Timeouts ab — bekanntes Infrastructure-Problem, identisch zu UK1/UK2e):

```
ParticipantRow.test.tsx   Test Files  1 passed (1)  Tests  3 passed (3)
LaunchSuccessCard.test.tsx  Test Files  1 passed (1)  Tests  3 passed (3)
OnboardingCard.test.tsx   Test Files  1 passed (1)  Tests  5 passed (5)
dailyWorkflow.test.tsx    Test Files  1 passed (1)  Tests  22 passed (22)
```

## LINT

```
✖ 9 problems (0 errors, 9 warnings)
```

Dieselben 9 Vor-Ort-Warnungen wie in UK1/UK2e/UN1 – keine neuen Fehler.

`npx tsc --noEmit -p frontend` – Exit 0, keine TypeScript-Fehler.

## ÄNDERUNGEN

### Befund 1 – Doppelter Rahmen in der Teilnehmerliste

- `frontend/app/components/saas/data/ParticipantRow.tsx`
  Der Aufklapp-Button (Expand-Trigger) trug keinen expliziten Rahmen-Override und wurde deshalb
  vom sekundären Button-Default (`border: 1px solid var(--cp-field-line)`) gestylt — sichtbarer
  Rahmen innerhalb der bereits gerahmten `cp-roster`-Karte. Fix: `style={{ border: '1px solid
  transparent' }}` direkt am Button.

- `frontend/app/components/saas/data/ParticipantRow.test.tsx`
  Neuer Test `'renders the expand trigger with a transparent border (no double-border in the
  roster card)'` (Zeile 68–72): prüft `trigger.style.border === '1px solid transparent'`.

### Befund 2 – Zwei primäre Aktionen gleichzeitig sichtbar

- `frontend/app/components/saas/screens/OrgDashboardScreen.tsx`
  `variant={showCard ? 'secondary' : 'primary'}` für „+ Camp anlegen" (Zeile 121): solange die
  Startkarte sichtbar ist, erscheint der Button sekundär.

- `frontend/app/components/saas/dailyWorkflow.test.tsx`
  Zwei neue Tests: `'degrades "Camp anlegen" to secondary while the onboarding card is visible'`
  und `'promotes "Camp anlegen" to primary once onboarding is complete'`.

### Befund 3 – Screenreader-Zugänglichkeit der Startkarte

- `frontend/app/components/saas/state/OnboardingCard.tsx`
  Jeder Schritt-`<li>` trägt `aria-current={active ? 'step' : undefined}`. Im Schritttitel steht
  zusätzlich `<span className="sr-only"> {done ? 'erledigt' : active ? 'aktiv' : 'offen'}</span>`
  (visuell versteckt).

- `frontend/app/components/saas/state/OnboardingCard.test.tsx` (neu)
  5 Tests in `'OnboardingCard accessibility'`: `aria-current`-Bewegung über alle 3 Schritte,
  sr-only-Texte für erledigt/aktiv/offen.

### Befund 4 – Erfolgszustand nach Veröffentlichung

- `frontend/app/components/saas/state/LaunchSuccessCard.tsx` (neu)
  Karte für den Moment nach der ersten Veröffentlichung: SuccessNote „Deine Anmeldeseite ist
  live.", URL-Zeile, „Anmeldelink kopieren" (primär, kopiert via `navigator.clipboard`), 
  „Elternseite ansehen" (sekundär). Kopier-Feedback via `role="status"` (Erfolg) und
  `role="alert"` (Fehler). Sichtbar solange genau ein veröffentlichtes Camp und noch keine
  Anmeldungen.

- `frontend/app/components/saas/screens/OrgDashboardScreen.tsx`
  `showLaunchSuccess = publishedCamps.length === 1 && totalRegistrations === 0` (Zeile 35),
  LaunchSuccessCard statt des einfachen SuccessNote-Blocks wenn Bedingung erfüllt.

- `frontend/app/lib/i18n/de.ts`
  `de.onboarding.liveCopyLink = 'Anmeldelink kopieren'` ergänzt.

- `frontend/app/components/saas/state/LaunchSuccessCard.test.tsx` (neu)
  3 Tests: Karte zeigt alle 3 Elemente, Kopieren schreibt korrekte URL und zeigt Bestätigung,
  Clipboard-Fehler zeigt Alert.

- `frontend/app/components/saas/dailyWorkflow.test.tsx`
  `'shows launch success card with copy-link button when first camp just published and no
  registrations'` (Zeile 142–148): prüft alle 3 Textelemente.
  `'shows regular success card without copy button once registrations exist'` (Zeile 150–156):
  stellt sicher, dass bei vorhandenen Anmeldungen kein Kopier-Button erscheint.

### Korrekturen während der Umsetzung

- `frontend/app/components/saas/state/LaunchSuccessCard.test.tsx`
  Assertion `container.querySelector('[role="status"]')` traf `SuccessNote` (hat ebenfalls
  `role="status"`) statt der Kopier-Bestätigung. Fix: alle `[role="status"]`-Elemente prüfen mit
  `querySelectorAll` + `.some(...)`.

- `frontend/app/components/saas/state/OnboardingCard.test.tsx`
  Fixture `orgBase.contact_email` war `null` — im Interface ist das Feld `string` (nicht
  `string | null`). Fix: `''` (leerer String, wird korrekt als unvollständig erkannt).

## NICHT_AUSGEFÜHRT

- Kein produktiver Backend-/Datenbankzugriff, kein Deployment, kein Push.
- Kein `npm install`, kein Watch-Modus.
- Gesamter Vitest-Lauf schlägt auf Windows durch Worker-Start-Timeouts fehl (Infrastruktur,
  nicht Testlogik) — alle UC3-Testdateien einzeln grün.
- Kein Browserlauf mit echter Next-Hydrierung; visueller Check nur per jsdom-Tests abgesichert.
- Backend-Änderungen: keine (Auftragsgrenze).
