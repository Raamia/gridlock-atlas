"use client";

import clsx from "clsx";
import { ArrowLeft, Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { IDX } from "@/lib/data";
import { cameraPadding, useLayout, type RectLike } from "@/lib/layout";
import { buildLatticeTower, buildSubstation } from "@/lib/models/structures";
import { useAtlas } from "@/lib/store";
import { HoverTip, LabelLayer, labelSpecs, type HoverInfo, type LabelSpec } from "./closeup/Labels";
import { buildCloseupModel, type CloseupModel, type LegendKey } from "./closeup/model";
import { CloseupCanvas, type Frame } from "./closeup/Scene";
import { buildStory, type Shot } from "./closeup/story";
import { buildTimeModel, type TimeModel } from "./closeup/time";
import { TimeDriver } from "./closeup/TimeLayer";
import { Button, IconButton, Segmented, Tooltip } from "./ui";

/*
 * 3D pair close-up (SPEC §7). Mounted by Atlas (next/dynamic, ssr:false, after a WebGL2 pre-check, inside an error
 * boundary) while `closeupOpen && selectedMatchId`. Esc is handled by Atlas's chain (brief → drawers → close-up → …).
 *
 * A full-bleed opaque layer BEHIND the floating panels: the diorama is framed inside the focal hole, with the honesty
 * caption at its top, "Back to map" beside it and a key of what is drawn at its bottom. Phone: full screen, close
 * button top-right. Preload with `preloadCloseup()` from ./closeup/preload (a light module).
 */

const CAPTION = "Illustrative close-up · centers, terminals and closest points placed to scale from the snapshot · structures are symbolic, not survey geometry";
const TIME_CAPTION = " · height is time, not elevation";
const UNAVAILABLE = "3D close-up unavailable on this device";

/** Called by preloadCloseup() once this chunk is fetched: warms the structure builders (JIT) off the critical path. */
export function warmCloseup(): void {
  try {
    for (const g of [buildSubstation(), buildLatticeTower()]) {
      g.traverse((o) => {
        const mesh = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material?.dispose();
      });
    }
  } catch {
    // warming is best effort
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function PairCloseup() {
  const run = useAtlas((s) => s.run);
  const selectedId = useAtlas((s) => s.selectedMatchId);
  const threshold = useAtlas((s) => s.run?.thresholdMiles ?? s.thresholdMiles);
  const demoOn = useAtlas((s) => s.demoStep !== null);
  const layout = useLayout();
  const phone = layout.tier === "phone";

  const match = useMemo(() => run?.matches.find((m) => m.id === selectedId) ?? null, [run, selectedId]);
  const model = useMemo(() => (match ? buildCloseupModel(match, IDX.project(match.projectAId), IDX.project(match.projectBId), threshold) : null), [match, threshold]);
  const time = useMemo(() => (match && model ? buildTimeModel(match, IDX.project(match.projectAId), IDX.project(match.projectBId), model) : null), [match, model]);
  const story = useMemo(() => (match && model && time ? buildStory(match, model, time) : []), [match, model, time]);

  const close = useCallback(() => useAtlas.getState().set({ closeupOpen: false }), []);
  const fail = useCallback(() => {
    const st = useAtlas.getState();
    if (!st.closeupOpen) return; // already closing (e.g. the context loss R3F triggers on unmount)
    st.set({ closeupOpen: false });
    st.showNotice(UNAVAILABLE, "closeup-unavailable");
  }, []);

  // motion: slow auto-rotate until the first interaction; never with reduced motion or under automation
  const reduced = usePrefersReducedMotion();
  const [interacted, setInteracted] = useState(false);
  const automated = typeof navigator !== "undefined" && navigator.webdriver;
  const [post] = useState(() => !reduced);
  const instant = reduced || !!automated;

  // time: the axis rises out of the plinth on open (a sweep grows each pillar in date order); Ground flattens it
  const [timeOn, setTimeOn] = useState(true);
  const [anim] = useState(() => new TimeDriver(false));
  const [sweepKey, setSweepKey] = useState(() => (instant ? 0 : 1));
  const counterRef = useRef<HTMLDivElement>(null);

  // the story: captioned steps that fly the camera, flatten / raise the axis and replay the sweep
  const [tour, setTour] = useState<number | null>(null);
  const [shot, setShot] = useState<{ key: string; shot: Shot } | null>(null);
  const tourTimer = useRef<number | null>(null);
  const shotSeq = useRef(0);
  const stepRef = useRef<(i: number) => void>(() => {});
  const clearTimer = () => {
    if (tourTimer.current !== null) window.clearTimeout(tourTimer.current);
    tourTimer.current = null;
  };
  const stopTour = useCallback(() => {
    clearTimer();
    setTour(null);
  }, []);
  const goStep = useCallback(
    (i: number) => {
      clearTimer();
      const step = story[i];
      if (!step || !model) {
        setTour(null);
        return;
      }
      setInteracted(true);
      setTour(i);
      setTimeOn(step.time);
      if (step.sweep && !instant) setSweepKey((k) => k + 1);
      setShot({ key: `${model.id}:${i}:${++shotSeq.current}`, shot: step.shot });
      tourTimer.current = window.setTimeout(() => stepRef.current(i + 1), step.ms);
    },
    [story, model, instant],
  );
  useEffect(() => {
    stepRef.current = goStep;
  }, [goStep]);
  useEffect(() => clearTimer, []);
  // another pair (J/K) ends the story (the canvas replays the sweep for the new pair)
  const pairId = model?.id;
  const [storyPair, setStoryPair] = useState(pairId);
  if (storyPair !== pairId) {
    setStoryPair(pairId);
    setTour(null);
  }
  useEffect(() => clearTimer(), [pairId]);
  // Esc stops the story first (capture phase: before Atlas's chain closes the close-up)
  useEffect(() => {
    if (tour === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      stopTour();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tour, stopTour]);
  const setMode = useCallback(
    (v: "ground" | "time") => {
      stopTour();
      setTimeOn(v === "time");
    },
    [stopTour],
  );

  const orbiting = tour !== null && !!story[tour]?.orbit;
  const autoRotate = !reduced && !automated && (tour === null ? !interacted : orbiting);

  // labels: DOM elements in one layer, positioned by the canvas every rendered frame
  const [labelEls] = useState(() => new Map<string, Element>());
  const register = useCallback(
    (id: string, el: Element | null) => {
      if (el) labelEls.set(id, el);
      else labelEls.delete(id);
    },
    [labelEls],
  );
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const onHover = useCallback((h: HoverInfo | null) => setHover((prev) => (prev?.text === h?.text && prev?.pos.join() === h?.pos.join() ? prev : h)), []);
  const specs = useMemo<LabelSpec[]>(() => {
    // phone: narrower project cards so both fit the callout band side by side
    const base = model ? labelSpecs(model, { compact: phone, time }) : [];
    return hover ? [...base, { id: "hover", at: hover.pos, anchor: "above", alts: ["below", "right", "left"], priority: 50, always: true, content: <HoverTip info={hover} /> }] : base;
  }, [model, hover, phone, time]);

  // keyboard: focus lands on "Back to map"; closing returns focus to whatever opened the close-up
  const backRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;
    backRef.current?.focus({ preventScroll: true });
    return () => {
      // only when focus is still in (or fell out with) the layer — Back / Esc. J/K moving to another pair has already
      // focused that pair's card, and that focus must stay.
      const active = document.activeElement;
      const lost = !active || active === document.body || (!!root && root.contains(active));
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // the frame hole = focal hole minus our own chrome (and the demo card while the demo runs)
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState({ top: 0, bottom: 0 });
  const [demoRect, setDemoRect] = useState<RectLike | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const vh = window.innerHeight;
      const t = topRef.current?.getBoundingClientRect();
      const b = bottomRef.current?.getBoundingClientRect();
      const next = { top: t && t.height ? Math.round(t.bottom) : 0, bottom: b && b.height ? Math.round(vh - b.top) : 0 };
      setChrome((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
      const card = demoOn && !phone ? document.querySelector<HTMLElement>('[role="region"][aria-label="Guided demo"]') : null;
      const r = card?.getBoundingClientRect();
      setDemoRect((prev) => {
        if (!r || !r.height) return prev ? null : prev;
        return prev && prev.top === r.top && prev.bottom === r.bottom && prev.left === r.left && prev.right === r.right ? prev : { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    const card = document.querySelector<HTMLElement>('[role="region"][aria-label="Guided demo"]');
    if (card) ro.observe(card);
    window.addEventListener("resize", measure);
    const late = window.setTimeout(measure, 520); // after the focal slot's own transition
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(late);
    };
  }, [phone, demoOn, layout.focal.t, layout.focal.b, layout.focal.l, layout.focal.r, model]);

  const frame = useMemo<Frame>(() => {
    if (phone) return { l: 12, r: 12, t: chrome.top + 12, b: chrome.bottom + 12, compact: true };
    const pad = cameraPadding(layout, demoRect);
    return { l: pad.left, r: pad.right, t: Math.max(pad.top, chrome.top + 20), b: Math.max(pad.bottom, chrome.bottom + 16) };
  }, [phone, layout, demoRect, chrome.top, chrome.bottom]);

  if (!model || !time) return null;

  const playing = tour !== null;
  const controls = (
    <div className="pointer-events-auto flex items-center gap-2">
      <Segmented
        label="Close-up view"
        size="sm"
        surface="map"
        value={timeOn ? "time" : "ground"}
        onChange={setMode}
        items={[
          { value: "ground", label: "Ground", tooltip: "Flat: the to-scale map only" },
          { value: "time", label: "Time", tooltip: "Height is time: each project rises to its in-service date" },
        ]}
      />
      <Button
        variant="secondary"
        className="chrome w-[9.5rem] justify-center"
        icon={playing ? <Square size={12} strokeWidth={2} aria-hidden /> : <Play size={13} strokeWidth={2} aria-hidden />}
        aria-pressed={playing}
        onClick={() => (playing ? stopTour() : goStep(0))}
      >
        {playing ? "Stop simulation" : "Run simulation"}
      </Button>
    </div>
  );

  const back = (
    <Tooltip content="Leave the close-up" shortcut="Esc" describe={false}>
      <Button ref={backRef} variant="secondary" icon={<ArrowLeft size={14} strokeWidth={1.75} aria-hidden />} onClick={close} className="pointer-events-auto chrome">
        Back to map
      </Button>
    </Tooltip>
  );
  const caption = (
    <p className="text-caption text-balance text-fg-2 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
      {CAPTION}
      {timeOn && TIME_CAPTION}
    </p>
  );

  return (
    <div ref={rootRef} data-closeup role="region" aria-label="3D close-up" className={clsx("fixed inset-0 overflow-hidden bg-canvas", phone ? "z-(--z-scrim)" : "z-(--z-marker)")}>
      <p className="sr-only">{model.summary}</p>
      <CloseupCanvas
        model={model}
        frame={frame}
        post={post}
        autoRotate={autoRotate}
        reducedMotion={reduced}
        labels={specs}
        labelEls={labelEls}
        onInteract={() => setInteracted(true)}
        onHover={onHover}
        onFail={fail}
        time={time}
        timeOn={timeOn}
        anim={anim}
        sweepKey={sweepKey}
        counter={counterRef}
        instant={instant}
        shot={shot}
      />
      <LabelLayer specs={specs} register={register} />
      <SweepCounter ref={counterRef} phone={phone} />
      {playing && story[tour] && (
        <StoryCaption
          step={tour}
          steps={story.length}
          kicker={story[tour].kicker}
          text={story[tour].text}
          names={story[tour].names}
          onJump={goStep}
          bottom={chrome.bottom + (phone ? 10 : 14)}
          phone={phone}
        />
      )}

      {phone ? (
        <>
          <div
            ref={topRef}
            className="pointer-events-none absolute inset-x-3 flex items-center justify-between gap-3"
            style={{ top: "max(calc(12px + var(--safe-t, 0px)), calc(var(--demo-card-bottom, 0px) + 8px))" }}
          >
            <span className="chrome eyebrow inline-flex h-8 items-center rounded-pill px-3 text-fg-2!">3D close-up</span>
            <IconButton ref={backRef} label="Back to map" size="xl" variant="chrome" onClick={close} className="pointer-events-auto" tooltip={false}>
              <X size={18} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </div>
          <div ref={bottomRef} className="pointer-events-none absolute inset-x-3 flex flex-col items-center gap-2 text-center" style={{ bottom: "calc(12px + var(--safe-b, 0px))" }}>
            {controls}
            <Legend model={model} time={timeOn ? time : null} compact />
            {caption}
          </div>
        </>
      ) : (
        <>
          {/* top of the focal hole: "Back to map" + the honesty caption (right-aligned beside it when there is room,
              wrapped under it otherwise). While the guided demo's card holds the top, both move to the bottom. */}
          {!demoOn && (
            <div
              ref={topRef}
              className="@container pointer-events-none absolute"
              style={{ left: "calc(var(--focal-l) + 12px)", right: "calc(var(--focal-r) + 12px)", top: "calc(var(--focal-t) + 12px)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {back}
                  {controls}
                </div>
                <div className="min-w-0 flex-[1_1_320px] @[560px]:pt-1.5 @[560px]:text-right">{caption}</div>
              </div>
            </div>
          )}
          <div
            ref={bottomRef}
            className="@container pointer-events-none absolute flex flex-col items-center gap-2"
            style={{ left: "calc(var(--focal-l) + 12px)", right: "calc(var(--focal-r) + 12px)", bottom: "calc(var(--focal-b) + 12px)" }}
          >
            {demoOn && (
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
                {back}
                {controls}
                <div className="min-w-0 flex-1">{caption}</div>
              </div>
            )}
            <Legend model={model} time={timeOn ? time : null} compact={demoOn} />
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────── key ───────────────────────────────────────────── */

const SW = "h-2.5 w-[18px] shrink-0 overflow-visible";

type TimeKey = "t-axis" | "t-isd" | "t-bar" | "t-overlap" | "t-sheet";

function Swatch({ k }: { k: LegendKey | TimeKey | "grid" }): ReactNode {
  switch (k) {
    case "t-axis":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M9 10 V0 M9 1 H12 M9 5 H11 M9 9 H12" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.1" />
        </svg>
      );
    case "t-isd":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M5 10 V3" stroke="var(--util-a)" strokeWidth="1" />
          <circle cx="5" cy="3" r="2.2" fill="var(--util-a)" />
          <path d="M13 10 V1" stroke="var(--util-b)" strokeWidth="1" />
          <rect x="11.6" y="1" width="2.8" height="5" rx="1.4" fill="var(--util-b)" />
        </svg>
      );
    case "t-bar":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <rect x="6.5" y="0.5" width="5" height="9" rx="2.5" fill="currentColor" fillOpacity="0.28" />
          <path d="M9 0.5 V9.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" />
        </svg>
      );
    case "t-overlap":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <rect x="2" y="2" width="14" height="6" fill="var(--overlap)" fillOpacity="0.3" />
          <path d="M2 2 H16 M2 8 H16" stroke="var(--overlap)" strokeWidth="1" />
        </svg>
      );
    case "t-sheet":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <ellipse cx="9" cy="5" rx="8" ry="3" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.9" />
        </svg>
      );
    case "substation":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <rect x="4.5" y="1" width="9" height="8" rx="1.5" fill="currentColor" opacity="0.6" />
        </svg>
      );
    case "pylon":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <rect x="7.5" y="0" width="3" height="10" rx="1" fill="currentColor" opacity="0.6" />
        </svg>
      );
    case "marker":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <circle cx="9" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "disc":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <circle cx="9" cy="5" r="4.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.6" />
        </svg>
      );
    case "gis-route":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M1 8 L17 8" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 8 V2 M9 8 V2 M14 8 V2 M2.5 3 H5.5 M7.5 3 H10.5 M12.5 3 H15.5" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
    case "schematic":
    case "chord":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M1 5 L17 5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2.2" />
        </svg>
      );
    case "closest-link":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M1.5 9 Q9 -2.5 16.5 9" fill="none" stroke="var(--overlap)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "site-link":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M1.5 9 Q6 1 9 3.2" fill="none" stroke="var(--overlap)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12.5" cy="4.5" r="2.4" fill="var(--overlap)" />
        </svg>
      );
    case "touch-link":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M1.5 9 Q6 1 9 3.2" fill="none" stroke="var(--overlap)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12.5" cy="4.5" r="2.2" fill="none" stroke="var(--overlap)" strokeWidth="1.3" />
        </svg>
      );
    case "ring":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M1 9.5 A11 11 0 0 1 17 9.5" fill="none" stroke="var(--overlap)" strokeOpacity="0.7" strokeWidth="1.3" />
        </svg>
      );
    case "grid":
      return (
        <svg viewBox="0 0 18 10" className={SW} aria-hidden>
          <path d="M5 0 V10 M13 0 V10 M1 5 H17" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1" />
        </svg>
      );
  }
}

const LEGEND_ORDER: LegendKey[] = ["closest-link", "site-link", "touch-link", "ring", "substation", "pylon", "gis-route", "schematic", "chord", "disc", "marker"];

function legendText(k: LegendKey, m: CloseupModel): string {
  switch (k) {
    case "substation":
      return "Substation · symbolic";
    case "pylon":
      return "Structure · kV not published";
    case "marker":
      return "Other mapped point";
    case "disc":
      return "Approximate location";
    case "gis-route":
      return "Official GIS route";
    case "schematic":
      return "Digitized route · schematic";
    case "chord":
      return "Route not published · drawn terminal to terminal";
    case "closest-link":
      return `Closest approach${m.estimated ? " (estimated)" : ""} · not a route`;
    case "site-link":
      return "Shared site";
    case "touch-link":
      return "Where the projects touch · not a route";
    case "ring":
      return `${m.thresholdMiles} mi from ${m.a.owner}'s closest point`;
  }
}

function timeKeys(tm: TimeModel): { k: TimeKey; text: string }[] {
  const out: { k: TimeKey; text: string }[] = [{ k: "t-axis", text: `Height = time · ${tm.epoch}–${tm.epoch + tm.years}` }];
  if (tm.pillars.some((p) => p.isd)) out.push({ k: "t-isd", text: "In service · dot = a day, bar = a period" });
  if (tm.pillars.some((p) => p.bar)) out.push({ k: "t-bar", text: tm.pillars.every((p) => !p.bar || p.bar.tone === "schedule") ? "Published schedule" : "Published work window" });
  if (tm.overlap) out.push({ k: "t-overlap", text: tm.overlap.confirmed ? "Overlap in time" : "Possible overlap in time" });
  out.push({ k: "t-sheet", text: "Snapshot date" });
  return out;
}

function Legend({ model, time, compact }: { model: CloseupModel; time?: TimeModel | null; compact?: boolean }) {
  const keys = LEGEND_ORDER.filter((k) => model.legend.includes(k));
  const tkeys = time ? timeKeys(time) : [];
  const county = [model.a, model.b].filter((p) => p.countyOnly);
  return (
    <div
      className={clsx(
        "chrome flex max-w-full items-center gap-x-3.5 gap-y-1.5 rounded-control px-3 text-caption text-fg-2",
        // phone: one line that scrolls sideways instead of four wrapped rows
        compact ? "pointer-events-auto scroll-thin h-9 flex-nowrap justify-start overflow-x-auto" : "flex-wrap justify-center py-2",
      )}
    >
      {keys.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Swatch k={k} />
          {legendText(k, model)}
        </span>
      ))}
      <span className="num inline-flex items-center gap-1.5 whitespace-nowrap text-fg-3">
        <Swatch k="grid" />
        Grid {model.gridMiles} mi
      </span>
      {tkeys.map(({ k, text }) => (
        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Swatch k={k} />
          {text}
        </span>
      ))}
      {model.beyondRadius && model.site && (
        <span className="whitespace-nowrap font-medium text-fg-1">
          Beyond {model.thresholdMiles} mi · shared site
        </span>
      )}
      {county.map((p) => (
        <span key={p.side} className="whitespace-nowrap text-fg-3">
          {p.owner} project: county-level only · not drawn
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────── story + sweep ─────────────────────────────────────────── */

/**
 * The sweep's running year (written every frame by the canvas: TimeLayer's TimeAnim) — shown while the axis grows, in
 * date order, out of the plinth. Left edge of the frame hole, clear of the callout band at the top.
 */
function SweepCounter({ ref, phone }: { ref: Ref<HTMLDivElement>; phone: boolean }) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-on="0"
      className="pointer-events-none absolute opacity-0 transition-opacity duration-500 data-[on=1]:opacity-100 [text-shadow:0_2px_12px_rgb(0_0_0/0.85)]"
      style={phone ? { left: 16, top: "38%" } : { left: "calc(var(--focal-l) + 24px)", top: "calc(var(--focal-t) + (100% - var(--focal-t) - var(--focal-b)) * 0.52)" }}
    >
      <div data-year className={clsx("num font-display leading-none text-fg-1", phone ? "text-[40px]" : "text-[64px]")} />
      <div
        data-event
        className="mt-2 max-w-[240px] text-caption text-fg-2 data-[side=a]:text-util-a data-[side=b]:text-util-b data-[side=both]:text-overlap"
      />
    </div>
  );
}

function StoryCaption({
  step,
  steps,
  kicker,
  text,
  names,
  onJump,
  bottom,
  phone,
}: {
  step: number;
  steps: number;
  kicker: string;
  text: string;
  names?: string;
  onJump: (i: number) => void;
  bottom: number;
  phone: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx("chrome pointer-events-auto absolute rounded-card px-4 pb-3 pt-3", phone ? "inset-x-3" : "-translate-x-1/2")}
      style={
        phone
          ? { bottom }
          : {
              bottom,
              // centred in the focal hole, never wider than it
              left: "calc(var(--focal-l) + (100% - var(--focal-l) - var(--focal-r)) / 2)",
              width: "min(560px, calc(100% - var(--focal-l) - var(--focal-r) - 48px))",
            }
      }
    >
      <p key={`k${step}`} className="eyebrow num animate-[fade-in_300ms_ease-out] text-overlap!">
        {String(step + 1).padStart(2, "0")} / {String(steps).padStart(2, "0")} · {kicker}
      </p>
      <p key={`t${step}`} className="mt-1.5 animate-[fade-in_400ms_ease-out] text-body text-balance text-fg-1">
        {text}
      </p>
      {names && <p className="mt-1 truncate text-caption text-fg-3">{names}</p>}
      <div className="mt-2.5 flex items-center gap-1.5">
        {Array.from({ length: steps }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Simulation step ${i + 1} of ${steps}`}
            aria-current={i === step ? "step" : undefined}
            onClick={() => onJump(i)}
            className={clsx(
              "h-1 flex-1 rounded-pill transition-colors duration-300",
              i < step ? "bg-fg-2" : i === step ? "bg-overlap" : "bg-fill-3 hover:bg-fill-2",
            )}
          />
        ))}
      </div>
    </div>
  );
}
