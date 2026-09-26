"use client";

import clsx from "clsx";
import { ChevronDown, CloudOff, Layers, Mountain, Square } from "lucide-react";
import { useState } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import { FOCAL_UTILITIES } from "@/lib/mapdata";
import { usePreviewPair } from "@/lib/hooks";
import { useAtlas, type Basemap } from "@/lib/store";

export function MapOverlays() {
  return (
    <>
      <div className="stage-vignette absolute inset-0 z-[1]" />
      <FocusChip />
      <MapControls />
      <Legend />
      <BasemapNotice />
    </>
  );
}

function FocusChip() {
  const preview = usePreviewPair();
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const region = useAtlas((s) => s.region);
  const run = useAtlas((s) => s.run);
  const r = SNAPSHOT.regions.find((x) => x.id === region);
  let title = r?.label ?? "All regions";
  let sub = `${SNAPSHOT.projects.filter((p) => region === "all" || p.region === region).length} public plans`;
  if (preview) {
    const counties = [...new Set([...preview.a.counties, ...preview.b.counties].map((c) => `${c.name.replace(/ County$/i, "")}`))];
    const states = [...new Set([...preview.a.states, ...preview.b.states])];
    title = `${preview.a.shortTitle} × ${preview.b.shortTitle}`;
    sub = counties.length ? `${counties.slice(0, 3).join(", ")}${counties.length > 3 ? ` +${counties.length - 3}` : ""} ${counties.length === 1 ? "County" : "counties"} · ${states.join(" / ")}` : states.join(" / ");
  } else if (run) {
    // same region rule as the queue: a pair belongs to a region when either project does
    const n = run.matches.filter((m) => region === "all" || IDX.project(m.projectAId).region === region || IDX.project(m.projectBId).region === region).length;
    sub += ` · ${n} candidate pair${n === 1 ? "" : "s"}`;
  }
  return (
    <div
      data-map-ui
      className={clsx("pointer-events-none absolute left-3 top-3 z-10 max-sm:hidden sm:left-4 sm:top-4", inspectorOpen && "hidden xl:block")}
      style={{ maxWidth: inspectorOpen ? "calc(100% - 424px - 280px)" : "calc(100% - 290px)" }}
    >
      <div className="glass glass-solid rounded-xl px-3.5 py-2.5">
        <div className="eyebrow">{preview ? "Pair in view" : "Overview"}</div>
        <div className="mt-0.5 truncate text-[14px] font-medium tracking-[-0.01em] text-text-0">{title}</div>
        <div className="truncate text-[11.5px] text-text-2">{sub}</div>
      </div>
    </div>
  );
}

