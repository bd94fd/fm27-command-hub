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
import struct
import sys
import time
import warnings
from datetime import date, time as dt_time
from typing import Any

import fmsave

# Ensure sibling modules (e.g. fm_layout_patcher.py) are importable in CLI, spec_from_file_location, and Pyodide
_THIS_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ""
if _THIS_DIR and _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

try:
    import fm_layout_patcher as _layout_patcher

    _layout_patcher.apply_fmsave_runtime_patches()
except Exception:
    _layout_patcher = None  # type: ignore[assignment]

MAPPER_CACHE_BUSTER = "?v=17"

# Detect native server Python vs browser Pyodide (emscripten) for realistic budgets
_IS_PYODIDE = sys.platform == "emscripten"

# Step 3/6 strict per-table wall-clock budgets (seconds)
FINANCES_BUDGET_SEC = 10.0
STAFF_BUDGET_SEC = 16.0 if not _IS_PYODIDE else 14.0
CLUB_OPS_TABLE_BUDGET_SEC = 10.0
SCOUT_BUDGET_SEC = 35.0 if not _IS_PYODIDE else 18.0
SCOUT_MAX_CANDIDATES = 500
SCOUT_PER_POSITION_CAP = 50
DIVISION_BENCHMARK_BUDGET_SEC = 8.0
FIXTURES_SCAN_BUDGET_SEC = 20.0

# Step 4/6 strict per-table wall-clock budgets (seconds)
SEASON_STATS_BUDGET_SEC = 60.0 if not _IS_PYODIDE else 40.0
PLAYER_MATCH_STATS_BUDGET_SEC = 45.0 if not _IS_PYODIDE else 30.0
SEASON_HISTORY_BUDGET_SEC = 45.0 if not _IS_PYODIDE else 25.0
NATIVE_SEASON_HISTORY_BUDGET_SEC = 45.0
CONTRACTS_SUSPENSIONS_BUDGET_SEC = 15.0

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
    "club_team_ids": set(),
    "club_name_by_team_id": {},
    "prefetched_sponsorships": None,
    "prefetched_match_summaries": None,
    "prefetched_stage_index": None,
    "prefetched_competition_index": None,
    "prefetched_stadium_index": None,
    "span_kept_fixtures": None,
    "defer_competition_rules": False,
    "tactics_man_note_recorded": False,
    "import_scope": "managed_club_only",
    "fast_sync": False,
    "fast_sync_warning_recorded": False,
    "game_date": None,
    "wage_budget_weekly": None,
    "squad_uids": set(),
    "squad_pindex_map": {},
    "squad_season_players_by_uid": {},
    "squad_history_selectors": {},
    "squad_omitted_history_selectors": frozenset(),
    "squad_match_windows": {},
    "club_index_refs": None,
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
    "squad_planner": [],
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

# Verified Football Manager canonical competition database_id -> Competition Name lookup
FM_COMPETITION_DB_ID_NAMES: dict[int, str] = {
    # Belgium
    1: "Jupiler Pro League",
    2: "Challenger Pro League",
    3: "Eerste Nationale",
    4: "Tweede Afdeling",
    1301404: "Croky Cup",
    2000370106: "Eerste Nationale VV",
    2000388070: "Eerste Nationale ACFF",
    # England
    11: "Premier League",
    12: "Sky Bet Championship",
    13: "Sky Bet League One",
    14: "Sky Bet League Two",
    1301426: "Emirates FA Cup",
    1301427: "Carabao Cup",
    # UEFA & Major European Leagues
    16: "Ligue 1",
    17: "Ligue 2",
    22: "Bundesliga",
    23: "2. Bundesliga",
    29: "Eredivisie",
    30: "Keuken Kampioen Divisie",
    32: "Serie A",
    33: "Serie B",
    60: "Liga Portugal",
    61: "Liga Portugal 2",
    67: "LaLiga",
    68: "LaLiga Hypermotion",
    1301394: "UEFA Champions League",
    1301395: "UEFA Europa League",
    85060711: "UEFA Conference League",
}

# Extended FM27 Training Session raw code -> human label lookup
# Covers all raw u16 codes observed in FM27 training_man calendars (incl. codes fmsave leaves as UNKNOWN)
FM27_TRAINING_SESSION_CODE_LABELS: dict[int, str] = {
    0: "Passing Style",
    1: "Build-Up Play",
    2: "Chance Creation",
    3: "Attacking Transition",
    4: "Final Third & Finishing",
    5: "Pressing Intensity",
    6: "Pressing Trap",
    7: "Defensive Transition & Shape",
    100: "Defensive Shape",
    101: "Aerial & Box Defending",
    102: "1v1 Defending",
    103: "Defensive Line Control",
    104: "Set-Piece Delivery",
    105: "Set-Piece Defending",
    106: "Attacking Movement & Combinations",
    107: "Attacking Overlap & Width",
    108: "Counter-Attacking Transitions",
    200: "General Outfield",
    201: "Technical Development",
    202: "Tactical Development",
    203: "Physical Development",
    204: "Goalkeeping & Distribution",
    300: "Rest",
    301: "Recovery",
    302: "Light Conditioning",
    303: "Conditioning",
    400: "Match Review & Team Cohesion",
    401: "Match Preparation",
    402: "Travel",
    500: "Match",
    600: "Individual Focus / Unassigned",
}

_PROHIBITED_CA_PA_KEY_RE = re.compile(
    r"^(?:ca|pa|current_?ability|potential_?ability|internal_?reliability|hidden_?personality)$",
    re.IGNORECASE,
)


