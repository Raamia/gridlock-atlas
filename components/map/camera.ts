import type mapboxgl from "mapbox-gl";
import type { LngLatBoundsLike } from "mapbox-gl";
import { SNAPSHOT } from "@/lib/data";
import { cameraPadding, getLayout, MIN_FRAME, type CameraPadding, type Layout, type RectLike } from "@/lib/layout";
import { boundsOf, pairFrameCoords, projectCoords } from "@/lib/mapdata";
import { regionMatches } from "@/lib/rank";
import { useAtlas } from "@/lib/store";

/**
 * The one place that moves the camera (SPEC §3 "Camera"). Every move computes its padding from lib/layout at call
 * time (+ the measured guided-demo card, + the phone inspector sheet's real top), so nothing is ever framed under a
 * panel. A padding-only change (panel open/close, dock collapse, sheet snap) re-frames only when the map is still;
 * mid-flight it waits for moveend. Moves never race: Mapbox stops the one in flight, and we never issue a padding
 * ease while a fly is running.
 */

export type CameraIntent =
  /** Region / focus framing: pre-run → region bbox; post-run → the region's flagged pair centers; focus → its pairs. */
  | { kind: "overview" }
  /** Frame both projects' terminals + centers (+ shared site); maxZoom 10.5; pitch 52 in 3D. */
  | { kind: "pair"; matchId: string; crossRegion?: boolean }
  /** After an explicit Compare: ease 1400 ms to the flagged pair centers. */
  | { kind: "reveal" }
  /** One project (a title clicked in the inspector): its places and route; maxZoom 10; pitch 52 in 3D. */
  | { kind: "project"; projectId: string };

export const PAIR_PITCH = 52;
export const PAIR_BEARING = -14;
export const OVERVIEW_PITCH = 45;
export const PAIR_MAX_ZOOM = 10.5;

/** --ease-camera: cubic-bezier(0.65, 0, 0.35, 1). */
export const easeCamera = cubicBezier(0.65, 0, 0.35, 1);
/** --ease-enter: cubic-bezier(0.22, 1, 0.36, 1) (short re-frames). */
export const easeEnter = cubicBezier(0.22, 1, 0.36, 1);

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    t = Math.min(1, Math.max(0, t));
    return sy(t);
  };
}

/* ------------------------------------------------ padding ------------------------------------------------ */

/** The guided-demo card: `[data-demo-card]`, falling back to the region's aria-label (both, when both exist). */
export const DEMO_CARD = '[data-demo-card], [role="region"][aria-label="Guided demo"]';

/**
 * The guided-demo card's rect while it floats over the map (not while the brief pins it bottom-left): the union of every
 * element that names it, so a wrapper and the card itself agree on how far down the card reaches.
 */
export function demoCardRect(): RectLike | null {
  const st = useAtlas.getState();
  if (st.demoStep === null || st.briefOpen || typeof document === "undefined") return null;
  let u: { left: number; top: number; right: number; bottom: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>(DEMO_CARD)) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    u = u
      ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return u;
}

/** Phone inspector sheet top, as the shell places it: max(36dvh, --demo-card-bottom + 120px). */
function phoneSheetTop(vh: number): number {
  const raw = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--demo-card-bottom");
  const cardBottom = parseFloat(raw);
  return Math.max(vh * 0.36, Number.isFinite(cardBottom) ? cardBottom + 120 : 0);
}

/** The map-controls block (components/map/MapControls) as it sits now, or null when it is hidden (close-up, H, cramped). */
function controlsRect(): RectLike | null {
  if (typeof document === "undefined" || useAtlas.getState().closeupOpen) return null;
  const r = document.querySelector<HTMLElement>("[data-map-controls]")?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
}

function fitAxis(a: number, b: number, total: number): [number, number] {
  const max = Math.max(0, total - MIN_FRAME);
  const k = a + b > max ? max / (a + b) : 1;
  return [Math.floor(a * k), Math.floor(b * k)];
}

