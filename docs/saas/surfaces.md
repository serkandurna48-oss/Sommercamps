# CampsPilot SaaS — vorhandene Oberflächen (Stand: MVP-Oberflächenauftrag)

Kurzreferenz, welche Seite wer sehen darf. Kein Anspruch auf Vollständigkeit der einzelnen
Unterseiten (z. B. Warteliste/Aufgaben je Camp) — nur die Einstiegspunkte pro Rolle.

## Plattform (platform_owner — sieht/steuert jeden Verein)

| URL | Zweck |
|---|---|
| `/platform/login` | Login (Supabase Auth, gleicher Account wie für `/pilot/*`) |
| `/platform` | Vereinsliste + Kennzahlen + „+ Neuen Verein anlegen" |
| `/platform/new` | Verein-und-erstes-Camp-Formular |
| `/platform/{org}` | Vereinsdetail: Einrichtungsfortschritt, Veröffentlichen-Schalter, Camps, Vereinsadmins zuweisen, „Vereinsverwaltung öffnen" |
| `/platform/{org}/preview` | Vorschau der (ggf. noch unveröffentlichten) öffentlichen Vereinsseite |
| `/platform/registrations` | Alle Anmeldungen, über alle Vereine, filterbar |
| `/platform/audit-log` | Änderungsverlauf (Veröffentlichen, Zahlungsstatus, Storno, Rollenzuweisung) |

Ein org_admin, der versucht `/platform*` zu öffnen, wird zur eigenen Vereinsverwaltung
umgeleitet (`frontend/app/platform/(console)/layout.tsx`) — Backend weist zusätzlich jeden
einzelnen Datenaufruf mit 403 zurück (`require_platform_owner`).

## Vereinsverwaltung — `/pilot/{org}/...` (platform_owner ODER der org_admin dieses Vereins)

| URL | Zweck |
|---|---|
| `/pilot/{org}/login` | Login für diesen Verein (gleicher Supabase-Account) |
| `/pilot/{org}/dashboard` | Übersicht: nächstes Camp, Aufgaben, alle Camps |
| `/pilot/{org}/camps/new` | Neues Camp anlegen |
| `/pilot/{org}/camps/{camp}` | Teilnehmerliste dieses Camps (ansehen + korrigieren) |
| `/pilot/{org}/camps/{camp}/zahlungen` | Zahlungsstatus je Anmeldung |
| `/pilot/{org}/camps/{camp}/warteliste` | Warteliste, FIFO-Aufrücken |
| `/pilot/{org}/camps/{camp}/aufgaben` | Offene Aufgaben zu diesem Camp |
| `/pilot/{org}/camps/{camp}/konfiguration` | Termine, Kapazität, Preis, Status (Entwurf/Veröffentlicht/…) |
| `/pilot/{org}/konfiguration` | Vereinsstammdaten (Name, Kontakt, Branding, IBAN, Rechtsangaben) |
| `/pilot/{org}/zahlungen`, `/pilot/{org}/warteliste`, `/pilot/{org}/aufgaben` | Wie oben, über alle Camps des Vereins |

Zugriffsschutz (seit diesem Auftrag verschärft, siehe `(org-admin)/layout.tsx`): nur wenn
`fetchMe()` entweder `is_platform_owner` liefert oder dieser Org-Slug in
`admin_organization_slugs` steht — sonst Weiterleitung zum eigenen ersten Verein bzw. Login.
Ein platform_owner sieht hier zusätzlich einen Link „← Zur Plattform" (nur für ihn, siehe
`OrgSwitcher.tsx`) — ein org_admin sieht diesen Link nicht, weil er dort ohnehin abgewiesen
würde (keine tote Abkürzung).

## Öffentlich — keine Anmeldung nötig

| URL | Zweck |
|---|---|
| `/pilot/{org}` | Elternseite: Camps, Anmeldeformular, Bestätigungsseite |
| `/pilot/{org}/impressum`, `/pilot/{org}/datenschutz` | Pro Verein, siehe MVP-Blocker-Dokumentation |

Nur erreichbar, wenn der Verein `site_published=true` UND das jeweilige Camp
`status='published'` ist — sonst 404, nie ein KSV- oder Fremd-Verein-Fallback.

## Rollen-Kurzfassung

- **platform_owner**: Mitgliedschaft in `platform_owners` (Supabase-Tabelle). Sieht alles.
- **org_admin**: Mitgliedschaft in `organization_members` für genau die zugewiesenen
  Organisationen. Sieht nur diese.
- Beide Rollen nutzen denselben Supabase-Auth-Login (`/platform/login` und
  `/pilot/{org}/login` sind zwei URLs für denselben Account-Typ, kein getrenntes System).
- Zuweisung eines org_admin: nur durch einen platform_owner, über
  `/platform/{org}` → „Als Vereinsadmin zuweisen" — das Konto muss vorher per
  `backend_saas/scripts/create_platform_user.py` existieren (kein Einladungs-E-Mail-Versand).
