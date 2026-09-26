"use client";

import clsx from "clsx";
import { AlertTriangle, Info } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { IDX } from "@/lib/data";
import type { CompletionClaim, Conflict, ConstructionWindow, Match, Project } from "@/lib/domain/types";
import { formatBound, formatWindow, precisionLabel } from "@/lib/format";
import { useWidth } from "@/lib/hooks";
import { coarsest, currentInService, displayWindowGroups, endsWindow, scheduleWindows } from "@/lib/matching/time";
import { conflictMatches, ownerNames, windowGroupText, windowSourceText } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { Eyebrow, IconButton, SignalFact, signalState, windowDocs, windowNote } from "../ui";
import { FloatTip } from "./FloatTip";
import { Axis } from "./InServiceStrip";
import { frac, isCoarseGroup, labelPx, overlapStatement, pairCaption, pairDomain, pct, SNAP_ISO, years, type Domain, type OverlapStatement } from "./model";

/*
 * The selected pair's construction Gantt (SPEC §5.4) — the original encoding, given room:
 *   bars      one per source's window group (≤2 shown): stated = solid tint with fuzzy edges where a date is coarse (T7);
 *             bounds / budget years / non-continuous = hatched (T3); a start the source doesn't publish fades in; an open end → "→"
 *   lane      the published schedule (start → in-service) as a thin line, completion / in-service claims as diamonds —
 *             current filled, earlier editions hollow (version history, T6), disputed ones in the warn hue with
 *             "completion dates disagree"
 *   band      amber = windows may overlap (hatched) / guaranteed on a construction basis (solid); a schedule-basis TIME is
 *             drawn on the schedule lines and never called a construction overlap (T2)
 *   Snapshot  the frozen reference date (never "Today")
 * `compact` is the phone inspector's version (inside "When they build"): no header, no "Construction timeline" label.
 */

const ROLE_COLOR = { a: "var(--util-a)", b: "var(--util-b)" } as const;
type Role = keyof typeof ROLE_COLOR;

/** The claims lane under each row's bars (schedule line + diamonds). */
const LANE_H = 16;
const OPEN_START_FADE = "linear-gradient(90deg, transparent 0, black 22%)";
const HATCH = (c: string, a = 30, b = 12) => `repeating-linear-gradient(135deg, color-mix(in oklab, ${c} ${a}%, transparent) 0 4px, color-mix(in oklab, ${c} ${b}%, transparent) 4px 8px)`;
const BAND_HATCH = "repeating-linear-gradient(135deg, color-mix(in oklab, var(--overlap) 20%, transparent) 0 5px, color-mix(in oklab, var(--overlap) 5%, transparent) 5px 10px)";

/**
 * `extra`: px the dock was dragged taller than its 196px default (components/ResizeHandle); the bars take it (up to
 * +20px each), so a bigger dock means a bigger, easier-to-read Gantt rather than empty space.
 */
export function PairGantt({ matchId, compact = false, headerRight, extra = 0 }: { matchId: string; compact?: boolean; headerRight?: ReactNode; extra?: number }) {
  const run = useAtlas((s) => s.run);
  const m = run?.matches.find((x) => x.id === matchId);
  if (!m) return null;
  return <Gantt key={m.id} m={m} compact={compact} headerRight={headerRight} extra={extra} />;
}

