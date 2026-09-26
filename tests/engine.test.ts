import { describe, expect, it } from "vitest";
import type { ConstructionWindow, DateBound, Place, Project, Relation, Snapshot } from "@/lib/domain/types";
import { IDX, SNAPSHOT } from "@/lib/data";
import { buildBrief } from "@/lib/brief";
import { whyFlagged } from "@/lib/describe";
import { overlapTableCsv } from "@/lib/export";
import { displayTitle, formatBound, formatMilesNear, formatPoint, formatSpan, formatWindow, nameRecordIds, precisionLabel, publicNote, windowStartText, year } from "@/lib/format";
import { impactDefaults, needsNewCorridor } from "@/lib/impact";
import { evaluatePair, pastDue, projectConflicts, runMatching } from "@/lib/matching/engine";
import { evaluateGeo, facilityWords } from "@/lib/matching/geo";
import { activeWindows, coarsest, currentInService, dayCount, dayWord, displayWindowGroups, endsWindow, evaluateTime, scheduleWindows } from "@/lib/matching/time";
import { readableNote, windowSourceText } from "@/lib/selectors";

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
  it("keeps projects whose planned in-service date has passed, flagged and ranked lower, without calling them complete", () => {
    const isd = (iso: string) => [{ id: "c", claimSourceId: "src", label: "planned in-service", date: { earliest: iso, latest: iso, precision: "day" as const }, evidenceIds: [] }];
    const past = project("past", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1])], completionClaims: isd("2026-04-30") });
    const live = project("live", "u2", { places: [place("Blair 2", BLAIR[0], BLAIR[1])], completionClaims: isd("2027-04-30") });
    const same = project("same", "u3", { places: [place("Blair 3", BLAIR[0], BLAIR[1])], completionClaims: isd("2027-04-30") });
    const run = runMatching(snapshot([past, live, same]), { now: "t" });
    expect(run.excludedProjects).toEqual([]);
    expect(run.pastDueProjects).toEqual([{ projectId: "past", detail: expect.stringMatching(/^Planned in-service date \(Apr 30, 2026\) has passed; completion not confirmed/) }]);
    const due = run.matches.find((m) => m.id === "live__past")!;
    expect(due.pastDue).toEqual([expect.objectContaining({ projectId: "past" })]);
    expect(due.priorityReasons).toContain("Planned date passed; completion not confirmed (ranked below current plans)");
    expect(due.timeReason).toMatch(/past: planned date passed; completion not confirmed, so TIME is at most possible\.$/);
    // the same pair without the passed date ranks higher
    const current = run.matches.find((m) => m.id === "live__same")!;
    expect(current.pastDue).toBeUndefined();
    expect(run.matches.indexOf(current)).toBeLessThan(run.matches.indexOf(due));
    // a published schedule overlap cannot confirm TIME when a plan's date has passed
    const sched = (s: string, e: string): ConstructionWindow => win(2020, 2020, { phase: "scheduled", start: { earliest: s, latest: s, precision: "day" }, end: { earliest: e, latest: e, precision: "day" } });
    const a = project("a", "u1", { places: [place("Blair", BLAIR[0], BLAIR[1])], completionClaims: isd("2026-04-30"), constructionWindows: [sched("2024-01-01", "2026-04-30")] });
    const b = project("b", "u2", { places: [place("Blair 2", BLAIR[0], BLAIR[1])], completionClaims: isd("2027-04-30"), constructionWindows: [sched("2024-01-01", "2027-04-30")] });
    expect(evaluateTime(a, b).level).toBe("confirmed");
    const m = evaluatePair(a, b, snapshot([a, b]))!;
    expect([m.time, m.badge, m.timeDetail.basis, m.timeDetail.confirmedOverlap]).toEqual(["possible", "GEO", undefined, undefined]);
    // completion stated by a source still archives the project
    const done = project("done", "u4", { places: [place("Blair 4", BLAIR[0], BLAIR[1])], status: { value: "complete", evidenceIds: [] } });
    expect(runMatching(snapshot([done, live]), { now: "t" }).excludedProjects).toEqual([expect.objectContaining({ projectId: "done", reason: "complete" })]);
  });

  it("a construction window that runs past the snapshot date keeps a project current even when its need date passed", () => {
    const p = project("p", "u1", {
      completionClaims: [{ id: "c", claimSourceId: "src", label: "need date (in-service)", date: { earliest: "2026-06-01", latest: "2026-06-01", precision: "day" }, evidenceIds: [] }],
      constructionWindows: [win(2026, 2027, { claimSourceId: "permit" })],
    });
    expect(pastDue(p, "2026-09-26")).toBeNull();
    expect(pastDue({ ...p, constructionWindows: [] }, "2026-09-26")).not.toBeNull();
    // an undated snapshot (the sponsor starter file) never flags anything
    expect(pastDue({ ...p, constructionWindows: [] }, undefined)).toBeNull();
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
    // Alma-Blair's current forecasts agree ("2028" page, "Sep 2028" PSC): the precise one is used, as on the conflict card
    expect(currentInService(proj("dpc-alma-blair")).claimSourceId).toBe("psc-1515-ce-103-final");
    expect(m.timeDetail.inService!.gapDays).toBe(274);
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
    expect(currentInService(proj("gpc-20065"))).toMatchObject({ claimSourceId: "sertp-2026-prelim-plan", date: { earliest: "2028-01-01", latest: "2028-12-31" } });
    expect(proj("gpc-20065").completionClaims.find((c) => c.claimSourceId === "sertp-2025-plan")?.current).toBe(false);
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
    // two new lines that only meet at a substation / handoff point share no parallel corridor
    const ab = impactDefaults(pair("dpc-alma-blair", "xcel-wwtc")!);
    expect(ab.sharedMiles).toBe(0);
    expect(ab.sharedMilesNote).toMatch(/meet at Tremval North/);
    expect(impactDefaults(pair("sps-potter-beckham-tx", "transource-potter-beckham-ok")!).sharedMiles).toBe(0);
  });

  it("impact defaults use the pair's own voltage class, falling back only to a lower published class", () => {
    const ab = impactDefaults(pair("dpc-alma-blair", "xcel-wwtc")!);
    expect(ab.voltageClass).toBe("345");
    expect([ab.widthClass, ab.rowWidthFt?.typical, ab.mobilClass, ab.mobilization?.typical]).toEqual(["345", 175, "345", 250000]);
    const g2b = impactDefaults(pair("dpc-glh-maribell", "xcel-g2b-north-rochester-marion")!);
    expect(g2b.voltageClass).toBe("765");
    expect([g2b.widthClass, g2b.rowWidthFt?.typical]).toEqual(["765", 225]);
    // MISO publishes no 765 kV mobilization value: the 500 kV one is used and labelled as such
    expect([g2b.mobilClass, g2b.mobilization?.typical]).toEqual(["500", 300000]);
  });

  const pub = (id: string) => SNAPSHOT.sources.find((x) => x.id === id)?.publisher ?? id;
  const doc = (id: string) => SNAPSHOT.sources.find((x) => x.id === id)?.title ?? id;

  it("a conflict side shows its most precise current claim and cites that claim first", () => {
    const m = pair("dpc-alma-blair", "xcel-wwtc")!;
    const c = m.conflicts.find((x) => x.id === "dpc-alma-blair:completion")!;
    expect(c.sides.map((x) => x.value)).toEqual(["Sep 2028", "Q2 2028"]);
    expect(c.sides[0].sourceIds[0]).toBe("psc-1515-ce-103-final");
    expect(c.description).toContain("Q2 2028 → Final Decision, docket 1515-CE-103: Sep 2028");
    expect(c.description).not.toContain("current edition: 2028");
    // the brief's citation for the current side is the PSC excerpt that states Sep 2028
    const brief = buildBrief(m);
    const line = brief.unresolved.find((u) => u.startsWith("Alma-Blair"))!;
    const nums = line.match(/\[([\d, ]+)\]$/)![1].split(", ").map(Number);
    expect(nums.map((n) => brief.citations[n - 1].title)).toContain("Final Decision, docket 1515-CE-103");
    expect(brief.citations[nums[0] - 1].excerpt).toMatch(/September 2028/);
    // sides that are shown as disagreeing never state overlapping dates
    for (const x of ["abo-alexandria-big-oaks", "badger-coulee-345kv", "xcel-wwtc", "otp-mres-bssa"]) {
      const p = proj(x);
      const cc = projectConflicts(p, pub, doc).find((k) => k.field === "completion")!;
      const dates = cc.sides.map((sd) => p.completionClaims.find((k) => k.id === sd.claimIds[0])!.date);
      for (let i = 0; i < dates.length; i++)
        for (let j = i + 1; j < dates.length; j++) expect(dates[i].earliest <= dates[j].latest && dates[j].earliest <= dates[i].latest).toBe(false);
      cc.sides.forEach((sd, i) => expect(sd.value).toBe(formatBound(dates[i])));
    }
  });

  it("'plan editions' only for one publisher's own lists; a later source superseding an earlier one says so", () => {
    const g = pair("desc-6888", "gpc-20065")!.conflicts.find((c) => c.id === "gpc-20065:completion")!;
    expect(g.description).toBe("Date superseded by a newer source — 2024 Ten-Year Plan: Jun 1, 2027 → SERTP 2025, SERTP 2026 preliminary: 2028");
    const desc = projectConflicts(proj("desc-06005-b"), pub, doc).find((c) => c.field === "completion")!;
    // edition names oldest first
    expect(desc.description).toBe("Schedule changed between plan editions — 2024–2028 list, 2025–2029 list: Mar 31, 2027 → current edition: Dec 31, 2028");
  });

  it("a 'no later than' deadline is not an in-service forecast: BECI uses the Sept 2026 schedule (2033)", () => {
    const m = pair("grid-forward-atc", "transource-beci")!;
    expect(m.timeDetail.inService!.gapDays).toBe(732);
    expect(m.timeDetail.inService!.labelB).toContain("Sept 2026");
    const c = m.conflicts.find((x) => x.id === "transource-beci:completion")!;
    expect(c.sides.map((x) => x.value)).not.toContain("Jun 1, 2034");
    expect(c.sides.map((x) => x.value).sort()).toEqual(["2033", "2034"]);
  });

  it("measured named-facility centers inside the radius are not called coarse or 'near edge only'", () => {
    const m = pair("desc-6888", "gpc-20787")!;
    expect(m.geo).toBe("possible");
    expect(m.geoDetail.center!.localityOnly).toBe(false);
    expect(m.geoReason).toMatch(/≈24\.9 mi apart — inside the 25 mi radius/);
    expect(m.geoReason).not.toMatch(/only at the near edge/);
    expect(m.priorityReasons).toContain("Near the radius edge (location uncertainty)");
    expect(formatMilesNear(24.89, 25)).toBe("24.9 mi");
    expect(formatMilesNear(30.2, 25)).toBe("30 mi");
    expect(formatMilesNear(6.72, 25)).toBe("6.7 mi");
  });

  it("DESC budget windows with 'Previous' spending never show an invented start year", () => {
    const open = SNAPSHOT.projects.flatMap((p) => p.constructionWindows).filter((w) => w.openStart);
    expect(open.some((w) => w.phase === "scheduled")).toBe(true);
    expect(open.length).toBeGreaterThan(0);
    for (const w of open) {
      expect(formatWindow(w.start, w.end, w.openEnded, w.openStart)).not.toContain(String(year(w.start.earliest)));
      expect(w.note).toMatch(/start year is not published/);
    }
    const w = proj("desc-0139-m-n").constructionWindows[0];
    expect(formatWindow(w.start, w.end, w.openEnded, w.openStart)).toBe("before 2026 → 2027");
    expect(windowStartText(w)).toBe("before 2026");
    // a year-precision start inside the calendar year that ends it reads as that year
    const d = proj("desc-6888").constructionWindows[0];
    expect(formatWindow(d.start, d.end, d.openEnded, d.openStart)).toBe("2028");
    expect(formatWindow(yr(2027), yr(2028))).toBe("2027–2028");
    // every budget window cites the cells it is built from: the start year's amount and, for openStart, the 'Previous' column
    const ex = (ws: typeof open) => ws.flatMap((x) => x.evidenceIds.map((id) => SNAPSHOT.evidence[id].exactExcerpt));
    expect(ex(proj("desc-6367-d").constructionWindows)).toContain("Previous 2026 $14,773,047 $26,616,000");
    expect(ex(proj("desc-06367-d-g").constructionWindows)).toContain("Previous 2026 $14,303648 $4,976,826");
    for (const x of open) expect(ex([x]).some((e) => e.includes("Previous"))).toBe(true);
    // a window conflict words an open start the same way
    const os = project("os", "u1", {
      constructionWindows: [
        win(2026, 2026, { claimSourceId: "s1", openStart: true, start: { earliest: "2023-01-01", latest: "2026-12-31", precision: "year" } }),
        win(2029, 2030, { claimSourceId: "s2" }),
      ],
    });
    expect(projectConflicts(os, (id) => id).find((c) => c.field === "constructionWindow")!.sides.map((x) => x.value)).toEqual(["before 2026 → 2026", "2029–2030"]);
  });

  it("utility quarterly reports are attributed to the utility that filed them", () => {
    expect(pub("psc-wwtc-q2-2026-nspw")).toMatch(/^Northern States Power Company-Wisconsin/);
    expect(pub("psc-wwtc-q2-2026-atc")).toMatch(/^American Transmission Company/);
  });

  it("derived schedule bounds that miss each other are not called published construction windows", () => {
    const t = evaluateTime(proj("desc-6888"), proj("gpc-20785"));
    expect(t.level).toBe("no-match");
    expect(t.reason).not.toMatch(/Published construction windows/);
    expect(t.reason).toMatch(/^Schedule bounds do not overlap/);
    const a = near2("a", "u1", { constructionWindows: [win(2020, 2021)] });
    const b = near2("b", "u2", { constructionWindows: [win(2024, 2025)] });
    expect(evaluateTime(a, b).reason).toMatch(/^Published construction windows do not overlap/);
    expect(t.reason).toMatch(/no construction dates are published/);
    // Dominion's page dates the Jasper–Okatie construction start, Georgia Power's the Effingham one: never "no construction dates"
    for (const [x, y] of [["desc-06367-d-g", "gpc-20784"], ["desc-06367-d-g", "gpc-effingham-500"], ["desc-6367-d", "gpc-effingham-500"]]) {
      const r = evaluateTime(proj(x), proj(y));
      expect(r.level).toBe("no-match");
      expect(r.reason).toMatch(/^Schedule bounds do not overlap \(construction dates are only partly published/);
      expect(r.reason).not.toMatch(/no construction dates are published/);
    }
  });

  it("Goshen–Kraft rebuild (GPC 20785) is centered on its rebuilt section, Kraft – Rice Hope", () => {
    const g = proj("gpc-20785");
    expect(g.places.filter((pl) => pl.role === "endpoint").map((pl) => pl.label)).toEqual(["Rice Hope", "Kraft"]);
    expect(g.places.find((pl) => pl.role === "context")?.label).toMatch(/^Goshen/);
    expect(pair("desc-6367-d", "gpc-20785")!.geoDetail.center!.miles).toBeCloseTo(9.7, 1);
  });

  it("the overlap CSV has unique project ids, per-tab queue ranks and a time-gap basis", () => {
    const ms = run.matches.filter((m) => proj(m.projectAId).region === "southeast");
    const [head, ...rows] = overlapTableCsv(ms).trim().split("\n");
    const cols = head.split(",");
    expect(cols.slice(0, 9)).toEqual(["overlap_id", "distance_mi", "time_gap (day)", "utility_a", "project_id_a", "project_name_a", "utility_b", "project_id_b", "project_name_b"]);
    const at = (name: string) => cols.indexOf(name);
    const parsed = rows.map((r) => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "")));
    const ids = new Set<string>();
    for (const r of parsed) {
      expect(r[at("project_id_a")]).not.toBe(r[at("project_id_b")]);
      ids.add(r[at("pair_id")]);
      expect(["exact", "at-least", "ranges-overlap", ""]).toContain(r[at("time_gap_basis")]);
    }
    expect(ids.size).toBe(rows.length);
    const top = parsed.find((r) => r[at("pair_id")] === "desc-6888__gpc-20065")!;
    expect([top[at("time_gap (day)")], top[at("time_gap_basis")]]).toEqual(["0", "ranges-overlap"]);
    expect(parsed.every((r) => r[at("review_radius_mi")] === "25")).toBe(true);
    const coarse = parsed.find((r) => r[at("pair_id")] === "desc-06367-d-g__gpc-20065")!;
    expect([coarse[at("time_gap (day)")], coarse[at("time_gap_basis")]]).toEqual(["396", "at-least"]);
    // queue_rank restarts at 1 in each review-status tab
    const firsts = parsed.filter((r) => r[at("queue_rank")] === "1").map((r) => r[at("review_status")]);
    expect(new Set(firsts).size).toBe(firsts.length);
    // a published in-service date is filled even when the other side has none (no gap, so no gap basis)
    const eff = parsed.find((r) => r[at("pair_id")] === "desc-6888__gpc-effingham-500")!;
    expect([eff[at("in_service_a")], eff[at("time_gap (day)")], eff[at("time_gap_basis")]]).toEqual(["2028-12-31", "", ""]);
  });

  it("briefs quote whole sentences and full titles (no mid-sentence ellipses)", () => {
    for (const m of run.matches) {
      const b = buildBrief(m);
      for (const t of [...b.rows.map((r) => r.text), ...b.unresolved]) expect(t).not.toContain("…");
    }
  });

  it("display helpers: coarsest precision, per-publisher window groups, public notes", () => {
    const wwtc = proj("xcel-wwtc");
    const groups = displayWindowGroups(wwtc, (id) => SNAPSHOT.sources.find((s) => s.id === id)?.publisher);
    expect(groups.length).toBeLessThan(wwtc.constructionWindows.filter((w) => !w.supersededBy && w.phase !== "preconstruction").length);
    expect(groups.some((g) => g.sourceIds.length > 1)).toBe(true);
    const g = proj("gpc-20065").constructionWindows.filter((w) => !w.supersededBy);
    expect(coarsest(g)).toBe("year");
    expect(publicNote("It may be adjusted after approval (see route.caveat). The UI should strip these. Kept.")).toBe("It may be adjusted after approval. Kept.");
    // schema notation is put in words; cache paths and record-mapping sentences are dropped
    expect(publicNote(proj("desc-6888").caveats[0])).toMatch(/^Terminals: Okatie \(DESC\) and McIntosh \(Georgia Power\);.* The third mapped point is the new Deerfield/);
    for (const p of SNAPSHOT.projects) for (const c of p.caveats) expect(publicNote(c)).not.toMatch(/\bA = |endpoints\[|\.cache\/|This record maps/);
    expect(nameRecordIds("(gpc-irp-2025-vol3: no hits) breaker-and-a-half", (id) => (id === "gpc-irp-2025-vol3" ? "Ten-Year Plan" : undefined))).toBe("(Ten-Year Plan: no hits) breaker-and-a-half");
    for (const u of SNAPSHOT.unresolved) expect(u.note).not.toMatch(/atc-nspw-grid-forward|placeholder shared|U\+0007/);
    // open research questions read without record ids, cluster names or schema values
    for (const u of SNAPSHOT.unresolved)
      expect(readableNote(u.note, IDX)).not.toMatch(
        /\b(?:scrtp-home|sertp-home|scrtp-meeting|scpsc-aep|psc-wwtc-map|transource-ok|sc-ga-(?:desc|gpc)|xcel-mmrt|maribell-\*|not-found-in-sources|reported-coordination)\b|utility id|cached by another researcher/,
      );
    // test-fixture instructions are dropped; the finding they wrap is kept
    const maribell = proj("dpc-glh-maribell").caveats.map(publicNote);
    expect(maribell).toContain(
      "The published text places the line only by six counties plus two endpoint towns (Marion, Bell Center). The new Houston County 161 kV switching station is truly county-only (site 'not yet identified').",
    );
    for (const p of SNAPSHOT.projects) for (const c of p.caveats) expect(publicNote(c)).not.toMatch(/Engines? should|no-TIME control|\bno-match\b|supersededBy|continuous=false|completionClaims/);
    // shared-owner exclusions name utilities, not internal ids
    const short = SNAPSHOT.utilities.map((u) => u.shortName);
    const shared = run.excludedPairs.filter((e) => e.reason === "shared-owner");
    expect(shared.length).toBeGreaterThan(0);
    for (const x of shared) for (const n of x.detail.match(/^Shared owner \((.*)\):/)![1].split(", ")) expect(short).toContain(n);
  });
  it("a disputed in-service date that also ends a current window is reported as feeding TIME", () => {
    const g = pair("desc-6888", "gpc-20065")!.conflicts.find((c) => c.id === "gpc-20065:completion")!;
    expect(g).toMatchObject({ affectsMatch: true, versionOnly: true, boundClaimIds: ["gpc-20065:c1"] });
    const ab = pair("dpc-alma-blair", "xcel-wwtc")!;
    expect(ab.conflicts.find((c) => c.id === "dpc-alma-blair:completion")).toMatchObject({ affectsMatch: true, versionOnly: true, boundClaimIds: ["dpc-alma-blair:c2"] });
    // Xcel's page vs the PSC/NSPW reports: two current sides; the Q3 2029 claims end those sources' own bounds-only windows
    expect(ab.conflicts.find((c) => c.id === "xcel-wwtc:completion")).toMatchObject({
      affectsMatch: true,
      versionOnly: false,
      boundClaimIds: ["xcel-wwtc:c1", "xcel-wwtc:c4", "xcel-wwtc:c5"],
    });
    expect(ab.time).not.toBe("no-match");
    // DESC: the current SCRTP date ends both the Dominion page window and the budget window; earlier editions are history
    const desc = pair("desc-06367-d-g", "gpc-20065")!.conflicts.find((c) => c.id === "desc-06367-d-g:completion")!;
    expect(desc).toMatchObject({ affectsMatch: true, versionOnly: true, boundClaimIds: ["desc-06367-d-g:c1"] });
    // Midwest windows that end at a stated construction end, not at the disputed dates
    expect(projectConflicts(proj("otp-mres-bssa"), pub, doc).find((c) => c.field === "completion")!.affectsMatch).toBe(false);
  });

  it("endsWindow: current forecasts that bound an active window, never earlier editions or deadlines", () => {
    const ends = (pid: string) => Object.fromEntries(proj(pid).completionClaims.map((c) => [c.id.split(":")[1], endsWindow(proj(pid), c)]));
    expect(ends("desc-6888")).toEqual({ c1: true });
    // the SC PSC letters (c4–c6) agree with or precede the SCRTP date; only the SCRTP date ends the page and budget windows
    expect(ends("desc-06367-d-g")).toEqual({ c1: true, c2: false, c3: false, c4: false, c5: false, c6: false });
    expect(ends("gpc-20065")).toEqual({ c1: true, c2: false, c3: false });
    expect(ends("xcel-wwtc")).toEqual({ c1: true, c2: false, c3: false, c4: true, c5: true, c6: false, c7: true });
    expect(ends("dpc-alma-blair")).toEqual({ c1: false, c2: true, c3: false });
    expect(ends("transource-beci")).toEqual({ c1: true, c2: false, c3: false, c4: false });
    // a claim from another source that shares no excerpt with the window never bounds it
    const a = project("a", "u1", {
      constructionWindows: [win(2026, 2027)],
      completionClaims: [
        { id: "same", claimSourceId: "src", label: "in-service", date: yr(2027), evidenceIds: [] },
        { id: "other", claimSourceId: "psc", label: "in-service", date: yr(2027), evidenceIds: [] },
        { id: "cited", claimSourceId: "psc", label: "in-service", date: yr(2027), evidenceIds: ["ev1"] },
        { id: "old", claimSourceId: "src", label: "in-service", date: yr(2027), evidenceIds: [], current: false },
        { id: "due", claimSourceId: "src", label: "required in-service deadline", date: yr(2027), evidenceIds: [] },
      ],
    });
    expect(a.completionClaims.map((c) => endsWindow(a, c))).toEqual([true, false, true, false, false]);
  });

  it("a gap of one day reads '1 day'", () => {
    expect([dayWord(1), dayWord(0), dayWord(2), dayCount(1), dayCount(3074)]).toEqual(["day", "days", "days", "1 day", "3,074 days"]);
    const m = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 40 }).matches.find((x) => x.id === "desc-6808-l__gpc-20065")!;
    expect(m.timeDetail.inService!.gapDays).toBe(1);
    expect(m.timeReason).toContain("at least 1 day apart");
    expect(whyFlagged(m) + m.priorityReasons.join()).not.toMatch(/\b1 days\b/);
  });

  it("the impact note never treats substation, bank or reconductor work as a new line", () => {
    for (const id of ["gpc-20796", "desc-6854-c", "desc-6238-h", "atc-columbia-beci-work", "gpc-19523"]) expect(needsNewCorridor(proj(id))).toBe(false);
    for (const id of ["xcel-wwtc", "gpc-effingham-500", "dpc-alma-blair", "transource-beci"]) expect(needsNewCorridor(proj(id))).toBe(true);
    expect(impactDefaults(pair("desc-6888", "gpc-20796")!).sharedMilesNote).toMatch(/Neither project needs a new corridor/);
  });

  it("'Late 2029' is shown at half-year precision, never as a quarter", () => {
    expect(formatPoint("2029-07-01", "half")).toBe("Late 2029");
    expect(formatPoint("2029-01-01", "half")).toBe("Early 2029");
    expect(precisionLabel("half")).toBe("half-year");
    const w = proj("transource-beci").constructionWindows[0];
    expect(formatWindow(w.start, w.end)).toBe("Late 2029–Late 2033");
    expect(coarsest([w, win(2026, 2030)])).toBe("year");
    const m = pair("grid-forward-atc", "transource-beci")!;
    expect(m.timeDetail.precision).toBe("half");
    expect(m.timeReason).toContain("(Late 2029–Late 2030)");
    expect(formatSpan(m.timeDetail.possibleOverlap!, m.timeDetail.precision)).toBe("Late 2029–Late 2030");
    const b = buildBrief(m);
    expect(b.question).toContain("Late 2029–Late 2030");
    // the precision caveat names each coarse project and is worded as a lower bound
    expect(b.unresolved).toContain(
      `At least one published schedule date for ${displayTitle(proj("transource-beci"))} is only half-year-precision; the exact months of its field work are not stated.`,
    );
    expect(b.unresolved.some((u) => u.startsWith("Published schedules are"))).toBe(false);
    expect(overlapTableCsv([m])).not.toContain("(half)");
  });

  it("Grid Forward ATC runs from the change-of-ownership point to Columbia; ABO from Alexandria to Big Oaks", () => {
    expect(proj("grid-forward-atc").places.filter((pl) => pl.role === "endpoint").map((pl) => pl.id)).toEqual(["gf-pco", "gf-columbia"]);
    expect(proj("abo-alexandria-big-oaks").places.filter((pl) => pl.role === "endpoint").map((pl) => pl.id)).toEqual(["abo-alexandria", "abo-big-oaks"]);
    expect(pair("grid-forward-atc", "grid-forward-nspw")!.geoDetail.center!.miles).toBeCloseTo(53.5, 0);
    expect(pair("grid-forward-atc", "transource-beci")!.geoDetail.center!.miles).toBeCloseTo(80, 0);
  });

  it("near-edge wording: one decimal beside the radius, and 'named facilities' only when no point is town-level", () => {
    expect(pair("atc-wwtc-jump-river", "xcel-wwtc")!.geoReason).toContain("≈25.8 mi apart");
    const at10 = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 10 }).matches.find((m) => m.id === "desc-6367-d__gpc-20785")!;
    expect(at10.geoDetail.center!.anyLocality).toBe(true);
    expect(whyFlagged(at10)).toMatch(/centers ≈9\.7 mi apart, at the edge of the 10 mi radius.*A location is approximate \(town-level\)/);
    expect(whyFlagged(pair("desc-6888", "gpc-20787")!)).toMatch(/Located at named facilities/);
  });

  it("WWTC and Grid Forward NSPW start at Tremval North (Larkin Valley), not the existing Tremval substation", () => {
    const ends = (id: string) => proj(id).places.filter((pl) => pl.role === "endpoint").map((pl) => pl.id);
    expect(ends("xcel-wwtc")).toEqual(["larkin-valley-substation", "jump-river-south-endpoint"]);
    expect(ends("grid-forward-nspw")).toEqual(["gf-larkin-valley", "gf-pco"]);
    expect(proj("xcel-wwtc").places.find((pl) => pl.id === "tremval-substation-existing")!.role).toBe("context");
  });

  it("a coarse pair names the project that is only located by county", () => {
    const m = pair("desc-6888", "gpc-effingham-500")!;
    expect(m.geoDetail.method).toBe("coarse");
    expect(m.geoReason).toMatch(/^Effingham County 500 kV.* is located only at county level/);
    expect(buildBrief(m).unresolved.join(" ")).not.toMatch(/Only county-level locations are published for either/);
  });

  it("superseded wording never implies the date moved later (Rice Hope moved earlier)", () => {
    const c = pair("desc-6888", "gpc-20989")!.conflicts.find((x) => x.projectId === "gpc-20989" && x.field === "completion")!;
    expect(c.description).toMatch(/^Date superseded by a newer source — 2024 Ten-Year Plan: Jun 1, 2029 → SERTP 2025, SERTP 2026 preliminary: 2028/);
  });

  it("DESC windows that run past the in-service date say why", () => {
    const w = activeWindows(proj("desc-0139-m-n")).find((x) => x.claimSourceId === "desc-scrtp-2026-2030")!;
    expect(w.end.latest).toBe("2027-12-31");
    expect(w.note).toMatch(/after the planned in-service date \(2027: \$1,024,912\), so the window may run to the end of 2027/);
  });

  it("the brief's GEO line cites the terminals each center is measured from", () => {
    const b = buildBrief(pair("desc-6888", "gpc-20065")!);
    const geo = b.rows.find((r) => r.label === "Why flagged")!.text.split("\n")[0];
    const nums = geo.match(/\[([\d, ]+)\]$/)![1].split(", ").map(Number);
    expect(nums.map((n) => b.citations[n - 1].excerpt).join(" ")).toContain("Georgia Pacific (Rincon)");
  });

  it("the brief's TIME line cites the budget cell that puts a DESC window in the overlap year", () => {
    const b = buildBrief(pair("desc-0139-m-n", "gpc-effingham-500")!);
    const time = b.rows.find((r) => r.label === "Why flagged")!.text.split("\n")[1];
    const nums = time.match(/\[([\d, ]+)\]$/)![1].split(", ").map(Number);
    expect(nums.map((n) => b.citations[n - 1].excerpt)).toContain("2027 $1,024,912");
  });

  it("season wording is shown as the source words it, never as a quarter", () => {
    const w = proj("transource-potter-beckham-ok").constructionWindows[0];
    expect(formatWindow(w.start, w.end)).toBe("Spring 2028–Late 2028");
    expect(formatBound(proj("transource-potter-beckham-ok").completionClaims[0].date)).toBe("Late 2029");
    const eff = proj("gpc-effingham-500").constructionWindows.find((x) => x.start.label === "Spring 2027")!;
    expect(formatWindow(eff.start, eff.end, eff.openEnded)).toBe("from Spring 2027");
  });

  it("a 'completion by' date is kept as bounds for Grid Forward ATC, like WWTC", () => {
    const g = proj("grid-forward-atc");
    expect(g.constructionWindows[0].boundsOnly).toBe(true);
    expect(endsWindow(g, g.completionClaims.find((c) => c.id === "grid-forward-atc:c2")!)).toBe(false);
    expect(endsWindow(g, g.completionClaims.find((c) => c.id === "grid-forward-atc:c1")!)).toBe(true);
  });

  it("research notes agree with the Tremval North terminals", () => {
    for (const u of SNAPSHOT.unresolved) expect(u.note).not.toMatch(/placed at Blair locality|Cross-cluster coordinate mismatch/);
  });

  it("model-extraction runs are recorded with provider and model, and only located spans count", () => {
    expect(SNAPSHOT.extractionRuns.length).toBeGreaterThan(0);
    for (const r of SNAPSHOT.extractionRuns) {
      expect(r.provider && r.model && r.promptVersion).toBeTruthy();
      for (const f of r.fields) if (f.inSnapshot) expect(f.located).toBe(true);
      const located = r.fields.filter((f) => f.located).length;
      expect(r.note).toContain(`${located}/${r.fields.length} excerpts located verbatim`);
    }
    // runs cross-check the snapshot; no evidence is attributed to a model
    expect(Object.values(SNAPSHOT.evidence).some((e) => e.extractionMethod === "model")).toBe(false);
  });

  it("SERTP 2026 in-service years are current for every Savannah-area project that states a different year; SERTP 2025 is history", () => {
    for (const [id, y] of [["gpc-20065", 2028], ["gpc-20989", 2028], ["gpc-20407", 2029], ["gpc-20784", 2029], ["gpc-20787", 2029]] as const) {
      const c = currentInService(proj(id));
      expect([id, c.claimSourceId, c.date.latest]).toEqual([id, "sertp-2026-prelim-plan", `${y}-12-31`]);
      expect(proj(id).completionClaims.find((k) => k.claimSourceId === "gpc-irp-2025-vol3")?.current).toBe(false);
      expect(proj(id).completionClaims.find((k) => k.claimSourceId === "sertp-2025-plan")?.current).toBe(false);
    }
    // SERTP 2026 restates the Need Date's year: the more precise Need Date stays current and the year is kept beside it
    for (const [id, d] of [["gpc-20785", "2027-06-01"], ["gpc-20783", "2028-06-01"], ["gpc-21023", "2029-06-01"], ["gpc-21116", "2030-06-01"], ["gpc-20796", "2033-06-01"]] as const) {
      expect([id, currentInService(proj(id)).date.latest]).toEqual([id, d]);
      expect(proj(id).completionClaims.find((k) => k.claimSourceId === "sertp-2026-prelim-plan")).toMatchObject({ label: "in-service year (SERTP 2026 preliminary)" });
      expect(proj(id).completionClaims.every((k) => k.current !== false)).toBe(true);
    }
    expect(proj("gpc-20785").caveats.join(" ")).toMatch(/Phase 2 \(3\.04 miles, Goshen – Rice Hope\) in 2031/);
    // Start Date 06/01/2030 is after the SERTP year 2029: no inverted window (nor a schedule), and it says why
    expect(proj("gpc-20787").constructionWindows).toEqual([]);
    expect(proj("gpc-20787").caveats.join(" ")).toMatch(/Start Date \(06\/01\/2030\) is after the SERTP 2026 preliminary in-service year \(2029\)/);
    expect(proj("gpc-20784").caveats.join(" ")).toMatch(/approximately 8\.1 miles/);
    for (const p of SNAPSHOT.projects)
      for (const w of p.constructionWindows) {
        expect(w.start.earliest <= w.end.latest).toBe(true);
        if (w.supersededBy) expect(p.constructionWindows.some((x) => x.id === w.supersededBy)).toBe(true);
      }
    const m = pair("desc-6888", "gpc-20407")!;
    expect(m.timeDetail.possibleOverlap).toEqual({ start: "2028-01-01", end: "2028-12-31" });
    expect(m.timeDetail.inService!.gapDays).toBeLessThanOrEqual(366);
  });

  it("windows built from two documents credit both; others credit their publisher", () => {
    const label = (pid: string, wid: string) => windowSourceText([proj(pid).constructionWindows.find((w) => w.id === `${pid}:${wid}`)!], IDX);
    expect(label("gpc-20065", "w2")).toBe("Georgia Power Ten-Year Plan start → SERTP 2026 preliminary in-service year");
    expect(label("gpc-20989", "w2")).toBe("Georgia Power Ten-Year Plan start → SERTP 2026 preliminary in-service year");
    expect(label("desc-06367-d-g", "w1")).toBe("Dominion project page start → SCRTP planned in-service");
    expect(label("desc-06367-d-g", "w2")).toBe(IDX.source("desc-scrtp-2026-2030")!.publisher);
    expect(label("transource-beci", "w1")).toBe(IDX.source("mgs-beci-factsheet")!.publisher);
  });

  it("a name-only shared site is implied, not source-stated", () => {
    const rel = SNAPSHOT.relations.find((r) => [r.projectA, r.projectB].sort().join() === "grid-forward-atc,transource-beci" && r.kind === "shared-site")!;
    expect(rel.basis).toBe("inferred");
    const m = pair("grid-forward-atc", "transource-beci")!;
    expect(m.priorityReasons).toContain("Shared facility implied by sources");
    expect(whyFlagged(m)).toContain("a shared facility implied by the sources");
    // the stated shared sites keep their basis
    expect(pair("dpc-alma-blair", "xcel-wwtc")!.priorityReasons).toContain("Shared facility stated in a source");
  });

  it("'Previous' spending of 5% or more starts a DESC window before 2026, not before its first large year", () => {
    const text = (pid: string) => {
      const w = proj(pid).constructionWindows[0];
      return formatWindow(w.start, w.end, w.openEnded, w.openStart);
    };
    expect(text("desc-06372-a")).toBe("before 2026 → Dec 31, 2028");
    expect(text("desc-6808-v")).toBe("before 2026 → Dec 31, 2030");
    for (const w of SNAPSHOT.projects.flatMap((p) => p.constructionWindows).filter((w) => w.openStart && w.phase === "unknown")) expect(w.start.latest).toBe("2026-12-31");
    const far = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 100 }).matches.find((x) => x.id === "desc-6808-v__gpc-20065")!;
    expect(formatSpan(far.timeDetail.possibleOverlap!, far.timeDetail.precision)).toBe("2025–2028");
  });

  it("briefs cite the budget cell that starts a window and never repeat a title as its anchor", () => {
    const m = runMatching(SNAPSHOT, { now: "t", thresholdMiles: 100 }).matches.find((x) => x.id === "desc-6854-c__gpc-21116")!;
    const b = buildBrief(m);
    const time = b.rows.find((r) => r.label === "Why flagged")!.text.split("\n")[1];
    const nums = time.match(/\[([\d, ]+)\]$/)![1].split(", ").map(Number);
    expect(nums.map((n) => b.citations[n - 1].excerpt)).toContain("2027 $3,000,000");
    expect(nums.map((n) => b.citations[n - 1].excerpt)).not.toContain("Previous 2026 $3,760 $0");
    for (const x of run.matches.slice(0, 40))
      for (const c of buildBrief(x).citations) if (c.anchor && !/^(PDF )?p\. /.test(c.anchor)) expect(c.title.toLowerCase()).not.toContain(c.anchor.toLowerCase());
    const gf = buildBrief(pair("grid-forward-atc", "transource-beci")!);
    expect(gf.citations.find((c) => c.title.startsWith("Transource and BHE Transmission"))!.anchor).toBeUndefined();
  });

  it("GET /api/matches/:id returns every excerpt the pair and its projects cite", async () => {
    const { GET } = await import("@/app/api/matches/[id]/route");
    const res = await GET(new Request("http://x/api/matches/dpc-alma-blair__xcel-wwtc"), { params: Promise.resolve({ id: "dpc-alma-blair__xcel-wwtc" }) });
    const body = (await res.json()) as { match: unknown; projects: unknown[]; evidence: Record<string, unknown>; sources: { id: string }[] };
    const ids = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          if (/evidenceids$/i.test(k) && Array.isArray(x)) x.forEach((id) => ids.add(id));
          else walk(x);
        }
    };
    walk([body.match, body.projects]);
    expect(ids.size).toBeGreaterThan(100);
    for (const id of ids) expect(body.evidence[id], id).toBeDefined();
    const srcs = new Set(body.sources.map((s) => s.id));
    for (const e of Object.values(body.evidence) as { sourceId: string }[]) expect(srcs.has(e.sourceId)).toBe(true);
  });
});

