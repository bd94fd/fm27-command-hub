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
import json
import os
import sys
import time
import warnings
from datetime import date, time as dt_time
from typing import Any

import fmsave

SCOUT_BUDGET_SEC = 8.0
SCOUT_MAX_CANDIDATES = 60

_STATE: dict[str, Any] = {
    "save": None,
    "game_db_cm": None,
    "meta": None,
    "club_uid": None,
    "club_name": None,
    "club_reputation": None,
    "game_date": None,
    "squad_uids": set(),
    "players_out": [],
    "staff_out": [],
    "played_matches": [],
    "upcoming_fixtures": [],
    "league_standing": None,
    "finances": None,
    "monthly_finances": [],
    "active_injuries": [],
    "tactics": [],
    "mentoring": [],
    "facilities": {},
    "sponsorships": [],
    "transfer_windows": {"isOpen": False},
    "competition_rules": {},
    "selections": {},
    "set_pieces": {},
    "training": {},
    "job_vacancies": [],
    "player_match_stats": {},
    "team_match_stats": [],
    "player_season_history": {},
    "recruitment_targets": [],
    "warnings": [],
    "comp_name_by_id": {},
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


def _safe_call(fn: Any, label: str = "section", default: Any = ()):
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = fn()
        for w in caught:
            msg = str(w.message).strip()
            if msg and f"{label}: {msg}" not in _STATE["warnings"]:
                _STATE["warnings"].append(f"{label}: {msg}")
        return result if result is not None else default
    except Exception as exc:  # noqa: BLE001
        note = f"Section '{label}' fallback ({type(exc).__name__})"
        if note not in _STATE["warnings"]:
            _STATE["warnings"].append(note)
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
    _STATE["game_date"] = None
    _STATE["squad_uids"] = set()
    _STATE["players_out"] = []
    _STATE["staff_out"] = []
    _STATE["played_matches"] = []
    _STATE["upcoming_fixtures"] = []
    _STATE["league_standing"] = None
    _STATE["finances"] = None
    _STATE["monthly_finances"] = []
    _STATE["active_injuries"] = []
    _STATE["tactics"] = []
    _STATE["mentoring"] = []
    _STATE["facilities"] = {}
    _STATE["sponsorships"] = []
    _STATE["transfer_windows"] = {"isOpen": False}
    _STATE["competition_rules"] = {}
    _STATE["selections"] = {}
    _STATE["set_pieces"] = {}
    _STATE["training"] = {}
    _STATE["job_vacancies"] = []
    _STATE["player_match_stats"] = {}
    _STATE["team_match_stats"] = []
    _STATE["player_season_history"] = {}
    _STATE["recruitment_targets"] = []
    _STATE["warnings"] = []
    _STATE["comp_name_by_id"] = {}
    gc.collect()


def step_open(path: str, preferred_club_hint: str = "") -> str:
    step_close()
    save = fmsave.open(path)
    _STATE["save"] = save

    # Enter ONE shared game_db section borrow across Steps 2-3 (incl. Group 4)
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
    club_balance = _int(getattr(target_club, "balance", None)) if target_club else None
    club_rep = _int(_first_attr(target_club, ("reputation", "club_reputation")), None)

    # Fallback to clubs() scan if no managed club found or to capture club reputation
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
    }

    _STATE["meta"] = meta
    _STATE["club_uid"] = club_uid
    _STATE["club_name"] = club_name
    _STATE["club_reputation"] = club_rep
    _STATE["game_date"] = game_date

    return json.dumps(meta)


def step_players() -> str:
    """Group 1: Club-scoped players with all 52 attributes, readable traits,
    qualitative Scout Report Badges, and relative star ratings (ZERO raw CA/PA)."""
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

        players_out.append({
            "uid": uid,
            "name": p.name,
            "position": pos_str,
            "primaryPosition": nat_pos[0] if nat_pos else (acc_pos[0] if acc_pos else pos_str),
            "secondaryPositions": secondary_pos,
            "age": _int(getattr(p, "age", None), 22),
            "nation": getattr(p, "nation_name", None) or getattr(p, "nationality", None) or "FM",
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
            "suspensionsCount": len(p.suspensions) if getattr(p, "suspensions", None) else 0,
        })

    _STATE["players_out"] = players_out
    _STATE["squad_uids"] = squad_uids
    return json.dumps({"playerCount": len(players_out)})


