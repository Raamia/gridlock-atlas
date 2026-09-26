import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import example from "@/data/sponsor-example.json";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { Match } from "@/lib/domain/types";
import { overlapTableCsv, projectTableCsv, regionExports, SPONSOR_OVERLAP_HEAD, SPONSOR_PROJECT_HEAD } from "@/lib/export";
import { runMatching } from "@/lib/matching/engine";
import { centerOf } from "@/lib/matching/geo";
import {
  CONTEXT,
  CONTEXT_SOURCES,
  facilityNameSpread,
  PACKET,
  SEARCHES,
  sponsorReplay,
  sponsorSheetCheck,
  sponsorStarter,
  STARTER,
  starterBlanks,
  starterNameSpread,
  withinSponsorRule,
  type Cite,
} from "@/lib/sponsor";
import { CACHE, locate, pagesOf, readMeta } from "@/scripts/source-cache";
import { normalize } from "@/scripts/textnorm";

/** RFC 4180 rows (quoted cells may hold commas and doubled quotes). */
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
  for (const r of body) expect(r).toHaveLength(head.length);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const headOf = (text: string) => text.split("\n")[0].split(",");

const run = runMatching(SNAPSHOT, { now: "t", listExclusions: false });
const southeast = run.matches.filter((m) => IDX.project(m.projectAId).region === "southeast");

describe("sponsor-format overlap CSV", () => {
  const text = overlapTableCsv(southeast, { sponsorOnly: true });
  const rows = parseCsv(text);

  it("starts with exactly the starter file's overlap columns", () => {
    expect(headOf(text).slice(0, 9)).toEqual(SPONSOR_OVERLAP_HEAD);
    expect(headOf(text)).not.toContain("sponsor_rule");
  });

  it("keeps only pairs whose centers are under 25 mi, closest first, numbered OVL_1… in that order", () => {
    expect(rows.length).toBe(southeast.filter(withinSponsorRule).length);
    expect(rows.length).toBeGreaterThan(40);
    const miles = rows.map((r) => Number(r.distance_mi));
    for (const d of miles) expect(d).toBeLessThan(25);
    expect([...miles].sort((a, b) => a - b)).toEqual(miles);
    expect(rows.map((r) => r.overlap_id)).toEqual(rows.map((_, i) => `OVL_${i + 1}`));
    expect(new Set(rows.map((r) => r.pair_id)).size).toBe(rows.length);
    for (const r of rows) expect(r.distance_mi).toBe(southeast.find((m) => m.id === r.pair_id)!.geoDetail.center!.miles.toFixed(2));
  });

  it("stays on the sponsor's 25 mi rule when the review radius is wider", () => {
    const wide = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 40, listExclusions: false }).matches.filter((m) => IDX.project(m.projectAId).region === "southeast");
    const strict = parseCsv(overlapTableCsv(wide, { sponsorOnly: true }));
    expect(strict.length).toBe(rows.length);
    const all = parseCsv(overlapTableCsv(wide));
    expect(all.some((r) => /^flagged at the 40 mi review radius/.test(r.beyond_rule_reason))).toBe(true);
  });
});

describe("extended overlap CSV (every flagged pair)", () => {
  const strict = new Map(parseCsv(overlapTableCsv(southeast, { sponsorOnly: true })).map((r) => [r.pair_id, r.overlap_id]));
  const rows = parseCsv(overlapTableCsv(run.matches));
  const byPair = new Map(rows.map((r) => [r.pair_id, r]));

  it("lists every flagged pair; rows inside the rule keep their OVL id, the rest are EXT_n with a reason", () => {
    expect(rows.length).toBe(run.matches.length);
    for (const r of parseCsv(overlapTableCsv(southeast))) {
      if (strict.has(r.pair_id)) expect([r.overlap_id, r.sponsor_rule, r.beyond_rule_reason]).toEqual([strict.get(r.pair_id), "yes", ""]);
      else expect([r.overlap_id.startsWith("EXT_"), r.sponsor_rule, r.beyond_rule_reason.length > 0]).toEqual([true, "no", true]);
    }
  });

  it("says why each pair beyond the rule was flagged", () => {
    expect(byPair.get("dpc-alma-blair__xcel-wwtc")?.beyond_rule_reason).toMatch(/^shared facility (stated in a source|implied by several sources) \(centers \d+\.\d mi apart\)$/);
    expect(byPair.get("desc-6888__gpc-effingham-500")?.beyond_rule_reason).toBe("county-level location only (no project center)");
    const far = rows.filter((r) => r.geo_method === "measured" && r.sponsor_rule === "no");
    for (const r of far) expect(r.beyond_rule_reason).toMatch(/^location uncertainty: centers \d+\.\d mi apart, near edge \d+\.\d mi$/);
  });
});

