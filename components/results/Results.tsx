"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, Info, RotateCw, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import type { Match, ReviewStatus, SignalLevel } from "@/lib/domain/types";
import { firstNonEmptyTab, queueRank, regionMatches, REVIEW_TABS } from "@/lib/rank";
import { useReview, type PairReview } from "@/lib/review";
import { regionPairCounts } from "@/lib/selectors";
import { useViewport } from "@/lib/layout";
import { passesFilters, useAtlas, type SheetSnap } from "@/lib/store";
import { Button, Eyebrow, Segmented, Tooltip } from "../ui";
import { EmptyTab } from "./EmptyTab";
import { ExportMenu } from "./ExportMenu";
import { Filters, FocusChip, type FilterCounts } from "./Filters";
import { Footer, type Unflagged } from "./Footer";
import { PAIRS_LAYOUT_ID } from "./Hero";
import { fmt, headline, knownElsewhere, sperryTags, TAB_TOOLTIP, type Headline } from "./model";
import { RadiusControl } from "./RadiusControl";
import { Row } from "./Row";

const TAB_LABEL: Record<ReviewStatus, string> = { "needs-review": "Needs review", "known-coordination": "Known", possible: "Possible" };
export const LIST_ID = "opportunities-list";
/** Below this viewport height (1280×800, 1024×768 laptops) the rail's top block tightens so more rows show at rest. */
const COMPACT_BELOW_VH = 860;

/**
 * State C (SPEC §4 C): header row, headline, proof, review radius, status tabs, filters, focus, the ranked list
 * (role=list — the only one in the aside) and the footer. On phones: a status line + the top row fit the 132px peek;
 * the controls unfold at half / full.
 */
