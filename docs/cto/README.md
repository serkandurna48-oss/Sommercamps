# CTO-Übergabe CampsPilot (Stand 29.10.2026)

Für Ahmad. Ziel: in etwa zwei Stunden lokal testen, auf Staging arbeiten und den
ersten PR einreichen können. Alles hier wurde am 29.10. gegen Code, GitHub,
Vercel und Render geprüft. Wo etwas nur angenommen ist, steht es dabei.

| Nr. | Datei | Wofür |
|---|---|---|
| 1 | [01-architektur.md](01-architektur.md) | Bild des Systems, Komponenten, was Legacy ist |
| 2 | [02-daten-apis-regeln.md](02-daten-apis-regeln.md) | Tabellen, Endpunkte, Geschäftsregeln |
| 3 | [03-git-und-deployment.md](03-git-und-deployment.md) | Branches, PRs, Staging vs. Production, Release |
| 4 | [04-lokal-starten-und-testen.md](04-lokal-starten-und-testen.md) | Setup, ein Befehl für alle Tests |
| 5 | [05-saas-v1-abnahme.md](05-saas-v1-abnahme.md) | 8 Abläufe: Stand, Lücken, Abnahmekriterien |
| 6 | [06-auftraege-ahmad.md](06-auftraege-ahmad.md) | Drei priorisierte Aufträge |
| 7 | [07-risiken-und-entscheidungen.md](07-risiken-und-entscheidungen.md) | Offene Risiken, Entscheidungen |
| 8 | [08-einstellungen-und-abnahme.md](08-einstellungen-und-abnahme.md) | Dashboard-Einstellungen, Abnahme-Durchlauf v1 |

**Die drei Regeln, die nie brechen dürfen**

1. KSV ist live und verarbeitet Kinderdaten (DSGVO Art. 9). Keine Echtdaten in
   Code, Tests, Logs, Screenshots oder Chats.
2. Nichts landet in Production ohne Serkans Freigabe. Merge nach `main` und
   Push auf `feat/platform-foundation` **deployen sofort live** (siehe 03).
3. Du bekommst nur Staging-Zugänge. Production-Secrets bleiben bei Serkan.

Älterer, teils überholter Hintergrund: `CLAUDE.md`, `README.md`, `docs/saas/`.
Bei Widerspruch gilt dieser Ordner bzw. der Code.
