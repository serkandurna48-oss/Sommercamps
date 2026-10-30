feat/d4-ksv-hero-kontrast

STATUS: fertig zur Prüfung
COMMIT: a0fb72619632d6ca4592308ce36513de4b4d187d

---

## TESTS

```
 Test Files  65 passed (65)
      Tests  603 passed (603)
   Start at  11:10:08
   Duration  36.40s
```

`npm run lint --prefix frontend` → 0 errors
`npx tsc --noEmit -p frontend` → 0 errors

## MUTATIONSPROBE

readableTextOn immer Weiß: `d1b.test.tsx` Zeile "readableTextOn mutation probe" schlägt fehl,
weil `readableTextOn('#B8912B')` = `#111111` ≠ `#ffffff`.

---

## ÄNDERUNGEN

### 1. Hero-Bild (Punkt 1)
- `clubAssets.ts`: KSV `heroImage` → `/clubs/ksv/ksv-1-mannschaft.jpg` (1800×1350 px, schärfer)
- Neues Feld `heroPosition?: string` in `ClubAssets`; KSV → `'center 30%'` (Gesichter oben, Schatten unten)
- `ParentFlow.tsx`: Tradition- und Akademie-Hero-Image nutzen `clubAssets?.heroPosition ?? 'center 20%'` als `objectPosition`
- `RegistrationFormScreen.tsx`: Aside-Foto nutzt `assets.heroPosition ?? 'center 20%'`

### 2. Galerie (Punkt 2)
- KSV `galleryImages` = `['ksv-gruppenfoto.jpg', 'ksv-kinder-pokal.jpg', 'ksv-torwart.jpg']`
- `ksv-pokale.jpg` raus; Gruppenfoto rückt von Hero in die Galerie (1600 px reichen dort)

### 3. Knopf-Kontrast (Punkt 3)
- Neue Datei `frontend/app/lib/readableTextOn.ts`:
  `readableTextOn(hex)` → `'#ffffff'` wenn Weiß/Primärfarbe ≥ 4,5:1, sonst `'#111111'`
- `page.tsx` + `LegalShell.tsx` setzen `--on-primary: readableTextOn(brand.brand)` als CSS-Variable
- `publicTheme.css`: `.btn.primary`, `.nav-cta-brand`, `.h-btn-brand`, `.marquee-inner`, `.legal-back-pill`, `.sticky-cta-btn` nutzen jetzt `color: var(--on-primary)` statt `--brand-on`
- KSV #CC0000 → Weiß (5,88:1); JK #B8912B → #111 (2,85:1)
- `.login-btn` und `.nav-logo-trad` behalten `--brand-on` (Admin-Kontext, LoginForm setzt kein --on-primary)

### 4. Checkboxen (Punkt 4)
- `publicTheme.css`: `.cp-public .consent input` von 22×22 auf 20×20 px
- M3-Override `.cp-public #s-form .consent input[type='checkbox']` von 24×24 auf 20×20 px

### 5. Tests (Punkt 5)
- `d1b.test.tsx`: Hero-Test auf `ksv-1-mannschaft.jpg` aktualisiert; Galerie-Test pokale → gruppenfoto
- Neue Tests: `heroPosition` = `'center 30%'` für KSV; Fallback `'center 20%'` ohne heroPosition
- `readableTextOn('#CC0000')` = `#ffffff`; `readableTextOn('#B8912B')` = `#111111`; `readableTextOn('#FFFFFF')` = `#111111`
- Mutationsprobe: `#B8912B` darf nicht `#ffffff` zurückgeben
- Checkbox-Test: liest `publicTheme.css` direkt, prüft `width: 20px` + `height: 20px`

---

## NICHT_AUSGEFÜHRT

- Kein npm install; keine lokale Dev-Server-Vorschau (Auftrag verlangt nur Tests + Checks)
- `ksv-1-mannschaft.jpg` muss in `frontend/public/clubs/ksv/` vorliegen (Bild-Deployment = Serkan)
- `hero-lab` setzt kein `--on-primary` (nur Vorschau-Tool, kein Produktionspfad)
- GESCHMACK.md Abweichungen: keine; alle Regeln eingehalten (CSS-Variablen, keine Farbwerte hart kodiert)
