"use client";

import { create } from "zustand";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { Match, MatchRun, SignalLevel } from "@/lib/domain/types";
import { displayTitle } from "@/lib/format";
import { firstNonEmptyTab, inRegion, REVIEW_TABS, tabTotal } from "@/lib/rank";

const DEFAULT_REGION = SNAPSHOT.regions[0]?.id ?? "all";

let seq = 0;
let inflight: AbortController | null = null;
let latest: Promise<MatchRun | null> = Promise.resolve(null);
let noticeSeq = 0;

export type QueueTab = "needs-review" | "known-coordination" | "conflicts" | "possible";
/** Legacy signal chips (old Queue). The engine never emits a TIME-only badge, so TIME is not a default. */
export type FlagFilter = "BOTH" | "GEO" | "TIME" | "POSSIBLE";
export type Basemap = "night" | "satellite" | "offline";
export type InspectorSection = "place" | "schedule" | "coordination" | "impact" | "conflicts" | "sources";

/** Timing chips filter on `m.time`: confirmed "Schedules overlap" · possible "May overlap" · unknown "Timing unknown" · no-match "No overlap". */
export type TimingFilter = SignalLevel;
export const TIMING_FILTERS: readonly TimingFilter[] = ["confirmed", "possible", "unknown", "no-match"];

/** The list narrowed to one project's pairs (dot click, "All 18 pairs with this project") or one map hotspot. Ranks never change. */
export interface Focus {
  kind: "project" | "hotspot";
  /** Project id, or the hotspot's id. */
  id: string;
  /** Project display title, or the hotspot's label ("Around <project>"). */
  label: string;
  pairIds: string[];
}

export type SheetSnap = "peek" | "half" | "full";

export type NoticeKind = "dropped-pair" | "clipboard" | "closeup-unavailable" | "info";
/** One dismissible glass notice (bottom-centre of the focal area). The link notice stays separate (`linkNotice`, test I19). */
export interface Notice {
  id: string;
  text: string;
  kind: NoticeKind;
}

/**
 * Method & audit TOC anchors, in order: Proof at a glance · Sperry's six rows today · Matching rules · Exports ·
 * Location workflow · Context · State permit check · Corpus checks · Evaluation · What the engine excluded · Reviewer
 * mode · AI extraction · Open research questions. The Method drawer renders `data-method-section={id}` (or
 * `id="method-{id}"`) per section.
 */
export type MethodSection =
  | "proof"
  | "sperry-rows"
  | "rules"
  | "exports"
  | "location"
  | "context"
  | "permits"
  | "corpus"
  | "evaluation"
  | "excluded"
  | "reviewer"
  | "ai"
  | "questions";

export const DEFAULT_FLAGS: FlagFilter[] = ["BOTH", "GEO", "POSSIBLE"];

export interface AtlasState {
  run: MatchRun | null;
  running: boolean;
  runError: string | null;
  thresholdMiles: number;

  tab: QueueTab;
  /** Legacy signal chips (old Queue only); the new results list filters with `timing` + `conflictsOnly`. */
  flags: FlagFilter[];
  /** Timing chips (independent toggles on `m.time`); empty = all. */
  timing: TimingFilter[];
  /** "Dates revised or disputed" chip: only pairs with any source conflict. */
  conflictsOnly: boolean;
  utilityFilter: string | null;
  region: string;
  /** @deprecated unused */
  showFarApart: boolean;
  focus: Focus | null;
  /** The results list's current row order (visible ids, top to bottom); written by the list, read by selectNeighbor. */
  visibleOrder: string[];

  selectedMatchId: string | null;
  hoveredMatchId: string | null;
  hoveredProjectId: string | null;
  /** @deprecated superseded by `focus` */
  focusProjectId: string | null;

