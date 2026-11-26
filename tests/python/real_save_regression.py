"""Shared helpers for the local real-save regression corpus.

The corpus itself never lives in Git. This module only stores safe fingerprints:
counts, totals, and hashes. It deliberately excludes names, dates of birth, raw
attributes, and the decoded payload from the manifest.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "tests" / "fixtures" / "real-saves" / "manifest.json"
DEFAULT_SAVE_DIRS = (
    REPO_ROOT / ".agents_tmp" / "uploads",
    REPO_ROOT / ".local" / "real-saves",
)
SAVE_DIR_ENV = "FM27_REAL_SAVE_DIR"
MANIFEST_ENV = "FM27_REAL_SAVE_MANIFEST"
REQUIRED_ENV = "FM27_REAL_SAVE_REQUIRED"
TIMEOUT_ENV = "FM27_REAL_SAVE_TIMEOUT_SEC"
DEFAULT_TIMEOUT_SEC = 600
SCHEMA_VERSION = 1


def load_manifest(path: Path | None = None) -> dict[str, Any]:
    configured = os.environ.get(MANIFEST_ENV, "").strip()
    manifest_path = path or (Path(configured).expanduser() if configured else MANIFEST_PATH)
    with manifest_path.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    if not isinstance(manifest, dict):
        raise ValueError("real-save manifest must be a JSON object")
    return manifest


def resolve_save_dir() -> Path | None:
    configured = os.environ.get(SAVE_DIR_ENV, "").strip()
    if configured:
        candidate = Path(configured).expanduser()
        return candidate if candidate.is_dir() else None
    for candidate in DEFAULT_SAVE_DIRS:
        if candidate.is_dir():
            return candidate
    return None


def find_save(save: dict[str, Any], save_dir: Path | None) -> Path | None:
    if save_dir is None:
        return None
    candidate = save_dir / str(save.get("fileName", ""))
    return candidate if candidate.is_file() else None


def required_by_environment() -> bool:
    return os.environ.get(REQUIRED_ENV, "").strip().lower() in {"1", "true", "yes"}


def decode_timeout_sec() -> int:
    raw = os.environ.get(TIMEOUT_ENV, "").strip()
    if not raw:
        return DEFAULT_TIMEOUT_SEC
    try:
        return max(30, int(raw))
    except ValueError:
        return DEFAULT_TIMEOUT_SEC


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def fmsave_is_available() -> bool:
    try:
        import fmsave
    except Exception:
        return False
    return hasattr(fmsave, "__path__")


def decode_save(path: Path, timeout_sec: int | None = None) -> dict[str, Any]:
    command = [
        sys.executable,
        str(REPO_ROOT / "public" / "fm-save-mapper.py"),
        "--file",
        str(path),
        "--scope",
        "managed_club_only",
        "--fast-sync",
        "0",
    ]
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout_sec or decode_timeout_sec(),
        check=False,
    )
    if completed.returncode != 0:
        tail = "\n".join(completed.stderr.strip().splitlines()[-12:])
        raise RuntimeError(f"decoder exited {completed.returncode}\n{tail}")
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"decoder returned invalid JSON: {error}") from error
    if not isinstance(payload, dict):
        raise RuntimeError("decoder returned a non-object payload")
    return payload


def _canonical_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _sum_numeric(rows: list[dict[str, Any]], key: str) -> int | float:
    total = 0
    for row in rows:
        value = row.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            total += value
    return total


def _sorted_rows(rows: Any, key: str) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    dict_rows = [row for row in rows if isinstance(row, dict)]
    return sorted(dict_rows, key=lambda row: str(row.get(key, "")))


def _player_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for player in _sorted_rows(payload.get("players"), "uid"):
        rows.append(
            {
                "uid": player.get("uid"),
                "name": player.get("name"),
                "age": player.get("age"),
                "primaryPosition": player.get("primaryPosition"),
                "secondaryPositions": player.get("secondaryPositions"),
                "marketValue": player.get("marketValue"),
                "wagePw": player.get("wagePw"),
                "abilityStars": player.get("abilityStars"),
                "potentialStars": player.get("potentialStars"),
                "attributes": player.get("attributes"),
                "positionRatings": player.get("positionRatings"),
                "traits": player.get("traits"),
                "scoutBadges": player.get("scoutBadges"),
                "contractExpiryMonths": player.get("contractExpiryMonths"),
            }
        )
    return rows


def _staff_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for staff in _sorted_rows(payload.get("staff"), "uid"):
        rows.append(
            {
                "uid": staff.get("uid"),
                "name": staff.get("name"),
                "role": staff.get("role"),
                "secondaryJob": staff.get("secondaryJob"),
                "wagePw": staff.get("wagePw"),
                "coachingAttacking": staff.get("coachingAttacking"),
                "coachingDefending": staff.get("coachingDefending"),
                "coachingTactical": staff.get("coachingTactical"),
                "judgingAbility": staff.get("judgingAbility"),
                "judgingPotential": staff.get("judgingPotential"),
                "jobRatings": staff.get("jobRatings"),
                "attributes": staff.get("attributes"),
            }
        )
    return rows


def _target_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for target in _sorted_rows(payload.get("recruitmentTargets"), "uid"):
        rows.append(
            {
                "uid": target.get("uid"),
                "name": target.get("name"),
                "age": target.get("age"),
                "primaryPosition": target.get("primaryPosition"),
                "secondaryPositions": target.get("secondaryPositions"),
                "currentWagePw": target.get("currentWagePw"),
                "transferValue": target.get("transferValue"),
                "isFreeAgent": target.get("isFreeAgent"),
                "contractExpiryMonths": target.get("contractExpiryMonths"),
                "attributes": target.get("attributes"),
            }
        )
    return rows


def _match_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for match in _sorted_rows(payload.get("playedMatches"), "matchId"):
        rows.append(
            {
                "matchId": match.get("matchId"),
                "dateIso": match.get("dateIso"),
                "competitionId": match.get("competitionId"),
                "result": match.get("result"),
                "score": match.get("score"),
                "xGFor": match.get("xGFor"),
                "xGAgainst": match.get("xGAgainst"),
                "possession": match.get("possession"),
                "shotsFor": match.get("shotsFor"),
                "shotsAgainst": match.get("shotsAgainst"),
            }
        )
    return rows


def _sponsorship_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = _sorted_rows(payload.get("sponsorships"), "start")
    return [
        {
            "start": row.get("start"),
            "end": row.get("end"),
            "kind": row.get("kind"),
            "annual_value": row.get("annual_value"),
            "total_value": row.get("total_value"),
            "dates_reordered": row.get("dates_reordered"),
            "unknown": row.get("unknown"),
        }
        for row in rows
    ]


def _section_statuses(payload: dict[str, Any]) -> list[dict[str, Any]]:
    compatibility = (payload.get("meta") or {}).get("patchCompatibility") or {}
    sections = compatibility.get("sections") or []
    statuses = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        statuses.append(
            {
                "id": section.get("id"),
                "status": section.get("status"),
                "fallbacks": section.get("fallbacks"),
            }
        )
    return sorted(statuses, key=lambda item: str(item.get("id", "")))


def build_fingerprint(payload: dict[str, Any]) -> dict[str, Any]:
    meta = payload.get("meta") or {}
    compatibility = meta.get("patchCompatibility") or {}
    finances = payload.get("finances") or {}
    players = _player_rows(payload)
    staff = _staff_rows(payload)
    targets = _target_rows(payload)

    return {
        "meta": {
            "game": meta.get("game"),
            "build": meta.get("build"),
            "gameDateIso": meta.get("gameDateIso"),
            "knownBuild": meta.get("knownBuild"),
            "balance": meta.get("balance"),
            "scoutingBudget": meta.get("scoutingBudget"),
            "scoutingBudgetRemaining": meta.get("scoutingBudgetRemaining"),
        },
        "compatibility": {
            "layoutBase": compatibility.get("layoutBase"),
            "layoutStatus": compatibility.get("layoutStatus"),
            "dynamicBuildRegistered": compatibility.get("dynamicBuildRegistered"),
            "isFm27": compatibility.get("isFm27"),
            "isUntestedBuild": compatibility.get("isUntestedBuild"),
            "runtimePatchesApplied": compatibility.get("runtimePatchesApplied"),
            "sections": _section_statuses(payload),
        },
        "finances": {
            "month": finances.get("month"),
            "balance": finances.get("balance"),
            "wagePayrollWeekly": finances.get("wagePayrollWeekly"),
            "wageBudgetWeekly": finances.get("wageBudgetWeekly"),
            "transferBudgetRemaining": finances.get("transferBudgetRemaining"),
        },
        "extractionManifest": payload.get("extractionManifest") or {},
        "totals": {
            "squadWageWeekly": _sum_numeric(players, "wagePw"),
            "squadMarketValue": _sum_numeric(players, "marketValue"),
            "staffWageWeekly": _sum_numeric(staff, "wagePw"),
            "targetWageWeekly": _sum_numeric(targets, "currentWagePw"),
            "targetTransferValue": _sum_numeric(targets, "transferValue"),
        },
        "hashes": {
            "players": _canonical_hash(players),
            "staff": _canonical_hash(staff),
            "targets": _canonical_hash(targets),
            "matches": _canonical_hash(_match_rows(payload)),
            "sponsorships": _canonical_hash(_sponsorship_rows(payload)),
            "squadPlanner": _canonical_hash(payload.get("squadPlanner") or []),
            "selections": _canonical_hash(payload.get("selections") or {}),
            "tactics": _canonical_hash(payload.get("tactics") or []),
            "setPieces": _canonical_hash(payload.get("setPieces") or {}),
            "training": _canonical_hash(payload.get("training") or {}),
            "competitionRules": _canonical_hash(payload.get("competitionRules") or {}),
            "transferWindows": _canonical_hash(payload.get("transferWindows") or {}),
            "facilities": _canonical_hash(payload.get("facilities") or {}),
            "jobVacancies": _canonical_hash(payload.get("jobVacancies") or []),
            "leagueStanding": _canonical_hash(payload.get("leagueStanding") or {}),
            "governance": _canonical_hash(payload.get("governance") or {}),
            "monthlyFinances": _canonical_hash(payload.get("monthlyFinances") or []),
            "activeInjuries": _canonical_hash(payload.get("activeInjuries") or []),
            "activeSuspensions": _canonical_hash(payload.get("activeSuspensions") or []),
            "playerMatchStats": _canonical_hash(payload.get("playerMatchStats") or {}),
            "playerSeasonHistory": _canonical_hash(payload.get("playerSeasonHistory") or {}),
            "teamMatchStats": _canonical_hash(payload.get("teamMatchStats") or []),
        },
    }


def compare_fingerprints(expected: Any, actual: Any, path: str = "fingerprint") -> list[str]:
    if type(expected) is not type(actual):
        return [f"{path}: expected {type(expected).__name__}, got {type(actual).__name__}"]
    if isinstance(expected, dict):
        diffs: list[str] = []
        for key in sorted(set(expected) | set(actual)):
            if key not in expected:
                diffs.append(f"{path}.{key}: unexpected value")
            elif key not in actual:
                diffs.append(f"{path}.{key}: missing")
            else:
                diffs.extend(compare_fingerprints(expected[key], actual[key], f"{path}.{key}"))
        return diffs
    if isinstance(expected, list):
        if len(expected) != len(actual):
            return [f"{path}: expected {len(expected)} items, got {len(actual)}"]
        diffs = []
        for index, (expected_item, actual_item) in enumerate(zip(expected, actual)):
            diffs.extend(compare_fingerprints(expected_item, actual_item, f"{path}[{index}]"))
        return diffs
    if expected != actual:
        return [f"{path}: expected {expected!r}, got {actual!r}"]
    return []
