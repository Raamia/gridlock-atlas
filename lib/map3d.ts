import type { Map as MapboxMap } from "mapbox-gl";
import circle from "@turf/circle";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import { SNAPSHOT } from "@/lib/data";
import type { Match, MatchRun, Place, Project, ReviewStatus } from "@/lib/domain/types";
import { workKind, voltageOf } from "@/lib/impact";
import { centerOf } from "@/lib/matching/geo";
import { REVIEW_TABS, inRegion, rankLabel, rankOf } from "@/lib/rank";
import { MODEL_HEIGHTS, towerConductorHeights } from "@/lib/models/structures";

/**
 * 3D map scene (SPEC §6). Owner: map-3d, which owns every `gl3d-*` layer and source; map-core (MapStage) calls
 * install3D on every `style.load` and update3D whenever the input changes.
 *
 * Everything here is presentation only and symbolic:
 * - Spires (region zoom) and structures (from z8) sit only where the snapshot has a named facility or an official-GIS
 *   place; locality / lower-confidence places get a translucent uncertainty disc; county-level places get nothing.
 * - Structure height encodes the published voltage class (unknown voltage → a neutral marker pylon).
 * - Towers with raised wires appear only along official-GIS routes. A line with no published route is a ghosted ground
 *   chord between its two center-defining terminals, labelled "route not published · drawn terminal to terminal".
 * - Flagged pairs are raised arcs center → center (or center → shared site): obviously not routes.
 *
 * Every map call is guarded (getLayer / getSource + try/catch) and nothing runs until install3D ran for the current
 * style, so a style swap can never raise "layer does not exist" errors into MapStage's basemap-failure handler.
 */

export type Map3DInput = {
  run: MatchRun | null;
  region: string;
  selectedMatchId: string | null;
  hoveredMatchId: string | null;
  focusProjectIds: string[] | null;
  mapMode: "3d" | "flat";
  basemap: "night" | "satellite" | "offline";
  reducedMotion: boolean;
  revealNonce: number;
  running: boolean;
};

export const MAP3D_LAYER_PREFIX = "gl3d-";

// ---------------------------------------------------------------------------------------------------------------
// palette (map paint: the only place raw hex is allowed; mirrors the tokens in app/globals.css)

const HUE = { a: "#4cc9f0", b: "#a78bfa", other: "#8b95a7", overlap: "#f5b83d", fg1: "#f3f5f9", canvas: "#05080e" } as const;

/** Each region's two focal utilities take the A / B hues in overview (same rule as the 2D map and the header legend). */
const FOCAL: Record<string, [string, string]> = {
  southeast: ["desc", "gpc"],
  "upper-midwest": ["dairyland", "xcel-nspw"],
  "southern-plains": ["xcel-sps", "transource-ok"],
};

// ---------------------------------------------------------------------------------------------------------------
// derivations (pure)

export type StructureKind = "line" | "substation";
/** Voltage class → structure height multiplier (SPEC §6.2). "u" = unknown voltage (marker pylon). */
export type VoltageClass = "v1" | "v2" | "v3" | "v4" | "u";
export type ModelKey = "tower" | "substation" | "pylon" | "beacon";

export const VOLTAGE_FACTOR: Record<VoltageClass, number> = { v1: 0.8, v2: 1, v3: 1.3, v4: 1.6, u: 1 };

/** Deterministic structure kind from lib/impact's work kind: line-* → line, substation-* → substation. */
export function structureKind(p: Project): StructureKind {
  return workKind(p).startsWith("substation") ? "substation" : "line";
}

/** ≤115 kV (anything below 161) ×0.8 · 161–230 ×1.0 · 345 ×1.3 · 500–765 ×1.6 · unknown → pylon. */
export function voltageClass(kv: number | null | undefined): VoltageClass {
  if (!kv || !Number.isFinite(kv)) return "u";
  if (kv < 161) return "v1";
  if (kv <= 230) return "v2";
  if (kv < 500) return "v3";
  return "v4";
}

const FACILITY_WORDS = /substation|switching|switchyard|station|terminal/i;

/** How a place is drawn in 3D. Honest placement: crisp models only on named facilities and official-GIS places. */
export function placeTreatment(pl: Place): "model" | "disc" | "none" {
  if (pl.precision === "county" || pl.precision === "unknown") return "none";
  if (pl.role === "context") return "none"; // named, but not where the work is (2D hollow marker only)
  if (pl.precision === "locality" || pl.confidence === "lower-confidence") return "disc";
  if (pl.precision !== "named-facility" && pl.precision !== "official-gis") return "none";
  const facility = pl.kind === "substation" || pl.kind === "switching-station" || FACILITY_WORDS.test(pl.label);
  return facility ? "model" : "none";
}

// ---------------------------------------------------------------------------------------------------------------
// geometry helpers

type LonLat = [number, number];
const R_EARTH = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function metersBetween(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearingDeg(a: LonLat, b: LonLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function destination(a: LonLat, meters: number, bearing: number): LonLat {
  const d = meters / R_EARTH;
  const th = rad(bearing);
  const lat1 = rad(a[1]);
  const lon1 = rad(a[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(th));
  const lon2 = lon1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lon2), deg(lat2)];
}

/** Straight lon/lat interpolation, `n` segments (densified so line-z-offset evaluates smoothly along the arc). */
function densify(a: LonLat, b: LonLat, n: number): LonLat[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as LonLat);
}

const MI = 1609.344;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------------------------------------------
// level of detail: model scales (tuned by screenshot; see the report)

/**
 * Structures keep a constant on-screen size (exponential base-2 interpolation over zoom): `S10` is the uniform scale at
 * zoom 10 for a 1.0 voltage factor. Below z6.5 they stop growing (only the selected pair is shown there).
 */
const S10 = 20;
/**
 * Every structure model shares one scale curve; their relative sizes are baked into the map GLBs by
 * scripts/build-models.ts (substation without its pad and ×1.9 taller, pylon ×1.7), so one layer per voltage class
 * is enough. Mapbox-gl 3.31 ignores zoom in a model-scale that also reads feature data (tested: it sticks at the first
 * stop), so each voltage class gets its own layer with a zoom-only curve.
 */
export function structureScale(cls: VoltageClass, zoom: number): [number, number, number] {
  const s = S10 * Math.pow(2, 10 - Math.max(6.5, zoom)) * VOLTAGE_FACTOR[cls];
  return [s, s, s];
}

/** Spire stops for the 40 m spire (SPEC §6.2: z5 700 · z6 400 · z7 190 · z8 90), footprint ×0.4, height × voltage. */
const SPIRE_STOPS: [number, number][] = [
  [5, 700],
  [6, 400],
  [7, 190],
  [8, 90],
  [8.5, 64],
];
const SPIRE_FOOTPRINT = 0.75;
function spireScale(cls: VoltageClass, s: number): [number, number, number] {
  const f = cls === "u" ? 0.7 : VOLTAGE_FACTOR[cls];
  return [SPIRE_FOOTPRINT * s, SPIRE_FOOTPRINT * s, s * f];
}

/** Towers every TOWER_SPACING metres along official-GIS routes; thinned by zoom band. */
const TOWER_SPACING = 400;
export function towerStep(zoom: number): number {
  if (zoom < 9) return 10;
  if (zoom < 10) return 4;
  if (zoom < 11) return 2;
  return 1;
}

const TOWER_REACH = 7; // middle cross-arm half-span (model metres, default 14 m arm span)
const [, TOWER_CONDUCTOR] = towerConductorHeights(40);

// ---------------------------------------------------------------------------------------------------------------
// state

export interface Map3DSpire {
  projectId: string;
  lonlat: LonLat;
  hue: string;
  cls: VoltageClass;
  opacity: number;
  selected: boolean;
}

