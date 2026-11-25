"""Unit tests for public/fm-save-mapper.py and public/fm_layout_patcher.py.

Uses lightweight stub modules so tests run cleanly in CI and local Python 3.12+
without requiring the real fmsave wheel or a binary .fm save file.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import types
import unittest
from datetime import date


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")


def _install_stub_fmsave() -> types.ModuleType:
    """Install a minimal stub fmsave module tree if fmsave is not installed."""
    if "fmsave" in sys.modules:
        return sys.modules["fmsave"]
    try:
        import fmsave  # real wheel wins when installed (Docker/CI with the dependency)

        return fmsave
    except Exception:
        pass
    mod = types.ModuleType("fmsave")
    mod.__version__ = "0.14.4"
    mod.open = lambda *_a, **_kw: None  # type: ignore[attr-defined]
    sys.modules["fmsave"] = mod
    return mod


def _load_module(name: str, file_path: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, file_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_install_stub_fmsave()
layout_patcher = _load_module(
    "fm_layout_patcher", os.path.join(PUBLIC_DIR, "fm_layout_patcher.py")
)
mapper = _load_module(
    "fm_save_mapper_under_test", os.path.join(PUBLIC_DIR, "fm-save-mapper.py")
)


class _DummyContext:
    def __init__(self, cache: dict[str, object]) -> None:
        self._cache = cache


class _DummySave:
    def __init__(self, cache: dict[str, object]) -> None:
        self._context = _DummyContext(cache)

    def close(self) -> None:
        pass


class _TrackableMemoryView:
    """Tracks whether memoryview-like object is explicitly released."""

    def __init__(self, data: bytes) -> None:
        self._mv = memoryview(data)
        self.released = False

    def __len__(self) -> int:
        return len(self._mv)

    def __getitem__(self, key: object) -> object:
        return self._mv[key]  # type: ignore[index]

    def release(self) -> None:
        self.released = True
        self._mv.release()


class TestFmSaveMapperHardening(unittest.TestCase):
    def setUp(self) -> None:
        mapper.step_close()
        layout_patcher.reset_patch_telemetry()

    def tearDown(self) -> None:
        mapper.step_close()
        layout_patcher.reset_patch_telemetry()

    def test_evict_finished_span_phase_cache_drops_span_keeps_club_and_team(self) -> None:
        cache = {
            "span_records": [1, 2, 3],
            "fixture_index": {"a": 1},
            "league_table_cache": {"b": 2},
            "competition_rules_map": {"c": 3},
            "stage_index": {"d": 4},
            "stadium_names": {"e": 5},
            "club_index": {"keep": True},
            "club_span_bridge": {"keep_club": True},
            "team_index": {"keep_team": True},
            "managed_gate": {"keep_other": True},
        }
        save = _DummySave(cache)
        mapper._evict_finished_span_phase_cache(save)

        for dropped in (
            "span_records",
            "fixture_index",
            "league_table_cache",
            "competition_rules_map",
            "stage_index",
            "stadium_names",
        ):
            self.assertNotIn(dropped, cache)

        self.assertIn("club_index", cache)
        self.assertIn("club_span_bridge", cache)
        self.assertIn("team_index", cache)
        self.assertIn("managed_gate", cache)

    def test_step_close_clears_player_match_stats_raw_and_players_fast_decoded(self) -> None:
        mapper._STATE["player_match_stats_raw"] = {"101": [{"rating": 7.5}]}
        mapper._STATE["players_fast_decoded"] = True
        mapper.step_close()

        self.assertNotIn("player_match_stats_raw", mapper._STATE)
        self.assertFalse(mapper._STATE.get("players_fast_decoded"))

    def test_finalize_payload_dict_and_step_finalize_scrub_ca_pa_identically(self) -> None:
        def _seed() -> None:
            mapper._STATE["meta"] = {
                "saveName": "test.fm",
                "clubName": "KVV Zelzate",
                "gameDate": "2027-02-15",
                "build": "27.1.0",
            }
            mapper._STATE["players_out"] = [
                {
                    "uid": 101,
                    "name": "Test Striker",
                    "ca": 145,
                    "pa": 165,
                    "currentAbility": 145,
                    "potentialAbility": 165,
                    "ability": 3.5,
                    "attributes": {"finishing": 15},
                }
            ]

        _seed()
        dict_payload = mapper._finalize_payload_dict()
        _seed()
        step_payload = json.loads(mapper.step_finalize())

        self.assertEqual(dict_payload, step_payload)
        p0 = step_payload["players"][0]
        self.assertNotIn("ca", p0)
        self.assertNotIn("pa", p0)
        self.assertNotIn("currentAbility", p0)
        self.assertNotIn("potentialAbility", p0)
        self.assertEqual(p0["name"], "Test Striker")
        self.assertEqual(p0["ability"], 3.5)

    def test_step_4_4_respects_players_fast_decoded_after_step_4_3_clears_club_index_refs(
        self,
    ) -> None:
        calls = {"contracts": 0, "bans": 0}

        class _FailIfCalledSave:
            def contracts(self) -> list[object]:
                calls["contracts"] += 1
                return []

            def bans(self) -> list[object]:
                calls["bans"] += 1
                return []

        mapper._STATE["save"] = _FailIfCalledSave()
        mapper._STATE["squad_uids"] = {101}
        mapper._STATE["players_out"] = [{"uid": 101, "name": "Test Player", "wagePw": 500}]
        mapper._STATE["club_index_refs"] = None  # cleared by step_4_3_season_history
        mapper._STATE["players_fast_decoded"] = True
        mapper._STATE["missing_contract_uids"] = set()
        mapper._STATE["suspensions_hint_uids"] = set()

        result = json.loads(mapper.step_4_4_contracts_and_suspensions(fast_sync=False))
        self.assertEqual(calls["contracts"], 0)
        self.assertEqual(calls["bans"], 0)
        self.assertEqual(result["suspensionsCount"], 0)

    def test_staff_people_management_preferred_over_legacy_man_management(self) -> None:
        class _StaffAttrs:
            people_management = 18
            attacking = 15
            tactical = 14
            judging_player_ability = 13
            judging_player_potential = 13

        class _StaffRow:
            uid = 501
            name = "Head Coach"
            role = "Assistant Manager"
            club_uid = 77
            age = 42
            nationality = "BEL"
            wage = 900
            contract_expiry = date(2028, 6, 30)
            attributes = _StaffAttrs()

        class _StaffSave:
            def staff(self) -> list[object]:
                return [_StaffRow()]

            def clubs(self) -> list[object]:
                return []

        mapper._STATE["save"] = _StaffSave()
        mapper._STATE["club_uid"] = 77
        mapper._STATE["club_name"] = "KVV Zelzate"
        mapper._STATE["game_date"] = date(2027, 2, 15)

        mapper.step_3_2_staff()
        staff_out = mapper._STATE["staff_out"]
        self.assertEqual(len(staff_out), 1)
        self.assertEqual(staff_out[0]["attributes"]["man_management"], 18)

    def test_team_match_stats_fast_handles_generator_and_releases_memoryview(self) -> None:
        """Verify _extract_club_team_match_stats_fast coerces generators before reversed(),
        returns newest-first entries, and always releases the section memoryview."""
        from datetime import datetime

        mod_names = (
            "fmsave._layouts",
            "fmsave._save",
            "fmsave.models",
            "fmsave.models.team_match_stats",
            "fmsave.readers",
            "fmsave.readers.team_match_stats",
        )
        saved_modules = {k: sys.modules.get(k) for k in mod_names}
        view_holder: dict[str, _TrackableMemoryView] = {}

        class _FakeHeader:
            def __init__(self, idx: int, team_id: int) -> None:
                self.idx = idx
                self.competition_id = 1
                self.home_team_id = team_id
                self.away_team_id = 999
                self.kick_off = datetime(2027, 2, 1 + idx, 15, 0)

            def __hash__(self) -> int:
                return hash((self.idx, self.home_team_id, self.away_team_id))

            def __eq__(self, other: object) -> bool:
                return isinstance(other, _FakeHeader) and self.idx == other.idx

        class _FakeSectionCtx:
            def __enter__(self) -> bytes:
                return b"\x00\x01\x02\x03" * 8

            def __exit__(self, *_args: object) -> None:
                pass

        class _FakeCtx:
            info = types.SimpleNamespace(
                section_schemas={"match_reports": object()},
                build="27.1.0",
                known_build=True,
                file_name="test.fm",
            )

            def section(self, _name: str) -> _FakeSectionCtx:
                return _FakeSectionCtx()

        class _FakeSave:
            _context = _FakeCtx()

        fake_layout = types.SimpleNamespace(
            anchor_run=b"ANCH",
            record_variants=(),
            maximum_expansion=10,
            maximum_report_bytes=4096,
        )

        layouts_mod = types.ModuleType("fmsave._layouts")
        layouts_mod.MatchReportLayout = object  # type: ignore[attr-defined]
        layouts_mod.find_layout = lambda *_a: types.SimpleNamespace(  # type: ignore[attr-defined]
            layout=fake_layout, exact=True
        )

        save_mod = types.ModuleType("fmsave._save")
        save_mod.MATCH_REPORTS_SECTION = "match_reports"  # type: ignore[attr-defined]

        models_pkg = types.ModuleType("fmsave.models")
        tms_model_mod = types.ModuleType("fmsave.models.team_match_stats")
        tms_model_mod.TeamMatchStats = lambda **kw: types.SimpleNamespace(**kw)  # type: ignore[attr-defined]

        readers_pkg = types.ModuleType("fmsave.readers")
        tms_mod = types.ModuleType("fmsave.readers.team_match_stats")
        tms_mod.index_entries = lambda *_a, **_kw: ((i * 4, 4) for i in range(4))  # type: ignore[attr-defined]
        tms_mod._decompress = lambda chunk, _l: bytes([chunk[0]]) + b"RPT"  # type: ignore[attr-defined]
        tms_mod._header = lambda report, _l: _FakeHeader(report[0], 42)  # type: ignore[attr-defined]
        tms_mod._squads = lambda *_a: types.SimpleNamespace(  # type: ignore[attr-defined]
            home="H", away="A", detailed=True, trailing_walk=False
        )
        tms_mod._team_values = lambda *_a: {  # type: ignore[attr-defined]
            "passes_completed": 100,
            "ball_distribution_units": 50,
            "xg": 1.2,
        }
        tms_mod._possession = lambda h, a: (50, 50)  # type: ignore[attr-defined]
        tms_mod._shares_half_up = lambda h, a: (50, 50)  # type: ignore[attr-defined]

        # Encode index 0..3 into bytes 0, 4, 8, 12 of section buffer
        section_bytes = bytearray(16)
        for i in range(4):
            section_bytes[i * 4] = i

        class _IndexedSectionCtx(_FakeSectionCtx):
            def __enter__(self) -> bytes:
                return bytes(section_bytes)

        _FakeCtx.section = lambda self, _n: _IndexedSectionCtx()  # type: ignore[method-assign]

        sys.modules["fmsave._layouts"] = layouts_mod
        sys.modules["fmsave._save"] = save_mod
        sys.modules["fmsave.models"] = models_pkg
        sys.modules["fmsave.models.team_match_stats"] = tms_model_mod
        sys.modules["fmsave.readers"] = readers_pkg
        sys.modules["fmsave.readers.team_match_stats"] = tms_mod

        orig_mv = mapper.__dict__.get("memoryview")

        def _fake_mv(buf: bytes) -> _TrackableMemoryView:
            mv = _TrackableMemoryView(buf)
            view_holder["mv"] = mv
            return mv

        mapper.__dict__["memoryview"] = _fake_mv
        try:
            rows = mapper._extract_club_team_match_stats_fast(_FakeSave(), 42)
            self.assertIsNotNone(rows)
            assert rows is not None
            home_days = [r.date.day for r in rows if r.is_home]
            # Entries 0..3 iterated newest-first -> days 4, 3, 2, 1
            self.assertEqual(home_days, [4, 3, 2, 1])
            self.assertIn("mv", view_holder)
            self.assertTrue(view_holder["mv"].released)
        finally:
            if orig_mv is None:
                mapper.__dict__.pop("memoryview", None)
            else:
                mapper.__dict__["memoryview"] = orig_mv
            for k, v in saved_modules.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v

    def test_layout_patcher_reset_telemetry_and_clean_status(self) -> None:
        layout_patcher._note_fallback("test_section")
        snap = layout_patcher.get_patch_telemetry()
        self.assertEqual(snap["fallbacks"].get("test_section"), 1)

        layout_patcher.reset_patch_telemetry()
        clean = layout_patcher.get_patch_telemetry()
        self.assertEqual(clean["fallbacks"], {})
        summary = layout_patcher.build_patch_compatibility_summary("27.1.0+2505117")
        club_table_sec = next(
            s for s in summary["sections"] if s["id"] == "club_table"
        )
        self.assertNotEqual(club_table_sec["status"], "fallback")

    def test_scan_shortlist_entries_from_humans_bytes_anchored_and_empty(self) -> None:
        import struct

        # Pack FM 4-byte date: day 102 of 2027 -> 2027-04-12
        dt_bytes = struct.pack("<HH", (0x6A00 | 102), 2027)
        focus_prefix = b"\x00" * 128 + b"\xfe\x03\xff\xff\xff\xff" + struct.pack("<I", 28000) + (b"\x00" * 14)

        # 1. Populated shortlist: 2 valid players (with duplicate) + 1 staff entry (kind=2, ignored)
        entries_buf = (
            struct.pack("<I", 4)
            + struct.pack("<HI", 1, 101) + dt_bytes
            + struct.pack("<HI", 2, 555) + dt_bytes
            + struct.pack("<HI", 1, 202) + dt_bytes
            + struct.pack("<HI", 1, 101) + dt_bytes
        )
        hb = focus_prefix + entries_buf + (b"\x00" * 64)
        parsed = mapper._scan_shortlist_entries_from_humans_bytes(hb, valid_pindices={100, 201})
        self.assertEqual([sel for sel, _ in parsed], [101, 202])
        self.assertEqual(str(parsed[0][1]), "2027-04-12")

        # 2. Explicitly empty shortlist (count=0): returns []
        hb_empty = focus_prefix + struct.pack("<I", 0) + (b"\x00" * 64)
        self.assertEqual(mapper._scan_shortlist_entries_from_humans_bytes(hb_empty, valid_pindices={100}), [])

    def test_extract_manager_shortlist_rich_fields_and_zero_ca_pa(self) -> None:
        from datetime import date

        mapper.step_close()
        mapper._STATE["players_out"] = [{"uid": 9001, "name": "Already Ours"}]

        class _Clause:
            def __init__(self, kind: str, value: int) -> None:
                self.kind = kind
                self.value = value
                self.parameter = None

        class _Contract:
            def __init__(self, wage: int, end_dt: date) -> None:
                self.wage = wage
                self.end = end_dt
                self.squad_status = "REGULAR_STARTER"
                self.clauses = [_Clause("MINIMUM_FEE_RELEASE", 45000)]

        class _Attrs:
            def __init__(self) -> None:
                for k in (
                    "corners", "crossing", "dribbling", "finishing", "first_touch",
                    "free_kick_taking", "heading", "long_shots", "long_throws", "marking",
                    "passing", "penalty_taking", "tackling", "technique", "aggression",
                    "anticipation", "bravery", "composure", "concentration", "decisions",
                    "determination", "flair", "leadership", "off_the_ball", "positioning",
                    "teamwork", "vision", "work_rate", "acceleration", "agility", "balance",
                    "jumping_reach", "natural_fitness", "pace", "stamina", "strength",
                    "aerial_reach", "command_of_area", "communication", "eccentricity",
                    "handling", "kicking", "one_on_ones", "punching", "reflexes",
                    "rushing_out", "throwing",
                ):
                    setattr(self, k, 14)
                self.determination = 17
                self.left_foot = 18
                self.right_foot = 8

        class _ShortlistPlayer:
            def __init__(self, uid: int, name: str, club_uid: int | None, club_name: str | None, wage: int, tv: int | None) -> None:
                self.uid = uid
                self.name = name
                self.age = 21
                self.nation_id = 0
                self.club_uid = club_uid
                self.club_name = club_name
                self.natural_positions = ("DR",)
                self.accomplished_positions = ("WBR", "DL")
                self.positions = {"dr": 20, "wbr": 17, "dl": 15}
                self.attributes = _Attrs()
                self.personality = types.SimpleNamespace(professionalism=17, ambition=15, consistency=16, important_matches=15, injury_proneness=5, versatility=16)
                self.traits = ("Gets Forward Whenever Possible",)
                self.height = 182
                self.transfer_value = tv
                self.transfer_value_state = "ok" if tv else "zero"
                self.contract = _Contract(wage, date(2028, 6, 30)) if club_uid else None
                self.ability = types.SimpleNamespace(current=115, potential=142)

        class _MockSave:
            def nations(self) -> list[object]:
                return [types.SimpleNamespace(nation_id=0, database_id=757)]

            def shortlist(self) -> list[object]:
                return [
                    _ShortlistPlayer(501, "Arne De Schepper", 777, "SK Roeselare", 260, 12000),
                    _ShortlistPlayer(502, "Benoit Olivier", None, None, 0, None),
                    _ShortlistPlayer(999, "Own Club Player", 18104898, "KVV Zelzate", 300, 15000),
                    _ShortlistPlayer(9001, "Already Ours", 888, "Other FC", 200, 5000),
                ]

        out = mapper.deep_scrub_ca_pa(
            mapper._extract_manager_shortlist(_MockSave(), club_uid=18104898, game_date=date(2027, 9, 15))
        )
        self.assertEqual([t["name"] for t in out], ["Arne De Schepper", "Benoit Olivier"])
        first = out[0]
        self.assertEqual(first["shortlistOrigin"], "in_game_shortlist")
        self.assertEqual(first["nationality"], "Belgium")
        self.assertEqual(first["preferredFoot"], "Left")
        self.assertEqual(first["heightCm"], 182)
        self.assertEqual(first["currentWagePw"], 260)
        self.assertEqual(first["transferValue"], 12000)
        self.assertEqual(first["transferValueState"], "ok")
        self.assertEqual(first["secondaryPositions"], ["WBR", "DL"])
        self.assertEqual(first["contractDetails"]["releaseClauses"][0]["amount"], 45000)
        self.assertTrue(bool(first["personality"]))
        self.assertIn("Consistent Performer", first["scoutBadges"])
        self.assertNotIn("ca", first)
        self.assertNotIn("pa", first)


class TestFmsave0144Adoption(unittest.TestCase):
    """fmsave 0.14.4 additions: staff jobs, native-first role labels, sponsorship flags."""

    class _StaffJob:
        def __init__(self, name: str) -> None:
            self.label = types.SimpleNamespace(name=name)

    def _staff(self, with_new_fields: bool) -> object:
        staff = types.SimpleNamespace(uid=77, name="Kris De Vos")
        if with_new_fields:
            staff.secondary_job = self._StaffJob("SET_PIECE_COACH")
            staff.job_ratings = types.SimpleNamespace(
                fitness_coach=12,
                goalkeeping_coach=4,
                set_piece_coach=17,
                loan_manager=None,
                physio=3,
                sports_scientist=9,
            )
        return staff

    def test_staff_secondary_job_and_job_ratings_are_version_gated(self) -> None:
        original = mapper.fmsave.__version__
        try:
            mapper.fmsave.__version__ = "0.14.4"
            staff = self._staff(with_new_fields=True)
            self.assertEqual(mapper._resolve_staff_secondary_job(staff), "Set Piece Coach")
            self.assertEqual(
                mapper._resolve_staff_job_ratings(staff),
                {
                    "fitness_coach": 12,
                    "goalkeeping_coach": 4,
                    "set_piece_coach": 17,
                    "loan_manager": None,
                    "physio": 3,
                    "sports_scientist": 9,
                },
            )

            # 0.14.3 predates both fields: the mapper must not invent them.
            mapper.fmsave.__version__ = "0.14.3"
            self.assertIsNone(mapper._resolve_staff_secondary_job(staff))
            self.assertIsNone(mapper._resolve_staff_job_ratings(staff))
        finally:
            mapper.fmsave.__version__ = original

    def test_staff_job_ratings_absent_when_save_carries_none(self) -> None:
        self.assertIsNone(mapper._resolve_staff_job_ratings(self._staff(with_new_fields=False)))
        self.assertIsNone(mapper._resolve_staff_secondary_job(self._staff(with_new_fields=False)))

    def test_role_labels_stay_native_first_and_report_their_source(self) -> None:
        # Native wins even when fmsave disagrees, so the UI keeps its verified names.
        self.assertEqual(
            mapper._resolve_tactic_slot_roles("Inside Winger", "Tracking Winger", "Inverted Winger", "Wide Midfielder"),
            ("Inside Winger", "Tracking Winger", "native"),
        )
        # Upstream fills the gaps where the bit table has no role for the slot — but only with
        # names the Hub's own vocabulary knows ("Inverted Winger" is not in fm27Roles.json).
        self.assertEqual(
            mapper._resolve_tactic_slot_roles(None, "Tracking Winger", "Inverted Winger", "Wide Midfielder"),
            (None, "Tracking Winger", "native"),
        )
        self.assertEqual(
            mapper._resolve_tactic_slot_roles(None, None, "Inverted Winger", "Wide Midfielder"),
            (None, "Wide Midfielder", "upstream"),
        )
        self.assertEqual(
            mapper._resolve_tactic_slot_roles(None, None, None, None),
            (None, None, "none"),
        )

    def test_native_role_decoder_reads_the_slot_role_bits(self) -> None:
        # 0x400004 (DR, FB) decodes through the slot's secondHigh word, as upstream reports it.
        self.assertEqual(
            mapper._decode_fm27_native_role("ip", [{"secondHigh": 0x400004}], 0),
            "Full-Back",
        )
        self.assertEqual(
            mapper._decode_fm27_native_role("oop", [{"secondHigh": 0x800002}], 0),
            "Sweeper Keeper",
        )
        self.assertIsNone(mapper._decode_fm27_native_role("ip", [{"secondHigh": 0x400000}], 0))

    def test_sponsorship_dataclass_serializes_dates_reordered(self) -> None:
        from dataclasses import dataclass

        @dataclass(frozen=True, slots=True)
        class FakeSponsorship:
            club_uid: int
            start: date
            end: date
            dates_reordered: bool

        out = mapper._to_json_safe(
            FakeSponsorship(club_uid=9, start=date(2026, 7, 1), end=date(2027, 6, 30), dates_reordered=True)
        )
        self.assertEqual(
            out,
            {
                "club_uid": 9,
                "start": "2026-07-01",
                "end": "2027-06-30",
                "dates_reordered": True,
            },
        )


if __name__ == "__main__":
    unittest.main()

