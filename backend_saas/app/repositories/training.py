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
    if capacity is None:
        if offer["kind"] != "einzel":
            raise ValueError("capacity is required for group offers")
        capacity = 1
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
