# 7. Offene Risiken und Entscheidungen

## Risiken (nach Schwere)

1. **Release über `main` trifft drei Production-Seiten.** Vercel `campspilot`,
   `jkperformance` (JK live) und `sommercamps` (KSV-Legacy) bauen Production aus
   `main`. Kein Branch-Schutz. *Gegenmaßnahme heute:* Ablauf in 03, keine PRs
   gegen `main`. *Dauerhaft:* Release-Branches trennen (A3).
2. **Frontend und Backend in Production kommen aus verschiedenen Quellen**
   (Vercel-Promote vs. `feat/platform-foundation`). Heute identischer
   Backend-Stand, aber kein technischer Zwang dazu.
3. **Staging konnte echte Mails verschicken** (Brevo aktiv, KSV-Seed mit echter
   Vereinsadresse). Code-Schutz ist gebaut; wirksam erst nach Merge nach
   `demo/jan` und gesetzter Allowlist. Mails von Supabase Auth selbst
   (Passwort-Reset) erfasst er nicht.
4. **Repo ist öffentlich.** Code, Kunden-Doku (`docs/customers/`) und
   Vereinskontakte sind lesbar. Testdaten sind synthetisch (geprüft: nur
   Muster-IBANs `DE89…`, `example.com`). Muster-Scan nach Brevo-/Stripe-/
   Supabase-Schlüsseln und DB-URLs (aktueller Stand + letzte 400 Commits): nur
   Platzhalter. Ein vollständiger Scan der ganzen Historie fehlt noch.
5. **Onboarding-Lücken** (Bestätigungslink, Passwort-Reset) – Code in A1.
   Zusätzlich Konfiguration: Supabase Site URL steht in beiden Projekten auf
   `localhost:3000`, kein eigenes SMTP (siehe 08).
5b. **IP-Rate-Limit beim Selbststart wirkt auf Render nicht:** vier Anfragen
   hintereinander von derselben IP wurden alle angenommen (29.10.). Der
   Limiter sieht vermutlich Proxy-IPs. Vor einem eigenen Limit für
   Anmeldungen erst `TRUSTED_PROXY_HOPS`/`X-Forwarded-For` auf Render klären.
6. **Eltern-Kommunikation bei Warteliste/Storno fehlt** – A2.
7. **Kein Monitoring/Alarm, Backup-Restore nie geübt.**
8. **Migrationen manuell je Umgebung.** Am 28.10. fehlte auf Staging eine
   Spalte (`health_data_consent`), bis Serkan SQL nachzog. Drift ist möglich.
9. **Löschfristen** (30 Tage Gesundheitsdaten, 12 Monate Anmeldung) nur als
   Dry-Run-Skript, nicht automatisiert.
10. **Viele lokale Worktrees** (~130) auf Serkans Laptop mit ungemergter
    Agenten-Arbeit. Nicht aufräumen ohne Prüfung; relevante: BE1b, CX35b,
    UC2 (Benachrichtigungseinstellungen), UC1 (Stripe Connect).

## Entscheidungen

| Frage | Empfehlung | Wer | Bis |
|---|---|---|---|
| Basis für v1 | Bestehendes SaaS weiterbauen, kein Neubau | Serkan + Ahmad | Fr |
| Integrationsbranch | `demo/jan` bis zur Umbenennung in `staging` | Ahmad | Fr |
| Release-Branches trennen | ja, `release/saas` + `release/legacy` | Ahmad schlägt vor, Serkan gibt frei | So |
| Repo privat stellen | ja; vorher prüfen, dass Vercel/Render-Git-Integration weiterläuft | Serkan | nach v1 |
| Zahlung in v1 | nur Überweisung, Stripe danach | Serkan | Fr |
| Weitere Admins pro Verein | nach v1 (Einladung) | Serkan | Fr |
| Monitoring-Tool | so wenig wie möglich: Render-Alerts + ein Uptime-Ping | Ahmad | So |
| Ahmads Rechte | GitHub-Collaborator, Staging-Konten, Shareable Link; **kein** Prod-Supabase/Render/Vercel | Serkan | Fr |
