"""Finding 1 (18.11.2026): markup in a child's name was accepted and stored.

The second half of this file matters as much as the first: on a live form a
wrongly rejected real name is a lost registration.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.admin_schemas import RegistrationDetailsUpdate
from app.name_validation import NAME_MAX, PEOPLE_LIST_MAX, validate_name_text, validate_people_list
from app.schemas import RegistrationCreate

ATTACKS = ["<script>alert(1)</script>", "<b>Mia</b>", "Mia<img src=x onerror=alert(1)>", '=HYPERLINK("http://x","y")',
           "Mia =1+1", "Mia\nMuster", "Mia\rMuster", "Mia\tMuster", "Mia\x00", "Mia Muster", "Mia Muster",
           "‮aiM", "Mia⁦x", "Mia\x85Muster"]
REAL_NAMES = [
    "Mia", "Anne-Marie", "O'Brien", "D’Angelo", "Müller-Lüdenscheidt", "Nguyễn", "Zoë", "José María", "Łukasz",
    "Ødegård", "Αλέξανδρος", "Дмитрий", "محمد", "李", "Jean Pierre", "St. Clair", "Renée", "علی‌رضا",
    # typographic hyphens and apostrophes as phones and word processors produce them
    "Anne‐Marie", "Anne‑Marie", "Anne–Marie", "בן־דוד", "O‘Brien", "D´Angelo", "O`Brien",
    "O′Brien", "ג׳ורג׳", "'t Hooft",
    # spaces and invisible marks from paste or right-to-left keyboards
    "Jean Pierre", "Jean Pierre", "李　明", "محمد‏", "Max‎", "Max­",
    # what parents really type into a name field
    "Max (Maxi)", 'Max "Maxi"', "Mohammed/Muhammed", "Müller, Max", "Max & Moritz", "Max + Moritz", "Paul·la",
    "ジョン・スミス", "Müller geb. Schmidt", "Max jun.", "Mª José", "de la Cruz", "Dr. Eva Muster", "Anna & Peter Müller",
    "Oma (Erna) Schmidt", "Eva und Tom Muster",
]


def _payload(**overrides):
    base = dict(
        parent_first_name="Eva", parent_last_name="Muster", parent_email="eva@example.com", parent_phone="0151 0000000",
        child_first_name="Mia", child_last_name="Muster", child_birth_date="2018-01-01",
        emergency_contact_phone="0151 0000001", terms_accepted=True, privacy_accepted=True, photo_permission=False,
    )
    return {**base, **overrides}


NAME_FIELDS = ["child_first_name", "child_last_name", "parent_first_name", "parent_last_name", "emergency_contact_name"]


@pytest.mark.parametrize("field", NAME_FIELDS + ["pickup_authorized"])
@pytest.mark.parametrize("attack", [a for a in ATTACKS if a != "Mia\nMuster"])
def test_registration_rejects_markup_in_every_name_field(field, attack):
    with pytest.raises(ValidationError) as error:
        RegistrationCreate(**_payload(**{field: attack}))
    assert any(field in err["loc"] for err in error.value.errors()), "the error must point at the field"


@pytest.mark.parametrize("field", NAME_FIELDS)
def test_single_names_reject_line_breaks(field):
    with pytest.raises(ValidationError):
        RegistrationCreate(**_payload(**{field: "Mia\nMuster"}))


@pytest.mark.parametrize("name", REAL_NAMES)
def test_real_names_are_accepted_in_every_name_field(name):
    assert validate_name_text(name) == name
    created = RegistrationCreate(**_payload(**{field: name for field in NAME_FIELDS}))
    for field in NAME_FIELDS:
        assert getattr(created, field) == name.strip()


def test_pickup_list_accepts_several_people_and_lines():
    text = "Oma Erna (0151 000), Tante Ayşe & Onkel Tom\nNachbarin Frau Müller-O’Neil"
    assert validate_people_list(text) == text
    assert RegistrationCreate(**_payload(pickup_authorized=text)).pickup_authorized == text


def test_lengths_letters_and_blank_values():
    with pytest.raises(ValueError):
        validate_name_text("a" * (NAME_MAX + 1))
    assert validate_name_text("a" * NAME_MAX)
    with pytest.raises(ValueError):
        validate_people_list("a" * (PEOPLE_LIST_MAX + 1))
    for no_letter in ("()", "123", "❤", "-", "..."):
        with pytest.raises(ValueError):
            validate_name_text(no_letter)
    created = RegistrationCreate(**_payload(emergency_contact_name="   ", pickup_authorized=" "))
    assert created.emergency_contact_name is None and created.pickup_authorized is None


@pytest.mark.parametrize("attack", ATTACKS)
def test_admin_correction_rejects_markup(attack):
    with pytest.raises(ValidationError):
        RegistrationDetailsUpdate(child_first_name=attack, child_last_name="Muster")
    with pytest.raises(ValidationError):
        RegistrationDetailsUpdate(child_first_name="Mia", child_last_name=attack)
    if attack != "Mia\nMuster":
        with pytest.raises(ValidationError):
            RegistrationDetailsUpdate(child_first_name="Mia", child_last_name="Muster", pickup_authorized=attack)


@pytest.mark.parametrize("name", ['Max "Maxi"', "Max (Maxi)", "Muster; Beispiel", "Max [Maxi]", "Max | Maxi", "Max `Maxi`"])
def test_admin_correction_still_saves_older_unusual_names(name):
    """The edit form always resends both names: an older entry must not block a jersey-size change."""
    update = RegistrationDetailsUpdate(child_first_name=name, child_last_name=name, jersey_size="152")
    assert update.child_first_name == name
