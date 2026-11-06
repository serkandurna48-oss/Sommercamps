"""Release abrechnung + admin-fixes: deleting a registration vs. Stripe paths,
invoices (GoBD) and fee records. Stripe mocked, real local Postgres,
synthetic data only."""

from __future__ import annotations

from .test_billing_stripe_express import (  # noqa: F401
    LEGACY, PLATFORM_HOOK, PLATFORM_SECRET, _activate_express, _activate_legacy, _charge_refunded, _checkout,
    _completed, _paid_destination, _post_webhook, _refund, _reg, _register, env,
)
from .test_invoices import _invoices, _pay_manually, _profile, mail  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401

HAS_INVOICE = "Für diese Buchung gibt es eine Rechnung. Bitte stornieren statt löschen."


def _delete(env, token):
    return env.client.delete(f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}",
                             headers=env.admin())


def _session_calls(env):
    return [c for c in env.fake.calls if c[0] in ("Session.retrieve", "Session.expire")]


# ---------- close_checkout_before_delete: three payment paths ----------

def test_express_open_session_is_expired_on_the_platform_account(env):
    _activate_express(env)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    session_id = _reg(env, token)["stripe_checkout_session_id"]
    assert _reg(env, token)["stripe_charge_type"] == "destination"
    r = _delete(env, token)
    assert r.status_code == 200, r.text
    # No stripe_account header: destination sessions live on the platform.
    assert _session_calls(env) == [("Session.retrieve", session_id, {}), ("Session.expire", session_id, {})]
    assert _reg(env, token) is None


def test_legacy_direct_session_is_expired_on_the_standard_account(env):
    _activate_legacy(env)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    session_id = _reg(env, token)["stripe_checkout_session_id"]
    assert _reg(env, token)["stripe_charge_type"] != "destination"
    r = _delete(env, token)
    assert r.status_code == 200, r.text
    scope = {"stripe_account": LEGACY}
    assert _session_calls(env) == [("Session.retrieve", session_id, scope), ("Session.expire", session_id, scope)]
    assert _reg(env, token) is None


def test_booking_without_checkout_never_asks_stripe(env):
    _activate_express(env)
    token = _register(env)
    assert _delete(env, token).status_code == 200
    assert _session_calls(env) == []


def test_express_session_completed_before_webhook_blocks_the_delete(env):
    token, session_id = _paid_destination(env)
    env.fake.sessions[session_id] = {"status": "complete", "payment_status": "paid"}
    r = _delete(env, token)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "paid_online"
    assert _session_calls(env) == [("Session.retrieve", session_id, {})]
    assert _reg(env, token) is not None


# ---------- invoices and fee records block the delete ----------

def test_paid_booking_with_invoice_returns_409_has_invoice(env, mail):
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    r = _delete(env, token)
    assert r.status_code == 409
    assert r.json()["detail"] == {"code": "has_invoice", "message": HAS_INVOICE}
    assert _reg(env, token) is not None and _invoices(env, token) == [invoice]


def test_reopened_booking_with_invoice_stays_and_stripe_is_not_asked(env, mail):
    """Paid, invoiced, then set back to open (and a new checkout started):
    the invoice still blocks, before any Stripe call."""
    _profile(env)
    _activate_express(env)
    token = _register(env)
    _pay_manually(env, token)
    _pay_manually(env, token, "open")
    _checkout(env, token)
    r = _delete(env, token)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "has_invoice"
    assert _session_calls(env) == []


def test_cancelled_booking_with_invoice_and_storno_stays(env, mail):
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    cancel = f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/cancel"
    assert env.client.post(cancel, headers=env.admin()).status_code == 200
    before = _invoices(env, token)
    assert [d["kind"] for d in before] == ["invoice", "storno"]
    assert _delete(env, token).json()["detail"]["code"] == "has_invoice"
    assert _invoices(env, token) == before


def test_express_partially_refunded_with_invoice_stays(env, mail):
    _profile(env)
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    _refund(env, token, 400)
    assert _charge_refunded(env, 400, 20).status_code == 200
    assert _reg(env, token)["payment_status"] == "partially_refunded"
    assert _delete(env, token).json()["detail"]["code"] == "has_invoice"
    assert len(_invoices(env, token)) == 2


def test_express_partially_refunded_without_invoice_is_paid_online(env):
    token, session_id = _paid_destination(env)  # no billing profile: invoice pending
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    _refund(env, token, 400)
    _charge_refunded(env, 400, 20)
    assert _reg(env, token)["payment_status"] == "partially_refunded" and _invoices(env, token) == []
    r = _delete(env, token)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "paid_online"


def test_express_fully_refunded_with_stornos_stays(env, mail):
    _profile(env)
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    _refund(env, token)
    assert _charge_refunded(env, 1000, 50).status_code == 200
    assert _reg(env, token)["payment_status"] == "refunded"
    before = _invoices(env, token)
    assert [d["kind"] for d in before] == ["invoice", "storno"]
    assert _delete(env, token).json()["detail"]["code"] == "has_invoice"
    assert _invoices(env, token) == before and _reg(env, token) is not None


def test_express_fully_refunded_without_invoice_has_fee_record(env):
    """Refund events and the fee snapshot feed the monthly fee report."""
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    _refund(env, token)
    _charge_refunded(env, 1000, 50)
    assert _reg(env, token)["payment_status"] == "refunded" and _invoices(env, token) == []
    r = _delete(env, token)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "has_fee_record"


def test_paid_booking_with_pending_invoice_has_fee_record(env):
    token = _register(env)
    _pay_manually(env, token)  # no billing profile: invoice pending, fee snapshot written
    assert _reg(env, token)["invoice_pending_reason"] == "missing_billing_profile"
    r = _delete(env, token)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "has_fee_record"


def test_invoices_have_no_fk_and_survive_a_raw_row_delete(env, mail):
    """FK finding: invoices.registration_id has no FK on purpose, so a row
    delete can neither cascade nor fail; the application guard above is
    what keeps the booking."""
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    with env.cursor() as cur:
        cur.execute("""select count(*) as n from pg_constraint
                       where contype = 'f' and confrelid = 'public.camp_registrations'::regclass
                         and conrelid in ('public.invoices'::regclass, 'public.registration_refund_events'::regclass)""")
        assert cur.fetchone()["n"] == 0
        cur.execute("delete from camp_registrations where registration_token = %s", (token,))
        cur.execute("select number from invoices where id = %s", (invoice["id"],))
        assert cur.fetchone()["number"] == invoice["number"]


def test_admin_list_flags_invoice_and_fee_record(env, mail):
    _profile(env)
    invoiced, plain = _register(env), _register(env)
    _pay_manually(env, invoiced)
    rows = env.client.get(f"/admin/organizations/{env.slug}/camps/summer-1/registrations", headers=env.admin()).json()
    flags = {r["registration_token"]: (r["has_invoice"], r["fee_recorded"]) for r in rows}
    assert flags[invoiced] == (True, True) and flags[plain] == (False, False)