  inspectorOpen: boolean;
  inspectorSection: InspectorSection | null;
  highlightConflict: boolean;
  /** Conflict to lead the inspector's "Sources disagree" list with (and scroll to): a conflict id, project id or source id. */
  focusConflict: string | null;
  briefOpen: boolean;
  sourcesOpen: boolean;
  methodOpen: boolean;
  /** Method section to scroll to when the drawer opens (see openMethod); the drawer may clear it after scrolling. */
  methodSection: MethodSection | null;
  /** Bumped by every openMethod() call, so asking for the same section twice scrolls again. */
  methodNonce: number;
  demoStep: number | null;
  /** Why a ?pair= deep link opened nothing (e.g. the pair is not flagged at the link's radius); dismissible. */
  linkNotice: string | null;
  /** Dropped pair, clipboard failure, close-up unavailable (see showNotice / dismissNotice). */
  notice: Notice | null;

  /** 3D pair close-up over the map (only meaningful with a selected pair). */
  closeupOpen: boolean;
  /** The user's timeline-dock toggle; lib/layout may still force it collapsed. useLayout sets the tier default. */
  timelineCollapsed: boolean;
  /**
   * User-dragged panel sizes in px (null = the layout's default); lib/layout clamps them so the map keeps a usable focal
   * hole, and applies them on the xl/lg tiers only. Persisted per browser (components/ResizeHandle).
   */
  dockHeight: number | null;
  railWidth: number | null;
  inspectorWidth: number | null;
  /** A resize handle is being dragged: panel transitions switch off (data-resizing on .atlas-shell); the camera waits for the drop. */
  resizing: boolean;
  mapKeyOpen: boolean;
  /** lg/md: the Opportunities pill's overlay rail is open (select() closes it). */
  railOpen: boolean;
  /** Phone bottom-sheet snap. */
  sheetSnap: SheetSnap;
  /** H key: floating panels hidden (never the demo card). */
  uiHidden: boolean;

  mapMode: "3d" | "flat";
  basemap: Basemap;
  basemapFailed: boolean;
  cameraNonce: number;
  /** Bumped only when an explicit Compare (button, C key, demo step 2) succeeds: drives the map reveal. */
  revealNonce: number;

  /**
   * Run the engine. `quiet` skips the ≥900 ms scanning state (slider, deep link). `explicit` marks a user-initiated
   * Compare: on success it bumps `revealNonce` (and lands on the first non-empty tab if the current one is empty).
   * Quiet, deep-link, radius and Re-run calls must NOT pass `explicit`.
   */
  compare: (opts?: { thresholdMiles?: number; quiet?: boolean; explicit?: boolean }) => Promise<MatchRun | null>;
  /** Back to the pre-run state at the default radius; any in-flight compare is aborted and its reply dropped. */
  resetRun: () => void;
  setThreshold: (mi: number) => void;
  /**
   * Select a pair (null clears): opens the inspector, closes the close-up and the rail overlay, jumps to the pair's
   * region (resetting that region's filters) and tab, and clears any list filter that would hide its row.
   */
  select: (id: string | null, opts?: { section?: InspectorSection; focusConflict?: string }) => void;
  /** Select the previous (-1) / next (1) row in the list's visible order (visibleOrder, else DOM [data-match-id] order). Returns the id now selected. */
  selectNeighbor: (dir: 1 | -1) => string | null;
  /** The results list reports its visible row order (no-op when unchanged). */
  setVisibleOrder: (ids: string[]) => void;
  /** Switch region: resets filters, focus, selection and inspector; picks the region's first non-empty tab; reframes. */
  setRegion: (id: string) => void;
  /** Narrow the list to a focus (null clears). Keeps the selection only if it is in the focus. */
  setFocus: (focus: Focus | null) => void;
  /** Focus on every flagged pair with this project (switches region if needed). No-op without a run or pairs. */
  focusProject: (projectId: string) => void;
  /** Open the 3D close-up for the selected pair (no-op without one). */
  openCloseup: () => void;
  /** Open Method & audit, optionally at a section. */
  openMethod: (section?: MethodSection) => void;
  /** Show a notice; returns its id (pass it to dismissNotice so a stale timer never dismisses a newer notice). */
  showNotice: (text: string, kind?: NoticeKind, id?: string) => string;
  /** Dismiss the notice (only if it still has this id, when one is given). */
  dismissNotice: (id?: string) => void;
  set: (patch: Partial<AtlasState>) => void;
  resetView: () => void;
}

