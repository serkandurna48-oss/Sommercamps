<!--
  Bitte ausfüllen, bevor der PR zur Review freigegeben wird.
  Nicht zutreffende Punkte explizit als "N/A" markieren statt zu löschen —
  so bleibt nachvollziehbar, dass der Punkt geprüft und bewusst übersprungen wurde.
-->

## Ziel und Problem

<!-- Was soll dieser PR erreichen? Welches Problem löst er? -->

## Durchgeführte Änderungen

<!-- Stichpunktartig, konkret. Kein "diverse Fixes". -->

## Bewusst nicht veränderte Bereiche

<!-- Was hättest du anfassen können, hast es aber absichtlich nicht getan — und warum? -->

## Betroffene Kunden

- [ ] KSV Baunatal
- [ ] JK Performance Academy
- [ ] Beide
- [ ] Keiner (z. B. reine Doku, Tooling)

## Testcheckliste

- [ ] `npm run lint` grün
- [ ] `npx tsc --noEmit` grün
- [ ] `npm run build` grün (KSV-Konfiguration, `NEXT_PUBLIC_ACTIVE_CLUB` unset)
- [ ] `npm run build` grün (JK-Konfiguration, `NEXT_PUBLIC_ACTIVE_CLUB=jk`) — falls Frontend betroffen
- [ ] `python -m py_compile main.py camp_config.py` grün — falls Backend betroffen
- [ ] Manuell im Browser geprüft (nicht nur Build-Erfolg)

## KSV-Regressionscheck

<!-- Nur ausfüllen, wenn KSV betroffen sein könnte (auch bei geteiltem Code/Backend). -->

- [ ] Hero/Landingpage sieht wie erwartet aus
- [ ] Preisanzeige stimmt (kommt aus Backend-`/config`, kein hartkodierter/veralteter Wert)
- [ ] Anmeldeformular: Absenden funktioniert, Bestätigungsseite erscheint
- [ ] Admin-Login und Registrierungstabelle funktionieren
- [ ] Mobile-Darstellung geprüft
- [ ] N/A — Änderung kann KSV nicht betreffen (Begründung: ______)

## JK-Regressionscheck

<!-- Nur ausfüllen, wenn JK betroffen sein könnte. -->

- [ ] Mit `NEXT_PUBLIC_ACTIVE_CLUB=jk` lokal geprüft
- [ ] Keine KSV-spezifischen Inhalte (Rechtsdaten, Kontakt, Preise) sichtbar
- [ ] Mobile-Darstellung geprüft
- [ ] N/A — Änderung kann JK nicht betreffen (Begründung: ______)

## Risiken

<!-- Was könnte im schlimmsten Fall schiefgehen? Was ist der Blast Radius? -->

## Screenshots

<!-- Bei jeder visuellen Änderung: Vorher/Nachher, Desktop + Mobile. Sonst diesen Abschnitt löschen. -->

## Datenbank- oder Env-Änderungen

- [ ] Neue Migration hinzugefügt (Dateiname: ______) — idempotent (`IF NOT EXISTS`/`IF EXISTS`)?
- [ ] Backup vor Migration gezogen bzw. Snapshot-Plan dokumentiert
- [ ] Neue Env-Var eingeführt (Name: ______) — in `.env.example`/`.env.local.example` **und**
      in Render-/Vercel-Dashboard ergänzt?
- [ ] Neue Dependency hinzugefügt (Name/Version: ______) — Grund: ______
- [ ] N/A — keine DB-, Env- oder Dependency-Änderungen

## Rollback-Hinweis

<!-- Wie macht man diese Änderung im Notfall rückgängig? Reicht ein Redeploy des
     vorherigen Deploys (Render/Vercel), oder braucht es zusätzliche Schritte
     (z. B. Migration zurückrollen, Env-Var entfernen)? -->
