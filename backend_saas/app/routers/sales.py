"""
Sales CRM API (/sales, feat/vertrieb-crm).

Three levels, all resolved server-side on every request:
- sales_rep: only leads with owner_user_id = self (enforced in the
  repository queries via scope_user_id, so a guessed lead id is a 404).
- sales_lead: every lead, the team overview, (re)assignment.
- platform_owner: everything above plus managing sales accounts and the
  CSV import.

A sales role never grants club or platform access: these routes touch only
sales_* tables, and app/auth_deps.py's require_platform_owner /
require_org_access ignore sales_members entirely.
"""

from __future__ import annotations

import logging
import secrets
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from .. import supabase_auth
from ..auth_deps import AuthContext, get_auth_context, require_platform_owner
from ..config import get_settings
from ..notifications import sending as notifications_sending
from ..repositories import platform_roles
from ..repositories import sales as sales_repo
from ..sales_import import parse_leads_csv
from ..sales_schemas import (
    ActivityOut,
    LeadAssign,
    LeadCreate,
    LeadDetailOut,
    LeadImportOut,
    LeadImportRequest,
    LeadOut,
    LeadStatus,
    LeadUpdate,
    SalesMemberCreate,
    SalesMemberOut,
    SalesMemberUpdate,
    SalesMeOut,
    TeamOverviewOut,
)
from ..supabase_auth import SupabaseAuthError, SupabaseEmailConflictError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales", tags=["Sales"])

MANAGER_ROLES = ("owner", "sales_lead")


class SalesContext:
    __slots__ = ("user_id", "email", "role")

    def __init__(self, user_id: str, email: str | None, role: str):
        self.user_id = user_id
        self.email = email
        self.role = role

    @property
    def is_manager(self) -> bool:
        return self.role in MANAGER_ROLES

    @property
    def scope_user_id(self) -> str | None:
        """Repository filter: a rep only ever sees their own leads."""
        return None if self.is_manager else self.user_id


