import type { GeoDetail, Place, Project, Relation, SignalLevel } from "@/lib/domain/types";
import { displayTitle, formatMilesNear } from "@/lib/format";

const METERS_PER_MILE = 1609.344;
const KM_PER_MILE = 1.609344;
const SHARED_LAND_MILES = 1.6 / KM_PER_MILE;
const SITE_LOGISTICS_MILES = 8 / KM_PER_MILE;
const TOUCH_EPSILON_MILES = 0.01;

/** Challenge rule: closer than 40 km (about 25 mi) is flagged. Adjustable in the UI. */
export const DEFAULT_THRESHOLD_MILES = 25;

/** Two named facilities this close, with the same name, are treated as the same site. */
export const SAME_SITE_MILES = 0.6;

/** Relations that state, in a source, that two projects physically meet. */
export function siteRelations(a: Project, b: Project, relations: Relation[]): Relation[] {
  return relations.filter(
    (r) =>
      (r.kind === "shared-site" || r.kind === "interconnects" || (r.kind === "same-initiative" && siteOnBoth(r, a, b))) &&
      ((r.projectA === a.id && r.projectB === b.id) || (r.projectA === b.id && r.projectB === a.id)),
  );
}

function siteOnBoth(r: Relation, a: Project, b: Project): boolean {
  const site = r.siteLabel ? [...a.places, ...b.places].find((pl) => pl.id === r.sitePlaceId) : undefined;
  return !!site && [a, b].every((p) => p.places.some((pl) => pl.precision !== "county" && miles([pl.lon, pl.lat], [site.lon, site.lat]) <= SAME_SITE_MILES));
}

const LOCATED = new Set(["named-facility", "locality", "official-gis"]);

function located(p: Project): Place[] {
  return p.places.filter((pl) => LOCATED.has(pl.precision));
}

const miles = (x: [number, number], y: [number, number]) => {
  const rad = Math.PI / 180;
  const dLat = (y[1] - x[1]) * rad;
  const dLon = (y[0] - x[0]) * rad;
  const lat1 = x[1] * rad;
  const lat2 = y[1] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const errMiles = (pl: Place) => pl.uncertaintyMeters / METERS_PER_MILE;

export interface Center {
  lonlat: [number, number];
  errorMiles: number;
  lowConfidence: boolean;
  localityOnly: boolean;
  anyLocality: boolean;
  places: Place[];
}

/** Legacy starter-workbook center, retained for reproducing the supplied spreadsheet. */
export function centerOf(p: Project): Center | null {
  const loc = located(p);
  const endpoints = loc.filter((pl) => pl.role === "endpoint");
  const pts = (endpoints.length ? endpoints : loc).slice(0, 2);
  if (!pts.length) return null;
  const lon = pts.reduce((s, x) => s + x.lon, 0) / pts.length;
  const lat = pts.reduce((s, x) => s + x.lat, 0) / pts.length;
  return {
    lonlat: [lon, lat],
    errorMiles: pts.reduce((s, x) => s + errMiles(x), 0) / pts.length,
    lowConfidence: pts.some((x) => x.confidence === "lower-confidence" || x.precision === "locality"),
    localityOnly: pts.every((x) => x.precision === "locality"),
    anyLocality: pts.some((x) => x.precision === "locality"),
    places: pts,
  };
}

const GENERIC_FACILITY_WORDS = new Set(["substation", "sub", "station", "switching", "switchyard", "dam", "plant", "primary", "tap", "generating", "line", "terminal", "the", "new", "kv"]);

export function facilityWords(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !GENERIC_FACILITY_WORDS.has(w))
    .sort()
    .join(" ");
}

const sameFacility = (x: Place, y: Place, d: number) => d < 0.05 || facilityWords(x.label) === facilityWords(y.label);

interface SharedEndpoint {
  labelA: string;
  labelB: string;
  milesApart: number;
  a: [number, number];
  b: [number, number];
}

function sharedEndpoint(a: Project, b: Project): SharedEndpoint | undefined {
  const sites = (p: Project) => p.places.filter((pl) => pl.precision === "named-facility" && pl.role !== "context");
  let best: SharedEndpoint | undefined;
  for (const x of sites(a)) {
    for (const y of sites(b)) {
      const d = miles([x.lon, x.lat], [y.lon, y.lat]);
      if (d <= SAME_SITE_MILES && sameFacility(x, y, d) && (!best || d < best.milesApart)) {
        best = { labelA: x.label, labelB: y.label, milesApart: d, a: [x.lon, x.lat], b: [y.lon, y.lat] };
      }
    }
  }
  return best;
}

