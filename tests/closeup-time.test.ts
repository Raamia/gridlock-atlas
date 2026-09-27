import { describe, expect, it } from "vitest";
import { buildCloseupModel } from "@/components/closeup/model";
import { buildStory } from "@/components/closeup/story";
import { buildTimeModel, TIME_H, yearAt } from "@/components/closeup/time";
import { SNAPSHOT } from "@/lib/data";
import type { Match, Project } from "@/lib/domain/types";
import { runMatching } from "@/lib/matching/engine";

const run = runMatching(SNAPSHOT, { thresholdMiles: 25, now: "t", listExclusions: false });
const project = (id: string): Project => SNAPSHOT.projects.find((p) => p.id === id)!;
const build = (m: Match) => {
  const pa = project(m.projectAId);
  const pb = project(m.projectBId);
  const cu = buildCloseupModel(m, pa, pb, 25);
  const tm = buildTimeModel(m, pa, pb, cu);
  return { cu, tm, story: buildStory(m, cu, tm) };
};
const byId = (id: string) => run.matches.find((m) => m.id === id)!;
/** Height of 1 January of a year on this axis. */
const yearH = (tm: ReturnType<typeof build>["tm"], year: number) => (year - tm.epoch) * tm.unitsPerYear;

describe("close-up time axis: height is time", () => {
  it("keeps every drawn height on the axis, for every pair", () => {
    for (const m of run.matches) {
      const { tm } = build(m);
      expect(tm.height).toBe(TIME_H);
      expect(tm.years).toBeGreaterThanOrEqual(3);
      expect(tm.unitsPerYear * tm.years).toBeCloseTo(TIME_H, 6);
      const hs = [tm.snapshot.y, ...tm.pillars.flatMap((p) => [p.top, p.isd?.from, p.isd?.to, p.bar?.from, p.bar?.to]), tm.overlap?.from, tm.overlap?.to, tm.gap?.from, tm.gap?.to];
      for (const h of hs) {
        if (h === undefined) continue;
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(TIME_H + 1e-9);
      }
      for (const p of tm.pillars) {
        if (p.isd) expect(p.isd.to).toBeGreaterThanOrEqual(p.isd.from);
        if (p.bar) expect(p.bar.to).toBeGreaterThanOrEqual(p.bar.from);
      }
      // the sweep's running caption is in date order
      for (let i = 1; i < tm.events.length; i++) expect(tm.events[i].y).toBeGreaterThanOrEqual(tm.events[i - 1].y);
    }
  });

  it("puts the snapshot sheet at the snapshot date", () => {
    const { tm } = build(run.matches[0]);
    expect(Math.floor(yearAt(tm, tm.snapshot.y))).toBe(Number(SNAPSHOT.snapshotDate.slice(0, 4)));
    expect(tm.snapshot.text).toContain("2026");
  });

  it("draws a day-precision in-service date as a bead and a coarse one across its whole period", () => {
    const { tm } = build(byId("desc-06367-d-g__gpc-20065"));
    const a = tm.pillars.find((p) => p.side === "a")!;
    const b = tm.pillars.find((p) => p.side === "b")!;
    // DESC: Dec 1, 2026 (a stated day) · GPC: 2028 (a stated year)
    expect(a.isd?.crisp).toBe(true);
    expect(a.isd?.from).toBe(a.isd?.to);
    expect(b.isd?.crisp).toBe(false);
    expect(b.isd?.text).toBe("2028");
    expect(b.isd!.from).toBeCloseTo(yearH(tm, 2028), 6);
    expect(b.isd!.to).toBeCloseTo(yearH(tm, 2029), 6);
  });

  it("measures the in-service gap between the nearest stated edges, as the engine does", () => {
    const m = byId("desc-06367-d-g__gpc-20065");
    const { tm } = build(m);
    expect(tm.gap?.days).toBe(m.timeDetail.inService!.gapDays);
    expect(tm.gap?.coarse).toBe(true);
    expect(tm.gap?.text).toBe("≥ 396 days apart in service");
    const a = tm.pillars.find((p) => p.side === "a")!.isd!;
    const b = tm.pillars.find((p) => p.side === "b")!.isd!;
    expect(tm.gap!.from).toBeCloseTo(a.to, 6);
    expect(tm.gap!.to).toBeCloseTo(b.from, 6);
  });

  it("bridges a confirmed schedule overlap over exactly the engine's span", () => {
    const m = byId("desc-06367-d-g__gpc-20065");
    const { tm } = build(m);
    expect(m.time).toBe("confirmed");
    expect(tm.overlap?.confirmed).toBe(true);
    expect(tm.overlap?.text).toMatch(/^Schedules overlap · /);
    expect(tm.pillars.every((p) => p.bar?.tone === "schedule")).toBe(true);
    // the bridge lies inside both schedules
    for (const p of tm.pillars) {
      expect(tm.overlap!.from).toBeGreaterThanOrEqual(p.bar!.from - 1e-9);
      expect(tm.overlap!.to).toBeLessThanOrEqual(p.bar!.to + 1e-9);
    }
  });

  it("never states a start date the source does not publish (open start fades)", () => {
    const m = byId("desc-0139-m-n__gpc-20065");
    const { tm } = build(m);
    const withOpen = run.matches.map((x) => build(x).tm).flatMap((t) => t.pillars).filter((p) => p.bar?.openStart);
    expect(withOpen.length).toBeGreaterThan(0);
    for (const p of withOpen) {
      expect(p.bar!.text).not.toMatch(/→ .*→/);
      // the fade needs a year of room under the solid start
      expect(p.bar!.from).toBeGreaterThanOrEqual(0);
    }
    expect(tm.pillars.length).toBe(2);
  });

  it("calls a possible overlap possible, never confirmed", () => {
    const possible = run.matches.filter((m) => m.time === "possible").map(build).filter(({ tm }) => tm.overlap);
    expect(possible.length).toBeGreaterThan(0);
    for (const { tm } of possible) {
      expect(tm.overlap!.confirmed).toBe(false);
      expect(tm.overlap!.text).toMatch(/may overlap/);
    }
  });

  it("draws no pillar for a county-level project, and names it instead", () => {
    const { cu, tm, story } = build(byId("desc-6888__gpc-effingham-500"));
    const county = [cu.a, cu.b].filter((p) => p.countyOnly);
    expect(county.length).toBeGreaterThan(0);
    for (const p of county) {
      expect(tm.pillars.find((x) => x.side === p.side)).toBeUndefined();
      expect(tm.unplaced.map((x) => x.owner)).toContain(p.owner);
    }
    expect(tm.overlap).toBeNull();
    expect(tm.gap).toBeNull();
    const time = story.find((s) => s.id === "time")!;
    expect(time.kicker).toBe("Time, one side");
    expect(time.text).toContain(`${county[0].owner}'s project is located only at county level`);
    const undated = run.matches.map(build).find(({ tm: t }) => t.undated.length);
    if (undated) expect(undated.story.find((s) => s.id === "rise")!.text).toMatch(/publishes? no date here/);
  });

  it("faces the side-on camera so A reads left of B", () => {
    const { tm } = build(byId("desc-6888__gpc-20065"));
    const [a, b] = [tm.pillars.find((p) => p.side === "a")!, tm.pillars.find((p) => p.side === "b")!];
    // camera direction from the target (THREE spherical: x = sin θ, z = cos θ); screen-right = (dz, -dx)
    const dx = Math.sin(tm.sideAzimuth);
    const dz = Math.cos(tm.sideAzimuth);
    const right = (b.at.x - a.at.x) * dz + (b.at.z - a.at.z) * -dx;
    expect(right).toBeGreaterThan(0);
  });
});

