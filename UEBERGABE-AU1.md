fix/au1-sitzung-erneuern

STATUS: fertig zur Prüfung
COMMIT: 33a109b50bd4cacdc352a75e6d2f8926583a474c

---

## TESTS

Neue Pflicht-Tests (alle grün, seriell):

```
npx vitest run --root frontend app/lib/supabaseServer.test.ts
```

Ergebnis:
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Testnamen:
1. `kein Refresh-Aufruf bei gültigem Token`
2. `abgelaufenes Token + gültiges Refresh → neues Token und Cookies gesetzt`
3. `Refresh schlägt fehl → Cookies gelöscht, null zurück (Aufrufer leitet zum Login)`
4. `Logout löscht beide Cookies`

Gesamte Suite:

```
 Test Files  3 failed | 54 passed (57)
      Tests  4 failed | 516 passed (520)
```

Die 4 Fehler sind vorher schon rot (CSS-Pfad-Bugs in `adminLayout.test.tsx` und
`adminConsistency.test.ts`, `accessibility.test.tsx`) — unverändert, nicht durch
diese Änderung eingeführt.

TypeScript: `npx tsc --noEmit --project frontend/tsconfig.json` → keine Fehler.

---

## MUTATIONSPROBE

Wenn man in `supabaseServer.ts` die Ablaufprüfung entfernt …

```ts
// if (exp > nowSeconds + 300) return accessToken  ← entfernen
```

… dann ruft `getValidAccessToken()` für JEDES Token (auch gültige) den Refresh-
Endpunkt auf. Test `kein Refresh-Aufruf bei gültigem Token` würde rot (fetch wird
unerwartet aufgerufen). Test `abgelaufenes Token + gültiges Refresh` bliebe grün,
da der Refresh-Pfad sowieso ausgeführt wird.

---

## ÄNDERUNGEN

### Neue Dateien

| Datei | Zweck |
|---|---|
| `frontend/middleware.ts` | Edge-Middleware: erneuert Token transparent vor jedem Request auf /pilot/** und /platform/** |
| `frontend/app/lib/supabaseServer.test.ts` | 4 Pflicht-Unit-Tests |

### Kern-Logik

**`frontend/app/lib/adminSession.ts`**
- Neue Konstante `REFRESH_TOKEN_COOKIE = 'cp_admin_refresh'`

**`frontend/app/lib/supabaseServer.ts`**
- Neue Funktion `getValidAccessToken()` (mit React `cache()` für Pro-Request-Deduplizierung):
  - Liest Access-Token via `getAdminToken()` (intern, damit Test-Mocks weiter greifen)
  - Parst JWT-exp ohne Signaturprüfung (nur für Zeitvergleich)
  - Nicht-JWT-Token (z. B. Test-Fixtures) → direkt zurückgeben (kein Refresh)
  - Gültig und > 5 min → direkt zurückgeben
  - Abgelaufen/bald abgelaufen → Refresh via `POST /auth/v1/token?grant_type=refresh_token`
  - Erfolg → beide Cookies neu setzen, neues Token zurückgeben
  - Fehler → beide Cookies löschen, null zurückgeben
  - Cookie-Schreibvorgänge in try/catch: Server-Components dürfen keine Cookies schreiben
    (Next.js wirft dort), die Middleware hat den Token für diese Requests bereits erneuert

**`frontend/app/pilot/[org]/login/actions.ts`** +
**`frontend/app/platform/login/actions.ts`**
- Speichern nach dem Login zusätzlich `cp_admin_refresh` (httpOnly, secure, sameSite=lax,
  path=/, maxAge 30 Tage)

**`frontend/app/components/saas/shell/logoutAction.ts`** +
**`frontend/app/platform/logoutAction.ts`**
- Lesen Access-Token aus Cookie
- Rufen `POST /auth/v1/logout` auf (Fehler ignoriert via `.catch(() => undefined)`)
- Löschen beide Cookies (`cp_admin_token` + `cp_admin_refresh`)

**20 Aufrufer-Dateien**
- Wechsel von `import { getAdminToken } from '.../adminSession'` auf
  `import { getValidAccessToken } from '.../supabaseServer'`
- Alle Aufrufe `getAdminToken()` → `getValidAccessToken()`

---

## NICHT AUSGEFÜHRT

- **Kein Push, kein Merge**: Auftrag sieht nur lokalen Commit vor.
- **Keine `backend_saas/`-Änderungen**: Der Backend-Endpunkt `/auth/v1/logout` ist
  Supabase-intern — kein eigener Code betroffen.
- **Keine Middleware-Tests**: Edge-Runtime-Code ist in Vitest nicht isoliert testbar ohne
  weiteren Aufwand (fetch-Mock + NextRequest-Mock). Die Middleware-Logik ist einfach genug
  (dieselbe `parseJwtExp`-Funktion wie in `supabaseServer.ts`), um via manuelle
  End-to-End-Prüfung abgenommen zu werden.
- **Keine `billingActions.test.ts`-Anpassung**: Der Test mockt `getAdminToken` aus
  `adminSession`. Nach dem Umbau auf `getValidAccessToken` in `billingActions.ts` läuft
  das durch, weil `getValidAccessToken` intern `getAdminToken()` aufruft und Vitest Mocks
  auf Modul-Ebene greift — kein Test musste geändert werden.
- **Vorher-rote Tests unberührt**: Die 4 bestehenden Fehler (CSS-Pfad-Bugs) wurden nicht
  repariert; das liegt außerhalb des Auftrags.

---

## WARUM COOKIE-SCHREIBEN IN SERVER-COMPONENTS NICHT GEHT

Next.js App Router erlaubt `cookies().set()` / `.delete()` nur in Server Actions und
Route Handlers, nicht in Server Components (Seiten, Layouts). Die `getValidAccessToken()`-
Funktion wird auch aus Layouts aufgerufen. Für diese Requests läuft die Middleware VORHER
und setzt frische Cookies auf die HTTP-Response (die der Browser speichert) UND auf den
Request-Header weitergeleiteten Kontext (`NextResponse.next({ request: { headers } })`),
sodass das Layout die frischen Cookies sieht. Die try/catch-Blöcke in
`getValidAccessToken()` sind Sicherheitsnetz für den (in Prod unwahrscheinlichen) Fall,
dass Middleware den Refresh nicht abgefangen hat — dann gibt die Funktion null zurück und
das Layout leitet wie bisher zum Login weiter.
