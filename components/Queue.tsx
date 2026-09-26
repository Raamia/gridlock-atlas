"use client";

import clsx from "clsx";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileSearch,
  MapPin,
  Play,
  RotateCw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import { displayTitle, geoShort, timeShort } from "@/lib/describe";
import type { Match, Project } from "@/lib/domain/types";
import { pluralize } from "@/lib/format";
import { overviewRole } from "@/lib/mapdata";
import { ownerNames, regionPairCounts } from "@/lib/selectors";
import { regionExports } from "@/lib/export";
import { download } from "@/lib/review";
import { inTab, useAtlas, type FlagFilter, type QueueTab } from "@/lib/store";
import { Button, Dot, Kbd } from "./ui";

const ALL_FLAGS: FlagFilter[] = ["BOTH", "GEO", "TIME", "POSSIBLE"];
/** The overview map's hues for each region's two focal utilities (MapStage u1/u2), so the plan lists double as its key. */
const FOCAL_HUE: Record<string, string | undefined> = {
  u1: "#69a8c8",
  u2: "#b088b6",
};

const TABS: { id: QueueTab; label: string; hint: string }[] = [
  {
    id: "needs-review",
    label: "Needs review",
    hint: "Cross-utility pairs whose resource coordination is not established in the reviewed sources",
  },
  {
    id: "known-coordination",
    label: "Known",
    hint: "Pairs with documented joint work or interface coordination",
  },
  {
    id: "conflicts",
    label: "Conflicts",
    hint: "Pairs where sources disagree on a date; both claims are kept",
  },
  {
    id: "possible",
    label: "Possible",
    hint: "Only coarse or possible signals",
  },
];

/** Pair totals for the region on screen (the run's own counts cover every region). */
function useRegionCounts() {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  return useMemo(
    () => (run ? regionPairCounts(run, SNAPSHOT.projects, region) : null),
    [run, region],
  );
}

export function Queue() {
  const run = useAtlas((s) => s.run);
  const running = useAtlas((s) => s.running);
  const runError = useAtlas((s) => s.runError);
  const region = useAtlas((s) => s.region);
  const counts = useRegionCounts();

  return (
    <aside
      className="relative flex min-h-0 flex-col border-r border-line bg-bg-1"
      aria-label="Coordination queue"
    >
      <div className="px-4 pb-2 pt-3 sm:pb-3 sm:pt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold text-text-0">
            Coordination queue
          </h2>
          {run && counts && (
            <span
              className="mono text-[12px] text-text-3"
              title={`Cross-utility pairs evaluated ${region === "all" ? "across all regions" : "in this region"}`}
            >
              {counts.evaluated.toLocaleString("en-US")}{" "}
              {counts.evaluated === 1 ? "pair" : "pairs"} · {run.thresholdMiles}{" "}
              mi
            </span>
          )}
        </div>
        <p className="mt-0.5 hidden text-[13px] text-text-2 sm:block">
          Cross-utility project pairs within the review radius or sharing a
          facility, ranked by place first, then timing.
        </p>
      </div>
      {runError && !running && (
        <EngineError message={runError} hasRun={!!run} />
      )}
      {running ? <Scanning /> : run ? <RunResults /> : <PreRun />}
    </aside>
  );
}

function EngineError({
  message,
  hasRun,
}: {
  message: string;
  hasRun: boolean;
}) {
  const compare = useAtlas((s) => s.compare);
  return (
    <div
      role="alert"
      className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-danger/8 px-3 py-2.5 ring-1 ring-danger/30"
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-text-1">
        Comparison failed: {message}.
        {hasRun ? " The last successful run is still shown." : ""}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="-my-0.5 shrink-0"
        onClick={() => compare()}
      >
        <RotateCw size={12} />
        Retry
      </Button>
    </div>
  );
}

/* ----------------------------------- pre-run ----------------------------------- */

