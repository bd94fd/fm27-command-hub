"""Real-save smoke test: decode a genuine .fm file through the mapper CLI.

Point `FM_SAVE_FIXTURE` at a save to run it. Without that variable the test skips, so
CI stays green on machines with no save file. Run it with the local fmsave venv so the
child mapper process can import fmsave:

    FM_SAVE_FIXTURE=~/Downloads/my-save.fm \
        .venv-fmsave/bin/python -m unittest tests.python.test_real_save_smoke -v

What it guards, all of which only a real save can prove:
- the club-scoped staff fast path ran instead of silently falling back (`warnings`),
- `secondaryRole` / `jobRatings` reach the payload on every staff row and keep their shape,
- fmsave 0.14.4's slotted sponsorship record serialises (every deal carries `dates_reordered`).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MAPPER = os.path.join(REPO_ROOT, "public", "fm-save-mapper.py")
FIXTURE = (os.environ.get("FM_SAVE_FIXTURE") or "").strip()
DECODE_TIMEOUT_SEC = 1800

JOB_RATING_KEYS = frozenset(
    {
        "fitness_coach",
        "goalkeeping_coach",
        "set_piece_coach",
        "loan_manager",
        "physio",
        "sports_scientist",
    }
)


def fast_path_fallbacks(payload: dict) -> list[str]:
    """Warnings that mean a club-scoped fast reader threw and degraded to a full scan."""
    return [w for w in payload.get("warnings") or [] if "_fast fallback" in str(w)]


def staff_shape_problems(staff: list[dict]) -> list[str]:
    """Field-level problems in the 0.14.4 staff additions, one message per offending row."""
    problems: list[str] = []
    for row in staff:
        name = row.get("name") or row.get("uid")
        if "secondaryRole" not in row:
            problems.append(f"{name}: no secondaryRole key")
        if "jobRatings" not in row:
            problems.append(f"{name}: no jobRatings key")
        ratings = row.get("jobRatings")
        if ratings is None:
            continue
        if not isinstance(ratings, dict):
            problems.append(f"{name}: jobRatings is {type(ratings).__name__}, not a dict")
            continue
        unknown = set(ratings) - JOB_RATING_KEYS
        if unknown:
            problems.append(f"{name}: unknown job rating keys {sorted(unknown)}")
        for key, value in ratings.items():
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 20:
                problems.append(f"{name}: {key}={value!r} is not an int in 1..20")
    return problems


def staff_with_extras(staff: list[dict]) -> int:
    """Staff rows carrying either a secondary job or Preferred Jobs ratings."""
    return sum(
        1
        for row in staff
        if row.get("secondaryRole") or isinstance(row.get("jobRatings"), dict)
    )


class TestSmokeCheckers(unittest.TestCase):
    """The checkers themselves, proven against fabricated payloads (no save needed)."""

    def test_clean_payload_has_no_problems(self) -> None:
        staff = [
            {
                "name": "Bram Peeters",
                "role": "Coach",
                "secondaryRole": "Set Piece Coach",
                "jobRatings": {"set_piece_coach": 19, "fitness_coach": 14},
            },
            {"name": "Legacy Coach", "role": "Scout", "secondaryRole": None, "jobRatings": None},
        ]
        self.assertEqual(staff_shape_problems(staff), [])
        self.assertEqual(staff_with_extras(staff), 1)

    def test_missing_keys_and_bad_ratings_are_reported(self) -> None:
        staff = [
            {"name": "No Keys", "role": "Coach"},
            {"name": "Bad Rating", "role": "Coach", "secondaryRole": None, "jobRatings": {"physio": 42}},
            {"name": "Bad Key", "role": "Coach", "secondaryRole": None, "jobRatings": {"striker_coach": 9}},
        ]
        problems = staff_shape_problems(staff)
        self.assertTrue(any("No Keys: no secondaryRole key" in p for p in problems))
        self.assertTrue(any("Bad Rating: physio=42" in p for p in problems))
        self.assertTrue(any("Bad Key: unknown job rating keys ['striker_coach']" in p for p in problems))
        self.assertEqual(staff_with_extras(staff), 2)

    def test_fast_path_fallbacks_are_extracted(self) -> None:
        payload = {"warnings": ["staff_fast fallback: TypeError", "finances: budget reached"]}
        self.assertEqual(fast_path_fallbacks(payload), ["staff_fast fallback: TypeError"])


@unittest.skipUnless(FIXTURE, "set FM_SAVE_FIXTURE to a .fm save to run the real-save smoke test")
class TestRealSaveSmoke(unittest.TestCase):
    payload: dict = {}

    @classmethod
    def setUpClass(cls) -> None:
        if not os.path.isfile(FIXTURE):
            raise AssertionError(f"FM_SAVE_FIXTURE is not a file: {FIXTURE}")
        completed = subprocess.run(
            [
                sys.executable,
                MAPPER,
                "--file",
                FIXTURE,
                "--scope",
                "managed_club_only",
                "--filename",
                os.path.basename(FIXTURE),
            ],
            capture_output=True,
            text=True,
            timeout=DECODE_TIMEOUT_SEC,
        )
        if completed.returncode != 0:
            raise AssertionError(
                f"mapper exited {completed.returncode}\n"
                f"stderr tail:\n{completed.stderr[-4000:]}"
            )
        try:
            cls.payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise AssertionError(
                f"mapper stdout was not JSON ({exc}); stderr tail:\n{completed.stderr[-2000:]}"
            ) from exc
        staff = cls.payload.get("staff") or []
        print(
            f"\n[real-save smoke] {os.path.basename(FIXTURE)}: "
            f"{len(staff)} staff, {staff_with_extras(staff)} with secondary job/Preferred Jobs, "
            f"{len(cls.payload.get('sponsorships') or [])} sponsorships, "
            f"{len(cls.payload.get('warnings') or [])} warnings"
        )

    def test_decode_reports_native_server_meta(self) -> None:
        meta = self.payload.get("meta") or {}
        self.assertEqual(meta.get("mountMode"), "NATIVE_SERVER")
        self.assertTrue(meta.get("fileName"))

    def test_no_club_scoped_fast_path_fell_back(self) -> None:
        self.assertEqual(
            fast_path_fallbacks(self.payload),
            [],
            "a fast reader threw and degraded to a full scan; the private fmsave surface moved",
        )

    def test_staff_carries_the_0_14_4_fields(self) -> None:
        staff = self.payload.get("staff") or []
        self.assertGreater(len(staff), 0, "no staff decoded at all")
        self.assertEqual(staff_shape_problems(staff), [])
        self.assertGreater(
            staff_with_extras(staff),
            0,
            "no staff row carried a secondary job or Preferred Jobs ratings; "
            "expected at least one on an FM27 save",
        )

    def test_sponsorship_records_serialise(self) -> None:
        deals = self.payload.get("sponsorships") or []
        if not deals:
            self.skipTest("this save has no sponsorships to check")
        for deal in deals:
            self.assertIn("dates_reordered", deal)
            self.assertIsInstance(deal["dates_reordered"], bool)


if __name__ == "__main__":
    unittest.main()
