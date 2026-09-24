# Fehlende Rechtsangaben für Impressum/Datenschutz (backend_saas)

Betrifft `/pilot/{org}/impressum` und `/pilot/{org}/datenschutz` (neu, siehe
`frontend/app/pilot/[org]/impressum/page.tsx`) — jeder Verein zeigt dort nur seine eigenen,
echten Angaben, nie erfundene oder fremde. Aktuell für alle Vereine auf der Plattform leer.

## Was pro Verein fehlt

1. **Anschrift** (`organizations.legal_address`, neu — Migration
   `20260924130000_add_organization_legal_address.sql`) — Straße, PLZ, Ort. Ohne dieses Feld
   zeigt die Impressum-Seite ehrlich „Anschrift noch nicht angegeben“, niemals einen Platzhalter
   oder KSV's Adresse.
2. **Rechtlicher Name** (`legal_name`, existiert bereits als Feld, aber für keinen SaaS-Verein
   befüllt) — falls abweichend vom angezeigten Vereinsnamen (z. B. „KSV Baunatal e.V.“ statt
   „KSV Baunatal“).
3. **Ansprechpartner** (`contact_person_name`, existiert bereits) — für „Vertreten durch“.
4. **Speicherdauer/Löschfrist** — bewusst NICHT im Datenmodell, weil hier keine Rechtsberatung
   erfunden werden soll. Die neue Datenschutzseite markiert das offen (Abschnitt 5 der Seite);
   der Verein muss selbst entscheiden, wie lange Anmeldedaten nach Camp-Ende aufbewahrt werden,
   und den Text ggf. von einer sachkundigen Stelle prüfen lassen.

## Für JK Performance Academy

Punkt 1–3 wurden JK bereits gefragt — siehe
[`docs/onboarding/jk-content-and-legal-questions.md`](../onboarding/jk-content-and-legal-questions.md),
Fragen 2 und 3 ("Wie lauten Adresse und die verantwortliche Person für das Impressum?" /
"An welche Adresse/Person sollen sich Anfragen zum Datenschutz richten?"). Laut diesem Repo
liegt darauf noch keine Antwort vor. Bevor JK auf `backend_saas` eingeladen wird: diese Antworten
einholen (falls für die alte `backend/`-Migration schon woanders beantwortet, hier übernehmen —
nicht neu raten) und über die Vereinskonfiguration (`/pilot/jk-.../konfiguration`) eintragen.

## Für KSV Baunatal

Alle drei Angaben existieren bereits — sichtbar auf der aktuellen (fest codierten) Seite
`frontend/app/impressum/page.tsx`: „KSV Baunatal e.V.“, „Altenritter Str. 37, 34225 Baunatal“,
„Ergün Ünal“. Falls/wenn KSV jemals auf `backend_saas` migriert (aktuell nicht geplant, siehe
root CLAUDE.md), können dieselben Werte 1:1 in die neuen Felder übernommen werden — kein neues
Beschaffen nötig, nur Übertragung.

## Was ich nicht selbst entschieden/erfunden habe

- Keinen Beispieltext für „Speicherdauer“ eingesetzt — echte Löschfristen sind eine
  Geschäfts-/Rechtsentscheidung, keine technische.
- Keine Vereinsregister-Nummer/Registergericht-Angaben ins Datenmodell aufgenommen (KSVs Vorlage
  hat das) — nicht jeder künftige SaaS-Kunde ist zwangsläufig ein eingetragener Verein; falls
  gebraucht, ist das eine bewusste spätere Erweiterung von `legal_address` oder ein eigenes Feld,
  kein impliziter Fallback auf KSVs Rechtsform.
