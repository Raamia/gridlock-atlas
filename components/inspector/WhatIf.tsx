"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { IDX } from "@/lib/data";
import type { ConstructionWindow, Match, Project } from "@/lib/domain/types";
import { formatWindow } from "@/lib/format";
import { useWidth } from "@/lib/hooks";
import { displayWindowGroups, scheduleWindows } from "@/lib/matching/time";
import { ownerNames, windowGroupText } from "@/lib/selectors";
import { canMove, MAX_SHIFT_MONTHS, shiftLabel, whatIf, whatIfDomain, whatIfImpact, type WhatIfImpact, type WhatIfMove, type WhatIfResult, type WhatIfSide } from "@/lib/whatif";
import { Axis } from "../timeline/InServiceStrip";
import { frac, isCoarseGroup, pct, SNAP_ISO, years, type Domain } from "../timeline/model";
import { Button, ROLE_COLOR, Segmented, SignalFact, signalState, Tooltip, UtilityDot } from "../ui";

/*
 * "Schedule what-if" (end of "When they build"): move one project's published schedule by whole months and read what the
 * engine says then. Every number comes from lib/whatif (the engine re-run on shifted dates) or from an existing cited impact
 * channel; nothing here adds, weighs or prices anything. State is local and starts "as planned" for each pair (keyed by the
 * pair at the mount point).
 *
 * The mini Gantt uses the pair Gantt's encoding at a smaller size: a tinted bar per source's window group (hatched = bounds or
 * budget years only; a start the source leaves open fades in), the published schedule as a thin line under it, amber where the
 * windows may overlap (hatched) or the schedules certainly do (solid line), the moved project's published position as a dashed
 * outline, and the dashed Snapshot marker (never "Today").
 */

const HATCH = (c: string, a = 30, b = 12) => `repeating-linear-gradient(135deg, color-mix(in oklab, ${c} ${a}%, transparent) 0 4px, color-mix(in oklab, ${c} ${b}%, transparent) 4px 8px)`;
const BAND_HATCH = "repeating-linear-gradient(135deg, color-mix(in oklab, var(--overlap) 20%, transparent) 0 5px, color-mix(in oklab, var(--overlap) 5%, transparent) 5px 10px)";
const OPEN_START_FADE = "linear-gradient(90deg, transparent 0, black 22%)";
/** Bar area and the schedule lane under it, per row (px). */
const BAR_H = 18;
const LANE_H = 8;
/** Position of a range value under the native thumb (16px). */
const at = (v: number) => `calc(8px + (100% - 16px) * ${(v + MAX_SHIFT_MONTHS) / (2 * MAX_SHIFT_MONTHS)})`;
const SLIDE = "transition-[left,width] duration-200 ease-enter motion-reduce:transition-none";