function Gantt({ m, compact, headerRight, extra }: { m: Match; compact: boolean; headerRight?: ReactNode; extra: number }) {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const d = useMemo(() => pairDomain(a, b), [a, b]);
  const st = overlapStatement(m);
  const caption = pairCaption(m, (id) => IDX.project(id)?.shortTitle ?? id);
  const axisRef = useRef<HTMLDivElement>(null);
  const width = useWidth(axisRef);
  const rows: [Project, Role][] = [
    [a, "a"],
    [b, "b"],
  ];
  const bar = compact ? 28 : 28 + Math.min(20, Math.max(0, Math.floor(extra / 2)));
  const lanes = rows.map(([p]) => laneModel(p, m, d, width));
  // a disagreement the lane had no room to label is said in the caption instead (never silently dropped)
  const unlabeled = width > 0 ? rows.filter((_, i) => lanes[i].conflictUnlabeled).map(([p]) => p.shortTitle) : [];
  const captionParts: CaptionPart[] = [
    ...unlabeled.map((t) => ({ text: `Completion dates disagree for ${t}`, warn: true })),
    ...caption.map((text) => ({ text })),
  ];

  const statement = (
    <SignalFact kind="time" state={signalState(m.time)} mono={false} size="caption" className="min-w-0" tooltip={m.timeReason}>
      {st.text}
    </SignalFact>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {statement}
        <div ref={axisRef}>
          <Axis d={d} width={width} />
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.map(([p, role], i) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <RowLabel p={p} role={role} inline />
              <div className="relative">
                <Grid d={d} local />
                <Track p={p} role={role} lane={lanes[i]} d={d} bar={bar} st={st} bandSlice />
              </div>
            </div>
          ))}
        </div>
        <Caption parts={captionParts} wrap />
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col px-4 pb-2.5 pt-2.5">
      <header className="flex h-7 min-w-0 shrink-0 items-center gap-3">
        <Eyebrow as="h2" className="shrink-0 @max-[560px]:hidden">
          Construction windows
        </Eyebrow>
        {statement}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <InlineKey />
          <GanttKey />
          {headerRight && <div className="-mr-2">{headerRight}</div>}
        </div>
      </header>
      <div className="mt-1.5 grid min-h-0 grid-cols-[132px_minmax(0,1fr)] @min-[560px]:grid-cols-[164px_minmax(0,1fr)]">
        <span aria-hidden />
        <div ref={axisRef} className="mb-1.5">
          <Axis d={d} width={width} />
        </div>
        <div className="flex flex-col gap-1.5 pr-3">
          {rows.map(([p, role]) => (
            <RowLabel key={p.id} p={p} role={role} height={bar + LANE_H} />
          ))}
        </div>
        <div className="relative flex flex-col gap-1.5">
          <Grid d={d} />
          {st.band && <Band st={st} d={d} />}
          {rows.map(([p, role], i) => (
            <Track key={p.id} p={p} role={role} lane={lanes[i]} d={d} bar={bar} st={st} />
          ))}
        </div>
      </div>
      <Caption parts={captionParts} className="mt-auto" />
    </div>
  );
}

/* ─────────────────────────────────────────────── chrome ─────────────────────────────────────────────── */

