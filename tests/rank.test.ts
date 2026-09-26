import { describe, expect, it } from "vitest";
import { IDX, SNAPSHOT } from "@/lib/data";
import { regionExports } from "@/lib/export";
import { runMatching } from "@/lib/matching/engine";
import { firstNonEmptyTab, queueRank, rankLabel, rankOf, regionMatches, REVIEW_TABS, tabTotal, tabTotals } from "@/lib/rank";
import { sponsorReplay } from "@/lib/sponsor";

const run = runMatching(SNAPSHOT, { thresholdMiles: 25, now: "t", listExclusions: false });
const REGIONS = [...SNAPSHOT.regions.map((r) => r.id), "all"];

/** RFC 4180 rows (quoted cells may hold commas, newlines and doubled quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') quoted = !quoted;
    else if (quoted || (ch !== "," && ch !== "\n")) cell += ch;
    else {
      row.push(cell);
      cell = "";
      if (ch === "\n") {
        rows.push(row);
        row = [];
      }
    }
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

describe("queue rank (lib/rank.ts)", () => {
  it("puts desc-6888 × gpc-20065 at #1 of Savannah River's Needs review", () => {
    const m = run.matches.find((x) => x.id === "desc-6888__gpc-20065")!;
    expect(m.reviewStatus).toBe("needs-review");
    expect(queueRank(run, "southeast").get(m.id)).toBe(1);
    expect(rankOf(run, "southeast", m.id)).toBe(1);
    expect(rankLabel(1)).toBe("01");
  });

  it("puts Sperry's OVL_3 pair at #2 of Savannah River's Needs review", () => {
    const ovl3 = sponsorReplay(run, SNAPSHOT).find((r) => r.id === "OVL_3")!;
    expect(ovl3.status).toBe("in-queue");
    expect(ovl3.tab).toBe("needs-review");
    expect(queueRank(run, "southeast").get(ovl3.matchId!)).toBe(2);
    // the same number Method shows ("In our queue: #N")
    expect(ovl3.rank).toBe(2);
  });

  it("equals the CSV queue_rank column for every row of every region's flagged-pairs export", () => {
    let rows = 0;
    for (const region of REGIONS) {
      const ranks = queueRank(run, region);
      const parsed = parseCsv(regionExports(run, region).flagged.csv());
      expect(parsed.length).toBe(regionMatches(run, region).length);
      for (const r of parsed) {
        expect(ranks.get(r.pair_id), `${region} ${r.pair_id}`).toBe(Number(r.queue_rank));
        rows++;
      }
    }
    expect(rows).toBe(run.matches.length * 2);
  });

  it("equals the sponsor replay's rank (Method) for every in-queue row, within the pair's region", () => {
    for (const r of sponsorReplay(run, SNAPSHOT)) {
      if (r.matchId && r.rank !== undefined) {
        const region = IDX.project(run.matches.find((m) => m.id === r.matchId)!.projectAId).region;
        expect(rankOf(run, region, r.matchId)).toBe(r.rank);
      }
      if (r.related?.matchId && r.related.rank !== undefined) {
        const region = IDX.project(run.matches.find((m) => m.id === r.related!.matchId)!.projectAId).region;
        expect(rankOf(run, region, r.related.matchId)).toBe(r.related.rank);
      }
    }
  });

  it("numbers each tab 1..n in engine priority order", () => {
    for (const region of REGIONS) {
      const ranks = queueRank(run, region);
      for (const tab of REVIEW_TABS) {
        const inTab = regionMatches(run, region).filter((m) => m.reviewStatus === tab);
        expect(inTab.map((m) => ranks.get(m.id))).toEqual(inTab.map((_, i) => i + 1));
        expect(tabTotal(run, region, tab)).toBe(inTab.length);
      }
    }
  });

  it("counts tabs per region and picks the first non-empty tab", () => {
    expect(tabTotals(run, "southeast")).toEqual({ "needs-review": 95, "known-coordination": 0, possible: 28 });
    expect(tabTotals(run, "upper-midwest")).toEqual({ "needs-review": 2, "known-coordination": 7, possible: 0 });
    expect(tabTotals(run, "southern-plains")).toEqual({ "needs-review": 0, "known-coordination": 1, possible: 0 });
    expect(tabTotal(run, "southeast", "conflicts")).toBe(74);
    expect(firstNonEmptyTab(run, "southeast")).toBe("needs-review");
    expect(firstNonEmptyTab(run, "southern-plains")).toBe("known-coordination");
    expect(firstNonEmptyTab(run, "all")).toBe("needs-review");
  });

  it("gives no rank to a pair outside the region", () => {
    expect(rankOf(run, "upper-midwest", "desc-6888__gpc-20065")).toBeUndefined();
    expect(rankOf(run, "all", "desc-6888__gpc-20065")).toBe(1);
  });
});
