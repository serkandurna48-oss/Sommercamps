# Textbaustein Datenschutzerklärung: Rechnungsanschrift der Eltern

> **Vorschlag, keine Rechtsberatung. Vor Nutzung rechtlich prüfen lassen.**
> Gilt ab Migration `20261107130000_parent_billing_address.sql`. Platzhalter in eckigen Klammern
> passt der Verein an. Die öffentliche Seite `/pilot/[org]/datenschutz` enthält bereits eine
> Kurzfassung (Abschnitte 2, 3 und 5); dieser Baustein ist die ausführliche Fassung für Vereine
> mit eigener Datenschutzerklärung.

## Welche Daten (Ergänzung zur Liste der Elterndaten)

- Name, E-Mail-Adresse und Telefonnummer der Eltern
- **neu:** Rechnungsanschrift der Eltern (Straße und Hausnummer, Postleitzahl, Ort), nur bei
  kostenpflichtigen Buchungen (Camp oder Training mit Preis über 0 €). Bei kostenlosen Buchungen
  wird keine Anschrift abgefragt oder gespeichert.

## Zweck

Die Anschrift wird ausschließlich für die Rechnungsstellung verwendet: Sie steht auf der Rechnung
und einer eventuellen Stornorechnung, die der Verein [Name des Vereins] über CampsPilot erstellt.
Eine Rechnung muss nach § 14 Abs. 4 UStG die vollständige Anschrift des Leistungsempfängers
enthalten; für Kleinunternehmer gilt § 34a UStDV. [Prüfen, ob die Anschrift bei Kleinbetragsrechnungen
(§ 33 UStDV) entfallen dürfte; CampsPilot verlangt sie bei jeder kostenpflichtigen Buchung, damit
jede Rechnung vollständig ist.]

Die Anschrift wird nicht für Werbung, Post oder andere Zwecke genutzt. Sie steht nicht im
E-Mail-Text, aber in der Rechnung, die als PDF-Anhang über den E-Mail-Dienstleister [Brevo]
an Sie versendet wird. [Abschnitt "Weitergabe an Dritte" entsprechend ergänzen: die öffentliche
Seite sagt dort bisher, Brevo erhalte keine Namen; seit den Elternrechnungen (B3) enthält der
PDF-Anhang Name und künftig Anschrift. Rechtlich prüfen lassen.]

## Rechtsgrundlage

- Art. 6 Abs. 1 lit. b DSGVO: Durchführung des Vertrags (Buchung des Camps bzw. Trainings).
- Art. 6 Abs. 1 lit. c DSGVO: Erfüllung rechtlicher Pflichten zur Rechnungsstellung und
  Aufbewahrung (§ 14 UStG, § 147 AO, § 14b UStG).

[Rechtsgrundlage rechtlich prüfen lassen.]

## Speicherdauer

Die Anschrift ist Teil der Rechnung und wird wie Rechnungen aufbewahrt: grundsätzlich acht Jahre
(§ 147 Abs. 1 Nr. 4, Abs. 3 AO; § 14b UStG), gerechnet ab dem Ende des Kalenderjahres, in dem die
Rechnung erstellt wurde. Die in der Rechnung festgeschriebene Anschrift wird nicht nachträglich
verändert. Die Anschrift an der Buchung selbst wird gelöscht, sobald sie nicht mehr für die
Rechnungsstellung gebraucht wird [Frist/Verfahren vom Verein festlegen; derzeit manuelle Löschung].

[Fristen rechtlich prüfen lassen.]

## Technische Hinweise (für den Verein, nicht für die Erklärung)

- Spalten `camp_registrations.parent_street`, `parent_postal_code`, `parent_city`; nur das Backend
  liest sie (kein Spaltenrecht für `authenticated`).
- Pflicht nur bei Preis > 0 nach Mitgliedspreis; bei kostenlosen Buchungen verwirft der Server
  eine mitgeschickte Anschrift.
- Sichtbar in der Teilnehmerdetailansicht (nur lesen), im Teilnehmer-Export (CSV/XLSX) und in der
  Rechnung (Snapshot in `invoices.data.recipient.address`).
