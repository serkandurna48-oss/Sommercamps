"""
Registration write-flow — internal camp lookup, eligibility checks, and the
atomic capacity-safe insert.

Separate from app/repositories/camps.py on purpose: the public camps
repository deliberately never returns an internal `id` (see its docstring),
but the write-flow needs one to insert a `camp_registrations` row. This
module is that one narrowly-scoped exception, not a general-purpose "camps
with more fields" repository — see get_registration_target's docstring.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from .. import db
from ..schemas import RegistrationCreate
from ..tenancy import TenantContext
from ..utils import age_on_date, is_registration_open


class RegistrationRejectedError(Exception):
    """Base class for registration write-flow failures that map to a
    client-facing HTTP error in the router."""


class CampNotAvailableError(RegistrationRejectedError):
    """
    The camp doesn't exist, isn't published, or belongs to a different
    organization than the resolved tenant — maps to 404, identical to an
    unknown camp_slug on the public read API. Practically only raised by
    the locked re-check in create_registration(); get_registration_target()
    itself returns None for the same conditions rather than raising, since
    "not found yet" and "vanished mid-request" are different call sites.
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


class CampFullyBookedError(RegistrationRejectedError):
    """No capacity remaining for this camp — maps to 409."""


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

_COUNT_ACTIVE_REGISTRATIONS = """
    select count(*) as active_count
    from camp_registrations
    where camp_id = %s
      and organization_id = %s
      and status <> 'cancelled'
"""

_INSERT_REGISTRATION = """
    insert into camp_registrations (
        organization_id, camp_id,
        parent_first_name, parent_last_name, parent_email, parent_phone,
        child_first_name, child_last_name, child_birth_date,
        emergency_contact_name, emergency_contact_phone,
        medical_notes, allergies, photo_permission,
        terms_accepted, privacy_accepted
    ) values (
        %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s,
        %s, %s,
        %s, %s, %s,
        %s, %s
    )
    returning registration_token, status, payment_status
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
    The one place capacity is enforced. Runs entirely inside a single
    transaction (one borrowed connection via db.get_cursor):

    1. `SELECT capacity FROM camps WHERE id = %s FOR UPDATE` — locks this
       camp's row. A concurrent request for the *same* camp blocks here
       until this transaction commits or rolls back; requests for
       *different* camps are unaffected (no cross-camp contention).
    2. Count active (non-cancelled) registrations for this camp, inside
       the same transaction/lock.
    3. If capacity remains, INSERT and return the new row's public fields;
       otherwise raise CampFullyBookedError, which rolls back the
       transaction (see db.get_cursor) — no row is written.

    This prevents two concurrent requests from both reading "1 spot left"
    and both inserting: the second transaction's FOR UPDATE blocks until
    the first commits, then re-counts and sees the now-taken spot.

    `organization_id` comes from `tenant` (server-resolved), `camp_id`
    from `camp.id` (server-resolved via get_registration_target) — never
    from `data`, which has no such fields (see RegistrationCreate).
    """
    with db.get_cursor() as cur:
        cur.execute(_LOCK_CAMP_CAPACITY, (camp.id,))
        locked = cur.fetchone()
        if locked is None:
            raise CampNotAvailableError(f"Camp '{camp.slug}' no longer available")

        cur.execute(_COUNT_ACTIVE_REGISTRATIONS, (camp.id, tenant.organization_id))
        active_count = cur.fetchone()["active_count"]

        if active_count >= locked["capacity"]:
            raise CampFullyBookedError(f"Camp '{camp.slug}' is fully booked")

        cur.execute(
            _INSERT_REGISTRATION,
            (
                tenant.organization_id,
                camp.id,
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
                data.photo_permission,
                data.terms_accepted,
                data.privacy_accepted,
            ),
        )
        return cur.fetchone()
