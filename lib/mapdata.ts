import circle from "@turf/circle";
import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson";
import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match, Project, SignalLevel } from "@/lib/domain/types";

/**
 * GeoJSON for the map's gl-* layers (map-core). Everything here is pure and deterministic; MapStage feeds it the store.
 * Honesty encodings (plan.md §9, gaps.md §3 F) live in the data as properties, the paint only reads them.
 */

export type Role = "a" | "b" | "hover" | "other" | "all" | "u1" | "u2";

/**
 * In overview, each region's two focal utilities get the A/B hues so both plans are visible at a glance;
 * everyone else stays neutral. The pair view always uses A = --util-a, B = --util-b.
 */
export const FOCAL_UTILITIES: Record<string, [string, string]> = {
  southeast: ["desc", "gpc"],
  "upper-midwest": ["dairyland", "xcel-nspw"],
  "southern-plains": ["xcel-sps", "transource-ok"],
};

const PROJECTS = new Map<string, Project>(SNAPSHOT.projects.map((p) => [p.id, p]));
const project = (id: string) => PROJECTS.get(id);

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
  /** After a run: projects in at least one flagged pair of the region on screen (the rest dim). Null before a run. */
  flaggedProjectIds?: Set<string> | null;
  /** Projects of a hovered pair (list row / arc) while another pair — or none — is selected. */
  hotProjectIds?: Set<string> | null;
}

export function roleOf(projectId: string, ctx: RoleContext): Role {
  if (ctx.pair) {
    if (projectId === ctx.pair.a) return "a";
    if (projectId === ctx.pair.b) return "b";
    return "other";
  }
  if (ctx.hoveredProjectId) return projectId === ctx.hoveredProjectId ? "hover" : "other";
  const p = project(projectId);
  return p ? overviewRole(p) : "all";
}

type Props = {
  projectId: string;
  role: Role;
  label?: string;
  precision?: string;
  kind?: string;
  title?: string;
  context?: boolean;
  onSite?: boolean;
  /** After a run: in a flagged pair (true before any run, so nothing dims pre-run). */
  flagged?: boolean;
  /** One of the two projects of a hovered pair. */
  hot?: boolean;
};

function fc<G extends Geometry, P>(features: Feature<G, P>[]): FeatureCollection<G, P> {
  return { type: "FeatureCollection", features };
}

const flaggedOf = (id: string, ctx: RoleContext) => (ctx.flaggedProjectIds ? ctx.flaggedProjectIds.has(id) : true);
const hotOf = (id: string, ctx: RoleContext) => !!ctx.hotProjectIds?.has(id);

/** Routes are only drawn when a source describes or maps them; digitized ones are dashed. */
export function routeFeatures(ctx: RoleContext) {
  const out: Feature<LineString, Props>[] = [];
  for (const p of SNAPSHOT.projects) {
    if (!p.route || !ctx.visibleProjectIds.has(p.id)) continue;
    out.push({
      type: "Feature",
      properties: {
        projectId: p.id,
        role: roleOf(p.id, ctx),
        precision: p.route.precision,
        title: p.shortTitle,
        flagged: flaggedOf(p.id, ctx),
        hot: hotOf(p.id, ctx),
      },
      geometry: { type: "LineString", coordinates: p.route.coordinates },
    });
  }
  return fc(out);
}

// halo geometry never changes: build each 72-step circle once
const haloGeometry = new Map<string, Polygon>();

