import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { GeoDetail, Place, Project, Relation, SignalLevel } from "@/lib/domain/types";
import { displayTitle, formatMilesNear } from "@/lib/format";

const METERS_PER_MILE = 1609.344;

/** Sponsor rule: "Closer than 25 mi, we flag it. Farther, we ignore it." Adjustable in the UI. */
export const DEFAULT_THRESHOLD_MILES = 25;

/** Two named facilities this close, with the same name, are treated as the same site (e.g. both lines end at Thurmond). */
export const SAME_SITE_MILES = 0.6;

/** Relations that state, in a source, that two projects physically meet. */
export function siteRelations(a: Project, b: Project, relations: Relation[]): Relation[] {
  return relations.filter(
    (r) =>
      (r.kind === "shared-site" || r.kind === "interconnects" || (r.kind === "same-initiative" && siteOnBoth(r, a, b))) &&
      ((r.projectA === a.id && r.projectB === b.id) || (r.projectA === b.id && r.projectB === a.id)),
  );
}

/**
 * A joint initiative is a place signal only when it names where the parts meet AND both projects have a place
 * there (G2B and MariBell both end at Marion). Sharing a program number (MISO LRTP Project 4) is not a site.
 */
function siteOnBoth(r: Relation, a: Project, b: Project): boolean {
  const site = r.siteLabel ? [...a.places, ...b.places].find((pl) => pl.id === r.sitePlaceId) : undefined;
  return !!site && [a, b].every((p) => p.places.some((pl) => pl.precision !== "county" && miles([pl.lon, pl.lat], [site.lon, site.lat]) <= SAME_SITE_MILES));
}

const LOCATED = new Set(["named-facility", "locality", "official-gis"]);

function located(p: Project): Place[] {
  return p.places.filter((pl) => LOCATED.has(pl.precision));
}

const miles = (x: [number, number], y: [number, number]) => distance(point(x), point(y), { units: "miles" });
const errMiles = (pl: Place) => pl.uncertaintyMeters / METERS_PER_MILE;

export interface Center {
  lonlat: [number, number];
  errorMiles: number;
  lowConfidence: boolean;
  /** Every point behind this center is a town-level geocode (plan §8.4: at most a "possible" match). */
  localityOnly: boolean;
  /** Some point behind this center is a town-level geocode. */
  anyLocality: boolean;
  places: Place[];
}

/**
 * Project center point, exactly as the sponsor's guide defines it: the midpoint of the project's two
 * named sub-points; if only one is located, that point. Endpoints are preferred over other places.
 */
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

/** The distinctive words of a facility name: "Thurmond Sub" and "Thurmond Dam" → thurmond; "West McIntosh" → west, mcintosh. */
export function facilityWords(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !GENERIC_FACILITY_WORDS.has(w))
    .sort()
    .join(" ");
}

/** Within SAME_SITE_MILES, two named facilities are one site when they are one geocode or carry the same name; distinct
 *  neighbors (McIntosh and West McIntosh, 0.46 mi; Jasper and Purrysburg, 0.57 mi) are measured, never equated. */
const sameFacility = (x: Place, y: Place, d: number) => d < 0.05 || facilityWords(x.label) === facilityWords(y.label);

function sharedEndpoint(a: Project, b: Project): GeoDetail["sharedEndpoint"] | undefined {
  // context places (e.g. the far terminal of a line whose rebuild stops short of it) are not the project's work sites
  const sites = (p: Project) => p.places.filter((pl) => pl.precision === "named-facility" && pl.role !== "context");
  let best: GeoDetail["sharedEndpoint"] | undefined;
  for (const x of sites(a)) {
    for (const y of sites(b)) {
      const d = miles([x.lon, x.lat], [y.lon, y.lat]);
      if (d <= SAME_SITE_MILES && sameFacility(x, y, d) && (!best || d < best.milesApart)) best = { labelA: x.label, labelB: y.label, milesApart: d };
    }
  }
  return best;
}

export interface GeoResult {
  level: SignalLevel;
  reason: string;
  detail: GeoDetail;
  /** Center distance in miles when measurable. */
  approxMiles?: number;
}

/**
 * Spatial signal (plan.md §8, aligned with the sponsor's Finding Real Locations guide):
 * 1. a source states both projects connect at the same facility → confirmed (text-supported)
 * 2. both projects have a named facility at the same coordinates → confirmed (shared endpoint)
 * 3. center-point distance vs the review radius with location uncertainty:
 *    d_low = max(0, d − e_A − e_B), d_high = d + e_A + e_B;  d_high ≤ T → confirmed, d_low ≤ T → possible
 * 4. county-only evidence is at most "possible" and never yields a mileage claim
 * 5. no usable location → unknown
 */
