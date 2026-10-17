# CampsPilot SaaS — Abnahme-Anleitung für einen Pilotkunden

> Für genau einen Kunden (JK oder KSV — Auswahl liegt beim Entwickler/Product Owner, siehe
> `docs/PLATFORM_FOUNDATION_HANDOFF.md` und die MVP-Zusammenfassung dieser Session).
> **Diese Abnahme gilt erst als „bestanden", wenn der Kunde die Schritte unten selbst —
> ohne Hilfe — durchgeführt hat.** Ein von einem Entwickler durchgeführter Test zählt nicht.

## 0. Voraussetzung — noch nicht erfüllt (Blocker)

Der dokumentierte Render-Service `campspilot-saas-backend` ist **nicht erreichbar**
(`https://campspilot-saas-backend.onrender.com/health` liefert Render's generisches
"Not Found", nicht die JSON-Antwort unserer FastAPI-App — der Service existiert unter dieser
URL aktuell nicht oder wurde nie deployed). Das Vercel-Frontend
(`https://campspilot.vercel.app`) antwortet zwar, aber ohne einen laufenden Backend-Dienst
funktioniert der `/pilot/[org]`-Elternflow nicht.

**Vor dem Versand dieser Anleitung an einen echten Kunden:**
1. `backend_saas` auf Render deployen oder den bestehenden Service reaktivieren
   (`backend_saas/README.md` Abschnitt "Deployment" hat die genauen Schritte).
2. Prüfen, dass das Frontend (`NEXT_PUBLIC_SAAS_API_URL`) auf diesen Service zeigt.
3. Die URL unten durch die echte, erreichbare Adresse ersetzen.
4. Diesen Abschnitt aus der Anleitung entfernen.

Alles danach in diesem Dokument wurde in dieser Session **lokal** (`localhost:3000` /
`localhost:8001`) tatsächlich durchgespielt und funktioniert — es fehlt nur die öffentliche
Bereitstellung.

## 1. Zugang

| | |
|---|---|
| URL | `<STAGING-URL — siehe Blocker oben>` |
| Konto | Ein `org_admin`-Konto für den Verein des Kunden, angelegt über `backend_saas/scripts/create_platform_user.py --role org_admin --org <slug>` |
| Zugangsdaten | Passwort dem Kunden **niemals per Chat/Klartext-Protokoll** übergeben — persönlich, telefonisch oder über einen Passwort-Manager teilen. Der Kunde sollte es beim ersten Login sofort selbst ändern (falls die App das erlaubt) oder ein frisches Konto mit sofort selbst gewähltem Passwort bekommen. |

## 2. Aufgaben für den Kunden (5–7 Schritte, ca. 15–20 Minuten)

1. **Einloggen** unter `<STAGING-URL>/pilot/<dein-verein-slug>/dashboard` mit dem
   bereitgestellten Konto.
2. **Vereinsdaten prüfen/ergänzen** unter „Konfiguration": Logo, Vereinsfarbe, Kontakt-E-Mail,
   kurzer Einleitungstext. Speichern, Seite bleibt korrekt aktualisiert (kein Rücksprung auf
   alte Werte).
3. **Ein Camp anlegen** (Termin, Alter, Preis, Plätze) und es **veröffentlichen**. Direkt danach
   die öffentliche Vereinsseite in einem privaten/Inkognito-Fenster öffnen — das Camp muss dort
   sichtbar sein.
4. **Als „Elternteil" anmelden**: über die öffentliche Seite eine Testanmeldung für ein Kind
   abschicken (eigene Daten, klar als Test kennzeichnen, z. B. Vorname „Test").
5. **Die Anmeldung im Adminbereich öffnen**, eine Kleinigkeit korrigieren (z. B. Trikotgröße
   ergänzen) und speichern — die Korrektur muss sofort sichtbar sein.
6. **Zahlungsstatus** dieser Anmeldung auf „bezahlt" setzen.
7. **Feedback geben** (siehe Abschnitt 3) — was war unklar, was hat gefehlt, was hat gut
   funktioniert?

## 3. Wo Feedback hin soll

<!-- Kanal hier eintragen, sobald festgelegt — z. B. gemeinsamer Chat, E-Mail-Adresse, oder ein
     Formular. Nicht geraten, weil in dieser Session kein Kanal dafür vorgegeben wurde. -->
`<Feedback-Kanal hier eintragen — z. B. WhatsApp/E-Mail-Adresse des Ansprechpartners>`

Konkret bitten um:
- Stellen, an denen unklar war, was zu tun ist.
- Alles, was gefehlt hat, um den eigenen Verein wirklich abzubilden (siehe auch Abschnitt 4).
- Ob die Ladezeiten/Reaktion sich für den täglichen Gebrauch akzeptabel anfühlen.

## 4. Bekannte Lücken — dem Kunden vorher ehrlich nennen, nicht verschweigen

- **Kein individuelles Design-Theme wählbar.** Jeder neu angelegte Verein bekommt aktuell fest
  das „tradition"-Theme; ein zweites Theme (`akademie`) existiert im Datenmodell, hat aber
  bewusst keinen Admin-Editor (frühere Produktentscheidung, siehe
  `frontend/app/components/saas/config/OrganizationConfigForm.tsx` Kommentar "Kein Theme-Editor
  (Auftrag Abschnitt 1)"). Wenn der Pilotkunde ein anderes Erscheinungsbild braucht, ist das
  aktuell nur per Entwickler-Eingriff möglich, nicht selbst einstellbar.
- **Impressum/Datenschutzerklärung sind nicht pro Verein.** Die öffentliche Elternseite jedes
  Vereins verlinkt auf `/impressum` und `/datenschutz` — beide Seiten sind fest mit den
  Rechtsdaten von KSV Baunatal e.V. verdrahtet (Name, Adresse). Ein zweiter Verein würde seinen
  Eltern aktuell die falschen (KSV-)Rechtsdaten zeigen. **Das ist kein Kosmetik-Thema, sondern
  ein DSGVO-relevanter Fehler** — vor einer echten (nicht nur testweisen) Kundennutzung muss
  entweder eine pro-Mandant-Lösung gebaut werden, oder der Kunde muss vorübergehend eigene,
  echte Rechtsangaben liefern, die dann händisch eingepflegt werden (wie es heute bei KSV der
  Fall ist). Ohne diese Angaben vom Kunden kann ich das nicht selbst beheben.
- **Keine Bestätigungs-E-Mail.** Nach einer Anmeldung geht aktuell keine E-Mail an die Eltern
  raus (Pilotbetrieb, siehe Bestätigungsseite selbst: "im Pilotbetrieb geht noch keine
  Bestätigungs-E-Mail raus").
- **Nur Banküberweisung als Zahlungsart**, keine Online-Zahlung (kein Stripe/Payment-Provider
  in `backend_saas` integriert).

## 5. Abnahmekriterium

Diese Abnahme gilt als **bestanden**, sobald:
- [ ] Der Kunde Schritte 1–6 in Abschnitt 2 selbst, ohne Hilfe eines Entwicklers, erfolgreich
  durchgeführt hat.
- [ ] Der Kunde sein Feedback (Abschnitt 3) tatsächlich gegeben hat — auch wenn es "hat alles
  funktioniert" ist.

Ein von einem Entwickler durchgeführter Klicktest — egal wie gründlich — erfüllt dieses
Kriterium nicht.
