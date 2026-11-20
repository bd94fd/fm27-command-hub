"""FM27 Command Hub — Unified FM26/FM27 .fm Save Extraction Engine.

Runs inside Pyodide 3.14 (native zstd) alongside `fmsave==0.14.1` in a browser
Web Worker over zero-copy WORKERFS (`/mnt`).

Designed for mobile & desktop reliability:
- Holds ONE shared `ctx.section("game_db")` borrow across Steps 2–4 so the
  multi-hundred-MB `game_db` section is decompressed once.
- Uses club-scoped `.where(club_uid=...)` queries when `scope == "managed_only"`.
- Evicts heavy player/stat/staff/injury/finance/tactic/training caches and runs
  `gc.collect()` BEFORE streaming `span_records` (fixtures & league tables) in Step 6/6.
- Never fabricates missing match stats (e.g. match xG / possession remain `None`).
"""

from __future__ import annotations

import gc
import json
import warnings
from datetime import date, time
from typing import Any

import fmsave


_KEEP_CACHE_TOKENS = ("club", "team", "comp", "stage", "stadium", "managed", "gate")

_SCOPE_LIMITS: dict[str, tuple[int, int, int]] = {
    "managed_only": (0, 0, 40),
    "scouting_pool": (1500, 320, 220),
    "extended_pool": (3200, 500, 350),
}


def _default_state() -> dict[str, Any]:
    return {
        "save": None,
        "game_db_cm": None,
        "scope": "managed_only",
        "club_hint": "",
        "info": None,
        "meta": None,
        "managed_club_dict": None,
        "managed_club_uid": None,
        "managed_club_uids": set(),
        "managed_club_name": None,
        "manager_name": None,
        "game_date": None,
        "nation_db_by_id": {},
        "players_out": [],
        "squad_uids": set(),
        "referenced_club_uids": set(),
        "active_injuries": [],
        "staff_out": [],
        "clubs_out": [],
        "finances_summary": None,
        "tactics_out": [],
        "mentoring_out": [],
        "total_players_in_save": 0,
        "total_staff_in_save": 0,
        "total_clubs_in_save": 0,
        "managed_squad_count": 0,
        "managed_staff_count": 0,
        "warnings": [],
    }


_STATE: dict[str, Any] = _default_state()


def _iso(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, (date, time)):
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
    except Exception:  # noqa: BLE001
        return default


def _label_name(coded: Any) -> str | None:
    if coded is None:
        return None
    label = getattr(coded, "label", None)
    if label is None:
        return None
    name = getattr(label, "name", None)
    if not name or name == "UNKNOWN":
        return None
    return str(name)


def _label_title(coded: Any) -> str | None:
    raw = _label_name(coded)
    return raw.replace("_", " ").title() if raw else None


def _friendly_error(error: BaseException) -> tuple[str, str]:
    kind = type(error).__name__
    if isinstance(error, fmsave.NotAFmSaveError):
        return (
            "This file is not a valid Football Manager save. Choose a .fm file from your Football Manager games folder.",
            kind,
        )
    if isinstance(error, fmsave.UnsupportedGameError):
        return (
            "This .fm save is from a Football Manager version or build not yet supported by fmsave. Supported builds include FM26 and FM27.",
            kind,
        )
    if isinstance(error, fmsave.CorruptSaveError):
        return (
            "This .fm save appears incomplete or damaged. Make sure the game finished saving and try again.",
            kind,
        )
    if isinstance(error, fmsave.SaveChangedError):
        return (
            "The .fm file changed while being read. Wait for Football Manager to finish saving and re-select the file.",
            kind,
        )
    if isinstance(error, MemoryError):
        return (
            "The browser ran out of memory reading this save. Try closing other browser tabs or choosing 'Managed Club Only' scope.",
            kind,
        )
    if isinstance(error, OSError):
        return (
            "Could not read the .fm file from disk. Try re-selecting it or copying the save first.",
            kind,
        )
    return (f"Could not read this .fm save ({kind}): {error}", kind)


def _add_warning(warning_list: list[str], message: str) -> None:
    cleaned = message.strip()
    if cleaned and cleaned not in warning_list:
        warning_list.append(cleaned)


def _safe_read(fn: Any, label: str, warning_list: list[str], default: Any = ()) -> Any:
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            result = fn()
        for w in caught:
            msg = str(w.message).strip()
            if msg:
                _add_warning(warning_list, f"{label}: {msg}")
        return result
    except Exception as exc:  # noqa: BLE001
        _add_warning(
            warning_list,
            f"Optional section '{label}' unavailable ({type(exc).__name__}).",
        )
        return default


def _exit_game_db_borrow() -> None:
    cm = _STATE.get("game_db_cm")
    if cm is not None:
        try:
            cm.__exit__(None, None, None)
        except Exception:  # noqa: BLE001
            pass
        _STATE["game_db_cm"] = None


def step_close() -> str:
    """Release any active section borrow, close the save file, and reclaim memory."""
    _exit_game_db_borrow()
    save = _STATE.get("save")
    if save is not None:
        try:
            save.close()
        except Exception:  # noqa: BLE001
            pass
    _STATE.clear()
    _STATE.update(_default_state())
    gc.collect()
    return json.dumps({"ok": True})


