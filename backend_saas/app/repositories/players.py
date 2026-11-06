"""
Player records (Spielerakte): players, internal training notes, goals and
measurements. Backend-only data about children (performance and mental notes):
every query filters by organization_id and, for child records, additionally by
player_id; callers pass an already-resolved organization id. Nothing here logs
or puts record content into exception messages.

Updates/deletes return None/False when the record is not found inside the given
organization and player (the API maps that to 404, never revealing foreign data).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Optional
from uuid import UUID

import psycopg2.errors

from .. import db
from .memberships import normalize_match_key

FOCUS_VALUES = ("technik", "athletik", "taktik", "mental", "video", "sonstiges")
GOAL_AREAS = FOCUS_VALUES
GOAL_STATUSES = ("offen", "erreicht", "verworfen")
# Standard metrics and their fixed units; any other metric name is a free metric
# that must come with its own unit.
STANDARD_METRICS = {
    "sprint_10m": "s",
    "sprint_30m": "s",
    "standweitsprung": "cm",
    "jonglieren": "Anzahl",
}

_MAX_BODY = 10000
_MAX_NEXT_STEPS = 4000
_MAX_VIDEO_URL = 2000
_MAX_TITLE = 200
_MAX_METRIC = 60
_MAX_UNIT = 20
_MAX_MEASUREMENT_NOTE = 1000


class PlayerValidationError(ValueError):
    """Invalid field value. The message names the field only, never the value."""

    def __init__(self, field: str, reason: str):
        super().__init__(f"{field}: {reason}")
        self.field = field
        self.reason = reason


class PlayerNotFoundError(Exception):
    """The player does not exist in this organization."""


class PlayerHasActiveRegistrationsError(Exception):
    """A registered, confirmed or waitlisted booking still references the player."""


class PlayerReferenceError(Exception):
    """A referenced record (e.g. camp) does not exist in this organization."""


# ---------- validation ----------

def _text(field: str, value: Any, *, max_len: int, required: bool) -> Optional[str]:
    if value is None:
        if required:
            raise PlayerValidationError(field, "required")
        return None
    if not isinstance(value, str):
        raise PlayerValidationError(field, "must be text")
    if "\x00" in value:
        raise PlayerValidationError(field, "invalid characters")
    value = value.strip()
    if not value:
        if required:
            raise PlayerValidationError(field, "must not be blank")
        return None
    if len(value) > max_len:
        raise PlayerValidationError(field, "too long")
    return value


def _focus(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)) or not all(isinstance(v, str) for v in value):
        raise PlayerValidationError("focus", "must be a list of values")
    if not set(value) <= set(FOCUS_VALUES):
        raise PlayerValidationError("focus", "unknown value")
    return list(dict.fromkeys(value))  # de-duplicate, keep order


def _rating(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
        raise PlayerValidationError("rating", "must be 1-5 or null")
    return value


def _video_url(value: Any) -> Optional[str]:
    url = _text("video_url", value, max_len=_MAX_VIDEO_URL, required=False)
    if url is None:
        return None
    if not url.startswith("https://") or len(url) == len("https://") or any(c.isspace() for c in url):
        raise PlayerValidationError("video_url", "must be an https link")
    return url


def _enum(field: str, value: Any, allowed: tuple[str, ...]) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise PlayerValidationError(field, "unknown value")
    return value


def _date(field: str, value: Any, *, required: bool) -> Optional[date]:
    if value is None and not required:
        return None
    if not isinstance(value, date) or hasattr(value, "hour"):
        raise PlayerValidationError(field, "must be a date")
    return value


def _number(value: Any) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal, str)):
        raise PlayerValidationError("value", "must be a number")
    try:
        number = Decimal(str(value).strip()) if isinstance(value, str) else Decimal(value)
    except (InvalidOperation, ValueError):
        raise PlayerValidationError("value", "must be a number") from None
    if not number.is_finite():
        raise PlayerValidationError("value", "must be finite")
    return number


def _metric_and_unit(metric: Any, unit: Any) -> tuple[str, str]:
    name = _text("metric", metric, max_len=_MAX_METRIC, required=True)
    given = _text("unit", unit, max_len=_MAX_UNIT, required=False)
    if name in STANDARD_METRICS:
        if given is not None and given != STANDARD_METRICS[name]:
            raise PlayerValidationError("unit", "does not match the standard metric")
        return name, STANDARD_METRICS[name]
    if given is None:
        raise PlayerValidationError("unit", "required for free metrics")
    return name, given


def _only(fields: dict, allowed: set[str]) -> None:
    unknown = set(fields) - allowed
    if unknown:
        raise PlayerValidationError(sorted(unknown)[0], "unknown field")


# ---------- players ----------

def find_or_create_player(cur, organization_id: UUID, first_name: str, last_name: str,
                          birth_date: date) -> UUID:
    """Find or create the player for (organization, normalised name, birth date) on an
    open cursor, i.e. inside the caller's transaction (used by registrations).

    `insert ... on conflict do nothing` + select: a concurrent insert of the same child
    waits for the other transaction, then the select (new statement snapshot) sees the
    committed row, so parallel bookings never fail and never create duplicates."""
    key = normalize_match_key(first_name, last_name)
    cur.execute(
        """insert into players (organization_id, first_name, last_name, birth_date, match_key)
           values (%s, %s, %s, %s, %s)
           on conflict (organization_id, match_key, birth_date) do nothing
           returning id""",
        (organization_id, first_name.strip(), last_name.strip(), birth_date, key),
    )
    row = cur.fetchone()
    if row is None:
        cur.execute(
            "select id from players where organization_id = %s and match_key = %s and birth_date = %s",
            (organization_id, key, birth_date),
        )
        row = cur.fetchone()
    return row["id"]


def link_unlinked_registrations() -> int:
    """Idempotent: creates players for registrations without player_id and links them
    (SQL function of the player_records migration). Returns the number of linked rows."""
    with db.get_cursor() as cur:
        cur.execute("select public.link_unlinked_registrations() as linked")
        return cur.fetchone()["linked"]


def find_or_create_player_id(organization_id: UUID, first_name: str, last_name: str,
                             birth_date: date) -> UUID:
    with db.get_cursor() as cur:
        return find_or_create_player(cur, organization_id, first_name, last_name, birth_date)


_PLAYER_FIELDS = "p.id, p.organization_id, p.first_name, p.last_name, p.birth_date, p.created_at, p.updated_at"
# Active club member with the same normalised name and birth date (same rule as the
# member price at booking). Org-filtered on both sides.
_IS_MEMBER = """exists (select 1 from organization_memberships m
                     where m.organization_id = p.organization_id and m.match_key = p.match_key
                       and m.birth_date = p.birth_date and m.active) as is_member"""


def list_players(organization_id: UUID) -> list[dict]:
    """Players with summary: age (years), last booking date (latest non-cancelled
    registration's camp/session start date), note count, open goal count. Search
    happens client-side."""
    params: list[Any] = [organization_id]
    where = "where p.organization_id = %s"
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_PLAYER_FIELDS}, {_IS_MEMBER},
                   date_part('year', age(current_date, p.birth_date))::int as age,
                   (select max(c.start_date) from camp_registrations r
                      join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
                     where r.player_id = p.id and r.organization_id = p.organization_id
                       and r.status <> 'cancelled') as last_booking_date,
                   (select count(*) from camp_registrations r
                     where r.player_id = p.id and r.organization_id = p.organization_id
                       and r.status <> 'cancelled')::int as booking_count,
                   (select count(*) from player_notes n
                     where n.player_id = p.id and n.organization_id = p.organization_id)::int as note_count,
                   (select count(*) from player_goals g
                     where g.player_id = p.id and g.organization_id = p.organization_id
                       and g.status = 'offen')::int as open_goal_count
                from players p {where}
                order by lower(p.last_name), lower(p.first_name), p.birth_date, p.id""",
            params,
        )
        return cur.fetchall()


