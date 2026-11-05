"""
Training offers and sessions. A session is a `camps` row with offer_id set
(starts_at/ends_at timestamptz; start_date/end_date derived in Europe/Berlin).
Every query filters by organization_id; callers pass an already-resolved id.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

import psycopg2.errors

from .. import db
from ..registration_lifecycle import CAPACITY_COUNTING_STATUSES
from .camps import CampSlugConflictError

BERLIN = ZoneInfo("Europe/Berlin")


class TrainingOfferSlugConflictError(Exception):
    """An offer with this slug already exists under this organization."""


class TrainingOfferNotFoundError(Exception):
    """No such offer under this organization."""


_OFFER_FIELDS = """id, organization_id, slug, title, kind, description, duration_minutes,
    location, price_member_cents, price_nonmember_cents, status, created_at, updated_at"""

# Column names interpolated into UPDATE come only from this fixed set.
_UPDATABLE = {
    "title", "kind", "description", "duration_minutes", "location",
    "price_member_cents", "price_nonmember_cents", "status",
}


def create_offer(
    organization_id: UUID,
    *,
    slug: str,
    title: str,
    kind: str,
    duration_minutes: int,
    price_member_cents: int,
    price_nonmember_cents: int,
    description: Optional[str] = None,
    location: Optional[str] = None,
    status: str = "draft",
) -> dict:
    with db.get_cursor() as cur:
        try:
            cur.execute(
                f"""insert into training_offers
                    (organization_id, slug, title, kind, description, duration_minutes,
                     location, price_member_cents, price_nonmember_cents, status)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    returning {_OFFER_FIELDS}""",
                (organization_id, slug, title, kind, description, duration_minutes,
                 location, price_member_cents, price_nonmember_cents, status),
            )
        except psycopg2.errors.UniqueViolation as exc:
            raise TrainingOfferSlugConflictError(slug) from exc
        return cur.fetchone()


def get_offer(organization_id: UUID, offer_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"select {_OFFER_FIELDS} from training_offers where organization_id = %s and id = %s",
            (organization_id, offer_id),
        )
        return cur.fetchone()


def get_offer_by_slug(organization_id: UUID, slug: str) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"select {_OFFER_FIELDS} from training_offers where organization_id = %s and slug = %s",
            (organization_id, slug),
        )
        return cur.fetchone()


def list_offers(organization_id: UUID, *, status: Optional[str] = None) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_OFFER_FIELDS} from training_offers
                where organization_id = %s and (%s::text is null or status = %s)
                order by title, slug""",
            (organization_id, status, status),
        )
        return cur.fetchall()


def update_offer(organization_id: UUID, offer_id: UUID, **fields) -> Optional[dict]:
    unknown = set(fields) - _UPDATABLE
    if unknown:
        raise ValueError(f"Not updatable: {sorted(unknown)}")
    if not fields:
        return get_offer(organization_id, offer_id)
    set_clause = ", ".join(f"{column} = %s" for column in fields)
    with db.get_cursor() as cur:
        cur.execute(
            f"""update training_offers set {set_clause}
                where organization_id = %s and id = %s returning {_OFFER_FIELDS}""",
            (*fields.values(), organization_id, offer_id),
        )
        return cur.fetchone()


_SESSION_FIELDS = """id, organization_id, offer_id, slug, title, start_date, end_date,
    starts_at, ends_at, age_min, age_max, capacity, price_cents, price_member_cents,
    currency, location, status"""


def create_session(
    organization_id: UUID,
    offer_id: UUID,
    starts_at: datetime,
    *,
    capacity: Optional[int] = None,
    age_min: int = 4,
    age_max: int = 18,
    status: str = "draft",
) -> dict:
    """Create one training session (a camps row) from an offer.

    Prices are copied from the offer and frozen on the session: nonmember
    price -> price_cents, member price -> price_member_cents. start_date and end_date both come from
    starts_at in Europe/Berlin (a session spanning midnight stays one day). Capacity
    defaults to 1 for 'einzel'; 'gruppe' offers need an explicit capacity.
    """
    if starts_at.tzinfo is None:
        raise ValueError("starts_at must be timezone-aware")
    offer = get_offer(organization_id, offer_id)
    if offer is None:
        raise TrainingOfferNotFoundError(str(offer_id))
    if offer["kind"] == "einzel":
        if capacity not in (None, 1):
            raise ValueError("single-training offers have capacity 1")
        capacity = 1
    elif capacity is None:
        raise ValueError("capacity is required for group offers")
    ends_at = starts_at + timedelta(minutes=offer["duration_minutes"])
    local_start = starts_at.astimezone(BERLIN)
    slug = f"{offer['slug']}-{local_start:%Y%m%d-%H%M}"
    with db.get_cursor() as cur:
        try:
            cur.execute(
                f"""insert into camps
                    (organization_id, offer_id, slug, title, start_date, end_date, starts_at, ends_at,
                     age_min, age_max, capacity, price_cents, price_member_cents, location, status)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    returning {_SESSION_FIELDS}""",
                (organization_id, offer_id, slug, offer["title"], local_start.date(),
                 local_start.date(), starts_at, ends_at, age_min, age_max, capacity,
                 offer["price_nonmember_cents"], offer["price_member_cents"],
                 offer["location"], status),
            )
        except psycopg2.errors.UniqueViolation as exc:
            raise CampSlugConflictError(organization_id, slug) from exc
        return cur.fetchone()