def _scan_recruitment_targets_group4(
    save: Any,
    club_uid: int | None,
    game_date: Any,
    wage_budget_weekly: int | None,
) -> list[dict[str, Any]]:
    """Group 4: Time-capped (<= 8.0s mobile budget, max 60 targets) scan for
    signable Free Agents and Contracts Expiring <= 6 Months matched to club
    reputation / wage tier with ZERO raw CA/PA exposed."""
    targets: list[dict[str, Any]] = []
    start_ts = time.monotonic()

    players_out = _STATE.get("players_out", [])
    club_wages = [int(p.get("wagePw") or 0) for p in players_out if (p.get("wagePw") or 0) > 0]
    max_club_wage = max(club_wages) if club_wages else 2500
    if wage_budget_weekly and wage_budget_weekly > 0:
        # Target individual wage ceiling ~22% of total weekly wage budget or 1.8x top earner
        wage_ceiling = max(int(wage_budget_weekly * 0.22), int(max_club_wage * 1.8), 1500)
    else:
        wage_ceiling = max(int(max_club_wage * 1.8), 2500)

    club_rep = _STATE.get("club_reputation")
    rep_max = (club_rep + 1500) if isinstance(club_rep, int) and club_rep > 0 else None
    rep_min = max(0, club_rep - 2500) if isinstance(club_rep, int) and club_rep > 0 else None

    try:
        p_table = save.players()
        seen = 0
        for p in p_table:
            seen += 1
            if (seen & 255) == 0 and (time.monotonic() - start_ts) >= SCOUT_BUDGET_SEC:
                _STATE["warnings"].append(
                    f"recruitment_scan: mobile {SCOUT_BUDGET_SEC:.1f}s budget reached ({len(targets)} targets)"
                )
                break
            if len(targets) >= SCOUT_MAX_CANDIDATES:
                break

            p_club_uid = getattr(p, "club_uid", None)
            if club_uid is not None and p_club_uid == club_uid:
                continue

            p_name = getattr(p, "name", None)
            if not p_name:
                continue

            age = _int(getattr(p, "age", None), 22) or 22
            if age < 16 or age > 36:
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
            is_expiring = (not is_free_agent) and (0 < contract_months <= 6)
            if not (is_free_agent or is_expiring):
                continue

            # Reputation / wage tier match (zero raw CA/PA checked or exposed)
            p_wage = _int(
                getattr(p, "demanded_wage", None)
                or (getattr(contract, "wage", None) if contract else None),
                0,
            ) or 0
            if p_wage > wage_ceiling:
                continue

            p_rep = _int(_first_attr(p, ("reputation", "current_reputation", "home_reputation")), None)
            if rep_max is not None and p_rep is not None:
                if p_rep > rep_max or (rep_min is not None and p_rep < rep_min):
                    continue

            attrs = getattr(p, "attributes", None)
            pers = getattr(p, "personality", None)
            nat_pos = list(getattr(p, "natural_positions", None) or [])
            acc_pos = list(getattr(p, "accomplished_positions", None) or [])
            primary_pos = nat_pos[0] if nat_pos else (acc_pos[0] if acc_pos else "UTL")

            pace_v = _clamp_attr(_first_attr(attrs, ("pace",)) if attrs else _first_attr(p, ("pace",)), 10)
            acc_v = _clamp_attr(_first_attr(attrs, ("acceleration",)) if attrs else _first_attr(p, ("acceleration",)), 10)
            sta_v = _clamp_attr(_first_attr(attrs, ("stamina",)) if attrs else _first_attr(p, ("stamina",)), 10)
            dec_v = _clamp_attr(_first_attr(attrs, ("decisions",)) if attrs else _first_attr(p, ("decisions",)), 10)
            vis_v = _clamp_attr(_first_attr(attrs, ("vision",)) if attrs else _first_attr(p, ("vision",)), 10)
            pas_v = _clamp_attr(_first_attr(attrs, ("passing",)) if attrs else _first_attr(p, ("passing",)), 10)
            fin_v = _clamp_attr(_first_attr(attrs, ("finishing",)) if attrs else _first_attr(p, ("finishing",)), 10)
            tck_v = _clamp_attr(_first_attr(attrs, ("tackling",)) if attrs else _first_attr(p, ("tackling",)), 10)
            det_v = _clamp_attr(_first_attr(attrs, ("determination",)) if attrs else _first_attr(p, ("determination",)), 10)
            jr_v = _clamp_attr(_first_attr(attrs, ("jumping_reach",)) if attrs else _first_attr(p, ("jumping_reach",)), 10)

            # Skip low-signal uninitialized placeholders when scanning large saves
            if (pace_v + sta_v + dec_v + det_v) < 32:
                continue

            targets.append({
                "uid": _int(getattr(p, "uid", None), 0) or 0,
                "name": str(p_name),
                "age": age,
                "nationality": getattr(p, "nation_name", None) or getattr(p, "nationality", None) or "Unknown",
                "primaryPosition": primary_pos,
                "currentClub": "Free Agent" if is_free_agent else (getattr(p, "club_name", None) or "Expiring Contract"),
                "isFreeAgent": is_free_agent,
                "contractExpiryMonths": 0 if is_free_agent else int(contract_months),
                "expires": "Free" if is_free_agent else (_dmy(contract_end) or f"<= {contract_months}m"),
                "demandedWageEur": p_wage,
                "scoutBadges": _extract_reliability_badges(p, pers),
                "traits": _extract_traits(p),
                "attributes": {
                    "pace": pace_v,
                    "acceleration": acc_v,
                    "stamina": sta_v,
                    "decisions": dec_v,
                    "vision": vis_v,
                    "passing": pas_v,
                    "finishing": fin_v,
                    "tackling": tck_v,
                    "determination": det_v,
                    "jumpingReach": jr_v,
                    "keyPace": pace_v,
                    "keyVision": vis_v,
                    "keyDecision": dec_v,
                    "keyStamina": sta_v,
                },
            })
    except Exception as exc:
        _STATE["warnings"].append(f"recruitment_scan: {type(exc).__name__}")

    return targets


