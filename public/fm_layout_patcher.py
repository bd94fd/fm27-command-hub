"""FM27 Command Hub — Runtime Layout & Reader Overlay Engine for fmsave.

Decouples FM27 save decoding from upstream fmsave release cycles by patching
fmsave._layouts and fmsave.readers in-memory at runtime:
1. TACTICS set-piece taker marker expansion (fixes 0x0b 0x05 0x02 ReaderCheckError
   on FM27 27.1.0+2505117 that blocked tactics(), selections(), and set_pieces())
   plus a bounded structural fallback in _read_selection_part.
2. SquadPlannerLayout / read_planner_selectors recovery in `humans` when active
   career scouting dates replace the initial 01006c07 / 40000002 lead bytes with
   48000102 + 0f2d0764 + +27 01020004031b (unlocks all 81 SquadPlannerSlot rows).
3. ManagedClub manager_name ('Bobby Dean') & scouting_budget recovery in
   `save_game_summary` and `humans` when summary strings are followed by the
   club's editor unique_id rather than the shifted game_db Club.uid.
4. Dynamic synthetic _BuildModule registration for 27.1.0+2505117 and future
   FM27 27.x.y+z builds so known_build=True and layouts resolve cleanly.
"""

from __future__ import annotations

from dataclasses import replace
import struct
from typing import Any

_PATCH_APPLIED = False
_REGISTERED_SYNTHETIC_BUILDS: set[str] = set()
_U32 = struct.Struct("<I")
_U16 = struct.Struct("<H")
_U8 = struct.Struct("<B")


class SyntheticFM27BuildModule:
    """In-memory module implementing fmsave._layouts._BuildModule protocol."""

    def __init__(
        self,
        build: str,
        known_builds: tuple[str, ...],
        layouts: tuple[Any, ...],
    ) -> None:
        self.BUILD = build
        self.KNOWN_BUILDS = known_builds
        self.LAYOUTS = layouts


