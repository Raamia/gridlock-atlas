"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { IDX } from "@/lib/data";
import type { Match } from "@/lib/domain/types";
import { formatBound, formatDate } from "@/lib/format";
import { useWidth } from "@/lib/hooks";
import { currentInService } from "@/lib/matching/time";
import { rankLabel, rankOf, regionMatches } from "@/lib/rank";
import { ownerNames } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { Eyebrow } from "../ui";
import { FloatTip } from "./FloatTip";
import { inServiceModel, labelPx, pairsByProject, pct, ROW_COLOR, SNAP_ISO, tickExtent, years, type Domain, type InServiceModel, type InServiceRow, type InServiceTick } from "./model";

/*
 * "Planned in-service years" (SPEC §4 C): one row per plan (utility A, utility B, other owners), one tick per planned project
 * at its current in-service / need date — a crisp tick for a stated day or month, a fuzzy band for a quarter/half/year.
 * Before a run every tick is quiet; after it the projects in flagged pairs brighten and the rest drop to 25%.
 * Hovering a tick (or a list row, or a plan in the hero) lights that project and its partners; the map follows through
 * hoveredProjectId / hoveredMatchId.
 */

const REVEAL = "opacity 700ms var(--ease-enter)";

interface StripState {
  model: InServiceModel;
  run: boolean;
  /** projects in the flagged pairs on screen (region, or the focus), null before a run */
  flagged: Set<string> | null;
  byProject: Map<string, Match[]>;
}

function useStrip(): StripState {
  const region = useAtlas((s) => s.region);
  const run = useAtlas((s) => s.run);
  const focus = useAtlas((s) => s.focus);
  const model = useMemo(() => inServiceModel(region, run), [region, run]);
  const pairs = useMemo(() => {
    if (!run) return [];
    const all = regionMatches(run, region);
    return focus ? all.filter((m) => focus.pairIds.includes(m.id)) : all;
  }, [run, region, focus]);
  const byProject = useMemo(() => pairsByProject(pairs), [pairs]);
  const flagged = useMemo(() => (run ? new Set(byProject.keys()) : null), [run, byProject]);
  return { model, run: !!run, flagged, byProject };
}

/* ─────────────────────────────────────────────── tick layers ─────────────────────────────────────────────── */