/** Camera padding right now: layout insets + breathing room + the demo card (+ the phone sheet's real top). */
export function currentPadding(kind: "pair" | "overview" = "overview", layout: Layout = getLayout()): CameraPadding {
  const st = useAtlas.getState();
  // layout insets first; the phone sheet and the demo card are applied after, so neither is pre-shrunk by the other
  const pad = cameraPadding(layout);
  // (+40 clears the Mapbox logo and (i) on the sheet's top edge; mid-demo the strip under the card is too short for it)
  if (layout.tier === "phone" && st.inspectorOpen && !st.uiHidden) pad.bottom = Math.round(layout.vh - phoneSheetTop(layout.vh) + (st.demoStep === null ? 40 : 16));
  const card = demoCardRect();
  if (card) {
    if ((card.top + card.bottom) / 2 < layout.vh / 2) pad.top = Math.max(pad.top, Math.round(card.bottom + 16));
    else pad.bottom = Math.max(pad.bottom, Math.round(layout.vh - card.top + 16));
  }
  // phones: a region is wider than tall, so the overview uses the full width (dots may run to the gutter)
  if (kind === "overview" && layout.tier === "phone") pad.left = pad.right = layout.gutter + 4;
  // every frame (pair, project, overview) keeps clear of the map-controls block at the focal bottom-right: as a bottom
  // band or a right column, whichever leaves the larger frame (phones: always the band above the sheet)
  const ctl = controlsRect();
  if (ctl) {
    // framed points are centers: their rings and dots reach a little past them, so keep a real gap above the block
    const gap = layout.tier === "phone" ? 28 : 16;
    const bottom = Math.max(pad.bottom, Math.round(layout.vh - ctl.top + gap));
    const right = Math.max(pad.right, Math.round(layout.vw - ctl.left + gap));
    const frameW = layout.vw - pad.left - pad.right;
    const frameH = layout.vh - pad.top - pad.bottom;
    const asBand = frameW * Math.max(0, layout.vh - pad.top - bottom);
    const asColumn = Math.max(0, layout.vw - pad.left - right) * frameH;
    if (layout.tier === "phone" || asBand >= asColumn) pad.bottom = bottom;
    else pad.right = right;
  }
  [pad.left, pad.right] = fitAxis(pad.left, pad.right, layout.vw);
  [pad.top, pad.bottom] = fitAxis(pad.top, pad.bottom, layout.vh);
  return pad;
}

const samePadding = (a: CameraPadding | null, b: CameraPadding) =>
  !!a && Math.abs(a.top - b.top) < 3 && Math.abs(a.bottom - b.bottom) < 3 && Math.abs(a.left - b.left) < 3 && Math.abs(a.right - b.right) < 3;

/* ------------------------------------------------ targets ------------------------------------------------ */

type Bounds = [[number, number], [number, number]];

/** Grow degenerate bounds (one point, a single short pair) so fitBounds never zooms to a street. */
function padBounds(b: Bounds | null, minDeg = 0.02): Bounds | null {
  if (!b) return null;
  const [[w, s], [e, n]] = b;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hw = Math.max((e - w) / 2, minDeg);
  const hh = Math.max((n - s) / 2, minDeg);
  return [
    [cx - hw, cy - hh],
    [cx + hw, cy + hh],
  ];
}

export function regionBounds(region: string): Bounds | null {
  const r = SNAPSHOT.regions.find((x) => x.id === region);
  if (r)
    return [
      [r.bbox[0], r.bbox[1]],
      [r.bbox[2], r.bbox[3]],
    ];
  return boundsOf(SNAPSHOT.projects.flatMap(projectCoords));
}

/** Overview target (SPEC §3): focus → its pairs; post-run → the region's flagged pair centers; else the region bbox. */
export function overviewTarget(): { bounds: Bounds | null; maxZoom: number } {
  const st = useAtlas.getState();
  if (st.focus && st.run) {
    const ids = new Set(st.focus.pairIds);
    const pairs = st.run.matches.filter((m) => ids.has(m.id));
    const coords: [number, number][] = pairs.flatMap((m) => (m.geoDetail.center ? [m.geoDetail.center.a, m.geoDetail.center.b] : []));
    if (st.focus.kind === "project") {
      const p = SNAPSHOT.projects.find((x) => x.id === st.focus!.id);
      if (p) coords.push(...projectCoords(p));
    }
    const b = padBounds(boundsOf(coords), 0.05);
    if (b) return { bounds: b, maxZoom: 9.5 };
  }
  if (st.run) {
    const coords = regionMatches(st.run, st.region).flatMap((m) => (m.geoDetail.center ? [m.geoDetail.center.a, m.geoDetail.center.b] : []));
    const b = padBounds(boundsOf(coords), 0.25);
    if (b) return { bounds: b, maxZoom: 8.5 };
  }
  return { bounds: regionBounds(st.region), maxZoom: 8.5 };
}

