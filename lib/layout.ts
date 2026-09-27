import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { useAtlas, type AtlasState, type SheetSnap } from "@/lib/store";

/**
 * One source of truth for the floating layout over the full-bleed map (SPEC §3).
 *
 * `computeLayout` is pure (unit-tested in tests/layout.test.ts). `useLayout()` feeds it the viewport and the store and
 * writes the result as CSS custom properties, so every floating element positions itself only from these variables:
 *
 *   --gutter        outer gutter (12 phone · 16 · 20 at ≥1536)
 *   --header-h      header strip height (48); the header sits at top: var(--gutter) (phone: max(gutter, safe-area top))
 *   --panel-top     top of the rail, inspector and rail pill (gutter + header + 12; phone: max(12, safe-area top) + 56)
 *   --rail-w        Opportunities panel width (also the pill's overlay width; phone = viewport width)
 *   --inspector-w   inspector width, written even while it is closed so it can animate in (phone = viewport width)
 *   --dock-h        timeline dock height (overview 96 · pair 196 · a dragged height · collapsed 44 · 0 on phones / hidden UI)
 *   --focal-l/t/r/b the focal hole as INSETS from the viewport edges (like CSS `inset`), gaps to the panels included:
 *                   left = gutter + rail + 12 when the rail is docked, right = gutter + inspector + 12 when it is open,
 *                   top = --panel-top (+ 44 while the "Opportunities · N" pill shows, so whatever sits at the focal
 *                   top-left — the key chip, the demo card — clears it), bottom = gutter + dock + 12
 *                   (phone: bottom sheet + 8; the sheet height already includes the safe-area bottom)
 *   --focal-w/h     size of that hole
 *   --demo-card-w   guided-demo card width, min(520, focal width − 24)
 *   --sheet-h       phone bottom-sheet height for the current snap, safe-area bottom included (0 on desktop)
 *
 * e.g. the dock is `left: var(--focal-l); right: var(--focal-r); bottom: var(--gutter); height: var(--dock-h)`, the
 * map controls are `right: var(--focal-r); bottom: var(--focal-b)`, the key chip is `left: var(--focal-l); top: var(--focal-t)`.
 * The shell also gets `data-tier` (xl | lg | md | phone) and `data-rail-mode` (panel | pill | sheet).
 * Before hydration app/globals.css supplies the same variables per breakpoint (the pre-run layout), so tablets and
 * phones never paint the desktop geometry first.
 */

export type Tier = "xl" | "lg" | "md" | "phone";
/** "drawer" is legacy (md used to be a drawer; since SPEC v2.1 md behaves like lg) and is never produced. */
export type RailMode = "panel" | "pill" | "drawer" | "sheet";

export interface LayoutOptions {
  inspectorOpen: boolean;
  /** lg/md: the rail pill's overlay is open (never changes the focal hole: it floats over the map). */
  railOpen: boolean;
  /** Phone safe-area insets in px (env(safe-area-inset-top/bottom), measured by useLayout/getLayout; 0 elsewhere). */
  safeTop?: number;
  safeBottom?: number;
  demoOn: boolean;
  /** The user's dock toggle; the layout may still force the dock collapsed (see `dockForced`). */
  timelineCollapsed: boolean;
  isPhone: boolean;
  /** Pair selected → the dock shows the pair Gantt (196) instead of the overview (96). */
  pairSelected: boolean;
  /** 0-based demo step: the dock stays open on steps 1 and 4 (indices 0 and 3); unknown → collapsed while the demo runs. */
  demoStep?: number | null;
  /** Phone bottom-sheet snap (ignored while the inspector sheet is open). */
  sheetSnap?: SheetSnap;
  /** H key: panels hidden (the demo card stays); the focal hole grows to the gutters. */
  uiHidden?: boolean;
  /**
   * Sizes the user dragged (px; null/undefined = the default). Applied on xl/lg only and clamped here, so the map always
   * keeps a focal hole at least MIN_FOCAL_W wide and MIN_FOCAL_H tall (the dock gives way before the map does).
   */
  dockHeight?: number | null;
  railWidth?: number | null;
  inspectorWidth?: number | null;
}

