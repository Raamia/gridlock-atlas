import { IDX } from "@/lib/data";
import type { Match, Place, Precision, Project } from "@/lib/domain/types";
import { displayTitle, formatMilesNear } from "@/lib/format";
import { voltageOf, workKind } from "@/lib/impact";
import { sharedSite, TOUCH_MILES } from "@/lib/mapdata";
import { centerOf } from "@/lib/matching/geo";
import { ownerNames } from "@/lib/selectors";

/*
 * The 3D pair close-up's scene model (SPEC §7, honesty rules of §6.2), derived purely from the snapshot:
 *
 * - positions are TO SCALE: a local equirectangular projection around the frame center (centroid of both project
 *   centers and the shared site), x = east, z = south, then uniformly scaled so the plinth always has radius PLINTH_R.
 * - structures are SYMBOLIC: one constant size in scene units whatever the plinth covers (the caption says so).
 * - kind comes from workKind() (lib/impact.ts): line-* → line, substation-* → substation (same as the map scene).
 * - named-facility / official-GIS endpoints get a structure; other precise places a small hollow marker; locality or
 *   lower-confidence places a translucent uncertainty disc (radius = uncertaintyMeters, ≥1.5 km); county → nothing.
 * - towers + wires only along official-GIS routes; digitized routes stay dashed on the ground; any other line gets a
 *   dashed ground chord between its two center-defining endpoints ("route not published · drawn terminal to terminal").
 * - the distance drawn is the engine's closest approach (geoDetail.closest): a ruler between the two closest points and
 *   the review ring around A's. Project pins stand at the starter-workbook centers, as positions only. Pairs that touch
 *   (a shared site or terminal, crossing lines) get no ruler: their links run from each pin to where they meet.
 */

export const PLINTH_R = 10;
export const KM_PER_MILE = 1.609344;
/** Plinth radius = max(1.25 × the farthest drawn element from the frame center, 3 mi). */
const PLINTH_FACTOR = 1.25;
const PLINTH_MIN_MILES = 3;
/** Two structures closer than this are one site (one model, shared tint). */
const SAME_SITE_KM = 0.35;
/** Locality halos never drawn smaller than this (matches the map's locality halo floor). */
const MIN_DISC_M = 1500;

export type Side = "a" | "b";
export type StructureKind = "substation" | "line";
export type Treatment = "structure" | "marker" | "disc";
export type LinkBasis = "measured" | "shared-site" | "shared-endpoint" | "coarse" | "none";

export interface V2 {
  x: number;
  z: number;
}

export interface CuPlace {
  id: string;
  label: string;
  side: Side;
  pos: V2;
  precision: Precision;
  treatment: Treatment;
  /** Disc radius (scene units) for `disc`. */
  radius: number;
  /** Structure shared by both projects (or standing at the shared site): drawn once, neutral tint. */
  shared: boolean;
  /** Another structure/marker already stands here: not drawn (its label is not repeated). */
  hidden: boolean;
  /** Shown as a small facility label. */
  labelled: boolean;
  role: "endpoint" | "context" | "other";
}

export interface CuRoute {
  precision: "official-gis" | "official-map-digitized";
  pts: V2[];
}

export interface CuProject {
  side: Side;
  id: string;
  owner: string;
  title: string;
  kind: StructureKind;
  kv: number | null;
  /** Voltage-class height multiplier (≤115 kV ×0.8, 161–230 ×1.0, 345 ×1.3, 500–765 ×1.6); null = unknown → pylon. */
  heightMul: number | null;
  center: V2 | null;
  /** How the sponsor-method center was derived: "midpoint of Okatie & McIntosh" / "at McIntosh". */
  centerNote: string;
  places: CuPlace[];
  route: CuRoute | null;
  /** Line without a published route: dashed ground chord between its two center-defining endpoints. */
  chord: [V2, V2] | null;
  /** The project is located only at county level: nothing is drawn for it. */
  countyOnly: boolean;
}

export interface CuSite {
  pos: V2;
  label: string;
  /** "stated in source" / "implied by sources" / "both projects end here" */
  basis: string;
}

export interface CuRingArc {
  pts: V2[];
}

