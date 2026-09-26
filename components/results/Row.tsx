"use client";

import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import { memo, useEffect, useRef } from "react";
import { IDX } from "@/lib/data";
import type { Match, Project } from "@/lib/domain/types";
import { rankLabel } from "@/lib/rank";
import { LABELS, type ReviewLabel } from "@/lib/review";
import { useAtlas } from "@/lib/store";
import { SignalFact, Tag, UtilityDot, type UtilityKey } from "../ui";
import { placeFact, rowFlags, rowOwner, timeFact, type Fact, type SperryTag } from "./model";

export interface RowProps {
  m: Match;
  rank: number;
  /** Position in the list (stagger only for the first 10 of a freshly shown list). */
  index: number;
  stagger: boolean;
  /** Pairs of the current tab each project appears in (the "×18" after a title when ≥3). */
  repeats: Map<string, number>;
  /** The focus project (its "×N" is implied by the focus chip). */
  focusId?: string;
  sperry?: SperryTag;
  /** Reviewer mode: the saved label (trailing tag). */
  label?: ReviewLabel;
}

const LABEL_TEXT = Object.fromEntries(LABELS.map((l) => [l.id, l.text])) as Record<ReviewLabel, string>;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One ranked pair (SPEC §5.2): rank gutter · two owner-first titles (up to two lines each) · a pair-level facts block in
 * plain words (place over time) · an optional chips line. The focusable element is the <button data-match-id
 * aria-pressed>; Enter opens the pair.
 */
