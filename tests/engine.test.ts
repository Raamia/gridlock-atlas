import { describe, expect, it } from "vitest";
import type { ConstructionWindow, DateBound, Place, Project, Relation, Snapshot } from "@/lib/domain/types";
import { SNAPSHOT } from "@/lib/data";
import { impactDefaults } from "@/lib/impact";
import { evaluatePair, runMatching } from "@/lib/matching/engine";
import { evaluateGeo } from "@/lib/matching/geo";
import { currentInService, evaluateTime } from "@/lib/matching/time";

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

  it("confirms only if every source's claim overlaps", () => {
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027), win(2028, 2029, { claimSourceId: "psc" })] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2027)] });
    const t = evaluateTime(a, b);
    expect(t.level).toBe("possible");
    expect(t.detail.combinations).toBe(2);
    expect(t.detail.confirmedCombinations).toBe(1);
  });

  it("treats several windows from one source as components of the work", () => {
    // e.g. a utility page listing substation work 2026–2027 and line work 2028–2029
    const a = project("a", "u1", { constructionWindows: [win(2026, 2027), win(2028, 2029)] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2027)] });
    const t = evaluateTime(a, b);
    expect(t.level).toBe("confirmed");
    expect(t.detail.combinations).toBe(1);
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
        { id: "psc", claimSourceId: "psc", label: "in-service", date: { earliest: "2029-07-01", latest: "2029-09-30", precision: "quarter" }, evidenceIds: [] },
      ],
    });
    const m = evaluatePair(a, b, snapshot([a, b]))!;
    expect(m.time).toBe("confirmed");
    expect(m.conflicts).toHaveLength(1);
    expect(m.conflicts[0]).toMatchObject({ field: "completion", affectsMatch: false });
    expect(m.conflicts[0].description).toContain("Q3 2029");
  });

  it("does not report component dates from one source as a conflict", () => {
    const a = near("a", "u1", { constructionWindows: [win(2026, 2027)] });
    const b = near("b", "u2", {
      constructionWindows: [win(2026, 2027), win(2029, 2030)],
      completionClaims: [
        { id: "seg", claimSourceId: "src", label: "in-service (Texas segment)", date: { earliest: "2029-10-01", latest: "2029-10-31", precision: "month" }, evidenceIds: [] },
        { id: "all", claimSourceId: "src", label: "in-service (whole project)", date: { earliest: "2029-11-01", latest: "2029-11-30", precision: "month" }, evidenceIds: [] },
      ],
    });
    expect(evaluatePair(a, b, snapshot([a, b]))!.conflicts).toHaveLength(0);
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
  // evaluated as of the sponsor's own timeframe: at our Sept 2026 snapshot these in-service dates have passed
  const snap = { ...snapshot([desc2, gpc1, desc3, gpc2]), snapshotDate: "2024-01-01" };

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

describe("sponsor starter file", () => {
  it("reproduces every row of the sponsor's overlap table and nothing else", async () => {
    const { sponsorCheck } = await import("@/lib/sponsor");
    const r = sponsorCheck();
    for (const row of r.rows) expect(row, row.id).toMatchObject({ ok: true });
    expect(r.extra).toEqual([]);
  });
});

describe("review-round regressions", () => {
  const near = (id: string, owner: string, over: Partial<Project> = {}) =>
    project(id, owner, { places: [place(`${id} site`, BLAIR[0], BLAIR[1])], ...over });
  it("words an inferred shared site as implied, not stated", () => {
    const a = project("a", "u1", { places: [place("Texas end", 35.3, -101.9)] });
    const b = project("b", "u2", { places: [place("Oklahoma end", 35.4, -99.8)] });
    const rel: Relation = { id: "r", projectA: "a", projectB: "b", kind: "interconnects", siteLabel: "state line", basis: "inferred", description: "", evidenceIds: ["ev1"] };
    const g = evaluateGeo(a, b, [rel]);
    expect(g.level).toBe("confirmed");
    expect(g.reason).toMatch(/imply/);
    expect(g.reason).not.toMatch(/^Sources state/);
    const m = evaluatePair(a, b, snapshot([a, b], [rel]))!;
    expect(m.priorityReasons).toContain("Shared facility implied by sources");
  });

  it("a bounds-only window (start … need date) can only support a possible overlap", () => {
    const bounds = (s: string, e: string): ConstructionWindow => ({
      id: `b-${s}`,
      claimSourceId: "src",
      phase: "unknown",
      start: { earliest: s, latest: e, precision: "day" },
      end: { earliest: s, latest: e, precision: "day" },
      continuous: true,
      boundsOnly: true,
      evidenceIds: ["ev1"],
    });
    const a = project("a", "u1", { constructionWindows: [bounds("2025-06-01", "2027-06-01")] });
    const b = project("b", "u2", { constructionWindows: [win(2026, 2026)] });
    expect(evaluateTime(a, b).level).toBe("possible");
  });

  it("reports in-service gaps at the claims' precision", () => {
    const claim = (id: string, date: DateBound) => [{ id, claimSourceId: "src", label: "in-service", date, evidenceIds: [] }];
    const a = project("a", "u1", { completionClaims: claim("x", yr(2028)) });
    const b = project("b", "u2", { completionClaims: claim("y", { earliest: "2029-07-01", latest: "2029-09-30", precision: "quarter" }) });
    const c = project("c", "u3", { completionClaims: claim("z", { earliest: "2028-06-01", latest: "2028-06-30", precision: "month" }) });
    const ab = evaluateTime(a, b).detail.inService!;
    expect(ab.coarse).toBe(true);
    expect(ab.gapDays).toBe(182); // Dec 31, 2028 → Jul 1, 2029
    expect(evaluateTime(a, c).detail.inService!.gapDays).toBe(0); // June 2028 is inside 2028
  });

  it("counts pairs with no usable location as location-unknown, not 'farther than 25 mi'", () => {
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1])] });
    const b = project("b", "u2");
    const run = runMatching(snapshot([a, b]), { now: "t" });
    expect(run.excludedCounts["location-unknown"]).toBe(1);
    expect(run.excludedPairs[0].reason).toBe("location-unknown");
  });

  it("never crashes on a malformed window whose start is after its end", () => {
    const bad = win(2031, 2029);
    const a = near("a", "u1", { constructionWindows: [bad] });
    const b = near("b", "u2", { constructionWindows: [win(2026, 2032)] });
    expect(() => evaluatePair(a, b, snapshot([a, b]))).not.toThrow();
  });
});