type Basis = NonNullable<GeoDetail["closest"]>["basisA"];
type Approximation = "none" | "whole" | "interior";

interface ProjectGeometry {
  kind: "line" | "points";
  coordinates: [number, number][];
  basis: Basis;
  approximation: Approximation;
  errorMiles: number;
  lowConfidence: boolean;
  localityOnly: boolean;
  anyLocality: boolean;
}

const LINE_ACTION = /\b(construct|build|rebuild|reconductor|restring|replace|reroute|relocate|upgrade)\w*\b[^.]{0,100}\b(lines?|circuits?|tie|tap)\b|\b(lines?|circuits?|tie|tap)\b[^.]{0,100}\b(construct|build|rebuild|reconductor|restring|replace|reroute|relocate|upgrade)\w*\b/i;
const SITE_EQUIPMENT = /\b(reactor|breaker|transformer|relay|capacitor|switching station|switchyard)\b/i;

function statedLengthMiles(p: Project): number | undefined {
  const fact = p.facts.find((f) => f.key === "lengthMiles");
  const raw = fact?.value ?? `${p.title} ${p.summary}`.match(/\b\d+(?:\.\d+)?\s*(?:mi(?:les?)?|mile(?:s?))\b/i)?.[0];
  const n = raw?.match(/\d+(?:\.\d+)?/)?.[0];
  return n === undefined ? undefined : Number(n);
}

/** Use a terminal chord only for material line work; short equipment work stays at its named work sites. */
function hasLineScope(p: Project): boolean {
  const text = `${p.title}. ${p.summary}`;
  const length = statedLengthMiles(p);
  if (length !== undefined && length < 1) return false;
  if (length === undefined && SITE_EQUIPMENT.test(text)) return false;
  return LINE_ACTION.test(text);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Prefer the facility explicitly named as the site of equipment work; fall back to all non-context places. */
function scopedWorkSites(p: Project, workSites: Place[]): Place[] {
  const text = `${p.title}. ${p.summary}`;
  const direct = workSites.filter((pl) => {
    const label = escapeRegExp(pl.label.replace(/\s+(?:substation|switching station|switchyard)$/i, ""));
    return new RegExp(`\\b(?:at|inside|within)\\s+(?:the\\s+)?${label}\\b|\\b(?:construct|build|expand)\\w*\\b[^.;]{0,50}\\b${label}\\b`, "i").test(text);
  });
  if (direct.length) return direct;
  const roleSites = workSites.filter((pl) => pl.role === "site");
  return roleSites.length ? roleSites : workSites;
}

export function geometryOf(p: Project): ProjectGeometry | null {
  if (p.route?.coordinates.length) {
    return {
      kind: p.route.coordinates.length > 1 ? "line" : "points",
      coordinates: p.route.coordinates,
      basis: p.route.precision === "official-gis" ? "official-route" : "digitized-route",
      approximation: p.route.precision === "official-gis" ? "none" : "whole",
      errorMiles: 0,
      lowConfidence: p.route.precision !== "official-gis",
      localityOnly: false,
      anyLocality: false,
    };
  }

  const workSites = located(p).filter((pl) => pl.role !== "context");
  if (!workSites.length) return null;
  const endpoints = workSites.filter((pl) => pl.role === "endpoint");
  const line = hasLineScope(p) && endpoints.length >= 2;
  const points = line ? endpoints.slice(0, 2) : scopedWorkSites(p, workSites);
  return {
    kind: line ? "line" : "points",
    coordinates: points.map((pl) => [pl.lon, pl.lat]),
    basis: line ? "terminal-segment" : "work-sites",
    approximation: line ? "interior" : "none",
    errorMiles: Math.max(...points.map(errMiles)),
    lowConfidence: points.some((pl) => pl.confidence === "lower-confidence" || pl.precision === "locality"),
    localityOnly: points.every((pl) => pl.precision === "locality"),
    anyLocality: points.some((pl) => pl.precision === "locality"),
  };
}

interface SegmentHit {
  a: [number, number];
  b: [number, number];
  miles: number;
  interiorA: boolean;
  interiorB: boolean;
  touching: boolean;
}

const cross = (a: [number, number], b: [number, number]) => a[0] * b[1] - a[1] * b[0];

function projected(a: [number, number], b: [number, number], p: [number, number]): { point: [number, number]; interior: boolean } {
  const lat = ((a[1] + b[1] + p[1]) / 3) * (Math.PI / 180);
  const scale = Math.cos(lat);
  const vx = (b[0] - a[0]) * scale;
  const vy = b[1] - a[1];
  const wx = (p[0] - a[0]) * scale;
  const wy = p[1] - a[1];
  const den = vx * vx + vy * vy;
  const raw = den ? (wx * vx + wy * vy) / den : 0;
  const t = Math.max(0, Math.min(1, raw));
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], interior: t > 1e-8 && t < 1 - 1e-8 };
}