function RowLabel({ p, role, height, inline }: { p: Project; role: Role; height?: number; inline?: boolean }) {
  const groups = displayWindowGroups(p, (id) => IDX.source(id)?.publisher).length;
  const more = groups - 2;
  const owner = (
    <span className="num min-w-0 truncate text-label uppercase leading-none tracking-[0.06em]" style={{ color: ROLE_COLOR[role] }}>
      {ownerNames(p, IDX, true)}
    </span>
  );
  if (inline) {
    return (
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="max-w-[40%] shrink-0 truncate">{owner}</span>
        <span className="min-w-0 truncate text-caption font-medium text-fg-1" title={p.title}>
          {p.shortTitle}
        </span>
        {more > 0 && <span className="shrink-0 text-caption text-fg-3">+{more} more</span>}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5" style={{ height }}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: ROLE_COLOR[role] }} />
        {owner}
      </span>
      {/* owner + two title lines fit the 44px row at the desktop type size; with a "+N more" line the title takes one */}
      <span className={clsx("text-ui font-medium leading-[1.1] text-fg-1", more > 0 ? "line-clamp-1" : "line-clamp-2")} title={p.title}>
        {p.shortTitle}
      </span>
      {more > 0 && (
        <span className="text-caption leading-none text-fg-3">
          +{more} more {more === 1 ? "window" : "windows"}
        </span>
      )}
    </div>
  );
}

interface CaptionPart {
  text: string;
  warn?: boolean;
}

/** One quiet line under the Gantt (the phone version may wrap): basis caveat, in-service gap, passed dates. */
function Caption({ parts, className, wrap }: { parts: CaptionPart[]; className?: string; wrap?: boolean }) {
  if (!parts.length) return null;
  const text = parts.map((p) => p.text).join(" · ");
  return (
    <p className={clsx("min-w-0 pt-1.5 text-caption text-fg-3", wrap ? "text-pretty" : "truncate", className)} title={wrap ? undefined : text}>
      {parts.map((p, i) => (
        <span key={p.text} className={clsx(p.warn && "text-warn")}>
          {i > 0 && <span className="text-fg-3"> · </span>}
          {p.warn && <AlertTriangle size={11} strokeWidth={2} aria-hidden className="mr-1 inline-block -translate-y-px" />}
          {p.text}
        </span>
      ))}
    </p>
  );
}

/** Jan 1 hairlines + the dashed Snapshot marker, behind the rows. */
function Grid({ d, local }: { d: Domain; local?: boolean }) {
  // dock: one grid behind both rows, the marker reaching up to its axis label · phone: one per track, clear of the row labels
  return (
    <span aria-hidden className={clsx("pointer-events-none absolute inset-x-0", local ? "-inset-y-0.5" : "-top-[18px] -bottom-1")}>
      {years(d).map((y) => (
        <span key={y} className={clsx("absolute bottom-0 w-px bg-divider", local ? "top-0" : "top-[18px]")} style={{ left: `${pct(`${y}-01-01`, d)}%` }} />
      ))}
      <span className="absolute inset-y-0 z-[5] w-px border-l border-dashed border-fg-2/70" style={{ left: `${pct(SNAP_ISO, d)}%` }} />
    </span>
  );
}

/** The amber overlap band across both rows: hatched = may overlap; solid core = guaranteed (construction basis only). */
function Band({ st, d }: { st: OverlapStatement; d: Domain }) {
  const o = st.band!;
  const l = pct(o.start, d);
  const w = Math.max(pct(o.end, d) - l, 0.6);
  return (
    <span aria-hidden className="pointer-events-none absolute -inset-y-1 inset-x-0 z-0">
      <motion.span
        initial={{ opacity: 0, scaleX: 0.7 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="absolute inset-y-0 origin-center rounded-chip"
        style={{ left: `${l}%`, width: `${w}%`, background: BAND_HATCH, boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--overlap) 45%, transparent)" }}
      />
      {st.core && (
        <span
          className="absolute inset-y-0 rounded-chip bg-overlap-wash"
          style={{
            left: `${pct(st.core.start, d)}%`,
            width: `max(3px, ${pct(st.core.end, d) - pct(st.core.start, d)}%)`,
            boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--overlap) 70%, transparent)",
          }}
        />
      )}
    </span>
  );
}

/** Legend as a hover card (the dock is rarely wide enough for it inline). */
function GanttKey() {
  return (
    <IconButton size="sm" label="Timeline key" tooltip={<KeyList />} tooltipSide="top" className="@min-[980px]:hidden">
      <Info size={14} strokeWidth={1.75} />
    </IconButton>
  );
}

function KeyList() {
  return (
    <span className="flex flex-col gap-1.5 py-0.5">
      <KeyRow swatch={<Swatch kind="stated" />}>Stated window</KeyRow>
      <KeyRow swatch={<Swatch kind="fuzzy" />}>Fuzzy edge = date precision</KeyRow>
      <KeyRow swatch={<Swatch kind="bounds" />}>Bounds / budget years only</KeyRow>
      <KeyRow swatch={<Swatch kind="schedule" />}>Published schedule · start → in-service</KeyRow>
      <KeyRow swatch={<Swatch kind="claim" />}>In-service / completion claim</KeyRow>
      <KeyRow swatch={<Swatch kind="earlier" />}>Earlier edition · version history</KeyRow>
      <KeyRow swatch={<Swatch kind="band" />}>Windows may overlap</KeyRow>
      <span className="text-fg-3">Every window and date as the sources state it.</span>
    </span>
  );
}

function InlineKey() {
  return (
    <span aria-hidden className="hidden items-center gap-3 text-caption text-fg-3 @min-[980px]:flex">
      <KeyRow swatch={<Swatch kind="stated" />}>stated</KeyRow>
      <KeyRow swatch={<Swatch kind="fuzzy" />}>date precision</KeyRow>
      <KeyRow swatch={<Swatch kind="bounds" />}>bounds only</KeyRow>
      <KeyRow swatch={<Swatch kind="schedule" />}>schedule</KeyRow>
      <KeyRow swatch={<Swatch kind="earlier" />}>earlier edition</KeyRow>
    </span>
  );
}

function KeyRow({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="grid w-5 shrink-0 place-items-center">{swatch}</span>
      {children}
    </span>
  );
}

function Swatch({ kind }: { kind: "stated" | "fuzzy" | "bounds" | "schedule" | "claim" | "earlier" | "band" }) {
  const c = "var(--fg-2)";
  if (kind === "claim" || kind === "earlier")
    return <span className={clsx("size-2 rotate-45 rounded-[1px] border-[1.5px]", kind === "claim" ? "border-fg-1 bg-fg-1" : "border-fg-3 bg-surface-solid")} />;
  if (kind === "schedule")
    return (
      <span className="relative h-2 w-5">
        <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 rounded-full bg-fg-2" />
      </span>
    );
  const bg =
    kind === "stated"
      ? `color-mix(in oklab, ${c} 45%, transparent)`
      : kind === "fuzzy"
        ? `linear-gradient(90deg, transparent, color-mix(in oklab, ${c} 55%, transparent))`
        : kind === "bounds"
          ? HATCH(c, 55, 18)
          : BAND_HATCH;
  return <span className="h-2 w-5 rounded-[3px]" style={{ background: bg, boxShadow: kind === "band" ? "inset 0 0 0 1px color-mix(in oklab, var(--overlap) 45%, transparent)" : undefined }} />;
}

/* ─────────────────────────────────────────────── one row ─────────────────────────────────────────────── */


function Track({ p, role, lane, d, bar, st, bandSlice }: { p: Project; role: Role; lane: LaneModel; d: Domain; bar: number; st: OverlapStatement; bandSlice?: boolean }) {
  const color = ROLE_COLOR[role];
  // two documents from one publisher with the same window read as one bar (same grouping as the inspector)
  const groups = displayWindowGroups(p, (id) => IDX.source(id)?.publisher);
  const shown = groups.slice(0, 2);
  const half = (bar - 2) / 2;
  return (
    <div className="relative z-10" style={{ height: bar + LANE_H }}>
      {bandSlice && st.band && (
        <span
          aria-hidden
          className="absolute rounded-chip"
          style={{
            left: `${pct(st.band.start, d)}%`,
            width: `${Math.max(pct(st.band.end, d) - pct(st.band.start, d), 0.6)}%`,
            top: -2,
            height: bar + 4,
            background: BAND_HATCH,
            boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--overlap) 45%, transparent)",
          }}
        />
      )}
      {groups.length === 0 && (
        <div className="absolute inset-x-0 top-0 flex items-center rounded-chip bg-fill-1 px-2.5 text-caption text-fg-3" style={{ height: bar }}>
          <span className="truncate">No published construction window — overlap unknown</span>
        </div>
      )}
      {shown.map((g, i) => (
        <WindowBar key={g.ws[0].id} ws={g.ws} sourceIds={g.sourceIds} color={color} d={d} top={shown.length === 1 ? 0 : i * (half + 2)} height={shown.length === 1 ? bar : half} owner={ownerNames(p, IDX, true)} />
      ))}
      <Lane p={p} lane={lane} d={d} top={bar} color={color} st={st} />
    </div>
  );
}

