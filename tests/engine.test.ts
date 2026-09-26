import { describe, expect, it } from "vitest";
import type { ConstructionWindow, DateBound, Place, Project, Relation, Snapshot } from "@/lib/domain/types";
import { evaluatePair, runMatching } from "@/lib/matching/engine";
import { evaluateGeo } from "@/lib/matching/geo";
import { evaluateTime } from "@/lib/matching/time";

/* ------------------------------- fixture builders ------------------------------- */

const yr = (y: number): DateBound => ({ earliest: `${y}-01-01`, latest: `${y}-12-31`, precision: "year" });

let wid = 0;
function win(startYear: number, endYear: number, over: Partial<ConstructionWindow> = {}): ConstructionWindow {
  return {
    id: `w${++wid}`,
    claimSourceId: "src",
    phase: "general-construction",
    start: yr(startYear),
    end: yr(endYear),
    continuous: true,
    evidenceIds: ["ev1"],
    ...over,
  };
}

function place(label: string, lat: number, lon: number, over: Partial<Place> = {}): Place {
  return {
    id: label.toLowerCase().replace(/\W+/g, "-"),
    label,
    kind: "substation",
    precision: "named-facility",
    lat,
    lon,
    uncertaintyMeters: 1000,
    coordinateSource: "fixture",
    evidenceIds: ["ev1"],
    ...over,
  };
}

function project(id: string, owner: string, over: Partial<Project> = {}): Project {
  return {
    id,
    title: id,
    shortTitle: id,
    titleEvidenceIds: [],
    summary: "",
    owners: [{ utilityId: owner, evidenceIds: [] }],
    status: { value: "approved", evidenceIds: [] },
    states: ["WI"],
    counties: [],
    facts: [],
    places: [],
    constructionWindows: [],
    completionClaims: [],
    knownCoordination: [],
    caveats: [],
    sourceIds: [],
    region: "upper-midwest",
    ...over,
  };
}

function snapshot(projects: Project[], relations: Relation[] = []): Snapshot {
  return {
    version: "test",
    snapshotDate: "2026-09-26",
    generatedAt: "2026-09-26T00:00:00Z",
    regions: [],
    utilities: [],
    sources: [{ id: "src", publisher: "Fixture PSC", title: "", url: "", sourceType: "regulator", retrievedAt: "", sha256: "", mimeType: "" }],
    evidence: {
      ev1: { id: "ev1", sourceId: "src", exactExcerpt: "x", supports: "x", extractionMethod: "manual", reviewedByHuman: true, verifiedInSource: true },
    },
    projects,
    relations,
    extractionRuns: [],
    assumptions: [],
    unresolved: [],
  };
}

// Real-world-ish anchors: Blair, WI and Alma, WI (~30 mi apart); Amarillo, TX far away.
const BLAIR = [44.2944, -91.2332] as const;
const ARCADIA = [44.2525, -91.5010] as const;
const AMARILLO = [35.222, -101.8313] as const;

/* ------------------------------------ tests ------------------------------------ */

describe("temporal signal", () => {
  it("confirms overlapping year-precision construction windows", () => {
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027)] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2027)] });
    const t = evaluateTime(a, b);
    expect(t.level).toBe("confirmed");
    expect(t.detail.possibleOverlap).toEqual({ start: "2026-01-01", end: "2027-12-31" });
    expect(t.reason).toContain("2026–2027");
  });

  it("returns possible when only the fuzzy year bounds overlap", () => {
    // A: 2025–2026, B: 2026–2028 → both may be active in 2026 but not guaranteed simultaneously
    const a = project("a", "u1", { constructionWindows: [win(2025, 2026)] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2028)] });
    expect(evaluateTime(a, b).level).toBe("possible");
  });

  it("returns no-match for complete, non-overlapping windows", () => {
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027)] });
    const b = project("b", "u2", { constructionWindows: [win(2029, 2030)] });
    expect(evaluateTime(a, b).level).toBe("no-match");
  });

  it("returns unknown — not no-match — when a schedule is missing", () => {
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027)] });
    const b = project("b", "u2");
    const t = evaluateTime(a, b);
    expect(t.level).toBe("unknown");
    expect(t.reason).toMatch(/not ruled out/);
  });

  it("never derives a construction match from completion dates", () => {
    const a = project("a", "u1", {
      completionClaims: [{ id: "c1", claimSourceId: "src", label: "in-service", date: yr(2028), evidenceIds: [] }],
    });
    const b = project("b", "u2", {
      completionClaims: [{ id: "c2", claimSourceId: "src", label: "in-service", date: yr(2028), evidenceIds: [] }],
    });
    expect(evaluateTime(a, b).level).toBe("unknown");
  });

  it("downgrades to possible when a source does not describe a continuous phase", () => {
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027, { continuous: false })] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2027)] });
    const t = evaluateTime(a, b);
    expect(t.level).toBe("possible");
    expect(t.detail.continuityCaveat).toBe(true);
  });

  it("confirms only if every current claim combination overlaps", () => {
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027), win(2028, 2029)] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2027)] });
    const t = evaluateTime(a, b);
    expect(t.level).toBe("possible");
    expect(t.detail.combinations).toBe(2);
    expect(t.detail.confirmedCombinations).toBe(1);
  });

  it("ignores superseded and preconstruction claims", () => {
    const a = project("a", "u1", {
      constructionWindows: [win(2030, 2031, { supersededBy: "w-new" }), win(2026, 2027, { phase: "preconstruction" }), win(2026, 2027)],
    });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2027)] });
    const t = evaluateTime(a, b);
    expect(t.level).toBe("confirmed");
    expect(t.detail.combinations).toBe(1);
  });
});