/** Every list filter back to "show everything". */
const FILTER_RESET = {
  flags: DEFAULT_FLAGS,
  timing: [] as TimingFilter[],
  conflictsOnly: false,
  utilityFilter: null,
  focus: null,
} satisfies Partial<AtlasState>;

/** Close the pair view (inspector, close-up, conflict emphasis). */
const CLOSE_PAIR = {
  selectedMatchId: null,
  inspectorOpen: false,
  inspectorSection: null,
  highlightConflict: false,
  focusConflict: null,
  closeupOpen: false,
} satisfies Partial<AtlasState>;

const projectRegion = (projectId: string) => IDX.project(projectId)?.region;

function pairOwners(m: Match): string[] {
  return [...(IDX.project(m.projectAId)?.owners ?? []), ...(IDX.project(m.projectBId)?.owners ?? [])].map((o) => o.utilityId);
}

type FilterState = Pick<AtlasState, "region" | "timing" | "conflictsOnly" | "utilityFilter" | "focus" | "flags">;

/** Whether the list filters (region, timing, conflicts, utility, focus, legacy flags) let this pair's row show. Tabs aside. */
export function passesFilters(m: Match, f: FilterState): boolean {
  if (!inRegion(m, f.region)) return false;
  if (!f.flags.includes(m.badge)) return false;
  if (f.timing.length > 0 && !f.timing.includes(m.time)) return false;
  if (f.conflictsOnly && m.conflicts.length === 0) return false;
  if (f.utilityFilter && !pairOwners(m).includes(f.utilityFilter)) return false;
  if (f.focus && !f.focus.pairIds.includes(m.id)) return false;
  return true;
}

/** The smallest filter reset that makes this pair's row visible (region aside). */
function revealPatch(m: Match, f: FilterState): Partial<AtlasState> {
  const patch: Partial<AtlasState> = {};
  if (!f.flags.includes(m.badge)) patch.flags = [...new Set([...DEFAULT_FLAGS, m.badge])];
  if (f.timing.length > 0 && !f.timing.includes(m.time)) patch.timing = [];
  if (f.conflictsOnly && m.conflicts.length === 0) patch.conflictsOnly = false;
  if (f.utilityFilter && !pairOwners(m).includes(f.utilityFilter)) patch.utilityFilter = null;
  if (f.focus && !f.focus.pairIds.includes(m.id)) patch.focus = null;
  return patch;
}

/** Keep a focus meaningful after a new run: a project focus is recomputed; a hotspot keeps its surviving pairs. */
function refocus(focus: Focus | null, run: MatchRun): Focus | null {
  if (!focus) return null;
  const ids = new Set(run.matches.map((m) => m.id));
  const pairIds =
    focus.kind === "project"
      ? run.matches.filter((m) => m.projectAId === focus.id || m.projectBId === focus.id).map((m) => m.id)
      : focus.pairIds.filter((id) => ids.has(id));
  return pairIds.length ? { ...focus, pairIds } : null;
}

