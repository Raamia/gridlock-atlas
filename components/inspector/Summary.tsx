"use client";

import clsx from "clsx";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SNAPSHOT } from "@/lib/data";
import { buildBrief } from "@/lib/brief";
import { displayTitle, whyFlagged } from "@/lib/describe";
import type { Match, Project } from "@/lib/domain/types";
import { rankLabel } from "@/lib/rank";
import { sponsorReplay } from "@/lib/sponsor";
import { useAtlas, type InspectorSection } from "@/lib/store";
import { Eyebrow, SignalFact, Tag, Tooltip } from "../ui";
import {
  beyondChip,
  conflictSplit,
  coordinationTile,
  distanceTile,
  ownerFull,
  ownerShort,
  projectFacts,
  timingTile,
  type TileFact,
} from "./facts";

/* ───────────────────────────── titles (owner first) ───────────────────────────── */

/**
 * Owner (label, utility colour) · title (heading, 2 lines) · status and published facts, each linked to its excerpt.
 * `compact` (phone sheet): owner and title share one line, and "All N pairs" joins the facts line.
 */
export function ProjectHeading({
  p,
  role,
  compact,
}: {
  p: Project;
  role: "a" | "b";
  compact?: boolean;
}) {
  const run = useAtlas((s) => s.run);
  const focus = useAtlas((s) => s.focus);
  const pairs = useMemo(
    () =>
      run?.matches.filter((x) => x.projectAId === p.id || x.projectBId === p.id)
        .length ?? 0,
    [run, p.id],
  );
  const focused = focus?.kind === "project" && focus.id === p.id;
  const facts = projectFacts(p);
  const flyTo = () => {
    // the map may listen for this (camera to one project); harmless when nothing does
    window.dispatchEvent(
      new CustomEvent("atlas:fly-to-project", { detail: { projectId: p.id } }),
    );
  };
  const owner = (
    <span
      className="eyebrow min-w-0 truncate"
      style={{ color: `var(--util-${role})` }}
      title={ownerFull(p)}
    >
      {ownerShort(p)}
      <span className="sr-only"> ({ownerFull(p)})</span>
    </span>
  );
  const allPairs = pairs >= 2 && (
    <button
      type="button"
      aria-pressed={focused}
      onClick={() => {
        const st = useAtlas.getState();
        if (focused) st.setFocus(null);
        else st.focusProject(p.id);
      }}
      className="-mr-1 ml-auto shrink-0 rounded-chip px-1 text-caption font-medium text-fg-3 transition-colors duration-150 hover:text-fg-1 aria-pressed:text-fg-1"
    >
      All {pairs} pairs
      <span className={compact ? "sr-only" : undefined}>
        {" "}
        with this project
      </span>
    </button>
  );
  const title = (
    <button
      type="button"
      onClick={flyTo}
      className={clsx(
        "rounded-chip text-left transition-colors duration-150 hover:text-white",
        compact && "block w-full truncate",
      )}
    >
      {displayTitle(p)}
    </button>
  );
  if (compact)
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">{owner}</span>
          <h2
            className="min-w-0 truncate text-heading font-semibold text-fg-1"
            title={p.title}
          >
            {title}
          </h2>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <FactsLine facts={facts} />
          {allPairs}
        </div>
      </div>
    );
  return (
    <div className="min-w-0">
      <div className="flex min-h-5 items-center gap-3">
        {owner}
        {allPairs}
      </div>
      <h2
        className="mt-1 line-clamp-2 text-heading font-semibold text-balance text-fg-1"
        title={p.title}
      >
        {title}
      </h2>
      <FactsLine facts={facts} className="mt-1" />
    </div>
  );
}

function FactsLine({
  facts,
  className,
}: {
  facts: ReturnType<typeof projectFacts>;
  className?: string;
}) {
  return (
    <p
      className={clsx(
        "flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption text-fg-3",
        className,
      )}
    >
      {facts.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-fg-4">
              ·
            </span>
          )}
          {f.href ? (
            <a
              href={f.href}
              target="_blank"
              rel="noreferrer"
              title={f.title}
              className="rounded-chip underline decoration-fg-4 decoration-dotted underline-offset-[3px] transition-colors hover:text-fg-1 hover:decoration-fg-3"
            >
              {f.text}
            </a>
          ) : (
            <span title={f.title}>{f.text}</span>
          )}
        </span>
      ))}
    </p>
  );
}