def step_open(
    save_path: str,
    scope: str = "managed_only",
    club_hint: str = "",
) -> str:
    """Step 2/6: Open .fm save, borrow shared game_db section, detect club, read meta & nations."""
    step_close()
    norm_scope = scope if scope in _SCOPE_LIMITS else "managed_only"
    hint = (club_hint or "").strip()
    _STATE["scope"] = norm_scope
    _STATE["club_hint"] = hint
    warnings_list: list[str] = _STATE["warnings"]

    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            save = fmsave.open(save_path)
        for w in caught:
            msg = str(w.message).strip()
            if msg:
                _add_warning(warnings_list, f"open: {msg}")
        _STATE["save"] = save

        # Hold ONE shared game_db section borrow across Steps 2-4 so game_db is decompressed ONCE
        ctx = getattr(save, "_context", None)
        if ctx is not None and hasattr(ctx, "section"):
            try:
                cm = ctx.section("game_db")
                cm.__enter__()
                _STATE["game_db_cm"] = cm
            except Exception as exc:  # noqa: BLE001
                _STATE["game_db_cm"] = None
                _add_warning(warnings_list, f"game_db borrow fallback ({type(exc).__name__}).")

        info = save.info
        _STATE["info"] = info

        managed_rows = list(_safe_read(save.managed_clubs, "managed_clubs", warnings_list))
        managed_club_uids = {
            int(m.club_uid) for m in managed_rows if getattr(m, "club_uid", None) is not None
        }

        primary_managed = None
        if managed_rows:
            if hint:
                hint_lower = hint.lower()
                for mc in managed_rows:
                    cname = (getattr(mc, "club_name", None) or "").lower()
                    sname = (getattr(mc, "club_short_name", None) or "").lower()
                    if hint_lower in cname or hint_lower in sname:
                        primary_managed = mc
                        break
            if primary_managed is None:
                primary_managed = managed_rows[0]

        club_uid = (
            int(primary_managed.club_uid)
            if primary_managed is not None and primary_managed.club_uid is not None
            else None
        )
        club_name = getattr(primary_managed, "club_name", None) if primary_managed else None
        club_short_name = (
            getattr(primary_managed, "club_short_name", None) if primary_managed else None
        )
        manager_name = getattr(primary_managed, "manager_name", None) if primary_managed else None
        club_balance = (
            _int(getattr(primary_managed, "balance", None)) if primary_managed else None
        )

        # Fallback: if ManagedClub.manager_name is None, resolve via manager_staff_uid
        if not manager_name and primary_managed is not None:
            mgr_uid = getattr(primary_managed, "manager_staff_uid", None)
            if mgr_uid is not None:
                mgr_staff = _safe_read(
                    lambda: save.staff().by_uid(int(mgr_uid)),
                    "manager_staff_lookup",
                    warnings_list,
                    default=None,
                )
                if mgr_staff is not None:
                    manager_name = (
                        getattr(mgr_staff, "name", None)
                        or getattr(mgr_staff, "full_name", None)
                        or getattr(mgr_staff, "common_name", None)
                    )

        # Fallback if save has no managed_clubs entries but club_hint was provided
        if club_uid is None and hint:
            hint_lower = hint.lower()
            clubs_scan = _safe_read(save.clubs, "clubs_hint_lookup", warnings_list)
            for c in clubs_scan:
                cname = getattr(c, "name", "") or ""
                if hint_lower in cname.lower():
                    club_uid = int(c.uid)
                    club_name = cname
                    club_short_name = getattr(c, "short_name", None) or cname
                    managed_club_uids.add(club_uid)
                    break

        nations_rows = list(_safe_read(save.nations, "nations", warnings_list))
        nation_db_by_id = {
            int(n.nation_id): int(n.database_id)
            for n in nations_rows
            if getattr(n, "nation_id", None) is not None
            and getattr(n, "database_id", None) is not None
        }

        game_date = getattr(info, "game_date", None)
        game_date_iso = _iso(game_date)
        game_date_dmy = _dmy(game_date)

        meta = {
            "game": getattr(info, "game", "FM"),
            "build": str(getattr(info, "build", "unknown")),
            "knownBuild": bool(getattr(info, "known_build", True)),
            "saveName": getattr(info, "save_name", None) or getattr(info, "file_name", None) or "",
            "gameDate": game_date_iso,
            "gameDateIso": game_date_iso,
            "gameDateDmy": game_date_dmy,
            "clubUid": club_uid,
            "clubName": club_name or "Managed Club",
            "managerName": manager_name or "Manager",
            "balance": club_balance,
            "fmsaveVersion": fmsave.__version__,
            "scope": norm_scope,
        }

        managed_club_dict = (
            {
                "uid": club_uid,
                "name": club_name or "Managed Club",
                "shortName": club_short_name or club_name or "Managed Club",
                "managerName": manager_name or "Manager",
                "balance": club_balance,
            }
            if club_uid is not None
            else None
        )

        _STATE["meta"] = meta
        _STATE["managed_club_dict"] = managed_club_dict
        _STATE["managed_club_uid"] = club_uid
        _STATE["managed_club_uids"] = managed_club_uids
        _STATE["managed_club_name"] = club_name
        _STATE["manager_name"] = manager_name
        _STATE["game_date"] = game_date
        _STATE["nation_db_by_id"] = nation_db_by_id

        return json.dumps({"ok": True, "meta": meta, "managedClub": managed_club_dict})
    except Exception as exc:  # noqa: BLE001
        msg, kind = _friendly_error(exc)
        step_close()
        return json.dumps({"ok": False, "error": msg, "kind": kind})