function segmentClosest(a0: [number, number], a1: [number, number], b0: [number, number], b1: [number, number]): SegmentHit {
  const aPoint = a0[0] === a1[0] && a0[1] === a1[1];
  const bPoint = b0[0] === b1[0] && b0[1] === b1[1];
  if (aPoint && bPoint) {
    const d = miles(a0, b0);
    return { a: a0, b: b0, miles: d, interiorA: false, interiorB: false, touching: d <= TOUCH_EPSILON_MILES };
  }
  if (aPoint) {
    const hit = projected(b0, b1, a0);
    const d = miles(a0, hit.point);
    return { a: a0, b: hit.point, miles: d, interiorA: false, interiorB: hit.interior, touching: d <= TOUCH_EPSILON_MILES };
  }
  if (bPoint) {
    const hit = projected(a0, a1, b0);
    const d = miles(hit.point, b0);
    return { a: hit.point, b: b0, miles: d, interiorA: hit.interior, interiorB: false, touching: d <= TOUCH_EPSILON_MILES };
  }

  const lat = ((a0[1] + a1[1] + b0[1] + b1[1]) / 4) * (Math.PI / 180);
  const scale = Math.cos(lat);
  const p: [number, number] = [a0[0] * scale, a0[1]];
  const q: [number, number] = [b0[0] * scale, b0[1]];
  const r: [number, number] = [(a1[0] - a0[0]) * scale, a1[1] - a0[1]];
  const s: [number, number] = [(b1[0] - b0[0]) * scale, b1[1] - b0[1]];
  const den = cross(r, s);
  if (Math.abs(den) > 1e-12) {
    const qp: [number, number] = [q[0] - p[0], q[1] - p[1]];
    const t = cross(qp, s) / den;
    const u = cross(qp, r) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const at: [number, number] = [a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t];
      return { a: at, b: at, miles: 0, interiorA: t > 1e-8 && t < 1 - 1e-8, interiorB: u > 1e-8 && u < 1 - 1e-8, touching: true };
    }
  }

  const a0b = projected(b0, b1, a0);
  const a1b = projected(b0, b1, a1);
  const b0a = projected(a0, a1, b0);
  const b1a = projected(a0, a1, b1);
  const candidates: SegmentHit[] = [
    { a: a0, b: a0b.point, miles: miles(a0, a0b.point), interiorA: false, interiorB: a0b.interior, touching: false },
    { a: a1, b: a1b.point, miles: miles(a1, a1b.point), interiorA: false, interiorB: a1b.interior, touching: false },
    { a: b0a.point, b: b0, miles: miles(b0a.point, b0), interiorA: b0a.interior, interiorB: false, touching: false },
    { a: b1a.point, b: b1, miles: miles(b1a.point, b1), interiorA: b1a.interior, interiorB: false, touching: false },
  ];
  const best = candidates.sort((x, y) => x.miles - y.miles)[0];
  return { ...best, touching: best.miles <= TOUCH_EPSILON_MILES };
}

function geometrySegments(g: ProjectGeometry): [[number, number], [number, number]][] {
  if (g.kind === "points") return g.coordinates.map((p) => [p, p]);
  return g.coordinates.slice(0, -1).map((p, i) => [p, g.coordinates[i + 1]]);
}

function tierOf(d: number, touching: boolean, thresholdMiles: number): NonNullable<GeoDetail["closest"]>["tier"] {
  if (touching) return "touching-crossing";
  if (d < SHARED_LAND_MILES) return "shared-land";
  if (d < SITE_LOGISTICS_MILES) return "site-logistics";
  if (d < thresholdMiles) return "crews-equipment";
  return "outside";
}