/** Uncertainty halos for locality-level places; county places use the county polygon instead. */
export function haloFeatures(ctx: RoleContext) {
  const out: Feature<Polygon, Props>[] = [];
  for (const p of SNAPSHOT.projects) {
    if (!ctx.visibleProjectIds.has(p.id)) continue;
    for (const pl of p.places) {
      if (pl.precision !== "locality") continue;
      let geometry = haloGeometry.get(pl.id);
      if (!geometry) {
        const radiusKm = Math.max(1.5, pl.uncertaintyMeters / 1000);
        geometry = circle([pl.lon, pl.lat], radiusKm, {
          steps: 72,
          units: "kilometers",
        }).geometry;
        haloGeometry.set(pl.id, geometry);
      }
      out.push({
        type: "Feature",
        properties: {
          projectId: p.id,
          role: roleOf(p.id, ctx),
          label: pl.label,
          precision: pl.precision,
          flagged: flaggedOf(p.id, ctx),
          hot: hotOf(p.id, ctx),
        },
        geometry,
      });
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
        properties: {
          projectId: p.id,
          role: roleOf(p.id, ctx),
          label: pl.label,
          precision: pl.precision,
          kind: pl.kind,
          title: p.shortTitle,
          context: pl.role === "context",
          flagged: flaggedOf(p.id, ctx),
          hot: hotOf(p.id, ctx),
        },
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

/** "6.7" / "24.9" / "37": one decimal under 10 mi or within 1.5 mi of the radius, so 24.89 mi never reads as "25 mi". */
export function milesText(miles: number, thresholdMiles: number): string {
  return miles < 10 || Math.abs(miles - thresholdMiles) < 1.5 ? miles.toFixed(1) : String(Math.round(miles));
}

/** Center-to-center connector for a pair (the sponsor's distance metric; never drawn as a physical route). */
export function connectorFeature(m: Match | null): FeatureCollection<LineString, { label: string; geo: SignalLevel; beyond: boolean }> {
  const c = m?.geoDetail.center;
  if (!m || !c || c.miles < 0.3) return { type: "FeatureCollection", features: [] };
  const mi = milesText(c.miles, m.geoDetail.thresholdMiles);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          label: `${mi} mi · center to center`,
          geo: m.geo,
          beyond: c.miles > m.geoDetail.thresholdMiles,
        },
        geometry: { type: "LineString", coordinates: [c.a, c.b] },
      },
    ],
  };
}

/** Center points of a pair (the sponsor's distance anchors). */
export function centerFeatures(m: Match | null): FeatureCollection<Point, { role: string }> {
  const c = m?.geoDetail.center;
  if (!c) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { role: "a" },
        geometry: { type: "Point", coordinates: c.a },
      },
      {
        type: "Feature",
        properties: { role: "b" },
        geometry: { type: "Point", coordinates: c.b },
      },
    ],
  };
}

export interface OverlapProps {
  id: string;
  priority: number;
  /** 1-based position in the region's engine priority order (drives the reveal draw-in). */
  order: number;
  /** queue_rank within the pair's review-status tab (lib/rank.ts), 0 when unknown. */
  rank: number;
  /** Place signal: confirmed = solid, anything else = dashed at 50% (B1). */
  geo: SignalLevel;
  status: string;
  selected: boolean;
  /** The hovered pair (list row or arc) when it is not the selected one. */
  hover: boolean;
  /** A pair is selected and this is not it. */
  dim: boolean;
  /** Drawn at full weight: the region's first 6 in engine order, or inside a focus (the rest are a faint hairline). */
  top: boolean;
}

/** Every flagged pair as a link between centers — "where overlaps occur" at a glance. */
export function overlapFeatures(
  matches: Match[],
  opts:
    | {
        selectedId: string | null;
        hoverId?: string | null;
        ranks?: Map<string, number> | null;
        /** A focus (project or hotspot): links outside it dim like an unselected pair. */
        focusIds?: Set<string> | null;
      }
    | string
    | null,
) {
  const o = typeof opts === "object" && opts !== null ? opts : { selectedId: opts };
  const features: Feature<LineString, OverlapProps>[] = [];
  const dots: Feature<Point, OverlapProps>[] = [];
  matches.forEach((m, i) => {
    const c = m.geoDetail.center;
    if (!c) return;
    const props: OverlapProps = {
      id: m.id,
      priority: m.priority,
      order: i + 1,
      rank: o.ranks?.get(m.id) ?? 0,
      geo: m.geo,
      status: m.reviewStatus,
      selected: m.id === o.selectedId,
      hover: !!o.hoverId && m.id === o.hoverId && m.id !== o.selectedId,
      dim: (!!o.selectedId && m.id !== o.selectedId) || (!o.selectedId && !!o.focusIds && !o.focusIds.has(m.id)),
      // same six as the 3D scene's bright arcs (lib/map3d.ts OVERVIEW_BRIGHT)
      top: i < 6 || (!!o.focusIds && o.focusIds.has(m.id)),
    };
    features.push({
      type: "Feature",
      properties: props,
      geometry: { type: "LineString", coordinates: [c.a, c.b] },
    });
    dots.push({
      type: "Feature",
      properties: props,
      geometry: {
        type: "Point",
        coordinates: [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2],
      },
    });
  });
  return {
    lines: { type: "FeatureCollection" as const, features },
    dots: { type: "FeatureCollection" as const, features: dots },
  };
}

