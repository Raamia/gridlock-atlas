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
  /**
   * card (desktop rail): each title over its owner's full name · compact (phone sheet): the owner's short name inline
   * before a one-line title, so two or more cards show at the half snap · dense (phone peek): compact without the facts
   * and chips lines, so the top card fits the 132px sheet whole.
   */
  variant?: "card" | "compact" | "dense";
}

const LABEL_TEXT = Object.fromEntries(LABELS.map((l) => [l.id, l.text])) as Record<ReviewLabel, string>;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Bring a selected row into view inside its scroller ([data-queue-scroll]) — never under the stuck tabs and filters, and
 * never a partial scroll of the headline block above them: the scroller stays at 0 when the row shows there, else it
 * scrolls at least past the headline (where the controls stick). A row far away is centred; a neighbour (J/K) is nudged.
 */
function reveal(el: HTMLElement) {
  const sc = el.closest<HTMLElement>("[data-queue-scroll]");
  if (!sc || sc.clientHeight < 1 || getComputedStyle(sc).overflowY === "hidden") return;
  const box = sc.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const cur = sc.scrollTop;
  const view = sc.clientHeight;
  const top = r.top - box.top + cur;
  const bottom = top + r.height;
  const pad = 8;
  // where the sticky controls start sticking (their sentinel's bottom), and how much of the view they cover then
  const sentinel = sc.querySelector<HTMLElement>("[data-sticky-sentinel]");
  const stickAt = sentinel ? sentinel.getBoundingClientRect().bottom - box.top + cur : 0;
  const stickyH = sentinel ? parseFloat(sc.style.getPropertyValue("--sticky-h")) || pad : pad;
  const cover = (s: number) => (sentinel && s < stickAt ? pad : stickyH);
  const shows = (s: number) => top >= s + cover(s) && bottom <= s + view - pad;
  if (shows(cur)) return;
  const far = bottom < cur || top > cur + view;
  let target = far ? top - stickyH - Math.max(0, (view - stickyH - r.height) / 2) : top < cur + cover(cur) ? top - stickyH : bottom - view + pad;
  if (sentinel && target < stickAt) target = shows(0) ? 0 : stickAt;
  sc.scrollTo({
    top: Math.max(0, Math.round(target)),
    behavior: reduced() ? "auto" : "smooth",
  });
}

/**
 * One ranked pair as a separated card (SPEC §5.2, the card look the team chose): rank gutter · two titles, each with its
 * owner's name underneath · a hairline · the pair's facts in plain words (place, then timing) · an optional chips line.
 * The focusable element is the <button data-match-id aria-pressed>; Enter opens the pair.
 */