/* ───────────────────────────── tiles ───────────────────────────── */

/**
 * A tile's signal fact: SignalFact's encoding, at heading size; a word value (a facility name) wraps to two lines
 * instead of truncating in a narrow tile, and a long number ("≈25.9 mi") steps down one size.
 */
function FactValue({ kind, fact }: { kind: "place" | "time"; fact: TileFact }) {
  return (
    <SignalFact
      kind={kind}
      state={fact.state}
      mono={fact.mono}
      wrap={!fact.mono}
      size={fact.mono && fact.value.length > 7 ? "body" : "heading"}
      tooltip={fact.tooltip}
      title={fact.tooltip ? undefined : fact.title}
      className="font-medium"
    >
      {fact.value}
    </SignalFact>
  );
}

/** A static Stat tile (label · value · sub) whose value may wrap. */
function Tile({
  label,
  children,
  sub,
  compact,
}: {
  label: string;
  children: ReactNode;
  sub: ReactNode;
  compact?: boolean;
}) {
  return (
    // padding follows the inspector's own width (container query): 360px md panel · 384 lg · 418–440 xl
    <div
      className={clsx(
        "flex min-w-0 flex-col rounded-control bg-fill-1 px-2 @max-[340px]:px-1.5 @min-[380px]:px-2.5",
        compact ? "py-1.5" : "py-2.5",
      )}
    >
      <span
        className={clsx("eyebrow block truncate", compact ? "mb-1" : "mb-2")}
      >
        {label}
      </span>
      {children}
      <span className={clsx("block text-caption text-pretty text-fg-3", compact ? "mt-0.5" : "mt-1")}>
        {sub}
      </span>
    </div>
  );
}

export function Tiles({ m, compact }: { m: Match; compact?: boolean }) {
  const d = distanceTile(m);
  const t = timingTile(m);
  const c = coordinationTile(m);
  return (
    <div className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-1.5 @max-[340px]:gap-1">
        <Tile label="Distance" sub={d.sub} compact={compact}>
          <FactValue kind="place" fact={d} />
        </Tile>
        <Tile label="Timing" sub={t.sub} compact={compact}>
          <FactValue kind="time" fact={t} />
        </Tile>
        <Tile
          compact={compact}
          label="Coordination"
          sub={
            c.caveat ? (
              <>
                <span className="block">
                  {c.sub}
                  <span className="sr-only"> · </span>
                </span>
                <span className="block text-fg-2">{c.caveat}</span>
              </>
            ) : (
              c.sub
            )
          }
        >
          <span
            className={clsx(
              "text-heading font-medium",
              c.tone === "ok" ? "text-ok" : "text-fg-1",
            )}
          >
            {c.value}
          </span>
        </Tile>
      </div>
    </div>
  );
}

/* ───────────────────────────── chips ───────────────────────────── */

