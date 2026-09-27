import circle from "@turf/circle";
import type { Feature, FeatureCollection, Geometry, LineString, MultiPolygon, Point, Polygon } from "geojson";
import { SNAPSHOT } from "@/lib/data/snapshot";
import type { Match, Project, SignalLevel } from "@/lib/domain/types";
import { centerOf, geometryOf } from "@/lib/matching/geo";

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

type LonLat = [number, number];

/** A closest approach under this (≈50 m) is a touch: no ruler or link of that length is drawn (same cut as map-3d). */
export const TOUCH_MILES = 0.03;

/** Reads as "touching" only when no town-level point is behind the zero-mile reading (else it is "<1 mi", a lead to verify). */
export function definiteTouch(c: Match["geoDetail"]["closest"] | undefined): boolean {
  return !!c && (c.touching || c.miles < TOUCH_MILES) && !c.anyLocality;
}

/** Where a project stands on the map: its starter-workbook center (else its label anchor), a position only, never a distance. */
export function projectAnchor(p: Project | undefined): LonLat | null {
  if (!p) return null;
  return centerOf(p)?.lonlat ?? anchorOf(p);
}

/**
 * What a flagged pair's link joins: A's and B's closest points (the challenge metric). A touching pair (shared site or
 * terminal, crossing lines) has one point for both, so its link runs from each project to the shared site (or the touch
 * point) and both projects visibly reach it. Null without a closest approach (county-level or unlocated pairs).
 * The same points as map-3d's raised arcs.
 */
export function pairLink(m: Match | null): { a: LonLat; b: LonLat; via?: LonLat } | null {
  const c = m?.geoDetail.closest;
  if (!m || !c) return null;
  if (!c.touching && c.miles >= TOUCH_MILES) return c.a && c.b ? { a: c.a, b: c.b } : null;
  const site = sharedSite(m);
  const via: LonLat | undefined = site ? [site.lon, site.lat] : c.a;
  if (!via) return null;
  return { a: projectAnchor(project(m.projectAId)) ?? via, b: projectAnchor(project(m.projectBId)) ?? via, via };
}

/** A's and B's closest points; a touching pair's coincide where its link meets (the engine may name no point for a shared site). */
export function closestPoints(m: Match | null): { a: LonLat; b: LonLat } | null {
  const c = m?.geoDetail.closest;
  const link = pairLink(m);
  if (!c || !link) return null;
  return { a: c.a ?? link.via ?? link.a, b: c.b ?? link.via ?? link.b };
}

/** Ruler between the pair's closest mapped points (the challenge metric); never a physical route, never for a touching pair. */
export function connectorFeature(m: Match | null): FeatureCollection<LineString, { label: string; geo: SignalLevel; beyond: boolean }> {
  const c = m?.geoDetail.closest;
  if (!m || !c?.a || !c.b || c.touching || c.miles < TOUCH_MILES) return { type: "FeatureCollection", features: [] };
  const mi = milesText(c.miles, m.geoDetail.thresholdMiles);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          label: `${mi} mi · closest approach${c.approximate ? " (estimated)" : ""}`,
          geo: m.geo,
          beyond: c.miles > m.geoDetail.thresholdMiles,
        },
        geometry: { type: "LineString", coordinates: [c.a, c.b] },
      },
    ],
  };
}

/** Closest points of a pair (small crosshair markers; a touching pair's sit on one spot). */
export function centerFeatures(m: Match | null): FeatureCollection<Point, { role: string }> {
  const c = closestPoints(m);
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

/** Every flagged pair as a link between closest points (touching: through where they meet) — "where overlaps occur" at a glance. */
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
    const link = pairLink(m);
    if (!link) return;
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
      geometry: { type: "LineString", coordinates: link.via ? [link.a, link.via, link.b] : [link.a, link.b] },
    });
    dots.push({
      type: "Feature",
      properties: props,
      geometry: {
        type: "Point",
        coordinates: pairSpot(link),
      },
    });
  });
  return {
    lines: { type: "FeatureCollection" as const, features },
    dots: { type: "FeatureCollection" as const, features: dots },
  };
}

/** Where a pair comes closest: its closest points' midpoint, or the shared site / touch point (rank chips, hit dots). */
export function pairSpot(link: { a: LonLat; b: LonLat; via?: LonLat }): LonLat {
  return link.via ?? [(link.a[0] + link.b[0]) / 2, (link.a[1] + link.b[1]) / 2];
}

/**
 * The challenge rule drawn where it applies: a ring of the review radius around A's closest point, so B's closest point
 * visibly sits inside (a touching pair: both at the ring's centre) or, for a pair only possibly inside, just outside.
 */
