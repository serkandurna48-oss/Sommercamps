# K27DATA – Übergabe, 27.10.2026

**STATUS: lokaler Integrationskandidat mit extern blockierter Python-Prüfung; keine Veröffentlichung.**

## Manifest (27.10.2026)

| Pfad | Ergebnis |
|---|---|
| `backend_saas/seeds/ksv-2027-drafts.json` | Genau fünf offline vorbereitete KSV-Entwürfe: Winter 04.–07.01., Ostern 22.–25.03., Sommer 1 28.06.–01.07., Sommer 2 02.–05.08., Herbst 04.–07.10.2027; ISO-Kalendertage inklusiv, 70 Plätze, `draft`; Preis/Alter/Anmeldezeiten absichtlich null. |
| `backend_saas/scripts/prepare_ksv_2027.py` | Standard-Dry-Run ohne DB/API/Netz; feste Organisation `ksv-baunatal`, einstellbare Kapazität, Abgleich gegen synthetisches lokales Snapshot-JSON, gleiche Entwürfe idempotent, Konflikte abgelehnt. `--write-plan` schreibt nur ein lokales Review-JSON. Kein Cloud-Apply-Pfad. |
| `backend_saas/seeds/ksv-2027-questions.json` | Bestehende Vertragskeys `position`, `verein`, Feldspieler/Torwart, KSV Baunatal/Kein Verein/Anderer Verein mit Freitext. Keine Sondertabelle. |
| `backend_saas/app/payment_reference.py`, `app/schemas.py`, `app/repositories/registrations.py`, `app/routers/registrations.py`, `app/notifications/sending.py`, `app/notifications/templates.py` | Ausgewählter Camptitel + bestehender CP-Tokenpräfix im Zahlungszweck von API und Mail; keine Kinder-/Elternnamen oder Zusatzantworten im Mailinhalt. HTML-Inhalte bleiben escaped. Betrifft den generischen SaaS-Codepfad; keine vorhandenen DB-Zeilen geändert. |
| `backend_saas/tests/test_ksv_2027_prepare.py`, `test_parent_mail_copy.py`, `test_notifications.py`, `test_registration_questions.py` | Synthetische Tests für fünf Termine, Idempotenz/Fremdverein-Konflikt, Saisons, Geschwister, Namensvermeidung und HTML-Escaping vorbereitet bzw. Erwartungen angepasst. **Nicht ausgeführt** (Runtime-Blocker unten). |
| `docs/ops/ksv-2027-admin.md` | Tatsächliche Routen, Camp-Pflege, Export/Druckdialog und K27FORM-Abgrenzung. |
| `docs/ops/ksv-2027-datenschutz-entwurf.md` | Abgleich realer Abschnitt-6-/Abschnitt-5-Texte mit fehlender automatischer Löschung; getrennte Betreiberentscheidungen für Anmeldung/Kontakt, Gesundheits-/Notfallangaben, Zahlungsnachweise, Backups. |

Keine parallelen UI-/Formulardateien geändert. Keine externe Schreibaktion, keine echte Mail/Zahlung, kein DB- oder Paketlauf, keine Zugangsdaten gelesen. Kein `git add`/`git commit`.

## Quellen und bestätigte Vorlagen

- Vor dem Entwurf gelesen: `CLAUDE.md`, der Leitstand-Auftrag vom 27.10.2026, `GESCHMACK.md`, `UEBERGABE-W10.md`, `backend/camp_config.py`, `backend_saas/seeds/ksv-baunatal.sql`, `backend_saas/scripts/ksv_zusatzfragen.py` und `import_ksv.py`.
- Legacy-Alter 5–12 aus `backend/camp_config.py` und 149 EUR aus `backend/.env.example`/historischem SaaS-Seed sind **nur explizite Vorlagen**, keine belegten 2027-Kundenwerte. Das 2026-Seed nennt seinen Kapazitätswert 40 selbst einen Platzhalter. Bankdaten wurden nicht übernommen; die Beispiel-IBAN ist keine Kundenvorgabe.
- `RegistrationQuestion` erlaubt `choice`, `options`, `other_label`, `required`; `extra_answers` bleibt an der Anmeldung. Die bestehende Konfiguration enthält bereits `position` und `verein`. Der Vorschlag ergänzt „Kein Verein“. Die Konfiguration wird nicht automatisch per PATCH gesetzt und verändert keine gespeicherten Antworten. Vor Anwendung ist zu prüfen, ob geänderte Labels alte Antworten in der aktuellen Exportprojektion beeinflussen.

**Exaktes synthetisches Mailbeispiel** für Eingabe-Kind `Ada Beispiel`,
Camp `Winter-Fußballschule 2027`, Tokenanfang `12345678`, ohne hinterlegte
IBAN/Preis, Verein `Beispielverein`, Kontakt `kontakt@beispiel.test`:

