"use client";

import clsx from "clsx";
import { Box, CloudOff, Info, Layers, Map as MapIcon, Moon, Mountain, Satellite } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLayout } from "@/lib/layout";
import { useAtlas, type Basemap } from "@/lib/store";
import { demoCardOffersCloseup } from "../GuidedDemo";
import { Button, IconButton, mapUi, Segmented, type SegmentedItem } from "../ui";
import { DEMO_CARD, demoCardRect } from "./camera";
import { TOKEN } from "./style";

/**
 * Map controls (SPEC §3): bottom-right of the focal hole, above the dock. At most two quiet clusters:
 *   [basemap notice]                                 only after a basemap failure
 *   [3D close-up] ┌ [◭ 3D | ▦ Flat map] │ [☾ ◎ ⊘] ┐   one glass bar: group "Map perspective" + group "Basemap"
 *                 └ 3D · symbolic structures ⓘ     ┘   its caption line while 3D is on (opens the Map key)
 * "3D close-up" (a pair selected) sits beside the bar, so the block is one row high; in a very narrow hole it stacks
 * above. When the usable focal hole is short (the demo card + an open dock on a laptop) or narrow, the basemap folds
 * into one menu button. The Mapbox logo and its (i) sit together at the focal bottom-left, so the bottom-right corner
 * belongs to these controls alone. MapStage's camera pads every frame by this block's measured rect.
 * Phones: one 44px "Map options" button opening the same groups (hidden while the inspector sheet or the demo owns
 * the screen).
 */

const NOTICE = "Basemap unavailable — showing bundled Census boundaries. All plan data is local.";
/** Below this usable focal height (px) or width, "3D close-up" sits beside the bar instead of above it. */
const COMPACT_H = 440;
const COMPACT_W = 560;

function usePerspective() {
  const mapMode = useAtlas((s) => s.mapMode);
  const set = useAtlas((s) => s.set);
  const items: SegmentedItem<"3d" | "flat">[] = [
    {
      value: "3d",
      label: "3D",
      icon: <Mountain className="size-3.5" strokeWidth={1.75} />,
      tooltip: "Tilted 3D view (presentation only)",
    },
    {
      value: "flat",
      label: "Flat map",
      icon: <MapIcon className="size-3.5" strokeWidth={1.75} />,
      tooltip: "Accurate overhead reading",
    },
  ];
  return {
    mapMode,
    items,
    onChange: (v: "3d" | "flat") => set({ mapMode: v }),
  };
}

function useBasemap() {
  const basemap = useAtlas((s) => s.basemap);
  const set = useAtlas((s) => s.set);
  const noToken = !TOKEN;
  const items: SegmentedItem<Basemap>[] = [
    { value: "night", label: "Night", disabled: noToken },
    { value: "satellite", label: "Satellite", disabled: noToken },
    {
      value: "offline",
      label: "Offline",
      tooltip: "Bundled Census boundaries · works without a network",
    },
  ];
  return {
    basemap,
    items,
    noToken,
    onChange: (v: Basemap) => set({ basemap: v, basemapFailed: false }),
  };
}

const BASEMAP_ICON: Record<Basemap, typeof Moon> = { night: Moon, satellite: Satellite, offline: CloudOff };
const BASEMAP_TIP: Record<Basemap, string> = {
  night: "Night basemap",
  satellite: "Satellite imagery",
  offline: "Offline · bundled Census boundaries, works without a network",
};

/** The persistent 3D caption (SPEC §1): a quiet line that opens the Map key. */
function ThreeDCaption({ className }: { className?: string }) {
  const set = useAtlas((s) => s.set);
  const keyOpen = useAtlas((s) => s.mapKeyOpen);
  return (
    <button
      type="button"
      onClick={() => set({ mapKeyOpen: !keyOpen })}
      aria-label="3D · symbolic structures — open map key"
      aria-haspopup="dialog"
      aria-expanded={keyOpen}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full text-caption text-fg-2 transition-colors duration-(--dur-1) hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-1",
        className,
      )}
    >
      3D · symbolic structures
      <Info aria-hidden className="size-3.5 text-fg-3" strokeWidth={1.75} />
    </button>
  );
}