def step_club_extras_and_release_gamedb() -> str:
    """Group 3 + Group 4 (while game_db borrow is active), then release game_db."""
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    game_date = _STATE["game_date"]

    # Group 3a: Last-12-months finances() for cash burn & runway + latest snapshot
    latest_finance = None
    monthly_finances: list[dict[str, Any]] = []
    wage_budget_weekly = None
    if club_uid is not None:
        try:
            fin_table = save.finances()
            try:
                club_finances = list(fin_table.where(club_uid=club_uid))
            except Exception:
                club_finances = [fn for fn in fin_table if getattr(fn, "club_uid", None) == club_uid]
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
            _STATE["warnings"].append(f"finances: {type(exc).__name__}")

    active_injuries = []
    try:
        inj_table = save.injuries()
        try:
            inj_list = list(inj_table.where(club_uid=club_uid)) if club_uid is not None else []
        except Exception:
            inj_list = list(inj_table)
        for inj in inj_list:
            if inj.player_uid in squad_uids or (club_uid is not None and getattr(inj, "club_uid", None) == club_uid):
                kind_str = str(getattr(inj, "kind", "")).lower()
                if "current" in kind_str or "active" in kind_str or (game_date and inj.date and (game_date - inj.date).days <= 30):
                    active_injuries.append({
                        "playerUid": inj.player_uid,
                        "playerName": getattr(inj, "player_name", None),
                        "typeName": getattr(inj, "type_name", None) or "Injury",
                        "date": _dmy(inj.date),
                        "severity": _label(getattr(inj, "severity", None)),
                        "cause": _label(getattr(inj, "cause", None)),
                        "kind": kind_str,
                    })
    except Exception as exc:
        _STATE["warnings"].append(f"injuries: {type(exc).__name__}")

    tactics_out = []
    try:
        tac_rows = _safe_call(save.tactics, "tactics", default=[])
        for t in tac_rows:
            if club_uid is not None and getattr(t, "club_uid", None) == club_uid and getattr(t, "team_slot", None) in (None, 0):
                tactics_out.append({
                    "index": int(t.index),
                    "name": t.name or f"Tactic {t.index + 1}",
                    "styleName": getattr(t, "style_name", "") or "",
                    "mentality": _label(getattr(t, "mentality", None)) or "Standard",
                })
    except Exception as exc:
        _STATE["warnings"].append(f"tactics: {type(exc).__name__}")

    mentoring_out = []
    try:
        mg_rows = _safe_call(save.mentoring, "mentoring", default=[])
        for mg in mg_rows:
            if club_uid is not None and getattr(mg, "club_uid", None) == club_uid and getattr(mg, "team_slot", None) in (None, 0):
                members = [m for m in (getattr(mg, "member_names", None) or []) if m]
                if members:
                    mentoring_out.append({
                        "groupNumber": int(mg.group_number),
                        "label": getattr(mg, "label", None) or f"Group {mg.group_number}",
                        "members": members,
                    })
    except Exception as exc:
        _STATE["warnings"].append(f"mentoring: {type(exc).__name__}")

    # Group 3b: Club-scoped staff()
    staff_out = []
    try:
        staff_fn = getattr(save, "staff", None) or getattr(save, "non_players", None)
        if callable(staff_fn):
            s_table = _safe_call(staff_fn, "staff", default=[])
            raw_staff = []
            if club_uid is not None:
                try:
                    raw_staff = list(s_table.where(club_uid=club_uid))
                except Exception:
                    raw_staff = [s for s in s_table if getattr(s, "club_uid", None) == club_uid]
            for s in raw_staff[:40]:
                s_name = getattr(s, "name", None)
                if not s_name:
                    continue
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
                    "club": _STATE["meta"].get("clubName", ""),
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
    except Exception as exc:
        _STATE["warnings"].append(f"staff: {type(exc).__name__}")

    # Group 3c: _safe_call extraction for facilities, sponsorships, transfer_windows,
    # competition_rules, selections, set_pieces, training, job_vacancies
    def _extract_club_scoped(method_name: str, default_val: Any) -> Any:
        fn = getattr(save, method_name, None)
        if not callable(fn):
            return default_val
        raw = _safe_call(fn, method_name, default=default_val)
        if raw is None:
            return default_val
        if hasattr(raw, "where") and club_uid is not None:
            try:
                scoped = list(raw.where(club_uid=club_uid))
                if scoped:
                    return _to_json_safe(scoped if isinstance(default_val, list) else scoped[0])
            except Exception:
                pass
        if isinstance(raw, (list, tuple)) or hasattr(raw, "__iter__") and not isinstance(raw, (str, bytes, dict)):
            items = []
            try:
                for idx, row in enumerate(raw):
                    if idx >= 1000 and not items:
                        break
                    r_cid = getattr(row, "club_uid", None)
                    if r_cid is not None and club_uid is not None and r_cid != club_uid and method_name not in ("job_vacancies", "transfer_windows", "competition_rules"):
                        continue
                    items.append(_to_json_safe(row))
                    if len(items) >= 25:
                        break
            except Exception:
                return default_val
            if isinstance(default_val, dict):
                return items[0] if items and isinstance(items[0], dict) else ({"items": items} if items else default_val)
            return items
        return _to_json_safe(raw)

    facilities = _extract_club_scoped("facilities", {"training": "Average", "youth": "Average"})
    sponsorships = _extract_club_scoped("sponsorships", [])
    transfer_windows = _extract_club_scoped("transfer_windows", {"isOpen": False})
    competition_rules = _extract_club_scoped("competition_rules", {})
    selections = _extract_club_scoped("selections", {})
    set_pieces = _extract_club_scoped("set_pieces", {})
    training = _extract_club_scoped("training", {})
    job_vacancies = _extract_club_scoped("job_vacancies", [])

    # Group 4: Time-capped <= 8.0s, max 60 recruitment targets scan while game_db is active
    recruitment_targets = _scan_recruitment_targets_group4(
        save, club_uid, game_date, wage_budget_weekly
    )

    _STATE["finances"] = latest_finance
    _STATE["monthly_finances"] = monthly_finances
    _STATE["active_injuries"] = active_injuries[:15]
    _STATE["tactics"] = tactics_out[:3]
    _STATE["mentoring"] = mentoring_out[:5]
    _STATE["staff_out"] = staff_out
    _STATE["facilities"] = facilities if isinstance(facilities, dict) else {"summary": facilities}
    _STATE["sponsorships"] = sponsorships if isinstance(sponsorships, list) else []
    _STATE["transfer_windows"] = transfer_windows if isinstance(transfer_windows, dict) else {"windows": transfer_windows}
    _STATE["competition_rules"] = competition_rules if isinstance(competition_rules, dict) else {"rules": competition_rules}
    _STATE["selections"] = selections if isinstance(selections, dict) else {"items": selections}
    _STATE["set_pieces"] = set_pieces if isinstance(set_pieces, dict) else {"routines": set_pieces}
    _STATE["training"] = training if isinstance(training, dict) else {"schedule": training}
    _STATE["job_vacancies"] = job_vacancies if isinstance(job_vacancies, list) else []
    _STATE["recruitment_targets"] = recruitment_targets

    # Release game_db section borrow & heavy player caches to free RAM
    _exit_game_db_borrow()
    _evict_finished_player_phase_cache(save)

    return json.dumps({
        "injuries": len(_STATE["active_injuries"]),
        "tactics": len(_STATE["tactics"]),
        "mentoring": len(_STATE["mentoring"]),
        "staff": len(staff_out),
        "monthlyFinances": len(monthly_finances),
        "recruitmentTargets": len(recruitment_targets),
    })


