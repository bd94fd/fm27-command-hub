"""FM27 Command Hub — Pass 0 Deep .fm Save Extractor (Groups 1–4).

Runs inside Pyodide 3.14 (with native Python 3.14 zstd support) + fmsave==0.14.1
inside a browser Web Worker or via CLI.
- Mounts save directly with zero-copy WORKERFS (no memory copying).
- Holds ONE shared game_db section borrow across Steps 2-3 (including Group 4
  recruitment scan) so game_db is decompressed ONCE.
- Group 1: All 52 player attributes (incl. 11 GK), readable Player Traits, and
  internal reliability flags converted strictly into qualitative Scout Report
  Badges ('Consistent Performer', 'Big-Game Player', 'Injury-Prone', 'Versatile')
  with ZERO raw CA/PA or raw hidden numbers exposed in the JSON output.
- Group 2: Club-scoped player_match_stats (Last-5 Form ratings), team_match_stats
  (xG, shots, shots on target, possession), and player_season_history.
- Group 3: Club-scoped staff(), last-12-months finances() monthly cash burn/runway,
  and _safe_call extraction for facilities, sponsorships, transfer_windows,
  competition_rules, selections, set_pieces, training, and job_vacancies.
- Group 4: Time-capped (<= 8.0s mobile budget, max 60 targets) scan for signable
  Free Agents and Contracts Expiring <= 6 Months matched to club reputation/wage
  tier with ZERO raw CA/PA exposed.
"""

from __future__ import annotations

import gc
import inspect
import json
import os
import re
import sys
import time
import warnings
from datetime import date, time as dt_time
from typing import Any

import fmsave

MAPPER_CACHE_BUSTER = "?v=15"

# Detect native server Python vs browser Pyodide (emscripten) for realistic budgets
_IS_PYODIDE = sys.platform == "emscripten"

# Step 3/6 strict per-table wall-clock budgets (seconds)
FINANCES_BUDGET_SEC = 8.0
STAFF_BUDGET_SEC = 14.0 if not _IS_PYODIDE else 10.0
CLUB_OPS_TABLE_BUDGET_SEC = 8.0
SCOUT_BUDGET_SEC = 35.0 if not _IS_PYODIDE else 16.0
SCOUT_MAX_CANDIDATES = 500
SCOUT_PER_POSITION_CAP = 50
DIVISION_BENCHMARK_BUDGET_SEC = 6.0

# Step 4/6 strict per-table wall-clock budgets (seconds)
SEASON_STATS_BUDGET_SEC = 50.0 if not _IS_PYODIDE else 25.0
PLAYER_MATCH_STATS_BUDGET_SEC = 35.0 if not _IS_PYODIDE else 18.0
SEASON_HISTORY_BUDGET_SEC = 18.0 if not _IS_PYODIDE else 12.0
NATIVE_SEASON_HISTORY_BUDGET_SEC = 35.0
CONTRACTS_SUSPENSIONS_BUDGET_SEC = 12.0

_STATE: dict[str, Any] = {
    "save": None,
    "game_db_cm": None,
    "meta": None,
    "club_uid": None,
    "club_name": None,
    "club_reputation": None,
    "club_division_id": None,
    "manager_staff_uid": None,
    "first_team_id": None,
    "tactics_man_note_recorded": False,
    "import_scope": "managed_club_only",
    "fast_sync": False,
    "fast_sync_warning_recorded": False,
    "game_date": None,
    "wage_budget_weekly": None,
    "squad_uids": set(),
    "missing_contract_uids": set(),
    "suspensions_hint_uids": set(),
    "players_out": [],
    "staff_out": [],
    "played_matches": [],
    "upcoming_fixtures": [],
    "league_standing": None,
    "finances": None,
    "monthly_finances": [],
    "direct_injuries": [],
    "active_injuries": [],
    "active_suspensions": [],
    "tactics": [],
    "mentoring": [],
    "facilities": {},
    "sponsorships": [],
    "transfer_windows": {"isOpen": False},
    "competition_rules": {},
    "division_benchmarks": None,
    "selections": {},
    "set_pieces": {},
    "training": {},
    "job_vacancies": [],
    "player_match_stats": {},
    "team_match_stats": [],
    "player_season_history": {},
    "recruitment_targets": [],
    "warnings": [],
    "step_timings_ms": {},
    "comp_name_by_id": {},
    "nation_lookup": {},
}

# Verified Football Manager canonical nation database_id -> Country Name lookup
# (fmsave stores save-local nation_id joined to Nation.database_id via save.nations()).
FM_NATION_DB_ID_NAMES: dict[int, str] = {
    # Africa (CAF)
    1: "Algeria", 2: "Angola", 3: "Benin", 4: "Botswana", 5: "Burkina Faso",
    6: "Burundi", 7: "Cameroon", 8: "Cape Verde", 9: "Central African Republic",
    10: "Chad", 11: "Comoros", 12: "Congo", 13: "Ivory Coast", 14: "Djibouti",
    15: "Egypt", 16: "Equatorial Guinea", 17: "Eritrea", 18: "Ethiopia",
    19: "Gabon", 20: "Gambia", 21: "Ghana", 22: "Guinea", 23: "Guinea-Bissau",
    24: "Kenya", 25: "Lesotho", 26: "Liberia", 27: "Libya", 28: "Madagascar",
    29: "Malawi", 30: "Malawi", 31: "Mali", 32: "Mauritania", 33: "Mauritius",
    34: "Morocco", 35: "Mozambique", 36: "Namibia", 37: "Niger", 38: "Nigeria",
    39: "Rwanda", 40: "Sao Tome & Principe", 41: "Senegal", 42: "Seychelles",
    43: "Sierra Leone", 44: "Somalia", 45: "South Africa", 46: "Sudan",
    47: "Eswatini", 48: "Tanzania", 49: "Togo", 50: "Tunisia", 51: "Uganda",
    52: "DR Congo", 53: "Zambia", 54: "Zimbabwe",
    # Asia & Oceania (AFC / OFC)
    106: "Australia", 110: "China", 115: "Iran", 116: "Iraq", 117: "Japan",
    129: "New Zealand", 132: "Qatar", 134: "Saudi Arabia", 135: "South Korea",
    141: "Thailand", 143: "UAE", 144: "Uzbekistan",
    # North & Central America (CONCACAF)
    364: "Canada", 366: "Costa Rica", 368: "Curacao", 371: "El Salvador",
    373: "Guatemala", 374: "Haiti", 375: "Honduras", 376: "Jamaica",
    379: "Mexico", 383: "Panama", 387: "Suriname", 388: "Trinidad & Tobago",
    390: "USA",
    # Europe (UEFA)
    752: "Albania", 753: "Andorra", 754: "Armenia", 755: "Austria",
    756: "Azerbaijan", 757: "Belgium", 758: "Belarus", 759: "Bosnia & Herzegovina",
    760: "Bulgaria", 761: "Croatia", 762: "Cyprus", 763: "Czechia",
    764: "Denmark", 765: "England", 766: "Estonia", 767: "Faroe Islands",
    768: "Finland", 769: "France", 770: "Georgia", 771: "Germany",
    772: "Greece", 773: "Hungary", 774: "Iceland", 775: "Israel",
    776: "Italy", 777: "Kazakhstan", 778: "Latvia", 779: "Liechtenstein",
    780: "Lithuania", 781: "Luxembourg", 782: "North Macedonia", 783: "Malta",
    784: "Netherlands", 785: "Northern Ireland", 786: "Norway", 787: "Poland",
    788: "Portugal", 789: "Republic of Ireland", 790: "Romania", 791: "Russia",
    792: "San Marino", 793: "Scotland", 794: "Slovakia", 795: "Slovenia",
    796: "Spain", 797: "Sweden", 798: "Switzerland", 799: "Turkey",
    800: "Ukraine", 801: "Wales", 802: "Serbia", 803: "Montenegro",
    804: "Kosovo", 219991: "Kosovo", 2000018151: "Kosovo",
    # South America (CONMEBOL)
    1649: "Argentina", 1650: "Bolivia", 1651: "Brazil", 1652: "Chile",
    1653: "Colombia", 1654: "Ecuador", 1655: "Paraguay", 1656: "Peru",
    1657: "Uruguay", 1658: "Venezuela",
}


def _iso(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, (date, dt_time)):
        return val.isoformat()
    return str(val)