export const useAtlas = create<AtlasState>((set, get) => ({
  run: null,
  running: false,
  runError: null,
  thresholdMiles: 25,

  tab: "needs-review",
  flags: DEFAULT_FLAGS,
  timing: [],
  conflictsOnly: false,
  utilityFilter: null,
  region: DEFAULT_REGION,
  showFarApart: false,
  focus: null,
  visibleOrder: [],

  selectedMatchId: null,
  hoveredMatchId: null,
  hoveredProjectId: null,
  focusProjectId: null,

  inspectorOpen: false,
  inspectorSection: null,
  highlightConflict: false,
  focusConflict: null,
  briefOpen: false,
  sourcesOpen: false,
  methodOpen: false,
  methodSection: null,
  methodNonce: 0,
  demoStep: null,
  linkNotice: null,
  notice: null,

  closeupOpen: false,
  timelineCollapsed: true,
  dockHeight: null,
  railWidth: null,
  inspectorWidth: null,
  resizing: false,
  mapKeyOpen: false,
  railOpen: false,
  sheetSnap: "peek",
  uiHidden: false,

  mapMode: "3d",
  basemap: "night",
  basemapFailed: false,
  cameraNonce: 0,
  revealNonce: 0,

  compare(opts) {
    // only the newest request may write: an older, slower reply (e.g. a larger radius) is aborted or dropped
    const my = ++seq;
    inflight?.abort();
    const ctrl = (inflight = new AbortController());
    const thresholdMiles = opts?.thresholdMiles ?? get().thresholdMiles;
    set({ running: !opts?.quiet, runError: null, linkNotice: null });
    const started = performance.now();
    latest = (async () => {
      try {
        const res = await fetch(`/api/matches?threshold=${thresholdMiles}`, { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) throw new Error(`Engine request failed (${res.status})`);
        const run = (await res.json()) as MatchRun;
        // Let the scan read as a deliberate step, not a flicker. The engine itself runs in ~ms.
        const minVisible = opts?.quiet ? 0 : 900;
        const wait = Math.max(0, minVisible - (performance.now() - started));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (my !== seq) return latest;
        const st = get();
        const selected = st.selectedMatchId;
        const dropped = !!selected && !run.matches.some((m) => m.id === selected);
        // a user-initiated Compare lands on a tab with pairs in it (e.g. Known in Southern Plains)
        const tab =
          opts?.explicit && !dropped && !selected && st.tab !== "conflicts" && tabTotal(run, st.region, st.tab) === 0
            ? firstNonEmptyTab(run, st.region)
            : st.tab;
        set({
          run,
          running: false,
          thresholdMiles,
          tab,
          focus: refocus(st.focus, run),
          ...(opts?.explicit ? { revealNonce: st.revealNonce + 1 } : {}),
          // a pair that no longer qualifies (e.g. smaller radius) closes the inspector (and close-up) with a notice
          ...(dropped
            ? { ...CLOSE_PAIR, notice: { id: `dropped-pair-${my}`, kind: "dropped-pair" as const, text: `The pair isn't flagged at ${thresholdMiles} mi` } }
            : st.notice?.kind === "dropped-pair"
              ? { notice: null }
              : {}),
        });
        return run;
      } catch (err) {
        if (my !== seq) return latest;
        set({ running: false, runError: err instanceof Error ? err.message : "Engine unavailable" });
        return null;
      }
    })();
    return latest;
  },

  setThreshold(mi) {
    set({ thresholdMiles: mi });
  },

  resetRun() {
    seq++;
    inflight?.abort();
    inflight = null;
    latest = Promise.resolve(null);
    // running must be cleared here: the aborted request sees a newer seq and never clears it
    set({
      run: null,
      running: false,
      runError: null,
      linkNotice: null,
      notice: null,
      thresholdMiles: 25,
      tab: "needs-review",
      ...FILTER_RESET,
      ...CLOSE_PAIR,
      visibleOrder: [],
      railOpen: false,
    });
  },

  select(id, opts) {
    if (!id) {
      set(CLOSE_PAIR);
      return;
    }
    const st = get();
    const m = st.run?.matches.find((x) => x.id === id);
    const pairRegion = m ? projectRegion(m.projectAId) : undefined;
    const regionChange = st.region !== "all" && !!pairRegion && pairRegion !== st.region;
    // a pair in another region: that region's view starts unfiltered; same region: only undo filters hiding this row
    const filters = regionChange ? FILTER_RESET : m ? revealPatch(m, st) : {};
    set({
      region: regionChange ? pairRegion! : st.region,
      ...filters,
      selectedMatchId: id,
      inspectorOpen: true,
      linkNotice: null,
      ...(st.notice?.kind === "dropped-pair" ? { notice: null } : {}),
      inspectorSection: opts?.section ?? null,
      focusConflict: opts?.focusConflict ?? null,
      focusProjectId: null,
      closeupOpen: false,
      railOpen: false,
      tab: m ? tabFor(m, st.tab) : st.tab,
      cameraNonce: st.cameraNonce + 1,
    });
  },

  selectNeighbor(dir) {
    const st = get();
    if (!st.run) return null;
    const inRun = new Set(st.run.matches.map((m) => m.id));
    let ids = st.visibleOrder.filter((id) => inRun.has(id));
    if (!ids.length && typeof document !== "undefined") {
      const dom = [...document.querySelectorAll<HTMLElement>("[data-match-id]")].map((el) => el.dataset.matchId ?? "");
      ids = [...new Set(dom)].filter((id) => inRun.has(id));
    }
    if (!ids.length) return null;
    const i = st.selectedMatchId ? ids.indexOf(st.selectedMatchId) : -1;
    const id = ids[i < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, i + dir))];
    if (id !== st.selectedMatchId) get().select(id);
    return id;
  },

  setVisibleOrder(ids) {
    const cur = get().visibleOrder;
    if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return;
    set({ visibleOrder: [...ids] });
  },

  setRegion(id) {
    const st = get();
    set({
      region: id,
      ...FILTER_RESET,
      ...CLOSE_PAIR,
      focusProjectId: null,
      hoveredMatchId: null,
      hoveredProjectId: null,
      railOpen: false,
      visibleOrder: [],
      tab: st.run ? firstNonEmptyTab(st.run, id) : st.tab === "conflicts" ? "needs-review" : st.tab,
      cameraNonce: st.cameraNonce + 1,
    });
  },

  setFocus(focus) {
    const st = get();
    if (!focus) {
      if (!st.focus) return;
      set({ focus: null, cameraNonce: st.selectedMatchId ? st.cameraNonce : st.cameraNonce + 1 });
      return;
    }
    const keep = !!st.selectedMatchId && focus.pairIds.includes(st.selectedMatchId);
    let tab = st.tab;
    if (st.run) {
      const ids = new Set(focus.pairIds);
      const pairs = st.run.matches.filter((m) => ids.has(m.id));
      if (!pairs.some((m) => inTab(m, tab))) tab = REVIEW_TABS.find((t) => pairs.some((m) => m.reviewStatus === t)) ?? tab;
    }
    set({
      focus: { ...focus, pairIds: [...focus.pairIds] },
      tab,
      ...(keep ? {} : CLOSE_PAIR),
      cameraNonce: keep ? st.cameraNonce : st.cameraNonce + 1,
    });
  },

  focusProject(projectId) {
    const st = get();
    const p = IDX.project(projectId);
    if (!st.run || !p) return;
    const pairIds = st.run.matches.filter((m) => m.projectAId === projectId || m.projectBId === projectId).map((m) => m.id);
    if (!pairIds.length) return;
    if (st.region !== "all" && p.region !== st.region) get().setRegion(p.region);
    get().setFocus({ kind: "project", id: projectId, label: displayTitle(p), pairIds });
  },

  openCloseup() {
    if (get().selectedMatchId) set({ closeupOpen: true });
  },

  openMethod(section) {
    set((s) => ({ methodOpen: true, sourcesOpen: false, methodSection: section ?? null, methodNonce: s.methodNonce + 1 }));
  },

  showNotice(text, kind = "info", id) {
    const nid = id ?? `${kind}-${++noticeSeq}`;
    set({ notice: { id: nid, text, kind } });
    return nid;
  },

  dismissNotice(id) {
    if (id === undefined || get().notice?.id === id) set({ notice: null });
  },

  set(patch) {
    set(patch);
  },

  resetView() {
    set({
      ...CLOSE_PAIR,
      focus: null,
      focusProjectId: null,
      railOpen: false,
      cameraNonce: get().cameraNonce + 1,
    });
  },
}));

/** Keep the current tab if the match belongs to it; otherwise jump to its home tab. */
export function tabFor(m: Match, current: QueueTab): QueueTab {
  if (inTab(m, current)) return current;
  return m.reviewStatus;
}

export function inTab(m: Match, tab: QueueTab): boolean {
  if (tab === "conflicts") return m.conflicts.length > 0;
  return m.reviewStatus === tab;
}
