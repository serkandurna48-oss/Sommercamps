design/m7-legal

STATUS: fertig zur Prüfung

COMMIT: noch ausstehend (wird direkt nach dieser Datei angelegt)

TESTS:
  npm run test --prefix frontend → 19 passed, 149 Tests, 0 failed
  npx tsc --noEmit --project frontend/tsconfig.json → 0 Fehler
  Neue Tests: frontend/app/pilot/[org]/legal.test.tsx (13 Tests)
    - LegalShell rendert Nav mit Vereinsname (3 × Theme)
    - LegalShell rendert Footer mit allen drei Rechtslinks (3 × Theme)
    - LegalShell Footer zeigt Vereins-E-Mail
    - LegalShell Logo-img wenn logo_url gesetzt
    - LoginForm rendert Logo und Submit-Button
    - LoginForm rendert Vereinsname als Label
    - LoginForm data-theme und Login-Karte (3 × Theme)

GEÄNDERTE_DATEIEN:
  NEU   frontend/app/pilot/[org]/LegalShell.tsx
          Gemeinsamer Wrapper für Rechtsseiten: theme-aware (cp-public, data-theme,
          Font-Klassen, Brand-Vars), GrainOverlay, sticky Nav (Logo + Vereinsname
          links, „Zur Übersicht"-Pill rechts), PublicFooter.
  NEU   frontend/app/pilot/[org]/PublicFooter.tsx
          Zweizeiliger Footer: links Logo + Vereinsname + Kontakt-E-Mail,
          rechts Impressum/Datenschutz/Teilnahmebedingungen-Links,
          darunter „Anmeldung und Verwaltung über CampsPilot".
  NEU   frontend/app/pilot/[org]/teilnahmebedingungen/page.tsx
          Neue Rechtsseite (war bisher #agb-Anker), 5 Abschnitte mit TOC.
  NEU   frontend/app/pilot/[org]/legal.test.tsx
          13 neue Tests (Nav, Footer-Links, Login).
  MOD   frontend/app/pilot/[org]/publicTheme.css
          M7-Block am Ende: legal-nav, legal-col, legal-h1, legal-toc, legal-body,
          foot-top/left/links, login-wrap/card/logo/field/btn.
  MOD   frontend/app/pilot/[org]/impressum/page.tsx
          Nutzt LegalShell; HTML auf legal-label/h1/body-Klassen umgestellt.
  MOD   frontend/app/pilot/[org]/datenschutz/page.tsx
          Nutzt LegalShell; Sprungmarken-TOC (8 Abschnitte); legal-body-Klassen.
  MOD   frontend/app/pilot/[org]/ParentFlow.tsx
          PublicFooter-Inline-Funktion entfernt, Import aus PublicFooter.tsx;
          Aufruf von orgSlug auf org geändert (beide Stellen: OrgScreen + WaitScreen).
  MOD   frontend/app/pilot/[org]/login/page.tsx
          fetchOrganization + computeBrandSafe; übergibt orgName, orgLogoUrl,
          orgTheme, brandStrong, brandOn an LoginForm.
  MOD   frontend/app/pilot/[org]/login/LoginForm.tsx
          Theme-aware: cp-public + data-theme + publicTheme.css; Logo (Image),
          login-brand-label, login-h1, login-field (48 px), login-btn (Pill 9999px);
          tokens.css + archivo-Import entfernt.

NICHT_AUSGEFÜHRT:
  - Browser-Sichtprüfung (kein Dev-Server gestartet; Logik unverändert,
    Layout rein CSS/JSX, TypeScript und Tests grün)
  - Deployment auf Vercel/Render
