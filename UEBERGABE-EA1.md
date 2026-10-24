# Übergabe EA1 – Einrichtungsassistent in 4 Schritten

Branch: `feat/ea1-einrichtung`
SHA (getestet): `88850fee594bd30fcc404b06092a7ff68968b554`
Datum: 2026-10-24

---

## Erledigt

| Kriterium | Beleg |
|---|---|
| `npm run test --prefix frontend` 0 failed | 623 Tests, 66 Dateien – alle grün |
| `npm run lint --prefix frontend` 0 errors | Keine Fehler, keine Warnungen |
| `npx tsc --noEmit -p frontend` ohne Fehler | Exit 0 |
| 10 PNG Screenshots | `C:\Users\serka\dev\_reports\jan-shots\EA1\` |
| stand.txt | `C:\Users\serka\dev\_reports\jan-shots\EA1\stand.txt` |

---

## Was gebaut wurde

**Ziel:** Ein fremder Verein kommt ohne Serkans Hilfe in unter 15 Minuten von der Registrierung bis „Zur Freigabe eingereicht".

### Neue Dateien
| Datei | Inhalt |
|---|---|
| `frontend/app/components/saas/screens/EinrichtungScreen.tsx` | `'use client'`-Wizard mit 4 Schritten (Auftritt, Rechtliches, Erstes Camp, Prüfen) |
| `frontend/app/components/saas/screens/EinrichtungScreen.test.tsx` | 5 Testgruppen: computeWizardStep, Vorlage, Navigation, OnboardingCard-Links, needsReview |
| `frontend/app/components/saas/actions/wizardActions.ts` | `'use server'`: `saveAuftrittAction`, `saveRechtlichesAction` (partial PATCH via `updateOrganizationAdmin`) |
| `frontend/app/lib/vorlagen.ts` | `VORLAGE_TEILNAHMEBEDINGUNGEN` mit `[Vereinsname]`-Platzhalter |
| `frontend/app/pilot/[org]/(org-admin)/einrichtung/page.tsx` | Server-Page: lädt Org+Camps, übergibt `requestedStep` an EinrichtungScreen |
| `playwright.config.ts` | Playwright-Konfiguration mit `webServer` (startet dev-Server auf Port 3099) |
| `e2e/ea1-screenshots.spec.ts` | 10-Screenshot-Spec für die 4 Wizard-Schritte |

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| `frontend/app/components/saas/onboardingSteps.ts` | `computeWizardStep(org, camps) → 1\|2\|3\|4` hinzugefügt |
| `frontend/app/components/saas/state/OnboardingCard.tsx` | `submitAction`-Prop entfernt; Schritt-Buttons verlinken jetzt auf `/pilot/.../einrichtung?schritt=N` |
| `frontend/app/components/saas/screens/OrgDashboardScreen.tsx` | `submitAction`-Prop nicht mehr übergeben |
| `frontend/app/components/saas/preview/AdminPreviewContext.tsx` | `previewHref` kennt jetzt `einrichtung`-Pfade; `schritt`-Param wird beibehalten |
| `frontend/app/dev/admin-vorschau/[screen]/page.tsx` | Alle 4 einrichtung-Screens inkl. `?voll=1` für Schritt 4 |
| `frontend/app/dev/admin-vorschau/fixtures.ts` | Fixtures `getPreviewFixturesEinrichtung1()` bis `getPreviewFixturesEinrichtung4Full()` |
| `frontend/app/dev/admin-vorschau/page.tsx` | Link-Eintrag für `einrichtung-4?voll=1` |
| `frontend/app/dev/admin-vorschau/screens.ts` | 4 Einrichtungs-Screens in `previewScreens` registriert |
| `frontend/app/lib/i18n/de.ts` | `einrichtung`-Abschnitt mit allen Texten; kein „Sie/Ihnen" |
| `frontend/next.config.ts` | `turbopack.root` dynamisch gesetzt – behebt Turbopack-Fehler in Git-Worktrees |

---

## Architektur-Entscheidungen

- **Kein Backend-Change:** Der Wizard nutzt ausschließlich `updateOrganizationAdmin` aus `saasAdminApi.ts` (partial PATCH, `exclude_unset` auf der Serverseite).
- **Preview-Modus:** Beide Save-Actions geben im Preview-Modus `{ ok: false, error: 'Vorschau – Änderungen werden nicht gespeichert.' }` zurück, damit das Fehler-Banner sichtbar ist.
- **`computeWizardStep`:** Reine Funktion, wiederverwendet `computeOnboardingSteps`. Schritt 1 = kein `primary_color`, Schritt 2 = kein Rechtliches, Schritt 3 = kein Camp, Schritt 4 = alles da.
- **`turbopack.root` in `next.config.ts`:** Turbopack erkennt in Git-Worktrees den Workspace-Root falsch. Die Funktion `findTurbopackRoot` traversiert das Dateisystem nach oben, bis sie `node_modules/next` findet, und übergibt dieses Verzeichnis als Root.

---

## Abweichungen von GESCHMACK.md

Keine. Der Wizard folgt der bestehenden Admin-UI-Sprache und den Theme-Variablen. Texte sind ohne „Sie/Ihnen" (admin-scope, nicht hilfe-scope). Keine hartkodiierten Farben oder Abstände.

---

## Offen

Nichts – alle Done-Kriterien erfüllt.
