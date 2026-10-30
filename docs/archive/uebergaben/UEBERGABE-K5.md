fix/k5-anrede-sie

STATUS: fertig zur Prüfung

COMMIT: (folgt nach Review-Freigabe — noch kein Commit auf diesem Branch)

TESTS:
- npm run test --prefix frontend → 196 passed (196), 25 test files — 0 failed
- python -m pytest backend_saas/tests -q → 530 passed, 29 subtests passed — 0 failed
- npm run lint --prefix frontend → 0 errors (10 warnings, alle vorher vorhanden)
- npx tsc --noEmit → 0 errors

---

## Vorher → Nachher (alle geänderten Sätze)

### backend_saas/app/notifications/templates.py

| Vorher | Nachher |
|---|---|
| `<p>Hallo,</p>` (Bestätigungsmail) | `<p>Guten Tag,</p>` |
| `<p>deine Anmeldung für <strong>…</strong> … ist bei uns eingegangen.</p>` | `<p>Ihre Anmeldung für <strong>…</strong> … ist bei uns eingegangen.</p>` |
| `{e_payee} sendet dir die Zahlungsdetails direkt.` | `{e_payee} sendet Ihnen die Zahlungsdetails direkt.` |
| `Bei Fragen wende dich direkt an {e_org_name}:` (registered) | `Bei Fragen wenden Sie sich direkt an {e_org_name}:` |
| `<p>Hallo,</p>` (Wartelistenmail) | `<p>Guten Tag,</p>` |
| `<p>deine Anmeldung für <strong>…</strong> … ist bei uns eingegangen.` (waitlist) | `<p>Ihre Anmeldung für <strong>…</strong> … ist bei uns eingegangen.` |
| `meldet sich {e_org_name} direkt bei dir.` | `meldet sich {e_org_name} direkt bei Ihnen.` |
| `Bei Fragen wende dich direkt an {e_org_name}:` (waitlist) | `Bei Fragen wenden Sie sich direkt an {e_org_name}:` |

### frontend/app/pilot/[org]/DoneScreen.tsx

| Vorher | Nachher |
|---|---|
| `${payTo} sendet dir die Zahlungsdetails direkt.` | `${payTo} sendet Ihnen die Zahlungsdetails direkt.` |
| `Wir schicken dir eine Bestätigung an {parentEmail}. Schau auch im Spam-Ordner nach.` | `Wir schicken Ihnen eine Bestätigung an {parentEmail}. Bitte sehen Sie auch im Spam-Ordner nach.` |

### frontend/app/pilot/[org]/not-found.tsx

| Vorher | Nachher |
|---|---|
| `Der Link, dem du gefolgt bist, verweist auf keine hinterlegte Organisation. Prüf den Link noch einmal, oder frag bei der Person nach, die ihn dir geschickt hat.` | `Der Link, dem Sie gefolgt sind, verweist auf keine hinterlegte Organisation. Bitte prüfen Sie den Link, oder fragen Sie bei der Person nach, die ihn Ihnen geschickt hat.` |

### frontend/app/lib/i18n/de.ts (publicUI)

| Vorher | Nachher |
|---|---|
| `trainer.heading: 'Dein Trainer'` | `trainer.heading: 'Ihr Trainer'` |

---

## Angepasste Tests

- `frontend/app/pilot/[org]/ParentFlow.test.tsx`: Assertion `toContain('Dein Trainer')` → `toContain('Ihr Trainer')`, analog `.not.toContain`.

## Neue Tests

- `frontend/app/pilot/[org]/anrede-sie.test.tsx`: Regression-Test — prüft ParentFlow (alle 3 Themes), DoneScreen (registriert mit/ohne IBAN, Warteliste) und Rechtsseiten-Wrapper LegalShell (alle 3 Themes) auf Du-Pronomen-Regex `\b(du|dir|dich|…|Gib)\b`.
- `backend_saas/tests/test_notifications.py`: `test_registered_mail_uses_sie_form` und `test_waitlist_mail_uses_sie_form` (beide mit iban/kein iban getestet).

---

## NICHT_AUSGEFÜHRT

- Kein Merge, kein Push, kein Deploy.
- Datenschutzerklärung, Impressum und Teilnahmebedingungen sind Server-Components (async) — statischer Inhalt ohne Du-Formen geprüft per Inspektion (keine Du-Formen gefunden); ihr Rendering im Test erfolgt über LegalShell als Wrapper.
- Keine Änderungen an Admin-Oberfläche `(org-admin)` oder Login.