export function Results({ phone, snap, error }: { phone: boolean; snap: SheetSnap; error?: ReactNode }) {
  const [radiusOpen, setRadiusOpen] = useState(false);
  const run = useAtlas((s) => s.run)!;
  const running = useAtlas((s) => s.running);
  const region = useAtlas((s) => s.region);
  const storeTab = useAtlas((s) => s.tab);
  const timing = useAtlas((s) => s.timing);
  const conflictsOnly = useAtlas((s) => s.conflictsOnly);
  const utilityFilter = useAtlas((s) => s.utilityFilter);
  const focus = useAtlas((s) => s.focus);
  const flags = useAtlas((s) => s.flags);
  const set = useAtlas((s) => s.set);
  const setFocus = useAtlas((s) => s.setFocus);
  const setRegion = useAtlas((s) => s.setRegion);
  const setVisibleOrder = useAtlas((s) => s.setVisibleOrder);
  const reviewer = useReview((s) => s.enabled);
  const labels = useReview((s) => s.labels);
  // short laptop screens: the naive-rule line and the radius hint move into tooltips, the proof button takes one line
  const { vh } = useViewport();
  const compact = !phone && vh < COMPACT_BELOW_VH;

  // the retired "Conflicts" tab lives on as the "Dates revised or disputed" chip
  const tab: ReviewStatus = storeTab === "conflicts" ? firstNonEmptyTab(run, region) : storeTab;
  useEffect(() => {
    if (storeTab === "conflicts") set({ tab: firstNonEmptyTab(run, region), conflictsOnly: true });
  }, [storeTab, run, region, set]);

  const all = regionMatches(run, region);
  const ranks = queueRank(run, region);
  const sperry = sperryTags(run);
  const counts = useMemo(() => regionPairCounts(run, SNAPSHOT.projects, region), [run, region]);

  const view = useMemo(() => {
    const f = { region, timing, conflictsOnly, utilityFilter, focus, flags };
    const passing = all.filter((m) => passesFilters(m, f));
    const tabCounts = Object.fromEntries(REVIEW_TABS.map((t) => [t, passing.filter((m) => m.reviewStatus === t).length])) as Record<ReviewStatus, number>;
    const inTab = all.filter((m) => m.reviewStatus === tab);
    const rows = passing.filter((m) => m.reviewStatus === tab);
    // chip counts are tab-scoped facets: each counts with every other filter applied, but not itself
    const noTiming = inTab.filter((m) => passesFilters(m, { ...f, timing: [] }));
    const timingCounts = { confirmed: 0, possible: 0, unknown: 0, "no-match": 0 } as Record<SignalLevel, number>;
    for (const m of noTiming) timingCounts[m.time]++;
    const conflicts = inTab.filter((m) => m.conflicts.length > 0 && passesFilters(m, { ...f, conflictsOnly: false })).length;
    const repeats = new Map<string, number>();
    for (const m of inTab) for (const id of [m.projectAId, m.projectBId]) repeats.set(id, (repeats.get(id) ?? 0) + 1);
    return { tabCounts, inTab, rows, hidden: inTab.length - rows.length, filterCounts: { timing: timingCounts, conflicts } satisfies FilterCounts, repeats };
  }, [all, region, timing, conflictsOnly, utilityFilter, focus, flags, tab]);

  // J/K and the inspector's Pair above/below walk the list as shown
  useEffect(() => setVisibleOrder(view.rows.map((m) => m.id)), [view.rows, setVisibleOrder]);

  const utilities = useMemo(() => {
    const ids = new Set(SNAPSHOT.projects.filter((p) => region === "all" || p.region === region).flatMap((p) => p.owners.map((o) => o.utilityId)));
    if (utilityFilter) ids.add(utilityFilter);
    return [...ids].sort((a, b) => (IDX.utility(a)?.name ?? a).localeCompare(IDX.utility(b)?.name ?? b));
  }, [region, utilityFilter]);

  const head = useMemo(() => headline(run, region, counts.evaluated), [run, region, counts.evaluated]);
  const archived = run.excludedProjects.filter((x) => region === "all" || IDX.project(x.projectId)?.region === region).length;
  const unflagged: Unflagged = {
    notFlagged: Math.max(0, counts.evaluated - all.length),
    beyond: counts.beyond,
    unlocated: counts.unlocated,
    archived,
    radius: run.thresholdMiles,
    scope: region === "all" ? "" : " in this region",
  };
  const elsewhere = tab === "known-coordination" && view.tabCounts["known-coordination"] === 0 && view.hidden === 0 ? knownElsewhere(run, region) : null;
  const labeled = reviewer ? view.inTab.filter((m) => labels[m.id]).length : 0;
  const clearFilters = () => {
    set({ timing: [], conflictsOnly: false, utilityFilter: null });
    if (focus) setFocus(null);
  };

  const tabs = (
    <Segmented
      variant="tablist"
      label="Review status"
      look="subtle"
      fill
      size="sm"
      value={tab}
      onChange={(t) => set({ tab: t })}
      // tighter than the default sm padding: the three tabs (label + count) fit a 336px rail at the desktop type size
      items={REVIEW_TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: view.tabCounts[t], tooltip: TAB_TOOLTIP[t], controls: LIST_ID, className: "px-2!" }))}
    />
  );

  // T2, once per surface: timing on rows is schedule-based, never field work
  const endNote =
    view.rows.length > 0 ? (
      <p className="px-2 pt-3 pb-2 text-caption text-pretty text-fg-3">
        Timing shows published schedules (start → in-service) and construction windows; field-work dates are not published.
      </p>
    ) : null;

  const list = (
    <List
      key={`${region}|${tab}`}
      rows={view.rows}
      ranks={ranks}
      repeats={view.repeats}
      focusId={focus?.kind === "project" ? focus.id : undefined}
      sperry={sperry}
      labels={reviewer ? labels : null}
      endNote={endNote}
      empty={
        <EmptyTab
          tab={tab}
          hidden={view.hidden}
          onClear={clearFilters}
          elsewhere={elsewhere?.text}
          onShowElsewhere={
            elsewhere
              ? () => {
                  setRegion(elsewhere.region);
                  set({ tab: "known-coordination" });
                }
              : undefined
          }
        />
      }
    />
  );

  const header = <HeaderRow radius={run.thresholdMiles} running={running} />;
  const body = (
    <>
      <HeadlineBlock h={head} omitFlagged={phone} compact />
      <div className="mt-2">
        <button
          type="button"
          aria-expanded={radiusOpen}
          aria-controls="review-radius-control"
          onClick={() => setRadiusOpen((v) => !v)}
          className="group inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-caption font-medium text-fg-2 transition-colors hover:bg-fill-2 hover:text-fg-1"
        >
          <SlidersHorizontal aria-hidden size={13} strokeWidth={1.75} />
          Review radius <span className="num text-fg-1">{run.thresholdMiles} mi</span>
          <ChevronDown aria-hidden size={13} strokeWidth={1.75} className="transition-transform duration-200 group-aria-expanded:rotate-180" />
        </button>
        <div id="review-radius-control" className="grid transition-[grid-template-rows] duration-300 ease-enter" style={{ gridTemplateRows: radiusOpen ? "1fr" : "0fr" }}>
          <div className="min-h-0 overflow-hidden" inert={!radiusOpen || undefined}>
            <div className="pt-2">
              <RadiusControl compact={compact} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
  const controls = (
    <div className="space-y-2.5">
      {tabs}
      <Filters counts={view.filterCounts} utilities={utilities} />
      {focus && <FocusChip focus={focus} />}
      {reviewer && <LabeledMeter n={labeled} of={view.inTab.length} />}
    </div>
  );

  if (phone) {
    const peek = snap === "peek";
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => set({ sheetSnap: peek ? "half" : "peek" })}
          aria-expanded={!peek}
          aria-controls={LIST_ID}
          className="flex h-9 w-full shrink-0 items-center gap-2 px-(--panel-pad) text-left"
        >
          <span className="text-ui font-medium text-fg-1">
            <span className="num">{fmt(head.flagged)}</span> {head.flagged === 1 ? "pair" : "pairs"} flagged
          </span>
          <span aria-hidden className="text-fg-4">
            ·
          </span>
          <span className="truncate text-ui text-fg-2">
            {TAB_LABEL[tab]} <span className="num">{view.tabCounts[tab]}</span>
          </span>
          <ChevronUp aria-hidden size={16} strokeWidth={1.75} className={clsx("ml-auto shrink-0 text-fg-3 transition-transform duration-300", !peek && "rotate-180")} />
        </button>
        <div data-queue-scroll className={clsx("min-h-0 flex-1 overscroll-contain [overflow-anchor:none]", peek ? "overflow-hidden" : "scroll-thin overflow-y-auto")}>
          <div className="grid transition-[grid-template-rows] duration-(--dur-4) ease-enter" style={{ gridTemplateRows: peek ? "0fr" : "1fr" }}>
            <div className="min-h-0 overflow-hidden" inert={peek || undefined}>
              {header}
              <div className="px-(--panel-pad) pb-3">
                {error && <div className="mb-3 [&>[role=alert]]:mt-0">{error}</div>}
                {body}
                <div className="mt-4">{controls}</div>
              </div>
            </div>
          </div>
          <div className={clsx("px-1 pb-2", running && "opacity-60")} aria-busy={running || undefined}>
            {list}
          </div>
          {!peek && <Footer unflagged={unflagged} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div data-queue-scroll className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]">
        <div className="px-(--panel-pad)">
          {error && <div className="mb-3 [&>[role=alert]]:mt-0">{error}</div>}
          {body}
        </div>
        <StickyControls>{controls}</StickyControls>
        <div className={clsx("px-1 pt-1 pb-2 transition-opacity duration-200", running && "opacity-60")} aria-busy={running || undefined}>
          {list}
        </div>
      </div>
      <Footer unflagged={unflagged} keys />
    </div>
  );
}

