# Lokale Prod-Schreibsperre (L4)

`.claude/settings.json` registriert `.claude/hooks/guard-prod.ps1` als
`PreToolUse`-Hook fuer `Bash|PowerShell`. Der Hook liest den JSON-Payload von stdin
und untersucht nur `tool_input.command`. Er fuehrt diesen Text niemals aus.

- Exit **2** mit einer Meldung auf stderr: `git push` auf jedem Branch,
  `gh pr merge`, erkannte Schreiboperationen zusammen mit einer Prod-Kennung,
  ungueltiger Payload oder interner Klassifizierungsfehler.
- Exit **0**: normale Befehle, HTTP-GET/HEAD ohne Schreibmerkmale und
  Schreibbefehle ohne Prod-Kennung (z. B. Staging).
- Prod-Kennungen: `sommercamps-0aod`, `wkmckfbzhmihyfwiekct`,
  `asowsktznpiioaxerlta`, `campspilot.vercel.app` (Gross-/Kleinschreibung egal).
- Schreibmerkmale: HTTP-/SQL-Schreibverben, curl-Daten-/Formular-/Upload-Flags,
  PowerShell-Body-/InFile-Parameter. **Alle psql-Sessions mit Prod-Kennung**
  sind gesperrt, auch SELECT: stdin, SQL-Dateien und psql-Startdateien koennten
  weitere SQL-Anweisungen enthalten.

## Voraussetzungen und Aktivierung

Windows PowerShell 5.1 (`powershell.exe`) ist die feste Hook-Laufzeit;
PowerShell 7 ist fuer den Hook nicht erforderlich. Die Registrierung verwendet
die Exec-Form mit getrennten Argumenten: kein Git Bash und keine Shell-Expansion
fuer den Aufruf noetig. `${CLAUDE_PROJECT_DIR}` verweist auf den jeweiligen
Projektordner, auch wenn dessen Pfad Leerzeichen enthaelt.

Erforderlich ist **Claude Code >= 2.1.295**: `onFailure: block` sperrt auch bei
fehlender Laufzeit, fehlendem Skript, Exitcodes ausser 0/2 und Timeout. Ohne diese
Versionsvoraussetzung ist dieser Ausfallschutz nicht zugesichert. Zusaetzliche
deny-Regeln sperren einfache Push-/Merge-Aufrufe beider Shell-Tools.

Die getrackten Dateien muessen gemeinsam im Ziel-Checkout vorliegen. Nach der
Uebernahme Claude Code neu starten und die Registrierung in `/hooks` kontrollieren.
Den Hauptordner installiert ausschliesslich Serkan. L4 installiert dort nichts.
`scripts/install-guards.ps1` installiert weiterhin nur den Git-`post-checkout`-Hook;
die Prod-Sperre stammt direkt aus den getrackten `.claude`-Dateien.

Validierung ohne Installation und ohne Zugriff auf den Hauptordner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-guards.ps1 -ValidateOnly
```

## Ausschliesslich lokale Payload-Tests

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-guards.ps1
pwsh -NoProfile -File scripts/test-guards.ps1
```

`-Extended` kombiniert zusaetzlich 15 Schreib-/Lesevarianten mit allen vier
Prod-Zielen fuer beide Tool-Namen. Auch dabei bleiben saemtliche Befehle reine
JSON-Daten; der Runner startet die Hook-Prozesse nacheinander.
`-BoundarySweep` prueft zusaetzlich Kombinationen aus Git-/gh-EXE-Schreibweisen,
globalen Optionen, Verkettungen und Umleitungen. Beide Schalter sind kombinierbar.

Der Runner nutzt jeweils seine eigene Laufzeit fuer die Matrix und prueft
zusaetzlich den in settings.json registrierten `powershell.exe`-Aufruf. Er startet
ausschliesslich den Hook mit JSON auf stdin. **Keiner der enthaltenen curl-,
Git-, SQL- oder PowerShell-Befehle wird ausgefuehrt.** Ein Sentinel-Payload prueft
das zusaetzlich. Es braucht keine DB, Cloud-Zugaenge oder Secrets.

Der tatsaechliche Exitcode muss exakt dem erwarteten Wert 0 oder 2 entsprechen.
Andere Werte sind immer Fehler. Absichtlich defekte Hooks mit Exit 1 und 3
werden intern gegen erlaubte und gesperrte Payloads geprueft. Zum unabhaengigen
Negativtest kann `-GuardScript <lokale-Datei-mit-exit-1.ps1>` uebergeben werden:
Die normalen GET-Faelle muessen fehlschlagen und der Runner muss Exit 1 liefern.
`-ReportPath <datei.json>` speichert maschinenlesbare Ergebnisse; standardmaessig
werden keine fremden Uebergaben veraendert.

## Grenzen und Rollback

Dies ist ein konservativer Textfilter fuer die beiden Claude-Shell-Tools,
keine Betriebssystem- oder Netzwerk-Sandbox. Auch zitierte Beispiele oder
Kommentare mit verbotenen Befehlen koennen gesperrt werden. Versteckte Ziele
in Umgebungsvariablen/Dateien, Git-Aliase, dynamisch zusammengesetzte oder
kodierte Befehle und andere Tools werden damit nicht vollstaendig erfasst.
Die Kennungsliste muss bei neuen Prod-Zielen gepflegt werden. Bestehende
Projektregeln und Zugriffsgrenzen gelten weiterhin.

Rollback: den L4-Commit gezielt revertieren und Claude Code neu starten. Das
entfernt die L4-Registrierung samt Tests; ein schon installierter Git-
`post-checkout`-Hook wird dadurch nicht deinstalliert.

Referenz: [Claude Code Hooks](https://code.claude.com/docs/en/hooks), insbesondere
Exec-Form, `PreToolUse`, Exitcodes und `onFailure` (abgerufen am 19.10.2026).
