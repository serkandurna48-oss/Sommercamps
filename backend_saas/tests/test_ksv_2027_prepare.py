"""Offline, synthetic tests for the KSV 2027 draft plan."""

import importlib.util
import json
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_ksv_2027.py"
spec = importlib.util.spec_from_file_location("prepare_ksv_2027", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrepareKsv2027Tests(unittest.TestCase):
    def test_question_contract_uses_existing_keys(self):
        config = json.loads((SCRIPT.parents[1] / "seeds" / "ksv-2027-questions.json").read_text(encoding="utf-8"))
        self.assertEqual(config["organization_slug"], module.ORG_SLUG)
        position, verein = config["registration_questions"]
        self.assertEqual(position["key"], "position")
        self.assertEqual(position["options"], ["Feldspieler", "Torwart"])
        self.assertEqual(verein["key"], "verein")
        self.assertIn("Kein Verein", verein["options"])
        self.assertEqual(verein["other_label"], "Anderer Verein")

    def test_exactly_five_inclusive_calendar_drafts(self):
        plan = module.prepare()
        self.assertEqual(len(plan["drafts"]), 5)
        self.assertEqual([d["start_date"] for d in plan["drafts"]], [
            "2027-01-04", "2027-03-22", "2027-06-28", "2027-08-02", "2027-10-04"
        ])
        self.assertEqual([d["end_date"] for d in plan["drafts"]], [
            "2027-01-07", "2027-03-25", "2027-07-01", "2027-08-05", "2027-10-07"
        ])
        for draft in plan["drafts"]:
            self.assertEqual(draft["capacity"], 70)
            self.assertEqual(draft["status"], "draft")
            self.assertIsNone(draft["price_cents"])

    def test_existing_rows_are_untouched_and_repeated_plan_is_idempotent(self):
        first = module.prepare(capacity=65)
        other = {"slug": "historic-2026", "status": "published", "registrations": 99}
        snapshot = {"organization_slug": module.ORG_SLUG, "camps": [other, *first["drafts"]]}
        second = module.prepare(snapshot, capacity=65)
        self.assertEqual(second["drafts"], [])
        self.assertEqual(len(second["already_present"]), 5)
        self.assertEqual(other, snapshot["camps"][0])

    def test_conflict_and_wrong_organization_fail_closed(self):
        camp = module.proposed_camps()[0].copy()
        camp["status"] = "published"
        with self.assertRaises(ValueError):
            module.prepare({"organization_slug": module.ORG_SLUG, "camps": [camp]})
        with self.assertRaises(ValueError):
            module.prepare({"organization_slug": "other-club", "camps": []})


if __name__ == "__main__":
    unittest.main()