describe("close-up story: every caption comes from the snapshot", () => {
  it("has the five beats, in order, with the axis raised from the third", () => {
    for (const m of run.matches) {
      const { story } = build(m);
      expect(story.map((s) => s.id)).toEqual(["pair", "ground", "rise", "time", "call"]);
      expect(story.map((s) => s.time)).toEqual([false, false, true, true, true]);
      expect(story.filter((s) => s.sweep).map((s) => s.id)).toEqual(["rise"]);
      for (const s of story) {
        expect(s.text.length).toBeGreaterThan(10);
        expect(s.text).not.toMatch(/undefined|NaN|null/);
        expect(s.ms).toBeGreaterThan(4000);
        for (const v of s.shot.target) expect(Number.isFinite(v)).toBe(true);
        expect(s.shot.polar).toBeGreaterThan(0.15 * Math.PI);
        expect(s.shot.polar).toBeLessThan((s.time ? 0.47 : 0.42) * Math.PI);
      }
    }
  });

  it("keeps the honesty wording: schedules are not field-work dates, needs-review is not uncoordinated", () => {
    const m = byId("desc-06367-d-g__gpc-20065");
    const { story } = build(m);
    const time = story.find((s) => s.id === "time")!;
    expect(time.kicker).toBe("Overlapping in time");
    expect(time.text).toMatch(/published schedules \(start → in-service\) overlap/);
    expect(time.text).toMatch(/field-work dates are not published/);
    expect(time.text).toMatch(/at least 396 days apart/);
    const call = story.find((s) => s.id === "call")!.text;
    if (m.reviewStatus === "needs-review") expect(call).toMatch(/not “uncoordinated\.”/);
    for (const x of run.matches) {
      const c = build(x).story.find((s) => s.id === "call")!.text;
      if (x.reviewStatus === "known-coordination") expect(c).toMatch(/known interface, not a new gap/);
      expect(c).not.toMatch(/\buncoordinated\b(?!\.”)/);
    }
  });

  it("describes a touching pair without a mileage, and a measured pair by its closest points", () => {
    const touching = build(byId("dpc-alma-blair__xcel-wwtc")).story.find((s) => s.id === "ground")!.text;
    expect(touching).toMatch(/Tremval North/);
    expect(touching).not.toMatch(/\d mi apart/);
    const measured = build(byId("desc-6888__gpc-20065")).story.find((s) => s.id === "ground")!.text;
    expect(measured).toMatch(/^Closest points ≈?[\d.<]+ mi apart/);
    expect(measured).toMatch(/review radius/);
  });
});