def get_player(organization_id: UUID, player_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"""select {_PLAYER_FIELDS}, {_IS_MEMBER},
                   date_part('year', age(current_date, p.birth_date))::int as age
                from players p where p.id = %s and p.organization_id = %s""",
            (player_id, organization_id),
        )
        return cur.fetchone()


def list_player_bookings(organization_id: UUID, player_id: UUID) -> list[dict]:
    """Bookings of a player (newest first). No tokens, no parent data."""
    with db.get_cursor() as cur:
        cur.execute(
            """select r.id as registration_id, r.status, r.payment_status, r.documentation_consent, r.created_at,
                      c.id as camp_id, c.title as camp_title, c.start_date, c.end_date,
                      c.offer_id, c.starts_at, o.title as offer_title
               from camp_registrations r
               join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
               left join training_offers o on o.id = c.offer_id and o.organization_id = c.organization_id
               where r.player_id = %s and r.organization_id = %s
               order by c.start_date desc, r.created_at desc""",
            (player_id, organization_id),
        )
        return cur.fetchall()


def _require_player(cur, organization_id: UUID, player_id: UUID) -> None:
    cur.execute("select 1 from players where id = %s and organization_id = %s", (player_id, organization_id))
    if cur.fetchone() is None:
        raise PlayerNotFoundError("player not found")


