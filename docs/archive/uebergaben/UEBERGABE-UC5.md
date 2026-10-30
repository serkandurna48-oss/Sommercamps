ux/uc5-golive-hilfe

STATUS: fertig zur Prüfung

COMMIT: c5362e1 – ux: UC5 Hilfe-Seite und Go-live-Checkliste

## TESTS

```
 Test Files  52 passed (52)
      Tests  469 passed (469)
```

Vollständiger Lauf: `npm run test --prefix frontend -- --pool=threads --maxWorkers=1` – Exit 0, **0 failed**.

## LINT

`npm run lint --prefix frontend` – Exit 0:

```
✖ 9 problems (0 errors, 9 warnings)
```

Dieselben 9 Vor-Ort-Warnungen wie in UK1/UK2e/UN1/UC3 – keine neuen Fehler.

`npx tsc --noEmit -p frontend` – Exit 0, keine TypeScript-Fehler.

## ÄNDERUNGEN

### Neue Dateien

- `frontend/app/components/saas/screens/HilfeScreen.tsx`
  Admin-Screen mit 7 Abschnitten: (1) In 3 Schritten zur Anmeldeseite, (2) Camp anlegen und
  veröffentlichen, (3) Anmeldelink teilen (WhatsApp/Instagram-Vorlagen in Sie-Form), (4) Zahlungen
  prüfen und als bezahlt markieren (CP-Referenz erklärt), (5) Warteliste und Storno, (6) Tagesliste
  exportieren, (7) Häufige Eltern-Fragen (Antworten in Sie-Form). Keine Client-Komponente, keine
  Backend-Abhängigkeit.

- `frontend/app/components/saas/screens/HilfeScreen.test.tsx`
  5 Tests: alle 7 Abschnitte vorhanden, Hilfe-Link in der Kopfzeile, Kopiertexte enthalten „Sie",
  FAQ-Antwort enthält „Sie", orgSlug erscheint im Template.

- `frontend/app/pilot/[org]/(org-admin)/hilfe/page.tsx`
  Server-Seite unter `/pilot/[org]/hilfe` – lädt Org via `getOrganizationAdmin`, rendert HilfeScreen.

- `docs/ops/go-live-verein.md`
  Go-live-Checkliste für den Gründer: Stammdaten, AVV, Testanmeldung, Link-Übergabe, Erstbeobachtung
  – mit Ankreuzfeldern.

### Geänderte Dateien

- `frontend/app/lib/i18n/de.ts`
  `de.hilfe`-Block ergänzt: 7 Abschnittstitel, `whatsappTemplate(orgSlug)`, `instagramTemplate(orgSlug)`,
  `faq`-Array mit 5 FAQ-Einträgen (Eltern-Anrede „Sie").

- `frontend/app/components/saas/shell/MatchdayBand.tsx`
  Kleiner „Hilfe"-Link neben dem Abmelden-Button in der Kopfzeile eingefügt (AdminLink, wird in der
  Preview auf `/dev/admin-vorschau/hilfe` umgeleitet).

- `frontend/app/dev/admin-vorschau/screens.ts`
  `['hilfe', 'Hilfe']` ergänzt.

- `frontend/app/dev/admin-vorschau/[screen]/page.tsx`
  HilfeScreen importiert, `case 'hilfe'` ergänzt.

- `frontend/app/dev/admin-vorschau/preview.test.tsx`
  `\bSie\b|\bIhnen\b`-Check exemptiert den `hilfe`-Screen (enthält bewusst Sie-Form in
  Eltern-Kopiertexten und FAQ). `—` / `...`-Check gilt weiterhin für alle Screens.

- `frontend/app/pilot/[org]/anrede-sie.test.tsx`
  4 neue Tests für `de.hilfe`: WhatsApp-Vorlage keine Du-Formen, Instagram-Vorlage keine Du-Formen,
  Kopiertexte siezen die Eltern, FAQ-Antworten keine Du-Formen.

## NICHT_AUSGEFÜHRT

- Kein produktiver Backend-/Datenbankzugriff, kein Deployment, kein Push.
- Kein `npm install`, kein Watch-Modus.
- Kein Browserlauf mit echter Next-Hydrierung; visueller Check nur per jsdom-Tests abgesichert.
- Backend-Änderungen: keine (Auftragsgrenze).
- Vollständiger Testlauf mit Standardparallelität nicht gestartet (bekanntes Worker-Start-Timeout-Problem
  auf Windows, identisch zu UK1/UK2e/UC3); Thread-Lauf mit `--pool=threads --maxWorkers=1` bestand
  alle 469 Tests in 52 Dateien ohne Fehler.
