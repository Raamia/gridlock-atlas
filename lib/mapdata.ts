import circle from "@turf/circle";
import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson";
import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match, Project } from "@/lib/domain/types";

export type Role = "a" | "b" | "hover" | "other" | "all" | "u1" | "u2";

/**
 * In overview, each region's two focal utilities get the A/B hues so both plans are visible at a glance;
 * everyone else stays neutral. The pair view always uses cyan = A, violet = B.
 */
export const FOCAL_UTILITIES: Record<string, [string, string]> = {
  southeast: ["desc", "gpc"],
  "upper-midwest": ["dairyland", "xcel-nspw"],
  "southern-plains": ["xcel-sps", "transource-ok"],
};

export function overviewRole(p: Project): Role {
  const focal = FOCAL_UTILITIES[p.region];
  if (!focal) return "all";
  const owners = p.owners.map((o) => o.utilityId);
  if (owners.includes(focal[0])) return "u1";
  if (owners.includes(focal[1])) return "u2";
  return "all";
}

export interface RoleContext {
  pair: { a: string; b: string } | null;
  hoveredProjectId: string | null;
  visibleProjectIds: Set<string>;
}

export function roleOf(projectId: string, ctx: RoleContext): Role {
  if (ctx.pair) {
    if (projectId === ctx.pair.a) return "a";
    if (projectId === ctx.pair.b) return "b";
    return "other";
  }
  if (ctx.hoveredProjectId) return projectId === ctx.hoveredProjectId ? "hover" : "other";
  const p = SNAPSHOT.projects.find((x) => x.id === projectId);
  return p ? overviewRole(p) : "all";
}

type Props = { projectId: string; role: Role; label?: string; precision?: string; kind?: string; title?: string; context?: boolean; onSite?: boolean };

function fc<G extends Geometry>(features: Feature<G, Props>[]): FeatureCollection<G, Props> {
  return { type: "FeatureCollection", features };
}

/** Routes are only drawn when a source describes or maps them; digitized ones are dashed. */
export function routeFeatures(ctx: RoleContext) {
  const out: Feature<LineString, Props>[] = [];
  for (const p of SNAPSHOT.projects) {
    if (!p.route || !ctx.visibleProjectIds.has(p.id)) continue;
    out.push({
      type: "Feature",
      properties: { projectId: p.id, role: roleOf(p.id, ctx), precision: p.route.precision, title: p.shortTitle },
      geometry: { type: "LineString", coordinates: p.route.coordinates },
    });
  }
  return fc(out);
}

/** Uncertainty halos for locality-level places; county places use the county polygon instead. */
export function haloFeatures(ctx: RoleContext) {
  const out: Feature<Polygon, Props>[] = [];
  for (const p of SNAPSHOT.projects) {
    if (!ctx.visibleProjectIds.has(p.id)) continue;
    for (const pl of p.places) {
      if (pl.precision !== "locality") continue;
      const radiusKm = Math.max(1.5, pl.uncertaintyMeters / 1000);
      const c = circle([pl.lon, pl.lat], radiusKm, { steps: 72, units: "kilometers" });
      out.push({ ...c, properties: { projectId: p.id, role: roleOf(p.id, ctx), label: pl.label, precision: pl.precision } });
    }
  }
  return fc(out);
}

export function pointFeatures(ctx: RoleContext) {
  const out: Feature<Point, Props>[] = [];
  for (const p of SNAPSHOT.projects) {
    if (!ctx.visibleProjectIds.has(p.id)) continue;
    for (const pl of p.places) {
      if (pl.precision === "county") continue;
      out.push({
        type: "Feature",
        // context places (e.g. the far terminal of a line only partly rebuilt) draw hollow: named, but not where the work is
        properties: { projectId: p.id, role: roleOf(p.id, ctx), label: pl.label, precision: pl.precision, kind: pl.kind, title: p.shortTitle, context: pl.role === "context" },
        geometry: { type: "Point", coordinates: [pl.lon, pl.lat] },
      });
    }
  }
  return fc(out);
}

/** Counties named for the visible projects (context, and the geometry for county-only places). */
export function projectCounties(ctx: RoleContext): { name: string; state: string; role: Role }[] {
  const out: { name: string; state: string; role: Role }[] = [];
  for (const p of SNAPSHOT.projects) {
    if (!ctx.visibleProjectIds.has(p.id)) continue;
    const role = roleOf(p.id, ctx);
    for (const c of p.counties) out.push({ name: c.name.replace(/ County$/i, ""), state: c.state, role });
  }
  return out;
}

