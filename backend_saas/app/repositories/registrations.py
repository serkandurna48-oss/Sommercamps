"""
Registration write-flow — internal camp lookup, eligibility checks, the
capacity-safe create (with waitlist fallback), and the internal (not yet
publicly exposed) lifecycle operations: FIFO waitlist promotion and
cancel-and-promote.

Separate from app/repositories/camps.py on purpose: the public camps
repository deliberately never returns an internal `id` (see its docstring),
but the write-flow needs one to insert/update `camp_registrations` rows.
This module is that one narrowly-scoped exception, not a general-purpose
"camps with more fields" repository — see get_registration_target's
docstring.

Concurrency invariant (read this before touching any function below): every
function that mutates camp_registrations in a way that affects capacity
(create_registration, promote_next_waitlisted_registration,
cancel_registration_and_promote_next) begins by acquiring
`SELECT ... FOR UPDATE` on the camp's row, via _LOCK_CAMP_CAPACITY, before
doing anything capacity-sensitive. That single lock is the one
synchronization point all of them share — bypassing it anywhere would
reopen the overselling/double-promotion race window. See
cancel_registration_and_promote_next's docstring for why it *additionally*
locks the registration row first, and why that ordering (registration, then
camp — never the reverse) can't deadlock against the other functions here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from .. import db
from ..registration_lifecycle import CAPACITY_COUNTING_STATUSES, validate_transition
from ..schemas import RegistrationCreate
from ..tenancy import TenantContext
from ..utils import age_on_date, is_registration_open


class RegistrationRejectedError(Exception):
    """Base class for registration-lifecycle failures — mapped to an HTTP
    error by whichever endpoint (public write-flow today; an internal/admin
    one later) surfaces them."""


class CampNotAvailableError(RegistrationRejectedError):
    """
    The camp doesn't exist, isn't published, or belongs to a different
    organization than the resolved tenant — maps to 404, identical to an
    unknown camp_slug on the public read API. Practically only raised by
    the locked re-check in create_registration()/promotion; the initial
    get_registration_target() call returns None for the same conditions
    rather than raising, since "not found yet" and "vanished mid-request"
    are different call sites.
    """


class RegistrationWindowClosedError(RegistrationRejectedError):
    """Registration isn't currently open for this camp — maps to 422."""


class ChildAgeNotEligibleError(RegistrationRejectedError):
    """Child's age at the camp's start_date is outside [age_min, age_max] — maps to 422."""

    def __init__(self, age_at_start: int, age_min: int, age_max: int):
        self.age_at_start = age_at_start
        self.age_min = age_min
        self.age_max = age_max
        super().__init__(
            f"Child age at camp start ({age_at_start}) is outside "
            f"the allowed range [{age_min}, {age_max}]"
        )


class RegistrationNotFoundError(RegistrationRejectedError):
    """No registration with this id exists for this tenant — a tenant-scoped
    lookup miss. Deliberately indistinguishable from "exists but belongs to
    a different tenant"; see this module's docstring re: tenant scoping."""

    def __init__(self, registration_id: UUID):
        self.registration_id = registration_id
        super().__init__(f"No registration found for id '{registration_id}' in this organization")


class DuplicateRegistrationError(RegistrationRejectedError):
    """
    A registration for this exact child (first name + last name + birth
    date, case-insensitive on the names) already exists for this camp and
    isn't cancelled — maps to 409 (Eltern-Flow-Auftrag Abschnitt 11, "Doppelte
    Anmeldung ... wird erkannt"). Deliberately application-level, not a DB
    constraint (Auftrag Abschnitt 13 erlaubt außer der `theme`-Spalte keine
    Schema-Änderung) — checked inside the same locked transaction as the
    capacity count, so two near-simultaneous duplicate submissions can't
    both slip through.
    """

    def __init__(self, camp_slug: str):
        self.camp_slug = camp_slug
        super().__init__(f"A non-cancelled registration for this child already exists for camp '{camp_slug}'")


@dataclass(frozen=True)
class RegistrationTarget:
    """
    Internal camp representation for the write-flow — a superset of what
    CampPublic exposes, including the `id` the public API deliberately
    omits. Never serialized directly to a client; only fields
    RegistrationCreated declares ever reach the response.
    """

    id: UUID
    organization_id: UUID
    slug: str
    start_date: date
    end_date: date
    registration_start: Optional[datetime]
    registration_end: Optional[datetime]
    age_min: int
    age_max: int
    capacity: int
    status: str


_TARGET_FIELDS = """
    id, organization_id, slug, start_date, end_date,
    registration_start, registration_end, age_min, age_max, capacity, status
"""