function Tick({ t, d, color, emphasis }: { t: InServiceTick; d: Domain; color: string; emphasis?: boolean }) {
  const [x0, x1] = tickExtent(t, d);
  if (x0 === x1) {
    return (
      <span
        aria-hidden
        className={clsx("absolute rounded-full", emphasis ? "-inset-y-[3px] w-[3px] -translate-x-[1.5px]" : "inset-y-0 w-[2px] -translate-x-px")}
        style={{ left: `${x0 * 100}%`, background: emphasis ? "var(--fg-1)" : color, boxShadow: emphasis ? "0 0 0 1px var(--canvas)" : undefined }}
      />
    );
  }
  // a quarter / half / year: the date could fall anywhere in it, so the band fades at both ends (T7)
  return (
    <span
      aria-hidden
      className={clsx("absolute inset-y-0 rounded-full", emphasis && "ring-1 ring-fg-1 ring-inset")}
      style={{
        left: `${x0 * 100}%`,
        width: `${(x1 - x0) * 100}%`,
        background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${emphasis ? "var(--fg-1)" : color} 70%, transparent) 30%, color-mix(in oklab, ${emphasis ? "var(--fg-1)" : color} 70%, transparent) 70%, transparent)`,
      }}
    />
  );
}

/**
 * One row's ticks in two stacked layers so density never fakes brightness: the base layer holds every tick and is dimmed as a
 * group (pre-run .55, post-run .22); the flagged layer holds only the flagged ones at full strength and fades in on the reveal.
 */
function RowTicks({ row, d, flagged, emphasized }: { row: InServiceRow; d: Domain; flagged: Set<string> | null; emphasized: Set<string> }) {
  const color = ROW_COLOR[row.key];
  const lit = flagged ? row.ticks.filter((t) => flagged.has(t.project.id)) : [];
  const hot = row.ticks.filter((t) => emphasized.has(t.project.id));
  return (
    <>
      <span aria-hidden className="absolute inset-0" style={{ opacity: flagged ? 0.22 : 0.55, transition: REVEAL }}>
        {row.ticks.map((t) => (
          <Tick key={t.project.id} t={t} d={d} color={color} />
        ))}
      </span>
      <span aria-hidden className="absolute inset-0" style={{ opacity: flagged ? 1 : 0, transition: REVEAL }}>
        {lit.map((t) => (
          <Tick key={t.project.id} t={t} d={d} color={color} />
        ))}
      </span>
      {hot.length > 0 && (
        <span aria-hidden className="absolute inset-0">
          {hot.map((t) => (
            <Tick key={t.project.id} t={t} d={d} color={color} emphasis />
          ))}
        </span>
      )}
    </>
  );
}

function SnapshotLine({ d, className }: { d: Domain; className?: string }) {
  return <span aria-hidden className={clsx("pointer-events-none absolute w-px border-l border-dashed border-fg-2/70", className)} style={{ left: `${pct(SNAP_ISO, d)}%` }} />;
}

/* ─────────────────────────────────────────────── collapsed ─────────────────────────────────────────────── */

/** The 44px summary: the same ticks at 4px, no labels (the full strip is one click away). */
export function InServiceMicro({ className }: { className?: string }) {
  const { model, flagged } = useStrip();
  const none = new Set<string>();
  return (
    <div aria-hidden className={clsx("relative flex flex-col justify-center gap-[3px]", className)}>
      {model.rows.map((row) => (
        <div key={row.key} className="relative h-1 rounded-full bg-fill-1">
          <RowTicks row={row} d={model.domain} flagged={flagged} emphasized={none} />
        </div>
      ))}
      <SnapshotLine d={model.domain} className="-inset-y-1" />
    </div>
  );
}

/** "44 of 197 in flagged pairs" / "197 projects · 2 undated" */
export function useInServiceMeta(): { text: string; title: string } {
  const { model, flagged } = useStrip();
  const focus = useAtlas((s) => s.focus);
  const undated = model.undated ? ` · ${model.undated} undated` : "";
  const title = `${model.dated} planned projects with a published in-service or need date${model.undated ? `; ${model.undated} publish none and are not drawn` : ""}.`;
  if (!flagged) return { text: `${model.dated} projects${undated}`, title };
  const lit = model.rows.reduce((n, r) => n + r.ticks.filter((t) => flagged.has(t.project.id)).length, 0);
  return { text: `${lit} of ${model.dated} in ${focus ? "focused" : "flagged"} pairs`, title };
}

/* ──────────────────────────────────────────────── full strip ──────────────────────────────────────────────── */

interface Hover {
  tick: InServiceTick;
  anchor: DOMRect;
}

/** Row labels ("Georgia Power") at the desktop caption size, plus the dot and the gap to the track. */
const LABEL_W = 120;

/**
 * The 96px overview dock: header, 2–3 rows of ticks, the year axis with the Snapshot marker. `extra`: px the dock was
 * dragged taller than 96; the rows take it (up to +16px each), so the ticks get bigger instead of the strip floating.
 */
export function InServiceStrip({ headerRight, extra = 0 }: { headerRight?: ReactNode; extra?: number }) {
  const { model, flagged, byProject, run } = useStrip();
  const meta = useInServiceMeta();
  const region = useAtlas((s) => s.region);
  const runObj = useAtlas((s) => s.run);
  const hoveredMatchId = useAtlas((s) => s.hoveredMatchId);
  const hoveredProjectId = useAtlas((s) => s.hoveredProjectId);
  const set = useAtlas((s) => s.set);
  const focusProject = useAtlas((s) => s.focusProject);
  const [hover, setHover] = useState<Hover | null>(null);
  /** the hover this strip last wrote to the store (so it only ever clears its own) */
  const wrote = useRef<{ p: string; m: string | null } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const width = useWidth(track);
  const d = model.domain;
  const three = model.rows.length > 2;
  const rowH = (three ? 9 : 12) + Math.min(16, Math.max(0, Math.floor(extra / (model.rows.length + 1))));

  // the list row / map / hero plan under the pointer lights its ticks too
  const listPair = !hover && hoveredMatchId ? runObj?.matches.find((m) => m.id === hoveredMatchId) : undefined;
  const emphasized = useMemo(() => {
    const s = new Set<string>();
    if (hover) {
      s.add(hover.tick.project.id);
      for (const m of byProject.get(hover.tick.project.id) ?? []) s.add(m.projectAId).add(m.projectBId);
    } else if (listPair) s.add(listPair.projectAId).add(listPair.projectBId);
    else if (hoveredProjectId) s.add(hoveredProjectId);
    return s;
  }, [hover, byProject, listPair, hoveredProjectId]);

  const pick = (row: InServiceRow, e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best: InServiceTick | null = null;
    let bestD = Infinity;
    for (const t of row.ticks) {
      const [a, b] = tickExtent(t, d);
      const dist = x < a * r.width ? a * r.width - x : x > b * r.width ? x - b * r.width : 0;
      // flagged ticks win near-ties: they are the ones worth a look
      const score = dist - (flagged?.has(t.project.id) ? 3 : 0);
      if (score < bestD) {
        bestD = score;
        best = t;
      }
    }
    if (!best || bestD > 8) return leave();
    if (hover?.tick === best) return;
    const [a, b] = tickExtent(best, d);
    setHover({ tick: best, anchor: new DOMRect(r.left + a * r.width - 2, r.top, Math.max(4, (b - a) * r.width + 4), r.height) });
    const top = byProject.get(best.project.id)?.[0];
    wrote.current = { p: best.project.id, m: top?.id ?? null };
    set({ hoveredProjectId: best.project.id, hoveredMatchId: top?.id ?? null });
  };
  const leave = () => {
    if (!hover) return;
    setHover(null);
    wrote.current = null;
    set({ hoveredProjectId: null, hoveredMatchId: null });
  };
  // a click on a flagged tick focuses the list and map on that project's pairs (same as clicking its dot on the map)
  const click = () => {
    if (!hover || !byProject.has(hover.tick.project.id)) return;
    const id = hover.tick.project.id;
    setHover(null);
    wrote.current = null;
    set({ hoveredProjectId: null, hoveredMatchId: null });
    focusProject(id);
  };
  // the dock can swap faces under the pointer (a selection): never leave the map highlighting a stale hover
  useEffect(
    () => () => {
      // only what this strip wrote: a list row hovered meanwhile keeps its own highlight
      const s = useAtlas.getState();
      const mine = wrote.current;
      if (mine && s.hoveredProjectId === mine.p && s.hoveredMatchId === mine.m) s.set({ hoveredProjectId: null, hoveredMatchId: null });
    },
    [],
  );

  return (
    <div className="flex h-full flex-col px-4 pb-2 pt-2.5">
      <header className="flex h-5 min-w-0 items-center gap-3">
        <Eyebrow as="h2" className="shrink-0">
          Planned in-service years
        </Eyebrow>
        <span className="num shrink-0 text-caption text-fg-3" title={meta.title}>
          {meta.text}
        </span>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
          {listPair ? <PairReadout m={listPair} region={region} /> : <StripLegend run={run} />}
          {headerRight && <div className="-my-1.5 -mr-2">{headerRight}</div>}
        </div>
      </header>

      <div className="mt-2 grid min-h-0 flex-1" style={{ gridTemplateColumns: `${LABEL_W}px minmax(0,1fr)` }}>
        <div className={clsx("flex flex-col pr-3", three ? "gap-1" : "gap-1.5")}>
          {model.rows.map((row) => (
            <div key={row.key} className="flex items-center gap-1.5" style={{ height: rowH }} title={row.title}>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: ROW_COLOR[row.key] }} />
              <span className={clsx("min-w-0 truncate font-medium text-fg-2", three ? "text-label leading-none" : "text-caption leading-none")}>{row.label}</span>
            </div>
          ))}
        </div>
        <div ref={track} className="relative">
          <YearGrid d={d} />
          <SnapshotLine d={d} className="-top-1 bottom-[-18px] z-10" />
          <div className={clsx("relative flex flex-col", three ? "gap-1" : "gap-1.5")} onPointerLeave={leave}>
            {model.rows.map((row) => (
              <div
                key={row.key}
                role="img"
                aria-label={rowSummary(row, flagged)}
                style={{ height: rowH }}
                className={clsx("relative rounded-full bg-fill-1", hover?.tick.row === row.key && byProject.has(hover.tick.project.id) && "cursor-pointer")}
                onPointerMove={(e) => e.pointerType !== "touch" && pick(row, e)}
                onClick={click}
              >
                <RowTicks row={row} d={d} flagged={flagged} emphasized={emphasized} />
              </div>
            ))}
          </div>
          <Axis d={d} width={width} className="mt-1.5" />
        </div>
      </div>

      {hover && (
        <FloatTip anchor={hover.anchor}>
          <TickCard tick={hover.tick} pairs={byProject.get(hover.tick.project.id) ?? []} run={run} region={region} />
        </FloatTip>
      )}
    </div>
  );
}

function rowSummary(row: InServiceRow, flagged: Set<string> | null): string {
  const ys = row.ticks.map((t) => Number(t.claim.date.earliest.slice(0, 4)));
  const span = ys.length ? `${Math.min(...ys)}–${Math.max(...ys)}` : "none";
  const lit = flagged ? `, ${row.ticks.filter((t) => flagged.has(t.project.id)).length} in flagged pairs` : "";
  return `${row.title || row.label}: ${row.ticks.length} planned in-service dates, ${span}${lit}`;
}

/** Year columns: a hairline at every Jan 1. */
function YearGrid({ d }: { d: Domain }) {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-1 bottom-[-18px] inset-x-0">
      {years(d).map((y) => (
        <span key={y} className="absolute inset-y-0 w-px bg-divider" style={{ left: `${pct(`${y}-01-01`, d)}%` }} />
      ))}
    </span>
  );
}

/**
 * Year labels centred in their columns (a year-precision date fills its column), thinned when columns get narrow; the
 * "Snapshot" label sits on the axis at the marker and hides any year label it would touch.
 */
export function Axis({ d, width, className }: { d: Domain; width: number; className?: string }) {
  const ys = years(d);
  const colW = width / Math.max(1, ys.length);
  const every = colW >= 36 ? 1 : colW >= 18 ? 2 : 3;
  const snapX = (pct(SNAP_ISO, d) / 100) * width;
  // Geist Mono ≈ 0.6em per glyph + the label's 0.08em tracking: "Snapshot" ≈ 60px and a year ≈ 30px at 11px (65 / 33 at 12)
  const em = labelPx();
  const SNAP_W = Math.ceil(em * 5.45);
  const YEAR_W = Math.ceil(em * 2.75);
  const labels = ys
    .map((y, i) => ({ y, cx: ((pct(`${y}-01-01`, d) + pct(`${y + 1}-01-01`, d)) / 200) * width, keep: (ys.length - 1 - i) % every === 0 }))
    .filter((l) => l.keep);
  const clashes = ([a, b]: [number, number]) => labels.filter((l) => l.cx + YEAR_W / 2 > a - 6 && l.cx - YEAR_W / 2 < b + 6).map((l) => l.y);
  // the label sits beside the marker on the side that hides fewer year labels; a tie hides the snapshot's own year
  // (the marker stands inside that year), so the future years a planner reads stay labelled
  const right: [number, number] = [snapX + 4, snapX + 4 + SNAP_W];
  const left: [number, number] = [snapX - 4 - SNAP_W, snapX - 4];
  const hideR = clashes(right);
  const hideL = clashes(left);
  const side: "l" | "r" = right[1] > width ? "l" : left[0] < 0 ? "r" : hideL.length <= hideR.length ? "l" : "r";
  const hidden = new Set(side === "l" ? hideL : hideR);
  return (
    <div aria-hidden className={clsx("relative h-3", className)}>
      {width > 0 &&
        labels
          .filter((l) => !hidden.has(l.y))
          .map((l) => (
            <span key={l.y} className="num absolute top-0 -translate-x-1/2 text-label leading-none text-fg-3" style={{ left: l.cx }}>
              {l.y}
            </span>
          ))}
      {width > 0 && (
        <span
          className={clsx("num absolute top-0 whitespace-nowrap text-label leading-none text-fg-1", side === "l" && "-translate-x-full")}
          style={{ left: side === "r" ? snapX + 4 : snapX - 4 }}
          title={`Snapshot of public plans · ${formatDate(SNAP_ISO)}`}
        >
          Snapshot
        </span>
      )}
    </div>
  );
}

function StripLegend({ run }: { run: boolean }) {
  return (
    // after a run the flagged / not flagged key matters most; the precision key shows when there's room for it too
    <div aria-hidden className="flex items-center gap-3 text-caption text-fg-3">
      <span className={clsx("items-center gap-1.5", run ? "hidden @min-[1060px]:flex" : "hidden @min-[640px]:flex")}>
        <span className="h-2.5 w-[2px] rounded-full bg-fg-2" /> stated date
      </span>
      <span className={clsx("items-center gap-1.5", run ? "hidden @min-[1060px]:flex" : "hidden @min-[640px]:flex")}>
        <span className="h-2.5 w-4 rounded-full" style={{ background: "linear-gradient(90deg, transparent, var(--fg-2), transparent)" }} /> year precision
      </span>
      {run && (
        <>
          <span className="hidden items-center gap-1.5 @min-[700px]:flex">
            <span className="h-2.5 w-[2px] rounded-full bg-fg-1" /> in a flagged pair
          </span>
          <span className="hidden items-center gap-1.5 @min-[700px]:flex">
            <span className="h-2.5 w-[2px] rounded-full bg-fg-1/25" /> not flagged
          </span>
        </>
      )}
    </div>
  );
}

/** While a list row is hovered: "#01 · DESC Dec 31, 2028 · Georgia Power 2028". */
function PairReadout({ m, region }: { m: Match; region: string }) {
  const run = useAtlas((s) => s.run);
  const rank = run ? rankOf(run, region, m.id) : undefined;
  const part = (id: string, color: string) => {
    const p = IDX.project(id);
    const c = p ? inServiceOf(id) : undefined;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate text-fg-2">{p ? ownerNames(p, IDX, true) : id}</span>
        <span className="num shrink-0 text-fg-1">{c ?? "—"}</span>
      </span>
    );
  };
  return (
    <div className="flex min-w-0 max-w-[420px] animate-fade-in items-center gap-3 text-caption">
      {rank !== undefined && <span className="num shrink-0 text-fg-3">#{rankLabel(rank)}</span>}
      {part(m.projectAId, "var(--util-a)")}
      {part(m.projectBId, "var(--util-b)")}
    </div>
  );
}

// the readout needs any hovered pair's in-service text, in any region: computed once per project
const IN_SERVICE_TEXT = new Map<string, string | undefined>();
function inServiceOf(projectId: string): string | undefined {
  if (!IN_SERVICE_TEXT.has(projectId)) {
    const c = currentInService(IDX.project(projectId));
    IN_SERVICE_TEXT.set(projectId, c ? formatBound(c.date) : undefined);
  }
  return IN_SERVICE_TEXT.get(projectId);
}

function TickCard({ tick, pairs, run, region }: { tick: InServiceTick; pairs: Match[]; run: boolean; region: string }) {
  const p = tick.project;
  const color = ROW_COLOR[tick.row];
  const runObj = useAtlas((s) => s.run);
  const passed = tick.claim.date.latest < SNAP_ISO;
  const top = pairs[0];
  const rank = runObj && top ? rankOf(runObj, region, top.id) : undefined;
  const label = tick.claim.label ? tick.claim.label[0].toUpperCase() + tick.claim.label.slice(1) : "In-service";
  return (
    <div className="flex w-[280px] flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="num truncate text-label uppercase tracking-[0.08em]" style={{ color }}>
          {ownerNames(p, IDX, true)}
        </span>
      </span>
      <span className="text-ui font-medium text-fg-1">{p.shortTitle}</span>
      <span>
        <span className="num text-fg-1">{formatBound(tick.claim.date)}</span>
        <span className="text-fg-3"> · {label}</span>
      </span>
      {passed && <span className="text-fg-3">Date passed · planned date passed; completion not confirmed</span>}
      {tick.pinned && <span className="text-fg-3">Outside the years drawn; pinned to the edge</span>}
      <span className="mt-0.5 text-fg-3">
        {!run
          ? "Compare public plans to see its pairs"
          : pairs.length
            ? `In ${pairs.length} flagged ${pairs.length === 1 ? "pair" : "pairs"}${rank !== undefined ? ` · top #${rankLabel(rank)}` : ""}`
            : "Not in a flagged pair"}
      </span>
    </div>
  );
}