/**
 * The post-run hub: the midpoint centroid of the region's first wave (engine order, the 12 links that draw in first).
 * The overview still frames every flagged pair center; the hub only decides where the horizontal slack goes.
 */
function revealHub(): [number, number] | null {
  const st = useAtlas.getState();
  if (!st.run || st.focus) return null;
  const mids = regionMatches(st.run, st.region)
    .flatMap((m) => (m.geoDetail.center ? [[(m.geoDetail.center.a[0] + m.geoDetail.center.b[0]) / 2, (m.geoDetail.center.a[1] + m.geoDetail.center.b[1]) / 2] as [number, number]] : []))
    .slice(0, 12);
  if (!mids.length) return null;
  return [mids.reduce((s, p) => s + p[0], 0) / mids.length, mids.reduce((s, p) => s + p[1], 0) / mids.length];
}

/**
 * fitBounds centres the flagged pairs' box, which puts a hub at the box's corner (Savannah at the bottom-right of the
 * Augusta–Savannah diagonal). When the frame is wider than the box, slide the camera sideways (at the fitted zoom) so
 * the hub sits as near the frame's centre as the box still allows: nothing leaves the frame, the payoff reads centred.
 */
function hubBiased(map: mapboxgl.Map, bounds: Bounds, padding: CameraPadding, pitch: number, maxZoom: number): { center: [number, number]; zoom: number } | null {
  const hub = revealHub();
  if (!hub) return null;
  const cam = map.cameraForBounds(bounds as LngLatBoundsLike, { padding, pitch, bearing: 0, maxZoom });
  if (!cam || cam.zoom == null || !cam.center) return null;
  const c = cam.center as { lng: number; lat: number } | [number, number];
  const [lng, lat] = Array.isArray(c) ? c : [c.lng, c.lat];
  const ws = 512 * 2 ** cam.zoom;
  const mx = (lon: number) => ((lon + 180) / 360) * ws;
  const frameW = map.getContainer().clientWidth - padding.left - padding.right;
  const slack = Math.max(0, (frameW - (mx(bounds[1][0]) - mx(bounds[0][0]))) / 2) * 0.9;
  const dx = Math.max(-slack, Math.min(slack, mx(hub[0]) - mx(lng)));
  if (Math.abs(dx) < 8) return null;
  return { center: [lng + (dx / ws) * 360, lat], zoom: cam.zoom };
}

/* ------------------------------------------------ director ------------------------------------------------ */

export class CameraDirector {
  private map: mapboxgl.Map;
  private last: CameraIntent | null = null;
  private lastPadding: CameraPadding | null = null;
  /** The user panned/zoomed/rotated since our last move: padding changes then only ease the padding. */
  private userMoved = false;
  private pendingSync = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pending sync only eases the padding (a panel resized by hand): the target stays where the user left it. */
  private syncPaddingOnly = false;
  reduced = false;

  constructor(map: mapboxgl.Map) {
    this.map = map;
    map.on("movestart", (e: { originalEvent?: Event }) => {
      if (e.originalEvent) this.userMoved = true;
    });
    map.on("moveend", () => {
      if (!this.pendingSync) return;
      const paddingOnly = this.syncPaddingOnly;
      this.pendingSync = false;
      this.scheduleSync(0, paddingOnly);
    });
  }

  private pitchFor(kind: "pair" | "overview") {
    const threeD = useAtlas.getState().mapMode === "3d";
    if (!threeD) return { pitch: 0, bearing: 0 };
    return kind === "pair" ? { pitch: PAIR_PITCH, bearing: PAIR_BEARING } : { pitch: OVERVIEW_PITCH, bearing: 0 };
  }