def deep_scrub_ca_pa(node: Any) -> Any:
    """Recursively strips any raw CA/PA or raw hidden integer keys across the entire JSON graph."""
    if isinstance(node, dict):
        cleaned: dict[str, Any] = {}
        for k, v in node.items():
            ks = str(k)
            if _PROHIBITED_CA_PA_KEY_RE.match(ks):
                continue
            cleaned[ks] = deep_scrub_ca_pa(v)
        return cleaned
    if isinstance(node, list):
        return [deep_scrub_ca_pa(item) for item in node]
    if isinstance(node, tuple):
        return [deep_scrub_ca_pa(item) for item in node]
    return node


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
            keep_tokens = (
                "club", "team", "comp", "stage", "stadium", "managed", "gate",
                "span", "fixture", "league", "rules",
            )
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
    _STATE["club_team_ids"] = set()
    _STATE["club_name_by_team_id"] = {}
    _STATE["prefetched_sponsorships"] = None
    _STATE["prefetched_match_summaries"] = None
    _STATE["prefetched_stage_index"] = None
    _STATE["prefetched_competition_index"] = None
    _STATE["prefetched_stadium_index"] = None
    _STATE["span_kept_fixtures"] = None
    _STATE["defer_competition_rules"] = False
    _STATE["tactics_man_note_recorded"] = False
    _STATE["import_scope"] = "managed_club_only"
    _STATE["fast_sync"] = False
    _STATE["fast_sync_warning_recorded"] = False
    _STATE["game_date"] = None
    _STATE["wage_budget_weekly"] = None
    _STATE["squad_uids"] = set()
    _STATE["squad_pindex_map"] = {}
    _STATE["squad_season_players_by_uid"] = {}
    _STATE["squad_history_selectors"] = {}
    _STATE["squad_omitted_history_selectors"] = frozenset()
    _STATE["squad_match_windows"] = {}
    _STATE["club_index_refs"] = None
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
    _STATE["squad_planner"] = []
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
    """Open .fm save passing strict=False and competition_names whenever fmsave.open supports them."""
    if _layout_patcher is not None:
        try:
            _layout_patcher.apply_fmsave_runtime_patches()
        except Exception:
            pass
    open_kwargs = _get_non_strict_kwargs(fmsave.open)
    comp_kw = _inspect_supported_kwargs(
        fmsave.open, {"competition_names": FM_COMPETITION_DB_ID_NAMES}
    )
    if "competition_names" in comp_kw:
        open_kwargs["competition_names"] = FM_COMPETITION_DB_ID_NAMES
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

    info = save.info
    build_str = str(getattr(info, "build", "unknown"))
    if _layout_patcher is not None and build_str.startswith("27."):
        try:
            _layout_patcher.register_dynamic_fm27_build(build_str)
        except Exception:
            pass

    # Enter ONE shared game_db section borrow across Steps 2-3 (incl. Group 4 & division benchmarks)
    ctx = getattr(save, "_context", None)
    if ctx is not None and hasattr(ctx, "section"):
        try:
            cm = ctx.section("game_db")
            cm.__enter__()
            _STATE["game_db_cm"] = cm
        except Exception:
            _STATE["game_db_cm"] = None

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
    scouting_budget = _int(getattr(target_club, "scouting_budget", None), None) if target_club else None
    scouting_budget_rem = _int(getattr(target_club, "scouting_budget_remaining", None), None) if target_club else None
    club_rep = _int(_first_attr(target_club, ("reputation", "club_reputation")), None)
    club_div_id = _int(
        _first_attr(target_club, ("division_id", "competition_id", "league_id")),
        None,
    )

    # Scan clubs() to index team_id -> club_name, capture first_team_id, and resolve club reputation/division
    club_name_by_team_id: dict[int, str] = {}
    first_team_id: int | None = None
    try:
        for c in save.clubs():
            cid = getattr(c, "uid", None)
            cname = getattr(c, "name", "") or getattr(c, "short_name", "") or ""
            c_teams = getattr(c, "teams", None) or ()
            for tm in c_teams:
                tm_id = _int(getattr(tm, "team_id", None), None)
                if tm_id is not None and cname and not getattr(tm, "is_affiliate", False):
                    club_name_by_team_id[tm_id] = str(cname)
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
                for tm in c_teams:
                    if getattr(tm, "slot", None) == 0:
                        first_team_id = _int(getattr(tm, "team_id", None), None)
                        break
                if first_team_id is None and c_teams:
                    first_team_id = _int(getattr(c_teams[0], "team_id", None), None)
    except Exception as exc:
        _STATE["warnings"].append(f"clubs: {type(exc).__name__}")

    _STATE["club_name_by_team_id"] = club_name_by_team_id
    if first_team_id is not None:
        _STATE["first_team_id"] = first_team_id

    # Pre-index competition names for fast lookup (using explicit name or FM_COMPETITION_DB_ID_NAMES)
    comp_map: dict[int, str] = {}
    try:
        for c in save.competitions():
            cid = _int(getattr(c, "id", None), None)
            if cid is None:
                continue
            cname = getattr(c, "name", None)
            if not cname:
                db_id = _int(getattr(c, "database_id", None), None)
                if db_id is not None and db_id in FM_COMPETITION_DB_ID_NAMES:
                    cname = FM_COMPETITION_DB_ID_NAMES[db_id]
            if cname:
                comp_map[cid] = str(cname)
    except Exception:
        pass
    _STATE["comp_name_by_id"] = comp_map

    game_date = getattr(info, "game_date", None)
    meta = {
        "game": getattr(info, "game", "FM"),
        "build": build_str,
        "knownBuild": bool(getattr(info, "known_build", True)),
        "saveName": getattr(info, "save_name", None) or os.path.basename(path),
        "gameDateIso": _iso(game_date),
        "gameDateDmy": _dmy(game_date),
        "clubUid": club_uid,
        "clubName": club_name or "Managed Club",
        "managerName": manager_name or "Manager",
        "balance": club_balance,
        "scoutingBudget": scouting_budget,
        "scoutingBudgetRemaining": scouting_budget_rem,
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

    def _iter_division_players() -> Any:
        ctx = getattr(save, "_context", None)
        if ctx is not None:
            try:
                from fmsave._layouts import ContractLayout, PersonBlockLayout, find_layout
                from fmsave._save import GAME_DB_SECTION
                from fmsave.readers.player_scan import window_end
                from fmsave.readers.players import build_player_decoder

                save_info = ctx.info
                clock = save_info.game_date
                if clock is not None:
                    game_db_schema = save_info.section_schemas.get(GAME_DB_SECTION)
                    with ctx.section(GAME_DB_SECTION) as game_db:
                        ci = ctx.club_index()
                        div_team_ids: set[int] = set()
                        for tid, entry in ci.team_to_club.items():
                            if entry and entry[0] in target_clubs:
                                div_team_ids.add(tid)
                        if div_team_ids:
                            pr = ctx.player_records()
                            np = ctx.name_pools()
                            layout = pr.layout
                            team_off = layout.team_id_offset
                            u32_unpack = struct.Struct("<I").unpack_from
                            person_layout = find_layout(
                                PersonBlockLayout, GAME_DB_SECTION, game_db_schema, save_info.build
                            ).layout
                            contract_layout = find_layout(
                                ContractLayout, GAME_DB_SECTION, game_db_schema, save_info.build
                            ).layout
                            decoder = build_player_decoder(
                                layout, ci, np, clock, person_layout, contract_layout, save_info.file_name
                            )
                            offsets = pr.record_offsets
                            ambiguous = pr.ambiguous_positions
                            db_len = len(game_db)
                            last_pos = len(offsets) - 1
                            matched: list[Any] = []
                            for pos, off in enumerate(offsets):
                                if pos in ambiguous:
                                    continue
                                if u32_unpack(game_db, off + team_off)[0] not in div_team_ids:
                                    continue
                                if (len(matched) & 127) == 0 and (time.monotonic() - t0) >= DIVISION_BENCHMARK_BUDGET_SEC:
                                    break
                                p_obj, _ = decoder.decode(
                                    game_db,
                                    off,
                                    window_end(pr, pos, db_len),
                                    is_last_record=(pos == last_pos),
                                    next_record_ambiguous=(pos + 1) in ambiguous,
                                    suspension_entries=(),
                                )
                                matched.append(p_obj)
                            return matched
            except Exception:
                pass
        return save.players()

    try:
        p_table = _iter_division_players()
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


def _resolve_club_team_ids(club_index: Any, club_uid: int | None) -> set[int]:
    """Return every team_id belonging to club_uid (first team, reserves, youth, affiliates)."""
    team_ids: set[int] = set()
    if club_index is None or club_uid is None:
        return team_ids
    club_obj = getattr(club_index, "club_by_uid", {}).get(club_uid)
    if club_obj is not None:
        for tm in getattr(club_obj, "teams", None) or ():
            tid = _int(getattr(tm, "team_id", None), None)
            if tid is not None:
                team_ids.add(tid)
    for mapping_attr in ("team_to_club", "affiliate_team_to_club"):
        mapping = getattr(club_index, mapping_attr, None)
        if isinstance(mapping, dict):
            for tid, entry in mapping.items():
                if entry and entry[0] == club_uid:
                    team_ids.add(int(tid))
    return team_ids


def _locate_club_suspensions_fast(
    game_db: bytes,
    player_records: Any,
    matching_positions: list[int],
    layout: Any,
) -> dict[int, tuple[Any, ...]]:
    """Scan suspensions ONLY inside our club's ~47 player byte windows instead of all 342 MB."""
    from fmsave._scan import decode_date
    from fmsave.models.suspensions import SuspensionScope
    from fmsave.readers.suspensions import (
        SuspensionEntry,
        _european_pattern,
        _parent_search,
        _suspension_search,
    )

    if not matching_positions:
        return {}

    search = _suspension_search(layout)
    offsets = player_records.record_offsets
    n_offsets = len(offsets)
    db_len = len(game_db)
    scope_for_code = search.scope_by_code.get
    unknown_scope = SuspensionScope.UNKNOWN
    owner_back = search.owner_back_offset
    entries_by_pos: dict[int, list[tuple[int, SuspensionEntry]]] = {}

    parent_pattern, core_signature = _parent_search(layout)
    prefix_bytes = len(layout.parent_prefix)
    header_bytes = prefix_bytes + 1
    euro_pattern = _european_pattern(layout) if layout.european_signature else None
    euro_prefix_len = len(layout.parent_prefix) + 1
    euro_entry_len = layout.entry_core_bytes + len(layout.null_suffix)

    for pos in matching_positions:
        win_start = max(0, offsets[pos] - owner_back)
        win_end = (
            offsets[pos + 1] - owner_back
            if pos + 1 < n_offsets
            else db_len
        )
        if win_end <= win_start:
            continue

        found: list[tuple[int, SuspensionEntry]] = []

        # 1. Standalone null-suffix entries inside this player's window
        cur = win_start + search.pattern_offset
        while cur < win_end:
            m = search.pattern.search(game_db, cur, win_end)
            if m is None:
                break
            entry_offset = m.start() - search.pattern_offset
            cur = m.start() + 1
            if entry_offset < win_start or entry_offset + search.fields_struct.size > win_end:
                continue
            field_values = search.fields_struct.unpack_from(game_db, entry_offset)
            scope_id = field_values[search.scope_id_index]
            if not search.scope_id_lower_bound < scope_id < search.scope_id_upper_bound:
                continue
            issued = decode_date(game_db, entry_offset + search.issued_date_offset)
            if issued is None:
                continue
            scope_code = field_values[search.scope_code_index]
            found.append((
                entry_offset,
                SuspensionEntry(
                    scope_for_code(scope_code, unknown_scope),
                    scope_code,
                    scope_id,
                    issued,
                    field_values[search.e7_index],
                ),
            ))

        # 2. Counted attached entries inside this player's window
        attached_offsets: set[int] = set()
        m_par = parent_pattern.search(game_db, win_start, win_end)
        while m_par is not None:
            parent_at = m_par.start()
            m_par = parent_pattern.search(game_db, parent_at + 1, win_end)
            cursor = parent_at + header_bytes
            count = game_db[parent_at + prefix_bytes]
            if not count:
                continue
            pending: list[tuple[int, SuspensionEntry]] = []
            ok = True
            for _ in range(count):
                if cursor + max(layout.entry_core_bytes, search.fields_struct.size) > win_end:
                    ok = False
                    break
                if any(game_db[cursor + off] != val for off, val in core_signature):
                    ok = False
                    break
                values = search.fields_struct.unpack_from(game_db, cursor)
                scope_id = values[search.scope_id_index]
                issued = decode_date(game_db, cursor + search.issued_date_offset)
                if issued is None or not search.scope_id_lower_bound < scope_id < search.scope_id_upper_bound:
                    ok = False
                    break
                suffix_at = cursor + layout.entry_core_bytes
                null_end = suffix_at + len(layout.null_suffix)
                linked = False
                if null_end <= win_end and game_db[suffix_at:null_end] == layout.null_suffix:
                    next_cursor = null_end
                elif (
                    cursor + layout.linked_entry_bytes <= win_end
                    and all(game_db[cursor + off] == val for off, val in layout.linked_signature)
                    and game_db[cursor + layout.linked_flag_offset] in layout.linked_flag_values
                    and decode_date(game_db, cursor + layout.linked_date_offset) is not None
                ):
                    next_cursor = cursor + layout.linked_entry_bytes
                    linked = True
                else:
                    ok = False
                    break
                if linked:
                    scope_code = values[search.scope_code_index]
                    pending.append((
                        cursor,
                        SuspensionEntry(
                            scope_for_code(scope_code, unknown_scope),
                            scope_code,
                            scope_id,
                            issued,
                            values[search.e7_index],
                        ),
                    ))
                cursor = next_cursor
            if ok and pending:
                for entry_off, entry in pending:
                    if entry_off not in attached_offsets:
                        attached_offsets.add(entry_off)
                        found.append((entry_off, entry))

        # 3. Singleton European entries inside this player's window
        if euro_pattern is not None:
            for m_eu in euro_pattern.finditer(game_db, win_start, win_end):
                entry_offset = m_eu.start() + euro_prefix_len
                if entry_offset + euro_entry_len > win_end:
                    continue
                issued = decode_date(game_db, entry_offset + search.issued_date_offset)
                if issued is None:
                    continue
                fields = search.fields_struct.unpack_from(game_db, entry_offset)
                found.append((
                    entry_offset,
                    SuspensionEntry(
                        SuspensionScope.EUROPE,
                        fields[search.scope_code_index],
                        None,
                        issued,
                        fields[search.e7_index],
                    ),
                ))

        if found:
            found.sort(key=lambda item: item[0])
            entries_by_pos[pos] = found

    return {
        pos: tuple(entry for _, entry in items)
        for pos, items in entries_by_pos.items()
    }


def _extract_club_players_fast(save: Any, club_uid: int | None) -> list[Any] | None:
    """Club-scoped direct player decoder: prefilters player_records by 4-byte stored team_id
    and decodes ONLY our ~47 managed club players (+ their suspensions & history selectors)
    instead of decoding 160,000+ global players. Caches the club-scoped Table in context so
    tactics/selections/mentoring resolve squad names in 0ms without triggering global players()."""
    ctx = getattr(save, "_context", None)
    if ctx is None or club_uid is None:
        return None
    try:
        from fmsave._layouts import (
            ContractLayout,
            PersonBlockLayout,
            SuspensionLayout,
            find_layout,
        )
        from fmsave._save import (
            GAME_DB_SECTION,
            HISTORY_SELECTORS_CACHE_KEY,
            OMITTED_HISTORY_SELECTORS_CACHE_KEY,
            PLAYERS_TABLE_CACHE_KEY,
        )
        from fmsave.models.players import Player
        from fmsave.readers.player_scan import window_end
        from fmsave.readers.players import build_player_decoder
        from fmsave.readers.season_history import find_history_layout, history_selector
        from fmsave.readers.suspensions import named_entries
        from fmsave.table import Table

        save_info = ctx.info
        clock = save_info.game_date
        if clock is None:
            return None
        game_db_schema = save_info.section_schemas.get(GAME_DB_SECTION)

        with ctx.section(GAME_DB_SECTION) as game_db:
            club_index = ctx.club_index()
            club_team_ids = _resolve_club_team_ids(club_index, club_uid)
            _STATE["club_team_ids"] = club_team_ids
            if not club_team_ids:
                return None

            player_records = ctx.player_records()
            name_pools = ctx.name_pools()
            layout = player_records.layout
            record_offsets = player_records.record_offsets
            ambiguous_positions = player_records.ambiguous_positions
            team_off = layout.team_id_offset
            u32_unpack = struct.Struct("<I").unpack_from

            matching_positions: list[int] = []
            for pos, off in enumerate(record_offsets):
                if pos in ambiguous_positions:
                    continue
                if u32_unpack(game_db, off + team_off)[0] in club_team_ids:
                    matching_positions.append(pos)

            if not matching_positions:
                return None

            person_layout = find_layout(
                PersonBlockLayout, GAME_DB_SECTION, game_db_schema, save_info.build
            ).layout
            contract_layout = find_layout(
                ContractLayout, GAME_DB_SECTION, game_db_schema, save_info.build
            ).layout
            decoder = build_player_decoder(
                layout,
                club_index,
                name_pools,
                clock,
                person_layout,
                contract_layout,
                save_info.file_name,
            )

            susp_layout = find_layout(
                SuspensionLayout, GAME_DB_SECTION, game_db_schema, save_info.build
            ).layout
            susp_by_pos = _locate_club_suspensions_fast(
                game_db, player_records, matching_positions, susp_layout
            )
            if susp_by_pos and getattr(ctx, "competition_names", None):
                try:
                    save.competitions()
                    susp_by_pos = dict(
                        named_entries(susp_by_pos, ctx.competition_index().name_for)
                    )
                except Exception:
                    pass

            history_layout = find_history_layout(save_info.build)
            history_selectors: dict[int, int] = {}
            omitted_history_selectors: set[int] = set()
            game_db_length = len(game_db)
            last_position = len(record_offsets) - 1

            # Capture omitted selectors from the small ambiguous_positions set
            for amb_pos in ambiguous_positions:
                rec_off = record_offsets[amb_pos]
                rec_end = window_end(player_records, amb_pos, game_db_length)
                closing = decoder.closing_header(
                    game_db,
                    rec_off,
                    rec_end,
                    player_records.pindexes[amb_pos],
                    player_records.uids[amb_pos],
                    is_last_record=amb_pos == last_position,
                    next_record_ambiguous=(amb_pos + 1) in ambiguous_positions,
                )
                try:
                    decoder.decode_person(game_db, rec_off, rec_end, closing)
                except Exception:
                    continue
                omitted_history_selectors.add(
                    history_selector(
                        game_db,
                        decoder.person_decoder.last_block_start,
                        rec_off,
                        rec_end,
                        history_layout,
                    )
                )

            decoded_club_players: list[Player] = []
            for pos in matching_positions:
                rec_off = record_offsets[pos]
                rec_end = window_end(player_records, pos, game_db_length)
                susp_entries = susp_by_pos.get(pos, ())
                player, _contract = decoder.decode(
                    game_db,
                    rec_off,
                    rec_end,
                    is_last_record=pos == last_position,
                    next_record_ambiguous=(pos + 1) in ambiguous_positions,
                    suspension_entries=susp_entries,
                )
                history_selectors[player.uid] = history_selector(
                    game_db,
                    decoder.person_decoder.last_block_start,
                    rec_off,
                    rec_end,
                    history_layout,
                )
                decoded_club_players.append(player)

            # Seed context caches so tactics(), selections(), mentoring(), and season_history
            # resolve our squad immediately without triggering a 160k global players() decode.
            cache = getattr(ctx, "_cache", None)
            if isinstance(cache, dict):
                cache[PLAYERS_TABLE_CACHE_KEY] = Table(tuple(decoded_club_players), Player)
                cache[HISTORY_SELECTORS_CACHE_KEY] = history_selectors
                cache[OMITTED_HISTORY_SELECTORS_CACHE_KEY] = frozenset(omitted_history_selectors)

            return decoded_club_players
    except Exception:
        return None


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

    raw_players = _extract_club_players_fast(save, club_uid)
    if raw_players is None:
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
    nation_lookup = _build_nation_lookup(save)

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
                    for code, attr_candidates in (
                        ("GK", ("gk", "GK")),
                        ("DL", ("dl", "DL")),
                        ("DC", ("dc", "DC")),
                        ("DR", ("dr", "DR")),
                        ("WBL", ("wbl", "WBL")),
                        ("DM", ("dm", "DM")),
                        ("WBR", ("wbr", "WBR")),
                        ("ML", ("ml", "ML")),
                        ("MC", ("mc", "MC")),
                        ("MR", ("mr", "MR")),
                        ("AML", ("aml", "AML")),
                        ("AMC", ("amc", "AMC")),
                        ("AMR", ("amr", "AMR")),
                        ("ST", ("stc", "st", "STC", "ST")),
                    ):
                        val = None
                        for cand_attr in attr_candidates:
                            val = getattr(raw_pos_map, cand_attr, None)
                            if val is not None:
                                break
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

        raw_tv = getattr(p, "transfer_value", None)
        raw_tv_state = getattr(p, "transfer_value_state", None)
        tv_state_str = str(getattr(raw_tv_state, "value", raw_tv_state) or "").lower().strip()
        if isinstance(raw_tv, (int, float)) and raw_tv > 0:
            market_value: int | None = int(round(raw_tv))
        elif tv_state_str == "zero":
            market_value = 0
        else:
            market_value = None

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
            "marketValue": market_value,
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
            if "history" in kind_str or "past" in kind_str:
                continue
            inj_date = getattr(inj, "date", None)
            days_rem = _int(_first_attr(inj, ("days_remaining", "days_left", "duration_days")), None)
            is_active = (
                bool(getattr(inj, "is_active", False))
                or "current" in kind_str
                or "active" in kind_str
                or (days_rem is not None and days_rem > 0)
                or (not kind_str and game_date and inj_date and (game_date - inj_date).days <= 30)
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

    # Capture lightweight club-scoped metadata (47 players instead of 100k+ global) while
    # player_records, club_index, and history selectors are already warm in memory.
    # This allows Stage 4 season_stats, player_match_stats, and season_history to decode ONLY
    # our managed club's squad in < 1s without re-opening game_db or re-parsing 100k players.
    squad_pindex_map: dict[int, Any] = {}
    squad_season_players_by_uid: dict[int, Any] = {}
    squad_history_selectors: dict[int, int] = {}
    squad_omitted_selectors: frozenset[int] = frozenset()
    squad_match_windows: dict[int, tuple[int, int, int, Any]] = {}
    club_index_refs = None
    try:
        ctx = getattr(save, "_context", None)
        if ctx is not None and raw_players:
            from fmsave.readers.season_stats import SeasonPlayer
            from fmsave._save import (
                GOALKEEPER_POSITION,
                HISTORY_SELECTORS_CACHE_KEY,
                OMITTED_HISTORY_SELECTORS_CACHE_KEY,
            )

            player_records = ctx.player_records() if hasattr(ctx, "player_records") else None
            club_index = ctx.club_index() if hasattr(ctx, "club_index") else None
            if club_index is not None:
                club_index_refs = (club_index.team_to_club, club_index.club_by_uid)

            raw_selectors = (
                ctx.cached_value(HISTORY_SELECTORS_CACHE_KEY)
                if hasattr(ctx, "cached_value")
                else None
            )
            raw_omitted = (
                ctx.cached_value(OMITTED_HISTORY_SELECTORS_CACHE_KEY)
                if hasattr(ctx, "cached_value")
                else None
            )
            if raw_omitted is not None:
                squad_omitted_selectors = frozenset(raw_omitted)

            pindexes = getattr(player_records, "pindexes", None) if player_records is not None else None
            pos_by_uid = getattr(player_records, "position_by_uid", None) if player_records is not None else None
            rec_offsets = getattr(player_records, "record_offsets", None) if player_records is not None else None
            ambiguous_pos = getattr(player_records, "ambiguous_positions", frozenset()) if player_records is not None else frozenset()

            for rp in raw_players:
                r_uid = _int(getattr(rp, "uid", None), None)
                if r_uid is None or r_uid not in squad_uids:
                    continue
                sp = SeasonPlayer(
                    uid=r_uid,
                    name=getattr(rp, "name", None),
                    team_id=getattr(rp, "team_id", None),
                    goalkeeper=GOALKEEPER_POSITION in (getattr(rp, "natural_positions", None) or ()),
                )
                squad_season_players_by_uid[r_uid] = sp
                if isinstance(raw_selectors, dict) and r_uid in raw_selectors:
                    squad_history_selectors[r_uid] = raw_selectors[r_uid]
                elif raw_selectors is not None:
                    sel_v = raw_selectors.get(r_uid)
                    if sel_v is not None:
                        squad_history_selectors[r_uid] = sel_v
                if pos_by_uid is not None and pindexes is not None and r_uid in pos_by_uid:
                    pos_idx = pos_by_uid[r_uid]
                    squad_pindex_map[pindexes[pos_idx]] = sp
                    if rec_offsets is not None and pos_idx not in ambiguous_pos:
                        cur_off = rec_offsets[pos_idx]
                        nxt_off = rec_offsets[pos_idx + 1] if (pos_idx + 1) < len(rec_offsets) else -1
                        squad_match_windows[pos_idx] = (cur_off, nxt_off, r_uid, sp)
    except Exception:
        pass

    players_out.sort(key=lambda x: (-sort_keys.get(x["uid"], 0.0), x["name"]))
    _STATE["direct_injuries"] = direct_injuries[:15]
    _STATE["active_injuries"] = list(direct_injuries[:15])
    _STATE["active_suspensions"] = direct_suspensions
    _STATE["missing_contract_uids"] = missing_contract_uids
    _STATE["suspensions_hint_uids"] = suspensions_hint_uids
    _STATE["squad_pindex_map"] = squad_pindex_map
    _STATE["squad_season_players_by_uid"] = squad_season_players_by_uid
    _STATE["squad_history_selectors"] = squad_history_selectors
    _STATE["squad_omitted_history_selectors"] = squad_omitted_selectors
    _STATE["squad_match_windows"] = squad_match_windows
    _STATE["club_index_refs"] = club_index_refs
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

    def _iter_market_candidates() -> Any:
        ctx = getattr(save, "_context", None)
        if ctx is None:
            yield from save.players()
            return
        try:
            from dataclasses import fields as dc_fields
            from fmsave._layouts import ContractLayout, PersonBlockLayout, find_layout
            from fmsave._save import GAME_DB_SECTION
            from fmsave.models.players import Attributes
            from fmsave.readers._common import MISSING_REFERENCE
            from fmsave.readers.player_scan import window_end
            from fmsave.readers.players import _derived_positions, build_player_decoder

            save_info = ctx.info
            clock = save_info.game_date
            if clock is None:
                yield from save.players()
                return
            game_db_schema = save_info.section_schemas.get(GAME_DB_SECTION)
            with ctx.section(GAME_DB_SECTION) as game_db:
                ci = ctx.club_index()
                pr = ctx.player_records()
                np = ctx.name_pools()
                layout = pr.layout
                person_layout = find_layout(
                    PersonBlockLayout, GAME_DB_SECTION, game_db_schema, save_info.build
                ).layout
                contract_layout = find_layout(
                    ContractLayout, GAME_DB_SECTION, game_db_schema, save_info.build
                ).layout
                decoder = build_player_decoder(
                    layout, ci, np, clock, person_layout, contract_layout, save_info.file_name
                )

                # Build exact raw_attribute_bytes offset table dynamically from Attributes fields
                foot_indices = {layout.left_foot_index, layout.right_foot_index}
                attr_byte_idx: dict[str, int] = {}
                byte_pos = 0
                for f in dc_fields(Attributes):
                    while byte_pos in foot_indices:
                        byte_pos += 1
                    attr_byte_idx[f.name] = byte_pos
                    byte_pos += 1

                # Precompute the 6 byte offsets per position group for ultra-fast visible quality check
                slot_key_offsets: dict[str, tuple[int, ...]] = {
                    "GK": tuple(attr_byte_idx[k] for k in ("reflexes", "handling", "aerial_reach", "positioning", "one_on_ones", "command_of_area")),
                    "ST": tuple(attr_byte_idx[k] for k in ("finishing", "off_the_ball", "pace", "composure", "acceleration", "first_touch")),
                    "DC": tuple(attr_byte_idx[k] for k in ("tackling", "marking", "positioning", "jumping_reach", "concentration", "strength")),
                    "FB": tuple(attr_byte_idx[k] for k in ("pace", "stamina", "tackling", "crossing", "positioning", "acceleration")),
                    "AM": tuple(attr_byte_idx[k] for k in ("pace", "dribbling", "off_the_ball", "passing", "first_touch", "technique")),
                    "MC": tuple(attr_byte_idx[k] for k in ("passing", "decisions", "work_rate", "stamina", "first_touch", "vision")),
                }
                pos_codes = layout.position_codes
                pos_code_info: list[tuple[str, str, str, tuple[int, ...]]] = []
                for code in pos_codes:
                    p_up = code.upper()
                    grp = _classify_pos_group_py(code)
                    slot = _classify_exact_pos_slot_py(code)
                    if "GK" in p_up:
                        k_offs = slot_key_offsets["GK"]
                    elif any(k in p_up for k in ("ST", "CF")):
                        k_offs = slot_key_offsets["ST"]
                    elif any(k in p_up for k in ("DC", "CB", "D (C")):
                        k_offs = slot_key_offsets["DC"]
                    elif any(k in p_up for k in ("DL", "DR", "WB", "D (L", "D (R")):
                        k_offs = slot_key_offsets["FB"]
                    elif any(k in p_up for k in ("AML", "AMR", "AMC", "AM (", "ML", "MR")):
                        k_offs = slot_key_offsets["AM"]
                    else:
                        k_offs = slot_key_offsets["MC"]
                    pos_code_info.append((code, grp, slot, k_offs))

                club_team_ids = _STATE.get("club_team_ids") or _resolve_club_team_ids(ci, club_uid)
                team_fields_get = decoder.team_fields.get
                hdr_unpack = decoder.header_layout.struct_object.unpack_from
                hdr_start = decoder.header_layout.start_offset
                team_idx = decoder.header_layout.team_id_index
                cur_rep_idx = decoder.header_layout.current_reputation_index
                home_rep_idx = decoder.header_layout.home_reputation_index
                uid_idx = decoder.header_layout.uid_index
                pindex_idx = decoder.header_layout.pindex_index
                ratings_off = layout.ratings_offset
                ratings_cnt = layout.ratings_count
                attrs_off = layout.attributes_offset
                scale_table = decoder.scale_table
                contract_dec = decoder.contract_decoder
                offsets = pr.record_offsets
                ambiguous = pr.ambiguous_positions
                db_len = len(game_db)
                last_pos = len(offsets) - 1

                for pos, off in enumerate(offsets):
                    if (pos & 2047) == 0 and (time.monotonic() - start_ts) >= SCOUT_BUDGET_SEC:
                        _record_warning(
                            f"recruitment_scan: {SCOUT_BUDGET_SEC:.0f}s budget reached ({pos} players scanned, {evaluated_count} realistic targets evaluated)"
                        )
                        break
                    if pos in ambiguous:
                        continue

                    hv = hdr_unpack(game_db, off + hdr_start)
                    stored_tid = hv[team_idx]
                    if stored_tid in club_team_ids:
                        continue

                    if rep_max is not None:
                        p_rep = hv[cur_rep_idx] or hv[home_rep_idx]
                        if p_rep > rep_max or (rep_min is not None and p_rep < rep_min):
                            continue

                    # Fast raw-byte primary position + visible quality pre-score
                    r_start = off + ratings_off
                    best_r = -1
                    best_i = 0
                    for ri in range(ratings_cnt):
                        rv = game_db[r_start + ri]
                        if rv > best_r:
                            best_r = rv
                            best_i = ri
                    _code, pos_grp, exact_slot, k_offs = pos_code_info[best_i]

                    a_start = off + attrs_off
                    vis_sum = 0
                    for ko in k_offs:
                        v = scale_table[game_db[a_start + ko]]
                        vis_sum += 20 if v > 20 else (1 if v < 1 else v)
                    vis_q = vis_sum / 6.0
                    squad_med = squad_medians.get(pos_grp, 10.5)
                    if vis_q < max(7.5, squad_med - 2.5):
                        continue

                    # Optimistic heap bound check before decoding contract or person block!
                    # Max possible bonuses: age(2.0) + region(2.4) + contract(0.6) = 5.0
                    bucket = pos_heaps[exact_slot]
                    if len(bucket) >= per_pos_cap:
                        max_possible = (vis_q - squad_med) * 2.0 + vis_q + 5.05
                        if max_possible <= bucket[0][0]:
                            continue

                    rec_end = window_end(pr, pos, db_len)
                    is_free_by_team = stored_tid == MISSING_REFERENCE
                    tf = None if is_free_by_team else team_fields_get(stored_tid)
                    p_club_uid = None if tf is None else tf[0]
                    if club_uid is not None and p_club_uid == club_uid:
                        continue

                    # Check contract expiry BEFORE decoding person/name block
                    if not is_free_by_team and p_club_uid is not None:
                        contract_obj, _on_loan, *_ = contract_dec.decode(
                            game_db,
                            off,
                            rec_end,
                            pos == last_pos,
                            hv[pindex_idx],
                            hv[uid_idx],
                            None,
                            p_club_uid,
                            registration_missing=False,
                            object_end=None,
                        )
                        if contract_obj is not None:
                            c_end = getattr(contract_obj, "end", None)
                            c_months = _months_until(c_end, game_date) if c_end else 999
                            if c_months > 12:
                                continue
                            c_wage = _int(getattr(contract_obj, "wage", None), 0) or 0
                            if c_months > 0 and c_wage > wage_ceiling:
                                continue

                    # Candidate survived all fast filters — decode full Player cleanly
                    p_obj, _ = decoder.decode(
                        game_db,
                        off,
                        rec_end,
                        is_last_record=(pos == last_pos),
                        next_record_ambiguous=(pos + 1) in ambiguous,
                        suspension_entries=(),
                    )
                    yield p_obj
                return
        except Exception:
            yield from save.players()

    try:
        p_table = _iter_market_candidates()
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


def _extract_club_finances_fast(save: Any, club_uid: int | None) -> list[Any] | None:
    """Club-span direct finances + sponsorships reader (~0.002s instead of scanning 38k clubs)."""
    ctx = getattr(save, "_context", None)
    if ctx is None or club_uid is None:
        return None
    try:
        from fmsave._save import GAME_DB_SECTION
        from fmsave.readers.finances import find_finance_layouts, read_club_finances

        save_info = ctx.info
        clock = save_info.game_date
        if clock is None:
            return None
        game_db_schema = save_info.section_schemas.get(GAME_DB_SECTION)
        with ctx.section(GAME_DB_SECTION) as game_db:
            ci = ctx.club_index()
            spans = ctx.own_club_record_spans()
            our_span = next((sp for sp in spans if sp.club_uid == club_uid), None)
            if our_span is None:
                return None
            layouts = find_finance_layouts(game_db_schema, save_info.build).for_clubs(ci)
            months, sponsorships, _stats = read_club_finances(
                game_db, ci, (our_span,), clock, layouts, True
            )
            _STATE["prefetched_sponsorships"] = list(sponsorships)
            return list(months)
    except Exception:
        return None


def _extract_club_staff_fast(save: Any, club_uid: int | None) -> list[Any] | None:
    """Club-scoped direct staff reader: reads ONLY our club's staff_lists + team_id-targeted
    contracts & no-contract roles + human manager, decoding ~40 staff instead of 80,000+."""
    ctx = getattr(save, "_context", None)
    if ctx is None or club_uid is None:
        return None
    try:
        from fmsave._save import GAME_DB_SECTION, HUMANS_SECTION
        from fmsave.readers.contracts import CHAIN_RECORD_CLUB_UID, CHAIN_RECORD_HAS_TERMS, build_contract_decoder
        from fmsave.readers.managed import first_human_selector
        from fmsave.readers.persons import build_person_block_decoder
        from fmsave.readers.staff import (
            _AMBIGUOUS,
            _ID_OFFSET,
            _PersonObject,
            _SELECTOR_TEAM,
            _UINT32,
            _build_rows,
            _closing_header,
            _contract_header_with_kind,
            _header_reader,
            _header_values,
            _human_records,
            _job_code,
            _latest_started,
            _merge_membership,
            _next_header_after,
            _person_block_window,
            _read_ability_block,
            _row_roles,
            find_staff_layouts,
            locate_contracted_header,
            locate_human_header,
            locate_listed_header,
            read_staff_lists,
        )

        save_info = ctx.info
        clock = save_info.game_date
        if clock is None:
            return None
        layouts = find_staff_layouts(save_info.section_schemas, save_info.build)
        staff_layout = layouts.staff

        with ctx.section(GAME_DB_SECTION) as game_db:
            ci = ctx.club_index()
            pr = ctx.player_records()
            np = ctx.name_pools()
            club_team_ids = _STATE.get("club_team_ids") or _resolve_club_team_ids(ci, club_uid)
            if not club_team_ids:
                return None

            # Include affiliate clubs whose parent is our club
            relevant_club_uids = {club_uid}
            for c in ci.clubs:
                if getattr(c, "parent_club_uid", None) == club_uid:
                    relevant_club_uids.add(c.uid)

            # 1. Read staff lists ONLY for our club (+ its affiliate sides)
            class _MiniClubIndex:
                __slots__ = ("record_spans",)
                def __init__(self, spans: tuple[Any, ...]) -> None:
                    self.record_spans = spans

            our_spans = tuple(sp for sp in ci.record_spans if sp.club_uid in relevant_club_uids)
            listed_pairs, _lists_by_club, _list_counts = read_staff_lists(
                game_db, _MiniClubIndex(our_spans), pr, staff_layout  # type: ignore[arg-type]
            )

            contract_decoder = build_contract_decoder(layouts.contracts, ci, clock, save_info.file_name)
            person_decoder = build_person_block_decoder(layouts.person_blocks, np, ci, clock, save_info.file_name)
            with ctx.section(HUMANS_SECTION) as humans:
                human_selector = first_human_selector(humans, layouts.humans, save_info.file_name)

            # 2. Targeted contract & no-contract role scan ONLY for our club's ~5 team_ids!
            tag = layouts.contracts.tag
            sel_off = layouts.contracts.selector_offset
            gap = sel_off - len(tag)
            tid_alt = b"|".join(re.escape(struct.pack("<I", tid)) for tid in sorted(club_team_ids))
            pindex_positions = pr.position_by_pindex
            ambiguous_pindexes = pr.ambiguous_pindexes
            closed_clubs = ci.record_spans[:-1]

            def _in_closed_club(offset: int) -> bool:
                lo, hi = 0, len(closed_clubs)
                while lo < hi:
                    mid = (lo + hi) // 2
                    if closed_clubs[mid].record_end <= offset:
                        lo = mid + 1
                    else:
                        hi = mid
                return lo < len(closed_clubs) and closed_clubs[lo].record_start <= offset

            records_by_person: dict[int, list[tuple[int, Any]]] = {}
            header_by_person: dict[int, int] = {}
            offer_marker_offset = staff_layout.offer_marker_offset

            if gap >= 0:
                contract_pat = re.compile(
                    re.escape(tag) + (b".{%d}" % gap if gap else b"") + b"....(?:" + tid_alt + b")",
                    re.DOTALL,
                )
                for m in contract_pat.finditer(game_db):
                    tag_offset = m.start()
                    if _in_closed_club(tag_offset):
                        continue
                    selector = _UINT32.unpack_from(game_db, tag_offset + sel_off)[0]
                    if selector == 0 or selector == human_selector:
                        continue
                    person_id = selector - _ID_OFFSET
                    if person_id in pindex_positions or person_id in ambiguous_pindexes:
                        continue
                    record = contract_decoder.decode_chain_record(game_db, tag_offset)
                    if not record[CHAIN_RECORD_HAS_TERMS]:
                        continue
                    if offer_marker_offset is not None and game_db.startswith(
                        tag, tag_offset + sel_off + offer_marker_offset
                    ):
                        continue
                    own_records = records_by_person.get(person_id)
                    if own_records is None:
                        header = locate_contracted_header(game_db, person_id, tag_offset, staff_layout)
                        if header is None:
                            continue
                        header_by_person[person_id] = header
                        own_records = records_by_person[person_id] = []
                    own_records.append((tag_offset, record))

            no_contract_roles: dict[tuple[int, int], tuple[int, int, int | None]] = {}
            nc_sel_off = staff_layout.no_contract_selector_offset
            if nc_sel_off is not None:
                lead = staff_layout.no_contract_lead
                nc_gap = nc_sel_off - len(tag) - len(lead)
                if nc_gap >= 0:
                    nc_pat = re.compile(
                        re.escape(tag)
                        + (b".{%d}" % nc_gap if nc_gap else b"")
                        + re.escape(lead)
                        + b"....(?:" + tid_alt + b")",
                        re.DOTALL,
                    )
                    club_by_tid = contract_decoder.club_by_team_id
                    for m in nc_pat.finditer(game_db):
                        tag_offset = m.start()
                        if _in_closed_club(tag_offset):
                            continue
                        selector_at = tag_offset + nc_sel_off
                        selector, team_id = _SELECTOR_TEAM.unpack_from(game_db, selector_at)
                        if selector == 0 or selector == human_selector:
                            continue
                        person_id = selector - _ID_OFFSET
                        if person_id in pindex_positions or person_id in ambiguous_pindexes:
                            continue
                        r_club_uid = club_by_tid.get(team_id, (None, None))[0]
                        if r_club_uid != club_uid or (r_club_uid, person_id) in no_contract_roles:
                            continue
                        header = header_by_person.get(person_id)
                        if header is None:
                            header = locate_contracted_header(game_db, person_id, tag_offset, staff_layout)
                            if header is None:
                                continue
                            header_by_person[person_id] = header
                        no_contract_roles[(r_club_uid, person_id)] = (
                            tag_offset,
                            team_id,
                            _job_code(game_db, selector_at, staff_layout),
                        )

            for _c_uid, person_id in listed_pairs:
                if person_id in header_by_person:
                    continue
                located = locate_listed_header(game_db, person_id, pr, staff_layout)
                if located is not _AMBIGUOUS and located is not None:
                    header_by_person[person_id] = int(located)

            human_person_id: int | None = None
            if human_selector is not None:
                human_header = locate_human_header(game_db, human_selector, staff_layout)
                if human_header is not None:
                    human_person_id = human_selector - _ID_OFFSET
                    header_by_person[human_person_id] = human_header

            player_header_offset = pr.layout.pindex_offset
            ambiguous_player_headers = frozenset(
                pr.record_offsets[p_pos] + player_header_offset
                for p_pos in pr.ambiguous_positions
            )
            boundaries = sorted(
                {rec_off + player_header_offset for rec_off in pr.record_offsets}
                | set(header_by_person.values())
            )

            if human_person_id is not None:
                human_header = header_by_person[human_person_id]
                next_header = _next_header_after(boundaries, human_header)
                object_end = next_header or len(game_db)
                if (
                    layouts.person_blocks.require_unique_candidate
                    or staff_layout.human_personality_floor is not None
                ):
                    human_values = _header_values(
                        game_db, human_header, _header_reader(staff_layout), staff_layout
                    )
                    if human_values is not None:
                        closing = _closing_header(
                            game_db,
                            human_person_id,
                            human_header,
                            human_values[0],
                            next_header,
                            staff_layout,
                            ambiguous_player_headers,
                        )
                        if closing is not None and closing.offset is not None:
                            object_end = min(object_end, closing.offset)
                found_records = _human_records(
                    game_db, human_header, object_end, human_selector, contract_decoder, layouts
                )
                if found_records:
                    records_by_person[human_person_id] = found_records
                else:
                    del header_by_person[human_person_id]
                    human_person_id = None

            rows_by_club_and_person, _membership = _merge_membership(
                listed_pairs, records_by_person, header_by_person, ci, no_contract_roles
            )
            if human_person_id is not None:
                human_record = _latest_started(records_by_person[human_person_id])
                human_club_uid = human_record[1][CHAIN_RECORD_CLUB_UID]
                if human_club_uid == club_uid:
                    rows_by_club_and_person[(human_club_uid, human_person_id)] = (human_record, (), None)

            # Restrict strictly to our managed club before decoding person & ability blocks
            rows_by_club_and_person = {
                k: v for k, v in rows_by_club_and_person.items() if k[0] == club_uid
            }
            if not rows_by_club_and_person:
                return None

            row_persons = {person_id for _c_uid, person_id in rows_by_club_and_person}
            objects: dict[int, Any] = {}
            hdr_reader = _header_reader(staff_layout)
            for person_id in sorted(row_persons):
                header = header_by_person[person_id]
                header_values = _header_values(game_db, header, hdr_reader, staff_layout)
                if header_values is None:
                    continue
                uid, kind = header_values
                is_human_manager = kind == staff_layout.human_kind
                block = None
                if not is_human_manager:
                    block, *_ = _read_ability_block(game_db, header, staff_layout)
                next_header = _next_header_after(boundaries, header)
                closing = _closing_header(
                    game_db, person_id, header, uid, next_header, staff_layout, ambiguous_player_headers
                )
                unique_id = None if closing is None else closing.uid
                closing_offset = None if closing is None else closing.offset
                human_floor = staff_layout.human_personality_floor
                person_boundary = next_header
                if closing_offset is not None and (
                    layouts.person_blocks.require_unique_candidate
                    or (is_human_manager and human_floor is not None)
                ):
                    person_boundary = closing_offset
                own_records = records_by_person.get(person_id)
                tag_offset = None if own_records is None else _latest_started(own_records)[0]
                window_start, window_end = _person_block_window(
                    game_db, header, tag_offset, person_boundary, staff_layout
                )
                person = person_decoder.decode(game_db, window_start, window_end)
                if person is None and is_human_manager and human_floor is not None:
                    person = person_decoder.decode(game_db, window_start, window_end, human_floor)
                objects[person_id] = _PersonObject(
                    header=header,
                    uid=uid,
                    unique_id=unique_id,
                    is_human_manager=is_human_manager,
                    person=person,
                    block=block,
                )

            rows_by_club_and_person = {
                k: v for k, v in rows_by_club_and_person.items() if k[1] in objects
            }
            roles = _row_roles(game_db, rows_by_club_and_person, no_contract_roles, layouts)
            return list(_build_rows(rows_by_club_and_person, objects, ci, roles))
    except Exception:
        return None


def step_3_1_finances() -> str:
    """Step 3/6 (1/4): Finances & 12-month cash runway — uses club-span direct read (~2ms)
    with lazy stream fallback (NEVER global list())."""
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
            fast_finances = _extract_club_finances_fast(save, club_uid)
            if fast_finances is not None:
                club_finances = fast_finances
            else:
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
    elapsed_ms = _record_step_timing("step_3_1_finances", t0)
    return json.dumps({
        "monthlyFinances": len(monthly_finances),
        "elapsedMs": elapsed_ms,
        "timedOut": timed_out,
        "warning": warning_msg,
    })


def step_3_2_staff() -> str:
    """Step 3/6 (2/4): Club staff — uses club-scoped direct reader (~0.4s) with lazy stream
    fallback and immediate club_uid != target_club_uid skip (zero global list materialization)."""
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
            staff_nation_lookup = _build_nation_lookup(save)

            def _append_staff_row(s: Any) -> None:
                s_name = getattr(s, "name", None)
                if not s_name:
                    return
                s_attrs = getattr(s, "attributes", None)
                if s_attrs is not None and callable(getattr(s_attrs, "to_display_scale", None)):
                    try:
                        scaled_attrs = s_attrs.to_display_scale()
                        if scaled_attrs is not None:
                            s_attrs = scaled_attrs
                    except Exception:
                        pass
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
                    "nation": _resolve_player_nationality(s, staff_nation_lookup, default="N/A"),
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
                fast_staff = _extract_club_staff_fast(save, club_uid)
                if fast_staff is not None:
                    _scan_staff(fast_staff)
                else:
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


def _decode_tactic_slot_position(positions_tuple: Any, mask: int = 0) -> str | None:
    """Decode fmsave TacticSlot in_possession_positions / out_of_possession_positions tuple
    (which contains CodedValue[TacticPosition] items) and lateral bitmask
    (0x200000 = Right-centre, 0x100000 = Left-centre) into an FM position code."""
    if not positions_tuple or not isinstance(positions_tuple, (list, tuple)):
        return None
    pos0 = positions_tuple[0]
    enum_obj = getattr(pos0, "label", pos0)
    raw_name = getattr(enum_obj, "name", None) or str(enum_obj or "")
    p_name = raw_name.strip().upper().split(".")[-1].replace(" ", "_")
    is_right = bool(mask & 0x200000)
    is_left = bool(mask & 0x100000)
    side_suffix = "R" if is_right else ("L" if is_left else "")

    if p_name in ("GOALKEEPER", "GK"):
        return "GK"
    if p_name in ("DEFENDER_RIGHT", "DR"):
        return "DR"
    if p_name in ("DEFENDER_LEFT", "DL"):
        return "DL"
    if p_name in ("DEFENDER_CENTRE", "DC"):
        return f"DC{side_suffix}"
    if p_name in ("WING_BACK_RIGHT", "WBR"):
        return "WBR"
    if p_name in ("WING_BACK_LEFT", "WBL"):
        return "WBL"
    if p_name in ("DEFENSIVE_MIDFIELDER", "DM"):
        return f"DM{side_suffix}" if side_suffix else "DM"
    if p_name in ("MIDFIELDER_RIGHT", "MR"):
        return "MR"
    if p_name in ("MIDFIELDER_LEFT", "ML"):
        return "ML"
    if p_name in ("MIDFIELDER_CENTRE", "MC"):
        return f"MC{side_suffix}"
    if p_name in ("ATTACKING_MIDFIELDER_RIGHT", "AMR"):
        return "AMR"
    if p_name in ("ATTACKING_MIDFIELDER_LEFT", "AML"):
        return "AML"
    if p_name in ("ATTACKING_MIDFIELDER_CENTRE", "AMC"):
        return f"AMC{side_suffix}" if side_suffix else "AMC"
    if p_name in ("STRIKER_CENTRE", "STRIKER", "ST", "STC"):
        return f"STC{side_suffix}" if side_suffix else "STC"
    return _label(pos0)


def _derive_formation_from_positions(pos_codes: list[str]) -> str | None:
    """Derive a clean human-readable FM formation string (e.g. '4-3-3 DM Wide', '4-2-3-1 DM AM Wide')
    from the 11 decoded slot position codes."""
    if not pos_codes:
        return None
    d_cnt = 0
    wb_cnt = 0
    dm_cnt = 0
    m_cnt = 0
    am_cnt = 0
    st_cnt = 0
    has_wide_am = False
    for code in pos_codes:
        c = (code or "").upper().strip()
        if not c or c == "GK" or c.startswith("SLOT"):
            continue
        if c in ("DR", "DL", "DC", "DCR", "DCL"):
            d_cnt += 1
        elif c in ("WBR", "WBL"):
            wb_cnt += 1
        elif c in ("DM", "DMR", "DML"):
            dm_cnt += 1
        elif c in ("MC", "MCR", "MCL", "ML", "MR"):
            m_cnt += 1
        elif c in ("AMC", "AMCR", "AMCL", "AML", "AMR"):
            am_cnt += 1
            if c in ("AML", "AMR"):
                has_wide_am = True
        elif c in ("ST", "STC", "STCR", "STCL"):
            st_cnt += 1

    total_outfield = d_cnt + wb_cnt + dm_cnt + m_cnt + am_cnt + st_cnt
    if total_outfield < 8:
        return None

    if d_cnt == 4 and wb_cnt == 0 and dm_cnt == 1 and m_cnt == 2 and am_cnt == 2 and st_cnt == 1 and has_wide_am:
        return "4-3-3 DM Wide"
    if d_cnt == 4 and wb_cnt == 0 and dm_cnt == 2 and m_cnt == 0 and am_cnt == 3 and st_cnt == 1:
        return "4-2-3-1 DM AM Wide" if has_wide_am else "4-2-3-1 DM"
    if d_cnt == 4 and wb_cnt == 0 and dm_cnt == 0 and m_cnt == 2 and am_cnt == 3 and st_cnt == 1:
        return "4-2-3-1 Wide" if has_wide_am else "4-2-3-1"

    lines = [c for c in (d_cnt, wb_cnt, dm_cnt, m_cnt, am_cnt, st_cnt) if c > 0]
    return "-".join(str(c) for c in lines) if lines else None


def step_3_3_tactics_and_mentoring() -> str:
    """Step 3/6: Tactics, matchday selections, set pieces & mentoring — managed-club-only tables
    (always runs in both Fast Sync & Full Sync)."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    if save is None:
        elapsed_ms = _record_step_timing("step_3_3_tactics_mentoring", t0)
        return json.dumps({"tactics": 0, "mentoring": 0, "elapsedMs": elapsed_ms})

    player_name_lookup = {int(p["uid"]): str(p["name"]) for p in _STATE.get("players_out", [])}

    # 0. Extract matchday selections (11 starters + substitutes) and set_pieces from tactics_man
    starters_by_zero_idx: dict[int, dict[str, Any]] = {}
    substitutes_list: list[dict[str, Any]] = []
    try:
        sel_fn = getattr(save, "selections", None)
        if callable(sel_fn):
            raw_sel = _safe_call(sel_fn, "selections", default=()) or ()
            raw_starters: dict[int, dict[str, Any]] = {}
            for sel in raw_sel:
                if club_uid is not None and getattr(sel, "club_uid", None) != club_uid:
                    continue
                if getattr(sel, "team_slot", None) not in (None, 0):
                    continue
                s_slot = _int(getattr(sel, "slot", None), None)
                if s_slot is None:
                    continue
                p_uid = _int(getattr(sel, "player_uid", None), None)
                p_name = getattr(sel, "player_name", None) or (
                    player_name_lookup.get(p_uid) if p_uid is not None else None
                )
                is_sub = bool(getattr(sel, "substitute", False))
                entry = {
                    "slot": s_slot,
                    "substitute": is_sub,
                    "playerUid": p_uid,
                    "playerName": p_name,
                }
                if is_sub:
                    substitutes_list.append(entry)
                else:
                    raw_starters[s_slot] = entry
            if raw_starters:
                if 0 in raw_starters:
                    starters_by_zero_idx = dict(raw_starters)
                else:
                    starters_by_zero_idx = {max(0, k - 1): v for k, v in raw_starters.items()}
        if starters_by_zero_idx or substitutes_list:
            _STATE["selections"] = {
                "starters": [starters_by_zero_idx[k] for k in sorted(starters_by_zero_idx)],
                "substitutes": substitutes_list,
            }
    except Exception as exc:
        _STATE["warnings"].append(f"selections: {type(exc).__name__}")

    try:
        sp_fn = getattr(save, "set_pieces", None)
        if callable(sp_fn):
            raw_sp = _safe_call(sp_fn, "set_pieces", default=()) or ()
            named_routines: list[dict[str, Any]] = []
            all_routines: list[dict[str, Any]] = []
            total_sp = 0
            for sp in raw_sp:
                if club_uid is not None and getattr(sp, "club_uid", None) != club_uid:
                    continue
                if getattr(sp, "team_slot", None) not in (None, 0):
                    continue
                total_sp += 1
                r_name = str(getattr(sp, "name", "") or "").strip()
                raw_slot = getattr(sp, "slot", None)
                if raw_slot is None:
                    raw_slot = getattr(sp, "index", None)
                item = {
                    "slot": _int(raw_slot, total_sp - 1),
                    "name": r_name,
                }
                if r_name:
                    named_routines.append(item)
                elif len(all_routines) < 25:
                    all_routines.append(item)
            if total_sp > 0:
                _STATE["set_pieces"] = {
                    "routines": named_routines if named_routines else all_routines,
                    "totalSlots": total_sp,
                }
    except Exception as exc:
        _STATE["warnings"].append(f"set_pieces: {type(exc).__name__}")

    # 1. Club tactics (6s cap, lazy stream, native club_uid filter)
    tactics_out: list[dict[str, Any]] = []
    tac_t0 = time.monotonic()
    tac_timed_out = False

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
            ip_pos_codes: list[str] = []
            oop_pos_codes: list[str] = []
            if isinstance(raw_slots, (list, tuple)):
                slot_seq = list(raw_slots[:11])
                for s_idx, sl in enumerate(slot_seq):
                    explicit_pos = _label(_first_attr(sl, ("position", "slot_position", "pos")))
                    decoded_ip_pos = _decode_tactic_slot_position(
                        getattr(sl, "in_possession_positions", None),
                        _int(getattr(sl, "in_possession_mask", 0), 0) or 0,
                    )
                    sl_pos = explicit_pos or decoded_ip_pos or f"Slot {s_idx + 1}"
                    ip_pos_codes.append(sl_pos)

                    oop_idx = _int(getattr(sl, "out_of_possession_position_index", None), s_idx)
                    oop_ref = (
                        slot_seq[oop_idx]
                        if oop_idx is not None and 0 <= oop_idx < len(slot_seq)
                        else sl
                    )
                    sl_oop_pos = (
                        _decode_tactic_slot_position(
                            getattr(oop_ref, "out_of_possession_positions", None),
                            _int(getattr(oop_ref, "out_of_possession_mask", 0), 0) or 0,
                        )
                        or sl_pos
                    )
                    oop_pos_codes.append(sl_oop_pos)

                    sl_ip = _label(_first_attr(sl, ("in_possession_role", "ip_role", "role", "role_name")))
                    sl_oop = _label(_first_attr(sl, ("out_of_possession_role", "oop_role")))
                    starter_sel = starters_by_zero_idx.get(s_idx) or {}
                    sl_puid = _int(_first_attr(sl, ("player_uid", "person_uid")), None)
                    if sl_puid is None:
                        sl_puid = starter_sel.get("playerUid")
                    sl_pname = (
                        getattr(sl, "player_name", None)
                        or starter_sel.get("playerName")
                        or (player_name_lookup.get(sl_puid) if sl_puid is not None else None)
                    )
                    ip_settings = getattr(sl, "in_possession_settings", None)
                    oop_settings = getattr(sl, "out_of_possession_settings", None)
                    slots_out.append({
                        "slotIndex": s_idx,
                        "position": sl_pos,
                        "outOfPossessionPosition": sl_oop_pos,
                        "outOfPossessionPositionIndex": oop_idx,
                        "inPossessionRole": sl_ip,
                        "outOfPossessionRole": sl_oop,
                        "playerUid": sl_puid,
                        "playerName": sl_pname,
                        "settingCountIp": len(ip_settings) if isinstance(ip_settings, (list, tuple)) else 0,
                        "settingCountOop": len(oop_settings) if isinstance(oop_settings, (list, tuple)) else 0,
                    })
            if ip_form is None:
                ip_form = _derive_formation_from_positions(ip_pos_codes)
            if oop_form is None:
                oop_form = _derive_formation_from_positions(oop_pos_codes)
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
    elapsed_ms = _record_step_timing("step_3_3_tactics_mentoring", t0)
    return json.dumps({
        "tactics": len(_STATE["tactics"]),
        "mentoring": len(_STATE["mentoring"]),
        "elapsedMs": elapsed_ms,
    })


def _extract_club_injuries_fast(
    save: Any,
    club_uid: int | None,
    squad_uids: set[int],
    game_date: Any,
) -> list[dict[str, Any]] | None:
    """Club-scoped direct injury_manager reader: checks squad pindex / club team_id BEFORE
    decoding dates or building 100k global InjuryRecord objects (~0.04s instead of 3.7s)."""
    ctx = getattr(save, "_context", None)
    pindex_map = _STATE.get("squad_pindex_map")
    if ctx is None or not pindex_map:
        return None
    try:
        from fmsave._save import INJURY_MANAGER_SECTION
        from fmsave._scan import decode_date
        from fmsave.readers.injuries import (
            _NO_TEAM,
            _typed_row_fields,
            find_injury_manager_layout,
            walk_injury_manager,
        )

        save_info = ctx.info
        if INJURY_MANAGER_SECTION not in save_info.section_schemas:
            return []
        layout = find_injury_manager_layout(
            save_info.section_schemas.get(INJURY_MANAGER_SECTION), save_info.build
        )
        typed_fields = _typed_row_fields(layout)
        typed_stride = layout.array_strides[layout.typed_array_index]
        unpack_typed = typed_fields.fields_struct.unpack_from
        sel_idx = typed_fields.selector_index
        subj_idx = typed_fields.subject_index

        name_by_type_id: dict[int, str] = {}
        try:
            for it in save.injury_types():
                name_by_type_id[it.id] = it.name
        except Exception:
            pass

        results: list[dict[str, Any]] = []
        seen_keys: set[tuple[Any, str]] = set()
        with ctx.section(INJURY_MANAGER_SECTION) as section:
            walk = walk_injury_manager(section, layout, save_info.file_name)
            for row_idx in range(walk.typed_rows):
                row_off = walk.typed_offset + row_idx * typed_stride
                fv = unpack_typed(section, row_off)
                pidx = fv[sel_idx] - 1
                sp = pindex_map.get(pidx)
                if sp is None:
                    continue
                inj_date = decode_date(section, row_off + layout.date_offset)
                # Typed rows store expected return date; active if return date >= game_date (or within 30d)
                is_active = (
                    (game_date is not None and inj_date is not None and inj_date >= game_date)
                )
                if not is_active:
                    continue
                type_id = fv[subj_idx]
                type_name = name_by_type_id.get(type_id) or "Injury"
                k = (sp.uid, type_name.lower())
                if k in seen_keys:
                    continue
                seen_keys.add(k)
                results.append({
                    "playerUid": sp.uid,
                    "playerName": sp.name,
                    "typeName": type_name,
                    "date": _dmy(inj_date),
                    "severity": None,
                    "cause": None,
                    "kind": "typed",
                })
                if len(results) >= 25:
                    break
        return results
    except Exception:
        return None


def _extract_club_facilities_fast(save: Any, club_uid: int | None) -> dict[str, Any] | None:
    """Club-span direct facilities reader (~0.002s instead of scanning 38k clubs)."""
    ctx = getattr(save, "_context", None)
    if ctx is None or club_uid is None:
        return None
    try:
        from fmsave._save import GAME_DB_SECTION
        from fmsave.readers.facilities import find_facility_layout, read_club_facilities
        from fmsave.readers.finances import find_finance_layouts

        save_info = ctx.info
        game_db_schema = save_info.section_schemas.get(GAME_DB_SECTION)
        with ctx.section(GAME_DB_SECTION) as game_db:
            ci = ctx.club_index()
            spans = ctx.own_club_record_spans()
            our_span = next((sp for sp in spans if sp.club_uid == club_uid), None)
            our_club = ci.club_by_uid.get(club_uid)
            if our_span is None or our_club is None:
                return None

            class _MiniClubs:
                __slots__ = ("clubs",)
                def __init__(self, c: Any) -> None:
                    self.clubs = (c,)

            fin_layouts = find_finance_layouts(game_db_schema, save_info.build).for_clubs(ci)
            fac_layout = find_facility_layout(game_db_schema, save_info.build)
            rows, _stats = read_club_facilities(
                game_db, _MiniClubs(our_club), (our_span,), fin_layouts, fac_layout, True  # type: ignore[arg-type]
            )
            facilities: dict[str, Any] = {}
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
            return facilities
    except Exception:
        return None


def step_3_3_injuries(fast_sync: bool | None = None) -> str:
    """Step 3/6: Injuries — uses direct p.injuries / p.injury read in Step 2/6 first;
    then club-scoped injury_manager fast-path in Full Sync."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    direct_injuries = list(_STATE.get("direct_injuries") or [])
    if use_fast:
        _STATE["active_injuries"] = direct_injuries[:15]
        _record_fast_sync_skip_note()
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
            kind_str = str(getattr(inj, "kind", "") or "").lower()
            if "history" in kind_str or "past" in kind_str:
                continue
            if "current" in kind_str or "active" in kind_str or (not kind_str and game_date and getattr(inj, "date", None) and (game_date - inj.date).days <= 30):
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
                    "kind": kind_str or "current",
                })
                if len(active_injuries) >= 25:
                    break

    if save is not None:
        try:
            fast_inj = _extract_club_injuries_fast(save, club_uid, squad_uids, game_date)
            if fast_inj is not None:
                for item in fast_inj:
                    k = (item.get("playerUid"), str(item.get("typeName") or "").lower())
                    if k not in seen_keys:
                        seen_keys.add(k)
                        active_injuries.append(item)
            else:
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
    elapsed_ms = _record_step_timing("step_3_3_injuries", t0)
    return json.dumps({
        "injuries": len(_STATE["active_injuries"]),
        "skippedGlobal": False,
        "elapsedMs": elapsed_ms,
    })


