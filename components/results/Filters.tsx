"use client";

import clsx from "clsx";
import { AlertTriangle, Crosshair, FilterX, X } from "lucide-react";
import { IDX } from "@/lib/data";
import type { SignalLevel } from "@/lib/domain/types";
import { useAtlas, type Focus, type TimingFilter } from "@/lib/store";
import { Chip, IconButton, Select } from "../ui";
import { fmt } from "./model";

const TIMING: { id: TimingFilter; label: string; tooltip: string }[] = [
  { id: "confirmed", label: "Schedules overlap", tooltip: "Published schedules (start → in-service) overlap by ≥30 days; field-work dates are not published" },
  { id: "possible", label: "May overlap", tooltip: "Construction windows may overlap at the dates’ stated precision" },
  { id: "unknown", label: "Timing unknown", tooltip: "No published construction window for one or both projects — unknown, not ruled out" },
  { id: "no-match", label: "No overlap", tooltip: "Published windows do not overlap" },
];

/** Fingers get 36px chips with a 6px gap between rows (the rows sit in the phone sheet's folded "Filters" row). */
const TOUCH = "coarse:h-9 coarse:px-3";

export interface FilterCounts {
  timing: Record<SignalLevel, number>;
  conflicts: number;
}

/**
 * Timing chips (independent toggles on `m.time`; none pressed = all; counts are tab-scoped), "Dates revised or disputed"
 * (store.conflictsOnly), the native Utility select (region-scoped options) and Clear. The timing chips wrap (two lines in
 * a 336–392px rail) rather than scroll, so none is ever cut off at rest. Clear is a small icon button at the top right
 * of the chips (name "Clear", tooltip "Clear filters"): it appears without reflowing any chip or squeezing the select.
 */
export function Filters({ counts, utilities }: { counts: FilterCounts; utilities: string[] }) {
  const timing = useAtlas((s) => s.timing);
  const conflictsOnly = useAtlas((s) => s.conflictsOnly);
  const utilityFilter = useAtlas((s) => s.utilityFilter);
  const set = useAtlas((s) => s.set);
  const active = timing.length > 0 || conflictsOnly || !!utilityFilter;
  const toggle = (t: TimingFilter) => set({ timing: timing.includes(t) ? timing.filter((x) => x !== t) : [...timing, t] });

  return (
    <div className="@container space-y-1.5">
      <div className="flex min-w-0 items-start gap-1.5">
        <div role="group" aria-label="Timing" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {TIMING.map((t) => (
            <Chip key={t.id} size="sm" pressed={timing.includes(t.id)} count={counts.timing[t.id]} tooltip={t.tooltip} onClick={() => toggle(t.id)} className={TOUCH}>
              {t.label}
            </Chip>
          ))}
        </div>
        {active && (
          <IconButton
            label="Clear"
            tooltip="Clear filters"
            tooltipSide="left"
            onClick={() => set({ timing: [], conflictsOnly: false, utilityFilter: null })}
            className="size-6! animate-fade-in coarse:size-9!"
          >
            <FilterX size={14} strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      {/* the select keeps a readable width ("All utilities", "Dairyland…") beside the chip */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Chip
          size="sm"
          pressed={conflictsOnly}
          count={counts.conflicts}
          // the triangle gives way first in a narrow rail, so "All utilities" still reads in full beside the chip
          icon={<AlertTriangle aria-hidden size={12} strokeWidth={2} className={clsx("hidden @min-[344px]:block", conflictsOnly ? "text-warn" : "text-fg-3")} />}
          tooltip="Pairs where a newer plan edition revised a date, or current sources disagree — every claim is kept"
          onClick={() => set({ conflictsOnly: !conflictsOnly })}
          className={TOUCH}
        >
          Dates revised or disputed
        </Chip>
        <Select
          label="Utility"
          hideLabel
          value={utilityFilter ?? ""}
          onChange={(e) => set({ utilityFilter: e.target.value || null })}
          wrapperClassName="min-w-[104px] flex-1 [&>span:last-child]:w-full"
          className="h-6! w-full min-w-0 pr-[22px]! pl-2 coarse:h-9!"
          title={utilityFilter ? (IDX.utility(utilityFilter)?.name ?? utilityFilter) : "Pairs with this utility on either side"}
        >
          <option value="">All utilities</option>
          {utilities.map((id) => (
            <option key={id} value={id}>
              {IDX.utility(id)?.name ?? id}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** "With Okatie – McIntosh 115kV Tie · 18 pairs ×": the list narrowed to one project's (or hotspot's) pairs. Ranks never change. */
export function FocusChip({ focus }: { focus: Focus }) {
  const setFocus = useAtlas((s) => s.setFocus);
  const n = focus.pairIds.length;
  const project = focus.kind === "project" ? IDX.project(focus.id) : undefined;
  const label = project?.shortTitle ?? focus.label;
  return (
    <div className="flex h-8 min-w-0 animate-fade-in items-center gap-2 rounded-full bg-fg-1/[0.09] pr-1 pl-3 ring-1 ring-fg-1/20 ring-inset">
      <Crosshair aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-2" />
      <p className="flex min-w-0 flex-1 items-baseline gap-1 text-caption text-fg-2" title={project?.title ?? focus.label}>
        {project && <span className="shrink-0 text-fg-3">With</span>}
        <span className="min-w-0 truncate font-medium text-fg-1">{label}</span>
        <span className="shrink-0 text-fg-3">
          · <span className="num">{fmt(n)}</span> {n === 1 ? "pair" : "pairs"}
        </span>
      </p>
      <IconButton label="Clear focus" size="sm" onClick={() => setFocus(null)} tooltip="Show every pair again">
        <X size={14} strokeWidth={2} />
      </IconButton>
    </div>
  );
}