describe("spatial signal", () => {
  it("confirms a source-stated shared site without inventing a distance", () => {
    const a = project("a", "u1", { places: [place("Alma", 44.33, -91.92)] });
    const b = project("b", "u2", { places: [place("Tremval", BLAIR[0], BLAIR[1])] });
    const rel: Relation = { id: "r1", projectA: "a", projectB: "b", kind: "shared-site", siteLabel: "Tremval Substation", description: "", evidenceIds: ["ev1"] };
    const g = evaluateGeo(a, b, [rel]);
    expect(g.level).toBe("confirmed");
    expect(g.detail.method).toBe("shared-site");
    expect(g.reason).toContain("Tremval Substation");
  });

  it("measures named facilities against the adjustable threshold with uncertainty", () => {
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1])] });
    const b = project("b", "u2", { places: [place("Arcadia", ARCADIA[0], ARCADIA[1])] }); // ~13.5 mi
    expect(evaluateGeo(a, b, [], 25).level).toBe("confirmed");
    expect(evaluateGeo(a, b, [], 5).level).toBe("no-match");
    const g = evaluateGeo(a, b, [], 13.4);
    expect(g.level).toBe("possible"); // only inside the radius at the near edge of uncertainty
  });

  it("treats locality halos with their uncertainty", () => {
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1], { precision: "locality", uncertaintyMeters: 8000 })] });
    const b = project("b", "u2", { places: [place("Arcadia", ARCADIA[0], ARCADIA[1], { precision: "locality", uncertaintyMeters: 8000 })] });
    const g = evaluateGeo(a, b, [], 20);
    expect(g.level).toBe("possible"); // 13.5 ± 10 mi straddles 20
  });

  it("county-only geography is at most possible and never reports mileage", () => {
    const a = project("a", "u1", { places: [place("Trempealeau County", 44.3, -91.35, { precision: "county", kind: "county", uncertaintyMeters: 30000 })] });
    const b = project("b", "u2", { places: [place("Trempealeau County", 44.3, -91.35, { precision: "county", kind: "county", uncertaintyMeters: 30000 })] });
    const g = evaluateGeo(a, b, []);
    expect(g.level).toBe("possible");
    expect(g.detail.method).toBe("coarse");
    expect(g.detail.center).toBeUndefined();
  });

  it("does not measure from a digitized schematic route", () => {
    const a = project("a", "u1", {
      route: {
        precision: "official-map-digitized",
        description: "",
        coordinates: [
          [-91.9, 44.3],
          [-91.23, 44.29],
        ],
        waypointNames: [],
        evidenceIds: [],
        caveat: "schematic",
      },
    });
    const b = project("b", "u2", { places: [place("Blair", BLAIR[0], BLAIR[1])] });
    expect(evaluateGeo(a, b, []).level).toBe("unknown");
  });
});

