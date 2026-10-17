# Historisch: früher Entwurf der Multi-Tenant-Roadmap (Stand vor JK-102 und vor `backend_saas/`)

> **Korrektur (Stand CP-S409B):** Der Vermerk, der früher an dieser Stelle stand — Shared-Schema-
> Multi-Tenant-SaaS sei überholt und nicht mehr aktiver Kurs —, ist selbst überholt. **Shared-
> Multi-Tenant ist wieder die verbindliche Zielarchitektur** (siehe
> [`CLAUDE.md`](../../CLAUDE.md), Abschnitt "Projektüberblick & aktueller Kurs"). Die isolierte
> Pro-Kunde-Infrastruktur aus JK-102 ([`docs/architecture/system-overview.md`](../architecture/system-overview.md))
> beschreibt weiterhin korrekt den technischen IST-Zustand von `backend/` — aber als
> Übergangszustand, nicht als Zielbild.
>
> **Trotzdem beschreibt auch dieses Dokument nicht den aktuellen Bauplan.** Die hier festgehaltene
> Mechanik — `organization_id`-FK direkt in die bestehende KSV-`camp_registrations`-Tabelle,
> In-Place-Umbau von `backend/` — ist durch einen **parallelen Neubau** ersetzt worden:
> `backend_saas/` mit eigenem Schema, eigenem Supabase-Projekt, eigenem Deployment. Verbindlich
> sind [`docs/saas/architecture.md`](../saas/architecture.md) und
> [`docs/saas/migration-strategy.md`](../saas/migration-strategy.md). Dieses Dokument bleibt nur
> zur historischen Nachvollziehbarkeit der ursprünglichen Idee erhalten.

---

## Roadmap: 5 Phasen Richtung Multi-Tenant SaaS (historisch, Stand vor JK-102)

**Zielarchitektur (damals):** Shared DB / Shared Schema + Row Level Security in Supabase.
Stripe Connect (Express) für Auszahlungen pro Verein. Routing: Path-basiert (`/[org-slug]/...`)
für MVP, Subdomain später.

### Phase 1 — Foundation Hardening
**Ziel:** Alle Bugs fix, alle Hardcodings in Config extrahiert. KSV läuft stabil.
Keine Multi-Tenant-Änderungen an DB oder Auth.

- Bugs B1–B5 beheben
- `ALLOWED_CAMP_WEEKS` und `ALLOWED_JERSEY_SIZES` als API-Endpunkt exponieren (DRY)
- `CAMP_PRICE_DISPLAY` Env-Var (aligned mit `STRIPE_PRICE_CENTS`)
- Alle E-Mail-Template-Strings in Env-Vars (`CLUB_NAME`, `CAMP_YEAR`, etc.)
- `render.yaml` korrigieren
- Minimale Test-Coverage für alle Endpunkte

### Phase 2 — Tenant Data Model
**Ziel:** DB unterstützt mehrere Vereine, KSV weiter als einziger Tenant.

- Neue Tabelle `organizations` (id, slug, name, config jsonb, ...)
- `tenant_id` FK in `camp_registrations`
- RLS-Policies per Tenant
- Per-Tenant Config: club_name, email, bank_details, camp_weeks, camp_price
- Migration: KSV als erster Tenant anlegen, alle bestehenden Registrierungen migrieren

### Phase 3 — Multi-Tenant Auth & Admin
**Ziel:** Jeder Verein hat eigene Admin-Credentials.

- `admin_users` Tabelle (oder Supabase Auth)
- Per-Tenant JWT-Ausstellung oder Supabase Auth mit Tenant-Kontext
- Tenant-Isolation in allen Admin-Endpunkten erzwingen
- Onboarding-Flow: Neuen Verein anlegen

### Phase 4 — Path-basiertes Routing
**Ziel:** `/[org-slug]/...` im Frontend, dynamische Landing Pages.

- Next.js Dynamic Routes: `app/[slug]/page.tsx`, `app/[slug]/admin/page.tsx`
- Org-Config via API laden (camp_weeks, prices, contact, logo)
- Impressum/Datenschutz per Tenant dynamisch oder Template-basiert
- Redirect: `/` → Tenant-Auswahl oder Default-Tenant

### Phase 5 — Stripe Connect
**Ziel:** Jeder Verein bekommt Zahlungen direkt auf sein Konto.

- Stripe Connect Express (Onboarding-Flow per Verein)
- `stripe_account_id` in `organizations`
- Checkout Sessions mit `stripe_account` Parameter
- Platform-Gebühr konfigurierbar
- Payout-Dashboard im Admin

---

## Was tatsächlich umgesetzt wurde (statt Phase 2+)

Statt der oben beschriebenen `organizations`-Tabelle mit Shared-Schema/RLS wurde mit **JK-102**
eine komplett andere Lösung für "zweiter Kunde" gebaut: vollständig getrennte Infrastruktur
pro Kunde. Siehe [`docs/architecture/system-overview.md`](../architecture/system-overview.md)
und [`docs/onboarding/jk-infrastructure-setup.md`](../onboarding/jk-infrastructure-setup.md)
für den tatsächlichen, aktuellen Ansatz.
