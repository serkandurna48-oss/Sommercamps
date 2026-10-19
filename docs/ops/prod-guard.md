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
- curl-Methoden werden auch in Kurzoptionsbuendeln erkannt: `-sXPOST`,
  `-sXDELETE`, `-XPOST`, `-sSX PUT` und `--request=PATCH`.
- Zusaetzlich gesperrt: `powershell`/`pwsh` mit `-EncodedCommand`, `-enc`
  oder `-ec`, `git --no-verify`, `git config core.hooksPath` und
  `Set-Alias`/`New-Alias` fuer git, gh, curl, psql, Invoke-WebRequest oder
  Invoke-RestMethod. Das gilt auch ohne Prod-Kennung.

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
`scripts/install-guards.ps1` installiert Git-`post-checkout` und `pre-push` in
`git rev-parse --git-common-dir`/hooks. Diese Hooks gelten damit fuer den
Hauptordner und alle verknuepften Worktrees. Vorhandene Hooks werden vor dem
Ersetzen unter einem eindeutigen `.backup-*`-Namen gesichert. Ihre bisherige
Logik wird nicht automatisch verkettet. Ein konfiguriertes `core.hooksPath`
bricht die Installation ab, weil es die gemeinsamen Hooks umgehen wuerde.

`pre-push` verweigert jeden Push mit Exit 1 und einer Meldung, unabhaengig
vom aufrufenden Shell-Text (auch bei Variablen und bereits vorhandenen Aliasen).
Nur `CAMPSPILOT_ALLOW_PUSH` mit dem **exakten**, gross-/kleinschreibungsabhaengigen
Wert `yes-serkan` erlaubt den Push. Die Freigabe ist ausschliesslich fuer
Serkans bewusst autorisierte Pushes vorgesehen.

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
JSON-Daten; der Runner startet die Hook-Prozesse nacheinander. Zusaetzlich
installiert `-Extended` die Git-Hooks ausschliesslich in einem synthetischen
Repo unter dem Worktree und pusht gegen ein dort frisch erzeugtes lokales
Bare-Repo. Es wird kein bestehender Remote benutzt. Geprueft werden direkte
Pushes, Variablen, Aliase, ein verknuepfter Worktree, exakte/abweichende
Freigabewerte und das Verhalten ohne pre-push-Hook.
`-GitOnly` fuehrt fuer die gezielte Fehlersuche nur diese lokalen
Integrationstests aus; die Pflichtabnahme verwendet weiterhin `-Extended`.
`-BoundarySweep` prueft zusaetzlich Kombinationen aus Git-/gh-EXE-Schreibweisen,
globalen Optionen, Verkettungen und Umleitungen. Beide Schalter sind kombinierbar.

Der Runner nutzt jeweils seine eigene Laufzeit fuer die Matrix und prueft
zusaetzlich den in settings.json registrierten `powershell.exe`-Aufruf. Er startet
den Textfilter mit JSON auf stdin. **Kein Payload-Befehl wird ausgefuehrt.**
Die expliziten lokalen Git-Integrationstests bei `-Extended` sind davon
getrennt. Ein Sentinel-Payload prueft die fehlende Payload-Auswertung
zusaetzlich. Es braucht keine DB, Cloud-Zugaenge oder Secrets.

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
in Umgebungsvariablen/Dateien und dynamisch zusammengesetzte Befehle werden
nicht vollstaendig erfasst. Insbesondere passiert `curl -X POST "$PROD_API"`
den Textfilter ohne ausgeschriebene Prod-Kennung. L2 muss Prod-Ziele und
Zugangsdaten aus der Session-Umgebung fernhalten.

Der Git-Hook ergaenzt den Textfilter, ist aber keine manipulationssichere
Sandbox: Wer Hooks loeschen/aendern, eine andere hooksPath-Konfiguration
setzen, `--no-verify` indirekt verwenden oder die Freigabevariable setzen
kann, kann ihn umgehen. Die aufgefuehrten direkten Umgehungsbefehle sind
im Claude-Textfilter gesperrt; beliebige Kodierung und andere Werkzeuge
bleiben Grenzen. Die `.claude`-Registrierung wirkt nur in Claude Code,
nicht automatisch in Codex oder einer frei gestarteten Shell.

| C4-Fall | Textfilter nach L4b | Weitere Schutzschicht |
|---|---|---|
| git mit globaler Option / cmd-Wrapper | Exit 2 | pre-push |
| Git-Programm in PowerShell-Variable | Exit 0 | pre-push: Exit 1 |
| Set-Alias g git | Exit 2 | Bereits vorhandener Alias: pre-push Exit 1 |
| powershell -EncodedCommand | Exit 2 | pre-push bei Git-Push |
| curl -sXPOST / -sXDELETE mit Prod-URL | Exit 2 | keine Netzwerksandbox |
| curl -X POST mit Prod-URL | Exit 2 | keine Netzwerksandbox |
| curl auf Prod-Health ohne Methode | Exit 0 | Lesen erlaubt |
| curl -X POST "$PROD_API" | Exit 0 | L2-Umgebungsisolation erforderlich |

Die Kennungsliste muss bei neuen Prod-Zielen gepflegt werden. Bestehende
Projektregeln und Zugriffsgrenzen gelten weiterhin.

Rollback: den L4-Commit gezielt revertieren und Claude Code neu starten. Das
entfernt die L4-Registrierung samt Tests; ein schon installierter Git-
`post-checkout`- oder `pre-push`-Hook wird dadurch nicht deinstalliert.
Installierte Hooks separat entfernen bzw. aus der jeweiligen Sicherung
wiederherstellen; diese Aenderung wirkt auf alle verknuepften Worktrees.

Referenz: [Claude Code Hooks](https://code.claude.com/docs/en/hooks), insbesondere
Exec-Form, `PreToolUse`, Exitcodes und `onFailure` (abgerufen am 19.10.2026).
