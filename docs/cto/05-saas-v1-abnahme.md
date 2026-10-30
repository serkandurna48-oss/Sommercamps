# 5. SaaS v1 – Stand der 8 Abläufe und Abnahme

**v1 ist abgenommen, wenn** ein neuer Testverein, den Serkan nicht anfasst, auf
Staging von der Marketingseite bis „erste Anmeldung verwaltet und exportiert“
kommt – einmal mit Bildschirmaufnahme belegt – und danach dieselbe Version
kontrolliert in Production geht.

## Nachtrag 30.10.2026 – v1 released, Funktionsumfang geschlossen

v1 ist mit `c840fa8` in Production (Frontend per Vercel-Promote, Backend per Fast-Forward
von `feat/platform-foundation`). Marketingseite, Preise, Vereins-Selbststart, Elternseite,
Vereinsbereich (Teilnehmer, Zahlungen inkl. „Kostenlos“, Warteliste, Export) und
Plattform-Konsole sind enthalten. Ab hier gilt **Funktionsstopp für v1**: nur noch Fehler,
Texte und Kundenwünsche aus dem Pilotbetrieb.

**Bewusst nach v1:** Online-Zahlung (Stripe), Analyse (PR #63, PostHog, braucht AVV und
Datenschutzprüfung), automatischer Mail-Retry, Bounce-Tracking, Eltern-Selbststorno,
weitere Admins pro Verein über die Einladung hinaus, Löschfristen-Automatik,
Legacy-Migration von JK/KSV.

**Bekannter Fehler:** „Camp veröffentlichen“ bleibt in der Browser-E2E gelegentlich hängen,
obwohl das Speichern erfolgreich war (ca. 2 von 6 CI-Läufen, lokal selten). Neuer Lauf
hilft; in Production nicht beobachtet. Ursache offen.

## Nachtrag 29.10.2026, 13 Uhr – was seit der Tabelle unten erledigt ist

Alles gemergt nach `demo/jan`, CI grün (Backend, Frontend, Browser-E2E). Noch **nicht** auf Staging
von Hand geprüft und **nicht** in Production.

| # | Lücke aus der Tabelle | Stand | PR |
|---|---|---|---|
| 1 | Bestätigungslink ohne `redirect_to` | erledigt | #41 |
| 2 | Kein „Passwort vergessen“ | erledigt | #42 |
| 2 | Kein Einladungsablauf | erledigt: Owner lädt per E-Mail ein, Link zum Passwort-Festlegen | #47 |
| 4 | Kein Spam-Schutz Elternanmeldung | erledigt, greift erst mit `TRUSTED_CLIENT_IP_HEADER` (08, A.3) | #46 |
| 4 | Kein Browser-E2E | erledigt: Eltern-Ablauf + kompletter Selbststart inkl. Einladung | #44, #45 |
| 5 | Fehlgeschlagene Mail unsichtbar | erledigt: sichtbar + „Mail erneut senden“ | #42 |
| 6 | Keine Mail bei Storno/Nachrücken, kein Audit | erledigt | #42 |
| – | CI nie gelaufen | erledigt, läuft auf jedem PR | #40 |

**Bewusst offen (blockiert v1 nicht):** automatischer Mail-Retry (manuelles Neusenden reicht),
Bounce-Tracking, Audit für Camp-Anlage und Export, Eltern-Selbststorno, Stripe, Löschfristen.
**Kosmetisch:** Vereinsadmin-Liste im Owner-Bereich zeigt Konto-IDs statt E-Mail-Adressen.

**Offen bei Serkan:** Dashboard-Einstellungen (08, Teil A), Uptime-Alarm, dann Abnahme-Durchlauf
auf Staging (08, Teil B). Erst danach Production-Release.

Legende: **Getestet** = automatisierte Tests + im Code geprüft.
**Live belegt** = in Production von echten Nutzern verwendet (nicht geprüft = nicht behauptet).