/**
 * Sperry's rule drawn where it applies: a ring of the review radius around project A's center, so B's center visibly
 * sits inside (measured pairs) or outside (pairs flagged through a shared facility beyond the radius).
 */
export function ringFeature(m: Match | null, thresholdMiles: number): FeatureCollection<Polygon, { label: string; beyond: boolean }> {
  const c = m?.geoDetail.center;
  if (!m || !c) return { type: "FeatureCollection", features: [] };
  const a = project(m.projectAId);
  const ring = circle(c.a, thresholdMiles, { steps: 144, units: "miles" });
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          label: `${thresholdMiles} mi from ${a?.shortTitle ?? "A"} center`,
          beyond: c.miles > thresholdMiles,
        },
        geometry: ring.geometry,
      },
    ],
  };
}

/** The point on the ring around A nearest B's center (where the ring's label sits). */
export function ringLabelPoint(m: Match | null, thresholdMiles: number): [number, number] | null {
  const c = m?.geoDetail.center;
  if (!c) return null;
  const [ax, ay] = c.a;
  const [bx, by] = c.b;
  const k = Math.cos((ay * Math.PI) / 180);
  const dx = (bx - ax) * k;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const deg = thresholdMiles / 69.05;
  return [ax + ((dx / len) * deg) / k, ay + (dy / len) * deg];
}

/** Shared-site pairs: each project's center to the shared site (the reason they are flagged), not a route. */
export function siteLegFeatures(m: Match | null): FeatureCollection<LineString, { role: string }> {
  const site = sharedSite(m);
  const c = m?.geoDetail.center;
  if (!m || !site || !c) return { type: "FeatureCollection", features: [] };
  const s: [number, number] = [site.lon, site.lat];
  const legs: Feature<LineString, { role: string }>[] = [];
  for (const [role, at] of [
    ["a", c.a],
    ["b", c.b],
  ] as const) {
    // a center on the site itself has no leg to draw
    if (Math.hypot((at[0] - s[0]) * Math.cos((s[1] * Math.PI) / 180), at[1] - s[1]) * 69 < 0.3) continue;
    legs.push({
      type: "Feature",
      properties: { role },
      geometry: { type: "LineString", coordinates: [at, s] },
    });
  }
  return { type: "FeatureCollection", features: legs };
}

/** All coordinates of a project, used for camera fitting and label anchors. */
export function projectCoords(p: Project): [number, number][] {
  const pts: [number, number][] = p.places.filter((pl) => pl.precision !== "county").map((pl) => [pl.lon, pl.lat]);
  if (p.route) pts.push(...p.route.coordinates);
  if (!pts.length) pts.push(...p.places.map((pl) => [pl.lon, pl.lat] as [number, number]));
  return pts;
}

/** Terminals (non-context places), centers and the shared site of a pair: what the pair camera frames. */
export function pairFrameCoords(m: Match): [number, number][] {
  const out: [number, number][] = [];
  for (const id of [m.projectAId, m.projectBId]) {
    const p = project(id);
    if (!p) continue;
    const places = p.places.filter((pl) => pl.precision !== "county" && pl.role !== "context");
    if (places.length) out.push(...places.map((pl) => [pl.lon, pl.lat] as [number, number]));
    else out.push(...projectCoords(p));
    if (p.route) out.push(p.route.coordinates[0], p.route.coordinates[p.route.coordinates.length - 1]);
  }
  const c = m.geoDetail.center;
  if (c) out.push(c.a, c.b);
  const site = sharedSite(m);
  if (site) out.push([site.lon, site.lat]);
  return out;
}

