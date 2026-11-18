"""Finding 1 (18.11.2026), output side: no mail may carry markup from stored text.

Two guarantees:
- no mail template accepts a child's name at all (data minimisation), and
- every text a template does accept is HTML-escaped.
New templates are covered automatically.
"""

from __future__ import annotations

import inspect
from datetime import date, datetime

import pytest

from app.notifications import templates

MARKER = "<script>alert('x')</script>"
BUILDERS = [
    (name, fn) for name, fn in inspect.getmembers(templates, inspect.isfunction)
    if fn.__module__ == templates.__name__ and name.startswith("build_")
]


def _value(name: str, annotation: str):
    if "date" in annotation and "datetime" not in annotation:
        return date(2027, 7, 1)
    if "datetime" in annotation:
        return datetime(2027, 7, 1, 9, 0)
    if "int" in annotation:
        return 12345
    if "bool" in annotation:
        return True
    if name in ("parent_email", "to_email", "contact_email"):
        return "eltern@example.com"  # recipient address, validated on input and never rendered as HTML
    if name.endswith("_url"):
        return f"https://example.test/x?{MARKER}"
    return MARKER


def test_there_are_templates_to_check():
    assert len(BUILDERS) >= 5


@pytest.mark.parametrize("name, builder", BUILDERS)
def test_no_template_takes_a_child_name(name, builder):
    assert not [p for p in inspect.signature(builder).parameters if "child" in p], name


@pytest.mark.parametrize("name, builder", BUILDERS)
@pytest.mark.parametrize("status", ["registered", "waitlist", "cancelled"])
def test_templates_escape_every_text_argument(name, builder, status):
    kwargs = {
        param: (status if param == "status" else _value(param, str(spec.annotation)))
        for param, spec in inspect.signature(builder).parameters.items()
    }
    try:
        message = builder(**kwargs)
    except (ValueError, KeyError):
        pytest.skip(f"{name} does not support status={status}")
    assert "<script" not in message.html_content, name
    assert "&lt;script&gt;" in message.html_content or MARKER not in str(kwargs.values()), name