/* ---------------- published schedules, beyond-radius ranking, SERTP 2026 / SC PSC / permit data ---------------- */

describe("published schedules (start → in-service) as a TIME basis", () => {
  const sched = (s: string, e: DateBound): ConstructionWindow => ({
    id: `s-${s}`,
    claimSourceId: "src",
    phase: "scheduled",
    start: { earliest: s, latest: s, precision: "day" },
    end: e,
    continuous: true,
    evidenceIds: ["ev1"],
  });
  const day = (iso: string): DateBound => ({ earliest: iso, latest: iso, precision: "day" });
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
  const at = (id: string, owner: string, ws: ConstructionWindow[]) => project(id, owner, { places: [place(`${id} site`, BLAIR[0], BLAIR[1])], constructionWindows: ws });

  it("confirms TIME when published schedules certainly overlap for 30+ days, and says field work is undated", () => {
    const a = at("a", "u1", [bounds("2025-06-01", "2028-12-31"), sched("2025-06-01", yr(2028))]);
    const b = at("b", "u2", [bounds("2023-01-01", "2026-12-01"), sched("2023-12-31", day("2026-12-01"))]);
    const t = evaluateTime(a, b);
    expect([t.level, t.detail.basis, t.detail.confirmedOverlap]).toEqual(["confirmed", "schedule", { start: "2025-06-01", end: "2026-12-01" }]);
    expect(t.detail.schedule).toMatchObject({ days: 548, confirmed: true });
    expect(t.reason).toMatch(/^Published schedules overlap \(start → in-service\) for 18 months \(Jun 2025–Dec 2026\); field-work dates are not published\./);
    expect(t.reason).not.toMatch(/construction/i);
    const m = evaluatePair(a, b, snapshot([a, b]))!;
    expect([m.badge, m.time]).toEqual(["BOTH", "confirmed"]);
    expect(m.priorityReasons).toContain("Published schedules overlap (start → in-service)");
    expect(whyFlagged(m)).toContain("published schedules (start → in-service) that overlap; field-work dates are not published");
    // schedules are never construction windows: not shown as windows, not in conflicts, not counted as combinations
    expect(activeWindows(a).map((w) => w.phase)).toEqual(["unknown"]);
    expect(t.detail.combinations).toBe(1);
  });

  it("a sliver of certain overlap (Dec 31 → Jan 1) stays possible", () => {
    const a = at("a", "u1", [bounds("2025-06-01", "2028-12-31"), sched("2025-06-01", yr(2028))]);
    const b = at("b", "u2", [win(2028, 2028, { continuous: false }), { ...sched("2027-06-01", day("2028-12-31")), start: yr(2027) }]);
    const t = evaluateTime(a, b);
    expect([t.level, t.detail.basis, t.detail.schedule?.confirmed, t.detail.schedule?.days]).toEqual(["possible", undefined, false, 1]);
  });

  it("never overrides a construction no-match, and keeps a construction confirmation as the more specific basis", () => {
    const a = at("a", "u1", [win(2026, 2027), sched("2024-01-01", yr(2030))]);
    const b = at("b", "u2", [win(2029, 2030), sched("2024-01-01", yr(2030))]);
    expect(evaluateTime(a, b).level).toBe("no-match");
    const c = at("c", "u3", [win(2026, 2027), sched("2024-01-01", yr(2030))]);
    const t = evaluateTime(a, c);
    expect([t.level, t.detail.basis]).toEqual(["confirmed", "construction"]);
    expect(t.reason).toMatch(/^Reported construction windows overlap/);
  });

  it("Savannah River: 9 of the top 12 pairs have overlapping published schedules; the 1-day slivers stay possible", () => {
    const run = runMatching(SNAPSHOT, { now: "t" });
    const pair = (x: string, y: string) => run.matches.find((m) => m.id === [x, y].sort().join("__"))!;
    const two = pair("desc-06367-d-g", "gpc-20065");
    expect([two.badge, two.timeDetail.basis, two.timeDetail.confirmedOverlap]).toEqual(["BOTH", "schedule", { start: "2025-06-01", end: "2026-12-01" }]);
    expect(two.timeReason).toContain("for 18 months (Jun 2025–Dec 2026)");
    for (const [x, y] of [["desc-6888", "gpc-20065"], ["desc-6888", "gpc-20989"], ["desc-6810-o", "gpc-21116"]]) {
      const m = pair(x, y);
      expect([m.id, m.time, m.timeDetail.schedule?.confirmed]).toEqual([m.id, "possible", false]);
    }
    // the top lead keeps its rank; schedule evidence (the plan's own definition of its Start Date) is cited
    expect(run.matches[0].id).toBe("desc-6888__gpc-20065");
    expect(two.evidenceIds.map((id) => SNAPSHOT.evidence[id].exactExcerpt).join(" ")).toContain("2) schedule for implementation (start date)");
    // a DESC schedule starts from spending, never from an in-service date alone
    for (const p of SNAPSHOT.projects.filter((p) => p.owners.some((o) => o.utilityId === "desc")))
      for (const w of scheduleWindows(p)) expect(w.evidenceIds.map((id) => SNAPSHOT.evidence[id].exactExcerpt).some((x) => /Previous|\$\d/.test(x))).toBe(true);
  });
});