def _dmy(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val.strftime("%d/%m/%Y")
    return str(val)


def _int(val: Any, default: int | None = None) -> int | None:
    if val is None:
        return default
    try:
        return int(val)
    except Exception:
        return default


def _float(val: Any, default: float | None = None) -> float | None:
    if val is None:
        return default
    try:
        return float(val)
    except Exception:
        return default


def _clamp_attr(val: Any, default: int = 10) -> int:
    parsed = _int(val, default)
    if parsed is None:
        return default
    return max(1, min(20, parsed))


def _clamp_pct(val: Any) -> int | None:
    parsed = _int(val, None)
    if parsed is None:
        return None
    if parsed > 100:
        parsed = round(parsed / 100)
    return max(0, min(100, parsed))


def _get_attr(obj: Any, attr_name: str, default: Any = None) -> Any:
    if obj is None:
        return default
    try:
        val = getattr(obj, attr_name, default)
        if callable(val):
            val = val()
        return val if val is not None else default
    except Exception:
        return default


def _first_attr(obj: Any, names: tuple[str, ...], default: Any = None) -> Any:
    if obj is None:
        return default
    for name in names:
        val = _get_attr(obj, name, None)
        if val is not None:
            return val
    return default


def _label(coded: Any) -> str | None:
    if coded is None:
        return None
    lbl = getattr(coded, "label", None)
    if lbl is not None:
        name = getattr(lbl, "name", str(lbl))
        return None if name == "UNKNOWN" else name.replace("_", " ").title()
    name_attr = getattr(coded, "name", None)
    if isinstance(name_attr, str) and name_attr.strip():
        return None if name_attr == "UNKNOWN" else name_attr.replace("_", " ").title()
    text = str(coded).strip()
    if not text or text.upper() == "UNKNOWN":
        return None
    return text.replace("_", " ").title() if "_" in text and text.isupper() else text


_NON_STRICT_KWARG_CANDIDATES: dict[str, Any] = {
    "strict": False,
    "check": False,
    "validate": False,
    "skip_checks": True,
    "verify": False,
}


def _sanitize_reader_note(raw: str) -> str:
    """Strip noisy external GitHub issue URLs and fmsave validate boilerplate."""
    text = str(raw or "").strip()
    if not text:
        return ""
    text = re.sub(
        r"\s*Please report (?:it|this) at https?://\S+(?:\s+with the output of[^.]*)?\.?",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\s*\(?https?://[^\s)]+\)?", "", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    if len(text) > 220:
        text = text[:217].rstrip() + "..."
    return text


def _record_warning(msg: str) -> None:
    clean = _sanitize_reader_note(msg)
    if clean and clean not in _STATE["warnings"]:
        _STATE["warnings"].append(clean)


def _get_non_strict_kwargs(fn: Any) -> dict[str, Any]:
    """Inspect callable signature for any non-strict / bypass-checks parameters."""
    try:
        sig = inspect.signature(fn)
    except Exception:
        return {}
    supported: dict[str, Any] = {}
    for param_name, param in sig.parameters.items():
        if param.kind in (
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        ) and param_name in _NON_STRICT_KWARG_CANDIDATES:
            supported[param_name] = _NON_STRICT_KWARG_CANDIDATES[param_name]
    return supported


def _is_reader_check_error(exc: Exception) -> bool:
    cls_name = type(exc).__name__
    return cls_name in ("ReaderCheckError", "GateCheckError") or "ReaderCheckError" in str(exc)


def _safe_call(fn: Any, label: str = "section", default: Any = ()):
    non_strict_kwargs = _get_non_strict_kwargs(fn)
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = fn(**non_strict_kwargs) if non_strict_kwargs else fn()
        for w in caught:
            msg = _sanitize_reader_note(str(w.message))
            if msg:
                _record_warning(f"{label}: {msg}")
        return result if result is not None else default
    except Exception as exc:  # noqa: BLE001
        if _is_reader_check_error(exc) and non_strict_kwargs:
            try:
                with warnings.catch_warnings(record=True) as caught_retry:
                    warnings.simplefilter("always")
                    result = fn(**non_strict_kwargs)
                for w in caught_retry:
                    msg = _sanitize_reader_note(str(w.message))
                    if msg:
                        _record_warning(f"{label}: {msg}")
                return result if result is not None else default
            except Exception as retry_exc:  # noqa: BLE001
                exc = retry_exc
        if label in ("tactics", "selections", "set_pieces") and _is_reader_check_error(exc):
            if not _STATE.get("tactics_man_note_recorded"):
                _STATE["tactics_man_note_recorded"] = True
                _record_warning(
                    "FM27 27.1 tactics/set-pieces binary layout is not yet supported by fmsave; Tactical War Room & Best XI are built directly from your squad attributes and positions"
                )
            return default
        _record_warning(f"Section '{label}' unavailable ({type(exc).__name__})")
        return default


def _fmsave_version_tuple() -> tuple[int, ...]:
    raw = str(getattr(fmsave, "__version__", "0.0.0") or "0.0.0")
    parts: list[int] = []
    for tok in re.findall(r"\d+", raw)[:3]:
        parts.append(int(tok))
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def _is_fm27_27_1_unsupported_stats_build(save: Any) -> bool:
    """Detect FM27 27.1.x builds ONLY on older fmsave (< 0.14.3) where upstream fmsave
    raised unbypassable ReaderCheckError on player_season_stats / team_match_stats.
    fmsave 0.14.3+ decodes both tables cleanly on FM27 27.1.0."""
    if _fmsave_version_tuple() >= (0, 14, 3):
        return False
    if save is None:
        return False
    info = getattr(save, "info", None)
    if info is None:
        return False
    game_str = str(getattr(info, "game", "") or "").lower()
    build_str = str(getattr(info, "build", "") or "").lower()
    return ("27" in game_str or build_str.startswith("27.")) and build_str.startswith("27.1")


def _extract_nation_row_key(n: Any) -> int | None:
    """Extract the exact save-local nation key from a save.nations() row (NEVER list index)."""
    for attr in ("nation_id", "nation_uid", "uid", "unique_id"):
        val = getattr(n, attr, None)
        if val is not None:
            parsed = _int(val, None)
            if parsed is not None:
                return parsed
    return None


def _build_nation_lookup(save: Any) -> dict[int, str]:
    """Build exact nation_key -> country name map from save.nations() via _safe_call.
    Maps strictly by exact matching key (nation_id / nation_uid / uid / unique_id) —
    NEVER by list index and NEVER by polluting the map with colliding database_id keys."""
    cached = _STATE.get("nation_lookup")
    if isinstance(cached, dict) and cached:
        return cached
    lookup: dict[int, str] = {}
    nations_fn = getattr(save, "nations", None)
    if callable(nations_fn):
        rows = _safe_call(nations_fn, "nations", default=()) or ()
        for n in rows:
            n_key = _extract_nation_row_key(n)
            if n_key is None:
                continue
            db_id = _int(getattr(n, "database_id", None), None)
            explicit_name = (
                getattr(n, "name", None)
                or getattr(n, "short_name", None)
                or getattr(n, "nationality", None)
            )
            resolved: str | None = None
            if isinstance(explicit_name, str) and explicit_name.strip():
                resolved = explicit_name.strip()
            elif db_id is not None and db_id in FM_NATION_DB_ID_NAMES:
                resolved = FM_NATION_DB_ID_NAMES[db_id]
            if resolved:
                lookup[n_key] = resolved
    _STATE["nation_lookup"] = lookup
    return lookup


def _resolve_player_nationality(
    p: Any, nation_lookup: dict[int, str] | None = None, default: str = "Unknown"
) -> str:
    for attr in ("nation_name", "nationality", "country_name"):
        val = getattr(p, attr, None)
        if isinstance(val, str) and val.strip() and val.strip().lower() not in ("unknown", "none", "fm"):
            return val.strip()
    nat_obj = getattr(p, "nation", None)
    if nat_obj is not None:
        if isinstance(nat_obj, str) and nat_obj.strip():
            return nat_obj.strip()
        nat_name = getattr(nat_obj, "name", None)
        if isinstance(nat_name, str) and nat_name.strip():
            return nat_name.strip()
    n_key: int | None = None
    for attr in ("nation_id", "nationality_uid", "nation_uid"):
        raw = getattr(p, attr, None)
        if raw is not None:
            n_key = _int(raw, None)
            if n_key is not None:
                break
    if n_key is not None:
        if nation_lookup and n_key in nation_lookup:
            return nation_lookup[n_key]
        # Never look up a save-local nation_id in FM_NATION_DB_ID_NAMES (causes Algeria/Mali/etc. mismatches)
        return default
    return default


def _to_json_safe(obj: Any, depth: int = 0) -> Any:
    if depth > 3 or obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, (date, dt_time)):
        return obj.isoformat()
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for idx, (k, v) in enumerate(obj.items()):
            if idx >= 40:
                break
            ks = str(k)
            # Never serialize hidden/CA/PA fields even from generic dicts
            if ks.lower() in ("ca", "pa", "current_ability", "potential_ability", "consistency", "important_matches", "injury_proneness", "versatility"):
                continue
            out[ks] = _to_json_safe(v, depth + 1)
        return out
    if isinstance(obj, (list, tuple, set)):
        return [_to_json_safe(v, depth + 1) for v in list(obj)[:40]]
    lbl = _label(obj)
    if lbl is not None and not lbl.startswith("<"):
        return lbl
    if hasattr(obj, "__dict__"):
        return _to_json_safe(
            {k: v for k, v in vars(obj).items() if not k.startswith("_")},
            depth + 1,
        )
    return str(obj)


def _months_until(target_date: Any, game_date: Any) -> int:
    if target_date is None:
        return 0
    if isinstance(target_date, date) and isinstance(game_date, date):
        diff_days = (target_date - game_date).days
        if diff_days <= 0:
            return 0
        return max(0, round(diff_days / 30.4375))
    return 12


def _derive_scout_badges(
    consistency: int | None,
    important_matches: int | None,
    injury_proneness: int | None,
    versatility: int | None,
) -> list[str]:
    badges: list[str] = []
    if (consistency or 0) >= 14:
        badges.append("Consistent Performer")
    if (important_matches or 0) >= 14:
        badges.append("Big-Game Player")
    if (injury_proneness or 0) >= 14:
        badges.append("Injury-Prone")
    if (versatility or 0) >= 14:
        badges.append("Versatile")
    return badges


def _compute_relative_star(val: int, squad_median: float) -> float:
    if not val or val <= 0:
        return 2.5
    baseline = squad_median if squad_median > 0 else 90.0
    diff = val - baseline
    stars = 3.0 + (diff / 18.0)
    clamped = max(1.0, min(5.0, stars))
    return round(clamped * 2.0) / 2.0


def _infer_personality_label(det: int, pers: Any) -> str:
    prof = _int(_first_attr(pers, ("professionalism",)), 10) or 10
    amb = _int(_first_attr(pers, ("ambition",)), 10) or 10
    if prof >= 15 and det >= 14:
        return "Model Citizen / Professional"
    if prof >= 15:
        return "Professional"
    if det >= 16:
        return "Determined"
    if det >= 14:
        return "Fairly Determined"
    if amb >= 15:
        return "Ambitious"
    return "Balanced"


def _extract_52_attributes(p: Any, attrs: Any) -> dict[str, int]:
    """Extracts all 52 FM27 player attributes (14 Technical, 14 Mental, 8 Physical,
    11 Goalkeeping + 5 overlapping/alias attributes), strictly clamped to 1–20."""
    src = attrs if attrs is not None else p

    def _a(names: tuple[str, ...], default: int = 10) -> int:
        val = _first_attr(src, names, None)
        if val is None and src is not p:
            val = _first_attr(p, names, None)
        return _clamp_attr(val, default)

    free_kicks = _a(("free_kicks", "free_kick_taking"), 10)
    penalties = _a(("penalties", "penalty_taking"), 10)
    first_touch = _a(("first_touch",), 10)
    passing = _a(("passing",), 10)
    throwing = _a(("throwing", "gk_throwing"), 10)

    return {
        # Technical (14)
        "corners": _a(("corners",)),
        "crossing": _a(("crossing",)),
        "dribbling": _a(("dribbling",)),
        "finishing": _a(("finishing",)),
        "firstTouch": first_touch,
        "freeKicks": free_kicks,
        "heading": _a(("heading",)),
        "longShots": _a(("long_shots",)),
        "longThrows": _a(("long_throws",)),
        "marking": _a(("marking",)),
        "passing": passing,
        "penalties": penalties,
        "tackling": _a(("tackling",)),
        "technique": _a(("technique",)),
        # Mental (14)
        "aggression": _a(("aggression",)),
        "anticipation": _a(("anticipation",)),
        "bravery": _a(("bravery",)),
        "composure": _a(("composure",)),
        "concentration": _a(("concentration",)),
        "decisions": _a(("decisions",)),
        "determination": _a(("determination",)),
        "flair": _a(("flair",)),
        "leadership": _a(("leadership",)),
        "offTheBall": _a(("off_the_ball",)),
        "positioning": _a(("positioning",)),
        "teamwork": _a(("teamwork",)),
        "vision": _a(("vision",)),
        "workRate": _a(("work_rate",)),
        # Physical (8)
        "acceleration": _a(("acceleration",)),
        "agility": _a(("agility",)),
        "balance": _a(("balance",)),
        "jumpingReach": _a(("jumping_reach",)),
        "naturalFitness": _a(("natural_fitness",)),
        "pace": _a(("pace",)),
        "stamina": _a(("stamina",)),
        "strength": _a(("strength",)),
        # Goalkeeping (11)
        "aerialReach": _a(("aerial_reach", "aerial_ability"), 1),
        "commandOfArea": _a(("command_of_area",), 1),
        "communication": _a(("communication",), 1),
        "eccentricity": _a(("eccentricity",), 1),
        "handling": _a(("handling",), 1),
        "kicking": _a(("kicking",), 1),
        "oneOnOnes": _a(("one_on_ones",), 1),
        "punching": _a(("punching", "tendency_to_punch"), 1),
        "reflexes": _a(("reflexes",), 1),
        "rushingOut": _a(("rushing_out", "tendency_to_rush_out", "rushing_out_tendency"), 1),
        "throwing": throwing,
        # Overlapping / Aliases (5) -> 52 total keys
        "firstTouchGk": first_touch,
        "passingGk": passing,
        "throwingDistance": throwing,
        "freeKickTaking": free_kicks,
        "penaltyTaking": penalties,
    }


def _extract_traits(p: Any) -> list[str]:
    raw_traits = (
        _first_attr(p, ("traits", "player_traits", "preferred_moves", "ppms"), [])
        or []
    )
    out: list[str] = []
    try:
        for t in raw_traits:
            lbl = _label(t)
            if lbl and lbl not in out:
                out.append(lbl)
    except Exception:
        pass
    return out


def _extract_reliability_badges(p: Any, pers: Any) -> list[str]:
    hidden = _first_attr(p, ("hidden_attributes", "hidden", "reliability"), None)
    consistency = _int(
        _first_attr(p, ("consistency",))
        or _first_attr(pers, ("consistency",))
        or _first_attr(hidden, ("consistency",)),
        10,
    )
    important_matches = _int(
        _first_attr(p, ("important_matches",))
        or _first_attr(pers, ("important_matches",))
        or _first_attr(hidden, ("important_matches",)),
        10,
    )
    injury_proneness = _int(
        _first_attr(p, ("injury_proneness",))
        or _first_attr(pers, ("injury_proneness",))
        or _first_attr(hidden, ("injury_proneness",)),
        10,
    )
    versatility = _int(
        _first_attr(p, ("versatility",))
        or _first_attr(pers, ("versatility",))
        or _first_attr(hidden, ("versatility",)),
        10,
    )
    return _derive_scout_badges(
        consistency, important_matches, injury_proneness, versatility
    )


def _exit_game_db_borrow() -> None:
    cm = _STATE.get("game_db_cm")
    if cm is not None:
        try:
            cm.__exit__(None, None, None)
        except Exception:
            pass
        _STATE["game_db_cm"] = None


def _evict_finished_player_phase_cache(save: Any) -> None:
    if save is None:
        return
    ctx = getattr(save, "_context", None)
    if ctx is not None:
        cache = getattr(ctx, "_cache", None)
        if isinstance(cache, dict):
            keep_tokens = ("club", "team", "comp", "stage", "stadium", "managed", "gate")
            for k in list(cache.keys()):
                k_str = str(k).lower()
                if not any(tok in k_str for tok in keep_tokens):
                    cache.pop(k, None)
    gc.collect()


def step_close() -> None:
    _exit_game_db_borrow()
    save = _STATE.get("save")
    if save is not None:
        try:
            save.close()
        except Exception:
            pass
    _STATE["save"] = None
    _STATE["meta"] = None
    _STATE["club_uid"] = None
    _STATE["club_name"] = None
    _STATE["club_reputation"] = None
    _STATE["club_division_id"] = None
    _STATE["manager_staff_uid"] = None
    _STATE["first_team_id"] = None
    _STATE["tactics_man_note_recorded"] = False
    _STATE["import_scope"] = "managed_club_only"
    _STATE["fast_sync"] = False
    _STATE["fast_sync_warning_recorded"] = False
    _STATE["game_date"] = None
    _STATE["wage_budget_weekly"] = None
    _STATE["squad_uids"] = set()
    _STATE["missing_contract_uids"] = set()
    _STATE["suspensions_hint_uids"] = set()
    _STATE["players_out"] = []
    _STATE["staff_out"] = []
    _STATE["played_matches"] = []
    _STATE["upcoming_fixtures"] = []
    _STATE["league_standing"] = None
    _STATE["finances"] = None
    _STATE["monthly_finances"] = []
    _STATE["direct_injuries"] = []
    _STATE["active_injuries"] = []
    _STATE["active_suspensions"] = []
    _STATE["tactics"] = []
    _STATE["mentoring"] = []
    _STATE["facilities"] = {}
    _STATE["sponsorships"] = []
    _STATE["transfer_windows"] = {"isOpen": False}
    _STATE["competition_rules"] = {}
    _STATE["division_benchmarks"] = None
    _STATE["selections"] = {}
    _STATE["set_pieces"] = {}
    _STATE["training"] = {}
    _STATE["job_vacancies"] = []
    _STATE["player_match_stats"] = {}
    _STATE["team_match_stats"] = []
    _STATE["player_season_history"] = {}
    _STATE["recruitment_targets"] = []
    _STATE["warnings"] = []
    _STATE["step_timings_ms"] = {}
    _STATE["comp_name_by_id"] = {}
    _STATE["nation_lookup"] = {}
    gc.collect()


def _record_fast_sync_skip_note() -> None:
    """Record a single concise Fast Sync note in extractionWarnings once per decode."""
    if not _STATE.get("fast_sync_warning_recorded"):
        _STATE["fast_sync_warning_recorded"] = True
        _STATE["warnings"].append(
            "Fast Sync: skipped global injuries, facilities, competition rules, transfer windows, optional club dumps, market scan, and player_season_stats / match / career history (core club data intact)"
        )


def _record_step_timing(step_key: str, started_ts: float) -> int:
    """Record wall-clock duration in ms for a sub-step so slow tables are immediately visible."""
    elapsed_ms = max(0, int(round((time.monotonic() - started_ts) * 1000)))
    _STATE["step_timings_ms"][step_key] = elapsed_ms
    return elapsed_ms


def _inspect_supported_kwargs(fn: Any, candidates: dict[str, Any]) -> dict[str, Any]:
    """Inspect a callable's signature via inspect.signature and return only
    non-None kwargs accepted by that callable."""
    if not callable(fn):
        return {}
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return {}
    params = sig.parameters
    accepts_var_kw = any(
        p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()
    )
    matched: dict[str, Any] = {}
    for k, v in candidates.items():
        if v is None:
            continue
        if k in params or accepts_var_kw:
            matched[k] = v
    return matched


def _open_table_stream(
    save: Any,
    method_name: str,
    *,
    club_uid: int | None = None,
    squad_uids: set[int] | None = None,
    try_where_club: bool = True,
) -> tuple[Any, Any, bool]:
    """Open an fmsave table lazily using inspect.signature native filter kwargs
    when supported, and optionally a lazy .where(club_uid=...) view.
    NEVER materializes massive global tables via list(...).
    Returns (primary_iterable, fallback_table_or_none, used_scoped_filter)."""
    fn = getattr(save, method_name, None)
    if not callable(fn):
        return (None, None, False)

    candidates: dict[str, Any] = {}
    if club_uid is not None:
        candidates["club_uid"] = club_uid
        candidates["team_id"] = club_uid
    if squad_uids:
        candidates["player_uids"] = squad_uids
        candidates["uids"] = squad_uids

    native_kwargs = _inspect_supported_kwargs(fn, candidates)
    # If callable accepts **kwargs, prefer canonical fmsave param names only
    if "club_uid" in native_kwargs and "team_id" in native_kwargs:
        native_kwargs.pop("team_id", None)
    if "player_uids" in native_kwargs and "uids" in native_kwargs:
        native_kwargs.pop("uids", None)

    if native_kwargs:
        try:
            scoped_table = fn(**native_kwargs)
            if scoped_table is not None:
                return (scoped_table, None, True)
        except Exception:
            pass

    base_table = _safe_call(fn, method_name, default=None)
    if base_table is None:
        return (None, None, False)

    if try_where_club and club_uid is not None and hasattr(base_table, "where"):
        where_fn = getattr(base_table, "where", None)
        if callable(where_fn):
            where_kwargs = _inspect_supported_kwargs(where_fn, {"club_uid": club_uid})
            if where_kwargs:
                try:
                    scoped_view = where_fn(**where_kwargs)
                    if scoped_view is not None and hasattr(scoped_view, "__iter__"):
                        return (scoped_view, base_table, True)
                except Exception:
                    pass

    return (base_table, None, False)


def _open_save_non_strict(path: str) -> Any:
    """Open .fm save passing strict=False (or other non-strict kwargs) whenever fmsave.open supports it."""
    open_kwargs = _get_non_strict_kwargs(fmsave.open)
    if open_kwargs:
        return fmsave.open(path, **open_kwargs)
    return fmsave.open(path)


def step_open(
    path: str,
    preferred_club_hint: str = "",
    import_scope: str = "managed_club_only",
    fast_sync: bool = False,
) -> str:
    t0 = time.monotonic()
    step_close()
    save = _open_save_non_strict(path)
    _STATE["save"] = save
    _STATE["import_scope"] = (import_scope or "managed_club_only").strip()
    _STATE["fast_sync"] = bool(fast_sync)

    # Enter ONE shared game_db section borrow across Steps 2-3 (incl. Group 4 & division benchmarks)
    ctx = getattr(save, "_context", None)
    if ctx is not None and hasattr(ctx, "section"):
        try:
            cm = ctx.section("game_db")
            cm.__enter__()
            _STATE["game_db_cm"] = cm
        except Exception:
            _STATE["game_db_cm"] = None

    info = save.info
    managed = []
    try:
        managed = list(save.managed_clubs())
    except Exception as exc:
        _STATE["warnings"].append(f"managed_clubs: {type(exc).__name__}")

    target_club = None
    hint_lower = preferred_club_hint.strip().lower()
    if managed:
        if hint_lower:
            for mc in managed:
                cname = (getattr(mc, "club_name", None) or "").lower()
                if hint_lower in cname:
                    target_club = mc
                    break
        if target_club is None:
            target_club = managed[0]

    club_uid = getattr(target_club, "club_uid", None) if target_club else None
    club_name = getattr(target_club, "club_name", None) if target_club else None
    manager_name = getattr(target_club, "manager_name", None) if target_club else None
    manager_staff_uid = _int(getattr(target_club, "manager_staff_uid", None), None) if target_club else None
    club_balance = _int(getattr(target_club, "balance", None)) if target_club else None
    club_rep = _int(_first_attr(target_club, ("reputation", "club_reputation")), None)
    club_div_id = _int(
        _first_attr(target_club, ("division_id", "competition_id", "league_id")),
        None,
    )

    # Fallback to clubs() scan if no managed club found or to capture club reputation/division
    try:
        for c in save.clubs():
            cid = getattr(c, "uid", None)
            cname = getattr(c, "name", "") or ""
            if club_uid is None and hint_lower and hint_lower in cname.lower():
                club_uid = cid
                club_name = cname
            if club_uid is not None and cid == club_uid:
                if club_rep is None:
                    club_rep = _int(_first_attr(c, ("reputation", "world_reputation")), None)
                if club_div_id is None:
                    club_div_id = _int(
                        _first_attr(c, ("division_id", "competition_id", "league_id")),
                        None,
                    )
                break
    except Exception as exc:
        _STATE["warnings"].append(f"clubs: {type(exc).__name__}")

    # Pre-index competition names for fast lookup
    comp_map: dict[int, str] = {}
    try:
        for c in save.competitions():
            cid = getattr(c, "id", None)
            cname = getattr(c, "name", None)
            if cid is not None and cname:
                comp_map[int(cid)] = str(cname)
    except Exception:
        pass
    _STATE["comp_name_by_id"] = comp_map

    game_date = getattr(info, "game_date", None)
    meta = {
        "game": getattr(info, "game", "FM"),
        "build": str(getattr(info, "build", "unknown")),
        "knownBuild": bool(getattr(info, "known_build", True)),
        "saveName": getattr(info, "save_name", None) or os.path.basename(path),
        "gameDateIso": _iso(game_date),
        "gameDateDmy": _dmy(game_date),
        "clubUid": club_uid,
        "clubName": club_name or "Managed Club",
        "managerName": manager_name or "Manager",
        "balance": club_balance,
        "fmsaveVersion": fmsave.__version__,
        "importScope": _STATE["import_scope"],
        "fastSync": _STATE["fast_sync"],
    }

    _STATE["meta"] = meta
    _STATE["club_uid"] = club_uid
    _STATE["club_name"] = club_name
    _STATE["club_reputation"] = club_rep
    _STATE["club_division_id"] = club_div_id
    _STATE["manager_staff_uid"] = manager_staff_uid
    _STATE["game_date"] = game_date
    _record_step_timing("step_1_open", t0)

    return json.dumps(meta)


def _extract_contract_details(contract_obj: Any, player_obj: Any = None) -> dict[str, Any]:
    """Pass 1 Tier-1: Extract promised playing time, true release clauses, optional extensions,
    match bonuses, and loan wage contribution % safely without exposing raw hidden values."""
    promised = (
        _label(_first_attr(contract_obj, ("playing_time", "promised_playing_time", "squad_status", "agreed_playing_time")))
        or _label(_first_attr(player_obj, ("agreed_playing_time", "squad_status")))
        or "Squad Player"
    )
    release_clauses: list[dict[str, Any]] = []
    bonuses: dict[str, Any] = {}
    ext_years = _int(
        _first_attr(
            contract_obj,
            ("optional_extension_years", "club_option_years", "extension_years", "optional_contract_extension"),
        ),
        0,
    ) or 0
    if ext_years < 0:
        ext_years = 0

    raw_clauses = _first_attr(contract_obj, ("clauses", "release_clauses", "contract_clauses")) if contract_obj is not None else None
    if isinstance(raw_clauses, (list, tuple)):
        for cl in raw_clauses[:20]:
            cl_type = _label(_first_attr(cl, ("clause_type", "type", "name", "kind"))) or ""
            cl_type_lower = cl_type.lower()
            cl_amt = _int(_first_attr(cl, ("amount", "value", "fee", "minimum_fee")), None)
            cl_param = _int(_first_attr(cl, ("parameter", "years")), None)

            # Separate Match Bonuses from true Release Clauses
            if "appearance" in cl_type_lower:
                if cl_amt is not None and cl_amt > 0:
                    bonuses["appearanceFee"] = cl_amt
                continue
            if "unused" in cl_type_lower and "sub" in cl_type_lower:
                if cl_amt is not None and cl_amt > 0:
                    bonuses["unusedSubFee"] = cl_amt
                continue
            if "clean sheet" in cl_type_lower or "shutout" in cl_type_lower:
                if cl_amt is not None and cl_amt > 0:
                    bonuses["cleanSheetBonus"] = cl_amt
                continue
            if "goal" in cl_type_lower and ("bonus" in cl_type_lower or "landmark" in cl_type_lower):
                if cl_amt is not None and cl_amt > 0:
                    bonuses["goalBonus"] = cl_amt
                continue
            if "optional extension" in cl_type_lower:
                if ext_years == 0 and cl_param is not None and cl_param > 0:
                    ext_years = cl_param
                continue
            if any(tok in cl_type_lower for tok in ("bonus", "salary", "wage", "cap")):
                continue

            # True Release Clauses only
            if any(tok in cl_type_lower for tok in ("release", "minimum fee", "buyout")):
                if cl_amt is not None and cl_amt > 0:
                    release_clauses.append({"type": cl_type or "Release Clause", "amount": cl_amt})

    if contract_obj is not None:
        for attr_name, label_txt in (
            ("minimum_fee_release_clause", "Minimum Fee Release"),
            ("release_clause", "Minimum Fee Release"),
            ("relegation_release_clause", "Relegation Release"),
            ("foreign_club_release_clause", "Foreign Club Release"),
            ("non_promotion_release_clause", "Non-Promotion Release"),
        ):
            amt = _int(getattr(contract_obj, attr_name, None), None)
            if amt is not None and amt > 0 and not any(c["type"] == label_txt for c in release_clauses):
                release_clauses.append({"type": label_txt, "amount": amt})

    app_fee = _int(_first_attr(contract_obj, ("appearance_fee", "appearance_bonus")), None)
    goal_bonus = _int(_first_attr(contract_obj, ("goal_bonus",)), None)
    cs_bonus = _int(_first_attr(contract_obj, ("clean_sheet_bonus", "shutout_bonus")), None)
    unused_fee = _int(_first_attr(contract_obj, ("unused_sub_fee", "unused_substitute_fee")), None)
    if app_fee is not None and app_fee > 0 and "appearanceFee" not in bonuses:
        bonuses["appearanceFee"] = app_fee
    if goal_bonus is not None and goal_bonus > 0 and "goalBonus" not in bonuses:
        bonuses["goalBonus"] = goal_bonus
    if cs_bonus is not None and cs_bonus > 0 and "cleanSheetBonus" not in bonuses:
        bonuses["cleanSheetBonus"] = cs_bonus
    if unused_fee is not None and unused_fee > 0 and "unusedSubFee" not in bonuses:
        bonuses["unusedSubFee"] = unused_fee

    loan_pct = _int(
        _first_attr(contract_obj, ("loan_wage_contribution_pct", "wage_contribution_pct", "loan_wage_pct")),
        None,
    )
    if loan_pct is not None:
        loan_pct = max(0, min(100, loan_pct))

    return {
        "promisedPlayingTime": promised,
        "releaseClauses": release_clauses,
        "optionalExtensionYears": ext_years,
        "bonuses": bonuses,
        "loanWageContributionPct": loan_pct,
    }


def _normalize_suspension_scope(comp_name: str, raw_scope: Any) -> str:
    txt = f"{comp_name} {_label(raw_scope) or ''}".lower()
    if "all" in txt or "global" in txt or "worldwide" in txt:
        return "all"
    if any(tok in txt for tok in ("champions", "europa", "conference", "continental", "uefa")):
        return "continental"
    if any(tok in txt for tok in ("cup", "beker", "trophy", "shield", "fa ", "pokal", "coupe")):
        return "cup"
    return "league"


def _extract_player_object_suspensions(
    raw_players: list[Any] | None,
    squad_uids: set[int],
    player_name_by_uid: dict[int, str],
    comp_map: dict[int, str],
) -> list[dict[str, Any]]:
    """Read suspensions directly off already-extracted squad player objects (zero global scan)."""
    results: list[dict[str, Any]] = []
    seen_keys: set[tuple[int, str, int]] = set()
    if not raw_players:
        return results

    for p in raw_players:
        p_uid = _int(getattr(p, "uid", None), None)
        if p_uid is None or p_uid not in squad_uids:
            continue
        raw_bans = getattr(p, "suspensions", None)
        if not isinstance(raw_bans, (list, tuple)):
            continue
        for b in raw_bans:
            matches_rem = _int(
                _first_attr(b, ("matches_remaining", "games_remaining", "matches", "ban_length", "remaining")),
                1,
            ) or 0
            if matches_rem <= 0:
                continue
            comp_id = _int(_first_attr(b, ("competition_id", "comp_id")), None)
            comp_name = (
                getattr(b, "competition_name", None)
                or (comp_map.get(comp_id) if comp_id else None)
                or "Domestic League"
            )
            scope = _normalize_suspension_scope(str(comp_name), _first_attr(b, ("scope", "ban_scope", "kind")))
            reason = (
                _label(_first_attr(b, ("reason", "offence", "cause", "type")))
                or "Disciplinary Suspension"
            )
            dedup_key = (p_uid, str(comp_name), matches_rem)
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)
            results.append({
                "playerUid": p_uid,
                "playerName": getattr(b, "player_name", None) or player_name_by_uid.get(p_uid) or "Player",
                "matchesRemaining": matches_rem,
                "competitionName": str(comp_name),
                "scope": scope,
                "reason": str(reason),
            })
    return results


def _extract_structured_suspensions(
    save: Any,
    club_uid: int | None,
    squad_uids: set[int],
    player_name_by_uid: dict[int, str],
    comp_map: dict[int, str],
    raw_players: list[Any] | None = None,
    existing_results: list[dict[str, Any]] | None = None,
    budget_sec: float = CONTRACTS_SUSPENSIONS_BUDGET_SEC,
) -> tuple[list[dict[str, Any]], bool]:
    """Pass 1 Tier-1: Read player.suspensions directly first, then lazily stream
    save.suspensions() with native inspect.signature filters, O(1) squad_uids lookup,
    early exit, and hard wall-clock budget. NEVER calls list(...) on global suspensions."""
    t0 = time.monotonic()
    timed_out = False
    results: list[dict[str, Any]] = []
    seen_keys: set[tuple[int, str, int]] = set()
    resolved_uids: set[int] = set()

    if existing_results:
        for ex in existing_results:
            p_uid = _int(ex.get("playerUid"), None)
            comp_name = str(ex.get("competitionName") or "Domestic League")
            matches_rem = _int(ex.get("matchesRemaining"), 0) or 0
            if p_uid is not None and matches_rem > 0:
                dedup_key = (p_uid, comp_name, matches_rem)
                if dedup_key not in seen_keys:
                    seen_keys.add(dedup_key)
                    results.append(ex)
                    resolved_uids.add(p_uid)

    def _consume_ban(b: Any, fallback_uid: int | None = None) -> None:
        p_uid = _int(_first_attr(b, ("player_uid", "person_uid", "uid")), fallback_uid)
        if p_uid is None or p_uid not in squad_uids:
            return
        matches_rem = _int(
            _first_attr(b, ("matches_remaining", "games_remaining", "matches", "ban_length", "remaining")),
            1,
        ) or 0
        if matches_rem <= 0:
            return
        comp_id = _int(_first_attr(b, ("competition_id", "comp_id")), None)
        comp_name = (
            getattr(b, "competition_name", None)
            or (comp_map.get(comp_id) if comp_id else None)
            or "Domestic League"
        )
        scope = _normalize_suspension_scope(str(comp_name), _first_attr(b, ("scope", "ban_scope", "kind")))
        reason = (
            _label(_first_attr(b, ("reason", "offence", "cause", "type")))
            or "Disciplinary Suspension"
        )
        dedup_key = (p_uid, str(comp_name), matches_rem)
        if dedup_key in seen_keys:
            return
        seen_keys.add(dedup_key)
        resolved_uids.add(p_uid)
        results.append({
            "playerUid": p_uid,
            "playerName": getattr(b, "player_name", None) or player_name_by_uid.get(p_uid) or "Player",
            "matchesRemaining": matches_rem,
            "competitionName": str(comp_name),
            "scope": scope,
            "reason": str(reason),
        })

    # 1. Read directly off already-extracted squad player objects first
    if raw_players:
        for p in raw_players:
            p_uid = _int(getattr(p, "uid", None), None)
            raw_bans = getattr(p, "suspensions", None)
            if p_uid and isinstance(raw_bans, (list, tuple)):
                for b in raw_bans:
                    _consume_ban(b, fallback_uid=p_uid)

    # 2. Lazily stream global save.suspensions() only for additional/missing bans
    primary_iter, fallback_table, used_scoped = _open_table_stream(
        save,
        "suspensions",
        club_uid=club_uid,
        squad_uids=squad_uids,
        try_where_club=True,
    )
    if primary_iter is not None:
        matched_any = False

        def _scan_iter(it: Any) -> bool:
            nonlocal timed_out, matched_any
            seen = 0
            for row in it:
                seen += 1
                if (seen & 255) == 0 and (time.monotonic() - t0) >= budget_sec:
                    timed_out = True
                    return False
                r_puid = _int(_first_attr(row, ("player_uid", "person_uid")), None)
                if r_puid not in squad_uids:
                    continue
                matched_any = True
                _consume_ban(row, fallback_uid=r_puid)
                if len(resolved_uids) >= len(squad_uids):
                    return True
            return True

        try:
            _scan_iter(primary_iter)
        except Exception:
            if fallback_table is not None and not timed_out:
                try:
                    _scan_iter(fallback_table)
                except Exception:
                    pass
        else:
            if (
                used_scoped
                and not matched_any
                and fallback_table is not None
                and not timed_out
                and (time.monotonic() - t0) < budget_sec
            ):
                try:
                    _scan_iter(fallback_table)
                except Exception:
                    pass

    return results, timed_out


def _pos_group_for_benchmark(pos_str: str) -> str:
    p = (pos_str or "").upper()
    if "GK" in p:
        return "GK"
    if any(tok in p for tok in ("ST", "CF")):
        return "FWD"
    if any(tok in p for tok in ("DC", "DL", "DR", "CB", "WB", "D (")):
        return "DEF"
    return "MID"


def _median_num(vals: list[float]) -> float:
    if not vals:
        return 0.0
    s = sorted(vals)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return round(float(s[mid]), 1)
    return round(float(s[mid - 1] + s[mid]) / 2.0, 1)


def _compute_division_benchmarks(
    save: Any,
    club_uid: int | None,
    division_club_uids: set[int],
    comp_name: str,
    scope: str,
) -> dict[str, Any] | None:
    """Pass 1 Tier-1: Compute division-relative median visible attributes & weekly wages
    grouped by GK/DEF/MID/FWD when scope is club_and_division. ZERO raw CA/PA."""
    if scope not in ("club_and_division", "full_division", "full_league"):
        return None
    target_clubs = set(division_club_uids)
    if club_uid is not None:
        target_clubs.add(club_uid)
    if not target_clubs:
        return None

    t0 = time.monotonic()
    buckets: dict[str, dict[str, list[float]]] = {
        grp: {
            "wages": [],
            "pace": [],
            "acceleration": [],
            "stamina": [],
            "passing": [],
            "finishing": [],
            "tackling": [],
            "decisions": [],
            "jumpingReach": [],
            "reflexes": [],
            "handling": [],
        }
        for grp in ("GK", "DEF", "MID", "FWD")
    }
    sample_counts: dict[str, int] = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
    clubs_seen: set[int] = set()

    try:
        p_table = save.players()
        seen = 0
        for p in p_table:
            seen += 1
            if (seen & 511) == 0 and (time.monotonic() - t0) >= DIVISION_BENCHMARK_BUDGET_SEC:
                break
            c_uid = getattr(p, "club_uid", None)
            if c_uid not in target_clubs:
                continue
            clubs_seen.add(int(c_uid))
            nat_pos = list(getattr(p, "natural_positions", None) or [])
            pos_str = nat_pos[0] if nat_pos else str(getattr(p, "position", None) or "MC")
            grp = _pos_group_for_benchmark(pos_str)
            attrs = getattr(p, "attributes", None)
            contract = getattr(p, "contract", None)
            wage = _int(getattr(contract, "wage", None), 0) if contract else 0
            sample_counts[grp] += 1
            if wage and wage > 0:
                buckets[grp]["wages"].append(float(wage))
            for js_key, py_key in (
                ("pace", "pace"),
                ("acceleration", "acceleration"),
                ("stamina", "stamina"),
                ("passing", "passing"),
                ("finishing", "finishing"),
                ("tackling", "tackling"),
                ("decisions", "decisions"),
                ("jumpingReach", "jumping_reach"),
                ("reflexes", "reflexes"),
                ("handling", "handling"),
            ):
                val = _first_attr(attrs, (py_key,)) if attrs else _first_attr(p, (py_key,))
                if val is not None:
                    buckets[grp][js_key].append(float(_clamp_attr(val, 10)))
    except Exception as exc:
        _STATE["warnings"].append(f"division_benchmarks: {type(exc).__name__}")
        return None

    by_group: dict[str, Any] = {}
    for grp in ("GK", "DEF", "MID", "FWD"):
        b = buckets[grp]
        by_group[grp] = {
            "sampleSize": sample_counts[grp],
            "medianWeeklyWage": int(round(_median_num(b["wages"]))),
            "medianAttributes": {
                k: _median_num(v)
                for k, v in b.items()
                if k != "wages" and len(v) > 0
            },
        }

    return {
        "competitionName": comp_name or "Domestic Division",
        "scope": scope,
        "clubCount": len(clubs_seen) or len(target_clubs),
        "byPositionGroup": by_group,
    }


def _extract_typed_competition_rules(
    save: Any,
    club_uid: int | None,
    comp_id: int | None,
    comp_map: dict[int, str],
) -> dict[str, Any]:
    """Pass 1 Tier-1: Extract typed CompetitionRegistrationRules cleanly via _safe_call."""
    out: dict[str, Any] = {
        "competitionName": comp_map.get(comp_id) if comp_id else None,
        "maxSquadSize": None,
        "minHomegrownClub": None,
        "minHomegrownNation": None,
        "maxForeignPlayers": None,
        "u21Exempt": None,
        "matchdaySubsLimit": None,
    }
    fn = getattr(save, "competition_rules", None)
    if not callable(fn):
        return out
    raw = _safe_call(fn, "competition_rules", default=[])
    if raw is None:
        return out

    rows = []
    if hasattr(raw, "where") and comp_id is not None:
        try:
            rows = list(raw.where(competition_id=comp_id))
        except Exception:
            rows = []
    if not rows:
        if isinstance(raw, (list, tuple)) or (hasattr(raw, "__iter__") and not isinstance(raw, (str, bytes, dict))):
            try:
                for idx, row in enumerate(raw):
                    if idx >= 500:
                        break
                    r_cid = _int(_first_attr(row, ("competition_id", "comp_id", "id")), None)
                    if comp_id is not None and r_cid == comp_id:
                        rows = [row]
                        break
                    if not rows:
                        rows.append(row)
            except Exception:
                pass
        else:
            rows = [raw]

    target = rows[0] if rows else None
    if target is None:
        return out

    out["competitionName"] = (
        getattr(target, "competition_name", None)
        or out["competitionName"]
        or "Domestic League"
    )
    out["maxSquadSize"] = _int(
        _first_attr(target, ("max_squad_size", "squad_size_limit", "max_registered_players", "squad_limit")),
        None,
    )
    out["minHomegrownClub"] = _int(
        _first_attr(target, ("min_homegrown_club", "min_trained_at_club", "homegrown_club_min")),
        None,
    )
    out["minHomegrownNation"] = _int(
        _first_attr(target, ("min_homegrown_nation", "min_trained_in_nation", "homegrown_nation_min")),
        None,
    )
    out["maxForeignPlayers"] = _int(
        _first_attr(target, ("max_foreign_players", "max_non_eu", "foreign_player_limit")),
        None,
    )
    u21_val = _first_attr(target, ("u21_exempt", "under_21_exempt", "youth_exempt"))
    if isinstance(u21_val, bool):
        out["u21Exempt"] = u21_val
    elif u21_val is not None:
        out["u21Exempt"] = bool(u21_val)
    out["matchdaySubsLimit"] = _int(
        _first_attr(target, ("matchday_subs_limit", "max_substitutes", "subs_used_limit", "substitutes_allowed")),
        None,
    )
    out["fixturesPerClub"] = _int(
        _first_attr(target, ("fixtures_per_club", "matches_per_team")),
        None,
    )
    out["promotionPlaces"] = _int(
        _first_attr(target, ("promotion_places", "automatic_promotion_places")),
        None,
    )
    out["playoffPlaces"] = _int(
        _first_attr(target, ("playoff_places", "promotion_playoff_places")),
        None,
    )
    out["relegationPlaces"] = _int(
        _first_attr(target, ("relegation_places", "automatic_relegation_places")),
        None,
    )
    return out


def step_players() -> str:
    """Group 1: Club-scoped players with all 52 attributes, readable traits,
    qualitative Scout Report Badges, and relative star ratings (ZERO raw CA/PA)."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    club_name = _STATE["club_name"]
    game_date = _STATE["game_date"]
    club_name_lower = club_name.lower() if club_name else None

    players_out: list[dict[str, Any]] = []
    squad_uids: set[int] = set()

    p_table = save.players()
    raw_players = []
    if club_uid is not None:
        try:
            raw_players = list(p_table.where(club_uid=club_uid))
        except Exception:
            raw_players = []

    if not raw_players:
        try:
            for p in p_table:
                matches_club = False
                if club_uid is not None and (
                    getattr(p, "club_uid", None) == club_uid
                    or getattr(p, "team_club_uid", None) == club_uid
                ):
                    matches_club = True
                elif (
                    club_name_lower
                    and getattr(p, "club_name", None)
                    and p.club_name.lower() == club_name_lower
                ):
                    matches_club = True
                if matches_club:
                    raw_players.append(p)
        except Exception as exc:
            _STATE["warnings"].append(f"players_scan: {type(exc).__name__}: {exc}")

    # Compute internal squad median solely for relative 1.0–5.0 star scaling (never emitted raw)
    internal_ca_values: list[int] = []
    for p in raw_players:
        ability = getattr(p, "ability", None)
        ca_val = _int(getattr(ability, "current", None), 0) or 0
        if ca_val > 0:
            internal_ca_values.append(ca_val)
    internal_ca_values.sort()
    squad_median = (
        float(internal_ca_values[len(internal_ca_values) // 2])
        if internal_ca_values
        else 90.0
    )

    # Sort tie-breaker kept locally without exposing raw CA/PA
    sort_keys: dict[int, float] = {}

    for p in raw_players:
        if not getattr(p, "name", None):
            continue
        uid = int(p.uid)
        squad_uids.add(uid)

        attrs = getattr(p, "attributes", None)
        contract = getattr(p, "contract", None)
        ability = getattr(p, "ability", None)
        pers = getattr(p, "personality", None)

        nat_pos = list(getattr(p, "natural_positions", None) or [])
        acc_pos = list(getattr(p, "accomplished_positions", None) or [])
        pos_str = (
            ", ".join(nat_pos)
            if nat_pos
            else (", ".join(acc_pos) if acc_pos else "UTL")
        )
        secondary_pos = [pos for pos in acc_pos if pos not in nat_pos]

        cond_pct = _clamp_pct(getattr(p, "raw_condition", None) or getattr(p, "condition", None))
        sharp_pct = _clamp_pct(
            getattr(p, "raw_match_sharpness", None) or getattr(p, "match_sharpness", None)
        )

        pos_ratings = None
        raw_pos_map = getattr(p, "positions", None) or getattr(p, "position_ratings", None)
        if raw_pos_map is not None:
            try:
                if isinstance(raw_pos_map, dict):
                    pos_ratings = {str(k): _clamp_attr(v, 1) for k, v in raw_pos_map.items()}
                else:
                    pos_ratings = {}
                    for code in (
                        "GK", "DL", "DC", "DR", "WBL", "DM", "WBR",
                        "ML", "MC", "MR", "AML", "AMC", "AMR", "ST",
                    ):
                        val = getattr(raw_pos_map, code.lower(), None)
                        if val is None:
                            val = getattr(raw_pos_map, code, None)
                        if val is not None:
                            pos_ratings[code] = _clamp_attr(val, 1)
                    if not pos_ratings:
                        pos_ratings = None
            except Exception:
                pos_ratings = None

        left_foot = _int(
            getattr(p, "left_foot", None)
            or (getattr(attrs, "left_foot", None) if attrs else None)
        )
        right_foot = _int(
            getattr(p, "right_foot", None)
            or (getattr(attrs, "right_foot", None) if attrs else None)
        )
        height_cm = _int(getattr(p, "height", None) or getattr(p, "height_cm", None))

        attr_map = _extract_52_attributes(p, attrs)
        traits_list = _extract_traits(p)
        scout_badges = _extract_reliability_badges(p, pers)

        # Internal-only conversion to relative stars + qualitative personality label (ZERO raw CA/PA emitted)
        ca_internal = _int(getattr(ability, "current", None), 0) or 0
        pa_internal = _int(getattr(ability, "potential", None), 0) or 0
        ability_stars = _compute_relative_star(ca_internal, squad_median)
        potential_stars = max(
            ability_stars, _compute_relative_star(pa_internal, squad_median)
        )
        personality_label = _infer_personality_label(attr_map["determination"], pers)
        sort_keys[uid] = ability_stars

        contract_end = getattr(contract, "end", None) if contract else None
        contract_months = _int(
            getattr(p, "contract_expiry_months", None),
            _months_until(contract_end, game_date) if contract_end else 12,
        )

        # Attach baseline contract details from player.contract (enriched further from save.contracts() below)
        contract_details = _extract_contract_details(contract, p)

        nation_lookup = _build_nation_lookup(save)
        players_out.append({
            "uid": uid,
            "name": p.name,
            "position": pos_str,
            "primaryPosition": nat_pos[0] if nat_pos else (acc_pos[0] if acc_pos else pos_str),
            "secondaryPositions": secondary_pos,
            "age": _int(getattr(p, "age", None), 22),
            "nation": _resolve_player_nationality(p, nation_lookup, default="Unknown"),
            "abilityStars": ability_stars,
            "potentialStars": potential_stars,
            "personalityLabel": personality_label,
            "condition": cond_pct,
            "sharpness": sharp_pct,
            "leftFoot": left_foot,
            "rightFoot": right_foot,
            "heightCm": height_cm,
            "positionRatings": pos_ratings,
            "wagePw": _int(getattr(contract, "wage", None), 0) if contract else 0,
            "expires": (_dmy(contract_end) or "N/A") if contract else "N/A",
            "contractExpiryMonths": contract_months,
            "contractDetails": contract_details,
            "onLoan": bool(getattr(p, "on_loan", False)),
            "teamSlot": _int(getattr(p, "team_slot", None), 0),
            "apps": "0",
            "minutes": 0,
            "rating": None,
            "goals": 0,
            "xG": 0.0,
            "xGPer90": 0.0,
            "assists": 0,
            "xA": 0.0,
            "xAPer90": 0.0,
            "drbPer90": 0.0,
            "prPassesPer90": 0.0,
            "hdrPct": 0,
            "intPer90": 0.0,
            "tckPct": 0,
            "distanceKm": 0.0,
            "yellowCards": 0,
            "redCards": 0,
            "attributes": attr_map,
            "traits": traits_list,
            "scoutBadges": scout_badges,
            "activeSuspensions": [],
            "suspensionsCount": len(p.suspensions) if getattr(p, "suspensions", None) else 0,
        })

    # Read baseline suspensions and injuries directly off the already-extracted squad player objects first
    # (zero global table queries in Step 2/6; Fast Sync relies on these direct objects without global scans)
    player_name_by_uid = {int(p_rec["uid"]): str(p_rec["name"]) for p_rec in players_out}
    direct_suspensions = _extract_player_object_suspensions(
        raw_players,
        squad_uids,
        player_name_by_uid,
        _STATE.get("comp_name_by_id", {}),
    )
    direct_injuries: list[dict[str, Any]] = []
    seen_direct_inj_keys: set[tuple[int, str]] = set()
    for p in raw_players:
        p_uid = _int(getattr(p, "uid", None), None)
        if p_uid is None or p_uid not in squad_uids:
            continue
        raw_inj_list = getattr(p, "injuries", None)
        single_inj = getattr(p, "injury", None)
        candidates_inj: list[Any] = []
        if isinstance(raw_inj_list, (list, tuple)):
            candidates_inj.extend(raw_inj_list)
        elif raw_inj_list is not None:
            candidates_inj.append(raw_inj_list)
        if single_inj is not None:
            candidates_inj.append(single_inj)
        for inj in candidates_inj:
            if inj is None:
                continue
            kind_str = str(getattr(inj, "kind", "") or "").lower()
            inj_date = getattr(inj, "date", None)
            days_rem = _int(_first_attr(inj, ("days_remaining", "days_left", "duration_days")), None)
            is_active = (
                bool(getattr(inj, "is_active", False))
                or "current" in kind_str
                or "active" in kind_str
                or (days_rem is not None and days_rem > 0)
                or (game_date and inj_date and (game_date - inj_date).days <= 30)
                or (not kind_str and inj_date is None)
            )
            if not is_active:
                continue
            type_name = str(
                _first_attr(inj, ("type_name", "injury_type", "name", "description")) or "Injury"
            )
            dedup_key = (p_uid, type_name.lower())
            if dedup_key in seen_direct_inj_keys:
                continue
            seen_direct_inj_keys.add(dedup_key)
            direct_injuries.append({
                "playerUid": p_uid,
                "playerName": getattr(inj, "player_name", None) or player_name_by_uid.get(p_uid),
                "typeName": type_name,
                "date": _dmy(inj_date),
                "severity": _label(getattr(inj, "severity", None)),
                "cause": _label(getattr(inj, "cause", None)),
                "kind": kind_str or "current",
            })
            if len(direct_injuries) >= 25:
                break

    bans_by_uid: dict[int, list[dict[str, Any]]] = {}
    for ban in direct_suspensions:
        bans_by_uid.setdefault(int(ban["playerUid"]), []).append(ban)

    missing_contract_uids: set[int] = set()
    suspensions_hint_uids: set[int] = set()
    for p_rec in players_out:
        uid = int(p_rec["uid"])
        p_bans = bans_by_uid.get(uid, [])
        p_rec["activeSuspensions"] = p_bans
        if p_bans:
            p_rec["suspensionsCount"] = len(p_bans)
        elif (p_rec.get("suspensionsCount") or 0) > 0:
            suspensions_hint_uids.add(uid)

        cd = p_rec.get("contractDetails") or {}
        has_rich_contract = bool(
            cd.get("releaseClauses")
            or (cd.get("optionalExtensionYears") or 0) > 0
            or (cd.get("bonuses") and len(cd["bonuses"]) > 0)
            or cd.get("loanWageContributionPct") is not None
            or (cd.get("promisedPlayingTime") and cd.get("promisedPlayingTime") != "Squad Player")
        )
        if not has_rich_contract:
            missing_contract_uids.add(uid)

    players_out.sort(key=lambda x: (-sort_keys.get(x["uid"], 0.0), x["name"]))
    _STATE["direct_injuries"] = direct_injuries[:15]
    _STATE["active_injuries"] = list(direct_injuries[:15])
    _STATE["active_suspensions"] = direct_suspensions
    _STATE["missing_contract_uids"] = missing_contract_uids
    _STATE["suspensions_hint_uids"] = suspensions_hint_uids
    _STATE["players_out"] = players_out
    _STATE["squad_uids"] = squad_uids
    del raw_players, sort_keys, bans_by_uid
    gc.collect()
    elapsed_ms = _record_step_timing("step_2_players", t0)
    return json.dumps({
        "playerCount": len(players_out),
        "suspensionsCount": len(direct_suspensions),
        "directInjuriesCount": len(_STATE["direct_injuries"]),
        "missingContractUidsCount": len(missing_contract_uids),
        "elapsedMs": elapsed_ms,
    })


def _classify_pos_group_py(pos: str) -> str:
    p = (pos or "").upper()
    if "GK" in p:
        return "GK"
    if any(k in p for k in ("ST", "CF")):
        return "FWD"
    if any(k in p for k in ("DC", "CB", "DL", "DR", "WB", "D (")):
        return "DEF"
    return "MID"


def _score_candidate_visible_quality(pos: str, attr_dict: dict[str, int]) -> float:
    """Position-appropriate visible-attribute quality score (0..20 scale, ZERO raw CA/PA)."""
    p = (pos or "").upper()
    if "GK" in p:
        keys = ("reflexes", "handling", "aerialReach", "positioning", "oneOnOnes", "commandOfArea")
    elif any(k in p for k in ("ST", "CF")):
        keys = ("finishing", "offTheBall", "pace", "composure", "acceleration", "firstTouch")
    elif any(k in p for k in ("DC", "CB", "D (C")):
        keys = ("tackling", "marking", "positioning", "jumpingReach", "concentration", "strength")
    elif any(k in p for k in ("DL", "DR", "WB", "D (L", "D (R")):
        keys = ("pace", "stamina", "tackling", "crossing", "positioning", "acceleration")
    elif any(k in p for k in ("AML", "AMR", "AMC", "AM (", "ML", "MR")):
        keys = ("pace", "dribbling", "offTheBall", "passing", "firstTouch", "technique")
    else:
        keys = ("passing", "decisions", "workRate", "stamina", "firstTouch", "vision")
    vals = [float(attr_dict.get(k, 10)) for k in keys]
    return sum(vals) / max(len(vals), 1)


def _compute_squad_group_medians(players_out: list[dict[str, Any]]) -> dict[str, float]:
    by_grp: dict[str, list[float]] = {"GK": [], "DEF": [], "MID": [], "FWD": []}
    for pl in players_out:
        pos = str(pl.get("primaryPosition") or pl.get("position") or "MC")
        grp = _classify_pos_group_py(pos)
        attrs = pl.get("attributes") or {}
        if isinstance(attrs, dict) and attrs:
            by_grp[grp].append(_score_candidate_visible_quality(pos, attrs))
    medians: dict[str, float] = {}
    for grp, scores in by_grp.items():
        if scores:
            s = sorted(scores)
            medians[grp] = s[len(s) // 2]
        else:
            medians[grp] = 10.5
    return medians


def _classify_exact_pos_slot_py(pos: str) -> str:
    p = (pos or "").upper().strip()
    if "GK" in p:
        return "GK"
    if "ST" in p or "CF" in p:
        return "ST"
    if "AML" in p or "ML" in p or "M (L" in p or "AM (L" in p:
        return "AML"
    if "AMR" in p or "MR" in p or "M (R" in p or "AM (R" in p:
        return "AMR"
    if "AMC" in p or "AM (C" in p:
        return "AMC"
    if "DL" in p or "WBL" in p or "D (L" in p:
        return "DL"
    if "DR" in p or "WBR" in p or "D (R" in p:
        return "DR"
    if "DC" in p or "CB" in p or "D (C" in p:
        return "DC"
    if "DM" in p:
        return "DM"
    return "MC"


_EUROPEAN_NATIONS = frozenset({
    "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belgium", "Belarus",
    "Bosnia & Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark",
    "England", "Estonia", "Faroe Islands", "Finland", "France", "Georgia", "Germany",
    "Greece", "Hungary", "Iceland", "Israel", "Italy", "Kazakhstan", "Kosovo", "Latvia",
    "Liechtenstein", "Lithuania", "Luxembourg", "North Macedonia", "Malta", "Netherlands",
    "Northern Ireland", "Norway", "Poland", "Portugal", "Republic of Ireland", "Romania",
    "Russia", "San Marino", "Scotland", "Serbia", "Slovakia", "Slovenia", "Spain",
    "Sweden", "Switzerland", "Turkey", "Ukraine", "Wales", "Montenegro",
})


def _scan_recruitment_targets_group4(
    save: Any,
    club_uid: int | None,
    game_date: Any,
    wage_budget_weekly: int | None,
) -> list[dict[str, Any]]:
    """Group 4: Full-database scan for signable Free Agents and Contracts Expiring <= 12 Months
    using 10 position-balanced top-N min-heaps (up to 500 targets across GK, DC, DL, DR, DM,
    MC, AMC, AML, AMR, ST) with resolved nationalities, realistic club wage/reputation tiering,
    and full 52 visible attributes (ZERO raw CA/PA exposed)."""
    import heapq

    start_ts = time.monotonic()
    nation_lookup = _build_nation_lookup(save)

    players_out = _STATE.get("players_out", [])
    squad_medians = _compute_squad_group_medians(players_out)
    club_wages = [int(p.get("wagePw") or 0) for p in players_out if (p.get("wagePw") or 0) > 0]
    max_club_wage = max(club_wages) if club_wages else 2500
    if wage_budget_weekly and wage_budget_weekly > 0:
        wage_ceiling = max(int(wage_budget_weekly * 0.25), int(max_club_wage * 2.0), 1800)
    else:
        wage_ceiling = max(int(max_club_wage * 2.0), 2500)

    club_rep = _STATE.get("club_reputation")
    rep_max = (club_rep + 1800) if isinstance(club_rep, int) and club_rep > 0 else None
    rep_min = max(0, club_rep - 2800) if isinstance(club_rep, int) and club_rep > 0 else None

    # Pre-compute managed club's dominant nationality ONCE before scanning 160k+ players
    club_nation_name: str | None = None
    if players_out:
        nation_counts: dict[str, int] = {}
        for sp in players_out:
            sn = sp.get("nation")
            if isinstance(sn, str) and sn and sn not in ("Unknown", "FM"):
                nation_counts[sn] = nation_counts.get(sn, 0) + 1
        if nation_counts:
            club_nation_name = max(nation_counts.items(), key=lambda kv: kv[1])[0]
    club_is_european = bool(club_nation_name and club_nation_name in _EUROPEAN_NATIONS)

    pos_heaps: dict[str, list[tuple[float, int, dict[str, Any]]]] = {
        slot: [] for slot in ("GK", "DC", "DL", "DR", "DM", "MC", "AMC", "AML", "AMR", "ST")
    }
    per_pos_cap = SCOUT_PER_POSITION_CAP
    tie_counter = 0
    evaluated_count = 0

    try:
        p_table = save.players()
        seen = 0
        for p in p_table:
            seen += 1
            if (seen & 1023) == 0 and (time.monotonic() - start_ts) >= SCOUT_BUDGET_SEC:
                _record_warning(
                    f"recruitment_scan: {SCOUT_BUDGET_SEC:.0f}s budget reached ({seen} players scanned, {evaluated_count} realistic targets evaluated)"
                )
                break

            p_club_uid = getattr(p, "club_uid", None)
            if club_uid is not None and p_club_uid == club_uid:
                continue

            age = _int(getattr(p, "age", None), 22) or 22
            if age < 16 or age > 34:
                continue

            contract = getattr(p, "contract", None)
            contract_end = getattr(contract, "end", None) if contract else None
            contract_months = _int(
                getattr(p, "contract_expiry_months", None),
                _months_until(contract_end, game_date) if contract_end else (0 if p_club_uid is None else 999),
            )
            if contract_months is None:
                contract_months = 0 if p_club_uid is None else 999

            is_free_agent = (p_club_uid is None) or (contract is None) or (contract_months == 0)
            is_expiring = (not is_free_agent) and (0 < contract_months <= 12)
            if not (is_free_agent or is_expiring):
                continue

            p_wage = _int(
                getattr(p, "demanded_wage", None)
                or (getattr(contract, "wage", None) if contract else None),
                0,
            ) or 0
            if not is_free_agent and p_wage > wage_ceiling:
                continue

            p_rep = _int(_first_attr(p, ("reputation", "current_reputation", "home_reputation")), None)
            if rep_max is not None and p_rep is not None:
                if p_rep > rep_max or (rep_min is not None and p_rep < rep_min):
                    continue

            p_name = getattr(p, "name", None)
            if not p_name:
                continue

            attrs = getattr(p, "attributes", None)
            nat_pos = list(getattr(p, "natural_positions", None) or [])
            acc_pos = list(getattr(p, "accomplished_positions", None) or [])
            primary_pos = nat_pos[0] if nat_pos else (acc_pos[0] if acc_pos else "MC")
            pos_grp = _classify_pos_group_py(primary_pos)
            exact_slot = _classify_exact_pos_slot_py(primary_pos)

            # Fast pre-scoring before full 52-attr allocation
            attr_dict = _extract_52_attributes(p, attrs)
            if pos_grp != "GK" and age >= 30 and attr_dict["pace"] < 10:
                continue

            vis_quality = _score_candidate_visible_quality(primary_pos, attr_dict)
            squad_med = squad_medians.get(pos_grp, 10.5)
            if vis_quality < max(7.5, squad_med - 2.5):
                continue

            # Prime/U28 age weighting: strongly favor 18-27 over 30+ veterans
            if 18 <= age <= 25:
                age_bonus = 2.0
            elif 26 <= age <= 28:
                age_bonus = 1.2
            elif age in (16, 17, 29):
                age_bonus = 0.6
            elif 30 <= age <= 32:
                age_bonus = -1.6
            else:
                age_bonus = -3.2

            resolved_nation = _resolve_player_nationality(p, nation_lookup, default="Unknown")
            region_bonus = 0.0
            if club_nation_name and resolved_nation == club_nation_name:
                region_bonus = 2.4
            elif club_is_european and resolved_nation in _EUROPEAN_NATIONS:
                region_bonus = 1.1

            contract_bonus = 0.6 if is_free_agent else (0.3 if contract_months <= 6 else 0.0)
            rank_score = (vis_quality - squad_med) * 2.0 + vis_quality + age_bonus + region_bonus + contract_bonus

            bucket = pos_heaps[exact_slot]
            evaluated_count += 1
            if len(bucket) >= per_pos_cap and rank_score <= bucket[0][0]:
                continue

            pers = getattr(p, "personality", None)
            raw_pos_map = getattr(p, "positions", None) or getattr(p, "position_ratings", None)
            pos_ratings: dict[str, int] = {}
            if raw_pos_map is not None:
                for pos_key in (
                    "gk", "dl", "dc", "dr", "wbl", "dm", "wbr", "ml", "mc", "mr",
                    "aml", "amc", "amr", "st", "GK", "DL", "DC", "DR", "WBL", "DM",
                    "WBR", "ML", "MC", "MR", "AML", "AMC", "AMR", "ST",
                ):
                    pv = (
                        raw_pos_map.get(pos_key)
                        if isinstance(raw_pos_map, dict)
                        else getattr(raw_pos_map, pos_key, None)
                    )
                    if pv is not None:
                        pos_ratings[pos_key.upper()] = _clamp_attr(pv, 1)
            for np_code in nat_pos:
                pos_ratings.setdefault(str(np_code).upper(), 20)
            for ap_code in acc_pos:
                pos_ratings.setdefault(str(ap_code).upper(), 16)

            attr_dict["keyPace"] = attr_dict["pace"]
            attr_dict["keyVision"] = attr_dict["vision"]
            attr_dict["keyDecision"] = attr_dict["decisions"]
            attr_dict["keyStamina"] = attr_dict["stamina"]

            candidate = {
                "uid": _int(getattr(p, "uid", None), 0) or 0,
                "name": str(p_name),
                "age": age,
                "nationality": resolved_nation,
                "primaryPosition": primary_pos,
                "positionRatings": pos_ratings if pos_ratings else None,
                "currentClub": "Free Agent" if is_free_agent else (getattr(p, "club_name", None) or "Expiring Contract"),
                "isFreeAgent": is_free_agent,
                "contractExpiryMonths": 0 if is_free_agent else int(contract_months),
                "expires": "Free" if is_free_agent else (_dmy(contract_end) or f"<= {contract_months}m"),
                "demandedWageEur": 0 if is_free_agent else p_wage,
                "scoutBadges": _extract_reliability_badges(p, pers),
                "traits": _extract_traits(p),
                "attributes": attr_dict,
            }

            tie_counter += 1
            if len(bucket) < per_pos_cap:
                heapq.heappush(bucket, (rank_score, tie_counter, candidate))
            else:
                heapq.heapreplace(bucket, (rank_score, tie_counter, candidate))
    except Exception as exc:
        _record_warning(f"recruitment_scan: {type(exc).__name__}")

    prime_ranked: list[tuple[float, dict[str, Any]]] = []
    vet_ranked: list[tuple[float, dict[str, Any]]] = []
    for bucket in pos_heaps.values():
        for score, _tie, cand in bucket:
            if (cand.get("age") or 22) >= 30:
                vet_ranked.append((score, cand))
            else:
                prime_ranked.append((score, cand))

    prime_ranked.sort(key=lambda pair: pair[0], reverse=True)
    vet_ranked.sort(key=lambda pair: pair[0], reverse=True)

    max_total = SCOUT_MAX_CANDIDATES
    prime_selected = [cand for _, cand in prime_ranked[:max_total]]
    max_vets_by_cap = int(max_total * 0.15)
    if len(prime_selected) < max_total:
        max_vets_for_actual = int((len(prime_selected) * 0.15) / 0.85)
        vet_slots = min(max_vets_by_cap, max_vets_for_actual, max_total - len(prime_selected))
    else:
        vet_slots = min(max_vets_by_cap, len(vet_ranked))
        prime_selected = [cand for _, cand in prime_ranked[: max_total - vet_slots]]

    vet_selected = [cand for _, cand in vet_ranked[: max(0, vet_slots)]]
    combined = prime_selected + vet_selected
    return combined[:max_total]


def step_3_1_finances() -> str:
    """Step 3/6 (1/4): Finances & 12-month cash runway — 6s cap, native club_uid filter,
    lazy stream (NEVER global list()), non-fatal fallback, and GC cleanup."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    latest_finance = None
    monthly_finances: list[dict[str, Any]] = []
    wage_budget_weekly = None
    timed_out = False
    warning_msg: str | None = None

    if club_uid is not None and save is not None:
        club_finances: list[Any] = []

        def _scan_finances(stream: Any) -> None:
            nonlocal timed_out
            seen = 0
            for fn in stream:
                seen += 1
                if (seen & 255) == 0 and (time.monotonic() - t0) >= FINANCES_BUDGET_SEC:
                    timed_out = True
                    break
                if getattr(fn, "club_uid", None) != club_uid:
                    continue
                club_finances.append(fn)

        try:
            primary_iter, fallback_table, used_scoped = _open_table_stream(
                save,
                "finances",
                club_uid=club_uid,
                try_where_club=True,
            )
            if primary_iter is not None:
                try:
                    _scan_finances(primary_iter)
                except Exception:
                    if fallback_table is not None and not timed_out:
                        _scan_finances(fallback_table)
                else:
                    if (
                        used_scoped
                        and not club_finances
                        and fallback_table is not None
                        and not timed_out
                        and (time.monotonic() - t0) < FINANCES_BUDGET_SEC
                    ):
                        _scan_finances(fallback_table)

            if timed_out:
                warning_msg = f"finances: {FINANCES_BUDGET_SEC:.0f}s budget reached ({len(club_finances)} snapshots; continuing)"
                _STATE["warnings"].append(warning_msg)

            if club_finances:
                club_finances.sort(key=lambda fn: getattr(fn, "month", None) or date(1900, 1, 1))
                last_12 = club_finances[-12:]
                prev_bal = None
                for fn in last_12:
                    bal = _float(getattr(fn, "balance", None), 0.0) or 0.0
                    wage_w = _float(
                        getattr(fn, "wage_payroll_weekly", None)
                        or getattr(fn, "wage_spend", None),
                        0.0,
                    ) or 0.0
                    net_cf = _float(getattr(fn, "net_cashflow", None), None)
                    if net_cf is None:
                        net_cf = (bal - prev_bal) if prev_bal is not None else 0.0
                    prev_bal = bal
                    monthly_finances.append({
                        "month": _iso(getattr(fn, "month", None)) or "Month",
                        "balance": round(bal, 2),
                        "wageSpend": round(wage_w, 2),
                        "netCashflow": round(net_cf, 2),
                    })
                f_last = club_finances[-1]
                wage_budget_weekly = _int(getattr(f_last, "wage_budget_weekly", None))
                latest_finance = {
                    "month": _iso(getattr(f_last, "month", None)),
                    "balance": _int(getattr(f_last, "balance", None)),
                    "wagePayrollWeekly": _int(getattr(f_last, "wage_payroll_weekly", None)),
                    "wageBudgetWeekly": wage_budget_weekly,
                    "transferBudgetRemaining": _int(getattr(f_last, "transfer_budget_remaining", None)),
                }
        except Exception as exc:
            warning_msg = f"finances: {type(exc).__name__}"
            _STATE["warnings"].append(warning_msg)
        finally:
            del club_finances

    _STATE["finances"] = latest_finance
    _STATE["monthly_finances"] = monthly_finances
    _STATE["wage_budget_weekly"] = wage_budget_weekly
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_1_finances", t0)
    return json.dumps({
        "monthlyFinances": len(monthly_finances),
        "elapsedMs": elapsed_ms,
        "timedOut": timed_out,
        "warning": warning_msg,
    })


def step_3_2_staff() -> str:
    """Step 3/6 (2/4): Club staff — 8s cap, native club_uid filter / lazy stream with
    immediate club_uid != target_club_uid skip (zero global list materialization)."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    staff_out: list[dict[str, Any]] = []
    timed_out = False
    warning_msg: str | None = None

    if club_uid is not None and save is not None:
        staff_method = "staff" if callable(getattr(save, "staff", None)) else (
            "non_players" if callable(getattr(save, "non_players", None)) else None
        )
        if staff_method is not None:
            club_name = (_STATE.get("meta") or {}).get("clubName", "")

            def _append_staff_row(s: Any) -> None:
                s_name = getattr(s, "name", None)
                if not s_name:
                    return
                s_attrs = getattr(s, "attributes", None)
                s_contract = getattr(s, "contract", None)
                s_def = _clamp_attr(_first_attr(s_attrs, ("defending", "coaching_defending")) if s_attrs else _first_attr(s, ("coaching_defending", "defending")), 10)
                s_att = _clamp_attr(_first_attr(s_attrs, ("attacking", "coaching_attacking")) if s_attrs else _first_attr(s, ("coaching_attacking", "attacking")), 10)
                s_tac = _clamp_attr(_first_attr(s_attrs, ("tactical", "coaching_tactical")) if s_attrs else _first_attr(s, ("coaching_tactical", "tactical")), 10)
                s_jpa = _clamp_attr(_first_attr(s_attrs, ("judging_player_ability", "judging_ability")) if s_attrs else _first_attr(s, ("judging_player_ability", "judging_ability")), 10)
                s_jpp = _clamp_attr(_first_attr(s_attrs, ("judging_player_potential", "judging_potential")) if s_attrs else _first_attr(s, ("judging_player_potential", "judging_potential")), 10)
                staff_out.append({
                    "uid": _int(getattr(s, "uid", None), 0) or 0,
                    "name": s_name,
                    "role": _label(getattr(s, "role", None) or getattr(s, "job", None)) or "Coach",
                    "age": _int(getattr(s, "age", None), 35),
                    "nation": getattr(s, "nation_name", None) or getattr(s, "nationality", None) or "N/A",
                    "club": club_name,
                    "wagePw": _int(getattr(s_contract, "wage", None), 0) if s_contract else 0,
                    "expires": (_dmy(getattr(s_contract, "end", None)) or "N/A") if s_contract else "N/A",
                    "coachingDefending": s_def,
                    "coachingAttacking": s_att,
                    "coachingTactical": s_tac,
                    "judgingAbility": s_jpa,
                    "judgingPotential": s_jpp,
                    "attributes": {
                        "attacking": s_att,
                        "defending": s_def,
                        "fitness": _clamp_attr(_first_attr(s_attrs, ("fitness",)) if s_attrs else 10, 10),
                        "goalkeeping": _clamp_attr(_first_attr(s_attrs, ("goalkeeping",)) if s_attrs else 10, 10),
                        "mental": _clamp_attr(_first_attr(s_attrs, ("mental",)) if s_attrs else 10, 10),
                        "possession": _clamp_attr(_first_attr(s_attrs, ("possession",)) if s_attrs else 10, 10),
                        "set_pieces": _clamp_attr(_first_attr(s_attrs, ("set_pieces",)) if s_attrs else 10, 10),
                        "tactical": s_tac,
                        "technical": _clamp_attr(_first_attr(s_attrs, ("technical",)) if s_attrs else 10, 10),
                        "working_with_youngsters": _clamp_attr(_first_attr(s_attrs, ("working_with_youngsters",)) if s_attrs else 10, 10),
                        "adaptability": _clamp_attr(_first_attr(s_attrs, ("adaptability",)) if s_attrs else 10, 10),
                        "authority": _clamp_attr(_first_attr(s_attrs, ("authority",)) if s_attrs else 10, 10),
                        "determination": _clamp_attr(_first_attr(s_attrs, ("determination",)) if s_attrs else 10, 10),
                        "judging_player_ability": s_jpa,
                        "judging_player_potential": s_jpp,
                        "judging_staff_ability": _clamp_attr(_first_attr(s_attrs, ("judging_staff_ability",)) if s_attrs else 10, 10),
                        "man_management": _clamp_attr(_first_attr(s_attrs, ("man_management",)) if s_attrs else 10, 10),
                        "motivating": _clamp_attr(_first_attr(s_attrs, ("motivating",)) if s_attrs else 10, 10),
                        "negotiating": _clamp_attr(_first_attr(s_attrs, ("negotiating",)) if s_attrs else 10, 10),
                        "physiotherapy": _clamp_attr(_first_attr(s_attrs, ("physiotherapy",)) if s_attrs else 10, 10),
                        "sports_science": _clamp_attr(_first_attr(s_attrs, ("sports_science",)) if s_attrs else 10, 10),
                        "tactical_knowledge": _clamp_attr(_first_attr(s_attrs, ("tactical_knowledge",)) if s_attrs else 10, 10),
                        "analysing_data": _clamp_attr(_first_attr(s_attrs, ("analysing_data",)) if s_attrs else 10, 10),
                    },
                })

            def _scan_staff(stream: Any) -> None:
                nonlocal timed_out
                seen = 0
                for s in stream:
                    seen += 1
                    if (seen & 255) == 0 and (time.monotonic() - t0) >= STAFF_BUDGET_SEC:
                        timed_out = True
                        break
                    # Immediate O(1) club_uid skip — never allocate for non-club staff
                    if getattr(s, "club_uid", None) != club_uid:
                        continue
                    _append_staff_row(s)
                    if len(staff_out) >= 40:
                        break

            try:
                primary_iter, fallback_table, used_scoped = _open_table_stream(
                    save,
                    staff_method,
                    club_uid=club_uid,
                    try_where_club=True,
                )
                if primary_iter is not None:
                    try:
                        _scan_staff(primary_iter)
                    except Exception:
                        if fallback_table is not None and not timed_out:
                            _scan_staff(fallback_table)
                    else:
                        if (
                            used_scoped
                            and not staff_out
                            and fallback_table is not None
                            and not timed_out
                            and (time.monotonic() - t0) < STAFF_BUDGET_SEC
                        ):
                            _scan_staff(fallback_table)
                if timed_out:
                    warning_msg = f"staff: {STAFF_BUDGET_SEC:.0f}s budget reached ({len(staff_out)} club staff captured; continuing)"
                    _STATE["warnings"].append(warning_msg)
            except Exception as exc:
                warning_msg = f"staff: {type(exc).__name__}"
                _STATE["warnings"].append(warning_msg)

    _STATE["staff_out"] = staff_out
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_2_staff", t0)
    return json.dumps({
        "staff": len(staff_out),
        "elapsedMs": elapsed_ms,
        "timedOut": timed_out,
        "warning": warning_msg,
    })


def _extract_club_scoped_capped(
    save: Any,
    club_uid: int | None,
    method_name: str,
    default_val: Any,
    filter_by_club: bool = True,
) -> Any:
    """Time-capped lazy club-scoped ops table reader (6s cap per table, native club_uid filter)."""
    tbl_t0 = time.monotonic()
    primary_iter, fallback_table, used_scoped = _open_table_stream(
        save,
        method_name,
        club_uid=club_uid if filter_by_club else None,
        try_where_club=filter_by_club,
    )
    if primary_iter is None:
        return default_val
    if isinstance(primary_iter, dict):
        return _to_json_safe(primary_iter)
    if not hasattr(primary_iter, "__iter__") or isinstance(primary_iter, (str, bytes)):
        return _to_json_safe(primary_iter)

    items: list[Any] = []
    tbl_timed_out = False

    def _scan(stream: Any) -> None:
        nonlocal tbl_timed_out
        seen = 0
        for row in stream:
            seen += 1
            if (seen & 127) == 0 and (time.monotonic() - tbl_t0) >= CLUB_OPS_TABLE_BUDGET_SEC:
                tbl_timed_out = True
                break
            if seen >= 2000 and not items:
                break
            r_cid = getattr(row, "club_uid", None)
            if filter_by_club and r_cid is not None and club_uid is not None and r_cid != club_uid:
                continue
            items.append(_to_json_safe(row))
            if len(items) >= (1 if isinstance(default_val, dict) and filter_by_club else 25):
                break

    try:
        _scan(primary_iter)
    except Exception:
        if fallback_table is not None and not tbl_timed_out:
            try:
                _scan(fallback_table)
            except Exception:
                return default_val
        else:
            return default_val
    else:
        if (
            used_scoped
            and not items
            and fallback_table is not None
            and not tbl_timed_out
            and (time.monotonic() - tbl_t0) < CLUB_OPS_TABLE_BUDGET_SEC
        ):
            try:
                _scan(fallback_table)
            except Exception:
                pass

    if tbl_timed_out:
        _STATE["warnings"].append(f"{method_name}: {CLUB_OPS_TABLE_BUDGET_SEC:.0f}s budget reached")

    if isinstance(default_val, dict):
        return items[0] if items and isinstance(items[0], dict) else ({"items": items} if items else default_val)
    return items


def step_3_3_tactics_and_mentoring() -> str:
    """Step 3/6: Tactics & mentoring — managed-club-only tables (always runs in both Fast Sync & Full Sync)."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    if save is None:
        elapsed_ms = _record_step_timing("step_3_3_tactics_mentoring", t0)
        return json.dumps({"tactics": 0, "mentoring": 0, "elapsedMs": elapsed_ms})

    # 1. Club tactics (6s cap, lazy stream, native club_uid filter)
    tactics_out: list[dict[str, Any]] = []
    tac_t0 = time.monotonic()
    tac_timed_out = False
    player_name_lookup = {int(p["uid"]): str(p["name"]) for p in _STATE.get("players_out", [])}

    def _scan_tactics(stream: Any) -> None:
        nonlocal tac_timed_out
        seen = 0
        for t in stream:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - tac_t0) >= CLUB_OPS_TABLE_BUDGET_SEC:
                tac_timed_out = True
                break
            if club_uid is None or getattr(t, "club_uid", None) != club_uid:
                continue
            if getattr(t, "team_slot", None) not in (None, 0):
                continue
            ip_form = _label(_first_attr(t, ("in_possession_formation", "ip_formation", "formation", "formation_name"))) or None
            oop_form = _label(_first_attr(t, ("out_of_possession_formation", "oop_formation"))) or None
            raw_slots = _first_attr(t, ("slots", "positions", "lineup", "players", "roles"))
            slots_out = []
            if isinstance(raw_slots, (list, tuple)):
                for s_idx, sl in enumerate(raw_slots[:11]):
                    sl_pos = _label(_first_attr(sl, ("position", "slot_position", "pos"))) or f"Slot {s_idx + 1}"
                    sl_ip = _label(_first_attr(sl, ("in_possession_role", "ip_role", "role", "role_name")))
                    sl_oop = _label(_first_attr(sl, ("out_of_possession_role", "oop_role")))
                    sl_puid = _int(_first_attr(sl, ("player_uid", "person_uid")), None)
                    sl_pname = (
                        getattr(sl, "player_name", None)
                        or (player_name_lookup.get(sl_puid) if sl_puid is not None else None)
                    )
                    slots_out.append({
                        "slotIndex": s_idx,
                        "position": sl_pos,
                        "inPossessionRole": sl_ip,
                        "outOfPossessionRole": sl_oop,
                        "playerUid": sl_puid,
                        "playerName": sl_pname,
                    })
            tactics_out.append({
                "index": int(getattr(t, "index", len(tactics_out))),
                "name": getattr(t, "name", None) or f"Tactic {len(tactics_out) + 1}",
                "styleName": getattr(t, "style_name", "") or "",
                "mentality": _label(getattr(t, "mentality", None)) or "Standard",
                "inPossessionFormation": ip_form,
                "outOfPossessionFormation": oop_form,
                "slots": slots_out,
            })
            if len(tactics_out) >= 3:
                break

    try:
        tac_iter, tac_fb, tac_scoped = _open_table_stream(
            save, "tactics", club_uid=club_uid, try_where_club=True
        )
        if tac_iter is not None:
            try:
                _scan_tactics(tac_iter)
            except Exception:
                if tac_fb is not None and not tac_timed_out:
                    _scan_tactics(tac_fb)
            else:
                if (
                    tac_scoped
                    and not tactics_out
                    and tac_fb is not None
                    and not tac_timed_out
                    and (time.monotonic() - tac_t0) < CLUB_OPS_TABLE_BUDGET_SEC
                ):
                    _scan_tactics(tac_fb)
        if tac_timed_out:
            _STATE["warnings"].append(f"tactics: {CLUB_OPS_TABLE_BUDGET_SEC:.0f}s budget reached")
    except Exception as exc:
        _STATE["warnings"].append(f"tactics: {type(exc).__name__}")

    # 2. Mentoring groups (6s cap, lazy stream, native club_uid filter)
    mentoring_out: list[dict[str, Any]] = []
    mg_t0 = time.monotonic()
    mg_timed_out = False

    def _scan_mentoring(stream: Any) -> None:
        nonlocal mg_timed_out
        seen = 0
        for mg in stream:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - mg_t0) >= CLUB_OPS_TABLE_BUDGET_SEC:
                mg_timed_out = True
                break
            if club_uid is None or getattr(mg, "club_uid", None) != club_uid:
                continue
            if getattr(mg, "team_slot", None) not in (None, 0):
                continue
            members = [m for m in (getattr(mg, "member_names", None) or []) if m]
            if members:
                mentoring_out.append({
                    "groupNumber": int(getattr(mg, "group_number", len(mentoring_out) + 1)),
                    "label": getattr(mg, "label", None) or f"Group {len(mentoring_out) + 1}",
                    "members": members,
                })
                if len(mentoring_out) >= 5:
                    break

    try:
        mg_iter, mg_fb, mg_scoped = _open_table_stream(
            save, "mentoring", club_uid=club_uid, try_where_club=True
        )
        if mg_iter is not None:
            try:
                _scan_mentoring(mg_iter)
            except Exception:
                if mg_fb is not None and not mg_timed_out:
                    _scan_mentoring(mg_fb)
            else:
                if (
                    mg_scoped
                    and not mentoring_out
                    and mg_fb is not None
                    and not mg_timed_out
                    and (time.monotonic() - mg_t0) < CLUB_OPS_TABLE_BUDGET_SEC
                ):
                    _scan_mentoring(mg_fb)
        if mg_timed_out:
            _STATE["warnings"].append(f"mentoring: {CLUB_OPS_TABLE_BUDGET_SEC:.0f}s budget reached")
    except Exception as exc:
        _STATE["warnings"].append(f"mentoring: {type(exc).__name__}")

    _STATE["tactics"] = tactics_out[:3]
    _STATE["mentoring"] = mentoring_out[:5]
    del player_name_lookup
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_3_tactics_mentoring", t0)
    return json.dumps({
        "tactics": len(_STATE["tactics"]),
        "mentoring": len(_STATE["mentoring"]),
        "elapsedMs": elapsed_ms,
    })