_GET_TARGET = f"""
    select {_TARGET_FIELDS}
    from camps
    where organization_id = %s
      and slug = %s
      and status = 'published'
"""

_LOCK_CAMP_CAPACITY = "select capacity from camps where id = %s for update"

# Capacity is defined as "how many registered/confirmed rows exist for this
# camp" — CAPACITY_COUNTING_STATUSES (app/registration_lifecycle.py) is the
# only place those two status values are decided; passed in as a parameter
# (`= any(%s)`) rather than hardcoded here, so this query can never drift
# from that definition. Pre-CP-S406 this was `status <> 'cancelled'`, which
# would have wrongly counted waitlist rows against capacity — see
# docs/saas/database-schema.md / README.md for why that changed.
_COUNT_ACTIVE_REGISTRATIONS = """
    select count(*) as active_count
    from camp_registrations
    where camp_id = %s
      and organization_id = %s
      and status = any(%s)
"""

_INSERT_REGISTRATION = """
    insert into camp_registrations (
        organization_id, camp_id, status,
        parent_first_name, parent_last_name, parent_email, parent_phone,
        child_first_name, child_last_name, child_birth_date,
        emergency_contact_name, emergency_contact_phone,
        medical_notes, allergies, jersey_size, pickup_authorized,
        photo_permission, terms_accepted, privacy_accepted
    ) values (
        %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s,
        %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s
    )
    returning registration_token, status, payment_status
"""

# Case-insensitive auf Vor-/Nachname, exaktes Geburtsdatum, gleicher Camp,
# nicht storniert — siehe DuplicateRegistrationError. `for update` sperrt
# keine Zeilen hier (kein Capacity-Bezug), dient nur der konsistenten
# Sicht innerhalb derselben Transaktion wie die Kapazitätsprüfung.
_FIND_DUPLICATE_CHILD = """
    select id
    from camp_registrations
    where camp_id = %s
      and organization_id = %s
      and lower(child_first_name) = lower(%s)
      and lower(child_last_name) = lower(%s)
      and child_birth_date = %s
      and status <> 'cancelled'
    limit 1
"""

_SELECT_OLDEST_WAITLISTED = """
    select id
    from camp_registrations
    where camp_id = %s
      and organization_id = %s
      and status = 'waitlist'
    order by created_at asc, id asc
    limit 1
"""

_PROMOTE_TO_REGISTERED = """
    update camp_registrations
    set status = 'registered'
    where id = %s
      and organization_id = %s
    returning registration_token, status, payment_status
"""

_LOAD_AND_LOCK_REGISTRATION = """
    select id, camp_id, status
    from camp_registrations
    where id = %s
      and organization_id = %s
    for update
"""

_UPDATE_STATUS = """
    update camp_registrations
    set status = %s
    where id = %s
      and organization_id = %s
    returning id, registration_token, status, payment_status
"""


def get_registration_target(tenant: TenantContext, camp_slug: str) -> Optional[RegistrationTarget]:
    """
    The internal counterpart to camps.get_published_camp_by_slug — same
    WHERE clause (organization_id + slug + status='published'), so an
    unknown slug, a draft/closed/archived camp, and a camp belonging to a
    different tenant are all indistinguishable None results here too (see
    app/repositories/camps.py for why that's deliberate). Only the field
    list differs: this includes `id`, needed to write a registration.
    """
    with db.get_cursor() as cur:
        cur.execute(_GET_TARGET, (tenant.organization_id, camp_slug))
        row = cur.fetchone()
    if row is None:
        return None
    return RegistrationTarget(**row)


_ADMIN_REGISTRATION_FIELDS = """
    id, registration_token, status, payment_status,
    parent_first_name, parent_last_name, parent_email, parent_phone,
    child_first_name, child_last_name, child_birth_date,
    emergency_contact_name, emergency_contact_phone,
    medical_notes, allergies, jersey_size, pickup_authorized,
    photo_permission, created_at
"""

_LIST_REGISTRATIONS_FOR_CAMP = f"""
    select {_ADMIN_REGISTRATION_FIELDS}
    from camp_registrations
    where organization_id = %s
      and camp_id = %s
    order by created_at asc, id asc
"""


