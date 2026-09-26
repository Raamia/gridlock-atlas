"use client";

import { create } from "zustand";
import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match, MatchRun } from "@/lib/domain/types";

const DEFAULT_REGION = SNAPSHOT.regions[0]?.id ?? "all";

let seq = 0;
let inflight: AbortController | null = null;
let latest: Promise<MatchRun | null> = Promise.resolve(null);

export type QueueTab = "needs-review" | "known-coordination" | "conflicts" | "possible";
export type FlagFilter = "BOTH" | "GEO" | "TIME" | "POSSIBLE";
export type Basemap = "night" | "satellite" | "offline";
export type InspectorSection = "place" | "schedule" | "coordination" | "impact" | "conflicts" | "sources";

interface AtlasState {
  run: MatchRun | null;
  running: boolean;
  runError: string | null;
  thresholdMiles: number;

  tab: QueueTab;
  flags: FlagFilter[];
  utilityFilter: string | null;
  region: string;
  showFarApart: boolean;

  selectedMatchId: string | null;
  hoveredMatchId: string | null;
  hoveredProjectId: string | null;
  focusProjectId: string | null;

  inspectorOpen: boolean;
  inspectorSection: InspectorSection | null;
  highlightConflict: boolean;
  /** Conflict to lead the inspector's "Sources disagree" list with (and scroll to): a conflict id, project id or source id. */
  focusConflict: string | null;
  briefOpen: boolean;
  sourcesOpen: boolean;
  methodOpen: boolean;
  demoStep: number | null;

  mapMode: "3d" | "flat";
  basemap: Basemap;
  basemapFailed: boolean;
  cameraNonce: number;

  compare: (opts?: { thresholdMiles?: number; quiet?: boolean }) => Promise<MatchRun | null>;
  setThreshold: (mi: number) => void;
  select: (id: string | null, opts?: { section?: InspectorSection; focusConflict?: string }) => void;
  set: (patch: Partial<AtlasState>) => void;
  resetView: () => void;
}

export const useAtlas = create<AtlasState>((set, get) => ({
  run: null,
  running: false,
  runError: null,
  thresholdMiles: 25,

  tab: "needs-review",
  flags: ["BOTH", "GEO", "TIME", "POSSIBLE"],
  utilityFilter: null,
  region: DEFAULT_REGION,
  showFarApart: false,

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
  demoStep: null,

  mapMode: "3d",
  basemap: "night",
  basemapFailed: false,
  cameraNonce: 0,

  compare(opts) {
    // only the newest request may write: an older, slower reply (e.g. a larger radius) is aborted or dropped
    const my = ++seq;
    inflight?.abort();
    const ctrl = (inflight = new AbortController());
    const thresholdMiles = opts?.thresholdMiles ?? get().thresholdMiles;
    set({ running: !opts?.quiet, runError: null });
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
        const selected = get().selectedMatchId;
        const dropped = !!selected && !run.matches.some((m) => m.id === selected);
        set({
          run,
          running: false,
          thresholdMiles,
          // a pair that no longer qualifies (e.g. smaller radius) closes the inspector with it
          ...(dropped ? { selectedMatchId: null, inspectorOpen: false, inspectorSection: null, highlightConflict: false, focusConflict: null } : {}),
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

  select(id, opts) {
    if (!id) {
      set({ selectedMatchId: null, inspectorOpen: false, inspectorSection: null, highlightConflict: false, focusConflict: null });
      return;
    }
    const m = get().run?.matches.find((x) => x.id === id);
    const pairRegion = m ? SNAPSHOT.projects.find((p) => p.id === m.projectAId)?.region : undefined;
    const region = get().region === "all" || !pairRegion ? get().region : pairRegion;
    set({
      region,
      selectedMatchId: id,
      inspectorOpen: true,
      inspectorSection: opts?.section ?? null,
      focusConflict: opts?.focusConflict ?? null,
      focusProjectId: null,
      tab: m ? tabFor(m, get().tab) : get().tab,
      cameraNonce: get().cameraNonce + 1,
    });
  },

  set(patch) {
    set(patch);
  },

  resetView() {
    set({
      selectedMatchId: null,
      inspectorOpen: false,
      inspectorSection: null,
      focusProjectId: null,
      highlightConflict: false,
      focusConflict: null,
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