def step_3_3_injuries(fast_sync: bool | None = None) -> str:
    """Step 3/6: Injuries — uses direct p.injuries / p.injury read in Step 2/6 first;
    only queries global save.injuries() in Full Sync."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    direct_injuries = list(_STATE.get("direct_injuries") or [])
    if use_fast:
        _STATE["active_injuries"] = direct_injuries[:15]
        _record_fast_sync_skip_note()
        gc.collect()
        elapsed_ms = _record_step_timing("step_3_3_injuries", t0)
        return json.dumps({
            "injuries": len(_STATE["active_injuries"]),
            "skippedGlobal": True,
            "elapsedMs": elapsed_ms,
        })

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    game_date = _STATE["game_date"]
    active_injuries: list[dict[str, Any]] = list(direct_injuries)
    seen_keys: set[tuple[Any, str]] = {
        (item.get("playerUid"), str(item.get("typeName") or "").lower())
        for item in active_injuries
    }
    inj_timed_out = False

    def _scan_injuries(stream: Any) -> None:
        nonlocal inj_timed_out
        seen = 0
        for inj in stream:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - t0) >= CLUB_OPS_TABLE_BUDGET_SEC:
                inj_timed_out = True
                break
            p_uid = getattr(inj, "player_uid", None)
            if p_uid not in squad_uids and (club_uid is None or getattr(inj, "club_uid", None) != club_uid):
                continue
            kind_str = str(getattr(inj, "kind", "")).lower()
            if "current" in kind_str or "active" in kind_str or (game_date and getattr(inj, "date", None) and (game_date - inj.date).days <= 30):
                type_name = getattr(inj, "type_name", None) or getattr(inj, "injury_type", None) or "Injury"
                k = (p_uid, str(type_name).lower())
                if k in seen_keys:
                    continue
                seen_keys.add(k)
                active_injuries.append({
                    "playerUid": p_uid,
                    "playerName": getattr(inj, "player_name", None),
                    "typeName": type_name,
                    "date": _dmy(getattr(inj, "date", None)),
                    "severity": _label(getattr(inj, "severity", None)),
                    "cause": _label(getattr(inj, "cause", None)),
                    "kind": kind_str,
                })
                if len(active_injuries) >= 25:
                    break

    if save is not None:
        try:
            inj_iter, inj_fb, inj_scoped = _open_table_stream(
                save, "injuries", club_uid=club_uid, squad_uids=squad_uids, try_where_club=True
            )
            if inj_iter is not None:
                try:
                    _scan_injuries(inj_iter)
                except Exception:
                    if inj_fb is not None and not inj_timed_out:
                        _scan_injuries(inj_fb)
                else:
                    if (
                        inj_scoped
                        and len(active_injuries) == len(direct_injuries)
                        and inj_fb is not None
                        and not inj_timed_out
                        and (time.monotonic() - t0) < CLUB_OPS_TABLE_BUDGET_SEC
                    ):
                        _scan_injuries(inj_fb)
            if inj_timed_out:
                _STATE["warnings"].append(f"injuries: {CLUB_OPS_TABLE_BUDGET_SEC:.0f}s budget reached")
        except Exception as exc:
            _STATE["warnings"].append(f"injuries: {type(exc).__name__}")

    _STATE["active_injuries"] = active_injuries[:15]
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_3_injuries", t0)
    return json.dumps({
        "injuries": len(_STATE["active_injuries"]),
        "skippedGlobal": False,
        "elapsedMs": elapsed_ms,
    })


def step_3_3_facilities(fast_sync: bool | None = None) -> str:
    """Step 3/6: Facilities — Full Sync only; skipped cleanly when fast_sync=True."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["facilities"] = {}
        _record_fast_sync_skip_note()
        gc.collect()
        elapsed_ms = _record_step_timing("step_3_3_facilities", t0)
        return json.dumps({"skipped": True, "elapsedMs": elapsed_ms})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    facilities: dict[str, Any] = {}
    if save is not None and club_uid is not None:
        try:
            fac_fn = getattr(save, "facilities", None)
            if callable(fac_fn):
                raw_fac = _safe_call(fac_fn, "facilities", default=[])
                rows = []
                if hasattr(raw_fac, "where"):
                    try:
                        rows = list(raw_fac.where(club_uid=club_uid))
                    except Exception:
                        rows = []
                if not rows and raw_fac is not None:
                    for item in raw_fac:
                        if getattr(item, "club_uid", None) == club_uid:
                            rows.append(item)
                            break
                if rows:
                    f0 = rows[0]
                    corp = _label(getattr(f0, "corporate_facilities", None))
                    trn = _label(getattr(f0, "training_facilities", None) or getattr(f0, "training", None))
                    yth = _label(getattr(f0, "youth_facilities", None) or getattr(f0, "youth", None))
                    if corp:
                        facilities["corporate"] = corp
                    if trn:
                        facilities["training"] = trn
                    if yth:
                        facilities["youth"] = yth
        except Exception as exc:
            _STATE["warnings"].append(f"facilities: {type(exc).__name__}")

    _STATE["facilities"] = facilities
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_3_facilities", t0)
    return json.dumps({"skipped": False, "elapsedMs": elapsed_ms})


