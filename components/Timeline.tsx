"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { CompletionClaim, ConstructionWindow, Match, Project } from "@/lib/domain/types";
import { formatBound, formatSpan, formatWindow, precisionLabel } from "@/lib/format";
import { usePreviewPair, useWidth } from "@/lib/hooks";
import { activeWindows, coarsest, dayCount, displayWindowGroups, endsWindow } from "@/lib/matching/time";
import { conflictMatches, ownerNames, windowGroupText, windowSourceText } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { windowDocs, windowNote } from "./ui";

const LABEL_W = 208;
/** Row = bars in the top BAR_H px, then a lane for completion claims so diamonds and dates never sit on bar text. */
const BAR_H = 34;
const LANE_H = 12;
/** A window whose start the source does not publish fades in from the left instead of showing a hard start. */
const OPEN_START_FADE = "linear-gradient(90deg, transparent 0, #000 18%)";

/**
 * Hover card rendered on <body>: fixed, clamped to the viewport, and stacked above the inspector (z-40) but below
 * the brief (z-50) and the guided demo card (z-[60]), so it is never hidden under a panel or cut off at the edge.
 */
function FloatingTip({ anchor, width, align, children }: { anchor: DOMRect; width: number; align: "start" | "center"; children: ReactNode }) {
  const M = 8;
  const raw = align === "start" ? anchor.left : anchor.left + anchor.width / 2 - width / 2;
  const left = Math.max(M, Math.min(raw, window.innerWidth - width - M));
  return createPortal(
    <div
      role="tooltip"
      className="glass glass-solid pointer-events-none fixed z-[45] rounded-lg p-2.5 text-[11.5px]"
      style={{ left, width: Math.min(width, window.innerWidth - 2 * M), bottom: window.innerHeight - anchor.top + 8 }}
    >
      {children}
    </div>,
    document.body,
  );
}

function useDomain() {
  return useMemo(() => {
    const dates: string[] = [SNAPSHOT.snapshotDate];
    for (const p of SNAPSHOT.projects) {
      for (const w of p.constructionWindows) dates.push(w.start.earliest, w.end.latest);
      for (const c of p.completionClaims) dates.push(c.date.earliest, c.date.latest);
    }
    const years = dates.map((d) => Number(d.slice(0, 4))).filter((y) => y > 2000 && y < 2050);
    const snapYear = Number(SNAPSHOT.snapshotDate.slice(0, 4));
    const y0 = Math.max(Math.min(...years), snapYear - 3);
    const y1 = Math.min(Math.max(...years), snapYear + 8);
    return { y0, y1: y1 + 1 };
  }, []);
}

function pct(iso: string, y0: number, y1: number) {
  const d = new Date(iso + "T00:00:00Z").getTime();
  const a = Date.UTC(y0, 0, 1);
  const b = Date.UTC(y1, 0, 1);
  return Math.max(0, Math.min(100, ((d - a) / (b - a)) * 100));
}

function pairDomain(a: Project, b: Project, full: { y0: number; y1: number }) {
  const ys: number[] = [Number(SNAPSHOT.snapshotDate.slice(0, 4))];
  for (const p of [a, b]) {
    for (const w of activeWindows(p)) ys.push(Number(w.start.earliest.slice(0, 4)), Number(w.end.latest.slice(0, 4)));
    for (const c of p.completionClaims) ys.push(Number(c.date.earliest.slice(0, 4)), Number(c.date.latest.slice(0, 4)));
  }
  const lo = Math.max(full.y0, Math.min(...ys) - 1);
  const hi = Math.min(full.y1, Math.max(...ys) + 2);
  return hi - lo >= 4 ? { y0: lo, y1: hi } : { y0: lo, y1: lo + 4 };
}

