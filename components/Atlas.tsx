"use client";

import clsx from "clsx";
import { ChevronDown, Info, Link2Off, ListOrdered, MapPinOff } from "lucide-react";
import { MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { catchError, type ErrorInfo } from "next/error";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { SNAPSHOT } from "@/lib/data";
import type { MatchRun } from "@/lib/domain/types";
import { computeLayout, layoutCssVars, PHONE_SHEET, useLayout } from "@/lib/layout";
import { regionMatches } from "@/lib/rank";
import { useReview } from "@/lib/review";
import { useAtlas, type SheetSnap } from "@/lib/store";
import { BriefModal } from "./BriefModal";
import { MethodDrawer, SourcesDrawer } from "./Drawers";
import { GuidedDemo } from "./GuidedDemo";
import { Inspector } from "./Inspector";
import { MapOverlays } from "./MapOverlays";
import { Queue } from "./Queue";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { mapUi, Notice } from "./ui";

/*
 * The shell (SPEC §3): the map is the stage, full-bleed and fixed; everything else floats over it in SLOTS that are
 * positioned only from the CSS variables lib/layout.ts writes (--gutter --panel-top --rail-w --inspector-w --dock-h
 * --focal-l/t/r/b …). A slot is a plain positioned box (no material, no transform, so `position: fixed` inside still
 * means the viewport); the component mounted in it fills it and brings its own surface.
 *
 *   [data-slot=rail]       Queue      left panel · lg/md: overlay behind the "Opportunities · N" pill · phone: bottom sheet
 *   [data-slot=inspector]  Inspector  right panel · phone: its own sheet whose top clears --demo-card-bottom
 *   [data-slot=dock]       Timeline   bottom, spanning the focal width (hidden on phones)
 *   [data-slot=focal]      MapOverlays + GuidedDemo: a box exactly over the focal hole (the map no panel covers);
 *                          children position themselves inside it (top-left key chip, bottom-right controls, …)
 *
 * BriefModal, SourcesDrawer and MethodDrawer stay DIRECT children of .atlas-shell (the print CSS relies on it).
 */

const MapStage = dynamic(() => import("./MapStage"), { ssr: false, loading: () => <div aria-hidden className="absolute inset-0 bg-canvas" /> });
const PairCloseup = dynamic(() => import("./PairCloseup"), { ssr: false });

/** Layout variables for the server render and the first paint (the 1440×900 judge layout); useLayout overwrites them. */
const SSR_VARS = layoutCssVars(
  computeLayout(1440, 900, { inspectorOpen: false, railOpen: false, demoOn: false, timelineCollapsed: false, isPhone: false, pairSelected: false }),
) as CSSProperties;

/** The rail pill's height + gap: the rail overlay and the focal box start below it while it shows. */
const PILL_CLEARANCE = 44;

export function Atlas() {
  return (
    <MotionConfig reducedMotion="user">
      {/* overflow-clip, not hidden: a hidden box is still a scroll container, and scrollIntoView inside a panel would scroll the whole shell */}
      <div className="atlas-shell relative h-dvh w-full max-w-[100vw] overflow-clip bg-canvas" style={SSR_VARS}>
        <ShellEffects />
        <MapLayer />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-(--z-vignette)" style={{ background: VIGNETTE }} />
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-(--z-vignette)" style={HEADER_SCRIM} />
        <Closeup />
        {/* DOM order = tab order: header → opportunities → inspector → timeline → map controls and demo card */}
        <TopBar />
        <RailPill />
        <RailSlot>
          <Queue />
        </RailSlot>
        <InspectorSlot>
          <Inspector />
        </InspectorSlot>
        <DockSlot>
          <Timeline />
        </DockSlot>
        <FocalSlot>
          <MapOverlays />
          <GuidedDemo />
        </FocalSlot>
        <Notices />
        <RunAnnouncer />
        <BriefModal />
        <SourcesDrawer />
        <MethodDrawer />
      </div>
    </MotionConfig>
  );
}

/** Keeps Atlas itself subscription-free, so slot re-renders (resize, selection) never re-render the panels inside. */
function ShellEffects() {
  useLayout();
  useKeyboard();
  useUrlSync();
  useEffect(() => useReview.getState().hydrate(), []);
  // dev only, like window.__map: lets screenshot/probe scripts drive the store (`__atlas.getState().openCloseup()`)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __atlas?: typeof useAtlas }).__atlas = useAtlas;
  }, []);
  return null;
}