def step_3_3_competition_rules(fast_sync: bool | None = None) -> str:
    """Stage 4 (Full Sync): Competition rules — can trigger heavy fixture-calendar decoding in fmsave."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    comp_map = _STATE.get("comp_name_by_id", {})
    ls = _STATE.get("league_standing")
    ls_comp_id = ls.get("competitionId") if isinstance(ls, dict) else None
    ls_comp_name = ls.get("competitionName") if isinstance(ls, dict) else None
    club_div_id = _STATE.get("club_division_id") or ls_comp_id
    empty_rules = {
        "competitionName": (comp_map.get(club_div_id) if club_div_id else None) or ls_comp_name,
        "maxSquadSize": None,
        "minHomegrownClub": None,
        "minHomegrownNation": None,
        "maxForeignPlayers": None,
        "u21Exempt": None,
        "matchdaySubsLimit": None,
    }
    if use_fast:
        _STATE["competition_rules"] = empty_rules
        _record_fast_sync_skip_note()
        gc.collect()
        elapsed_ms = _record_step_timing("step_3_3_competition_rules", t0)
        return json.dumps({"skipped": True, "elapsedMs": elapsed_ms})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    competition_rules = empty_rules
    if save is not None:
        try:
            competition_rules = _extract_typed_competition_rules(save, club_uid, club_div_id, comp_map)
            if not competition_rules.get("competitionName") and ls_comp_name:
                competition_rules["competitionName"] = ls_comp_name
        except Exception as exc:
            _STATE["warnings"].append(f"competition_rules: {type(exc).__name__}")

    _STATE["competition_rules"] = competition_rules
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_3_competition_rules", t0)
    return json.dumps({"skipped": False, "elapsedMs": elapsed_ms})


def step_3_3_transfer_windows(fast_sync: bool | None = None) -> str:
    """Step 3/6: Transfer windows — Full Sync only; skipped cleanly when fast_sync=True."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["transfer_windows"] = {"isOpen": False}
        _record_fast_sync_skip_note()
        gc.collect()
        elapsed_ms = _record_step_timing("step_3_3_transfer_windows", t0)
        return json.dumps({"skipped": True, "elapsedMs": elapsed_ms})

    save = _STATE["save"]
    game_date = _STATE.get("game_date")
    is_open = False
    parsed_windows: list[dict[str, Any]] = []
    if save is not None:
        try:
            tw_fn = getattr(save, "transfer_windows", None)
            if callable(tw_fn):
                raw_tw = _safe_call(tw_fn, "transfer_windows", default=[]) or []
                seen_keys: set[tuple[int, int, int, int]] = set()
                for tw in raw_tw:
                    sd = _int(getattr(tw, "start_day", None), None)
                    sm = _int(getattr(tw, "start_month", None), None)
                    ed = _int(getattr(tw, "end_day", None), None)
                    em = _int(getattr(tw, "end_month", None), None)
                    if not (sd and sm and ed and em):
                        continue
                    key = (sm, sd, em, ed)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    if isinstance(game_date, date):
                        g_md = (game_date.month, game_date.day)
                        s_md = (sm, sd)
                        e_md = (em, ed)
                        if s_md <= e_md:
                            if s_md <= g_md <= e_md:
                                is_open = True
                        else:
                            if g_md >= s_md or g_md <= e_md:
                                is_open = True
                    if len(parsed_windows) < 12:
                        parsed_windows.append({
                            "startDay": sd,
                            "startMonth": sm,
                            "endDay": ed,
                            "endMonth": em,
                        })
        except Exception as exc:
            _STATE["warnings"].append(f"transfer_windows: {type(exc).__name__}")

    _STATE["transfer_windows"] = {
        "isOpen": is_open,
        "windows": parsed_windows,
    }
    gc.collect()
    elapsed_ms = _record_step_timing("step_3_3_transfer_windows", t0)
    return json.dumps({"skipped": False, "isOpen": is_open, "elapsedMs": elapsed_ms})


