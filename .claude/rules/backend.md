---
name: backend-rules
description: Backend-spezifische Konventionen für das FastAPI/Python-Backend von CampsPilot.
paths:
  - "backend/**"
---

# Backend-Konventionen (CampsPilot)

> Gilt für alles unter `backend/`. Übergeordneter Kontext (Architektur, Sicherheitspflichten,
> Commit-Disziplin) steht in [`CLAUDE.md`](../../CLAUDE.md), nicht hier.

## Code-Stil

- Python, `snake_case` für Variablen/Funktionen, `PascalCase` für Klassen
- Business-Regeln (Altersgrenze, Camp-Wochen) leben in `camp_config.py`, nicht verstreut in
  `main.py` — neue Konfigurationswerte dort ergänzen, nicht als Magic-Number/Literal inline

## Club-Konfiguration

Club-spezifische Werte (`CLUB_NAME`, `CLUB_SUBTITLE`, `CAMP_YEAR`, `CLUB_LEGAL_NAME`, Bank- und
Kontaktdaten) kommen ausschließlich aus Env-Vars, nie als Literal im Code. Seit JK-102 hat
jeder Kunde einen eigenen Backend-Service mit eigenem Satz dieser Env-Vars — ein neuer
hartkodierter Vereinsname/Kontakt ist ein Bug, kein Stilfehler.

`GET /config` ist der öffentliche Endpunkt, der diese Werte (plus Preis, Altersregel,
Camp-Wochen) ans Frontend liefert. Neue club-spezifische Frontend-Werte gehören in dieses
Response-Modell, nicht als separate, hartkodierte Frontend-Konstante.

## API-Konventionen

- Alle Admin-Endpunkte verlangen `Authorization: Bearer <jwt>`
- **Ausschließlich parameterisierte Queries** — keine String-Interpolation in SQL
- `registration_token` (UUID) ist der öffentliche Identifier, `id` bleibt intern und wird nie
  extern exponiert (auch nicht in URLs — siehe TODO T14 zu Access-Log-Exposure)
- Stripe-Webhook: immer Signatur-Verifikation, immer idempotent
  (`AND payment_status != 'paid'`), Raw Body vor jedem JSON-Parsing sichern
- Exception-Details nicht ungefiltert in `HTTPException.detail` an den Client durchreichen,
  wenn sie DB-Struktur/Constraint-Namen preisgeben können (siehe TODO T13, aktuell noch nicht
  überall umgesetzt) — serverseitig loggen, generische deutsche Fehlermeldung zurückgeben

## Sicherheits-/Datenschutzregeln (siehe auch CLAUDE.md)

- **Keine Kinderdaten in Logs** — auch nicht in Exception-Messages oder Debug-Ausgaben
- **Keine produktiven Datenbanken für Tests** — niemals gegen die in `DATABASE_URL`
  konfigurierte Produktions-DB testen (betrifft auch `backend/test_db.py`)
- Migrationen (`migration_*.sql`) immer mit `IF NOT EXISTS`/`IF EXISTS`-Guards, idempotent;
  Migrationen, die Daten verändern (nicht nur Schema), bekommen einen Backup-Hinweis-Kommentar
  am Dateianfang (Vorbild: `migration_fix_age_constraint.sql`)