def list_registrations_for_camp(organization_id: UUID, camp_id: UUID) -> list[dict]:
    """
    Platform-admin only — every registration for this camp regardless of
    status (registered/confirmed/cancelled/waitlist), unlike the public
    write-flow which never reads registrations back at all. Both ids must
    already be resolved server-side (organization via
    organizations.get_organization_by_slug, camp via
    camps.get_camp_by_slug — never a client-supplied id directly), same
    rule as camps.create_camp. Occupancy, open-payment totals, and waitlist
    counts are computed from this raw list in the frontend (Auftrag
    Abschnitt 9.1) — this function returns rows, not aggregates.

    Contains real personal/medical data about children (parent contact
    info, allergies, medical_notes) — callers must apply the same no-PII-
    in-logs discipline as app/routers/registrations.py.
    """
    with db.get_cursor() as cur:
        cur.execute(_LIST_REGISTRATIONS_FOR_CAMP, (organization_id, camp_id))
        return cur.fetchall()


def validate_registration_window(camp: RegistrationTarget) -> None:
    if not is_registration_open(camp.registration_start, camp.registration_end):
        raise RegistrationWindowClosedError(f"Registration window closed for camp '{camp.slug}'")


def validate_child_age(camp: RegistrationTarget, child_birth_date: date) -> None:
    age_at_start = age_on_date(child_birth_date, camp.start_date)
    if not (camp.age_min <= age_at_start <= camp.age_max):
        raise ChildAgeNotEligibleError(age_at_start, camp.age_min, camp.age_max)


def create_registration(
    tenant: TenantContext,
    camp: RegistrationTarget,
    data: RegistrationCreate,
) -> dict:
    """
    Since CP-S406, a full camp no longer rejects the request — it inserts
    the registration as `status='waitlist'` instead (still HTTP 201; see
    app/routers/registrations.py). Capacity itself is still fully enforced:
    a `registered` row is only ever created while capacity remains.

    Runs entirely inside a single transaction (one borrowed connection via
    db.get_cursor):

    1. `SELECT capacity FROM camps WHERE id = %s FOR UPDATE` — locks this
       camp's row. A concurrent request for the *same* camp blocks here
       until this transaction commits or rolls back; requests for
       *different* camps are unaffected (no cross-camp contention).
    2. Count active (registered/confirmed — CAPACITY_COUNTING_STATUSES)
       registrations for this camp, inside the same transaction/lock.
    3. INSERT with status='registered' if capacity remains, else
       status='waitlist'. Either way this function always succeeds (no
       exception for "full") — only CampNotAvailableError remains, for the
       practically-unreachable "camp vanished mid-transaction" case.

    This prevents two concurrent requests from both reading "1 spot left"
    and both inserting as 'registered': the second transaction's FOR UPDATE
    blocks until the first commits, then re-counts and correctly falls
    back to 'waitlist'.

    `organization_id` comes from `tenant` (server-resolved), `camp_id`
    from `camp.id` (server-resolved via get_registration_target) — never
    from `data`, which has no such fields (see RegistrationCreate).
    """
    with db.get_cursor() as cur:
        cur.execute(_LOCK_CAMP_CAPACITY, (camp.id,))
        locked = cur.fetchone()
        if locked is None:
            raise CampNotAvailableError(f"Camp '{camp.slug}' no longer available")

        cur.execute(
            _FIND_DUPLICATE_CHILD,
            (camp.id, tenant.organization_id, data.child_first_name, data.child_last_name, data.child_birth_date),
        )
        if cur.fetchone() is not None:
            raise DuplicateRegistrationError(camp.slug)

        cur.execute(
            _COUNT_ACTIVE_REGISTRATIONS,
            (camp.id, tenant.organization_id, list(CAPACITY_COUNTING_STATUSES)),
        )
        active_count = cur.fetchone()["active_count"]

        new_status = "registered" if active_count < locked["capacity"] else "waitlist"

        cur.execute(
            _INSERT_REGISTRATION,
            (
                tenant.organization_id,
                camp.id,
                new_status,
                data.parent_first_name,
                data.parent_last_name,
                str(data.parent_email),
                data.parent_phone,
                data.child_first_name,
                data.child_last_name,
                data.child_birth_date,
                data.emergency_contact_name,
                data.emergency_contact_phone,
                data.medical_notes,
                data.allergies,
                data.jersey_size,
                data.pickup_authorized,
                data.photo_permission,
                data.terms_accepted,
                data.privacy_accepted,
            ),
        )
        return cur.fetchone()