/** The sponsor center of a project, read from any of its pairs (null when none has a center). */
export function projectCenter(projectId: string, matches: Match[]): [number, number] | null {
  for (const m of matches) {
    const c = m.geoDetail.center;
    if (!c) continue;
    if (m.projectAId === projectId) return c.a;
    if (m.projectBId === projectId) return c.b;
  }
  return null;
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
export function sharedSite(m: Match | null): {
  label: string;
  lon: number;
  lat: number;
  uncertaintyMeters: number;
  stated: boolean;
  implied?: boolean;
} | null {
  if (!m) return null;
  if (m.geoDetail.method === "shared-endpoint" && m.geoDetail.sharedEndpoint) {
    const a = project(m.projectAId);
    const pl = a?.places.find((x) => x.label === m.geoDetail.sharedEndpoint!.labelA);
    return pl
      ? {
          label: pl.label,
          lon: pl.lon,
          lat: pl.lat,
          uncertaintyMeters: pl.uncertaintyMeters,
          stated: false,
        }
      : null;
  }
  if (m.geoDetail.method !== "shared-site") return null;
  const rel = SNAPSHOT.relations.find((r) => m.geoDetail.relationIds.includes(r.id));
  if (!rel) return null;
  const projects = [m.projectAId, m.projectBId].map((id) => project(id)).filter((p): p is Project => !!p);
  const place =
    (rel.sitePlaceId && projects.flatMap((p) => p.places).find((pl) => pl.id === rel.sitePlaceId)) ||
    projects.flatMap((p) => p.places).find((pl) => rel.siteLabel && pl.label.toLowerCase().includes(rel.siteLabel.toLowerCase().split(" ")[0]));
  if (!place) return null;
  return {
    label: rel.siteLabel ?? place.label,
    lon: place.lon,
    lat: place.lat,
    uncertaintyMeters: place.uncertaintyMeters,
    stated: rel.basis !== "inferred",
    implied: rel.basis === "inferred",
  };
}

/* ------------------------------------------------ state line ------------------------------------------------ */

type StatesFC = FeatureCollection<Geometry, { name?: string; abbr?: string }>;

function outerRings(g: Geometry): [number, number][][] {
  if (g.type === "Polygon") return [g.coordinates[0] as [number, number][]];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0] as [number, number][]);
  return [];
}

/**
 * The border two states share, read from the bundled Census states (public/geo/states.json): the longest run of
 * vertices of `a`'s outline that `b`'s outline also has. Used for the Savannah River (SC–GA) line in the overview.
 */
export function sharedBorder(states: StatesFC, a: string, b: string): Feature<LineString, { label: string }> | null {
  const fa = states.features.find((f) => f.properties?.abbr === a);
  const fb = states.features.find((f) => f.properties?.abbr === b);
  if (!fa || !fb) return null;
  const key = ([x, y]: [number, number]) => `${x.toFixed(5)},${y.toFixed(5)}`;
  const inB = new Set(outerRings(fb.geometry).flatMap((r) => r.map(key)));
  let best: [number, number][] = [];
  for (const ring of outerRings(fa.geometry)) {
    const n = ring.length - 1; // closed ring: last = first
    if (n < 2) continue;
    const hit = ring.slice(0, n).map((p) => inB.has(key(p)));
    // start the walk just after a gap so a run that wraps past the ring's start stays whole
    const start = hit.indexOf(false);
    if (start < 0) continue;
    let run: [number, number][] = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (hit[i]) run.push(ring[i]);
      else {
        if (run.length > best.length) best = run;
        run = [];
      }
    }
    if (run.length > best.length) best = run;
  }
  if (best.length < 2) return null;
  return {
    type: "Feature",
    properties: { label: "Savannah River · state line" },
    geometry: { type: "LineString", coordinates: best },
  };
}

/**
 * A straight label for a wiggly border: a point part-way along it, rotated to the border's overall direction (degrees
 * clockwise from east, kept upright) — line-placed text would follow every river bend.
 */
export function borderLabel(line: Feature<LineString, { label: string }>, at = 0.72, span = 0.14): Feature<Point, { label: string; rotate: number }> {
  // measured from the northern end (`at` = share of the way downstream for a river border)
  const raw = line.geometry.coordinates as [number, number][];
  const c = raw[0][1] >= raw[raw.length - 1][1] ? raw : [...raw].reverse();
  const k0 = Math.cos((c[0][1] * Math.PI) / 180);
  // the point at a share of the border's length (vertices are uneven), and its direction over a window around it
  const cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + Math.hypot((c[i][0] - c[i - 1][0]) * k0, c[i][1] - c[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const pointAt = (t: number): [number, number] => {
    const d = Math.min(1, Math.max(0, t)) * total;
    const i = Math.max(
      1,
      cum.findIndex((x) => x >= d),
    );
    const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f];
  };
  const p = pointAt(at);
  const [a, b] = [pointAt(at - span), pointAt(at + span)];
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  let rotate = (-Math.atan2(b[1] - a[1], (b[0] - a[0]) * k) * 180) / Math.PI;
  if (rotate > 90) rotate -= 180;
  if (rotate < -90) rotate += 180;
  return { type: "Feature", properties: { label: line.properties.label, rotate: Math.round(rotate) }, geometry: { type: "Point", coordinates: p } };
}
