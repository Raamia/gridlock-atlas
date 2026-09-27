import { describe, expect, it } from "vitest";
import { overlapStatement, pairDomain } from "@/components/timeline/model";
import { IDX, SNAPSHOT } from "@/lib/data";
import { formatUsd, impactChannels } from "@/lib/impact";
import { runMatching } from "@/lib/matching/engine";
import { activeWindows, scheduleWindows } from "@/lib/matching/time";
import { canMove, clampMonths, MAX_SHIFT_MONTHS, shiftIso, shiftLabel, shiftProject, whatIf, whatIfDomain, whatIfImpact, type WhatIfMove } from "@/lib/whatif";

// the app's default run (25 mi, the sponsor rule)
const run = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 25, listExclusions: false });
const TOP = "desc-06367-d-g__gpc-20065"; // DESC Jasper – Okatie #2 × Georgia Power Goshen–McIntosh rebuild
const top = run.matches.find((m) => m.id === TOP)!;
const MOVES: WhatIfMove[] = ["a", "b"];

describe("shifting dates by whole months", () => {
  it("keeps month-aligned bounds aligned and clamps to the target month", () => {
    expect(shiftIso("2026-06-01", 12)).toBe("2027-06-01");
    expect(shiftIso("2028-12-31", 2)).toBe("2029-02-28");
    expect(shiftIso("2028-02-29", 12)).toBe("2029-02-28");
    expect(shiftIso("2026-01-30", 1)).toBe("2026-02-28");
    expect(shiftIso("2026-03-15", -3)).toBe("2025-12-15");
    expect(shiftIso("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftIso("2026-09-26", 0)).toBe("2026-09-26");
    // a month-start date round-trips
    for (const n of [-36, -13, -1, 1, 7, 36]) expect(shiftIso(shiftIso("2027-04-01", n), -n)).toBe("2027-04-01");
  });

  it("never moves the open-end sentinel ('end not published')", () => {
    expect(shiftIso("2099-12-31", 12)).toBe("2099-12-31");
  });

  it("clamps to ±36 whole months and words the offset", () => {
    expect([clampMonths(100), clampMonths(-100), clampMonths(2.6), clampMonths(Number.NaN), clampMonths(0)]).toEqual([36, -36, 3, 0, 0]);
    expect(MAX_SHIFT_MONTHS).toBe(36);
    expect([shiftLabel(0), shiftLabel(1), shiftLabel(12), shiftLabel(-1), shiftLabel(-6), shiftLabel(99)]).toEqual([
      "as planned",
      "1 month later",
      "12 months later",
      "1 month earlier",
      "6 months earlier",
      "36 months later",
    ]);
    const far = whatIf(top, "a", 100);
    expect(far.months).toBe(36);
    expect(far.statement).toBe(whatIf(top, "a", 36).statement);
    expect(whatIf(top, "b", -500).months).toBe(-36);
  });

  it("moves every window and dated claim of the moved project, keeping precision and flags; drops source wording", () => {
    for (const p of SNAPSHOT.projects.filter(canMove)) {
      const q = shiftProject(p, 7);
      expect(q.id).toBe(p.id);
      p.constructionWindows.forEach((w, i) => {
        const v = q.constructionWindows[i];
        expect(v.id).toBe(w.id);
        expect([v.phase, v.continuous, v.openStart, v.openEnded, v.boundsOnly, v.supersededBy]).toEqual([w.phase, w.continuous, w.openStart, w.openEnded, w.boundsOnly, w.supersededBy]);
        for (const k of ["start", "end"] as const) {
          expect(v[k].precision).toBe(w[k].precision);
          expect(v[k].label).toBeUndefined();
          expect(v[k].earliest).toBe(shiftIso(w[k].earliest, 7));
          expect(v[k].latest).toBe(shiftIso(w[k].latest, 7));
        }
      });
      p.completionClaims.forEach((c, i) => expect(q.completionClaims[i].date.earliest).toBe(shiftIso(c.date.earliest, 7)));
    }
    // 0 months is the project itself
    expect(shiftProject(IDX.project(top.projectAId), 0)).toBe(IDX.project(top.projectAId));
  });
});

describe("what-if = the engine on shifted dates", () => {
  it("at 0 months reproduces the as-planned TIME level, reason and overlap statement for every flagged pair", () => {
    expect(run.matches.length).toBeGreaterThan(100);
    for (const m of run.matches)
      for (const move of MOVES) {
        const r = whatIf(m, move, 0);
        expect(r.months).toBe(0);
        expect(r.level, `${m.id} ${move}`).toBe(m.time);
        expect(r.reason, `${m.id} ${move}`).toBe(m.timeReason);
        expect(r.statement, `${m.id} ${move}`).toBe(overlapStatement(m).text);
        expect(r.match.timeDetail).toEqual(m.timeDetail);
      }
  });

  it("top lead: DESC's schedule moved later lengthens the certain schedule overlap; moved earlier its date passes", () => {
    const plan = whatIf(top, "a", 0);
    expect(plan.level).toBe("confirmed");
    expect(plan.statement).toBe("Schedules overlap Jun 2025–Dec 2026 · 18 months");
    expect([plan.overlapMonths, plan.overlapFromSnapshotMonths, plan.gapMonths]).toEqual([18, 2, null]);

    const later = whatIf(top, "a", 12);
    expect(later.level).toBe("confirmed");
    expect(later.statement).toBe("Schedules overlap Jun 2025–Dec 2027 · 30 months");
    expect([later.overlapMonths, later.overlapFromSnapshotMonths]).toEqual([30, 14]);
    expect(later.detail).toBe("14 months of it on or after the snapshot (Sep 26, 2026)");
    // the moved side is drawn shifted, with its as-published windows for the dashed outline
    expect(later.a.moved).toBe(true);
    expect(later.b.moved).toBe(false);
    expect(later.a.windows.map((w) => w.end.latest)).toEqual(later.a.originalWindows.map((w) => shiftIso(w.end.latest, 12)));

    // a year earlier DESC's in-service date (Dec 2025) is before the snapshot: the engine's passed-date rule caps TIME at possible
    const earlier = whatIf(top, "a", -12);
    expect(earlier.level).toBe("possible");
    expect(earlier.overlapMonths).toBeNull();
    expect(earlier.match.pastDue?.map((d) => d.projectId)).toEqual([top.projectAId]);
    expect(earlier.detail).toMatch(/^Date passed for .+: completion not confirmed, so timing is at most possible$/);

    // two years earlier the windows are ruled apart
    const apart = whatIf(top, "a", -24);
    expect(apart.level).toBe("no-match");
    expect(apart.statement).toBe("No overlap in the published windows");
    expect(apart.gapMonths).toBe(4);
    expect(apart.detail).toBe("At least 4 months apart, even at the widest reading of the published dates");
  });

  it("top lead: Georgia Power's rebuild moved later shortens the overlap, then rules it out", () => {
    expect(whatIf(top, "b", 12)).toMatchObject({ level: "confirmed", statement: "Schedules overlap Jun 2026–Dec 2026 · 6 months", overlapMonths: 6, overlapFromSnapshotMonths: 2 });
    expect(whatIf(top, "b", 24)).toMatchObject({ level: "no-match", overlapMonths: null, overlapFromSnapshotMonths: null, gapMonths: 4 });
    // a certain overlap entirely in the past is still reported as past, never as months ahead
    const past = whatIf(top, "b", -24);
    expect(past.level).toBe("confirmed");
    expect(past.overlapFromSnapshotMonths).toBe(0);
    expect(past.detail).toBe("All of it before the snapshot (Sep 26, 2026)");
  });

  it("never invents a window: a project with no published schedule cannot be moved", () => {
    const pairs = run.matches.flatMap((m) => MOVES.filter((mv) => !canMove(IDX.project(mv === "a" ? m.projectAId : m.projectBId))).map((mv) => [m, mv] as const));
    expect(pairs.length).toBeGreaterThan(0);
    for (const [m, mv] of pairs) {
      const r = whatIf(m, mv, 12);
      expect(r.movable).toBe(false);
      expect(r.months).toBe(0);
      expect(r.level).toBe(m.time);
      expect(r.statement).toBe(overlapStatement(m).text);
      expect(r.detail).toBe("No published schedule to move");
      expect(r[mv].windows).toEqual([]);
      expect(r[mv].project).toBe(r[mv].original);
      expect(activeWindows(r[mv].project).length + scheduleWindows(r[mv].project).length).toBe(0);
    }
  });

  it("keeps one axis for the whole card: it holds the pair's own axis at every offset of either project", () => {
    for (const m of [top, ...run.matches.slice(0, 20)]) {
      const d = whatIfDomain(m);
      const a = IDX.project(m.projectAId);
      const b = IDX.project(m.projectBId);
      for (let k = -36; k <= 36; k += 6)
        for (const own of [pairDomain(shiftProject(a, k), b), pairDomain(a, shiftProject(b, k))]) {
          expect(d.y0).toBeLessThanOrEqual(own.y0);
          expect(d.y1).toBeGreaterThanOrEqual(own.y1);
        }
    }
  });
});

describe("impact tie-in and honesty", () => {
  it("reports whether the staging channel stays listed, with the channel's own label, value and basis", () => {
    const own = impactChannels(top).find((c) => c.key === "staging")!;
    const plan = whatIfImpact(whatIf(top, "a", 0))!;
    expect(plan).toMatchObject({ label: own.label, basis: own.basis, applies: true, value: `up to ≈ ${formatUsd(own.usd![1])}` });
    expect(plan.why).toBe("published schedules overlap 2 months from Sep 2026");
    expect(whatIfImpact(whatIf(top, "a", 12))!.why).toBe("published schedules overlap 14 months from Sep 2026");
    const off = whatIfImpact(whatIf(top, "b", 24))!;
    expect(off).toMatchObject({ applies: false, value: plan.value, why: "no months together" });
    expect(off.text).toContain("does not apply");
  });

  it("applies exactly when the engine's impact model lists the channel (timing not ruled out)", () => {
    for (const m of run.matches.slice(0, 40))
      for (const k of [-24, 0, 24]) {
        const r = whatIf(m, "a", k);
        const i = whatIfImpact(r);
        if (!i) continue;
        expect(i.applies).toBe(r.level !== "no-match");
        expect(i.applies).toBe(impactChannels(r.match).some((c) => c.key === "staging"));
      }
  });

  it("no sums, no likelihoods, no expected savings: the only dollar figure is the channel's own", () => {
    const BANNED = /expected|chance|probab|likel|will save|savings|uncoordinated|odds/i;
    let checked = 0;
    for (const m of run.matches)
      for (const mv of MOVES)
        for (const k of [-36, -12, -1, 0, 1, 12, 36]) {
          const r = whatIf(m, mv, k);
          for (const s of [r.statement, r.detail ?? "", shiftLabel(k)]) {
            expect(s).not.toMatch(/\$/);
            expect(s).not.toMatch(BANNED);
          }
          const i = whatIfImpact(r);
          if (!i) continue;
          checked++;
          expect(i.why).not.toMatch(/\$/);
          expect(i.text).not.toMatch(BANNED);
          // exactly one dollar figure, and it is the channel's value as the Impact section prints it
          expect(i.text.match(/\$/g)?.length ?? 0).toBe(i.value ? 1 : 0);
          if (i.value) expect(i.text).toContain(i.value);
          expect(i.text).not.toMatch(/[+−-]\s*\$|\$[\d.]+[KMB]?\s*(?:[+−-]|vs\.?)/);
        }
    expect(checked).toBeGreaterThan(100);
  });
});
