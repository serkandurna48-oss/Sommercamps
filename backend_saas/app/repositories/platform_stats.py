"""
Aggregate counters for the CEO console's overview (/admin/stats) —
platform-owner only (enforced at the router, see app/auth_deps.py). One
query, a handful of scalar aggregates; deliberately not per-organization
breakdowns (the organizations list endpoint already gives per-org
camp_count, and the global registrations endpoint gives row-level detail
when that's what's actually needed).
"""

from __future__ import annotations

from .. import db

_STATS_QUERY = """
    select
        (select count(*) from organizations where site_published) as organizations_published,
        (select count(*) from organizations where not site_published) as organizations_draft,
        (select count(*) from camps) as camps_total,
        (select count(*) from camp_registrations) as registrations_total,
        (select count(*) from camp_registrations where created_at >= now() - interval '30 days')
            as registrations_last_30_days,
        (select coalesce(sum(price_cents), 0)
            from camp_registrations r join camps c on c.id = r.camp_id
            where r.payment_status = 'open' and r.status in ('registered', 'confirmed', 'waitlist')
        ) as payments_open_cents,
        (select coalesce(sum(price_cents), 0)
            from camp_registrations r join camps c on c.id = r.camp_id
            where r.payment_status = 'paid'
        ) as payments_paid_cents,
        (select count(*) from camp_registrations where status = 'waitlist') as waitlist_total
"""


def get_platform_stats() -> dict:
    with db.get_cursor() as cur:
        cur.execute(_STATS_QUERY)
        return cur.fetchone()