def _lock_and_promote_next_waitlisted(
    cur,
    tenant: TenantContext,
    camp_id: UUID,
) -> Optional[dict]:
    """
    Must be called with a cursor that is inside an already-open
    transaction. Locks the camp row (idempotent/reentrant if the caller
    already holds it earlier in the same transaction), and — only if
    capacity actually remains — promotes the single oldest ('created_at
    asc, id asc': FIFO) waitlisted registration for this exact
    (camp_id, organization_id) to 'registered'.

    Returns the promoted registration's public fields, or None if there
    was no free capacity or no one on the waitlist. Never touches a
    registration outside this camp_id/organization_id pair — see this
    module's docstring for the shared camp-lock invariant that makes this
    safe under concurrent promotion attempts.
    """
    cur.execute(_LOCK_CAMP_CAPACITY, (camp_id,))
    locked = cur.fetchone()
    if locked is None:
        return None

    cur.execute(
        _COUNT_ACTIVE_REGISTRATIONS,
        (camp_id, tenant.organization_id, list(CAPACITY_COUNTING_STATUSES)),
    )
    active_count = cur.fetchone()["active_count"]
    if active_count >= locked["capacity"]:
        return None

    cur.execute(_SELECT_OLDEST_WAITLISTED, (camp_id, tenant.organization_id))
    next_in_line = cur.fetchone()
    if next_in_line is None:
        return None

    cur.execute(_PROMOTE_TO_REGISTERED, (next_in_line["id"], tenant.organization_id))
    return cur.fetchone()


def promote_next_waitlisted_registration(tenant: TenantContext, camp_id: UUID) -> Optional[dict]:
    """
    Standalone entry point for future internal/admin use — not exposed via
    any HTTP endpoint in CP-S406. See _lock_and_promote_next_waitlisted for
    the actual algorithm; this just wraps it in its own transaction for
    callers that aren't already inside one (unlike
    cancel_registration_and_promote_next, which calls the same helper
    within its own transaction to keep cancel+promote atomic).
    """
    with db.get_cursor() as cur:
        return _lock_and_promote_next_waitlisted(cur, tenant, camp_id)


def cancel_registration_and_promote_next(tenant: TenantContext, registration_id: UUID) -> dict:
    """
    Standalone entry point for future internal/admin use — not exposed via
    any HTTP endpoint in CP-S406.

    Cancels one registration (strictly tenant-scoped: `WHERE id = %s AND
    organization_id = %s`, never a bare id lookup — a UUID is an
    identifier, not an authorization) and, only if that registration was
    previously counted against capacity (registered/confirmed), promotes
    the next waitlisted registration for the same camp in the same
    transaction. A registration that was already 'waitlist' is simply
    cancelled — nothing was freed, so nothing is promoted.

    Lock ordering: this function locks the REGISTRATION row first (`FOR
    UPDATE`), then the CAMP row (via _lock_and_promote_next_waitlisted).
    Every other capacity-affecting function here (create_registration,
    promote_next_waitlisted_registration) only ever locks the camp row — none
    of them lock a specific registration row first and then request the
    camp lock. That asymmetry is what makes this ordering deadlock-safe:
    a cycle requires two transactions each holding a lock the other one
    wants, and no other function in this module can end up holding a
    registration lock while waiting on this transaction's camp lock (they
    never take a registration lock at all). Two concurrent cancellations
    of *different* registrations on the same camp simply queue on the camp
    lock after each securing its own (non-conflicting) registration lock —
    not a deadlock, just serialization.

    The registration-row lock also closes a correctness gap, not just a
    deadlock one: without it, two concurrent cancel attempts on the *same*
    registration could both read status='registered' before either
    commits (Postgres read-committed snapshots don't block plain reads),
    and both would then (incorrectly) trigger a promotion. With the lock,
    the second transaction's read blocks until the first commits, then
    sees the now-'cancelled' status and raises InvalidStatusTransitionError
    via validate_transition("cancelled", "cancelled") — cleanly rejected,
    no double promotion.

    Raises RegistrationNotFoundError if no such registration exists for
    this tenant, or InvalidStatusTransitionError (from
    app.registration_lifecycle) if the registration's current status
    doesn't allow a transition to 'cancelled' — this includes an
    already-cancelled registration, which is rejected rather than treated
    as a harmless no-op (see registration_lifecycle.validate_transition).
    """
    with db.get_cursor() as cur:
        cur.execute(_LOAD_AND_LOCK_REGISTRATION, (registration_id, tenant.organization_id))
        registration = cur.fetchone()
        if registration is None:
            raise RegistrationNotFoundError(registration_id)

        current_status = registration["status"]
        validate_transition(current_status, "cancelled")

        cur.execute(_UPDATE_STATUS, ("cancelled", registration_id, tenant.organization_id))
        cancelled = cur.fetchone()

        promoted = None
        if current_status in CAPACITY_COUNTING_STATUSES:
            promoted = _lock_and_promote_next_waitlisted(cur, tenant, registration["camp_id"])

        return {"cancelled": cancelled, "promoted": promoted}
