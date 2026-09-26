"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { IDX } from "@/lib/data";
import type { Match, Project } from "@/lib/domain/types";
import { useSelectedPair } from "@/lib/hooks";
import { useTier } from "@/lib/layout";
import { rankLabel, rankOf, tabTotal } from "@/lib/rank";
import { useAtlas, type InspectorSection } from "@/lib/store";
import { FooterBar } from "./inspector/FooterBar";
import { GUIDANCE } from "./inspector/facts";
import { SectionNav, scrollInspectorTo, useScrollSpy, type NavItem } from "./inspector/SectionNav";
import { ConflictSection, CoordinationSection, disagreementsOf, ImpactSection, NotesSection, PlaceSection, ScheduleSection, SourcesSection } from "./inspector/Sections";
import { Chips, ProjectHeading, ReviewQuestion, Tiles, WhyFlagged, WhyRankButton, WhyRankReasons } from "./inspector/Summary";
import { ReviewPanel } from "./Review";
import { IconButton, Kbd, panelClass, StatusTag } from "./ui";

/**
 * Evidence inspector (SPEC §5.3): `<aside aria-label="Evidence inspector">`, filling the shell's inspector slot (a right
 * panel, or the phone sheet). Verdict line → owner-first titles → tiles, chips, "Why #01?" → the review question → why
 * flagged → reviewer block → sticky section nav → sections → disclaimer; a sticky footer bar holds the actions.
 * Everything stays in the DOM (collapsed parts are hidden with CSS), so tests and the guided demo can reach it.
 */
