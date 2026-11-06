"""Angebotsart (training_offers.category): Admin schreibt, öffentlich wird sie gelesen."""

from __future__ import annotations

import pytest

from .test_training_api import OFFER, _admin, _new_offer, _public, ctx  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401

CATEGORIES = ["fussball", "athletik", "mental", "videoanalyse", "premium"]


def test_category_defaults_to_null(ctx):
    assert _new_offer(ctx)["category"] is None


@pytest.mark.parametrize("category", CATEGORIES)
def test_create_with_category(ctx, category):
    offer = _new_offer(ctx, category=category)
    assert offer["category"] == category
    got = ctx["client"].get(f"{_admin(ctx)}/{offer['id']}", headers=ctx["headers"]).json()
    assert got["category"] == category


@pytest.mark.parametrize("bad", ["yoga", "", "Premium", 5])
def test_create_rejects_unknown_category(ctx, bad):
    r = ctx["client"].post(_admin(ctx), headers=ctx["headers"], json={**OFFER, "category": bad})
    assert r.status_code == 422


def test_update_sets_and_clears_category(ctx):
    c = ctx
    offer = _new_offer(c)
    url = f"{_admin(c)}/{offer['id']}"
    r = c["client"].patch(url, headers=c["headers"], json={"category": "mental"})
    assert r.status_code == 200 and r.json()["category"] == "mental"
    r = c["client"].patch(url, headers=c["headers"], json={"title": "Nur Titel"})
    assert r.json()["category"] == "mental"  # untouched
    r = c["client"].patch(url, headers=c["headers"], json={"category": None})
    assert r.status_code == 200 and r.json()["category"] is None
    assert c["client"].patch(url, headers=c["headers"], json={"category": "yoga"}).status_code == 422


def test_public_list_and_detail_expose_category(ctx):
    c = ctx
    _new_offer(c, slug="prem", status="published", category="premium")
    _new_offer(c, slug="none", status="published")
    rows = {r["slug"]: r for r in c["client"].get(_public(c)).json()}
    assert rows["prem"]["category"] == "premium" and rows["none"]["category"] is None
    detail = c["client"].get(_public(c) + "/prem").json()
    assert detail["category"] == "premium"


def test_db_rejects_invalid_category(ctx):
    import psycopg2
    _new_offer(ctx)
    with pytest.raises(psycopg2.errors.CheckViolation):
        with ctx["cursor"]() as cur:
            cur.execute("update training_offers set category='yoga' where organization_id=%s", (ctx["org"],))
