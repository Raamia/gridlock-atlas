import fs from "node:fs";
import path from "node:path";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { describe, expect, it } from "vitest";
import { SNAPSHOT } from "@/lib/data";
import { runMatching } from "@/lib/matching/engine";
import { centerOf } from "@/lib/matching/geo";
import { ABLATIONS, evaluate, markdown, R0, RADII } from "@/scripts/evaluate";

const ROOT = path.resolve(import.meta.dirname, "..");
const counties = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "eval", "counties.json"), "utf8"));
const before = JSON.stringify(SNAPSHOT);
const e = evaluate(SNAPSHOT, counties.counties);
const run = runMatching(SNAPSHOT, { now: "t", listExclusions: false });

describe("evaluation invariants", () => {
  it("reproduces the sponsor's starter tables exactly, with no extra pairs at any radius up to 50 mi", () => {
    expect(e.sponsor.overlapTable).toMatchObject({ matched: 6, of: 6, extra: [], allOk: true });
    expect(e.sponsor.projectSheet).toEqual({ matched: 10, of: 10 });
    for (const r of e.negativeControls.starterFile.byRadius) {
      expect(r.extra).toBe(0);
      if (r.R >= 15) expect(r.rowsFound).toBe(6);
    }
  });

  it("scores exactly the engine's candidate pairs and never mutates the snapshot (ablations work on copies)", () => {
    expect(e.queue.universePairs).toBe(run.pairsEvaluated);
    expect(e.queue.flagged.k).toBe(run.matches.length);
    expect(JSON.stringify(SNAPSHOT)).toBe(before);
    expect(e.ablations.map((a) => a.id)).toEqual(ABLATIONS.map((a) => a.id));
    expect(e.ablations[0]).toMatchObject({ flagged: run.matches.length, lost: 0, gained: 0 });
  });

  it("flags every pair whose centers are under the radius (ours ⊇ center distance alone), at every radius", () => {
    expect(e.b2notB4).toEqual([]);
    expect(e.sweep.map((s) => s.R)).toEqual(RADII);
    for (const s of e.sweep) expect(s.B2notInB4).toBe(0);
    // independent of the evaluation code: recompute the sponsor rule from project centers
    const flagged = new Set(run.matches.map((m) => m.id));
    const archived = new Set(run.excludedProjects.map((x) => x.projectId));
    const ps = SNAPSHOT.projects.filter((p) => !archived.has(p.id)).sort((x, y) => x.id.localeCompare(y.id));
    let near = 0;
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const [a, b] = [ps[i], ps[j]];
        if (a.region !== b.region || a.owners.some((o) => b.owners.some((q) => q.utilityId === o.utilityId))) continue;
        const [ca, cb] = [centerOf(a), centerOf(b)];
        if (!ca || !cb || distance(point(ca.lonlat), point(cb.lonlat), { units: "miles" }) >= R0) continue;
        near++;
        expect(flagged.has(`${a.id}__${b.id}`)).toBe(true);
      }
    expect(near).toBe(e.baselines.find((x) => x.id === "B2")!.flagged);
  });

  it("the literal OR rule contains the engine's flags, and the engine is far more selective", () => {
    const or = e.baselines.find((x) => x.id === "B3")!;
    expect(e.overlap.B4.B3).toBe(e.queue.flagged.k);
    expect(or.flagged).toBeGreaterThan(10 * e.queue.flagged.k);
  });

  it("negative controls: nothing archived is flagged, past-due plans never confirm TIME, far pairs need a shared facility", () => {
    const nc = e.negativeControls;
    expect(nc.archived.B4).toBe(0);
    expect(run.matches.some((m) => run.excludedProjects.some((x) => x.projectId === m.projectAId || x.projectId === m.projectBId))).toBe(false);
    expect(nc.pastDue).toMatchObject({ B4timeConfirmed: 0, B4badgeBoth: 0, B4missingFlag: 0 });
    expect(nc.far.B4notSharedFacility).toBe(0);
    expect(nc.crossRegion.B4).toBe(0);
  });

  it("documented-interface recall is reported with its circularity: without the shared-site rule it matches the center rule", () => {
    const r = e.interfaces.recall;
    expect(r.B4.all.of).toBe(e.interfaces.inUniverse);
    expect(r.B2.all.hit).toBeLessThanOrEqual(r.B4.all.hit);
    // every interface the full engine keeps beyond the center rule comes from the shared-facility rule it reads from the same filings
    const a3b = e.ablations.find((a) => a.id === "A3b")!;
    expect(a3b.recall.all.hit).toBeLessThanOrEqual(r.B4.all.hit);
    expect(e.interfaces.detail.filter((x) => x.ours && !x.flaggedBy.includes("B2")).every((x) => ["shared-site", "shared-endpoint"].includes(x.ours!.method))).toBe(true);
    expect(e.interfaces.caveat).toMatch(/circular/i);
    expect(markdown(e)).toContain("no precision is claimed");
  });

  const committed = path.join(ROOT, "data", "eval", "eval.json");
  const stored = fs.existsSync(committed) ? JSON.parse(fs.readFileSync(committed, "utf8")) : null;
  it.skipIf(!stored || stored.meta.snapshot !== SNAPSHOT.version)("the committed data/eval/eval.json is a fresh run on its snapshot (npm run eval)", () => {
    expect(stored).toEqual(JSON.parse(JSON.stringify(e)));
  });
});