export interface Map3DStructure {
  id: string;
  projectId: string;
  placeId?: string;
  label: string;
  model: ModelKey;
  lonlat: LonLat;
  hue: string;
  cls: VoltageClass;
  opacity: number;
  /** Shown below the z8 cross-fade (the selected pair). */
  selected: boolean;
  /** Towers only: index along the route (for zoom thinning) and yaw in degrees. */
  towerIndex?: number;
  rotation?: number;
}

export interface Map3DRoute {
  projectId: string;
  hue: string;
  cls: VoltageClass;
  opacity: number;
  selected: boolean;
  /** Every candidate tower position (400 m apart) with the local route bearing. */
  towers: { lonlat: LonLat; bearing: number }[];
}

export interface Map3DDisc {
  projectId: string;
  placeId: string;
  lonlat: LonLat;
  radiusMeters: number;
  hue: string;
}

export interface Map3DChord {
  projectId: string;
  a: LonLat;
  b: LonLat;
  hue: string;
}

export interface Map3DArc {
  id: string;
  a: LonLat;
  b: LonLat;
  /** Draw-in order (1-based): engine priority order within the region among the arcs drawn. */
  rank: number;
  /** Apex height in metres. */
  h: number;
  /** Place signal only possible (B1): drawn at 50% opacity. */
  possible: boolean;
  hovered: boolean;
  /** Opacity multiplier: 1, or dimmed while another pair is hovered / selected / out of focus. */
  dim: number;
}

export interface Map3DSelected {
  id: string;
  a: LonLat;
  b: LonLat;
  basis: "measured" | "shared-site" | "shared-endpoint";
  site?: LonLat;
  siteLabel?: string;
  siteStated?: boolean;
  miles: number;
  radiusMiles: number;
  aShort: string;
  bShort: string;
  /** B's center lies within the review radius of A's center. */
  inside: boolean;
  arcs: { a: LonLat; b: LonLat; h: number; possible: boolean }[];
}

export interface Map3DHotspot {
  center: LonLat;
  radiusMeters: number;
  count: number;
  pairIds: string[];
}

export interface Map3DLabel {
  lonlat: LonLat;
  text: string;
  kind: "ring" | "beyond" | "rank" | "hotspot";
  /** Elevation of the label in metres (rank chips sit at their arc's apex). */
  z: number;
  /** Rank chips that would overlap an earlier chip stack upward (0 = no shift). */
  stack?: number;
}

export interface Map3DState {
  mode: "3d" | "flat";
  spires: Map3DSpire[];
  structures: Map3DStructure[];
  routes: Map3DRoute[];
  discs: Map3DDisc[];
  chords: Map3DChord[];
  arcs: Map3DArc[];
  selected: Map3DSelected | null;
  hotspots: Map3DHotspot[];
  labels: Map3DLabel[];
  flaggedProjectIds: Set<string>;
  /** Centroid of the region's projects (the sweep origin) and the sweep radius. */
  sweep: { center: LonLat; radiusMeters: number } | null;
}

const PROJECTS = new Map(SNAPSHOT.projects.map((p) => [p.id, p]));

function ownerIds(p: Project): string[] {
  return p.owners.map((o) => o.utilityId);
}

function overviewHue(p: Project): string {
  const focal = FOCAL[p.region];
  if (!focal) return HUE.other;
  const owners = ownerIds(p);
  if (owners.includes(focal[0])) return HUE.a;
  if (owners.includes(focal[1])) return HUE.b;
  return HUE.other;
}

/** The shared site of a shared-site / shared-endpoint pair (same resolution as the 2D callouts). */
export function sharedSiteOf(m: Match): { label: string; lonlat: LonLat; stated: boolean } | null {
  const [a, b] = [PROJECTS.get(m.projectAId), PROJECTS.get(m.projectBId)];
  if (!a || !b) return null;
  if (m.geoDetail.method === "shared-endpoint" && m.geoDetail.sharedEndpoint) {
    const pl = a.places.find((x) => x.label === m.geoDetail.sharedEndpoint!.labelA);
    return pl ? { label: pl.label, lonlat: [pl.lon, pl.lat], stated: false } : null;
  }
  if (m.geoDetail.method !== "shared-site") return null;
  const rel = SNAPSHOT.relations.find((r) => m.geoDetail.relationIds.includes(r.id));
  if (!rel) return null;
  const places = [...a.places, ...b.places];
  const place =
    (rel.sitePlaceId && places.find((pl) => pl.id === rel.sitePlaceId)) ||
    places.find((pl) => rel.siteLabel && pl.label.toLowerCase().includes(rel.siteLabel.toLowerCase().split(" ")[0]));
  if (!place) return null;
  return { label: rel.siteLabel ?? place.label, lonlat: [place.lon, place.lat], stated: rel.basis !== "inferred" };
}

function selectedArcHeight(chordMeters: number): number {
  return clamp(0.2 * chordMeters, 600, 6000);
}

/** Greedy ~12-mi clusters of flagged-pair midpoints (engine priority order seeds the clusters). */
export function hotspotsOf(pairs: { id: string; mid: LonLat }[], minCount = 3): Map3DHotspot[] {
  const R = 12 * MI;
  const clusters: { center: LonLat; members: { id: string; mid: LonLat }[] }[] = [];
  for (const p of pairs) {
    const hit = clusters.find((c) => metersBetween(c.center, p.mid) <= R);
    if (hit) {
      hit.members.push(p);
      const n = hit.members.length;
      hit.center = [hit.members.reduce((s, x) => s + x.mid[0], 0) / n, hit.members.reduce((s, x) => s + x.mid[1], 0) / n];
    } else clusters.push({ center: p.mid, members: [p] });
  }
  return clusters
    .filter((c) => c.members.length >= minCount)
    .map((c) => ({
      center: c.center,
      radiusMeters: clamp(Math.max(...c.members.map((m) => metersBetween(c.center, m.mid))) + 1.5 * MI, 4 * MI, 14 * MI),
      count: c.members.length,
      pairIds: c.members.map((m) => m.id),
    }));
}

function routeTowers(coords: LonLat[]): { lonlat: LonLat; bearing: number }[] {
  const out: { lonlat: LonLat; bearing: number }[] = [];
  let carry = 0; // metres already walked past the last tower on the previous segment
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const len = metersBetween(a, b);
    if (len < 1) continue;
    const br = bearingDeg(a, b);
    let d = i === 0 ? 0 : TOWER_SPACING - carry;
    while (d <= len) {
      out.push({ lonlat: destination(a, d, br), bearing: br });
      d += TOWER_SPACING;
    }
    carry = len - (d - TOWER_SPACING);
  }
  const last = coords[coords.length - 1];
  if (out.length && metersBetween(out[out.length - 1].lonlat, last) > TOWER_SPACING * 0.4)
    out.push({ lonlat: last, bearing: coords.length > 1 ? bearingDeg(coords[coords.length - 2], last) : 0 });
  return out;
}