  /** Run one camera intent. `animate: false` = jump (first placement, reduced motion). */
  move(intent: CameraIntent, opts: { animate?: boolean; duration?: number } = {}) {
    const map = this.map;
    const animate = (opts.animate ?? true) && !this.reduced;
    const padding = currentPadding(intent.kind === "pair" || intent.kind === "project" ? "pair" : "overview");
    this.last = intent;
    this.lastPadding = padding;
    this.userMoved = false;
    this.pendingSync = false;
    // dev only, like window.__map: the last 40 camera moves (intent + padding), for probe scripts chasing camera races
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __camLog?: unknown[] };
      (w.__camLog ??= []).push({ t: Math.round(performance.now()), intent, animate, padding });
      if (w.__camLog.length > 40) w.__camLog.shift();
    }

    if (intent.kind === "project") {
      const p = SNAPSHOT.projects.find((x) => x.id === intent.projectId);
      const b = p ? padBounds(boundsOf(projectCoords(p)), 0.03) : null;
      if (!b) return;
      map.fitBounds(b as LngLatBoundsLike, {
        padding,
        ...this.pitchFor("pair"),
        maxZoom: 10,
        duration: animate ? (opts.duration ?? 1300) : 0,
        curve: 1.3,
        easing: easeCamera,
        essential: true,
      });
      return;
    }

    if (intent.kind === "pair") {
      const m = useAtlas.getState().run?.matches.find((x) => x.id === intent.matchId);
      const b = m ? padBounds(boundsOf(pairFrameCoords(m)), 0.01) : null;
      if (!b) return;
      const cross = !!intent.crossRegion;
      map.fitBounds(b as LngLatBoundsLike, {
        padding,
        ...this.pitchFor("pair"),
        maxZoom: PAIR_MAX_ZOOM,
        duration: animate ? (opts.duration ?? (cross ? 2000 : 1300)) : 0,
        curve: cross ? 1.4 : 1.3,
        easing: easeCamera,
        essential: true,
      });
      return;
    }

    const { bounds, maxZoom } = overviewTarget();
    if (!bounds) return;
    const reveal = intent.kind === "reveal";
    const angles = this.pitchFor("overview");
    const biased = hubBiased(map, bounds, padding, angles.pitch, maxZoom);
    if (biased) {
      const camera = {
        center: biased.center,
        zoom: biased.zoom,
        padding,
        ...angles,
        duration: animate ? (opts.duration ?? (reveal ? 1400 : 1600)) : 0,
        easing: easeCamera,
        essential: true,
      };
      // the reveal eases in place; region / reset moves fly
      if (reveal) map.easeTo(camera);
      else map.flyTo({ ...camera, curve: 1.3 });
      return;
    }
    map.fitBounds(bounds as LngLatBoundsLike, {
      padding,
      ...this.pitchFor("overview"),
      maxZoom,
      // the reveal and short re-frames ease in place; region / reset moves fly
      linear: reveal,
      duration: animate ? (opts.duration ?? (reveal ? 1400 : 1600)) : 0,
      curve: 1.3,
      easing: easeCamera,
      essential: true,
    });
  }

  /** 3D ⇄ Flat: re-frame the current target at the new pitch (or just tilt, if the user has moved the map). */
  modeChanged() {
    const map = this.map;
    const st = useAtlas.getState();
    const { pitch, bearing } = this.pitchFor(st.selectedMatchId || this.last?.kind === "project" ? "pair" : "overview");
    if (this.userMoved || !this.last) {
      map.easeTo({
        pitch,
        bearing,
        duration: this.reduced ? 0 : 900,
        easing: easeCamera,
        essential: true,
      });
      return;
    }
    this.move(this.last.kind === "reveal" ? { kind: "overview" } : this.last, {
      duration: 900,
    });
  }

  /**
   * Something that changes the padding happened (panel, dock, sheet, card): re-frame once the map is still.
   * `paddingOnly` (a panel resized by hand): just ease the padding, never re-run the last move. A re-frame requested
   * meanwhile wins.
   */
  scheduleSync(delay = 60, paddingOnly = false) {
    this.syncPaddingOnly = this.syncTimer || this.pendingSync ? this.syncPaddingOnly && paddingOnly : paddingOnly;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.sync();
    }, delay);
  }

  private sync() {
    const map = this.map;
    const padding = currentPadding(this.last?.kind === "pair" || this.last?.kind === "project" ? "pair" : "overview");
    if (samePadding(this.lastPadding, padding)) return;
    if (map.isMoving()) {
      this.pendingSync = true;
      return;
    }
    const paddingOnly = this.syncPaddingOnly;
    this.syncPaddingOnly = false;
    if (!paddingOnly && !this.userMoved && this.last) {
      // keep the target framed: re-run the last intent with the new padding, quickly
      this.move(this.last.kind === "reveal" ? { kind: "overview" } : this.last, { duration: 600 });
      return;
    }
    this.lastPadding = padding;
    map.easeTo({
      padding,
      duration: this.reduced ? 0 : 480,
      easing: easeEnter,
      essential: true,
    });
  }
}