def step_3_3_facilities(fast_sync: bool | None = None) -> str:
    """Step 3/6: Facilities — Full Sync only; uses club-span direct read (~2ms)."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["facilities"] = {}
        _record_fast_sync_skip_note()
        elapsed_ms = _record_step_timing("step_3_3_facilities", t0)
        return json.dumps({"skipped": True, "elapsedMs": elapsed_ms})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    facilities: dict[str, Any] = {}
    if save is not None and club_uid is not None:
        try:
            fast_fac = _extract_club_facilities_fast(save, club_uid)
            if fast_fac is not None:
                facilities = fast_fac
            else:
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
    elapsed_ms = _record_step_timing("step_3_3_facilities", t0)
    return json.dumps({"skipped": False, "elapsedMs": elapsed_ms})


def step_3_3_competition_rules(fast_sync: bool | None = None) -> str:
    """Stage 3/4 (Full Sync): Competition rules — deferred to Stage 4 step_league_table() on
    real fmsave saves so the 400MB span section is NEVER scanned while game_db is open or scanned twice."""
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
        _STATE["defer_competition_rules"] = False
        _record_fast_sync_skip_note()
        elapsed_ms = _record_step_timing("step_3_3_competition_rules", t0)
        return json.dumps({"skipped": True, "elapsedMs": elapsed_ms})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]

    # On real fmsave saves, competition_rules() lives inside the span section alongside
    # fixtures() and league_tables(). Deferring resolution to step_league_table() avoids
    # overlapping game_db + span in RAM AND eliminates a duplicate 26s full-span scan.
    if save is not None and getattr(save, "_context", None) is not None and ls is None:
        _STATE["competition_rules"] = empty_rules
        _STATE["defer_competition_rules"] = True
        elapsed_ms = _record_step_timing("step_3_3_competition_rules", t0)
        return json.dumps({"skipped": False, "deferred": True, "elapsedMs": elapsed_ms})

    competition_rules = empty_rules
    if save is not None:
        try:
            competition_rules = _extract_typed_competition_rules(save, club_uid, club_div_id, comp_map)
            if not competition_rules.get("competitionName") and ls_comp_name:
                competition_rules["competitionName"] = ls_comp_name
        except Exception as exc:
            _STATE["warnings"].append(f"competition_rules: {type(exc).__name__}")

    _STATE["competition_rules"] = competition_rules
    _STATE["defer_competition_rules"] = False
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
                    win_open = False
                    if isinstance(game_date, date):
                        g_md = (game_date.month, game_date.day)
                        s_md = (sm, sd)
                        e_md = (em, ed)
                        if s_md <= e_md:
                            if s_md <= g_md <= e_md:
                                win_open = True
                                is_open = True
                        else:
                            if g_md >= s_md or g_md <= e_md:
                                win_open = True
                                is_open = True
                    if len(parsed_windows) < 12:
                        ref_year = game_date.year if isinstance(game_date, date) else 2026
                        end_year = ref_year if (sm, sd) <= (em, ed) else ref_year + 1
                        parsed_windows.append({
                            "startDay": sd,
                            "startMonth": sm,
                            "endDay": ed,
                            "endMonth": em,
                            "startDate": f"{ref_year:04d}-{sm:02d}-{sd:02d}",
                            "endDate": f"{end_year:04d}-{em:02d}-{ed:02d}",
                            "isOpen": win_open,
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


def _format_training_session_code(s: Any) -> str:
    raw_code = _int(getattr(s, "raw", getattr(s, "value", s)), None)
    if raw_code is not None and raw_code in FM27_TRAINING_SESSION_CODE_LABELS:
        return FM27_TRAINING_SESSION_CODE_LABELS[raw_code]
    enum_obj = getattr(s, "label", s)
    name_attr = getattr(enum_obj, "name", None)
    if isinstance(name_attr, str) and name_attr and name_attr.upper() != "UNKNOWN" and not name_attr.isdigit():
        return name_attr.replace("_", " ").title()
    lbl = _label(s)
    if lbl and lbl.upper() != "UNKNOWN" and not lbl.isdigit():
        return lbl
    return f"Session {raw_code}" if raw_code is not None else "Rest"


def _extract_typed_team_training(
    save: Any, club_uid: int | None, game_date: date | None
) -> dict[str, Any]:
    """Extract a clean, typed 4-week team training calendar and deduplicated schedule library
    for the managed club's First Team without _to_json_safe depth truncation."""
    tr_fn = getattr(save, "training", None)
    if not callable(tr_fn):
        return {}
    try:
        raw_tr = _safe_call(tr_fn, "training", default=()) or ()
        target_tr = None
        for item in raw_tr:
            if club_uid is not None and getattr(item, "club_uid", None) != club_uid:
                continue
            if getattr(item, "team_slot", None) not in (None, 0):
                continue
            target_tr = item
            break
        if target_tr is None:
            return {}
        if isinstance(target_tr, dict):
            return target_tr

        raw_calendar = getattr(target_tr, "weeks", None)
        if raw_calendar is None:
            raw_calendar = getattr(target_tr, "calendar", None) or ()
        weeks_list = list(raw_calendar)
        selected_weeks = weeks_list[-4:]
        if isinstance(game_date, date) and weeks_list:
            best_idx = 0
            for idx, wk in enumerate(weeks_list):
                wk_start = getattr(wk, "week_start", None) or getattr(wk, "start_date", None)
                if isinstance(wk_start, date) and wk_start <= game_date:
                    best_idx = idx
            start_slice = max(0, best_idx - 1)
            selected_weeks = weeks_list[start_slice : start_slice + 4]

        calendar_out: list[dict[str, Any]] = []
        for wk in selected_weeks:
            days_out: list[dict[str, Any]] = []
            for d in getattr(wk, "days", None) or ():
                d_date = getattr(d, "day", None) or getattr(d, "date", None)
                days_out.append({
                    "date": _iso(d_date) or "",
                    "dateDmy": _dmy(d_date) or "",
                    "sessions": [
                        _format_training_session_code(s)
                        for s in (getattr(d, "sessions", None) or ())
                    ],
                })
            wk_start = getattr(wk, "week_start", None) or getattr(wk, "start_date", None)
            calendar_out.append({
                "startDate": _iso(wk_start) or "",
                "startDateDmy": _dmy(wk_start) or "",
                "scheduleName": str(getattr(wk, "schedule_name", "") or "Custom Schedule"),
                "days": days_out,
            })

        schedules_out: list[dict[str, Any]] = []
        seen_sched: set[tuple[str, str]] = set()
        for sc in getattr(target_tr, "schedule_library", None) or ():
            folder = str(getattr(sc, "folder", "") or "").strip()
            sname = str(getattr(sc, "name", "") or "").strip()
            if not sname or (folder, sname) in seen_sched:
                continue
            seen_sched.add((folder, sname))
            schedules_out.append({
                "folder": folder,
                "name": sname,
            })
            if len(schedules_out) >= 20:
                break

        return {
            "clubUid": _int(getattr(target_tr, "club_uid", None), club_uid),
            "teamSlot": _int(getattr(target_tr, "team_slot", None), 0),
            "teamName": str(getattr(target_tr, "club_name", None) or getattr(target_tr, "team_name", "") or ""),
            "totalWeeks": len(weeks_list),
            "calendar": calendar_out,
            "scheduleLibrary": schedules_out,
        }
    except Exception as exc:
        _STATE["warnings"].append(f"training: {type(exc).__name__}")
        return {}