def step_3_3_secondary_ops(fast_sync: bool | None = None) -> str:
    """Step 3/6: Optional secondary club dumps (sponsorships, selections, set_pieces,
    training, job_vacancies & division benchmarks) — Full Sync only."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["sponsorships"] = []
        _STATE["selections"] = {}
        _STATE["set_pieces"] = {}
        _STATE["training"] = {}
        _STATE["job_vacancies"] = []
        _STATE["division_benchmarks"] = None
        _record_fast_sync_skip_note()
        gc.collect()
        elapsed_ms = _record_step_timing("step_3_3_secondary_ops", t0)
        return json.dumps({"skipped": True, "hasDivisionBenchmarks": False, "elapsedMs": elapsed_ms})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    comp_map = _STATE.get("comp_name_by_id", {})
    club_div_id = _STATE.get("club_division_id")
    competition_rules = _STATE.get("competition_rules") or {}

    sponsorships: Any = []
    selections: Any = {}
    set_pieces: Any = {}
    training: Any = {}
    job_vacancies: Any = []
    division_benchmarks = None

    if save is not None:
        sponsorships = _extract_club_scoped_capped(save, club_uid, "sponsorships", [], filter_by_club=True)
        selections = _extract_club_scoped_capped(save, club_uid, "selections", {}, filter_by_club=True)
        set_pieces = _extract_club_scoped_capped(save, club_uid, "set_pieces", {}, filter_by_club=True)
        training = _extract_club_scoped_capped(save, club_uid, "training", {}, filter_by_club=True)
        job_vacancies = _extract_club_scoped_capped(save, club_uid, "job_vacancies", [], filter_by_club=False)

        if _STATE.get("import_scope") in ("club_and_division", "full_division", "full_league"):
            div_club_uids: set[int] = set()
            if club_div_id is not None:
                try:
                    for c in save.clubs():
                        c_div = _int(_first_attr(c, ("division_id", "league_id", "competition_id")), None)
                        c_id = _int(getattr(c, "uid", None), None)
                        if c_id is not None and c_div == club_div_id:
                            div_club_uids.add(c_id)
                except Exception:
                    pass
            if not div_club_uids and club_uid is not None:
                try:
                    for lt in _safe_call(save.league_tables, "league_tables", default=[]) or []:
                        rows = getattr(lt, "rows", None) or []
                        if any(getattr(r, "club_uid", None) == club_uid for r in rows):
                            for r in rows:
                                r_cid = _int(getattr(r, "club_uid", None), None)
                                if r_cid is not None:
                                    div_club_uids.add(r_cid)
                            break
                except Exception:
                    pass
            comp_name_for_bench = (
                comp_map.get(club_div_id) if club_div_id else None
            ) or competition_rules.get("competitionName") or "Domestic Division"
            division_benchmarks = _compute_division_benchmarks(
                save, club_uid, div_club_uids, comp_name_for_bench, _STATE["import_scope"]
            )

    _STATE["sponsorships"] = sponsorships if isinstance(sponsorships, list) else []
    _STATE["selections"] = selections if isinstance(selections, dict) else {"items": selections}
    _STATE["set_pieces"] = set_pieces if isinstance(set_pieces, dict) else {"routines": set_pieces}
    _STATE["training"] = training if isinstance(training, dict) else {"schedule": training}
    _STATE["job_vacancies"] = job_vacancies if isinstance(job_vacancies, list) else []
    _STATE["division_benchmarks"] = division_benchmarks

    gc.collect()
    elapsed_ms = _record_step_timing("step_3_3_secondary_ops", t0)
    return json.dumps({
        "skipped": False,
        "hasDivisionBenchmarks": division_benchmarks is not None,
        "elapsedMs": elapsed_ms,
    })


def step_3_3_club_ops(fast_sync: bool | None = None) -> str:
    """Backwards-compatible Step 3/6 club ops wrapper calling each individual single-table step."""
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    tm = json.loads(step_3_3_tactics_and_mentoring())
    inj = json.loads(step_3_3_injuries(use_fast))
    step_3_3_facilities(use_fast)
    step_3_3_competition_rules(use_fast)
    step_3_3_transfer_windows(use_fast)
    sec = json.loads(step_3_3_secondary_ops(use_fast))
    return json.dumps({
        "injuries": inj.get("injuries", 0),
        "tactics": tm.get("tactics", 0),
        "mentoring": tm.get("mentoring", 0),
        "skippedSecondary": use_fast,
        "hasDivisionBenchmarks": sec.get("hasDivisionBenchmarks", False),
    })


def step_3_4_market_scan_and_release_gamedb(fast_sync: bool | None = None) -> str:
    """Step 3/6: Group 4 Free-Agent & Expiring-Contract Market Scan —
    strict 6s cap on desktop, SKIPPED completely when fast_sync=True.
    Always releases game_db borrow and evicts heavy player caches."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    game_date = _STATE["game_date"]
    wage_budget_weekly = _STATE.get("wage_budget_weekly")

    recruitment_targets: list[dict[str, Any]] = []
    if use_fast:
        _record_fast_sync_skip_note()
    elif save is not None:
        recruitment_targets = _scan_recruitment_targets_group4(
            save, club_uid, game_date, wage_budget_weekly
        )

    _STATE["recruitment_targets"] = recruitment_targets

    # Release game_db section borrow & heavy player caches to free RAM
    _exit_game_db_borrow()
    if save is not None:
        _evict_finished_player_phase_cache(save)
    gc.collect()

    elapsed_ms = _record_step_timing("step_3_4_market_scan", t0)
    return json.dumps({
        "skipped": use_fast,
        "recruitmentTargets": len(recruitment_targets),
        "elapsedMs": elapsed_ms,
    })


def step_club_extras_and_release_gamedb(fast_sync: bool | None = None) -> str:
    """Backwards-compatible Step 3/6 wrapper executing all budget-capped sub-steps sequentially."""
    s1 = json.loads(step_3_1_finances())
    s2 = json.loads(step_3_2_staff())
    s3 = json.loads(step_3_3_club_ops(fast_sync))
    s4 = json.loads(step_3_4_market_scan_and_release_gamedb(fast_sync))
    return json.dumps({
        "injuries": s3.get("injuries", 0),
        "tactics": s3.get("tactics", 0),
        "mentoring": s3.get("mentoring", 0),
        "staff": s2.get("staff", 0),
        "monthlyFinances": s1.get("monthlyFinances", 0),
        "recruitmentTargets": s4.get("recruitmentTargets", 0),
        "hasDivisionBenchmarks": s3.get("hasDivisionBenchmarks", False),
    })