def _player_dict(
    p: Any,
    nation_db_by_id: dict[int, int],
    active_injury_by_uid: dict[int, dict[str, Any]],
    stats_row: Any,
    managed_club_uids: set[int],
) -> dict[str, Any]:
    uid = int(p.uid)
    attrs = getattr(p, "attributes", None)
    pers = getattr(p, "personality", None)
    pos = getattr(p, "positions", None)
    contract = getattr(p, "contract", None)
    ability = getattr(p, "ability", None)

    ca = int(ability.current) if ability and ability.current is not None else 0
    pa_raw = ability.potential if ability and ability.potential is not None else ca
    pa = int(pa_raw) if pa_raw and pa_raw > 0 else ca

    club_uid = int(p.club_uid) if getattr(p, "club_uid", None) is not None else None
    loan_parent_uid = (
        int(p.loan_parent_club_uid)
        if getattr(p, "loan_parent_club_uid", None) is not None
        else None
    )
    club_name = getattr(p, "club_name", None) or ""
    loan_parent = getattr(p, "loan_parent_club_name", None) or (
        getattr(contract, "loan_parent_club_name", None) if contract else None
    )
    on_loan = bool(getattr(p, "on_loan", False)) or bool(
        contract and getattr(contract, "on_loan", False)
    )

    if on_loan and loan_parent:
        owning_club = loan_parent
        playing_club = club_name or loan_parent
    else:
        owning_club = club_name
        playing_club = club_name

    wage = 0
    contract_start = None
    contract_end = None
    contract_expires_dmy = "N/A"
    squad_status = ""
    release_clauses: list[dict[str, Any]] = []
    if contract is not None:
        if getattr(contract, "wage", None) is not None:
            wage = int(contract.wage)
        contract_start = _iso(getattr(contract, "start", None))
        end_date = getattr(contract, "end", None)
        contract_end = _iso(end_date)
        contract_expires_dmy = _dmy(end_date) or "N/A"
        squad_status = _label_name(getattr(contract, "squad_status", None)) or ""
        for cl in getattr(contract, "clauses", ()) or ():
            ck = _label_name(getattr(cl, "kind", None))
            cv = getattr(cl, "value", None)
            if ck:
                release_clauses.append({"kind": ck, "value": int(cv) if cv is not None else None})

    inj = active_injury_by_uid.get(uid)
    nation_id = getattr(p, "nation_id", None)
    club_nation_id = getattr(p, "club_nation_id", None)
    nation_db_id = nation_db_by_id.get(nation_id) if nation_id is not None else None
    club_nation_db_id = nation_db_by_id.get(club_nation_id) if club_nation_id is not None else None

    nat_pos = list(getattr(p, "natural_positions", None) or [])
    acc_pos = list(getattr(p, "accomplished_positions", None) or [])
    pos_str = ", ".join(nat_pos) if nat_pos else (", ".join(acc_pos) if acc_pos else "UTL")

    raw_cond = _int(getattr(p, "raw_condition", None))
    raw_sharp = _int(getattr(p, "raw_match_sharpness", None))
    cond_pct = round(raw_cond / 100) if raw_cond is not None and raw_cond > 100 else raw_cond
    sharp_pct = round(raw_sharp / 100) if raw_sharp is not None and raw_sharp > 100 else raw_sharp

    # Season stats
    apps = "0"
    minutes = 0
    rating: float | None = None
    goals = 0
    xg = 0.0
    xg_per90 = 0.0
    assists = 0
    xa = 0.0
    xa_per90 = 0.0
    drb_per90 = 0.0
    pr_passes_per90 = 0.0
    hdr_pct = 0
    int_per90 = 0.0
    tck_pct = 0
    distance_km = 0.0
    yellow_cards = 0
    red_cards = 0

    if stats_row is not None:
        minutes = int(stats_row.minutes) if stats_row.minutes is not None else 0
        per90 = (90.0 / minutes) if minutes > 0 else 0.0
        starts = int(stats_row.starts) if stats_row.starts is not None else 0
        subs = (
            int(stats_row.substitute_appearances)
            if stats_row.substitute_appearances is not None
            else 0
        )
        hdr_att = stats_row.aerial_challenges_attempted or 0
        hdr_won = stats_row.headers_won or 0
        tck_att = stats_row.tackles_attempted or 0
        tck_won = stats_row.tackles_completed or 0

        apps = f"{starts} ({subs})" if subs > 0 else str(starts)
        rating = (
            round(float(stats_row.average_rating), 2)
            if stats_row.average_rating is not None
            else None
        )
        goals = int(stats_row.goals or 0)
        xg = round(float(stats_row.expected_goals or 0.0), 2)
        xg_per90 = round(float(stats_row.expected_goals or 0.0) * per90, 2)
        assists = int(stats_row.assists or 0)
        xa = round(float(stats_row.expected_assists or 0.0), 2)
        xa_per90 = round(float(stats_row.expected_assists or 0.0) * per90, 2)
        drb_per90 = round(float(stats_row.dribbles or 0) * per90, 2)
        pr_passes_per90 = round(float(stats_row.progressive_passes or 0) * per90, 2)
        hdr_pct = round((hdr_won / hdr_att) * 100) if hdr_att > 0 else 0
        int_per90 = round(float(stats_row.interceptions or 0) * per90, 2)
        tck_pct = round((tck_won / tck_att) * 100) if tck_att > 0 else 0
        distance_km = round(float(stats_row.distance_km or 0.0), 1)
        yellow_cards = int(stats_row.yellow_cards or 0)
        red_cards = int(stats_row.red_cards or 0)

    is_managed = (
        (club_uid is not None and club_uid in managed_club_uids)
        or (loan_parent_uid is not None and loan_parent_uid in managed_club_uids)
    )

    rep_obj = getattr(p, "reputation", None)
    suspensions = getattr(p, "suspensions", None)

    return {
        "uid": uid,
        "uniqueId": int(p.unique_id) if getattr(p, "unique_id", None) is not None else uid,
        "name": (
            getattr(p, "name", None)
            or getattr(p, "common_name", None)
            or getattr(p, "full_name", None)
            or f"Player {uid}"
        ),
        "position": pos_str,
        "age": int(p.age) if getattr(p, "age", None) is not None else 0,
        "dob": _iso(getattr(p, "birth_date", None)),
        "heightCm": int(p.height_cm) if getattr(p, "height_cm", None) else 180,
        "nationDbId": nation_db_id,
        "clubNationDbId": club_nation_db_id,
        "clubUid": club_uid,
        "loanParentClubUid": loan_parent_uid,
        "club": owning_club,
        "playingClub": playing_club,
        "onLoan": on_loan,
        "isManaged": is_managed,
        "teamSlot": _int(getattr(p, "team_slot", None), 0),
        "ca": ca,
        "pa": pa,
        "condition": cond_pct,
        "sharpness": sharp_pct,
        "salaryWeekly": wage,
        "wagePw": wage,
        "estimatedValue": int(p.transfer_value) if getattr(p, "transfer_value", None) is not None else 0,
        "contractStart": contract_start,
        "contractEnd": contract_end,
        "expires": contract_expires_dmy,
        "squadStatus": squad_status,
        "clauses": release_clauses,
        "leftFoot": int(p.left_foot) if getattr(p, "left_foot", None) is not None else 10,
        "rightFoot": int(p.right_foot) if getattr(p, "right_foot", None) is not None else 15,
        "reputationCurrent": int(rep_obj.current) if rep_obj and rep_obj.current is not None else 0,
        "injured": inj is not None,
        "injury": inj["typeName"] if inj else None,
        "suspensionsCount": len(suspensions) if suspensions else 0,
        "apps": apps,
        "minutes": minutes,
        "rating": rating,
        "goals": goals,
        "xG": xg,
        "xGPer90": xg_per90,
        "assists": assists,
        "xA": xa,
        "xAPer90": xa_per90,
        "drbPer90": drb_per90,
        "prPassesPer90": pr_passes_per90,
        "hdrPct": hdr_pct,
        "intPer90": int_per90,
        "tckPct": tck_pct,
        "distanceKm": distance_km,
        "yellowCards": yellow_cards,
        "redCards": red_cards,
        "positions": {
            "gk": int(pos.gk),
            "dl": int(pos.dl),
            "dc": int(pos.dc),
            "dr": int(pos.dr),
            "wbl": int(pos.wbl),
            "wbr": int(pos.wbr),
            "dm": int(pos.dm),
            "ml": int(pos.ml),
            "mc": int(pos.mc),
            "mr": int(pos.mr),
            "aml": int(pos.aml),
            "amc": int(pos.amc),
            "amr": int(pos.amr),
            "st": int(pos.stc),
        }
        if pos is not None
        else {
            "gk": 1,
            "dl": 1,
            "dc": 1,
            "dr": 1,
            "wbl": 1,
            "wbr": 1,
            "dm": 1,
            "ml": 1,
            "mc": 1,
            "mr": 1,
            "aml": 1,
            "amc": 1,
            "amr": 1,
            "st": 1,
        },
        "attributes": {
            "crossing": int(attrs.crossing),
            "dribbling": int(attrs.dribbling),
            "finishing": int(attrs.finishing),
            "first_touch": int(attrs.first_touch),
            "heading": int(attrs.heading),
            "long_shots": int(attrs.long_shots),
            "marking": int(attrs.marking),
            "passing": int(attrs.passing),
            "tackling": int(attrs.tackling),
            "technique": int(attrs.technique),
            "corners": int(attrs.corners),
            "free_kick_taking": int(attrs.free_kick_taking),
            "long_throws": int(attrs.long_throws),
            "penalty_taking": int(attrs.penalty_taking),
            "aggression": int(attrs.aggression),
            "anticipation": int(attrs.anticipation),
            "bravery": int(attrs.bravery),
            "composure": int(attrs.composure),
            "concentration": int(attrs.concentration),
            "decisions": int(attrs.decisions),
            "determination": int(attrs.determination),
            "flair": int(attrs.flair),
            "leadership": int(attrs.leadership),
            "off_the_ball": int(attrs.off_the_ball),
            "positioning": int(attrs.positioning),
            "teamwork": int(attrs.teamwork),
            "vision": int(attrs.vision),
            "work_rate": int(attrs.work_rate),
            "acceleration": int(attrs.acceleration),
            "agility": int(attrs.agility),
            "balance": int(attrs.balance),
            "jumping_reach": int(attrs.jumping_reach),
            "natural_fitness": int(attrs.natural_fitness),
            "pace": int(attrs.pace),
            "stamina": int(attrs.stamina),
            "strength": int(attrs.strength),
            "aerial_reach": int(attrs.aerial_reach),
            "command_of_area": int(attrs.command_of_area),
            "communication": int(attrs.communication),
            "eccentricity": int(attrs.eccentricity),
            "handling": int(attrs.handling),
            "kicking": int(attrs.kicking),
            "one_on_ones": int(attrs.one_on_ones),
            "punching": int(attrs.punching),
            "reflexes": int(attrs.reflexes),
            "rushing_out": int(attrs.rushing_out),
            "throwing": int(attrs.throwing),
            "adaptability": int(pers.adaptability) if pers else 10,
            "ambition": int(pers.ambition) if pers else 10,
            "consistency": int(attrs.consistency),
            "controversy": int(pers.controversy) if pers else 5,
            "dirtiness": int(attrs.dirtiness),
            "important_matches": int(attrs.important_matches),
            "injury_proneness": int(attrs.injury_proneness),
            "loyalty": int(pers.loyalty) if pers else 10,
            "pressure": int(pers.pressure) if pers else 10,
            "professionalism": int(pers.professionalism) if pers else 10,
            "sportsmanship": int(pers.sportsmanship) if pers else 10,
            "temperament": int(pers.temperament) if pers else 10,
            "versatility": int(attrs.versatility),
        }
        if attrs is not None
        else None,
    }