export function Inspector() {
  const open = useAtlas((s) => s.inspectorOpen);
  const pair = useSelectedPair();
  const phone = useTier() === "phone";
  return (
    <AnimatePresence>
      {open && pair && (
        <motion.aside
          key="inspector"
          aria-label="Evidence inspector"
          initial={phone ? { opacity: 0, y: 24 } : { opacity: 0, x: 16 }}
          animate={phone ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
          exit={phone ? { opacity: 0, y: 24 } : { opacity: 0, x: 16 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={clsx(panelClass(phone ? "solid" : "panel"), "flex flex-col overflow-hidden")}
        >
          <InspectorFrame m={pair.match} a={pair.a} b={pair.b} phone={phone} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function InspectorFrame({ m, a, b, phone }: { m: Match; a: Project; b: Project; phone: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  return (
    <>
      <Verdict m={m} phone={phone} scrolled={scrolled} />
      <InspectorBody key={m.id} m={m} a={a} b={b} phone={phone} scroller={scroller} onScrolled={setScrolled} />
      <FooterBar m={m} scroller={scroller} phone={phone} />
    </>
  );
}

/* ─────────────────────────────── 1 · verdict line ─────────────────────────────── */

function Verdict({ m, phone, scrolled }: { m: Match; phone: boolean; scrolled: boolean }) {
  const run = useAtlas((s) => s.run);
  const region = useAtlas((s) => s.region);
  const order = useAtlas((s) => s.visibleOrder);
  const select = useAtlas((s) => s.select);
  const selectNeighbor = useAtlas((s) => s.selectNeighbor);
  // the list's number: position in the region's unfiltered tab (lib/rank), the same "#01" as the row and the CSV
  const { rank, total } = useMemo(() => {
    if (!run) return { rank: undefined, total: 0 };
    let r = region;
    let k = rankOf(run, r, m.id);
    if (k === undefined) {
      r = IDX.project(m.projectAId)?.region ?? "all";
      k = rankOf(run, r, m.id);
    }
    return { rank: k, total: tabTotal(run, r, m.reviewStatus) };
  }, [run, region, m.id, m.projectAId, m.reviewStatus]);
  const i = order.indexOf(m.id);
  const atTop = i === 0;
  const atEnd = i >= 0 && i === order.length - 1;
  const size = phone ? "xl" : "sm";
  // "Why #01?" is open for the pair it was opened on; stepping to another pair closes it
  const [whyFor, setWhy] = useState<string | null>(null);
  const why = whyFor === m.id;
  const whyId = useId();

  return (
    <header
      className={clsx(
        // a size container: the 360px md inspector drops the Esc hint so a long status ("Known coordination") still fits
        "@container shrink-0 px-(--panel-pad) transition-shadow duration-200",
        // phone: the sheet's grabber sits in the top 20px
        phone ? "pt-4 pb-2" : "pt-3 pb-3",
        scrolled && "shadow-[0_1px_0_var(--divider)]",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusTag status={m.reviewStatus} size="md" />
        {rank !== undefined && (
          <span className="num text-caption whitespace-nowrap text-fg-2">
            #{rankLabel(rank)} <span className="text-fg-3">of {total}</span>
          </span>
        )}
        <div className={clsx("ml-auto flex items-center", phone ? "-mr-2.5" : "gap-0.5")}>
          {/* aria-disabled, not disabled: stepping onto the first/last pair keeps keyboard focus on the button */}
          <IconButton label="Pair above" shortcut="K" size={size} aria-disabled={atTop || undefined} className="aria-disabled:opacity-40" onClick={() => !atTop && selectNeighbor(-1)}>
            <ChevronUp size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Pair below" shortcut="J" size={size} aria-disabled={atEnd || undefined} className="aria-disabled:opacity-40" onClick={() => !atEnd && selectNeighbor(1)}>
            <ChevronDown size={16} strokeWidth={1.75} />
          </IconButton>
          <span aria-hidden className="mx-1 h-4 w-px bg-divider coarse:hidden @max-[340px]:hidden" />
          <Kbd size="sm" className="mr-0.5 @max-[340px]:hidden" aria-hidden>
            Esc
          </Kbd>
          <IconButton label="Close inspector" size={size} onClick={() => select(null)}>
            <X size={16} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
      <div className={clsx("flex items-start justify-between gap-3", phone ? "-mt-1" : "mt-1")}>
        <p className="min-w-0 pt-[3px] text-caption text-fg-2">{GUIDANCE[m.reviewStatus]}</p>
        <WhyRankButton rank={rank} open={why} onToggle={() => setWhy((o) => (o === m.id ? null : m.id))} controls={whyId} />
      </div>
      <WhyRankReasons m={m} open={why} id={whyId} />
    </header>
  );
}

/* ─────────────────────────────── body ─────────────────────────────── */

function InspectorBody({
  m,
  a,
  b,
  phone,
  scroller,
  onScrolled,
}: {
  m: Match;
  a: Project;
  b: Project;
  phone: boolean;
  scroller: RefObject<HTMLDivElement | null>;
  onScrolled: (v: boolean) => void;
}) {
  const section = useAtlas((s) => s.inspectorSection);
  const others = disagreementsOf(a, b).length;
  const nConflicts = m.conflicts.length + others;
  const items: NavItem[] = [
    { id: "place", label: "Where" },
    { id: "schedule", label: "When" },
    { id: "coordination", label: "Coordination" },
    { id: "impact", label: "Impact" },
    ...(nConflicts ? [{ id: "conflicts" as const, label: "Disagree", count: nConflicts }] : []),
    { id: "sources", label: "Sources" },
  ];
  const spy = useScrollSpy(
    scroller,
    items.map((x) => x.id),
  );
  useEffect(() => onScrolled(spy.scrolled), [spy.scrolled, onScrolled]);
  useEffect(() => () => onScrolled(false), [onScrolled]);

  const [pulse, setPulse] = useState<Partial<Record<InspectorSection, number>>>({});
  const jump = useCallback(
    (id: InspectorSection, opts?: { pulse?: boolean }) => {
      const el = scroller.current;
      const target = el?.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (!el || !target) return;
      scrollInspectorTo(el, target, !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (opts?.pulse) setPulse((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
    },
    [scroller],
  );

  // the guided demo (and select(id, {section})) points at a section: scroll the inspector to it and pulse its title once
  useEffect(() => {
    if (!section) return;
    const t = window.setTimeout(() => jump(section, { pulse: true }), 80);
    return () => window.clearTimeout(t);
  }, [section, jump]);

  return (
    <div ref={scroller} data-inspector-scroll="" className="scroll-thin relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-(--panel-pad)">
      {/* 2 · titles */}
      {/* phone: spacing tight enough that the question box clears the footer at the 64dvh opening height */}
      <div className={clsx(phone ? "space-y-2 pt-0.5" : "space-y-3.5 pt-0.5")}>
        <ProjectHeading p={a} role="a" compact={phone} />
        <ProjectHeading p={b} role="b" compact={phone} />
      </div>
      {/* 3 · tiles + chips ("Why #01?" sits on the verdict line) */}
      <div className={clsx(phone ? "mt-2.5" : "mt-3.5 space-y-2.5")}>
        <Tiles m={m} compact={phone} />
        {!phone && <Chips m={m} onJump={(id) => jump(id, { pulse: true })} />}
      </div>
      {/* 4 · the ask (phone: before the chips, so the 64dvh sheet shows it) */}
      <div className={phone ? "mt-2 space-y-2.5" : "mt-3"}>
        <ReviewQuestion m={m} compact={phone} />
        {phone && <Chips m={m} onJump={(id) => jump(id, { pulse: true })} />}
      </div>
      {/* 5 · why flagged, 6 · reviewer */}
      <div className="mt-5 space-y-4 pb-5">
        <WhyFlagged m={m} />
        <ReviewPanel m={m} />
      </div>
      {/* 7 · section nav, 8 · sections */}
      <SectionNav items={items} active={spy.active} onJump={(id) => jump(id)} stuck={spy.stuck} />
      <PlaceSection m={m} a={a} b={b} pulse={pulse.place} />
      <ScheduleSection m={m} a={a} b={b} pulse={pulse.schedule} />
      <CoordinationSection m={m} a={a} b={b} pulse={pulse.coordination} />
      <ImpactSection m={m} pulse={pulse.impact} />
      {nConflicts > 0 && <ConflictSection m={m} a={a} b={b} pulse={pulse.conflicts} />}
      <NotesSection a={a} b={b} />
      <SourcesSection m={m} a={a} b={b} pulse={pulse.sources} />
      {/* 10 · disclaimer, once */}
      <p className="border-t border-divider pt-4 pb-6 text-caption text-pretty text-fg-3">
        A match is a review lead, not a finding that resources can be shared. Engine <span className="num">{m.engineVersion}</span>.
      </p>
    </div>
  );
}
