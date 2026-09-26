import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { GeoDetail, Place, Project, Relation, SignalLevel } from "@/lib/domain/types";
import { formatMiles } from "@/lib/format";

const METERS_PER_MILE = 1609.344;

/** Sponsor rule: "Closer than 25 mi, we flag it. Farther, we ignore it." Adjustable in the UI. */
export const DEFAULT_THRESHOLD_MILES = 25;

/** Two named facilities this close are treated as the same site (e.g. both lines end at Thurmond). */
export const SAME_SITE_MILES = 0.6;

/** Relations that state, in a source, that two projects physically meet. */
export function siteRelations(a: Project, b: Project, relations: Relation[]): Relation[] {
  // any relation that names where the two projects meet counts (e.g. a joint initiative "meeting near Marion")
  return relations.filter(
    (r) =>
      (r.kind === "shared-site" || r.kind === "interconnects" || (r.kind === "same-initiative" && !!r.siteLabel)) &&
      ((r.projectA === a.id && r.projectB === b.id) || (r.projectA === b.id && r.projectB === a.id)),
  );
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
    places: pts,
  };
}

function sharedEndpoint(a: Project, b: Project): GeoDetail["sharedEndpoint"] | undefined {
  let best: GeoDetail["sharedEndpoint"] | undefined;
  for (const x of a.places.filter((pl) => pl.precision === "named-facility")) {
    for (const y of b.places.filter((pl) => pl.precision === "named-facility")) {
      const d = miles([x.lon, x.lat], [y.lon, y.lat]);
      if (d <= SAME_SITE_MILES && (!best || d < best.milesApart)) best = { labelA: x.label, labelB: y.label, milesApart: d };
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
      reason: `${verb} ${site}${stated ? "" : " (no single document names the handoff point)"}${center ? `; project centers are ≈${formatMiles(center.miles)} apart` : ""}.`,
      detail: { ...base, method: "shared-site" },
      approxMiles: center?.miles ?? 0,
    };
  }

  if (shared) {
    const same = shared.labelA === shared.labelB ? shared.labelA : `${shared.labelA} / ${shared.labelB}`;
    return {
      level: "confirmed",
      reason: `Both projects have a terminal at ${same} (geocoded to the same facility)${center ? `; centers ≈${formatMiles(center.miles)} apart` : ""}.`,
      detail: { ...base, method: "shared-endpoint" },
      approxMiles: center?.miles ?? 0,
    };
  }

  if (center) {
    const est = formatMiles(center.miles);
    const detail: GeoDetail = { ...base, method: "measured" };
    const caveat = center.lowConfidence ? " (a location is approximate or lower-confidence)" : "";
    // plan §8.4: locality-only evidence can make a possible match, never a precise mileage claim
    if (ca!.localityOnly || cb!.localityOnly) {
      const who = [ca!.localityOnly ? a.shortTitle : null, cb!.localityOnly ? b.shortTitle : null].filter(Boolean).join(" and ");
      return center.lowMiles <= thresholdMiles
        ? { level: "possible", reason: `${who} is located only to a town; the areas are roughly ${est} apart, which could be within ${thresholdMiles} mi.`, detail, approxMiles: center.miles }
        : { level: "no-match", reason: `Even the near edge of the town-level locations is beyond the ${thresholdMiles} mi radius.`, detail, approxMiles: center.miles };
    }
    if (center.highMiles <= thresholdMiles) {
      return { level: "confirmed", reason: `Project centers are ≈${est} apart${caveat} — inside the ${thresholdMiles} mi radius.`, detail, approxMiles: center.miles };
    }
    if (center.lowMiles <= thresholdMiles) {
      return {
        level: "possible",
        reason: `Project centers are ≈${est} apart${caveat}; within ${thresholdMiles} mi only at the near edge of the location uncertainty.`,
        detail,
        approxMiles: center.miles,
      };
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
      ? { level: "possible", reason: "Only county-level locations are published; the areas could be within the review radius.", detail }
      : { level: "no-match", reason: "Even the nearest edges of the published county-level areas are beyond the review radius.", detail };
  }

  return {
    level: "unknown",
    reason: "No usable location evidence for one of the projects; proximity is unknown.",
    detail: { ...base, method: "none" },
  };
}
