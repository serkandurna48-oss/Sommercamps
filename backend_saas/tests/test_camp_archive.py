"""Past camps (archive, 10.11.2026): still public, but closed for registration."""

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.repositories.registrations import RegistrationWindowClosedError, validate_registration_window
from app.utils import is_camp_over


def test_camp_ending_today_berlin_is_not_over():
    # 23:30 UTC on 09.07. is already 10.07. in Berlin (summer time).
    now = datetime(2026, 7, 9, 23, 30, tzinfo=timezone.utc)
    assert is_camp_over(date(2026, 7, 10), now=now) is False
    assert is_camp_over(date(2026, 7, 9), now=now) is True


def test_registration_for_past_camp_is_rejected():
    camp = SimpleNamespace(slug="sommer-2026", registration_start=None, registration_end=None,
                           end_date=date(2020, 7, 10))
    with pytest.raises(RegistrationWindowClosedError):
        validate_registration_window(camp)


def test_future_camp_without_window_stays_open():
    camp = SimpleNamespace(slug="oster-2099", registration_start=None, registration_end=None,
                           end_date=date(2099, 4, 2))
    validate_registration_window(camp)
