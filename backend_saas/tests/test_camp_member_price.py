"""Member price for classic camps (10.11.2026): decided server-side from the
member list, like trainings. Camps without a member price keep the old
behavior (no applied price). Real local Postgres, synthetic data only."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.admin_schemas import CampCreate, CampUpdate
from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.repositories import camps, memberships
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401

BIRTH = date(2017, 5, 10)


@pytest.fixture(autouse=True)
def fake_provider():
    provider = FakeProvider()
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


def _camp(real_db, *, price=16900, member=14900, capacity=5):
    cursor, tenant, _ = real_db
    camp = camps.create_camp(tenant.organization_id, CampCreate(
        slug=f"camp-{uuid4().hex[:6]}", title="Herbstcamp", start_date=date(2027, 10, 13),
        end_date=date(2027, 10, 15), age_min=6, age_max=14, capacity=capacity,
        price_cents=price, price_member_cents=member, status="draft",
    ))
    with cursor() as cur:  # publish directly: the fixture org is on the starter plan (camp limit)
        cur.execute("update camps set status='published' where id=%s", (camp["id"],))
    return camp


def _post(real_db, camp, **overrides):
    _, tenant, _ = real_db
    payload = _valid_payload(child_birth_date=BIRTH.isoformat())
    payload.update(overrides)
    with TestClient(app) as client:
        return client.post(f"/api/v1/organizations/{tenant.slug}/camps/{camp['slug']}/registrations", json=payload)


def _row(real_db, token):
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token=%s", (token,))
        return cur.fetchone()


def _member(real_db, first="Lena", last="Mustermann", birth=BIRTH):
    _, tenant, _ = real_db
    return memberships.create_member(tenant.organization_id, first_name=first, last_name=last, birth_date=birth)


def test_member_pays_member_price(real_db, fake_provider):
    _member(real_db)
    camp = _camp(real_db)
    r = _post(real_db, camp)
    assert r.status_code == 201, r.text
    assert r.json()["applied_price_cents"] == 14900
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"], row["booked_price_cents"]) == (14900, True, 14900)
    assert any("149,00" in (m.html_content or "") for m in fake_provider.sent)


def test_nonmember_pays_regular_price(real_db):
    camp = _camp(real_db)
    r = _post(real_db, camp)
    assert r.status_code == 201, r.text
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"], row["booked_price_cents"]) == (16900, False, 16900)


def test_waitlist_keeps_decided_price(real_db):
    _member(real_db)
    camp = _camp(real_db, capacity=1)
    assert _post(real_db, camp, child_first_name="Max", parent_email="a@example.com").status_code == 201
    r = _post(real_db, camp)
    row = _row(real_db, r.json()["registration_token"])
    assert (row["status"], row["applied_price_cents"], row["member_match"]) == ("waitlist", 14900, True)


def test_camp_without_member_price_is_unchanged(real_db):
    _member(real_db)
    camp = _camp(real_db, price=12900, member=None)
    r = _post(real_db, camp)
    assert r.status_code == 201
    assert "applied_price_cents" not in r.json()  # old response shape for one-price camps
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"], row["booked_price_cents"]) == (None, None, 12900)


def test_without_members_module_everyone_pays_regular_price(real_db):
    cursor, tenant, _ = real_db
    _member(real_db)
    camp = _camp(real_db)
    with cursor() as cur:
        cur.execute("update organizations set modules='{camps}' where id=%s", (tenant.organization_id,))
    r = _post(real_db, camp)
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"], row["booked_price_cents"]) == (None, None, 16900)


def test_public_camp_shows_member_price(real_db):
    _, tenant, _ = real_db
    camp = _camp(real_db)
    with TestClient(app) as client:
        listed = client.get(f"/api/v1/organizations/{tenant.slug}/camps").json()
    mine = next(c for c in listed if c["slug"] == camp["slug"])
    assert (mine["price_cents"], mine["price_member_cents"]) == (16900, 14900)


def test_member_price_must_not_exceed_price():
    with pytest.raises(ValidationError):
        CampCreate(slug="x", title="X", start_date=date(2027, 1, 1), end_date=date(2027, 1, 2),
                   age_min=6, age_max=14, capacity=5, price_cents=10000, price_member_cents=12000)


def test_update_rejects_member_price_above_price_and_rolls_back(real_db):
    _, tenant, _ = real_db
    camp = _camp(real_db)
    with pytest.raises(camps.CampMemberPriceError):
        camps.update_camp(tenant.organization_id, camp["slug"], CampUpdate(price_member_cents=20000))
    assert camps.get_camp_by_slug(tenant.organization_id, camp["slug"])["price_member_cents"] == 14900
    updated = camps.update_camp(tenant.organization_id, camp["slug"], CampUpdate(price_member_cents=None))
    assert updated["price_member_cents"] is None
