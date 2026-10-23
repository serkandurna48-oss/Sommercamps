fix/au1b-middleware

STATUS: fertig zur Prüfung
COMMIT: c2e9a4fa7d470b0b5e0f25dde449de7aaee3f9d0

---

## TESTS

### Neue Pflicht-Tests (middleware.test.ts):

```
npx vitest run --root frontend frontend/middleware.test.ts
```

Ergebnis:
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

Testnamen:
1. `gültiges Token → kein fetch`
2. `Access fehlt + Refresh da → fetch + beide Cookies gesetzt`
3. `abgelaufenes Token → fetch`
4. `Supabase 400 invalid_grant → Cookies gelöscht`
5. `Supabase 429 → Cookies bleiben`
6. `Prefetch → kein fetch`
7. `Token ohne Padding wird korrekt gelesen`
8. `decideRefresh: kein Refresh ohne Refresh-Cookie`

### Bestehende Pflicht-Tests (supabaseServer.test.ts):

```
npx vitest run --root frontend frontend/app/lib/supabaseServer.test.ts
```

Ergebnis:
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Gesamte Suite:

```
npx vitest run --root frontend
```

Ergebnis:
```
 Test Files  3 failed | 55 passed (58)
      Tests  4 failed | 524 passed (528)
```

Die 4 Fehler sind dieselben wie in AU1 (CSS-Pfad-Bugs in `adminLayout.test.tsx`,
`adminConsistency.test.ts`, `accessibility.test.tsx`) — nicht durch diese Änderung
eingeführt. Gegenüber AU1 (57 Dateien, 520 Tests) kommen genau +1 Datei und +8 Tests
durch `middleware.test.ts` dazu.

TypeScript: `npx tsc --noEmit --project frontend/tsconfig.json` → keine Ausgabe (keine Fehler).

---

## MUTATIONSPROBE

Befund-1-Fix rückgängig: In `decideRefresh` die Zeile
```ts
if (!access) return 'refresh'
```
zu `return 'skip'` ändern (oder durch die alte Bedingung `if (!access || !refresh) return 'skip'` ersetzen).

Dann gibt `decideRefresh({ access: undefined, refresh: 'old-refresh', ... })` → `'skip'` statt `'refresh'`.
Die `middleware`-Funktion ruft sofort `NextResponse.next()` auf, ohne `fetch` anzufragen.

Test `Access fehlt + Refresh da → fetch + beide Cookies gesetzt` → **rot**:
`expect(fetch).toHaveBeenCalled()` schlägt fehl, weil fetch nie aufgerufen wurde.

Alle anderen Tests bleiben grün (sie haben beide Cookies gesetzt oder sind von diesem Pfad unabhängig).

---

## ÄNDERUNGEN

### Befund 1 (hoch) — Access-Cookie fehlt, Refresh da → trotzdem kein Refresh (alter Bug)

**Ursache:** `if (!access || !refresh) return NextResponse.next()` ließ Requests ohne Access-Cookie (nach Browser-Ablauf nach 1 h) einfach durch, statt zu erneuern.

**Fix:** Neue exportierte Funktion `decideRefresh({ access, refresh, now, isPrefetch })`:
- Kein `refresh`-Cookie → `'skip'`
- Prefetch → `'skip'`
- Kein `access`, aber `refresh` da → `'refresh'` ← neuer Zweig
- `parseJwtExp` liefert gültiges `exp > now + 300` → `'skip'`
- Sonst → `'refresh'`

Middleware ruft `decideRefresh` auf statt direkter `if`-Kette.

### Befund 2 (mittel) — base64url-Padding fehlt → `atob` wirft sporadisch

**Fix:** In `parseJwtExp`:
```ts
base64 += '='.repeat((4 - (base64.length % 4)) % 4)
```
Vor dem `atob`-Aufruf aufgefüllt. Getestet durch `Token ohne Padding wird korrekt gelesen`
mit einem Payload, dessen base64url-Kodierung Länge % 4 ≠ 0 hat.

### Befund 3 (mittel) — Parallel-Requests und Fehlerbehandlung

**Prefetch:** Middleware prüft `Next-Router-Prefetch: 1` und `purpose: prefetch` via
`decideRefresh(..., isPrefetch: true)` → gibt sofort `'skip'` zurück.

**Fehlerbehandlung:** Nur bei HTTP 400 + Supabase-Error `invalid_grant` oder
`refresh_token_not_found` werden Cookies gelöscht. Bei 429/5xx und Netzwerkfehlern
bleiben Cookies unverändert und der Request wird durchgelassen.

```ts
} else if (res.status === 400) {
  const errCode = String(body?.error ?? body?.error_code ?? '')
  if (errCode === 'invalid_grant' || errCode === 'refresh_token_not_found') {
    clearCookies = true
  }
}
// 429 / 5xx: clearCookies bleibt false → pass-through
```

### Befund 4 (mittel) — Middleware testbar machen

`parseJwtExp` und `decideRefresh` werden aus `middleware.ts` exportiert.
`middleware()` ist der dünne Wrapper, der Next.js-Cookies liest und die reine Logik anwendet.

Neue Testdatei: `frontend/middleware.test.ts` (8 Tests, alle grün).
`next/server` wird mit einem minimalen Mock (`NextResponse.next` → Objekt mit `cookies.set/delete`)
gemockt; keine Edge-Runtime-Abhängigkeit im Testlauf.

### Befund 5 — Elternseiten unter `/pilot/:org` ohne Admin-Cookies

Bereits durch Befund 1 abgedeckt: `if (!refresh) return 'skip'` ist die erste Prüfung in
`decideRefresh`. Ohne Refresh-Cookie (Besucher, nicht Admin) tritt die Middleware
sofort zurück — keine Mehrarbeit.

---

## NICHT AUSGEFÜHRT

- **Kein Push, kein Merge**: Auftrag sieht nur lokalen Commit vor.
- **Kein `backend_saas/`-Code geändert**: Middleware liegt vollständig im Frontend.
- **Kein `npm run build`**: Nicht im Auftrag, nicht im erlaubten Befehlsset.
- **Keine Änderung an `supabaseServer.ts` oder anderen Aufrufer-Dateien**: Die Fixes in
  diesem Auftrag betreffen ausschließlich `frontend/middleware.ts` +
  `frontend/middleware.test.ts`. Die `getValidAccessToken`-Funktion in `supabaseServer.ts`
  bleibt unverändert (AU1-Stand).
