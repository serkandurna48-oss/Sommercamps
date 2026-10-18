# Cloud-Prüfung vor Go-live

Zwei offene Punkte lassen sich nur gegen die echte Cloud-DB klären.
Beide Skripte sind rein lesend und geben keine Personendaten aus.

---

## Voraussetzung

Supabase-Projekt **CampsPilot SaaS** (Ref `wkmckfbzhmihyfwiekct`).
Migrationen bis `20260923220000_add_platform_roles_and_audit_log.sql` müssen
angewendet sein (sonst fehlen Tabellen, Abfrage bricht ab).

---

## Skript 1 – Rollenflags und RLS-Status

**Datei:** `backend_saas/scripts/check_db_role.sql`

**Ausführen** (eine der beiden Optionen):

- Supabase Dashboard → SQL Editor → Inhalt einfügen → Run
- Terminal: `psql "$DATABASE_URL" -f backend_saas/scripts/check_db_role.sql`

**Was das Skript zeigt:**

| Abfrage | Spalten |
|---|---|
| Verbindungsrolle | `verbindungsrolle`, `ist_superuser`, `bypassed_rls` |
| Tabellenbesitz | `tabelle`, `besitzer`, `rls_aktiv`, `rls_force` |
| Policies | `tabelle`, `anzahl_policies` |

**Erwartetes Ergebnis (Go-live-bereit):**

- `ist_superuser = false`, `bypassed_rls = false` — Backend-Rolle hat keine
  übermäßigen Privilegien; Mandantentrennung hängt an App-Gates, nicht am
  Datenbanknutzer.
  Wenn `bypassed_rls = true`: RLS ist als zweite Schutzschicht wirkungslos —
  kein Go-live ohne Klärung.
- `rls_aktiv = true` für alle sechs Tabellen — RLS ist aktiviert.
  Wenn `rls_aktiv = false` für eine Tabelle: diese Tabelle ist über den
  Supabase Data API (anon-Key) lesbar — kein Go-live.
- `anzahl_policies = 0` für alle Tabellen — erwartet in diesem Stand (keine
  PostgREST-Zugriffe geplant; App verbindet sich direkt per DATABASE_URL).
  Policies > 0 sind kein Problem, nur unerwartet und zu kommentieren.

---

## Skript 2 – Bestandsaufnahme Mandanten / Testdaten

**Datei:** `backend_saas/scripts/list_test_tenants.sql`

**Ausführen** (eine der beiden Optionen):

- Supabase Dashboard → SQL Editor → Inhalt einfügen → Run
- Terminal: `psql "$DATABASE_URL" -f backend_saas/scripts/list_test_tenants.sql`

**Was das Skript zeigt:**

Zeilen je Organisation: `slug`, `name`, `plan_status`, Anzahl Camps, Anzahl
Anmeldungen, Erstelldatum, `verdacht_testdaten` (ja/leer).

Keine Personendaten: keine Namen, E-Mail-Adressen, Geburtsdaten oder Notizen
aus `camp_registrations`.

**Ergebnis lesen:**

- `verdacht_testdaten = 'ja'`: Slug oder Name enthält `demo`, `test`, `smoke`,
  `abnahme` oder `messung`. Diese Zeilen prüfen — sind das tatsächlich
  Testorganisationen?
- `anmeldungen > 0` bei Testverdacht: enthält bereits (Kinder-)Daten, die vor
  Go-live entfernt werden sollten.
- Echte Kunden ohne Testverdacht: Bestandsaufnahme für die Reihenfolge der
  Einladungen.

**Entscheidung:**

Echte Kunden mit Anmeldungen → Go-live möglich, Testdaten vorher bereinigen.
Keine Zeilen → Cloud-DB ist leer, Pilot kann starten.

---

## Testdaten löschen (separater Schritt, erst nach Freigabe)

Das Löschen von Testorganisationen und zugehörigen Daten ist ein eigenständiger,
destruktiver Schritt und wird hier nicht vorbereitet. Erst wenn die Skriptergebnisse
vorliegen und Serkan die Freigabe gibt, wird ein separates Löschskript erstellt.

Grund: `camp_registrations` enthält Kinderdaten (DSGVO Art. 9). Ein versehentliches
Löschen echter Anmeldungen wäre nicht rückgängig zu machen ohne Backup.