def apply_fmsave_runtime_patches() -> bool:
    """Apply in-memory layout and reader patches to fmsave.

    Safe to call multiple times and safe when fmsave is a lightweight test stub.
    Returns True when real fmsave modules were patched, False on stub/unavailable.
    """
    global _PATCH_APPLIED
    if _PATCH_APPLIED:
        return True

    try:
        import fmsave._layouts as layouts_mod
        from fmsave._layouts import LayoutEntry, fm27_27_0_0, fm27_27_1_0
        import fmsave._context as context_mod
        import fmsave.readers.clubs as clubs_reader
        import fmsave.readers.tactics as tactics_reader
        import fmsave.readers.squad_planner as planner_reader
        import fmsave.readers.managed as managed_reader
        from fmsave._scan import decode_date
    except Exception:
        # Running under unit-test fmsave stub without internal submodules
        return False

    # ── 1. Patch TACTICS layout taker_markers (0x01..0x3f + 0x05 0x02) ──────────
    expanded_taker_markers = tuple(bytes((b, 5, 2)) for b in range(1, 64))
    patched_tactics_layout = replace(
        fm27_27_0_0.TACTICS,
        taker_markers=expanded_taker_markers,
    )
    fm27_27_0_0.TACTICS = patched_tactics_layout

    # Replace TACTICS entry in fm27_27_0_0.LAYOUTS
    fm27_27_0_0.LAYOUTS = tuple(
        LayoutEntry(entry.region, entry.schema, entry.build, patched_tactics_layout)
        if entry.region == "tactics_man"
        else entry
        for entry in fm27_27_0_0.LAYOUTS
    )

    # Register full FM27 27.1.0+2505117 build layouts and mark 27.1.0+2505117 as a KNOWN_BUILD
    existing_27_1_regions = {(e.region, type(e.layout)) for e in fm27_27_1_0.LAYOUTS}
    inherited_entries = [
        LayoutEntry(e.region, e.schema, fm27_27_1_0.BUILD, e.layout)
        for e in fm27_27_0_0.LAYOUTS
        if (e.region, type(e.layout)) not in existing_27_1_regions
    ]
    fm27_27_1_0.LAYOUTS = tuple(list(fm27_27_1_0.LAYOUTS) + inherited_entries)
    if fm27_27_1_0.BUILD not in fm27_27_1_0.KNOWN_BUILDS:
        fm27_27_1_0.KNOWN_BUILDS = (*fm27_27_1_0.KNOWN_BUILDS, fm27_27_1_0.BUILD)

    # ── 2. Wrap tactics._read_selection_part with bounded taker-marker recovery ──
    orig_read_selection_part = tactics_reader._read_selection_part

    def _patched_read_selection_part(
        section: bytes,
        block_start: int,
        block_end: int,
        layout: Any,
        file_name: str,
    ) -> Any:
        try:
            return orig_read_selection_part(section, block_start, block_end, layout, file_name)
        except Exception as orig_exc:
            if "set-piece marker" not in str(orig_exc):
                raise
            # Bounded structural fallback: locate dynamic 3-byte taker marker before 10 selector lists
            cursor = block_start + _U32.size + len(layout.block_marker)
            label_txt, cursor = tactics_reader._read_text(
                section,
                cursor,
                block_end,
                file_name,
                "a selection label",
                length_range=layout.name_length_range,
            )
            selectors: list[int] = []
            slots_start = cursor
            slots_bytes = layout.selection_slot_count * _U32.size
            if cursor + slots_bytes > block_end:
                raise orig_exc
            for slot in range(layout.selection_slot_count):
                selectors.append(_U32.unpack_from(section, cursor + slot * _U32.size)[0])
            cursor += slots_bytes
            cursor = tactics_reader._expect_bytes(
                section, cursor, layout.selection_end_marker, file_name, "a selection's end marker"
            )
            for list_name in ("the first selector list", "the second selector list"):
                one_list, cursor = tactics_reader._read_selector_list(
                    section, cursor, block_end, layout, file_name, list_name
                )
                selectors.extend(one_list)
            if cursor + _U8.size + _U32.size > block_end:
                raise orig_exc
            if section[cursor] != layout.list_item_lead_byte:
                raise orig_exc
            selectors.append(_U32.unpack_from(section, cursor + _U8.size)[0])
            cursor += _U8.size + _U32.size

            # Accept any 3-byte taker marker [_, _, 0x02] that leads cleanly through taker_list_count lists to order_marker
            if cursor + 3 > block_end:
                raise orig_exc
            dynamic_marker = section[cursor : cursor + 3]
            patched_layout = replace(
                layout,
                taker_markers=(*layout.taker_markers, dynamic_marker),
            )
            return orig_read_selection_part(
                section, block_start, block_end, patched_layout, file_name
            )

    tactics_reader._read_selection_part = _patched_read_selection_part

    # ── 3. Patch SquadPlanner _planner_start & read_planner_selectors in `humans` ─
    orig_planner_start = planner_reader._planner_start
    orig_read_planner_selectors = planner_reader.read_planner_selectors
    core_lead_tail_needle = b"\x0f\x2d\x07\x64"

    def _patched_planner_start(
        humans: bytes, search_start: int, layout: Any, file_name: str
    ) -> int:
        try:
            return orig_planner_start(humans, search_start, layout, file_name)
        except Exception:
            # Anchor on 0f 2d 07 64 where +23..+29 == lead_tail (01 02 00 04) + group_marker (03 1b)
            expected_suffix = layout.lead_tail + layout.group_marker
            found_start: int | None = None
            hit = humans.find(core_lead_tail_needle, max(0, search_start))
            while hit >= 0:
                marker_at = hit - 4
                if (
                    marker_at >= 16
                    and humans[marker_at + 27 : marker_at + 27 + len(expected_suffix)]
                    == expected_suffix
                    and decode_date(humans, marker_at - 12) is not None
                ):
                    if found_start is not None:
                        break
                    found_start = marker_at + 31
                hit = humans.find(core_lead_tail_needle, hit + 1)
            if found_start is not None:
                return found_start
            raise

    def _patched_read_planner_selectors(
        humans: bytes,
        search_start: int,
        layout: Any,
        scouting_marker: bytes,
        file_name: str,
    ) -> Any:
        try:
            return orig_read_planner_selectors(
                humans, search_start, layout, scouting_marker, file_name
            )
        except Exception:
            offset = _patched_planner_start(humans, search_start, layout, file_name)
            groups: list[tuple[tuple[int, ...], ...]] = []
            for group in range(4):
                for set_index, marker in enumerate(
                    (layout.group_marker, layout.set_marker, layout.set_marker)
                ):
                    if not humans.startswith(marker, offset):
                        raise
                    offset += len(marker)
                    keep = group < 3 and set_index == 0
                    slots: list[tuple[int, ...]] = []
                    for _ in range(27):
                        count = humans[offset]
                        offset += 1
                        end = offset + 4 * count
                        if keep:
                            slots.append(struct.unpack_from(f"<{count}I", humans, offset))
                        offset = end
                    if keep:
                        groups.append(tuple(slots))
            if not humans.startswith(layout.footer_marker, offset + 26):
                raise
            return tuple(groups)

    planner_reader._planner_start = _patched_planner_start
    planner_reader.read_planner_selectors = _patched_read_planner_selectors
    try:
        import fmsave._save as save_mod

        save_mod.read_planner_selectors = _patched_read_planner_selectors
    except Exception:
        pass

    # ── 4. Patch ManagedClub _summary_links ('Bobby Dean') & scouting_budget ─────
    orig_summary_links = managed_reader._summary_links
    orig_scouting_budget = managed_reader.scouting_budget

    def _patched_summary_links(
        summary: bytes, layout: Any, club_index: Any
    ) -> list[Any]:
        links = orig_summary_links(summary, layout, club_index)
        if links and all(getattr(lnk, "manager_name", None) for lnk in links):
            return links

        # Match summary strings followed by club.uid OR club.unique_id (FM27 stores editor
        # unique_id 18108473 in save_game_summary after 'KVV Zelzate' while club.uid is 18104898).
        found_strings = managed_reader._scan_summary_strings(summary, layout)
        club_by_any_id: dict[int, Any] = dict(getattr(club_index, "club_by_uid", {}) or {})
        clubs_by_name: dict[str, dict[int, Any]] = {}
        for club in getattr(club_index, "clubs", ()):
            c_uid = getattr(club, "uid", None)
            c_uniq = getattr(club, "unique_id", None)
            if isinstance(c_uniq, int) and c_uniq > 0:
                club_by_any_id.setdefault(c_uniq, club)
            for attr in ("short_name", "name"):
                val = getattr(club, attr, None)
                if isinstance(val, str) and val.strip() and isinstance(c_uid, int):
                    clubs_by_name.setdefault(val.strip(), {})[c_uid] = club

        summary_len = len(summary)
        fallback_links: list[Any] = list(links)
        seen_uids = {lnk.club.uid for lnk in fallback_links}
        prev_str = None
        for cur_str in found_strings:
            c_obj = None
            uid_offset = cur_str.end_offset
            if uid_offset + _U32.size <= summary_len:
                cand_id = _U32.unpack_from(summary, uid_offset)[0]
                cand_club = club_by_any_id.get(cand_id)
                if cand_club is not None and (
                    getattr(cand_club, "short_name", None) == cur_str.text
                    or getattr(cand_club, "name", None) == cur_str.text
                ):
                    c_obj = cand_club
            if c_obj is None:
                named_map = clubs_by_name.get(cur_str.text, {})
                if len(named_map) == 1:
                    c_obj = next(iter(named_map.values()))
            if c_obj is not None and c_obj.uid not in seen_uids:
                mgr_name = (
                    prev_str.text
                    if prev_str is not None and prev_str.end_offset == cur_str.length_offset
                    else None
                )
                fallback_links.append(managed_reader._SummaryLink(c_obj, mgr_name))
                seen_uids.add(c_obj.uid)
            prev_str = cur_str
        return fallback_links if fallback_links else links

    def _patched_scouting_budget(humans: bytes, layout: Any) -> tuple[int, int] | None:
        res = orig_scouting_budget(humans, layout)
        if res is not None:
            return res
        # Fallback when the 2 scouting dates before 48000102 0f2d0764 are populated dates
        max_budget = getattr(layout, "scouting_budget_maximum", 100_000_000) or 100_000_000
        hit = humans.find(core_lead_tail_needle)
        while hit >= 0:
            if hit >= 16 and hit + 12 <= len(humans):
                if decode_date(humans, hit - 16) is not None:
                    budget = _U32.unpack_from(humans, hit + 4)[0]
                    remaining = struct.unpack_from("<i", humans, hit + 8)[0]
                    if 0 < budget <= max_budget and -max_budget <= remaining <= budget:
                        return (budget, max(0, remaining))
            hit = humans.find(core_lead_tail_needle, hit + 1)
        return None

    managed_reader._summary_links = _patched_summary_links
    managed_reader.scouting_budget = _patched_scouting_budget

    # ── 5. Bidirectional FM27 ClubTableLayout fallback (27.0.x <-> 27.1.x) ──────
    # Dynamic build registration marks unseen 27.x builds as known_build=True, which
    # disables fmsave's built-in fallback_table. Always supply the alternate FM27
    # ClubTableLayout so both 27.0.x (0-byte tail) and 27.1.x (+5-byte finance tail)
    # saves frame cleanly regardless of build string.
    orig_find_club_layouts = clubs_reader.find_club_layouts

    def _patched_find_club_layouts(game_db_schema: int | None, build: str) -> Any:
        layouts = orig_find_club_layouts(game_db_schema, build)
        if build.startswith("27.") and getattr(layouts, "fallback_table", None) is None:
            alt_table = (
                fm27_27_0_0.CLUB_TABLE
                if layouts.table is fm27_27_1_0.CLUB_TABLE
                else fm27_27_1_0.CLUB_TABLE
            )
            return replace(layouts, fallback_table=alt_table)
        return layouts

    clubs_reader.find_club_layouts = _patched_find_club_layouts
    if hasattr(context_mod, "find_club_layouts"):
        context_mod.find_club_layouts = _patched_find_club_layouts

    # ── 6. Dynamic callable _build_modules hook for future 27.x builds ───────────
    if not hasattr(layouts_mod, "_orig_build_modules_fn"):
        layouts_mod._orig_build_modules_fn = layouts_mod._build_modules

    orig_build_modules = layouts_mod._orig_build_modules_fn
    synthetic_modules: list[SyntheticFM27BuildModule] = []

    def _patched_build_modules() -> tuple[Any, ...]:
        return (*synthetic_modules, *orig_build_modules())

    layouts_mod._build_modules = _patched_build_modules
    layouts_mod._synthetic_modules_registry = synthetic_modules

    _PATCH_APPLIED = True
    return True


def register_dynamic_fm27_build(build_str: str) -> bool:
    """Dynamically register an unseen FM27 27.x.y+z build to inherit matching 27.0 or 27.1 layouts."""
    if not build_str or not build_str.startswith("27."):
        return False
    apply_fmsave_runtime_patches()
    try:
        import fmsave._layouts as layouts_mod
        from fmsave._layouts import LayoutEntry, fm27_27_0_0, fm27_27_1_0
    except Exception:
        return False

    if build_str in layouts_mod.known_builds() or build_str in _REGISTERED_SYNTHETIC_BUILDS:
        return True

    base_mod = fm27_27_0_0 if build_str.startswith("27.0.") else fm27_27_1_0
    synthetic_layouts = tuple(
        LayoutEntry(e.region, e.schema, build_str, e.layout)
        for e in base_mod.LAYOUTS
    )
    mod = SyntheticFM27BuildModule(
        build=build_str,
        known_builds=(build_str,),
        layouts=synthetic_layouts,
    )
    registry = getattr(layouts_mod, "_synthetic_modules_registry", None)
    if isinstance(registry, list):
        registry.append(mod)
        _REGISTERED_SYNTHETIC_BUILDS.add(build_str)
        return True
    return False
