# WEYS Engineering Standard V1 (Entwurf zur Co-Founder-Abnahme)

Stand: 2026-11-06 · Firmenweiter Arbeitsstandard für Claude Code, Codex und spätere Runner.  
**Quelle für gemeinsame Strategie/Entscheidungen:** [WEYS Engineering Standard in Notion](https://app.notion.com/p/410921783bbd81fdb27fe60a05209e94).  
**Geltung:** CampsPilot, CommandPilot und WEYS OS; dieses Dokument ist eine übergreifende Prozessschicht, ersetzt **keine** bestehende projektspezifische `CLAUDE.md`, `.claude/rules/`, `AGENTS.md`, CI- oder Sicherheitsregeln. Bei Widersprüchen strengere Sicherheitsregel beachten und Konflikt zur Freigabe eskalieren.

## 0. North Star

WEYS OS soll Arbeitsaufträge, KI-Agenten, unabhängige Qualitätssicherung und sichtbare Ergebnisse verbinden. **Erfolg = überprüfte Verbesserung für Kunden/Unternehmen**, nicht lange Sessions, viele Agenten, Commit-Zahlen oder generierte Features.

Serkan und Ahmad sind gleichberechtigte Co-Founder. Jeder führt sein operatives Ressort selbstständig im vereinbarten Mandat, strategische Grundsatzfragen benötigen gemeinsame Zustimmung.

## 1. Bestehende Infrastruktur erhalten

- **CampsPilot:** `CLAUDE.md` ist kanonisch; `AGENTS.md` verweist darauf. Bestehende Frontend-/Backend-Regeln und `club-regression-check` gelten weiter.
- **CommandPilot:** hat laut seinem `CLAUDE.md` bereits Work Orders und lokale Runner-Adapter. Diese als vorhandenen Dispatcher evaluieren und ggf. erweitern, statt eine parallele Queue in WEYS OS neu zu implementieren.
- **GitHub** ist Quelle für Code, PR-SHA, CI und Git-Historie. **WEYS OS** wird gemeinsame Oberfläche und evidenzbasierter Founder Pulse, nicht ein zweites Git oder CRM.
- Notion enthält langfristige Entscheidungen/Spezifikationen, nicht den Ersatz für GitHub-Reviews.

## 2. Work-Order-Contract

Jeder Auftrag besitzt mindestens:

```yaml
id: WEYS-WO-0001
source_url: "GitHub-Issue oder CRM-/Support-Signal"
repo: "owner/repo"
business_outcome: "welche messbare Verbesserung für Nutzer oder Firma?"
problem: "reproduzierbarer Ist-Zustand"
acceptance_criteria:
  - "binär testbare Bedingung 1"
  - "binär testbare Bedingung 2"
non_goals:
  - "keine unbetroffenen Module ändern"
allowed_paths:
  - "konkret/betroffener/ordner/**"
risk_tier: L1
owner: "verantwortliche Person"
implementer: "claude"
independent_reviewer: "codex"
budget:
  max_minutes: 45
  max_attempts_per_cause: 2
  max_cost_eur: null # NULL = KEINE Budgetfreigabe, nie unendlich
test_plan:
  - "relevante Unit-/Integrationstests"
  - "Lint/Typecheck/Build"
approval: "proposed"
```

Schema ist ein **logischer Vertrag**; an die vorhandenen CommandPilot-Work-Order-Felder mappen, nicht blind eine zweite Datenbank anlegen. Vor automatischer Ausführung muss ein reales Budgetlimit explizit hinterlegt und vom Owner freigegeben sein.

## 3. State Machine

`proposed → specified → approved_for_build → running → submitted_for_review → qa_passed | qa_failed → awaiting_release_approval → accepted → released → impact_verified`

Jede Phase darf zu `blocked` oder `cancelled` wechseln. Alle Übergänge persistieren `job_id`, `actor`, `timestamp`, `source`, `commit_sha`, `test_result`, `cost`, `approval` und die Fehlerursache. Kein „done“ nur aufgrund einer Agentenmeldung.

## 4. Implementierungszyklus

1. **Planner:** Problem verstehen, minimalen Scope und Akzeptanzkriterien konkretisieren. Unklare Vorgaben => Rückfrage/Blocker statt Coding.
2. **Dispatcher:** genau einen verantwortlichen Implementer und einen isolierten Branch/Worktree mit minimalen Rechten starten. Ein Lauf = ein klar abgegrenzter Auftrag.
3. **Implementer:** kleinsten sinnvollen Fix/Feature mit Tests liefern; keine ungeplanten Dependencies, fremden Module oder Architektur-Änderungen.
4. **Independent Judge:** Diff und Testbeweise separat prüfen, Gegenbeispiele und riskante Annahmen suchen; der Autor nimmt sich **nicht selbst** ab.
5. **CI + SHA-Gate:** getesteter SHA muss PR-Head entsprechen. Vor Review/Übergabe `scripts/check-review-sha.ps1` in CampsPilot verwenden. Repo-spezifische Testmatrix inklusive beider Club-Konfigurationen beachten.
6. **Human Approval:** Freigabe für riskante Merges, Datenmigration, Security, Verträge, Production und Budgetänderungen bleibt bei autorisierten Menschen.
7. **Outcome:** Nach Umsetzung belegbaren Release-/Kundeneffekt messen und mit ursprünglichem Signal verknüpfen.

## 5. Berechtigungen, Daten und Stopregeln

| Stufe | Standard | Freigabe |
| --- | --- | --- |
| L0 | Lesen, Analyse, Berichte, interne Vorschläge | Read-only Serviceidentität |
| L1 | Issue/Entwurf, Tests, eigene isolierte Worktree-Änderung | expliziter Work-Order-Scope |
| L2 | Staging-PR/Simulation | unabhängiger Judge und klarer Owner |
| L3 | Production, reale Kundenkommunikation, migrations- oder geldrelevante Aktionen | spezifische menschliche Freigabe; keine Selbstgenehmigung |
| L4 | irreversible Datenlöschung, Verträge, Security-Ausnahmen | nicht autonom |

- Keine Kinder-, Allergie-, Zahlungs- oder personenbezogenen Kundendaten in Prompts/Logs. Tests ausschließlich mit synthetischen, isolierten Daten. **Keine Tests gegen Produktivdatenbanken.**
- Kein Agent darf eigene Budgets, Berechtigungen oder Zuständigkeitsgrenzen erweitern.
- Ein Job stoppt bei fehlender Auth/Secrets/Plugin, Budgetüberschreitung, unklarer Risikoklasse, wiederholtem Fehler oder fehlendem Nachweis.
- Pro Fehlerursache höchstens **2 gezielte Wiederholungen**. Bei wiederholten Infrastruktur-Umgehungen separate Work Order erstellen.
- Start-Pilot: **1 Implementer + 1 unabhängiger Reviewer, höchstens 2 parallele laufende Work Orders insgesamt**. Mehr Worker erst, wenn Annahmequote und Kosten pro Ergebnis messbar besser werden.
- Laufzeitgrenze im Pilot zunächst 45 Minuten je kleinen Auftrag; größere Arbeiten zerlegen statt zweistündige Endlossession.
- Ein dauerhaftes Modell-Gespräch ist kein Scheduler. Trigger/Queue startet zeitlich begrenzte Runs; Abschlusszustände sind persistent, wiederholte Ereignisse dedupliziert.

## 6. CampsPilot-spezifische unveränderte Pflichten

- `CLAUDE.md`, `.claude/rules/frontend.md`, `.claude/rules/backend.md` und `.github/pull_request_template.md` gehen allgemeinen Beispielwerten vor.
- Veränderungen am geteilten Club-Code für KSV/JK getrennt prüfen. Relevante Build-/Testausführung im PR mit Umgebung und SHA nachweisen.
- Mandanten-Isolation, öffentliche vs. interne Identifier, Stripe-Webhook-Signaturen und idempotente Migrationen beachten.
- Nicht zu `main` committen, nicht ungefragt mergen/deployen. Aktuelle repo-spezifische Freigaben gelten weiter.
- Veraltete README-Testzahlen sind keine Live-Beweise; stets den tatsächlichen aktuellen Test-/CI-Status prüfen.

## 7. Ergebnisformat und Qualitätsmetriken

**Jede Übergabe: exakt fünf Zeilen** (bei Risiken kurze verlinkte Belege ergänzen):

```text
Erledigt: [was, für wen, Issue/PR]
SHA: [geprüfter 40-stelliger Commit oder „nicht committed“]
Getestet: [Befehle, Umgebung, Pass/Fail, Reviewer]
Offen: [Risiken, fehlende Abnahme, offene Entscheidungen]
Nächster Schritt: [eine nächste Aktion, Owner]
```

Wöchentlich als **Pilot-KPIs** messen: `accepted_outcomes`, `lead_time`, `first_pass_qa`, `escaped_defects`, `cost_per_accepted_outcome`, `human_touch_time` und `customer_impact`. Kein Benchmark vor genügend echten Fällen; Nenner und Datenquelle angeben. „Unbekannt“ ist nicht Null.

## 8. Einführung und Abnahme

- [ ] Serkan und Ahmad bestätigen strategische Rechte, Kostenlimits und welche Änderungen ohne menschliche Freigabe erfolgen dürfen.
- [ ] Aktuellen CommandPilot-Runner mit logischem Work-Order-Vertrag abgleichen (kein neues Backend erfinden).
- [ ] 2–4 risikoarme Aufträge in einer Woche als Pilot mit tatsächlichen Budget-/Test-/QA-Logs abnehmen.
- [ ] Für 1–2 Wochen Baseline erfassen, dann erst Parallelität erhöhen.
- [ ] WEYS OS liest die echten Run-/QA-/Kosten-Ergebnisse **quellengetreu** über Adapter; kein eigenmächtiges Überschreiben.
- [ ] Als nächstes den Standard in CommandPilot referenzieren, sobald Ahmad ihn geprüft hat.

**Status:** Dieser Standard ist ein Vorschlag als Draft-PR und nicht automatisch freigegeben oder in lokale Claude-Code-Sessions installiert.