describe("pair engine", () => {
  const near = (id: string, owner: string, over: Partial<Project> = {}) =>
    project(id, owner, { places: [place(`${id} site`, BLAIR[0], BLAIR[1])], ...over });

  it("treats geography as the primary signal and ignores far pairs even with the same build window", () => {
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1])], constructionWindows: [win(2026, 2027)] });
    const nearLater = project("b", "u2", { places: [place("Arcadia", ARCADIA[0], ARCADIA[1])], constructionWindows: [win(2030, 2031)] });
    const farSameTime = project("c", "u3", { places: [place("Amarillo", AMARILLO[0], AMARILLO[1])], constructionWindows: [win(2026, 2027)] });
    const snap = snapshot([a, nearLater, farSameTime]);

    const geoOnly = evaluatePair(a, nearLater, snap)!;
    expect(geoOnly.badge).toBe("GEO");
    expect(geoOnly.time).toBe("no-match");

    expect(evaluatePair(a, farSameTime, snap)).toBeNull();
    const run = runMatching(snap, { now: "t" });
    expect(run.excludedPairs.find((p) => p.projectBId === "c" && p.projectAId === "a")?.reason).toBe("beyond-radius");
  });

  it("does not flatten confirmed TIME + possible GEO into BOTH", () => {
    const a = project("a", "u1", {
      places: [place("Blair", BLAIR[0], BLAIR[1], { precision: "locality", uncertaintyMeters: 8000 })],
      constructionWindows: [win(2026, 2027)],
    });
    const b = project("b", "u2", {
      places: [place("Arcadia", ARCADIA[0], ARCADIA[1], { precision: "locality", uncertaintyMeters: 8000 })],
      constructionWindows: [win(2026, 2027)],
    });
    const m = evaluatePair(a, b, snapshot([a, b]), 20)!;
    expect(m.geo).toBe("possible");
    expect(m.time).toBe("confirmed");
    expect(m.badge).toBe("POSSIBLE");
    expect(m.reviewStatus).toBe("possible");
  });

  it("only pairs distinct utilities; shared-owner pairs are internal context", () => {
    const a = near("a", "xcel", { constructionWindows: [win(2026, 2027)] });
    const b = near("b", "xcel", { constructionWindows: [win(2026, 2027)] });
    const c = near("c", "dairyland", { constructionWindows: [win(2026, 2027)] });
    const run = runMatching(snapshot([a, b, c]), { now: "t" });
    expect(run.matches.map((m) => m.id).sort()).toEqual(["a__c", "b__c"]);
    expect(run.excludedPairs.find((p) => p.reason === "shared-owner")).toMatchObject({ projectAId: "a", projectBId: "b" });
  });

  it("co-owned packages sharing any owner are not cross-utility leads", () => {
    const a = near("a", "atc", { owners: [{ utilityId: "atc", evidenceIds: [] }, { utilityId: "xcel", evidenceIds: [] }] });
    const b = near("b", "xcel");
    expect(runMatching(snapshot([a, b]), { now: "t" }).matches).toHaveLength(0);
  });

  it("pairs projects only within the same region", () => {
    const a = near("a", "u1");
    const b = near("b", "u2", { region: "southeast" });
    const run = runMatching(snapshot([a, b]), { now: "t" });
    expect(run.matches).toHaveLength(0);
    expect(run.excludedPairs[0].reason).toBe("different-region");
  });

  it("excludes completed, cancelled and duplicate records from the candidate queue", () => {
    const live = near("live", "u1", { constructionWindows: [win(2026, 2027)] });
    const done = near("done", "u2", { status: { value: "complete", evidenceIds: [] } });
    const gone = near("gone", "u3", { status: { value: "cancelled", evidenceIds: [] } });
    const dup = near("dup", "u4", { duplicateOf: "live" });
    const run = runMatching(snapshot([live, done, gone, dup]), { now: "t" });
    expect(run.matches).toHaveLength(0);
    expect(run.excludedProjects.map((e) => e.reason).sort()).toEqual(["cancelled", "complete", "duplicate"]);
  });

  it("keeps a known joint pair detectable but files it under known coordination", () => {
    const tx = project("tx", "sps", { places: [place("Texas end", 35.5, -100.2)], constructionWindows: [win(2026, 2027)] });
    const ok = project("ok", "transource", { places: [place("Oklahoma end", 35.5, -100.0)], constructionWindows: [win(2026, 2027)] });
    const rel: Relation = { id: "r", projectA: "ok", projectB: "tx", kind: "same-initiative", description: "Joint initiative", evidenceIds: ["ev1"] };
    const m = evaluatePair(ok, tx, snapshot([tx, ok], [rel]))!;
    expect(m.badge).toBe("BOTH");
    expect(m.reviewStatus).toBe("known-coordination");
    expect(m.coordination[0].scope).toBe("joint-initiative");
  });

  it("interconnection coordination does not count as resource sharing", () => {
    const a = project("a", "dairyland", {
      places: [place("Tremval", BLAIR[0], BLAIR[1])],
      constructionWindows: [win(2026, 2027)],
      knownCoordination: [{ partnerProjectId: "b", status: "reported-coordination", scope: "interconnection-design", description: "interface", evidenceIds: ["ev1"] }],
    });
    const b = project("b", "xcel", { places: [place("Tremval", BLAIR[0], BLAIR[1])], constructionWindows: [win(2026, 2027)] });
    const m = evaluatePair(a, b, snapshot([a, b]))!;
    expect(m.reviewStatus).toBe("known-coordination");
    expect(m.geoDetail.method).toBe("shared-endpoint");
    expect(m.coordination.every((c) => c.scope !== "resource-sharing")).toBe(true);
  });

  it("completion-date conflicts are surfaced without corrupting the construction match", () => {
    const a = near("a", "u1", { constructionWindows: [win(2026, 2027)] });
    const b = near("b", "u2", {
      constructionWindows: [win(2026, 2027)],
      completionClaims: [
        { id: "utility", claimSourceId: "src", label: "completion", date: { earliest: "2027-01-01", latest: "2028-12-31", precision: "year" }, evidenceIds: [] },
        { id: "psc", claimSourceId: "src", label: "in-service", date: { earliest: "2029-07-01", latest: "2029-09-30", precision: "quarter" }, evidenceIds: [] },
      ],
    });
    const m = evaluatePair(a, b, snapshot([a, b]))!;
    expect(m.time).toBe("confirmed");
    expect(m.conflicts).toHaveLength(1);
    expect(m.conflicts[0]).toMatchObject({ field: "completion", affectsMatch: false });
    expect(m.conflicts[0].description).toContain("Q3 2029");
  });

  it("drops pairs with no signal at all", () => {
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1])], constructionWindows: [win(2026, 2027)] });
    const b = project("b", "u2", { places: [place("Amarillo", AMARILLO[0], AMARILLO[1])], constructionWindows: [win(2030, 2031)] });
    const run = runMatching(snapshot([a, b]), { now: "t" });
    expect(run.matches).toHaveLength(0);
    expect(run.excludedPairs[0].reason).toBe("no-signal");
  });
});

