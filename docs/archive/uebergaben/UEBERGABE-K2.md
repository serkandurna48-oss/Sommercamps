fix/k2-logo-warteliste

STATUS: fertig zur Prüfung

COMMIT: wird im selben Commit erfasst (fix: K2 externe Logos und Wartelisten-Bestätigung)

TESTS: npm run test --prefix frontend → 181 passed (23 Dateien), 0 failed
       npx tsc --noEmit → keine Fehler

ÄNDERUNGEN B5 – Externe Logo-URLs unoptimized:
  Betroffene Dateien (je unoptimized zu den logo_url-Image-Aufrufen ergänzt):
  - frontend/app/pilot/[org]/ParentFlow.tsx (Themes tradition, akademie, kompakt – je 1 Image)
  - frontend/app/pilot/[org]/PublicFooter.tsx (1 Image)
  - frontend/app/pilot/[org]/LegalShell.tsx (1 Image)
  - frontend/app/pilot/[org]/login/LoginForm.tsx (1 Image)
  - frontend/app/pilot/[org]/hero-lab/HeroLab.tsx (HlNav-Komponente, 1 Image)
  next.config.ts: nicht geändert.
  Neuer Test: frontend/app/pilot/[org]/logo-unoptimized.test.tsx
    12 Tests: ParentFlow (3 Themes × 2 URLs), PublicFooter (2 URLs),
    LegalShell (2 URLs), LoginForm (2 URLs).
    URLs: https://cdn.campspilot.example/logo.png (extern) und /jk/logo.jpg (lokal).
    Assertion: html.toContain(url) && !html.toContain('/_next/image')

ÄNDERUNGEN B6 – ActionForm Bestätigungspflicht:
  frontend/app/components/saas/ui/ActionForm.tsx:
  - useEffect ergänzt: setzt confirming nach Erfolg oder Fehler auf false zurück
  - Bedingung für Initial-Button vereinfacht: requireConfirm && !confirming
    (statt komplexer Prüfung auf !state.success && !state.error && !pending)
  - Erfolgs-/Fehlermeldungen werden jetzt auch im Initial-Button-View angezeigt
  - Falschen Kommentar über automatisches Neu-Mounten entfernt
  Neuer Test: frontend/app/components/saas/ui/ActionForm.test.tsx
    3 Tests (jsdom):
    - Zwei aufeinanderfolgende Beförderungen erfordern je eigene Bestätigung
      (action 2× aufgerufen, je erst nach separatem Bestätigungsklick)
    - Nach Fehler kein unbestätigter Submit erreichbar
    - Nach Abbrechen kein unbestätigter Submit erreichbar

NICHT_AUSGEFÜHRT:
  - HeroLab-Tests für logo_url (kein bestehender Test-Kontext; HeroLab-Tests
    prüfen motion/layout, nicht logo_url – Abdeckung durch ParentFlow-Tests ausreichend)
  - npm run build (kein npm install erlaubt, Build-Abhängigkeiten vollständig)
