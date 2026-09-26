"use client";

import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import type { CloseupModel, CuPlace, CuProject, V2 } from "./model";

/*
 * Close-up labels: plain DOM in ONE overlay layer (rendered by PairCloseup in the app's React root), each tracking a
 * 3D anchor. The canvas side (Scene.tsx `LabelSync`) projects the anchors every rendered frame and writes each
 * element's transform directly — no React re-render per frame and no extra React roots (drei <Html> mounts one root
 * per label, and unmounting those inside the canvas commit logs "synchronously unmount a root" errors).
 *
 * The two project cards and the shared-site card prefer CALLOUT slots: a band along the top of the frame hole (A/B at
 * its left/right ends, by where their pins are on screen; the site centred), joined to their pin or beacon by a thin
 * leader line, so the diorama itself stays clear. When a slot is taken they fall back to sitting beside the pin.
 */

export type Anchor = "above" | "below" | "center" | "left" | "right" | "above-left" | "above-right" | "callout-left" | "callout-right" | "callout-top";
/**
 * Resolved per frame: "outward" = above-left/right of the pin, away from the other project; "callout" = the top-band
 * slot on this project's side of the screen (the shared site: centred).
 */
export type AnchorSpec = Anchor | "outward" | "callout";

export interface LabelSpec {
  id: string;
  at: [number, number, number];
  anchor: AnchorSpec;
  /** Tried in order when the preferred anchor collides with a label placed before it. */
  alts?: AnchorSpec[];
  /** Placement order (higher first). Ties keep list order. */
  priority: number;
  /** Shown even when every anchor collides (at the least-overlapping one); otherwise a colliding label is hidden. */
  always?: boolean;
  /** Whose label this is ("outward"/"callout" resolve from it). */
  side?: "a" | "b" | "site";
  /** Leader-line colour when the label sits in a callout slot. */
  leader?: string;
  content: ReactNode;
}

/** The callout band: horizontal limits of the frame hole and the band's top edge (px). */
export interface Band {
  minX: number;
  maxX: number;
  top: number;
}

/** Top-left of a label's box for an anchor, given the anchor point (x, y), the label size (w, h) and the callout band. */
export function anchorBox(anchor: Anchor, x: number, y: number, w: number, h: number, band: Band): [number, number] {
  switch (anchor) {
    case "above":
      return [x - w / 2, y - h - 10];
    case "below":
      return [x - w / 2, y + 8];
    case "center":
      return [x - w / 2, y - h / 2];
    case "left":
      return [x - w - 12, y - h / 2];
    case "right":
      return [x + 12, y - h / 2];
    case "above-left":
      return [x - w + 14, y - h - 12];
    case "above-right":
      return [x - 14, y - h - 12];
    case "callout-left":
      return [band.minX + 4, band.top];
    case "callout-right":
      return [band.maxX - w - 4, band.top];
    case "callout-top":
      return [Math.min(Math.max(x - w / 2, band.minX + 4), band.maxX - w - 4), band.top];
  }
}

/** Heights (scene units) shared with the scene: pins, arcs, beacon. */
export const PIN_H = 1.3;
export const BEACON_H = 1.7;
export const arcHeight = (a: V2, b: V2, k = 0.28) => Math.min(2.6, Math.max(0.7, Math.hypot(b.x - a.x, b.z - a.z) * k));

const UTIL = { a: "var(--util-a)", b: "var(--util-b)" } as const;
const SHADOW: CSSProperties = { textShadow: "0 1px 2px rgb(0 0 0 / 0.9), 0 0 12px rgb(5 8 14 / 0.95)" };

