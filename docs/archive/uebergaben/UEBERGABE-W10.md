# UEBERGABE-W10.md

feat/w10-fussballschulen

**STATUS:** fertig zur Prüfung

---

## COMMIT

`20e7e978c6bd8485ee0172da102a67beb439bc43`

---

## TESTS

```
Test Files  66 passed (66)
     Tests  617 passed (617)
  Duration  ~12 s
```

Neue Tests in `frontend/app/(marketing)/campspilot/marketing.test.tsx`:

```
describe('fs – Fußballschulen-Abschnitt')
  ✅ Anker #fussballschulen existiert im Markup
  ✅ enthält alle drei Punkte
  ✅ Knopf verweist auf #pilot
  ✅ enthält kein „Online-Zahlung"
```

---

## MUTATIONSPROBE

Wenn `id="fussballschulen"` in `page.tsx` umbenannt wird, liefert
`wrapper.querySelector('#fussballschulen')` → `null`, und alle vier
fs-Tests schlagen fehl. Damit ist belegt, dass die Tests das Richtige
prüfen.

---

## TEXTE (wörtlich)

**Überschrift:** Für Fußballschulen mit vielen Standorten.

**Punkt 01:** Alle Camps an allen Gastvereinen auf einer Seite; jedes
Camp mit eigenem Ort, Termin, Preis und Plätzen.

**Punkt 02:** Eltern bekommen sofort eine Bestätigung mit
Überweisungsdaten und eigenem Verwendungszweck; Zahlungseingänge haken
Sie in einer Liste ab, statt Bargeld an jedem Standort einzusammeln.

**Punkt 03:** Tagesliste je Camp zum Drucken und Excel-Export für die
Trainer vor Ort.

**Markensatz:** Ihr Logo, Ihre Farben – die Gastvereine sehen Ihre
Marke.

**Knopf:** „Pilotplatz anfragen" → href="#pilot"

---

## SCREENSHOTS

`C:\Users\serka\dev\_reports\jan-shots\W10\`

- `fullpage-1440.png`
- `fullpage-390.png`
- `section-1440.png`
- `section-390.png`
- `stand.txt`

**Hinweis:** Screenshots zeigen nur den neuen Abschnitt (ohne Hero,
Navigation, andere Sektionen), da der Next.js-Dev-Server nicht via
Playwright-Subprocess gestartet werden konnte (siehe unten).

---

## GESCHMACK-ABWEICHUNGEN

Keine inhaltlichen Abweichungen von GESCHMACK.md.

Festgestelltes:

- Dunkles Theme (--night), Orange-Akzent (--accent), Pill-Button
  (9999px), d2-Headline: alles konform.
- Mobil einspaltig: ✅ (kein Grid, fs-list ist flex-column).
- Kein Bild im Abschnitt: bewusst — er ist ein reiner Text/Liste-
  Abschnitt wie „Die Linie" (#vertrauen). Die Gesamtseite hat Bilder.
- Fullpage- und Section-Shots sind identisch, da kein laufender Server
  verfügbar war (nur CSS-Rendering via page.setContent).

---

## NICHT AUSGEFÜHRT

**Next.js-Dev-Server via Playwright:** Next.js 16 verwendet Turbopack
standardmäßig für `next dev` und `next build`. In Git-Worktrees
erkennt Turbopack die Workspace-Grenze falsch (`frontend\app` statt
`frontend`) und kann `next/package.json` nicht auflösen. Der Fehler:

```
Error: Next.js inferred your workspace root, but it may not be correct.
We couldn't find the Next.js package (next/package.json) from the
project directory: …\frontend\app
```

Das tritt nur beim Start via Subprocess (Playwright webServer) auf.
Ob `npm run dev` direkt aus dem Terminal funktioniert, konnte nicht
geprüft werden (Berechtigung verweigert für hintergrundlaufende
Prozesse in dieser Sitzung).

**Empfehlung:** Screenshots nach dem Merge bitte einmal manuell
erstellen: `cd frontend && npm run dev` → `http://localhost:3000/campspilot`.

---

## ÄNDERUNGEN

| Datei | Was |
|---|---|
| `frontend/app/(marketing)/campspilot/page.tsx` | Neuer `<section id="fussballschulen">` vor `#pilot`; Nav-Link „Fußballschulen" ergänzt |
| `frontend/app/(marketing)/campspilot/marketing.css` | `.fs-list`, `.fs-brand` als neue CSS-Klassen |
| `frontend/app/(marketing)/campspilot/marketing.test.tsx` | Neuer `describe`-Block `fs – Fußballschulen-Abschnitt` (4 Tests + dokumentierte Mutationsprobe) |
