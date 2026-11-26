#!/usr/bin/env python3
"""Build the safe real-save regression manifest from local .fm files.

Run this with a Python interpreter that has fmsave 0.14.4 installed. The .fm
files stay local; only hashes, counts, totals, and build metadata are written.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests" / "python"))

import real_save_regression as regression


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--save-dir",
        default=str(regression.REPO_ROOT / ".agents_tmp" / "uploads"),
        help="Directory containing real .fm saves",
    )
    parser.add_argument(
        "--output",
        default=str(regression.MANIFEST_PATH),
        help="Manifest path to write",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=regression.DEFAULT_TIMEOUT_SEC,
        help="Per-save decoder timeout in seconds",
    )
    return parser.parse_args()


def existing_ids(output_path: Path) -> dict[str, str]:
    if not output_path.is_file():
        return {}
    try:
        manifest = regression.load_manifest(output_path)
    except (OSError, ValueError, json.JSONDecodeError):
        return {}
    return {
        str(save.get("fileName")): str(save.get("id"))
        for save in manifest.get("saves", [])
        if isinstance(save, dict) and save.get("fileName") and save.get("id")
    }


def main() -> int:
    args = parse_args()
    save_dir = Path(args.save_dir).expanduser()
    output_path = Path(args.output).expanduser()
    if not save_dir.is_dir():
        print(f"save directory not found: {save_dir}", file=sys.stderr)
        return 1

    save_paths = sorted(save_dir.glob("*.fm"))
    if not save_paths:
        print(f"no .fm files found in: {save_dir}", file=sys.stderr)
        return 1

    known_ids = existing_ids(output_path)
    saves = []
    used_ids: set[str] = set()
    for save_path in save_paths:
        save_id = known_ids.get(save_path.name, save_path.stem)
        if save_id in used_ids:
            save_id = f"{save_id}-{len(used_ids) + 1}"
        used_ids.add(save_id)
        print(f"Decoding {save_path.name}...", file=sys.stderr)
        payload = regression.decode_save(save_path, timeout_sec=args.timeout)
        saves.append(
            {
                "id": save_id,
                "fileName": save_path.name,
                "sizeBytes": save_path.stat().st_size,
                "sha256": regression.file_sha256(save_path),
                "fingerprint": regression.build_fingerprint(payload),
            }
        )

    manifest = {"schemaVersion": regression.SCHEMA_VERSION, "saves": saves}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {output_path} with {len(saves)} saves.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