| # | Ablauf | Stand | Belege | Lücke | Prod-Risiko | Wer | Fertig, wenn |
|---|---|---|---|---|---|---|---|
| 1 | Verein erstellen + konfigurieren | **Vorhanden, unvollständig** | Owner-Anlage, Selbststart, Einrichtungsassistent, Prüfung/Freigabe: API- und UI-Tests grün; `test_review_postgres` gegen echtes Postgres | Bestätigungslink hat kein `redirect_to` → Landeseite hängt von Supabase-„Site URL“ ab. Fix existiert lokal (`feat/be1b-mails-weiterweg`, nicht gepusht, nicht reviewt). Selbststart nie komplett auf Staging durchgespielt | **Hoch** (v1-Kriterium) | Ahmad (Review/Merge BE1b), Serkan (Durchlauf) | Testverein auf Staging: Registrieren → Mail-Link → Login → Einrichtung → Einreichen → Freigabe → öffentliche Seite. Aufnahme liegt vor |
| 2 | Vereinsadmin einladen + anmelden | **Login getestet; Einladung + Passwort-Reset fehlen** | Login, Rollen, Token-Refresh, Mandantengrenzen: Tests grün inkl. RLS auf Postgres | Kein Einladungsablauf (Owner kann nur bestehende Konten zuordnen). Kein „Passwort vergessen“ – Umsetzung liegt lokal (`feat/cx35b-passwort-vergessen`, 2 Commits, ungeprüft) | **Hoch** (ausgesperrter Verein = Support-Fall) | Ahmad | „Passwort vergessen“ auf Staging end-to-end. Einladung: bewusst nach v1 (1 Admin pro Verein = Selbststart-Konto) |
| 3 | Camp erstellen + veröffentlichen | **Fertig, getestet** | `test_admin_camps_api`, Formular-Tests, Ablauftest auf Postgres (`test_journey_end_to_end`) | Camps nicht löschbar (nur archivieren) | Niedrig | Ahmad | Testverein legt auf Staging ein Camp an und veröffentlicht es |
| 4 | Elternanmeldung ohne Konto | **Fertig, getestet**; KSV-Seite live | Ablauftest Postgres: Kapazität, Warteliste, Duplikat 409, fremder Admin 403; 30+30 API/Repo-Tests; Frontend-Journey (gemockt) | Kein Rate-Limit/Captcha auf `POST …/registrations`. Kein Browser-E2E | Mittel (Spam, Fehlanmeldungen) | Ahmad | Rate-Limit pro IP + Browser-E2E (Playwright) Eltern-Ablauf gegen lokale API |
| 5 | Bestätigungsmail | **Vorhanden, unvollständig** | 53 Unit-Tests (Fake-Provider); Staging-Schutz seit 29.10. mit 19 Tests | Kein Retry (`retry_registration_notification` ist nirgends aufgerufen). Kein Bounce-Tracking. Verein sieht fehlgeschlagene Mails nicht (`email_error` weder in Admin-API noch UI) | Mittel | Ahmad | Fehlgeschlagene Mail im Vereinsbereich sichtbar + „erneut senden“; Testmail auf Staging an Allowlist-Adresse kommt an |
| 6 | Warteliste + Stornierung | **Logik fertig, getestet; Eltern-Info fehlt** | Storno rückt automatisch nach (Ablauftest), Statusmaschine 409, UI-Aktionen getestet | **Keine Mail** an Eltern bei Storno oder Nachrücken. Eltern können nicht selbst stornieren. Nachrücken per Button ohne Audit | **Hoch** im Betrieb (nachgerückte Familie erfährt es nicht) | Ahmad | Mail bei Nachrücken und Storno, getestet; auf Staging empfangen |
| 7 | Teilnehmer + Zahlung | **Fertig für Überweisung, getestet** | Zahlungsstatus, Korrektur, Audit, Plattform-Übersicht: Tests grün | Online-Zahlung (Stripe) nur Datenbankspalten. Storno ändert Zahlungsstatus nicht (Erstattung manuell) | Niedrig für v1 (Überweisung reicht), Entscheidung nötig | Serkan (Entscheidung) | v1 = Überweisung. Stripe ausdrücklich nach v1 |
| 8 | Export + Betriebsüberwachung | **Export fertig, getestet; Monitoring minimal** | XLSX (4 Ansichten) + CSV im Browser, Tests grün; `/health` mit DB-Check, Render-Healthcheck | Kein Alarm bei Ausfall/Fehlern, kein Sentry, Logs nur Render-stdout. Audit fehlt für Anlage, Export, Nachrücken. Löschfristen nur als Dry-Run-Skript | Mittel | Ahmad | Uptime-Alarm auf `/health` (Prod + Staging) an beide; Fehler-Alert per Mail; dokumentierter Restore-Test |

## Querschnitt (blockiert v1-Abnahme genauso)

| Thema | Stand | Fertig, wenn |
|---|---|---|
| CI | `ci-saas.yml` lokal reproduziert (grün), auf GitHub **noch nie gelaufen** (Branch nicht gepusht) | erster PR gegen `demo/jan` zeigt `saas-backend` + `saas-frontend` grün |
| Staging-Mails | Code-Schutz für API-Mails gebaut, **noch nicht auf Staging**; Supabase-Auth-Mails nicht erfasst | Merge nach `demo/jan` + Env `NOTIFICATION_ALLOWED_RECIPIENTS` gesetzt; Supabase-Staging-SMTP geprüft |
| Releaseweg | Production hängt an `main` (3 Vercel-Projekte) + `feat/platform-foundation` | Ablauf aus 03 eingehalten; später Release-Branches getrennt |
| Backup/Restore | nicht geprüft | Restore einer Staging-Kopie einmal geübt und dokumentiert |
| Schema-Gleichstand Staging/Prod | API-Felder identisch (29.10.), Migrationsstand nicht direkt geprüft | `supabase_migrations`/Tabellen-Abgleich je Umgebung dokumentiert |
