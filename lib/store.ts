"use client";

import { create } from "zustand";
import type { Match, MatchRun } from "@/lib/domain/types";

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
  select: (id: string | null, opts?: { section?: InspectorSection }) => void;
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
  region: "southeast",
  showFarApart: false,

  selectedMatchId: null,
  hoveredMatchId: null,
  hoveredProjectId: null,
  focusProjectId: null,

  inspectorOpen: false,
  inspectorSection: null,
  highlightConflict: false,
  briefOpen: false,
  sourcesOpen: false,
  methodOpen: false,
  demoStep: null,

  mapMode: "3d",
  basemap: "night",
  basemapFailed: false,
  cameraNonce: 0,

  async compare(opts) {
    const thresholdMiles = opts?.thresholdMiles ?? get().thresholdMiles;
    set({ running: !opts?.quiet, runError: null });
    const started = performance.now();
    try {
      const res = await fetch(`/api/matches?threshold=${thresholdMiles}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Engine request failed (${res.status})`);
      const run = (await res.json()) as MatchRun;
      // Let the scan read as a deliberate step, not a flicker. The engine itself runs in ~ms.
      const minVisible = opts?.quiet ? 0 : 900;
      const wait = Math.max(0, minVisible - (performance.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const selected = get().selectedMatchId;
      set({
        run,
        running: false,
        thresholdMiles,
        selectedMatchId: selected && run.matches.some((m) => m.id === selected) ? selected : opts?.quiet ? null : selected,
      });
      return run;
    } catch (err) {
      set({ running: false, runError: err instanceof Error ? err.message : "Engine unavailable" });
      return null;
    }
  },

  setThreshold(mi) {
    set({ thresholdMiles: mi });
  },

  select(id, opts) {
    if (!id) {
      set({ selectedMatchId: null, inspectorOpen: false, inspectorSection: null, highlightConflict: false });
      return;
    }
    const m = get().run?.matches.find((x) => x.id === id);
    set({
      selectedMatchId: id,
      inspectorOpen: true,
      inspectorSection: opts?.section ?? null,
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