def step_players_and_stats() -> str:
    """Step 3/6: Extract players (club-scoped or scouting pool), season stats, and injuries."""
    save = _STATE.get("save")
    if save is None:
        return json.dumps({"ok": False, "error": "Save is not open.", "kind": "StateError"})

    scope = _STATE["scope"]
    managed_club_uids: set[int] = _STATE["managed_club_uids"]
    nation_db_by_id: dict[int, int] = _STATE["nation_db_by_id"]
    game_date = _STATE["game_date"]
    warnings_list: list[str] = _STATE["warnings"]

    max_extra_players, _, _ = _SCOPE_LIMITS.get(scope, _SCOPE_LIMITS["managed_only"])

    try:
        # 1. Players (club-scoped query when scope == "managed_only")
        managed_players: list[Any] = []
        other_players: list[Any] = []
        seen_uids: set[int] = set()

        if scope == "managed_only" and managed_club_uids:
            for cuid in sorted(managed_club_uids):
                for p in save.players().where(club_uid=cuid):
                    if not (p.name or p.common_name or p.full_name):
                        continue
                    uid = int(p.uid)
                    if uid not in seen_uids:
                        seen_uids.add(uid)
                        managed_players.append(p)
                for p in save.players().where(loan_parent_club_uid=cuid):
                    if not (p.name or p.common_name or p.full_name):
                        continue
                    uid = int(p.uid)
                    if uid not in seen_uids:
                        seen_uids.add(uid)
                        managed_players.append(p)
            total_players_in_save = len(managed_players)
        else:
            all_players = list(save.players())
            total_players_in_save = len(all_players)
            for p in all_players:
                if not (p.name or p.common_name or p.full_name):
                    continue
                is_mine = (
                    (p.club_uid is not None and int(p.club_uid) in managed_club_uids)
                    or (
                        p.loan_parent_club_uid is not None
                        and int(p.loan_parent_club_uid) in managed_club_uids
                    )
                )
                if is_mine:
                    managed_players.append(p)
                elif max_extra_players > 0:
                    other_players.append(p)

            if max_extra_players > 0 and len(other_players) > max_extra_players:
                other_players.sort(
                    key=lambda p: (
                        max(
                            int(p.ability.current or 0) if p.ability else 0,
                            int(p.ability.potential or 0) if p.ability else 0,
                        ),
                        int(p.ability.current or 0) if p.ability else 0,
                    ),
                    reverse=True,
                )
                other_players = other_players[:max_extra_players]

        selected_players = managed_players + other_players
        selected_uids = {int(p.uid) for p in selected_players}
        squad_uids = {int(p.uid) for p in managed_players}

        # 2. Season stats (club-scoped when managed_only)
        overall_by_uid: dict[int, Any] = {}
        league_by_uid: dict[int, Any] = {}

        def _consume_stats(rows: Any) -> None:
            for row in rows:
                p_uid = getattr(row, "player_uid", None)
                if p_uid is None or int(p_uid) not in selected_uids:
                    continue
                uid_int = int(p_uid)
                kind_obj = getattr(row, "kind", None)
                kind_val = getattr(kind_obj, "value", None)
                if kind_val is None:
                    kind_str = str(kind_obj or "").lower()
                    if kind_str.endswith(".overall") or kind_str == "overall":
                        kind_val = "overall"
                    elif kind_str.endswith(".league") or kind_str == "league":
                        kind_val = "league"
                mins = getattr(row, "minutes", 0) or 0
                if kind_val == "overall":
                    existing = overall_by_uid.get(uid_int)
                    if existing is None or mins > (getattr(existing, "minutes", 0) or 0):
                        overall_by_uid[uid_int] = row
                elif kind_val == "league":
                    existing = league_by_uid.get(uid_int)
                    if existing is None or mins > (getattr(existing, "minutes", 0) or 0):
                        league_by_uid[uid_int] = row

        if scope == "managed_only" and managed_club_uids:
            for cuid in sorted(managed_club_uids):
                rows = _safe_read(
                    lambda c=cuid: list(save.player_season_stats().where(club_uid=c)),
                    "player_season_stats",
                    warnings_list,
                )
                _consume_stats(rows)
        else:
            rows = _safe_read(
                save.player_season_stats,
                "player_season_stats",
                warnings_list,
            )
            _consume_stats(rows)

        # 3. Injuries (TYPED rows carry active injury type_name with club_uid=None; HISTORY rows carry club_uid)
        active_injury_by_uid: dict[int, dict[str, Any]] = {}
        club_active_injuries: list[dict[str, Any]] = []
        club_inj_seen: set[int] = set()

        # Always read TYPED injuries (small table ~1-2k rows) to identify active injuries cleanly
        typed_rows = _safe_read(
            lambda: list(save.injuries().where(kind=fmsave.InjuryRecordKind.TYPED)),
            "injuries_typed",
            warnings_list,
        )
        for inj in typed_rows:
            p_uid = getattr(inj, "player_uid", None)
            if p_uid is None:
                continue
            uid_int = int(p_uid)
            if uid_int not in selected_uids:
                continue
            inj_entry = {
                "playerUid": uid_int,
                "playerName": getattr(inj, "player_name", None),
                "typeName": getattr(inj, "type_name", None) or "Injury",
                "date": _dmy(getattr(inj, "date", None)),
                "dateIso": _iso(getattr(inj, "date", None)),
                "severity": _label_title(getattr(inj, "severity", None)),
                "cause": _label_title(getattr(inj, "cause", None)),
                "kind": "typed",
            }
            active_injury_by_uid[uid_int] = inj_entry
            if uid_int in squad_uids and uid_int not in club_inj_seen:
                club_inj_seen.add(uid_int)
                club_active_injuries.append(inj_entry)

        # Also check recent club HISTORY injuries (<= 30 days from game_date) for managed club context
        if managed_club_uids:
            for cuid in sorted(managed_club_uids):
                hist_rows = _safe_read(
                    lambda c=cuid: list(save.injuries().where(club_uid=c)),
                    "injuries_history",
                    warnings_list,
                )
                for inj in hist_rows:
                    p_uid = getattr(inj, "player_uid", None)
                    uid_int = int(p_uid) if p_uid is not None else None
                    inj_date = getattr(inj, "date", None)
                    kind_val = getattr(getattr(inj, "kind", None), "value", None) or str(
                        getattr(inj, "kind", "")
                    ).lower()
                    is_recent = (
                        game_date is not None
                        and inj_date is not None
                        and 0 <= (game_date - inj_date).days <= 30
                    )
                    is_current = "current" in kind_val or "active" in kind_val
                    if is_current or is_recent:
                        if uid_int is not None and uid_int in club_inj_seen:
                            # Enrich existing TYPED entry with cause/severity if missing
                            for existing_entry in club_active_injuries:
                                if existing_entry["playerUid"] == uid_int:
                                    if not existing_entry["severity"]:
                                        existing_entry["severity"] = _label_title(
                                            getattr(inj, "severity", None)
                                        )
                                    if not existing_entry["cause"]:
                                        existing_entry["cause"] = _label_title(
                                            getattr(inj, "cause", None)
                                        )
                            continue
                        entry = {
                            "playerUid": uid_int,
                            "playerName": getattr(inj, "player_name", None),
                            "typeName": getattr(inj, "type_name", None) or "Recent Injury",
                            "date": _dmy(inj_date),
                            "dateIso": _iso(inj_date),
                            "severity": _label_title(getattr(inj, "severity", None)),
                            "cause": _label_title(getattr(inj, "cause", None)),
                            "kind": str(kind_val),
                        }
                        if uid_int is not None:
                            club_inj_seen.add(uid_int)
                            if is_current:
                                active_injury_by_uid.setdefault(uid_int, entry)
                        club_active_injuries.append(entry)

        # 4. Build final player dicts
        players_out: list[dict[str, Any]] = []
        matched_stats = 0
        for p in selected_players:
            uid_int = int(p.uid)
            ov_row = overall_by_uid.get(uid_int)
            lg_row = league_by_uid.get(uid_int)
            if ov_row is not None and ((getattr(ov_row, "minutes", 0) or 0) > 0 or lg_row is None):
                st_row = ov_row
            else:
                st_row = lg_row
            if st_row is not None:
                matched_stats += 1
            players_out.append(
                _player_dict(
                    p,
                    nation_db_by_id,
                    active_injury_by_uid,
                    st_row,
                    managed_club_uids,
                )
            )

        # Managed squad first (by teamSlot, -minutes, -ca), then scouting pool (-max(ca,pa), -ca)
        players_out.sort(
            key=lambda x: (
                0 if x["isManaged"] else 1,
                (x["teamSlot"] or 0) if x["isManaged"] else 0,
                -(x["minutes"] or 0) if x["isManaged"] else -max(x["ca"] or 0, x["pa"] or 0),
                -(x["ca"] or 0),
            )
        )

        referenced_club_uids = {
            p["clubUid"] for p in players_out if p.get("clubUid") is not None
        } | set(managed_club_uids)

        _STATE["players_out"] = players_out
        _STATE["squad_uids"] = squad_uids
        _STATE["referenced_club_uids"] = referenced_club_uids
        _STATE["active_injuries"] = club_active_injuries[:20]
        _STATE["total_players_in_save"] = total_players_in_save
        _STATE["managed_squad_count"] = len(managed_players)

        return json.dumps(
            {
                "ok": True,
                "playerCount": len(players_out),
                "managedSquadCount": len(managed_players),
                "matchedStats": matched_stats,
                "injuriesCount": len(_STATE["active_injuries"]),
            }
        )
    except Exception as exc:  # noqa: BLE001
        msg, kind = _friendly_error(exc)
        return json.dumps({"ok": False, "error": msg, "kind": kind})