/** Pure derivation of everything the 3D scene draws (SPEC §6). Deterministic; safe to call on every input change. */
export function build3DState(input: Map3DInput): Map3DState {
  const { run, region } = input;
  const regionProjects = SNAPSHOT.projects.filter((p) => region === "all" || p.region === region);
  const excluded = new Set(run?.excludedProjects.map((x) => x.projectId) ?? []);
  const regionMatches = run ? run.matches.filter((m) => inRegion(m, region)) : [];
  const flagged = new Set(regionMatches.flatMap((m) => [m.projectAId, m.projectBId]));
  const selectedMatch = run && input.selectedMatchId ? run.matches.find((m) => m.id === input.selectedMatchId) ?? null : null;
  const hoveredMatch = !selectedMatch && run && input.hoveredMatchId ? run.matches.find((m) => m.id === input.hoveredMatchId) ?? null : null;
  const pairIds = selectedMatch ? [selectedMatch.projectAId, selectedMatch.projectBId] : null;
  const hoverIds = hoveredMatch ? [hoveredMatch.projectAId, hoveredMatch.projectBId] : null;
  const focus = input.focusProjectIds && input.focusProjectIds.length ? new Set(input.focusProjectIds) : null;

  const visible = regionProjects.filter((p) => !excluded.has(p.id) || pairIds?.includes(p.id));
  if (selectedMatch) for (const id of pairIds!) if (!visible.some((p) => p.id === id) && PROJECTS.get(id)) visible.push(PROJECTS.get(id)!);

  const hueOf = (p: Project): string => {
    if (selectedMatch) {
      if (p.id === selectedMatch.projectAId) return HUE.a;
      if (p.id === selectedMatch.projectBId) return HUE.b;
    }
    return overviewHue(p);
  };
  /** Base opacity: selection > focus > hover > post-run flagged/unflagged. */
  const opacityOf = (p: Project): number => {
    if (pairIds) return pairIds.includes(p.id) ? 1 : 0.22;
    if (focus) return focus.has(p.id) ? 1 : 0.25;
    if (run) return flagged.has(p.id) ? 1 : 0.35;
    return 0.92;
  };

  const spires: Map3DSpire[] = [];
  const structures: Map3DStructure[] = [];
  const routes: Map3DRoute[] = [];
  const discs: Map3DDisc[] = [];
  const chords: Map3DChord[] = [];
  const taken: LonLat[] = [];

  // selected pair first so its structures win de-duplication at shared facilities
  const ordered = [...visible].sort((x, y) => Number(!!pairIds?.includes(y.id)) - Number(!!pairIds?.includes(x.id)));
  for (const p of ordered) {
    const hue = hueOf(p);
    const opacity = opacityOf(p);
    const cls = voltageClass(voltageOf(p));
    const kind = structureKind(p);
    const isSel = !!pairIds?.includes(p.id);
    const center = centerOf(p);
    const places = [...p.places].sort((x, y) => Number(y.role === "endpoint") - Number(x.role === "endpoint"));
    for (const pl of places) {
      const t = placeTreatment(pl);
      if (t === "none") continue;
      const lonlat: LonLat = [pl.lon, pl.lat];
      if (t === "disc") {
        if (isSel || hoverIds?.includes(p.id))
          discs.push({ projectId: p.id, placeId: pl.id, lonlat, radiusMeters: Math.max(800, pl.uncertaintyMeters), hue });
        continue;
      }
      // one crisp structure per facility: places closer than 1.2 km collapse (selected pair first, endpoints first)
      if (taken.some((x) => metersBetween(x, lonlat) < 1200)) continue;
      taken.push(lonlat);
      structures.push({
        id: `${p.id}:${pl.id}`,
        projectId: p.id,
        placeId: pl.id,
        label: pl.label,
        model: cls === "u" ? "pylon" : "substation",
        lonlat,
        hue,
        cls,
        opacity,
        selected: isSel,
      });
    }
    if (p.route?.precision === "official-gis" && p.route.coordinates.length > 1) {
      routes.push({ projectId: p.id, hue, cls: cls === "u" ? "v2" : cls, opacity, selected: isSel, towers: routeTowers(p.route.coordinates as LonLat[]) });
    } else if (kind === "line" && !p.route && center && center.places.length === 2 && (isSel || hoverIds?.includes(p.id))) {
      const [x, y] = center.places;
      if (metersBetween([x.lon, x.lat], [y.lon, y.lat]) > 300) chords.push({ projectId: p.id, a: [x.lon, x.lat], b: [y.lon, y.lat], hue });
    }
  }

  // region-zoom spires stand exactly where the z8+ structures will be (same honest places), so the level of detail
  // cross-fades in place; locality-only projects keep only their 2D halo
  for (const st of structures) spires.push({ projectId: st.projectId, lonlat: st.lonlat, hue: st.hue, cls: st.cls, opacity: st.opacity, selected: st.selected });

  // arcs: every flagged pair with centers, both projects visible, in engine priority order
  const visibleIds = new Set(visible.map((p) => p.id));
  const arcs: Map3DArc[] = [];
  regionMatches.forEach((m) => {
    const c = m.geoDetail.center;
    if (!c || !visibleIds.has(m.projectAId) || !visibleIds.has(m.projectBId)) return;
    if (selectedMatch && m.id === selectedMatch.id) return;
    const chord = metersBetween(c.a, c.b);
    arcs.push({
      id: m.id,
      a: c.a,
      b: c.b,
      rank: arcs.length + 1,
      h: Math.max(120, 0.08 * chord),
      possible: m.geo !== "confirmed",
      hovered: hoveredMatch?.id === m.id,
      dim: selectedMatch
        ? 0.16
        : focus && !(focus.has(m.projectAId) || focus.has(m.projectBId))
          ? 0.16
          : hoveredMatch && hoveredMatch.id !== m.id
            ? 0.35
            : 1,
    });
  });

  // the selected pair: arcs, ring, beacon
  let selected: Map3DSelected | null = null;
  const labels: Map3DLabel[] = [];
  if (selectedMatch?.geoDetail.center) {
    const c = selectedMatch.geoDetail.center;
    const a = PROJECTS.get(selectedMatch.projectAId)!;
    const b = PROJECTS.get(selectedMatch.projectBId)!;
    const radiusMiles = run?.thresholdMiles ?? selectedMatch.geoDetail.thresholdMiles;
    const site = sharedSiteOf(selectedMatch);
    const method = selectedMatch.geoDetail.method;
    const basis: Map3DSelected["basis"] = site && (method === "shared-site" || method === "shared-endpoint") ? method : "measured";
    const possible = selectedMatch.geo !== "confirmed";
    const selArcs =
      basis === "measured"
        ? [{ a: c.a, b: c.b, h: selectedArcHeight(metersBetween(c.a, c.b)), possible }]
        : [c.a, c.b]
            .filter((pt) => metersBetween(pt, site!.lonlat) > 150)
            .map((pt) => ({ a: pt, b: site!.lonlat, h: selectedArcHeight(metersBetween(pt, site!.lonlat)), possible }));
    const inside = c.miles <= radiusMiles;
    selected = {
      id: selectedMatch.id,
      a: c.a,
      b: c.b,
      basis,
      site: site?.lonlat,
      siteLabel: site?.label,
      siteStated: site?.stated,
      miles: c.miles,
      radiusMiles,
      aShort: a.shortTitle,
      bShort: b.shortTitle,
      inside,
      arcs: selArcs,
    };
    const toB = bearingDeg(c.a, c.b);
    const r = radiusMiles * MI;
    labels.push({ lonlat: destination(c.a, r, toB + (inside ? 0 : 28)), text: `${radiusMiles} mi from ${a.shortTitle}`, kind: "ring", z: 0 });
    if (!inside && basis !== "measured") labels.push({ lonlat: destination(c.a, r, toB), text: `Beyond ${radiusMiles} mi · shared site`, kind: "beyond", z: 0 });
    if (site) {
      structures.push({
        id: `beacon:${selectedMatch.id}`,
        projectId: a.id,
        label: site.label,
        model: "beacon",
        lonlat: site.lonlat,
        hue: HUE.overlap,
        cls: "v2",
        opacity: 1,
        selected: true,
      });
    }
  }

  // overview after a run: hotspots + rank chips on the list's first tab
  let hotspots: Map3DHotspot[] = [];
  if (run && !selectedMatch) {
    const mids = regionMatches
      .filter((m) => m.geoDetail.center)
      .map((m) => ({ id: m.id, mid: [(m.geoDetail.center!.a[0] + m.geoDetail.center!.b[0]) / 2, (m.geoDetail.center!.a[1] + m.geoDetail.center!.b[1]) / 2] as LonLat }));
    hotspots = hotspotsOf(mids);
    for (const h of hotspots) labels.push({ lonlat: destination(h.center, h.radiusMeters, 180), text: `${h.count} pairs`, kind: "hotspot", z: 0 });
    const tab: ReviewStatus | undefined = REVIEW_TABS.find((t) => regionMatches.some((m) => m.reviewStatus === t));
    if (tab) {
      for (const m of regionMatches.filter((x) => x.reviewStatus === tab)) {
        const rank = rankOf(run, region, m.id);
        const arc = arcs.find((x) => x.id === m.id);
        if (!rank || rank > 3 || !arc) continue;
        const at: LonLat = [(arc.a[0] + arc.b[0]) / 2, (arc.a[1] + arc.b[1]) / 2];
        const stack = labels.filter((l) => l.kind === "rank" && metersBetween(l.lonlat, at) < 15000).length;
        labels.push({ lonlat: at, text: rankLabel(rank), kind: "rank", z: arc.h, stack });
      }
    }
  }

  let sweep: Map3DState["sweep"] = null;
  const located = regionProjects.map((p) => centerOf(p)?.lonlat).filter((x): x is LonLat => !!x);
  if (located.length) {
    const c: LonLat = [located.reduce((s, x) => s + x[0], 0) / located.length, located.reduce((s, x) => s + x[1], 0) / located.length];
    sweep = { center: c, radiusMeters: Math.max(...located.map((x) => metersBetween(c, x))) * 1.05 };
  }

  return { mode: input.mapMode, spires, structures, routes, discs, chords, arcs, selected, hotspots, labels, flaggedProjectIds: flagged, sweep };
}