def step_season_stats() -> str:
    """Group 2a: Season stats + club-scoped player_match_stats (Last-5 Form)
    + club-scoped player_season_history."""
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    players_out = _STATE["players_out"]
    game_date = _STATE.get("game_date")
    if not squad_uids:
        return json.dumps({"matchedStats": 0})

    current_season_year = None
    if game_date:
        current_season_year = game_date.year if game_date.month >= 7 else game_date.year - 1

    best_by_uid: dict[int, tuple[int, int, Any]] = {}
    t0 = time.monotonic()
    timed_out = False

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
        kind_str = str(getattr(row, "kind", "")).lower()
        if "friendly" in kind_str or "non_competitive" in kind_str or "youth" in kind_str:
            return
        is_league = 1 if "league" in kind_str else (0 if "overall" in kind_str or "competitive" in kind_str else -1)
        if is_league < 0:
            return

        row_year = _row_season_year(row)
        if current_season_year is not None and row_year > 0 and row_year < current_season_year:
            return

        existing = best_by_uid.get(p_uid)
        if existing is None:
            best_by_uid[p_uid] = (row_year, is_league, row)
            return

        ex_year, ex_is_league, ex_row = existing
        if row_year > ex_year:
            best_by_uid[p_uid] = (row_year, is_league, row)
        elif row_year == ex_year:
            if is_league > ex_is_league:
                best_by_uid[p_uid] = (row_year, is_league, row)
            elif is_league == ex_is_league:
                new_mins = getattr(row, "minutes", 0) or 0
                old_mins = getattr(ex_row, "minutes", 0) or 0
                if row_year > 0:
                    if new_mins > old_mins:
                        best_by_uid[p_uid] = (row_year, is_league, row)
                else:
                    if game_date and game_date.month in (7, 8, 9, 10) and old_mins > 900 and 0 <= new_mins <= 900:
                        best_by_uid[p_uid] = (row_year, is_league, row)
                    elif new_mins > old_mins and new_mins <= 900:
                        best_by_uid[p_uid] = (row_year, is_league, row)

    try:
        stats_table = save.player_season_stats()
        used_scoped = False

        if club_uid is not None and hasattr(stats_table, "where"):
            try:
                scoped_rows = stats_table.where(club_uid=club_uid)
                for row in scoped_rows:
                    _consume_stat_row(row)
                if best_by_uid:
                    used_scoped = True
            except Exception:
                used_scoped = False

        if not used_scoped and hasattr(stats_table, "where"):
            try:
                sample_uid = next(iter(squad_uids))
                _ = list(stats_table.where(player_uid=sample_uid))
                for uid in squad_uids:
                    if time.monotonic() - t0 > 35.0:
                        timed_out = True
                        break
                    for row in stats_table.where(player_uid=uid):
                        _consume_stat_row(row)
                used_scoped = True
            except Exception:
                used_scoped = False

        if not used_scoped:
            seen_count = 0
            for row in stats_table:
                seen_count += 1
                if (seen_count & 2047) == 0 and (time.monotonic() - t0) > 35.0:
                    timed_out = True
                    break
                _consume_stat_row(row)

        if timed_out:
            _STATE["warnings"].append(
                "player_season_stats: mobile 35s time cap reached (partial season stats applied)"
            )
    except Exception as exc:
        _STATE["warnings"].append(f"player_season_stats: {type(exc).__name__}")

    # Group 2: Club-scoped player_match_stats (Last-5 Form ratings)
    player_match_stats: dict[str, list[dict[str, Any]]] = {}
    pms_fn = getattr(save, "player_match_stats", None)
    if callable(pms_fn):
        pms_t0 = time.monotonic()
        pms_table = _safe_call(pms_fn, "player_match_stats", default=[])
        pms_rows = []
        if club_uid is not None and hasattr(pms_table, "where"):
            try:
                pms_rows = list(pms_table.where(club_uid=club_uid))
            except Exception:
                pms_rows = []
        if not pms_rows and hasattr(pms_table, "where"):
            try:
                for uid in squad_uids:
                    if time.monotonic() - pms_t0 > 12.0:
                        break
                    pms_rows.extend(list(pms_table.where(player_uid=uid)))
            except Exception:
                pms_rows = []
        if not pms_rows:
            try:
                for idx, row in enumerate(pms_table):
                    if (idx & 2047) == 0 and (time.monotonic() - pms_t0) > 12.0:
                        break
                    if getattr(row, "player_uid", None) in squad_uids:
                        pms_rows.append(row)
            except Exception:
                pass

        for stat in pms_rows:
            p_uid = _int(getattr(stat, "player_uid", None))
            if p_uid not in squad_uids:
                continue
            is_comp = getattr(stat, "is_competitive", True)
            kind_str = str(getattr(stat, "kind", "")).lower()
            if not is_comp or "friendly" in kind_str:
                continue
            rating_v = _float(getattr(stat, "rating", None) or getattr(stat, "match_rating", None), None)
            if rating_v is None or rating_v <= 0:
                continue
            uid_key = str(p_uid)
            player_match_stats.setdefault(uid_key, []).append({
                "date": _iso(getattr(stat, "date", None)) or "",
                "rating": round(rating_v, 2),
                "goals": _int(getattr(stat, "goals", None), 0) or 0,
                "assists": _int(getattr(stat, "assists", None), 0) or 0,
                "opponent": getattr(stat, "opponent_name", None) or "",
                "minutes": _int(getattr(stat, "minutes", None), 0) or 0,
            })

        for uid_key, items in player_match_stats.items():
            items.sort(key=lambda x: x.get("date") or "")
            player_match_stats[uid_key] = items[-5:]

    # Group 2: Club-scoped player_season_history
    season_history: dict[str, list[dict[str, Any]]] = {}
    psh_fn = getattr(save, "player_season_history", None)
    if callable(psh_fn):
        psh_t0 = time.monotonic()
        psh_table = _safe_call(psh_fn, "player_season_history", default=[])
        psh_rows = []
        if hasattr(psh_table, "where"):
            try:
                for uid in squad_uids:
                    if time.monotonic() - psh_t0 > 12.0:
                        break
                    psh_rows.extend(list(psh_table.where(player_uid=uid)))
            except Exception:
                psh_rows = []
        if not psh_rows:
            try:
                for idx, row in enumerate(psh_table):
                    if (idx & 2047) == 0 and (time.monotonic() - psh_t0) > 12.0:
                        break
                    if getattr(row, "player_uid", None) in squad_uids:
                        psh_rows.append(row)
            except Exception:
                pass

        for h in psh_rows:
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

    stats_by_uid = {uid: triple[2] for uid, triple in best_by_uid.items()}
    matched = 0
    for p in players_out:
        uid_key = str(p["uid"])
        if uid_key in player_match_stats:
            p["last5Ratings"] = player_match_stats[uid_key]
        if uid_key in season_history:
            p["seasonHistory"] = season_history[uid_key]

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
    _STATE["player_match_stats"] = player_match_stats
    _STATE["player_season_history"] = season_history
    gc.collect()
    return json.dumps({
        "matchedStats": matched,
        "formPlayers": len(player_match_stats),
        "historyPlayers": len(season_history),
    })


