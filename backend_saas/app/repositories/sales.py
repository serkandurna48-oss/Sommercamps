"""
Sales CRM repository (feat/vertrieb-crm): sales_members, sales_leads,
sales_activities. See supabase/migrations/20261119140000_sales_crm.sql.

Access rule enforced in every lead query here, not only in the router:
`scope_user_id` set means "this caller is a sales_rep" and every read or
write is additionally filtered by owner_user_id = scope_user_id. A rep can
therefore never read or change another rep's lead, even with a guessed id —
the row simply is not found. Managers (sales_lead, platform_owner) pass
scope_user_id=None.

These tables never join organizations/camps/camp_registrations: a sales
account must not be able to reach club or child data through this module.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from .. import db

LEAD_COLUMNS = (
    "id, name, kind, city, website, contact_name, phone, email, fit, source_url, status, "
    "owner_user_id::text as owner_user_id, next_action_at, created_at, updated_at"
)
EDITABLE_FIELDS = ("name", "kind", "city", "website", "contact_name", "phone", "email", "fit", "source_url", "status", "next_action_at")
OPEN_STATUSES = ("neu", "kontaktiert", "gespraech", "demo", "angebot")


def _prefixed(alias: str) -> str:
    return ", ".join(f"{alias}.{column}" for column in LEAD_COLUMNS.split(", "))


class SalesMemberNotFoundError(Exception):
    """Assignment target is not an active sales member."""


# --- members -----------------------------------------------------------------


def get_active_role(user_id: str) -> Optional[str]:
    with db.get_read_cursor() as cur:
        cur.execute("select role from sales_members where user_id = %s and active", (user_id,))
        row = cur.fetchone()
    return row["role"] if row else None


def get_active_role_for_login(user_id: str) -> Optional[str]:
    """Login routing only (/admin/me): never fails the caller. If the sales
    tables are missing (backend deployed before the migration) or the
    lookup errors, club and platform logins must keep working — the user
    simply gets no sales routing."""
    import logging

    try:
        return get_active_role(user_id)
    except Exception as exc:  # noqa: BLE001 - see docstring
        logging.getLogger(__name__).warning("Sales role lookup failed (error_type=%s)", type(exc).__name__)
        return None


def list_members() -> list[dict]:
    with db.get_read_cursor() as cur:
        cur.execute(
            "select user_id::text as user_id, role, display_name, active, created_at "
            "from sales_members order by active desc, display_name asc"
        )
        return cur.fetchall()


def upsert_member(*, user_id: str, role: str, display_name: str) -> dict:
    with db.get_cursor() as cur:
        cur.execute(
            """
            insert into sales_members (user_id, role, display_name, active)
            values (%s, %s, %s, true)
            on conflict (user_id) do update
                set role = excluded.role, display_name = excluded.display_name, active = true
            returning user_id::text as user_id, role, display_name, active, created_at
            """,
            (user_id, role, display_name),
        )
        return cur.fetchone()


def update_member(user_id: str, changes: dict) -> Optional[dict]:
    allowed = {k: v for k, v in changes.items() if k in ("role", "display_name", "active")}
    if not allowed:
        with db.get_read_cursor() as cur:
            cur.execute(
                "select user_id::text as user_id, role, display_name, active, created_at "
                "from sales_members where user_id = %s",
                (user_id,),
            )
            return cur.fetchone()
    assignments = ", ".join(f"{column} = %s" for column in allowed)
    with db.get_cursor() as cur:
        cur.execute(
            f"update sales_members set {assignments} where user_id = %s "
            "returning user_id::text as user_id, role, display_name, active, created_at",
            (*allowed.values(), user_id),
        )
        return cur.fetchone()


# --- leads -------------------------------------------------------------------


def list_leads(
    *,
    scope_user_id: Optional[str],
    owner_filter: Optional[str] = None,
    unassigned_only: bool = False,
    status: Optional[str] = None,
    open_only: bool = False,
    limit: int = 500,
) -> list[dict]:
    """Ordered by next action (overdue first), then newest. `owner_filter`
    and `unassigned_only` are ignored for a rep: scope_user_id wins."""
    clauses: list[str] = []
    params: list = []
    if scope_user_id is not None:
        clauses.append("l.owner_user_id = %s")
        params.append(scope_user_id)
    elif unassigned_only:
        clauses.append("l.owner_user_id is null")
    elif owner_filter is not None:
        clauses.append("l.owner_user_id = %s")
        params.append(owner_filter)
    if status is not None:
        clauses.append("l.status = %s")
        params.append(status)
    if open_only:
        clauses.append("l.status = any(%s)")
        params.append(list(OPEN_STATUSES))
    where = f"where {' and '.join(clauses)}" if clauses else ""
    with db.get_read_cursor() as cur:
        cur.execute(
            f"""
            select {_prefixed('l')}, m.display_name as owner_name
            from sales_leads l
            left join sales_members m on m.user_id = l.owner_user_id
            {where}
            order by l.next_action_at asc nulls last, l.created_at desc
            limit %s
            """,
            (*params, limit),
        )
        return cur.fetchall()


def get_lead(lead_id: str, *, scope_user_id: Optional[str]) -> Optional[dict]:
    with db.get_read_cursor() as cur:
        if scope_user_id is not None:
            cur.execute(
                f"select {LEAD_COLUMNS} from sales_leads where id = %s and owner_user_id = %s",
                (lead_id, scope_user_id),
            )
        else:
            cur.execute(f"select {LEAD_COLUMNS} from sales_leads where id = %s", (lead_id,))
        return cur.fetchone()


def list_activities(lead_id: str) -> list[dict]:
    with db.get_read_cursor() as cur:
        cur.execute(
            """
            select a.id, a.kind, a.body, a.created_at, a.actor_user_id::text as actor_user_id,
                   m.display_name as actor_name
            from sales_activities a
            left join sales_members m on m.user_id = a.actor_user_id
            where a.lead_id = %s
            order by a.created_at desc, a.id
            limit 200
            """,
            (lead_id,),
        )
        return cur.fetchall()


def _activity(cur, lead_id, actor_user_id, kind, body) -> None:
    cur.execute(
        "insert into sales_activities (lead_id, actor_user_id, kind, body) values (%s, %s, %s, %s)",
        (lead_id, actor_user_id, kind, body),
    )


def _require_active_member(cur, user_id: str) -> str:
    cur.execute("select display_name from sales_members where user_id = %s and active", (user_id,))
    row = cur.fetchone()
    if row is None:
        raise SalesMemberNotFoundError()
    return row["display_name"]


def create_lead(*, data: dict, owner_user_id: Optional[str], actor_user_id: str, note: Optional[str]) -> dict:
    fields = {k: data.get(k) for k in EDITABLE_FIELDS if k not in ("status", "next_action_at") and data.get(k) is not None}
    with db.get_cursor() as cur:
        if owner_user_id is not None:
            _require_active_member(cur, owner_user_id)
        columns = [*fields.keys(), "owner_user_id", "created_by"]
        values = [*fields.values(), owner_user_id, actor_user_id]
        if data.get("next_action_at") is not None:
            columns.append("next_action_at")
            values.append(data["next_action_at"])
        cur.execute(
            f"insert into sales_leads ({', '.join(columns)}) values ({', '.join(['%s'] * len(values))}) "
            f"returning {LEAD_COLUMNS}",
            values,
        )
        lead = cur.fetchone()
        _activity(cur, lead["id"], actor_user_id, "angelegt", note)
        return lead


def update_lead(
    lead_id: str, *, changes: dict, note: Optional[str], scope_user_id: Optional[str], actor_user_id: str
) -> Optional[dict]:
    """Returns None when the lead is not visible to the caller. Status
    changes and notes are appended to the activity log in the same
    transaction. Ownership is never changed here (see assign_lead)."""
    changes = {k: v for k, v in changes.items() if k in EDITABLE_FIELDS}
    with db.get_cursor() as cur:
        if scope_user_id is not None:
            cur.execute(
                "select id, status from sales_leads where id = %s and owner_user_id = %s for update",
                (lead_id, scope_user_id),
            )
        else:
            cur.execute("select id, status from sales_leads where id = %s for update", (lead_id,))
        current = cur.fetchone()
        if current is None:
            return None
        if changes:
            assignments = ", ".join(f"{column} = %s" for column in changes)
            cur.execute(
                f"update sales_leads set {assignments}, updated_at = now() where id = %s",
                (*changes.values(), lead_id),
            )
        if "status" in changes and changes["status"] != current["status"]:
            _activity(cur, lead_id, actor_user_id, "status", f"{current['status']} → {changes['status']}")
        if note:
            _activity(cur, lead_id, actor_user_id, "notiz", note)
        cur.execute(f"select {LEAD_COLUMNS} from sales_leads where id = %s", (lead_id,))
        return cur.fetchone()


def assign_lead(lead_id: str, *, owner_user_id: Optional[str], actor_user_id: str) -> Optional[dict]:
    """Managers only (checked by the router). None = lead not found;
    SalesMemberNotFoundError = target is no active sales member."""
    with db.get_cursor() as cur:
        cur.execute("select id, owner_user_id from sales_leads where id = %s for update", (lead_id,))
        current = cur.fetchone()
        if current is None:
            return None
        name = _require_active_member(cur, owner_user_id) if owner_user_id is not None else None
        cur.execute(
            "update sales_leads set owner_user_id = %s, updated_at = now() where id = %s",
            (owner_user_id, lead_id),
        )
        _activity(cur, lead_id, actor_user_id, "zuweisung", f"zugewiesen an {name}" if name else "Zuweisung aufgehoben")
        cur.execute(f"select {LEAD_COLUMNS} from sales_leads where id = %s", (lead_id,))
        return cur.fetchone()


def team_overview(today: date) -> dict:
    """Per member: lead counts per status, open, overdue next actions and
    last activity; plus unassigned open leads. One query each."""
    with db.get_read_cursor() as cur:
        cur.execute(
            """
            select m.user_id::text as user_id, m.display_name, m.role, m.active,
                   count(l.id) as total,
                   count(l.id) filter (where l.status = any(%s)) as open,
                   count(l.id) filter (where l.status = 'gewonnen') as won,
                   count(l.id) filter (where l.status = any(%s) and l.next_action_at < %s) as overdue,
                   (select max(a.created_at) from sales_activities a where a.actor_user_id = m.user_id) as last_activity_at
            from sales_members m
            left join sales_leads l on l.owner_user_id = m.user_id
            group by m.user_id, m.display_name, m.role, m.active
            order by m.active desc, m.display_name asc
            """,
            (list(OPEN_STATUSES), list(OPEN_STATUSES), today),
        )
        members = cur.fetchall()
        cur.execute(
            "select status, owner_user_id::text as owner_user_id, count(*) as n from sales_leads group by status, owner_user_id"
        )
        rows = cur.fetchall()
    by_member: dict[str, dict[str, int]] = {}
    funnel: dict[str, int] = {}
    unassigned_open = 0
    for row in rows:
        funnel[row["status"]] = funnel.get(row["status"], 0) + int(row["n"])
        if row["owner_user_id"] is None:
            if row["status"] in OPEN_STATUSES:
                unassigned_open += int(row["n"])
        else:
            by_member.setdefault(row["owner_user_id"], {})[row["status"]] = int(row["n"])
    for member in members:
        member["by_status"] = by_member.get(member["user_id"], {})
        for key in ("total", "open", "won", "overdue"):
            member[key] = int(member[key])
    return {"members": members, "funnel": funnel, "unassigned_open": unassigned_open}


def existing_lead_keys() -> set[tuple[str, str]]:
    with db.get_read_cursor() as cur:
        cur.execute("select lower(name) as name, lower(coalesce(city, '')) as city from sales_leads")
        return {(row["name"], row["city"]) for row in cur.fetchall()}


def import_leads(rows: list[dict], *, actor_user_id: str) -> int:
    """Inserts unassigned leads in one transaction (all or nothing)."""
    if not rows:
        return 0
    with db.get_cursor() as cur:
        for row in rows:
            note = row.pop("note", None)
            fields = {k: v for k, v in row.items() if k in EDITABLE_FIELDS and v is not None}
            columns = [*fields.keys(), "created_by"]
            values = [*fields.values(), actor_user_id]
            cur.execute(
                f"insert into sales_leads ({', '.join(columns)}) values ({', '.join(['%s'] * len(values))}) returning id",
                values,
            )
            _activity(cur, cur.fetchone()["id"], actor_user_id, "angelegt", note or "CSV-Import")
    return len(rows)