export function ringFeature(m: Match | null, thresholdMiles: number): FeatureCollection<Polygon, { label: string; beyond: boolean }> {
  const c = closestPoints(m);
  if (!m || !c) return { type: "FeatureCollection", features: [] };
  const a = project(m.projectAId);
  const ring = circle(c.a, thresholdMiles, { steps: 144, units: "miles" });
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          label: `${thresholdMiles} mi from ${a?.shortTitle ?? "A"}'s closest point`,
          beyond: (m.geoDetail.closest?.miles ?? 0) > thresholdMiles,
        },
        geometry: ring.geometry,
      },
    ],
  };
}

/** The point on the ring around A's closest point nearest B's (touching: toward where B stands; north when it stands there too). */
export function ringLabelPoint(m: Match | null, thresholdMiles: number): [number, number] | null {
  const c = closestPoints(m);
  const link = pairLink(m);
  if (!c || !link) return null;
  const [ax, ay] = c.a;
  const [bx, by] = link.via ? link.b : c.b;
  const k = Math.cos((ay * Math.PI) / 180);
  const dx = (bx - ax) * k;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const deg = thresholdMiles / 69.05;
  if (len < 1e-9) return [ax, ay + deg];
  return [ax + ((dx / len) * deg) / k, ay + (dy / len) * deg];
}

/** Touching pairs: each project to where they meet (the shared site, or where their lines cross): the reason, not a route. */
export function siteLegFeatures(m: Match | null): FeatureCollection<LineString, { role: string }> {
  const link = pairLink(m);
  if (!m || !link?.via) return { type: "FeatureCollection", features: [] };
  const s = link.via;
  const legs: Feature<LineString, { role: string }>[] = [];
  for (const [role, at] of [
    ["a", link.a],
    ["b", link.b],
  ] as const) {
    // a project standing on the meeting point has no leg to draw
    if (Math.hypot((at[0] - s[0]) * Math.cos((s[1] * Math.PI) / 180), at[1] - s[1]) * 69 < 0.3) continue;
    legs.push({
      type: "Feature",
      properties: { role },
      geometry: { type: "LineString", coordinates: [at, s] },
    });
  }
  return { type: "FeatureCollection", features: legs };
}

/* ------------------------------------------------ review zone ------------------------------------------------ */

/**
 * A project's mapped work exactly as the closest-point rule measures it (the engine's own geometry): its route, the
 * straight segment between its two terminals, or its work sites. Null for a project in none of the run's pairs.
 */
function workGeometry(projectId: string, matches: Match[]): { line: boolean; coords: LonLat[] } | null {
  const p = project(projectId);
  if (!p || !matches.some((m) => m.projectAId === projectId || m.projectBId === projectId)) return null;
  const g = geometryOf(p);
  return g?.coordinates.length ? { line: g.kind === "line", coords: g.coordinates } : null;
}

/**
 * The review radius around one project, the way the closest-point rule reads it: every point within `miles` of the
 * project's mapped work (see workGeometry). A union of distances contoured on a grid (≈1% of its width), so a long or
 * bent line gets a long, bent zone and separate sites get separate circles — never one circle around a center.
 * Null for a project in none of the run's pairs, or with no located work.
 */
export function reviewZone(projectId: string, matches: Match[], miles: number): ReviewZone | null {
  // a long route's zone takes ~15 ms: computed once per run, project and radius (the map's data pass reruns on hover)
  let cache = zoneCache.get(matches);
  if (!cache) zoneCache.set(matches, (cache = new Map()));
  const key = `${projectId}|${miles}`;
  if (!cache.has(key)) cache.set(key, buildZone(projectId, matches, miles));
  return cache.get(key) ?? null;
}

type ReviewZone = { zone: FeatureCollection<Polygon | MultiPolygon, { label: string }>; top: LonLat };
const zoneCache = new WeakMap<Match[], Map<string, ReviewZone | null>>();

function buildZone(projectId: string, matches: Match[], miles: number): ReviewZone | null {
  const g = workGeometry(projectId, matches);
  if (!g || !(miles > 0)) return null;
  const polys = bufferPolygons(g.coords, g.line, miles);
  if (!polys.length) return null;
  const top = polys.flatMap((p) => p[0]).reduce((best, q) => (q[1] > best[1] ? q : best));
  const p = project(projectId);
  return {
    zone: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { label: `${miles} mi from ${p?.shortTitle ?? "this project"}` },
          geometry: polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys },
        },
      ],
    },
    top,
  };
}

