"""Unit tests for the mapper's scale, enum, market-value, and injury semantics.

These cover the small pure helpers that decide what the UI shows for condition,
sharpness, transfer value, potential, and injuries. No .fm save is required: the
helpers take plain values or duck-typed rows, so a regression shows up in CI
instead of on someone's 250 MB upload.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest
from dataclasses import dataclass
from datetime import date
from enum import StrEnum


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")


def _install_stub_fmsave() -> None:
    """Stub fmsave only when the real wheel is unavailable.

    The other test module in this directory installs a stub unconditionally, so
    order matters; preferring the real package keeps the private-surface contract
    test running wherever fmsave is actually installed.
    """
    if "fmsave" in sys.modules:
        return
    try:
        import fmsave  # noqa: F401

        return
    except Exception:
        pass
    mod = types.ModuleType("fmsave")
    mod.__version__ = "0.14.3"
    mod.open = lambda *_a, **_kw: None  # type: ignore[attr-defined]
    sys.modules["fmsave"] = mod


def _load(name: str, filename: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, os.path.join(PUBLIC_DIR, filename))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_install_stub_fmsave()
mapper = _load("fm_save_mapper_under_test_correctness", "fm-save-mapper.py")


class InjuryRecordKind(StrEnum):
    """Mirror of fmsave.models.injuries.InjuryRecordKind."""

    HISTORY = "history"
    TYPED = "typed"


@dataclass
class FakeInjury:
    kind: object
    date: date | None = None
    type_name: str = "Hamstring Strain"
    player_uid: int = 1001
    is_active: bool = False


class TestPercentScaling(unittest.TestCase):
    def test_raw_store_is_fractional_percent(self) -> None:
        self.assertEqual(mapper._pct_from_raw(10000), 100)
        self.assertEqual(mapper._pct_from_raw(100), 1)
        self.assertEqual(mapper._pct_from_raw(5060), 51)
        self.assertEqual(mapper._pct_from_raw(0), 0)

    def test_exactly_one_hundred_raw_is_not_one_hundred_percent(self) -> None:
        # The old magnitude guess (`if parsed > 100`) passed 100 through as 100%.
        self.assertEqual(mapper._pct_from_raw(100), 1)
        self.assertNotEqual(mapper._pct_from_raw(100), 100)

    def test_negative_and_missing_are_none(self) -> None:
        self.assertIsNone(mapper._pct_from_raw(None))
        self.assertIsNone(mapper._pct_from_raw(-1))

    def test_scaled_fallback_still_clamps(self) -> None:
        self.assertIsNone(mapper._clamp_pct(None))
        self.assertEqual(mapper._clamp_pct(55), 55)
        # Documents the legacy magnitude guess that _pct_from_raw replaces:
        # a raw 255 here is read as 2.55% and rounded, not as an overloaded 100.
        self.assertEqual(mapper._clamp_pct(255), 3)


class TestEnumToken(unittest.TestCase):
    def test_strenum_and_plain_string(self) -> None:
        self.assertEqual(mapper._enum_token(InjuryRecordKind.TYPED), "typed")
        self.assertEqual(mapper._enum_token("History"), "history")
        self.assertEqual(mapper._enum_token(None), "")

    def test_plain_enum_style_dotted_value(self) -> None:
        self.assertEqual(mapper._enum_token("Kind.TYPED"), "typed")


class TestInjuryClassification(unittest.TestCase):
    GAME_DATE = date(2031, 3, 1)

    def test_typed_row_in_future_is_active(self) -> None:
        inj = FakeInjury(kind=InjuryRecordKind.TYPED, date=date(2031, 3, 20))
        is_active, kind, expected = mapper._injury_row_state(inj, self.GAME_DATE)
        self.assertTrue(is_active, "typed rows are the only current-availability store")
        self.assertEqual(kind, "typed")
        self.assertTrue(expected, "typed date is the expected return date")

    def test_typed_row_in_past_is_not_active(self) -> None:
        inj = FakeInjury(kind=InjuryRecordKind.TYPED, date=date(2031, 1, 5))
        is_active, _, _ = mapper._injury_row_state(inj, self.GAME_DATE)
        self.assertFalse(is_active)

    def test_history_row_never_active(self) -> None:
        inj = FakeInjury(kind=InjuryRecordKind.HISTORY, date=date(2031, 2, 28))
        is_active, _, expected = mapper._injury_row_state(inj, self.GAME_DATE)
        self.assertFalse(is_active)
        self.assertFalse(expected)

    def test_string_kind_still_classifies(self) -> None:
        inj = FakeInjury(kind="typed", date=date(2031, 4, 1))
        self.assertTrue(mapper._injury_row_state(inj, self.GAME_DATE)[0])

    def test_unknown_kind_falls_back_to_flags(self) -> None:
        active = FakeInjury(kind="", date=date(2031, 2, 25), is_active=True)
        self.assertTrue(mapper._injury_row_state(active, self.GAME_DATE)[0])
        stale = FakeInjury(kind="", date=date(2030, 1, 1))
        self.assertFalse(mapper._injury_row_state(stale, self.GAME_DATE)[0])

    def test_dedupe_keeps_two_injuries_of_one_type(self) -> None:
        first = {"playerUid": 7, "typeName": "Hamstring", "date": "01/02/2031"}
        second = {"playerUid": 7, "typeName": "Hamstring", "date": "20/02/2031"}
        self.assertNotEqual(mapper._injury_dedup_key(first), mapper._injury_dedup_key(second))

    def test_dedupe_matches_identical_rows(self) -> None:
        row = {"playerUid": 7, "typeName": "Hamstring", "date": "01/02/2031"}
        self.assertEqual(mapper._injury_dedup_key(row), mapper._injury_dedup_key(dict(row)))


class TestPositionRatings(unittest.TestCase):
    def test_sw_is_read_from_positions(self) -> None:
        """fmsave exposes `sw` on Positions; the mapper skipped it."""
        with open(os.path.join(PUBLIC_DIR, "fm-save-mapper.py"), encoding="utf-8") as fh:
            source = fh.read()
        self.assertIn('("SW", ("sw", "SW"))', source)
        self.assertIn('("ST", ("stc", "st", "STC", "ST"))', source)

    def test_positions_object_shape(self) -> None:
        # Guards against fmsave renaming stc/sw, which would blank those ratings.
        expected = {
            "gk", "sw", "dl", "dc", "dr", "dm", "ml", "mc", "mr",
            "aml", "amc", "amr", "stc", "wbl", "wbr",
        }
        try:
            from fmsave.models.players import Positions
        except Exception:
            self.skipTest("real fmsave not installed")
        import dataclasses

        names = {f.name for f in dataclasses.fields(Positions)}
        self.assertEqual(names, expected, "Positions field names changed upstream")


class TestPotentialAndValueSemantics(unittest.TestCase):
    def test_market_value_state_labels_are_present_in_source(self) -> None:
        with open(os.path.join(PUBLIC_DIR, "fm-save-mapper.py"), encoding="utf-8") as fh:
            source = fh.read()
        for label in ("marketValueState", "marketValueCapped", "potentialUncertain"):
            self.assertIn(label, source)

    def test_cap_threshold_is_the_documented_u32_ceiling(self) -> None:
        with open(os.path.join(PUBLIC_DIR, "fm-save-mapper.py"), encoding="utf-8") as fh:
            source = fh.read()
        self.assertIn("300_000_000", source)


if __name__ == "__main__":
    unittest.main()
