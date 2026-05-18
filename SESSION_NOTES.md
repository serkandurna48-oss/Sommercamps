# Session Notes — chore/phase-1-bugfixes

> Arbeitsprotokoll für die laufende Phase-1-Bugfix-Session.
> Kann nach Abschluss aller Commits auf diesem Branch gelöscht werden.

---

## Branch-Stand

```
chore/phase-1-bugfixes
├── 1ccf257  docs: add CLAUDE.md and TODO.md
└── 7baee61  fix(validation): replace age range constraint with plausibility check
```

---

## B1 — Altersgrenze (SQL committed, nicht ausgeführt)

**Status:** SQL-Migrationsdatei liegt im Repo. **Noch nicht in Supabase ausgeführt.**

**Nächste Schritte (in dieser Reihenfolge):**
1. Supabase-Snapshot ziehen (Dashboard → Database → Backups)
2. Pre-Check-Query ausführen, 0 Zeilen bestätigen:
   ```sql
   SELECT id, child_first_name, child_last_name, birth_date,
          age(birth_date) AS current_age, status
   FROM camp_registrations
   WHERE birth_date <= (current_date - interval '13 years')
     AND status NOT IN ('cancelled')
   ORDER BY birth_date ASC;
   ```
3. Ergebnis melden → dann `backend/migration_fix_age_constraint.sql` in Supabase ausführen
4. Verify-Query aus der Migrationsdatei ausführen
5. Danach: Commits 5–7 (camp_config.py, Pydantic-Validator, Frontend-Helper, Tests)

**Entschiedene Architektur:**
- DB-Constraint wird zu Plausibilitätsprüfung (`not in future`, `not older than 25y`)
- Fachliche 5–12-Jahre-Regel → Pydantic `model_validator` gegen `camp_start_date`
- Schaltjahr-Handling: `python-dateutil` / `relativedelta` im Backend, `date-fns addYears` im Frontend
- Altersregel-Parameter (`age_min`, `age_max`) kommen später aus `GET /config` (T12)

---

## B3 — render.yaml veraltet (nächste Session, Commit A)

**Status:** Diagnostiziert, noch nicht implementiert.

**Problem:** `render.yaml:14` listet `ADMIN_API_KEY`, Code nutzt `ADMIN_PASSWORD`.
Außerdem fehlen `STRIPE_PRICE_CENTS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`FRONTEND_URL` als dokumentierte Vars.

**Scope Commit A:** Nur `ADMIN_API_KEY` → `ADMIN_PASSWORD` umbenennen.
Die Stripe-Vars kommen im gleichen Zug mit Commit B (B2).

**Commit-Message:**
```
fix(deploy): align admin env var name in render.yaml

ADMIN_API_KEY was never the correct name — the backend reads
ADMIN_PASSWORD. Prevents confusion when reconfiguring on Render.
```

---

## B2 — Preis-Inkonsistenz (nächste Session, Commit B)

**Status:** Diagnose abgeschlossen. Implementierung wartet auf Produktionswert.

### Offene Voraussetzung
**Produktionswert von `STRIPE_PRICE_CENTS` auf Render nachschauen.**
Erwartung: `14900` (= 149,00 €). Falls abweichend → erst Render korrigieren,
dann implementieren.

### Diagnose-Befunde
- `backend/.env.example`: `STRIPE_PRICE_CENTS` **fehlt komplett** (kein Platzhalter, kein Kommentar)
- `backend/render.yaml`: `STRIPE_PRICE_CENTS` **nicht gelistet**
- `main.py:64`: `os.getenv("STRIPE_PRICE_CENTS", "0")` — Default `0` = Stripe deaktiviert
- `frontend/page.tsx:53`: `const CAMP_PRICE = '149 €'` — vollständig unabhängig vom echten Wert

### Render-Stellen im Frontend
| Datei | Zeile | Wird ersetzt durch |
|-------|-------|-------------------|
| `page.tsx:53` | `const CAMP_PRICE = '149 €'` | Konstante fällt weg |
| `page.tsx:123` | `{ value: CAMP_PRICE, ... }` | `config.camp.price_display` |
| `page.tsx:234` | `<p>{CAMP_PRICE}</p>` | `config.camp.price_display` |

### Entschiedene Architektur

**Backend `GET /config`:**
```python
class CampConfig(BaseModel):
    price_cents: int
    currency: str = "EUR"

class ConfigResponse(BaseModel):
    camp: CampConfig

# GET /config — public, Cache-Control: public, max-age=300
# Guard: STRIPE_PRICE_CENTS <= 0 → HTTP 503
```

**Frontend `frontend/app/lib/campConfig.ts`:**
- Typ-Definition + `fetchCampConfig()` (Server-side fetch, `{ next: { revalidate: 300 } }`)
- Formatierung: `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })`
  → `"149 €"` bei glattem Betrag, `"149,50 €"` bei krummem

**page.tsx:** bleibt Server Component, `await fetchCampConfig()` direkt im Component-Body.
Error-Fallback: `"Preis auf Anfrage"` + `console.error`.

**Noch zu dokumentieren in `.env.example`:**
```
# Camp registration fee in cents (e.g. 14900 = 149.00 EUR).
# Must match the price configured in Stripe.
STRIPE_PRICE_CENTS=14900
```

### Offene ENV-Frage
`NEXT_PUBLIC_API_BASE_URL` im Frontend bereits vorhanden als `NEXT_PUBLIC_API_URL`
(in `.env.local.example` und in `RegistrationForm.tsx`/`admin/page.tsx` genutzt).
→ Beim Implementieren `NEXT_PUBLIC_API_URL` nutzen, **keine neue Var einführen**.

---

## Nächste Session — Checkliste

- [ ] Produktionswert `STRIPE_PRICE_CENTS` mitbringen
- [ ] Commit A: B3 (render.yaml `ADMIN_API_KEY` → `ADMIN_PASSWORD`)
- [ ] Commit B: B2 (`GET /config`, Frontend-Fetch, `.env.example`, render.yaml Stripe-Vars)
- [ ] Supabase-Snapshot ziehen + Pre-Check-Query → B1-Migration ausführen
- [ ] Commit 5: `backend/camp_config.py` + `python-dateutil` in requirements.txt + Pydantic-Validator
- [ ] Commit 6: Frontend-Helper `isAgeValidAtCampStart()` + RegistrationForm.tsx
- [ ] Commit 7: Tests (Pydantic + Frontend, inkl. Schaltjahr-Cases)
