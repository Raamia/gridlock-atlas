"use client";

import clsx from "clsx";
import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IDX } from "@/lib/data";
import { cameraPadding, useLayout, type RectLike } from "@/lib/layout";
import { buildLatticeTower, buildSubstation } from "@/lib/models/structures";
import { useAtlas } from "@/lib/store";
import { HoverTip, LabelLayer, labelSpecs, type HoverInfo, type LabelSpec } from "./closeup/Labels";
import { buildCloseupModel, type CloseupModel, type LegendKey } from "./closeup/model";
import { CloseupCanvas, type Frame } from "./closeup/Scene";
import { Button, IconButton, Tooltip } from "./ui";

/*
 * 3D pair close-up (SPEC §7). Mounted by Atlas (next/dynamic, ssr:false, after a WebGL2 pre-check, inside an error
 * boundary) while `closeupOpen && selectedMatchId`. Esc is handled by Atlas's chain (brief → drawers → close-up → …).
 *
 * A full-bleed opaque layer BEHIND the floating panels: the diorama is framed inside the focal hole, with the honesty
 * caption at its top, "Back to map" beside it and a key of what is drawn at its bottom. Phone: full screen, close
 * button top-right. Preload with `preloadCloseup()` from ./closeup/preload (a light module).
 */

const CAPTION = "Illustrative close-up · centers, terminals and closest points placed to scale from the snapshot · structures are symbolic, not survey geometry";
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
  const autoRotate = !reduced && !automated && !interacted;
  const [post] = useState(() => !reduced);

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
    const base = model ? labelSpecs(model, { compact: phone }) : [];
    return hover ? [...base, { id: "hover", at: hover.pos, anchor: "above", alts: ["below", "right", "left"], priority: 50, always: true, content: <HoverTip info={hover} /> }] : base;
  }, [model, hover, phone]);

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

  if (!model) return null;

  const back = (
    <Tooltip content="Leave the close-up" shortcut="Esc" describe={false}>
      <Button ref={backRef} variant="secondary" icon={<ArrowLeft size={14} strokeWidth={1.75} aria-hidden />} onClick={close} className="pointer-events-auto chrome">
        Back to map
      </Button>
    </Tooltip>
  );
  const caption = <p className="text-caption text-balance text-fg-2 [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">{CAPTION}</p>;

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
      />
      <LabelLayer specs={specs} register={register} />

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
            <Legend model={model} compact />
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
                {back}
                <div className="min-w-0 flex-[1_1_380px] @[560px]:pt-1.5 @[560px]:text-right">{caption}</div>
              </div>
            </div>
          )}
          <div
            ref={bottomRef}
            className="@container pointer-events-none absolute flex flex-col items-center gap-2"
            style={{ left: "calc(var(--focal-l) + 12px)", right: "calc(var(--focal-r) + 12px)", bottom: "calc(var(--focal-b) + 12px)" }}
          >
            {demoOn && (
              <div className="flex w-full items-center gap-4">
                {back}
                <div className="min-w-0 flex-1">{caption}</div>
              </div>
            )}
            <Legend model={model} compact={demoOn} />
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────── key ───────────────────────────────────────────── */

const SW = "h-2.5 w-[18px] shrink-0 overflow-visible";

function Swatch({ k }: { k: LegendKey | "grid" }): ReactNode {
  switch (k) {
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

function Legend({ model, compact }: { model: CloseupModel; compact?: boolean }) {
  const keys = LEGEND_ORDER.filter((k) => model.legend.includes(k));
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