/* ─────────────────────────────────────────────────── map ─────────────────────────────────────────────────── */

/** A soft edge falloff and a floor under the dock: floating type stays legible on any basemap. */
const VIGNETTE = [
  "radial-gradient(135% 105% at 50% 42%, transparent 60%, color-mix(in srgb, var(--canvas) 55%, transparent) 100%)",
  "linear-gradient(to top, color-mix(in srgb, var(--canvas) 45%, transparent), transparent 18%)",
].join(", ");

/** Behind the header: a darkening band with a progressive blur, so basemap labels never read through the wordmark. */
const HEADER_SCRIM: CSSProperties = {
  height: "calc(var(--panel-top, 76px) + 36px)",
  background:
    "linear-gradient(to bottom, color-mix(in srgb, var(--canvas) 86%, transparent), color-mix(in srgb, var(--canvas) 58%, transparent) calc(var(--panel-top, 76px) - 12px), transparent)",
  WebkitBackdropFilter: "blur(10px)",
  backdropFilter: "blur(10px)",
  WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent)",
  maskImage: "linear-gradient(to bottom, black 50%, transparent)",
};

const DOT_GRID: CSSProperties = { backgroundImage: "radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px)", backgroundSize: "28px 28px" };

function MapUnavailable(_props: Record<string, unknown>, { reset }: ErrorInfo) {
  return (
    <div className="absolute inset-0 bg-canvas">
      <div aria-hidden className="absolute inset-0" style={DOT_GRID} />
      <div className="absolute flex items-center justify-center px-4" style={{ left: "var(--focal-l)", top: "var(--focal-t)", right: "var(--focal-r)", bottom: "var(--focal-b)" }}>
        <Notice icon={<MapPinOff />} actionLabel="Retry map" onAction={reset}>
          Map unavailable — the list, inspector and brief still work.
        </Notice>
      </div>
    </div>
  );
}
const MapBoundary = catchError(MapUnavailable);

function MapLayer() {
  return (
    <div className="fixed inset-0 z-(--z-map)">
      <MapBoundary>
        <MapStage />
      </MapBoundary>
    </div>
  );
}

/* ──────────────────────────────────────────────── 3D close-up ──────────────────────────────────────────────── */

const CLOSEUP_UNAVAILABLE = "3D close-up unavailable on this device";