def list_sessions(organization_id: UUID, offer_id: UUID) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_SESSION_FIELDS} from camps
                where organization_id = %s and offer_id = %s
                order by starts_at asc, slug asc""",
            (organization_id, offer_id),
        )
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Task 4: admin/public read models and guarded delete/cancel
# ---------------------------------------------------------------------------

_COUNTING = sorted(CAPACITY_COUNTING_STATUSES)

_SESSION_WITH_COUNT = """
    select c.id, c.organization_id, c.offer_id, c.slug, c.status, c.starts_at, c.ends_at,
           c.capacity, c.price_cents, c.price_member_cents, c.age_min, c.age_max, c.location,
           (select count(*) from camp_registrations r
             where r.camp_id = c.id and r.organization_id = c.organization_id
               and r.status = any(%s)) as booked_count
    from camps c
"""


class SessionNotFoundError(Exception):
    """No such session under this organization and offer."""


class SessionHasRegistrationsError(Exception):
    """Session cannot be removed/cancelled because of registrations."""

    def __init__(self, active: bool):
        self.active = active
        super().__init__("active registrations" if active else "registration history")


def get_session_with_count(organization_id: UUID, offer_id: UUID, session_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            _SESSION_WITH_COUNT + " where c.organization_id = %s and c.offer_id = %s and c.id = %s",
            (_COUNTING, organization_id, offer_id, session_id),
        )
        return cur.fetchone()


def list_sessions_with_counts(organization_id: UUID, offer_id: UUID) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            _SESSION_WITH_COUNT
            + " where c.organization_id = %s and c.offer_id = %s order by c.starts_at asc, c.slug asc",
            (_COUNTING, organization_id, offer_id),
        )
        return cur.fetchall()


def list_public_sessions(organization_id: UUID, offer_id: UUID) -> list[dict]:
    """Published, future sessions of an offer with booked counts (no participant data)."""
    with db.get_cursor() as cur:
        cur.execute(
            _SESSION_WITH_COUNT
            + """ where c.organization_id = %s and c.offer_id = %s
                    and c.status = 'published' and c.starts_at > now()
                  order by c.starts_at asc, c.slug asc""",
            (_COUNTING, organization_id, offer_id),
        )
        return cur.fetchall()


def _lock_session_and_count(cur, organization_id: UUID, offer_id: UUID, session_id: UUID) -> tuple[dict, int, int]:
    # Same lock the booking transaction takes (camps row FOR UPDATE), so a
    # concurrent booking and this delete/cancel are serialized.
    cur.execute(
        "select id, slug from camps where organization_id = %s and offer_id = %s and id = %s for update",
        (organization_id, offer_id, session_id),
    )
    row = cur.fetchone()
    if row is None:
        raise SessionNotFoundError(str(session_id))
    cur.execute(
        """select count(*) filter (where status = any(%s)) as active, count(*) as total
           from camp_registrations where organization_id = %s and camp_id = %s""",
        (_COUNTING, organization_id, session_id),
    )
    counts = cur.fetchone()
    return row, counts["active"], counts["total"]


def delete_session(organization_id: UUID, offer_id: UUID, session_id: UUID) -> None:
    """Hard delete; only when the session never had any registration (child data is kept)."""
    with db.get_cursor() as cur:
        _, active, total = _lock_session_and_count(cur, organization_id, offer_id, session_id)
        if total:
            raise SessionHasRegistrationsError(active > 0)
        cur.execute("delete from camps where organization_id = %s and id = %s", (organization_id, session_id))


def cancel_session(organization_id: UUID, offer_id: UUID, session_id: UUID) -> None:
    """Soft cancel (status archived): not public, not bookable. Blocked by active registrations."""
    with db.get_cursor() as cur:
        _, active, _ = _lock_session_and_count(cur, organization_id, offer_id, session_id)
        if active:
            raise SessionHasRegistrationsError(True)
        cur.execute(
            "update camps set status = 'archived' where organization_id = %s and id = %s",
            (organization_id, session_id),
        )
