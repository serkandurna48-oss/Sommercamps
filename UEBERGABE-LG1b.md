fix/lg1b-logo-url

STATUS: fertig zur Prüfung

COMMIT: f494e7414478c185e8e37ec0a5c1d2d02a28e843

TESTS:
- Frontend imageUrl.ts: 14 passed (npx vitest run --root frontend frontend/app/lib/imageUrl.test.ts)
- Frontend OrganizationConfigForm: 8 passed (npx vitest run --root frontend .../OrganizationConfigForm.test.tsx)
- Backend test_admin_organizations_api.py: 34 passed (python -m pytest backend_saas/tests/test_admin_organizations_api.py -q)
- ESLint: exit 0, keine Fehler (npm run lint --prefix frontend)
- TypeScript: exit 0, keine Fehler (npx tsc --noEmit --project frontend/tsconfig.json)

MUTATIONSPROBE:
Test: `it('rejects protocol-relative URL //evil.com/x (mutation probe: // check)')` in
`frontend/app/lib/imageUrl.test.ts`.
Wenn die Zeile `!value.startsWith('//')` aus `isAllowedImageUrl` entfernt wird, gibt die
Funktion für `//evil.com/x` `true` zurück (startet mit `/`) — Test wird rot.
Backend-Pendant: `test_patch_organization_rejects_protocol_relative_logo_url` in
`backend_saas/tests/test_admin_organizations_api.py` — ohne `//`-Check liefert der Validator
keine ValueError, FastAPI antwortet 200 statt 422, Test wird rot.

ÄNDERUNGEN:
1. frontend/app/lib/imageUrl.ts (NEU)
   Reine Funktion `isAllowedImageUrl(value)`: leer → true, https://… → true,
   /path (kein //, kein .., kein Leerzeichen) → true; alles andere → false.

2. frontend/app/lib/imageUrl.test.ts (NEU)
   14 Tests: akzeptierte Werte (leer, https, /clubs/x.png), abgelehnte Werte
   (//evil.com/x, ../x, javascript:, http://, data:, Leerzeichen), Mutationsprobe.

3. frontend/app/components/saas/config/OrganizationConfigForm.tsx
   - logo_url, hero_image_url, trainer_image_url: type="url" → type="text" inputMode="url"
   - Im useActionState-Wrapper: URL-Felder vor Server-Call gegen isAllowedImageUrl prüfen;
     bei Fehler setUrlErrors(errors) und früh { error: null, saved: false } zurückgeben.
   - urlErrors-State: pro Feld eine Fehlermeldung, die Field-Komponente setzt aria-invalid
     und aria-describedby automatisch.
   - Oben im Formular: Zusammenfassung (role="alert") wenn urlErrors gesetzt.
   - urlErrors wird zurückgesetzt, wenn org-Props sich ändern (erfolgreicher Save).

4. frontend/app/components/saas/config/OrganizationConfigForm.test.tsx
   Neuer Test: `shows error under logo_url field when submitted with invalid URL`.
   Setzt logo_url-Input auf "javascript:alert(1)", submittet das Formular,
   prüft #logo_url-error enthält "https-Adresse".

5. backend_saas/app/admin_schemas.py
   Funktion `_check_image_url`: leer → None, https:// → OK,
   /path (kein //, kein .., kein Whitespace) → OK; sonst ValueError.
   @field_validator("logo_url", "hero_image_url", "trainer_image_url") in beiden
   OrganizationCreate und OrganizationUpdate — liefert 422 mit Feldname bei
   javascript:, data:, http://, //.

6. backend_saas/tests/test_admin_organizations_api.py
   4 neue Tests:
   - test_patch_organization_accepts_relative_logo_url: /logo.svg → 200
   - test_patch_organization_accepts_https_logo_url: https://… → 200
   - test_patch_organization_rejects_javascript_logo_url: javascript:alert(1) → 422, Feldname im Detail
   - test_patch_organization_rejects_protocol_relative_logo_url: //evil.com/x → 422 (Mutationsprobe)

NICHT_AUSGEFÜHRT:
- npm run build (zwei Club-Konfigurationen) — gemäß Befehlsregeln nicht erlaubt
- Manueller Browser-Test — kein Zugriff auf laufende Instanz
- Pushback / PR-Öffnung — nur lokale Commits laut Auftrag