def step_fixtures() -> str:
    """Group 2b: Played results, upcoming fixtures, and club-scoped team_match_stats
    (xG, shots, shots on target, possession)."""
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    game_date = _STATE["game_date"]
    comp_map = _STATE.get("comp_name_by_id", {})

    # Extract club-scoped team_match_stats
    team_match_stats: list[dict[str, Any]] = []
    tms_by_key: dict[str, dict[str, Any]] = {}
    tms_fn = getattr(save, "team_match_stats", None)
    if callable(tms_fn) and club_uid is not None:
        tms_t0 = time.monotonic()
        tms_table = _safe_call(tms_fn, "team_match_stats", default=[])
        tms_rows = []
        if hasattr(tms_table, "where"):
            try:
                tms_rows = list(tms_table.where(club_uid=club_uid))
            except Exception:
                tms_rows = []
        if not tms_rows:
            try:
                for idx, row in enumerate(tms_table):
                    if (idx & 2047) == 0 and (time.monotonic() - tms_t0) > 12.0:
                        break
                    t_uid = getattr(row, "club_uid", None) or getattr(row, "team_id", None)
                    if t_uid == club_uid:
                        tms_rows.append(row)
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
                    home_list = list(fix_table.where(home_club_uid=club_uid))
                    away_list = list(fix_table.where(away_club_uid=club_uid))
                    for f in home_list:
                        if getattr(f, "home_team_slot", None) in (None, 0):
                            club_fixtures.append(f)
                    for f in away_list:
                        if getattr(f, "away_team_slot", None) in (None, 0):
                            club_fixtures.append(f)
                    used_scoped = True
                except Exception:
                    used_scoped = False

            if not used_scoped:
                seen = 0
                for f in fix_table:
                    seen += 1
                    if (seen & 2047) == 0 and (time.monotonic() - t0) > 35.0:
                        _STATE["warnings"].append("fixtures: mobile 35s time cap reached")
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

    return json.dumps({
        "playedCount": len(_STATE["played_matches"]),
        "upcomingCount": len(_STATE["upcoming_fixtures"]),
        "teamMatchStatsCount": len(_STATE["team_match_stats"]),
    })