function closestApproach(a: Project, b: Project, thresholdMiles: number): GeoDetail["closest"] | undefined {
  const ga = geometryOf(a);
  const gb = geometryOf(b);
  if (!ga || !gb) return undefined;
  let best: SegmentHit | undefined;
  for (const [a0, a1] of geometrySegments(ga)) {
    for (const [b0, b1] of geometrySegments(gb)) {
      const hit = segmentClosest(a0, a1, b0, b1);
      if (!best || hit.miles < best.miles) best = hit;
    }
  }
  if (!best) return undefined;
  const error = ga.errorMiles + gb.errorMiles;
  const approximate = ga.approximation === "whole" || gb.approximation === "whole" || (ga.approximation === "interior" && best.interiorA) || (gb.approximation === "interior" && best.interiorB);
  return {
    miles: best.miles,
    lowMiles: Math.max(0, best.miles - error),
    highMiles: best.miles + error,
    a: best.a,
    b: best.b,
    basisA: ga.basis,
    basisB: gb.basis,
    approximate,
    lowConfidence: ga.lowConfidence || gb.lowConfidence || approximate,
    localityOnly: ga.localityOnly || gb.localityOnly,
    anyLocality: ga.anyLocality || gb.anyLocality,
    touching: best.touching,
    tier: tierOf(best.miles, best.touching, thresholdMiles),
  };
}

function legacyCenter(a: Project, b: Project): GeoDetail["center"] | undefined {
  const ca = centerOf(a);
  const cb = centerOf(b);
  if (!ca || !cb) return undefined;
  const d = miles(ca.lonlat, cb.lonlat);
  return {
    miles: d,
    lowMiles: Math.max(0, d - ca.errorMiles - cb.errorMiles),
    highMiles: d + ca.errorMiles + cb.errorMiles,
    a: ca.lonlat,
    b: cb.lonlat,
    lowConfidence: ca.lowConfidence || cb.lowConfidence,
    localityOnly: ca.localityOnly || cb.localityOnly,
    anyLocality: ca.anyLocality || cb.anyLocality,
  };
}

function touchingDetail(c: GeoDetail["closest"] | undefined, thresholdMiles: number, a?: [number, number], b?: [number, number]): GeoDetail["closest"] | undefined {
  return {
    miles: 0,
    lowMiles: 0,
    highMiles: 0,
    ...(a && b ? { a, b } : c?.touching && c.a && c.b ? { a: c.a, b: c.b } : {}),
    basisA: c?.basisA ?? "work-sites",
    basisB: c?.basisB ?? "work-sites",
    approximate: false,
    lowConfidence: false,
    localityOnly: false,
    anyLocality: false,
    touching: true,
    tier: tierOf(0, true, thresholdMiles),
  };
}

export interface GeoResult {
  level: SignalLevel;
  reason: string;
  detail: GeoDetail;
  /** Closest-approach distance in miles when measurable. */
  approxMiles?: number;
}