```text
Betreff: Anmeldebestätigung – Winter-Fußballschule 2027
<p>Guten Tag,</p>
<p>Ihre Anmeldung für <strong>Winter-Fußballschule 2027</strong>
(4.–7. Jan. 2027) ist bei uns eingegangen.</p>
<p>Verwendungszweck: <strong>Winter-Fußballschule 2027 CP-12345678</strong></p>
<p>Der Verein meldet sich zur Zahlung. Beispielverein sendet Ihnen die Zahlungsdetails direkt.<br>
E-Mail: kontakt@beispiel.test</p>
<p>Bei Fragen wenden Sie sich direkt an Beispielverein:<br>
E-Mail: kontakt@beispiel.test</p>
<p>Viele Grüße,<br>Beispielverein</p>
```

Der synthetische Kindname erscheint weder im Betreff noch im Body oder
Verwendungszweck. Das Beispiel ist aus dem Template abgeleitet, wegen der
gesperrten Python-Runtime aber nicht gerendert/verifiziert.

## Prüfungen: echte Ausgaben

```text
git diff --check
Exit 0, keine Ausgabe.

PowerShell ConvertFrom-Json + Assertions für Draft-/Fragen-Dateien:
STATIC CHECK PASS: 5 exact date ranges; capacity=70; draft; price=null; question keys=position,verein
Exit 0.

python --version
python : Die Benennung "python" wurde nicht als Name eines Cmdlet ... erkannt.
Exit 1.

C:\Users\serka\Desktop\Projekte\cp-i1-integration\backend_saas\venv\Scripts\python.exe --version
did not find executable at 'C:\Users\serka\AppData\Local\Programs\Python\Python313\python.exe': Zugriff verweigert
Exit 1.

uv python find
Failed to initialize cache ... Zugriff verweigert (os error 5)
Exit 1.
```

**Kein grüner Smoke:** Python-/pytest-Tests, lokale Test-DB und Mutationstest
wurden nicht ausgeführt. Es wurde keine Testdatenbank angelegt; daher keine
Cleanup-Aktion. Für einen späteren schweren DB-Test gilt die exklusive
Lockkonvention des Orchestrators; ausschließlich eine identitätsgeprüfte,
selbst erzeugte lokale Test-DB darf danach aufgeräumt werden. Eine
Mutations-Rotprobe wurde nicht behauptet, also existiert kein positives
Mutationslog. Keine Runtime- oder Sandbox-Umgehung versucht.

**BLOCKER: extern - Python 3.13 am vorhandenen Venv-Ziel ist mit „Zugriff verweigert“ gesperrt; `python` fehlt im PATH und `uv` kann seinen Cache nicht öffnen. Dadurch sind Unit- und lokale DB-Tests nicht ausführbar.**

## Release- und Veröffentlichungs-Gates

1. KSV bestätigt je Camp 2027-Preis, Altersgrenzen, 70 Plätze, Anmeldeöffnungs-/Schließzeiten mit Zeitzone und geprüfte Bankkonfiguration. `CampCreate` verlangt Preis und Altersgrenzen; die Offline-Datei ist absichtlich kein direkt importierbares vollständiges API-Payload.
2. Betreiber prüft bereits gespeicherte `position`-/`verein`-Antworten, bevor die neue Vereinskonfiguration gesetzt wird. K27FORM-Builder/Anzeige sowie CPFB1/CPEX1-Liste/PDF sind im selben Integrationskandidaten gesondert zu testen. Hier nur vorhandene Routen und Verträge inventarisiert.
3. Datenschutz: KSV-Alttext behauptet spätestens 12 Monate; keine dazu passende automatische Löschung gefunden. SaaS-Seite nennt ausdrücklich keine festgelegte Frist. Betreiber/Rechtsprüfung legen getrennte belegte Fristen/Kriterien und Backup-Rotation fest; Texte und tatsächliche Löschpraxis werden vor Release abgeglichen. Keine neue Rechtsgrundlage oder pauschale Freigabe behauptet.
4. Python-Laufzeit freigeben, synthetische Unit-Tests samt Mail-Brevo-Payload-Regressionsprüfung ausführen, danach erst isolierte lokale Integration und getrennte Review. Zahlungszweck verwendet weiterhin den vorhandenen achtstelligen CP-Präfix; seine Eindeutigkeit sollte vor Publikation gegen reale Belegungszahlen geprüft werden, ohne Kundendaten offenzulegen.
5. Publikation der Camps und Website bleibt ein eigener, freizugebender Schritt. Bestehende Camps/Buchungen und andere Vereinsdatensätze wurden nicht geschrieben oder umbenannt.

## Rollback

Da keine Infrastruktur geändert wurde, besteht der Daten-Rollback aus **keiner Aktion**. Im Worktree die neuen Plan-/Dokument-/Testdateien und die zugehörigen Änderungen an den sechs genannten SaaS-Codepfaden zurücknehmen; historische Seeds und Buchungen bleiben bestehen. Falls später eine Übernahme der fünf Drafts erfolgt, nur deren geprüfte Slugs und Organisations-ID gezielt zurücknehmen, niemals pauschal KSV-Camps oder Registrierungen löschen.
