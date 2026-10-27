# KSV 2027 – Speicherdauer: prüfbarer Betreiberentwurf (27.10.2026)

**Release-Gate, keine Rechtsfreigabe.** Der tatsächliche KSV-Alttext
`frontend/app/datenschutz/page.tsx`, Abschnitt 6, behauptet Löschung nach
Camp und Aufbewahrungsfristen, spätestens nach 12 Monaten, sowie frühere
Löschung auf Wunsch. Für diese behauptete Frist wurde im Code kein
automatischer Löschvorgang gefunden. Die SaaS-Seite
`frontend/app/pilot/[org]/datenschutz/page.tsx`, Abschnitt 5, sagt dagegen
ausdrücklich, dass keine Löschfrist festgelegt und keine automatische
Löschung implementiert ist. Beide Texte dürfen für die Veröffentlichung
nicht widersprüchlich bleiben.

## Bestehende Technik und Lücken

- `backend_saas/app/routers/admin.py` hat Storno-/Statusfunktionen, aber
  keinen Löschendpunkt für Camp-Anmeldungen oder Camps. `DELETE` für
  Organisationsmitglieder ist keine Anmeldungslöschung.
- `backend_saas/scripts/smoke_check.py` gibt nur einen einzelnen
  `DELETE`-SQL-Vorschlag für einen Testdatensatz aus; dies ist keine
  Aufbewahrungsroutine.
- Die Migration `20260917133748_create_saas_schema_v1.sql` nutzt
  `ON DELETE RESTRICT` bei Camp/Organisation und Anmeldungen. Das verhindert
  pauschale Elternlöschung über ein Camp, regelt aber keine Frist.
- `docs/ops/betrieb.md` nennt den SaaS-Backup-Plan als ungeprüft; ein
  eigenes SaaS-Backup-Skript liegt nicht vor. Provider-Aufbewahrung und
  Wiederherstellung sind nicht verifiziert.
- Die vorhandenen Rechtsgrundlagen (Art. 6 Abs. 1 lit. b; für freiwillige
  Gesundheitsangaben Art. 9 Abs. 2 lit. a) bleiben unverändert. Für
  Zahlungsbelege und Backups ist keine neue Grundlage abgeleitet.

## Zur Betreiberentscheidung, getrennt je Datenklasse

| Klasse | Beginn/Ende als prüfbares Kriterium | Zu entscheiden und zu belegen |
|---|---|---|
| Anmeldung und Kontakt | Ab Anmeldung bis Campdurchführung und Abschluss berechtigter Nachfragen | Konkrete Nachlaufdauer, Umgang mit Storno/Warteliste, Löschverantwortliche |
| Notfall- und Gesundheitsangaben | Nur für Vorbereitung und sichere Durchführung des jeweiligen Camps | Möglichst kurzer eigener Löschzeitpunkt nach Campende, Sonderfälle dokumentieren, Trennung vom restlichen Anmeldedatensatz technisch planen |
| Zahlungsnachweise | Von Zahlung/Erstattung bis Abschluss der einschlägigen Nachweis- und Prüfpflichten | Tatsächlich einschlägige Belegarten und Fristen mit Betreiber/Rechtsprüfung belegen; nur erforderliche Zahlungsdaten behalten |
| Backups | Vom Erstellen des jeweiligen Backups bis zum Ablauf seiner Rotation | Tatsächlichen Supabase-Plan, Snapshot-/PITR-Retention, Wiederherstellungs- und Nachlöschverfahren prüfen |

Vor Veröffentlichung: Betreiber bestätigt Fristen/Kriterien mit Quelle,
Text in beiden Datenschutzhinweisen wird abgestimmt, technische Löschung
einschließlich Gesundheitsdaten und Backups wird implementiert und getestet
oder ein belegter manueller Ablauf mit Zuständigkeit eingerichtet. Eine
Anfrage auf vorzeitige Löschung braucht Einzelfallprüfung; die aktuelle
Implementierung garantiert sie nicht automatisch. Keine pauschale
rechtliche Freigabe aus diesem Entwurf ableiten.