/** Connector between the pair's closest mapped points; never drawn as a physical route. */
export function connectorFeature(m: Match | null): FeatureCollection<LineString, { label: string }> {
  const c = m?.geoDetail.closest;
  if (!m || !c?.a || !c.b || c.miles < 0.03) return { type: "FeatureCollection", features: [] };
  // one decimal near the review radius, so 24.89 mi never reads as "25 mi"
  const mi = c.miles < 10 || Math.abs(c.miles - m.geoDetail.thresholdMiles) < 1.5 ? c.miles.toFixed(1) : String(Math.round(c.miles));
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { label: `${mi} mi closest approach` }, geometry: { type: "LineString", coordinates: [c.a, c.b] } }],
  };
}

/** Closest points of a pair (small crosshair markers). */
export function centerFeatures(m: Match | null): FeatureCollection<Point, { role: string }> {
  const c = m?.geoDetail.closest;
  if (!c?.a || !c.b) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { role: "a" }, geometry: { type: "Point", coordinates: c.a } },
      { type: "Feature", properties: { role: "b" }, geometry: { type: "Point", coordinates: c.b } },
    ],
  };
}

/** Every flagged pair as an amber link between closest points — "where overlaps occur" at a glance. */
export function overlapFeatures(matches: Match[], selectedId: string | null) {
  const features: Feature<LineString, { id: string; priority: number; selected: boolean; status: string }>[] = [];
  const dots: Feature<Point, { id: string; priority: number; selected: boolean; status: string }>[] = [];
  for (const m of matches) {
    const c = m.geoDetail.closest;
    if (!c?.a || !c.b) continue;
    const props = { id: m.id, priority: m.priority, selected: m.id === selectedId, status: m.reviewStatus };
    features.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: [c.a, c.b] } });
    dots.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2] } });
  }
  return { lines: { type: "FeatureCollection" as const, features }, dots: { type: "FeatureCollection" as const, features: dots } };
}

/** All coordinates of a project, used for camera fitting and label anchors. */
export function projectCoords(p: Project): [number, number][] {
  const pts: [number, number][] = p.places.filter((pl) => pl.precision !== "county").map((pl) => [pl.lon, pl.lat]);
  if (p.route) pts.push(...p.route.coordinates);
  if (!pts.length) pts.push(...p.places.map((pl) => [pl.lon, pl.lat] as [number, number]));
  return pts;
}

export function boundsOf(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** A label anchor: the middle vertex of a route, else the first place. */
export function anchorOf(p: Project): [number, number] | null {
  if (p.route && p.route.coordinates.length) return p.route.coordinates[Math.floor(p.route.coordinates.length / 2)];
  const pl = p.places.find((x) => x.precision !== "county") ?? p.places[0];
  return pl ? [pl.lon, pl.lat] : null;
}

/** The stated shared site for a pair, if a relation names one and a project carries it as a place. */
export function sharedSite(m: Match | null): { label: string; lon: number; lat: number; uncertaintyMeters: number; stated: boolean; implied?: boolean } | null {
  if (!m) return null;
  if (m.geoDetail.method === "shared-endpoint" && m.geoDetail.sharedEndpoint) {
    const a = SNAPSHOT.projects.find((p) => p.id === m.projectAId)!;
    const pl = a.places.find((x) => x.label === m.geoDetail.sharedEndpoint!.labelA);
    return pl ? { label: pl.label, lon: pl.lon, lat: pl.lat, uncertaintyMeters: pl.uncertaintyMeters, stated: false } : null;
  }
  if (m.geoDetail.method !== "shared-site") return null;
  const rel = SNAPSHOT.relations.find((r) => m.geoDetail.relationIds.includes(r.id));
  if (!rel) return null;
  const projects = [m.projectAId, m.projectBId].map((id) => SNAPSHOT.projects.find((p) => p.id === id)!);
  const place =
    (rel.sitePlaceId && projects.flatMap((p) => p.places).find((pl) => pl.id === rel.sitePlaceId)) ||
    projects
      .flatMap((p) => p.places)
      .find((pl) => rel.siteLabel && pl.label.toLowerCase().includes(rel.siteLabel.toLowerCase().split(" ")[0]));
  if (!place) return null;
  return { label: rel.siteLabel ?? place.label, lon: place.lon, lat: place.lat, uncertaintyMeters: place.uncertaintyMeters, stated: rel.basis !== "inferred", implied: rel.basis === "inferred" };
}