def step_league_table_and_finish() -> str:
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    upcoming_fixtures = _STATE["upcoming_fixtures"]
    comp_map = _STATE.get("comp_name_by_id", {})

    league_standing = None
    best_lt = None
    best_row = None
    if club_uid is not None:
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
                    "pos": int(getattr(r, "position", 0)),
                    "club": getattr(r, "club_name", "Club"),
                    "played": int(getattr(r, "played", 0)),
                    "pts": int(getattr(r, "points", 0)),
                    "gd": int(getattr(r, "goals_for", 0) - getattr(r, "goals_against", 0)),
                }
                for r in sorted(lt.rows, key=lambda x: getattr(x, "position", 999))[:5]
            ],
        }

        if league_comp_id is not None:
            for m in _STATE["played_matches"]:
                if m.get("competition") == "League / Cup":
                    m["competition"] = league_comp_name if m.get("competitionId") == league_comp_id else "Cup / Friendly"
            for uf in _STATE["upcoming_fixtures"]:
                if uf.get("competition") == "League / Cup":
                    uf["competition"] = league_comp_name if uf.get("competitionId") == league_comp_id else "Cup / Friendly"

    payload = {
        "meta": _STATE["meta"],
        "clubUid": _STATE["club_uid"],
        "players": _STATE["players_out"],
        "staff": _STATE.get("staff_out", []),
        "playedMatches": _STATE["played_matches"],
        "upcomingFixtures": _STATE["upcoming_fixtures"],
        "leagueStanding": league_standing,
        "finances": _STATE["finances"],
        "monthlyFinances": _STATE["monthly_finances"],
        "activeInjuries": _STATE["active_injuries"],
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
        "warnings": _STATE["warnings"],
    }
    step_close()
    return json.dumps(payload)