function BasemapNotice({ className }: { className?: string }) {
  const failed = useAtlas((s) => s.basemapFailed);
  const basemap = useAtlas((s) => s.basemap);
  if (!failed || basemap !== "offline") return null;
  return (
    <div role="status" className={clsx("chrome flex max-w-[288px] items-start gap-2 rounded-card px-3 py-2 text-caption text-fg-1 animate-pop-in", className)}>
      <CloudOff aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" strokeWidth={1.75} />
      <span>{NOTICE}</span>
    </div>
  );
}

/** The guided-demo card's bottom edge (0 when it does not float over the map), re-read when the card resizes. */
function useDemoCardBottom(): number {
  const demoStep = useAtlas((s) => s.demoStep);
  const briefOpen = useAtlas((s) => s.briefOpen);
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = demoCardRect();
        setBottom(r ? Math.round(r.bottom) : 0);
      });
    };
    read();
    if (demoStep === null || briefOpen) return () => cancelAnimationFrame(raf);
    const ro = new ResizeObserver(read);
    const card = document.querySelector<HTMLElement>(DEMO_CARD);
    if (card) ro.observe(card);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [demoStep, briefOpen]);
  return bottom;
}

export function MapControls() {
  const layout = useLayout();
  if (layout.tier === "phone") return <PhoneMapControls />;
  return <DesktopMapControls />;
}