function WindowBar({ ws, sourceIds, color, d, top, height, owner }: { ws: ConstructionWindow[]; sourceIds: string[]; color: string; d: Domain; top: number; height: number; owner: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const first = ws.reduce((x, y) => (y.start.earliest < x.start.earliest ? y : x));
  const last = ws.reduce((x, y) => (y.end.latest > x.end.latest ? y : x));
  const s0 = pct(first.start.earliest, d);
  const e1 = pct(last.end.latest, d);
  const w = Math.max(e1 - s0, 0.5);
  const credit = windowSourceText(ws, IDX);
  const docs = windowDocs(ws, sourceIds);
  const coarse = isCoarseGroup(ws);
  const bounds = ws.every((x) => x.boundsOnly);
  const open = ws.some((x) => x.openEnded);
  // the earliest start is only a floor ("spending before 2026"): no start year is shown
  const openStart = !!first.openStart || frac(first.start.earliest, d) < 0;
  // same text as the inspector row ("2028", "before 2026 → 2026"); an open end trails an arrow
  const label = `${windowGroupText(ws)}${open ? " →" : ""}`;
  const note = [ws.length > 1 && `${ws.length} components`, coarse && !open && (bounds ? "bounds only" : "coarse"), open && "end not published", first.openStart && "start not published"]
    .filter(Boolean)
    .map((x) => ` · ${x}`)
    .join("");
  const small = height < 16;
  const show = (el: HTMLElement) => setAnchor(el.getBoundingClientRect());
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      tabIndex={0}
      role="img"
      aria-label={`${owner} window ${label} · ${credit}${note}`}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(e.currentTarget)}
      onBlur={() => setAnchor(null)}
      className="absolute origin-left rounded-chip outline-offset-1"
      style={{ left: `${s0}%`, width: `${w}%`, top, height }}
    >
      <div
        className="absolute inset-0 rounded-chip"
        style={{
          background: coarse ? HATCH(color) : `color-mix(in oklab, ${color} 14%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} ${coarse ? 45 : 55}%, transparent)`,
          ...(openStart ? { maskImage: OPEN_START_FADE, WebkitMaskImage: OPEN_START_FADE } : {}),
        }}
      >
        {!coarse &&
          ws.map((x) => {
            // fuzzy edges: the start may fall anywhere in [start.earliest, start.latest], the end in [end.earliest, end.latest]
            const a0 = ((pct(x.start.earliest, d) - s0) / w) * 100;
            const a1 = ((pct(x.start.latest, d) - s0) / w) * 100;
            const b0 = ((pct(x.end.earliest, d) - s0) / w) * 100;
            const b1 = ((pct(x.end.latest, d) - s0) / w) * 100;
            const span = Math.max(b1 - a0, 0.5);
            const fl = ((a1 - a0) / span) * 100;
            const fr = ((b1 - b0) / span) * 100;
            return (
              <div
                key={x.id}
                className="absolute inset-y-0 rounded-[5px]"
                style={{
                  left: `${a0}%`,
                  width: `${span}%`,
                  background: `linear-gradient(90deg, color-mix(in oklab, ${color} 10%, transparent) 0%, color-mix(in oklab, ${color} 46%, transparent) ${Math.min(fl, 45)}%, color-mix(in oklab, ${color} 46%, transparent) ${100 - Math.min(fr, 45)}%, color-mix(in oklab, ${color} 10%, transparent) 100%)`,
                }}
              />
            );
          })}
      </div>
      <div className={clsx("relative flex h-full min-w-0 items-center overflow-hidden whitespace-nowrap text-label leading-none", small ? "px-1.5" : "px-2")}>
        {/* the source gives up its room before the date does */}
        <span className="num max-w-full shrink-0 truncate font-medium text-fg-1">{label}</span>
        <span className="ml-1.5 min-w-0 truncate text-fg-2">
          · {credit}
          {note}
        </span>
      </div>
      {anchor && (
        <FloatTip anchor={anchor}>
          <span className="flex flex-col gap-1">
            {docs.map((doc) => (
              <span key={doc} className="font-medium text-fg-1">
                {doc}
              </span>
            ))}
            <span className="text-fg-3">{credit}</span>
            <span className="mt-0.5 flex flex-col gap-1">
              {ws.map((x) => (
                <span key={x.id} className="flex flex-col">
                  <span>
                    <span className="num text-fg-1">{formatWindow(x.start, x.end, x.openEnded, x.openStart)}</span>
                    <span className="text-fg-3">
                      {" "}
                      · {x.start.label || x.end.label ? "season" : precisionLabel(coarsest([x]))} precision{x.openStart ? " · start not published" : ""}
                    </span>
                  </span>
                  {windowNote(x) && <span className="text-fg-3">{windowNote(x)}</span>}
                </span>
              ))}
            </span>
          </span>
        </FloatTip>
      )}
    </motion.div>
  );
}