/* ------------- sponsor worked example (Projects_Overlaps.xlsx), reproduced exactly ------------- */

describe("sponsor overlap table", () => {
  const inService = (id: string, iso: string) => [{ id, claimSourceId: "src", label: "in-service", date: { earliest: iso, latest: iso, precision: "day" as const }, evidenceIds: [] }];
  const endpoint = (label: string, lat: number, lon: number) => place(label, lat, lon, { role: "endpoint", uncertaintyMeters: 0 });

  // DESC_2 Hooks – Thurmond (Hooks not located) · GPC_1 Evans Primary – Thurmond Dam #5
  const desc2 = project("desc-2", "desc", { places: [endpoint("Thurmond Sub", 33.660127, -82.195931)], completionClaims: inService("d2", "2024-12-31") });
  const gpc1 = project("gpc-1", "gpc", {
    places: [endpoint("Evans Primary", 33.543994, -82.168648), endpoint("Thurmond Dam", 33.660127, -82.195931)],
    completionClaims: inService("g1", "2033-06-01"),
  });
  // DESC_3 Jasper – Okatie 230 kV #2 · GPC_2 McIntosh – Purrysburg reactors (Purrysburg not located)
  const desc3 = project("desc-3", "desc", {
    places: [endpoint("Jasper Sub", 32.35912, -81.1246), endpoint("Okatie Sub", 32.333758, -81.032495)],
    completionClaims: inService("d3", "2025-12-31"),
  });
  const gpc2 = project("gpc-2", "gpc", { places: [endpoint("McIntosh", 32.352116, -81.175112)], completionClaims: inService("g2", "2026-06-01") });
  const snap = snapshot([desc2, gpc1, desc3, gpc2]);

  it("OVL_1: 4.09 mi and 3,074 days", () => {
    const m = evaluatePair(desc2, gpc1, snap)!;
    expect(m.geoDetail.center!.miles).toBeCloseTo(4.09, 1);
    expect(m.timeDetail.inService!.gapDays).toBe(3074);
    expect(m.geoDetail.method).toBe("shared-endpoint"); // both end at Thurmond
  });

  it("OVL_2: 5.65 mi and 152 days", () => {
    const m = evaluatePair(desc3, gpc2, snap)!;
    expect(m.geoDetail.center!.miles).toBeCloseTo(5.65, 1);
    expect(m.timeDetail.inService!.gapDays).toBe(152);
    expect(m.geo).toBe("confirmed");
  });

  it("never turns in-service dates into a construction-window overlap", () => {
    const m = evaluatePair(desc3, gpc2, snap)!;
    expect(m.time).toBe("unknown");
    expect(m.timeReason).toMatch(/152 days apart/);
  });

  it("ranks the closer, better-timed pair above the one with a 3,074-day gap", () => {
    const run = runMatching(snap, { now: "t" });
    const ids = run.matches.map((m) => m.id);
    expect(ids).toContain("desc-2__gpc-1");
    expect(ids.indexOf("desc-3__gpc-2")).toBeLessThan(ids.indexOf("desc-2__gpc-1"));
  });
});
