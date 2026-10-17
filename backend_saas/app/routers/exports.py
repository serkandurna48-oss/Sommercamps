"""
Platform-admin .xlsx exports (Richtung-C Auftrag "Export") — Teilnehmerliste,
Zahlungen, and Warteliste as downloadable spreadsheets. Read-only, gated by
app/auth_deps.py::require_org_access like every other org-scoped admin
route (feat/platform-foundation). Reuses the exact same repository
functions and organization/camp resolution as app/routers/admin.py (never
a client-supplied id) — this module only adds a different response format
(.xlsx bytes instead of JSON) on top of data the admin API already exposes
as JSON.

Column sets mirror what the corresponding frontend screen actually shows
(ParticipantList, PaymentSection, WaitlistCard/Row) — see each _*_sheet
function's docstring. German header labels mirror
frontend/app/lib/i18n/de.ts's registrationStatusLabel/paymentStatusLabel;
kept as a separate small dict here rather than shared with the frontend
(different language runtimes, presentation-only duplication, same pattern
already used elsewhere in this codebase for age-validation logic mirrored
between camp_config.py and campConfig.ts).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Response

from ..auth_deps import AuthContext, require_org_access
from ..admin_resolve import require_camp, require_organization
from ..repositories import camps as camps_repo
from ..repositories import registrations as registrations_repo
from ..xlsx_export import build_xlsx

router = APIRouter(prefix="/admin", tags=["Admin Exports"])

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_STATUS_LABEL = {
    "registered": "Angemeldet",
    "confirmed": "Bestätigt",
    "cancelled": "Storniert",
    "waitlist": "Warteliste",
}

_PAYMENT_STATUS_LABEL = {
    "open": "Zahlung offen",
    "paid": "Bezahlt",
    "refunded": "Erstattet",
    "waived": "Erlassen",
    "cancelled": "Storniert",
}


def _filter_by_tokens(registrations: list[dict], tokens: Optional[str]) -> list[dict]:
    """
    `tokens` (comma-separated registration_token values) lets the export
    match whatever the admin was currently looking at on screen (e.g. the
    "Zahlung offen" filter, or a name search) instead of always exporting
    every row — the Teilnehmerliste/Zahlungen screens' "Als CSV" already
    respects their own on-screen filter (it's generated client-side from
    already-filtered rows); this is what makes "Als Excel" match it
    instead of silently ignoring the filter and downloading everything
    (a real bug found in review: an admin filtering to "offene Zahlungen"
    to send reminders could otherwise download and message people who had
    already paid). `None`/absent means "no filter — export everything",
    the original behavior.
    """
    if tokens is None:
        return registrations
    wanted = {t.strip() for t in tokens.split(",") if t.strip()}
    return [r for r in registrations if str(r["registration_token"]) in wanted]


def _xlsx_response(headers: list[str], rows: list[list[object]], sheet_name: str, filename: str) -> Response:
    content = build_xlsx(headers, rows, sheet_name=sheet_name)
    return Response(
        content=content,
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _participants_sheet(camp: dict, registrations: list[dict]) -> tuple[list[str], list[list[object]]]:
    """Full roster, every column an organizer needs for camp day — mirrors
    ParticipantList/ParticipantDetail's field set exactly (incl. PII: this
    is platform-admin-only, same sensitivity as GET .../registrations)."""
    headers = [
        "Status", "Zahlung",
        "Kind Vorname", "Kind Nachname", "Geburtsdatum",
        "Elternteil Vorname", "Elternteil Nachname", "E-Mail", "Telefon",
        "Notfallkontakt", "Notfallkontakt-Telefon",
        "Allergien", "Hinweise", "Trikotgröße", "Abholberechtigt",
        "Fotoerlaubnis", "Angemeldet am",
    ]
    rows = [
        [
            _STATUS_LABEL.get(r["status"], r["status"]),
            _PAYMENT_STATUS_LABEL.get(r["payment_status"], r["payment_status"]),
            r["child_first_name"], r["child_last_name"], r["child_birth_date"],
            r["parent_first_name"], r["parent_last_name"], r["parent_email"], r["parent_phone"],
            r["emergency_contact_name"], r["emergency_contact_phone"],
            r["allergies"], r["medical_notes"], r["jersey_size"], r["pickup_authorized"],
            "Ja" if r["photo_permission"] else "Nein", r["created_at"],
        ]
        for r in registrations
    ]
    return headers, rows


def _payments_sheet(camp_registrations: list[tuple[dict, list[dict]]], include_camp_column: bool) -> tuple[list[str], list[list[object]]]:
    """Mirrors PaymentSection: every registration regardless of status —
    a cancelled registration can still need a refund, so it stays visible
    here exactly like on the Zahlungen screen."""
    headers = (["Camp"] if include_camp_column else []) + [
        "Kind", "Elternteil", "E-Mail", "Preis (EUR)", "Zahlungsstatus",
    ]
    rows = []
    for camp, registrations in camp_registrations:
        price_eur = camp["price_cents"] / 100
        for r in registrations:
            row = (
                ([camp["title"]] if include_camp_column else [])
                + [
                    f"{r['child_first_name']} {r['child_last_name']}",
                    f"{r['parent_first_name']} {r['parent_last_name']}",
                    r["parent_email"],
                    price_eur,
                    _PAYMENT_STATUS_LABEL.get(r["payment_status"], r["payment_status"]),
                ]
            )
            rows.append(row)
    return headers, rows


def _waitlist_sheet(camp_registrations: list[tuple[dict, list[dict]]], include_camp_column: bool) -> tuple[list[str], list[list[object]]]:
    """Mirrors WaitlistCard/WaitlistRow: only status='waitlist', in the
    same FIFO order the admin's promote action would use (registrations
    are already `order by created_at asc, id asc` from the repository)."""
    headers = (["Camp"] if include_camp_column else []) + [
        "Platz", "Kind", "Geburtsjahr", "Elternteil", "E-Mail", "Telefon", "Wartet seit",
    ]
    rows = []
    for camp, registrations in camp_registrations:
        waitlisted = [r for r in registrations if r["status"] == "waitlist"]
        for position, r in enumerate(waitlisted, start=1):
            row = (
                ([camp["title"]] if include_camp_column else [])
                + [
                    position,
                    f"{r['child_first_name']} {r['child_last_name']}",
                    r["child_birth_date"].year,
                    f"{r['parent_first_name']} {r['parent_last_name']}",
                    r["parent_email"],
                    r["parent_phone"],
                    r["created_at"],
                ]
            )
            rows.append(row)
    return headers, rows


@router.get("/organizations/{organization_slug}/camps/{camp_slug}/export.xlsx")
def export_camp_xlsx(
    organization_slug: str,
    camp_slug: str,
    view: Literal["participants", "payments", "waitlist"] = "participants",
    tokens: Optional[str] = Query(default=None, description="Comma-separated registration_token values to restrict to"),
    auth: AuthContext = Depends(require_org_access),
) -> Response:
    organization = require_organization(organization_slug)
    camp = require_camp(organization, camp_slug)

    registrations = _filter_by_tokens(registrations_repo.list_registrations_for_camp(organization["id"], camp["id"]), tokens)

    if view == "participants":
        headers, rows = _participants_sheet(camp, registrations)
    elif view == "payments":
        headers, rows = _payments_sheet([(camp, registrations)], include_camp_column=False)
    else:
        headers, rows = _waitlist_sheet([(camp, registrations)], include_camp_column=False)

    filename = f"{camp_slug}-{view}.xlsx"
    return _xlsx_response(headers, rows, sheet_name=view.capitalize(), filename=filename)


@router.get("/organizations/{organization_slug}/export.xlsx")
def export_organization_xlsx(
    organization_slug: str,
    view: Literal["payments", "waitlist"] = "payments",
    tokens: Optional[str] = Query(default=None, description="Comma-separated registration_token values to restrict to"),
    auth: AuthContext = Depends(require_org_access),
) -> Response:
    """Org-wide variant, across every camp — Zahlungen and Warteliste both
    have an org-level view (unlike Teilnehmerliste, which only exists per
    camp), so this deliberately has no `view=participants` option."""
    organization = require_organization(organization_slug)

    camps = camps_repo.list_camps_for_organization(organization["id"])
    registrations_by_camp_id: dict = defaultdict(list)
    for row in registrations_repo.list_registrations_for_organization(organization["id"]):
        registrations_by_camp_id[row["camp_id"]].append(row)
    camp_registrations = [
        (camp, _filter_by_tokens(registrations_by_camp_id.get(camp["id"], []), tokens)) for camp in camps
    ]

    if view == "payments":
        headers, rows = _payments_sheet(camp_registrations, include_camp_column=True)
    else:
        headers, rows = _waitlist_sheet(camp_registrations, include_camp_column=True)

    filename = f"{organization_slug}-{view}.xlsx"
    return _xlsx_response(headers, rows, sheet_name=view.capitalize(), filename=filename)