/* ───────────────────────────────── lane: schedule line + completion claims ───────────────────────────────── */

/** Put each lane label right of its anchor, else left, else leave it to hover — never over a diamond or another label. */
function placeLabels(width: number, marks: number[], items: { key: string; lo: number; hi: number; w: number }[], blocked: [number, number][] = []) {
  const taken: [number, number][] = [...marks.map((x): [number, number] => [x - 6, x + 6]), ...blocked];
  const out = new Map<string, "l" | "r" | "c">();
  if (!width) return out;
  const free = ([a, b]: [number, number]) => a >= 0 && b <= width && taken.every(([x, y]) => b + 2 <= x || a - 2 >= y);
  for (const it of items) {
    const r: [number, number] = [it.hi + 8, it.hi + 8 + it.w];
    const l: [number, number] = [it.lo - 8 - it.w, it.lo - 8];
    const side = free(r) ? "r" : free(l) ? "l" : null;
    if (!side) continue;
    out.set(it.key, side);
    taken.push(side === "r" ? r : l);
  }
  return out;
}

/** Geist Mono glyph advance at the label size (7.2px at 11px; the desktop tiers use 12px). */
const charW = () => labelPx() * 0.655;
/** "completion dates disagree" with its icon, at the label size. */
const conflictLabelW = () => Math.ceil(labelPx() * 16);

