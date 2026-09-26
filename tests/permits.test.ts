import { describe, expect, it } from "vitest";
import { IDX, SNAPSHOT } from "@/lib/data";
import { runMatching } from "@/lib/matching/engine";
import { LEAD_PERMITS, looksLikeUtility, SAVED } from "@/lib/permits";
import { regionMatches } from "@/lib/rank";

const run = runMatching(SNAPSHOT, { thresholdMiles: 25, now: "t", listExclusions: false });

describe("state permit check", () => {
  it("has a finding for both projects behind the highest-ranked Savannah River needs-review lead", () => {
    const top = regionMatches(run, "southeast")
      .filter((m) => m.reviewStatus === "needs-review")
      .slice(0, 1);
    const ids = new Set(top.flatMap((m) => [m.projectAId, m.projectBId]));
    expect([...ids].filter((id) => !LEAD_PERMITS.some((f) => f.projectId === id))).toEqual([]);
  });

  it("names only projects in the snapshot", () => {
    for (const f of LEAD_PERMITS) expect(IDX.project(f.projectId), f.projectId).toBeDefined();
  });

  it("finds no Georgia Power filing for its side of the top leads in the saved search", () => {
    const names = SAVED.georgia.utilityFilings.filter((f) => (f.submitted ?? "") >= "2024-01-01").map((f) => f.facility.toLowerCase());
    for (const n of ["goshen - mcintosh", "rice hope", "goshen - kraft", "georgia pacific"]) expect(names.filter((x) => x.includes(n))).toEqual([]);
    expect(SAVED.georgia.searches.some((s) => s.capped)).toBe(false);
  });

  it("keeps utility work and drops look-alikes", () => {
    expect(looksLikeUtility("Salt Creek 230KV Substation")).toBe(true);
    expect(looksLikeUtility("Branch Goshen 230kV TL P79457")).toBe(true);
    expect(looksLikeUtility("OLD DOMINION FREIGHT LINE, INC. - SAV")).toBe(false);
    expect(looksLikeUtility("HWY 278 8-Inch Steel Tie-In")).toBe(false);
    expect(looksLikeUtility("Jasper - Riverport Transmission Main (Jasper - Okatie Segment)")).toBe(false);
  });
});
