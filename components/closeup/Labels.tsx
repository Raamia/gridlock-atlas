"use client";

import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { alongPolyline, PLINTH_R, polyLength, type CloseupModel, type CuPlace, type CuProject, type V2 } from "./model";
import { GAP_OFFSET, type TimeModel, type TimePillar } from "./time";

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

export type Anchor = "above" | "below" | "center" | "left" | "right" | "above-left" | "above-right" | "callout-left" | "callout-right" | "callout-top" | "callout-mid";
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
  /**
   * A label that rides a ring on the plinth (the review radius): each frame the layer picks the clearest point of the
   * ring (starting at `prefer`, radians in the x–z plane) and sets the label just OUTSIDE the ring there, clear of the
   * ring stroke, of every `avoid` point (structures, pins, beacon) and of labels placed before it. `at`/`anchor` are
   * unused for placement.
   */
  ring?: { center: V2; r: number; y: number; prefer: number; avoid: [number, number, number][] };
  /**
   * The anchor's height once the time axis is fully raised: the label rides from `at[1]` up to it as the axis rises
   * (a project card follows its pillar's top).
   */
  lift?: number;
  /** "only": shown only while the time axis stands (years, snapshot, gap); "ground": only while it is flat. */
  time?: "only" | "ground";
  /** Hidden until the time sweep has reached this axis height (the label appears with the thing it names). */
  reveal?: number;
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
    case "callout-mid":
      // the band's second row, for the shared-site card when the project cards hold the first
      return [Math.min(Math.max(x - w / 2, band.minX + 4), band.maxX - w - 4), band.top + 52];
  }
}

/** Heights (scene units) shared with the scene: pins, arcs, beacon. */
export const PIN_H = 1.3;
export const BEACON_H = 1.7;
export const arcHeight = (a: V2, b: V2, k = 0.28) => Math.min(2.6, Math.max(0.7, Math.hypot(b.x - a.x, b.z - a.z) * k));

const UTIL = { a: "var(--util-a)", b: "var(--util-b)" } as const;
const SHADOW: CSSProperties = { textShadow: "0 1px 2px rgb(0 0 0 / 0.9), 0 0 12px rgb(34 40 49 / 0.95)" };

export function labelSpecs(model: CloseupModel, opts: { compact?: boolean; time?: TimeModel | null } = {}): LabelSpec[] {
  const { a, b, site, ring } = model;
  const out: LabelSpec[] = [];
  const tm = opts.time ?? null;
  if (tm) out.push(...timeLabels(tm, opts.compact));

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
    // a fifth of the way along: the midpoint is the project's own center (its pin)
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
  if (ring?.onPlinth && ring.labelAngle != null) {
    const at = ring.labelAt ?? { x: ring.center.x + Math.cos(ring.labelAngle) * ring.r, z: ring.center.z + Math.sin(ring.labelAngle) * ring.r };
    out.push({
      id: "ring",
      at: [at.x, 0.02, at.z],
      anchor: "center",
      ring: { center: ring.center, r: ring.r, y: 0.02, prefer: ring.labelAngle, avoid: sceneObstacles(model) },
      priority: 60,
      content: (
        <span className="whitespace-nowrap text-caption text-overlap" style={SHADOW}>
          {model.thresholdMiles} mi from {a.title}&apos;s closest point
        </span>
      ),
    });
  }
  const c = model.closest;
  if (!site && c && model.rulerText) {
    out.push({
      id: "ruler",
      at: [(c.a.x + c.b.x) / 2, 0.01, (c.a.z + c.b.z) / 2],
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
      alts: ["callout-mid", "above", "right", "left", "below"],
      priority: 90,
      always: true,
      side: "site",
      leader: "var(--overlap)",
      content: (
        <div className="chrome max-w-[260px] rounded-card px-2.5 py-2">
          <div className="eyebrow text-overlap!">Shared site</div>
          <div className="mt-1 text-ui font-medium text-fg-1">{site.label}</div>
          <div className="mt-0.5 text-caption text-fg-3">
            {site.basis.charAt(0).toUpperCase() + site.basis.slice(1)}
            {model.touching && <span className="whitespace-nowrap"> · touching</span>}
          </div>
        </div>
      ),
    });
  }
  // project cards (placed first: highest priority)
  const both = !!(a.center && b.center);
  for (const p of [a, b]) {
    if (!p.center) continue;
    const pillar = tm?.pillars.find((x) => x.side === p.side);
    out.push({
      id: `p-${p.side}`,
      at: [p.center.x, PIN_H, p.center.z],
      // with the time axis: the card's leader runs to the top of the project's pillar
      lift: pillar ? pillar.top + 0.08 : undefined,
      anchor: "callout",
      alts: both ? ["outward", "left", "right", "above"] : ["above", "left", "right"],
      priority: 100,
      always: true,
      side: p.side,
      leader: UTIL[p.side],
      content: <ProjectCard p={p} compact={opts.compact} pillar={pillar} />,
    });
  }
  return out;
}

const MONO_SHADOW: CSSProperties = { textShadow: "0 1px 2px rgb(0 0 0 / 0.95), 0 0 10px rgb(20 24 30 / 0.95)" };

