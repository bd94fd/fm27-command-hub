"""Parity test: fmsave's own tactic role labels vs the Hub's native bit tables.

fmsave 0.14.4 started naming tactic roles itself (`_IN_POSSESSION_ROLES` /
`_OUT_OF_POSSESSION_ROLES` in `fmsave.readers.tactics`). The mapper still resolves role
names from `_FM27_IP_ROLE_BY_BIT` / `_FM27_OOP_ROLE_BY_BIT` first, because those names are
what the UI, the Analyst prompt, `fm27Roles.json`, and the role matcher already agree on.
This test pins that arrangement: for every (position, role_bits) combo upstream ships, the
native decode must either agree with upstream's label or resolve nothing at all. A
disagreement would silently rename a role in the UI while the Analyst kept the old name.

The upstream table is frozen here so the check runs in CI, where the fmsave wheel is not
installed. When the real wheel *is* importable the test also asserts the frozen copy still
matches it, so a future bump cannot leave this reference stale.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")

# Snapshot of fmsave 0.14.4 fmsave/readers/tactics.py.
FMSAVE_0144_IP_ROLES = (
    ("GOALKEEPER", 0x401000, "Ball-Playing Goalkeeper"),
    ("DEFENDER_RIGHT", 0x400004, "Full-Back"),
    ("DEFENDER_RIGHT", 0x400008, "Wing-Back"),
    ("DEFENDER_LEFT", 0x400004, "Full-Back"),
    ("DEFENDER_LEFT", 0x400008, "Wing-Back"),
    ("DEFENDER_CENTRE", 0x200002, "Centre-Back"),
    ("DEFENDER_CENTRE", 0x1200000, "Ball-Playing Centre-Back"),
    ("DEFENDER_CENTRE", 0x204000, "Advanced Centre-Back"),
    ("DEFENDER_CENTRE", 0x20200000, "No-Nonsense Centre-Back"),
    ("DEFENSIVE_MIDFIELDER", 0x408000, "Deep-Lying Playmaker"),
    ("DEFENSIVE_MIDFIELDER", 0x410000, "Box-to-Box Midfielder"),
    ("DEFENSIVE_MIDFIELDER", 0x200010, "Defensive Midfielder"),
    ("ATTACKING_MIDFIELDER_RIGHT", 0x400000, "Inverted Winger"),
    ("ATTACKING_MIDFIELDER_RIGHT", 0x8800000, "Inside Forward"),
    ("ATTACKING_MIDFIELDER_LEFT", 0x400000, "Inverted Winger"),
    ("ATTACKING_MIDFIELDER_LEFT", 0x8800000, "Inside Forward"),
    ("STRIKER_CENTRE", 0x800800, "Centre Forward"),
)
FMSAVE_0144_OOP_ROLES = (
    ("GOALKEEPER", 0x400001, "Goalkeeper"),
    ("GOALKEEPER", 0x800002, "Sweeper Keeper"),
    ("DEFENDER_RIGHT", 0x200200, "Full-Back"),
    ("DEFENDER_LEFT", 0x200200, "Full-Back"),
    ("DEFENDER_CENTRE", 0x200008, "Centre-Back"),
    ("DEFENDER_CENTRE", 0x200010, "Stopping Centre-Back"),
    ("DEFENDER_CENTRE", 0x200020, "Covering Centre-Back"),
    ("DEFENSIVE_MIDFIELDER", 0x208000, "Defensive Midfielder"),
    ("DEFENSIVE_MIDFIELDER", 0x420000, "Pressing Defensive Midfielder"),
    ("MIDFIELDER_RIGHT", 0x400000, "Wide Midfielder"),
    ("MIDFIELDER_LEFT", 0x400000, "Wide Midfielder"),
    ("ATTACKING_MIDFIELDER_RIGHT", 0x200000, "Tracking Winger"),
    ("ATTACKING_MIDFIELDER_LEFT", 0x200000, "Tracking Winger"),
    ("ATTACKING_MIDFIELDER_CENTRE", 0x80200000, "Tracking Attacking Midfielder"),
    ("ATTACKING_MIDFIELDER_CENTRE", 0x40400000, "Attacking Midfielder"),
    ("STRIKER_CENTRE", 0x400000, "Centre Forward"),
)

# Combos where the role field carries only duty bits, so the native tables have no name.
# Upstream still names them, and the mapper falls back to that label.
EXPECTED_NATIVE_GAPS_IP = frozenset({("ATTACKING_MIDFIELDER_RIGHT", 0x400000), ("ATTACKING_MIDFIELDER_LEFT", 0x400000)})
EXPECTED_NATIVE_GAPS_OOP = frozenset(
    {
        ("MIDFIELDER_RIGHT", 0x400000),
        ("MIDFIELDER_LEFT", 0x400000),
        ("ATTACKING_MIDFIELDER_RIGHT", 0x200000),
        ("ATTACKING_MIDFIELDER_LEFT", 0x200000),
        ("STRIKER_CENTRE", 0x400000),
    }
)


def _install_stub_fmsave() -> None:
    if "fmsave" in sys.modules:
        return
    try:
        import fmsave  # noqa: F401  (real wheel wins when installed)
        return
    except Exception:
        pass
    mod = types.ModuleType("fmsave")
    mod.__version__ = "0.14.4"
    mod.open = lambda *_a, **_kw: None  # type: ignore[attr-defined]
    sys.modules["fmsave"] = mod


def _load_mapper() -> types.ModuleType:
    _install_stub_fmsave()
    spec = importlib.util.spec_from_file_location(
        "fm_save_mapper_role_parity", os.path.join(PUBLIC_DIR, "fm-save-mapper.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _real_upstream_tables() -> tuple[tuple[tuple[str, int, str], ...], tuple[tuple[str, int, str], ...]] | None:
    """Upstream's live tables, or None when only the test stub is importable."""
    installed = sys.modules.get("fmsave")
    if installed is not None and not hasattr(installed, "__file__"):
        return None
    try:
        from fmsave.readers.tactics import (  # type: ignore[import-not-found]
            _IN_POSSESSION_ROLES,
            _OUT_OF_POSSESSION_ROLES,
        )
    except Exception:
        return None
    return (
        tuple((pos.name, bits, label) for (pos, bits), label in _IN_POSSESSION_ROLES.items()),
        tuple((pos.name, bits, label) for (pos, bits), label in _OUT_OF_POSSESSION_ROLES.items()),
    )


