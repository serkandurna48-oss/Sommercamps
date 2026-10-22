chore/ua1b-lint-warnungen

## STATUS
fertig zur Prüfung

## COMMIT
f8a4e033c16a5f289e6a046eff4f85bfc7ade8b4 — chore: UA1b Lint-Warnungen behoben

## TESTS
- `frontend/app/components/saas/actions/configActions.test.ts` → 11/11 passed
- `frontend/app/components/saas/actions/waitlistActions.test.ts` → 4/4 passed (session zuvor)
- `frontend/app/pilot/[org]/hero-lab/heroLab.test.tsx` → 11/11 passed

## LINT
`npm run lint --prefix frontend` → ESLint exited 0, keine Ausgabe (= 0 errors, 0 warnings)

## ÄNDERUNGEN

### `frontend/eslint.config.mjs`
Neuer Regel-Block am Ende des `defineConfig`-Arrays:
```js
{
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_" },
    ],
  },
},
```
Zweck: Unterdrückt Warnungen für führend-unterstrichene Parameter (`_prev`, `_formData`, `_camps`),
die durch die `useActionState`/Server-Actions-API vorgegeben sind und nicht geändert werden dürfen.

### `frontend/app/pilot/[org]/hero-lab/HeroLab.tsx`
In `useV1Motion`, `useV2Motion`, `useV3Motion`: `useEffect`-Abhängigkeitsliste von `[]` auf `[ref]`
geändert (Zeilen 170, 338, 443). `ref.current` wird in jedem Hook bereits zu Beginn des Effekts
in eine lokale Variable (`el`) übernommen — die Ergänzung ist sicher.

## NICHT_AUSGEFÜHRT
- Kein Build (`npm run build`) — war nicht Teil des Auftrags
- Keine DB-Migrationen, keine Env-Var-Änderungen
