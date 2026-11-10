"""Synthetic-data SQL helpers shared by the retention, "Meine Buchung" and reminder tests."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional
from uuid import uuid4


def make_camp(cur, org, end: date, *, start: Optional[date] = None, slug=None, status="published",
              location=None, care_info=None, title="Ret"):
    camp = uuid4()
    cur.execute(
        "insert into camps (id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents,status,"
        "location,care_info) values (%s,%s,%s,%s,%s,%s,6,12,50,1000,%s,%s,%s)",
        (camp, org, slug or f"c-{camp.hex[:10]}", title, start or end - timedelta(days=4), end, status, location, care_info),
    )
    return camp


def make_reg(cur, org, camp, *, allergies="Nuesse", medical="Asthma", consent=True, status="registered",
             payment_status="open", email="p@example.com", child="Kim", anonymized=False, reminder_sent=False,
             cancellation_requested=False):
    token = uuid4()
    cur.execute(
        """insert into camp_registrations (organization_id,camp_id,registration_token,parent_first_name,parent_last_name,
               parent_email,parent_phone,child_first_name,child_last_name,child_birth_date,terms_accepted,privacy_accepted,
               allergies,medical_notes,health_data_consent,status,payment_status,anonymized_at,reminder_sent_at,
               cancellation_requested_at,parent_street,parent_postal_code,parent_city)
           values (%s,%s,%s,'Pia','Parent',%s,'0561 1234',%s,%s,'2017-01-01',true,true,%s,%s,%s,%s,%s,
               case when %s then now() end, case when %s then now() end, case when %s then now() end,
               'Geheimweg 7','34117','Kassel')""",
        (org, camp, token, email, child, uuid4().hex[:8], allergies, medical, consent, status, payment_status,
         anonymized, reminder_sent, cancellation_requested),
    )
    return token


def make_other_org(cur):
    org = uuid4()
    cur.execute(
        "insert into organizations (id,slug,name,contact_email,site_published,plan_status) values (%s,%s,'Other','o@example.com',true,'active')",
        (org, f"other-{org.hex}"),
    )
    return org, f"other-{org.hex}"
