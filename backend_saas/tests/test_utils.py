from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.utils import age_on_date, is_registration_open


def test_age_on_date_exactly_on_birthday():
    assert age_on_date(date(2010, 5, 10), date(2027, 5, 10)) == 17


def test_age_on_date_day_before_birthday():
    assert age_on_date(date(2010, 5, 10), date(2027, 5, 9)) == 16


def test_age_on_date_day_after_birthday():
    assert age_on_date(date(2010, 5, 10), date(2027, 5, 11)) == 17


def test_age_on_date_feb29_birthday_turns_older_on_feb28_in_non_leap_year():
    # Matches backend/camp_config.py's documented dateutil convention.
    birth = date(2012, 2, 29)
    assert age_on_date(birth, date(2027, 2, 27)) == 14
    assert age_on_date(birth, date(2027, 2, 28)) == 15
    assert age_on_date(birth, date(2027, 3, 1)) == 15


def test_age_on_date_feb29_birthday_in_a_leap_reference_year():
    birth = date(2012, 2, 29)
    assert age_on_date(birth, date(2028, 2, 28)) == 15
    assert age_on_date(birth, date(2028, 2, 29)) == 16


def test_is_registration_open_true_when_no_bounds():
    assert is_registration_open(None, None) is True


def test_is_registration_open_true_when_only_start_and_now_is_after():
    start = datetime.now(timezone.utc) - timedelta(days=1)
    assert is_registration_open(start, None) is True


def test_is_registration_open_false_when_only_start_and_now_is_before():
    start = datetime.now(timezone.utc) + timedelta(days=1)
    assert is_registration_open(start, None) is False


def test_is_registration_open_true_when_only_end_and_now_is_before():
    end = datetime.now(timezone.utc) + timedelta(days=1)
    assert is_registration_open(None, end) is True


def test_is_registration_open_false_when_only_end_and_now_is_after():
    end = datetime.now(timezone.utc) - timedelta(days=1)
    assert is_registration_open(None, end) is False


def test_is_registration_open_true_within_window():
    now = datetime.now(timezone.utc)
    assert is_registration_open(now - timedelta(days=1), now + timedelta(days=1)) is True


def test_is_registration_open_accepts_explicit_now_for_deterministic_tests():
    start = datetime(2027, 1, 1, tzinfo=timezone.utc)
    end = datetime(2027, 1, 31, tzinfo=timezone.utc)
    assert is_registration_open(start, end, now=datetime(2027, 1, 15, tzinfo=timezone.utc)) is True
    assert is_registration_open(start, end, now=datetime(2026, 12, 31, tzinfo=timezone.utc)) is False
    assert is_registration_open(start, end, now=datetime(2027, 2, 1, tzinfo=timezone.utc)) is False