/** The time axis's labels: the year ruler, the snapshot sheet, the overlap span and the in-service gap. */
function timeLabels(tm: TimeModel, compact?: boolean): LabelSpec[] {
  const out: LabelSpec[] = [];
  const { x, z } = tm.axis.at;
  for (const tk of tm.axis.ticks) {
    if (!tk.label) continue;
    out.push({
      id: `yr-${tk.year}`,
      at: [x, 0, z],
      lift: tk.y,
      // one side only: a year that cannot sit right of the ruler is skipped, never flipped to the other side
      anchor: "right",
      priority: 22,
      time: "only",
      content: (
        <span className="num block whitespace-nowrap text-label text-fg-3" style={MONO_SHADOW}>
          {tk.year}
        </span>
      ),
    });
  }
  out.push({
    id: "snapshot",
    at: [x, 0, z],
    lift: tm.snapshot.y,
    anchor: "left",
    alts: ["above", "below"],
    priority: 58,
    time: "only",
    reveal: tm.snapshot.y,
    content: (
      <span className="block whitespace-nowrap rounded-pill border border-white/15 bg-black/35 px-2 py-0.5 text-label text-fg-1" style={MONO_SHADOW}>
        {compact ? "Snapshot" : tm.snapshot.text}
      </span>
    ),
  });
  if (tm.overlap) {
    const o = tm.overlap;
    out.push({
      id: "t-overlap",
      at: [tm.mid.x, 0, tm.mid.z],
      lift: (o.from + o.to) / 2,
      anchor: "center",
      alts: ["above", "below", "right", "left"],
      priority: 82,
      time: "only",
      reveal: o.to,
      content: (
        <span
          className="block whitespace-nowrap rounded-pill border px-2 py-0.5 text-caption text-overlap"
          style={{ ...MONO_SHADOW, borderColor: "rgb(212 184 117 / 0.45)", background: "rgb(20 22 26 / 0.72)", borderStyle: o.confirmed ? "solid" : "dashed" }}
        >
          {o.text}
        </span>
      ),
    });
  }
  if (tm.gap) {
    const g = tm.gap;
    const [pA, pB] = [tm.pillars.find((p) => p.side === "a"), tm.pillars.find((p) => p.side === "b")];
    const dx = pA && pB ? pB.at.x - pA.at.x : 1;
    const dz = pA && pB ? pB.at.z - pA.at.z : 0;
    const len = Math.hypot(dx, dz) || 1;
    const [ux, uz] = len > 0.3 ? [dx / len, dz / len] : [1, 0];
    out.push({
      id: "t-gap",
      at: [tm.mid.x - uz * GAP_OFFSET, 0, tm.mid.z + ux * GAP_OFFSET],
      lift: (g.from + g.to) / 2,
      anchor: "right",
      alts: ["left", "above", "below"],
      priority: 80,
      time: "only",
      reveal: g.to,
      content: (
        <span className="num block whitespace-nowrap rounded-pill px-2 py-0.5 text-caption text-overlap" style={{ ...MONO_SHADOW, background: "rgb(20 22 26 / 0.72)" }}>
          {g.text}
        </span>
      ),
    });
  }
  return out;
}

/** Where the diorama has something standing (structures, markers, pins, the beacon, towers, chords): scene points. */
function sceneObstacles(model: CloseupModel): [number, number, number][] {
  const out: [number, number, number][] = [];
  const add = (v: V2, y = 0.3) => out.push([v.x, y, v.z]);
  for (const p of [model.a, model.b]) {
    for (const pl of p.places) if (!pl.hidden) add(pl.pos);
    if (p.center) add(p.center, PIN_H * 0.5);
    if (p.route) {
      const n = Math.max(2, Math.min(40, Math.round(polyLength(p.route.pts) / 0.6)));
      for (const { p: q } of alongPolyline(p.route.pts, n)) add(q);
    }
    if (p.chord) for (const t of [0, 0.25, 0.5, 0.75, 1]) add({ x: p.chord[0].x + (p.chord[1].x - p.chord[0].x) * t, z: p.chord[0].z + (p.chord[1].z - p.chord[0].z) * t }, 0.02);
  }
  if (model.site) add(model.site.pos, BEACON_H * 0.5);
  // the ruler's ends, or the point where the projects touch
  if (model.closest) for (const v of [model.closest.a, model.closest.b]) add(v, 0.02);
  if (model.touch) add(model.touch, 0.02);
  return out.filter(([x, , z]) => Math.hypot(x, z) <= PLINTH_R + 0.5);
}

function FacilityLabel({ pl }: { pl: CuPlace }) {
  return (
    <span className={clsx("whitespace-nowrap text-caption", pl.shared ? "text-fg-1" : "text-fg-2")} style={SHADOW}>
      {pl.label}
      {pl.treatment === "disc" && <span className="text-fg-3"> · approximate</span>}
    </span>
  );
}

function ProjectCard({ p, compact, pillar }: { p: CuProject; compact?: boolean; pillar?: TimePillar }) {
  const color = UTIL[p.side];
  const isd = pillar?.isd?.text;
  return (
    <div className={clsx("chrome flex items-stretch gap-2 rounded-control py-1.5 pl-1.5 pr-2.5", compact ? "max-w-[166px]" : "max-w-[220px]")}>
      <span aria-hidden className="w-0.5 shrink-0 rounded-pill" style={{ background: color }} />
      <div className="min-w-0">
        {/* "center" says what the pin marks; the narrow phone card keeps the owner whole instead */}
        <div className="eyebrow flex min-w-0" style={{ color }}>
          <span className="truncate">{p.owner}</span>
          {!compact && <span className="shrink-0 whitespace-pre"> · center</span>}
        </div>
        <div className="mt-1 truncate text-ui font-medium text-fg-1">{p.title}</div>
        {pillar && (
          <div className="num mt-0.5 truncate text-caption text-fg-3">{isd ? `In service ${isd}` : "No in-service date published"}</div>
        )}
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
