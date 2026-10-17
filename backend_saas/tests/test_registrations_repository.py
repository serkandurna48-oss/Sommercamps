from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from uuid import uuid4

import pytest

from app import db
from app.registration_lifecycle import CAPACITY_COUNTING_STATUSES, InvalidStatusTransitionError
from app.repositories import registrations
from app.repositories.registrations import (
    CampNotAvailableError,
    ChildAgeNotEligibleError,
    DuplicateRegistrationError,
    RegistrationNotFoundError,
    RegistrationTarget,
    RegistrationWindowClosedError,
)
from app.schemas import RegistrationCreate
from app.tenancy import TenantContext
from app.utils import age_on_date


def _tenant(organization_id=None, slug: str = "demo-fc") -> TenantContext:
    return TenantContext(
        organization_id=organization_id or uuid4(),
        slug=slug,
        name="Demo FC",
        plan_status="active",
    )


def _target(organization_id, **overrides) -> RegistrationTarget:
    base = dict(
        id=uuid4(),
        organization_id=organization_id,
        slug="summer-1",
        start_date=date(2027, 7, 5),
        end_date=date(2027, 7, 9),
        registration_start=None,
        registration_end=None,
        age_min=6,
        age_max=12,
        capacity=2,
        status="published",
    )
    base.update(overrides)
    return RegistrationTarget(**base)


def _registration_data(**overrides) -> RegistrationCreate:
    base = dict(
        parent_first_name="Max",
        parent_last_name="Mustermann",
        parent_email="max@example.com",
        parent_phone="+49 123 456789",
        child_first_name="Lena",
        child_last_name="Mustermann",
        child_birth_date=date(2019, 5, 10),
        emergency_contact_name="Anna Mustermann",
        emergency_contact_phone="+49 987 654321",
        medical_notes=None,
        allergies=None,
        photo_permission=False,
        terms_accepted=True,
        privacy_accepted=True,
    )
    base.update(overrides)
    return RegistrationCreate(**base)


class _FakeCursor:
    def __init__(self, results: list):
        # `results` is a queue of return values, one per execute() call,
        # popped in order — lets a test script exactly what each
        # statement in the transaction should "find".
        self._results = list(results)
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, query, params):
        self.executed.append((query, params))

    def fetchone(self):
        return self._results.pop(0)


def _patch_cursor(monkeypatch, fake_cursor: _FakeCursor) -> None:
    @contextmanager
    def fake_get_cursor():
        yield fake_cursor

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)


# --------------------------------------------------------------------------
# get_registration_target
# --------------------------------------------------------------------------


def test_get_registration_target_is_scoped_by_organization_id_and_slug(monkeypatch):
    tenant = _tenant()
    row = {
        "id": uuid4(),
        "organization_id": tenant.organization_id,
        "slug": "summer-1",
        "start_date": date(2027, 7, 5),
        "end_date": date(2027, 7, 9),
        "registration_start": None,
        "registration_end": None,
        "age_min": 6,
        "age_max": 12,
        "capacity": 2,
        "status": "published",
    }

    class _Cur:
        def execute(self, query, params):
            self.query, self.params = query, params

        def fetchone(self):
            return row

    fake_cursor = _Cur()
    _patch_cursor(monkeypatch, fake_cursor)

    target = registrations.get_registration_target(tenant, "summer-1")

    assert fake_cursor.params == (tenant.organization_id, "summer-1")
    assert "organization_id = %s" in fake_cursor.query
    assert "slug = %s" in fake_cursor.query
    assert "status = 'published'" in fake_cursor.query
    assert "summer-1" not in fake_cursor.query
    assert target.id == row["id"]


def test_get_registration_target_returns_none_when_missing(monkeypatch):
    class _Cur:
        def execute(self, query, params):
            pass

        def fetchone(self):
            return None

    _patch_cursor(monkeypatch, _Cur())

    assert registrations.get_registration_target(_tenant(), "missing") is None


# --------------------------------------------------------------------------
# validate_registration_window / validate_child_age
# --------------------------------------------------------------------------


def test_validate_registration_window_raises_when_closed():
    from datetime import datetime, timedelta, timezone

    tenant_org = uuid4()
    camp = _target(tenant_org, registration_end=datetime.now(timezone.utc) - timedelta(days=1))

    with pytest.raises(RegistrationWindowClosedError):
        registrations.validate_registration_window(camp)


