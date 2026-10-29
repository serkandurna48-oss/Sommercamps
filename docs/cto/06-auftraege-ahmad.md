# 6. Drei Aufträge für Ahmad (priorisiert)

Regel für alle drei: Branch von `demo/jan`, PR gegen `demo/jan`, CI grün, Review
durch Serkan, Staging-Nachweis im PR. Kein Production-Zugang nötig.

## A1 – Selbststart eines Vereins Ende-zu-Ende schließen (zuerst, Fr/Sa)

**Warum:** v1 heißt „fremder Verein startet ohne Hilfe“. Heute endet der
Ablauf an zwei Stellen unsicher: Bestätigungslink ohne Ziel und kein
„Passwort vergessen“.

**Material:** zwei fertige, aber ungeprüfte lokale Branches auf Serkans Laptop
(Serkan pusht sie):
- `feat/be1b-mails-weiterweg` (Bestätigungslink → `/pilot/<slug>/login`, Freigabe-/Ablehnungsmail mit Login). Achtung: enthält `.qa-be1b/`-Logs (1.900 Zeilen) – vor Merge entfernen.
- `feat/cx35b-passwort-vergessen` (Seiten `passwort-vergessen`, `neues-passwort`, 209 Zeilen Tests).

**Schritte:** beide rebasen auf `demo/jan`, reviewen (Redirect-Prüfung,
keine offene Weiterleitung), je ein PR. Supabase Staging: Redirect-URLs für
`/pilot/*/login` und `/pilot/*/neues-passwort` erlauben.

**Fertig, wenn:** auf Staging ein neuer Testverein (Allowlist-Adresse)
registriert → Mail-Link → Login → Einrichtung → Einreichen → Serkan gibt frei →
Camp anlegen + veröffentlichen → Testanmeldung → Passwort vergessen + neu
setzen. Aufnahme im PR. Kein Schritt braucht Serkans Hilfe außer der Freigabe.

## A2 – Eltern erfahren, was mit ihrer Anmeldung passiert (Sa)

**Warum:** Nachrücken und Storno funktionieren, aber Eltern bekommen keine
Mail. Fehlgeschlagene Bestätigungen sieht der Verein nicht.

**Schritte:**
1. Mail-Vorlagen „Platz frei – Sie sind nachgerückt“ (mit Zahlungsdaten) und
   „Anmeldung storniert“ in `backend_saas/app/notifications/templates.py`.
2. Versand nach Commit in `cancel_registration_and_promote_next` und
   `waitlist/promote` (Background-Task, best effort, wie Bestätigung).
3. `email_error`/`email_sent_at` in der Admin-Liste ausgeben, im Vereinsbereich
   markieren, Button „erneut senden“ → vorhandenes
   `retry_registration_notification`.
4. Nachrücken per Button ins Audit-Log.

**Fertig, wenn:** Tests decken beide Mails und den Retry ab (Test schlägt ohne
Änderung fehl); auf Staging: Camp mit Kapazität 1, zwei Testanmeldungen,
Storno → nachgerückte Allowlist-Adresse bekommt Mail; absichtlich blockierte
Adresse erscheint als „Mail fehlgeschlagen“ und lässt sich erneut senden.

## A3 – Sicher betreiben und sicher ausliefern (So, parallel planbar)

**Warum:** Heute merkt niemand einen Ausfall, und ein Merge nach `main` bringt
drei Production-Seiten gleichzeitig live (siehe 03).

**Schritte:**
1. Uptime-Alarm auf `GET /health` (Prod + Staging), Mail an Serkan und Ahmad
   (z. B. Render-Notifications oder ein freier Uptime-Dienst – Entscheidung
   dokumentieren, kein neues Tool ohne Not).
2. Rate-Limit auf `POST …/registrations` (pro IP, wie `/public/signup`),
   Test inklusive.
3. Release-Vorschlag ausarbeiten und mit Serkan umsetzen: Vercel `campspilot`
   + Render prod auf einen Branch `release/saas`, `jkperformance`/`sommercamps`
   auf eingefrorenen `release/legacy` (aktueller Stand `946a8b7`). Danach
   `main` = `demo/jan` angleichen.

**Fertig, wenn:** Testalarm ist bei beiden angekommen; Rate-Limit-Test grün;
schriftlicher Release-Ablauf in `03-git-und-deployment.md` aktualisiert und von
Serkan freigegeben.

## Nicht jetzt

Stripe, Einladungs-Mails für weitere Admins, Neubau einzelner Teile,
Legacy-Migration von JK/KSV, neue Tools oder Agentensysteme.