/**
 * Eyebrow + the run's radius ("· 25 mi", tests read it) · Re-run · a labelled Export button. The row is a size
 * container (the rail is resizable): "Coordination" shows before "opportunities" once the full heading fits beside the
 * buttons (screen readers always hear it), and Re-run gains its visible label once there is room for that too.
 */
function HeaderRow({ radius, running }: { radius: number; running: boolean }) {
  const compare = useAtlas((s) => s.compare);
  const spin = <RotateCw size={14} strokeWidth={1.75} className={clsx(running && "animate-spin [animation-duration:900ms]")} />;
  return (
    <div className="@container flex h-11 shrink-0 items-center gap-1.5 pr-1.5 pl-(--panel-pad)">
      <Eyebrow as="h2" className="min-w-0 truncate tracking-[0.07em]">
        <span className="sr-only @min-[424px]:not-sr-only">Coordination </span>
        opportunities
      </Eyebrow>
      <span className="num shrink-0 text-caption whitespace-nowrap text-fg-3">· {radius} mi</span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <Tooltip content="Re-run the comparison at this radius" side="bottom">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Re-run comparison"
            aria-disabled={running || undefined}
            onClick={() => !running && void compare()}
            icon={spin}
            className="w-7 gap-1.5! px-0! @min-[488px]:w-auto @min-[488px]:px-2.5!"
          >
            <span className="hidden @min-[488px]:inline">Re-run</span>
          </Button>
        </Tooltip>
        <ExportMenu labelled />
      </span>
    </div>
  );
}

/**
 * "111 within Sperry's 25 miles" · "of 7,830 pairs checked · 123 pairs flagged · 12 possible, …" · the naive-rule line
 * (`compact`: behind an (i) at the end of the sub-line).
 */