export interface Insets {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Layout {
  vw: number;
  vh: number;
  tier: Tier;
  railMode: RailMode;
  /** The rail is docked on the left while the inspector is closed. */
  railDocked: boolean;
  /** The "Opportunities · N" pill shows at the panel top-left when the inspector is open; focal.t clears it. */
  pillVisible: boolean;
  gutter: number;
  headerH: number;
  panelTop: number;
  railW: number;
  inspectorW: number;
  dockH: number;
  dockCollapsed: boolean;
  /** Collapsed by a layout rule (md tier, demo step other than 1/4, focal height < 300) — the toggle cannot expand it. */
  dockForced: boolean;
  /** Phone bottom-sheet height for the current snap (inspector sheet when open); 0 on desktop. */
  sheetH: number;
  /** Focal hole as insets from the viewport edges. */
  focal: Insets;
  focalW: number;
  focalH: number;
  demoCardW: number;
  /** Map key chip collapses to its 32px (i): phones, while the demo runs, or when the focal hole is narrower than 900. */
  keyCollapsed: boolean;
  /** xl/lg: the docked rail, the inspector and the open dock have resize handles (components/ResizeHandle). */
  resizable: boolean;
  /** The range a resize handle can reach right now (its aria-valuemin/max): the clamps below, given the other panels. */
  railMaxW: number;
  inspectorMaxW: number;
  dockMinH: number;
  dockMaxH: number;
}

export const HEADER_H = 48;
/** Gap between a panel and the focal hole / between stacked floating elements. */
export const PANEL_GAP = 12;
/** The "Opportunities · N" pill: 36px tall at --panel-top; the focal hole (and the pill's overlay rail) start 44px lower. */
export const PILL = { h: 36, clearance: 44 } as const;
/** Phone: the header row is 48px at max(12, safe-area top); panels start 8px below it. */
export const PHONE_TOP = { min: 12, below: HEADER_H + 8 } as const;
/** `min`/`max` bound the automatic width (25% / 29% of the viewport on xl); `userMax` bounds a width the user drags to. */
export const RAIL = { min: 336, max: 392, userMax: 540, vw: 0.25 } as const;
export const INSPECTOR = { min: 384, max: 440, userMax: 620, vw: 0.29, md: 360 } as const;
/**
 * Dock heights: the overview and pair defaults, the collapsed summary, and the smallest height a drag can leave (a face
 * whose default is smaller — the 96px overview strip — never drags below its default).
 */
export const DOCK = { overview: 96, pair: 196, collapsed: 44, min: 120 } as const;
/** A dragged panel width never narrows the map's focal hole below this. */
export const MIN_FOCAL_W = 360;
/** Below this focal height (with the full dock) the dock collapses to its 44px summary; a dragged dock gives way first. */
export const MIN_FOCAL_H = 300;
export const DEMO_CARD_MAX_W = 520;
export const PHONE_SHEET = { peek: 132, half: 0.52, full: 0.88, inspector: 0.64 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function tierOf(vw: number, isPhone = false): Tier {
  if (isPhone || vw < 768) return "phone";
  if (vw >= 1280) return "xl";
  if (vw >= 1024) return "lg";
  return "md";
}

export function computeLayout(vw: number, vh: number, o: LayoutOptions): Layout {
  const tier = tierOf(vw, o.isPhone);
  const phone = tier === "phone";
  const hidden = !!o.uiHidden;
  const gutter = phone ? 12 : vw >= 1536 ? 20 : 16;
  const headerH = HEADER_H;
  // phones: the header row sits at max(12, safe-area top), so a notch pushes every panel down with it
  const panelTop = phone ? Math.max(PHONE_TOP.min, o.safeTop ?? 0) + PHONE_TOP.below : gutter + headerH + PANEL_GAP;

  if (phone) {
    const snap = o.sheetSnap ?? "peek";
    const safeB = Math.max(0, o.safeBottom ?? 0);
    // the rail sheet is its snap height + the safe-area bottom (full never climbs over the header); the inspector
    // sheet's 64dvh already contains the inset
    const sheetH = Math.round(
      o.inspectorOpen
        ? vh * PHONE_SHEET.inspector
        : snap === "full"
          ? Math.min(vh * PHONE_SHEET.full + safeB, vh - panelTop)
          : (snap === "half" ? vh * PHONE_SHEET.half : PHONE_SHEET.peek) + safeB,
    );
    const focal = { l: gutter, t: panelTop, r: gutter, b: hidden ? gutter + safeB : sheetH + 8 };
    const focalW = Math.max(0, vw - focal.l - focal.r);
    return {
      vw,
      vh,
      tier,
      railMode: "sheet",
      railDocked: false,
      pillVisible: false,
      gutter,
      headerH,
      panelTop,
      railW: vw,
      inspectorW: vw,
      dockH: 0,
      dockCollapsed: true,
      dockForced: true,
      sheetH: hidden ? 0 : sheetH,
      focal,
      focalW,
      focalH: Math.max(0, vh - focal.t - focal.b),
      demoCardW: Math.max(0, vw - 2 * gutter),
      keyCollapsed: true,
      resizable: false,
      railMaxW: vw,
      inspectorMaxW: vw,
      dockMinH: 0,
      dockMaxH: 0,
    };
  }

  // The queue is primary while browsing. Once a pair opens it becomes a compact pill on every desktop width, leaving
  // the map and evidence enough room to explain the selected opportunity without three competing columns.
  const railMode: RailMode = !o.inspectorOpen ? "panel" : "pill";
  const railDocked = railMode === "panel" && !hidden;
  const pillVisible = railMode === "pill" && !hidden;
  const inspectorShown = o.inspectorOpen && !hidden;

  // widths: the automatic ones, or what the user dragged (xl/lg only). A dragged width stops where the focal hole would
  // drop under MIN_FOCAL_W, given the other panel's width now (the rail yields first, then the inspector); never below
  // the panel's minimum.
  const resizable = tier === "xl" || tier === "lg";
  const autoRailW = tier === "xl" ? clamp(Math.round(vw * RAIL.vw), RAIL.min, RAIL.max) : RAIL.min;
  const autoInspectorW = tier === "xl" ? clamp(Math.round(vw * INSPECTOR.vw), INSPECTOR.min, INSPECTOR.max) : tier === "lg" ? INSPECTOR.min : INSPECTOR.md;
  /** Width a panel may take next to `other` (the other panel's full inset, or just the gutter when it is not shown). */
  const room = (other: number) => vw - gutter - PANEL_GAP - MIN_FOCAL_W - other;
  const dragged = (v: number | null | undefined) => (resizable && typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  const railDrag = dragged(o.railWidth);
  const inspectorDrag = dragged(o.inspectorWidth);
  let inspectorW = inspectorDrag !== null ? clamp(inspectorDrag, INSPECTOR.min, INSPECTOR.userMax) : autoInspectorW;
  const railMaxW = clamp(room(inspectorShown ? gutter + inspectorW + PANEL_GAP : gutter), RAIL.min, RAIL.userMax);
  const railW = railDrag !== null ? Math.min(clamp(railDrag, RAIL.min, RAIL.userMax), railMaxW) : autoRailW;
  const inspectorMaxW = clamp(room(railDocked ? gutter + railW + PANEL_GAP : gutter), INSPECTOR.min, INSPECTOR.userMax);
  if (inspectorDrag !== null) inspectorW = Math.min(inspectorW, inspectorMaxW);

  const l = railDocked ? gutter + railW + PANEL_GAP : gutter;
  const r = inspectorShown ? gutter + inspectorW + PANEL_GAP : gutter;
  const t = panelTop + (pillVisible ? PILL.clearance : 0);

  // one dragged height serves both faces; it gives way (down to the face's floor) before the map drops under MIN_FOCAL_H
  const defaultDock = o.pairSelected ? DOCK.pair : DOCK.overview;
  const dockMinH = Math.min(DOCK.min, defaultDock);
  const dockMaxH = Math.max(dockMinH, vh - t - gutter - PANEL_GAP - MIN_FOCAL_H);
  const dockDrag = dragged(o.dockHeight);
  const fullDock = dockDrag !== null ? clamp(dockDrag, dockMinH, dockMaxH) : defaultDock;
  const step = o.demoStep;
  const demoCollapses = o.demoOn && !(step === 0 || step === 3);
  const tooShort = vh - t - (gutter + fullDock + PANEL_GAP) < MIN_FOCAL_H;
  const dockForced = tier === "md" || demoCollapses || tooShort;
  const dockCollapsed = dockForced || o.timelineCollapsed;
  const dockH = hidden ? 0 : dockCollapsed ? DOCK.collapsed : fullDock;
  const b = dockH ? gutter + dockH + PANEL_GAP : gutter;

  const focal = { l, t, r, b };
  const focalW = Math.max(0, vw - l - r);
  const focalH = Math.max(0, vh - t - b);
  return {
    vw,
    vh,
    tier,
    railMode,
    railDocked,
    pillVisible,
    gutter,
    headerH,
    panelTop,
    railW,
    inspectorW,
    dockH,
    dockCollapsed,
    dockForced,
    sheetH: 0,
    focal,
    focalW,
    focalH,
    demoCardW: Math.max(0, Math.min(DEMO_CARD_MAX_W, focalW - 24)),
    keyCollapsed: o.demoOn || focalW < 900,
    resizable,
    railMaxW,
    inspectorMaxW,
    dockMinH,
    dockMaxH,
  };
}

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CameraPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Breathing room inside the focal hole; the top also clears the 32px map-key chip row on desktop. */
export const CAMERA_INSET = { top: 44, phoneTop: 16, side: 24, bottom: 24 } as const;
/** fitBounds always keeps at least this many px of frame on each axis. */
export const MIN_FRAME = 80;

/**
 * Mapbox camera padding for the focal hole: the layout's insets plus breathing room, plus the measured guided-demo card
 * (a card in the top half pushes the top down, one in the bottom half pushes the bottom up). Shrunk proportionally so
 * fitBounds can always succeed (at least MIN_FRAME px of frame on each axis).
 */
export function cameraPadding(l: Layout, demoCard?: RectLike | null): CameraPadding {
  const phone = l.tier === "phone";
  const pad: CameraPadding = {
    top: l.focal.t + (phone ? CAMERA_INSET.phoneTop : CAMERA_INSET.top),
    right: l.focal.r + CAMERA_INSET.side,
    bottom: l.focal.b + CAMERA_INSET.bottom,
    left: l.focal.l + CAMERA_INSET.side,
  };
  if (demoCard && demoCard.bottom > demoCard.top) {
    if ((demoCard.top + demoCard.bottom) / 2 < l.vh / 2) pad.top = Math.max(pad.top, Math.round(demoCard.bottom + 16));
    else pad.bottom = Math.max(pad.bottom, Math.round(l.vh - demoCard.top + 16));
  }
  const fit = (a: number, b: number, total: number): [number, number] => {
    const max = Math.max(0, total - MIN_FRAME);
    const k = a + b > max ? max / (a + b) : 1;
    return [Math.floor(a * k), Math.floor(b * k)];
  };
  [pad.left, pad.right] = fit(pad.left, pad.right, l.vw);
  [pad.top, pad.bottom] = fit(pad.top, pad.bottom, l.vh);
  return pad;
}

/** The CSS custom properties for a layout (px strings), as `useLayout` writes them. */
export function layoutCssVars(l: Layout): Record<string, string> {
  const px = (n: number) => `${Math.round(n)}px`;
  return {
    "--gutter": px(l.gutter),
    "--header-h": px(l.headerH),
    "--panel-top": px(l.panelTop),
    "--rail-w": px(l.railW),
    "--inspector-w": px(l.inspectorW),
    "--dock-h": px(l.dockH),
    "--focal-l": px(l.focal.l),
    "--focal-t": px(l.focal.t),
    "--focal-r": px(l.focal.r),
    "--focal-b": px(l.focal.b),
    "--focal-w": px(l.focalW),
    "--focal-h": px(l.focalH),
    "--demo-card-w": px(l.demoCardW),
    "--sheet-h": px(l.sheetH),
  };
}

/* ------------------------------------------------ client hook ------------------------------------------------ */

export interface Viewport {
  vw: number;
  vh: number;
  /** env(safe-area-inset-top/bottom) in px (notched phones with viewportFit: cover; 0 elsewhere). */
  safeTop: number;
  safeBottom: number;
}

const SERVER_VIEWPORT: Viewport = { vw: 1440, vh: 900, safeTop: 0, safeBottom: 0 };
let viewport: Viewport = SERVER_VIEWPORT;

/**
 * The safe-area insets in px. globals.css registers --safe-t / --safe-b as <length> (@property), so their computed
 * value on <html> is env(safe-area-inset-*) resolved to px — read without touching the DOM (this runs during render).
 */
function readSafeArea(): { t: number; b: number } {
  const cs = getComputedStyle(document.documentElement);
  return { t: Math.round(parseFloat(cs.getPropertyValue("--safe-t")) || 0), b: Math.round(parseFloat(cs.getPropertyValue("--safe-b")) || 0) };
}

/** The live viewport; stable identity until the size changes (the safe area is re-read only then: rotation). */
function readViewport(): Viewport {
  if (typeof window === "undefined") return SERVER_VIEWPORT;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (viewport === SERVER_VIEWPORT || vw !== viewport.vw || vh !== viewport.vh) {
    const safe = readSafeArea();
    if (viewport === SERVER_VIEWPORT || vw !== viewport.vw || vh !== viewport.vh || safe.t !== viewport.safeTop || safe.b !== viewport.safeBottom)
      viewport = { vw, vh, safeTop: safe.t, safeBottom: safe.b };
  }
  return viewport;
}

function subscribeViewport(cb: () => void) {
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
}

/** Live viewport size + safe-area insets (SSR and hydration: 1440×900, the judge layout). */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribeViewport, readViewport, () => SERVER_VIEWPORT);
}

function writeVars(l: Layout) {
  const vars = layoutCssVars(l);
  const targets = new Set<HTMLElement>([document.documentElement]);
  const shell = document.querySelector<HTMLElement>(".atlas-shell");
  if (shell) targets.add(shell);
  for (const el of targets) {
    for (const [k, v] of Object.entries(vars)) if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
    if (el.dataset.tier !== l.tier) el.dataset.tier = l.tier;
    if (el.dataset.railMode !== l.railMode) el.dataset.railMode = l.railMode;
  }
}

type LayoutInputs = Pick<AtlasState, "inspectorOpen" | "railOpen" | "demoStep" | "timelineCollapsed" | "selectedMatchId" | "sheetSnap" | "uiHidden"> &
  Partial<Pick<AtlasState, "dockHeight" | "railWidth" | "inspectorWidth">>;

/** Layout options from the store fields that drive the layout (shared by useLayout and getLayout, so they always agree). */
export function layoutOptions(s: LayoutInputs, vw: number, safe?: { top: number; bottom: number }): LayoutOptions {
  return {
    inspectorOpen: s.inspectorOpen,
    railOpen: s.railOpen,
    demoOn: s.demoStep !== null,
    demoStep: s.demoStep,
    timelineCollapsed: s.timelineCollapsed,
    isPhone: vw < 768,
    pairSelected: s.selectedMatchId !== null,
    sheetSnap: s.sheetSnap,
    uiHidden: s.uiHidden,
    safeTop: safe?.top ?? 0,
    safeBottom: safe?.bottom ?? 0,
    dockHeight: s.dockHeight ?? null,
    railWidth: s.railWidth ?? null,
    inspectorWidth: s.inspectorWidth ?? null,
  };
}

/**
 * The layout right now, outside React: e.g. MapStage computing camera padding at call time
 * (`cameraPadding(getLayout(), demoCard?.getBoundingClientRect())`).
 */
export function getLayout(): Layout {
  const v = readViewport();
  return computeLayout(v.vw, v.vh, layoutOptions(useAtlas.getState(), v.vw, { top: v.safeTop, bottom: v.safeBottom }));
}

/** Just the tier (cheaper than useLayout: re-renders only when the viewport crosses a breakpoint). */
export function useTier(): Tier {
  return useSyncExternalStore(subscribeViewport, () => tierOf(readViewport().vw), () => tierOf(SERVER_VIEWPORT.vw));
}

// the tier the dock default was last applied for (module-wide, so a late-mounting caller never re-collapses the dock)
let dockDefaultTier: Tier | null = null;

/**
 * The live layout. Safe to call from any client component (Atlas calls it once so the variables exist on first paint
 * after hydration; other callers just read it). Writes the CSS variables on `.atlas-shell` and `<html>` (so portals get
 * them too) and, whenever the tier changes, applies the dock default: collapsed on lg/md ("starts collapsed"), open on xl.
 * The hydration pass renders with the server's 1440×900 guess; its variables are never written (the CSS defaults in
 * globals.css hold until the real viewport's layout commits), so a phone never paints desktop geometry.
 */
export function useLayout(): Layout {
  const { vw, vh, safeTop, safeBottom } = useViewport();
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const railOpen = useAtlas((s) => s.railOpen);
  const demoStep = useAtlas((s) => s.demoStep);
  const timelineCollapsed = useAtlas((s) => s.timelineCollapsed);
  const pairSelected = useAtlas((s) => s.selectedMatchId !== null);
  const sheetSnap = useAtlas((s) => s.sheetSnap);
  const uiHidden = useAtlas((s) => s.uiHidden);
  const dockHeight = useAtlas((s) => s.dockHeight);
  const railWidth = useAtlas((s) => s.railWidth);
  const inspectorWidth = useAtlas((s) => s.inspectorWidth);

  const layout = useMemo(
    () =>
      computeLayout(
        vw,
        vh,
        layoutOptions(
          { inspectorOpen, railOpen, demoStep, timelineCollapsed, selectedMatchId: pairSelected ? "" : null, sheetSnap, uiHidden, dockHeight, railWidth, inspectorWidth },
          vw,
          { top: safeTop, bottom: safeBottom },
        ),
      ),
    [vw, vh, safeTop, safeBottom, inspectorOpen, railOpen, demoStep, timelineCollapsed, pairSelected, sheetSnap, uiHidden, dockHeight, railWidth, inspectorWidth],
  );

  useLayoutEffect(() => {
    // the hydration render uses the server's guess; only a layout for the real window is written
    if (layout.vw === window.innerWidth && layout.vh === window.innerHeight) writeVars(layout);
  }, [layout]);

  useEffect(() => {
    if (layout.vw !== window.innerWidth || dockDefaultTier === layout.tier) return;
    const first = dockDefaultTier === null;
    dockDefaultTier = layout.tier;
    const collapsed = layout.tier === "lg" || layout.tier === "md";
    // xl starts open, which is already the store default
    if (first && !collapsed) return;
    if (useAtlas.getState().timelineCollapsed !== collapsed) useAtlas.getState().set({ timelineCollapsed: collapsed });
  }, [layout.tier, layout.vw]);

  return layout;
}
