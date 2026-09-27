import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SNAPSHOT } from "@/lib/data";
import type { MatchRun } from "@/lib/domain/types";
import { runMatching } from "@/lib/matching/engine";
import { DEFAULT_FLAGS, passesFilters, useAtlas } from "@/lib/store";

const runs = new Map<number, MatchRun>();
const runAt = (mi: number) => {
  if (!runs.has(mi)) runs.set(mi, runMatching(SNAPSHOT, { thresholdMiles: mi, now: "t", listExclusions: false }));
  return runs.get(mi)!;
};

vi.stubGlobal("fetch", async (url: string) => {
  const mi = Number(new URL(url, "http://x").searchParams.get("threshold"));
  // a fresh copy per reply, as the API would send
  return { ok: true, status: 200, json: async () => structuredClone(runAt(mi)) };
});
afterAll(() => vi.unstubAllGlobals());

const initial = useAtlas.getState();
const st = () => useAtlas.getState();
const TOP = "desc-6888__gpc-20065";
const FEATURED = "dpc-alma-blair__xcel-wwtc";

beforeEach(() => {
  useAtlas.setState(initial, true);
});

describe("store: compare and reveal", () => {
  it("drops TIME from the default signal chips", () => {
    expect(st().flags).toEqual(DEFAULT_FLAGS);
    expect(st().flags).not.toContain("TIME");
  });

  it("bumps revealNonce only for an explicit Compare", async () => {
    await st().compare({ quiet: true });
    expect(st().revealNonce).toBe(0);
    await st().compare({ quiet: true, thresholdMiles: 30 });
    expect(st().revealNonce).toBe(0);
    await st().compare({ quiet: true, explicit: true });
    expect(st().revealNonce).toBe(1);
    expect(st().run?.thresholdMiles).toBe(30);
  });

  it("an explicit Compare lands on a tab with pairs in it", async () => {
    st().setRegion("southern-plains");
    expect(st().tab).toBe("needs-review");
    await st().compare({ quiet: true, explicit: true });
    expect(st().tab).toBe("known-coordination");
  });

  it("a radius re-run that drops the selected pair closes it with a notice; the next run clears the notice", async () => {
    await st().compare({ quiet: true });
    st().select(TOP);
    st().set({ closeupOpen: true });
    await st().compare({ quiet: true, thresholdMiles: 3 });
    expect(st()).toMatchObject({ selectedMatchId: null, inspectorOpen: false, closeupOpen: false });
    expect(st().notice).toMatchObject({ kind: "dropped-pair", text: "The pair isn't flagged at 3 mi" });
    await st().compare({ quiet: true, thresholdMiles: 25 });
    expect(st().notice).toBeNull();
  });
});

describe("store: selection", () => {
  beforeEach(() => useAtlas.setState({ run: runAt(25) }));

  it("select, resetView and resetRun close the close-up", () => {
    st().select(TOP);
    st().openCloseup();
    expect(st().closeupOpen).toBe(true);
    st().select(FEATURED);
    expect(st().closeupOpen).toBe(false);
    st().openCloseup();
    st().resetView();
    expect(st()).toMatchObject({ closeupOpen: false, selectedMatchId: null });
    st().select(TOP);
    st().openCloseup();
    st().resetRun();
    expect(st()).toMatchObject({ closeupOpen: false, run: null });
  });

  it("selecting a pair in another region switches region, resets its filters and closes the rail overlay", () => {
    st().set({ utilityFilter: "gpc", timing: ["confirmed"], conflictsOnly: true, railOpen: true });
    st().select(FEATURED);
    expect(st()).toMatchObject({ region: "upper-midwest", utilityFilter: null, timing: [], conflictsOnly: false, railOpen: false, tab: "known-coordination", inspectorOpen: true });
  });

  it("selecting a pair a filter hides undoes only that filter", () => {
    const m = runAt(25).matches.find((x) => x.id === TOP)!;
    st().set({ timing: m.time === "confirmed" ? ["no-match"] : ["confirmed"], conflictsOnly: m.conflicts.length > 0 });
    st().select(TOP);
    expect(st().timing).toEqual([]);
    expect(st().conflictsOnly).toBe(m.conflicts.length > 0);
    expect(passesFilters(m, st())).toBe(true);
  });

  it("selectNeighbor walks the list's visible order and stops at the ends", () => {
    const ids = runAt(25).matches.filter((m) => m.reviewStatus === "needs-review").slice(0, 3).map((m) => m.id);
    st().setVisibleOrder(ids);
    expect(st().selectNeighbor(1)).toBe(ids[0]);
    expect(st().selectNeighbor(1)).toBe(ids[1]);
    expect(st().selectNeighbor(1)).toBe(ids[2]);
    expect(st().selectNeighbor(1)).toBe(ids[2]);
    expect(st().selectNeighbor(-1)).toBe(ids[1]);
    expect(st().selectedMatchId).toBe(ids[1]);
  });

  it("setVisibleOrder ignores an unchanged order", () => {
    st().setVisibleOrder(["a", "b"]);
    const before = st().visibleOrder;
    st().setVisibleOrder(["a", "b"]);
    expect(st().visibleOrder).toBe(before);
  });
});

describe("store: region, focus, method, notices", () => {
  beforeEach(() => useAtlas.setState({ run: runAt(25) }));

  it("setRegion resets filters, focus and selection and picks the first non-empty tab", () => {
    st().select(TOP);
    st().set({ utilityFilter: "gpc", timing: ["possible"], conflictsOnly: true });
    const cam = st().cameraNonce;
    st().setRegion("southern-plains");
    expect(st()).toMatchObject({
      region: "southern-plains",
      utilityFilter: null,
      timing: [],
      conflictsOnly: false,
      focus: null,
      selectedMatchId: null,
      inspectorOpen: false,
      tab: "known-coordination",
      cameraNonce: cam + 1,
    });
    st().setRegion("southeast");
    expect(st().tab).toBe("needs-review");
  });

  it("focusProject narrows to the project's pairs and keeps a selection inside the focus", () => {
    st().select(TOP);
    st().focusProject("desc-6888");
    const f = st().focus!;
    expect(f).toMatchObject({ kind: "project", id: "desc-6888" });
    expect(f.pairIds).toContain(TOP);
    expect(f.pairIds.length).toBe(runAt(25).matches.filter((m) => m.projectAId === "desc-6888" || m.projectBId === "desc-6888").length);
    expect(st().selectedMatchId).toBe(TOP);
    st().setFocus(null);
    expect(st().focus).toBeNull();
  });

  it("openMethod opens the drawer at a section, closing Sources", () => {
    st().set({ sourcesOpen: true });
    st().openMethod("proof");
    expect(st()).toMatchObject({ methodOpen: true, sourcesOpen: false, methodSection: "proof", methodNonce: 1 });
    st().openMethod();
    expect(st()).toMatchObject({ methodSection: null, methodNonce: 2 });
  });

  it("dismissNotice with a stale id leaves a newer notice alone", () => {
    const a = st().showNotice("Couldn't copy — select the link", "clipboard");
    const b = st().showNotice("3D close-up unavailable on this device", "closeup-unavailable");
    st().dismissNotice(a);
    expect(st().notice?.id).toBe(b);
    st().dismissNotice(b);
    expect(st().notice).toBeNull();
  });
});