function HeadlineBlock({ h, omitFlagged, compact }: { h: Headline; omitFlagged?: boolean; compact?: boolean }) {
  return (
    <div className="pt-0.5">
      <p className="flex items-baseline gap-2.5">
        <motion.span
          key={`${h.big}|${h.label}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          className="num text-display font-medium text-fg-1"
        >
          {fmt(h.big)}
        </motion.span>
        <span className="min-w-0 text-ui text-fg-2">{h.label}</span>
      </p>
      <p className="mt-1.5 text-caption text-fg-2">
        of{" "}
        <motion.span layoutId={PAIRS_LAYOUT_ID} className="num inline-block leading-none font-medium text-fg-1">
          {fmt(h.evaluated)}
        </motion.span>{" "}
        {h.evaluated === 1 ? "pair" : "pairs"} checked
        {!omitFlagged && (
          <>
            {" · "}
            <span className="font-medium text-fg-1">
              <span className="num">{fmt(h.flagged)}</span> {h.flagged === 1 ? "pair" : "pairs"} flagged
            </span>
          </>
        )}
        {h.rest.map((r) => (
          <span key={r}> · {r}</span>
        ))}
        {compact && h.naive && (
          <>
            {" "}
            <Tooltip content={h.naive} side="bottom" align="start">
              <button type="button" aria-label="Compared with a naive rule" className="-my-1 inline-grid size-5 translate-y-[3px] place-items-center rounded-full text-fg-3 transition-colors hover:text-fg-1 coarse:size-6">
                <Info aria-hidden size={13} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </>
        )}
      </p>
      {!compact && h.naive && <p className="mt-1 text-caption text-fg-3">{h.naive}</p>}
    </div>
  );
}

/** The tabs + filters stay in reach while the list scrolls; a hairline appears once they are stuck. */
function StickyControls({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    const root = el?.closest<HTMLElement>("[data-queue-scroll]");
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    // rows scrolled into view (J/K, a selection) land below the stuck controls, not under them
    const ro = new ResizeObserver(() => root.style.setProperty("--sticky-h", `${(box.current?.offsetHeight ?? 0) + 8}px`));
    if (box.current) ro.observe(box.current);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-3" />
      <div
        ref={box}
        className={clsx(
          "sticky top-0 z-10 px-(--panel-pad) pt-2 pb-2.5 transition-[box-shadow,background-color] duration-200",
          stuck ? "bg-surface-solid shadow-[0_1px_0_var(--divider)]" : "bg-transparent",
        )}
      >
        {children}
      </div>
    </>
  );
}

function LabeledMeter({ n, of }: { n: number; of: number }) {
  const pct = of ? Math.round((n / of) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 text-caption text-fg-3" title="Reviewer labels are saved in this browser">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-fill-2">
        <span className="block h-full rounded-full bg-ok/70 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0">
        <span className="num text-fg-2">{fmt(n)}</span> of <span className="num">{fmt(of)}</span> labeled
      </span>
    </div>
  );
}

/** Rows mounted at first; more mount as the end of the list nears (a 100-mile run has ~850 rows in one tab). */
const PAGE = 120;

function List({
  rows,
  ranks,
  repeats,
  focusId,
  sperry,
  labels,
  empty,
  endNote,
}: {
  rows: Match[];
  ranks: Map<string, number>;
  repeats: Map<string, number>;
  focusId?: string;
  sperry: ReturnType<typeof sperryTags>;
  labels: Record<string, PairReview> | null;
  empty: ReactNode;
  endNote: ReactNode;
}) {
  // rows present when this list first shows stagger in; rows a filter adds later just appear
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setFresh(false), 450);
    return () => window.clearTimeout(t);
  }, []);

  const [limit, setLimit] = useState(PAGE);
  const selected = useAtlas((s) => s.selectedMatchId);
  const selectedAt = selected ? rows.findIndex((m) => m.id === selected) : -1;
  // a selection further down (J/K, the map, a deep link) is always mounted, with a little room after it
  const shown = Math.min(rows.length, Math.max(limit, selectedAt + 20));
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { root: el.closest("[data-queue-scroll]"), rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <>
      <div role="list" id={LIST_ID} aria-label="Coordination opportunities" className="@container space-y-2">
        {rows.length === 0
          ? empty
          : rows.slice(0, shown).map((m, i) => (
              <Row
                key={m.id}
                m={m}
                rank={ranks.get(m.id) ?? i + 1}
                index={i}
                stagger={fresh}
                repeats={repeats}
                focusId={focusId}
                sperry={sperry.get(m.id)}
                label={labels?.[m.id]?.label}
              />
            ))}
      </div>
      {shown < rows.length ? <div ref={more} aria-hidden className="h-px" /> : endNote}
    </>
  );
}