export function labelSpecs(model: CloseupModel): LabelSpec[] {
  const { a, b, site, ring } = model;
  const out: LabelSpec[] = [];

  // facility names (structures and approximate places), then unpublished-route notes
  for (const p of [a, b]) {
    for (const pl of p.places.filter((x) => x.labelled)) {
      const disc = pl.treatment === "disc";
      out.push({
        id: `pl-${pl.id}`,
        at: [pl.pos.x, 0.01, pl.pos.z],
        anchor: disc ? "center" : "below",
        alts: disc ? ["above", "below"] : ["above", "right", "left"],
        priority: pl.shared ? 45 : 40,
        content: <FacilityLabel pl={pl} />,
      });
    }
  }
  for (const p of [a, b]) {
    if (!p.chord) continue;
    // a fifth of the way along: the midpoint is the project's own center (its pin, and often the ruler)
    const mid: [number, number, number] = [p.chord[0].x + (p.chord[1].x - p.chord[0].x) * 0.2, 0.01, p.chord[0].z + (p.chord[1].z - p.chord[0].z) * 0.2];
    out.push({
      id: `chord-${p.side}`,
      at: mid,
      anchor: "center",
      alts: ["above", "below", "right", "left"],
      priority: 30,
      content: (
        <span className="block whitespace-nowrap text-label tracking-normal text-fg-3" style={SHADOW}>
          route not published
        </span>
      ),
    });
  }
  if (ring?.labelAt) {
    out.push({
      id: "ring",
      at: [ring.labelAt.x, 0.02, ring.labelAt.z],
      anchor: "center",
      alts: ["below", "above", "right", "left"],
      priority: 60,
      content: (
        <span className="whitespace-nowrap text-caption text-overlap" style={SHADOW}>
          {model.thresholdMiles} mi from {a.title} center
        </span>
      ),
    });
  }
  if (!site && a.center && b.center && model.rulerText) {
    out.push({
      id: "ruler",
      at: [(a.center.x + b.center.x) / 2, 0.01, (a.center.z + b.center.z) / 2],
      anchor: "below",
      alts: ["above", "right", "left"],
      priority: 85,
      always: true,
      content: <RulerChip model={model} />,
    });
  }
  if (site) {
    out.push({
      id: "site",
      at: [site.pos.x, BEACON_H + 0.04, site.pos.z],
      anchor: "callout",
      alts: ["above", "right", "left", "below"],
      priority: 90,
      always: true,
      side: "site",
      leader: "var(--overlap)",
      content: (
        <div className="chrome max-w-[250px] rounded-card px-2.5 py-2">
          <div className="eyebrow text-overlap!">Shared site · {site.basis}</div>
          <div className="mt-1 text-ui font-medium text-fg-1">{site.label}</div>
          {model.rulerText && <div className="num mt-1 text-caption text-fg-3">Centers {model.rulerText}</div>}
        </div>
      ),
    });
  }
  // project cards (placed first: highest priority)
  const both = !!(a.center && b.center);
  for (const p of [a, b]) {
    if (!p.center) continue;
    out.push({
      id: `p-${p.side}`,
      at: [p.center.x, PIN_H, p.center.z],
      anchor: "callout",
      alts: both ? ["outward", "left", "right", "above"] : ["above", "left", "right"],
      priority: 100,
      always: true,
      side: p.side,
      leader: UTIL[p.side],
      content: <ProjectCard p={p} />,
    });
  }
  return out;
}

function FacilityLabel({ pl }: { pl: CuPlace }) {
  return (
    <span className={clsx("whitespace-nowrap text-caption", pl.shared ? "text-fg-1" : "text-fg-2")} style={SHADOW}>
      {pl.label}
      {pl.treatment === "disc" && <span className="text-fg-3"> · approximate</span>}
    </span>
  );
}

function ProjectCard({ p }: { p: CuProject }) {
  const color = UTIL[p.side];
  return (
    <div className="chrome flex max-w-[220px] items-stretch gap-2 rounded-control py-1.5 pl-1.5 pr-2.5">
      <span aria-hidden className="w-0.5 shrink-0 rounded-pill" style={{ background: color }} />
      <div className="min-w-0">
        <div className="eyebrow truncate" style={{ color }}>
          {p.owner} · center
        </div>
        <div className="mt-1 truncate text-ui font-medium text-fg-1">{p.title}</div>
      </div>
    </div>
  );
}

function RulerChip({ model }: { model: CloseupModel }) {
  const [value, of] = (model.rulerText ?? "").split(" of ");
  return (
    <div className="chrome w-[136px] rounded-control px-2.5 pb-2 pt-1.5">
      <div className="num flex items-baseline justify-between gap-1.5 whitespace-nowrap">
        <span className="text-ui font-medium text-fg-1">{value}</span>
        <span className="text-caption text-fg-3">of {of}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-fill-3">
        <div className="h-full rounded-pill bg-overlap" style={{ width: `${Math.max(3, model.rulerFill * 100)}%`, opacity: model.possible ? 0.55 : 1 }} />
      </div>
    </div>
  );
}

export interface HoverInfo {
  text: string;
  sub?: string;
  pos: [number, number, number];
}

export function HoverTip({ info }: { info: HoverInfo }) {
  return (
    <div className="popover max-w-[280px] rounded-control px-2.5 py-1.5 shadow-pop">
      <div className="text-caption font-medium text-fg-1">{info.text}</div>
      {info.sub && <div className="text-caption text-fg-3">{info.sub}</div>}
    </div>
  );
}

/**
 * The DOM layer the canvas positions: leader lines (one SVG) under the label boxes. `register` hands each element to
 * the canvas-side sync (`leader:{id}` for a label's leader line).
 */
export function LabelLayer({ specs, register }: { specs: LabelSpec[]; register: (id: string, el: Element | null) => void }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {specs
          .filter((s) => s.leader)
          .map((s) => (
            <g key={s.id} ref={(el) => register(`leader:${s.id}`, el)} style={{ visibility: "hidden" }}>
              <line stroke={s.leader} strokeOpacity={0.55} strokeWidth={1} />
              <circle r={2.5} fill={s.leader} />
            </g>
          ))}
      </svg>
      {specs.map((s) => (
        <div key={s.id} ref={(el) => register(s.id, el)} className="absolute left-0 top-0 w-max will-change-transform" style={{ visibility: "hidden" }}>
          {s.content}
        </div>
      ))}
    </div>
  );
}
