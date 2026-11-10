"""Retention of special-category data (Art. 9 GDPR) after a camp has ended.

health_data_retention clears `allergies` and `medical_notes` of registrations whose camp
ended at least 30 days ago. `health_data_consent` stays as proof of the consent. Only
with apply=True; otherwise the rows are only counted (dry run). The audit entry carries
the number of rows and the mode, never IDs, names or health values.

The general 12-month deletion stays manual (scripts/RETENTION-RUNBOOK.md: receipts and
retention duties must be checked first). general_review_rows only counts those rows.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo
from datetime import datetime

from . import db
from .repositories import platform_roles

logger = logging.getLogger(__name__)

HEALTH_AUDIT_ACTION = "retention.health_data"
_BERLIN = ZoneInfo("Europe/Berlin")

# Both statements join on organization_id as well: a registration is only ever matched to a
# camp of its own organization. organization_id (optional) narrows a run to one tenant.
_DUE_WHERE = """
    where c.id = r.camp_id and c.organization_id = r.organization_id
      and c.end_date + 30 <= %(today)s
      and (r.allergies is not null or r.medical_notes is not null)
      and (%(org)s::uuid is null or r.organization_id = %(org)s::uuid)
"""
_COUNT_HEALTH = f"select count(*) as n from public.camp_registrations r, public.camps c {_DUE_WHERE}"
_CLEAR_HEALTH = f"""
    update public.camp_registrations r
       set allergies = null, medical_notes = null
      from public.camps c
    {_DUE_WHERE}
"""
_COUNT_GENERAL = """
    select count(*) as n from public.camp_registrations r
    join public.camps c on c.id = r.camp_id and c.organization_id = r.organization_id
    where (c.end_date + interval '12 months')::date <= %(today)s
      and (%(org)s::uuid is null or r.organization_id = %(org)s::uuid)
"""


def berlin_today() -> date:
    return datetime.now(_BERLIN).date()


def _params(today: date, organization_id: Optional[UUID]) -> dict:
    return {"today": today, "org": str(organization_id) if organization_id else None}


def health_data_retention(apply: bool, today: date, organization_id: Optional[UUID] = None) -> dict:
    """Returns {"rows": affected-or-due row count, "applied": bool}."""
    params = _params(today, organization_id)
    with db.get_cursor() as cur:
        if apply:
            cur.execute(_CLEAR_HEALTH, params)
            rows = cur.rowcount
        else:
            cur.execute(_COUNT_HEALTH, params)
            rows = int(cur.fetchone()["n"])
    platform_roles.write_audit_log(
        actor_user_id=None,
        actor_email=None,
        action=HEALTH_AUDIT_ACTION,
        organization_id=str(organization_id) if organization_id else None,
        metadata={"rows": rows, "mode": "apply" if apply else "dry_run"},
    )
    logger.info("Health data retention finished (rows=%d, mode=%s)", rows, "apply" if apply else "dry_run")
    return {"rows": rows, "applied": apply}


def general_review_rows(today: date, organization_id: Optional[UUID] = None) -> int:
    """Registrations 12+ months after camp end that need a manual review. Never modifies."""
    with db.get_cursor() as cur:
        cur.execute(_COUNT_GENERAL, _params(today, organization_id))
        return int(cur.fetchone()["n"])