def _staff_attr_int(attrs: Any, name: str, default: int = 10) -> int:
    if attrs is None:
        return default
    val = getattr(attrs, name, None)
    return int(val) if val is not None else default


def _staff_dict(
    row: Any,
    nation_db_by_id: dict[int, int],
    is_candidate: bool,
) -> dict[str, Any]:
    club_name = ""
    club_uid = None
    job_label = ""
    wage = 0
    contract_end = None

    if is_candidate:
        appts = getattr(row, "appointments", ()) or ()
        if appts:
            first = appts[0]
            club_name = getattr(first, "club_name", None) or ""
            club_uid = int(first.club_uid) if getattr(first, "club_uid", None) is not None else None
            job_label = _label_name(getattr(first, "job", None)) or ""
            if getattr(first, "wage", None) is not None:
                wage = int(first.wage)
            contract_end = _iso(getattr(first, "contract_end", None))
    else:
        club_name = getattr(row, "club_name", None) or ""
        raw_cuid = getattr(row, "club_uid", None)
        club_uid = int(raw_cuid) if raw_cuid is not None else None
        job_label = _label_name(getattr(row, "job", None)) or ""
        if getattr(row, "wage", None) is not None:
            wage = int(row.wage)
        contract_end = _iso(getattr(row, "contract_end", None))

    ability = getattr(row, "ability", None)
    ca = int(ability.current) if ability and ability.current is not None else 0
    pa = int(ability.potential) if ability and ability.potential is not None else ca
    attrs = getattr(row, "attributes", None)
    nation_id = getattr(row, "nation_id", None)
    nation_db_id = nation_db_by_id.get(nation_id) if nation_id is not None else None

    return {
        "uid": int(row.uid),
        "name": (
            getattr(row, "name", None)
            or getattr(row, "common_name", None)
            or getattr(row, "full_name", None)
            or f"Staff {row.uid}"
        ),
        "job": job_label,
        "clubUid": club_uid,
        "club": club_name,
        "nationDbId": nation_db_id,
        "age": int(row.age) if getattr(row, "age", None) is not None else 0,
        "ca": ca,
        "pa": pa,
        "salaryWeekly": wage,
        "contractEnd": contract_end,
        "isHumanManager": bool(getattr(row, "is_human_manager", False)),
        "attributes": {
            "attacking": _staff_attr_int(attrs, "attacking"),
            "defending": _staff_attr_int(attrs, "defending"),
            "fitness": _staff_attr_int(attrs, "fitness"),
            "goalkeeping": _staff_attr_int(attrs, "goalkeeping", 5),
            "possession": _staff_attr_int(attrs, "possession"),
            "tactical": _staff_attr_int(attrs, "tactical"),
            "technical": _staff_attr_int(attrs, "technical"),
            "setPieces": _staff_attr_int(attrs, "set_pieces"),
            "workingWithYoungsters": _staff_attr_int(attrs, "working_with_youngsters"),
            "determination": _staff_attr_int(attrs, "determination"),
            "levelOfDiscipline": _staff_attr_int(attrs, "authority"),
            "motivating": _staff_attr_int(attrs, "motivating"),
            "manManagement": _staff_attr_int(attrs, "people_management"),
            "tacticalKnowledge": _staff_attr_int(attrs, "tactical_knowledge"),
            "judgingPlayerAbility": _staff_attr_int(attrs, "judging_player_ability"),
            "judgingPlayerPotential": _staff_attr_int(attrs, "judging_player_potential"),
            "analysingData": _staff_attr_int(attrs, "analysing_data"),
            "physiotherapy": _staff_attr_int(attrs, "physiotherapy", 5),
            "sportsScience": _staff_attr_int(attrs, "sports_science", 5),
            "negotiating": _staff_attr_int(attrs, "negotiating"),
        },
    }


