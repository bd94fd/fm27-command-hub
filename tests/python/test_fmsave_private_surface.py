"""Contract test for every fmsave symbol the mapper imports, private ones included.

The club-scoped fast paths deliberately reach into `fmsave._layouts`, `fmsave._save`,
`fmsave._scan`, and several `readers.*` modules to decode one club instead of the
whole save. That is what keeps a 250 MB save inside a small instance, but it also
means a patch release can break decoding without touching any public API.

This test scans the mapper for its own `from fmsave... import ...` statements and
asserts every name still resolves, so an upgrade fails in CI rather than on an
upload. It is self-maintaining: new imports are covered automatically.

Skipped when the real fmsave wheel is absent (the default CI image), so it never
turns a green build red for a missing dependency. The Docker image and local
development both have fmsave installed, which is where this matters.
"""

from __future__ import annotations

import importlib
import os
import re
import sys
import unittest


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")
MAPPER = os.path.join(PUBLIC_DIR, "fm-save-mapper.py")


def _has_real_fmsave() -> bool:
    try:
        import fmsave

        return callable(getattr(fmsave, "open", None)) and hasattr(fmsave, "__file__")
    except Exception:
        return False


HAS_FMSAVE = _has_real_fmsave()

_IMPORT_RE = re.compile(
    r"from\s+(fmsave[\w\.]*)\s+import\s+(\([^)]*\)|[^\n(]+)",
    re.MULTILINE,
)


def _parse_imports(source: str) -> list[tuple[str, list[str]]]:
    found: list[tuple[str, list[str]]] = []
    for match in _IMPORT_RE.finditer(source):
        module = match.group(1)
        raw = match.group(2).strip()
        if raw.startswith("("):
            raw = raw[1:-1]
        names: list[str] = []
        for chunk in raw.replace("\n", " ").split(","):
            name = chunk.strip().split(" as ")[0].strip()
            if name and name.isidentifier():
                names.append(name)
        if names:
            found.append((module, names))
    return found


@unittest.skipUnless(HAS_FMSAVE, "real fmsave wheel not installed")
class TestFmsavePrivateSurface(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        source = open(MAPPER, encoding="utf-8").read()
        cls.imports = _parse_imports(source)
        cls.source = source

    def test_imports_were_found(self) -> None:
        self.assertGreater(len(self.imports), 15, "mapper import scan produced nothing")

    def test_every_imported_symbol_still_exists(self) -> None:
        missing: list[str] = []
        for module_name, names in self.imports:
            try:
                module = importlib.import_module(module_name)
            except Exception as exc:
                missing.append(f"{module_name}: module import failed ({exc})")
                continue
            for name in names:
                if not hasattr(module, name):
                    missing.append(f"{module_name}.{name}")
        self.assertEqual(missing, [], "fmsave moved or renamed symbols the mapper needs")

    def test_private_modules_are_the_ones_we_know_about(self) -> None:
        """Record the private surface so an accidental new dependency is visible."""
        private = sorted({m for m, _ in self.imports if "._" in m or m.endswith("._layouts")})
        self.assertIn("fmsave._layouts", private)
        self.assertIn("fmsave._save", private)
        self.assertIn("fmsave._scan", private)
        self.assertLessEqual(
            len(private),
            6,
            f"private module surface grew to {len(private)}: {private}",
        )

    def test_injury_record_kinds_are_the_two_we_handle(self) -> None:
        from fmsave.models.injuries import InjuryRecordKind

        values = {member.value for member in InjuryRecordKind}
        self.assertEqual(values, {"history", "typed"})

    def test_positions_field_names(self) -> None:
        import dataclasses

        from fmsave.models.players import Positions

        names = {f.name for f in dataclasses.fields(Positions)}
        self.assertEqual(
            names,
            {
                "gk", "sw", "dl", "dc", "dr", "dm", "ml", "mc", "mr",
                "aml", "amc", "amr", "stc", "wbl", "wbr",
            },
        )

    def test_ability_reports_a_range_code_for_ranged_potential(self) -> None:
        import dataclasses

        from fmsave.models.players import Ability

        names = {f.name for f in dataclasses.fields(Ability)}
        self.assertIn("potential_range_code", names)

    def test_market_value_states(self) -> None:
        from fmsave.models.players import TransferValueState

        values = {member.value for member in TransferValueState}
        # The mapper treats "placeholder" (the 300m cap) and "zero" specially.
        self.assertIn("placeholder", values)
        self.assertIn("zero", values)

    def test_condition_and_sharpness_are_still_raw_u16(self) -> None:
        import dataclasses

        from fmsave.models.players import Player

        names = {f.name for f in dataclasses.fields(Player)}
        for field in ("raw_condition", "raw_match_sharpness"):
            self.assertIn(field, names)

    def test_potential_is_optional_so_range_codes_survive(self) -> None:
        """A ranged potential must stay distinguishable from a known one."""
        from fmsave.models.players import Ability

        annotations = Ability.__annotations__
        self.assertIn("potential_range_code", annotations)
        # `potential` is Optional[int]: None means "the save stored a range code".
        self.assertTrue(
            "None" in str(annotations.get("potential")),
            f"potential annotation changed: {annotations.get('potential')}",
        )

    def test_documented_traps_are_still_documented(self) -> None:
        """The mapper's comments cite fmsave's own warnings; keep them honest."""
        import fmsave.models.players as players_module

        doc = (players_module.__doc__ or "") + (
            getattr(players_module.Ability, "__doc__", "") or ""
        )
        self.assertIn("range code", doc)


if __name__ == "__main__":
    unittest.main()
