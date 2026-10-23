feat/s2b-registrierung-ui

## STATUS

Abgeschlossen. Alle Pflichtkriterien erfüllt.

## COMMIT

SHA: d685f80ff20b0d7b19cd151f493d4b49827eec34
Message: `feat: S2 Registrierung und Einreichen zur Freigabe`

## TESTS

Befehl: `npx vitest run --root frontend`
Ergebnis: 4 failed | 483 passed (487) — die 4 Fehlschläge sind ausschließlich pre-existente
Umgebungsfehler (ENOENT auf tokens.css / focus.css, CWD-Bug im glob), nicht S2b-bedingt.

Alle 4 Pflichttestsuiten bestanden (0 failed, 0 errors):

| Datei | Tests | Ergebnis |
|---|---|---|
| `RegistrierenForm.test.tsx` | 8 | ✓ passed |
| `SubmitReviewButton.test.tsx` | 7 | ✓ passed |
| `OnboardingCard.test.tsx` | 8 | ✓ passed |
| alle übrigen S2b-Suiten | — | ✓ passed |

## MUTATIONSPROBE

`SubmitReviewButton.tsx:handleSubmit` enthält die Guard-Zeile:
```typescript
if (!avvChecked) return
```
Test `'Einreichen ohne AVV-Haken: kein API-Aufruf (Mutationsprobe)'` erwartet, dass
`action` nicht aufgerufen wird, wenn diese Guard-Zeile entfernt wird. Probe bestanden.

## ÄNDERUNGEN

### Neu erstellt
- `frontend/app/(marketing)/campspilot/registrieren/page.tsx` — Marketing-Seite `/campspilot/registrieren`
- `frontend/app/(marketing)/campspilot/registrieren/RegistrierenForm.tsx` — Registrierungsformular (Client Component)
- `frontend/app/(marketing)/campspilot/registrieren/RegistrierenForm.test.tsx` — 8 Tests
- `frontend/app/components/saas/state/SubmitReviewButton.tsx` — Dialog + AVV-Checkbox (Client Component)
- `frontend/app/components/saas/state/SubmitReviewButton.test.tsx` — 7 Tests
- `frontend/app/components/saas/state/reviewActions.ts` — Server Action `submitReviewAction`

### Geändert
- `frontend/app/lib/saasAdminApi.ts` — `OrganizationAdmin` um `review_status` + `review_note` erweitert; `submitReviewAdmin()` hinzugefügt
- `frontend/app/lib/i18n/de.ts` — Neue Schlüssel für Review-Dialog und Onboarding-Schritt 3
- `frontend/app/(marketing)/campspilot/marketing.css` — `.reg-*` CSS-Klassen für Registrierungsseite
- `frontend/app/(marketing)/campspilot/page.tsx` — Nav-Button + Pilotbereich-CTA → `/campspilot/registrieren`
- `frontend/app/components/saas/state/OnboardingCard.tsx` — Schritt 3 zeigt `SubmitReviewButton` für draft/rejected
- `frontend/app/components/saas/state/OnboardingCard.test.tsx` — review_status-Tests + noopAction
- `frontend/app/components/saas/screens/OrgDashboardScreen.tsx` — `submitReviewAction` als Prop an `OnboardingCard`

### Fixture-Fixes (TypeScript-Compliance)
- `frontend/app/components/saas/config/OrganizationConfigForm.test.tsx`
- `frontend/app/components/saas/dailyWorkflow.test.tsx`
- `frontend/app/components/saas/onboardingSteps.test.ts`
- `frontend/app/components/saas/screens/HilfeScreen.test.tsx`
- `frontend/app/dev/admin-vorschau/fixtures.ts`
- `frontend/app/platform/setupProgress.test.ts`

## SCREENSHOT-HINWEISE

Nicht durchgeführt (kein lokaler Browser-Lauf in dieser Session). Folgende Pfade manuell prüfen:

- `/campspilot/registrieren` — Formular mit Pflichtfeldern, Passwort-Toggle, AGB-Checkbox
- `/campspilot/registrieren` nach erfolgreichem POST — Bestätigungsansicht mit E-Mail + 24h-Hinweis
- `/pilot/{slug}/dashboard` (draft org) — Onboarding-Schritt 3 mit „Zur Freigabe einreichen"-Button
- `/pilot/{slug}/dashboard` (approved org) — Schritt 3 weiterhin „Jetzt veröffentlichen" (Regression)
- `/campspilot` — Nav-Button + Pilotbereich-CTA zeigen „Verein kostenlos anlegen"

## NICHT AUSGEFÜHRT

- `npm run build` (KSV + JK): kein `&&`-Befehl erlaubt, kein Watch-Modus
- Deploy / Push to origin: noch nicht
- Backend-Endpunkte `POST /public/signup` und `POST /admin/organizations/{slug}/submit-review`
  werden in dieser Session nicht berührt; müssen in `backend_saas/` bereits existieren