// ---------------------------------------------------------------------------------------------------------------
// GeoJSON builders (pure)

type Props = Record<string, unknown>;
const fc = <G extends Point | LineString | Polygon>(features: Feature<G, Props>[]): FeatureCollection<G, Props> => ({ type: "FeatureCollection", features });
const pt = (c: LonLat, properties: Props): Feature<Point, Props> => ({ type: "Feature", properties, geometry: { type: "Point", coordinates: c } });
const ln = (c: LonLat[], properties: Props): Feature<LineString, Props> => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates: c } });

function ringPolygon(center: LonLat, meters: number, steps = 160): Feature<Polygon, Props> {
  const c = circle(center, meters / 1000, { steps, units: "kilometers" });
  return { type: "Feature", properties: {}, geometry: c.geometry };
}
function ringLine(center: LonLat, meters: number, props: Props = {}, steps = 160): Feature<LineString, Props> {
  const poly = ringPolygon(center, meters, steps);
  return ln(poly.geometry.coordinates[0] as LonLat[], props);
}

/** Layer classes: unknown voltage draws as a pylon at the 161–230 kV size (spires: at the ≤115 kV size). */
const LAYER_CLASSES = ["v1", "v2", "v3", "v4"] as const;
type LayerClass = (typeof LAYER_CLASSES)[number];
const spireClass = (cls: VoltageClass): LayerClass => (cls === "u" ? "v1" : cls);
const structureClass = (cls: VoltageClass): LayerClass => (cls === "u" ? "v2" : cls);

function spireScaleExpr(cls: LayerClass): Expr {
  const stops: unknown[] = [];
  for (const [z, v] of SPIRE_STOPS) stops.push(z, ["literal", spireScale(cls, v)]);
  return ["interpolate", ["linear"], ["zoom"], ...stops];
}

function structureScaleExpr(cls: LayerClass): Expr {
  return ["interpolate", ["exponential", 2], ["zoom"], 5, ["literal", structureScale(cls, 6.5)], 6.5, ["literal", structureScale(cls, 6.5)], 16, ["literal", structureScale(cls, 16)]];
}