describe("engine-review regressions", () => {
  it("archives projects whose planned in-service date has passed, without calling them complete", () => {
    const past = project("past", "u1", {
      places: [place("Blair", BLAIR[0], BLAIR[1])],
      completionClaims: [{ id: "c", claimSourceId: "src", label: "planned in-service", date: { earliest: "2026-04-01", latest: "2026-04-30", precision: "month" }, evidenceIds: [] }],
    });
    const live = project("live", "u2", { places: [place("Blair 2", BLAIR[0], BLAIR[1])] });
    const run = runMatching(snapshot([past, live]), { now: "t" });
    expect(run.excludedProjects).toEqual([expect.objectContaining({ projectId: "past", reason: "past-in-service" })]);
  });

  it("locality-only centers are at most a possible match (plan §8.4)", () => {
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1], { precision: "locality", uncertaintyMeters: 3000, role: "endpoint" })] });
    const b = project("b", "u2", { places: [place("Arcadia", ARCADIA[0], ARCADIA[1], { role: "endpoint" })] });
    const g = evaluateGeo(a, b, [], 25);
    expect(g.level).toBe("possible");
    expect(g.reason).toMatch(/town/);
  });

  it("a joint initiative that names where the segments meet counts as a site relation", () => {
    const marion = (id: string) => place("Marion", 43.94, -92.35, { id, precision: "locality", uncertaintyMeters: 3000 });
    const a = project("a", "u1", { places: [place("Far west", 44, -95), marion("marion-a")] });
    const b = project("b", "u2", { places: [marion("marion-b"), place("Far east", 44, -91)] });
    const rel: Relation = { id: "r", projectA: "a", projectB: "b", kind: "same-initiative", siteLabel: "Marion, Minn.", sitePlaceId: "marion-a", description: "segments meet near Marion", evidenceIds: ["ev1"] };
    const m = evaluatePair(a, b, snapshot([a, b], [rel]))!;
    expect(m).not.toBeNull();
    expect(m.geoDetail.method).toBe("shared-site");
    expect(m.reviewStatus).toBe("known-coordination");
  });

  it("a joint initiative is not a shared site when only one project has the named place", () => {
    // MMRT Segments 1-2 × Alma–Blair: same MISO project number, ~87 mi apart, no common facility
    const a = project("a", "u1", { places: [place("North Rochester", 44.22, -92.66), place("Wilmarth", 44.2, -94.01)] });
    const b = project("b", "u2", { places: [place("Alma", 44.31, -91.91), place("Tremval North", 44.3, -91.25)] });
    const rel: Relation = { id: "r", projectA: "a", projectB: "b", kind: "same-initiative", siteLabel: "LRTP Project 4", sitePlaceId: "north-rochester", description: "", evidenceIds: ["ev1"] };
    expect(evaluateGeo(a, b, [rel]).detail.method).not.toBe("shared-site");
    expect(evaluatePair(a, b, snapshot([a, b], [rel]))).toBeNull();
  });

  it("possible timing never scores below unknown timing", () => {
    const a = near2("a", "u1", { constructionWindows: [win(2025, 2026)] });
    const b = near2("b", "u2", { constructionWindows: [win(2026, 2028)] });
    const c = near2("c", "u3");
    const possible = evaluatePair(a, b, snapshot([a, b]))!;
    const unknown = evaluatePair(a, c, snapshot([a, c]))!;
    expect(possible.time).toBe("possible");
    expect(unknown.time).toBe("unknown");
    expect(possible.priority).toBeGreaterThan(unknown.priority);
  });
});