/** Sperry OVL_n (→ Method "Sperry's six rows today") · Sources disagree / Date revised (→ the section) · Date passed · Beyond 25 mi. */
export function Chips({
  m,
  onJump,
}: {
  m: Match;
  onJump: (id: InspectorSection) => void;
}) {
  const run = useAtlas((s) => s.run);
  const openMethod = useAtlas((s) => s.openMethod);
  const replay = useMemo(
    () => (run ? sponsorReplay(run, SNAPSHOT) : []),
    [run],
  );
  const ovl = replay.find((r) => r.status === "in-queue" && r.matchId === m.id);
  const { live, revised } = conflictSplit(m);
  const beyond = beyondChip(m);
  if (!ovl && !live && !revised && !m.pastDue?.length && !beyond) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ovl && (
        <Tooltip
          content={`Row ${ovl.id} of Sperry's worked example: ${ovl.sponsorMiles} mi / ${ovl.sponsorDays} d in the starter file${
            ovl.miles !== undefined
              ? `; ${ovl.miles.toFixed(2)} mi / ${ovl.daysAtLeast ? "≥" : ""}${ovl.days ?? "—"} d on today's plans`
              : ""
          }`}
        >
          <Tag
            mono
            tone="neutral"
            onClick={() => openMethod("sperry-rows")}
            aria-label={`Sperry ${ovl.id}: open Sperry's six rows today in Method`}
          >
            Sperry {ovl.id}
          </Tag>
        </Tooltip>
      )}
      {live > 0 ? (
        <Tooltip
          content={`${live} current source disagreement${live === 1 ? "" : "s"} about dates, all kept side by side`}
        >
          <Tag
            tone="warn"
            icon={<AlertTriangle aria-hidden size={12} strokeWidth={2} />}
            onClick={() => onJump("conflicts")}
          >
            Sources disagree
          </Tag>
        </Tooltip>
      ) : revised > 0 ? (
        <Tooltip content="A newer edition of the plan moved this date; both are kept.">
          <Tag tone="muted" onClick={() => onJump("conflicts")}>
            Date revised
          </Tag>
        </Tooltip>
      ) : null}
      {!!m.pastDue?.length && (
        <Tooltip content="Planned date passed; completion not confirmed">
          <Tag tone="neutral" tabIndex={0}>
            Date passed
          </Tag>
        </Tooltip>
      )}
      {beyond && (
        <Tooltip content={beyond.tooltip}>
          <Tag tone="neutral" tabIndex={0}>
            {beyond.text}
          </Tag>
        </Tooltip>
      )}
    </div>
  );
}

/* ───────────────────────────── "Why #01?" ───────────────────────────── */

/** The "Why #01?" disclosure trigger (on the verdict line, beside the rank's guidance). */
export function WhyRankButton({
  rank,
  open,
  onToggle,
  controls,
}: {
  rank?: number;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="group/why -mr-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-chip px-1 text-caption font-medium text-fg-2 transition-colors hover:text-fg-1 aria-expanded:text-fg-1 coarse:-my-2.5 coarse:h-11"
    >
      {rank ? `Why #${rankLabel(rank)}?` : "Why this rank?"}
      <ChevronDown
        aria-hidden
        size={12}
        strokeWidth={2}
        className="text-fg-3 transition-transform duration-200 ease-enter group-aria-expanded/why:rotate-180"
      />
    </button>
  );
}

/** The disclosed reasons: the engine's own `priorityReasons`, then the priority as an explainable ordering. */
export function WhyRankReasons({
  m,
  open,
  id,
}: {
  m: Match;
  open: boolean;
  id: string;
}) {
  return (
    <div
      id={id}
      className="grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-300 ease-enter"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        <div className="pt-2.5">
          <ul className="space-y-1">
            {m.priorityReasons.map((r) => (
              <li key={r} className="flex gap-2 text-caption text-fg-2">
                <span
                  aria-hidden
                  className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-4"
                />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-caption text-fg-3">
            Priority <span className="num text-fg-2">{m.priority}</span> — an
            explainable ordering, not a probability.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── question + why flagged ───────────────────────────── */

export function ReviewQuestion({
  m,
  compact,
}: {
  m: Match;
  compact?: boolean;
}) {
  const q = useMemo(() => buildBrief(m).question, [m]);
  return (
    <div
      className={clsx(
        "rounded-card bg-fill-1",
        compact ? "px-3 pt-2 pb-2.5" : "px-3.5 pt-3 pb-3.5",
      )}
    >
      <Eyebrow>Question for the planners</Eyebrow>
      <p
        className={clsx(
          "text-pretty text-fg-1",
          compact ? "mt-1 text-ui" : "mt-2 text-body",
        )}
      >
        {q}
      </p>
    </div>
  );
}

/** whyFlagged(m) verbatim, clamped to three lines; the full sentence stays in the DOM. */
export function WhyFlagged({ m }: { m: Match }) {
  const text = whyFlagged(m);
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <div>
      <Eyebrow>Why flagged</Eyebrow>
      <p
        ref={ref}
        className={clsx(
          "mt-2 text-ui text-pretty text-fg-2",
          !open && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {(clipped || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="-mx-1 mt-1 rounded-chip px-1 text-caption font-medium text-fg-2 hover:text-fg-1"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}