describe("project table", () => {
  it("reproduces the starter file's projects sheet (center formula, overlap_count, overlap_1..3)", () => {
    const { projects, matches } = sponsorStarter();
    const text = projectTableCsv(projects, matches);
    expect(headOf(text).slice(0, 17)).toEqual([...SPONSOR_PROJECT_HEAD, "overlap_1", "overlap_2", "overlap_3"]);
    const rows = parseCsv(text);
    expect(rows.map((r) => r.project_id)).toEqual(STARTER.map((p) => p.id));
    for (const [i, s] of STARTER.entries()) {
      const r = rows[i];
      expect([r.utility, r.state, r.project_name, r.in_service_date], s.id).toEqual([s.utility, s.state, s.name, s.inService]);
      expect(Math.abs(Number(r.lat_center) - s.sheet.center[0]), s.id).toBeLessThan(1e-6);
      expect(Math.abs(Number(r.lon_center) - s.sheet.center[1]), s.id).toBeLessThan(1e-6);
      expect(Number(r.overlap_count), s.id).toBe(s.sheet.overlaps.length);
      expect([r.overlap_1, r.overlap_2, r.overlap_3].filter(Boolean), s.id).toEqual(s.sheet.overlaps);
    }
    expect(sponsorSheetCheck().every((x) => x.ok)).toBe(true);
  });

  it("on live data, back-references the sponsor-format overlap rows and centers each project as the engine does", () => {
    const x = regionExports(run, "southeast");
    const overlaps = parseCsv(x.overlaps.csv());
    const rows = parseCsv(x.projects.csv());
    expect(rows.length).toBe(SNAPSHOT.projects.filter((p) => p.region === "southeast").length);
    expect(rows.reduce((n, r) => n + Number(r.overlap_count), 0)).toBe(2 * overlaps.length);
    const byId = new Map(rows.map((r) => [r.project_id, r]));
    for (const o of overlaps)
      for (const [p, partner] of [
        [o.project_id_a, o.project_id_b],
        [o.project_id_b, o.project_id_a],
      ]) {
        const r = byId.get(p)!;
        const k = r.overlap_ids.split(" ").indexOf(o.overlap_id);
        expect(k, `${p} ${o.overlap_id}`).toBeGreaterThanOrEqual(0);
        expect(r[`overlap_${k + 1}`]).toBe(partner);
      }
    for (const r of rows) {
      const c = centerOf(IDX.project(r.project_id));
      expect(r.lat_center === "" ? null : Number(r.lat_center)).toBe(c ? +c.lonlat[1].toFixed(7) : null);
      expect([r.name_a, r.name_b]).toEqual([c?.places[0]?.label ?? "", c?.places[1]?.label ?? ""]);
    }
    const excluded = new Map(run.excludedProjects.map((e) => [e.projectId, e.reason]));
    for (const r of rows) expect(r.engine_status).toBe(excluded.get(r.project_id) ?? "eligible");
  });
});

describe("the starter file's six rows in today's plans", () => {
  const rows = sponsorReplay(run, SNAPSHOT);
  const row = (id: string) => rows.find((r) => r.id === id)!;
  const rankOf = (m: Match) => run.matches.filter((x) => x.reviewStatus === m.reviewStatus && IDX.project(x.projectAId).region === IDX.project(m.projectAId).region).indexOf(m) + 1;

  it("maps starter projects to today's records with the same title", () => {
    const key = (t: string) => normalize(t).replace(/[^a-z0-9]/g, "");
    for (const [id, t] of Object.entries(example.today as Record<string, { projectId?: string }>))
      if (t.projectId) expect(key(IDX.project(t.projectId).title), id).toBe(key(STARTER.find((p) => p.id === id)!.name));
  });

  it("finds OVL_3 in the queue and ranks it as the queue does", () => {
    const r = row("OVL_3");
    const m = run.matches.find((x) => x.id === "desc-06367-d-g__gpc-20065")!;
    expect(r).toMatchObject({ status: "in-queue", matchId: m.id, withinRule: true, rank: rankOf(m) });
  });

  it("explains OVL_2 from the run: in the queue, or hidden with the engine's own reason", () => {
    const r = row("OVL_2");
    const m = run.matches.find((x) => x.id === "desc-06367-d-g__gpc-20277");
    if (m) expect(r).toMatchObject({ status: "in-queue", rank: rankOf(m) });
    else {
      expect(r.status).toBe("hidden");
      expect(r.reasons!.join(" ")).toMatch(/McIntosh - Purrysburg/);
    }
    expect(r.miles).toBeCloseTo(4.23, 2);
  });

  it("marks DESC projects missing from the current list as no longer listed, citing where they were last listed", () => {
    const planIds = { OVL_1: "6810 A", OVL_4: "6809 E", OVL_5: "6808 S", OVL_6: "6808 S" } as const;
    for (const [id, plan] of Object.entries(planIds)) {
      const r = row(id);
      expect(r.status, id).toBe("not-listed");
      expect(r.a.notListed?.planId).toBe(plan);
      expect(r.a.notListed?.absentFrom).toContain("desc-scrtp-2026-2030");
      expect(SNAPSHOT.projects.some((p) => (p.docketId ?? "").includes(plan))).toBe(false);
    }
    expect(row("OVL_4").related?.matchId).toBe("desc-6809-g__gpc-20793");
    for (const r of rows) for (const t of r.reasons ?? []) expect(t).not.toMatch(/\bcompleted\b/i);
  });

  it("without a run, keeps the listing facts and waits for the rest", () => {
    const idle = sponsorReplay(null, SNAPSHOT);
    expect(idle.map((r) => r.status)).toEqual(["not-listed", "not-run", "not-run", "not-listed", "not-listed", "not-listed"]);
  });
});

