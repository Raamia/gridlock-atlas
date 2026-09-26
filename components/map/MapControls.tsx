"use client";

import clsx from "clsx";
import { Box, CloudOff, Info, Layers, Mountain, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLayout } from "@/lib/layout";
import { useAtlas, type Basemap } from "@/lib/store";
import { Button, IconButton, mapUi, Segmented, type SegmentedItem } from "../ui";
import { TOKEN } from "./style";

/**
 * Map controls (SPEC §3): bottom-right of the focal hole, stacked above the dock and clear of the Mapbox attribution.
 *   [basemap notice]                    only after a basemap failure
 *   [3D close-up]                        with a pair selected (desktop)
 *   [3D · symbolic structures ⓘ]         while 3D is on (opens the Map key)
 *   [◭ 3D | ▢ Flat map]                  group "Map perspective"
 *   [Night | Satellite | Offline]        group "Basemap"
 * Phones: one 44px "Map options" button opening the same groups (hidden while the inspector sheet or the demo owns
 * the screen).
 */

/** Clearance above the Mapbox logo + attribution row at the focal bottom-right. */
const ATTRIBUTION_CLEARANCE = 40;

const NOTICE = "Basemap unavailable — showing bundled Census boundaries. All plan data is local.";

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
      icon: <Square className="size-3" strokeWidth={1.75} />,
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

function ThreeDCaption({ onOpenKey }: { onOpenKey: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenKey}
      className="chrome inline-flex h-7 items-center gap-1.5 rounded-full pr-2 pl-2.5 text-caption text-fg-2 transition-colors duration-(--dur-1) hover:text-fg-1"
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

export function MapControls() {
  const layout = useLayout();
  if (layout.tier === "phone") return <PhoneMapControls />;
  return <DesktopMapControls />;
}

function DesktopMapControls() {
  const persp = usePerspective();
  const base = useBasemap();
  const pairSelected = useAtlas((s) => s.selectedMatchId !== null);
  const openCloseup = useAtlas((s) => s.openCloseup);
  const set = useAtlas((s) => s.set);
  return (
    <div {...mapUi()} data-map-controls className="absolute right-0 flex flex-col items-end gap-2" style={{ bottom: ATTRIBUTION_CLEARANCE }}>
      <BasemapNotice />
      {pairSelected && (
        <Button variant="secondary" size="md" icon={<Box className="size-4" strokeWidth={1.75} />} onClick={openCloseup} className="animate-pop-in">
          3D close-up
        </Button>
      )}
      {/* the caption sits outside the group: the group's buttons stay exactly "3D" and "Flat map" */}
      <div className="flex items-center gap-2">
        {persp.mapMode === "3d" && <ThreeDCaption onOpenKey={() => set({ mapKeyOpen: true })} />}
        <Segmented
          variant="pressed"
          label="Map perspective"
          surface="map"
          look="subtle"
          size="sm"
          items={persp.items}
          value={persp.mapMode}
          onChange={persp.onChange}
        />
      </div>
      <div className="flex flex-col items-end gap-1">
        <Segmented
          variant="pressed"
          label="Basemap"
          surface="map"
          look="subtle"
          size="sm"
          items={[
            {
              ...base.items[0],
              icon: <Layers className="size-3.5" strokeWidth={1.75} />,
            },
            ...base.items.slice(1),
          ]}
          value={base.basemap}
          onChange={base.onChange}
        />
        {base.noToken && <span className="chrome rounded-full px-2.5 py-1 text-caption text-fg-3">No Mapbox token · bundled boundaries</span>}
      </div>
    </div>
  );
}

function PhoneMapControls() {
  const [open, setOpen] = useState(false);
  const persp = usePerspective();
  const base = useBasemap();
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const demo = useAtlas((s) => s.demoStep !== null);
  const set = useAtlas((s) => s.set);
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
    <div ref={ref} {...mapUi()} className="absolute right-0 flex flex-col items-end gap-2" style={{ bottom: ATTRIBUTION_CLEARANCE - 4 }}>
      <BasemapNotice />
      {open && (
        <div id="map-options" className="popover flex animate-pop-in flex-col items-end gap-2.5 rounded-card p-2.5">
          <Segmented variant="pressed" label="Map perspective" look="subtle" items={persp.items} value={persp.mapMode} onChange={persp.onChange} />
          <Segmented variant="pressed" label="Basemap" look="subtle" items={base.items} value={base.basemap} onChange={base.onChange} />
          {persp.mapMode === "3d" && (
            <button type="button" onClick={() => set({ mapKeyOpen: true })} className="inline-flex h-11 items-center gap-1.5 px-1 text-caption text-fg-2">
              3D · symbolic structures <Info aria-hidden className="size-3.5 text-fg-3" strokeWidth={1.75} />
            </button>
          )}
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
