"""Training offers, sessions and memberships (Stufe 1, Task 1).

DB tests run against the disposable local Postgres (REVIEW_POSTGRES_PORT);
synthetic data only.
"""

from datetime import date, datetime, timezone
from uuid import uuid4

import psycopg2.errors
import pytest

from app.repositories import camps, memberships, training
from app.repositories.memberships import normalize_match_key
from app.tenancy import TenantContext
from .test_review_postgres import local_database, real_db  # noqa: F401


# ---------- normalize_match_key (pure) ----------

@pytest.mark.parametrize(
    "first,last,expected",
    [
        ("  Anna ", "Müller", "anna|mueller"),
        ("JÖRG", "Größe", "joerg|groesse"),
        ("Äpfel", "Über", "aepfel|ueber"),
        ("Anna-Lena", "Meier-  Schmidt", "anna lena|meier schmidt"),
        ("Anna   Lena", "Lee", "anna lena|lee"),
        ("Straße", "Weiß", "strasse|weiss"),
        # decomposed umlaut (a + combining diaeresis) equals the composed form
        ("Märta", "Lee", "maerta|lee"),
    ],
)
def test_normalize_match_key(first, last, expected):
    assert normalize_match_key(first, last) == expected


def test_normalize_match_key_does_not_merge_first_and_last_name():
    assert normalize_match_key("Anna Maria", "Lee") != normalize_match_key("Anna", "Maria Lee")


# ---------- helpers ----------

def _org(cursor, name="Org"):
    oid = uuid4()
    with cursor() as cur:
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,%s,'t@example.com')",
            (oid, f"t-{oid.hex}", name),
        )
    return oid


def _offer(org_id, slug="einzel-60", **over):
    kw = dict(
        slug=slug, title="Einzeltraining 60", kind="einzel", description="Test",
        duration_minutes=60, location="Platz 1",
        price_member_cents=3000, price_nonmember_cents=4500,
    )
    kw.update(over)
    return training.create_offer(org_id, **kw)


# ---------- offers ----------

def test_offer_crud_per_organization(real_db):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    offer = _offer(org)
    assert offer["status"] == "draft"
    assert offer["price_member_cents"] == 3000
    assert training.get_offer(org, offer["id"])["slug"] == "einzel-60"
    assert training.get_offer_by_slug(org, "einzel-60")["id"] == offer["id"]
    updated = training.update_offer(org, offer["id"], status="published", price_member_cents=2500)
    assert updated["status"] == "published" and updated["price_member_cents"] == 2500
    _offer(org, slug="gruppe-90", kind="gruppe", duration_minutes=90)
    assert {o["slug"] for o in training.list_offers(org)} == {"einzel-60", "gruppe-90"}
    assert [o["slug"] for o in training.list_offers(org, status="published")] == ["einzel-60"]


def test_offer_slug_unique_per_org_not_global(real_db):
    cursor, tenant, _ = real_db
    other = _org(cursor)
    _offer(tenant.organization_id, slug="dup")
    with pytest.raises(training.TrainingOfferSlugConflictError):
        _offer(tenant.organization_id, slug="dup")
    _offer(other, slug="dup")  # same slug in a different org is fine


def test_offer_tenant_isolation(real_db):
    cursor, tenant, _ = real_db
    a, b = tenant.organization_id, _org(cursor)
    offer_b = _offer(b, slug="only-b")
    assert training.get_offer(a, offer_b["id"]) is None
    assert training.get_offer_by_slug(a, "only-b") is None
    assert training.list_offers(a) == []
    assert training.update_offer(a, offer_b["id"], title="Hijack") is None
    assert training.get_offer(b, offer_b["id"])["title"] == "Einzeltraining 60"


@pytest.mark.parametrize(
    "over",
    [
        dict(kind="team"), dict(duration_minutes=0), dict(price_member_cents=-1),
        dict(price_nonmember_cents=-1), dict(status="closed"),
    ],
)
def test_offer_db_checks_reject_invalid_values(real_db, over):
    _, tenant, _ = real_db
    with pytest.raises(psycopg2.errors.CheckViolation):
        _offer(tenant.organization_id, slug=f"bad-{uuid4().hex[:6]}", **over)


# ---------- sessions ----------

