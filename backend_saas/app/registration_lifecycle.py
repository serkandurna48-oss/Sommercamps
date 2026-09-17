"""
Single source of truth for `camp_registrations.status` semantics: which
values count against camp capacity, and which status transitions are
allowed. Nothing outside this module should hardcode either rule — see
repositories/registrations.py for the only place that consumes it.

Status meanings (mirrors the DB CHECK constraint in
supabase/migrations/20260917133748_create_saas_schema_v1.sql, no schema
change needed for CP-S406 — the four values already existed):

    registered  a reserved spot; counts against capacity
    confirmed   a confirmed spot (e.g. after payment, in a later ticket —
                not reachable via any code path yet); counts against capacity
    waitlist    no spot reserved; does NOT count against capacity
    cancelled   no active participation; does NOT count against capacity;
                terminal — no transition out of it is allowed, including
                back to itself (see validate_transition)
"""

from __future__ import annotations


class InvalidStatusTransitionError(Exception):
    """Raised whenever (current_status -> new_status) is not one of the
    explicitly allowed arrows in ALLOWED_TRANSITIONS."""

    def __init__(self, current_status: str, new_status: str):
        self.current_status = current_status
        self.new_status = new_status
        super().__init__(
            f"Cannot transition registration from '{current_status}' to '{new_status}'"
        )


CAPACITY_COUNTING_STATUSES = frozenset({"registered", "confirmed"})

# Every allowed arrow, and only these — see this module's docstring for what
# each status means. Anything not listed as a value here (including a
# status "transitioning" to itself) is disallowed by validate_transition.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "registered": frozenset({"confirmed", "cancelled"}),
    "confirmed": frozenset({"cancelled"}),
    "waitlist": frozenset({"registered", "cancelled"}),
    "cancelled": frozenset(),
}


def validate_transition(current_status: str, new_status: str) -> None:
    """
    Raises InvalidStatusTransitionError unless the transition is explicitly
    allowed. In particular, cancelled -> cancelled is NOT a no-op here —
    re-cancelling an already-cancelled registration is rejected the same
    way as any other disallowed transition, so a caller (e.g.
    cancel_registration_and_promote_next) can't accidentally trigger a
    second promotion by re-running a cancellation that already happened.
    """
    if new_status not in ALLOWED_TRANSITIONS.get(current_status, frozenset()):
        raise InvalidStatusTransitionError(current_status, new_status)