export function evaluateGeo(a: Project, b: Project, relations: Relation[], thresholdMiles = DEFAULT_THRESHOLD_MILES): GeoResult {
  const rels = siteRelations(a, b, relations);
  const ca = centerOf(a);
  const cb = centerOf(b);
  let center: GeoDetail["center"];
  if (ca && cb) {
    const d = miles(ca.lonlat, cb.lonlat);
    center = {
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
  const shared = sharedEndpoint(a, b);
  const base = { thresholdMiles, relationIds: rels.map((r) => r.id), center, sharedEndpoint: shared };

  if (rels.length) {
    const stated = rels.find((r) => r.basis !== "inferred");
    const rel = stated ?? rels[0];
    const site = rel.siteLabel ?? "a shared facility";
    const verb = stated ? "Sources state both projects connect at" : "Taken together, the sources imply both projects meet at";
    return {
      level: "confirmed",
      reason: `${verb} ${site}${stated ? "" : " (no single document names the handoff point)"}${center ? `; project centers are ≈${formatMilesNear(center.miles, thresholdMiles)} apart` : ""}.`,
      detail: { ...base, method: "shared-site" },
      approxMiles: center?.miles ?? 0,
    };
  }

  if (shared) {
    const same = shared.labelA === shared.labelB ? shared.labelA : `${shared.labelA} / ${shared.labelB}`;
    return {
      level: "confirmed",
      reason: `Both projects have a terminal at ${same} (geocoded to the same facility)${center ? `; centers ≈${formatMilesNear(center.miles, thresholdMiles)} apart` : ""}.`,
      detail: { ...base, method: "shared-endpoint" },
      approxMiles: center?.miles ?? 0,
    };
  }

  if (center) {
    const est = formatMilesNear(center.miles, thresholdMiles);
    const detail: GeoDetail = { ...base, method: "measured" };
    const caveat = center.lowConfidence ? " (a location is approximate or lower-confidence)" : "";
    // plan §8.4: locality-only evidence can make a possible match, never a precise mileage claim
    if (ca!.localityOnly || cb!.localityOnly) {
      const who = [ca!.localityOnly ? displayTitle(a) : null, cb!.localityOnly ? displayTitle(b) : null].filter(Boolean).join(" and ");
      return center.lowMiles <= thresholdMiles
        ? { level: "possible", reason: `${who} is located only approximately (town or road level); the areas are roughly ${est} apart, which could be within ${thresholdMiles} mi.`, detail, approxMiles: center.miles }
        : { level: "no-match", reason: `Even the near edge of the approximate locations is beyond the ${thresholdMiles} mi radius.`, detail, approxMiles: center.miles };
    }
    if (center.highMiles <= thresholdMiles) {
      return { level: "confirmed", reason: `Project centers are ≈${est} apart${caveat} — inside the ${thresholdMiles} mi radius.`, detail, approxMiles: center.miles };
    }
    if (center.lowMiles <= thresholdMiles) {
      const one = (x: number) => `${x.toFixed(1)} mi`;
      // named facilities, but the location uncertainty straddles the radius: say which side the point estimate is on
      const reason =
        center.miles <= thresholdMiles
          ? `Project centers are ≈${one(center.miles)} apart${caveat} — inside the ${thresholdMiles} mi radius, but the far edge of the location uncertainty (${one(center.highMiles)}) is beyond it.`
          : `Project centers are ≈${one(center.miles)} apart${caveat}; within ${thresholdMiles} mi only at the near edge of the location uncertainty (${one(center.lowMiles)}).`;
      return { level: "possible", reason, detail, approxMiles: center.miles };
    }
    return { level: "no-match", reason: `Project centers are ≈${est} apart — beyond the ${thresholdMiles} mi radius.`, detail, approxMiles: center.miles };
  }

  const cA = a.places.filter((pl) => pl.precision === "county");
  const cB = b.places.filter((pl) => pl.precision === "county");
  const anyA = ca || cA.length;
  const anyB = cb || cB.length;
  if (anyA && anyB) {
    const detail: GeoDetail = { ...base, method: "coarse" };
    const sameCounty = cA.find((x) => cB.some((y) => y.label === x.label));
    if (sameCounty) {
      return { level: "possible", reason: `Both list ${sameCounty.label}; county-level evidence cannot show the work sites are near each other.`, detail };
    }
    const pa: [[number, number], number][] = [...(ca ? [[ca.lonlat, ca.errorMiles] as [[number, number], number]] : []), ...cA.map((x) => [[x.lon, x.lat], errMiles(x)] as [[number, number], number])];
    const pb: [[number, number], number][] = [...(cb ? [[cb.lonlat, cb.errorMiles] as [[number, number], number]] : []), ...cB.map((x) => [[x.lon, x.lat], errMiles(x)] as [[number, number], number])];
    let low = Infinity;
    for (const [x, ex] of pa) for (const [y, ey] of pb) low = Math.min(low, Math.max(0, miles(x, y) - ex - ey));
    return low <= thresholdMiles
      ? { level: "possible", reason: `${countyOnlyText([ca ? null : a, cb ? null : b])}; the areas could be within the review radius.`, detail }
      : { level: "no-match", reason: "Even the nearest edges of the published county-level areas are beyond the review radius.", detail };
  }

  return {
    level: "unknown",
    reason: "No usable location evidence for one of the projects; proximity is unknown.",
    detail: { ...base, method: "none" },
  };
}

/** Which side of a coarse pair is known only by county (the other may sit at named facilities). */
export function countyOnlyText(sides: (Project | null)[]): string {
  const only = sides.filter((p): p is Project => !!p);
  return only.length === 1 ? `${displayTitle(only[0])} is located only at county level (no site published)` : "Only county-level locations are published for either project";
}
