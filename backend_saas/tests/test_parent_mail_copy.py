from datetime import date

import pytest

from app.notifications.templates import _date_range, build_registration_mail


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