def step_staff_and_clubs() -> str:
    """Step 4/6: Extract staff, clubs & 12-month finances, mentoring, and tactics."""
    save = _STATE.get("save")
    if save is None:
        return json.dumps({"ok": False, "error": "Save is not open.", "kind": "StateError"})

    scope = _STATE["scope"]
    managed_club_uid: int | None = _STATE["managed_club_uid"]
    managed_club_uids: set[int] = _STATE["managed_club_uids"]
    referenced_club_uids: set[int] = _STATE["referenced_club_uids"]
    nation_db_by_id: dict[int, int] = _STATE["nation_db_by_id"]
    managed_club_dict = _STATE["managed_club_dict"]
    warnings_list: list[str] = _STATE["warnings"]

    _, max_extra_staff, max_clubs = _SCOPE_LIMITS.get(scope, _SCOPE_LIMITS["managed_only"])

    try:
        # 1. Staff
        is_candidate = False
        managed_staff: list[Any] = []
        other_staff: list[Any] = []

        if scope == "managed_only" and managed_club_uids:
            seen_staff_uids: set[int] = set()
            for cuid in sorted(managed_club_uids):
                rows = _safe_read(
                    lambda c=cuid: list(save.staff().where(club_uid=c)),
                    "staff",
                    warnings_list,
                )
                for s in rows:
                    if not (s.name or s.common_name or s.full_name):
                        continue
                    uid_int = int(s.uid)
                    if uid_int not in seen_staff_uids:
                        seen_staff_uids.add(uid_int)
                        managed_staff.append(s)
            total_staff_in_save = len(managed_staff)
        else:
            is_candidate = True
            staff_rows = list(_safe_read(save.staff_candidates, "staff_candidates", warnings_list))
            if not staff_rows:
                is_candidate = False
                staff_rows = list(_safe_read(save.staff, "staff", warnings_list))
            total_staff_in_save = len(staff_rows)

            for s in staff_rows:
                if not (s.name or s.common_name or s.full_name):
                    continue
                if is_candidate:
                    appts = getattr(s, "appointments", ()) or ()
                    in_mine = any(
                        getattr(a, "club_uid", None) is not None
                        and int(a.club_uid) in managed_club_uids
                        for a in appts
                    )
                else:
                    raw_cuid = getattr(s, "club_uid", None)
                    in_mine = raw_cuid is not None and int(raw_cuid) in managed_club_uids
                if in_mine:
                    managed_staff.append(s)
                elif max_extra_staff > 0:
                    other_staff.append(s)

            if max_extra_staff > 0 and len(other_staff) > max_extra_staff:
                other_staff.sort(
                    key=lambda s: (
                        int(s.ability.current or 0) if s.ability else 0,
                        int(s.ability.potential or 0) if s.ability else 0,
                    ),
                    reverse=True,
                )
                other_staff = other_staff[:max_extra_staff]

        staff_out = [
            _staff_dict(s, nation_db_by_id, is_candidate)
            for s in (managed_staff + other_staff)
        ]

        # 2. Clubs & 12-month finances
        fin_by_club: dict[int, list[Any]] = {}
        selected_clubs: list[Any] = []

        if scope == "managed_only" and referenced_club_uids:
            target_club_uids = sorted(referenced_club_uids)[:max_clubs]
            for cuid in sorted(managed_club_uids):
                if cuid not in target_club_uids:
                    target_club_uids.insert(0, cuid)

            clubs_table = _safe_read(lambda: save.clubs(), "clubs", warnings_list, default=None)
            if clubs_table is not None:
                for cuid in target_club_uids:
                    c = _safe_read(
                        lambda tbl=clubs_table, u=cuid: tbl.by_uid(u),
                        "clubs_by_uid",
                        warnings_list,
                        default=None,
                    )
                    if c is not None and getattr(c, "name", None):
                        selected_clubs.append(c)

            total_clubs_in_save = len(selected_clubs)
            for cuid in sorted(managed_club_uids):
                fin_rows = _safe_read(
                    lambda u=cuid: list(save.finances().where(club_uid=u)),
                    "finances",
                    warnings_list,
                )
                if fin_rows:
                    fin_rows.sort(key=lambda fn: fn.month or date(1900, 1, 1))
                    fin_by_club[cuid] = fin_rows
        else:
            all_clubs = list(_safe_read(save.clubs, "clubs", warnings_list))
            total_clubs_in_save = len(all_clubs)

            fin_rows = list(_safe_read(save.finances, "finances", warnings_list))
            for f in fin_rows:
                fin_by_club.setdefault(int(f.club_uid), []).append(f)
            for series in fin_by_club.values():
                series.sort(key=lambda fn: fn.month or date(1900, 1, 1))

            clubs_priority: list[Any] = []
            clubs_rest: list[Any] = []
            for c in all_clubs:
                if not getattr(c, "name", None):
                    continue
                cuid = int(c.uid)
                if cuid in managed_club_uids or cuid in fin_by_club or cuid in referenced_club_uids:
                    clubs_priority.append(c)
                else:
                    clubs_rest.append(c)

            clubs_priority.sort(
                key=lambda c: (
                    1 if int(c.uid) in managed_club_uids else 0,
                    1 if int(c.uid) in fin_by_club else 0,
                    int(getattr(c, "reputation", 0) or 0),
                ),
                reverse=True,
            )
            clubs_rest.sort(key=lambda c: int(getattr(c, "reputation", 0) or 0), reverse=True)
            selected_clubs = (clubs_priority + clubs_rest)[:max_clubs]

            selected_uids = {int(c.uid) for c in selected_clubs}
            for c in clubs_priority:
                if int(c.uid) in managed_club_uids and int(c.uid) not in selected_uids:
                    selected_clubs.insert(0, c)
                    selected_uids.add(int(c.uid))

        clubs_out: list[dict[str, Any]] = []
        primary_balance = managed_club_dict.get("balance") if managed_club_dict else None

        for c in selected_clubs:
            cuid = int(c.uid)
            series = fin_by_club.get(cuid, [])
            latest = series[-1] if series else None
            prev = series[-2] if len(series) >= 2 else None
            last_12 = series[-12:] if series else []

            season_income = sum(int(m.total_income) for m in last_12)
            season_exp = sum(int(m.total_expenditure) for m in last_12)
            season_wages = sum(int(m.wage_bill) for m in last_12)
            season_transfers = sum(int(m.net_transfers) for m in last_12)

            fallback_balance = (
                int(primary_balance)
                if (managed_club_uid == cuid and primary_balance is not None)
                else 0
            )
            nation_id = getattr(c, "nation_id", None)
            fa_nation_id = getattr(c, "fa_nation_id", None)
            nation_db_id = (
                nation_db_by_id.get(nation_id)
                if nation_id is not None
                else (nation_db_by_id.get(fa_nation_id) if fa_nation_id is not None else None)
            )
            unique_id = getattr(c, "unique_id", None)
            rep = getattr(c, "reputation", None)
            last_pos = getattr(c, "last_league_position", None)

            clubs_out.append(
                {
                    "uid": cuid,
                    "uniqueId": int(unique_id) if unique_id is not None else cuid,
                    "name": c.name,
                    "shortName": getattr(c, "short_name", None) or c.name,
                    "nationDbId": nation_db_id,
                    "reputation": int(rep) if rep is not None else 5000,
                    "lastLeaguePosition": int(last_pos) if last_pos is not None else None,
                    "isManaged": cuid in managed_club_uids,
                    "finances": {
                        "balance": int(latest.balance) if latest else fallback_balance,
                        "transferBudget": int(latest.transfer_budget_remaining) if latest else 0,
                        "wageBudgetWeekly": int(latest.wage_budget_weekly) if latest else 0,
                        "wagePayrollWeekly": int(latest.wage_payroll_weekly) if latest else 0,
                        "thisMonthIncome": int(latest.total_income) if latest else 0,
                        "lastMonthIncome": int(prev.total_income) if prev else 0,
                        "thisSeasonIncome": season_income,
                        "thisMonthExp": int(latest.total_expenditure) if latest else 0,
                        "lastMonthExp": int(prev.total_expenditure) if prev else 0,
                        "thisSeasonExp": season_exp,
                        "thisMonthWages": int(latest.wage_bill) if latest else 0,
                        "lastMonthWages": int(prev.wage_bill) if prev else 0,
                        "thisSeasonWages": season_wages,
                        "thisMonthTransfers": int(latest.net_transfers) if latest else 0,
                        "thisSeasonTransfers": season_transfers,
                    },
                }
            )

        finances_summary = None
        if managed_club_uid is not None:
            m_series = fin_by_club.get(managed_club_uid, [])
            if m_series:
                f_last = m_series[-1]
                last_12 = m_series[-12:]
                finances_summary = {
                    "month": _iso(f_last.month),
                    "balance": _int(f_last.balance),
                    "wagePayrollWeekly": _int(f_last.wage_payroll_weekly),
                    "wageBudgetWeekly": _int(f_last.wage_budget_weekly),
                    "transferBudgetRemaining": _int(f_last.transfer_budget_remaining),
                    "thisMonthIncome": _int(f_last.total_income),
                    "thisMonthExp": _int(f_last.total_expenditure),
                    "thisSeasonIncome": sum(int(m.total_income) for m in last_12),
                    "thisSeasonExp": sum(int(m.total_expenditure) for m in last_12),
                    "thisSeasonTransfers": sum(int(m.net_transfers) for m in last_12),
                }

        # 3. Mentoring groups
        mentoring_out: list[dict[str, Any]] = []
        if managed_club_uids:
            for cuid in sorted(managed_club_uids):
                m_rows = _safe_read(
                    lambda u=cuid: list(save.mentoring().where(club_uid=u)),
                    "mentoring",
                    warnings_list,
                )
                for mg in m_rows:
                    if getattr(mg, "team_slot", None) in (None, 0):
                        members = [m for m in (getattr(mg, "member_names", None) or []) if m]
                        if members:
                            mentoring_out.append(
                                {
                                    "groupNumber": int(mg.group_number),
                                    "label": getattr(mg, "label", None) or f"Group {mg.group_number}",
                                    "members": members,
                                }
                            )

        # 4. Tactics (wrapped in _safe_read because fmsave 0.14.1 raises ReaderCheckError on FM27 27.1.0 tactics_man)
        tactics_out: list[dict[str, Any]] = []
        if managed_club_uids:
            tactics_rows = _safe_read(
                lambda: list(save.tactics().where(club_uid=managed_club_uid))
                if managed_club_uid is not None
                else list(save.tactics()),
                "tactics",
                warnings_list,
            )
        else:
            tactics_rows = _safe_read(lambda: list(save.tactics()), "tactics", warnings_list)

        seen_tactic_keys: set[tuple[str, int]] = set()
        fallback_club_name = _STATE["managed_club_name"] or ""
        for tac in tactics_rows:
            t_cuid = getattr(tac, "club_uid", None)
            if managed_club_uids and t_cuid is not None and int(t_cuid) not in managed_club_uids:
                continue
            if getattr(tac, "team_slot", None) not in (None, 0):
                continue
            tac_idx = int(getattr(tac, "index", 0) or 0)
            tname = (
                getattr(tac, "name", None)
                or getattr(tac, "style_name", None)
                or f"Saved Tactic {tac_idx + 1}"
            ).strip()
            raw_slots = getattr(tac, "slots", None) or ()
            tkey = (tname.lower(), len(raw_slots))
            if tkey in seen_tactic_keys:
                continue
            seen_tactic_keys.add(tkey)
            slots = []
            for sl in raw_slots:
                pos_labels = [
                    _label_name(p)
                    for p in (getattr(sl, "in_possession_positions", None) or ())
                    if _label_name(p)
                ]
                slots.append(
                    {
                        "number": int(sl.number),
                        "positions": pos_labels,
                    }
                )
            tactics_out.append(
                {
                    "index": tac_idx,
                    "name": tname,
                    "styleName": getattr(tac, "style_name", None) or "Custom",
                    "mentality": _label_title(getattr(tac, "mentality", None)) or "Balanced",
                    "mentalityCode": _label_name(getattr(tac, "mentality", None)) or "BALANCED",
                    "clubName": getattr(tac, "club_name", None) or fallback_club_name,
                    "slots": slots,
                }
            )

        _STATE["staff_out"] = staff_out
        _STATE["clubs_out"] = clubs_out
        _STATE["finances_summary"] = finances_summary
        _STATE["mentoring_out"] = mentoring_out[:5]
        _STATE["tactics_out"] = tactics_out[:6]
        _STATE["total_staff_in_save"] = total_staff_in_save
        _STATE["total_clubs_in_save"] = total_clubs_in_save
        _STATE["managed_staff_count"] = len(managed_staff)

        return json.dumps(
            {
                "ok": True,
                "staffCount": len(staff_out),
                "managedStaffCount": len(managed_staff),
                "clubsCount": len(clubs_out),
                "mentoringCount": len(_STATE["mentoring_out"]),
                "tacticsCount": len(_STATE["tactics_out"]),
            }
        )
    except Exception as exc:  # noqa: BLE001
        msg, kind = _friendly_error(exc)
        return json.dumps({"ok": False, "error": msg, "kind": kind})