mapper = _load_mapper()


class TestTacticRoleLabelParity(unittest.TestCase):
    def test_native_decode_never_contradicts_upstream_role_labels(self) -> None:
        contradictions: list[str] = []
        for phase, combos, table in (
            ("ip", FMSAVE_0144_IP_ROLES, mapper._FM27_IP_ROLE_BY_BIT),
            ("oop", FMSAVE_0144_OOP_ROLES, mapper._FM27_OOP_ROLE_BY_BIT),
        ):
            for position, role_bits, upstream_label in combos:
                native_label = mapper._decode_fm27_native_role(
                    phase, [{"secondHigh": role_bits}], 0
                )
                if native_label is None:
                    continue
                if native_label != upstream_label:
                    contradictions.append(
                        f"{phase} {position} 0x{role_bits:X}: native {native_label!r} != upstream {upstream_label!r}"
                    )
        self.assertEqual(contradictions, [], "native role tables renamed a role upstream also names")

    def test_native_table_gaps_are_the_documented_ones(self) -> None:
        def gaps(phase: str, combos: tuple[tuple[str, int, str], ...]) -> set[tuple[str, int]]:
            return {
                (position, role_bits)
                for position, role_bits, _label in combos
                if mapper._decode_fm27_native_role(phase, [{"secondHigh": role_bits}], 0) is None
            }

        self.assertEqual(gaps("ip", FMSAVE_0144_IP_ROLES), set(EXPECTED_NATIVE_GAPS_IP))
        self.assertEqual(gaps("oop", FMSAVE_0144_OOP_ROLES), set(EXPECTED_NATIVE_GAPS_OOP))

    def test_every_native_label_is_a_real_role_name(self) -> None:
        # Guards against a typo'd bit entry: each label must exist in the IP or OOP vocabulary.
        known = set(mapper._FM27_IP_ROLE_BY_BIT.values()) | set(mapper._FM27_OOP_ROLE_BY_BIT.values())
        for position, role_bits, upstream_label in FMSAVE_0144_IP_ROLES + FMSAVE_0144_OOP_ROLES:
            native_label = mapper._decode_fm27_native_role(
                "ip", [{"secondHigh": role_bits}], 0
            ) or mapper._decode_fm27_native_role("oop", [{"secondHigh": role_bits}], 0)
            if native_label is not None:
                self.assertIn(native_label, known, f"{position} 0x{role_bits:X}")

    def test_frozen_upstream_table_matches_installed_fmsave(self) -> None:
        live = _real_upstream_tables()
        if live is None:
            self.skipTest("fmsave wheel not importable here; frozen 0.14.4 snapshot is the CI gate")
        live_ip, live_oop = live
        self.assertEqual(live_ip, FMSAVE_0144_IP_ROLES)
        self.assertEqual(live_oop, FMSAVE_0144_OOP_ROLES)

    def test_slot_resolver_keeps_native_names_and_never_invents_a_role(self) -> None:
        # Native label present: native wins even when upstream disagrees, source 'native'.
        self.assertEqual(
            mapper._resolve_tactic_slot_roles("Ball-Playing Goalkeeper", "Sweeper Keeper", "Keeper", "Sweeper"),
            ("Ball-Playing Goalkeeper", "Sweeper Keeper", "native"),
        )
        # Native gap, upstream label is in the Hub vocabulary: upstream fills the gap.
        self.assertEqual(
            mapper._resolve_tactic_slot_roles(None, None, "Inverted Winger", "Wide Midfielder"),
            (None, "Wide Midfielder", "upstream"),
        )
        # Native gap, upstream label unknown to the Hub (fm27Roles.json has no "Inverted Winger"):
        # the slot stays empty exactly as it did on fmsave 0.14.3.
        self.assertEqual(
            mapper._resolve_tactic_slot_roles(None, "Winger", "Inverted Winger", "Winger"),
            (None, "Winger", "native"),
        )
        self.assertEqual(
            mapper._resolve_tactic_slot_roles(None, None, "Inverted Winger", "Inverted Winger"),
            (None, None, "none"),
        )

    def test_no_upstream_only_label_can_reach_the_slot_fields(self) -> None:
        unknown: list[str] = []
        for phase, combos in (
            ("ip", FMSAVE_0144_IP_ROLES),
            ("oop", FMSAVE_0144_OOP_ROLES),
        ):
            for position, role_bits, upstream_label in combos:
                native_label = mapper._decode_fm27_native_role(phase, [{"secondHigh": role_bits}], 0)
                slot_ip, slot_oop, _source = mapper._resolve_tactic_slot_roles(
                    native_label if phase == "ip" else None,
                    native_label if phase == "oop" else None,
                    upstream_label if phase == "ip" else None,
                    upstream_label if phase == "oop" else None,
                )
                for label in (slot_ip, slot_oop):
                    if label is not None and label not in mapper._KNOWN_ROLE_LABELS:
                        unknown.append(f"{phase} {position} 0x{role_bits:X}: {label!r}")
        self.assertEqual(unknown, [], "slot roles must stay inside the Hub's own role vocabulary")


if __name__ == "__main__":
    unittest.main()