def step_4_1_season_stats(fast_sync: bool | None = None) -> str:
    """Stage 4 (Full Sync): Season stats — lazy stream with native inspect.signature filters,
    O(1) squad_uids skip, early exit, 12.0s hard cap, and GC cleanup.
    Skipped immediately when fast_sync=True."""
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_1_season_stats"] = 0
        gc.collect()
        return json.dumps({
            "skipped": True,
            "matchedStats": 0,
            "elapsedSec": 0.0,
            "elapsedMs": 0,
            "timedOut": False,
        })

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    players_out = _STATE["players_out"]
    game_date = _STATE.get("game_date")
    t0 = time.monotonic()
    if not squad_uids or save is None:
        return json.dumps({"skipped": False, "matchedStats": 0, "elapsedSec": 0.0, "elapsedMs": 0, "timedOut": False})

    current_season_year = None
    if game_date:
        current_season_year = game_date.year if game_date.month >= 7 else game_date.year - 1

    best_by_uid: dict[int, tuple[int, int, Any]] = {}
    league_matched_uids: set[int] = set()
    timed_out = False
    warning_msg: str | None = None

    def _row_season_year(row: Any) -> int:
        for attr in ("season_year", "season", "year"):
            v = getattr(row, attr, None)
            if isinstance(v, int) and 1990 <= v <= 2100:
                return v
            if isinstance(v, str) and len(v) >= 4 and v[:4].isdigit():
                return int(v[:4])
        return -1

    def _consume_stat_row(row: Any) -> None:
        p_uid = getattr(row, "player_uid", None)
        if p_uid not in squad_uids:
            return
        if _STATE.get("first_team_id") is None and getattr(row, "team_slot", None) in (None, 0):
            tid = _int(getattr(row, "team_id", None), None)
            if tid:
                _STATE["first_team_id"] = tid
        kind_str = str(getattr(row, "kind", "")).lower()
        if "friendly" in kind_str or "non_competitive" in kind_str or "youth" in kind_str:
            return
        is_league = 1 if "league" in kind_str else (0 if "overall" in kind_str or "competitive" in kind_str else -1)
        if is_league < 0:
            return

        row_year = _row_season_year(row)
        if current_season_year is not None and row_year > 0 and row_year < current_season_year:
            return

        new_mins = int(getattr(row, "minutes", 0) or 0)
        if is_league == 1 and new_mins > 0 and (current_season_year is None or row_year == current_season_year):
            league_matched_uids.add(int(p_uid))

        existing = best_by_uid.get(p_uid)
        if existing is None:
            best_by_uid[p_uid] = (row_year, is_league, row)
            return

        ex_year, ex_is_league, ex_row = existing
        old_mins = int(getattr(ex_row, "minutes", 0) or 0)
        if row_year > ex_year:
            best_by_uid[p_uid] = (row_year, is_league, row)
        elif row_year == ex_year:
            if new_mins > 0 and old_mins == 0:
                best_by_uid[p_uid] = (row_year, is_league, row)
            elif new_mins == 0 and old_mins > 0:
                return
            elif is_league > ex_is_league:
                best_by_uid[p_uid] = (row_year, is_league, row)
            elif is_league == ex_is_league:
                if row_year > 0:
                    if new_mins > old_mins:
                        best_by_uid[p_uid] = (row_year, is_league, row)
                else:
                    if game_date and game_date.month in (7, 8, 9, 10) and old_mins > 900 and 0 < new_mins <= 900:
                        best_by_uid[p_uid] = (row_year, is_league, row)
                    elif new_mins > old_mins:
                        best_by_uid[p_uid] = (row_year, is_league, row)

    def _scan_stream(stream: Any) -> None:
        nonlocal timed_out
        seen_count = 0
        for row in stream:
            seen_count += 1
            if (seen_count & 255) == 0 and (time.monotonic() - t0) >= SEASON_STATS_BUDGET_SEC:
                timed_out = True
                break
            # O(1) set lookup immediately at top of loop
            if getattr(row, "player_uid", None) not in squad_uids:
                continue
            _consume_stat_row(row)
            if len(league_matched_uids) >= len(squad_uids):
                break

    if _is_fm27_27_1_unsupported_stats_build(save):
        _record_warning(
            "player_season_stats: fast-path skipped on FM27 27.1 build (upstream fmsave layout check); using recent match stats fallback"
        )
        _STATE["step_timings_ms"]["step_4_1_season_stats"] = 0
        return json.dumps({
            "skipped": True,
            "fastPathSkipped": True,
            "matched": 0,
            "squadCount": len(squad_uids),
            "elapsedSec": 0.0,
            "elapsedMs": 0,
            "timedOut": False,
        })

    try:
        primary_iter, fallback_table, used_scoped = _open_table_stream(
            save,
            "player_season_stats",
            club_uid=club_uid,
            squad_uids=squad_uids,
            try_where_club=True,
        )
        if primary_iter is not None:
            try:
                _scan_stream(primary_iter)
            except Exception:
                if fallback_table is not None and not timed_out:
                    _scan_stream(fallback_table)
            else:
                if (
                    used_scoped
                    and not best_by_uid
                    and fallback_table is not None
                    and not timed_out
                    and (time.monotonic() - t0) < SEASON_STATS_BUDGET_SEC
                ):
                    _scan_stream(fallback_table)

        if timed_out:
            warning_msg = (
                f"player_season_stats: {SEASON_STATS_BUDGET_SEC:.0f}s budget reached "
                f"({len(best_by_uid)}/{len(squad_uids)} players matched; squad & attributes intact)"
            )
            _STATE["warnings"].append(warning_msg)
    except Exception as exc:
        warning_msg = f"player_season_stats: {type(exc).__name__}"
        _STATE["warnings"].append(warning_msg)

    stats_by_uid = {uid: triple[2] for uid, triple in best_by_uid.items()}
    matched = 0
    for p in players_out:
        st = stats_by_uid.get(p["uid"])
        if not st:
            continue
        matched += 1
        mins = int(st.minutes) if getattr(st, "minutes", None) is not None else 0
        per90 = (90.0 / mins) if mins > 0 else 0.0
        starts = int(st.starts) if getattr(st, "starts", None) is not None else 0
        subs = int(st.substitute_appearances) if getattr(st, "substitute_appearances", None) is not None else 0
        hdr_att = getattr(st, "aerial_challenges_attempted", 0) or 0
        hdr_won = getattr(st, "headers_won", 0) or 0
        tck_att = getattr(st, "tackles_attempted", 0) or 0
        tck_won = getattr(st, "tackles_completed", 0) or 0

        p["apps"] = f"{starts} ({subs})" if subs > 0 else str(starts)
        p["minutes"] = mins
        p["rating"] = round(float(st.average_rating), 2) if getattr(st, "average_rating", None) else None
        p["goals"] = int(getattr(st, "goals", 0) or 0)
        p["xG"] = round(float(getattr(st, "expected_goals", 0.0) or 0.0), 2)
        p["xGPer90"] = round(float(getattr(st, "expected_goals", 0.0) or 0.0) * per90, 2)
        p["assists"] = int(getattr(st, "assists", 0) or 0)
        p["xA"] = round(float(getattr(st, "expected_assists", 0.0) or 0.0), 2)
        p["xAPer90"] = round(float(getattr(st, "expected_assists", 0.0) or 0.0) * per90, 2)
        p["drbPer90"] = round(float(getattr(st, "dribbles", 0) or 0) * per90, 2)
        p["prPassesPer90"] = round(float(getattr(st, "progressive_passes", 0) or 0) * per90, 2)
        p["hdrPct"] = round((hdr_won / hdr_att) * 100) if hdr_att > 0 else 0
        p["intPer90"] = round(float(getattr(st, "interceptions", 0) or 0) * per90, 2)
        p["tckPct"] = round((tck_won / tck_att) * 100) if tck_att > 0 else 0
        p["distanceKm"] = round(float(getattr(st, "distance_km", 0.0) or 0.0), 1)
        p["yellowCards"] = int(getattr(st, "yellow_cards", 0) or 0)
        p["redCards"] = int(getattr(st, "red_cards", 0) or 0)

    players_out.sort(
        key=lambda x: (x["teamSlot"] or 0, -(x["minutes"] or 0), -(x.get("abilityStars") or 0))
    )
    del best_by_uid, stats_by_uid, league_matched_uids
    gc.collect()
    elapsed_ms = _record_step_timing("step_4_1_season_stats", t0)
    return json.dumps({
        "matchedStats": matched,
        "elapsedSec": round(time.monotonic() - t0, 2),
        "elapsedMs": elapsed_ms,
        "timedOut": timed_out,
        "warning": warning_msg,
    })


def step_4_2_player_match_stats(fast_sync: bool | None = None) -> str:
    """Step 4/6 (2/4): Club-scoped player_match_stats (Last-5 Form ratings) —
    lazy stream (NEVER list(...)), O(1) squad_uids skip, 12.0s hard cap, GC cleanup.
    Skipped immediately when fast_sync=True."""
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["player_match_stats"] = {}
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_2_player_match_stats"] = 0
        gc.collect()
        return json.dumps({"skipped": True, "formPlayers": 0, "elapsedSec": 0.0, "elapsedMs": 0, "timedOut": False})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    players_out = _STATE["players_out"]
    t0 = time.monotonic()
    if not squad_uids or save is None:
        return json.dumps({"skipped": False, "formPlayers": 0, "elapsedSec": 0.0, "timedOut": False})

    player_match_stats: dict[str, list[dict[str, Any]]] = {}
    timed_out = False
    warning_msg: str | None = None

    def _consume_pms(stat: Any) -> None:
        p_uid = _int(getattr(stat, "player_uid", None))
        if p_uid not in squad_uids:
            return
        is_comp = getattr(stat, "is_competitive", True)
        kind_str = str(getattr(stat, "kind", "")).lower()
        if not is_comp or "friendly" in kind_str:
            return
        rating_v = _float(getattr(stat, "rating", None) or getattr(stat, "match_rating", None), None)
        if rating_v is None or rating_v <= 0:
            return
        uid_key = str(p_uid)
        player_match_stats.setdefault(uid_key, []).append({
            "date": _iso(getattr(stat, "date", None)) or "",
            "rating": round(rating_v, 2),
            "goals": _int(getattr(stat, "goals", None), 0) or 0,
            "assists": _int(getattr(stat, "assists", None), 0) or 0,
            "opponent": getattr(stat, "opponent_name", None) or "",
            "minutes": _int(getattr(stat, "minutes", None), 0) or 0,
        })

    def _scan_pms(stream: Any) -> None:
        nonlocal timed_out
        seen = 0
        for row in stream:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - t0) >= PLAYER_MATCH_STATS_BUDGET_SEC:
                timed_out = True
                break
            if getattr(row, "player_uid", None) not in squad_uids:
                continue
            _consume_pms(row)

    try:
        primary_iter, fallback_table, used_scoped = _open_table_stream(
            save,
            "player_match_stats",
            club_uid=club_uid,
            squad_uids=squad_uids,
            try_where_club=True,
        )
        if primary_iter is not None:
            try:
                _scan_pms(primary_iter)
            except Exception:
                if fallback_table is not None and not timed_out:
                    _scan_pms(fallback_table)
            else:
                if (
                    used_scoped
                    and not player_match_stats
                    and fallback_table is not None
                    and not timed_out
                    and (time.monotonic() - t0) < PLAYER_MATCH_STATS_BUDGET_SEC
                ):
                    _scan_pms(fallback_table)

        if timed_out:
            warning_msg = (
                f"player_match_stats: {PLAYER_MATCH_STATS_BUDGET_SEC:.0f}s budget reached "
                f"(Last-5 form captured for {len(player_match_stats)} players; continuing)"
            )
            _STATE["warnings"].append(warning_msg)
    except Exception as exc:
        warning_msg = f"player_match_stats: {type(exc).__name__}"
        _STATE["warnings"].append(warning_msg)

    for uid_key, items in player_match_stats.items():
        items.sort(key=lambda x: x.get("date") or "")
        player_match_stats[uid_key] = items[-5:]

    for p in players_out:
        uid_key = str(p["uid"])
        if uid_key in player_match_stats:
            p["last5Ratings"] = player_match_stats[uid_key]

    _STATE["player_match_stats"] = player_match_stats
    form_count = len(player_match_stats)
    del player_match_stats
    gc.collect()
    elapsed_ms = _record_step_timing("step_4_2_player_match_stats", t0)
    return json.dumps({
        "skipped": False,
        "formPlayers": form_count,
        "elapsedSec": round(time.monotonic() - t0, 2),
        "elapsedMs": elapsed_ms,
        "timedOut": timed_out,
        "warning": warning_msg,
    })


def step_4_3_season_history(fast_sync: bool | None = None) -> str:
    """Step 4/6 (3/4): Club-scoped player_season_history — lazy stream (NEVER list(...)),
    O(1) squad_uids skip, 10.0s hard cap, GC cleanup. Skipped immediately when fast_sync=True."""
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["player_season_history"] = {}
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_3_season_history"] = 0
        gc.collect()
        return json.dumps({"skipped": True, "historyPlayers": 0, "elapsedSec": 0.0, "elapsedMs": 0, "timedOut": False})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    players_out = _STATE["players_out"]
    t0 = time.monotonic()
    if not squad_uids or save is None:
        return json.dumps({"skipped": False, "historyPlayers": 0, "elapsedSec": 0.0, "timedOut": False})

    season_history: dict[str, list[dict[str, Any]]] = {}
    timed_out = False
    warning_msg: str | None = None

    def _scan_psh(stream: Any) -> None:
        nonlocal timed_out
        seen = 0
        for h in stream:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - t0) >= SEASON_HISTORY_BUDGET_SEC:
                timed_out = True
                break
            p_uid = _int(getattr(h, "player_uid", None))
            if p_uid not in squad_uids:
                continue
            uid_key = str(p_uid)
            season_history.setdefault(uid_key, []).append({
                "season": str(getattr(h, "season", None) or getattr(h, "year", None) or "Season"),
                "club": str(getattr(h, "club_name", None) or "Club"),
                "apps": _int(getattr(h, "apps", None) or getattr(h, "appearances", None), 0) or 0,
                "goals": _int(getattr(h, "goals", None), 0) or 0,
                "assists": _int(getattr(h, "assists", None), 0) or 0,
                "avgRating": round(_float(getattr(h, "avg_rating", None) or getattr(h, "average_rating", None), 0.0) or 0.0, 2),
            })

    try:
        primary_iter, fallback_table, used_scoped = _open_table_stream(
            save,
            "player_season_history",
            club_uid=club_uid,
            squad_uids=squad_uids,
            try_where_club=False,
        )
        if primary_iter is not None:
            try:
                _scan_psh(primary_iter)
            except Exception:
                if fallback_table is not None and not timed_out:
                    _scan_psh(fallback_table)
            else:
                if (
                    used_scoped
                    and not season_history
                    and fallback_table is not None
                    and not timed_out
                    and (time.monotonic() - t0) < SEASON_HISTORY_BUDGET_SEC
                ):
                    _scan_psh(fallback_table)

        if timed_out:
            warning_msg = (
                f"player_season_history: {SEASON_HISTORY_BUDGET_SEC:.0f}s budget reached "
                f"(career history captured for {len(season_history)} players; continuing)"
            )
            _STATE["warnings"].append(warning_msg)
    except Exception as exc:
        warning_msg = f"player_season_history: {type(exc).__name__}"
        _STATE["warnings"].append(warning_msg)

    for p in players_out:
        uid_key = str(p["uid"])
        if uid_key in season_history:
            p["seasonHistory"] = season_history[uid_key]

    _STATE["player_season_history"] = season_history
    history_count = len(season_history)
    del season_history
    gc.collect()
    elapsed_ms = _record_step_timing("step_4_3_season_history", t0)
    return json.dumps({
        "skipped": False,
        "historyPlayers": history_count,
        "elapsedSec": round(time.monotonic() - t0, 2),
        "elapsedMs": elapsed_ms,
        "timedOut": timed_out,
        "warning": warning_msg,
    })


def step_4_4_contracts_and_suspensions(fast_sync: bool | None = None) -> str:
    """Step 4/6 (4/4): Backfill missing contract clauses & global suspensions lazily
    (after direct p.contract / p.suspensions reads in Step 2/6) with early exit once all
    squad UIDs are resolved, 8.0s hard cap, and GC cleanup. In Fast Sync, retains direct
    p.contract / p.suspensions without querying global tables."""
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_4_contracts_and_suspensions"] = 0
        gc.collect()
        return json.dumps({
            "skippedGlobal": True,
            "contractsEnriched": 0,
            "suspensionsCount": len(_STATE.get("active_suspensions", [])),
            "elapsedSec": 0.0,
            "elapsedMs": 0,
            "timedOut": False,
        })

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    players_out = _STATE["players_out"]
    t0 = time.monotonic()
    if not squad_uids or save is None:
        return json.dumps({
            "contractsEnriched": 0,
            "suspensionsCount": len(_STATE.get("active_suspensions", [])),
            "elapsedSec": 0.0,
            "timedOut": False,
        })

    contracts_enriched = 0
    contracts_timed_out = False
    suspensions_timed_out = False
    warnings_added: list[str] = []

    # 1. Backfill missing contract details only for squad UIDs lacking rich fields from p.contract
    missing_contract_uids: set[int] = set(_STATE.get("missing_contract_uids") or set())
    if missing_contract_uids:
        contracts_budget = min(4.5, CONTRACTS_SUSPENSIONS_BUDGET_SEC * 0.6)
        contract_by_uid: dict[int, Any] = {}
        remaining_uids = set(missing_contract_uids)

        def _scan_contracts(stream: Any) -> None:
            nonlocal contracts_timed_out
            seen = 0
            for row in stream:
                seen += 1
                if (seen & 255) == 0 and (time.monotonic() - t0) >= contracts_budget:
                    contracts_timed_out = True
                    break
                r_puid = _int(_first_attr(row, ("player_uid", "person_uid")), None)
                if r_puid not in remaining_uids:
                    continue
                contract_by_uid[r_puid] = row
                remaining_uids.discard(r_puid)
                if not remaining_uids:
                    break

        try:
            primary_iter, fallback_table, used_scoped = _open_table_stream(
                save,
                "contracts",
                club_uid=club_uid,
                squad_uids=remaining_uids,
                try_where_club=True,
            )
            if primary_iter is not None:
                try:
                    _scan_contracts(primary_iter)
                except Exception:
                    if fallback_table is not None and not contracts_timed_out and remaining_uids:
                        _scan_contracts(fallback_table)
                else:
                    if (
                        used_scoped
                        and not contract_by_uid
                        and fallback_table is not None
                        and not contracts_timed_out
                        and remaining_uids
                        and (time.monotonic() - t0) < contracts_budget
                    ):
                        _scan_contracts(fallback_table)
        except Exception as exc:
            msg = f"contracts: {type(exc).__name__}"
            _STATE["warnings"].append(msg)
            warnings_added.append(msg)

        for p_rec in players_out:
            c_row = contract_by_uid.get(int(p_rec["uid"]))
            if c_row is not None:
                p_rec["contractDetails"] = _extract_contract_details(c_row)
                contracts_enriched += 1

        if contracts_timed_out:
            msg = (
                f"contracts: {contracts_budget:.1f}s budget reached "
                f"(enriched {contracts_enriched} missing contracts; baseline p.contract preserved)"
            )
            _STATE["warnings"].append(msg)
            warnings_added.append(msg)

        del contract_by_uid, remaining_uids

    # 2. Enrich suspensions lazily within remaining budget (guarantee at least 3.0s)
    elapsed_so_far = time.monotonic() - t0
    susp_budget = max(3.0, CONTRACTS_SUSPENSIONS_BUDGET_SEC - elapsed_so_far)
    player_name_by_uid = {int(p_rec["uid"]): str(p_rec["name"]) for p_rec in players_out}
    existing_bans = list(_STATE.get("active_suspensions") or [])
    active_suspensions, suspensions_timed_out = _extract_structured_suspensions(
        save,
        club_uid,
        squad_uids,
        player_name_by_uid,
        _STATE.get("comp_name_by_id", {}),
        raw_players=None,
        existing_results=existing_bans,
        budget_sec=susp_budget,
    )
    if suspensions_timed_out:
        msg = (
            f"suspensions: {CONTRACTS_SUSPENSIONS_BUDGET_SEC:.0f}s budget reached "
            f"(captured {len(active_suspensions)} bans; baseline p.suspensions preserved)"
        )
        _STATE["warnings"].append(msg)
        warnings_added.append(msg)

    bans_by_uid: dict[int, list[dict[str, Any]]] = {}
    for ban in active_suspensions:
        bans_by_uid.setdefault(int(ban["playerUid"]), []).append(ban)
    for p_rec in players_out:
        p_bans = bans_by_uid.get(int(p_rec["uid"]), [])
        p_rec["activeSuspensions"] = p_bans
        p_rec["suspensionsCount"] = len(p_bans)

    _STATE["active_suspensions"] = active_suspensions
    del bans_by_uid, player_name_by_uid, existing_bans
    gc.collect()
    elapsed_ms = _record_step_timing("step_4_4_contracts_and_suspensions", t0)
    return json.dumps({
        "contractsEnriched": contracts_enriched,
        "suspensionsCount": len(active_suspensions),
        "elapsedSec": round(time.monotonic() - t0, 2),
        "elapsedMs": elapsed_ms,
        "timedOut": bool(contracts_timed_out or suspensions_timed_out),
        "warnings": warnings_added,
    })


def step_season_stats() -> str:
    """Backwards-compatible Step 4/6 wrapper executing all 4 budget-capped sub-steps sequentially."""
    s1 = json.loads(step_4_1_season_stats())
    s2 = json.loads(step_4_2_player_match_stats())
    s3 = json.loads(step_4_3_season_history())
    s4 = json.loads(step_4_4_contracts_and_suspensions())
    return json.dumps({
        "matchedStats": s1.get("matchedStats", 0),
        "formPlayers": s2.get("formPlayers", 0),
        "historyPlayers": s3.get("historyPlayers", 0),
        "contractsEnriched": s4.get("contractsEnriched", 0),
        "suspensionsCount": s4.get("suspensionsCount", 0),
    })