export interface LaneModel {
  conflict: Conflict | undefined;
  /** a live disagreement (not just a newer edition moving the date) */
  disputed: boolean;
  /** the disagreeing current claims (earlier editions are version history, not a dispute) */
  live: CompletionClaim[];
  spread: boolean;
  current: CompletionClaim | undefined;
  dateText: string;
  labels: Map<string, "l" | "r" | "c">;
  /** a disagreement whose "completion dates disagree" label found no room in the lane (the caption says it instead) */
  conflictUnlabeled: boolean;
  mid: (c: CompletionClaim) => number;
}

/** Where each lane mark and label goes at this width (shared by the lane and the caption fallback). */
function laneModel(p: Project, m: Match, d: Domain, width: number): LaneModel {
  const conflict = m.conflicts.find((c) => c.projectId === p.id && c.field === "completion");
  const disputed = !!conflict && !conflict.versionOnly;
  const claims = p.completionClaims;
  const current = currentInService(p);
  const mid = (c: CompletionClaim) => (Math.max(0, Math.min(1, frac(c.date.earliest, d))) + Math.max(0, Math.min(1, frac(c.date.latest, d)))) / 2;
  const xs = claims.map((c) => mid(c) * width);
  const live = disputed ? claims.filter((c) => conflict!.claimIds.includes(c.id) && c.current !== false) : [];
  const liveXs = live.map((c) => mid(c) * width);
  const lo = Math.min(...liveXs);
  const hi = Math.max(...liveXs);
  const spread = liveXs.length > 1 && hi - lo > 10;
  const passed = current && current.date.latest < SNAP_ISO;
  const dateText = current ? `${formatBound(current.date)}${passed ? " · date passed" : ""}` : "";
  // the disagreement label rides on its own dashed link when the link is long enough, else beside it
  const c0 = (lo + hi) / 2;
  const CONFLICT_LABEL_W = conflictLabelW();
  const onLink = spread && hi - lo >= CONFLICT_LABEL_W + 20 && xs.every((x) => x < c0 - CONFLICT_LABEL_W / 2 - 6 || x > c0 + CONFLICT_LABEL_W / 2 + 6);
  const onLinkSpan: [number, number][] = onLink ? [[(lo + hi) / 2 - CONFLICT_LABEL_W / 2, (lo + hi) / 2 + CONFLICT_LABEL_W / 2]] : [];
  const labels: Map<string, "l" | "r" | "c"> = placeLabels(
    width,
    xs,
    [
      ...(spread && !onLink ? [{ key: "conflict", lo, hi, w: CONFLICT_LABEL_W }] : []),
      ...(current ? [{ key: current.id, lo: mid(current) * width, hi: mid(current) * width, w: dateText.length * charW() + 4 }] : []),
    ],
    onLinkSpan,
  );
  if (onLink) labels.set("conflict", "c");
  return { conflict, disputed, live, spread, current, dateText, labels, conflictUnlabeled: disputed && !labels.has("conflict"), mid };
}

