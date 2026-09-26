import { describe, expect, it } from "vitest";
import { SNAPSHOT } from "@/lib/data";
import type { Project } from "@/lib/domain/types";
import { runMatching } from "@/lib/matching/engine";
import {
  arcLegs,
  build3DState,
  hotspotsOf,
  metersBetween,
  overviewArcHeight,
  placeTreatment,
  sharedSiteOf,
  structureKind,
  structureScale,
  towerStep,
  voltageClass,
  type Map3DInput,
} from "@/lib/map3d";

const run = runMatching(SNAPSHOT, { thresholdMiles: 25, now: "t", listExclusions: false });
const project = (id: string): Project => SNAPSHOT.projects.find((p) => p.id === id)!;
const input = (over: Partial<Map3DInput> = {}): Map3DInput => ({
  run,
  region: "southeast",
  selectedMatchId: null,
  hoveredMatchId: null,
  focusProjectIds: null,
  mapMode: "3d",
  basemap: "night",
  reducedMotion: false,
  revealNonce: 0,
  running: false,
  ...over,
});
const MI = 1609.344;

describe("structure kind and voltage class", () => {
  it("derives the kind from the work kind: the #1 lead's series reactor is substation work, its partner a line", () => {
    expect(structureKind(project("desc-6888"))).toBe("substation");
    expect(structureKind(project("gpc-20065"))).toBe("line");
  });

  it("maps published voltages onto the four height classes, unknown → pylon class", () => {
    expect(voltageClass(46)).toBe("v1");
    expect(voltageClass(115)).toBe("v1");
    expect(voltageClass(161)).toBe("v2");
    expect(voltageClass(230)).toBe("v2");
    expect(voltageClass(345)).toBe("v3");
    expect(voltageClass(500)).toBe("v4");
    expect(voltageClass(765)).toBe("v4");
    expect(voltageClass(null)).toBe("u");
  });

  it("keeps structures a constant on-screen size (scale halves per zoom level) and grows height with voltage", () => {
    expect(structureScale("v2", 10)[2] / structureScale("v2", 11)[2]).toBeCloseTo(2);
    expect(structureScale("v4", 10)[2] / structureScale("v2", 10)[2]).toBeCloseTo(1.6);
    expect(towerStep(8.5)).toBeGreaterThan(towerStep(12));
  });
});

describe("honest placement (measured pair desc-6888__gpc-20065)", () => {
  const s = build3DState(input({ selectedMatchId: "desc-6888__gpc-20065" }));
  const pairStructures = s.structures.filter((x) => x.projectId === "desc-6888" || x.projectId === "gpc-20065");
  const placeIds = pairStructures.map((x) => x.placeId);

  it("puts crisp structures only on named facilities, never on the locality or the context terminal", () => {
    expect(placeIds).toEqual(expect.arrayContaining(["desc-6888-ep1", "desc-6888-ep2", "gpc-20065-ep1", "gpc-20065-ep2"]));
    expect(placeIds).not.toContain("desc-6888-ep3"); // Deerfield: locality, lower confidence
    expect(placeIds).not.toContain("gpc-20065-ctx1"); // the McIntosh line terminal is context
    for (const st of s.structures) {
      if (!st.placeId) continue;
      const pl = project(st.projectId).places.find((p) => p.id === st.placeId)!;
      expect(["named-facility", "official-gis"]).toContain(pl.precision);
      expect(pl.confidence).not.toBe("lower-confidence");
      expect(pl.role).not.toBe("context");
    }
  });

  it("draws the locality as an uncertainty disc of its stated radius", () => {
    const disc = s.discs.find((d) => d.placeId === "desc-6888-ep3");
    expect(disc?.radiusMeters).toBe(5000);
    expect(placeTreatment(project("desc-6888").places.find((p) => p.id === "desc-6888-ep3")!)).toBe("disc");
  });

  it("gives the route-less line one ghost chord between its two terminals, and the substation work none", () => {
    expect(s.chords.map((c) => c.projectId)).toEqual(["gpc-20065"]);
    const [goshen, gp] = ["gpc-20065-ep1", "gpc-20065-ep2"].map((id) => project("gpc-20065").places.find((p) => p.id === id)!);
    expect(s.chords[0].a).toEqual([goshen.lon, goshen.lat]);
    expect(s.chords[0].b).toEqual([gp.lon, gp.lat]);
  });

  it("says so on the chord: route not published, drawn terminal to terminal", () => {
    const label = s.labels.find((l) => l.kind === "chord");
    expect(label?.text).toBe("route not published\ndrawn terminal to terminal");
    expect(label?.hue).toBe("#a78bfa");
  });

  it("raises no towers or wires in the Southeast (it has no official-GIS route)", () => {
    expect(s.routes).toHaveLength(0);
  });

  it("draws one center-to-center arc and a review ring around A's center that B sits inside", () => {
    const m = run.matches.find((x) => x.id === "desc-6888__gpc-20065")!;
    expect(s.selected?.basis).toBe("measured");
    expect(s.selected?.arcs).toHaveLength(1);
    expect(s.selected?.arcs[0].a).toEqual(m.geoDetail.center!.a);
    expect(s.selected?.arcs[0].b).toEqual(m.geoDetail.center!.b);
    expect(s.selected?.inside).toBe(true);
    expect(metersBetween(s.selected!.a, s.selected!.b)).toBeLessThan(25 * MI);
    const chord = metersBetween(m.geoDetail.center!.a, m.geoDetail.center!.b);
    expect(s.selected?.arcs[0].h).toBeCloseTo(Math.min(6000, Math.max(600, 0.2 * chord)));
    expect(s.labels.find((l) => l.kind === "ring")?.text).toBe("25 mi from Okatie – McIntosh 115kV Tie");
    expect(s.labels.some((l) => l.kind === "beyond")).toBe(false);
  });

  it("hides the pair's spires (its structures show at every zoom) and dims everyone else", () => {
    expect(s.spires.filter((x) => x.selected).every((x) => x.projectId === "desc-6888" || x.projectId === "gpc-20065")).toBe(true);
    expect(s.structures.filter((x) => !x.selected).every((x) => x.opacity < 0.9)).toBe(true);
  });
});