def step_fixtures(fast_sync: bool | None = None) -> str:
    """Step 5/6 (1/2): Played results, upcoming fixtures, and (Full Sync) club-scoped
    team_match_stats (xG, shots, shots on target, possession)."""
    step_t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    game_date = _STATE["game_date"]
    comp_map = _STATE.get("comp_name_by_id", {})

    # Extract club-scoped team_match_stats lazily in Full Sync only (keeps Step 5/6 (1/2) single-table in Fast Sync)
    team_match_stats: list[dict[str, Any]] = []
    tms_by_key: dict[str, dict[str, Any]] = {}
    if not use_fast and club_uid is not None and save is not None:
        tms_rows: list[Any] = []
        primary_iter = None
        fallback_table = None
        used_scoped = False
        if _is_fm27_27_1_unsupported_stats_build(save):
            _record_warning(
                "team_match_stats: fast-path skipped on FM27 27.1 build (upstream fmsave layout check)"
            )
        else:
            tms_t0 = time.monotonic()

            def _scan_tms(stream: Any) -> None:
                seen = 0
                for row in stream:
                    seen += 1
                    if (seen & 255) == 0 and (time.monotonic() - tms_t0) >= PLAYER_MATCH_STATS_BUDGET_SEC:
                        _STATE["warnings"].append(
                            f"team_match_stats: {PLAYER_MATCH_STATS_BUDGET_SEC:.0f}s budget reached ({len(tms_rows)} rows)"
                        )
                        break
                    t_uid = getattr(row, "club_uid", None) or getattr(row, "team_id", None)
                    if t_uid == club_uid:
                        tms_rows.append(row)

            primary_iter, fallback_table, used_scoped = _open_table_stream(
                save,
                "team_match_stats",
                club_uid=club_uid,
                try_where_club=True,
            )
        if primary_iter is not None:
            try:
                _scan_tms(primary_iter)
            except Exception:
                if fallback_table is not None:
                    try:
                        _scan_tms(fallback_table)
                    except Exception:
                        pass
            else:
                if (
                    used_scoped
                    and not tms_rows
                    and fallback_table is not None
                    and (time.monotonic() - tms_t0) < PLAYER_MATCH_STATS_BUDGET_SEC
                ):
                    try:
                        _scan_tms(fallback_table)
                    except Exception:
                        pass

        for t_stat in tms_rows:
            match_id = str(getattr(t_stat, "match_id", None) or getattr(t_stat, "fixture_id", None) or "")
            date_iso = _iso(getattr(t_stat, "date", None)) or ""
            opponent = str(getattr(t_stat, "opponent_name", None) or "Opponent")
            is_home = bool(getattr(t_stat, "is_home", True))
            xg_for = _float(getattr(t_stat, "xg_for", None) or getattr(t_stat, "expected_goals_for", None), None)
            xg_against = _float(getattr(t_stat, "xg_against", None) or getattr(t_stat, "expected_goals_against", None), None)
            shots = _int(getattr(t_stat, "shots", None) or getattr(t_stat, "shots_for", None), None)
            shots_ot = _int(getattr(t_stat, "shots_on_target", None), None)
            poss = _float(getattr(t_stat, "possession", None), None)
            pass_pct = _float(getattr(t_stat, "pass_completion", None), None)

            entry = {
                "matchId": match_id or f"{date_iso}-{opponent}",
                "date": date_iso,
                "opponent": opponent,
                "isHome": is_home,
                "goalsFor": _int(getattr(t_stat, "goals_for", None), 0) or 0,
                "goalsAgainst": _int(getattr(t_stat, "goals_against", None), 0) or 0,
                "xgFor": round(xg_for, 2) if xg_for is not None else None,
                "xgAgainst": round(xg_against, 2) if xg_against is not None else None,
                "shots": shots,
                "shotsOnTarget": shots_ot,
                "possession": round(poss, 1) if poss is not None else None,
                "passCompletion": round(pass_pct, 1) if pass_pct is not None else None,
            }
            team_match_stats.append(entry)
            if match_id:
                tms_by_key[f"id:{match_id}"] = entry
            if date_iso:
                tms_by_key[f"date:{date_iso}"] = entry
            tms_by_key[f"opp:{opponent.lower()}:{is_home}"] = entry

    _STATE["team_match_stats"] = team_match_stats[-30:]

    club_fixtures = []
    if club_uid is not None:
        t0 = time.monotonic()
        try:
            fix_table = save.fixtures()
            used_scoped = False
            if hasattr(fix_table, "where"):
                try:
                    seen_scoped = 0
                    for f in fix_table.where(home_club_uid=club_uid):
                        seen_scoped += 1
                        if (seen_scoped & 255) == 0 and (time.monotonic() - t0) > 20.0:
                            _STATE["warnings"].append("fixtures: 20s time cap reached")
                            break
                        if getattr(f, "home_team_slot", None) in (None, 0):
                            club_fixtures.append(f)
                    if (time.monotonic() - t0) <= 20.0:
                        for f in fix_table.where(away_club_uid=club_uid):
                            seen_scoped += 1
                            if (seen_scoped & 255) == 0 and (time.monotonic() - t0) > 20.0:
                                _STATE["warnings"].append("fixtures: 20s time cap reached")
                                break
                            if getattr(f, "away_team_slot", None) in (None, 0):
                                club_fixtures.append(f)
                    used_scoped = True
                except Exception:
                    used_scoped = False

            if not used_scoped:
                seen = 0
                for f in fix_table:
                    seen += 1
                    if (seen & 511) == 0 and (time.monotonic() - t0) > 20.0:
                        _STATE["warnings"].append("fixtures: 20s time cap reached")
                        break
                    is_home = (f.home_club_uid == club_uid and f.home_team_slot in (None, 0))
                    is_away = (f.away_club_uid == club_uid and f.away_team_slot in (None, 0))
                    if is_home or is_away:
                        club_fixtures.append(f)
        except Exception as exc:
            _STATE["warnings"].append(f"fixtures: {type(exc).__name__}")

    club_fixtures.sort(key=lambda f: f.date or date(1900, 1, 1))

    played_matches: list[dict[str, Any]] = []
    upcoming_fixtures: list[dict[str, Any]] = []
    for f in club_fixtures:
        is_home = (f.home_club_uid == club_uid and f.home_team_slot in (None, 0))
        opp_name = f.away_club_name if is_home else f.home_club_name
        comp_id = _int(getattr(f, "competition_id", None))
        comp_name = getattr(f, "competition_name", None) or (comp_map.get(comp_id) if comp_id else None)
        if f.played and f.home_goals is not None and f.away_goals is not None and (game_date is None or f.date is None or f.date <= game_date):
            gf = int(f.home_goals if is_home else f.away_goals)
            ga = int(f.away_goals if is_home else f.home_goals)
            res_char = "W" if gf > ga else ("D" if gf == ga else "L")
            date_iso = _iso(f.date)
            fid = str(getattr(f, "id", None) or getattr(f, "match_id", None) or "")
            tms = (
                tms_by_key.get(f"id:{fid}")
                or (tms_by_key.get(f"date:{date_iso}") if date_iso else None)
                or tms_by_key.get(f"opp:{(opp_name or '').lower()}:{is_home}")
            )
            shots_str = None
            if tms and tms.get("shots") is not None:
                shots_str = (
                    f"{tms['shots']} ({tms['shotsOnTarget']})"
                    if tms.get("shotsOnTarget") is not None
                    else str(tms["shots"])
                )
            played_matches.append({
                "matchId": fid or f"{date_iso}-{opp_name}",
                "dateIso": date_iso,
                "dateDmy": _dmy(f.date),
                "competitionId": comp_id,
                "competition": comp_name or "League / Cup",
                "opponent": opp_name or "Opponent",
                "venue": "H" if is_home else "A",
                "result": res_char,
                "score": f"{gf} - {ga}",
                "xGFor": tms.get("xgFor") if tms else None,
                "xGAgainst": tms.get("xgAgainst") if tms else None,
                "possession": tms.get("possession") if tms else None,
                "passCompletion": tms.get("passCompletion") if tms else None,
                "shotsFor": shots_str,
                "shotsAgainst": None,
                "cccFor": None,
                "cccAgainst": None,
                "distanceKm": None,
            })
        elif not f.played:
            if game_date is None or (f.date is not None and f.date >= game_date):
                upcoming_fixtures.append({
                    "dateIso": _iso(f.date),
                    "dateDmy": _dmy(f.date),
                    "competitionId": comp_id,
                    "competition": comp_name or "League / Cup",
                    "opponent": opp_name or "Opponent",
                    "venue": "H" if is_home else "A",
                })

    played_matches.reverse()
    _STATE["played_matches"] = played_matches[:15]
    _STATE["upcoming_fixtures"] = upcoming_fixtures[:8]
    gc.collect()
    elapsed_ms = _record_step_timing("step_5_fixtures", step_t0)

    return json.dumps({
        "playedCount": len(_STATE["played_matches"]),
        "upcomingCount": len(_STATE["upcoming_fixtures"]),
        "teamMatchStatsCount": len(_STATE["team_match_stats"]),
        "elapsedMs": elapsed_ms,
    })


def step_team_match_stats(fast_sync: bool | None = None) -> str:
    """Stage 4 (Full Sync): Club-scoped team_match_stats (xG, shots, possession, pass %, CCCs)
    paired by (date, home_team_id, away_team_id) enriching played_matches in place."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_team_match_stats"] = 0
        gc.collect()
        return json.dumps({"skipped": True, "teamMatchStatsCount": 0, "elapsedMs": 0})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    first_team_id = _STATE.get("first_team_id")
    if _is_fm27_27_1_unsupported_stats_build(save):
        _record_warning(
            "team_match_stats: fast-path skipped on FM27 27.1 build (older fmsave)"
        )
        _STATE["step_timings_ms"]["step_4_team_match_stats"] = 0
        return json.dumps({"skipped": True, "fastPathSkipped": True, "teamMatchStatsCount": 0, "elapsedMs": 0})

    team_match_stats: list[dict[str, Any]] = []
    tms_by_key: dict[str, dict[str, Any]] = {}
    if club_uid is not None and save is not None:
        tms_t0 = time.monotonic()
        grouped_matches: dict[tuple[str, int, int], dict[str, Any]] = {}

        try:
            tms_table = _safe_call(save.team_match_stats, "team_match_stats", default=None)
            if tms_table is not None:
                seen = 0
                for row in tms_table:
                    seen += 1
                    if (seen & 511) == 0 and (time.monotonic() - tms_t0) >= PLAYER_MATCH_STATS_BUDGET_SEC:
                        _STATE["warnings"].append(
                            f"team_match_stats: {PLAYER_MATCH_STATS_BUDGET_SEC:.0f}s budget reached ({len(grouped_matches)} matches)"
                        )
                        break
                    r_home_tid = _int(getattr(row, "home_team_id", None), None)
                    r_away_tid = _int(getattr(row, "away_team_id", None), None)
                    r_tid = _int(getattr(row, "team_id", None), None)
                    r_club_uid = _int(getattr(row, "club_uid", None), None)

                    is_our_match = False
                    is_our_row = False
                    if first_team_id is not None and (r_home_tid == first_team_id or r_away_tid == first_team_id):
                        is_our_match = True
                        is_our_row = (r_tid == first_team_id)
                    elif r_club_uid == club_uid or (first_team_id is None and r_tid == club_uid):
                        is_our_match = True
                        is_our_row = True

                    if not is_our_match:
                        continue

                    date_iso = _iso(getattr(row, "date", None)) or ""
                    gkey = (date_iso, r_home_tid or 0, r_away_tid or 0)
                    slot = grouped_matches.setdefault(gkey, {"ours": None, "opp": None})
                    if is_our_row:
                        slot["ours"] = row
                    else:
                        slot["opp"] = row
        except Exception as exc:
            _STATE["warnings"].append(f"team_match_stats: {type(exc).__name__}")

        for (date_iso, _ht, _at), pair in sorted(grouped_matches.items()):
            ours = pair.get("ours")
            opp = pair.get("opp")
            if ours is None:
                continue

            match_id = str(getattr(ours, "match_id", None) or getattr(ours, "fixture_id", None) or f"{date_iso}-{_ht}-{_at}")
            opponent = str(getattr(ours, "opponent_name", None) or "Opponent")
            is_home = bool(getattr(ours, "is_home", True))
            xg_for = _float(
                getattr(ours, "expected_goals", None)
                if getattr(ours, "expected_goals", None) is not None
                else (getattr(ours, "xg_for", None) or getattr(ours, "expected_goals_for", None)),
                None,
            )
            xg_against = _float(
                getattr(opp, "expected_goals", None)
                if opp is not None and getattr(opp, "expected_goals", None) is not None
                else (getattr(ours, "xg_against", None) or getattr(ours, "expected_goals_against", None)),
                None,
            )
            shots = _int(getattr(ours, "shots", None) or getattr(ours, "shots_for", None), None)
            shots_ot = _int(getattr(ours, "shots_on_target", None), None)
            opp_shots = _int(getattr(opp, "shots", None), None) if opp is not None else None
            opp_shots_ot = _int(getattr(opp, "shots_on_target", None), None) if opp is not None else None
            poss = _float(
                getattr(ours, "possession_percent", None)
                if getattr(ours, "possession_percent", None) is not None
                else getattr(ours, "possession", None),
                None,
            )
            passes_att = _int(getattr(ours, "passes_attempted", None), None)
            passes_cmp = _int(getattr(ours, "passes_completed", None), None)
            pass_pct = _float(getattr(ours, "pass_completion", None), None)
            if pass_pct is None and passes_att and passes_att > 0 and passes_cmp is not None:
                pass_pct = (passes_cmp / passes_att) * 100.0
            ccc_for = _int(getattr(ours, "clear_cut_chances", None), None)
            ccc_against = _int(getattr(opp, "clear_cut_chances", None), None) if opp is not None else None
            dist_km = _float(getattr(ours, "distance_km", None), None)

            entry = {
                "matchId": match_id,
                "date": date_iso,
                "opponent": opponent,
                "isHome": is_home,
                "goalsFor": _int(getattr(ours, "goals_for", 0), 0) or 0,
                "goalsAgainst": _int(getattr(ours, "goals_against", 0), 0) or 0,
                "xgFor": round(xg_for, 2) if xg_for is not None else None,
                "xgAgainst": round(xg_against, 2) if xg_against is not None else None,
                "shots": shots,
                "shotsOnTarget": shots_ot,
                "oppShots": opp_shots,
                "oppShotsOnTarget": opp_shots_ot,
                "possession": round(poss, 1) if poss is not None else None,
                "passCompletion": round(pass_pct, 1) if pass_pct is not None else None,
                "cccFor": ccc_for,
                "cccAgainst": ccc_against,
                "distanceKm": round(dist_km, 1) if dist_km is not None else None,
            }
            team_match_stats.append(entry)
            if match_id:
                tms_by_key[f"id:{match_id}"] = entry
            if date_iso:
                tms_by_key[f"date:{date_iso}:{is_home}"] = entry
                tms_by_key[f"date:{date_iso}"] = entry
            tms_by_key[f"opp:{opponent.lower()}:{is_home}"] = entry

    _STATE["team_match_stats"] = team_match_stats[-30:]

    # Enrich already-extracted played_matches in place
    for pm in _STATE.get("played_matches", []):
        fid = str(pm.get("matchId") or "")
        date_iso = pm.get("dateIso") or ""
        opp_name = (pm.get("opponent") or "").lower()
        is_home = pm.get("venue") == "H"
        tms = (
            (tms_by_key.get(f"id:{fid}") if fid else None)
            or (tms_by_key.get(f"date:{date_iso}:{is_home}") if date_iso else None)
            or (tms_by_key.get(f"date:{date_iso}") if date_iso else None)
            or tms_by_key.get(f"opp:{opp_name}:{is_home}")
        )
        if not tms:
            continue
        if pm.get("xGFor") is None and tms.get("xgFor") is not None:
            pm["xGFor"] = tms["xgFor"]
        if pm.get("xGAgainst") is None and tms.get("xgAgainst") is not None:
            pm["xGAgainst"] = tms["xgAgainst"]
        if pm.get("possession") is None and tms.get("possession") is not None:
            pm["possession"] = tms["possession"]
        if pm.get("passCompletion") is None and tms.get("passCompletion") is not None:
            pm["passCompletion"] = tms["passCompletion"]
        if pm.get("shotsFor") is None and tms.get("shots") is not None:
            pm["shotsFor"] = (
                f"{tms['shots']} ({tms['shotsOnTarget']})"
                if tms.get("shotsOnTarget") is not None
                else str(tms["shots"])
            )
        if pm.get("shotsAgainst") is None and tms.get("oppShots") is not None:
            pm["shotsAgainst"] = (
                f"{tms['oppShots']} ({tms['oppShotsOnTarget']})"
                if tms.get("oppShotsOnTarget") is not None
                else str(tms["oppShots"])
            )
        if pm.get("cccFor") is None and tms.get("cccFor") is not None:
            pm["cccFor"] = tms["cccFor"]
        if pm.get("cccAgainst") is None and tms.get("cccAgainst") is not None:
            pm["cccAgainst"] = tms["cccAgainst"]
        if pm.get("distanceKm") is None and tms.get("distanceKm") is not None:
            pm["distanceKm"] = tms["distanceKm"]

    gc.collect()
    elapsed_ms = _record_step_timing("step_4_team_match_stats", t0)
    return json.dumps({
        "skipped": False,
        "teamMatchStatsCount": len(team_match_stats),
        "elapsedMs": elapsed_ms,
    })


def _build_current_payload() -> dict[str, Any]:
    """Assemble a clean JSON-serializable payload from current _STATE without closing the save.
    Used for Progressive Checkpoint Recovery (Stages 1-3) and finalization.
    Strictly contains ZERO raw CA/PA or raw hidden integers."""
    return {
        "meta": _STATE["meta"],
        "clubUid": _STATE["club_uid"],
        "players": _STATE["players_out"],
        "staff": _STATE.get("staff_out", []),
        "playedMatches": _STATE["played_matches"],
        "upcomingFixtures": _STATE["upcoming_fixtures"],
        "leagueStanding": _STATE["league_standing"],
        "finances": _STATE["finances"],
        "monthlyFinances": _STATE["monthly_finances"],
        "activeInjuries": _STATE["active_injuries"],
        "activeSuspensions": _STATE["active_suspensions"],
        "divisionBenchmarks": _STATE["division_benchmarks"],
        "tactics": _STATE["tactics"],
        "mentoring": _STATE["mentoring"],
        # Pass 0 Groups 2–4 extended blocks
        "playerMatchStats": _STATE["player_match_stats"],
        "teamMatchStats": _STATE["team_match_stats"],
        "playerSeasonHistory": _STATE["player_season_history"],
        "facilities": _STATE["facilities"],
        "sponsorships": _STATE["sponsorships"],
        "transferWindows": _STATE["transfer_windows"],
        "competitionRules": _STATE["competition_rules"],
        "selections": _STATE["selections"],
        "setPieces": _STATE["set_pieces"],
        "training": _STATE["training"],
        "jobVacancies": _STATE["job_vacancies"],
        "recruitmentTargets": _STATE["recruitment_targets"],
        "fastSync": bool(_STATE.get("fast_sync", False)),
        "warnings": list(_STATE["warnings"]),
        "extractionWarnings": list(_STATE["warnings"]),
        "stepTimingsMs": dict(_STATE["step_timings_ms"]),
    }


def step_snapshot_payload(stage: str = "") -> str:
    """Serialize a progressive checkpoint snapshot of current _STATE without closing the save."""
    payload = _build_current_payload()
    if stage:
        payload["checkpointStage"] = stage
    return json.dumps(payload)


def step_league_table() -> str:
    """Stage 3 (2/2): Full domestic league table (all teams) without closing _STATE,
    so Full Sync Stage 4 can run after Stage 3 and a Stage 3 checkpoint can be emitted."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    upcoming_fixtures = _STATE["upcoming_fixtures"]
    comp_map = _STATE.get("comp_name_by_id", {})

    league_standing = None
    best_lt = None
    best_row = None
    if club_uid is not None and save is not None:
        try:
            for lt in save.league_tables():
                my_row = next((r for r in lt.rows if r.club_uid == club_uid and r.team_slot in (None, 0)), None)
                if my_row:
                    lt_size = int(getattr(lt, "club_count", None) or len(lt.rows))
                    best_size = int(getattr(best_lt, "club_count", None) or len(best_lt.rows)) if best_lt else -1
                    if lt_size > best_size or (lt_size == best_size and int(getattr(my_row, "played", 0)) > int(getattr(best_row, "played", 0))):
                        best_lt = lt
                        best_row = my_row
        except Exception as exc:
            _STATE["warnings"].append(f"league_tables: {type(exc).__name__}")

    if best_lt is not None and best_row is not None:
        lt = best_lt
        my_row = best_row
        if _STATE.get("first_team_id") is None:
            row_tid = _int(getattr(my_row, "team_id", None), None)
            if row_tid:
                _STATE["first_team_id"] = row_tid
        next_opp_name = upcoming_fixtures[0]["opponent"] if upcoming_fixtures else None
        next_opp_row = next(
            (r for r in lt.rows if next_opp_name and getattr(r, "club_name", None) and r.club_name.lower() == next_opp_name.lower()),
            None,
        )
        league_comp_id = _int(getattr(lt, "competition_id", None))
        league_comp_name = (
            getattr(lt, "competition_name", None)
            or (comp_map.get(league_comp_id) if league_comp_id else None)
            or "Domestic League"
        )
        gf = int(getattr(my_row, "goals_for", 0))
        ga = int(getattr(my_row, "goals_against", 0))
        sorted_rows = sorted(lt.rows, key=lambda x: getattr(x, "position", 999))
        full_rows = []
        for r in sorted_rows:
            r_gf = int(getattr(r, "goals_for", 0))
            r_ga = int(getattr(r, "goals_against", 0))
            raw_form = getattr(r, "form", None)
            form_list = (
                [str(ch).upper()[:1] for ch in raw_form if str(ch).strip()][:5]
                if isinstance(raw_form, (list, tuple))
                else ([ch for ch in str(raw_form).upper() if ch in ("W", "D", "L")][:5] if raw_form else [])
            )
            full_rows.append({
                "position": int(getattr(r, "position", 0)),
                "clubUid": _int(getattr(r, "club_uid", None), 0) or 0,
                "clubName": getattr(r, "club_name", "Club"),
                "played": int(getattr(r, "played", 0)),
                "won": int(getattr(r, "won", 0)),
                "drawn": int(getattr(r, "drawn", 0)),
                "lost": int(getattr(r, "lost", 0)),
                "goalsFor": r_gf,
                "goalsAgainst": r_ga,
                "goalDifference": r_gf - r_ga,
                "points": int(getattr(r, "points", 0)),
                "form": form_list,
            })

        league_standing = {
            "competitionId": league_comp_id,
            "competitionName": league_comp_name,
            "position": int(my_row.position),
            "totalTeams": int(getattr(lt, "club_count", None) or len(lt.rows)),
            "played": int(getattr(my_row, "played", 0)),
            "won": int(getattr(my_row, "won", 0)),
            "drawn": int(getattr(my_row, "drawn", 0)),
            "lost": int(getattr(my_row, "lost", 0)),
            "goalsFor": gf,
            "goalsAgainst": ga,
            "goalDiff": gf - ga,
            "points": int(getattr(my_row, "points", 0)),
            "nextOpponentStanding": {
                "clubName": getattr(next_opp_row, "club_name", "Opponent"),
                "position": int(getattr(next_opp_row, "position", 0)),
                "points": int(getattr(next_opp_row, "points", 0)),
                "played": int(getattr(next_opp_row, "played", 0)),
                "goalDiff": int(getattr(next_opp_row, "goals_for", 0) - getattr(next_opp_row, "goals_against", 0)),
            } if next_opp_row else None,
            "top5": [
                {
                    "pos": r["position"],
                    "club": r["clubName"],
                    "played": r["played"],
                    "pts": r["points"],
                    "gd": r["goalDifference"],
                }
                for r in full_rows[:5]
            ],
            "rows": full_rows,
        }

        if isinstance(_STATE.get("competition_rules"), dict) and not _STATE["competition_rules"].get("competitionName"):
            _STATE["competition_rules"]["competitionName"] = league_comp_name

        if league_comp_id is not None:
            for m in _STATE["played_matches"]:
                if m.get("competition") == "League / Cup":
                    m["competition"] = league_comp_name if m.get("competitionId") == league_comp_id else "Cup / Friendly"
            for uf in _STATE["upcoming_fixtures"]:
                if uf.get("competition") == "League / Cup":
                    uf["competition"] = league_comp_name if uf.get("competitionId") == league_comp_id else "Cup / Friendly"

    _STATE["league_standing"] = league_standing
    gc.collect()
    elapsed_ms = _record_step_timing("step_5_2_league_table", t0)
    return json.dumps({
        "hasStanding": league_standing is not None,
        "teamCount": league_standing["totalTeams"] if league_standing else 0,
        "position": league_standing["position"] if league_standing else None,
        "elapsedMs": elapsed_ms,
    })