def extract_pass_0_data(save_instance: Any, target_club_uid: int | None = None) -> str:
    """Standalone Pass 0 Groups 1–4 extractor over an already-opened fmsave handle.
    Strictly emits zero raw CA/PA or raw hidden numbers and obeys the 8.0s / 60 target budget."""
    start_time = time.monotonic()
    raw_players = _safe_call(lambda: list(save_instance.players()), "players", default=[]) or []
    user_club_uid = target_club_uid
    if user_club_uid is None:
        for p in raw_players:
            c_uid = _get_attr(p, "club_uid", None) or _get_attr(p, "team_id", None)
            if c_uid is not None:
                user_club_uid = c_uid
                break

    squad_players: list[dict[str, Any]] = []
    squad_uids: set[int] = set()
    for p in raw_players:
        c_uid = _get_attr(p, "club_uid", None) or _get_attr(p, "team_id", None)
        if c_uid != user_club_uid:
            continue
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

    raw_player_stats = _safe_call(lambda: list(save_instance.player_match_stats()), "player_match_stats", default=[]) or []
    player_match_stats: dict[int, list[dict[str, Any]]] = {}
    for stat in raw_player_stats:
        p_uid = _int(_get_attr(stat, "player_uid", 0), 0) or 0
        if p_uid in squad_uids and _get_attr(stat, "is_competitive", True):
            player_match_stats.setdefault(p_uid, []).append({
                "date": _iso(_get_attr(stat, "date", "")) or "",
                "rating": _float(_get_attr(stat, "rating", 6.0), 6.0) or 6.0,
                "goals": _int(_get_attr(stat, "goals", 0), 0) or 0,
                "assists": _int(_get_attr(stat, "assists", 0), 0) or 0,
            })
    for p_uid in player_match_stats:
        player_match_stats[p_uid] = player_match_stats[p_uid][-5:]

    raw_team_stats = _safe_call(lambda: list(save_instance.team_match_stats()), "team_match_stats", default=[]) or []
    team_match_stats = []
    for t_stat in raw_team_stats:
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

    raw_history = _safe_call(lambda: list(save_instance.player_season_history()), "player_season_history", default=[]) or []
    season_history: dict[int, list[dict[str, Any]]] = {}
    for h in raw_history:
        p_uid = _int(_get_attr(h, "player_uid", 0), 0) or 0
        if p_uid in squad_uids:
            season_history.setdefault(p_uid, []).append({
                "season": str(_get_attr(h, "season", "2026/27")),
                "club": str(_get_attr(h, "club_name", "Club")),
                "apps": _int(_get_attr(h, "apps", 0), 0) or 0,
                "goals": _int(_get_attr(h, "goals", 0), 0) or 0,
                "assists": _int(_get_attr(h, "assists", 0), 0) or 0,
                "avgRating": _float(_get_attr(h, "avg_rating", 6.0), 6.0) or 6.0,
            })

    raw_staff = _safe_call(lambda: list(save_instance.staff()), "staff", default=[]) or []
    club_staff = []
    for s in raw_staff:
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

    finances_history = _safe_call(lambda: list(save_instance.finances()), "finances", default=[]) or []
    monthly_finances = []
    for f in finances_history[-12:]:
        monthly_finances.append({
            "month": _iso(_get_attr(f, "month", "Jan")) or "Jan",
            "balance": _float(_get_attr(f, "balance", 0.0), 0.0) or 0.0,
            "wageSpend": _float(_get_attr(f, "wage_spend", 0.0), 0.0) or 0.0,
            "netCashflow": _float(_get_attr(f, "net_cashflow", 0.0), 0.0) or 0.0,
        })

    recruitment_targets = []
    for p in raw_players:
        if (time.monotonic() - start_time) >= SCOUT_BUDGET_SEC:
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

    return json.dumps({
        "clubUid": user_club_uid,
        "squad": squad_players,
        "playerMatchStats": player_match_stats,
        "teamMatchStats": team_match_stats,
        "playerSeasonHistory": season_history,
        "staff": club_staff,
        "monthlyFinances": monthly_finances,
        "facilities": _to_json_safe(_safe_call(lambda: save_instance.facilities(), "facilities", {"training": "Average", "youth": "Average"})),
        "sponsorships": _to_json_safe(_safe_call(lambda: save_instance.sponsorships(), "sponsorships", [])),
        "transferWindows": _to_json_safe(_safe_call(lambda: save_instance.transfer_windows(), "transfer_windows", {"isOpen": False})),
        "competitionRules": _to_json_safe(_safe_call(lambda: save_instance.competition_rules(), "competition_rules", {})),
        "selections": _to_json_safe(_safe_call(lambda: save_instance.selections(), "selections", {})),
        "setPieces": _to_json_safe(_safe_call(lambda: save_instance.set_pieces(), "set_pieces", {})),
        "training": _to_json_safe(_safe_call(lambda: save_instance.training(), "training", {})),
        "jobVacancies": _to_json_safe(_safe_call(lambda: save_instance.job_vacancies(), "job_vacancies", [])),
        "recruitmentTargets": recruitment_targets,
    })