function Lane({ p, lane, d, top, color, st }: { p: Project; lane: LaneModel; d: Domain; top: number; color: string; st: OverlapStatement }) {
  const highlightConflict = useAtlas((s) => s.highlightConflict);
  const focusConflict = useAtlas((s) => s.focusConflict);
  const { conflict, disputed, live, spread, current, dateText, labels, mid } = lane;
  const emphasize = highlightConflict && !!conflict && (!focusConflict || conflictMatches(conflict, focusConflict));
  const claims = p.completionClaims;
  const sched = scheduleWindows(p);
  return (
    <div className="absolute inset-x-0" style={{ top, height: LANE_H }}>
      {sched.map((w) => (
        <ScheduleLine key={w.id} w={w} d={d} color={color} />
      ))}
      {st.schedule && (
        <span
          aria-hidden
          className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-overlap"
          style={{ left: `${pct(st.schedule.start, d)}%`, width: `${Math.max(pct(st.schedule.end, d) - pct(st.schedule.start, d), 0.4)}%` }}
        />
      )}
      {disputed && spread && <ConflictLink xs={live.map(mid)} emphasize={emphasize} label={labels.get("conflict")} />}
      {claims.map((c) => (
        <ClaimMark
          key={c.id}
          c={c}
          d={d}
          p={p}
          tone={c.current === false ? "earlier" : disputed && live.includes(c) ? "disputed" : "current"}
          emphasize={emphasize && !!conflict?.claimIds.includes(c.id)}
          label={c.id === current?.id ? (labels.get(c.id) as "l" | "r" | undefined) : undefined}
          text={dateText}
        />
      ))}
    </div>
  );
}

function ScheduleLine({ w, d, color }: { w: ConstructionWindow; d: Domain; color: string }) {
  const x0 = Math.max(0, frac(w.start.earliest, d));
  const x0b = Math.max(0, frac(w.start.latest, d));
  const x1 = Math.min(1, frac(w.end.latest, d));
  if (x1 <= x0) return null;
  const span = x1 - x0;
  // a start the source gives as a range (or before the axis) fades in; the line ends at the in-service date
  const fade = w.openStart || frac(w.start.earliest, d) < 0 ? 30 : Math.min(45, ((x0b - x0) / span) * 100);
  const c = `color-mix(in oklab, ${color} 65%, transparent)`;
  return (
    <span
      aria-hidden
      className="absolute top-1/2 h-[1.5px] -translate-y-1/2 rounded-full"
      style={{ left: `${x0 * 100}%`, width: `${span * 100}%`, background: fade > 1 ? `linear-gradient(90deg, transparent, ${c} ${fade}%)` : c }}
    />
  );
}