export interface CloseupModel {
  id: string;
  basis: LinkBasis;
  /** Closest approach (0 when the projects touch; null without one: county-level or unlocated). */
  miles: number | null;
  /** The closest approach rests on an inferred line path or an approximate location ("≈"). */
  approx: boolean;
  /** It depends on a digitized or inferred line path: said as "estimated". */
  estimated: boolean;
  thresholdMiles: number;
  /** Closest points within the review radius. */
  within: boolean;
  beyondRadius: boolean;
  /** Place signal is only "possible": links render at 50% (B1). */
  possible: boolean;
  a: CuProject;
  b: CuProject;
  site: CuSite | null;
  /** A's and B's closest points: the ruler's ends (null when the projects touch or no closest approach is mapped). */
  closest: { a: V2; b: V2 } | null;
  /** The projects touch (shared site or terminal, crossing lines): a zero-mile closest approach, never ruled off. */
  touching: boolean;
  /** Where the projects touch when no shared site marks it (crossing lines): the pins' links meet here. */
  touch: V2 | null;
  unitsPerMile: number;
  plinthMiles: number;
  /** Grid spacing in miles (1 · 2 · 5 · 10 …): the plinth is a to-scale map. */
  gridMiles: number;
  /** Tick spacing along the closest-approach ruler, miles. */
  tickMiles: number;
  /** The review-radius ring around A's closest point: the arcs that fall on the plinth, and where its label goes. */
  ring: {
    center: V2;
    r: number;
    arcs: CuRingArc[];
    /** The ring point toward B (or the shared site), when it lies on the plinth. */
    labelAt: V2 | null;
    /** Preferred label angle on the ring (radians in the x–z plane, toward B / the site); the label layer searches around it. */
    labelAngle: number | null;
    onPlinth: boolean;
  } | null;
  /** "6.4 mi of 25 mi" etc. (null when there is no closest approach to rule off: touching, county-level, unlocated). */
  rulerText: string | null;
  rulerFill: number;
  legend: LegendKey[];
  /** One plain sentence for assistive tech (the canvas itself is aria-hidden). */
  summary: string;
}

export type LegendKey = "substation" | "pylon" | "marker" | "disc" | "gis-route" | "schematic" | "chord" | "closest-link" | "site-link" | "touch-link" | "ring";

const DEG = Math.PI / 180;

function heightMulOf(kv: number | null): number | null {
  if (kv == null) return null;
  if (kv <= 138) return 0.8;
  if (kv <= 230) return 1.0;
  if (kv <= 345) return 1.3;
  return 1.6;
}

const FACILITY = /substation|station|switch|yard|plant|terminal|tap|dam/i;

function treatmentOf(pl: Place): Treatment | null {
  if (pl.precision === "county" || pl.precision === "unknown") return null;
  if (pl.precision === "locality" || pl.confidence === "lower-confidence") return "disc";
  const precise = pl.precision === "named-facility" || pl.precision === "official-gis";
  if (precise && pl.role === "endpoint" && (pl.kind === "substation" || pl.kind === "switching-station" || FACILITY.test(pl.label))) return "structure";
  return "marker";
}