def test_validate_registration_window_passes_when_open():
    camp = _target(uuid4())
    registrations.validate_registration_window(camp)  # must not raise


@pytest.mark.parametrize(
    "birth_year,expected_age,expected_ok",
    [
        (2022, 5, False),  # too young
        (2021, 6, True),  # exactly age_min
        (2018, 9, True),  # comfortably within range
        (2015, 12, True),  # exactly age_max
        (2014, 13, False),  # too old
    ],
)
def test_validate_child_age_boundaries(birth_year, expected_age, expected_ok):
    # camp start_date 2027-07-05, age_min=6, age_max=12
    camp = _target(uuid4())
    birth_date = date(birth_year, 7, 5)  # exact-birthday edge case
    assert age_on_date(birth_date, camp.start_date) == expected_age
    if expected_ok:
        registrations.validate_child_age(camp, birth_date)  # must not raise
    else:
        with pytest.raises(ChildAgeNotEligibleError):
            registrations.validate_child_age(camp, birth_date)


def test_validate_child_age_exactly_age_min_is_allowed():
    camp = _target(uuid4(), age_min=6, age_max=12)
    birth_date = date(camp.start_date.year - 6, camp.start_date.month, camp.start_date.day)
    registrations.validate_child_age(camp, birth_date)  # must not raise


def test_validate_child_age_exactly_age_max_is_allowed():
    camp = _target(uuid4(), age_min=6, age_max=12)
    birth_date = date(camp.start_date.year - 12, camp.start_date.month, camp.start_date.day)
    registrations.validate_child_age(camp, birth_date)  # must not raise


def test_validate_child_age_one_day_too_young_rejected():
    camp = _target(uuid4(), age_min=6, age_max=12)
    # turns 6 the day AFTER camp start -> only 5 at start
    birth_date = date(camp.start_date.year - 6, camp.start_date.month, camp.start_date.day + 1)
    with pytest.raises(ChildAgeNotEligibleError):
        registrations.validate_child_age(camp, birth_date)


def test_validate_child_age_one_day_too_old_rejected():
    camp = _target(uuid4(), age_min=6, age_max=12)
    # turned 13 the day BEFORE camp start
    birth_date = date(camp.start_date.year - 13, camp.start_date.month, camp.start_date.day - 1)
    with pytest.raises(ChildAgeNotEligibleError):
        registrations.validate_child_age(camp, birth_date)


# --------------------------------------------------------------------------
# create_registration — locking, capacity, parametrization, tenant safety
# --------------------------------------------------------------------------


def test_create_registration_locks_camp_row_for_update(monkeypatch):
    org_id = uuid4()
    camp = _target(org_id, capacity=5)
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 5, "status": "published"},  # locked camp row
            None,  # duplicate-child check: none found
            {"active_count": 0},  # count query
            {"registration_token": uuid4(), "status": "registered", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    registrations.create_registration(_tenant(org_id), camp, _registration_data())

    organization_query, organization_params = fake_cursor.executed[0]
    assert "for share" in organization_query.lower()
    assert "from organizations" in organization_query.lower()
    assert organization_params == (org_id,)
    lock_query, lock_params = fake_cursor.executed[1]
    assert "for update" in lock_query.lower()
    assert lock_params == (camp.id,)


def test_create_registration_checks_for_duplicate_child_before_counting_capacity(monkeypatch):
    org_id = uuid4()
    camp = _target(org_id, capacity=5)
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 5, "status": "published"},
            None,
            {"active_count": 0},
            {"registration_token": uuid4(), "status": "registered", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)
    data = _registration_data()

    registrations.create_registration(_tenant(org_id), camp, data)

    dup_query, dup_params = fake_cursor.executed[2]
    assert dup_params == (camp.id, org_id, data.child_first_name, data.child_last_name, data.child_birth_date)
    assert "lower(child_first_name) = lower(%s)" in dup_query
    assert "status <> 'cancelled'" in dup_query


