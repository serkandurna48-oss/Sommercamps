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
from psycopg2.extras import Json

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
    active, source, match_key, extra, created_at, updated_at"""


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


def list_members(
    organization_id: UUID, *, active_only: bool = False,
    active: Optional[bool] = None, search: Optional[str] = None,
) -> list[dict]:
    """`active_only` kept for existing callers; `active` filters explicitly
    (True/False/None=all). `search` matches the normalised name key or the
    member number (substring, case-insensitive)."""
    if active is None and active_only:
        active = True
    pattern = None
    key_pattern = None
    if search and _normalize_part(search):
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        norm = _normalize_part(search).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        key_pattern = f"%{norm}%"
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_FIELDS} from organization_memberships
                where organization_id = %s
                  and (%s::boolean is null or active = %s::boolean)
                  and (%s::text is null
                       or replace(match_key, '|', ' ') like %s::text
                       or member_number ilike %s::text)
                order by last_name, first_name, birth_date""",
            (organization_id, active, active, pattern, key_pattern, pattern),
        )
        return cur.fetchall()


def set_member_active(organization_id: UUID, member_id: UUID, active: bool) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""update organization_memberships set active = %s
                where organization_id = %s and id = %s returning {_FIELDS}""",
            (active, organization_id, member_id),
        )
        return cur.fetchone()


def update_member(organization_id: UUID, member_id: UUID, *, active: Optional[bool] = None,
                  extra: Optional[dict[str, str]] = None) -> Optional[dict]:
    """Partial update: `active` and/or `extra` (replaces all extra fields; the
    caller validates labels and values)."""
    with db.get_cursor() as cur:
        cur.execute(
            f"""update organization_memberships
                   set active = coalesce(%s::boolean, active),
                       extra = coalesce(%s::jsonb, extra)
                where organization_id = %s and id = %s returning {_FIELDS}""",
            (active, Json(extra) if extra is not None else None, organization_id, member_id),
        )
        return cur.fetchone()


def import_members(organization_id: UUID, rows: list[dict]) -> dict:
    """Atomic bulk upsert in ONE transaction (any DB error rolls everything
    back). Rows are dicts with first_name, last_name, birth_date,
    member_number (may be None). Duplicates inside `rows` (same match_key +
    birth date) are merged, the later row winning; existing rows are
    updated (member_number if given, active=true), never duplicated. Optional
    `extra` ({label: value}) is merged into the stored extra fields: new values
    overwrite the same label, other labels stay."""
    merged: dict[tuple, dict] = {}
    for row in rows:
        key = (normalize_match_key(row["first_name"], row["last_name"]), row["birth_date"])
        previous = merged.get(key)
        if previous is not None:
            row = {**row, "extra": {**(previous.get("extra") or {}), **(row.get("extra") or {})}}
            if row.get("member_number") is None:
                row["member_number"] = previous.get("member_number")
        merged[key] = row
    created = updated = 0
    with db.get_cursor() as cur:
        for (match_key, birth_date), row in merged.items():
            cur.execute(
                """insert into organization_memberships
                    (organization_id, first_name, last_name, birth_date, member_number, source, match_key, extra)
                   values (%s, %s, %s, %s, %s, 'csv', %s, %s)
                   on conflict (organization_id, match_key, birth_date) do update
                     set member_number = coalesce(excluded.member_number, organization_memberships.member_number),
                         active = true,
                         extra = organization_memberships.extra || excluded.extra
                   returning (xmax = 0) as inserted""",
                (organization_id, row["first_name"].strip(), row["last_name"].strip(), birth_date,
                 row.get("member_number"), match_key, Json(row.get("extra") or {})),
            )
            if cur.fetchone()["inserted"]:
                created += 1
            else:
                updated += 1
    return {"rows": len(rows), "created": created, "updated": updated, "merged_in_file": len(rows) - len(merged)}


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
