# Rechnungen und Steuer: offene Fragen an den Steuerberater

Stand: 2026-11-10. Dies sind Fragen, keine Antworten. Nichts hier ist steuerlich geprüft.

## Ausgangslage (Fakten aus dem System)

- CampsPilot erzeugt pro bezahlter Buchung automatisch eine Elternrechnung im Namen des Vereins (Aussteller = Rechnungsstammdaten des Vereins, eingefroren pro Rechnung). Bei Erstattung oder Stornierung entsteht eine Stornorechnung mit eigener Nummer.
- Der Verein stellt Steuerstatus ein: umsatzsteuerpflichtig (7 % oder 19 %, Preise brutto), Kleinunternehmer (§ 19 UStG) oder steuerbefreit (freier Befreiungstext). Die Software prüft den Status nicht inhaltlich.
- Nummern: Präfix, Jahr, laufende Nummer, je Verein und Jahr lückenlos. Rechnungen sind unveränderlich.
- Die Rechnungsanschrift der Eltern wird erst seit kurzem erhoben; ältere Buchungen haben nur Name und E-Mail.
- Zahlungen laufen über Stripe. Im Ahmad-Modell zieht CampsPilot das Geld im Auftrag des Vereins ein und zahlt monatlich abzüglich Gebühr aus.
- Die Plattformgebühr steht nicht auf der Elternrechnung.

## 1. Wer ist Rechnungsaussteller, wenn die Plattform das Geld einzieht?

1. Ist bei Einzug durch CampsPilot weiterhin der Verein der leistende Unternehmer gegenüber den Eltern, und ist die Rechnung im Namen des Vereins korrekt?
2. Handelt CampsPilot als Vermittler/Inkassostelle (Zahlungen im fremden Namen und auf fremde Rechnung) oder als Kommissionär/Leistungseinkäufer? Welche Folgen hat das für Umsatzsteuer und Rechnungsstellung?
3. Muss der Vertrag zwischen CampsPilot und Verein bestimmte Regelungen enthalten (Inkassovollmacht, Abrechnung, Haftung)?
4. Gelten die Zahlungen als Einnahme des Vereins im Zeitpunkt der Elternzahlung oder der Auszahlung?
5. Reicht der Vermerk "im Namen des Vereins, erstellt mit CampsPilot" oder braucht es zusätzliche Angaben (z. B. Zahlungsempfänger)?

## 2. Steuerstatus des Vereins bei Jugendcamps

1. Kommt für Ferien- und Trainingscamps für Kinder und Jugendliche eine Steuerbefreiung nach § 4 Nr. 22 oder § 4 Nr. 25 UStG in Betracht? Unter welchen Voraussetzungen (Anerkennung als Träger der Jugendhilfe, Bescheinigung, Art der Leistung)?
2. Wie unterscheiden sich Camps (mehrtägig, ggf. mit Betreuung/Verpflegung) und reine Trainingskurse?
3. Gilt für gemeinnützige Vereine der ermäßigte Satz oder der Zweckbetrieb (§ 65 ff. AO) statt Umsatzsteuerpflicht? Welcher Satz (7 % / 19 %) gilt dann?
4. Wann greift die Kleinunternehmerregelung (§ 19 UStG, Umsatzgrenzen) und wie wird sie bei gemischten Einnahmen geprüft?
5. Welcher Text muss bei Steuerbefreiung auf der Rechnung stehen (reicht eine Gesetzesangabe, z. B. "Steuerfrei nach § 4 Nr. 22 b UStG")? Wer prüft, dass der Status stimmt: der Verein, wir als Software?
6. Was passiert, wenn der Verein den Status ändert (Jahreswechsel, Überschreiten einer Grenze)?

## 3. Plattformgebühr: Rechnung von CampsPilot an den Verein

1. Wie ist die Gebühr umsatzsteuerlich zu behandeln, wenn CampsPilot (Einzelunternehmen/Gründer) selbst Kleinunternehmer ist oder wird?
2. Rechnung oder Gutschrift (Abrechnung nach § 14 Abs. 2 UStG)? Monatlich als Sammelrechnung über die Auszahlung?
3. Reverse Charge oder Steuerschuld des Vereins in Sonderfällen?
4. Darf die Gebühr vor Auszahlung einbehalten (Verrechnung) und wie wird das buchhalterisch dargestellt?
5. Gebühr und Stripe-Kosten: Wer trägt sie, und wie wird das auf Eltern- und Vereinsseite ausgewiesen (Elternrechnung nennt sie bewusst nicht)?

## 4. Rechnungen über 250 Euro und Anschrift des Empfängers

1. Ab 250 Euro Brutto muss der Empfänger mit Anschrift auf der Rechnung stehen (§ 33 UStDV). Genügt die erhobene Rechnungsanschrift der Eltern? Wie gehen wir mit Altbuchungen ohne Anschrift um?
2. Brauchen Eltern überhaupt Rechnungen mit Anschrift, wenn sie Privatpersonen sind (kein Vorsteuerabzug)? Gibt es eine Pflicht zur Rechnung an Privatpersonen bei Camps/Kursen (§ 14 Abs. 2 UStG gilt für Leistungen im Zusammenhang mit Grundstücken)?
3. Sollen Camps mit Gesamtbetrag über 250 Euro die Anschrift zur Pflicht machen?
4. Leistungszeitpunkt: Reicht der Camp-Zeitraum? Was gilt bei Absage oder Teilerstattung?

## 5. Aufbewahrung (10 Jahre) und Unveränderlichkeit

1. Gilt für diese Rechnungen die Aufbewahrungsfrist von 10 Jahren oder bei Privatpersonen als Empfänger von nur 2 Jahren (§ 14b UStG)? Wer muss aufbewahren: Verein, CampsPilot, beide?
2. Reicht die gespeicherte PDF-Datei mit unveränderlichem Datensatz? Sind GoBD-Anforderungen (Verfahrensdokumentation, Nachvollziehbarkeit, maschinelle Auswertbarkeit) erfüllt?
3. Was passiert mit den Rechnungen bei Löschung eines Vereinskontos oder Kündigung? Datenschutzrechtlich (Löschfristen) gegen steuerliche Aufbewahrung abwägen.
4. Wie lange darf CampsPilot Eltern-Rechnungsanschriften speichern?

## 6. Sonstiges

- Stornorechnung: Reicht das Format (negative Beträge, Bezug auf Originalrechnung) oder ist eine "Korrekturrechnung" nach § 14c UStG vorzuziehen?
- Teilerstattungen: Wie sind Netto/Steuer bei mehreren Teilstornos darzustellen (wir rechnen kumulativ, Summe ergibt exakt 0)?
- Zahlungsangabe auf der Rechnung ("Bezahlt am ... per Online-Zahlung"): rechtlich unkritisch?
- E-Rechnung (ab 2025 Pflicht im B2B): Gilt sie hier nicht, weil Empfänger Privatpersonen sind? Ab wann könnte sie Vereine mit B2B-Kunden (Schulen, Firmen) betreffen?