function near2(id: string, owner: string, over: Partial<Project> = {}) {
  return project(id, owner, { places: [place(`${id} site`, BLAIR[0], BLAIR[1])], ...over });
}

/* ------------------- data-review regressions on the committed snapshot (2026-09-26) ------------------- */

describe("snapshot data regressions", () => {
  const run = runMatching(SNAPSHOT, { now: "t" });
  const pair = (x: string, y: string) => run.matches.find((m) => m.id === [x, y].sort().join("__"));
  const proj = (id: string) => SNAPSHOT.projects.find((p) => p.id === id)!;

  it("F1: MMRT Segments 1-2 × Alma–Blair share a MISO project number, not a site", () => {
    const g = evaluateGeo(proj("dpc-alma-blair"), proj("xcel-mmrt-wilmarth-north-rochester"), SNAPSHOT.relations);
    expect(g.detail.method).not.toBe("shared-site");
    expect(g.level).toBe("no-match");
    expect(pair("dpc-alma-blair", "xcel-mmrt-wilmarth-north-rochester")).toBeUndefined();
    // the Marion junction is a real shared place and still counts
    expect(pair("dpc-glh-maribell", "xcel-g2b-north-rochester-marion")?.geoDetail.method).toBe("shared-site");
  });

  it("F2: WWTC's current in-service date is NSPW's Q2 2026 report (Q3 2029); Xcel's page stays a live disagreement", () => {
    const c = currentInService(proj("xcel-wwtc"));
    expect(c.claimSourceId).toBe("psc-wwtc-q2-2026-nspw");
    expect(c.date).toMatchObject({ earliest: "2029-07-01", latest: "2029-09-30" });
    const m = pair("dpc-alma-blair", "xcel-wwtc")!;
    expect(m.reviewStatus).toBe("known-coordination");
    expect(m.timeDetail.inService!.gapDays).toBe(182);
    const wwtc = m.conflicts.find((x) => x.projectId === "xcel-wwtc" && x.field === "completion")!;
    expect(wwtc.sides.some((side) => side.sourceIds.includes("xcel-wwtc-page") && !side.earlier)).toBe(true);
  });

  it("F4: Georgia Power's Goshen–McIntosh rebuild ends at Georgia Pacific (Rincon), not at McIntosh", () => {
    const g = proj("gpc-20065");
    expect(g.places.filter((pl) => pl.role === "endpoint").map((pl) => pl.label)).toEqual(["Goshen", "Georgia Pacific"]);
    expect(g.places.find((pl) => pl.role === "context")?.label).toMatch(/^McIntosh/);
    const m = pair("desc-6888", "gpc-20065")!;
    expect(m.geoDetail.method).toBe("measured");
    expect(m.geoDetail.sharedEndpoint).toBeUndefined();
    expect(m.geoDetail.center!.miles).toBeCloseTo(6.7, 1);
    expect(m.priorityReasons).not.toContain("Terminals at the same facility");
  });

  it("F3/F8/F9: newer schedules are current, older ones kept as history", () => {
    expect(currentInService(proj("gpc-20065"))).toMatchObject({ claimSourceId: "sertp-2025-plan", date: { earliest: "2028-01-01", latest: "2028-12-31" } });
    expect(pair("desc-6888", "gpc-20065")!.conflicts.some((c) => c.projectId === "gpc-20065" && c.field === "completion")).toBe(true);
    // DESC 6888's $50,000 2027 line item (0.9% of the total) no longer starts its window
    expect(proj("desc-6888").constructionWindows[0].start.earliest).toBe("2028-01-01");
    const alma = proj("dpc-alma-blair");
    expect(alma.constructionWindows.find((w) => w.claimSourceId === "dpc-alma-blair-cpcn-2024")?.supersededBy).toBe("dpc-alma-blair:w3");
    expect(alma.completionClaims.find((c) => c.claimSourceId === "dpc-alma-blair-cpcn-2024")?.current).toBe(false);
  });

  it("F7: no default shared corridor when neither project builds a new line", () => {
    const d = impactDefaults(pair("desc-6888", "gpc-20065")!);
    expect(d.sharedMiles).toBe(0);
    expect(d.sharedMilesNote).toMatch(/Neither project needs a new corridor/);
    // two new lines with published lengths keep the shorter length as the default
    expect(impactDefaults(pair("dpc-alma-blair", "xcel-wwtc")!).sharedMiles).toBe(35);
  });
});
