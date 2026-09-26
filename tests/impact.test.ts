import { describe, expect, it } from "vitest";
import { IDX, SNAPSHOT } from "@/lib/data";
import { costOf, costRange, formatUsd, formatUsdRange, impactChannels, impactPortfolio, parseUsd, workKind } from "@/lib/impact";
import { runMatching } from "@/lib/matching/engine";

const run = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 25 });
const pair = (x: string, y: string) => run.matches.find((m) => m.id === [x, y].sort().join("__"))!;
const proj = (id: string) => IDX.project(id);
const channel = (x: string, y: string, key: string) => impactChannels(pair(x, y)).find((c) => c.key === key);

describe("cost parsing", () => {
  it("reads dollar amounts in every published form, and nothing from a redaction", () => {
    expect(parseUsd("$483.3 million")).toEqual({ low: 483_300_000, high: 483_300_000, atLeast: false });
    expect(parseUsd("$540 million to $580 million, depending on route")).toEqual({ low: 540e6, high: 580e6, atLeast: false });
    expect(parseUsd("$209.5 million - $238.2 million")).toEqual({ low: 209.5e6, high: 238.2e6, atLeast: false });
    expect(parseUsd("188796752")?.low).toBe(188_796_752);
    expect(parseUsd("$5,376,418")?.high).toBe(5_376_418);
    expect(parseUsd(">1200000000")).toEqual({ low: 1.2e9, high: 1.2e9, atLeast: true });
    expect(parseUsd("more than $1 billion (estimate)")).toEqual({ low: 1e9, high: 1e9, atLeast: true });
    expect(parseUsd("Redacted in the public disclosure")).toBeNull();
  });

  it("uses each project's current published cost, skipping superseded and pre-decision estimates", () => {
    expect(costOf(proj("xcel-wwtc"))).toBe(483_300_000);
    expect(costOf(proj("dpc-alma-blair"))).toBe(188_796_752);
    expect(costOf(proj("badger-coulee-345kv"))).toBe(581_433_000);
    expect(costRange(proj("abo-alexandria-big-oaks"))).toMatchObject({ low: 209.5e6, high: 238.2e6 });
    expect(costOf(proj("gpc-20065"))).toBeNull();
    expect(costRange(proj("desc-6888"))!.evidenceIds.map((id) => IDX.evidence(id)!.exactExcerpt)).toContain("Total $5,376,418");
  });

  it("formats ranges without rounding the high end away", () => {
    expect([formatUsd(12_400_000), formatUsd(129_210_481), formatUsd(1.2e9), formatUsdRange([9e6, 12.4e6]), formatUsdRange([5e6, 5e6], true)]).toEqual([
      "$12.4M",
      "$129M",
      "$1.2B",
      "$9.0M–$12.4M",
      "≥ $5.0M",
    ]);
  });
});

describe("work kind", () => {
  it("classifies the flagged projects by the field work they describe", () => {
    const want: Record<string, string> = {
      "desc-6888": "substation-new",
      "desc-7956b": "substation-new",
      "desc-6854-c": "substation-new",
      "desc-0139-m-n": "substation-upgrade",
      "gpc-20989": "substation-upgrade",
      "gpc-20796": "substation-upgrade",
      "atc-columbia-beci-work": "substation-upgrade",
      "atc-sugar-creek-beci-work": "substation-upgrade",
      "gpc-20065": "line-rebuild",
      "desc-6809-t": "line-rebuild",
      "gpc-21023": "line-rebuild",
      "gpc-21116": "line-new",
      "dpc-alma-blair": "line-new",
      "xcel-wwtc": "line-new",
    };
    expect(Object.fromEntries(Object.keys(want).map((id) => [id, workKind(proj(id))]))).toEqual(want);
  });
});