def _extract_squad_planner(
    save: Any, player_name_lookup: dict[int, str]
) -> list[dict[str, Any]]:
    """Extract multi-season squad planner slots (seasons 0..2, slots 0..26) with resolved player names."""
    sp_fn = getattr(save, "squad_planner", None)
    if not callable(sp_fn):
        return []
    out: list[dict[str, Any]] = []
    try:
        raw_sp = _safe_call(sp_fn, "squad_planner", default=()) or ()
        for item in raw_sp:
            raw_uids = getattr(item, "player_uids", None) or ()
            p_uids = [_int(u, 0) for u in raw_uids if _int(u, None) is not None]
            if not p_uids:
                continue
            p_names = [
                player_name_lookup.get(u) or f"UID {u}"
                for u in p_uids
            ]
            out.append({
                "seasonOffset": _int(getattr(item, "season_offset", None), 0) or 0,
                "slot": _int(getattr(item, "slot", None), 0) or 0,
                "playerUids": p_uids,
                "playerNames": p_names,
            })
    except Exception as exc:
        _STATE["warnings"].append(f"squad_planner: {type(exc).__name__}")
    return out


def step_3_3_secondary_ops(fast_sync: bool | None = None) -> str:
    """Step 3/6: Optional secondary club dumps (sponsorships, selections, set_pieces,
    training, squad_planner, job_vacancies & division benchmarks) — Full Sync only."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["sponsorships"] = []
        if not _STATE.get("selections"):
            _STATE["selections"] = {}
        if not _STATE.get("set_pieces"):
            _STATE["set_pieces"] = {}
        _STATE["training"] = {}
        _STATE["squad_planner"] = []
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
    player_name_lookup = {int(p["uid"]): str(p["name"]) for p in _STATE.get("players_out", [])}

    sponsorships: Any = []
    selections: Any = _STATE.get("selections") or {}
    set_pieces: Any = _STATE.get("set_pieces") or {}
    training: Any = {}
    squad_planner: list[dict[str, Any]] = []
    job_vacancies: Any = []
    division_benchmarks = None

    if save is not None:
        prefetched_sp = _STATE.get("prefetched_sponsorships")
        if prefetched_sp is not None:
            sponsorships = [_to_json_safe(item) for item in prefetched_sp[:25]]
        else:
            sponsorships = _extract_club_scoped_capped(save, club_uid, "sponsorships", [], filter_by_club=True)
        if not selections:
            selections = _extract_club_scoped_capped(save, club_uid, "selections", {}, filter_by_club=True)
        if not set_pieces:
            set_pieces = _extract_club_scoped_capped(save, club_uid, "set_pieces", {}, filter_by_club=True)
        training = _extract_typed_team_training(save, club_uid, _STATE.get("game_date"))
        if not training:
            training = _extract_club_scoped_capped(save, club_uid, "training", {}, filter_by_club=True)
        squad_planner = _extract_squad_planner(save, player_name_lookup)
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
    _STATE["squad_planner"] = squad_planner
    _STATE["job_vacancies"] = job_vacancies if isinstance(job_vacancies, list) else []
    _STATE["division_benchmarks"] = division_benchmarks
    del player_name_lookup

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


def _prefetch_fixture_gamedb_indexes(save: Any) -> None:
    """Capture lightweight stage_index, competition_index, stadium_index, and match_summary_scores
    while game_db is STILL warm in RAM so Stage 4 step_fixtures NEVER re-decompresses game_db."""
    ctx = getattr(save, "_context", None)
    if ctx is None:
        return
    try:
        from fmsave._save import GAME_DB_SECTION
        from fmsave.readers.match_summaries import (
            find_match_summary_layout,
            locate_match_summary_scores,
        )

        save_info = ctx.info
        with ctx.section(GAME_DB_SECTION) as game_db:
            if getattr(ctx, "competition_names", None):
                try:
                    save.competitions()
                except Exception:
                    pass
            _STATE["prefetched_stage_index"] = ctx.stage_index()
            _STATE["prefetched_competition_index"] = ctx.competition_index()
            _STATE["prefetched_stadium_index"] = None
            try:
                _STATE["prefetched_match_summaries"] = locate_match_summary_scores(
                    game_db,
                    find_match_summary_layout(
                        save_info.section_schemas.get(GAME_DB_SECTION), save_info.build
                    ),
                )
            except Exception:
                _STATE["prefetched_match_summaries"] = None
    except Exception:
        pass


def step_3_4_market_scan_and_release_gamedb(fast_sync: bool | None = None) -> str:
    """Step 3/6: Group 4 Free-Agent & Expiring-Contract Market Scan —
    strict 6s cap on desktop, SKIPPED completely when fast_sync=True.
    Always pre-warms lightweight fixture indexes, then releases game_db borrow & heavy caches."""
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

    # Capture stage/stadium/summary indexes while game_db is STILL warm in RAM
    if save is not None:
        _prefetch_fixture_gamedb_indexes(save)

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


def _extract_club_season_stats_fast(save: Any) -> list[Any] | None:
    """Club-scoped direct season_stats reader: decodes ONLY our ~47 managed squad players
    from the season_stats section without re-opening game_db, re-parsing 100k global players,
    or validating 400k other-club records. Returns None if fast-path is unavailable."""
    pindex_map = _STATE.get("squad_pindex_map")
    club_refs = _STATE.get("club_index_refs")
    container_index = getattr(save, "_container_index", None)
    ctx = getattr(save, "_context", None)
    if not pindex_map or not club_refs or container_index is None or ctx is None:
        return None
    try:
        from fmsave.models import PlayerSeasonStats, SeasonStatsKind
        from fmsave.readers.season_stats import (
            _GOALS_POSITION,
            _MINUTES_SINCE_GOAL_POSITION,
            _club_fields,
            _decode,
            _line_readers,
            find_season_stats_layout,
            read_season_stats_section,
        )

        layout = find_season_stats_layout(ctx.info.build)
        body, walk = read_season_stats_section(container_index, layout)
        outfield_reader, goalkeeper_reader = _line_readers(layout)
        slot_kinds = tuple(SeasonStatsKind(kind) for kind in layout.slot_kinds)
        rating_scale = layout.rating_scale
        team_to_club, club_by_uid = club_refs

        rows: list[Any] = []
        keys_seen: set[int] = set()
        for record in walk.records:
            pidx = record.key - 1
            player = pindex_map.get(pidx)
            if player is None or record.key in keys_seen:
                continue
            keys_seen.add(record.key)
            line_reader = goalkeeper_reader if player.goalkeeper else outfield_reader
            teams = [(player.team_id, record.own_lines), *record.other_teams]
            for team_id, team_lines in teams:
                c_uid, c_name, c_short, t_slot = _club_fields(
                    team_id, team_to_club, club_by_uid
                )
                for slot, line in enumerate(team_lines):
                    if line is None:
                        continue
                    kind = slot_kinds[slot]
                    decoded = _decode(body, line, line_reader, rating_scale)
                    minutes_since_goal = decoded.pop(_MINUTES_SINCE_GOAL_POSITION)
                    if kind is not SeasonStatsKind.OVERALL or not decoded[_GOALS_POSITION]:
                        minutes_since_goal = None
                    rows.append(
                        PlayerSeasonStats(
                            player.uid,
                            player.name,
                            kind,
                            team_id,
                            c_uid,
                            c_name,
                            c_short,
                            t_slot,
                            *decoded,
                            minutes_since_last_goal=minutes_since_goal,
                        )
                    )
            if len(keys_seen) >= len(pindex_map):
                break
        return rows
    except Exception:
        return None


def _extract_club_match_stats_fast(save: Any) -> dict[str, list[dict[str, Any]]] | None:
    """Club-scoped direct player_match_stats reader: scans ONLY the ~47 managed squad players'
    byte windows inside game_db instead of regex-scanning 800MB across 100k global players."""
    match_windows = _STATE.get("squad_match_windows")
    club_refs = _STATE.get("club_index_refs")
    ctx = getattr(save, "_context", None)
    game_date = _STATE.get("game_date")
    if not match_windows or not club_refs or ctx is None or game_date is None:
        return None
    try:
        from fmsave._save import GAME_DB_SECTION
        from fmsave._scan import decode_date
        from fmsave.readers.matches import (
            MISSING_REFERENCE,
            _match_search,
            _read_match_record,
            find_match_record_layout,
        )

        save_info = ctx.info
        layout = find_match_record_layout(
            save_info.section_schemas.get(GAME_DB_SECTION), save_info.build
        )
        if not layout.nonempty_supported:
            return {}
        search = _match_search(layout, game_date.year)
        team_to_club, club_by_uid = club_refs
        rating_scale = layout.rating_scale

        out: dict[str, list[dict[str, Any]]] = {}

        def _walk_child_local(game_db: bytes, first_at: int, count: int, end: int):
            if count > (end - first_at) // search.header_bytes:
                return None
            at = first_at
            recs = []
            for _ in range(count):
                decoded = _read_match_record(game_db, at, search, end)
                if decoded is None:
                    return None
                rec, size = decoded
                at += size
                if (
                    game_date.year - layout.years_before_clock
                    <= rec.date.year
                    <= game_date.year + layout.years_after_clock
                    and search.lowest_team_id <= rec.opponent_team_id <= search.highest_team_id
                    and search.lowest_competition_id <= rec.competition_id <= search.highest_competition_id
                ):
                    recs.append(rec)
            return recs, at

        with ctx.section(GAME_DB_SECTION) as game_db:
            db_len = len(game_db)
            for _pos_idx, (cur_off, nxt_off, p_uid, _sp) in match_windows.items():
                owned_start = max(0, cur_off - search.owner_back_offset)
                end = (
                    max(owned_start, nxt_off - search.owner_back_offset)
                    if nxt_off >= 0
                    else db_len
                )
                cursor = owned_start
                player_recs = []
                while cursor < end:
                    hit = search.parent_pattern.search(game_db, cursor, end)
                    if hit is None:
                        break
                    parent_at = hit.start()
                    cursor = parent_at + 1
                    list_at = parent_at + layout.parent_header_bytes
                    first_at = list_at + search.list_header_bytes
                    if first_at + search.header_bytes > end:
                        continue
                    if decode_date(game_db, first_at + search.date_offset) is None:
                        continue
                    first_header = search.header_struct.unpack_from(game_db, first_at)
                    if not (
                        search.lowest_team_id
                        <= first_header[search.opponent_team_id_index]
                        <= search.highest_team_id
                    ):
                        continue
                    first_comp = first_header[search.competition_id_index]
                    if not (
                        0 <= first_comp <= search.highest_competition_id
                        or first_comp == MISSING_REFERENCE
                    ):
                        continue
                    child_count = game_db[parent_at + layout.parent_count_offset]
                    recs_batch = []
                    ok = True
                    for _ in range(child_count):
                        if (
                            list_at + search.list_header_bytes > end
                            or game_db[list_at : list_at + 2] not in layout.list_markers
                        ):
                            ok = False
                            break
                        _team, cnt = search.list_header_struct.unpack_from(game_db, list_at)
                        if cnt == 0:
                            ok = False
                            break
                        walked = _walk_child_local(
                            game_db, list_at + search.list_header_bytes, cnt, end
                        )
                        if walked is None:
                            ok = False
                            break
                        child_recs, list_at = walked
                        recs_batch.extend(child_recs)
                        cursor = list_at
                    if ok and recs_batch:
                        cursor = list_at
                        player_recs.extend(recs_batch)

                season_start = (
                    date(game_date.year if game_date.month >= 7 else game_date.year - 1, 7, 1)
                    if game_date is not None
                    else None
                )
                comp_name_map = _STATE.get("comp_name_by_id") or {}
                uid_key = str(p_uid)
                for rec in player_recs:
                    if not getattr(rec, "has_stats", True):
                        continue
                    if season_start is not None and getattr(rec, "date", None) is not None and rec.date < season_start:
                        continue
                    comp_id = getattr(rec, "competition_id", None)
                    if comp_id == MISSING_REFERENCE:
                        continue
                    comp_name_lower = str(comp_name_map.get(comp_id, "") or "").lower()
                    if any(tok in comp_name_lower for tok in ("friendly", "non-comp", "non_comp", "reserve", "u21", "u19", "u18", "youth", "international")):
                        continue
                    raw_rating = getattr(rec, "rating_raw", None)
                    if raw_rating is None:
                        raw_rating = getattr(rec, "rating", None)
                    if raw_rating is None or raw_rating <= 0:
                        continue
                    rating_v = (
                        float(raw_rating) / float(rating_scale)
                        if (rating_scale and raw_rating > 10)
                        else float(raw_rating)
                    )
                    if rating_v <= 0 or rating_v > 10.5:
                        continue
                    opp_name = ""
                    opp_entry = team_to_club.get(rec.opponent_team_id)
                    if opp_entry is not None:
                        opp_club = club_by_uid.get(opp_entry[0])
                        if opp_club is not None:
                            opp_name = getattr(opp_club, "name", None) or getattr(opp_club, "short_name", None) or ""
                    out.setdefault(uid_key, []).append({
                        "date": _iso(rec.date) or "",
                        "rating": round(rating_v, 2),
                        "goals": _int(getattr(rec, "goals", None), 0) or 0,
                        "assists": _int(getattr(rec, "assists", None), 0) or 0,
                        "opponent": str(opp_name),
                        "minutes": _int(getattr(rec, "minutes", None), 0) or 0,
                        "_compId": comp_id,
                    })
        return out
    except Exception:
        return None


def _normalize_stat_kind(raw_kind: Any) -> str:
    val = str(getattr(raw_kind, "value", raw_kind) or "").lower().strip()
    if "." in val:
        val = val.rsplit(".", 1)[-1]
    return val


def _format_season_label(year: Any) -> str:
    y = _int(year, None)
    if y is not None and 1990 <= y <= 2100:
        return f"{y}/{str(y + 1)[-2:]}"
    return str(year) if year else "Season"


def _aggregate_competitive_season_history(
    raw_rows: list[tuple[int, str, str, int, int, int, int, float]]
) -> list[dict[str, Any]]:
    """Merge competitive history rows (league/cup/continental) per (year, club),
    excluding friendlies/non-competitive, youth/reserve, international, and calendar-year rows."""
    by_key: dict[tuple[int, str], dict[str, Any]] = {}
    for year_num, club_name, kind_val, apps, rated_apps, goals, assists, avg_rat in raw_rows:
        if any(
            tok in kind_val
            for tok in (
                "friendly",
                "non_competitive",
                "non-comp",
                "non_comp",
                "calendar_year",
                "international",
                "reserve",
                "u21",
                "u19",
                "u18",
                "youth",
            )
        ):
            continue
        if apps <= 0:
            continue
        key = (year_num, club_name)
        is_overall = kind_val in ("overall", "competitive")
        existing = by_key.get(key)
        weight = rated_apps if rated_apps > 0 else apps
        if existing is None:
            by_key[key] = {
                "year": year_num,
                "season": _format_season_label(year_num),
                "club": club_name,
                "apps": apps,
                "goals": goals,
                "assists": assists,
                "ratingSum": (avg_rat * weight) if avg_rat > 0 else 0.0,
                "ratingWeight": weight if avg_rat > 0 else 0,
                "isOverall": is_overall,
            }
        elif is_overall and not existing["isOverall"]:
            by_key[key] = {
                "year": year_num,
                "season": _format_season_label(year_num),
                "club": club_name,
                "apps": apps,
                "goals": goals,
                "assists": assists,
                "ratingSum": (avg_rat * weight) if avg_rat > 0 else 0.0,
                "ratingWeight": weight if avg_rat > 0 else 0,
                "isOverall": True,
            }
        elif not existing["isOverall"]:
            existing["apps"] += apps
            existing["goals"] += goals
            existing["assists"] += assists
            if avg_rat > 0:
                existing["ratingSum"] += avg_rat * weight
                existing["ratingWeight"] += weight

    merged = sorted(by_key.values(), key=lambda r: (-r["year"], -r["apps"], r["club"]))
    return [
        {
            "season": r["season"],
            "club": r["club"],
            "apps": r["apps"],
            "goals": r["goals"],
            "assists": r["assists"],
            "avgRating": round(r["ratingSum"] / r["ratingWeight"], 2) if r["ratingWeight"] > 0 else 0.0,
        }
        for r in merged
    ]


def _extract_club_season_history_fast(save: Any) -> dict[str, list[dict[str, Any]]] | None:
    """Club-scoped direct player_season_history reader: decodes ONLY our ~47 managed squad
    players' history lists from the archive section without re-opening game_db or validating
    500,000 global archive units."""
    players_by_uid = _STATE.get("squad_season_players_by_uid")
    selectors = _STATE.get("squad_history_selectors")
    omitted_selectors = _STATE.get("squad_omitted_history_selectors") or frozenset()
    club_refs = _STATE.get("club_index_refs")
    container_index = getattr(save, "_container_index", None)
    ctx = getattr(save, "_context", None)
    if (
        not players_by_uid
        or not selectors
        or not club_refs
        or container_index is None
        or ctx is None
    ):
        return None
    try:
        from fmsave._save import ARCHIVE_SECTION
        from fmsave.models import SeasonStatsKind
        from fmsave.readers.season_history import (
            _ABSENT,
            _METADATA,
            find_history_layout,
            read_history_index,
        )
        from fmsave.readers.season_stats import (
            _club_fields as season_club_fields,
            decode_season_line,
            find_season_stats_layout,
        )

        if ARCHIVE_SECTION not in container_index.sections:
            return {}
        layout = find_history_layout(ctx.info.build)
        stat_layout = find_season_stats_layout(ctx.info.build)
        index = read_history_index(container_index, layout)
        header_bytes = len(layout.archive_header)
        kinds = tuple(SeasonStatsKind(name) for name in layout.kind_names)
        team_to_club, club_by_uid = club_refs

        out: dict[str, list[dict[str, Any]]] = {}
        with ctx.section(ARCHIVE_SECTION) as archive:
            if not archive.startswith(layout.archive_header):
                return None
            arch_len = len(archive)
            for uid, player in players_by_uid.items():
                selector = selectors.get(uid, _ABSENT)
                if (
                    selector == _ABSENT
                    or selector in omitted_selectors
                    or not (0 <= selector < len(index.lists))
                ):
                    continue
                offsets = index.lists[selector]
                if not offsets:
                    continue
                uid_key = str(uid)
                raw_rows: list[tuple[int, str, str, int, int, int, int, float]] = []
                for offset in offsets:
                    at = header_bytes + offset
                    if at + 152 > arch_len:
                        continue
                    kind_idx = archive[at + 31]
                    kind_val = (
                        _normalize_stat_kind(kinds[kind_idx])
                        if kind_idx < len(kinds)
                        else ""
                    )
                    team_id, _comp, _unk, year = _METADATA.unpack_from(archive, at + 1)
                    team_id = None if team_id == _ABSENT else team_id
                    _c_uid, c_name, _c_short, _t_slot = season_club_fields(
                        team_id, team_to_club, club_by_uid
                    )
                    line = bytearray(stat_layout.line_bytes)
                    line[:2] = stat_layout.line_marker
                    line[2:6] = archive[at + 13 : at + 17]
                    line[6:11] = archive[at + 24 : at + 29]
                    line[11:14] = archive[at + 17 : at + 20]
                    line[14] = archive[at + 29]
                    line[15:19] = archive[at + 20 : at + 24]
                    line[19:139] = archive[at + 32 : at + 152]
                    decoded = decode_season_line(bytes(line), 0, player.goalkeeper, stat_layout)
                    # decoded tuple starts with: starts, substitute_appearances, minutes, rated_appearances, average_rating, potm, goals, assists, ...
                    starts = _int(decoded[0], 0) or 0
                    subs = _int(decoded[1], 0) or 0
                    rated_apps = _int(decoded[3], 0) or 0
                    avg_rat = _float(decoded[4], 0.0) or 0.0
                    goals = _int(decoded[6], 0) or 0
                    assists = _int(decoded[7], 0) or 0
                    raw_rows.append((
                        _int(year, 0) or 0,
                        str(c_name or "Club"),
                        kind_val,
                        starts + subs,
                        rated_apps,
                        goals,
                        assists,
                        avg_rat,
                    ))
                merged = _aggregate_competitive_season_history(raw_rows)
                if merged:
                    out[uid_key] = merged
        return out
    except Exception:
        return None


def step_4_1_season_stats(fast_sync: bool | None = None) -> str:
    """Stage 4 (Full Sync): Season stats — uses club-scoped direct decode (~47 players,
    < 1s, zero game_db re-open) with graceful fallback to lazy stream on test stubs.
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
        row_team_slot = getattr(row, "team_slot", None)
        if row_team_slot not in (None, 0):
            return
        if _STATE.get("first_team_id") is None and row_team_slot in (None, 0):
            tid = _int(getattr(row, "team_id", None), None)
            if tid:
                _STATE["first_team_id"] = tid
        kind_val = _normalize_stat_kind(getattr(row, "kind", ""))
        if any(
            tok in kind_val
            for tok in (
                "friendly",
                "non_competitive",
                "non-comp",
                "non_comp",
                "reserve",
                "u21",
                "u19",
                "u18",
                "youth",
                "calendar_year",
                "international",
            )
        ):
            return
        if kind_val in ("overall", "competitive"):
            kind_priority = 2
        elif "league" in kind_val:
            kind_priority = 1
        elif kind_val in ("cup", "continental"):
            kind_priority = 0
        else:
            return

        row_year = _row_season_year(row)
        if current_season_year is not None and row_year > 0 and row_year < current_season_year:
            return

        new_mins = int(getattr(row, "minutes", 0) or 0)
        if kind_priority == 2 and new_mins > 0 and (current_season_year is None or row_year == current_season_year):
            league_matched_uids.add(int(p_uid))

        existing = best_by_uid.get(p_uid)
        if existing is None:
            best_by_uid[p_uid] = (row_year, kind_priority, row)
            return

        ex_year, ex_priority, ex_row = existing
        old_mins = int(getattr(ex_row, "minutes", 0) or 0)
        if row_year > ex_year:
            best_by_uid[p_uid] = (row_year, kind_priority, row)
        elif row_year == ex_year:
            if new_mins > 0 and old_mins == 0:
                best_by_uid[p_uid] = (row_year, kind_priority, row)
            elif new_mins == 0 and old_mins > 0:
                return
            elif kind_priority > ex_priority:
                best_by_uid[p_uid] = (row_year, kind_priority, row)
            elif kind_priority == ex_priority:
                if row_year > 0:
                    if new_mins > old_mins:
                        best_by_uid[p_uid] = (row_year, kind_priority, row)
                else:
                    if game_date and game_date.month in (7, 8, 9, 10) and old_mins > 900 and 0 < new_mins <= 900:
                        best_by_uid[p_uid] = (row_year, kind_priority, row)
                    elif new_mins > old_mins:
                        best_by_uid[p_uid] = (row_year, kind_priority, row)

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
        fast_rows = _extract_club_season_stats_fast(save)
        if fast_rows is not None:
            for row in fast_rows:
                _consume_stat_row(row)
        else:
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
    _reconcile_player_match_stats_with_season_stats()
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