describe("distinct facilities and the sponsor's 25-mile rule", () => {
  it("distinct named facilities within 0.6 mi are measured, not equated; same names still share a site", () => {
    const mc = (label: string, lat: number, lon: number) => place(label, lat, lon, { role: "endpoint", uncertaintyMeters: 400 });
    const a = project("a", "u1", { places: [mc("McIntosh", 32.35212, -81.17511)] });
    const west = project("b", "u2", { places: [mc("West McIntosh", 32.35437, -81.18245)] });
    const same = project("c", "u3", { places: [mc("McIntosh Substation", 32.3525, -81.1755)] });
    expect(facilityWords("West McIntosh")).not.toBe(facilityWords("McIntosh"));
    expect(evaluateGeo(a, west, []).detail.method).toBe("measured");
    expect(evaluateGeo(a, same, []).detail.method).toBe("shared-endpoint");
    // Jasper (DESC) and Purrysburg (Santee Cooper) are 0.57 mi apart: the sponsor's OVL_2 pair is measured (4.2 mi)
    const run = runMatching(SNAPSHOT, { now: "t" });
    const ovl2 = run.matches.find((m) => m.id === "desc-06367-d-g__gpc-20277")!;
    expect([ovl2.geoDetail.method, ovl2.geoDetail.center!.miles.toFixed(1)]).toEqual(["measured", "4.2"]);
  });

  it("a shared facility beyond the radius ranks after every within-radius needs-review pair and says why", () => {
    const pscSrc = { id: "psc", publisher: "Fixture PSC", title: "", url: "", sourceType: "regulator" as const, retrievedAt: "", sha256: "", mimeType: "" };
    const far1 = project("far1", "u1", { places: [place("West end", 44.3, -92.3)], constructionWindows: [win(2026, 2027)] });
    const far2 = project("far2", "u2", { places: [place("East end", 44.3, -91.3)], constructionWindows: [win(2026, 2027)] });
    const n1 = project("n1", "u3", { places: [place("Blair", BLAIR[0], BLAIR[1])] });
    const n2 = project("n2", "u4", { places: [place("Arcadia", ARCADIA[0], ARCADIA[1])] });
    const rel: Relation = { id: "r", projectA: "far1", projectB: "far2", kind: "shared-site", siteLabel: "Midpoint Substation", basis: "stated", description: "", evidenceIds: ["evp"] };
    const snap = snapshot([far1, far2, n1, n2], [rel]);
    snap.sources.push(pscSrc);
    snap.evidence.evp = { ...snap.evidence.ev1, id: "evp", sourceId: "psc" };
    const run = runMatching(snap, { now: "t" });
    const far = run.matches.find((m) => m.id === "far1__far2")!;
    const near = run.matches.find((m) => m.id === "n1__n2")!;
    expect(far.beyondRadius).toBe(true);
    expect(far.geoReason).toMatch(/^Beyond the 25 mi radius \(centers ≈\d+ mi apart\); flagged because Fixture PSC states a shared facility \(Midpoint Substation\)\.$/);
    expect(far.priority).toBeLessThan(near.priority);
    expect(run.matches.indexOf(far)).toBeGreaterThan(run.matches.indexOf(near));
    expect(far.priorityReasons).toContain("Outside the 25 mi rule: ranked after every within-radius needs-review pair");
    // on the snapshot: Dairyland × Xcel at Tremval North stays known coordination, below every Savannah needs-review pair
    const snapRun = runMatching(SNAPSHOT, { now: "t" });
    const ab = snapRun.matches.find((m) => m.id === "dpc-alma-blair__xcel-wwtc")!;
    expect(ab.reviewStatus).toBe("known-coordination");
    expect(ab.geoReason).toMatch(/^Beyond the 25 mi radius \(centers ≈37 mi apart\); flagged because Public Service Commission of Wisconsin states a shared facility/);
    const floor = Math.min(...snapRun.matches.filter((m) => m.reviewStatus === "needs-review" && !m.beyondRadius).map((m) => m.priority));
    for (const m of snapRun.matches.filter((x) => x.beyondRadius)) expect(m.priority).toBeLessThan(floor);
  });

  it("past-due projects stay visible: the sponsor's OVL_2 pair is in the queue, flagged, below comparable current leads", () => {
    const run = runMatching(SNAPSHOT, { now: "t" });
    const ovl2 = run.matches.find((m) => m.id === "desc-06367-d-g__gpc-20277")!;
    expect(ovl2.reviewStatus).toBe("needs-review");
    expect(ovl2.pastDue).toEqual([expect.objectContaining({ projectId: "gpc-20277", detail: expect.stringMatching(/Jun 1, 2026\) has passed; completion not confirmed/) })]);
    expect(ovl2.time).toBe("possible");
    expect(ovl2.timeDetail.inService!.gapDays).toBe(183);
    expect(run.pastDueProjects.map((x) => x.projectId)).toContain("gpc-20277");
    expect(run.excludedProjects.every((x) => x.reason !== "past-in-service")).toBe(true);
  });
});

