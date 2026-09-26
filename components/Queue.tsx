"use client";

import clsx from "clsx";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AlertTriangle, Archive, ChevronDown, Download, FileSearch, Play, RotateCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IDX, SNAPSHOT } from "@/lib/data";
import { displayTitle, geoShort, timeShort } from "@/lib/describe";
import type { Match, Project } from "@/lib/domain/types";
import { pluralize } from "@/lib/format";
import { ownerNames } from "@/lib/selectors";
import { overlapTableCsv } from "@/lib/export";
import { download } from "@/lib/review";
import { inTab, useAtlas, type FlagFilter, type QueueTab } from "@/lib/store";
import { Button, Dot, Kbd, MatchBadges, StatusChip } from "./ui";

const TABS: { id: QueueTab; label: string; hint: string }[] = [
  { id: "needs-review", label: "Needs review", hint: "Cross-utility pairs whose resource coordination is not established in the reviewed sources" },
  { id: "known-coordination", label: "Known", hint: "Pairs with documented joint work or interface coordination" },
  { id: "conflicts", label: "Conflicts", hint: "Pairs where sources disagree on a date; both claims are kept" },
  { id: "possible", label: "Possible", hint: "Only coarse or possible signals" },
];

export function Queue() {
  const run = useAtlas((s) => s.run);
  const running = useAtlas((s) => s.running);

  return (
    <aside className="relative flex min-h-0 flex-col border-r border-line bg-bg-1" aria-label="Coordination queue">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-0">Coordination queue</h2>
          {run && (
            <span className="mono text-[10.5px] text-text-3">
              {run.pairsEvaluated} pairs · {run.thresholdMiles} mi
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-text-2">
          Cross-utility project pairs within the review radius, ranked by place first, then timing.
        </p>
      </div>
      {running ? <Scanning /> : run ? <RunResults /> : <PreRun />}
    </aside>
  );
}

/* ----------------------------------- pre-run ----------------------------------- */

function PreRun() {
  const compare = useAtlas((s) => s.compare);
  const set = useAtlas((s) => s.set);
  const region = useAtlas((s) => s.region);
  const hovered = useAtlas((s) => s.hoveredProjectId);
  const [open, setOpen] = useState<string | null>(null);
  const inRegion = useMemo(() => SNAPSHOT.projects.filter((p) => region === "all" || p.region === region), [region]);
  const byUtility = useMemo(() => {
    const groups = new Map<string, Project[]>();
    for (const p of inRegion) {
      const key = p.owners[0]?.utilityId ?? "unknown";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [inRegion]);
  const sources = new Set(inRegion.flatMap((p) => p.sourceIds));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-4 rounded-xl border border-line bg-bg-2 p-4">
        <div className="eyebrow">Loaded from public sources</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat n={inRegion.length} label="plans" />
          <Stat n={byUtility.length} label="utilities" />
          <Stat n={sources.size} label="sources" />
        </div>
        <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => compare()} disabled={!SNAPSHOT.projects.length}>
          <Play size={14} fill="currentColor" />
          Compare public plans
          <span className="ml-auto opacity-60">
            <Kbd>C</Kbd>
          </span>
        </Button>
        <p className="mt-2.5 text-[11.5px] leading-snug text-text-3">
          Runs the deterministic engine over the frozen snapshot: distinct owners only, project centers within 25 mi (or a shared facility), then timing — documented coordination kept
          separate.
        </p>
      </div>

      <div className="eyebrow mt-5 px-4">Separate plans, separate documents</div>
      <div className="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {byUtility.map(([uid, projects]) => {
          const expanded = open === uid || projects.length <= 4;
          const shown = expanded ? projects : projects.slice(0, 4);
          return (
            <div key={uid} className="mb-2">
              <div className="flex items-baseline justify-between px-2 py-1.5">
                <span className="text-[12px] font-medium text-text-1">{IDX.utility(uid)?.name ?? uid}</span>
                <span className="num text-[11px] text-text-3">{projects.length}</span>
              </div>
              {shown.map((p) => (
                <div
                  key={p.id}
                  onMouseEnter={() => set({ hoveredProjectId: p.id })}
                  onMouseLeave={() => set({ hoveredProjectId: null })}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] transition-colors",
                    hovered === p.id ? "bg-bg-3 text-text-0" : "text-text-2",
                  )}
                >
                  <Dot color={p.places.length ? "var(--text-2)" : "var(--text-3)"} size={5} />
                  <span className="truncate">{p.shortTitle}</span>
                  <span className="mono ml-auto shrink-0 text-[10px] text-text-3">{(p.status.label ?? p.status.value).replace("In the 2025–2034 Ten-Year Plan", "10-yr plan")}</span>
                </div>
              ))}
              {projects.length > 4 && (
                <button onClick={() => setOpen(expanded ? null : uid)} className="ml-2 mt-0.5 text-[11px] text-text-3 hover:text-text-1">
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

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="num text-[22px] font-medium leading-none text-text-0">{n}</div>
      <div className="mt-1 text-[11px] text-text-2">{label}</div>
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
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 220);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="px-4" role="status" aria-live="polite">
      <div className="relative h-[3px] overflow-hidden rounded-full bg-bg-3">
        <div className="scan-bar absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-a to-transparent" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {steps.map((s, k) => (
          <li key={s} className={clsx("flex items-start gap-2 text-[12px] transition-opacity", k <= i ? "opacity-100" : "opacity-25")}>
            <span className={clsx("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", k < i ? "bg-known" : k === i ? "bg-a" : "bg-text-3")} />
            <span className="text-text-1">{s}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 space-y-2">
        {[0, 1, 2].map((k) => (
          <div key={k} className="shimmer h-[92px] rounded-xl border border-line bg-bg-2" />
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

  const filtered = useMemo(
    () =>
      run.matches.filter((m) => {
        if (!flags.includes(m.badge)) return false;
        const a = IDX.project(m.projectAId);
        const b = IDX.project(m.projectBId);
        if (utilityFilter && ![...a.owners, ...b.owners].some((o) => o.utilityId === utilityFilter)) return false;
        if (region !== "all" && a.region !== region && b.region !== region) return false;
        return true;
      }),
    [run, flags, utilityFilter, region],
  );

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, filtered.filter((m) => inTab(m, t.id)).length])) as Record<QueueTab, number>,
    [filtered],
  );
  const inCurrent = filtered.filter((m) => inTab(m, tab));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3">
        <LayoutGroup id="tabs">
          <div role="tablist" aria-label="Queue categories" className="flex gap-0.5 rounded-[10px] border border-line bg-bg-0/60 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                title={t.hint}
                onClick={() => set({ tab: t.id })}
                className={clsx(
                  "relative flex h-[30px] flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-[8px] px-1.5 text-[11.5px] font-medium transition-colors",
                  tab === t.id ? "text-text-0" : "text-text-2 hover:text-text-1",
                )}
              >
                {tab === t.id && (
                  <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-[8px] bg-bg-3 ring-1 ring-line-2" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} />
                )}
                <span className="relative">{t.label}</span>
                <span className={clsx("num relative text-[10.5px]", tab === t.id ? "text-text-1" : "text-text-3")}>{counts[t.id]}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>

        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[11.5px] text-text-2 hover:text-text-1"
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal size={12} />
          Filters & review radius
          <span className="mono ml-auto text-text-3">{threshold} mi</span>
          <ChevronDown size={12} className={clsx("transition-transform", filtersOpen && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>{filtersOpen && <Filters />}</AnimatePresence>
      </div>

      <div className="scroll-thin mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-3" role="list">
        {inCurrent.length === 0 && <EmptyTab tab={tab} />}
        <AnimatePresence initial>
          {inCurrent.map((m, i) => (
            <MatchCard key={m.id} m={m} index={i} rank={i + 1} />
          ))}
        </AnimatePresence>
      </div>

      <ExcludedFooter />
    </div>
  );
}

function Filters() {
  const flags = useAtlas((s) => s.flags);
  const utilityFilter = useAtlas((s) => s.utilityFilter);
  const threshold = useAtlas((s) => s.thresholdMiles);
  const set = useAtlas((s) => s.set);
  const compare = useAtlas((s) => s.compare);
  const [local, setLocal] = useState(threshold);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggle = (f: FlagFilter) => set({ flags: flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f] });
  const owners = useMemo(() => {
    const ids = new Set(SNAPSHOT.projects.flatMap((p) => p.owners.map((o) => o.utilityId)));
    return [...ids].map((id) => IDX.utility(id) ?? { id, name: id, shortName: id }).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="space-y-3 rounded-lg border border-line bg-bg-2/70 p-3">
        <div>
          <div className="eyebrow mb-1.5">Signal</div>
          <div className="flex flex-wrap gap-1">
            {(["BOTH", "GEO", "TIME", "POSSIBLE"] as FlagFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => toggle(f)}
                aria-pressed={flags.includes(f)}
                className={clsx(
                  "mono h-6 rounded-md px-2 text-[10.5px] ring-1 transition-colors",
                  flags.includes(f) ? "bg-bg-4 text-text-0 ring-line-3" : "text-text-3 ring-line hover:text-text-2",
                )}
              >
                {f === "POSSIBLE" ? "POSSIBLE ONLY" : f === "GEO" ? "GEO ONLY" : f === "TIME" ? "TIME ONLY" : f}
              </button>
            ))}
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
            className="h-7 w-full rounded-md border border-line-2 bg-bg-1 px-2 text-[12px] text-text-1 outline-none focus:border-a"
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
            <span className="num text-[12px] text-text-0">{local} mi</span>
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
              timer.current = setTimeout(() => compare({ thresholdMiles: v, quiet: true }), 180);
            }}
            className="w-full accent-[var(--a)]"
          />
          <p className="mt-1 text-[10.5px] leading-snug text-text-3">A review heuristic, not a regulatory standard. Re-runs the engine.</p>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyTab({ tab }: { tab: QueueTab }) {
  const copy: Record<QueueTab, { title: string; body: string }> = {
    "needs-review": {
      title: "No open review leads",
      body: "Every flagged pair either has documented coordination or only coarse evidence. That is an honest result, not an error.",
    },
    "known-coordination": { title: "No documented coordination", body: "No flagged pair has joint work or interface coordination on record." },
    conflicts: { title: "No source conflicts", body: "Sources agree on every date used by the flagged pairs." },
    possible: { title: "Nothing only-possible", body: "Every candidate has at least one confirmed signal." },
  };
  return (
    <div className="mt-6 flex flex-col items-center px-4 text-center">
      <FileSearch size={20} className="text-text-3" />
      <div className="mt-2 text-[12.5px] font-medium text-text-1">{copy[tab].title}</div>
      <p className="mt-1 text-[11.5px] leading-snug text-text-3">{copy[tab].body}</p>
    </div>
  );
}

function ExcludedFooter() {
  const run = useAtlas((s) => s.run)!;
  const set = useAtlas((s) => s.set);
  const compare = useAtlas((s) => s.compare);
  const region = useAtlas((s) => s.region);
  const exportCsv = () => {
    const inRegion = run.matches.filter((m) => region === "all" || IDX.project(m.projectAId).region === region);
    download(`gridlock-overlaps-${region}.csv`, overlapTableCsv(inRegion), "text/csv");
  };
  const archived = run.excludedProjects.length;
  const beyond = run.excludedCounts["beyond-radius"] + run.excludedCounts["no-signal"];
  const unknown = run.excludedCounts["location-unknown"];
  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-2">
      <button
        onClick={() => set({ methodOpen: true })}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-text-2 hover:bg-bg-2 hover:text-text-1"
        title="See what the engine excluded and why"
      >
        <Archive size={12} />
        <span className="truncate" title={`${beyond.toLocaleString("en-US")} pairs farther than ${run.thresholdMiles} mi · ${unknown.toLocaleString("en-US")} pairs where a location is unknown · ${archived} archived projects`}>
          {beyond.toLocaleString("en-US")} beyond {run.thresholdMiles} mi · {unknown.toLocaleString("en-US")} unlocated
        </span>
      </button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={exportCsv} title="Download the flagged pairs in the sponsor's overlap-table format" aria-label="Export overlap table as CSV">
        <Download size={12} />
        CSV
      </Button>
      <Button size="sm" variant="ghost" onClick={() => compare()} aria-label="Re-run comparison">
        <RotateCw size={12} />
        Re-run
      </Button>
    </div>
  );
}

/* ------------------------------------- card ------------------------------------- */

function MatchCard({ m, index, rank, dim }: { m: Match; index: number; rank: number; dim?: boolean }) {
  const selected = useAtlas((s) => s.selectedMatchId === m.id);
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <motion.div
      role="listitem"
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.045, ease: [0.22, 1, 0.36, 1] }}
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
          "group relative w-full overflow-hidden rounded-xl border p-3 text-left transition-[border-color,background,box-shadow] duration-200",
          selected
            ? "border-transparent bg-bg-3 shadow-[0_0_0_1px_rgba(47,214,242,0.45),0_12px_32px_-12px_rgba(124,92,240,0.5)]"
            : "border-line bg-bg-2 hover:border-line-2 hover:bg-bg-3/70",
          dim && !selected && "opacity-75",
        )}
      >
        {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-a to-b" />}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="num mr-0.5 text-[11px] text-text-3" aria-label={`Rank ${rank}`}>
            {String(rank).padStart(2, "0")}
          </span>
          <MatchBadges m={m} compact />
          <StatusChip status={m.reviewStatus} />
        </div>
        <div className="mt-2.5 space-y-2">
          <ProjectLine p={a} color="var(--a)" />
          <ProjectLine p={b} color="var(--b)" />
        </div>
        <div className="mono mt-2.5 flex items-center gap-2 border-t border-line pt-2 text-[10.5px] text-text-2">
          <span className="truncate">{geoShort(m)}</span>
          <span className="text-text-3">·</span>
          <span className="shrink-0">{timeShort(m)}</span>
          {m.conflicts.length > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-conflict" title={`${m.conflicts.length} preserved source disagreement${m.conflicts.length > 1 ? "s" : ""}`}>
              <AlertTriangle size={10} />
              {m.conflicts.length}
            </span>
          )}
          <span className="ml-auto shrink-0 text-text-3" title="Explainable review priority (ordering, not a probability)">
            P{m.priority}
          </span>
        </div>
      </button>
    </motion.div>
  );
}

function ProjectLine({ p, color }: { p: Project; color: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[5px]">
        <Dot color={color} size={7} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium leading-tight text-text-0" title={p.title}>
          {displayTitle(p)}
        </div>
        <div className="truncate text-[11px] text-text-2">{ownerNames(p, IDX)}</div>
      </div>
    </div>
  );
}
