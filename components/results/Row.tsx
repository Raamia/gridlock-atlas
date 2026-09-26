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
          // a separated card: rank gutter · two owner-labelled titles · a divider · the pair's facts in plain words.
          // --row-lh: one line box for the rank, dots and first title lines, so they share a first line
          "group relative grid w-full scroll-mt-(--sticky-h,8px) scroll-mb-2 grid-cols-[22px_minmax(0,1fr)] gap-x-2 rounded-card border px-3 py-3 text-left transition-[background-color,border-color] duration-150 ease-enter [--row-lh:calc(var(--text-ui)*1.3)]",
          selected
            ? "border-edge-strong bg-fill-3"
            : "border-edge bg-fill-1 hover:border-edge-strong hover:bg-fill-2 data-hovered:border-edge-strong data-hovered:bg-fill-2",
        )}
      >
        {selected && (
          <span aria-hidden className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-[linear-gradient(var(--util-a)_50%,var(--util-b)_50%)]" />
        )}
        <span className="num text-heading leading-(--row-lh) font-medium text-fg-3 tabular-nums">
          <span aria-hidden>{rankLabel(rank)}</span>
          <span className="sr-only">Rank {rank}: </span>
        </span>
        <span className="min-w-0">
          <TitleLine p={a} role={selected ? "a" : undefined} times={a.id === focusId ? 0 : (repeats.get(a.id) ?? 0)} />
          <TitleLine p={b} role={selected ? "b" : undefined} times={b.id === focusId ? 0 : (repeats.get(b.id) ?? 0)} className="mt-2.5" />
          {/* pair-level facts in plain words: the distance between centers, then the timing (never per project) */}
          <span className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-divider pt-2.5 text-caption text-fg-2">
            <SignalFact kind="place" state={place.state} mono={false} wrap alignIcon tooltip={place.tooltip} className="gap-1! leading-[1.3]">
              <FactText f={place} />
            </SignalFact>
            <SignalFact kind="time" state={time.state} mono={false} wrap alignIcon tooltip={time.tooltip} className="gap-1! leading-[1.3]">
              <FactText f={time} />
            </SignalFact>
          </span>
          {chips && (
            <span className="mt-2 flex flex-wrap gap-1">
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
 * A utility dot, the title (up to two lines, the full title in its tooltip) and "×18" when repeated, with the owner's
 * name on its own line underneath (colour is always backed by text). The dot and "×18" sit on the first line box
 * (--row-lh); the "×18" shows only in a wide rail, where it no longer costs the title its words.
 */
function TitleLine({ p, role, times, className }: { p: Project; role?: "a" | "b"; times: number; className?: string }) {
  const owner = rowOwner(p);
  return (
    <span className={clsx("flex min-w-0 items-start gap-2", className)}>
      <span className="flex h-(--row-lh) shrink-0 items-center">
        <UtilityDot utility={DOT[role ?? owner.hue]} size={7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-ui leading-(--row-lh) font-medium text-fg-1" title={p.title}>
          {p.shortTitle}
        </span>
        <span className="mt-0.5 block truncate text-caption text-fg-3" title={owner.full}>
          {owner.full}
        </span>
      </span>
      {times >= 3 && (
        <span className="num hidden shrink-0 pl-0.5 text-[length:var(--text-label)] leading-(--row-lh) text-fg-3 @[372px]:inline" title={`In ${times} pairs of this tab`}>
          ×{times}
        </span>
      )}
    </span>
  );
}