let webgl2: boolean | null = null;
function supportsWebGL2(): boolean {
  if (webgl2 === null) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      webgl2 = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

function CloseupFailed() {
  useEffect(() => {
    const st = useAtlas.getState();
    st.set({ closeupOpen: false });
    st.showNotice(CLOSEUP_UNAVAILABLE, "closeup-unavailable");
  }, []);
  return null;
}
const CloseupBoundary = catchError(() => <CloseupFailed />);

let closeupPreloaded = false;

/** Mounts the 3D close-up (next/dynamic, client only) while it is open for a selected pair; WebGL2 is checked first. */
function Closeup() {
  const open = useAtlas((s) => s.closeupOpen);
  const selected = useAtlas((s) => s.selectedMatchId);
  const demoStep = useAtlas((s) => s.demoStep);
  const active = open && selected !== null;

  // warm the chunk on the first pair selection (or once the demo has compared), while the browser is idle
  useEffect(() => {
    if (closeupPreloaded || (selected === null && (demoStep ?? 0) < 1)) return;
    closeupPreloaded = true;
    const load = () => void import("./PairCloseup");
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(load, { timeout: 4000 });
    else window.setTimeout(load, 1200);
  }, [selected, demoStep]);

  useEffect(() => {
    if (!active || supportsWebGL2()) return;
    const st = useAtlas.getState();
    st.set({ closeupOpen: false });
    st.showNotice(CLOSEUP_UNAVAILABLE, "closeup-unavailable");
  }, [active]);

  if (!active || !supportsWebGL2()) return null;
  return (
    <CloseupBoundary>
      <PairCloseup />
    </CloseupBoundary>
  );
}

/* ─────────────────────────────────────────────────── slots ─────────────────────────────────────────────────── */

/**
 * The focal hole. Old MapOverlays/GuidedDemo position themselves inside it; the shell hides the pieces it now owns
 * (the full-bleed vignette, the link notice) and fits the legacy demo card to the hole.
 */
function FocalSlot({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const uiHidden = useAtlas((s) => s.uiHidden);
  const briefOpen = useAtlas((s) => s.briefOpen);
  const closeupOpen = useAtlas((s) => s.closeupOpen);
  return (
    <div
      data-slot="focal"
      className={clsx(
        "pointer-events-none absolute transition-[left,top,right,bottom] duration-(--dur-4) ease-enter [&>:not(.pointer-events-none)]:pointer-events-auto",
        "[&>.stage-vignette]:hidden [&>[role=status]]:hidden",
        // legacy MapOverlays: the old stage held the inspector, so the controls offset themselves by its width and the
        // overview chip shrank by it; inside the focal hole neither applies
        "[&>div:has(>[aria-label='Map_perspective'])]:right-3! [&>.pointer-events-none]:max-w-[calc(100%-300px)]!",
        "sm:[&>[role=region]]:max-w-[calc(100%-24px)]!",
        !briefOpen && "max-sm:[&>[role=region]]:top-(--panel-top)!",
        // H, or the 3D close-up over the map: only the guided-demo card stays
        (uiHidden || closeupOpen) && "[&>:not([role=region])]:hidden!",
      )}
      style={{
        left: "var(--focal-l)",
        top: layout.pillVisible ? `calc(var(--focal-t) + ${PILL_CLEARANCE}px)` : "var(--focal-t)",
        right: "var(--focal-r)",
        bottom: "var(--focal-b)",
      }}
    >
      {children}
    </div>
  );
}

/** lg (inspector open) / md: the rail collapses to this glass pill at the focal top-left; it opens the rail as an overlay. */
function RailPill() {
  const layout = useLayout();
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  const railOpen = useAtlas((s) => s.railOpen);
  const set = useAtlas((s) => s.set);
  if (!layout.pillVisible) return null;
  const count = run ? regionMatches(run, region).length.toLocaleString("en-US") : `${SNAPSHOT.projects.filter((p) => region === "all" || p.region === region).length} plans`;
  return (
    <button
      type="button"
      data-rail-pill
      {...mapUi()}
      aria-expanded={railOpen}
      aria-controls="opportunities-rail"
      onClick={() => set({ railOpen: !railOpen })}
      className={clsx(
        "chrome absolute z-(--z-panel) inline-flex h-9 animate-fade-in items-center gap-2 rounded-full pr-2.5 pl-3 text-ui font-medium whitespace-nowrap text-fg-1 transition-colors duration-150 hover:bg-surface-raised",
        railOpen && "bg-surface-raised",
      )}
      style={{ left: "var(--gutter)", top: "var(--panel-top)" }}
    >
      <ListOrdered size={16} strokeWidth={1.75} className="text-fg-2" />
      Opportunities
      <span className="num text-fg-3">· {count}</span>
      <ChevronDown size={14} strokeWidth={2} className={clsx("text-fg-3 transition-transform duration-200", railOpen && "rotate-180")} />
    </button>
  );
}

const SNAPS: SheetSnap[] = ["peek", "half", "full"];
const SNAP_CSS: Record<SheetSnap, string> = {
  peek: `${PHONE_SHEET.peek}px`,
  half: `${PHONE_SHEET.half * 100}dvh`,
  full: `${PHONE_SHEET.full * 100}dvh`,
};

function snapHeights(): Record<SheetSnap, number> {
  const vh = window.innerHeight;
  return { peek: PHONE_SHEET.peek, half: Math.round(vh * PHONE_SHEET.half), full: Math.round(vh * PHONE_SHEET.full) };
}

/** Phone bottom sheet: drag the handle between peek / half / full (flicks go one snap further); a tap calls `onTap`. */
function useSheetDrag(onTap: () => void) {
  const set = useAtlas((s) => s.set);
  const [dragH, setDragH] = useState<number | null>(null);
  const g = useRef<{ id: number; y: number; h: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // capture at once, so a fast drag that leaves the 24px strip keeps reporting; taps are handled on pointerup
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current = { id: e.pointerId, y: e.clientY, h: snapHeights()[useAtlas.getState().sheetSnap], lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dy = e.clientY - s.y;
    if (!s.moved) {
      if (Math.abs(dy) < 6) return;
      s.moved = true;
    }
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) s.v = (e.clientY - s.lastY) / dt;
    s.lastY = e.clientY;
    s.lastT = e.timeStamp;
    const hs = snapHeights();
    setDragH(Math.min(hs.full + 16, Math.max(hs.peek * 0.7, s.h - dy)));
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLElement>) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId) return;
    if (!s.moved) {
      if (e.type === "pointerup") onTap();
      return;
    }
    const hs = snapHeights();
    const h = s.h - (e.clientY - s.y);
    let target = SNAPS.reduce((best, k) => (Math.abs(hs[k] - h) < Math.abs(hs[best] - h) ? k : best), "peek" as SheetSnap);
    if (s.v < -0.45) target = SNAPS.find((k) => hs[k] > h + 8) ?? "full";
    else if (s.v > 0.45) target = [...SNAPS].reverse().find((k) => hs[k] < h - 8) ?? "peek";
    set({ sheetSnap: target });
    setDragH(null);
  };
  return { dragH, handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } };
}