describe("shared-site pair dpc-alma-blair__xcel-wwtc (Upper Midwest showcase)", () => {
  const s = build3DState(input({ region: "upper-midwest", selectedMatchId: "dpc-alma-blair__xcel-wwtc" }));
  const m = run.matches.find((x) => x.id === "dpc-alma-blair__xcel-wwtc")!;

  it("draws two arcs, one from each center to the shared site, never a bare center-to-center link", () => {
    const site = sharedSiteOf(m)!;
    expect(site.label).toMatch(/Tremval North/);
    expect(s.selected?.basis).toBe("shared-site");
    expect(s.selected?.arcs).toHaveLength(2);
    for (const arc of s.selected!.arcs) expect(arc.b).toEqual(site.lonlat);
    expect(s.selected?.arcs.map((a) => a.a)).toEqual([m.geoDetail.center!.a, m.geoDetail.center!.b]);
  });

  it("keeps the ring on A's center with B outside, and says why the pair is flagged anyway", () => {
    expect(s.selected?.inside).toBe(false);
    expect(s.labels.find((l) => l.kind === "beyond")?.text).toBe("Beyond 25 mi · shared site");
  });

  it("raises towers and wires only along the two official-GIS routes", () => {
    expect(s.routes.map((r) => r.projectId).sort()).toEqual(["dpc-alma-blair", "xcel-wwtc"]);
    for (const r of s.routes) {
      expect(project(r.projectId).route?.precision).toBe("official-gis");
      expect(r.towers.length).toBeGreaterThan(40);
      for (let i = 1; i < r.towers.length - 1; i++) expect(metersBetween(r.towers[i - 1].lonlat, r.towers[i].lonlat)).toBeLessThan(420);
    }
  });

  it("marks the shared site with the amber beacon", () => {
    const beacon = s.structures.find((x) => x.model === "beacon");
    expect(beacon?.lonlat).toEqual(sharedSiteOf(m)!.lonlat);
  });
});

describe("overview", () => {
  it("pre-run: spires stand on facility places only, no arcs, no hotspots", () => {
    const s = build3DState(input({ run: null }));
    expect(s.arcs).toHaveLength(0);
    expect(s.hotspots).toHaveLength(0);
    expect(s.spires.length).toBeGreaterThan(100);
    // the county-only project has no 3D presence at all
    expect(s.spires.some((x) => x.projectId === "gpc-effingham-500")).toBe(false);
    expect(s.structures.some((x) => x.projectId === "gpc-effingham-500")).toBe(false);
  });

  it("post-run: one raised arc per flagged pair with centers, ranked in engine order, possible places at half", () => {
    const s = build3DState(input());
    const regional = run.matches.filter((m) => project(m.projectAId).region === "southeast" && m.geoDetail.center);
    expect(s.arcs.length).toBeGreaterThan(0);
    expect(s.arcs.length).toBeLessThanOrEqual(regional.length);
    expect(s.arcs.map((a) => a.rank)).toEqual(s.arcs.map((_, i) => i + 1));
    const order = regional.map((m) => m.id).filter((id) => s.arcs.some((a) => a.id === id));
    expect(s.arcs.map((a) => a.id)).toEqual(order);
    const possible = s.arcs.find((a) => run.matches.find((m) => m.id === a.id)!.geo !== "confirmed");
    if (possible) expect(possible.possible).toBe(true);
    for (const a of s.arcs.filter((x) => !x.via)) expect(a.h).toBeCloseTo(overviewArcHeight(metersBetween(a.a, a.b)));
  });

  it("post-run: dims unflagged structures and shows the first tab's top-3 rank chips", () => {
    const s = build3DState(input());
    for (const st of s.structures) expect(st.opacity).toBe(s.flaggedProjectIds.has(st.projectId) ? 1 : 0.35);
    expect(s.labels.filter((l) => l.kind === "rank").map((l) => l.text)).toEqual(["01", "02", "03"]);
  });

  it("post-run: measured pairs arc center to center; shared-site pairs arc through the shared site", () => {
    const s = build3DState(input({ region: "upper-midwest" }));
    const shared = run.matches.find((m) => m.id === "dpc-alma-blair__xcel-wwtc")!;
    const arc = s.arcs.find((a) => a.id === shared.id)!;
    expect(arc.via).toEqual(sharedSiteOf(shared)!.lonlat);
    expect(arcLegs(arc)).toHaveLength(2);
    const se = build3DState(input());
    const measured = se.arcs.find((a) => a.id === "desc-6888__gpc-20065")!;
    expect(measured.via).toBeUndefined();
    expect(arcLegs(measured)).toEqual([[measured.a, measured.b]]);
  });

  it("clusters flagged-pair midpoints into ~12-mile hotspots", () => {
    const pts = [
      { id: "a", mid: [-81, 32] as [number, number] },
      { id: "b", mid: [-81.05, 32.02] as [number, number] },
      { id: "c", mid: [-81.02, 31.98] as [number, number] },
      { id: "d", mid: [-84, 34] as [number, number] },
    ];
    const hs = hotspotsOf(pts);
    expect(hs).toHaveLength(1);
    expect(hs[0].pairIds.sort()).toEqual(["a", "b", "c"]);
    expect(hs[0].radiusMeters).toBeGreaterThanOrEqual(4 * MI);
  });
});
