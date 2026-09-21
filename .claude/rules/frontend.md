---
name: frontend-rules
description: Frontend-spezifische Code- und Konventionsregeln für das Next.js/React/Tailwind-Frontend von CampsPilot.
paths:
  - "frontend/**"
---

# Frontend-Konventionen (CampsPilot)

> Gilt für alles unter `frontend/`. Übergeordneter Kontext (Architektur, Sicherheitspflichten,
> Commit-Disziplin) steht in [`CLAUDE.md`](../../CLAUDE.md), nicht hier.

## Code-Stil

- TypeScript strict, Tailwind-Utility-Klassen, **keine externen UI-Libraries**
- Keine neuen Abhängigkeiten ohne ausdrückliche Rücksprache (siehe Commit-Disziplin in
  `CLAUDE.md`) — jede neue Dependency muss im PR benannt werden

## Club-Konfiguration — der zentrale Mechanismus für zwei Kunden

Beide Kunden (KSV, JK) laufen auf **derselben** Codebase. Unterschieden wird ausschließlich
über die Build-Zeit-Env-Var `NEXT_PUBLIC_ACTIVE_CLUB`:

- Unset oder jeder Wert außer `"jk"` → `frontend/app/lib/clubConfig.tsx` liefert KSV-Defaults
- `"jk"` → dieselbe Datei liefert stattdessen `frontend/app/lib/clubConfig.jk.tsx`

**Regel:** Jeder neue club-spezifische Wert (Name, Preis, Kontakt, Rechtstext, Bildpfad, FAQ,
Programminhalt, ...) gehört in `clubConfig.tsx` / `clubConfig.jk.tsx` — **niemals** als Literal
direkt in einer Komponente, Seite oder in `page.tsx`. Ein hartkodierter Verein-Name/Kontakt
außerhalb dieser Config-Dateien ist ein Bug, kein Stilfehler — er sorgt dafür, dass der eine
Kunde die Inhalte des anderen sieht.

Preis- und Camp-Wochen-Daten kommen zusätzlich zur Laufzeit vom Backend
(`frontend/app/lib/campConfig.ts` → `GET /config`) — nicht clientseitig hartkodieren, auch
nicht in `clubConfig.tsx`.

## Pflicht vor jedem Commit/PR, der geteilten Code berührt

- `npm run lint`, `npx tsc --noEmit`
- `npm run build` **zweimal**: einmal mit `NEXT_PUBLIC_ACTIVE_CLUB` unset (KSV), einmal mit
  `NEXT_PUBLIC_ACTIVE_CLUB=jk` — ein grüner Build für nur eine Seite reicht nicht
- Manuell im Browser prüfen (nicht nur Build-Erfolg) — siehe KSV-/JK-Regressionscheck in
  [`.github/pull_request_template.md`](../../.github/pull_request_template.md) bzw. den
  Subagenten [`club-regression-check`](../agents/club-regression-check.md)

## Bekannte Stolperfallen

- `registration_token` ist der einzige öffentliche Identifier für eine Anmeldung — nie `id`
  in URLs, Links oder E-Mail-Inhalten verwenden
- Altersvalidierung (`campConfig.ts`, `isAgeValidAtCampStart`) nutzt `date-fns`
  `addYears`/`startOfDay`, absichtlich schaltjahressicher und äquivalent zur
  Backend-Validierung (`camp_config.py`, `relativedelta`) — bei Änderungen beide Seiten
  synchron halten
