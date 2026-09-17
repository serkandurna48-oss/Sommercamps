# CampsPilot — SaaS-Architektur (CP-S401)

> **Status:** Zielbild-Dokumentation. Beschreibt eine geplante, isolierte technische Grundlage.
> **Nichts in diesem Dokument ist bereits implementiert oder gegen eine Datenbank ausgeführt.**
> KSV Baunatal ist von diesem Ticket in keiner Weise betroffen — siehe [Abgrenzung zu KSV](#abgrenzung-zu-ksv-legacy).

---

## 1. Ausgangslage

Das bestehende System (`backend/` + `frontend/`, siehe Root-`CLAUDE.md`) trennt Clubs aktuell über
Build-/Env-Konfiguration: `NEXT_PUBLIC_ACTIVE_CLUB` schaltet zwischen KSV-Defaults und
`JK_OVERRIDES` in `frontend/app/lib/clubConfig.jk.tsx` um. Es gibt **eine** Datenbank, **eine**
`camp_registrations`-Tabelle, kein Konzept von "Organisation" oder "Mandant" im Schema. Das
reicht für zwei Clubs im selben Deploy, ist aber kein verkaufbares Multi-Tenant-SaaS.

**Ziel dieses Tickets:** eine dokumentierte, technisch isolierte Grundlage für ein echtes
Multi-Tenant-Datenmodell schaffen — als neues, paralleles System, nicht als Umbau des
bestehenden `backend/`. Siehe [migration-strategy.md](./migration-strategy.md) für den
Phasenplan, wie KSV und JK später dorthin verschoben werden (oder nicht).

---

## 2. Zielbild — Tenant-Modell

### 2.1 Kernentitäten

```
organizations (Mandant / Verein / Academy)
      │ 1
      │
      │ N
      ▼
camps (ein buchbares Angebot: Sommercamp-Woche, Kurs, Session, ...)
      │ 1
      │
      │ N
      ▼
camp_registrations (eine Anmeldung eines Kindes zu einem Camp)
```

Später (nicht Teil dieser Phase, siehe [Abschnitt 5](#5-explizit-nicht-teil-dieser-phase)):

```
organizations
      │ 1
      │
      │ N
      ▼
organization_members ──── N:1 ──── users
(Rolle: org_admin | staff)
```

- **`organizations`** — ein Datensatz pro Mandant (KSV, JK, jeder künftige Kunde). Trägt
  Branding (Name, Logo, Farbe), Kontaktdaten, Plan-Status.
- **`camps`** — ersetzt den freien String `selected_camp_week`. Ein Camp ist ein konkretes,
  buchbares Angebot mit eigenem Zeitraum, Altersgrenzen, Preis, Kapazität und Status. Gehört
  immer genau einer Organisation.
- **`camp_registrations`** — eine Anmeldung. Referenziert **sowohl** `organization_id` **als
  auch** `camp_id` (Begründung siehe [Abschnitt 4.3](#43-warum-organization_id-zusätzlich-zu-camp_id)).
- **`users` / `organization_members`** — erst relevant, sobald es mehr als einen Plattform-Admin
  oder pro Organisation eigene Zugänge gibt (Phase 3 im ursprünglichen CLAUDE.md-Fahrplan,
  hier bewusst als "später" markiert, kein Bestandteil dieses Tickets).

### 2.2 Tenant-Beziehung

Jede tenant-bezogene Tabelle trägt eine explizite `organization_id`-Spalte (Foreign Key auf
`organizations.id`). Es gibt **keine** implizite Tenant-Trennung über Schema, Datenbank oder
Connection String — alle Mandanten leben im selben Schema derselben (neuen, von KSV getrennten)
Datenbank ("Shared-Schema-Ansatz", siehe [Abschnitt 3](#3-shared-schema-ansatz)).

### 2.3 Zugriffsmodell

| Rolle | Umfang | Umsetzung (Zielbild) | Umsetzung (diese Phase) |
|---|---|---|---|
| **Plattform-Admin** | sieht/verwaltet alle Organisationen | Kein `organization_id`-Filter, eigener Claim im JWT (`role: platform_admin`) | Serkan ist einziger Plattform-Admin; Auth-Mechanismus wird **wiederverwendet** (Passwort + JWT wie im bestehenden `backend/`), nicht neu erfunden |
| **org_admin / staff** (später) | verwaltet genau eine Organisation | JWT trägt `organization_id`-Claim, jede Query filtert implizit darauf | **nicht Teil dieser Phase** — kein Supabase Auth, keine Rollen-Tabelle |
| **Eltern** | reichen eine Anmeldung ein, sehen danach nur ihre eigene Anmeldung | Kein Account nötig — Zugriff über `registration_token` (öffentliches UUID, wie im bestehenden System) | Übernommen 1:1 vom bestehenden Muster, kein neuer Auth-Flow nötig |

**Wichtig:** Eltern brauchen für die Anmeldung **zunächst keinen Account** — das bleibt so, wie
es heute ist (`registration_token` als öffentlicher Identifier für Zahlungs-Links und
Bestätigungs-Mails, `id` bleibt intern). Das ist keine Vereinfachung für die SaaS-Phase, sondern
eine bewusste Fortführung eines bereits bewährten Musters.

---

## 3. Shared-Schema-Ansatz

Alle Organisationen teilen sich dieselben Tabellen (`organizations`, `camps`,
`camp_registrations`, ...) in **einem** Supabase-Projekt/Schema — keine separate Datenbank und
kein separates Postgres-Schema pro Kunde. Das ist der Standardansatz für ein B2B-SaaS in dieser
Größenordnung: einfach zu migrieren, einfach zu betreiben, kein Schema-Drift zwischen Kunden.

Isolation entsteht durch zwei Verteidigungslinien (defense-in-depth):

### 3.1 Anwendungsschicht (primäre Verteidigungslinie)

Das Backend **muss** bei jeder tenant-bezogenen Operation `organization_id` explizit
berücksichtigen — als expliziter Query-Parameter, nie implizit. Konkret:

- Jedes `SELECT`/`UPDATE`/`DELETE` auf `camps` oder `camp_registrations` bekommt eine
  `WHERE organization_id = :organization_id`-Bedingung, die aus dem authentifizierten Kontext
  (JWT-Claim des Plattform-Admins bzw. später org_admin) stammt — **nie** aus einem
  Client-Parameter, der frei manipulierbar wäre.
- Öffentliche, unauthentifizierte Endpunkte (z. B. `POST /registrations`) validieren
  `camp_id` gegen die zugehörige `organization_id`, bevor geschrieben wird, damit niemand eine
  Anmeldung gegen ein Camp einer fremden Organisation einreichen kann.
- Dieses Prinzip existiert im heutigen `backend/` bereits implizit (es gibt nur einen Tenant) —
  in `backend_saas/` wird es explizit und ist nicht optional.

### 3.2 Row Level Security (sekundäre Verteidigungslinie, defense-in-depth)

RLS-Policies auf `camps` und `camp_registrations`, die `organization_id` gegen einen
JWT-Claim (`auth.jwt() ->> 'organization_id'` bzw. eine Plattform-Admin-Ausnahme) prüfen, sind
das **Zielbild** — als zusätzliches Sicherheitsnetz, falls die Anwendungsschicht einen Fehler
hat oder in Zukunft ein Client direkt (ohne Backend-Vermittlung) auf Supabase zugreift
(z. B. über Supabase Auth + Client-SDK, analog zum heutigen `admin_select`/`admin_update`-Muster
in `backend/schema.sql`).

**Wichtig — Reihenfolge:** RLS ersetzt nie die explizite `organization_id`-Prüfung im Backend.
Solange das Backend ausschließlich mit dem Service-Role-Key arbeitet (wie im bestehenden
`backend/`), umgeht es RLS ohnehin vollständig — RLS schützt dann nur vor direktem
Client-Zugriff, nicht vor Bugs im eigenen Backend-Code. Die eigentliche Tenant-Sicherheit kommt
aus Abschnitt 3.1.

**In dieser Phase:** RLS-Policy-*Design* wird unten (Abschnitt 4.4) fachlich skizziert, aber
**keine RLS-Migration wird ausgeführt** — das ist laut Ticket-Scope explizit ausgeschlossen.

---

## 4. Datenmodell (fachlicher Entwurf, keine Migration ausgeführt)

Alle folgenden Definitionen sind fachliches Design zur Dokumentation. Es handelt sich um noch
nicht angelegte Tabellen in einem noch nicht existierenden Supabase-Projekt (siehe
[Abschnitt 6](#6-service-struktur)).

### 4.1 `organizations`

| Spalte | Typ | Constraint | Anmerkung |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | intern |
| `slug` | `text` | `unique not null` | öffentlicher Identifier, z. B. für künftiges Pfad-Routing `/[org-slug]/...` |
| `name` | `text` | `not null` | Anzeigename, z. B. "JK Performance Academy" |
| `legal_name` | `text` | nullable | für Rechnungen/Impressum, kann von `name` abweichen |
| `contact_email` | `text` | `not null` | Haupt-Kontaktadresse der Organisation |
| `contact_phone` | `text` | nullable | |
| `logo_url` | `text` | nullable | |
| `primary_color` | `text` | nullable | Hex, für Branding — analog zu `accentColor` in `clubConfig.tsx` |
| `plan_status` | `text` | `not null`, Enum-Kandidat: `trial \| active \| paused \| cancelled` | Grundlage für künftiges Billing, nicht Stripe-Billing selbst |
| `created_at` | `timestamptz` | `not null default now()` | |
| `updated_at` | `timestamptz` | `not null default now()` | im Legacy-Schema fehlt `updated_at` komplett — hier von Anfang an vorgesehen |

### 4.2 `camps`

| Spalte | Typ | Constraint | Anmerkung |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `organization_id` | `uuid` | FK → `organizations.id`, `not null` | |
| `slug` | `text` | `not null` | eindeutig **pro Organisation** (`unique (organization_id, slug)`), nicht global |
| `title` | `text` | `not null` | ersetzt den freien `selected_camp_week`-String als Anzeigename |
| `start_date` | `date` | `not null` | |
| `end_date` | `date` | `not null` | |
| `registration_start` | `timestamptz` | nullable | ab wann Anmeldung möglich ist |
| `registration_end` | `timestamptz` | nullable | Anmeldeschluss |
| `age_min` | `int` | `not null` | ersetzt `CAMP_AGE_MIN` aus `camp_config.py` — wird pro Camp statt global konfigurierbar |
| `age_max` | `int` | `not null` | ersetzt `CAMP_AGE_MAX` |
| `capacity` | `int` | nullable | `null` = unbegrenzt; Kapazitätsprüfung selbst ist kein Bestandteil dieser Phase |
| `price_cents` | `int` | `not null` | ersetzt `STRIPE_PRICE_CENTS`-Env-Var — wird Datensatz statt globaler Konfiguration |
| `currency` | `text` | `not null default 'EUR'` | |
| `status` | `text` | `not null`, Enum-Kandidat: `draft \| published \| closed \| archived` | steuert Sichtbarkeit im (künftigen) Frontend |
| `created_at` | `timestamptz` | `not null default now()` | |
| `updated_at` | `timestamptz` | `not null default now()` | |

### 4.3 `camp_registrations`

Mapping-Tabelle gegen das bestehende `backend/schema.sql` (siehe dort für den Ist-Zustand):

| Legacy-Feld (`backend/schema.sql`) | SaaS-Feld | Entscheidung |
|---|---|---|
| `id` | `id` | übernommen (weiterhin rein intern) |
| `created_at` | `created_at` | übernommen |
| *(existiert nicht)* | `updated_at` | **neu** — fehlt im Legacy-Schema vollständig |
| *(existiert nicht)* | `organization_id` | **neu**, FK → `organizations.id`, `not null` |
| *(existiert nicht)* | `camp_id` | **neu**, FK → `camps.id`, `not null` |
| `selected_camp_week` (freier Text, gegen `ALLOWED_CAMP_WEEKS` validiert) | *entfällt* | **ersetzt** durch `camp_id` — keine String-Validierung gegen eine Hardcoded-Liste mehr nötig, Camp ist ein echter Datensatz |
| `child_first_name` | `child_first_name` | übernommen |
| `child_last_name` | `child_last_name` | übernommen |
| `birth_date` | `birth_date` | übernommen |
| `parent_name` | `parent_name` | übernommen |
| `email` | `email` | übernommen |
| `phone` | `phone` | übernommen |
| `jersey_size` (Text, gegen feste Fußball-Größenliste validiert) | *entfällt aus dem Kernschema* | **deprecated auf Core-Ebene** — Trikotgrößen sind ein KSV/Fußball-spezifisches Produktmerkmal, kein generisches SaaS-Feld. Bleibt vorerst nur im KSV-Legacy-Schema. Kandidat für ein generisches `custom_fields jsonb` auf `camp_registrations` in einer späteren Phase, falls andere Tenants ähnliche Zusatzfelder brauchen (offene Entscheidung, siehe unten) |
| `allergies` | `allergies` | übernommen (Art. 9 DSGVO — besondere Sorgfalt bleibt bestehen, siehe Root-`CLAUDE.md`) |
| `notes` | `notes` | übernommen |
| `consent_privacy` | `consent_privacy` | übernommen |
| `photo_permission` | `photo_permission` | übernommen |
| `status` (`registered\|confirmed\|cancelled\|waitlist`) | `status` | übernommen, gleiche Werte |
| `payment_status` (`open\|paid\|refunded\|waived\|cancelled`) | `payment_status` | übernommen, gleiche Werte |
| `paid_at` | `paid_at` | übernommen |
| `registration_token` | `registration_token` | übernommen, gleiches Konzept (öffentlicher Identifier, nie `id` extern exponieren) |
| `email_sent_at` | `email_sent_at` | übernommen |
| `stripe_session_id` | `stripe_session_id` | übernommen. Weitere Stripe-Felder (`stripe_customer_id`, `stripe_account_id` für Connect) sind bewusst **nicht** Teil dieser Phase — kein Stripe Billing/Connect in CP-S401 |

**4.3 Warum `organization_id` zusätzlich zu `camp_id`?**

`organization_id` wäre über `camp_id → camps.organization_id` technisch herleitbar und damit
redundant. Es wird trotzdem direkt auf `camp_registrations` denormalisiert, aus zwei Gründen:

1. **RLS-Policies werden einfacher und schneller**, wenn sie nicht über einen Join gegen
   `camps` prüfen müssen.
2. **Schutz vor Tenant-Verwechslung im Anwendungscode:** Ein Bug, der versehentlich einen
   `camp_id`-Wert eines fremden Tenants durchlässt, würde ohne redundante Spalte eine
   Cross-Tenant-Anmeldung erzeugen, ohne dass ein einfacher Spaltenvergleich das auffängt. Mit
   redundanter `organization_id` kann das Backend beim Insert prüfen:
   `camps.organization_id (per camp_id) == angefragte organization_id`, bevor geschrieben wird.

### 4.4 RLS-Policy-Design (fachliche Skizze, nicht ausgeführt)

Zielbild für eine spätere RLS-Migration (Ausführung ausdrücklich **nicht** Teil dieser Phase):

- `organizations`: `select` nur für Plattform-Admin oder Mitglieder der eigenen Organisation
  (sobald `organization_members` existiert).
- `camps`: `select` öffentlich für `status = 'published'` (damit ein künftiges Frontend Camps
  ohne Service-Role-Key laden könnte), `insert/update/delete` nur Plattform-Admin bzw.
  org_admin der eigenen Organisation.
- `camp_registrations`: `insert` öffentlich (analog zu `public_insert` im Legacy-Schema, aber
  zusätzlich geprüft, dass `camp_id` zu einem `status = 'published'`-Camp gehört),
  `select/update` nur Service-Role-Key bzw. später Plattform-Admin/org_admin der passenden
  Organisation — analog zum bestehenden `admin_select`/`admin_update`-Muster.

Dies ist eine Absichtserklärung für das Schema-Design, **keine SQL, die in dieser Phase
geschrieben oder ausgeführt wird.**

---

## 5. Explizit nicht Teil dieser Phase

Zur Vermeidung von Scope-Creep — folgendes wird in diesem Ticket **nicht** umgesetzt, auch wenn
es im Datenmodell oben mitgedacht ist:

- Keine Änderung am KSV-Schema, an KSV-Render-Konfiguration oder an produktiven Env-Variablen
- Kein Supabase Auth, keine `users`/`organization_members`-Tabelle als echte Migration
- Keine RLS-Migration (nur fachliches Design, siehe 4.4)
- Kein Stripe Billing, kein Stripe Connect
- Kein Self-Service-Onboarding (Serkan legt Organisationen vorerst manuell an)
- Kein Frontend-Routing-Umbau (`/[org-slug]/...` bleibt Zielbild für ein späteres Ticket)
- Keine Migration echter Registrierungsdaten
- Kein Scaffold von `backend_saas/`-Code — dieses Ticket liefert ausschließlich Dokumentation
  und Entscheidungsgrundlage (siehe [offene Entscheidungen](#8-offene-entscheidungen))

---

## 6. Service-Struktur

### 6.1 Alt (bestehend, unverändert, bleibt produktiv für KSV)

- `backend/` — bestehender FastAPI-Monolith, bleibt einzige Quelle für KSV Baunatal
- Bestehendes KSV-Supabase-Projekt — bleibt unangetastet, keine Schema-Änderung
- Bestehende KSV-Produktion (Render + Vercel) — bleibt unangetastet
- `frontend/` (inkl. `clubConfig.tsx`/`clubConfig.jk.tsx` Env-Switch) — bleibt vorerst der
  einzige Frontend-Client für **beide** aktuellen Clubs (KSV und JK-Draft), bis ein eigenes
  Frontend-Migrations-Ticket entscheidet, ob/wie auf das neue Backend umgestellt wird

### 6.2 Neu (dieses Ticket legt die Dokumentationsgrundlage, kein Code)

- **`backend_saas/`** (voraussichtlicher Name) — neuer, vollständig isolierter Backend-Bereich.
  Wiederverwendet Payment-, Registration-, Mail- und Admin-Logik-**Muster** aus `backend/`
  (JWT-Auth-Flow, Stripe-Checkout-Flow, Brevo-Mail-Versand, `registration_token`-Konzept), aber
  als eigener Codebestand mit von Anfang an tenant-bewusstem Datenmodell — kein Fork, der
  `organization_id` nachträglich einflicken muss.
- **Separates CampsPilot-SaaS-Supabase-Projekt** — eigene Instanz, eigener Connection-String,
  komplett getrennt vom KSV-Supabase-Projekt. Kein Shared-Database zwischen Legacy und SaaS.
- **Separates SaaS-Deployment** — eigener Render-Service (oder gleichwertig) für
  `backend_saas/`, unabhängig vom bestehenden `ksv-baunatal-backend`-Service. Frontend-seitiges
  Deployment-Ziel wird im Frontend-Migrations-Ticket entschieden.
- **Frontend-Migration** — ausdrücklich **nicht** Teil dieses Tickets, eigenes Folge-Ticket.

---

## 7. Abgrenzung zu KSV Legacy

KSV Baunatal ist produktiv und darf durch dieses Ticket **in keiner Weise verändert oder
gefährdet werden.** Das wird strukturell sichergestellt, nicht nur durch Disziplin:

- Neue Dateien liegen ausschließlich unter `docs/saas/` (dieses Dokument) — kein bestehender
  Code wird angefasst.
- Das geplante `backend_saas/` ist ein **neuer** Ordner, kein Umbau von `backend/`.
- Das geplante SaaS-Supabase-Projekt ist eine **neue** Instanz, keine Migration gegen die
  KSV-Datenbank.
- KSV bleibt vollständig im bestehenden `backend/` + bestehendem Supabase-Projekt, so lange,
  bis (falls überhaupt) eine spätere, eigenständig zu entscheidende KSV-Migration stattfindet
  (siehe [migration-strategy.md](./migration-strategy.md), Phase 4/5 — ausdrücklich **nicht**
  Teil dieser Phase).

## 7.1 JK als erster SaaS-Tenant

JK Performance Academy wird der erste echte Tenant der neuen SaaS-Struktur — aber nicht in
diesem Ticket. Diese Phase legt nur das Fundament (Dokumentation + Datenmodell-Entwurf), auf
dem eine spätere Phase JK als `organizations`-Datensatz anlegt. Zu beachten für diese spätere
Phase: der bestehende JK-Draft (`frontend/app/lib/clubConfig.jk.tsx`,
`docs/onboarding/jk-implementation-plan-after-yes.md`) geht aktuell noch von einer "komplett
von KSV isolierten, aber eigenständigen Einzel-Instanz" aus (kein Shared-Tenant-Gedanke). Das
ist ein Modell, das die SaaS-Struktur ersetzt: JK wird stattdessen der erste Mandant im
gemeinsamen Shared-Schema, nicht eine dritte, separate Einzel-Instanz. Diese Diskrepanz ist als
[offene Entscheidung](#8-offene-entscheidungen) unten vermerkt.

---

## 8. Offene Entscheidungen

Diese Punkte sind bewusst nicht in diesem Ticket entschieden worden und sollten vor Beginn von
Phase 2 (siehe migration-strategy.md) geklärt werden:

1. **Verhältnis zur bestehenden Roadmap in Root-`CLAUDE.md`** ("Roadmap: 5 Phasen Richtung
   Multi-Tenant SaaS", Phase 2–5). Diese ältere Roadmap beschreibt eine **In-Place-Evolution**
   von `backend/` (gleiche Codebasis bekommt `tenant_id`, RLS, Path-Routing). CP-S401 schlägt
   stattdessen einen **parallelen Neubau** (`backend_saas/`, eigenes Supabase-Projekt) vor, in
   den KSV frühestens in einer späteren, separat zu entscheidenden Phase migriert wird. Beide
   Ansätze sind nicht gleichzeitig sinnvoll verfolgbar — Root-`CLAUDE.md` sollte nach
   Bestätigung dieses Tickets aktualisiert oder die alte Roadmap explizit als überholt markiert
   werden. Nicht in diesem Ticket umgesetzt, um den Diff auf `docs/saas/` zu beschränken.
2. **`jersey_size` / produktspezifische Zusatzfelder:** feste Spalte nur für KSV-Legacy lassen,
   oder von Anfang an ein generisches `custom_fields jsonb` auf `camp_registrations` vorsehen,
   das JK und künftige Tenants für ihre eigenen Zusatzfelder nutzen können? Diese Phase schlägt
   vor, das erst zu entscheiden, wenn ein zweiter Tenant tatsächlich ein Zusatzfeld braucht
   (YAGNI), aber das ist eine Produktentscheidung, keine rein technische.
3. **`camps.slug`-Eindeutigkeit:** pro Organisation eindeutig (aktuell vorgeschlagen) oder
   global eindeutig, falls ein künftiges Pfad-Schema wie `/camps/[slug]` (ohne Org-Präfix)
   gewünscht ist?
4. **Backend-Sprache/Framework für `backend_saas/`:** Dieses Dokument geht von FastAPI/Python
   aus (Konsistenz mit `backend/`, Wiederverwendung von Logik-Mustern), das ist aber keine
   endgültige Festlegung.
5. **Zeitpunkt für ein Scaffold-Ticket:** Ein Folge-Ticket, das `backend_saas/` tatsächlich als
   leeres, lauffähiges FastAPI-Projekt anlegt (ohne echte Endpunkte), wäre der logische nächste
   Schritt vor Phase 1 aus migration-strategy.md — hier bewusst nicht vorgezogen, um dieses
   Ticket rein dokumentarisch zu halten.