def _insert(table: str, organization_id: UUID, player_id: UUID, values: dict) -> dict:
    cols = list(values)
    with db.get_cursor() as cur:
        _require_player(cur, organization_id, player_id)
        try:
            cur.execute(
                f"insert into {table} (organization_id, player_id, {', '.join(cols)}) "
                f"values (%s, %s, {', '.join(['%s'] * len(cols))}) returning *",
                (organization_id, player_id, *values.values()),
            )
        except psycopg2.errors.ForeignKeyViolation as exc:
            raise PlayerReferenceError("referenced record not found") from exc
        return cur.fetchone()


def _update(table: str, organization_id: UUID, player_id: UUID, record_id: UUID, values: dict) -> Optional[dict]:
    with db.get_cursor() as cur:
        if not values:
            cur.execute(f"select * from {table} where id = %s and organization_id = %s and player_id = %s",
                        (record_id, organization_id, player_id))
            return cur.fetchone()
        sets = ", ".join(f"{col} = %s" for col in values)  # column names come from whitelists only
        try:
            cur.execute(
                f"update {table} set {sets} where id = %s and organization_id = %s and player_id = %s returning *",
                (*values.values(), record_id, organization_id, player_id),
            )
        except psycopg2.errors.ForeignKeyViolation as exc:
            raise PlayerReferenceError("referenced record not found") from exc
        return cur.fetchone()


def _get(table: str, organization_id: UUID, player_id: UUID, record_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(f"select * from {table} where id = %s and organization_id = %s and player_id = %s",
                    (record_id, organization_id, player_id))
        return cur.fetchone()


def _delete(table: str, organization_id: UUID, player_id: UUID, record_id: UUID) -> bool:
    with db.get_cursor() as cur:
        cur.execute(f"delete from {table} where id = %s and organization_id = %s and player_id = %s",
                    (record_id, organization_id, player_id))
        return cur.rowcount > 0


# ---------- notes ----------

_NOTE_FIELDS = {"camp_id", "note_date", "focus", "body", "rating", "next_steps", "video_url"}


def _note_values(fields: dict, *, creating: bool) -> dict:
    _only(fields, _NOTE_FIELDS)
    out: dict = {}
    if creating or "note_date" in fields:
        out["note_date"] = _date("note_date", fields.get("note_date"), required=True)
    if creating or "body" in fields:
        out["body"] = _text("body", fields.get("body"), max_len=_MAX_BODY, required=True)
    if creating or "focus" in fields:
        out["focus"] = _focus(fields.get("focus"))
    if "rating" in fields:
        out["rating"] = _rating(fields["rating"])
    if "next_steps" in fields:
        out["next_steps"] = _text("next_steps", fields["next_steps"], max_len=_MAX_NEXT_STEPS, required=False)
    if "video_url" in fields:
        out["video_url"] = _video_url(fields["video_url"])
    if "camp_id" in fields:
        out["camp_id"] = fields["camp_id"]
    return out


def list_notes(organization_id: UUID, player_id: UUID) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            """select * from player_notes where organization_id = %s and player_id = %s
               order by note_date desc, created_at desc, id""",
            (organization_id, player_id),
        )
        return cur.fetchall()