/** "Okatie – McIntosh 115kV Tie: Add Series Reactor" → "Okatie – McIntosh 115kV Tie" (≤ n chars). */
export function shortName(p: Project, n = 40): string {
  const full = displayTitle(p);
  const src = p.shortTitle && !p.shortTitle.endsWith("…") ? p.shortTitle : full;
  const base = src.replace(/\s*[:(].*$/, "").trim() || full;
  if (base.length <= n) return base;
  const cut = base.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,–-]+$/, "")}…`;
}

function niceStep(miles: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50];
  return steps.find((s) => miles / s <= 9) ?? 100;
}

/** Build the close-up model for a flagged pair. Pure (no DOM, no three). */
export function buildCloseupModel(m: Match, pa: Project, pb: Project, thresholdMiles: number): CloseupModel {
  const ca = centerOf(pa);
  const cb = centerOf(pb);
  const site = sharedSite(m);
  const anchors: [number, number][] = [ca?.lonlat, cb?.lonlat, site ? ([site.lon, site.lat] as [number, number]) : undefined].filter(
    (x): x is [number, number] => !!x,
  );
  if (!anchors.length) {
    for (const p of [pa, pb]) for (const pl of p.places) if (pl.precision !== "county") anchors.push([pl.lon, pl.lat]);
  }
  const lon0 = anchors.reduce((s, x) => s + x[0], 0) / Math.max(1, anchors.length);
  const lat0 = anchors.reduce((s, x) => s + x[1], 0) / Math.max(1, anchors.length);
  const kx = 111.32 * Math.cos(lat0 * DEG);
  const kz = 110.574;
  const km = (lonlat: [number, number]): V2 => ({ x: (lonlat[0] - lon0) * kx, z: -(lonlat[1] - lat0) * kz });

  // ---- pass 1: everything in km, and the farthest drawn extent ----
  let far = 0;
  const reach = (v: V2, extra = 0) => {
    far = Math.max(far, Math.hypot(v.x, v.z) + extra);
  };

  interface Raw {
    p: Project;
    side: Side;
    center: V2 | null;
    places: (Omit<CuPlace, "pos" | "radius"> & { km: V2; radiusKm: number })[];
    route: { precision: CuRoute["precision"]; km: V2[] } | null;
    chord: [V2, V2] | null;
    kind: StructureKind;
    centerNote: string;
  }

  const raw: Raw[] = [
    { p: pa, side: "a", c: ca },
    { p: pb, side: "b", c: cb },
  ].map(({ p, side, c }) => {
    const kind: StructureKind = workKind(p).startsWith("line") ? "line" : "substation";
    const center = c ? km(c.lonlat) : null;
    if (center) reach(center);
    const places: Raw["places"] = [];
    for (const pl of p.places) {
      const t = treatmentOf(pl);
      if (!t) continue;
      const v = km([pl.lon, pl.lat]);
      const radiusKm = t === "disc" ? Math.max(pl.uncertaintyMeters, MIN_DISC_M) / 1000 : 0;
      reach(v, radiusKm);
      places.push({
        id: pl.id,
        label: pl.label,
        side: side as Side,
        km: v,
        radiusKm,
        precision: pl.precision,
        treatment: t,
        shared: false,
        hidden: false,
        labelled: t !== "marker",
        role: pl.role === "endpoint" ? "endpoint" : pl.role === "context" ? "context" : "other",
      });
    }
    let route: Raw["route"] = null;
    if (kind === "line" && p.route && (p.route.precision === "official-gis" || p.route.precision === "official-map-digitized") && p.route.coordinates.length > 1) {
      route = { precision: p.route.precision, km: p.route.coordinates.map((xy) => km([xy[0], xy[1]])) };
      route.km.forEach((v) => reach(v));
    }
    let chord: [V2, V2] | null = null;
    if (kind === "line" && !route && c && c.places.length >= 2) {
      chord = [km([c.places[0].lon, c.places[0].lat]), km([c.places[1].lon, c.places[1].lat])];
    }
    const centerNote = !c ? "" : c.places.length >= 2 ? `midpoint of ${c.places[0].label} & ${c.places[1].label}` : `at ${c.places[0].label}`;
    return { p, side: side as Side, center, places, route, chord, kind, centerNote };
  });

  const siteKm = site ? km([site.lon, site.lat]) : null;
  if (siteKm) reach(siteKm);

  // the closest approach: its two points (a measured gap), or the one point where the projects touch
  const gd = m.geoDetail;
  const c = gd.closest;
  const touching = !!c && (c.touching || c.miles < TOUCH_MILES);
  const closestKm = c?.a && c.b && !touching ? { a: km(c.a), b: km(c.b) } : null;
  const touchKm = touching && c?.a ? km(c.a) : null;
  for (const v of [closestKm?.a, closestKm?.b, touchKm]) if (v) reach(v);

  const plinthKm = Math.max(PLINTH_FACTOR * far, PLINTH_MIN_MILES * KM_PER_MILE);
  const u = PLINTH_R / plinthKm; // scene units per km
  const toU = (v: V2): V2 => ({ x: v.x * u, z: v.z * u });

  // ---- pass 2: dedupe structures / markers that stand on the same site ----
  const kept: { km: V2; place: Raw["places"][number] }[] = [];
  const near = (x: V2, y: V2, d = SAME_SITE_KM) => Math.hypot(x.x - y.x, x.z - y.z) <= d;
  for (const r of raw) {
    for (const pl of r.places) {
      if (pl.treatment !== "structure") continue;
      const other = kept.find((k) => near(k.km, pl.km));
      if (other) {
        pl.hidden = true;
        if (other.place.side !== pl.side) other.place.shared = true;
      } else kept.push({ km: pl.km, place: pl });
    }
  }
  for (const r of raw) {
    for (const pl of r.places) {
      if (pl.treatment !== "marker") continue;
      if (kept.some((k) => near(k.km, pl.km))) pl.hidden = true;
      else kept.push({ km: pl.km, place: pl });
    }
  }
  if (siteKm) for (const k of kept) if (near(k.km, siteKm, 0.5)) k.place.shared = true;
  // one facility label per name
  const seen = new Set<string>();
  for (const r of raw) {
    for (const pl of r.places) {
      const key = pl.label.toLowerCase().replace(/\s+(substation|sub|station)\b.*$/, "");
      if (pl.hidden || !pl.labelled || seen.has(key)) pl.labelled = false;
      else seen.add(key);
    }
  }
  // the shared-site beacon carries its own label; don't repeat it on the structure below
  if (siteKm) for (const r of raw) for (const pl of r.places) if (near(pl.km, siteKm, 0.5)) pl.labelled = false;

  const projects = raw.map<CuProject>((r) => {
    const kv = voltageOf(r.p);
    const countyOnly = !r.center && r.p.places.every((pl) => pl.precision === "county" || pl.precision === "unknown");
    return {
      side: r.side,
      id: r.p.id,
      owner: ownerNames(r.p, IDX, true),
      title: shortName(r.p),
      kind: r.kind,
      kv,
      heightMul: heightMulOf(kv),
      center: r.center ? toU(r.center) : null,
      centerNote: r.centerNote,
      places: r.places.map(({ km: v, radiusKm, ...rest }) => ({ ...rest, pos: toU(v), radius: radiusKm * u })),
      route: r.route ? { precision: r.route.precision, pts: r.route.km.map(toU) } : null,
      chord: r.chord ? [toU(r.chord[0]), toU(r.chord[1])] : null,
      countyOnly,
    };
  });
  const [a, b] = projects;

  // ---- link, rule, ring ----
  const basis: LinkBasis = gd.method === "measured" || gd.method === "shared-site" || gd.method === "shared-endpoint" || gd.method === "coarse" ? gd.method : "none";
  const miles = c?.miles ?? null;
  const within = miles != null && miles <= thresholdMiles;
  const unitsPerMile = u * KM_PER_MILE;
  const approx = !!c && (c.approximate || c.lowConfidence);
  const estimated = !!c?.approximate;
  const closest = closestKm ? { a: toU(closestKm.a), b: toU(closestKm.b) } : null;
  const touchAt = touchKm ? toU(touchKm) : null;
  const siteAt = siteKm ? toU(siteKm) : null;

  // the rule is about closest points: the ring is centred on A's (a touching pair: where they meet)
  const ringAt = closest?.a ?? touchAt ?? (touching ? siteAt : null);
  let ring: CloseupModel["ring"] = null;
  if (ringAt) {
    const r = thresholdMiles * unitsPerMile;
    const arcs: CuRingArc[] = [];
    let cur: V2[] = [];
    const N = 360;
    const lim = PLINTH_R - 0.06;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      const p = { x: ringAt.x + Math.cos(t) * r, z: ringAt.z + Math.sin(t) * r };
      if (Math.hypot(p.x, p.z) <= lim) cur.push(p);
      else if (cur.length) {
        if (cur.length > 1) arcs.push({ pts: cur });
        cur = [];
      }
    }
    if (cur.length > 1) {
      // join a run that wraps across angle 0
      if (arcs.length && Math.hypot(arcs[0].pts[0].x - cur[cur.length - 1].x, arcs[0].pts[0].z - cur[cur.length - 1].z) < 0.2) arcs[0].pts = [...cur, ...arcs[0].pts];
      else arcs.push({ pts: cur });
    }
    // toward B's closest point, or (touching) B's pin, so the label sits on B's side; north when they coincide
    const toward = closest?.b ?? b.center ?? siteAt;
    let labelAt: V2 | null = null;
    let labelAngle: number | null = null;
    if (toward) {
      const dx = toward.x - ringAt.x;
      const dz = toward.z - ringAt.z;
      labelAngle = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dz, dx) : -Math.PI / 2;
      const p = { x: ringAt.x + Math.cos(labelAngle) * r, z: ringAt.z + Math.sin(labelAngle) * r };
      if (Math.hypot(p.x, p.z) <= lim) labelAt = p;
    }
    ring = { center: ringAt, r, arcs, labelAt, labelAngle, onPlinth: arcs.length > 0 };
  }

  // only a measured gap is ruled off: a touching pair (shared facility, crossing lines) never reads "0.0 mi apart"
  const milesText = miles != null ? formatMilesNear(miles, thresholdMiles) : "";
  const rulerText = closest && miles != null ? `${approx && !milesText.startsWith("<") ? "≈" : ""}${milesText} of ${thresholdMiles} mi` : null;

  const siteBasis = site ? (gd.method === "shared-endpoint" ? "both projects end here" : site.implied ? "implied by sources" : "stated in source") : "";

  // ---- legend (only what is drawn) ----
  const legend = new Set<LegendKey>();
  for (const p of projects) {
    for (const pl of p.places) {
      if (pl.hidden) continue;
      if (pl.treatment === "structure") legend.add(p.heightMul == null ? "pylon" : "substation");
      if (pl.treatment === "marker") legend.add("marker");
      if (pl.treatment === "disc") legend.add("disc");
    }
    if (p.route?.precision === "official-gis") legend.add("gis-route");
    if (p.route?.precision === "official-map-digitized") legend.add("schematic");
    if (p.chord) legend.add("chord");
  }
  if (site) legend.add("site-link");
  else if (touchAt) legend.add("touch-link");
  else if (closest) legend.add("closest-link");
  if (ring?.onPlinth) legend.add("ring");

  const who = (p: CuProject) => `${p.title} (${p.owner})`;
  const distance = site
    ? m.beyondRadius
      ? `flagged through the shared site ${site.label} (${siteBasis}), beyond the ${thresholdMiles} mi radius`
      : `both reach ${site.label} (${siteBasis}), so they touch there`
    : touching
      ? basis === "measured"
        ? "their mapped work geometries touch or cross"
        : "they share a facility, so they touch"
      : rulerText
        ? `closest approach ${rulerText}${estimated ? " (estimated)" : ""}`
        : "one project is located only at county level, so no distance is drawn";
  const summary = `3D close-up of ${who(a)} and ${who(b)}: ${distance}. Centers, terminals and closest points are placed to scale from the snapshot; structures are symbolic, not survey geometry.`;

  return {
    id: m.id,
    basis,
    miles,
    approx,
    estimated,
    thresholdMiles,
    within,
    beyondRadius: !!m.beyondRadius,
    possible: m.geo === "possible",
    a,
    b,
    site: site && siteAt ? { pos: siteAt, label: site.label, basis: siteBasis } : null,
    closest,
    touching,
    touch: site ? null : touchAt,
    unitsPerMile,
    plinthMiles: plinthKm / KM_PER_MILE,
    gridMiles: niceStep(plinthKm / KM_PER_MILE),
    tickMiles: miles == null ? 1 : miles < 12 ? 1 : miles < 40 ? 5 : 10,
    ring,
    rulerText,
    rulerFill: miles == null ? 0 : Math.min(1, miles / thresholdMiles),
    legend: [...legend],
    summary,
  };
}

/** Polyline length in scene units. */
export function polyLength(pts: V2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return s;
}

/** Points (and unit tangents) at equal arc-length spacing along a polyline, ends included. */
export function alongPolyline(pts: V2[], count: number): { p: V2; t: V2 }[] {
  const total = polyLength(pts);
  const out: { p: V2; t: V2 }[] = [];
  if (pts.length < 2 || total === 0) return out;
  let seg = 0;
  let segStart = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / Math.max(1, count - 1)) * total;
    while (seg < pts.length - 2) {
      const len = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].z - pts[seg].z);
      if (segStart + len >= target) break;
      segStart += len;
      seg++;
    }
    const p0 = pts[seg];
    const p1 = pts[seg + 1];
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    const k = Math.min(1, Math.max(0, (target - segStart) / len));
    out.push({ p: { x: p0.x + (p1.x - p0.x) * k, z: p0.z + (p1.z - p0.z) * k }, t: { x: (p1.x - p0.x) / len, z: (p1.z - p0.z) / len } });
  }
  return out;
}
