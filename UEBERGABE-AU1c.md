fix/au1c-proxy

STATUS: BLOCKIERT (1 manueller Schritt nötig — dann fertig zur Prüfung)

COMMIT: e801d3a57bf751a77ad3510df90be1fa6b329299

---

TESTS

npm run test --prefix frontend (ganze Suite):
  Test Files  1 failed | 58 passed (59)
        Tests  1 failed | 540 passed (541)  ← nur der Existenz-Check schlägt fehl

Der einzige Fehlschlag: proxy.test.ts > "frontend/middleware.ts existiert nicht mehr im Ordner frontend/"
→ Ursache: git rm wurde vom Bash-Permission-System verweigert (don't-ask-Mode, irreversible Operation).
→ Lösung: den folgenden Befehl manuell ausführen:
    git rm frontend/middleware.ts frontend/middleware.test.ts
  Danach: npm run test --prefix frontend → 0 failed.

npm run lint --prefix frontend: 0 errors
npx tsc --noEmit -p frontend: 0 errors

MUTATIONSPROBE

proxy.test.ts enthält den Test:
  "MUTATIONSPROBE: config.matcher enthält "/" — ohne diesen Eintrag würde der Redirect-Test nie feuern"
  → prüft config.matcher.includes('/')
  → schlägt fehl, sobald '/' aus dem matcher entfernt wird ✓

---

ÄNDERUNGEN

frontend/proxy.ts (überschrieben)
  - export async function proxy(request) — kombiniert Marketing-Redirect und Token-Erneuerung
  - Pfad genau '/' → Redirect auf /campspilot wenn NEXT_PUBLIC_SITE_MODE=campspilot-marketing
  - Pfade /pilot/* und /platform/* → Sitzungs-Token-Erneuerung (identisch zu bisherigem middleware.ts)
  - importiert decideRefresh aus ./app/lib/sessionRefresh (nicht mehr inline)
  - export const config = { matcher: ['/', '/pilot/:path*', '/platform/:path*'] }

frontend/app/lib/sessionRefresh.ts (neu)
  - export function parseJwtExp(token): number | null
  - export function decideRefresh(opts): 'skip' | 'refresh'
  - reine Funktionen, kein Next.js-Import, testbar ohne Edge-Runtime-Mock

frontend/proxy.test.ts (neu, ersetzt middleware.test.ts)
  - Alle 8 bisherigen Testfälle aus middleware.test.ts übernommen (Imports auf ./proxy + ./app/lib/sessionRefresh angepasst)
  - Neu: Redirect bei '/' mit Marketing-Modus
  - Neu: kein Redirect bei '/' ohne Marketing-Modus
  - Neu: kein Redirect bei '/pilot/x' trotz Marketing-Modus
  - Neu: fs.existsSync-Check auf frontend/middleware.ts (schlägt fehl bis manueller git rm)
  - Neu: MUTATIONSPROBE matcher enthält '/'

---

NICHT_AUSGEFÜHRT

git rm frontend/middleware.ts
git rm frontend/middleware.test.ts

→ Bash verweigert (don't-ask-Mode lehnt irreversible Dateilöschungen ohne Bestätigung ab).
→ Beide Dateien sind noch im Worktree und im Git-Index vorhanden.
→ Solange middleware.ts existiert:
    (a) next dev wirft die "Both middleware.ts and proxy.ts detected"-Warnung
    (b) Der Existenz-Check-Test in proxy.test.ts schlägt fehl
→ Manuelle Korrektur:
    git rm frontend/middleware.ts frontend/middleware.test.ts
    git commit -m "fix: AU1c middleware.ts und middleware.test.ts entfernt"