describe("one facility name, one location", () => {
  it("only Goshen (two different substations) resolves to more than one place", () => {
    const s = facilityNameSpread(SNAPSHOT.projects);
    expect(s.spread.map((x) => x.key)).toEqual(["goshen"]);
    expect(s.spread[0].miles).toBeGreaterThan(50);
  });

  it("flags the starter file's two McIntosh coordinates and finds its blank sub-points", () => {
    expect(starterNameSpread().map((x) => [x.name, x.ids, +x.miles.toFixed(2)])).toEqual([["MCINTOSH", ["GPC_2", "GPC_3"], 0.41]]);
    const blanks = Object.fromEntries(starterBlanks(SNAPSHOT.projects).map((b) => [b.name, b.found?.projectId ?? null]));
    expect(blanks).toEqual({ "Hooks Sub": "desc-6809-g", "Ft Johnson Sub": null, PURRYSBURG: "gpc-20277" });
  });
});

/* ---------------- every cited excerpt re-found verbatim in the cached sources (needs the fetch cache) ---------------- */

const cached = fs.existsSync(path.join(CACHE, "text"));
const cites: Cite[] = [
  ...CONTEXT,
  ...Object.values(example.today as Record<string, { notListed?: { lastListed: Cite } }>).flatMap((t) => (t.notListed ? [t.notListed.lastListed] : [])),
  ...Object.values(example.related as Record<string, { evidence: Cite[] }>).flatMap((r) => r.evidence),
];

describe.skipIf(!cached)("sponsor context against the source cache", () => {
  it("finds every excerpt verbatim on its cited page", () => {
    for (const c of cites) {
      const loc = locate(c.sourceId, c.excerpt);
      expect(loc.status, `${c.sourceId}: ${c.excerpt}`).toBe("found");
      if (loc.status === "found") expect(loc.pages, `${c.sourceId}: ${c.excerpt}`).toContain(c.page ?? null);
      expect(IDX.source(c.sourceId) ?? CONTEXT_SOURCES[c.sourceId], c.sourceId).toBeTruthy();
    }
  });

  it("finds no later listing of a project described as no longer listed", () => {
    for (const t of Object.values(example.today as Record<string, { notListed?: { planId: string; lastListed: Cite; absentFrom: string[] } }>)) {
      if (!t.notListed) continue;
      const id = new RegExp(`project id 0?${normalize(t.notListed.planId)}\\b`);
      expect(id.test(pagesOf(t.notListed.lastListed.sourceId)!.get(t.notListed.lastListed.page!)!)).toBe(true);
      for (const s of t.notListed.absentFrom) for (const [page, text] of pagesOf(s)!) expect(id.test(text), `${t.notListed.planId} in ${s} p.${page}`).toBe(false);
    }
  });

  it("matches cached hashes and URLs, the recorded searches, and the packet files", () => {
    for (const [id, s] of Object.entries(CONTEXT_SOURCES)) expect([s.sha256, s.url], id).toEqual([readMeta(id)!.sha256, readMeta(id)!.url]);
    for (const s of SEARCHES) {
      if (s.term) expect([...pagesOf(s.sourceId)!.values()].filter((t) => t.includes(normalize(s.term!))).length, s.term).toBe(s.hits);
      if (s.link) expect(fs.readFileSync(path.join(CACHE, "raw", `${s.sourceId}.html`), "utf8")).toContain(`href="${s.link}"`);
    }
    for (const f of PACKET) expect(IDX.source(f.sourceId)?.sha256, f.file).toBe(f.sha256);
  });
});