export function Timeline() {
  const preview = usePreviewPair();
  const full = useDomain();
  const { y0, y1 } = preview ? pairDomain(preview.a, preview.b, full) : full;
  const years = Array.from({ length: y1 - y0 }, (_, i) => y0 + i);
  const today = pct(SNAPSHOT.snapshotDate, y0, y1);

  return (
    <section aria-label="Construction timeline" className="relative hidden h-[184px] shrink-0 border-t border-line bg-bg-1 lg:block">
      <div className="flex h-8 items-center justify-between px-4">
        <div className="eyebrow whitespace-nowrap">Construction windows · from sources</div>
        <div className="hidden items-center gap-4 text-[10.5px] text-text-3 xl:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm bg-text-2/70" /> stated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm" style={{ background: "linear-gradient(90deg, transparent, rgba(193,203,224,.7))" }} /> date precision (fuzzy)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm" style={{ background: "repeating-linear-gradient(135deg, rgba(193,203,224,.45) 0 3px, rgba(193,203,224,.12) 3px 6px)" }} /> bounds / budget years only
          </span>
          <span className="flex items-center gap-1.5">
            <span className="block h-2.5 w-2.5 rotate-45 border border-text-2" /> completion claim
          </span>
        </div>
      </div>
      <div className="relative mx-4 h-[140px]">
        {/* axis */}
        <div className="absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
          {years.map((y) => {
            const x = pct(`${y}-01-01`, y0, y1);
            return (
              <div key={y} className="absolute inset-y-0" style={{ left: `${x}%` }}>
                <div className="absolute inset-y-0 w-px bg-line" />
                <div className="mono absolute -top-0.5 left-1.5 text-[10px] text-text-3">{y}</div>
              </div>
            );
          })}
          <div className="absolute inset-y-0 z-20" style={{ left: `${today}%` }}>
            <div className="absolute inset-y-0 w-px border-l border-dashed border-text-1/60" />
            <div className="mono absolute right-1 top-[13px] whitespace-nowrap rounded bg-bg-1/90 px-1 text-[10px] text-text-1">Snapshot</div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-4">
          <AnimatePresence mode="wait" initial={false}>
            {preview ? (
              <motion.div key={preview.match.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                <PairTimeline m={preview.match} a={preview.a} b={preview.b} y0={y0} y1={y1} />
              </motion.div>
            ) : (
              <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                <OverviewTimeline y0={y0} y1={y1} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- pair ---------------------------------- */

function PairTimeline({ m, a, b, y0, y1 }: { m: Match; a: Project; b: Project; y0: number; y1: number }) {
  const highlightConflict = useAtlas((s) => s.highlightConflict);
  const focusConflict = useAtlas((s) => s.focusConflict);
  const o = m.timeDetail.possibleOverlap;
  const core = m.timeDetail.confirmedOverlap;
  const confirmed = m.time === "confirmed";
  const rows: [Project, "a" | "b"][] = [
    [a, "a"],
    [b, "b"],
  ];

  return (
    <div className="relative h-full">
      {o && (m.time === "confirmed" || m.time === "possible") && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-0" style={{ left: LABEL_W }}>
          <motion.div
            initial={{ opacity: 0, scaleX: 0.6 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 origin-center rounded-md"
            style={{
              left: `${pct(o.start, y0, y1)}%`,
              width: `${pct(o.end, y0, y1) - pct(o.start, y0, y1)}%`,
              background: "repeating-linear-gradient(135deg, rgba(251,191,36,.09) 0 6px, transparent 6px 12px)",
              boxShadow: "inset 0 0 0 1px rgba(251,191,36,.3)",
            }}
          />
          {confirmed && core && (
            <div
              className="absolute inset-y-0 rounded-sm"
              title="Span every source combination guarantees"
              style={{
                left: `${pct(core.start, y0, y1)}%`,
                width: `max(3px, ${pct(core.end, y0, y1) - pct(core.start, y0, y1)}%)`,
                background: "linear-gradient(180deg, rgba(251,191,36,.28), rgba(251,191,36,.12))",
                boxShadow: "inset 0 0 0 1px rgba(251,191,36,.6)",
              }}
            />
          )}
        </div>
      )}
      <div className="relative z-10 flex h-full flex-col gap-1 pt-3">
        {rows.map(([p, role]) => {
          const conflict = m.conflicts.find((c) => c.projectId === p.id && c.field === "completion");
          const emphasize = highlightConflict && !!conflict && (!focusConflict || conflictMatches(conflict, focusConflict));
          return <PairRow key={p.id} p={p} role={role} y0={y0} y1={y1} m={m} emphasize={emphasize} />;
        })}
      </div>
      {m.timeDetail.inService && !(o && (m.time === "confirmed" || m.time === "possible")) && <InServiceGap m={m} y0={y0} y1={y1} />}
      {o && (m.time === "confirmed" || m.time === "possible") && (
        <div className="pointer-events-none absolute bottom-0 right-0 z-20" style={{ left: LABEL_W }}>
          <div
            className="absolute bottom-0 flex justify-center"
            style={{ left: `${pct(o.start, y0, y1)}%`, width: `${pct(o.end, y0, y1) - pct(o.start, y0, y1)}%` }}
          >
            <span className="mono whitespace-nowrap rounded-t-md bg-bg-1 px-1.5 pt-0.5 text-[10px] text-amber">
              {confirmed ? `Overlap guaranteed in ${formatSpan(core ?? o, m.timeDetail.precision)} · possible ${formatSpan(o, m.timeDetail.precision)}` : `Possible overlap ${formatSpan(o, m.timeDetail.precision)}`} ·{" "}
              {precisionLabel(m.timeDetail.precision)} precision
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function InServiceGap({ m, y0, y1 }: { m: Match; y0: number; y1: number }) {
  const g = m.timeDetail.inService!;
  const xa = pct(g.a, y0, y1);
  const xb = pct(g.b, y0, y1);
  const l = Math.min(xa, xb);
  const r = Math.max(xa, xb);
  return (
    <div className="pointer-events-none absolute bottom-0 right-0 z-20 h-3" style={{ left: LABEL_W }}>
      <div className="absolute bottom-1 border-t border-dashed border-text-2/70" style={{ left: `${l}%`, width: `${Math.max(r - l, 0.3)}%` }} />
      <div className="absolute bottom-0 h-2 w-px bg-a" style={{ left: `${xa}%` }} />
      <div className="absolute bottom-0 h-2 w-px bg-b" style={{ left: `${xb}%` }} />
      <div className="absolute bottom-0.5 flex justify-center" style={{ left: `${l}%`, width: `${Math.max(r - l, 0.3)}%` }}>
        <span className="mono translate-y-1/2 whitespace-nowrap rounded bg-bg-1 px-1.5 text-[10px] text-text-1">
          {g.coarse && g.gapDays === 0
            ? "In-service ranges overlap at stated precision"
            : `Δ ${g.coarse ? "≥" : ""}${dayCount(g.gapDays)} between in-service dates`}
        </span>
      </div>
    </div>
  );
}

/** Put each lane label right of its anchor, else left, else leave it to hover — never over a diamond or another label. */
function placeLabels(width: number, marks: number[], items: { key: string; lo: number; hi: number; w: number }[]) {
  const taken: [number, number][] = marks.map((x) => [x - 6, x + 6]);
  const out = new Map<string, "l" | "r">();
  if (!width) return out;
  const free = ([a, b]: [number, number]) => a >= 0 && b <= width && taken.every(([x, y]) => b + 2 <= x || a - 2 >= y);
  for (const it of items) {
    const r: [number, number] = [it.hi + 9, it.hi + 9 + it.w];
    const l: [number, number] = [it.lo - 9 - it.w, it.lo - 9];
    const side = free(r) ? "r" : free(l) ? "l" : null;
    if (!side) continue;
    out.set(it.key, side);
    taken.push(side === "r" ? r : l);
  }
  return out;
}

function PairRow({ p, role, y0, y1, m, emphasize }: { p: Project; role: "a" | "b"; y0: number; y1: number; m: Match; emphasize: boolean }) {
  const color = role === "a" ? "var(--a)" : "var(--b)";
  const track = useRef<HTMLDivElement>(null);
  const width = useWidth(track);
  // two documents from one publisher with the same window read as one bar (same grouping as the inspector)
  const groups = displayWindowGroups(p, (id) => IDX.source(id)?.publisher);
  const conflict = m.conflicts.find((c) => c.projectId === p.id && c.field === "completion");
  const claims = p.completionClaims;
  const xs = claims.map((c) => ((pct(c.date.earliest, y0, y1) + pct(c.date.latest, y0, y1)) / 200) * width);
  const disputed = xs.filter((_, i) => conflict?.claimIds.includes(claims[i].id));
  const labels = placeLabels(width, xs, [
    ...(disputed.length > 1 ? [{ key: "conflict", lo: Math.min(...disputed), hi: Math.max(...disputed), w: 150 }] : []),
    ...(claims[0] ? [{ key: claims[0].id, lo: xs[0], hi: xs[0], w: formatBound(claims[0].date).length * 5.8 + 6 }] : []),
  ]);
  const more = groups.length - 2;
  return (
    <div className="flex items-start">
      <div className="flex shrink-0 items-center gap-2 pr-3" style={{ width: LABEL_W, height: BAR_H }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-text-0">{p.shortTitle}</div>
          <div className="truncate text-[10.5px] text-text-2">
            {ownerNames(p, IDX, true)}
            {more > 0 && <span className="text-text-3"> · +{more} more source{more > 1 ? "s" : ""}</span>}
          </div>
        </div>
      </div>
      <div ref={track} className="relative flex-1" style={{ height: BAR_H + LANE_H }}>
        {groups.length === 0 && (
          <div className="absolute inset-x-0 top-1 flex h-[26px] items-center rounded-md border border-dashed border-line-2 px-2 text-[10.5px] text-text-3">
            No published construction window — overlap unknown
          </div>
        )}
        {groups.slice(0, 2).map((g, i) => (
          <WindowBar key={g.ws[0].id} ws={g.ws} sourceIds={g.sourceIds} color={color} y0={y0} y1={y1} top={groups.length === 1 ? 7 : 1 + i * 17} height={groups.length === 1 ? 20 : 14} />
        ))}
        {conflict && <ConflictLink p={p} claimIds={conflict.claimIds} y0={y0} y1={y1} emphasize={emphasize} label={labels.get("conflict")} />}
        {claims.map((c) => (
          <CompletionMark
            key={c.id}
            c={c}
            y0={y0}
            y1={y1}
            conflicted={!!conflict?.claimIds.includes(c.id)}
            boundsWindow={endsWindow(p, c)}
            emphasize={emphasize}
            label={labels.get(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function WindowBar({ ws, sourceIds, color, y0, y1, top, height }: { ws: ConstructionWindow[]; sourceIds: string[]; color: string; y0: number; y1: number; top: number; height: number }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const first = ws.reduce((x, y) => (y.start.earliest < x.start.earliest ? y : x));
  const last = ws.reduce((x, y) => (y.end.latest > x.end.latest ? y : x));
  const s0 = pct(first.start.earliest, y0, y1);
  const e1 = pct(last.end.latest, y0, y1);
  const width = Math.max(e1 - s0, 0.4);
  const credit = windowSourceText(ws, IDX);
  const docs = windowDocs(ws, sourceIds);
  const coarse = ws.some((w) => !w.continuous || w.boundsOnly);
  const bounds = ws.every((w) => w.boundsOnly);
  const open = ws.some((w) => w.openEnded);
  // the earliest start is only a floor ("spending before 2026"): no start year is shown
  const openStart = !!first.openStart;
  // same text as the inspector row ("2028", "before 2026 → 2026"); an open end trails an arrow
  const label = `${windowGroupText(ws)}${open ? " →" : ""}`;
  const note = [ws.length > 1 && `${ws.length} components`, coarse && !open && (bounds ? "bounds only" : "coarse"), open && "end not published", openStart && "start not published"]
    .filter(Boolean)
    .map((x) => ` · ${x}`)
    .join("");
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
      className="absolute origin-left"
      style={{ left: `${s0}%`, width: `${width}%`, top, height }}
    >
      <div
        className="absolute inset-0 rounded-[5px]"
        style={{
          background: coarse
            ? `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 30%, transparent) 0 5px, color-mix(in oklab, ${color} 14%, transparent) 5px 10px)`
            : `color-mix(in oklab, ${color} 16%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 55%, transparent)`,
          ...(openStart ? { maskImage: OPEN_START_FADE, WebkitMaskImage: OPEN_START_FADE } : {}),
        }}
      >
        {!coarse &&
          ws.map((w) => {
            const a0 = ((pct(w.start.earliest, y0, y1) - s0) / width) * 100;
            const a1 = ((pct(w.start.latest, y0, y1) - s0) / width) * 100;
            const b0 = ((pct(w.end.earliest, y0, y1) - s0) / width) * 100;
            const b1 = ((pct(w.end.latest, y0, y1) - s0) / width) * 100;
            const span = Math.max(b1 - a0, 0.5);
            const fl = ((a1 - a0) / span) * 100;
            const fr = ((b1 - b0) / span) * 100;
            return (
              <div
                key={w.id}
                className="absolute inset-y-0 rounded-[4px]"
                style={{
                  left: `${a0}%`,
                  width: `${span}%`,
                  background: `linear-gradient(90deg, color-mix(in oklab, ${color} 12%, transparent) 0%, color-mix(in oklab, ${color} 52%, transparent) ${Math.min(fl, 45)}%, color-mix(in oklab, ${color} 52%, transparent) ${100 - Math.min(fr, 45)}%, color-mix(in oklab, ${color} 12%, transparent) 100%)`,
                }}
              />
            );
          })}
      </div>
      <div className="mono relative flex h-full min-w-0 items-center overflow-hidden whitespace-nowrap px-2 text-[10px] font-medium text-text-0">
        {/* the source gives up its room before the date does; the date truncates only when it alone overflows the bar */}
        <span className="max-w-full shrink-0 truncate">{label}</span>
        <span className="ml-1.5 min-w-0 truncate font-normal text-text-1/80">
          · {credit}
          {note}
        </span>
      </div>
      {anchor && (
        <FloatingTip anchor={anchor} width={320} align="start">
          {docs.map((d) => (
            <div key={d} className="font-medium text-text-0">
              {d}
            </div>
          ))}
          <div className="text-text-2">{credit}</div>
          <ul className="mt-1.5 space-y-1">
            {ws.map((w) => (
              <li key={w.id} className="text-text-2">
                <span className="num text-text-0">{formatWindow(w.start, w.end, w.openEnded, w.openStart)}</span>
                <span className="text-text-3">
                  {" "}
                  · {precisionLabel(coarsest([w]))} precision{w.openStart ? " · start not published" : ""}
                </span>
                {windowNote(w) && <div className="text-[10.5px] leading-snug text-text-3">{windowNote(w)}</div>}
              </li>
            ))}
          </ul>
        </FloatingTip>
      )}
    </motion.div>
  );
}

function CompletionMark({
  c,
  y0,
  y1,
  conflicted,
  boundsWindow,
  emphasize,
  label,
}: {
  c: CompletionClaim;
  y0: number;
  y1: number;
  conflicted: boolean;
  /** the date also ends a current schedule window used for the TIME match (endsWindow) */
  boundsWindow: boolean;
  emphasize: boolean;
  /** side the date label fits on; hidden (hover only) when it would collide */
  label?: "l" | "r";
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const hover = !!anchor;
  const x0 = pct(c.date.earliest, y0, y1);
  const x1 = pct(c.date.latest, y0, y1);
  const src = IDX.source(c.claimSourceId);
  const tone = conflicted ? "var(--conflict)" : "var(--text-1)";
  // an unlabeled diamond shows its date in the hover tip only, so it never lands on neighbouring text
  const side = label ?? null;
  return (
    <div
      className={clsx("absolute", hover ? "z-40" : "z-20")}
      style={{ left: `${x0}%`, width: `${Math.max(x1 - x0, 0.4)}%`, top: BAR_H, height: LANE_H }}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: tone, opacity: 0.6 }} />
      <div
        className={clsx("absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-[1.5px] bg-bg-1 transition-transform", conflicted && emphasize && "scale-150")}
        style={{ borderColor: tone, boxShadow: conflicted && emphasize ? "0 0 12px var(--conflict)" : undefined }}
      />
      {side && (
        <div
          className={clsx(
            "mono pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-bg-1/85 px-0.5 text-[9.5px] leading-none",
            side === "r" ? "left-[calc(50%+9px)]" : "right-[calc(50%+9px)]",
          )}
          style={{ color: tone }}
        >
          {formatBound(c.date)}
        </div>
      )}
      {anchor && (
        <FloatingTip anchor={anchor} width={260} align="center">
          <div className="font-medium text-text-0">
            {c.label[0].toUpperCase() + c.label.slice(1)} · {formatBound(c.date)}
          </div>
          {c.current === false && <div className="text-[10.5px] text-conflict">Superseded by a newer source</div>}
          <div className="text-text-2">{src?.publisher}</div>
          <div className="mt-1 text-text-3">
            {boundsWindow
              ? "This date is also the end of a current schedule window used for the TIME match."
              : c.current === false
                ? "Earlier edition: kept as version history, not used for TIME."
                : "Not used as a schedule-window bound."}
          </div>
        </FloatingTip>
      )}
    </div>
  );
}

function ConflictLink({ p, claimIds, y0, y1, emphasize, label }: { p: Project; claimIds: string[]; y0: number; y1: number; emphasize: boolean; label?: "l" | "r" }) {
  const claims = p.completionClaims.filter((c) => claimIds.includes(c.id));
  if (claims.length < 2) return null;
  const xs = claims.map((c) => (pct(c.date.earliest, y0, y1) + pct(c.date.latest, y0, y1)) / 2);
  const l = Math.min(...xs);
  const r = Math.max(...xs);
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: `${l}%`, width: `${r - l}%`, top: BAR_H, height: LANE_H }}>
      <div className={clsx("absolute inset-x-0 top-1/2 border-t border-dashed", emphasize ? "border-conflict" : "border-conflict/60")} />
      {label && (
        <div
          className={clsx(
            "absolute top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded bg-bg-1/85 px-1 text-[9.5px] leading-none text-conflict",
            label === "r" ? "left-[calc(100%+9px)]" : "right-[calc(100%+9px)]",
          )}
        >
          <AlertTriangle size={9} /> completion dates disagree
        </div>
      )}
    </div>
  );
}

/* -------------------------------- overview -------------------------------- */

function OverviewTimeline({ y0, y1 }: { y0: number; y1: number }) {
  const region = useAtlas((s) => s.region);
  const hovered = useAtlas((s) => s.hoveredProjectId);
  const run = useAtlas((s) => s.run);
  const set = useAtlas((s) => s.set);
  const projects = SNAPSHOT.projects
    .filter((p) => region === "all" || p.region === region)
    .filter((p) => !run || !run.excludedProjects.some((x) => x.projectId === p.id))
    .sort((a, b) => (activeWindows(a)[0]?.start.earliest ?? "9999").localeCompare(activeWindows(b)[0]?.start.earliest ?? "9999"));

  return (
    <div className="scroll-thin absolute inset-0 overflow-y-auto pb-1 pt-1">
      {projects.map((p) => {
        const ws = activeWindows(p);
        return (
          <div
            key={p.id}
            className={clsx("flex h-[17px] items-center rounded transition-colors", hovered === p.id && "bg-bg-3/70")}
            onMouseEnter={() => set({ hoveredProjectId: p.id })}
            onMouseLeave={() => set({ hoveredProjectId: null })}
          >
            <div className="truncate pr-3 text-[11px] text-text-2" style={{ width: LABEL_W }}>
              <span className={clsx(hovered === p.id && "text-text-0")}>{p.shortTitle}</span>
              <span className="text-text-3"> · {ownerNames(p, IDX, true)}</span>
            </div>
            <div className="relative h-full flex-1">
              {ws.map((w) => (
                <div
                  key={w.id}
                  className="absolute top-1/2 h-[7px] -translate-y-1/2 rounded-full"
                  style={{
                    left: `${pct(w.start.earliest, y0, y1)}%`,
                    width: `${pct(w.end.latest, y0, y1) - pct(w.start.earliest, y0, y1)}%`,
                    background: hovered === p.id ? "#eef3fc" : "linear-gradient(90deg, rgba(159,179,217,.25), rgba(159,179,217,.6) 30%, rgba(159,179,217,.6) 70%, rgba(159,179,217,.25))",
                    ...(w.openStart ? { maskImage: OPEN_START_FADE, WebkitMaskImage: OPEN_START_FADE } : {}),
                  }}
                />
              ))}
              {!ws.length && <div className="mono absolute left-1 top-1/2 -translate-y-1/2 text-[9.5px] text-text-3">no published construction window</div>}
              {p.completionClaims.map((c) => (
                <div
                  key={c.id}
                  className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-text-2 bg-bg-1"
                  style={{ left: `${pct(c.date.earliest, y0, y1) + (pct(c.date.latest, y0, y1) - pct(c.date.earliest, y0, y1)) / 2}%` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