export const Row = memo(function Row({ m, rank, index, stagger, repeats, focusId, sperry, label }: RowProps) {
  const selected = useAtlas((s) => s.selectedMatchId === m.id);
  const mapHover = useAtlas((s) => s.hoveredMatchId === m.id);
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const ref = useRef<HTMLButtonElement>(null);
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);

  // keep the selected row in view: centred when it was far away, nudged when it is a neighbour (J/K)
  useEffect(() => {
    if (!selected) return;
    const f = requestAnimationFrame(() => {
      const el = ref.current;
      const box = el?.closest("[data-queue-scroll]")?.getBoundingClientRect();
      if (!el || !box || box.height < 1) return;
      const r = el.getBoundingClientRect();
      const away = r.bottom < box.top || r.top > box.bottom;
      el.scrollIntoView({ block: away ? "center" : "nearest", behavior: reduced() ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(f);
  }, [selected]);

  const place = placeFact(m);
  const time = timeFact(m);
  const flags = rowFlags(m);
  const chips = !!sperry || flags.disputed || flags.pastDue || !!flags.beyond || !!label;

  return (
    <motion.div
      role="listitem"
      initial={stagger ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: label === "not-useful" && !selected ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.32, delay: stagger ? Math.min(index, 10) * 0.03 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        ref={ref}
        type="button"
        data-match-id={m.id}
        aria-pressed={selected}
        data-hovered={mapHover || undefined}
        onClick={() => select(m.id)}
        onMouseEnter={() => set({ hoveredMatchId: m.id })}
        onMouseLeave={() => useAtlas.getState().hoveredMatchId === m.id && set({ hoveredMatchId: null })}
        onFocus={() => set({ hoveredMatchId: m.id })}
        onBlur={() => useAtlas.getState().hoveredMatchId === m.id && set({ hoveredMatchId: null })}
        className={clsx(
          // --row-lh: one line box for the rank, dots, owner codes and title lines, so they share a first line
          "group relative grid w-full scroll-mt-(--sticky-h,8px) scroll-mb-2 grid-cols-[16px_minmax(0,1fr)_auto] gap-x-1.5 rounded-control py-2 pr-1.5 pl-2 text-left transition-colors duration-150 ease-enter [--row-lh:calc(var(--text-ui)*1.3)]",
          selected ? "bg-fill-3" : "hover:bg-fill-2 data-hovered:bg-fill-2",
        )}
      >
        {selected && (
          <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-[linear-gradient(var(--util-a)_50%,var(--util-b)_50%)]" />
        )}
        <span className="num text-[length:var(--text-label)] leading-(--row-lh) text-fg-3 tabular-nums">
          <span aria-hidden>{rankLabel(rank)}</span>
          <span className="sr-only">Rank {rank}: </span>
        </span>
        <span className="min-w-0">
          <TitleLine p={a} role={selected ? "a" : undefined} times={a.id === focusId ? 0 : (repeats.get(a.id) ?? 0)} />
          <TitleLine p={b} role={selected ? "b" : undefined} times={b.id === focusId ? 0 : (repeats.get(b.id) ?? 0)} className="mt-1" />
          {chips && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {sperry && (
                <Tag mono title={sperry.tooltip}>
                  Sperry {sperry.id}
                </Tag>
              )}
              {flags.disputed && (
                <Tag tone="warn" icon={<AlertTriangle aria-hidden size={11} strokeWidth={2} />} title="Current sources disagree on a date; both claims are kept">
                  Sources disagree
                </Tag>
              )}
              {flags.pastDue && (
                <Tag tone="muted" title="Planned date passed; completion not confirmed">
                  Date passed
                </Tag>
              )}
              {flags.beyond && (
                <Tag tone="muted" title={flags.beyond.tooltip}>
                  {flags.beyond.text}
                </Tag>
              )}
              {label && (
                <Tag tone={label === "worth-review" ? "ok" : "muted"} title="Your reviewer label (saved in this browser)">
                  {LABEL_TEXT[label]}
                </Tag>
              )}
            </span>
          )}
        </span>
        {/* pair-level facts in plain words: the distance between centers over the timing (never per project). The
            column holds "may overlap 2028" on one line and "schedules overlap / 2025–26" on two; the titles get the rest */}
        <span className="flex w-[134px] min-w-0 flex-col justify-center gap-1 self-stretch border-l border-divider pl-2">
          <SignalFact kind="place" state={place.state} mono={false} wrap alignIcon tooltip={place.tooltip} className="gap-1! leading-[1.3]">
            <FactText f={place} />
          </SignalFact>
          <SignalFact kind="time" state={time.state} mono={false} wrap alignIcon tooltip={time.tooltip} className="gap-1! leading-[1.3]">
            <FactText f={time} />
          </SignalFact>
        </span>
      </button>
    </motion.div>
  );
});

/** "may overlap 2028": the words in the body face, the figures (`f.value`) in mono tabular numerals. */
function FactText({ f }: { f: Fact }) {
  const at = f.value ? f.text.lastIndexOf(f.value) : -1;
  if (!f.value || at < 0) return <>{f.text}</>;
  return (
    <>
      {f.text.slice(0, at)}
      <span className="num">{f.value}</span>
      {f.text.slice(at + f.value.length)}
    </>
  );
}

const DOT: Record<UtilityKey, UtilityKey> = { a: "a", b: "b", other: "other" };

/**
 * Owner first (dot + mono short name, full names for screen readers), then the title — up to two lines, the full title
 * in its tooltip — then "×18" when repeated. The owner code runs inline with the title, so a second line starts under
 * it and gets the full width; the dot and "×18" sit on the first line box (--row-lh). The "×18" gives way first: it shows
 * only in a wide rail, where it no longer costs the title its words.
 */
function TitleLine({ p, role, times, className }: { p: Project; role?: "a" | "b"; times: number; className?: string }) {
  const owner = rowOwner(p);
  return (
    <span className={clsx("flex min-w-0 items-start gap-1.5", className)}>
      <span className="flex h-(--row-lh) shrink-0 items-center">
        <UtilityDot utility={DOT[role ?? owner.hue]} />
      </span>
      <span className="line-clamp-2 min-w-0 text-ui leading-(--row-lh) font-medium text-fg-1" title={p.title}>
        <span aria-hidden title={owner.full} className="num mr-1.5 text-[length:var(--text-label)] font-normal text-fg-3">
          {owner.label}
        </span>
        <span className="sr-only">{owner.full}: </span>
        {p.shortTitle}
      </span>
      {times >= 3 && (
        <span className="num hidden shrink-0 pl-0.5 text-[length:var(--text-label)] leading-(--row-lh) text-fg-3 @[372px]:inline" title={`In ${times} pairs of this tab`}>
          ×{times}
        </span>
      )}
    </span>
  );
}