/** Dimmed spires darken toward the canvas (model opacity is per layer, and spires are too thin to need translucency). */
function dimHex(hex: string, t: number): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const base = [0x14, 0x1a, 0x26];
  return `#${[1, 3, 5].map((i, j) => Math.round(n(i) + (base[j] - n(i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Model opacity is layer-wide in mapbox-gl 3.31 (a data-driven value is ignored), so features go to opacity groups. */
const group = (selected: boolean, opacity: number): "sel" | "full" | "dim" => (selected ? "sel" : opacity >= 0.9 ? "full" : "dim");

function spireFeatures(s: Map3DState) {
  return fc(
    s.spires.map((sp) => {
      const g = group(sp.selected, sp.opacity);
      return pt(sp.lonlat, { c: g === "dim" ? dimHex(sp.hue, 0.55) : sp.hue, g, k: spireClass(sp.cls) });
    }),
  );
}

function structureProps(model: ModelKey, cls: VoltageClass, extra: Props): Props {
  return { m: MODEL_ID[model], k: model === "beacon" ? "v2" : structureClass(cls), ...extra };
}

function structureFeatures(s: Map3DState, zoom: number) {
  const out: Feature<Point, Props>[] = s.structures.map((st) =>
    pt(st.lonlat, structureProps(st.model, st.cls, { c: st.hue, g: group(st.selected, st.opacity), r: [0, 0, 0], e: st.model === "beacon" ? 0.9 : 0.35 })),
  );
  const step = towerStep(zoom);
  for (const r of s.routes)
    r.towers.forEach((t, i) => {
      if (i % step !== 0 && i !== r.towers.length - 1) return;
      out.push(pt(t.lonlat, structureProps("tower", r.cls, { c: r.hue, g: group(r.selected, r.opacity), r: [0, 0, t.bearing], e: 0.35 })));
    });
  return fc(out);
}

/** Two conductors per span (the middle arm's tips), sagging between towers: z = hz − sag·sin(π·progress). */
function wireFeatures(s: Map3DState, zoom: number) {
  const out: Feature<LineString, Props>[] = [];
  const step = towerStep(zoom);
  for (const r of s.routes) {
    const shown = r.towers.filter((_, i) => i % step === 0 || i === r.towers.length - 1);
    const [sx, , sz] = structureScale(structureClass(r.cls), zoom);
    const hz = TOWER_CONDUCTOR * sz;
    const reach = TOWER_REACH * sx;
    for (let i = 0; i < shown.length - 1; i++) {
      const a = shown[i];
      const b = shown[i + 1];
      const span = metersBetween(a.lonlat, b.lonlat);
      if (span > TOWER_SPACING * step * 1.8) continue; // a gap in the route geometry: no wire across it
      for (const side of [-1, 1]) {
        const pa = destination(a.lonlat, reach, a.bearing + 90 * side);
        const pb = destination(b.lonlat, reach, b.bearing + 90 * side);
        out.push(ln(densify(pa, pb, 8), { c: r.hue, o: r.opacity, hz, sag: Math.min(hz * 0.16, span * 0.08) }));
      }
    }
  }
  return fc(out);
}

function arcFeatures(s: Map3DState) {
  return fc(s.arcs.map((a) => ln(densify(a.a, a.b, 64), { id: a.id, rank: a.rank, h: a.h, op: a.possible ? 0.5 : 1, hov: a.hovered, dim: a.dim })));
}

function selectedArcFeatures(s: Map3DState) {
  return fc((s.selected?.arcs ?? []).map((a) => ln(densify(a.a, a.b, 64), { h: a.h, op: a.possible ? 0.5 : 1 })));
}

function ringFeatures(s: Map3DState) {
  if (!s.selected) return { fill: fc<Polygon>([]), line: fc<LineString>([]) };
  const r = s.selected.radiusMiles * MI;
  return { fill: fc([ringPolygon(s.selected.a, r)]), line: fc([ringLine(s.selected.a, r)]) };
}

function hotspotFeatures(s: Map3DState) {
  return {
    fill: fc(s.hotspots.map((h) => ({ ...ringPolygon(h.center, h.radiusMeters, 72), properties: { n: h.count } }))),
    line: fc(s.hotspots.map((h) => ringLine(h.center, h.radiusMeters, { n: h.count }, 72))),
  };
}

function discFeatures(s: Map3DState) {
  return fc(s.discs.map((d) => ({ ...ringPolygon(d.lonlat, d.radiusMeters, 72), properties: { c: d.hue } })));
}

function chordFeatures(s: Map3DState) {
  return fc(s.chords.map((c) => ln(densify(c.a, c.b, 16), { c: c.hue, t: "route not published · drawn terminal to terminal" })));
}

function beaconFeatures(s: Map3DState) {
  return fc(s.selected?.site ? [pt(s.selected.site, {})] : []);
}

function labelFeatures(s: Map3DState) {
  return fc(
    s.labels.map((l) =>
      pt(l.lonlat, {
        t: l.text,
        k: l.kind,
        z: l.z,
        si: l.stack ?? 0,
        chip: l.kind === "rank" || l.kind === "beyond",
      }),
    ),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// map runtime (guarded)

const MODEL_ID: Record<ModelKey | "spire", string> = {
  tower: "gl3d-m-tower",
  substation: "gl3d-m-substation",
  pylon: "gl3d-m-pylon",
  beacon: "gl3d-m-pylon",
  spire: "gl3d-m-spire",
};
const MODEL_URL: Record<string, string> = {
  "gl3d-m-tower": "/models/tower.glb",
  "gl3d-m-substation": "/models/substation.glb",
  "gl3d-m-pylon": "/models/pylon.glb",
  "gl3d-m-spire": "/models/spire.glb",
};

const SRC = {
  spires: "gl3d-src-spires",
  structures: "gl3d-src-structures",
  wires: "gl3d-src-wires",
  arcs: "gl3d-src-arcs",
  selArcs: "gl3d-src-sel-arcs",
  ringFill: "gl3d-src-ring-fill",
  ringLine: "gl3d-src-ring-line",
  hotFill: "gl3d-src-hot-fill",
  hotLine: "gl3d-src-hot-line",
  discs: "gl3d-src-discs",
  chords: "gl3d-src-chords",
  beacon: "gl3d-src-beacon",
  labels: "gl3d-src-labels",
  sweep: "gl3d-src-sweep",
} as const;

const LINE_METRICS = new Set<string>([SRC.wires, SRC.arcs, SRC.selArcs]);

type AnyLayer = Parameters<MapboxMap["addLayer"]>[0];
type Expr = unknown[];

const Z_ARC: Expr = ["*", ["get", "h"], ["sin", ["*", ["pi"], ["line-progress"]]]];
const Z_WIRE: Expr = ["-", ["get", "hz"], ["*", ["get", "sag"], ["sin", ["*", ["pi"], ["line-progress"]]]]];
const arr3 = (k: string): Expr => ["array", "number", 3, ["get", k]];
const FONT = ["DIN Pro Medium", "Arial Unicode MS Regular"];

const SPIRE_OPACITY = 0.95;
const STRUCTURE_OPACITY = { full: 1, dim: 0.35, sel: 1 } as const;

/** Ground layers go under map-core's 2D data (so dots and routes stay crisp on top of washes). */
const GROUND_BEFORE = ["gl-halos-fill", "gl-routes-glow", "gl-routes", "gl-overlaps-glow", "gl-overlaps", "gl-points-halo", "gl-points"];

type LayerDef = { spec: Record<string, unknown>; ground?: boolean; symbol?: boolean };

function layerSpecs(standard: boolean): LayerDef[] {
  const lineRound = { "line-cap": "round", "line-join": "round" };
  const defs: LayerDef[] = [
    {
      ground: true,
      spec: { id: "gl3d-sweep", type: "line", source: SRC.sweep, layout: lineRound, paint: { "line-color": HUE.fg1, "line-width": 1.5, "line-opacity": 0, "line-emissive-strength": 1 } },
    },
    {
      ground: true,
      spec: { id: "gl3d-hotspots-fill", type: "fill", source: SRC.hotFill, maxzoom: 9.5, paint: { "fill-color": HUE.overlap, "fill-opacity": 0.035, "fill-emissive-strength": 1 } },
    },
    {
      ground: true,
      spec: {
        id: "gl3d-hotspots",
        type: "line",
        source: SRC.hotLine,
        maxzoom: 9.5,
        layout: lineRound,
        paint: { "line-color": HUE.overlap, "line-width": 1, "line-opacity": 0.38, "line-emissive-strength": 1 },
      },
    },
    {
      ground: true,
      spec: { id: "gl3d-ring-wash", type: "fill", source: SRC.ringFill, paint: { "fill-color": HUE.overlap, "fill-opacity": 0.055, "fill-emissive-strength": 1 } },
    },
    {
      ground: true,
      spec: {
        id: "gl3d-ring-glow",
        type: "line",
        source: SRC.ringLine,
        layout: lineRound,
        paint: { "line-color": HUE.overlap, "line-width": 7, "line-blur": 6, "line-opacity": 0.14, "line-emissive-strength": 1 },
      },
    },
    {
      ground: true,
      spec: {
        id: "gl3d-ring",
        type: "line",
        source: SRC.ringLine,
        layout: lineRound,
        paint: { "line-color": HUE.overlap, "line-width": 1.5, "line-opacity": 0.55, "line-emissive-strength": 1 },
      },
    },
    {
      ground: true,
      spec: { id: "gl3d-discs", type: "fill", source: SRC.discs, paint: { "fill-color": ["get", "c"], "fill-opacity": 0.07, "fill-emissive-strength": 1 } },
    },
    {
      ground: true,
      spec: {
        id: "gl3d-discs-line",
        type: "line",
        source: SRC.discs,
        paint: { "line-color": ["get", "c"], "line-width": 1, "line-opacity": 0.5, "line-dasharray": [2, 2], "line-emissive-strength": 1 },
      },
    },
    {
      ground: true,
      spec: {
        id: "gl3d-chords",
        type: "line",
        source: SRC.chords,
        layout: lineRound,
        paint: { "line-color": ["get", "c"], "line-width": 1.6, "line-opacity": 0.5, "line-dasharray": [1.2, 2.2], "line-emissive-strength": 1 },
      },
    },
    {
      ground: true,
      spec: {
        id: "gl3d-beacon-glow",
        type: "circle",
        source: SRC.beacon,
        paint: { "circle-radius": 18, "circle-color": HUE.overlap, "circle-opacity": 0.16, "circle-blur": 1, "circle-pitch-alignment": "map", "circle-emissive-strength": 1 },
      },
    },
    {
      spec: {
        id: "gl3d-wires",
        type: "line",
        source: SRC.wires,
        minzoom: 7.5,
        layout: { ...lineRound, "line-z-offset": Z_WIRE, "line-elevation-reference": "ground" },
        paint: {
          "line-color": ["get", "c"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 12, 1.4],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 7.9, ["*", 0.9, ["get", "o"]], 8.5, ["*", 0.9, ["get", "o"]]],
          "line-emissive-strength": 0.6,
        },
      },
    },
    {
      spec: {
        id: "gl3d-arcs",
        type: "line",
        source: SRC.arcs,
        layout: { ...lineRound, "line-z-offset": Z_ARC, "line-elevation-reference": "ground" },
        paint: {
          "line-color": HUE.overlap,
          "line-width": ["case", ["get", "hov"], 2.4, 1.25],
          "line-opacity": ["*", ["get", "op"], ["get", "dim"], 0.85],
          "line-emissive-strength": 1,
        },
      },
    },
    {
      spec: {
        id: "gl3d-arc-sel-glow",
        type: "line",
        source: SRC.selArcs,
        layout: { ...lineRound, "line-z-offset": Z_ARC, "line-elevation-reference": "ground" },
        paint: { "line-color": HUE.overlap, "line-width": 9, "line-blur": 7, "line-opacity": ["*", 0.22, ["get", "op"]], "line-emissive-strength": 1 },
      },
    },
    {
      spec: {
        id: "gl3d-arc-sel",
        type: "line",
        source: SRC.selArcs,
        layout: { ...lineRound, "line-z-offset": Z_ARC, "line-elevation-reference": "ground" },
        paint: { "line-color": HUE.overlap, "line-width": 3, "line-opacity": ["get", "op"], "line-emissive-strength": 1 },
      },
    },
    ...LAYER_CLASSES.map((cls) => ({
      spec: {
        id: `gl3d-spires-${cls}`,
        type: "model",
        source: SRC.spires,
        // no layer maxzoom: in mapbox-gl 3.31 a model layer with both a filter and a maxzoom renders nothing
        // (tested); zoom visibility is handled by zoomVisible()
        filter: ["all", ["!=", ["get", "g"], "sel"], ["==", ["get", "k"], cls]],
        layout: { "model-id": MODEL_ID.spire, "model-allow-density-reduction": false },
        paint: {
          "model-scale": spireScaleExpr(cls),
          "model-color": ["get", "c"],
          "model-color-mix-intensity": 0.85,
          "model-emissive-strength": 0.35,
          // the crown glows brighter than the shaft (0.35 × 1.2 at the foot → × 2.8 at the tip)
          "model-height-based-emissive-strength-multiplier": [0, 40, 1.2, 2.8, 0],
          "model-opacity": ["interpolate", ["linear"], ["zoom"], 8, SPIRE_OPACITY, 8.5, 0],
          "model-cast-shadows": false,
          "model-receive-shadows": false,
        },
      },
    })),
    ...(["full", "dim", "sel"] as const).flatMap((g) =>
      LAYER_CLASSES.map((cls) => ({ g, cls, op: STRUCTURE_OPACITY[g] })),
    ).map(({ g, cls, op }) => ({
      spec: {
        id: `gl3d-structures-${g}-${cls}`,
        type: "model",
        source: SRC.structures,
        filter: ["all", ["==", ["get", "g"], g], ["==", ["get", "k"], cls]],
        layout: { "model-id": ["get", "m"], "model-allow-density-reduction": false },
        paint: {
          "model-scale": structureScaleExpr(cls),
          "model-rotation": arr3("r"),
          "model-color": ["get", "c"],
          "model-color-mix-intensity": 0.85,
          "model-emissive-strength": ["get", "e"],
          "model-height-based-emissive-strength-multiplier": [0, 45, 0.85, 1.9, 0],
          // the selected pair's structures show at every zoom; the rest cross-fade in as the spires fade out
          "model-opacity": g === "sel" ? op : ["interpolate", ["linear"], ["zoom"], 7.9, 0, 8.5, op],
          "model-cast-shadows": false,
          "model-receive-shadows": false,
        },
      },
    })),
    {
      symbol: true,
      spec: {
        id: "gl3d-chord-labels",
        type: "symbol",
        source: SRC.chords,
        minzoom: 8,
        layout: {
          "symbol-placement": "line-center",
          "text-field": ["get", "t"],
          "text-font": FONT,
          "text-size": 11,
          "text-offset": [0, -0.9],
          "text-max-angle": 30,
          "text-allow-overlap": false,
        },
        paint: { "text-color": ["get", "c"], "text-opacity": 0.85, "text-halo-color": HUE.canvas, "text-halo-width": 1.4, "text-emissive-strength": 1 },
      },
    },
    {
      symbol: true,
      spec: {
        id: "gl3d-labels",
        type: "symbol",
        source: SRC.labels,
        layout: {
          "text-field": ["get", "t"],
          "text-font": FONT,
          "text-size": ["match", ["get", "k"], "rank", 11, 11.5],
          "text-letter-spacing": ["match", ["get", "k"], "rank", 0.06, 0.01],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "icon-image": ["case", ["get", "chip"], "gl3d-chip", ""],
          "icon-text-fit": "both",
          "icon-text-fit-padding": [3, 7, 3, 7],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-anchor": "center",
          "text-offset": ["match", ["get", "si"], 1, ["literal", [0, -2]], 2, ["literal", [0, -4]], ["literal", [0, 0]]],
        },
        paint: {
          "text-color": ["match", ["get", "k"], "rank", HUE.fg1, "hotspot", HUE.overlap, HUE.overlap],
          "text-opacity": ["match", ["get", "k"], "hotspot", 0.75, 1],
          "text-halo-color": HUE.canvas,
          "text-halo-width": ["case", ["get", "chip"], 0, 1.4],
          "icon-opacity": 1,
          "symbol-z-offset": ["get", "z"],
          "text-emissive-strength": 1,
          "icon-emissive-strength": 1,
        },
      },
    },
  ];
  return defs.filter((l) => standard || !l.symbol);
}

interface Anim {
  /** Reveal: draw-in progress start time (ms) or null. */
  revealStart: number | null;
  trimStart: number | null;
  sweepStart: number | null;
  hotPulseStart: number | null;
}

interface Runtime {
  style: unknown;
  standard: boolean;
  installed: boolean;
  keys: Map<string, string>;
  input: Map3DInput | null;
  state: Map3DState | null;
  stateKey: string;
  band: number;
  wireZoom: number;
  lastReveal: number;
  lastRunning: boolean;
  lastSelected: string | null;
  anim: Anim;
  raf: number | null;
  zoomRaf: number | null;
  listening: boolean;
  zoomVis: Map<string, boolean>;
}

const runtimes = new WeakMap<MapboxMap, Runtime>();

function runtime(map: MapboxMap): Runtime {
  let rt = runtimes.get(map);
  if (!rt) {
    rt = {
      style: null,
      standard: false,
      installed: false,
      keys: new Map(),
      input: null,
      state: null,
      stateKey: "",
      band: -1,
      wireZoom: -1,
      lastReveal: 0,
      lastRunning: false,
      lastSelected: null,
      anim: { revealStart: null, trimStart: null, sweepStart: null, hotPulseStart: null },
      raf: null,
      zoomRaf: null,
      listening: false,
      zoomVis: new Map(),
    };
    runtimes.set(map, rt);
  }
  return rt;
}

const styleOf = (map: MapboxMap): unknown => (map as unknown as { style?: unknown }).style;

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function live(map: MapboxMap, rt: Runtime): boolean {
  return rt.installed && styleOf(map) === rt.style;
}

function setData(map: MapboxMap, rt: Runtime, id: string, data: FeatureCollection, force = false): void {
  const src = safe(() => map.getSource(id)) as { setData?: (d: FeatureCollection) => void } | undefined;
  if (!src?.setData) return;
  if (force) rt.keys.delete(id);
  else {
    const key = JSON.stringify(data);
    if (rt.keys.get(id) === key) return;
    rt.keys.set(id, key);
  }
  safe(() => src.setData!(data));
}

function setPaint(map: MapboxMap, id: string, prop: string, value: unknown): void {
  if (!safe(() => map.getLayer(id))) return;
  safe(() => map.setPaintProperty(id, prop as never, value as never));
}

function setFilter(map: MapboxMap, id: string, filter: unknown): void {
  if (!safe(() => map.getLayer(id))) return;
  safe(() => map.setFilter(id, filter as never));
}

function setVisible(map: MapboxMap, id: string, on: boolean): void {
  if (!safe(() => map.getLayer(id))) return;
  safe(() => map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
}

function allLayerIds(rt: Runtime): string[] {
  return layerSpecs(rt.standard).map((l) => l.spec.id as string);
}

/** A rounded glass chip (stretchable) for rank chips and the "Beyond 25 mi" chip. */
function addChipImage(map: MapboxMap): void {
  if (safe(() => map.hasImage("gl3d-chip"))) return;
  if (typeof document === "undefined") return;
  const pr = 2;
  const w = 28 * pr;
  const h = 22 * pr;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const r = 7 * pr;
  ctx.beginPath();
  ctx.moveTo(r + 1, 1);
  ctx.arcTo(w - 1, 1, w - 1, h - 1, r);
  ctx.arcTo(w - 1, h - 1, 1, h - 1, r);
  ctx.arcTo(1, h - 1, 1, 1, r);
  ctx.arcTo(1, 1, w - 1, 1, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(11,16,25,0.9)";
  ctx.fill();
  ctx.lineWidth = 1.5 * pr * 0.75;
  ctx.strokeStyle = "rgba(245,184,61,0.7)";
  ctx.stroke();
  const img = ctx.getImageData(0, 0, w, h);
  safe(() =>
    map.addImage("gl3d-chip", { width: w, height: h, data: new Uint8Array(img.data.buffer) }, {
      pixelRatio: pr,
      stretchX: [[r + 2, w - r - 2]],
      stretchY: [[r + 2, h - r - 2]],
      content: [r, 4, w - r, h - 4],
    } as never),
  );
}

/** Idempotent; call on every style.load. `standard` = Mapbox Standard (slots, symbol labels). */
export function install3D(map: MapboxMap, opts: { standard: boolean }): void {
  const rt = runtime(map);
  stopAnimations(rt);
  rt.style = styleOf(map);
  rt.standard = opts.standard;
  rt.keys.clear();
  rt.zoomVis.clear();
  rt.band = -1;
  rt.wireZoom = -1;
  rt.installed = false;

  for (const [id, url] of Object.entries(MODEL_URL)) {
    if (!safe(() => map.hasModel(id))) safe(() => map.addModel(id, url));
  }
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of Object.values(SRC)) {
    if (safe(() => map.getSource(id))) continue;
    // raised lines are densified straight lines: tolerance 0 stops geojson-vt from simplifying the vertices away
    // (line-z-offset is evaluated per vertex, so a simplified arc would draw as a triangle)
    safe(() => map.addSource(id, { type: "geojson", data: empty, ...(LINE_METRICS.has(id) ? { lineMetrics: true, tolerance: 0 } : {}) } as never));
  }
  if (opts.standard) addChipImage(map);
  // same slot as map-core's data layers (beforeId only works within a slot); labels always on top
  const before = GROUND_BEFORE.find((id) => safe(() => map.getLayer(id)));
  const dataSlot = (before && (safe(() => map.getLayer(before))?.slot as string | undefined)) || "top";
  for (const { spec, ground, symbol } of layerSpecs(opts.standard)) {
    if (safe(() => map.getLayer(spec.id as string))) continue;
    // raised and model layers need the "top" slot: model layers in Standard's "middle" slot do not render (tested)
    const slot = opts.standard ? { slot: ground && !symbol ? dataSlot : "top" } : {};
    safe(() => map.addLayer({ ...spec, ...slot } as unknown as AnyLayer, ground && !symbol ? before : undefined));
  }
  if (!opts.standard) {
    // the offline style has no lights of its own: without these, models render black
    safe(() =>
      map.setLights([
        { id: "gl3d-ambient", type: "ambient", properties: { color: "#b9c3d6", intensity: 0.55 } },
        { id: "gl3d-sun", type: "directional", properties: { color: "#ffffff", intensity: 0.65, direction: [200, 40], "cast-shadows": false } },
      ] as never),
    );
  }
  if (!rt.listening) {
    rt.listening = true;
    safe(() =>
      map.on("zoom", () => {
        if (rt.zoomRaf !== null) return;
        rt.zoomRaf = requestAnimationFrame(() => {
          rt.zoomRaf = null;
          refreshZoomDependent(map, rt);
        });
      }),
    );
  }
  rt.installed = true;
  if (rt.input) apply(map, rt, rt.input, true);
}

/** No-op until install3D ran for the current style; guarded with getLayer/getSource and try/catch. */
export function update3D(map: MapboxMap, input: Map3DInput): void {
  const rt = runtime(map);
  rt.input = input;
  if (!live(map, rt)) return;
  safe(() => apply(map, rt, input, false));
}

/** Removes every gl3d-* layer and source. */
export function uninstall3D(map: MapboxMap): void {
  const rt = runtimes.get(map);
  if (rt) {
    stopAnimations(rt);
    rt.installed = false;
    rt.keys.clear();
  }
  const layers = (safe(() => map.getStyle()?.layers) ?? []) as { id: string }[];
  for (const l of layers) if (l.id.startsWith(MAP3D_LAYER_PREFIX)) safe(() => map.removeLayer(l.id));
  for (const id of Object.values(SRC)) if (safe(() => map.getSource(id))) safe(() => map.removeSource(id));
}

function inputKey(i: Map3DInput): string {
  return [i.region, i.selectedMatchId, i.hoveredMatchId, (i.focusProjectIds ?? []).join(","), i.mapMode, i.run?.ranAt ?? "", i.run?.thresholdMiles ?? "", i.run?.matches.length ?? ""].join("|");
}

function apply(map: MapboxMap, rt: Runtime, input: Map3DInput, fresh: boolean): void {
  const key = inputKey(input);
  if (fresh || key !== rt.stateKey || !rt.state) {
    rt.state = build3DState(input);
    rt.stateKey = key;
  }
  const s = rt.state;
  const on = input.mapMode === "3d";
  const zoomNow = safe(() => map.getZoom()) ?? 8;
  for (const id of allLayerIds(rt)) {
    const v = on && zoomVisible(id, zoomNow);
    setVisible(map, id, v);
    rt.zoomVis.set(id, v);
  }
  if (!on) {
    stopAnimations(rt);
    rt.lastRunning = input.running;
    rt.lastReveal = input.revealNonce;
    rt.lastSelected = input.selectedMatchId;
    return;
  }
  const zoom = safe(() => map.getZoom()) ?? 8;
  rt.band = towerStep(zoom);
  rt.wireZoom = zoom;
  setData(map, rt, SRC.spires, spireFeatures(s));
  setData(map, rt, SRC.structures, structureFeatures(s, zoom));
  setData(map, rt, SRC.wires, wireFeatures(s, zoom));
  setData(map, rt, SRC.arcs, arcFeatures(s));
  setData(map, rt, SRC.selArcs, selectedArcFeatures(s));
  const ring = ringFeatures(s);
  setData(map, rt, SRC.ringFill, ring.fill);
  setData(map, rt, SRC.ringLine, ring.line);
  const hot = hotspotFeatures(s);
  setData(map, rt, SRC.hotFill, hot.fill);
  setData(map, rt, SRC.hotLine, hot.line);
  setData(map, rt, SRC.discs, discFeatures(s));
  setData(map, rt, SRC.chords, chordFeatures(s));
  setData(map, rt, SRC.beacon, beaconFeatures(s));
  setData(map, rt, SRC.labels, labelFeatures(s));

  const now = performance.now();
  const reduced = input.reducedMotion;
  // reveal: only for an explicit Compare (revealNonce bump) with a result and no selection
  if (input.revealNonce !== rt.lastReveal) {
    rt.lastReveal = input.revealNonce;
    if (input.run && !input.selectedMatchId && !reduced) {
      rt.anim.revealStart = now;
      rt.anim.hotPulseStart = now + 500;
    }
  }
  // sweep: once, when a first comparison starts
  if (input.running && !rt.lastRunning && !input.run && s.sweep && !reduced) rt.anim.sweepStart = now;
  rt.lastRunning = input.running;
  // selected arc draws itself in
  if (input.selectedMatchId !== rt.lastSelected) {
    rt.lastSelected = input.selectedMatchId;
    rt.anim.trimStart = s.selected && !reduced ? now : null;
  }
  if (!rt.anim.revealStart) {
    setFilter(map, "gl3d-arcs", null);
    setPaint(map, "gl3d-arcs", "line-opacity", ARC_OPACITY(1));
    setPaint(map, "gl3d-labels", "text-opacity", LABEL_OPACITY(1));
    setPaint(map, "gl3d-labels", "icon-opacity", LABEL_ICON_OPACITY(1));
  }
  if (!rt.anim.trimStart) {
    setPaint(map, "gl3d-arc-sel", "line-trim-offset", [0, 0]);
    setPaint(map, "gl3d-arc-sel-glow", "line-trim-offset", [0, 0]);
  }
  kick(map, rt);
}

const ARC_OPACITY = (rest: number): Expr => ["*", ["get", "op"], ["get", "dim"], 0.85, ["case", ["<=", ["get", "rank"], 12], 1, rest]];
const LABEL_OPACITY = (rank: number): Expr => ["match", ["get", "k"], "rank", rank, "hotspot", 0.75, 1];
const LABEL_ICON_OPACITY = (rank: number): Expr => ["match", ["get", "k"], "rank", rank, 1];

const ZOOM_LAYERS = [
  ...LAYER_CLASSES.map((c) => `gl3d-spires-${c}`),
  ...LAYER_CLASSES.flatMap((c) => [`gl3d-structures-full-${c}`, `gl3d-structures-dim-${c}`]),
];

/** Spires only below z8.6, the non-selected structure layers only above z7.8 (they are fully transparent outside). */
function zoomVisible(id: string, zoom: number): boolean {
  if (id.startsWith("gl3d-spires")) return zoom < 8.6;
  if (id.startsWith("gl3d-structures-full") || id.startsWith("gl3d-structures-dim")) return zoom > 7.8;
  return true;
}

function refreshZoomDependent(map: MapboxMap, rt: Runtime): void {
  if (!live(map, rt) || !rt.state || !rt.input || rt.input.mapMode !== "3d") return;
  const zoom = safe(() => map.getZoom()) ?? 8;
  for (const id of ZOOM_LAYERS) {
    const want = zoomVisible(id, zoom);
    if (rt.zoomVis.get(id) !== want) {
      rt.zoomVis.set(id, want);
      setVisible(map, id, want);
    }
  }
  if (!rt.state.routes.length) return;
  const band = towerStep(zoom);
  if (band !== rt.band) {
    rt.band = band;
    setData(map, rt, SRC.structures, structureFeatures(rt.state, zoom));
  }
  if (Math.abs(zoom - rt.wireZoom) > 0.02) {
    rt.wireZoom = zoom;
    setData(map, rt, SRC.wires, wireFeatures(rt.state, zoom));
  }
}

function stopAnimations(rt: Runtime): void {
  if (rt.raf !== null) cancelAnimationFrame(rt.raf);
  rt.raf = null;
  rt.anim = { revealStart: null, trimStart: null, sweepStart: null, hotPulseStart: null };
}

const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** The one rAF loop: runs while any animation is active; the selected ring's breathing is the single looping one. */
function kick(map: MapboxMap, rt: Runtime): void {
  if (rt.raf !== null) return;
  const frame = () => {
    rt.raf = null;
    if (!live(map, rt) || !rt.input || rt.input.mapMode !== "3d") return;
    const canvas = safe(() => map.getCanvas());
    const paused = (typeof document !== "undefined" && document.hidden) || canvas?.style.visibility === "hidden";
    const now = performance.now();
    const a = rt.anim;
    let active = false;

    if (a.revealStart !== null) {
      const t = now - a.revealStart;
      const n = rt.state?.arcs.length ?? 0;
      const k = Math.min(12, Math.floor(t / 60) + 1);
      const rest = clamp((t - 720) / 420, 0, 1);
      setFilter(map, "gl3d-arcs", ["<=", ["get", "rank"], k >= 12 && rest > 0 ? 1e6 : k]);
      setPaint(map, "gl3d-arcs", "line-opacity", ARC_OPACITY(easeOut(rest)));
      setPaint(map, "gl3d-labels", "text-opacity", LABEL_OPACITY(clamp((t - 700) / 300, 0, 1)));
      setPaint(map, "gl3d-labels", "icon-opacity", LABEL_ICON_OPACITY(clamp((t - 700) / 300, 0, 1)));
      if (t >= 1150 || n === 0) {
        a.revealStart = null;
        setFilter(map, "gl3d-arcs", null);
        setPaint(map, "gl3d-arcs", "line-opacity", ARC_OPACITY(1));
        setPaint(map, "gl3d-labels", "text-opacity", LABEL_OPACITY(1));
        setPaint(map, "gl3d-labels", "icon-opacity", LABEL_ICON_OPACITY(1));
      } else active = true;
    }

    if (a.hotPulseStart !== null) {
      const t = (now - a.hotPulseStart) / 900;
      if (t >= 1) {
        a.hotPulseStart = null;
        setPaint(map, "gl3d-hotspots", "line-width", 1);
        setPaint(map, "gl3d-hotspots", "line-opacity", 0.38);
      } else {
        const p = t < 0 ? 0 : Math.sin(Math.PI * t);
        setPaint(map, "gl3d-hotspots", "line-width", 1 + 2 * p);
        setPaint(map, "gl3d-hotspots", "line-opacity", 0.38 + 0.45 * p);
        active = true;
      }
    }

    if (a.trimStart !== null) {
      const t = (now - a.trimStart) / 600;
      if (t >= 1) {
        a.trimStart = null;
        setPaint(map, "gl3d-arc-sel", "line-trim-offset", [0, 0]);
        setPaint(map, "gl3d-arc-sel-glow", "line-trim-offset", [0, 0]);
      } else {
        const p = easeOut(t);
        setPaint(map, "gl3d-arc-sel", "line-trim-offset", [p, 1]);
        setPaint(map, "gl3d-arc-sel-glow", "line-trim-offset", [p, 1]);
        active = true;
      }
    }

    if (a.sweepStart !== null && rt.state?.sweep) {
      const t = (now - a.sweepStart) / 900;
      if (t >= 1) {
        a.sweepStart = null;
        setPaint(map, "gl3d-sweep", "line-opacity", 0);
      } else {
        const e = easeOut(t);
        setData(map, rt, SRC.sweep, fc([ringLine(rt.state.sweep.center, Math.max(1000, rt.state.sweep.radiusMeters * e), {}, 128)]), true);
        setPaint(map, "gl3d-sweep", "line-opacity", 0.12 * (1 - t) + 0.04);
        active = true;
      }
    }

    // the single looping animation: the selected pair's ring breathes (2.4 s) — not for shared-site pairs, whose
    // beacon already pulses in the 2D callout
    const sel = rt.state?.selected;
    if (sel && sel.basis === "measured" && !rt.input.reducedMotion) {
      const p = 0.5 - 0.5 * Math.cos((2 * Math.PI * (now % 2400)) / 2400);
      setPaint(map, "gl3d-ring", "line-opacity", 0.42 + 0.3 * p);
      setPaint(map, "gl3d-ring-glow", "line-opacity", 0.08 + 0.14 * p);
      active = true;
    } else {
      setPaint(map, "gl3d-ring", "line-opacity", 0.55);
      setPaint(map, "gl3d-ring-glow", "line-opacity", 0.14);
    }

    if (!active) return;
    // close-up open (map canvas hidden) or tab hidden: poll slowly instead of drawing
    if (paused) setTimeout(() => kick(map, rt), 500);
    else rt.raf = requestAnimationFrame(frame);
  };
  rt.raf = requestAnimationFrame(frame);
}

/** Model heights used by the map (native, metres) — exported for the close-up and the map key. */
export const MAP3D_MODEL_HEIGHTS = MODEL_HEIGHTS;