def extract_fm_save_payload(path: str, preferred_club_hint: str = "", progress_cb: Any = None) -> dict[str, Any]:
    """Single-call extractor that executes the 6-step Pass 0 pipeline sequentially."""
    def _emit(step: str, label: str):
        if progress_cb:
            try:
                progress_cb(step, label)
            except Exception:
                pass

    _emit("Step 1/6", "Opening .fm save & reading game build...")
    step_open(path, preferred_club_hint)

    _emit("Step 2/6", "Extracting Group 1: 52 attributes, traits & Scout Report Badges...")
    step_players()

    _emit("Step 3/6", "Extracting Groups 3–4: staff, 12m finances, facilities & free-agent scan...")
    step_club_extras_and_release_gamedb()

    _emit("Step 4/6", "Extracting Group 2: season stats, Last-5 form & career history...")
    step_season_stats()

    _emit("Step 5/6", "Extracting Group 2: match results, team xG/shots/possession & schedule...")
    step_fixtures()

    _emit("Step 6/6", "Building live league standings & finalising...")
    payload_json = step_league_table_and_finish()
    return json.loads(payload_json)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fm-save-mapper.py <path_to_save.fm> [club_hint]")
        sys.exit(1)
    save_file = sys.argv[1]
    club_hint = sys.argv[2] if len(sys.argv) > 2 else ""
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
