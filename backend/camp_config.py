from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta

# ---------------------------------------------------------------------------
# Age rule
# Business rule: child must be CAMP_AGE_MIN–CAMP_AGE_MAX years old at the
# camp start date. Enforced in the Pydantic model_validator (main.py), not
# in the DB constraint (which is a structural plausibility guard only).
# ---------------------------------------------------------------------------

CAMP_AGE_MIN: int = 5
CAMP_AGE_MAX: int = 12


# ---------------------------------------------------------------------------
# Camp weeks
# label strings MUST remain identical to the values stored in the DB column
# selected_camp_week — changing them would break existing registrations.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CampWeek:
    label: str        # display string, matches DB value
    start_date: date  # first day of the camp week
    end_date: date    # last day of the camp week


CAMP_WEEKS: list[CampWeek] = [
    CampWeek("29.06.–02.07.2026", date(2026, 6, 29), date(2026, 7, 2)),
    CampWeek("03.08.–06.08.2026", date(2026, 8, 3),  date(2026, 8, 6)),
    CampWeek("05.10.–08.10.2026", date(2026, 10, 5), date(2026, 10, 8)),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_camp_week_by_label(label: str) -> Optional[CampWeek]:
    """Returns the CampWeek for the given label, or None if not found."""
    for week in CAMP_WEEKS:
        if week.label == label:
            return week
    return None


def validate_age_at_camp_start(
    birth_date: date,
    camp_start: date,
) -> tuple[bool, Optional[str]]:
    """Checks whether the child is between CAMP_AGE_MIN and CAMP_AGE_MAX
    years old on the camp start date.

    Uses dateutil.relativedelta for leap-year-safe age calculation.
    A child born on Feb 29 turns a year older on Feb 28 in non-leap years.

    Returns:
        (True, None)           — age is within the allowed range
        (False, error_message) — age is outside the allowed range
    """
    age_at_start: int = relativedelta(camp_start, birth_date).years
    if age_at_start < CAMP_AGE_MIN:
        return (
            False,
            f"Das Kind muss zum Campstart mindestens {CAMP_AGE_MIN} Jahre alt sein "
            f"(Alter zum Campstart: {age_at_start} Jahre).",
        )
    if age_at_start > CAMP_AGE_MAX:
        return (
            False,
            f"Das Kind darf zum Campstart höchstens {CAMP_AGE_MAX} Jahre alt sein "
            f"(Alter zum Campstart: {age_at_start} Jahre).",
        )
    return (True, None)
