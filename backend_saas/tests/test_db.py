from __future__ import annotations

import logging

from app.db import _dsn_with_sslmode, _warn_if_ipv6_only_supabase_host


def test_dsn_with_sslmode_adds_sslmode_for_non_local_host():
    dsn = _dsn_with_sslmode("postgresql://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres")
    assert "sslmode=require" in dsn


def test_dsn_with_sslmode_leaves_local_host_untouched():
    dsn = _dsn_with_sslmode("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    assert "sslmode" not in dsn


def test_dsn_with_sslmode_preserves_existing_query_params():
    dsn = _dsn_with_sslmode("postgresql://user:pass@example.supabase.com:5432/postgres?connect_timeout=10")
    assert "connect_timeout=10" in dsn
    assert "sslmode=require" in dsn


def test_dsn_with_sslmode_does_not_override_explicit_sslmode():
    dsn = _dsn_with_sslmode("postgresql://user:pass@example.supabase.com:5432/postgres?sslmode=disable")
    assert "sslmode=disable" in dsn
    assert dsn.count("sslmode=") == 1


def test_warns_on_supabase_direct_connection_host(caplog):
    with caplog.at_level(logging.WARNING):
        _warn_if_ipv6_only_supabase_host(
            "postgresql://postgres:pw@db.wkmckfbzhmihyfwiekct.supabase.co:5432/postgres"
        )
    assert any("IPv6-only" in record.message for record in caplog.records)


def test_no_warning_for_transaction_pooler_host(caplog):
    with caplog.at_level(logging.WARNING):
        _warn_if_ipv6_only_supabase_host(
            "postgresql://postgres.wkmckfbzhmihyfwiekct:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
        )
    assert caplog.records == []


def test_no_warning_for_local_host(caplog):
    with caplog.at_level(logging.WARNING):
        _warn_if_ipv6_only_supabase_host("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    assert caplog.records == []