export const Row = memo(function Row({ m, rank, index, stagger, repeats, focusId, sperry, label, variant = "card" }: RowProps) {
  const dense = variant === "dense";
  const inline = variant !== "card";
  const selected = useAtlas((s) => s.selectedMatchId === m.id);
  const mapHover = useAtlas((s) => s.hoveredMatchId === m.id);
  const select = useAtlas((s) => s.select);
  const set = useAtlas((s) => s.set);
  const ref = useRef<HTMLButtonElement>(null);
  const a = IDX.project(m.projectAId);
  const b = IDX.project(m.projectBId);

  useEffect(() => {
    if (!selected) return;
    const f = requestAnimationFrame(() => ref.current && reveal(ref.current));
    return () => cancelAnimationFrame(f);
  }, [selected]);

  const place = placeFact(m);
  const time = timeFact(m);
  const flags = rowFlags(m);
  const chips = !dense && (!!sperry || flags.disputed || flags.pastDue || !!flags.beyond || !!label);

  return (
    <motion.div
      role="listitem"
      initial={stagger ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: label === "not-useful" && !selected ? 0.6 : 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: stagger ? Math.min(index, 10) * 0.03 : 0,
        ease: [0.22, 1, 0.36, 1],
      }}
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
          // --row-lh: one line box for the rank, dots and first title lines, so they share a first line
          "group relative grid w-full scroll-mt-(--sticky-h,8px) scroll-mb-2 grid-cols-[20px_minmax(0,1fr)] gap-x-1.5 rounded-card border px-3 text-left transition-[background-color,border-color] duration-150 ease-enter [--row-lh:calc(var(--text-ui)*1.3)]",
          variant === "card" ? "pt-2.5 pb-2" : "py-2",
          selected
            ? "border-fg-1/30 bg-fill-3"
            : "border-edge bg-fill-1 hover:border-edge-strong hover:bg-fill-2 data-hovered:border-edge-strong data-hovered:bg-fill-2",
        )}
      >
        <span className={clsx("num text-heading leading-(--row-lh) font-medium tabular-nums", selected ? "text-fg-1" : "text-fg-3")}>
          <span aria-hidden>{rankLabel(rank)}</span>
          <span className="sr-only">Rank {rank}: </span>
        </span>
        <span className="min-w-0">
          <TitleLine p={a} role={selected ? "a" : undefined} times={a.id === focusId ? 0 : (repeats.get(a.id) ?? 0)} inline={inline} />
          <TitleLine
            p={b}
            role={selected ? "b" : undefined}
            times={b.id === focusId ? 0 : (repeats.get(b.id) ?? 0)}
            inline={inline}
            className={inline ? "mt-1" : "mt-1.5"}
          />
        </span>
        {/* pair-level facts in plain words: the distance between centers, then the timing (never per project). The line
            spans the card under the rank too, so "≈8.1 mi apart · schedules overlap 2025–26" keeps to one line */}
        {dense ? (
          <span className="sr-only">
            {" · "}
            {place.text} · {time.text}
          </span>
        ) : (
          <span
            className={clsx(
              "col-span-2 flex flex-wrap items-start gap-x-2.5 gap-y-0.5 border-t border-divider pt-1.5 text-caption text-fg-2",
              inline ? "mt-1.5" : "mt-2",
            )}
          >
            <SignalFact kind="place" state={place.state} mono={false} wrap alignIcon tooltip={place.tooltip} className="gap-1! leading-[1.3]">
              <FactText f={place} />
            </SignalFact>
            <SignalFact kind="time" state={time.state} mono={false} wrap alignIcon tooltip={time.tooltip} className="gap-1! leading-[1.3]">
              <FactText f={time} />
            </SignalFact>
          </span>
        )}
        {chips && (
          <span className="col-span-2 mt-1.5 flex flex-wrap gap-1">
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
              // the reason is the point (G1): it wraps rather than truncates in a narrow rail
              <Tag tone="muted" title={flags.beyond.tooltip} className="h-auto! min-h-5 py-0.5 whitespace-normal! [&>span]:whitespace-normal">
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
 * (--row-lh); the "×18" shows only in a wide rail, where it no longer costs the title its words. `inline` (phone): the
 * owner's short name in mono before a one-line title, the full name for screen readers.
 */
function TitleLine({ p, role, times, inline, className }: { p: Project; role?: "a" | "b"; times: number; inline?: boolean; className?: string }) {
  const owner = rowOwner(p);
  if (inline)
    return (
      <span className={clsx("flex min-w-0 items-center gap-2 leading-(--row-lh)", className)}>
        <UtilityDot utility={DOT[role ?? owner.hue]} size={7} />
        <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg-1" title={p.title}>
          <span aria-hidden title={owner.full} className="num mr-1.5 text-[length:var(--text-label)] font-normal text-fg-3">
            {owner.label}
          </span>
          <span className="sr-only">{owner.full}: </span>
          {p.shortTitle}
        </span>
      </span>
    );
  return (
    <span className={clsx("flex min-w-0 items-start gap-1.5", className)}>
      <span className="flex h-(--row-lh) shrink-0 items-center">
        <UtilityDot utility={DOT[role ?? owner.hue]} size={7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-ui leading-(--row-lh) font-medium text-fg-1" title={p.title}>
          {p.shortTitle}
        </span>
        <span className="block truncate text-caption leading-[1.3] text-fg-3" title={owner.full}>
          {owner.full}
        </span>
      </span>
      {times >= 3 && (
        <span
          className="num hidden shrink-0 pl-0.5 text-[length:var(--text-label)] leading-(--row-lh) text-fg-3 @[372px]:inline"
          title={`In ${times} pairs of this tab`}
        >
          ×{times}
        </span>
      )}
    </span>
  );
}