def _reconcile_player_match_stats_with_season_stats() -> dict[str, list[dict[str, Any]]]:
    """Strip 0-minute players' Last-5 ratings and non-competitive competition IDs once
    competitive season stats are available, without needing a second game_db pass."""
    raw_stats = _STATE.get("player_match_stats_raw")
    if not isinstance(raw_stats, dict):
        return _STATE.get("player_match_stats") or {}

    players_out = _STATE.get("players_out") or []
    season_mins_by_uid = {str(p["uid"]): int(p.get("minutes") or 0) for p in players_out}
    any_squad_season_stats = any(m > 0 for m in season_mins_by_uid.values())
    non_comp_ids: set[int] = set()
    if any_squad_season_stats:
        club_div_id = _STATE.get("club_division_id")
        comp_name_map = _STATE.get("comp_name_by_id") or {}
        for uid_key, items in raw_stats.items():
            if season_mins_by_uid.get(uid_key, 0) == 0:
                for it in items:
                    cid = it.get("_compId")
                    if cid is not None and cid != club_div_id and cid not in comp_name_map:
                        non_comp_ids.add(cid)

    cleaned_match_stats: dict[str, list[dict[str, Any]]] = {}
    for uid_key, items in raw_stats.items():
        if any_squad_season_stats and season_mins_by_uid.get(uid_key, 0) == 0:
            continue
        filtered = []
        for it in items:
            cid = it.get("_compId")
            if cid is not None and cid in non_comp_ids:
                continue
            clean_item = {k: v for k, v in it.items() if k != "_compId"}
            filtered.append(clean_item)
        if filtered:
            filtered.sort(key=lambda x: x.get("date") or "")
            cleaned_match_stats[uid_key] = filtered[-5:]

    for p in players_out:
        uid_key = str(p["uid"])
        if uid_key in cleaned_match_stats:
            p["last5Ratings"] = cleaned_match_stats[uid_key]
        else:
            p.pop("last5Ratings", None)

    _STATE["player_match_stats"] = cleaned_match_stats
    if any_squad_season_stats:
        _STATE.pop("player_match_stats_raw", None)
    return cleaned_match_stats