function PreRun() {
  const compare = useAtlas((s) => s.compare);
  const set = useAtlas((s) => s.set);
  const region = useAtlas((s) => s.region);
  const hovered = useAtlas((s) => s.hoveredProjectId);
  const [open, setOpen] = useState<string | null>(null);
  const inRegion = useMemo(
    () =>
      SNAPSHOT.projects.filter((p) => region === "all" || p.region === region),
    [region],
  );
  const byUtility = useMemo(() => {
    const groups = new Map<string, Project[]>();
    for (const p of inRegion) {
      const key = p.owners[0]?.utilityId ?? "unknown";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [inRegion]);
  // every owner counts (joint projects too), and "All" is the whole registry, as in the top bar
  const utilityCount = useMemo(
    () =>
      new Set(inRegion.flatMap((p) => p.owners.map((o) => o.utilityId))).size,
    [inRegion],
  );
  const sourceCount =
    region === "all"
      ? SNAPSHOT.sources.length
      : new Set(inRegion.flatMap((p) => p.sourceIds)).size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-4 border-y border-line py-4">
        <p className="text-[15px] leading-snug text-text-1">
          <span className="num font-semibold text-text-0">
            {inRegion.length}
          </span>{" "}
          public construction plans from{" "}
          <span className="num font-semibold text-text-0">{utilityCount}</span>{" "}
          {utilityCount === 1 ? "utility" : "utilities"}, drawn from{" "}
          <span className="num font-semibold text-text-0">{sourceCount}</span>{" "}
          {sourceCount === 1 ? "document" : "documents"}.
        </p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          onClick={() => compare()}
          disabled={!SNAPSHOT.projects.length}
        >
          <Play size={14} fill="currentColor" />
          Compare public plans
          <span className="ml-auto opacity-60">
            <Kbd>C</Kbd>
          </span>
        </Button>
        <p className="mt-2.5 text-[13px] leading-snug text-text-3">
          Runs the deterministic engine over the frozen snapshot: distinct
          owners only, project centers within 25 mi (or a shared facility), then
          timing — documented coordination kept separate.
        </p>
      </div>

      <div className="eyebrow mt-5 px-4">
        Separate plans, separate documents
      </div>
      <div className="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {byUtility.map(([uid, projects]) => {
          const expanded = open === uid || projects.length <= 4;
          const shown = expanded ? projects : projects.slice(0, 4);
          return (
            <div key={uid} className="mb-2">
              <div className="flex items-baseline justify-between px-2 py-1.5">
                <span className="text-[13px] font-medium text-text-1">
                  {IDX.utility(uid)?.name ?? uid}
                </span>
                <span className="num text-[12px] text-text-3">
                  {projects.length}
                </span>
              </div>
              {shown.map((p) => (
                <div
                  key={p.id}
                  onMouseEnter={() => set({ hoveredProjectId: p.id })}
                  onMouseLeave={() => set({ hoveredProjectId: null })}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-colors",
                    hovered === p.id ? "bg-bg-3 text-text-0" : "text-text-2",
                  )}
                >
                  <Dot
                    color={
                      FOCAL_HUE[overviewRole(p)] ??
                      (p.places.length ? "var(--text-2)" : "var(--text-3)")
                    }
                    size={5}
                  />
                  <span className="truncate">{p.shortTitle}</span>
                  <span className="mono ml-auto shrink-0 text-[12px] text-text-3">
                    {(p.status.label ?? p.status.value).replace(
                      "In the 2025–2034 Ten-Year Plan",
                      "10-yr plan",
                    )}
                  </span>
                </div>
              ))}
              {projects.length > 4 && (
                <button
                  onClick={() => setOpen(expanded ? null : uid)}
                  className="ml-2 mt-0.5 text-[12px] text-text-3 hover:text-text-1"
                >
                  {expanded ? "Show fewer" : `+ ${projects.length - 4} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------- running ----------------------------------- */

function Scanning() {
  const n = SNAPSHOT.projects.length;
  const pairs = (n * (n - 1)) / 2;
  const steps = [
    `Loading ${pluralize(n, "public plan")} from snapshot ${SNAPSHOT.snapshotDate}`,
    "Filtering to active plans with distinct owners",
    `Evaluating up to ${pairs.toLocaleString("en-US")} project pairs — place, then timing`,
    "Checking documented coordination and source conflicts",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setI((x) => Math.min(x + 1, steps.length - 1)),
      220,
    );
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="px-4" role="status" aria-live="polite">
      <div className="relative h-[3px] overflow-hidden rounded-full bg-bg-3">
        <div className="scan-bar absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-a to-transparent" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {steps.map((s, k) => (
          <li
            key={s}
            className={clsx(
              "flex items-start gap-2 text-[13px] transition-opacity",
              k <= i ? "opacity-100" : "opacity-25",
            )}
          >
            <span
              className={clsx(
                "mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full",
                k < i ? "bg-known" : k === i ? "bg-a" : "bg-text-3",
              )}
            />
            <span className="text-text-1">{s}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 space-y-2">
        {[0, 1, 2].map((k) => (
          <div
            key={k}
            className="shimmer h-[92px] rounded-xl border border-line bg-bg-2"
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------ results ----------------------------------- */

function RunResults() {
  const run = useAtlas((s) => s.run)!;
  const tab = useAtlas((s) => s.tab);
  const flags = useAtlas((s) => s.flags);
  const utilityFilter = useAtlas((s) => s.utilityFilter);
  const region = useAtlas((s) => s.region);
  const threshold = useAtlas((s) => s.thresholdMiles);
  const set = useAtlas((s) => s.set);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const regional = useMemo(
    () =>
      run.matches.filter(
        (m) => region === "all" || IDX.project(m.projectAId).region === region,
      ),
    [run, region],
  );
  const badgeCounts = useMemo(() => {
    const n: Partial<Record<FlagFilter, number>> = {};
    for (const m of regional) n[m.badge] = (n[m.badge] ?? 0) + 1;
    return n;
  }, [regional]);
  const filtered = useMemo(
    () =>
      regional.filter((m) => {
        if (!flags.includes(m.badge)) return false;
        if (!utilityFilter) return true;
        return [
          ...IDX.project(m.projectAId).owners,
          ...IDX.project(m.projectBId).owners,
        ].some((o) => o.utilityId === utilityFilter);
      }),
    [regional, flags, utilityFilter],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((t) => [t.id, filtered.filter((m) => inTab(m, t.id)).length]),
      ) as Record<QueueTab, number>,
    [filtered],
  );
  const inCurrent = filtered.filter((m) => inTab(m, tab));
  const hidden =
    regional.filter((m) => inTab(m, tab)).length - inCurrent.length;
  // a signal switched off counts as a filter only when this run has pairs with it
  const flagsHiding = ALL_FLAGS.filter(
    (f) => !flags.includes(f) && (badgeCounts[f] ?? 0) > 0,
  ).length;
  const active = (utilityFilter ? 1 : 0) + flagsHiding;
  const clearFilters = () => set({ utilityFilter: null, flags: ALL_FLAGS });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3">
        <LayoutGroup id="tabs">
          <div
            role="tablist"
            aria-label="Queue categories"
            className="flex gap-0.5 rounded-[10px] border border-line bg-bg-0/60 p-0.5"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                title={t.hint}
                onClick={() => set({ tab: t.id })}
                className={clsx(
                  "relative flex h-[30px] min-w-0 flex-auto items-center justify-center gap-[3px] whitespace-nowrap rounded-[8px] px-1 text-[12px] font-medium transition-colors",
                  tab === t.id
                    ? "text-text-0"
                    : "text-text-2 hover:text-text-1",
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-[8px] bg-bg-3 ring-1 ring-line-2"
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <span className="relative min-w-0 truncate">{t.label}</span>
                <span
                  className={clsx(
                    "num relative shrink-0 text-[12px]",
                    tab === t.id ? "text-text-1" : "text-text-3",
                  )}
                >
                  {counts[t.id]}
                </span>
              </button>
            ))}
          </div>
        </LayoutGroup>

        <button
          onClick={() => {
            setFiltersOpen(!filtersOpen);
            // the panel opens at the top of the list: bring it into view from anywhere down the queue
            if (!filtersOpen)
              scrollRef.current?.scrollTo({
                top: 0,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              });
          }}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[13px] text-text-2 hover:text-text-1"
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal size={12} />
          Filters & review radius
          {active > 0 && (
            <span
              className="rounded-full bg-bg-4 px-1.5 text-[12px] font-medium leading-[16px] text-text-0 ring-1 ring-line-3"
              title={[
                utilityFilter &&
                  `Utility: ${IDX.utility(utilityFilter)?.name ?? utilityFilter}`,
                flagsHiding > 0 && "Some signals hidden",
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              {active} active
            </span>
          )}
          <span className="mono ml-auto text-text-3">{threshold} mi</span>
          <ChevronDown
            size={12}
            className={clsx(
              "transition-transform",
              filtersOpen && "rotate-180",
            )}
          />
        </button>
        <RunSummary flagged={regional.length} />
      </div>

      {/* keyed by view: a tab or region switch swaps the list at once (no exiting cards to shift the scroll).
          Filters scroll with the cards, so on a short phone sheet they never squeeze the list or push the footer off screen. */}
      <div
        key={`${region}|${tab}`}
        ref={scrollRef}
        data-queue-scroll
        className="scroll-thin mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-3 [overflow-anchor:none]"
      >
        <AnimatePresence initial={false}>
          {filtersOpen && <Filters badgeCounts={badgeCounts} />}
        </AnimatePresence>
        <div role="list">
          {inCurrent.length === 0 && (
            <EmptyTab tab={tab} hidden={hidden} onClear={clearFilters} />
          )}
          <AnimatePresence initial>
            {inCurrent.map((m, i) => (
              <MatchCard key={m.id} m={m} index={i} rank={i + 1} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <ExcludedFooter />
    </div>
  );
}

function Filters({
  badgeCounts,
}: {
  badgeCounts: Partial<Record<FlagFilter, number>>;
}) {
  const flags = useAtlas((s) => s.flags);
  const utilityFilter = useAtlas((s) => s.utilityFilter);
  const threshold = useAtlas((s) => s.thresholdMiles);
  const set = useAtlas((s) => s.set);
  const compare = useAtlas((s) => s.compare);
  const [local, setLocal] = useState(threshold);
  // follow the store when something else (the guided demo, a deep link) changes the radius
  const [seen, setSeen] = useState(threshold);
  if (seen !== threshold) {
    setSeen(threshold);
    setLocal(threshold);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggle = (f: FlagFilter) =>
    set({
      flags: flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f],
    });
  const owners = useMemo(() => {
    const ids = new Set(
      SNAPSHOT.projects.flatMap((p) => p.owners.map((o) => o.utilityId)),
    );
    return [...ids]
      .map((id) => IDX.utility(id) ?? { id, name: id, shortName: id })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="mb-1 overflow-hidden"
    >
      <div className="space-y-3 rounded-lg border border-line bg-bg-2/70 p-3">
        <div>
          <div className="eyebrow mb-1.5">Signal</div>
          <div className="flex flex-wrap gap-1">
            {(["BOTH", "GEO", "POSSIBLE"] as FlagFilter[]).map((f) => {
              const n = badgeCounts[f] ?? 0;
              // a signal no pair in this run carries hides nothing, so it cannot be switched off (only back on)
              const inert = n === 0 && flags.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggle(f)}
                  disabled={inert}
                  aria-pressed={flags.includes(f)}
                  title={
                    n === 0
                      ? f === "BOTH"
                        ? "No pair in this run has both a confirmed shared place and a confirmed construction-window overlap"
                        : "No pairs with this signal in this run"
                      : undefined
                  }
                  className={clsx(
                    "mono inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
                    inert
                      ? "cursor-not-allowed border border-dashed border-line-2 text-text-3"
                      : flags.includes(f)
                        ? "bg-bg-4 text-text-0 ring-1 ring-line-3"
                        : "text-text-3 ring-1 ring-line hover:text-text-2",
                  )}
                >
                  {f === "POSSIBLE"
                    ? "PLACE POSSIBLE"
                    : f === "GEO"
                      ? "PLACE CONFIRMED"
                      : "PLACE + TIME"}
                  <span
                    className={clsx(
                      "num",
                      flags.includes(f) && !inert
                        ? "text-text-2"
                        : "text-text-3",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="utility-filter">
            Utility
          </label>
          <select
            id="utility-filter"
            value={utilityFilter ?? ""}
            onChange={(e) => set({ utilityFilter: e.target.value || null })}
            className="h-7 w-full rounded-md border border-line-2 bg-bg-1 px-2 text-[13px] text-text-1 outline-none focus:border-a"
          >
            <option value="">All utilities</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label className="eyebrow" htmlFor="radius">
              Review radius
            </label>
            <span className="num text-[13px] text-text-0">{local} mi</span>
          </div>
          <input
            id="radius"
            type="range"
            min={5}
            max={100}
            step={5}
            value={local}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLocal(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(
                () => compare({ thresholdMiles: v, quiet: true }),
                180,
              );
            }}
            className="w-full accent-[var(--a)]"
          />
          <p className="mt-1 text-[12px] leading-snug text-text-3">
            A review heuristic, not a regulatory standard. Re-runs the engine.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyTab({
  tab,
  hidden,
  onClear,
}: {
  tab: QueueTab;
  hidden: number;
  onClear: () => void;
}) {
  const copy: Record<QueueTab, { title: string; body: string }> = {
    "needs-review": {
      title: "No open review leads",
      body: "Every flagged pair either has documented coordination or only coarse evidence. That is an honest result, not an error.",
    },
    "known-coordination": {
      title: "No documented coordination",
      body: "No flagged pair has joint work or interface coordination on record.",
    },
    conflicts: {
      title: "No source conflicts",
      body: "Sources agree on every date used by the flagged pairs.",
    },
    possible: {
      title: "Nothing only-possible",
      body: "Every candidate has at least one confirmed signal.",
    },
  };
  return (
    <div className="mt-6 flex flex-col items-center px-4 text-center">
      <FileSearch size={20} className="text-text-3" />
      <div className="mt-2 text-[14px] font-medium text-text-1">
        {copy[tab].title}
      </div>
      <p className="mt-1 text-[13px] leading-snug text-text-3">
        {hidden
          ? `No pairs match the current filters — ${pluralize(hidden, "pair")} in this tab ${hidden === 1 ? "is" : "are"} hidden.`
          : copy[tab].body}
      </p>
      {hidden > 0 && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** "95 flagged · 7,707 not flagged (>25 mi) — See why": what the run left out, in the open, with a way in. */
function RunSummary({ flagged }: { flagged: number }) {
  const run = useAtlas((s) => s.run)!;
  const set = useAtlas((s) => s.set);
  const region = useAtlas((s) => s.region);
  const counts = useRegionCounts()!;
  const archived = run.excludedProjects.filter(
    (x) => region === "all" || IDX.project(x.projectId)?.region === region,
  ).length;
  const { beyond, unlocated, viaFacility } = counts;
  const where = region === "all" ? "" : " in this region";
  return (
    <p
      className="mt-1 px-1 text-[13px] leading-snug text-text-2"
      title={`${beyond.toLocaleString("en-US")} ${beyond === 1 ? "pair" : "pairs"}${where} not flagged: farther than ${run.thresholdMiles} mi with no shared facility · ${unlocated.toLocaleString("en-US")} where a location is unknown · ${pluralize(archived, "archived project")}${viaFacility ? ` · ${viaFacility.toLocaleString("en-US")} flagged by a shared facility beyond ${run.thresholdMiles} mi` : ""}`}
    >
      <span className="num text-text-1">{flagged.toLocaleString("en-US")}</span>{" "}
      flagged · <span className="num">{beyond.toLocaleString("en-US")}</span>{" "}
      not flagged (&gt;
      {run.thresholdMiles} mi)
      {unlocated > 0 && (
        <>
          {" "}
          · <span className="num">
            {unlocated.toLocaleString("en-US")}
          </span>{" "}
          unlocated
        </>
      )}{" "}
      <button
        onClick={() => set({ methodOpen: true })}
        className="font-medium text-text-0 underline decoration-line-3 underline-offset-[3px] hover:decoration-text-1"
      >
        See why
      </button>
    </p>
  );
}

/** Always-visible actions under the queue: the sponsor's two CSV tables and a re-run, as labelled buttons. */
function ExcludedFooter() {
  const run = useAtlas((s) => s.run)!;
  const compare = useAtlas((s) => s.compare);
  const region = useAtlas((s) => s.region);
  const exportCsv = (kind: "overlaps" | "projects") => {
    const f = regionExports(run, region)[kind];
    download(f.name, f.csv(), "text/csv");
  };
  return (
    <div className="border-t border-line-2 bg-bg-2 px-3 pb-3 pt-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="eyebrow">Export &amp; run</span>
        <span className="truncate text-[12px] text-text-3">CSV</span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Button
          variant="secondary"
          className="h-9 justify-start"
          onClick={() => exportCsv("overlaps")}
          title="Download the sponsor's overlap table (CSV): pairs whose centers are under 25 mi apart, closest first. Every flagged pair, with reasons, is in the Method drawer."
          aria-label="Export overlap table as CSV"
        >
          <Download size={14} />
          Overlaps
        </Button>
        <Button
          variant="secondary"
          className="h-9 justify-start"
          onClick={() => exportCsv("projects")}
          title="Download the sponsor's project table (CSV): centers, in-service dates and overlap_1…n"
          aria-label="Export project table as CSV"
        >
          <Download size={14} />
          Projects
        </Button>
        <Button
          variant="secondary"
          className="h-9"
          onClick={() => compare()}
          aria-label="Re-run comparison"
          title="Re-run the comparison"
        >
          <RotateCw size={14} />
          Re-run
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------- card ------------------------------------- */

function MatchCard({
  m,
  index,
  rank,
  dim,
}: {
  m: Match;
  index: number;
  rank: number;
  dim?: boolean;
}) {
  const selected = useAtlas((s) => s.selectedMatchId === m.id);
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selected) return;
    // after layout settles; a card far out of view is centered, a neighbour (j/k) only nudged into view
    const f = requestAnimationFrame(() => {
      const el = ref.current;
      const box = el?.closest("[data-queue-scroll]")?.getBoundingClientRect();
      if (!el || !box) return;
      const r = el.getBoundingClientRect();
      const away = r.bottom < box.top || r.top > box.bottom;
      el.scrollIntoView({
        block: away ? "center" : "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(f);
  }, [selected]);
  const geo = geoShort(m);

  return (
    <motion.div
      role="listitem"
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index, 8) * 0.045,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="mt-2"
    >
      <button
        ref={ref}
        data-match-id={m.id}
        onClick={() => select(selected ? null : m.id)}
        onMouseEnter={() => set({ hoveredMatchId: m.id })}
        onMouseLeave={() => set({ hoveredMatchId: null })}
        onFocus={() => set({ hoveredMatchId: m.id })}
        onBlur={() => set({ hoveredMatchId: null })}
        aria-pressed={selected}
        className={clsx(
          "group relative grid w-full grid-cols-[26px_minmax(0,1fr)] gap-x-2 rounded-card border px-3 py-3 text-left transition-[border-color,background] duration-200",
          selected
            ? "border-overlap/70 bg-overlap-wash"
            : "border-line bg-bg-2/60 hover:border-line-2 hover:bg-bg-3/70",
          dim && !selected && "opacity-75",
        )}
      >
        <span
          className={clsx(
            "num font-display text-[22px] font-semibold leading-[1.05]",
            selected ? "text-overlap" : "text-text-3",
          )}
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>
        <div className="min-w-0">
          <div className="space-y-2">
            <ProjectLine p={a} color="var(--a)" />
            <ProjectLine p={b} color="var(--b)" />
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-line pt-2 text-[13px]">
            <span
              className="min-w-0 text-text-1"
              title={`${geo.title} · ${cardTime(m)}`}
            >
              <MapPin
                size={12}
                className="-mt-0.5 mr-1 inline text-text-3"
                aria-hidden
              />
              {geo.text} · {cardTime(m)}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-text-2">
              {m.conflicts.length > 0 && (
                <span
                  className="flex items-center gap-0.5 text-conflict"
                  title={`${m.conflicts.length} preserved source disagreement${m.conflicts.length > 1 ? "s" : ""}`}
                >
                  <AlertTriangle size={12} aria-hidden />
                  <span className="num">{m.conflicts.length}</span>
                </span>
              )}
              <span
                title={`Review priority ${m.priority} (an ordering, not a probability)`}
              >
                {STATUS_WORD[m.reviewStatus]}
              </span>
            </span>
          </div>
        </div>
      </button>
    </motion.div>
  );
}

const STATUS_WORD: Record<Match["reviewStatus"], string> = {
  "needs-review": "Needs review",
  "known-coordination": "Known",
  possible: "Possible",
};

/** The pair's timing in words, for the card's one summary line. */
function cardTime(m: Match): string {
  const short = timeShort(m);
  if (m.time === "confirmed")
    return `schedules overlap ${short.replace(/ schedules$/, "")}`;
  if (m.time === "possible") return `may overlap ${short}`;
  if (m.time === "unknown" && m.timeDetail.inService)
    return short === "in-service overlap"
      ? "in service same period"
      : `in service ${short.replace(" d ", " days ")}`;
  if (m.time === "no-match") return "schedules don't overlap";
  return "schedule unknown";
}

function ProjectLine({ p, color }: { p: Project; color: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[7px]">
        <Dot color={color} size={7} />
      </span>
      <div className="min-w-0">
        <div
          className="line-clamp-2 text-[15px] font-medium leading-snug text-text-0"
          title={p.title}
        >
          {displayTitle(p)}
        </div>
        <div className="truncate text-[12px] text-text-2">
          {ownerNames(p, IDX)}
        </div>
      </div>
    </div>
  );
}