function MapControls() {
  const mapMode = useAtlas((s) => s.mapMode);
  const basemap = useAtlas((s) => s.basemap);
  const set = useAtlas((s) => s.set);
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  const opts: { id: Basemap; label: string }[] = [
    { id: "night", label: "Night" },
    { id: "satellite", label: "Satellite" },
    { id: "offline", label: "Offline" },
  ];
  return (
    <div
      data-map-ui
      className={clsx(
        "absolute top-4 z-10 flex flex-col items-end gap-2 transition-[right] duration-500 ease-[var(--ease-out)]",
        inspectorOpen ? "right-3 sm:right-[376px] xl:right-[424px]" : "right-3 sm:right-4",
      )}
    >
      <div className="glass flex items-center gap-0.5 rounded-[10px] p-0.5" role="group" aria-label="Map perspective">
        <button
          onClick={() => set({ mapMode: "3d" })}
          aria-pressed={mapMode === "3d"}
          className={clsx("flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[11.5px]", mapMode === "3d" ? "bg-bg-4 text-text-0" : "text-text-2 hover:text-text-1")}
          title="Tilted terrain view (presentation only)"
        >
          <Mountain size={13} /> 3D
        </button>
        <button
          onClick={() => set({ mapMode: "flat" })}
          aria-pressed={mapMode === "flat"}
          className={clsx("flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[11.5px]", mapMode === "flat" ? "bg-bg-4 text-text-0" : "text-text-2 hover:text-text-1")}
          title="Accurate overhead reading"
        >
          <Square size={12} /> Flat map
        </button>
      </div>
      <div className="glass flex items-center gap-0.5 rounded-[10px] p-0.5" role="group" aria-label="Basemap">
        <Layers size={13} className="mx-1.5 text-text-3" />
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => set({ basemap: o.id, basemapFailed: false })}
            aria-pressed={basemap === o.id}
            className={clsx("h-7 rounded-[8px] px-2.5 text-[11.5px]", basemap === o.id ? "bg-bg-4 text-text-0" : "text-text-2 hover:text-text-1")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const [pref, setOpen] = useState<boolean | null>(null);
  const preview = usePreviewPair();
  const inspectorOpen = useAtlas((s) => s.inspectorOpen);
  // collapse by default while a pair is inspected so the legend never covers its geometry
  const open = pref ?? !inspectorOpen;
  const region = useAtlas((s) => s.region);
  const demo = useAtlas((s) => s.demoStep);
  const focal = FOCAL_UTILITIES[region];
  if (demo !== null) return null;
  return (
    <div data-map-ui className="absolute bottom-4 left-4 z-10 hidden w-[252px] sm:block">
      <div className="glass glass-solid overflow-hidden rounded-xl">
        <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2" aria-expanded={open}>
          <span className="eyebrow">Map truth rules</span>
          <ChevronDown size={13} className={clsx("text-text-3 transition-transform", !open && "-rotate-90")} />
        </button>
        {open && (
          <div className="space-y-1.5 px-3 pb-3 text-[11.5px] text-text-1">
            {!preview && focal && (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#56c7de" }} /> {IDX.utility(focal[0])?.shortName}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#9d8cf0" }} /> {IDX.utility(focal[1])?.shortName}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#8fa2c7" }} /> other
                </span>
              </div>
            )}
            {preview && (
              <div className="mb-2 flex items-center gap-3 border-b border-line pb-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-a" /> A
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-b" /> B
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber" /> Source-supported overlap
                </span>
              </div>
            )}
            <LegendRow swatch={<svg width="28" height="8"><line x1="1" y1="4" x2="27" y2="4" stroke="#9fb3d9" strokeWidth="2.5" strokeLinecap="round" /></svg>} label="Official GIS route" />
            <LegendRow
              swatch={<svg width="28" height="8"><line x1="1" y1="4" x2="27" y2="4" stroke="#9fb3d9" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" /></svg>}
              label="Digitized from official map · schematic"
            />
            <LegendRow
              swatch={<svg width="28" height="14"><circle cx="14" cy="7" r="6" fill="rgba(159,179,217,.12)" stroke="#9fb3d9" strokeDasharray="2 2" /><circle cx="14" cy="7" r="2" fill="#040914" stroke="#9fb3d9" /></svg>}
              label="Locality halo · approximate"
            />
            <LegendRow swatch={<svg width="28" height="10"><circle cx="14" cy="5" r="4" fill="#9fb3d9" /></svg>} label="Named facility" />
            <LegendRow
              swatch={<svg width="28" height="14"><circle cx="14" cy="7" r="5" fill="#fbbf24" /><circle cx="14" cy="7" r="6.5" fill="none" stroke="#fbbf24" strokeOpacity=".4" strokeWidth="2" /></svg>}
              label="Shared site or terminal · callout says stated or implied"
            />
            <LegendRow
              swatch={<svg width="28" height="10"><line x1="3" y1="5" x2="25" y2="5" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="1.5 2.5" strokeLinecap="round" /><circle cx="14" cy="5" r="3" fill="#fbbf24" stroke="#040914" /></svg>}
              label="Flagged pair · center to center, not a route"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex w-7 justify-center">{swatch}</span>
      <span className="leading-tight">{label}</span>
    </div>
  );
}

function BasemapNotice() {
  const failed = useAtlas((s) => s.basemapFailed);
  const basemap = useAtlas((s) => s.basemap);
  if (!failed || basemap !== "offline") return null;
  return (
    <div data-map-ui className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] text-text-1">
        <CloudOff size={13} className="text-conflict" />
        Basemap unavailable — showing bundled Census boundaries. All plan data is local.
      </div>
    </div>
  );
}