export function WhatIf({ m }: { m: Match }) {
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  // the project that can move (A first); a pair where neither can still shows why
  const [move, setMove] = useState<WhatIfMove>(() => (canMove(a) || !canMove(b) ? "a" : "b"));
  const [months, setMonths] = useState(0);
  const r = useMemo(() => whatIf(m, move, months), [m, move, months]);
  const plan = useMemo(() => whatIf(m, move, 0), [m, move]);
  const impact = useMemo(() => whatIfImpact(r), [r]);
  const d = useMemo(() => whatIfDomain(m), [m]);
  const uid = useId();
  const moved = move === "a" ? a : b;
  const owner = (p: Project) => ownerNames(p, IDX, true);

  return (
    <div role="group" aria-labelledby={`${uid}-title`} data-testid="schedule-whatif" className="rounded-card bg-fill-1 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h4 id={`${uid}-title`} className="text-ui font-semibold text-fg-1">
          Schedule what-if
        </h4>
        <Segmented<WhatIfMove>
          variant="radiogroup"
          look="subtle"
          size="sm"
          label="Project to move"
          value={move}
          onChange={setMove}
          className="max-w-full"
          items={(
            [
              ["a", a],
              ["b", b],
            ] as const
          ).map(([k, p]) => ({ value: k, label: `Move ${owner(p)}`, icon: <UtilityDot utility={k} />, tooltip: p.shortTitle }))}
        />
      </div>

      {r.movable ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            {/* "as planned" tick, and the offset filled from it to the thumb (behind the translucent track) */}
            <span aria-hidden className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg-3" style={{ left: at(0) }} />
            {months !== 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-fg-2"
                style={{ left: months > 0 ? at(0) : at(months), width: `calc((100% - 16px) * ${Math.abs(months) / (2 * MAX_SHIFT_MONTHS)})` }}
              />
            )}
            <input
              id={`${uid}-months`}
              type="range"
              min={-MAX_SHIFT_MONTHS}
              max={MAX_SHIFT_MONTHS}
              step={1}
              value={months}
              aria-label="Months to move the project"
              aria-valuetext={`${shiftLabel(months)} · ${owner(moved)}`}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="range relative z-[1] block"
              style={{ "--range-fill": "0%" } as CSSProperties}
            />
          </div>
          <span aria-hidden data-testid="whatif-offset" className="num w-[8.5rem] shrink-0 text-right text-ui font-medium whitespace-nowrap text-fg-1">
            {shiftLabel(months)}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-caption text-pretty text-fg-3">
          <span className="font-medium text-fg-1">No published schedule to move.</span> {owner(moved)} publishes no construction window or schedule for{" "}
          {moved.shortTitle}; the what-if never invents one.
        </p>
      )}

      <MiniGantt r={r} d={d} />

      <div aria-live="polite" className="mt-3 space-y-1">
        <SignalFact kind="time" state={signalState(r.level)} mono={false} size="ui" wrap tooltip={r.reason} className="font-medium">
          <span data-testid="whatif-result">{r.statement}</span>
        </SignalFact>
        {r.detail && r.movable && <p className="text-caption text-pretty text-fg-2">{r.detail}</p>}
      </div>
      {r.months !== 0 && <p className="mt-1 text-caption text-pretty text-fg-3">As planned: {plan.statement}</p>}

      {impact && <ImpactLine i={impact} />}

      <p className="mt-3 text-caption text-pretty text-fg-3">A what-if, not a plan: it shifts a published schedule by whole months. Field-work dates are not published.</p>

      {r.months !== 0 && (
        <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden size={13} strokeWidth={1.75} />} onClick={() => setMonths(0)} className="mt-3">
          Reset to plan
        </Button>
      )}
    </div>
  );
}