/** Polygons (outer ring counter-clockwise, holes clockwise) of every point within `miles` of a polyline or of separate points. */
function bufferPolygons(coords: LonLat[], line: boolean, miles: number, cells = 96): LonLat[][][] {
  // a local plane in miles around the geometry (fine at the scale of one project)
  const M = 69.05;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const pts = coords.map(([x, y]) => [(x - lon0) * k * M, (y - lat0) * M] as LonLat);
  const segs = line && pts.length > 1 ? pts.slice(1).map((q, i) => [pts[i], q] as const) : pts.map((q) => [q, q] as const);
  const dist = (x: number, y: number) => {
    let best = Infinity;
    for (const [[ax, ay], [bx, by]] of segs) {
      const [dx, dy] = [bx - ax, by - ay];
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return best;
  };
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const step = (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * miles) / cells;
  // two spare cells past the radius: every grid-border node is outside, so every contour closes
  const pad = miles + 2 * step;
  const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  const nx = Math.ceil((Math.max(...xs) + pad - x0) / step);
  const ny = Math.ceil((Math.max(...ys) + pad - y0) / step);
  // distance beyond the radius at each grid node (negative inside)
  const f = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) f[j * (nx + 1) + i] = dist(x0 + i * step, y0 + j * step) - miles;
  const at = (i: number, j: number) => f[j * (nx + 1) + i];

  // marching squares: a crossing per grid edge (h = to the right of a node, v = above it), linked cell by cell
  const point = new Map<string, LonLat>();
  const cross = (key: string, i0: number, j0: number, i1: number, j1: number) => {
    if (!point.has(key)) {
      const [a, b] = [at(i0, j0), at(i1, j1)];
      const t = a / (a - b);
      point.set(key, [x0 + (i0 + (i1 - i0) * t) * step, y0 + (j0 + (j1 - j0) * t) * step]);
    }
    return key;
  };
  const links = new Map<string, string[]>();
  const link = (p: string, q: string) => {
    links.set(p, [...(links.get(p) ?? []), q]);
    links.set(q, [...(links.get(q) ?? []), p]);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [bl, br, tr, tl] = [at(i, j) < 0, at(i + 1, j) < 0, at(i + 1, j + 1) < 0, at(i, j + 1) < 0];
      if (bl === br && br === tr && tr === tl) continue;
      const bottom = bl !== br ? cross(`h${i},${j}`, i, j, i + 1, j) : null;
      const right = br !== tr ? cross(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1) : null;
      const top = tl !== tr ? cross(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1) : null;
      const left = bl !== tl ? cross(`v${i},${j}`, i, j, i, j + 1) : null;
      const edges = [bottom, right, top, left].filter((e): e is string => e !== null);
      if (edges.length === 2) link(edges[0], edges[1]);
      else {
        // a saddle: cut off the two corners that differ from the cell's centre
        const mid = at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1) < 0;
        if (bl !== mid) {
          link(bottom!, left!);
          link(right!, top!);
        } else {
          link(bottom!, right!);
          link(top!, left!);
        }
      }
    }

  const rings: LonLat[][] = [];
  const seen = new Set<string>();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const ring: LonLat[] = [];
    let [prev, cur]: [string | null, string | undefined] = [null, start];
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      ring.push(point.get(cur)!);
      const next: string | undefined = links.get(cur)!.find((q) => q !== prev && !seen.has(q));
      [prev, cur] = [cur, next];
    }
    if (ring.length >= 3) rings.push(ring);
  }

  // nesting: a ring inside an odd number of others is a hole of the smallest outer ring around it
  const area = (r: LonLat[]) => r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0) / 2;
  const inside = ([x, y]: LonLat, r: LonLat[]) => {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const depth = rings.map((r, i) => rings.filter((o, j) => j !== i && inside(r[0], o)).length);
  const orient = (r: LonLat[], ccw: boolean) => (area(r) > 0 === ccw ? r : [...r].reverse());
  const toLonLat = (r: LonLat[]): LonLat[] => {
    const out = r.map(([x, y]) => [x / (k * M) + lon0, y / M + lat0] as LonLat);
    return [...out, out[0]];
  };
  const polys: LonLat[][][] = [];
  rings.forEach((r, i) => {
    if (depth[i] % 2) return;
    const holes = rings.filter((h, j) => depth[j] === depth[i] + 1 && inside(h[0], r));
    polys.push([toLonLat(orient(r, true)), ...holes.map((h) => toLonLat(orient(h, false)))]);
  });
  return polys;
}

/** All coordinates of a project, used for camera fitting and label anchors. */
export function projectCoords(p: Project): [number, number][] {
  const pts: [number, number][] = p.places.filter((pl) => pl.precision !== "county").map((pl) => [pl.lon, pl.lat]);
  if (p.route) pts.push(...p.route.coordinates);
  if (!pts.length) pts.push(...p.places.map((pl) => [pl.lon, pl.lat] as [number, number]));
  return pts;
}

/** Terminals (non-context places), closest points, link ends and the shared site of a pair: what the pair camera frames. */
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
  const c = closestPoints(m);
  if (c) out.push(c.a, c.b);
  // a touching pair's labels stand on each project's anchor, at the ends of its legs
  const link = pairLink(m);
  if (link) out.push(link.a, link.b);
  const site = sharedSite(m);
  if (site) out.push([site.lon, site.lat]);
  return out;
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