function ConflictLink({ xs, emphasize, label }: { xs: number[]; emphasize: boolean; label?: "l" | "r" | "c" }) {
  const l = Math.min(...xs) * 100;
  const r = Math.max(...xs) * 100;
  return (
    <div className="pointer-events-none absolute inset-y-0 z-30" style={{ left: `${l}%`, width: `${r - l}%` }}>
      <div className={clsx("absolute inset-x-0 top-1/2 border-t border-dashed", emphasize ? "border-warn" : "border-warn/60")} />
      {label && (
        <div
          className={clsx(
            "absolute top-1/2 flex h-4 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-chip bg-surface-solid px-1.5 text-label leading-none text-warn",
            label === "r" ? "left-[calc(100%+8px)]" : label === "l" ? "right-[calc(100%+8px)]" : "left-1/2 -translate-x-1/2",
          )}
        >
          <AlertTriangle size={11} strokeWidth={2} aria-hidden /> completion dates disagree
        </div>
      )}
    </div>
  );
}

function ClaimMark({
  c,
  d,
  p,
  tone,
  emphasize,
  label,
  text,
}: {
  c: CompletionClaim;
  d: Domain;
  p: Project;
  tone: "current" | "earlier" | "disputed";
  emphasize: boolean;
  /** side the date label fits on; hidden (hover only) when it would collide */
  label?: "l" | "r";
  text: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const x0 = pct(c.date.earliest, d);
  const x1 = pct(c.date.latest, d);
  const src = IDX.source(c.claimSourceId);
  const col = tone === "disputed" ? "var(--warn)" : tone === "earlier" ? "var(--fg-3)" : "var(--fg-1)";
  const passed = c.current !== false && c.date.latest < SNAP_ISO;
  return (
    <div
      // a disagreement always paints above an agreeing claim at the same date, and both above earlier editions
      className={clsx("absolute inset-y-0", anchor ? "z-40" : tone === "disputed" ? "z-30" : tone === "current" ? "z-20" : "z-10")}
      style={{ left: `${x0}%`, width: `${Math.max(x1 - x0, 0.4)}%` }}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      {/* a coarse claim ("2028") spans its whole period: a faint range under the diamond */}
      {tone !== "earlier" && x1 - x0 > 0.8 && <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: col, opacity: 0.3 }} />}
      <div
        className={clsx("absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border-[1.5px] transition-transform duration-200", emphasize && "scale-150")}
        style={{
          borderColor: col,
          background: tone === "earlier" ? "var(--surface-solid)" : col,
          boxShadow: emphasize ? `0 0 0 3px color-mix(in oklab, ${col} 25%, transparent)` : "0 0 0 2px var(--surface-solid)",
        }}
      />
      {/* a wider invisible hit area than the 8px diamond */}
      <span aria-hidden className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2" />
      {label && (
        <div
          className={clsx(
            "num pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-chip bg-surface-solid/80 px-0.5 text-label leading-none",
            label === "r" ? "left-[calc(50%+8px)]" : "right-[calc(50%+8px)]",
          )}
          style={{ color: tone === "disputed" ? "var(--warn)" : "var(--fg-2)" }}
        >
          {text}
        </div>
      )}
      {anchor && (
        <FloatTip anchor={anchor} maxWidth={280}>
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-fg-1">
              {c.label[0].toUpperCase() + c.label.slice(1)} · <span className="num">{formatBound(c.date)}</span>
            </span>
            {c.current === false && <span className="text-fg-2">Superseded by a newer source</span>}
            {tone === "disputed" && <span className="text-warn">Sources disagree on this date; every claim is kept</span>}
            {passed && <span className="text-fg-2">Date passed · planned date passed; completion not confirmed</span>}
            <span className="text-fg-3">{src?.publisher}</span>
            <span className="mt-1 text-fg-3">
              {endsWindow(p, c)
                ? "This date also falls within the end of a current schedule window used for the TIME match."
                : c.current === false
                  ? "Earlier edition: kept as version history, not used for TIME."
                  : "Not used as a schedule-window bound."}
            </span>
          </span>
        </FloatTip>
      )}
    </div>
  );
}