describe("newest sources: SERTP 2026, SC PSC Docket 2023-115-E, Georgia EPD permits", () => {
  const proj = (id: string) => SNAPSHOT.projects.find((p) => p.id === id)!;
  const quotes = (ids: string[]) => ids.map((id) => SNAPSHOT.evidence[id].exactExcerpt);

  it("adds the five Savannah-area projects first listed in SERTP 2026, with the SOCO owner caveat and West McIntosh kept distinct", () => {
    const ids = ["sertp26-mcintosh-relays", "sertp26-west-mcintosh-breakers", "sertp26-calvert-west-mcintosh", "sertp26-west-mcintosh-autobank", "sertp26-meldrim-auto"];
    for (const id of ids) {
      const p = proj(id);
      expect(p.caveats[0]).toMatch(/lists this project under 'SOCO'.*does not name the owning company\. Georgia Power is inferred/);
      expect(currentInService(p).claimSourceId).toBe("sertp-2026-prelim-plan");
      expect(p.constructionWindows).toEqual([]);
    }
    const west = proj("sertp26-west-mcintosh-breakers").places[0];
    expect([west.label, west.id]).toEqual(["West McIntosh", "sertp26-west-mcintosh-breakers-ep1"]);
    expect(proj("sertp26-west-mcintosh-breakers").caveats.join(" ")).toMatch(/0\.46 mi from McIntosh/);
    const run = runMatching(SNAPSHOT, { now: "t" });
    expect(run.matches.find((m) => m.id === "desc-6888__sertp26-mcintosh-relays")!.geoDetail.method).toBe("shared-endpoint");
    expect(run.matches.find((m) => m.id === "desc-6888__sertp26-west-mcintosh-breakers")!.geoDetail.method).toBe("measured");
  });

  it("preserves the 21116 owner and 20065 conductor disagreements with an excerpt on every side", () => {
    const owner = proj("gpc-21116").disagreements!.find((d) => d.field === "owner")!;
    expect(owner.sides.map((s) => s.sourceIds)).toEqual([["gpc-irp-2025-vol3"], ["sertp-2026-prelim-plan"]]);
    expect(quotes(owner.sides[1].evidenceIds).join(" ")).toContain("MEAG: Build a new 230 kV line between the switching station and Goshen");
    expect(proj("gpc-21116").owners.map((o) => o.utilityId)).toEqual(["gpc"]);
    const scope = proj("gpc-20065").disagreements!.find((d) => d.field === "scope")!;
    expect(scope.sides.map((s) => s.value)).toEqual(["100C 795 ACSR Drake", "200°C 1351 ACSS"]);
    for (const d of [owner, scope]) for (const s of d.sides) expect(s.evidenceIds.every((id) => SNAPSHOT.evidence[id].verifiedInSource)).toBe(true);
  });

  it("records the newest-source check as a cited context note (DESC is not yet in a SERTP plan)", () => {
    const n = SNAPSHOT.contextNotes!.find((x) => x.id === "newest-source-check-desc")!;
    expect(n.text).toMatch(/search result/);
    expect(quotes(n.evidenceIds)).toContain("SUMTER - DESC EASTOVER 115 KV TRANSMISSION LINE");
    expect(SNAPSHOT.sources.some((s) => s.id === "sertp-2026-prelim-plan" && s.publishedAt === "2026-06-12")).toBe(true);
  });

  it("SC PSC Docket 2023-115-E: Dec 1, 2026 is current, earlier commercial-operation dates are history, ROW widths are cited", () => {
    for (const id of ["desc-06367-d-g", "desc-6367-d"]) {
      const p = proj(id);
      const psc = p.completionClaims.filter((c) => c.claimSourceId.startsWith("scpsc-"));
      expect(psc.map((c) => [c.date.earliest, c.current !== false])).toEqual([
        ["2026-12-01", true],
        ["2026-05-31", false],
        ["2025-05-31", false],
      ]);
      expect(currentInService(p).date.earliest).toBe("2026-12-01");
      expect(p.caveats.join(" ")).toMatch(/Coastal Zone Consistency Certification was still pending/);
    }
    const width = (id: string) => proj(id).facts.find((f) => f.key === "rowWidthFt")!;
    expect([width("desc-06367-d-g").value, width("desc-6367-d").value]).toEqual(["100 ft", "150 ft"]);
    expect(quotes(width("desc-6367-d").evidenceIds)[0]).toMatch(/WIDTH OF RIGHT-OF-WAY: 150 FEET$/);
    // the Riverport / Sherwood identity is an inference, never a merge
    expect(proj("desc-6367-d").caveats.join(" ")).toMatch(/^.*Inference, not stated by one source.*not merged/);
    expect(proj("desc-6367-d").completionClaims.some((c) => c.claimSourceId === "desc-scrtp-2025-2029")).toBe(false);
    // the Dominion page's start carries the pending-permit caveat
    const page = proj("desc-06367-d-g").constructionWindows.find((w) => w.claimSourceId === "desc-jasper-okatie-sherwood-page")!;
    expect(page.note).toMatch(/Coastal Zone Consistency Certification was still pending/);
    // version history reads oldest document first
    const c = projectConflicts(proj("desc-6367-d"), (id) => SNAPSHOT.sources.find((s) => s.id === id)!.publisher, undefined, (id) => SNAPSHOT.sources.find((s) => s.id === id)?.publishedAt);
    expect(c[0].description).toMatch(/Order No\. 2023-649 of Sep 2023: May 31, 2025 → SC PSC letter of May 2024: May 31, 2026 → .*Dec 1, 2026$/);
  });

  it("Georgia EPD's permit window keeps Big Ogeechee (19966) current: the line is under construction until 06/30/2027", () => {
    const p = proj("gpc-19966");
    const w = p.constructionWindows.find((x) => x.claimSourceId === "ga-epd-noi-big-ogeechee-little-ogeechee")!;
    expect([w.start.earliest, w.end.latest, w.phase, w.continuous]).toEqual(["2026-01-19", "2027-06-30", "general-construction", true]);
    expect(w.note).toMatch(/permit-coverage dates, not a crew schedule.*inference/);
    expect(pastDue(p, SNAPSHOT.snapshotDate)).toBeNull();
    expect(runMatching(SNAPSHOT, { now: "t" }).pastDueProjects.some((x) => x.projectId === "gpc-19966")).toBe(false);
  });
});