function DesktopMapControls() {
  const layout = useLayout();
  const persp = usePerspective();
  const base = useBasemap();
  const pairSelected = useAtlas((s) => s.selectedMatchId !== null);
  const openCloseup = useAtlas((s) => s.openCloseup);
  const demo = useAtlas((s) => s.demoStep !== null);
  const keyOpen = useAtlas((s) => s.mapKeyOpen);
  const failed = useAtlas((s) => s.basemapFailed);
  const set = useAtlas((s) => s.set);
  const cardBottom = useDemoCardBottom();
  const top = Math.max(layout.focal.t, cardBottom ? cardBottom + 12 : 0);
  const usableH = layout.vh - layout.focal.b - top;
  // compact: the basemap folds into one menu button; the block stays one row high beside "3D close-up" whenever that
  // row still leaves the Mapbox logo its corner, and stacks only in a very narrow hole
  const compact = usableH < COMPACT_H || layout.focalW < COMPACT_W;
  const stacked = layout.focalW < (compact ? 470 : 560);
  const threeD = persp.mapMode === "3d";

  // the demo step whose card carries "3D close-up" (step 3) owns the action: the map's pill would be a second copy
  const cardHasCloseup = useAtlas((s) => demoCardOffersCloseup(s.demoStep));
  const closeup = pairSelected && !cardHasCloseup && (
    <Button variant="secondary" size="md" icon={<Box className="size-4" strokeWidth={1.75} />} onClick={openCloseup} className="animate-pop-in">
      3D close-up
    </Button>
  );

  const bar = (
    <div className="chrome flex flex-col items-stretch rounded-card p-[3px]">
      <div className="flex items-center gap-[3px]">
        <Segmented
          variant="pressed"
          label="Map perspective"
          look="subtle"
          size="sm"
          className="bg-transparent! p-0!"
          items={persp.items}
          value={persp.mapMode}
          onChange={persp.onChange}
        />
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-edge" />
        {compact ? (
          <BasemapMenu />
        ) : (
          <Segmented
            variant="pressed"
            label="Basemap"
            look="subtle"
            size="sm"
            className="bg-transparent! p-0!"
            items={base.items.map((it) => {
              const Icon = BASEMAP_ICON[it.value];
              return {
                ...it,
                // icon-only: the accessible name stays exactly "Night" / "Satellite" / "Offline"
                label: null,
                ariaLabel: String(it.label),
                tooltip: BASEMAP_TIP[it.value],
                icon: <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />,
                // 36px wide on touch (tap-44 already makes every segment 44px tall there)
                className: "w-8 px-0! coarse:w-9",
              };
            })}
            value={base.basemap}
            onChange={base.onChange}
          />
        )}
        {/* while the demo card holds the top of the hole, the collapsed Map key lives here (in 3D the caption opens it) */}
        {demo && !threeD && (
          <IconButton label="Map key" size="sm" aria-expanded={keyOpen} aria-haspopup="dialog" onClick={() => set({ mapKeyOpen: !keyOpen })}>
            <Info className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      {/* Offline chosen by hand (a failure has its own notice above): say what the plain map is */}
      {base.basemap === "offline" && !failed && !base.noToken && <span className="self-end px-2 pt-0.5 text-caption text-fg-3">Offline · bundled Census boundaries</span>}
      {threeD && <ThreeDCaption className="self-end px-2 pt-0.5 pb-1" />}
    </div>
  );

  return (
    <div {...mapUi()} data-map-controls={compact ? "compact" : "full"} className="absolute right-0 bottom-0 flex flex-col items-end gap-2">
      <BasemapNotice />
      {stacked ? (
        <>
          {closeup}
          {bar}
        </>
      ) : (
        <div className="flex items-end gap-2">
          {closeup}
          {bar}
        </div>
      )}
      {base.noToken && <span className="chrome rounded-full px-2.5 py-1 text-caption text-fg-3">No Mapbox token · bundled boundaries</span>}
    </div>
  );
}

/**
 * The compact bar's basemap: one icon button (the current basemap's icon) opening the "Basemap" group above the bar,
 * so the whole control block fits beside the Mapbox logo in a short laptop hole.
 */
function BasemapMenu() {
  const base = useBasemap();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      ref.current?.querySelector<HTMLElement>("button[aria-controls]")?.focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  const Current = BASEMAP_ICON[base.basemap];
  return (
    <div ref={ref} className="relative">
      <IconButton
        label="Basemap options"
        tooltip={`Basemap: ${base.items.find((it) => it.value === base.basemap)?.label ?? ""}`}
        size="sm"
        aria-expanded={open}
        aria-controls="basemap-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Current className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      {open && (
        <div id="basemap-menu" className="popover absolute right-0 bottom-full mb-2 animate-pop-in rounded-card p-1.5">
          <Segmented
            variant="pressed"
            label="Basemap"
            look="subtle"
            size="sm"
            items={base.items.map((it) => {
              const Icon = BASEMAP_ICON[it.value];
              return { ...it, tooltip: BASEMAP_TIP[it.value], icon: <Icon aria-hidden className="size-3.5" strokeWidth={1.75} /> };
            })}
            value={base.basemap}
            onChange={(v) => {
              base.onChange(v);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function PhoneMapControls() {
  const [open, setOpen] = useState(false);
  const persp = usePerspective();
  const base = useBasemap();
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const demo = useAtlas((s) => s.demoStep !== null);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = inspectorOpen || demo;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (hidden) return <BasemapNotice className="absolute right-0 bottom-2 max-w-full" />;

  return (
    <div ref={ref} {...mapUi()} data-map-controls="phone" className="absolute right-0 bottom-1 flex flex-col items-end gap-2">
      <BasemapNotice />
      {open && (
        <div id="map-options" className="popover flex animate-pop-in flex-col items-end gap-2.5 rounded-card p-2.5">
          <Segmented
            variant="pressed"
            label="Map perspective"
            look="subtle"
            items={persp.items.map((it) => ({ ...it, className: "h-10! px-4!" }))}
            value={persp.mapMode}
            onChange={persp.onChange}
          />
          <Segmented
            variant="pressed"
            label="Basemap"
            look="subtle"
            items={base.items.map((it) => {
              const Icon = BASEMAP_ICON[it.value];
              return { ...it, icon: <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />, className: "h-10! px-3.5!" };
            })}
            value={base.basemap}
            onChange={base.onChange}
          />
          {persp.mapMode === "3d" && <ThreeDCaption className="h-11 px-1" />}
        </div>
      )}
      <div className="flex items-center gap-2">
        {!open && persp.mapMode === "3d" && <span className="chrome rounded-full px-2.5 py-1 text-caption text-fg-2">3D · symbolic</span>}
        <IconButton
          label="Map options"
          variant="chrome"
          size="xl"
          aria-expanded={open}
          aria-controls="map-options"
          onClick={() => setOpen((v) => !v)}
          tooltip={false}
        >
          <Layers className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
