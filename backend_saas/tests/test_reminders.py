"""Section B: reminder mail three days before camp start (daily job).

Disposable local Postgres, FakeProvider; synthetic data only.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest

from app import reminders
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from .selfservice_helpers import make_camp, make_other_org, make_reg
from .test_review_postgres import local_database, real_db  # noqa: F401

TODAY = date(2027, 6, 2)
START = TODAY + timedelta(days=3)


class Delivering(FakeProvider):
    delivers = True


class FailFor(Delivering):
    """Raises for the listed recipients, delivers the rest."""

    def __init__(self, *bad):
        super().__init__()
        self.bad = set(bad)

    def send(self, message):
        if message.to_email in self.bad:
            raise RuntimeError("provider refused")
        super().send(message)


@pytest.fixture
def env(real_db):
    cursor, tenant, _ = real_db
    with cursor() as cur:
        cur.execute("delete from camp_registrations")
    provider = Delivering()
    reset_provider_for_testing(provider)
    yield type("Env", (), dict(cursor=cursor, org=tenant.organization_id, slug=tenant.slug, mail=provider))
    reset_provider_for_testing(None)


def _camp(env, start=START, **kw):
    with env.cursor() as cur:
        return make_camp(cur, env.org, start + timedelta(days=4), start=start, **kw)


def _reg(env, camp, **kw):
    with env.cursor() as cur:
        return make_reg(cur, env.org, camp, **kw)


def _sent_at(env, token):
    with env.cursor() as cur:
        cur.execute("select reminder_sent_at from camp_registrations where registration_token=%s", (token,))
        return cur.fetchone()["reminder_sent_at"]


def test_sends_reminder_three_days_before_start_and_marks_row(env):
    camp = _camp(env, location="Sportpark Nord", care_info="8 bis 16 Uhr", title="Herbstcamp")
    token = _reg(env, camp, email="mama@example.com")
    result = reminders.send_due_reminders(TODAY)
    assert result == {"due": 1, "sent": 1, "failed": 0}
    (mail,) = env.mail.sent
    assert mail.to_email == "mama@example.com"
    assert "Herbstcamp" in mail.subject
    html = mail.html_content
    assert "Sportpark Nord" in html and "8 bis 16 Uhr" in html and "Guten Tag" in html
    assert f"/pilot/{env.slug}/buchung/{token}" in html and "Meine Buchung" not in html.replace("Ihre Anmeldung ansehen", "")
    for secret in ("Kim", "Nuesse", "Asthma", "Geheimweg"):
        assert secret not in mail.subject + html
    assert _sent_at(env, token) is not None


def test_reminder_not_sent_twice(env):
    token = _reg(env, _camp(env))
    assert reminders.send_due_reminders(TODAY)["sent"] == 1
    again = reminders.send_due_reminders(TODAY)
    assert again == {"due": 0, "sent": 0, "failed": 0}
    assert len(env.mail.sent) == 1 and _sent_at(env, token) is not None


@pytest.mark.parametrize("offset", [-1, 0, 1, 2, 4, 10])
def test_only_camps_starting_exactly_in_three_days(env, offset):
    _reg(env, _camp(env, start=TODAY + timedelta(days=offset)))
    assert reminders.send_due_reminders(TODAY) == {"due": 0, "sent": 0, "failed": 0}
    assert env.mail.sent == []


@pytest.mark.parametrize("kw", [
    {"status": "waitlist"}, {"status": "cancelled"}, {"anonymized": True, "allergies": None, "medical": None},
    {"reminder_sent": True},
])
def test_not_sent_to_waitlist_cancelled_anonymized_or_already_reminded(env, kw):
    token = _reg(env, _camp(env), **kw)
    assert reminders.send_due_reminders(TODAY)["due"] == 0
    assert env.mail.sent == []
    if not kw.get("reminder_sent"):
        assert _sent_at(env, token) is None


def test_confirmed_status_is_reminded(env):
    _reg(env, _camp(env), status="confirmed")
    assert reminders.send_due_reminders(TODAY)["sent"] == 1


def test_draft_and_archived_camps_are_skipped(env):
    _reg(env, _camp(env, status="draft"))
    _reg(env, _camp(env, status="archived"))
    assert reminders.send_due_reminders(TODAY)["due"] == 0


def test_suspended_organization_is_skipped(env):
    _reg(env, _camp(env))
    with env.cursor() as cur:
        cur.execute("update organizations set plan_status='suspended' where id=%s", (env.org,))
    try:
        assert reminders.send_due_reminders(TODAY)["due"] == 0
    finally:
        with env.cursor() as cur:
            cur.execute("update organizations set plan_status='active' where id=%s", (env.org,))


def test_one_failing_mail_does_not_stop_the_others_and_is_retryable(env):
    camp = _camp(env)
    bad = _reg(env, camp, email="bad@example.com", child="A")
    good1 = _reg(env, camp, email="good1@example.com", child="B")
    good2 = _reg(env, camp, email="good2@example.com", child="C")
    provider = FailFor("bad@example.com")
    reset_provider_for_testing(provider)
    result = reminders.send_due_reminders(TODAY)
    assert result == {"due": 3, "sent": 2, "failed": 1}
    assert sorted(m.to_email for m in provider.sent) == ["good1@example.com", "good2@example.com"]
    assert _sent_at(env, good1) is not None and _sent_at(env, good2) is not None
    assert _sent_at(env, bad) is None  # claim released: a manual rerun the same day can retry
    reset_provider_for_testing(Delivering())
    assert reminders.send_due_reminders(TODAY) == {"due": 1, "sent": 1, "failed": 0}


def test_non_delivering_provider_does_not_mark_rows(env):
    token = _reg(env, _camp(env))
    reset_provider_for_testing(FakeProvider())  # delivers = False
    assert reminders.send_due_reminders(TODAY)["sent"] == 0
    assert _sent_at(env, token) is None


def test_recipient_guard_failure_counts_as_failed_without_stopping(env):
    from app.notifications.mail import RecipientGuardProvider

    camp = _camp(env)
    blocked = _reg(env, camp, email="stranger@elsewhere.org", child="A")
    allowed = _reg(env, camp, email="tester@example.com", child="B")
    inner = Delivering()
    reset_provider_for_testing(RecipientGuardProvider(inner, ["tester@example.com"], "staging"))
    assert reminders.send_due_reminders(TODAY) == {"due": 2, "sent": 1, "failed": 1}
    assert [m.to_email for m in inner.sent] == ["tester@example.com"]
    assert _sent_at(env, blocked) is None and _sent_at(env, allowed) is not None


def test_other_organizations_are_reminded_too_with_their_own_data(env):
    with env.cursor() as cur:
        other, other_slug = make_other_org(cur)
        camp = make_camp(cur, other, START + timedelta(days=4), start=START, title="Fremdcamp")
        token = make_reg(cur, other, camp, email="x@example.com")
    assert reminders.send_due_reminders(TODAY)["sent"] == 1
    assert f"/pilot/{other_slug}/buchung/{token}" in env.mail.sent[0].html_content


def test_claim_is_atomic_second_claim_sends_nothing(env):
    token = _reg(env, _camp(env))
    with env.cursor() as cur:
        cur.execute("select r.registration_token, r.organization_id, r.parent_email from camp_registrations r where registration_token=%s", (token,))
        row = cur.fetchone()
    with env.cursor() as cur:
        cur.execute(reminders._CLAIM, (token, env.org))
        assert cur.rowcount == 1
    # the row is already claimed -> _send_one does nothing
    full = {**row, "camp_title": "T", "start_date": START, "end_date": START, "location": None, "care_info": None,
            "org_slug": env.slug, "org_name": "O", "org_email": "o@example.com", "org_phone": None}
    assert reminders._send_one(full) is False
    assert env.mail.sent == []
