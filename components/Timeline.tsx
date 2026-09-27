"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { IDX } from "@/lib/data";
import type { Match } from "@/lib/domain/types";
import { DOCK, useLayout } from "@/lib/layout";
import { ownerNames } from "@/lib/selectors";
import { rowOwner } from "./results/model";
import { useAtlas } from "@/lib/store";
import { Eyebrow, IconButton, Panel, SignalFact, signalState } from "./ui";
import { InServiceMicro, InServiceStrip, useInServiceMeta } from "./timeline/InServiceStrip";
import { overlapStatement } from "./timeline/model";
import { PairGantt } from "./timeline/PairGantt";

/**
 * The timeline dock (SPEC §3, §4 C, §5.4): a floating panel along the bottom of the focal area, sized by lib/layout
 * (--dock-h: overview 96 · pair 196 · a height dragged on its top edge · collapsed 44). Three faces:
 *   overview   "Planned in-service years" — the same strip before and after a run (the reveal brightens flagged ticks)
 *   pair       the selected pair's construction Gantt (PairGantt)
 *   collapsed  a one-line summary of whichever face is current, with the expand toggle (hidden when the layout forces
 *              the dock shut: md tier, most demo steps, short windows)
 * The dock follows the selection only, never the hovered row (hover lights ticks instead of swapping the dock).
 */
export function Timeline() {
  const layout = useLayout();
  const run = useAtlas((s) => s.run);
  const selected = useAtlas((s) => s.selectedMatchId);
  const collapsedPref = useAtlas((s) => s.timelineCollapsed);
  const set = useAtlas((s) => s.set);
  const pair = (selected && run?.matches.find((m) => m.id === selected)) || null;
  const collapsed = layout.dockCollapsed;

  const toggle = layout.dockForced ? null : (
    <IconButton
      size="sm"
      label={collapsed ? "Expand timeline" : "Collapse timeline"}
      aria-expanded={!collapsed}
      onClick={() => set({ timelineCollapsed: !collapsedPref })}
    >
      {collapsed ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
    </IconButton>
  );

  const face = collapsed ? `collapsed:${pair?.id ?? ""}` : pair ? `pair:${pair.id}` : "overview";

  return (
    <Panel as="section" aria-label="Construction timeline" mapPad="bottom" className="@container relative h-full overflow-hidden" data-face={face.split(":")[0]}>
      <AnimatePresence initial={false}>
        <motion.div
          key={face}
          className="scroll-thin absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.24, delay: 0.1, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          {collapsed ? (
            <Collapsed pair={pair} toggle={toggle} />
          ) : pair ? (
            <PairGantt matchId={pair.id} headerRight={toggle} extra={layout.dockH - DOCK.pair} />
          ) : (
            <InServiceStrip headerRight={toggle} extra={layout.dockH - DOCK.overview} />
          )}
        </motion.div>
      </AnimatePresence>
    </Panel>
  );
}

/* ─────────────────────────────────────────────── collapsed ─────────────────────────────────────────────── */

function Collapsed({ pair, toggle }: { pair: Match | null; toggle: ReactNode }) {
  return (
    <div className={clsx("flex h-full min-w-0 items-center gap-4 pl-4", toggle ? "pr-2" : "pr-4")}>
      {pair ? <PairSummary m={pair} /> : <OverviewSummary />}
      {toggle && <div className="shrink-0">{toggle}</div>}
    </div>
  );
}

/**
 * "PLANNED IN-SERVICE YEARS ▮▮ ▮ ▮▮▮ … 42 of 197 projects in flagged pairs": the ticks fill the whole width between the
 * title and the count. Below 640px the count tucks under the title, so neither is ever cut.
 */
function OverviewSummary() {
  const meta = useInServiceMeta();
  return (
    <>
      <div className="flex min-w-0 shrink-0 flex-col justify-center gap-1.5 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:gap-4">
        <Eyebrow as="h2" className="shrink-0">
          Planned in-service years
        </Eyebrow>
        <span className="num text-caption leading-none whitespace-nowrap text-fg-3 @min-[640px]:hidden" title={meta.title}>
          {meta.text}
        </span>
      </div>
      <InServiceMicro className="h-full min-w-0 flex-1 @max-[380px]:hidden" />
      <span className="num hidden shrink-0 text-caption whitespace-nowrap text-fg-3 @min-[640px]:inline" title={meta.title}>
        {meta.text}
      </span>
    </>
  );
}

/**
 * "Possible overlap 2028 · year precision · ● Okatie – McIntosh 115kV Tie × ● Goshen – McIntosh 115 kV Line Rebuild".
 * Below 600px the pair reads as its owners ("● DESC × ● GPC"); below 460px the statement alone (the inspector names them).
 */
function PairSummary({ m }: { m: Match }) {
  const st = overlapStatement(m);
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);
  const side = (p: typeof a, color: string) => (
    <span className="flex min-w-0 items-center gap-1.5" title={`${ownerNames(p, IDX, true)} · ${p.title}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 truncate @max-[600px]:hidden">{p.shortTitle}</span>
      <span className="num hidden shrink-0 whitespace-nowrap @max-[600px]:inline">{rowOwner(p).label}</span>
    </span>
  );
  return (
    <>
      <SignalFact kind="time" state={signalState(m.time)} mono={false} className="max-w-[55%] shrink-0 @max-[460px]:max-w-none @max-[460px]:shrink" tooltip={m.timeReason}>
        {st.text}
      </SignalFact>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-caption text-fg-2 @max-[460px]:hidden">
        {side(a, "var(--util-a)")}
        <span aria-hidden className="shrink-0 text-fg-4">
          ×
        </span>
        {side(b, "var(--util-b)")}
      </span>
    </>
  );
}
