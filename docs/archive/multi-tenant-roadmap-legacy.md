# ⚠️ SUPERSEDED / NOT CURRENT PRODUCT DIRECTION

> **Dieses Dokument beschreibt NICHT den aktuellen Kurs von CampsPilot.** Es ist die
> ursprüngliche Zielarchitektur aus der Frühphase des Projekts (Shared-Schema-Multi-Tenant-SaaS
> mit Row Level Security und Stripe Connect pro Verein). Seit **JK-102** ist der tatsächlich
> eingeschlagene Weg ein anderer: **isolierte Infrastruktur pro Kunde** (eigenes Supabase-Projekt,
> eigener Render-Service, eigene Env-Vars) auf einer gemeinsamen Codebase — bewusst **kein**
> Full-Multi-Tenant-SaaS, kein Self-Service-Onboarding.
>
> **Maßgeblich für den IST-Zustand ist ausschließlich
> [`docs/architecture/system-overview.md`](../architecture/system-overview.md).** Das dortige
> Dokument sagt explizit: „Es gibt kein echtes Multi-Tenant-System (keine `organizations`-Tabelle,
> keine Row-Level-Security-basierte Mandantentrennung)."
>
> Dieses Archiv-Dokument bleibt nur aus historischen Gründen erhalten (Nachvollziehbarkeit
> früherer Entscheidungen). Keine der folgenden Phasen ist aktueller Auftrag oder aktive
> Planung. Bitte nicht als Grundlage für neue Arbeit verwenden.

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