def test_create_registration_raises_duplicate_error_and_never_inserts(monkeypatch):
    org_id = uuid4()
    camp = _target(org_id, capacity=5)
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 5, "status": "published"},
            {"id": uuid4()},  # a matching, non-cancelled registration already exists
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(DuplicateRegistrationError):
        registrations.create_registration(_tenant(org_id), camp, _registration_data())

    assert len(fake_cursor.executed) == 3  # never reached the count/insert


def test_create_registration_counts_only_capacity_counting_statuses_for_this_camp_and_org(monkeypatch):
    org_id = uuid4()
    camp = _target(org_id, capacity=5)
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 5, "status": "published"},
            None,
            {"active_count": 0},
            {"registration_token": uuid4(), "status": "registered", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    registrations.create_registration(_tenant(org_id), camp, _registration_data())

    count_query, count_params = fake_cursor.executed[3]
    assert count_params[0] == camp.id
    assert count_params[1] == org_id
    assert set(count_params[2]) == CAPACITY_COUNTING_STATUSES
    assert "status = any(%s)" in count_query
    assert "organization_id = %s" in count_query
    assert "camp_id = %s" in count_query
    # the pre-CP-S406 approach must not have crept back in
    assert "cancelled" not in count_query


def test_create_registration_inserts_registered_when_capacity_available(monkeypatch):
    org_id = uuid4()
    camp = _target(org_id, capacity=2)
    token = uuid4()
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 2, "status": "published"},
            None,
            {"active_count": 1},  # 1 of 2 spots taken
            {"registration_token": token, "status": "registered", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.create_registration(_tenant(org_id), camp, _registration_data())

    assert result["registration_token"] == token
    insert_query, insert_params = fake_cursor.executed[4]
    assert insert_params[0] == org_id  # organization_id from tenant
    assert insert_params[1] == camp.id  # camp_id from server-resolved camp
    assert insert_params[2] == "registered"  # capacity was available
    assert "insert into camp_registrations" in insert_query.lower()


def test_create_registration_inserts_waitlist_when_capacity_reached(monkeypatch):
    """
    Since CP-S406, a full camp no longer raises — it still inserts a row,
    just with status='waitlist', and the function still succeeds (201 at
    the API layer). The old 409/CampFullyBookedError behavior is gone.
    """
    org_id = uuid4()
    camp = _target(org_id, capacity=2)
    token = uuid4()
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 2, "status": "published"},
            None,
            {"active_count": 2},  # already at capacity
            {"registration_token": token, "status": "waitlist", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.create_registration(_tenant(org_id), camp, _registration_data())

    assert result["status"] == "waitlist"
    insert_query, insert_params = fake_cursor.executed[4]
    assert insert_params[2] == "waitlist"
    assert "insert into camp_registrations" in insert_query.lower()


def test_create_registration_raises_not_available_when_camp_row_vanished(monkeypatch):
    org_id = uuid4()
    camp = _target(org_id)
    fake_cursor = _FakeCursor(results=[{"site_published": True, "plan_status": "active"}, None])  # locked SELECT finds nothing
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(CampNotAvailableError):
        registrations.create_registration(_tenant(org_id), camp, _registration_data())


def test_create_registration_raises_not_available_when_camp_unpublished_after_lookup(monkeypatch):
    """Regression for the TOCTOU race (Security-Review, vor Kundeneinladung
    geschlossen): `camp` (das Argument) ist der Stand von
    get_registration_target() VOR dem Lock — hier absichtlich noch
    status='published', wie es der Router zu diesem Zeitpunkt tatsächlich
    gesehen hat. Die gesperrte Zeile selbst kommt als 'draft' zurück, weil
    ein Admin das Camp genau in diesem Fenster zurückgezogen hat. Muss
    CampNotAvailableError auslösen, nicht die Anmeldung trotzdem einfügen."""
    org_id = uuid4()
    camp = _target(org_id, status="published")
    fake_cursor = _FakeCursor(results=[{"site_published": True, "plan_status": "active"}, {"capacity": 5, "status": "draft"}])
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(CampNotAvailableError):
        registrations.create_registration(_tenant(org_id), camp, _registration_data())

    assert len(fake_cursor.executed) == 2  # never reached duplicate-check/count/insert


def test_create_registration_ignores_any_id_like_data_on_the_request_object(monkeypatch):
    """
    RegistrationCreate has no organization_id/camp_id fields at all (see
    schemas.py, extra="forbid") — this test proves create_registration
    never reads such attributes even if someone tried to smuggle them onto
    the object; only `tenant`/`camp` (both server-resolved) determine the
    written organization_id/camp_id.
    """
    org_id = uuid4()
    other_org_id = uuid4()
    camp = _target(org_id, capacity=5)
    fake_cursor = _FakeCursor(
        results=[{"site_published": True, "plan_status": "active"},
            {"capacity": 5, "status": "published"},
            None,
            {"active_count": 0},
            {"registration_token": uuid4(), "status": "registered", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    data = _registration_data()
    assert not hasattr(data, "organization_id")
    assert not hasattr(data, "camp_id")

    registrations.create_registration(_tenant(org_id), camp, data)

    insert_params = fake_cursor.executed[4][1]
    assert insert_params[0] == org_id
    assert insert_params[0] != other_org_id


# --------------------------------------------------------------------------
# promote_next_waitlisted_registration
# --------------------------------------------------------------------------


def test_promote_next_waitlisted_locks_camp_row_first(monkeypatch):
    org_id = uuid4()
    camp_id = uuid4()
    fake_cursor = _FakeCursor(results=[{"capacity": 2}, {"active_count": 2}])
    _patch_cursor(monkeypatch, fake_cursor)

    registrations.promote_next_waitlisted_registration(_tenant(org_id), camp_id)

    lock_query, lock_params = fake_cursor.executed[0]
    assert "for update" in lock_query.lower()
    assert lock_params == (camp_id,)


def test_promote_next_waitlisted_returns_none_when_no_capacity(monkeypatch):
    org_id = uuid4()
    camp_id = uuid4()
    fake_cursor = _FakeCursor(results=[{"capacity": 2}, {"active_count": 2}])
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.promote_next_waitlisted_registration(_tenant(org_id), camp_id)

    assert result is None
    assert len(fake_cursor.executed) == 2  # never reached the waitlist SELECT


def test_promote_next_waitlisted_returns_none_when_no_waitlist(monkeypatch):
    org_id = uuid4()
    camp_id = uuid4()
    fake_cursor = _FakeCursor(
        results=[{"capacity": 2}, {"active_count": 1}, None]  # capacity free, nobody waiting
    )
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.promote_next_waitlisted_registration(_tenant(org_id), camp_id)

    assert result is None
    assert len(fake_cursor.executed) == 3  # never reached the UPDATE


def test_promote_next_waitlisted_promotes_oldest_entry(monkeypatch):
    org_id = uuid4()
    camp_id = uuid4()
    oldest_id = uuid4()
    token = uuid4()
    fake_cursor = _FakeCursor(
        results=[
            {"capacity": 2},
            {"active_count": 1},
            {"id": oldest_id},
            {"registration_token": token, "status": "registered", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.promote_next_waitlisted_registration(_tenant(org_id), camp_id)

    assert result["registration_token"] == token
    assert result["status"] == "registered"

    select_query, select_params = fake_cursor.executed[2]
    assert select_params == (camp_id, org_id)
    assert "status = 'waitlist'" in select_query
    assert "order by created_at asc, id asc" in select_query
    assert "camp_id = %s" in select_query
    assert "organization_id = %s" in select_query

    update_query, update_params = fake_cursor.executed[3]
    assert update_params == (oldest_id, org_id)  # tenant-scoped update
    assert "set status = 'registered'" in update_query


def test_promote_next_waitlisted_returns_none_when_camp_row_vanished(monkeypatch):
    fake_cursor = _FakeCursor(results=[None])
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.promote_next_waitlisted_registration(_tenant(), uuid4())

    assert result is None


# --------------------------------------------------------------------------
# cancel_registration_and_promote_next
# --------------------------------------------------------------------------


def test_cancel_registration_not_found_raises(monkeypatch):
    org_id = uuid4()
    fake_cursor = _FakeCursor(results=[None])
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(RegistrationNotFoundError):
        registrations.cancel_registration_and_promote_next(_tenant(org_id), uuid4(), uuid4())


def test_cancel_registration_load_query_is_tenant_and_camp_scoped(monkeypatch):
    org_id = uuid4()
    camp_id = uuid4()
    reg_token = uuid4()
    fake_cursor = _FakeCursor(results=[None])
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(RegistrationNotFoundError):
        registrations.cancel_registration_and_promote_next(_tenant(org_id), camp_id, reg_token)

    load_query, load_params = fake_cursor.executed[0]
    assert load_params == (reg_token, org_id, camp_id)
    assert "organization_id = %s" in load_query
    assert "camp_id = %s" in load_query
    assert "for update" in load_query.lower()


def test_cancel_registration_wrong_camp_is_not_found(monkeypatch):
    """A registration_token that exists, but under a different camp than
    the one in the URL, must behave identically to a token that doesn't
    exist at all — the camp_id filter in the WHERE clause is what makes
    the DB return no row here, this test only pins the contract."""
    org_id = uuid4()
    camp_id = uuid4()
    reg_token = uuid4()
    fake_cursor = _FakeCursor(results=[None])
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(RegistrationNotFoundError):
        registrations.cancel_registration_and_promote_next(_tenant(org_id), camp_id, reg_token)


def test_cancel_already_cancelled_raises_without_updating(monkeypatch):
    org_id = uuid4()
    reg_id = uuid4()
    camp_id = uuid4()
    reg_token = uuid4()
    fake_cursor = _FakeCursor(results=[{"id": reg_id, "camp_id": camp_id, "status": "cancelled"}])
    _patch_cursor(monkeypatch, fake_cursor)

    with pytest.raises(InvalidStatusTransitionError):
        registrations.cancel_registration_and_promote_next(_tenant(org_id), camp_id, reg_token)

    assert len(fake_cursor.executed) == 1  # only the load — no UPDATE attempted


@pytest.mark.parametrize("starting_status", ["registered", "confirmed"])
def test_cancel_registered_or_confirmed_promotes_next_waitlisted(monkeypatch, starting_status):
    org_id = uuid4()
    reg_id = uuid4()
    camp_id = uuid4()
    oldest_waitlist_id = uuid4()
    promoted_token = uuid4()
    fake_cursor = _FakeCursor(
        results=[
            {"id": reg_id, "camp_id": camp_id, "status": starting_status},  # load+lock
            {"id": reg_id, "registration_token": uuid4(), "status": "cancelled", "payment_status": "open"},  # update to cancelled
            {"capacity": 2},  # promotion: lock camp
            {"active_count": 1},  # promotion: count (the just-cancelled one no longer counts)
            {"id": oldest_waitlist_id},  # promotion: oldest waitlisted
            {"registration_token": promoted_token, "status": "registered", "payment_status": "open"},  # promoted
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.cancel_registration_and_promote_next(_tenant(org_id), camp_id, uuid4())

    assert result["cancelled"]["status"] == "cancelled"
    assert result["promoted"]["registration_token"] == promoted_token
    assert result["promoted"]["status"] == "registered"
    assert len(fake_cursor.executed) == 6


def test_cancel_waitlist_does_not_promote(monkeypatch):
    org_id = uuid4()
    reg_id = uuid4()
    camp_id = uuid4()
    fake_cursor = _FakeCursor(
        results=[
            {"id": reg_id, "camp_id": camp_id, "status": "waitlist"},
            {"id": reg_id, "registration_token": uuid4(), "status": "cancelled", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    result = registrations.cancel_registration_and_promote_next(_tenant(org_id), camp_id, uuid4())

    assert result["cancelled"]["status"] == "cancelled"
    assert result["promoted"] is None
    assert len(fake_cursor.executed) == 2  # load+update only — no promotion attempted


def test_cancel_registration_update_is_tenant_scoped(monkeypatch):
    org_id = uuid4()
    reg_id = uuid4()
    camp_id = uuid4()
    fake_cursor = _FakeCursor(
        results=[
            {"id": reg_id, "camp_id": camp_id, "status": "waitlist"},
            {"id": reg_id, "registration_token": uuid4(), "status": "cancelled", "payment_status": "open"},
        ]
    )
    _patch_cursor(monkeypatch, fake_cursor)

    registrations.cancel_registration_and_promote_next(_tenant(org_id), camp_id, uuid4())

    update_query, update_params = fake_cursor.executed[1]
    assert update_params == ("cancelled", reg_id, org_id)
    assert "organization_id = %s" in update_query