def step_release_gamedb_for_span() -> str:
    """Step 5/6: Exit shared game_db borrow, evict heavy caches, and run gc.collect() before span_records."""
    save = _STATE.get("save")
    _exit_game_db_borrow()

    evicted = 0
    kept = 0
    if save is not None:
        ctx = getattr(save, "_context", None)
        if ctx is not None:
            cache = getattr(ctx, "_cache", None)
            if isinstance(cache, dict):
                for k in list(cache.keys()):
                    k_str = str(k).lower()
                    if any(tok in k_str for tok in _KEEP_CACHE_TOKENS):
                        kept += 1
                    else:
                        cache.pop(k, None)
                        evicted += 1
    gc.collect()
    return json.dumps({"ok": True, "evictedCacheKeys": evicted, "keptCacheKeys": kept})


def step_fixtures_league_and_finish() -> str:
    """Step 6/6: Stream span_records once for competitions, fixtures & league tables, then close save."""
    save = _STATE.get("save")
    if save is None:
        return json.dumps({"ok": False, "error": "Save is not open.", "kind": "StateError"})

    managed_club_uid: int | None = _STATE["managed_club_uid"]
    managed_club_uids: set[int] = _STATE["managed_club_uids"]
    game_date = _STATE["game_date"]
    info = _STATE["info"]
    warnings_list: list[str] = _STATE["warnings"]

    try:
        # 1. Competitions
        comp_rows = list(_safe_read(save.competitions, "competitions", warnings_list))
        comp_db_by_id: dict[int, int] = {}
        comp_name_by_id: dict[int, str] = {}
        for comp in comp_rows:
            cid = int(comp.id)
            db_id = int(comp.database_id) if comp.database_id is not None else cid
            comp_db_by_id[cid] = db_id
            if getattr(comp, "name", None):
                comp_name_by_id[cid] = comp.name

        competitions_out = [
            {
                "id": int(comp.id),
                "databaseId": int(comp.database_id) if comp.database_id is not None else int(comp.id),
                "name": getattr(comp, "name", None),
                "stageCount": len(getattr(comp, "stage_ids", None) or ()),
            }
            for comp in comp_rows[:120]
        ]

        # 2. Fixtures (span_records streamed once; league_tables reuses cached fixtures)
        fixture_rows = list(_safe_read(save.fixtures, "fixtures", warnings_list))

        managed_fixtures: list[Any] = []
        if managed_club_uids:
            first_team_fixtures: list[Any] = []
            any_slot_fixtures: list[Any] = []
            for fx in fixture_rows:
                h_cuid = int(fx.home_club_uid) if fx.home_club_uid is not None else None
                a_cuid = int(fx.away_club_uid) if fx.away_club_uid is not None else None
                in_home = h_cuid is not None and h_cuid in managed_club_uids
                in_away = a_cuid is not None and a_cuid in managed_club_uids
                if not (in_home or in_away):
                    continue
                any_slot_fixtures.append(fx)
                is_home_first = in_home and fx.home_team_slot in (None, 0)
                is_away_first = in_away and fx.away_team_slot in (None, 0)
                if is_home_first or is_away_first:
                    first_team_fixtures.append(fx)
            managed_fixtures = first_team_fixtures if first_team_fixtures else any_slot_fixtures

        managed_fixtures.sort(key=lambda f: f.date or date(1900, 1, 1))

        played_raw: list[Any] = []
        upcoming_raw: list[Any] = []
        for fx in managed_fixtures:
            if (
                fx.played
                and fx.home_goals is not None
                and fx.away_goals is not None
                and (game_date is None or fx.date is None or fx.date <= game_date)
            ):
                played_raw.append(fx)
            elif not fx.played:
                if game_date is None or (fx.date is not None and fx.date >= game_date):
                    upcoming_raw.append(fx)

        recent_played_raw = played_raw[-15:]
        upcoming_slice_raw = upcoming_raw[:40]
        chosen_fixtures = recent_played_raw + upcoming_slice_raw
        if not chosen_fixtures:
            chosen_fixtures = fixture_rows[:40]

        default_date_iso = _iso(getattr(info, "game_date", None)) or "2026-08-03"
        fixtures_out = [
            {
                "date": _iso(fx.date) or default_date_iso,
                "dateDmy": _dmy(fx.date),
                "kickOff": fx.kick_off_time.strftime("%H:%M") if fx.kick_off_time else "15:00",
                "competitionId": int(fx.competition_id) if fx.competition_id is not None else None,
                "competitionDbId": (
                    comp_db_by_id.get(int(fx.competition_id))
                    if fx.competition_id is not None
                    else None
                ),
                "competitionName": fx.competition_name
                or (
                    comp_name_by_id.get(int(fx.competition_id))
                    if fx.competition_id is not None
                    else None
                ),
                "homeClub": fx.home_club_name or fx.home_club_short_name or "Home",
                "awayClub": fx.away_club_name or fx.away_club_short_name or "Away",
                "venue": fx.stadium_name or "",
                "status": "Played" if fx.played else "Scheduled",
                "homeGoals": int(fx.home_goals) if fx.home_goals is not None else None,
                "awayGoals": int(fx.away_goals) if fx.away_goals is not None else None,
                "xGFor": None,
                "xGAgainst": None,
                "possession": None,
            }
            for fx in chosen_fixtures
        ]

        # KVV Zelzate formatted playedMatches (newest first, up to 15) & upcomingFixtures (up to 40)
        played_matches: list[dict[str, Any]] = []
        upcoming_fixtures: list[dict[str, Any]] = []
        target_cuid = managed_club_uid
        for fx in recent_played_raw:
            h_cuid = int(fx.home_club_uid) if fx.home_club_uid is not None else None
            is_home = (
                (h_cuid == target_cuid and fx.home_team_slot in (None, 0))
                if target_cuid is not None
                else (h_cuid in managed_club_uids)
            )
            opp_name = fx.away_club_name if is_home else fx.home_club_name
            comp_id = _int(getattr(fx, "competition_id", None))
            comp_name = (
                getattr(fx, "competition_name", None)
                or (comp_name_by_id.get(comp_id) if comp_id is not None else None)
                or ""
            )
            gf = int(fx.home_goals if is_home else fx.away_goals)
            ga = int(fx.away_goals if is_home else fx.home_goals)
            res_char = "W" if gf > ga else ("D" if gf == ga else "L")
            played_matches.append(
                {
                    "dateIso": _iso(fx.date),
                    "dateDmy": _dmy(fx.date),
                    "competitionId": comp_id,
                    "competitionDbId": comp_db_by_id.get(comp_id) if comp_id is not None else None,
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
                }
            )
        played_matches.reverse()

        for fx in upcoming_slice_raw:
            h_cuid = int(fx.home_club_uid) if fx.home_club_uid is not None else None
            is_home = (
                (h_cuid == target_cuid and fx.home_team_slot in (None, 0))
                if target_cuid is not None
                else (h_cuid in managed_club_uids)
            )
            opp_name = fx.away_club_name if is_home else fx.home_club_name
            comp_id = _int(getattr(fx, "competition_id", None))
            comp_name = (
                getattr(fx, "competition_name", None)
                or (comp_name_by_id.get(comp_id) if comp_id is not None else None)
                or ""
            )
            upcoming_fixtures.append(
                {
                    "dateIso": _iso(fx.date),
                    "dateDmy": _dmy(fx.date),
                    "competitionId": comp_id,
                    "competitionDbId": comp_db_by_id.get(comp_id) if comp_id is not None else None,
                    "competition": comp_name or "League / Cup",
                    "opponent": opp_name or "Opponent",
                    "venue": "H" if is_home else "A",
                }
            )

        # 3. Domestic League Table (reuses cached fixtures & span_records)
        league_standing = None
        best_lt = None
        best_row = None
        if target_cuid is not None:
            lt_rows = _safe_read(save.league_tables, "league_tables", warnings_list)
            for lt in lt_rows:
                my_row = next(
                    (
                        r
                        for r in lt.rows
                        if r.club_uid == target_cuid and r.team_slot in (None, 0)
                    ),
                    None,
                )
                if my_row is not None:
                    lt_size = int(lt.club_count or len(lt.rows))
                    best_size = int(best_lt.club_count or len(best_lt.rows)) if best_lt else -1
                    if lt_size > best_size or (
                        lt_size == best_size and int(my_row.played) > int(best_row.played)
                    ):
                        best_lt = lt
                        best_row = my_row

        if best_lt is not None and best_row is not None:
            lt = best_lt
            my_row = best_row
            next_opp_name = upcoming_fixtures[0]["opponent"] if upcoming_fixtures else None
            next_opp_row = next(
                (
                    r
                    for r in lt.rows
                    if next_opp_name and r.club_name and r.club_name.lower() == next_opp_name.lower()
                ),
                None,
            )
            league_comp_id = _int(getattr(lt, "competition_id", None))
            league_comp_name = (
                getattr(lt, "competition_name", None)
                or (comp_name_by_id.get(league_comp_id) if league_comp_id is not None else None)
                or "Domestic League"
            )
            league_standing = {
                "competitionId": league_comp_id,
                "competitionDbId": (
                    comp_db_by_id.get(league_comp_id) if league_comp_id is not None else None
                ),
                "competitionName": league_comp_name,
                "position": int(my_row.position),
                "totalTeams": int(lt.club_count or len(lt.rows)),
                "played": int(my_row.played),
                "won": int(my_row.won),
                "drawn": int(my_row.drawn),
                "lost": int(my_row.lost),
                "goalsFor": int(my_row.goals_for),
                "goalsAgainst": int(my_row.goals_against),
                "goalDiff": int(my_row.goals_for - my_row.goals_against),
                "points": int(my_row.points),
                "nextOpponentStanding": {
                    "clubName": next_opp_row.club_name,
                    "position": int(next_opp_row.position),
                    "points": int(next_opp_row.points),
                    "played": int(next_opp_row.played),
                    "goalDiff": int(next_opp_row.goals_for - next_opp_row.goals_against),
                }
                if next_opp_row is not None
                else None,
                "top5": [
                    {
                        "pos": int(r.position),
                        "club": r.club_name,
                        "played": int(r.played),
                        "pts": int(r.points),
                        "gd": int(r.goals_for - r.goals_against),
                    }
                    for r in sorted(lt.rows, key=lambda x: x.position)[:5]
                ],
            }

            if league_comp_id is not None:
                for m in played_matches:
                    if m.get("competition") == "League / Cup":
                        m["competition"] = (
                            league_comp_name
                            if m.get("competitionId") == league_comp_id
                            else "Cup / Friendly"
                        )
                for uf in upcoming_fixtures:
                    if uf.get("competition") == "League / Cup":
                        uf["competition"] = (
                            league_comp_name
                            if uf.get("competitionId") == league_comp_id
                            else "Cup / Friendly"
                        )

        meta = dict(_STATE["meta"] or {})
        meta["totalPlayersInSave"] = _STATE["total_players_in_save"]
        meta["totalStaffInSave"] = _STATE["total_staff_in_save"]
        meta["totalClubsInSave"] = _STATE["total_clubs_in_save"]
        meta["managedSquadCount"] = _STATE["managed_squad_count"]
        meta["managedStaffCount"] = _STATE["managed_staff_count"]

        payload = {
            "ok": True,
            "meta": meta,
            "managedClub": _STATE["managed_club_dict"],
            "players": _STATE["players_out"],
            "staff": _STATE["staff_out"],
            "clubs": _STATE["clubs_out"],
            "competitions": competitions_out,
            "fixtures": fixtures_out,
            "playedMatches": played_matches,
            "upcomingFixtures": upcoming_fixtures,
            "leagueStanding": league_standing,
            "finances": _STATE["finances_summary"],
            "activeInjuries": _STATE["active_injuries"],
            "tactics": _STATE["tactics_out"],
            "mentoring": _STATE["mentoring_out"],
            "warnings": list(_STATE["warnings"]),
        }
        return json.dumps(payload)
    except Exception as exc:  # noqa: BLE001
        msg, kind = _friendly_error(exc)
        return json.dumps({"ok": False, "error": msg, "kind": kind})
    finally:
        step_close()