def get_note(organization_id: UUID, player_id: UUID, note_id: UUID) -> Optional[dict]:
    return _get("player_notes", organization_id, player_id, note_id)


def create_note(organization_id: UUID, player_id: UUID, **fields) -> dict:
    return _insert("player_notes", organization_id, player_id, _note_values(fields, creating=True))


def update_note(organization_id: UUID, player_id: UUID, note_id: UUID, **fields) -> Optional[dict]:
    return _update("player_notes", organization_id, player_id, note_id, _note_values(fields, creating=False))


def delete_note(organization_id: UUID, player_id: UUID, note_id: UUID) -> bool:
    return _delete("player_notes", organization_id, player_id, note_id)


# ---------- goals ----------

_GOAL_FIELDS = {"title", "area", "status", "target_date"}


def _goal_values(fields: dict, *, creating: bool) -> dict:
    _only(fields, _GOAL_FIELDS)
    out: dict = {}
    if creating or "title" in fields:
        out["title"] = _text("title", fields.get("title"), max_len=_MAX_TITLE, required=True)
    if creating or "area" in fields:
        out["area"] = _enum("area", fields.get("area"), GOAL_AREAS)
    if "status" in fields:
        out["status"] = _enum("status", fields["status"], GOAL_STATUSES)
    if "target_date" in fields:
        out["target_date"] = _date("target_date", fields["target_date"], required=False)
    return out


def list_goals(organization_id: UUID, player_id: UUID, *, status: Optional[str] = None) -> list[dict]:
    if status is not None:
        _enum("status", status, GOAL_STATUSES)
    with db.get_cursor() as cur:
        cur.execute(
            """select * from player_goals where organization_id = %s and player_id = %s
               and (%s::text is null or status = %s)
               order by (status = 'offen') desc, target_date nulls last, created_at, id""",
            (organization_id, player_id, status, status),
        )
        return cur.fetchall()


def get_goal(organization_id: UUID, player_id: UUID, goal_id: UUID) -> Optional[dict]:
    return _get("player_goals", organization_id, player_id, goal_id)


def create_goal(organization_id: UUID, player_id: UUID, **fields) -> dict:
    return _insert("player_goals", organization_id, player_id, _goal_values(fields, creating=True))


def update_goal(organization_id: UUID, player_id: UUID, goal_id: UUID, **fields) -> Optional[dict]:
    return _update("player_goals", organization_id, player_id, goal_id, _goal_values(fields, creating=False))


def delete_goal(organization_id: UUID, player_id: UUID, goal_id: UUID) -> bool:
    return _delete("player_goals", organization_id, player_id, goal_id)


# ---------- measurements ----------

_MEASUREMENT_FIELDS = {"measured_on", "metric", "value", "unit", "note"}


def _measurement_values(fields: dict, *, creating: bool) -> dict:
    _only(fields, _MEASUREMENT_FIELDS)
    out: dict = {}
    if creating or "measured_on" in fields:
        out["measured_on"] = _date("measured_on", fields.get("measured_on"), required=True)
    if creating or "value" in fields:
        out["value"] = _number(fields.get("value"))
    if creating or "metric" in fields or "unit" in fields:
        out["metric"], out["unit"] = _metric_and_unit(fields.get("metric"), fields.get("unit"))
    if "note" in fields:
        out["note"] = _text("note", fields["note"], max_len=_MAX_MEASUREMENT_NOTE, required=False)
    return out