def require_sales_access(auth: AuthContext = Depends(get_auth_context)) -> SalesContext:
    if auth.is_owner:
        return SalesContext(auth.user_id, auth.email, "owner")
    role = sales_repo.get_active_role(auth.user_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sales access required")
    return SalesContext(auth.user_id, auth.email, role)


def require_sales_manager(ctx: SalesContext = Depends(require_sales_access)) -> SalesContext:
    if not ctx.is_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sales lead required")
    return ctx


def _lead_out(row: dict, owner_name: str | None = None) -> LeadOut:
    return LeadOut.model_validate({**row, "owner_name": row.get("owner_name", owner_name)})


# --- sales app ---------------------------------------------------------------


@router.get("/me", response_model=SalesMeOut)
def sales_me(ctx: SalesContext = Depends(require_sales_access)) -> SalesMeOut:
    return SalesMeOut(user_id=ctx.user_id, email=ctx.email, role=ctx.role, can_manage=ctx.is_manager)


@router.get("/leads", response_model=list[LeadOut])
def list_leads(
    view: str = "mine",
    status_filter: LeadStatus | None = None,
    owner_user_id: UUID | None = None,
    open_only: bool = False,
    ctx: SalesContext = Depends(require_sales_access),
) -> list[LeadOut]:
    """view: mine | all | unassigned. A rep always gets "mine", whatever is asked."""
    if not ctx.is_manager or view == "mine":
        scope = ctx.user_id
        rows = sales_repo.list_leads(scope_user_id=scope, status=status_filter, open_only=open_only)
    else:
        rows = sales_repo.list_leads(
            scope_user_id=None,
            owner_filter=str(owner_user_id) if owner_user_id else None,
            unassigned_only=view == "unassigned",
            status=status_filter,
            open_only=open_only,
        )
    return [_lead_out(row) for row in rows]


@router.post("/leads", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
def create_lead(data: LeadCreate, ctx: SalesContext = Depends(require_sales_access)) -> LeadOut:
    owner = ctx.user_id if not ctx.is_manager else (str(data.owner_user_id) if data.owner_user_id else None)
    payload = data.model_dump(exclude={"note", "owner_user_id"})
    try:
        row = sales_repo.create_lead(data=payload, owner_user_id=owner, actor_user_id=ctx.user_id, note=data.note)
    except sales_repo.SalesMemberNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Zuständige Person ist kein aktives Vertriebskonto") from exc
    return _lead_out(row)


@router.get("/leads/{lead_id}", response_model=LeadDetailOut)
def get_lead(lead_id: UUID, ctx: SalesContext = Depends(require_sales_access)) -> LeadDetailOut:
    row = sales_repo.get_lead(str(lead_id), scope_user_id=ctx.scope_user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    activities = [ActivityOut.model_validate(a) for a in sales_repo.list_activities(str(lead_id))]
    owner_name = None
    if row.get("owner_user_id"):
        owner_name = next(
            (m["display_name"] for m in sales_repo.list_members() if m["user_id"] == row["owner_user_id"]), None
        )
    return LeadDetailOut.model_validate({**row, "owner_name": owner_name, "activities": activities})


@router.patch("/leads/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: UUID, data: LeadUpdate, ctx: SalesContext = Depends(require_sales_access)) -> LeadOut:
    changes = {k: getattr(data, k) for k in data.model_fields_set if k != "note"}
    if "name" in changes and not changes["name"]:
        raise HTTPException(status_code=422, detail="Name darf nicht leer sein")
    for required in ("kind", "status"):
        if required in changes and changes[required] is None:
            changes.pop(required)
    row = sales_repo.update_lead(
        str(lead_id), changes=changes, note=data.note, scope_user_id=ctx.scope_user_id, actor_user_id=ctx.user_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    return _lead_out(row)


@router.post("/leads/{lead_id}/assign", response_model=LeadOut)
def assign_lead(lead_id: UUID, data: LeadAssign, ctx: SalesContext = Depends(require_sales_manager)) -> LeadOut:
    try:
        row = sales_repo.assign_lead(
            str(lead_id),
            owner_user_id=str(data.owner_user_id) if data.owner_user_id else None,
            actor_user_id=ctx.user_id,
        )
    except sales_repo.SalesMemberNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Zuständige Person ist kein aktives Vertriebskonto") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    return _lead_out(row)


@router.get("/team", response_model=TeamOverviewOut)
def team(ctx: SalesContext = Depends(require_sales_manager)) -> TeamOverviewOut:
    return TeamOverviewOut.model_validate(sales_repo.team_overview(date.today()))


@router.get("/assignees", response_model=list[SalesMemberOut])
def assignees(ctx: SalesContext = Depends(require_sales_manager)) -> list[SalesMemberOut]:
    """Active members for the assign dropdown (no e-mails needed here)."""
    return [SalesMemberOut.model_validate(m) for m in sales_repo.list_members() if m["active"]]


# --- platform owner: accounts and import ---------------------------------------


@router.get("/members", response_model=list[SalesMemberOut])
def list_members(auth: AuthContext = Depends(require_platform_owner)) -> list[SalesMemberOut]:
    rows = sales_repo.list_members()
    emails = supabase_auth.get_user_emails([row["user_id"] for row in rows])
    return [SalesMemberOut.model_validate({**row, "email": emails.get(row["user_id"])}) for row in rows]


@router.post("/members", response_model=SalesMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(data: SalesMemberCreate, auth: AuthContext = Depends(require_platform_owner)) -> SalesMemberOut:
    """Adds or reactivates a sales account by e-mail. Unknown addresses get
    an account with a random, never-shared password plus a set-password
    link; the access stands even if the mail fails (invite_mail_sent)."""
    settings = get_settings()
    try:
        user = supabase_auth.find_user_by_email(data.email)
        invited = False
        if user is None:
            try:
                user = supabase_auth.create_user(data.email, secrets.token_urlsafe(32), email_confirmed=True)
                invited = True
            except SupabaseEmailConflictError:
                user = supabase_auth.find_user_by_email(data.email)
                if user is None:
                    raise SupabaseAuthError("Account vanished after conflict")
    except SupabaseAuthError as exc:
        logger.warning("Sales invite: Supabase Auth unavailable (error_type=%s)", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Konto-Verwaltung gerade nicht erreichbar. Bitte später erneut versuchen.",
        ) from exc

    row = sales_repo.upsert_member(user_id=user.id, role=data.role, display_name=data.display_name)
    invited = invited or user.needs_password_setup
    mail_sent = False
    try:
        if invited:
            link = supabase_auth.generate_confirmation_link(
                data.email, redirect_to=settings.sales_url("/neues-passwort"), link_type="recovery"
            )
        else:
            link = settings.login_url(None)
        mail_sent = notifications_sending.send_sales_invite_email(
            to_email=data.email, display_name=data.display_name, link=link, new_account=invited
        )
    except (SupabaseAuthError, ValueError) as exc:
        logger.error("Sales invite mail not sent (error_type=%s)", type(exc).__name__)

    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action="sales.member_added",
        target_type="sales_member",
        target_id=user.id,
        metadata={"email": data.email, "role": data.role, "invited": invited, "invite_mail_sent": mail_sent},
    )
    return SalesMemberOut.model_validate(
        {**row, "email": user.email, "invited": invited, "invite_mail_sent": mail_sent}
    )


@router.patch("/members/{user_id}", response_model=SalesMemberOut)
def update_member(
    user_id: UUID, data: SalesMemberUpdate, auth: AuthContext = Depends(require_platform_owner)
) -> SalesMemberOut:
    changes = {k: getattr(data, k) for k in data.model_fields_set if getattr(data, k) is not None}
    row = sales_repo.update_member(str(user_id), changes)
    if row is None:
        raise HTTPException(status_code=404, detail="Kein Vertriebskonto")
    if changes:
        platform_roles.write_audit_log(
            actor_user_id=auth.user_id,
            actor_email=auth.email,
            action="sales.member_updated",
            target_type="sales_member",
            target_id=str(user_id),
            metadata={k: v for k, v in changes.items()},
        )
    return SalesMemberOut.model_validate(row)


@router.post("/leads/import", response_model=LeadImportOut)
def import_leads(data: LeadImportRequest, auth: AuthContext = Depends(require_platform_owner)) -> LeadImportOut:
    try:
        parsed = parse_leads_csv(data.csv, sales_repo.existing_lead_keys())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if len(parsed.rows) > 2000:
        raise HTTPException(status_code=422, detail="Höchstens 2000 Leads pro Import.")
    created = 0
    if not data.dry_run:
        created = sales_repo.import_leads(parsed.rows, actor_user_id=auth.user_id)
        platform_roles.write_audit_log(
            actor_user_id=auth.user_id,
            actor_email=auth.email,
            action="sales.leads_imported",
            target_type="sales_leads",
            metadata={"created": created, "duplicates": parsed.duplicates, "invalid": parsed.invalid},
        )
    return LeadImportOut(
        created=created if not data.dry_run else len(parsed.rows),
        duplicates=parsed.duplicates,
        invalid=parsed.invalid,
        unknown_columns=parsed.unknown_columns,
        dry_run=data.dry_run,
    )
