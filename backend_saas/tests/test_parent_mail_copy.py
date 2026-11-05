from datetime import date
from uuid import UUID

import pytest

from app.notifications.templates import _date_range, build_registration_mail
from app.payment_reference import payment_reference
from app.schemas import RegistrationCreated


@pytest.mark.parametrize("start,end,expected", [
    (date(2027, 10, 25), date(2027, 10, 29), "25.–29. Okt. 2027"),
    (date(2027, 10, 25), date(2027, 10, 25), "25. Okt. 2027"),
    (date(2027, 10, 30), date(2027, 11, 2), "30. Okt.–2. Nov. 2027"),
    (date(2027, 12, 30), date(2028, 1, 2), "30. Dez. 2027–2. Jan. 2028"),
])
def test_parent_date_range(start, end, expected):
    assert _date_range(start, end) == expected


@pytest.mark.parametrize("status", ["registered", "waitlist"])
@pytest.mark.parametrize("iban", [None, "DE89370400440532013000"])
def test_parent_mail_copy(status, iban):
    mail = build_registration_mail(
        status=status, org_name="Testverein", org_email="club@example.com", org_phone="0561 1234",
        camp_title="Herbstcamp", camp_start=date(2027, 10, 25), camp_end=date(2027, 10, 29),
        parent_email="eva.muster@example.com", payment_reference="CP-12345678", iban=iban,
        price_cents=14900, currency="EUR",
    )
    assert mail.subject == ("Anmeldebestätigung – Herbstcamp" if status == "registered" else "Wartelistenbestätigung – Herbstcamp")
    assert "eva" not in mail.subject.lower()
    assert "25.–29. Okt. 2027" in mail.html_content
    assert "Ihre Anmeldung" in mail.html_content
    assert "club@example.com" in mail.html_content
    if status == "registered":
        assert "149,00" in mail.html_content
        assert "CP-12345678" in mail.html_content
        if iban:
            assert iban in mail.html_content
        else:
            assert "Der Verein meldet sich zur Zahlung" in mail.html_content
            assert "IBAN" not in mail.html_content
    else:
        assert "noch keine Kosten" in mail.html_content
        assert "IBAN" not in mail.html_content


@pytest.mark.parametrize("title,start,end", [
    ("Winter-Fußballschule 2027", date(2027, 1, 4), date(2027, 1, 7)),
    ("Oster-Fußballschule 2027", date(2027, 3, 22), date(2027, 3, 25)),
    ("1. Sommer-Fußballschule 2027", date(2027, 6, 28), date(2027, 7, 1)),
    ("2. Sommer-Fußballschule 2027", date(2027, 8, 2), date(2027, 8, 5)),
    ("Herbst-Fußballschule 2027", date(2027, 10, 4), date(2027, 10, 7)),
])
def test_selected_camp_payment_reference_and_mail(title, start, end):
    token = UUID("12345678-1234-4000-8000-000000000001")
    ref = payment_reference(title, token)
    response = RegistrationCreated(
        registration_token=token, status="registered", payment_status="open",
        camp_title=title, child_first_name="Ada", child_last_name="Beispiel",
    )
    assert response.payment_reference == ref
    assert ref == f"{title} CP-12345678"
    assert "Ada" not in ref and "Beispiel" not in ref
    mail = build_registration_mail(
        status="registered", org_name="Beispielverein", org_email="verein@example.test",
        org_phone=None, camp_title=title, camp_start=start, camp_end=end,
        parent_email="familie@example.test", payment_reference=ref, iban=None,
    )
    assert title in mail.subject and title in mail.html_content
    assert ref in mail.html_content
    assert "Sommercamp" not in mail.html_content


def test_siblings_have_distinct_references_without_child_names():
    title = "Winter-Fußballschule 2027"
    first = payment_reference(title, UUID("12345678-1234-4000-8000-000000000001"))
    second = payment_reference(title, UUID("87654321-1234-4000-8000-000000000002"))
    assert first != second
    assert first.startswith(title) and second.startswith(title)
    assert all(name not in first + second for name in ("Ada", "Ben", "Beispiel"))


def test_mail_escapes_selected_camp_and_reference():
    mail = build_registration_mail(
        status="registered", org_name="Beispielverein", org_email="verein@example.test",
        org_phone=None, camp_title="Winter <script>alert(1)</script>",
        camp_start=date(2027, 1, 4), camp_end=date(2027, 1, 7),
        parent_email="familie@example.test", payment_reference="Winter <b> CP-12345678",
        iban=None,
    )
    assert "<script>" not in mail.html_content and "<b>" not in mail.html_content
    assert "&lt;script&gt;" in mail.html_content and "&lt;b&gt;" in mail.html_content


# ---------- Training mails: payment method, subject, cancellation note ----------

from datetime import datetime, timezone  # noqa: E402
import hashlib  # noqa: E402

_TRAINING_START = datetime(2027, 3, 4, 16, 0, tzinfo=timezone.utc)  # 17:00 Berlin
_IBAN = "DE89370400440532013000"


def _training_mail(payment_method, *, promoted=False, status="registered"):
    return build_registration_mail(
        status=status, org_name="Testverein", org_email="club@example.com", org_phone=None,
        camp_title="Einzeltraining", camp_start=date(2027, 3, 4), camp_end=date(2027, 3, 4),
        parent_email="eva.muster@example.com", payment_reference="CP-12345678", iban=_IBAN,
        price_cents=3500, currency="EUR", starts_at=_TRAINING_START,
        payment_method=payment_method, promoted=promoted,
    )


def test_training_mail_bar_has_no_bank_details():
    html = _training_mail("bar").html_content
    assert "Bitte bar beim Training bezahlen." in html
    assert "35,00" in html
    assert "IBAN" not in html and _IBAN not in html
    assert "Verwendungszweck" not in html


def test_training_mail_ueberweisung_keeps_transfer_block():
    html = _training_mail("ueberweisung").html_content
    assert _IBAN in html and "Verwendungszweck" in html and "35,00" in html
    assert "bar beim Training" not in html


@pytest.mark.parametrize("method", ["bar", "ueberweisung"])
def test_training_mail_subject_and_cancel_note(method):
    mail = _training_mail(method)
    assert mail.subject == "Buchungsbestätigung: Einzeltraining am 4. März 2027, 17:00 Uhr"
    assert "Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden." in mail.html_content


def test_training_promoted_mail_keeps_platz_frei_subject_and_bar_block():
    mail = _training_mail("bar", promoted=True)
    assert mail.subject.startswith("Platz frei")
    assert "Bitte bar beim Training bezahlen." in mail.html_content and "IBAN" not in mail.html_content


def test_classic_camp_mail_is_byte_identical_to_before():
    """Pinned against the pre-change template output (sha256 of subject + body)."""
    mail = build_registration_mail(
        status="registered", org_name="Testverein", org_email="club@example.com", org_phone="0561 1234",
        camp_title="Herbstcamp", camp_start=date(2027, 10, 25), camp_end=date(2027, 10, 29),
        parent_email="e@example.com", payment_reference="CP-12345678", iban=_IBAN,
        price_cents=14900, currency="EUR",
    )
    digest = hashlib.sha256((mail.subject + "\n" + mail.html_content).encode()).hexdigest()
    assert digest == "5403dd74094c08fedf9aec5729355d8ea84b2b2d3e96cb8cd5ea2236f4db4724"
    assert "Kostenlose Absage" not in mail.html_content