def step_4_2_player_match_stats(fast_sync: bool | None = None) -> str:
    """Step 4/6 (2/4): Club-scoped player_match_stats (Last-5 Form ratings) —
    uses club-scoped byte-window direct decode (~47 players) with lazy-stream fallback.
    Skipped immediately when fast_sync=True."""
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _STATE["player_match_stats"] = {}
        _STATE.pop("player_match_stats_raw", None)
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_2_player_match_stats"] = 0
        gc.collect()
        return json.dumps({"skipped": True, "formPlayers": 0, "elapsedSec": 0.0, "elapsedMs": 0, "timedOut": False})

    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    t0 = time.monotonic()
    if not squad_uids or save is None:
        return json.dumps({"skipped": False, "formPlayers": 0, "elapsedSec": 0.0, "timedOut": False})

    player_match_stats: dict[str, list[dict[str, Any]]] = {}
    timed_out = False
    warning_msg: str | None = None
    game_date = _STATE.get("game_date")
    season_start = (
        date(game_date.year if game_date.month >= 7 else game_date.year - 1, 7, 1)
        if isinstance(game_date, date)
        else None
    )
    comp_name_map = _STATE.get("comp_name_by_id") or {}
    _NON_COMP_TOKENS = (
        "friendly",
        "non-comp",
        "non_comp",
        "non_competitive",
        "reserve",
        "u21",
        "u19",
        "u18",
        "youth",
        "international",
    )

    def _consume_pms(stat: Any) -> None:
        p_uid = _int(getattr(stat, "player_uid", None))
        if p_uid not in squad_uids:
            return
        if not getattr(stat, "has_stats", True):
            return
        stat_date = getattr(stat, "date", None)
        if season_start is not None and isinstance(stat_date, date) and stat_date < season_start:
            return
        is_comp = getattr(stat, "is_competitive", True)
        kind_str = str(getattr(stat, "kind", "")).lower()
        comp_id = getattr(stat, "competition_id", None)
        comp_name_lower = str(
            getattr(stat, "competition_name", None)
            or comp_name_map.get(comp_id, "")
            or ""
        ).lower()
        if (
            not is_comp
            or any(tok in kind_str for tok in _NON_COMP_TOKENS)
            or any(tok in comp_name_lower for tok in _NON_COMP_TOKENS)
        ):
            return
        rating_v = _float(getattr(stat, "rating", None) or getattr(stat, "match_rating", None), None)
        if rating_v is None or rating_v <= 0:
            return
        opp_name = (
            getattr(stat, "opponent_club_name", None)
            or getattr(stat, "opponent_club_short_name", None)
            or getattr(stat, "opponent_name", None)
            or ""
        )
        uid_key = str(p_uid)
        player_match_stats.setdefault(uid_key, []).append({
            "date": _iso(stat_date) or "",
            "rating": round(rating_v, 2),
            "goals": _int(getattr(stat, "goals", None), 0) or 0,
            "assists": _int(getattr(stat, "assists", None), 0) or 0,
            "opponent": str(opp_name),
            "minutes": _int(getattr(stat, "minutes", None), 0) or 0,
            "_compId": comp_id,
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
        fast_pms = _extract_club_match_stats_fast(save)
        if fast_pms is not None:
            player_match_stats = fast_pms
        else:
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

    _STATE["player_match_stats_raw"] = player_match_stats
    cleaned = _reconcile_player_match_stats_with_season_stats()
    form_count = len(cleaned)
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
    """Step 4/6 (3/4): Club-scoped player_season_history — uses direct archive decode
    (~47 players, < 1s, zero game_db re-open) with lazy-stream fallback.
    Skipped immediately when fast_sync=True."""
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
        raw_by_uid: dict[str, list[tuple[int, str, str, int, int, int, int, float]]] = {}
        for h in stream:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - t0) >= SEASON_HISTORY_BUDGET_SEC:
                timed_out = True
                break
            p_uid = _int(getattr(h, "player_uid", None))
            if p_uid not in squad_uids:
                continue
            uid_key = str(p_uid)
            kind_val = _normalize_stat_kind(getattr(h, "kind", ""))
            apps_val = _int(getattr(h, "apps", None) or getattr(h, "appearances", None), None)
            if apps_val is None:
                apps_val = (_int(getattr(h, "starts", None), 0) or 0) + (_int(getattr(h, "substitute_appearances", None), 0) or 0)
            rated_apps = _int(getattr(h, "rated_appearances", None), 0) or 0
            raw_yr = getattr(h, "season_year", None) or getattr(h, "year", None) or getattr(h, "season", None)
            yr_num = _int(str(raw_yr)[:4], 0) if raw_yr is not None else 0
            raw_by_uid.setdefault(uid_key, []).append((
                yr_num or 0,
                str(getattr(h, "club_name", None) or "Club"),
                kind_val,
                apps_val,
                rated_apps,
                _int(getattr(h, "goals", None), 0) or 0,
                _int(getattr(h, "assists", None), 0) or 0,
                _float(getattr(h, "avg_rating", None) or getattr(h, "average_rating", None), 0.0) or 0.0,
            ))
        for uid_key, rlist in raw_by_uid.items():
            merged = _aggregate_competitive_season_history(rlist)
            if merged:
                season_history[uid_key] = merged

    try:
        fast_psh = _extract_club_season_history_fast(save)
        if fast_psh is not None:
            season_history = fast_psh
        elif _IS_PYODIDE:
            # On browser Pyodide, falling back to a full global stream scan of
            # player_season_history can exceed the 300s ceiling on large saves.
            warning_msg = (
                "player_season_history: skipped slow global fallback in browser mode "
                "(preserved squad & all other tables)"
            )
            _STATE["warnings"].append(warning_msg)
        else:
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

    # In real fmsave, players(), contracts(), and suspensions() come from ONE unified decode
    # pass in step_players(), so p.contract and p.suspensions already contain 100% of squad
    # contracts and suspensions. Calling save.contracts()/save.suspensions() after step_3_4
    # evicted the player cache would re-parse all 100k+ global players (~42s) for zero new data.
    if _STATE.get("club_index_refs") is not None and not _STATE.get("suspensions_hint_uids"):
        elapsed_ms = _record_step_timing("step_4_4_contracts_and_suspensions", t0)
        return json.dumps({
            "contractsEnriched": 0,
            "suspensionsCount": len(_STATE.get("active_suspensions", [])),
            "elapsedSec": round(time.monotonic() - t0, 2),
            "elapsedMs": elapsed_ms,
            "timedOut": False,
            "warnings": [],
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
        # Release game_db borrow before span streaming so game_db and span never overlap in RAM.
        _exit_game_db_borrow()
        fast_fixtures = _extract_club_fixtures_fast(save, club_uid)
        if fast_fixtures is not None:
            club_fixtures = fast_fixtures
        else:
            gc.collect()
            try:
                fix_table = save.fixtures()
                # Start the iteration cap AFTER save.fixtures() finishes decompressing/building
                # the table; 45s cap ensures multi-season saves capture all home & away fixtures.
                t_scan = time.monotonic()
                seen = 0
                for f in fix_table:
                    seen += 1
                    if (seen & 511) == 0 and (time.monotonic() - t_scan) > FIXTURES_SCAN_BUDGET_SEC:
                        _STATE["warnings"].append(f"fixtures: {FIXTURES_SCAN_BUDGET_SEC:.0f}s time cap reached")
                        break
                    is_home = (
                        getattr(f, "home_club_uid", None) == club_uid
                        and getattr(f, "home_team_slot", None) in (None, 0)
                    )
                    is_away = (
                        getattr(f, "away_club_uid", None) == club_uid
                        and getattr(f, "away_team_slot", None) in (None, 0)
                    )
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
    elapsed_ms = _record_step_timing("step_5_fixtures", step_t0)

    return json.dumps({
        "playedCount": len(_STATE["played_matches"]),
        "upcomingCount": len(_STATE["upcoming_fixtures"]),
        "teamMatchStatsCount": len(_STATE["team_match_stats"]),
        "elapsedMs": elapsed_ms,
    })


def _extract_club_fixtures_fast(save: Any, club_uid: int | None) -> list[Any] | None:
    """Club-scoped direct fixture extractor: streams span ONCE, filters 123k raw fixtures down
    to ONLY our managed club's ~40 first-team matches BEFORE constructing Fixture objects, and
    attaches exact scores via save._scored_fixtures() using pre-warmed match_summary_scores
    (zero second game_db decompression)."""
    ctx = getattr(save, "_context", None)
    if ctx is None or club_uid is None:
        return None
    try:
        from fmsave._frozen import FrozenMapping
        from fmsave._layouts import FixtureCalendarLayout, find_layout
        from fmsave._save import SPAN_REGION
        from fmsave._scan import decode_date
        from fmsave.models.fixtures import Fixture
        from fmsave.readers.fixtures import (
            _DATE_WORDS,
            _club_fields,
            _split_span,
            kick_off_time_of,
        )
        from fmsave.readers.results import find_result_layout

        save_info = ctx.info
        club_index = ctx.club_index()
        stage_index = _STATE.get("prefetched_stage_index") or ctx.stage_index()
        competition_index = _STATE.get("prefetched_competition_index") or ctx.competition_index()
        stadium_index = _STATE.get("prefetched_stadium_index")
        summaries = _STATE.get("prefetched_match_summaries")
        calendar = find_layout(FixtureCalendarLayout, SPAN_REGION, None, save_info.build)
        layout = calendar.layout

        span_records = ctx.span_records()
        cache_offsets = frozenset(span_records.fixture_cache_offsets)
        split_span = _split_span(span_records.fixtures, layout.cluster_gap_bytes, cache_offsets)
        kept_records = split_span.kept
        if kept_records:
            anchor_offsets = {record.span_offset for record in kept_records}
            recovered: dict[int, Any] = {}
            for continuation in span_records.fixture_continuations:
                if (
                    continuation.left_offset in anchor_offsets
                    and continuation.right_offset in anchor_offsets
                ):
                    for record in continuation.fixtures:
                        if (
                            continuation.left_offset < record.span_offset < continuation.right_offset
                            and record.span_offset not in cache_offsets
                        ):
                            recovered.setdefault(record.span_offset, record)
            for anchor in kept_records:
                recovered.pop(anchor.span_offset, None)
            if recovered:
                kept_records = tuple(
                    sorted((*kept_records, *recovered.values()), key=lambda r: r.span_offset)
                )

        # Save kept_records for step_league_table() competition voting (cleared after step_league_table)
        _STATE["span_kept_fixtures"] = kept_records

        team_to_club = club_index.team_to_club
        club_by_uid = club_index.club_by_uid
        stage_by_id = stage_index.stage_by_id
        name_for = competition_index.name_for
        uid_by_ordinal = stadium_index.uid_by_ordinal if stadium_index is not None else {}
        name_by_ordinal = (
            {row.ordinal: row.name for row in stadium_index.rows if row.name is not None}
            if stadium_index is not None
            else {}
        )
        round_index_none_value = layout.round_index_none_value

        # Build set of first-team (slot 0 / None) team IDs for our club
        first_team_ids: set[int] = set()
        first_tid = _STATE.get("first_team_id")
        if first_tid is not None:
            first_team_ids.add(int(first_tid))
        for tid, entry in team_to_club.items():
            if entry and entry[0] == club_uid and entry[1] in (None, 0):
                first_team_ids.add(int(tid))
        if not first_team_ids:
            first_team_ids = set(_STATE.get("club_team_ids") or _resolve_club_team_ids(club_index, club_uid))
        if not first_team_ids:
            return None

        # Filter to ONLY our club's fixtures before constructing Fixture dataclasses
        club_raw = [
            rec for rec in kept_records
            if rec.home_team_id in first_team_ids or rec.away_team_id in first_team_ids
        ]

        played_by_offset: dict[int, bool | None] = {}
        club_raw_offsets = {rec.span_offset for rec in club_raw}
        for presence in span_records.fixture_presence:
            if presence.span_offset not in club_raw_offsets:
                continue
            if (
                presence.span_offset in played_by_offset
                and played_by_offset[presence.span_offset] != presence.played
            ):
                played_by_offset[presence.span_offset] = None
            else:
                played_by_offset[presence.span_offset] = presence.played

        built_pairs: list[tuple[Any, int]] = []
        for raw_fixture in club_raw:
            kick_off_date = decode_date(
                _DATE_WORDS.pack(raw_fixture.packed_kick_off, raw_fixture.kick_off_year), 0
            )
            kick_off_time = kick_off_time_of(raw_fixture.packed_kick_off, layout)
            home_club = team_to_club.get(raw_fixture.home_team_id)
            away_club = team_to_club.get(raw_fixture.away_team_id)
            home_uid, home_name, home_short_name, home_slot = _club_fields(home_club, club_by_uid)
            away_uid, away_name, away_short_name, away_slot = _club_fields(away_club, club_by_uid)
            is_home = home_uid == club_uid and home_slot in (None, 0)
            is_away = away_uid == club_uid and away_slot in (None, 0)
            if not (is_home or is_away):
                continue
            stage_id = raw_fixture.stage_id
            stage = None if stage_id is None else stage_by_id.get(stage_id)
            competition_id = None if stage is None else stage.competition_id
            owned_played = played_by_offset.get(raw_fixture.span_offset)
            played = raw_fixture.played if owned_played is None else owned_played
            stored_round_index = raw_fixture.round_index
            stadium_ordinal = raw_fixture.stadium_ordinal
            fx = Fixture(
                stage_id=stage_id,
                competition_id=competition_id,
                competition_name=name_for(competition_id),
                round=None if stage is None else stage.round,
                round_index=(
                    None if stored_round_index == round_index_none_value else stored_round_index
                ),
                date=kick_off_date,
                kick_off_time=kick_off_time,
                season_start_year=raw_fixture.season_start_year,
                home_team_id=raw_fixture.home_team_id,
                home_club_uid=home_uid,
                home_club_name=home_name,
                home_club_short_name=home_short_name,
                home_team_slot=home_slot,
                away_team_id=raw_fixture.away_team_id,
                away_club_uid=away_uid,
                away_club_name=away_name,
                away_club_short_name=away_short_name,
                away_team_slot=away_slot,
                home_goals=None,
                away_goals=None,
                played=played,
                is_neutral_venue=None,
                stadium_uid=(
                    None if stadium_ordinal is None else uid_by_ordinal.get(stadium_ordinal)
                ),
                stadium_name=(
                    None if stadium_ordinal is None else name_by_ordinal.get(stadium_ordinal)
                ),
                referee_id=raw_fixture.referee_id if played and calendar.exact else None,
                match_rules_template=raw_fixture.match_rules_template,
                unknown=FrozenMapping({
                    "date2": raw_fixture.date2,
                    "phase": raw_fixture.phase,
                    "leg": raw_fixture.leg,
                    "r39_42": raw_fixture.r39_42,
                    "r47_54": raw_fixture.r47_54,
                }),
            )
            built_pairs.append((fx, raw_fixture.span_offset))

        built_pairs.sort(
            key=lambda pair: (
                pair[0].date or date(1900, 1, 1),
                pair[0].kick_off_time or dt_time(0, 0),
                pair[1],
            )
        )
        if not built_pairs:
            return []

        fixtures_tuple = tuple(p[0] for p in built_pairs)
        offsets_tuple = tuple(p[1] for p in built_pairs)
        scored, _res_stats = save._scored_fixtures(
            fixtures_tuple,
            span_records,
            stage_index,
            find_result_layout(save_info.build),
            summaries=summaries,
            fixture_offsets=offsets_tuple,
        )
        return list(scored)
    except Exception:
        return None


def _extract_club_team_match_stats_fast(save: Any, first_team_id: int | None) -> list[Any] | None:
    """Club-scoped direct team_match_stats reader: checks header.home_team_id/away_team_id
    immediately before running regex squad framing & stat decoding (~0.8s instead of 14.1s)."""
    ctx = getattr(save, "_context", None)
    if ctx is None or first_team_id is None:
        return None
    try:
        from collections import Counter
        from fmsave._layouts import MatchReportLayout, find_layout
        from fmsave._save import MATCH_REPORTS_SECTION
        from fmsave.models.team_match_stats import TeamMatchStats
        from fmsave.readers.team_match_stats import (
            _decompress,
            _header,
            _possession,
            _shares_half_up,
            _squads,
            _team_values,
            index_entries,
        )

        info = ctx.info
        schema = info.section_schemas.get(MATCH_REPORTS_SECTION)
        if schema is None:
            return []
        match = find_layout(MatchReportLayout, MATCH_REPORTS_SECTION, schema, info.build)
        layout = match.layout
        seed_pattern = re.compile(b"(?=" + re.escape(layout.anchor_run) + b")")
        check_borrowed = not match.exact or not info.known_build

        with ctx.section(MATCH_REPORTS_SECTION) as section:
            entries = index_entries(section, layout, info.file_name, check_borrowed=check_borrowed)
            view = memoryview(section)
            framed: list[tuple[Any, bool, dict[str, Any], dict[str, Any]]] = []
            key_counts: Counter[Any] = Counter()

            for start, size in entries:
                report = _decompress(view[start : start + size], layout)
                if report is None:
                    continue
                header = _header(report, layout)
                if header is None:
                    continue
                # Skip all non-club matches BEFORE expensive regex squad framing & stat decoding!
                if header.home_team_id != first_team_id and header.away_team_id != first_team_id:
                    continue
                record_layout = next(
                    (cand for prefix, cand in layout.record_variants if report.startswith(prefix)),
                    layout,
                )
                squads = _squads(report, record_layout, seed_pattern)
                if squads is None:
                    continue
                try:
                    home = _team_values(report, squads.home, squads.detailed, record_layout)
                    away = _team_values(report, squads.away, squads.detailed, record_layout)
                except struct.error:
                    continue
                key_counts[header] += 1
                framed.append((header, squads.detailed, home, away))

        rows: list[Any] = []
        for header, is_detailed, home, away in framed:
            if key_counts[header] > 1:
                continue
            home_poss, away_poss = _possession(
                int(home["passes_completed"] or 0), int(away["passes_completed"] or 0)
            )
            home_ball, away_ball = _shares_half_up(
                int(home.pop("ball_distribution_units") or 0),
                int(away.pop("ball_distribution_units") or 0),
            )
            for tid, is_home, values, poss, ball in (
                (header.home_team_id, True, home, home_poss, home_ball),
                (header.away_team_id, False, away, away_poss, away_ball),
            ):
                rows.append(
                    TeamMatchStats(
                        competition_id=header.competition_id,
                        home_team_id=header.home_team_id,
                        away_team_id=header.away_team_id,
                        date=header.kick_off.date(),
                        kick_off_time=header.kick_off.time(),
                        team_id=tid,
                        is_home=is_home,
                        detailed_report=is_detailed,
                        possession_percent=poss,
                        ball_distribution_percent=ball,
                        **values,
                    )
                )
        return rows
    except Exception:
        return None


def step_team_match_stats(fast_sync: bool | None = None) -> str:
    """Stage 4 (Full Sync): Club-scoped team_match_stats (xG, shots, possession, pass %, CCCs)
    paired by (date, home_team_id, away_team_id) enriching played_matches in place."""
    t0 = time.monotonic()
    use_fast = _STATE.get("fast_sync", False) if fast_sync is None else bool(fast_sync)
    if use_fast:
        _record_fast_sync_skip_note()
        _STATE["step_timings_ms"]["step_4_team_match_stats"] = 0
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
            tms_table = _extract_club_team_match_stats_fast(save, first_team_id)
            if tms_table is None:
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

        club_name_by_tid = _STATE.get("club_name_by_team_id") or {}
        for (date_iso, _ht, _at), pair in sorted(grouped_matches.items()):
            ours = pair.get("ours")
            opp = pair.get("opp")
            if ours is None:
                continue

            match_id = str(getattr(ours, "match_id", None) or getattr(ours, "fixture_id", None) or f"{date_iso}-{_ht}-{_at}")
            raw_is_home = getattr(ours, "is_home", None)
            if raw_is_home is not None:
                is_home = bool(raw_is_home)
            elif _ht and getattr(ours, "team_id", None) is not None:
                is_home = (_int(getattr(ours, "team_id", None), None) == _ht)
            elif first_team_id is not None and _ht:
                is_home = (first_team_id == _ht)
            else:
                is_home = True
            opp_tid = _at if is_home else _ht
            opponent = str(
                getattr(ours, "opponent_name", None)
                or getattr(ours, "opponent_club_name", None)
                or (club_name_by_tid.get(opp_tid) if opp_tid else None)
                or "Opponent"
            )
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
    players_out = _STATE["players_out"]
    senior_count = 0
    youth_reserve_count = 0
    for p in players_out:
        sq = str(p.get("squadTier") or p.get("squad") or "").lower()
        team_slot = _int(p.get("teamSlot"), 0) or 0
        if team_slot > 0 or any(tok in sq for tok in ("u18", "u19", "u21", "u23", "youth", "reserve", "b team", "b-team", "jong")):
            youth_reserve_count += 1
        else:
            senior_count += 1

    extraction_manifest = {
        "seniorSquad": senior_count,
        "youthReserves": youth_reserve_count,
        "totalPlayers": len(players_out),
        "shortlistScouted": len(_STATE.get("recruitment_targets") or []),
        "staff": len(_STATE.get("staff_out") or []),
        "playedMatches": len(_STATE.get("played_matches") or []),
        "upcomingFixtures": len(_STATE.get("upcoming_fixtures") or []),
        "activeInjuries": len(_STATE.get("active_injuries") or []),
        "activeSuspensions": len(_STATE.get("active_suspensions") or []),
        "playerMatchStats": len(_STATE.get("player_match_stats") or {}),
        "playerSeasonHistory": len(_STATE.get("player_season_history") or {}),
        "teamMatchStats": len(_STATE.get("team_match_stats") or {}),
        "tactics": len(_STATE.get("tactics") or []),
        "hasFinances": _STATE.get("finances") is not None,
        "hasLeagueStanding": _STATE.get("league_standing") is not None,
        "warningsCount": len(_STATE.get("warnings") or []),
        "fastSync": bool(_STATE.get("fast_sync", False)),
    }

    raw_payload = {
        "meta": _STATE["meta"],
        "clubUid": _STATE["club_uid"],
        "players": players_out,
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
        "squadPlanner": _STATE.get("squad_planner", []),
        "jobVacancies": _STATE["job_vacancies"],
        "recruitmentTargets": _STATE["recruitment_targets"],
        "extractionManifest": extraction_manifest,
        "fastSync": bool(_STATE.get("fast_sync", False)),
        "warnings": list(_STATE["warnings"]),
        "extractionWarnings": list(_STATE["warnings"]),
        "stepTimingsMs": dict(_STATE["step_timings_ms"]),
    }
    return deep_scrub_ca_pa(raw_payload)


def step_snapshot_payload(stage: str = "") -> str:
    """Serialize a progressive checkpoint snapshot of current _STATE without closing the save."""
    payload = _build_current_payload()
    if stage:
        payload["checkpointStage"] = stage
    return json.dumps(payload)


def _extract_club_league_table_and_rules_fast(
    save: Any, club_uid: int | None
) -> tuple[Any | None, Any | None, dict[str, Any] | None]:
    """Club-scoped direct league table + deferred competition_rules extractor:
    deduplicates & groups span_records.table_blocks ONCE, builds rows ONLY for the group(s)
    containing our managed club's first team, votes competition from span_kept_fixtures ONLY
    for those ~16 clubs, and resolves our club's exact CompetitionRules preamble in ~0.08s."""
    ctx = getattr(save, "_context", None)
    if ctx is None or club_uid is None:
        return None, None, None
    try:
        from collections import Counter
        from fmsave._layouts import LeagueTableLayout, find_layout
        from fmsave._save import SPAN_REGION
        from fmsave.models.league_tables import LeagueTable
        from fmsave.readers.league_tables import (
            _rows_for,
            distinct_blocks,
            drop_superseded_groups,
            group_blocks,
        )
        from fmsave.readers.rules import _table_run_after_each_block

        save_info = ctx.info
        club_index = ctx.club_index()
        stage_index = _STATE.get("prefetched_stage_index") or ctx.stage_index()
        competition_index = _STATE.get("prefetched_competition_index") or ctx.competition_index()
        layout = find_layout(LeagueTableLayout, SPAN_REGION, None, save_info.build).layout
        span_records = ctx.span_records()

        first_team_ids: set[int] = set()
        first_tid = _STATE.get("first_team_id")
        if first_tid is not None:
            first_team_ids.add(int(first_tid))
        for tid, entry in club_index.team_to_club.items():
            if entry and entry[0] == club_uid and entry[1] in (None, 0):
                first_team_ids.add(int(tid))
        if not first_team_ids:
            first_team_ids = set(_STATE.get("club_team_ids") or _resolve_club_team_ids(club_index, club_uid))
        if not first_team_ids:
            return None, None, None

        kept_blocks, _dups = distinct_blocks(span_records.table_blocks)
        groups, _sup = drop_superseded_groups(group_blocks(kept_blocks, layout), layout)

        # Keep ONLY groups containing our first team
        candidate_groups = [
            g for g in groups if any(block.team_id in first_team_ids for block in g)
        ]
        if not candidate_groups:
            return None, None, None

        # Vote competition ID from kept span fixtures ONLY for teams inside our candidate groups
        relevant_team_ids = {block.team_id for g in candidate_groups for block in g}
        kept_fixtures = _STATE.get("span_kept_fixtures")
        if kept_fixtures is None:
            kept_fixtures = span_records.fixtures
        stage_by_id = stage_index.stage_by_id
        team_comp_counts: dict[int, Counter[int]] = {}
        pair_comp_counts: dict[tuple[int, int], Counter[int]] = {}
        for rf in kept_fixtures:
            ht = rf.home_team_id
            at = rf.away_team_id
            if ht not in relevant_team_ids and at not in relevant_team_ids:
                continue
            st = None if rf.stage_id is None else stage_by_id.get(rf.stage_id)
            cid = None if st is None else st.competition_id
            if cid is None:
                continue
            if ht in relevant_team_ids:
                team_comp_counts.setdefault(ht, Counter())[cid] += 1
            if at in relevant_team_ids:
                team_comp_counts.setdefault(at, Counter())[cid] += 1
            if ht in relevant_team_ids and at in relevant_team_ids:
                pk = (ht, at) if ht <= at else (at, ht)
                pair_comp_counts.setdefault(pk, Counter())[cid] += 1

        def _vote_group_comp(group: tuple[Any, ...]) -> int | None:
            members = {b.team_id for b in group}
            member_coverage: Counter[int] = Counter()
            for tid in members:
                for cid in team_comp_counts.get(tid, ()):
                    member_coverage[cid] += 1
            min_cov = (len(members) + 1) // 2
            eligible = [cid for cid, cov in member_coverage.items() if cov >= min_cov]
            if not eligible:
                return None
            meeting_counts: Counter[int] = Counter()
            member_list = sorted(members)
            for i in range(len(member_list)):
                ti = member_list[i]
                for j in range(i + 1, len(member_list)):
                    tj = member_list[j]
                    pc = pair_comp_counts.get((ti, tj))
                    if pc:
                        for cid in eligible:
                            if cid in pc:
                                meeting_counts[cid] += pc[cid]
            return max(
                eligible,
                key=lambda cid: (member_coverage[cid], meeting_counts[cid], -cid),
            )

        name_for = competition_index.name_for
        best_lt = None
        best_row = None
        for group in candidate_groups:
            rows, _counts = _rows_for(group, club_index, layout)
            my_row = next(
                (r for r in rows if r.club_uid == club_uid and r.team_slot in (None, 0)),
                None,
            )
            if my_row is None:
                continue
            comp_id = _vote_group_comp(group)
            lt = LeagueTable(
                competition_id=comp_id,
                competition_name=name_for(comp_id),
                club_count=len(rows),
                rows=rows,
            )
            lt_size = len(rows)
            best_size = len(best_lt.rows) if best_lt is not None else -1
            if lt_size > best_size or (
                lt_size == best_size
                and int(getattr(my_row, "played", 0)) > int(getattr(best_row, "played", 0))
            ):
                best_lt = lt
                best_row = my_row

        # Resolve deferred competition_rules from span_records.rules_blocks in ~5ms!
        resolved_rules: dict[str, Any] | None = None
        if best_lt is not None and _STATE.get("defer_competition_rules"):
            comp_map = _STATE.get("comp_name_by_id", {})
            lt_comp_id = _int(getattr(best_lt, "competition_id", None), None)
            lt_comp_name = (
                getattr(best_lt, "competition_name", None)
                or (comp_map.get(lt_comp_id) if lt_comp_id else None)
                or "Domestic League"
            )
            target_team_set = frozenset(r.team_id for r in best_lt.rows)
            matched_block = None
            if span_records.rules_blocks:
                runs = _table_run_after_each_block(
                    span_records.rules_blocks, span_records.table_blocks
                )
                for block, run in zip(span_records.rules_blocks, runs):
                    if run == target_team_set:
                        matched_block = block
                        break
            resolved_rules = {
                "competitionName": lt_comp_name,
                "maxSquadSize": None,
                "minHomegrownClub": None,
                "minHomegrownNation": None,
                "maxForeignPlayers": None,
                "u21Exempt": None,
                "matchdaySubsLimit": None,
                "fixturesPerClub": (len(matched_block.rounds) or None) if matched_block is not None else None,
                "promotionPlaces": matched_block.promotion_places if matched_block is not None else None,
                "playoffPlaces": matched_block.playoff_places if matched_block is not None else None,
                "relegationPlaces": matched_block.relegation_places if matched_block is not None else None,
            }
            _STATE["defer_competition_rules"] = False

        return best_lt, best_row, resolved_rules
    except Exception:
        return None, None, None


def step_league_table() -> str:
    """Stage 4 (2/2): Full domestic league table (all teams) + deferred competition rules
    without closing _STATE, using club-scoped span decoding (~0.08s)."""
    t0 = time.monotonic()
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    upcoming_fixtures = _STATE["upcoming_fixtures"]
    comp_map = _STATE.get("comp_name_by_id", {})

    league_standing = None
    best_lt = None
    best_row = None
    deferred_rules = None
    if club_uid is not None and save is not None:
        fast_lt, fast_row, deferred_rules = _extract_club_league_table_and_rules_fast(save, club_uid)
        if fast_lt is not None and fast_row is not None:
            best_lt = fast_lt
            best_row = fast_row
        else:
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

    if deferred_rules is not None:
        _STATE["competition_rules"] = deferred_rules

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

    # Free heavy span fixtures reference now that fixtures, league table, and rules are complete
    _STATE["span_kept_fixtures"] = None
    _STATE["prefetched_match_summaries"] = None
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
    gc.collect()
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

    pass0_game_date = _get_attr(save_instance, "game_date", None)
    pass0_season_start = (
        date(pass0_game_date.year if pass0_game_date.month >= 7 else pass0_game_date.year - 1, 7, 1)
        if isinstance(pass0_game_date, date)
        else None
    )
    _PASS0_NON_COMP = (
        "friendly",
        "non-comp",
        "non_comp",
        "non_competitive",
        "calendar_year",
        "reserve",
        "u21",
        "u19",
        "u18",
        "youth",
        "international",
    )

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
            stat_date = _get_attr(stat, "date", None)
            if pass0_season_start is not None and isinstance(stat_date, date) and stat_date < pass0_season_start:
                continue
            kind_str = str(_get_attr(stat, "kind", "") or "").lower()
            comp_str = str(_get_attr(stat, "competition_name", "") or "").lower()
            if (
                not _get_attr(stat, "is_competitive", True)
                or any(tok in kind_str for tok in _PASS0_NON_COMP)
                or any(tok in comp_str for tok in _PASS0_NON_COMP)
            ):
                continue
            player_match_stats.setdefault(p_uid, []).append({
                "date": _iso(stat_date) or "",
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
            h_kind = _normalize_stat_kind(_get_attr(h, "kind", ""))
            if any(tok in h_kind for tok in _PASS0_NON_COMP):
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
                s_attrs = getattr(s, "attributes", None)
                if s_attrs is not None and callable(getattr(s_attrs, "to_display_scale", None)):
                    try:
                        scaled = s_attrs.to_display_scale()
                        if scaled is not None:
                            s_attrs = scaled
                    except Exception:
                        pass
                club_staff.append({
                    "uid": _int(_get_attr(s, "uid", 0), 0) or 0,
                    "name": _get_attr(s, "name", "Staff Member"),
                    "role": _label(_get_attr(s, "role", "Coach")) or "Coach",
                    "coachingDefending": _clamp_attr(_first_attr(s_attrs, ("defending", "coaching_defending")) if s_attrs else _get_attr(s, "coaching_defending", 10), 10),
                    "coachingAttacking": _clamp_attr(_first_attr(s_attrs, ("attacking", "coaching_attacking")) if s_attrs else _get_attr(s, "coaching_attacking", 10), 10),
                    "coachingTactical": _clamp_attr(_first_attr(s_attrs, ("tactical", "coaching_tactical")) if s_attrs else _get_attr(s, "coaching_tactical", 10), 10),
                    "judgingAbility": _clamp_attr(_first_attr(s_attrs, ("judging_player_ability", "judging_ability")) if s_attrs else _get_attr(s, "judging_ability", 10), 10),
                    "judgingPotential": _clamp_attr(_first_attr(s_attrs, ("judging_player_potential", "judging_potential")) if s_attrs else _get_attr(s, "judging_potential", 10), 10),
                })

    fin_iter, _, _ = _open_table_stream(
        save_instance, "finances", club_uid=user_club_uid, try_where_club=True
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

    return json.dumps(deep_scrub_ca_pa({
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
    }))


def extract_fm_save_payload(
    path: str,
    preferred_club_hint: str = "",
    progress_cb: Any = None,
    import_scope: str = "managed_club_only",
    fast_sync: bool = False,
    checkpoint_cb: Any = None,
) -> dict[str, Any]:
    """Single-call extractor executing the reordered 4-stage Pass 0/1 pipeline:
    Stage 1: Open save + Club & Squad (52 attributes, traits, badges, direct contract/bans/injuries)
    Stage 2: Finances/12-month cash runway, Club Staff, Tactics & Mentoring
    Stage 3: Full Sync game_db ops + Market Scan (then releases game_db once)
    Stage 4: Fixtures, League Table, Team xG, Player Season Stats & Career History
    """
    def _emit(step: str, label: str):
        if progress_cb:
            try:
                progress_cb(step, label)
            except Exception:
                pass

    def _emit_checkpoint(stage_name: str):
        if checkpoint_cb:
            try:
                checkpoint_cb(stage_name, step_snapshot_payload(stage_name))
            except Exception:
                pass

    # Stage 1: Open save + Club & Squad (game_db borrowed ONCE for entire Phase A)
    _emit("Stage 1/4", "Opening .fm save...")
    step_open(path, preferred_club_hint, import_scope, fast_sync)

    _emit("Stage 1/4", "Extracting squad & 52 attributes...")
    step_players()

    # Stage 2: Finances, Club Staff, Tactics & Mentoring (reuses borrowed game_db)
    _emit("Stage 2/4", "Reading finances, staff & tactics...")
    step_3_1_finances()
    _emit("Stage 2/4", "Reading club staff...")
    step_3_2_staff()
    _emit("Stage 2/4", "Reading tactics & mentoring...")
    step_3_3_tactics_and_mentoring()
    _emit_checkpoint("stage_2_club_core")

    # Stage 3 (Full Sync ONLY — reuses borrowed game_db BEFORE releasing it once)
    if not fast_sync:
        _emit("Stage 3/4", "Reading injuries, facilities & club ops...")
        step_3_3_injuries(False)
        step_3_3_facilities(False)
        step_3_3_competition_rules(False)
        step_3_3_transfer_windows(False)
        step_3_3_secondary_ops(False)
        _emit("Stage 3/4", "Reading Last-5 match ratings...")
        step_4_2_player_match_stats(False)
        _emit("Stage 3/4", "Reading detailed contracts & suspensions...")
        step_4_4_contracts_and_suspensions(False)
        _emit("Stage 3/4", "Scanning free-agent & expiring contract targets...")
        step_3_4_market_scan_and_release_gamedb(False)
    else:
        step_3_4_market_scan_and_release_gamedb(True)

    # Stage 4 (Phase B — game_db is freed; reads span, match_stats, season_stats, archive)
    _emit("Stage 4/4", "Reading fixtures & match results...")
    step_fixtures(True)
    _emit("Stage 4/4", "Reading domestic league table...")
    step_league_table()

    if not fast_sync:
        _emit("Stage 4/4", "Reading team match stats (xG, shots & possession)...")
        step_team_match_stats(False)
        _emit("Stage 4/4", "Reading player season stats...")
        step_4_1_season_stats(False)
        _emit("Stage 4/4", "Reading player career history...")
        step_4_3_season_history(False)

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
        parser.add_argument(
            "--checkpoint-file",
            default="",
            help="Optional temp path to write progressive Stage 2 checkpoint JSON",
        )
        parsed_args = parser.parse_args(args_list)

        t_start = time.monotonic()
        norm_scope = _normalize_cli_scope(parsed_args.scope)
        use_fast = _parse_cli_bool(parsed_args.fast_sync)
        save_file = parsed_args.file
        display_name = parsed_args.filename or os.path.basename(save_file)
        checkpoint_file = (parsed_args.checkpoint_file or "").strip()

        try:
            file_size_mb = round(os.path.getsize(save_file) / (1024 * 1024), 2)
        except OSError:
            file_size_mb = 0.0

        def _attach_cli_meta(obj: dict[str, Any]) -> None:
            if isinstance(obj.get("meta"), dict):
                obj["meta"]["fileName"] = display_name
                obj["meta"]["fileSizeMb"] = file_size_mb
                obj["meta"]["decodedAtIso"] = datetime.now(timezone.utc).isoformat()
                obj["meta"]["importScope"] = norm_scope
                obj["meta"]["fastSync"] = use_fast
                obj["meta"]["mountMode"] = "NATIVE_SERVER"
            timings = obj.get("stepTimingsMs")
            if not isinstance(timings, dict):
                timings = {}
            timings["totalDecodeMs"] = max(0, int(round((time.monotonic() - t_start) * 1000)))
            obj["stepTimingsMs"] = timings
            for p in obj.get("players") or []:
                if isinstance(p, dict):
                    p.pop("ca", None)
                    p.pop("pa", None)
                    p.pop("internalReliability", None)
                    p.pop("hiddenPersonality", None)
            for t in obj.get("recruitmentTargets") or []:
                if isinstance(t, dict):
                    t.pop("ca", None)
                    t.pop("pa", None)
                    t.pop("internalReliability", None)

        def _stderr_progress(step: str, label: str) -> None:
            try:
                clean_label = str(label or "").strip()
                if clean_label:
                    sys.stderr.write(f"PROGRESS: {clean_label}\n")
                    sys.stderr.flush()
            except Exception:
                pass

        def _write_checkpoint(stage_name: str, snapshot_json: str) -> None:
            if not checkpoint_file or not snapshot_json:
                return
            try:
                snap = json.loads(snapshot_json)
                _attach_cli_meta(snap)
                tmp_cp = f"{checkpoint_file}.tmp"
                with open(tmp_cp, "w", encoding="utf-8") as fh:
                    json.dump(snap, fh)
                os.replace(tmp_cp, checkpoint_file)
                sys.stderr.write(f"CHECKPOINT: {stage_name}\n")
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
            checkpoint_cb=_write_checkpoint if checkpoint_file else None,
        )

        _attach_cli_meta(payload)

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