/** The timing-dependent impact channel, in the Impact section's own words and value; only whether it is still listed changes. */
function ImpactLine({ i }: { i: WhatIfImpact }) {
  return (
    <div className="mt-3 border-t border-divider pt-3" data-testid="whatif-impact">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-caption font-medium text-pretty text-fg-1">{i.label}</p>
        {i.value && <span className="num shrink-0 text-caption text-fg-2">{i.value}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-3">
        <span className="num inline-flex h-[18px] items-center rounded-chip bg-fill-2 px-1.5 text-[11px] font-medium text-fg-2">{i.basis}</span>
        {i.dollars && <span>{i.dollars}</span>}
      </div>
      <p className="mt-1.5 text-caption text-pretty text-fg-3">
        <span className={clsx("font-medium", i.applies ? "text-fg-1" : "text-fg-2")}>{i.verdict[0].toUpperCase() + i.verdict.slice(1)}</span> — {i.why}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────── mini Gantt ─────────────────────────────────────────────── */

function MiniGantt({ r, d }: { r: WhatIfResult; d: Domain }) {
  const axisRef = useRef<HTMLDivElement>(null);
  const width = useWidth(axisRef);
  const st = r.st;
  const sides: [WhatIfSide, "a" | "b"][] = [
    [r.a, "a"],
    [r.b, "b"],
  ];
  const label = sides.map(([s, role]) => describeSide(s, role, r.months)).join(". ");
  return (
    <div className="mt-3" role="img" aria-label={`${label}. ${r.statement}.`}>
      <div ref={axisRef}>
        <Axis d={d} width={width} />
      </div>
      <div className="relative mt-1.5 space-y-2">
        {/* Jan 1 hairlines and the dashed Snapshot marker, behind both rows */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-1 bottom-0">
          {years(d).map((y) => (
            <span key={y} className="absolute inset-y-0 w-px bg-divider" style={{ left: `${pct(`${y}-01-01`, d)}%` }} />
          ))}
          <span className="absolute inset-y-0 z-[5] w-px border-l border-dashed border-fg-2/70" style={{ left: `${pct(SNAP_ISO, d)}%` }} />
        </span>
        {sides.map(([s, role]) => (
          <Row key={role} s={s} role={role} d={d} r={r} band={st.band} core={st.core} schedule={st.schedule} />
        ))}
      </div>
      {r.months !== 0 && (
        <p aria-hidden className="mt-2 flex items-center gap-2 text-caption text-fg-3">
          <span className="h-2 w-5 rounded-[3px] border border-dashed border-fg-2" /> as published
        </p>
      )}
    </div>
  );
}

function describeSide(s: WhatIfSide, role: "a" | "b", months: number): string {
  const groups = displayWindowGroups(s.project, (id) => IDX.source(id)?.publisher);
  const ws = groups.map((g) => windowGroupText(g.ws)).join(", ") || "no construction window published";
  const sched = scheduleWindows(s.project).map((w) => formatWindow(w.start, w.end, w.openEnded, w.openStart));
  return `${role.toUpperCase()} ${ownerNames(s.project, IDX, true)}${s.moved ? ` (${shiftLabel(months)})` : ""}: windows ${ws}${sched.length ? `; schedule ${sched.join(", ")}` : ""}`;
}

type Span = { start: string; end: string } | null;

function Row({ s, role, d, r, band, core, schedule }: { s: WhatIfSide; role: "a" | "b"; d: Domain; r: WhatIfResult; band: Span; core: Span; schedule: Span }) {
  const color = ROLE_COLOR[role];
  const publisher = (id: string) => IDX.source(id)?.publisher;
  const groups = displayWindowGroups(s.project, publisher).slice(0, 2);
  const before = s.moved ? displayWindowGroups(s.original, publisher).slice(0, 2) : [];
  const half = (BAR_H - 2) / 2;
  const top = (i: number, n: number) => (n === 1 ? 0 : i * (half + 2));
  const h = (n: number) => (n === 1 ? BAR_H : half);
  return (
    <div>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="num max-w-[45%] shrink-0 truncate text-label uppercase leading-none tracking-[0.06em]" style={{ color }}>
          {ownerNames(s.project, IDX, true)}
        </span>
        <span className="min-w-0 truncate text-caption text-fg-2" title={s.project.title}>
          {s.project.shortTitle}
        </span>
        {s.moved && <span className="ml-auto shrink-0 text-caption text-fg-3">{shiftLabel(r.months)}</span>}
      </div>
      <div className="relative mt-1" style={{ height: BAR_H + LANE_H }}>
        {band && (
          <span
            aria-hidden
            className={clsx("absolute rounded-[4px]", SLIDE)}
            style={{
              left: `${pct(band.start, d)}%`,
              width: `${Math.max(pct(band.end, d) - pct(band.start, d), 0.6)}%`,
              top: -2,
              height: BAR_H + 4,
              background: BAND_HATCH,
              boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--overlap) 45%, transparent)",
            }}
          />
        )}
        {core && (
          <span
            aria-hidden
            className={clsx("absolute rounded-[4px] bg-overlap-wash", SLIDE)}
            style={{ left: `${pct(core.start, d)}%`, width: `max(3px, ${pct(core.end, d) - pct(core.start, d)}%)`, top: -2, height: BAR_H + 4 }}
          />
        )}
        {groups.length === 0 && (
          <span className="absolute inset-x-0 top-0 flex items-center rounded-[4px] bg-fill-1 px-2 text-label leading-none text-fg-3" style={{ height: BAR_H }}>
            <span className="truncate">no construction window published</span>
          </span>
        )}
        {before.map((g, i) => (
          <Bar key={`was-${g.ws[0].id}`} ws={g.ws} d={d} color={color} top={top(i, before.length)} height={h(before.length)} outline />
        ))}
        {groups.map((g, i) => (
          <Bar key={g.ws[0].id} ws={g.ws} d={d} color={color} top={top(i, groups.length)} height={h(groups.length)} />
        ))}
        <div className="absolute inset-x-0" style={{ top: BAR_H, height: LANE_H }}>
          {s.moved && scheduleWindows(s.original).map((w) => <Schedule key={`was-${w.id}`} w={w} d={d} color={color} outline />)}
          {scheduleWindows(s.project).map((w) => (
            <Schedule key={w.id} w={w} d={d} color={color} />
          ))}
          {schedule && (
            <span
              aria-hidden
              className={clsx("absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-overlap", SLIDE)}
              style={{ left: `${pct(schedule.start, d)}%`, width: `${Math.max(pct(schedule.end, d) - pct(schedule.start, d), 0.4)}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** One source's window group: tinted (stated) or hatched (bounds / budget years only); `outline` = where it was published. */
function Bar({ ws, d, color, top, height, outline }: { ws: ConstructionWindow[]; d: Domain; color: string; top: number; height: number; outline?: boolean }) {
  const first = ws.reduce((x, y) => (y.start.earliest < x.start.earliest ? y : x));
  const last = ws.reduce((x, y) => (y.end.latest > x.end.latest ? y : x));
  const l = pct(first.start.earliest, d);
  const w = Math.max(pct(last.end.latest, d) - l, 0.5);
  const openStart = !!first.openStart || frac(first.start.earliest, d) < 0;
  const coarse = isCoarseGroup(ws);
  const text = windowGroupText(ws);
  // the card's Gantt is one labelled image (its aria-label lists every window): bars take hover tooltips, not tab stops
  const bar = (
    <span
      aria-hidden
      className={clsx("absolute block rounded-[4px] outline-offset-1", SLIDE, outline && "pointer-events-none z-[1] border border-dashed")}
      style={{
        left: `${l}%`,
        width: `${w}%`,
        top,
        height,
        ...(outline
          ? { borderColor: `color-mix(in oklab, ${color} 75%, transparent)` }
          : {
              background: coarse ? HATCH(color, 45, 18) : `color-mix(in oklab, ${color} 42%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 60%, transparent)`,
              ...(openStart ? { maskImage: OPEN_START_FADE, WebkitMaskImage: OPEN_START_FADE } : {}),
            }),
      }}
    />
  );
  if (outline) return bar;
  return (
    <Tooltip content={`${text}${coarse ? " · bounds only" : ""}${ws.some((x) => x.openEnded) ? " · end not published" : ""}${first.openStart ? " · start not published" : ""}`}>
      {bar}
    </Tooltip>
  );
}

/** A published schedule (start → in-service) as a thin line; a start the source leaves open fades in. */
function Schedule({ w, d, color, outline }: { w: ConstructionWindow; d: Domain; color: string; outline?: boolean }) {
  const x0 = Math.max(0, frac(w.start.earliest, d));
  const x0b = Math.max(0, frac(w.start.latest, d));
  const x1 = Math.min(1, frac(w.end.latest, d));
  if (x1 <= x0) return null;
  const span = x1 - x0;
  const style = { left: `${x0 * 100}%`, width: `${span * 100}%` };
  if (outline) return <span aria-hidden className={clsx("absolute top-1/2 -translate-y-1/2 border-t border-dashed", SLIDE)} style={{ ...style, borderColor: `color-mix(in oklab, ${color} 55%, transparent)` }} />;
  const fade = w.openStart || frac(w.start.earliest, d) < 0 ? 30 : Math.min(45, ((x0b - x0) / span) * 100);
  const c = `color-mix(in oklab, ${color} 70%, transparent)`;
  return (
    <span
      aria-hidden
      className={clsx("absolute top-1/2 h-[1.5px] -translate-y-1/2 rounded-full", SLIDE)}
      style={{ ...style, background: fade > 1 ? `linear-gradient(90deg, transparent, ${c} ${fade}%)` : c }}
    />
  );
}