def step_finalize() -> str:
    """Finalize extraction, release game_db & save handle, and return complete payload JSON."""
    if _STATE.get("fast_sync", False):
        _record_fast_sync_skip_note()
    payload = _build_current_payload()
    step_close()
    return json.dumps(payload)


def step_league_table_and_finish() -> str:
    """Backwards-compatible wrapper running league table extraction followed by finalization."""
    step_league_table()
    return step_finalize()


def extract_pass_0_data(save_instance: Any, target_club_uid: int | None = None) -> str:
    """Standalone Pass 0 Groups 1–4 extractor over an already-opened fmsave handle.
    Streams all massive tables lazily (never calls list(...) on global tables), strictly
    emits zero raw CA/PA or raw hidden numbers, and obeys the 8.0s / 60 target budget."""
    start_time = time.monotonic()
    extraction_warnings: list[str] = []
    p_iter, _, _ = _open_table_stream(
        save_instance, "players", club_uid=target_club_uid, try_where_club=True
    )
    user_club_uid = target_club_uid
    squad_raw_players: list[Any] = []
    squad_players: list[dict[str, Any]] = []
    squad_uids: set[int] = set()

    if p_iter is not None:
        for p in p_iter:
            c_uid = _get_attr(p, "club_uid", None) or _get_attr(p, "team_id", None)
            if user_club_uid is None and c_uid is not None:
                user_club_uid = c_uid
            if c_uid != user_club_uid:
                continue
            squad_raw_players.append(p)
            p_uid = _int(_get_attr(p, "uid", None) or _get_attr(p, "id", 0), 0) or 0
            squad_uids.add(p_uid)
            attrs = getattr(p, "attributes", None)
            pers = getattr(p, "personality", None)
            squad_players.append({
                "uid": p_uid,
                "name": _get_attr(p, "name", "Unknown Player"),
                "age": _int(_get_attr(p, "age", 18), 18) or 18,
                "nationality": _get_attr(p, "nationality", None) or _get_attr(p, "nation_name", "Unknown"),
                "primaryPosition": _get_attr(p, "position", None) or (list(getattr(p, "natural_positions", None) or ["ST"])[0]),
                "secondaryPositions": list(_get_attr(p, "secondary_positions", None) or getattr(p, "accomplished_positions", None) or []),
                "attributes": _extract_52_attributes(p, attrs),
                "traits": _extract_traits(p),
                "scoutBadges": _extract_reliability_badges(p, pers),
                "wageEur": _int(_get_attr(p, "wage", 0), 0) or 0,
                "contractExpiryMonths": _int(_get_attr(p, "contract_expiry_months", 12), 12) or 12,
            })

    player_match_stats: dict[int, list[dict[str, Any]]] = {}
    pms_iter, _, _ = _open_table_stream(
        save_instance, "player_match_stats", club_uid=user_club_uid, squad_uids=squad_uids, try_where_club=True
    )
    if pms_iter is not None:
        pms_t0 = time.monotonic()
        for idx, stat in enumerate(pms_iter):
            if (idx & 255) == 0 and (time.monotonic() - pms_t0) >= PLAYER_MATCH_STATS_BUDGET_SEC:
                extraction_warnings.append("player_match_stats: budget reached")
                break
            p_uid = _int(_get_attr(stat, "player_uid", 0), 0) or 0
            if p_uid not in squad_uids:
                continue
            if _get_attr(stat, "is_competitive", True):
                player_match_stats.setdefault(p_uid, []).append({
                    "date": _iso(_get_attr(stat, "date", "")) or "",
                    "rating": _float(_get_attr(stat, "rating", 6.0), 6.0) or 6.0,
                    "goals": _int(_get_attr(stat, "goals", 0), 0) or 0,
                    "assists": _int(_get_attr(stat, "assists", 0), 0) or 0,
                })
    for p_uid in player_match_stats:
        player_match_stats[p_uid] = player_match_stats[p_uid][-5:]

    team_match_stats = []
    tms_iter, _, _ = _open_table_stream(
        save_instance, "team_match_stats", club_uid=user_club_uid, try_where_club=True
    )
    if tms_iter is not None:
        for t_stat in tms_iter:
            t_uid = _get_attr(t_stat, "club_uid", None) or _get_attr(t_stat, "team_id", None)
            if t_uid == user_club_uid:
                team_match_stats.append({
                    "matchId": str(_get_attr(t_stat, "match_id", "")),
                    "opponent": _get_attr(t_stat, "opponent_name", "Opponent"),
                    "isHome": bool(_get_attr(t_stat, "is_home", True)),
                    "goalsFor": _int(_get_attr(t_stat, "goals_for", 0), 0) or 0,
                    "goalsAgainst": _int(_get_attr(t_stat, "goals_against", 0), 0) or 0,
                    "xgFor": _float(_get_attr(t_stat, "xg_for", 0.0), 0.0),
                    "xgAgainst": _float(_get_attr(t_stat, "xg_against", 0.0), 0.0),
                    "shots": _int(_get_attr(t_stat, "shots", 0), 0),
                    "shotsOnTarget": _int(_get_attr(t_stat, "shots_on_target", 0), 0),
                    "possession": _float(_get_attr(t_stat, "possession", 50.0), 50.0),
                })

    season_history: dict[int, list[dict[str, Any]]] = {}
    psh_iter, _, _ = _open_table_stream(
        save_instance, "player_season_history", club_uid=user_club_uid, squad_uids=squad_uids, try_where_club=False
    )
    if psh_iter is not None:
        psh_t0 = time.monotonic()
        for idx, h in enumerate(psh_iter):
            if (idx & 255) == 0 and (time.monotonic() - psh_t0) >= SEASON_HISTORY_BUDGET_SEC:
                extraction_warnings.append("player_season_history: budget reached")
                break
            p_uid = _int(_get_attr(h, "player_uid", 0), 0) or 0
            if p_uid not in squad_uids:
                continue
            season_history.setdefault(p_uid, []).append({
                "season": str(_get_attr(h, "season", "2026/27")),
                "club": str(_get_attr(h, "club_name", "Club")),
                "apps": _int(_get_attr(h, "apps", 0), 0) or 0,
                "goals": _int(_get_attr(h, "goals", 0), 0) or 0,
                "assists": _int(_get_attr(h, "assists", 0), 0) or 0,
                "avgRating": _float(_get_attr(h, "avg_rating", 6.0), 6.0) or 6.0,
            })

    club_staff = []
    staff_iter, _, _ = _open_table_stream(
        save_instance, "staff", club_uid=user_club_uid, try_where_club=True
    )
    if staff_iter is not None:
        for s in staff_iter:
            c_uid = _get_attr(s, "club_uid", None) or _get_attr(s, "team_id", None)
            if c_uid == user_club_uid:
                club_staff.append({
                    "uid": _int(_get_attr(s, "uid", 0), 0) or 0,
                    "name": _get_attr(s, "name", "Staff Member"),
                    "role": _label(_get_attr(s, "role", "Coach")) or "Coach",
                    "coachingDefending": _clamp_attr(_get_attr(s, "coaching_defending", 10), 10),
                    "coachingAttacking": _clamp_attr(_get_attr(s, "coaching_attacking", 10), 10),
                    "coachingTactical": _clamp_attr(_get_attr(s, "coaching_tactical", 10), 10),
                    "judgingAbility": _clamp_attr(_get_attr(s, "judging_ability", 10), 10),
                    "judgingPotential": _clamp_attr(_get_attr(s, "judging_potential", 10), 10),
                })

    fin_iter, _ = _open_table_stream(
        save_instance, "finances", club_uid=user_club_uid, budget_sec=FINANCES_BUDGET_SEC
    )
    finances_history = []
    if fin_iter is not None:
        fin_t0 = time.monotonic()
        for f_idx, f in enumerate(fin_iter):
            if (f_idx & 63) == 0 and (time.monotonic() - fin_t0) >= FINANCES_BUDGET_SEC:
                break
            c_uid = _get_attr(f, "club_uid", None) or _get_attr(f, "team_id", None)
            if c_uid is not None and c_uid != user_club_uid:
                continue
            finances_history.append(f)
    monthly_finances = []
    for f in finances_history[-12:]:
        monthly_finances.append({
            "month": _iso(_get_attr(f, "month", "Jan")) or "Jan",
            "balance": _float(_get_attr(f, "balance", 0.0), 0.0) or 0.0,
            "wageSpend": _float(_get_attr(f, "wage_spend", 0.0), 0.0) or 0.0,
            "netCashflow": _float(_get_attr(f, "net_cashflow", 0.0), 0.0) or 0.0,
        })

    recruitment_targets = []
    all_players_iter = _safe_call(lambda: save_instance.players(), "players", default=()) or ()
    for idx, p in enumerate(all_players_iter):
        if (idx & 255) == 0 and (time.monotonic() - start_time) >= SCOUT_BUDGET_SEC:
            break
        if len(recruitment_targets) >= SCOUT_MAX_CANDIDATES:
            break
        c_uid = _get_attr(p, "club_uid", None) or _get_attr(p, "team_id", None)
        if c_uid == user_club_uid:
            continue
        contract_months = _int(_get_attr(p, "contract_expiry_months", 999), 999)
        is_free_agent = c_uid is None or contract_months == 0
        is_expiring = contract_months is not None and contract_months <= 6
        if is_free_agent or is_expiring:
            recruitment_targets.append({
                "uid": _int(_get_attr(p, "uid", 0), 0) or 0,
                "name": _get_attr(p, "name", "Scout Target"),
                "age": _int(_get_attr(p, "age", 20), 20) or 20,
                "nationality": _get_attr(p, "nationality", "Unknown"),
                "primaryPosition": _get_attr(p, "position", "ST"),
                "isFreeAgent": is_free_agent,
                "contractExpiryMonths": contract_months or 0,
                "demandedWageEur": _int(_get_attr(p, "demanded_wage", _get_attr(p, "wage", 0)), 0) or 0,
                "attributes": {
                    "keyPace": _clamp_attr(_get_attr(p, "pace", 10), 10),
                    "keyVision": _clamp_attr(_get_attr(p, "vision", 10), 10),
                    "keyDecision": _clamp_attr(_get_attr(p, "decisions", 10), 10),
                    "keyStamina": _clamp_attr(_get_attr(p, "stamina", 10), 10),
                },
            })

    player_name_map = {int(p["uid"]): str(p["name"]) for p in squad_players}
    active_suspensions, _ = _extract_structured_suspensions(
        save_instance, user_club_uid, squad_uids, player_name_map, {}, raw_players=squad_raw_players
    )
    comp_rules = _extract_typed_competition_rules(save_instance, user_club_uid, None, {})

    return json.dumps({
        "clubUid": user_club_uid,
        "squad": squad_players,
        "activeSuspensions": active_suspensions,
        "playerMatchStats": player_match_stats,
        "teamMatchStats": team_match_stats,
        "playerSeasonHistory": season_history,
        "staff": club_staff,
        "monthlyFinances": monthly_finances,
        "facilities": _to_json_safe(_safe_call(lambda: save_instance.facilities(), "facilities", {"training": "Average", "youth": "Average"})),
        "sponsorships": _to_json_safe(_safe_call(lambda: save_instance.sponsorships(), "sponsorships", [])),
        "transferWindows": _to_json_safe(_safe_call(lambda: save_instance.transfer_windows(), "transfer_windows", {"isOpen": False})),
        "competitionRules": comp_rules,
        "selections": _to_json_safe(_safe_call(lambda: save_instance.selections(), "selections", {})),
        "setPieces": _to_json_safe(_safe_call(lambda: save_instance.set_pieces(), "set_pieces", {})),
        "training": _to_json_safe(_safe_call(lambda: save_instance.training(), "training", {})),
        "jobVacancies": _to_json_safe(_safe_call(lambda: save_instance.job_vacancies(), "job_vacancies", [])),
        "recruitmentTargets": recruitment_targets,
        "extractionWarnings": extraction_warnings,
    })


def extract_fm_save_payload(
    path: str,
    preferred_club_hint: str = "",
    progress_cb: Any = None,
    import_scope: str = "managed_club_only",
    fast_sync: bool = False,
) -> dict[str, Any]:
    """Single-call extractor executing the reordered 4-stage Pass 0/1 pipeline:
    Stage 1: Open save + Club & Squad (52 attributes, traits, badges, direct contract/bans/injuries)
    Stage 2: Finances/12-month cash runway, Club Staff, Tactics & Mentoring
    Stage 3: Fixtures & Full Domestic League Table
    Stage 4 (Full Sync ONLY): Global club ops, Group 4 market scan, team match stats, & Player Stats
    """
    def _emit(step: str, label: str):
        if progress_cb:
            try:
                progress_cb(step, label)
            except Exception:
                pass

    # Stage 1: Open save + Club & Squad
    _emit("Stage 1/4", "Opening .fm save...")
    step_open(path, preferred_club_hint, import_scope, fast_sync)

    _emit("Stage 1/4", "Extracting squad & 52 attributes...")
    step_players()

    # Stage 2: Finances, Club Staff, Tactics & Mentoring
    _emit("Stage 2/4", "Reading finances, staff & tactics...")
    step_3_1_finances()
    _emit("Stage 2/4", "Reading club staff...")
    step_3_2_staff()
    _emit("Stage 2/4", "Reading tactics & mentoring...")
    step_3_3_tactics_and_mentoring()

    # Stage 3: Fixtures & Full Domestic League Table (two separate steps)
    _emit("Stage 3/4", "Reading fixtures, league table & match stats...")
    step_fixtures(True)
    _emit("Stage 3/4", "Reading domestic league table...")
    step_league_table()

    # Stage 4: Full Sync ONLY — Global club ops, Group 4 market scan, and heavy Player Stats
    if not fast_sync:
        _emit("Stage 4/4", "Reading injuries, facilities & competition rules...")
        step_3_3_injuries(False)
        step_3_3_facilities(False)
        step_3_3_competition_rules(False)
        step_3_3_transfer_windows(False)
        step_3_3_secondary_ops(False)
        _emit("Stage 4/4", "Scanning free-agent & expiring contract targets...")
        step_3_4_market_scan_and_release_gamedb(False)
        _emit("Stage 4/4", "Reading team match stats (xG, shots & possession)...")
        step_team_match_stats(False)
        _emit("Stage 4/4", "Reading player season stats...")
        step_4_1_season_stats(False)
        _emit("Stage 4/4", "Reading Last-5 match ratings...")
        step_4_2_player_match_stats(False)
        _emit("Stage 4/4", "Reading player career history...")
        step_4_3_season_history(False)
        _emit("Stage 4/4", "Reading detailed contracts & suspensions...")
        step_4_4_contracts_and_suspensions(False)
    else:
        _record_fast_sync_skip_note()

    _emit("Finalizing", "Finalizing decoded club payload...")
    payload_json = step_finalize()
    return json.loads(payload_json)


def _normalize_cli_scope(raw_scope: str) -> str:
    cleaned = (raw_scope or "").strip().lower()
    if cleaned in ("club_and_division", "division"):
        return "club_and_division"
    return "managed_club_only"


def _parse_cli_bool(raw_val: str) -> bool:
    return (raw_val or "").strip().lower() in ("1", "true", "yes", "on")


def _run_cli(argv: list[str] | None = None) -> int:
    import argparse
    from datetime import datetime, timezone

    args_list = list(sys.argv[1:] if argv is None else argv)
    # Flag-based native server CLI mode: prints ONLY JSON to stdout
    if any(a.startswith("--") for a in args_list):
        parser = argparse.ArgumentParser(
            description="FM27 Command Hub native .fm save extractor (Pass 0 + Pass 1)"
        )
        parser.add_argument("--file", required=True, help="Path to .fm save file")
        parser.add_argument(
            "--scope",
            default="managed_club_only",
            help="Import scope: club_only | managed_club_only | club_and_division",
        )
        parser.add_argument(
            "--fast-sync",
            default="0",
            help="0 for Full Sync (all tables, default), 1 for Fast Sync",
        )
        parser.add_argument("--club-hint", default="", help="Optional club name hint")
        parser.add_argument("--filename", default="", help="Original display filename")
        parsed_args = parser.parse_args(args_list)

        t_start = time.monotonic()
        norm_scope = _normalize_cli_scope(parsed_args.scope)
        use_fast = _parse_cli_bool(parsed_args.fast_sync)
        save_file = parsed_args.file
        display_name = parsed_args.filename or os.path.basename(save_file)

        def _stderr_progress(step: str, label: str) -> None:
            try:
                clean_label = str(label or "").strip()
                if clean_label:
                    sys.stderr.write(f"PROGRESS: {clean_label}\n")
                    sys.stderr.flush()
            except Exception:
                pass

        global SEASON_HISTORY_BUDGET_SEC
        SEASON_HISTORY_BUDGET_SEC = NATIVE_SEASON_HISTORY_BUDGET_SEC

        payload = extract_fm_save_payload(
            save_file,
            preferred_club_hint=parsed_args.club_hint or "",
            progress_cb=_stderr_progress,
            import_scope=norm_scope,
            fast_sync=use_fast,
        )

        # Attach native server runtime metadata
        try:
            file_size_mb = round(os.path.getsize(save_file) / (1024 * 1024), 2)
        except OSError:
            file_size_mb = 0.0
        if isinstance(payload.get("meta"), dict):
            payload["meta"]["fileName"] = display_name
            payload["meta"]["fileSizeMb"] = file_size_mb
            payload["meta"]["decodedAtIso"] = datetime.now(timezone.utc).isoformat()
            payload["meta"]["importScope"] = norm_scope
            payload["meta"]["fastSync"] = use_fast
            payload["meta"]["mountMode"] = "NATIVE_SERVER"
        timings = payload.get("stepTimingsMs")
        if not isinstance(timings, dict):
            timings = {}
        timings["totalDecodeMs"] = max(0, int(round((time.monotonic() - t_start) * 1000)))
        payload["stepTimingsMs"] = timings

        # Defensive guardrail: ensure zero raw CA/PA or raw hidden reliability keys ever leak
        for p in payload.get("players") or []:
            if isinstance(p, dict):
                p.pop("ca", None)
                p.pop("pa", None)
                p.pop("internalReliability", None)
                p.pop("hiddenPersonality", None)
        for t in payload.get("recruitmentTargets") or []:
            if isinstance(t, dict):
                t.pop("ca", None)
                t.pop("pa", None)
                t.pop("internalReliability", None)

        sys.stdout.write(json.dumps(payload))
        sys.stdout.flush()
        return 0

    # Legacy positional interactive CLI mode
    if len(args_list) < 1:
        print(
            "Usage: python3 public/fm-save-mapper.py --file <path> [--scope club_only|club_and_division] [--fast-sync 0|1]",
            file=sys.stderr,
        )
        return 1
    save_file = args_list[0]
    club_hint = args_list[1] if len(args_list) > 1 else ""
    print(f"Extracting FM save from {save_file} (hint='{club_hint}')...")
    payload = extract_fm_save_payload(save_file, club_hint, lambda step, lbl: print(f"[{step}] {lbl}"))
    print("\n--- PASS 0 EXTRACTION COMPLETE ---")
    print(f"Game: {payload['meta']['game']} Build: {payload['meta']['build']} Date: {payload['meta']['gameDateDmy']}")
    print(f"Managed Club: {payload['meta']['clubName']} (UID: {payload['meta']['clubUid']})")
    print(f"Squad Count: {len(payload['players'])} players | Staff: {len(payload.get('staff', []))} | Targets: {len(payload.get('recruitmentTargets', []))}")
    print(f"Played Matches: {len(payload['playedMatches'])} | Upcoming: {len(payload['upcomingFixtures'])}")
    if payload.get("leagueStanding"):
        ls = payload["leagueStanding"]
        print(f"League: {ls['competitionName']} Pos: {ls['position']}/{ls['totalTeams']} (Pts: {ls['points']} Pld: {ls['played']})")
    if payload.get("finances"):
        print(f"Finances Balance: £{payload['finances']['balance']:,} (Wage budget: £{payload['finances']['wageBudgetWeekly']:,}/wk)")
    if payload.get("warnings"):
        print(f"Warnings ({len(payload['warnings'])}):", payload["warnings"][:5])
    return 0


if __name__ == "__main__":
    sys.exit(_run_cli())
