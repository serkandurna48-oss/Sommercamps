"""
Organization memberships — backend-only lookup of club members, used to pick
the member price for training bookings. Every query filters by
organization_id; callers pass an already-resolved organization id.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Optional
from uuid import UUID

import psycopg2.errors

from .. import db

_HYPHENS = "-‐‑‒–—−"
_UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})
_SEPARATORS = re.compile(f"[\\s{re.escape(_HYPHENS)}]+")


def _normalize_part(value: str) -> str:
    text = unicodedata.normalize("NFC", value).strip().casefold()
    text = text.translate(_UMLAUTS)
    return _SEPARATORS.sub(" ", text).strip()


def normalize_match_key(first_name: str, last_name: str) -> str:
    """Normalised key 'first|last': trim, casefold, ae/oe/ue/ss, hyphen and
    whitespace runs -> single space. '|' keeps 'Anna Maria'+'Lee' distinct
    from 'Anna'+'Maria Lee'."""
    return f"{_normalize_part(first_name)}|{_normalize_part(last_name)}"


class MembershipConflictError(Exception):
    """Same normalised name and birth date already exists for this organization."""


_FIELDS = """id, organization_id, first_name, last_name, birth_date, member_number,
    active, source, match_key, created_at, updated_at"""


def create_member(
    organization_id: UUID,
    *,
    first_name: str,
    last_name: str,
    birth_date: date,
    member_number: Optional[str] = None,
    source: str = "manual",
) -> dict:
    with db.get_cursor() as cur:
        try:
            cur.execute(
                f"""insert into organization_memberships
                    (organization_id, first_name, last_name, birth_date, member_number, source, match_key)
                    values (%s, %s, %s, %s, %s, %s, %s) returning {_FIELDS}""",
                (organization_id, first_name.strip(), last_name.strip(), birth_date,
                 member_number, source, normalize_match_key(first_name, last_name)),
            )
        except psycopg2.errors.UniqueViolation as exc:
            raise MembershipConflictError(str(organization_id)) from exc
        return cur.fetchone()


def list_members(organization_id: UUID, *, active_only: bool = False) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_FIELDS} from organization_memberships
                where organization_id = %s and (not %s or active)
                order by last_name, first_name, birth_date""",
            (organization_id, active_only),
        )
        return cur.fetchall()


def deactivate_member(organization_id: UUID, member_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""update organization_memberships set active = false
                where organization_id = %s and id = %s returning {_FIELDS}""",
            (organization_id, member_id),
        )
        return cur.fetchone()


def find_active_member(
    organization_id: UUID, first_name: str, last_name: str, birth_date: date
) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_FIELDS} from organization_memberships
                where organization_id = %s and match_key = %s and birth_date = %s and active""",
            (organization_id, normalize_match_key(first_name, last_name), birth_date),
        )
        return cur.fetchone()