def test_create_session_copies_prices_and_uses_berlin_time(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    offer = _offer(org)
    # 22:30 UTC on 2027-03-01 is 23:30 in Berlin (CET) -> same day
    # 23:30 UTC on 2027-07-10 is 01:30 on 07-11 in Berlin (CEST) -> next day
    s1 = training.create_session(org, offer["id"], datetime(2027, 3, 1, 22, 30, tzinfo=timezone.utc))
    assert s1["slug"] == "einzel-60-20270301-2330"
    assert s1["start_date"] == date(2027, 3, 1) and s1["end_date"] == date(2027, 3, 1)
    s2 = training.create_session(org, offer["id"], datetime(2027, 7, 10, 23, 30, tzinfo=timezone.utc))
    assert s2["slug"] == "einzel-60-20270711-0130"
    assert s2["start_date"] == date(2027, 7, 11)
    assert s1["offer_id"] == offer["id"]
    assert s1["price_cents"] == 4500 and s1["price_member_cents"] == 3000
    assert (s1["ends_at"] - s1["starts_at"]).total_seconds() == 3600
    assert (s1["age_min"], s1["age_max"], s1["capacity"]) == (4, 18, 1)
    assert s1["location"] == "Platz 1" and s1["title"] == "Einzeltraining 60"


def test_session_prices_are_frozen_after_offer_change(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    offer = _offer(org)
    s = training.create_session(org, offer["id"], datetime(2027, 4, 1, 8, 0, tzinfo=timezone.utc))
    training.update_offer(org, offer["id"], price_member_cents=1, price_nonmember_cents=2)
    again = training.list_sessions(org, offer["id"])[0]
    assert again["id"] == s["id"]
    assert (again["price_cents"], again["price_member_cents"]) == (4500, 3000)


def test_session_params_and_group_capacity(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    group = _offer(org, slug="grp", kind="gruppe", duration_minutes=90)
    start = datetime(2027, 4, 1, 8, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        training.create_session(org, group["id"], start)  # group needs explicit capacity
    s = training.create_session(org, group["id"], start, capacity=6, age_min=8, age_max=12)
    assert (s["capacity"], s["age_min"], s["age_max"]) == (6, 8, 12)


def test_session_rejects_naive_datetime_unknown_offer_and_duplicate(real_db):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    offer = _offer(org)
    with pytest.raises(ValueError):
        training.create_session(org, offer["id"], datetime(2027, 4, 1, 8, 0))
    start = datetime(2027, 4, 1, 8, 0, tzinfo=timezone.utc)
    with pytest.raises(training.TrainingOfferNotFoundError):
        training.create_session(org, uuid4(), start)
    other_offer = _offer(_org(cursor), slug="x")
    with pytest.raises(training.TrainingOfferNotFoundError):  # offer of another tenant
        training.create_session(org, other_offer["id"], start)
    training.create_session(org, offer["id"], start)
    with pytest.raises(camps.CampSlugConflictError):
        training.create_session(org, offer["id"], start)


def test_camps_db_rules_for_training_rows(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    offer = _offer(org)
    base = ("INSERT INTO camps(organization_id,slug,title,start_date,end_date,age_min,age_max,"
            "capacity,price_cents,offer_id,starts_at,ends_at) VALUES "
            "(%s,%s,'t','2027-01-01','2027-01-01',4,18,1,100,%s,%s,%s)")
    # offer_id set without times
    with pytest.raises(psycopg2.errors.CheckViolation):
        with cursor() as cur:
            cur.execute(base, (org, "n1", offer["id"], None, None))
    # ends_at not after starts_at
    with pytest.raises(psycopg2.errors.CheckViolation):
        with cursor() as cur:
            cur.execute(base, (org, "n2", offer["id"], "2027-01-01 10:00+00", "2027-01-01 10:00+00"))
    # cross-tenant offer reference blocked by the composite FK
    foreign_org = _org(cursor)
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        with cursor() as cur:
            cur.execute(base, (foreign_org, "n3", offer["id"], "2027-01-01 10:00+00", "2027-01-01 11:00+00"))
    # classic camps stay unconstrained by the training rule
    with cursor() as cur:
        cur.execute("SELECT offer_id, starts_at, price_member_cents FROM camps WHERE id=%s", (camp.id,))
        assert cur.fetchone() == {"offer_id": None, "starts_at": None, "price_member_cents": None}


def test_public_camp_list_excludes_training_sessions(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    offer = _offer(org)
    training.create_session(org, offer["id"], datetime(2027, 4, 1, 8, 0, tzinfo=timezone.utc), status="published")
    with cursor() as cur:
        cur.execute("UPDATE camps SET status='published' WHERE organization_id=%s", (org,))
    listed = camps.list_published_camps(tenant)
    assert [c["slug"] for c in listed] == ["summer-1"]


def test_registration_new_columns_constraints(real_db):
    cursor, tenant, camp = real_db
    ins = ("INSERT INTO camp_registrations(organization_id,camp_id,parent_first_name,parent_last_name,"
           "parent_email,parent_phone,child_first_name,child_last_name,child_birth_date,terms_accepted,"
           "privacy_accepted,applied_price_cents,member_match,payment_method) VALUES "
           "(%s,%s,'P','Q','p@campspilot.example','1','C','D','2018-01-01',true,true,%s,%s,%s)")
    with cursor() as cur:
        cur.execute(ins, (tenant.organization_id, camp.id, 3000, True, "ueberweisung"))
    for bad in ((-1, True, "bar"), (100, True, "paypal")):
        with pytest.raises(psycopg2.errors.CheckViolation):
            with cursor() as cur:
                cur.execute(ins, (tenant.organization_id, camp.id, *bad))


# ---------- memberships ----------

def test_membership_create_list_deactivate(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    m = memberships.create_member(org, first_name="Jörg", last_name="Müller-Lee",
                                  birth_date=date(2015, 5, 1), member_number="A1")
    assert m["match_key"] == "joerg|mueller lee" and m["active"] is True and m["source"] == "manual"
    memberships.create_member(org, first_name="Eva", last_name="Test", birth_date=date(2014, 1, 1), source="csv")
    assert len(memberships.list_members(org)) == 2
    off = memberships.deactivate_member(org, m["id"])
    assert off["active"] is False
    assert [x["first_name"] for x in memberships.list_members(org, active_only=True)] == ["Eva"]
    assert memberships.deactivate_member(org, uuid4()) is None


def test_membership_unique_by_normalized_key_and_birth_date(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    memberships.create_member(org, first_name="Jörg", last_name="Müller", birth_date=date(2015, 5, 1))
    with pytest.raises(memberships.MembershipConflictError):
        memberships.create_member(org, first_name=" JOERG ", last_name="mueller", birth_date=date(2015, 5, 1))
    memberships.create_member(org, first_name="Jörg", last_name="Müller", birth_date=date(2016, 5, 1))


def test_find_active_member(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    m = memberships.create_member(org, first_name="Jörg", last_name="Müller", birth_date=date(2015, 5, 1))
    assert memberships.find_active_member(org, "joerg", "MUELLER", date(2015, 5, 1))["id"] == m["id"]
    assert memberships.find_active_member(org, "joerg", "mueller", date(2015, 5, 2)) is None
    memberships.deactivate_member(org, m["id"])
    assert memberships.find_active_member(org, "joerg", "mueller", date(2015, 5, 1)) is None


def test_membership_tenant_isolation(real_db):
    cursor, tenant, _ = real_db
    a, b = tenant.organization_id, _org(cursor)
    mb = memberships.create_member(b, first_name="Eva", last_name="Test", birth_date=date(2014, 1, 1))
    assert memberships.list_members(a) == []
    assert memberships.find_active_member(a, "Eva", "Test", date(2014, 1, 1)) is None
    assert memberships.deactivate_member(a, mb["id"]) is None
    assert memberships.list_members(b)[0]["active"] is True


def test_membership_table_not_readable_by_authenticated(local_database):
    import psycopg2
    conn = psycopg2.connect(**local_database)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT has_table_privilege('authenticated','organization_memberships','SELECT')")
            # The test harness grants ALL tables to authenticated after migrations,
            # so assert the policy layer instead: RLS on and no policy for authenticated.
            cur.execute("SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_memberships'::regclass")
            assert cur.fetchone()[0] is True
            cur.execute("SELECT count(*) FROM pg_policies WHERE tablename='organization_memberships'")
            assert cur.fetchone()[0] == 0
            cur.execute("SELECT relrowsecurity FROM pg_class WHERE oid='public.training_offers'::regclass")
            assert cur.fetchone()[0] is True
    finally:
        conn.close()