def list_measurements(organization_id: UUID, player_id: UUID, *, metric: Optional[str] = None) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            """select * from player_measurements where organization_id = %s and player_id = %s
               and (%s::text is null or metric = %s)
               order by measured_on desc, created_at desc, id""",
            (organization_id, player_id, metric, metric),
        )
        return cur.fetchall()


def get_measurement(organization_id: UUID, player_id: UUID, measurement_id: UUID) -> Optional[dict]:
    return _get("player_measurements", organization_id, player_id, measurement_id)


def create_measurement(organization_id: UUID, player_id: UUID, **fields) -> dict:
    return _insert("player_measurements", organization_id, player_id,
                   _measurement_values(fields, creating=True))


def update_measurement(organization_id: UUID, player_id: UUID, measurement_id: UUID, **fields) -> Optional[dict]:
    """Changing `metric` or `unit` re-validates the pair; send both when changing the metric."""
    return _update("player_measurements", organization_id, player_id, measurement_id,
                   _measurement_values(fields, creating=False))


def delete_measurement(organization_id: UUID, player_id: UUID, measurement_id: UUID) -> bool:
    return _delete("player_measurements", organization_id, player_id, measurement_id)


def delete_player(organization_id: UUID, player_id: UUID) -> dict:
    """
    Deletes the whole player record: notes, goals, measurements and the player
    row, in one transaction scoped by organization. Refused while an active
    (registered, confirmed or waitlisted) registration references the player.
    Cancelled registrations are unlinked (player_id = null) and anonymized in
    the same transaction: child name -> "Gelöscht", birth date -> the booking
    date (the column is NOT NULL with a plausibility CHECK of today minus 100
    years .. today; the booking date stays inside it for any later update, a
    fixed "today minus 99 years" would fall out after a year), allergies,
    medical notes, jersey size, pickup list, emergency contact and extra
    answers -> NULL / {}, anonymized_at -> now (the linker and the player
    matching skip such rows). Payment, status and parent contact fields stay
    for the books. Invoices are not touched: their snapshot and PDF keep the
    child's name as issued (retention duty, GoBD). Returns record counts only.

    Lock order matches the registration delete: registration rows first, then
    the player row.
    """
    with db.get_cursor() as cur:
        cur.execute("select id from camp_registrations where player_id = %s and organization_id = %s order by id for update",
                    (player_id, organization_id))
        cur.execute("select 1 from players where id = %s and organization_id = %s for update",
                    (player_id, organization_id))
        if cur.fetchone() is None:
            raise PlayerNotFoundError("player not found")
        cur.execute(
            "select 1 from camp_registrations where player_id = %s and organization_id = %s"
            " and status in ('registered', 'confirmed', 'waitlist') limit 1",
            (player_id, organization_id),
        )
        if cur.fetchone() is not None:
            raise PlayerHasActiveRegistrationsError()
        counts = {}
        for table, key in (("player_notes", "notes"), ("player_goals", "goals"), ("player_measurements", "measurements")):
            cur.execute(f"delete from {table} where player_id = %s and organization_id = %s", (player_id, organization_id))
            counts[key] = cur.rowcount
        cur.execute(
            """update camp_registrations
               set child_first_name = 'Gelöscht', child_last_name = 'Gelöscht',
                   child_birth_date = created_at::date,
                   allergies = null, medical_notes = null, jersey_size = null, pickup_authorized = null,
                   emergency_contact_name = null, emergency_contact_phone = null,
                   extra_answers = '{}'::jsonb, player_id = null,
                   anonymized_at = coalesce(anonymized_at, now())
               where player_id = %s and organization_id = %s""",
            (player_id, organization_id),
        )
        counts["anonymized_bookings"] = cur.rowcount
        cur.execute("delete from players where id = %s and organization_id = %s", (player_id, organization_id))
        return counts
