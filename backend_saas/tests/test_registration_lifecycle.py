from __future__ import annotations

import pytest

from app.registration_lifecycle import (
    ALLOWED_TRANSITIONS,
    CAPACITY_COUNTING_STATUSES,
    InvalidStatusTransitionError,
    validate_transition,
)


def test_capacity_counting_statuses_are_exactly_registered_and_confirmed():
    assert CAPACITY_COUNTING_STATUSES == frozenset({"registered", "confirmed"})


@pytest.mark.parametrize(
    "current_status,new_status",
    [
        ("registered", "confirmed"),
        ("registered", "cancelled"),
        ("confirmed", "cancelled"),
        ("waitlist", "registered"),
        ("waitlist", "cancelled"),
    ],
)
def test_allowed_transitions_do_not_raise(current_status, new_status):
    validate_transition(current_status, new_status)  # must not raise


@pytest.mark.parametrize(
    "current_status,new_status",
    [
        ("cancelled", "registered"),
        ("cancelled", "confirmed"),
        ("cancelled", "waitlist"),
        ("cancelled", "cancelled"),
        ("confirmed", "registered"),
        ("confirmed", "waitlist"),
        ("registered", "waitlist"),
        ("registered", "registered"),
        ("waitlist", "confirmed"),
        ("waitlist", "waitlist"),
    ],
)
def test_disallowed_transitions_raise(current_status, new_status):
    with pytest.raises(InvalidStatusTransitionError) as exc_info:
        validate_transition(current_status, new_status)
    assert exc_info.value.current_status == current_status
    assert exc_info.value.new_status == new_status


def test_cancelled_is_terminal_with_zero_allowed_outgoing_transitions():
    assert ALLOWED_TRANSITIONS["cancelled"] == frozenset()


def test_allowed_transitions_table_matches_ticket_spec_exactly():
    assert ALLOWED_TRANSITIONS == {
        "registered": frozenset({"confirmed", "cancelled"}),
        "confirmed": frozenset({"cancelled"}),
        "waitlist": frozenset({"registered", "cancelled"}),
        "cancelled": frozenset(),
    }


def test_unknown_current_status_raises_rather_than_silently_allowing():
    with pytest.raises(InvalidStatusTransitionError):
        validate_transition("some-future-status", "registered")