/** Spatial signal using the challenge's closest-points rule. */
export function evaluateGeo(a: Project, b: Project, relations: Relation[], thresholdMiles = DEFAULT_THRESHOLD_MILES): GeoResult {
  const rels = siteRelations(a, b, relations);
  const center = legacyCenter(a, b);
  const measured = closestApproach(a, b, thresholdMiles);
  const shared = sharedEndpoint(a, b);
  const base = { thresholdMiles, relationIds: rels.map((r) => r.id), center, sharedEndpoint: shared && { labelA: shared.labelA, labelB: shared.labelB, milesApart: shared.milesApart } };

  if (rels.length) {
    const stated = rels.find((r) => r.basis !== "inferred");
    const rel = stated ?? rels[0];
    const site = rel.siteLabel ?? "a shared facility";
    const verb = stated ? "Sources state both projects connect at" : "Taken together, the sources imply both projects meet at";
    const closest = touchingDetail(measured, thresholdMiles);
    return {
      level: "confirmed",
      reason: `${verb} ${site}${stated ? "" : " (no single document names the handoff point)"}; closest approach is touching/shared-site.`,
      detail: { ...base, closest, method: "shared-site" },
      approxMiles: 0,
    };
  }

  if (shared) {
    const same = shared.labelA === shared.labelB ? shared.labelA : `${shared.labelA} / ${shared.labelB}`;
    const closest = touchingDetail(measured, thresholdMiles, shared.a, shared.b);
    return {
      level: "confirmed",
      reason: `Both projects have a terminal at ${same}; closest approach is touching/shared-site.`,
      detail: { ...base, closest, method: "shared-endpoint" },
      approxMiles: 0,
    };
  }

  if (measured) {
    const est = formatMilesNear(measured.miles, thresholdMiles);
    const detail: GeoDetail = { ...base, closest: measured, method: "measured" };
    const caveat = measured.approximate ? " (uses an inferred or digitized line path)" : measured.lowConfidence ? " (a location is approximate or lower-confidence)" : "";
    if (measured.localityOnly) {
      return measured.lowMiles < thresholdMiles
        ? { level: "possible", reason: `A project is located only approximately (town or road level); the closest mapped areas are roughly ${est} apart and could be within ${thresholdMiles} mi.`, detail, approxMiles: measured.miles }
        : { level: "no-match", reason: `Even the near edge of the approximate locations is beyond the ${thresholdMiles} mi radius.`, detail, approxMiles: measured.miles };
    }
    if (measured.approximate && measured.lowMiles < thresholdMiles) {
      return { level: "possible", reason: `Closest approach is ≈${est}${caveat}; confirm the actual line alignment before treating it as inside the ${thresholdMiles} mi radius.`, detail, approxMiles: measured.miles };
    }
    if (measured.highMiles < thresholdMiles) {
      return { level: "confirmed", reason: `Closest project points are ≈${est} apart${caveat} — inside the ${thresholdMiles} mi radius.`, detail, approxMiles: measured.miles };
    }
    if (measured.lowMiles < thresholdMiles) {
      const one = (x: number) => `${x.toFixed(1)} mi`;
      const reason =
        measured.miles < thresholdMiles
          ? `Closest project points are ≈${one(measured.miles)} apart${caveat} — inside the ${thresholdMiles} mi radius, but the far edge of location uncertainty (${one(measured.highMiles)}) is beyond it.`
          : `Closest project points are ≈${one(measured.miles)} apart${caveat}; within ${thresholdMiles} mi only at the near edge of location uncertainty (${one(measured.lowMiles)}).`;
      return { level: "possible", reason, detail, approxMiles: measured.miles };
    }
    return { level: "no-match", reason: `Closest project points are ≈${est} apart — beyond the ${thresholdMiles} mi radius.`, detail, approxMiles: measured.miles };
  }

  const cA = a.places.filter((pl) => pl.precision === "county");
  const cB = b.places.filter((pl) => pl.precision === "county");
  const ca = centerOf(a);
  const cb = centerOf(b);
  const anyA = ca || cA.length;
  const anyB = cb || cB.length;
  if (anyA && anyB) {
    const detail: GeoDetail = { ...base, method: "coarse" };
    const sameCounty = cA.find((x) => cB.some((y) => y.label === x.label));
    if (sameCounty) return { level: "possible", reason: `Both list ${sameCounty.label}; county-level evidence cannot show whether the work sites are near each other.`, detail };
    const pa: [[number, number], number][] = [...(ca ? [[ca.lonlat, ca.errorMiles] as [[number, number], number]] : []), ...cA.map((x) => [[x.lon, x.lat], errMiles(x)] as [[number, number], number])];
    const pb: [[number, number], number][] = [...(cb ? [[cb.lonlat, cb.errorMiles] as [[number, number], number]] : []), ...cB.map((x) => [[x.lon, x.lat], errMiles(x)] as [[number, number], number])];
    let low = Infinity;
    for (const [x, ex] of pa) for (const [y, ey] of pb) low = Math.min(low, Math.max(0, miles(x, y) - ex - ey));
    return low < thresholdMiles
      ? { level: "possible", reason: `${countyOnlyText([ca ? null : a, cb ? null : b])}; the areas could be within the review radius.`, detail }
      : { level: "no-match", reason: "Even the nearest edges of the published county-level areas are beyond the review radius.", detail };
  }

  return { level: "unknown", reason: "No usable location evidence for one of the projects; proximity is unknown.", detail: { ...base, method: "none" } };
}

export function countyOnlyText(sides: (Project | null)[]): string {
  const only = sides.filter((p): p is Project => !!p);
  return only.length === 1 ? `${displayTitle(only[0])} is located only at county level (no site published)` : "Only county-level locations are published for either project";
}
