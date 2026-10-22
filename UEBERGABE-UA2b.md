chore/ua2b-vitest-stabil

STATUS: fertig zur Prüfung

COMMIT: 5c105b6

TESTS: Test Files 52 passed (52) · Tests 469 passed (469) · Duration 1089.06s · 0 Errors

## Messtabelle

| Variante | pool | maxWorkers | Dauer | Dateien | Tests | Fehler |
|---|---|---|---|---|---|---|
| Baseline (22.10.) | forks (default) | 1 | 1057 s | 52 | ? | 6 worker-start errors |
| Variante A | threads | 2 | 1211.93 s | 30 | 263 | 22 worker-start errors |
| Variante B (gewählt) | vmForks | 1 | 1089.06 s | 52 | 469 | 0 |

## Konfigurationsänderung

`frontend/vitest.config.mjs`: Windows-Abschnitt geändert von `pool: forks, maxWorkers: 1` auf
`pool: vmForks, maxWorkers: 1`.

Begründung: Der `forks`-Pool startet auf Windows für jede Testdatei einen neuen
Child-Prozess via `child_process.fork`. Bei 52 Testdateien und akkumuliertem
Speicher-/Ressourcendruck überschritt ein Teil der Starts die hardcodierte
`START_TIMEOUT = 60 s`-Grenze im vitest-Kern → "Timeout waiting for worker to respond".

Der `vmForks`-Pool setzt `VmForksPoolWorker.canReuse() { return true; }` und erzwingt
intern `isolate: false` (vitest-Quelle, Zeile 14508). Dadurch wird der erste Fork-Prozess
einmalig gestartet und für alle nachfolgenden Testdateien über `sharedRunners` wiederverwendet
(kein zweiter `fork()`-Aufruf). Jede Testdatei erhält trotzdem einen frischen `vm.Context`
(frisches Modulregister, `vi.mock` funktioniert korrekt), sodass die Testisolation erhalten
bleibt. Linux/CI-Verhalten ist unverändert (der Windows-Zweig greift nur bei `win32`).

## NICHT_AUSGEFÜHRT

- `npm run build` (KSV + JK) — keine Produktcodeänderung; bleibt Verantwortung des PR-Reviewers
- Deployment / Push nach origin — bewusst nicht ausgeführt (Policy: kein Deploy ohne Freigabe)