describe("extraction evaluation output", () => {
  const file = path.join(ROOT, "data", "eval", "extraction-eval.json");
  const res = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const runsDir = path.join(ROOT, "data", "eval", "extraction", "runs");
  const runs = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).map((f) => JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"))) : [];

  it.skipIf(!res)("uses one frozen prompt and scores every stored run", () => {
    expect(Object.keys(res.promptVersions)).toEqual([res.meta.promptVersion]);
    expect(runs.every((r) => r.promptVersion === res.meta.promptVersion)).toBe(true);
    expect(res.pagesScored + res.errors.length).toBe(runs.length);
    expect(res.pagesScored).toBeLessThanOrEqual(res.meta.pagesInScope);
  });

  it.skipIf(!res)("keeps every rate consistent with its counts", () => {
    const rates = [res.overall.exact, res.overall.lenient, res.overall.recallWhenStated, res.verbatimQuote.all, ...Object.values(res.fields).flatMap((f) => {
      const x = f as Record<string, { k: number; n: number; ci95: number[] | null }>;
      return [x.exact, x.lenient, x.recallWhenStated, x.abstention];
    })] as { k: number; n: number; ci95: number[] | null }[];
    for (const r of rates) {
      expect(r.k).toBeLessThanOrEqual(r.n);
      if (r.n) expect(r.ci95![0]).toBeLessThanOrEqual(r.k / r.n);
      if (r.n) expect(r.ci95![1]).toBeGreaterThanOrEqual(r.k / r.n);
    }
    const located = runs.flatMap((r) => r.fields ?? []).filter((f: { located: boolean }) => f.located).length;
    expect(res.verbatimQuote.all.k).toBe(located);
  });

  it.skipIf(!res)("every disagreement is adjudicated against its page, and stored quotes never reproduce a CEII label", () => {
    expect(res.adjudication.excerptsNotFound).toEqual([]);
    expect(res.adjudication.stale).toEqual([]);
    expect(res.adjudication.counts["not adjudicated"] ?? 0).toBe(0);
    const quotes = runs.flatMap((r) => (r.fields ?? []).map((f: { excerpt: string }) => f.excerpt));
    expect(quotes.filter((q: string) => /\bCEII\b|critical energy infrastructure/i.test(q))).toEqual([]);
  });

  it("keeps evaluation runs apart from the showcase runs the app reads", () => {
    const shown = fs.readdirSync(path.join(ROOT, "data", "extractions")).filter((f) => f.endsWith(".json"));
    expect(shown.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(SNAPSHOT.extractionRuns.map((r) => r.id).sort());
  });
});
