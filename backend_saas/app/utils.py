"""
Small, pure, DB-free utilities shared between the public read API
(app/schemas.py::CampPublic.registration_open) and the registration
write-flow (app/repositories/registrations.py) — kept here once instead of
duplicated in both places.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from dateutil.relativedelta import relativedelta


def age_on_date(birth_date: date, reference_date: date) -> int:
    """
    A person's age in full years on `reference_date` — NOT today's age.
    Used to check a child's age at a camp's start_date, not at request time.

    Uses dateutil.relativedelta for leap-year-safe calendar arithmetic,
    exactly matching backend/camp_config.py::validate_age_at_camp_start's
    approach (same library, same convention): a child born on Feb 29 turns
    a year older on Feb 28 in non-leap years, not on Mar 1. This SaaS
    codebase deliberately mirrors that convention rather than inventing a
    different one.
    """
    return relativedelta(reference_date, birth_date).years


def is_registration_open(
    registration_start: Optional[datetime],
    registration_end: Optional[datetime],
    *,
    now: Optional[datetime] = None,
) -> bool:
    """
    True unless `now` falls outside an explicit [registration_start,
    registration_end] window. A `None` bound means "no limit" on that side;
    both `None` means always open. Timezone-aware throughout — `now`
    defaults to the current UTC instant, and `registration_start`/`_end`
    are expected to be timezone-aware (Postgres `timestamptz` columns
    always deserialize that way via psycopg2).
    """
    now = now if now is not None else datetime.now(timezone.utc)
    if registration_start is not None and now < registration_start:
        return False
    if registration_end is not None and now > registration_end:
        return False
    return True