/** The Opportunities rail: docked panel (xl, lg without inspector), overlay behind the pill (lg/md), bottom sheet (phone). */
function RailSlot({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const railOpen = useAtlas((s) => s.railOpen);
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const uiHidden = useAtlas((s) => s.uiHidden);
  const snap = useAtlas((s) => s.sheetSnap);
  const set = useAtlas((s) => s.set);
  const slot = useRef<HTMLDivElement>(null);
  const cycle = () => set({ sheetSnap: SNAPS[(SNAPS.indexOf(useAtlas.getState().sheetSnap) + 1) % SNAPS.length] });
  const { dragH, handlers } = useSheetDrag(cycle);

  const sheet = layout.railMode === "sheet";
  const overlay = layout.railMode === "pill" || layout.railMode === "drawer";
  const shown = !uiHidden && (sheet ? !inspectorOpen : !overlay || railOpen);

  // the overlay rail closes on a click anywhere else (selecting a row closes it too, in the store)
  useEffect(() => {
    if (!overlay || !railOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || slot.current?.contains(t) || t.closest("[data-rail-pill], [data-portal], [role=dialog]")) return;
      useAtlas.getState().set({ railOpen: false });
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [overlay, railOpen]);

  const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = SNAPS.indexOf(snap);
    if (e.key === "ArrowUp" && i < SNAPS.length - 1) set({ sheetSnap: SNAPS[i + 1] });
    else if (e.key === "ArrowDown" && i > 0) set({ sheetSnap: SNAPS[i - 1] });
    else return;
    e.preventDefault();
  };

  const style: CSSProperties = sheet
    ? { left: 0, right: 0, bottom: 0, height: `calc(${dragH !== null ? `${Math.round(dragH)}px` : SNAP_CSS[snap]} + var(--safe-b))` }
    : { left: "var(--gutter)", top: overlay ? `calc(var(--panel-top) + ${PILL_CLEARANCE}px)` : "var(--panel-top)", bottom: "var(--gutter)", width: "var(--rail-w)" };

  return (
    <div
      ref={slot}
      id="opportunities-rail"
      data-slot="rail"
      {...(shown ? mapUi(sheet ? "bottom" : overlay ? undefined : "left") : {})}
      inert={!shown}
      className={clsx(
        // the overlay rail floats over the dock too
        "absolute flex flex-col",
        overlay ? "z-[calc(var(--z-panel)+1)]" : "z-(--z-panel)",
        dragH === null && "transition-[opacity,translate,visibility,height] duration-(--dur-3) ease-enter",
        sheet && "sheet rounded-t-dialog border-b-0",
        !shown && (sheet ? "invisible translate-y-[calc(100%+12px)]" : "pointer-events-none invisible -translate-x-3 opacity-0"),
      )}
      style={style}
    >
      {sheet && (
        <div className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing" {...handlers}>
          <button
            type="button"
            // pointer taps arrive through the strip's pointerup (it captures the pointer); this is Enter / Space
            onClick={(e) => e.detail === 0 && cycle()}
            onKeyDown={onHandleKey}
            aria-expanded={snap !== "peek"}
            aria-controls="opportunities-rail"
            aria-label={snap === "full" ? "Collapse opportunities" : "Expand opportunities"}
            className="grid h-6 w-16 place-items-center rounded-full"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-fg-4" />
          </button>
        </div>
      )}
      <div
        className={clsx(
          "min-h-0 flex-1",
          sheet
            ? "overflow-y-auto overscroll-contain pb-(--safe-b) [&>aside]:min-h-full [&>aside]:border-0 [&>aside]:bg-transparent"
            : "[&>aside]:h-full [&>aside]:overflow-hidden [&>aside]:rounded-panel [&>aside]:border [&>aside]:border-edge",
          !sheet && (overlay ? "[&>aside]:shadow-pop" : "[&>aside]:shadow-float"),
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Evidence inspector: right panel. On phones a sheet that opens at 64dvh (verdict, titles, tiles, question) and drags
 * (or taps) up to 92dvh; dragging it down from 64dvh closes it. It always starts at least 120px below the demo card.
 */
function InspectorSlot({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const open = useAtlas((s) => s.inspectorOpen);
  const selected = useAtlas((s) => s.selectedMatchId);
  const uiHidden = useAtlas((s) => s.uiHidden);
  const phone = layout.tier === "phone";
  const shown = open && !uiHidden;
  // tall sheet for the pair it was raised for; a new pair (or closing) drops back to 64dvh
  const [tallFor, setTallFor] = useState<string | null>(null);
  const tall = phone && open && tallFor !== null && tallFor === selected;
  const grab = useRef<{ id: number; y: number } | null>(null);
  const swiped = useRef(false);

  const style: CSSProperties = phone
    ? {
        left: 0,
        right: 0,
        bottom: 0,
        top: `max(${tall ? "max(8dvh, var(--panel-top))" : `${Math.round((1 - PHONE_SHEET.inspector) * 100)}dvh`}, calc(var(--demo-card-bottom, -120px) + 120px))`,
      }
    : { right: "var(--gutter)", top: "var(--panel-top)", bottom: "var(--gutter)", width: "var(--inspector-w)" };

  const onGrabEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = grab.current;
    grab.current = null;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    if (Math.abs(dy) < 8) return; // a tap: onClick toggles
    swiped.current = true;
    if (dy < 0) setTallFor(selected);
    else if (tall) setTallFor(null);
    else if (dy > 60) useAtlas.getState().select(null);
  };

  return (
    <div
      data-slot="inspector"
      {...(shown ? mapUi(phone ? "bottom" : "right") : {})}
      className={clsx(
        "pointer-events-none absolute z-(--z-panel) [&>*]:pointer-events-auto",
        "[&>aside]:absolute! [&>aside]:inset-0! [&>aside]:h-auto! [&>aside]:w-auto! [&>aside]:border-edge",
        phone
          ? "transition-[top] duration-(--dur-4) ease-enter [&>aside]:rounded-t-dialog! [&>aside]:rounded-b-none! [&>aside]:border-t"
          : "[&>aside]:rounded-panel! [&>aside]:border [&>aside]:shadow-float",
        uiHidden && "invisible",
      )}
      style={style}
    >
      {children}
      {phone && open && (
        <button
          type="button"
          aria-label={tall ? "Shrink evidence inspector" : "Expand evidence inspector"}
          aria-expanded={tall}
          // above the legacy aside's own z-40
          className="absolute top-0 left-1/2 z-50 grid h-5 w-16 -translate-x-1/2 touch-none place-items-center"
          onPointerDown={(e) => {
            swiped.current = false;
            grab.current = { id: e.pointerId, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={onGrabEnd}
          onPointerCancel={() => (grab.current = null)}
          onClick={() => {
            if (swiped.current) return;
            setTallFor(tall ? null : selected);
          }}
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-fg-4" />
        </button>
      )}
    </div>
  );
}

/** Timeline dock: bottom of the focal width (rail right + 12 → inspector left − 12). Not on phones. */
function DockSlot({ children }: { children: ReactNode }) {
  const layout = useLayout();
  if (layout.tier === "phone") return null;
  const shown = layout.dockH > 0;
  return (
    <div
      data-slot="dock"
      data-collapsed={layout.dockCollapsed || undefined}
      {...(shown ? mapUi("bottom") : {})}
      className={clsx(
        "absolute z-(--z-panel) transition-[left,right,height] duration-(--dur-4) ease-enter",
        "[&>section]:block! [&>section]:h-full! [&>section]:overflow-hidden [&>section]:rounded-panel [&>section]:border [&>section]:border-edge [&>section]:shadow-float",
        !shown && "invisible",
      )}
      style={{ left: "var(--focal-l)", right: "var(--focal-r)", bottom: "var(--gutter)", height: "var(--dock-h)" }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────── notices, announcer ────────────────────────────────────────────── */

/** The H key's "Press H to show panels" notice (the only one that times out). */
const HIDDEN_NOTICE_ID = "ui-hidden";

/** Glass pills bottom-centre of the focal area, above the dock. Neither the link notice nor the others hide by themselves. */
function Notices() {
  const notice = useAtlas((s) => s.notice);
  const linkNotice = useAtlas((s) => s.linkNotice);
  const set = useAtlas((s) => s.set);
  const dismissNotice = useAtlas((s) => s.dismissNotice);
  return (
    <div
      className="pointer-events-none absolute z-(--z-toast) flex flex-col items-center justify-end gap-2 px-3 pb-3 transition-[left,right,bottom] duration-(--dur-4) ease-enter [&>*]:pointer-events-auto"
      style={{ left: "var(--focal-l)", right: "var(--focal-r)", bottom: "var(--focal-b)" }}
    >
      {linkNotice && (
        <Notice {...mapUi()} icon={<Link2Off />} onDismiss={() => set({ linkNotice: null })} className="animate-pop-in">
          {linkNotice}
        </Notice>
      )}
      {notice && (
        <Notice
          key={notice.id}
          {...mapUi()}
          icon={<Info />}
          // "Press H to show panels" times out on its own; everything else waits for the reader
          onDismiss={notice.id === HIDDEN_NOTICE_ID ? undefined : () => dismissNotice(notice.id)}
          className="animate-pop-in"
        >
          {notice.text}
        </Notice>
      )}
    </div>
  );
}

function regionName(region: string): string {
  return region === "all" ? "all regions" : (SNAPSHOT.regions.find((r) => r.id === region)?.label ?? region);
}

/** Polite, visually hidden: what a finished comparison or radius change produced for the region on screen. */
function RunAnnouncer() {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  const [seen, setSeen] = useState<{ run: MatchRun | null; text: string }>({ run: null, text: "" });
  if (run !== seen.run) {
    let text = "";
    if (run) {
      const n = regionMatches(run, region).length;
      const results = `${n.toLocaleString("en-US")} ${n === 1 ? "result" : "results"}`;
      text = seen.run && seen.run.thresholdMiles !== run.thresholdMiles ? `Radius ${run.thresholdMiles} mi: ${results}` : `Comparison finished: ${results} in ${regionName(region)}`;
    }
    setSeen({ run, text });
  }
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {seen.text}
    </div>
  );
}

/* ─────────────────────────────────────────────────── keyboard ─────────────────────────────────────────────────── */

function useKeyboard() {
  useEffect(() => {
    let hideTimer = 0;
    const showPanels = () => {
      const st = useAtlas.getState();
      st.set({ uiHidden: false });
      st.dismissNotice(HIDDEN_NOTICE_ID);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const st = useAtlas.getState();
      // Escape always works, even from a text field: brief → drawers → close-up → hidden panels → rail overlay → inspector → demo
      if (e.key === "Escape") {
        if (st.briefOpen) return st.set({ briefOpen: false });
        if (st.sourcesOpen || st.methodOpen) return st.set({ sourcesOpen: false, methodOpen: false });
        if (st.closeupOpen) return st.set({ closeupOpen: false });
        if (st.uiHidden) return showPanels();
        if (st.railOpen) return st.set({ railOpen: false });
        if (st.inspectorOpen) return st.select(null);
        if (st.demoStep !== null) return st.set({ demoStep: null });
        return;
      }
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // shortcuts never act behind a modal or drawer
      if (st.briefOpen || st.sourcesOpen || st.methodOpen || t?.closest("[role=dialog]")) return;

      if (e.key === "c" || e.key === "C") {
        if (e.repeat || st.running) return;
        e.preventDefault();
        void st.compare({ explicit: true });
        return;
      }
      // H: hide / show the floating panels (never the guided-demo card)
      if (e.key === "h" || e.key === "H") {
        if (e.repeat) return;
        e.preventDefault();
        window.clearTimeout(hideTimer);
        if (st.uiHidden) return showPanels();
        st.set({ uiHidden: true, railOpen: false });
        const id = st.showNotice("Press H to show panels", "info", HIDDEN_NOTICE_ID);
        hideTimer = window.setTimeout(() => useAtlas.getState().dismissNotice(id), 2600);
        return;
      }
      const onCard = !t || t === document.body || !!t.closest("[data-match-id]");
      const down = e.key === "j" || (e.key === "ArrowDown" && onCard);
      const up = e.key === "k" || (e.key === "ArrowUp" && onCard);
      if ((down || up) && st.run && st.demoStep === null) {
        const id = st.selectNeighbor(down ? 1 : -1);
        if (!id) return;
        e.preventDefault();
        document.querySelector<HTMLElement>(`[data-match-id="${CSS.escape(id)}"]`)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(hideTimer);
    };
  }, []);
}

/* ─────────────────────────────────────────────────── URL ─────────────────────────────────────────────────── */

/** ?pair=<id>[&r=<mi>] deep links: run the engine quietly at the link's radius, then open that pair. */
function useUrlSync() {
  const selected = useAtlas((s) => s.selectedMatchId);
  const radius = useAtlas((s) => s.run?.thresholdMiles);
  // the link stays in the address bar until its own comparison has resolved
  const linking = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pair = params.get("pair");
    if (!pair) return;
    // the slider's grid: 5–100 mi in 5 mi steps
    const r = Math.round(Number(params.get("r")) / 5) * 5;
    linking.current = true;
    void useAtlas
      .getState()
      .compare({ quiet: true, thresholdMiles: r >= 5 && r <= 100 ? r : undefined })
      .then((run) => {
        linking.current = false;
        const st = useAtlas.getState();
        // engine unavailable (the queue reports it): keep the link, so a reload retries it
        if (!run) return;
        if (run.matches.some((m) => m.id === pair)) return st.select(pair);
        const known = pair.split("__").every((id) => SNAPSHOT.projects.some((p) => p.id === id));
        st.set({ linkNotice: known ? `The linked pair is not flagged at ${run.thresholdMiles} mi` : "The linked pair is not in this snapshot" });
        writeUrl(st.selectedMatchId, st.run?.thresholdMiles);
      });
  }, []);
  useEffect(() => {
    if (!linking.current) writeUrl(selected, radius);
  }, [selected, radius]);
}

function writeUrl(pair: string | null, radius: number | undefined) {
  const url = new URL(window.location.href);
  if (pair) url.searchParams.set("pair", pair);
  else url.searchParams.delete("pair");
  if (pair && radius !== undefined && radius !== 25) url.searchParams.set("r", String(radius));
  else url.searchParams.delete("r");
  window.history.replaceState(null, "", url.toString());
}
