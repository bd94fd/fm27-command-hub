"""Real-save decoder regression guard.

Real .fm files are never committed. The corpus lives in `.agents_tmp/uploads/`
or in the directory named by `FM27_REAL_SAVE_DIR`. CI runs this test only when
that directory is available, and the manifest stores hashes and counts only.
"""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import real_save_regression as regression


class TestRealSaveManifest(unittest.TestCase):
    def test_manifest_is_safe_and_complete(self) -> None:
        manifest = regression.load_manifest()
        self.assertEqual(manifest.get("schemaVersion"), regression.SCHEMA_VERSION)
        saves = manifest.get("saves")
        self.assertIsInstance(saves, list)
        self.assertGreater(len(saves), 0, "manifest must list at least one save")

        ids: set[str] = set()
        file_names: set[str] = set()
        for save in saves:
            with self.subTest(save=save.get("id")):
                self.assertIsInstance(save, dict)
                for key in ("id", "fileName", "sizeBytes", "sha256", "fingerprint"):
                    self.assertIn(key, save)
                self.assertNotIn(save["id"], ids)
                self.assertNotIn(save["fileName"], file_names)
                ids.add(save["id"])
                file_names.add(save["fileName"])
                self.assertGreater(save["sizeBytes"], 0)
                self.assertRegex(save["sha256"], r"^[0-9a-f]{64}$")
                fingerprint = save["fingerprint"]
                for key in ("meta", "compatibility", "finances", "extractionManifest", "totals", "hashes"):
                    self.assertIn(key, fingerprint)
                self.assertIn("players", fingerprint["hashes"])
                self.assertIn("staff", fingerprint["hashes"])
                self.assertIn("targets", fingerprint["hashes"])

    def test_manifest_does_not_store_raw_names(self) -> None:
        manifest = regression.load_manifest()

        def collect_keys(node: object) -> set[str]:
            if isinstance(node, dict):
                found = set(node)
                for value in node.values():
                    found |= collect_keys(value)
                return found
            if isinstance(node, list):
                found: set[str] = set()
                for item in node:
                    found |= collect_keys(item)
                return found
            return set()

        forbidden = {"name", "clubName", "managerName", "playerName", "managerContract"}
        self.assertFalse(collect_keys(manifest) & forbidden)

    def test_fingerprint_comparison_rejects_a_changed_count(self) -> None:
        expected = {"extractionManifest": {"totalPlayers": 47}, "hashes": {"players": "abc"}}
        actual = {"extractionManifest": {"totalPlayers": 48}, "hashes": {"players": "abc"}}
        diffs = regression.compare_fingerprints(expected, actual)
        self.assertEqual(
            diffs,
            ["fingerprint.extractionManifest.totalPlayers: expected 47, got 48"],
        )


class TestRealSaveCorpus(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = regression.load_manifest()
        if not regression.fmsave_is_available():
            if regression.required_by_environment():
                raise AssertionError("fmsave is required but not installed")
            raise unittest.SkipTest("fmsave is not installed")
        cls.save_dir = regression.resolve_save_dir()
        if cls.save_dir is None:
            if regression.required_by_environment():
                raise AssertionError(
                    "FM27_REAL_SAVE_REQUIRED is set but no real-save directory was found"
                )
            raise unittest.SkipTest("no real-save directory found")

    def test_manifest_saves_decode_to_expected_fingerprint(self) -> None:
        available: list[tuple[dict, Path]] = []
        missing: list[str] = []
        for save in self.manifest["saves"]:
            path = regression.find_save(save, self.save_dir)
            if path is not None:
                available.append((save, path))
            else:
                missing.append(str(save["id"]))
        if missing and regression.required_by_environment():
            self.fail(f"missing real saves: {', '.join(missing)}")
        if not available:
            self.skipTest(f"no manifest saves found in {self.save_dir}")

        for save, path in available:
            with self.subTest(save=save["id"]):
                self.assertEqual(path.stat().st_size, save["sizeBytes"])
                self.assertEqual(regression.file_sha256(path), save["sha256"])
                try:
                    payload = regression.decode_save(path)
                except subprocess.TimeoutExpired:
                    self.fail(f"decoder timed out after {regression.decode_timeout_sec()}s")
                except RuntimeError as error:
                    self.fail(str(error))
                actual = regression.build_fingerprint(payload)
                diffs = regression.compare_fingerprints(save["fingerprint"], actual)
                if diffs:
                    self.fail("decoder fingerprint changed:\n" + "\n".join(diffs[:25]))


if __name__ == "__main__":
    unittest.main()
