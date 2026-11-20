"""FM27 Command Hub — Python FM26/FM27 .fm Save Extractor.

Runs inside Pyodide 3.14 (with native Python 3.14 zstd support) + fmsave==0.14.1
inside a browser Web Worker or via CLI.
- Mounts save directly with zero-copy WORKERFS (no memory copying).
- Holds ONE shared game_db section borrow across Steps 2-5 so game_db is decompressed ONCE.
- Scopes queries strictly to the managed club via Table.where(club_uid=...) with generator fallback.
- Releases game_db borrow and evicts player phase caches before fixtures & league tables (Step 6/6).
- Safely handles optional sections (tactics, mentoring, injuries) with warning capture.
"""

from __future__ import annotations

import gc
import json
import os
import sys
import warnings
from datetime import date, time as dt_time
from typing import Any

import fmsave

_STATE: dict[str, Any] = {
    "save": None,
    "game_db_cm": None,
    "meta": None,
    "club_uid": None,
    "club_name": None,
    "game_date": None,
    "squad_uids": set(),
    "players_out": [],
    "played_matches": [],
    "upcoming_fixtures": [],
    "league_standing": None,
    "finances": None,
    "active_injuries": [],
    "tactics": [],
    "mentoring": [],
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


def _label(coded: Any) -> str | None:
    if coded is None:
        return None
    lbl = getattr(coded, "label", None)
    if lbl is not None:
        name = getattr(lbl, "name", str(lbl))
        return None if name == "UNKNOWN" else name.replace("_", " ").title()
    return str(coded)


def _safe_call(fn: Any, label: str, default: Any = ()):
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = fn()
        for w in caught:
            msg = str(w.message).strip()
            if msg and msg not in _STATE["warnings"]:
                _STATE["warnings"].append(f"{label}: {msg}")
        return result
    except Exception as exc:  # noqa: BLE001
        _STATE["warnings"].append(f"Section '{label}' fallback ({type(exc).__name__})")
        return default


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
            # Keep club/competition/stage indexes needed by fixtures & league_tables
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
    _STATE["game_date"] = None
    _STATE["squad_uids"] = set()
    _STATE["players_out"] = []
    _STATE["played_matches"] = []
    _STATE["upcoming_fixtures"] = []
    _STATE["league_standing"] = None
    _STATE["finances"] = None
    _STATE["active_injuries"] = []
    _STATE["tactics"] = []
    _STATE["mentoring"] = []
    _STATE["warnings"] = []
    _STATE["comp_name_by_id"] = {}
    gc.collect()


def step_open(path: str, preferred_club_hint: str = "") -> str:
    step_close()
    save = fmsave.open(path)
    _STATE["save"] = save

    # Enter ONE shared game_db section borrow across Steps 2-4
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

    # Fallback to clubs() scan if no managed club found
    if club_uid is None:
        try:
            for c in save.clubs():
                cname = getattr(c, "name", "") or ""
                if hint_lower and hint_lower in cname.lower():
                    club_uid = getattr(c, "uid", None)
                    club_name = cname
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
    _STATE["game_date"] = game_date

    return json.dumps(meta)


def step_players() -> str:
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    club_name = _STATE["club_name"]
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
                if club_uid is not None and (getattr(p, "club_uid", None) == club_uid or getattr(p, "team_club_uid", None) == club_uid):
                    matches_club = True
                elif club_name_lower and getattr(p, "club_name", None) and p.club_name.lower() == club_name_lower:
                    matches_club = True
                if matches_club:
                    raw_players.append(p)
        except Exception as exc:
            _STATE["warnings"].append(f"players_scan: {type(exc).__name__}: {exc}")

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
        pos_str = ", ".join(nat_pos) if nat_pos else (", ".join(acc_pos) if acc_pos else "UTL")

        raw_cond = _int(getattr(p, "raw_condition", None))
        raw_sharp = _int(getattr(p, "raw_match_sharpness", None))
        cond_pct = round(raw_cond / 100) if raw_cond is not None and raw_cond > 100 else raw_cond
        sharp_pct = round(raw_sharp / 100) if raw_sharp is not None and raw_sharp > 100 else raw_sharp

        pos_ratings = None
        raw_pos_map = getattr(p, "positions", None) or getattr(p, "position_ratings", None)
        if raw_pos_map is not None:
            try:
                if isinstance(raw_pos_map, dict):
                    pos_ratings = {str(k): _int(v, 1) for k, v in raw_pos_map.items()}
                else:
                    pos_ratings = {}
                    for code in ("GK", "DL", "DC", "DR", "WBL", "DM", "WBR", "ML", "MC", "MR", "AML", "AMC", "AMR", "ST"):
                        val = getattr(raw_pos_map, code.lower(), None)
                        if val is None:
                            val = getattr(raw_pos_map, code, None)
                        if val is not None:
                            pos_ratings[code] = _int(val, 1)
                    if not pos_ratings:
                        pos_ratings = None
            except Exception:
                pos_ratings = None

        left_foot = _int(getattr(p, "left_foot", None) or (getattr(attrs, "left_foot", None) if attrs else None))
        right_foot = _int(getattr(p, "right_foot", None) or (getattr(attrs, "right_foot", None) if attrs else None))
        height_cm = _int(getattr(p, "height", None) or getattr(p, "height_cm", None))

        players_out.append({
            "uid": uid,
            "name": p.name,
            "position": pos_str,
            "age": _int(getattr(p, "age", None), 22),
            "ca": _int(getattr(ability, "current", None), 0),
            "pa": _int(getattr(ability, "potential", None), 0),
            "condition": cond_pct,
            "sharpness": sharp_pct,
            "leftFoot": left_foot,
            "rightFoot": right_foot,
            "heightCm": height_cm,
            "positionRatings": pos_ratings,
            "wagePw": _int(getattr(contract, "wage", None), 0) if contract else 0,
            "expires": (_dmy(getattr(contract, "end", None)) or "N/A") if contract else "N/A",
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
            "attributes": {
                "pace": _int(getattr(attrs, "pace", None), 10),
                "acceleration": _int(getattr(attrs, "acceleration", None), 10),
                "stamina": _int(getattr(attrs, "stamina", None), 10),
                "jumpingReach": _int(getattr(attrs, "jumping_reach", None), 10),
                "determination": _int(getattr(attrs, "determination", None), 10),
                "passing": _int(getattr(attrs, "passing", None), 10),
                "finishing": _int(getattr(attrs, "finishing", None), 10),
                "tackling": _int(getattr(attrs, "tackling", None), 10),
                "firstTouch": _int(getattr(attrs, "first_touch", None), 10),
                "decisions": _int(getattr(attrs, "decisions", None), 10),
                "workRate": _int(getattr(attrs, "work_rate", None), 10),
                "offTheBall": _int(getattr(attrs, "off_the_ball", None), 10),
                "heading": _int(getattr(attrs, "heading", None), 10),
                "corners": _int(getattr(attrs, "corners", None), 10),
                "crossing": _int(getattr(attrs, "crossing", None), 10),
                "technique": _int(getattr(attrs, "technique", None), 10),
                "dribbling": _int(getattr(attrs, "dribbling", None), 10),
                "vision": _int(getattr(attrs, "vision", None), 10),
                "composure": _int(getattr(attrs, "composure", None), 10),
                "positioning": _int(getattr(attrs, "positioning", None), 10),
                "marking": _int(getattr(attrs, "marking", None), 10),
                "strength": _int(getattr(attrs, "strength", None), 10),
                "leadership": _int(getattr(attrs, "leadership", None), 10),
                "teamwork": _int(getattr(attrs, "teamwork", None), 10),
            } if attrs else None,
            "hiddenPersonality": {
                "professionalism": _int(getattr(pers, "professionalism", None)),
                "ambition": _int(getattr(pers, "ambition", None)),
                "pressure": _int(getattr(pers, "pressure", None)),
                "temperament": _int(getattr(pers, "temperament", None)),
                "loyalty": _int(getattr(pers, "loyalty", None)),
            } if pers else None,
            "suspensionsCount": len(p.suspensions) if getattr(p, "suspensions", None) else 0,
        })

    _STATE["players_out"] = players_out
    _STATE["squad_uids"] = squad_uids
    return json.dumps({"playerCount": len(players_out)})


def step_club_extras_and_release_gamedb() -> str:
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    squad_uids = _STATE["squad_uids"]
    game_date = _STATE["game_date"]

    latest_finance = None
    if club_uid is not None:
        try:
            fin_table = save.finances()
            try:
                club_finances = list(fin_table.where(club_uid=club_uid))
            except Exception:
                club_finances = [fn for fn in fin_table if getattr(fn, "club_uid", None) == club_uid]
            if club_finances:
                club_finances.sort(key=lambda fn: fn.month or date(1900, 1, 1))
                f_last = club_finances[-1]
                latest_finance = {
                    "month": _iso(f_last.month),
                    "balance": _int(f_last.balance),
                    "wagePayrollWeekly": _int(f_last.wage_payroll_weekly),
                    "wageBudgetWeekly": _int(f_last.wage_budget_weekly),
                    "transferBudgetRemaining": _int(f_last.transfer_budget_remaining),
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
                staff_out.append({
                    "uid": _int(getattr(s, "uid", None), 0),
                    "name": s_name,
                    "role": _label(getattr(s, "role", None) or getattr(s, "job", None)) or "Coach",
                    "age": _int(getattr(s, "age", None), 35),
                    "nation": getattr(s, "nation_name", None) or getattr(s, "nationality", None) or "N/A",
                    "club": _STATE["meta"].get("clubName", ""),
                    "wagePw": _int(getattr(s_contract, "wage", None), 0) if s_contract else 0,
                    "expires": (_dmy(getattr(s_contract, "end", None)) or "N/A") if s_contract else "N/A",
                    "attributes": {
                        "attacking": _int(getattr(s_attrs, "attacking", None), 10),
                        "defending": _int(getattr(s_attrs, "defending", None), 10),
                        "fitness": _int(getattr(s_attrs, "fitness", None), 10),
                        "goalkeeping": _int(getattr(s_attrs, "goalkeeping", None), 10),
                        "mental": _int(getattr(s_attrs, "mental", None), 10),
                        "possession": _int(getattr(s_attrs, "possession", None), 10),
                        "set_pieces": _int(getattr(s_attrs, "set_pieces", None), 10),
                        "tactical": _int(getattr(s_attrs, "tactical", None), 10),
                        "technical": _int(getattr(s_attrs, "technical", None), 10),
                        "working_with_youngsters": _int(getattr(s_attrs, "working_with_youngsters", None), 10),
                        "adaptability": _int(getattr(s_attrs, "adaptability", None), 10),
                        "authority": _int(getattr(s_attrs, "authority", None), 10),
                        "determination": _int(getattr(s_attrs, "determination", None), 10),
                        "judging_player_ability": _int(getattr(s_attrs, "judging_player_ability", None), 10),
                        "judging_player_potential": _int(getattr(s_attrs, "judging_player_potential", None), 10),
                        "judging_staff_ability": _int(getattr(s_attrs, "judging_staff_ability", None), 10),
                        "man_management": _int(getattr(s_attrs, "man_management", None), 10),
                        "motivating": _int(getattr(s_attrs, "motivating", None), 10),
                        "negotiating": _int(getattr(s_attrs, "negotiating", None), 10),
                        "physiotherapy": _int(getattr(s_attrs, "physiotherapy", None), 10),
                        "sports_science": _int(getattr(s_attrs, "sports_science", None), 10),
                        "tactical_knowledge": _int(getattr(s_attrs, "tactical_knowledge", None), 10),
                        "analysing_data": _int(getattr(s_attrs, "analysing_data", None), 10),
                    } if s_attrs else None,
                })
    except Exception as exc:
        _STATE["warnings"].append(f"staff: {type(exc).__name__}")

    _STATE["finances"] = latest_finance
    _STATE["active_injuries"] = active_injuries[:15]
    _STATE["tactics"] = tactics_out[:3]
    _STATE["mentoring"] = mentoring_out[:5]
    _STATE["staff_out"] = staff_out

    # Release game_db section borrow & heavy player caches to free RAM
    _exit_game_db_borrow()
    _evict_finished_player_phase_cache(save)

    return json.dumps({
        "injuries": len(_STATE["active_injuries"]),
        "tactics": len(_STATE["tactics"]),
        "mentoring": len(_STATE["mentoring"]),
        "staff": len(staff_out),
    })


def step_season_stats() -> str:
    save = _STATE["save"]
    squad_uids = _STATE["squad_uids"]
    players_out = _STATE["players_out"]
    if not squad_uids:
        return json.dumps({"matchedStats": 0})

    overall_by_uid: dict[int, Any] = {}
    league_by_uid: dict[int, Any] = {}
    try:
        for row in save.player_season_stats():
            p_uid = getattr(row, "player_uid", None)
            if p_uid not in squad_uids:
                continue
            kind_str = str(getattr(row, "kind", "")).lower()
            mins = getattr(row, "minutes", 0) or 0
            if "overall" in kind_str:
                existing = overall_by_uid.get(p_uid)
                if existing is None or mins > (getattr(existing, "minutes", 0) or 0):
                    overall_by_uid[p_uid] = row
            elif "league" in kind_str:
                existing = league_by_uid.get(p_uid)
                if existing is None or mins > (getattr(existing, "minutes", 0) or 0):
                    league_by_uid[p_uid] = row
    except Exception as exc:
        _STATE["warnings"].append(f"player_season_stats: {type(exc).__name__}")

    stats_by_uid = overall_by_uid if overall_by_uid else league_by_uid
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

    players_out.sort(key=lambda x: (x["teamSlot"] or 0, -(x["minutes"] or 0), -(x["ca"] or 0)))
    gc.collect()
    return json.dumps({"matchedStats": matched})


def step_fixtures() -> str:
    save = _STATE["save"]
    club_uid = _STATE["club_uid"]
    game_date = _STATE["game_date"]
    comp_map = _STATE.get("comp_name_by_id", {})

    club_fixtures = []
    if club_uid is not None:
        try:
            for f in save.fixtures():
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
            played_matches.append({
                "dateIso": _iso(f.date),
                "dateDmy": _dmy(f.date),
                "competitionId": comp_id,
                "competition": comp_name or "League / Cup",
                "opponent": opp_name or "Opponent",
                "venue": "H" if is_home else "A",
                "result": res_char,
                "score": f"{gf} - {ga}",
                "xGFor": None,
                "xGAgainst": None,
                "possession": None,
                "passCompletion": None,
                "shotsFor": None,
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

        # Tag fixtures accurately with the league name
        if league_comp_id is not None:
            for m in _STATE["played_matches"]:
                if m.get("competition") == "League / Cup":
                    m["competition"] = league_comp_name if m.get("competitionId") == league_comp_id else "Cup / Friendly"
            for uf in _STATE["upcoming_fixtures"]:
                if uf.get("competition") == "League / Cup":
                    uf["competition"] = league_comp_name if uf.get("competitionId") == league_comp_id else "Cup / Friendly"

    payload = {
        "meta": _STATE["meta"],
        "players": _STATE["players_out"],
        "staff": _STATE.get("staff_out", []),
        "playedMatches": _STATE["played_matches"],
        "upcomingFixtures": _STATE["upcoming_fixtures"],
        "leagueStanding": league_standing,
        "finances": _STATE["finances"],
        "activeInjuries": _STATE["active_injuries"],
        "tactics": _STATE["tactics"],
        "mentoring": _STATE["mentoring"],
        "warnings": _STATE["warnings"],
    }
    step_close()
    return json.dumps(payload)


def extract_fm_save_payload(path: str, preferred_club_hint: str = "", progress_cb: Any = None) -> dict[str, Any]:
    """Single-call extractor that executes the 6-step pipeline sequentially."""
    def _emit(step: str, label: str):
        if progress_cb:
            try:
                progress_cb(step, label)
            except Exception:
                pass

    _emit("Step 1/6", "Opening .fm save & reading game build...")
    step_open(path, preferred_club_hint)

    _emit("Step 2/6", "Extracting squad players, ratings & attributes...")
    step_players()

    _emit("Step 3/6", "Reading finances, injuries & releasing game_db...")
    step_club_extras_and_release_gamedb()

    _emit("Step 4/6", "Matching player season stats & ratings...")
    step_season_stats()

    _emit("Step 5/6", "Extracting recent match results & schedule...")
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
    print("\n--- EXTRACTION COMPLETE ---")
    print(f"Game: {payload['meta']['game']} Build: {payload['meta']['build']} Date: {payload['meta']['gameDateDmy']}")
    print(f"Managed Club: {payload['meta']['clubName']} (UID: {payload['meta']['clubUid']})")
    print(f"Squad Count: {len(payload['players'])} players")
    print(f"Played Matches: {len(payload['playedMatches'])} | Upcoming: {len(payload['upcomingFixtures'])}")
    if payload.get("leagueStanding"):
        ls = payload["leagueStanding"]
        print(f"League: {ls['competitionName']} Pos: {ls['position']}/{ls['totalTeams']} (Pts: {ls['points']} Pld: {ls['played']})")
    if payload.get("finances"):
        print(f"Finances Balance: £{payload['finances']['balance']:,} (Wage budget: £{payload['finances']['wageBudgetWeekly']:,}/wk)")
    if payload.get("warnings"):
        print(f"Warnings ({len(payload['warnings'])}):", payload["warnings"][:3])