describe("impact channels", () => {
  it("top Savannah River lead: no corridor, a conditional staging ceiling, unpriced outages, capital listed per project", () => {
    const ch = impactChannels(pair("desc-6888", "gpc-20065"));
    expect(ch.map((c) => c.key)).toEqual(["corridor", "staging", "outage", "capital-in-scope"]);
    expect(ch[0].acres).toEqual([0, 0]);
    // the smaller of a new-site substation mobilization ($262,660) and a 115 kV line one ($100,000), 2018 $
    expect(ch[1]).toMatchObject({ basis: "conditional", upTo: true, usd: [0, 100_000] });
    expect(ch[1].assumptions.map((a) => a.key)).toEqual(["mobilizationSubstation.newSite", "mobilizationCostPerProject.115", "avoidedMobilizations"]);
    expect([ch[2].basis, ch[2].usd]).toEqual(["context", undefined]);
    expect(ch[2].note).toMatch(/^Both lines are named for McIntosh; no source here says they share a station/);
    const cap = ch[3];
    expect([cap.basis, cap.usd]).toEqual(["context", undefined]);
    expect(cap.label).toMatch(/not a saving/);
    expect(cap.parts!.map((p) => p.usd)).toEqual([[5_376_418, 5_376_418], [6.7 * 1_213_333, 6.7 * 1_700_000]]);
    expect(cap.parts![1]).toMatchObject({ proxy: true });
    expect(cap.parts![1].text).toMatch(/^Georgia Power: cost redacted; proxy 6\.7 mi × \$1\.2M–\$1\.7M\/mi ≈ \$8\.1M–\$11\.4M/);
    expect(ch.some((c) => c.key === "shared-terminal")).toBe(false);
  });

  it("Tremval North: one stated shared 345 kV terminal, priced from MISO without add-ons", () => {
    const c = channel("dpc-alma-blair", "xcel-wwtc", "shared-terminal")!;
    expect(c).toMatchObject({ basis: "stated", usd: [9_000_000, 12_400_000], acres: [1.5, 2.2] });
    expect(c.label).toBe("One 345 kV terminal instead of two (Tremval North 345 kV Substation)");
    expect(c.note).toMatch(/is our assumption/);
    expect(c.assumptions.map((a) => a.key)).toEqual([
      "substationNew4Ring.345",
      "substationAdd1Ring.345",
      "substationAdd2Ring.345",
      "substationLandAcres.new4Ring.345",
      "substationLandAcres.add1Ring.345",
      "substationLandAcres.add2Ring.345",
    ]);
    // the "new" station is itself quoted from the sources
    for (const id of c.evidenceIds) expect(IDX.evidence(id)!.exactExcerpt).toMatch(/\bnew\b/);
    const ch = impactChannels(pair("dpc-alma-blair", "xcel-wwtc")).map((x) => x.key);
    // already coordinated: no "capital a joint review would cover"; two new lines take no existing facility out
    expect(ch).not.toContain("capital-in-scope");
    expect(ch).not.toContain("outage");
  });

  it("no shared terminal without a stated, new, shared station", () => {
    for (const [x, y] of [
      ["dpc-alma-blair", "grid-forward-nspw"],
      ["sps-potter-beckham-tx", "transource-potter-beckham-ok"],
      ["atc-wwtc-jump-river", "xcel-wwtc"],
      ["grid-forward-atc", "transource-beci"],
    ])
      expect(channel(x, y, "shared-terminal")).toBeUndefined();
  });

  it("two 230/115 kV banks: kind-aware staging and a spare priced only at the published rating", () => {
    expect(channel("desc-0139-m-n", "gpc-20989", "staging")!.usd).toEqual([0, 157_590]);
    const s = channel("desc-0139-m-n", "gpc-20989", "spare-transformer")!;
    expect(s).toMatchObject({ basis: "conditional", upTo: true, usd: [0, 400 * 5_896] });
    expect(s.note).toMatch(/only published rating \(Georgia Power's 400 MVA\); DESC does not publish its rating/);
  });

  it("a 46 kV line uses MISO's lowest published class and says so", () => {
    expect(channel("desc-6810-o", "gpc-21116", "staging")!.formula).toMatch(/\$100,000 \(MISO 69 kV line, the lowest class MISO publishes\)/);
  });

  it("two published costs are listed side by side, never summed", () => {
    const c = channel("dpc-alma-blair", "grid-forward-nspw", "capital-in-scope")!;
    expect(c.usd).toBeUndefined();
    expect(c.parts!.map((p) => p.usd?.[0])).toEqual([188_796_752, 239_888_000]);
    expect(c.parts!.every((p) => !p.proxy)).toBe(true);
  });

  it("every priced channel cites excerpts that were re-found verbatim, and states its basis", () => {
    for (const m of run.matches)
      for (const c of impactChannels(m)) {
        expect(["stated", "conditional", "context"]).toContain(c.basis);
        if (c.usd && c.key !== "corridor") {
          expect(c.dollars).toBeTruthy();
          expect(c.assumptions.length + c.evidenceIds.length).toBeGreaterThan(0);
        }
        for (const id of [...c.assumptions.flatMap((a) => a.evidenceIds), ...c.evidenceIds, ...(c.parts ?? []).flatMap((p) => p.evidenceIds)])
          expect(IDX.evidence(id)?.verifiedInSource, `${m.id} ${c.key} ${id}`).toBe(true);
        if (c.key === "capital-in-scope") expect(c.usd).toBeUndefined();
      }
  });
});

describe("region portfolio", () => {
  const pf = impactPortfolio(run.matches, "southeast");
  const eligible = run.matches.filter((m) => proj(m.projectAId).region === "southeast" && m.reviewStatus === "needs-review" && m.time !== "no-match");

  it("counts each project once, in its highest-ranked eligible pair", () => {
    expect(pf.eligiblePairs).toBe(eligible.length);
    const ids = pf.pairs.flatMap((p) => p.id.split("__"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(pf.pairs[0].id).toBe(eligible.sort((x, y) => y.priority - x.priority || x.id.localeCompare(y.id))[0].id);
    expect(pf.pairs[0].id).toBe("desc-06367-d-g__gpc-20065");
    // greedy: every eligible pair left out shares a project with a higher-ranked counted pair
    for (const m of eligible.filter((x) => !pf.pairs.some((p) => p.id === x.id))) expect(ids.includes(m.projectAId) || ids.includes(m.projectBId)).toBe(true);
    expect(pf.stagingUsd).toBe(pf.pairs.reduce((t, p) => t + p.stagingUsd, 0));
    expect(pf.corridorAcres).toBe(0);
  });

  it("capital: every distinct project once, published totals per owner and document, proxies apart", () => {
    const distinct = new Set(eligible.flatMap((m) => [m.projectAId, m.projectBId]));
    expect(pf.capital.reduce((t, l) => t + l.projects, 0)).toBe(distinct.size);
    const desc = pf.capital.find((l) => l.owner === "DESC" && l.kind === "published")!;
    expect(desc.sourceId).toBe("desc-scrtp-2026-2030");
    const descIds = [...distinct].filter((id) => proj(id).owners[0].utilityId === "desc");
    expect(desc.usd![0]).toBe(descIds.reduce((t, id) => t + costOf(proj(id))!, 0));
    expect(pf.capital.find((l) => l.owner === "Georgia Power" && l.kind === "published")).toBeUndefined();
    expect(pf.capital.find((l) => l.owner === "Georgia Power" && l.kind === "proxy")!.miles).toBeGreaterThan(0);
  });
});
