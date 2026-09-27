"use client";

/**
 * Review brief: a light paper document over a soft blurred scrim. The role=dialog element is the full-screen scroll
 * wrapper, so the toolbar (Copy Markdown FIRST, Download .md, Print / PDF, Close brief) lives inside the dialog and
 * its focus trap. It stays a DIRECT child of .atlas-shell: the print CSS prints `.atlas-shell > [aria-label="Review brief"]`
 * alone, on as many pages as it needs, with every source a clickable <a href> inside `ol > li`.
 * During the guided demo (step 8) its card pins bottom-left above this dialog: the document shifts right by the card's
 * width (lg+) or keeps its end clear of it (`data-demo` + `--demo-card-h`, globals.css), and the card joins the Tab cycle.
 */

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BadgeCheck, CalendarRange, Check, Copy, Download, MapPin, Printer, ShieldQuestion, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { buildBrief, briefToMarkdown, type Brief, type BriefCitation } from "@/lib/brief";
import { IDX, SNAPSHOT } from "@/lib/data";
import { displayTitle, geoShort, timeShort } from "@/lib/describe";
import type { Match, SignalLevel } from "@/lib/domain/types";
import { useDialogFocus } from "@/lib/focus";
import { formatDate } from "@/lib/format";
import { useSelectedPair, type SelectedPair } from "@/lib/hooks";
import { useReview } from "@/lib/review";
import { ownerNames } from "@/lib/selectors";
import { useAtlas } from "@/lib/store";
import { Button, IconButton, LogoMark, StatusTag, Tag } from "./ui";

const DEMO_COMPANION = { companion: () => document.querySelector<HTMLElement>('[aria-label="Guided demo"]') };
const EASE = [0.22, 1, 0.36, 1] as const;

type CopyState = "idle" | "copied" | "failed";

export function BriefModal() {
  const open = useAtlas((s) => s.briefOpen);
  const demo = useAtlas((s) => s.demoStep !== null);
  const set = useAtlas((s) => s.set);
  const pair = useSelectedPair();
  const brief = useMemo(() => (pair ? buildBrief(pair.match) : null), [pair]);
  const md = useMemo(() => (brief ? briefToMarkdown(brief) : ""), [brief]);
  const dialog = useRef<HTMLDivElement>(null);
  // during the guided demo its card rides above the scrim: Tab reaches its Previous / Finish, and Space on Next stays there
  useDialogFocus(dialog, open && !!pair, demo ? DEMO_COMPANION : undefined);
  const close = () => set({ briefOpen: false });

  return (
    <AnimatePresence>
      {open && pair && brief && (
        <motion.div
          ref={dialog}
          key="brief"
          role="dialog"
          aria-modal="true"
          aria-label="Review brief"
          data-demo={demo || undefined}
          data-scrim=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          // the scrim (and the empty gutters beside the document) close it; the document and toolbar never do
          onMouseDown={(e) => (e.target as HTMLElement).dataset.scrim !== undefined && close()}
          className={clsx(
            "scroll-thin fixed inset-0 z-(--z-dialog) overflow-y-auto overscroll-contain bg-canvas/75 px-2 pb-8 backdrop-blur-md sm:px-6 sm:pb-12",
            // step 8 of the guided demo: its card is pinned bottom-left (gutter, 400 wide); the document moves right of it
            demo && "lg:pl-[calc(var(--gutter)+416px)]",
            "print:static print:overflow-visible print:bg-white print:p-0 print:backdrop-blur-none",
          )}
        >
          <div data-scrim="" className="mx-auto w-full max-w-[760px] print:max-w-none">
            <Toolbar md={md} matchId={pair.match.id} onClose={close} />
            <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.38, ease: EASE }}>
              <BriefDocument pair={pair} brief={brief} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────── toolbar ─────────────────────────────────────────────── */

function Toolbar({ md, matchId, onClose }: { md: string; matchId: string; onClose: () => void }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (s: CopyState) => {
    setState(s);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), s === "copied" ? 1600 : 6000);
  };
  const copy = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    try {
      await navigator.clipboard.writeText(md);
      return flash("copied");
    } catch {
      // clipboard API blocked (permissions, insecure context): fall back to a selected textarea inside the dialog
      const ta = document.createElement("textarea");
      ta.value = md;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
      button.parentElement?.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      button.focus();
      flash(ok ? "copied" : "failed");
    }
  };
  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gridlock-brief-${matchId}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div data-scrim="" className="no-print sticky top-0 z-10 pt-[max(12px,var(--safe-t))] pb-3 sm:pt-6">
      {/* solid enough to stay distinct over the paper as it scrolls beneath */}
      <div className="flex items-center gap-1 rounded-full border border-edge bg-surface-solid/90 p-1.5 shadow-[0_10px_28px_-14px_rgb(34_61_67/0.28)] backdrop-blur-chrome">

        <Button
          variant="primary"
          size="md"
          onClick={copy}
          icon={state === "copied" ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
          className="min-w-[132px]"
        >
          {state === "copied" ? "Copied" : "Copy Markdown"}
        </Button>
        <Button variant="ghost" size="md" onClick={download} icon={<Download size={14} strokeWidth={1.75} />} aria-label="Download .md" className="max-sm:w-8 max-sm:px-0">
          <span className="max-sm:hidden">Download .md</span>
        </Button>
        <Button variant="ghost" size="md" onClick={() => window.print()} icon={<Printer size={14} strokeWidth={1.75} />} aria-label="Print / PDF" className="max-sm:w-8 max-sm:px-0">
          <span className="max-sm:hidden">Print / PDF</span>
        </Button>
        <span role="status" aria-live="polite" className={clsx("min-w-0 flex-1 truncate px-2 text-right text-caption", state === "failed" ? "text-warn" : "text-fg-3")}>
          {state === "failed" ? "Couldn't copy — use Download .md instead" : state === "copied" ? <span className="max-sm:sr-only">Markdown copied</span> : ""}
        </span>
        <IconButton label="Close brief" tooltip="Close · Esc" tooltipSide="bottom" onClick={onClose}>
          <X size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── document ─────────────────────────────────────────────── */

/** Excerpt text + source title → evidence ids, to tell which cited excerpts this browser's reviewer has checked. */
let EVIDENCE_BY_CITE: Map<string, string[]> | null = null;
function evidenceIdsFor(c: BriefCitation): string[] {
  if (!EVIDENCE_BY_CITE) {
    EVIDENCE_BY_CITE = new Map();
    for (const e of Object.values(SNAPSHOT.evidence)) {
      const key = `${IDX.source(e.sourceId)?.title ?? e.sourceId}|${e.exactExcerpt}`;
      EVIDENCE_BY_CITE.set(key, [...(EVIDENCE_BY_CITE.get(key) ?? []), e.id]);
    }
  }
  return EVIDENCE_BY_CITE.get(`${c.title}|${c.excerpt}`) ?? [];
}

const LEVEL_WORD: Record<SignalLevel, string> = { confirmed: "confirmed", possible: "possible", unknown: "unknown", "no-match": "no overlap" };

function BriefDocument({ pair, brief }: { pair: SelectedPair; brief: Brief }) {
  const m = pair.match;
  const checked = useReview((s) => s.checked);
  const [flash, setFlash] = useState<number | null>(null);
  const flashTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const mine = useMemo(() => new Set(brief.citations.filter((c) => evidenceIdsFor(c).some((id) => checked[id])).map((c) => c.n)), [brief, checked]);
  const verbatim = brief.citations.filter((c) => c.provenance.startsWith("located verbatim")).length;
  const cites = brief.citations.length;
  const human = brief.citations.filter((c) => /human-checked/.test(c.provenance)).length;
  const byYou = brief.citations.filter((c) => mine.has(c.n) && !/human-checked/.test(c.provenance)).length;
  const waiting = cites - human - byYou;
  // never a hard-coded "awaiting human check": it reads what the citations (and this browser's reviewer) say
  const checks = [
    human && `${human} human-checked`,
    byYou && `${byYou} checked by you in this browser`,
    waiting && (waiting === cites ? "awaiting human check" : `${waiting} awaiting human check`),
  ].filter(Boolean);
  const provenance = [
    "Built from snapshot fields only",
    "every fact carries a numbered source",
    `${verbatim === cites ? (cites === 1 ? "its excerpt" : `all ${cites} excerpts`) : `${verbatim} of ${cites} excerpts`} re-found verbatim by script, ${checks.join(", ")}`,
  ];

  const jump = (n: number) => {
    const el = document.getElementById(`brief-src-${n}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setFlash(n);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  };
  const cited = (text: string) => <Cited text={text} onJump={jump} />;

  const why = brief.rows.find((r) => r.label === "Why flagged");
  const coordination = brief.rows.find((r) => r.label === "Coordination status");
  const other = brief.rows.filter((r) => !["Pair", "Why flagged", "Coordination status"].includes(r.label));

  return (
    <article className="theme-paper relative rounded-dialog bg-surface-solid px-5 pt-7 pb-8 shadow-[0_2px_0_rgb(255_255_255/0.8)_inset,0_40px_120px_-34px_rgb(34_61_67/0.38),0_12px_32px_-14px_rgb(34_61_67/0.22)] sm:px-10 sm:pt-10 sm:pb-10 print:rounded-none print:bg-white print:p-0 print:shadow-none">
      {/* masthead */}
      <header>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="eyebrow text-fg-2">GridLock Atlas · Cited review brief</span>
          </span>
          <span className="eyebrow hidden text-right sm:inline">Snapshot {formatDate(SNAPSHOT.snapshotDate)}</span>
        </div>
        <h2 className="mt-6 font-display text-[40px] leading-none font-normal tracking-[-0.01em] text-fg-1 sm:text-[44px]">Review brief</h2>
        <p className="mt-3 max-w-[64ch] text-caption text-pretty text-fg-3">{provenance.join(" · ")}.</p>
      </header>

      {/* the pair: who to call, owner first */}
      <div className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-divider pt-6 sm:grid-cols-2">
        <PairSide role="a" owners={ownerNames(pair.a, IDX)} title={displayTitle(pair.a)} />
        <PairSide role="b" owners={ownerNames(pair.b, IDX)} title={displayTitle(pair.b)} />
      </div>
      <Chips m={m} />

      {/* the ask first */}
      <section aria-label="Review question" className="mt-7 rounded-r-card border-l-[3px] border-overlap bg-overlap-wash py-4 pr-5 pl-5 print:break-inside-avoid">
        <h3 className="eyebrow text-overlap">Review question</h3>
        <p className="mt-2.5 text-heading leading-[1.5] font-medium text-pretty text-fg-1">{brief.question}</p>
      </section>

      <dl className="mt-8 space-y-6">
        {why && (
          <Row label="Why flagged">
            <div className="space-y-2.5">
              {why.text.split("\n").map((line) => {
                const hit = line.match(/^(GEO|TIME) \(([^)]+)\) — ([\s\S]*)$/);
                if (!hit) return <p key={line}>{cited(line)}</p>;
                const [, kind, level, rest] = hit;
                return (
                  <p key={line} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                    <span className="pt-px text-caption font-medium text-fg-1">
                      {kind === "GEO" ? "Place" : "Time"}
                      <span className="block font-normal text-fg-3">{LEVEL_WORD[level as SignalLevel] ?? level}</span>
                    </span>
                    <span>{cited(rest)}</span>
                  </p>
                );
              })}
            </div>
          </Row>
        )}
        {coordination && <Row label="Coordination status">{cited(coordination.text)}</Row>}
        {other.map((r) => (
          <Row key={r.label} label={r.label}>
            {cited(r.text)}
          </Row>
        ))}
        {brief.unresolved.length > 0 && (
          <Row label="Unresolved" tone="warn">
            <ul className="space-y-2">
              {brief.unresolved.map((u) => (
                <li key={u} className="relative pl-4">
                  <span aria-hidden className="absolute top-[9px] left-0 size-[5px] rounded-full bg-warn" />
                  {cited(u)}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>

      {/* sources: numbered, each one a real link (print keeps them clickable) */}
      <section aria-labelledby="brief-sources" className="mt-9 border-t border-divider pt-6">
        <h3 id="brief-sources" className="flex items-baseline gap-2">
          <span className="eyebrow text-fg-2">Sources</span>
          <span className="num text-caption text-fg-3">{cites}</span>
        </h3>
        <ol className="mt-3">
          {brief.citations.map((c) => (
            <li
              key={c.n}
              id={`brief-src-${c.n}`}
              className={clsx(
                "-mx-3 grid scroll-mt-24 grid-cols-[24px_minmax(0,1fr)] gap-2 rounded-card px-3 py-3 transition-colors duration-500 print:break-inside-avoid",
                flash === c.n ? "bg-overlap-wash" : "bg-transparent",
              )}
            >
              <span className="num pt-px text-caption text-fg-3">{c.n}.</span>
              <div className="min-w-0 text-ui">
                <p className="text-fg-2">
                  <span className="font-medium text-fg-1">{c.publisher}</span>
                  {c.documentDate && <span className="text-fg-3"> · {formatDate(c.documentDate)}</span>}
                  {c.anchor && <span className="text-fg-3"> · {c.anchor}</span>}
                </p>
                <p className="mt-0.5 text-fg-2 italic">{c.title}</p>
                <blockquote className="mt-1.5 border-l-2 border-edge-strong pl-3 text-fg-1">“{c.excerpt}”</blockquote>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                  <a href={c.url} target="_blank" rel="noreferrer" className="num min-w-0 break-all text-util-a underline-offset-2 hover:underline">
                    {c.url.replace(/^https?:\/\//, "").slice(0, 72)}
                    {c.url.replace(/^https?:\/\//, "").length > 72 ? "…" : ""}
                  </a>
                  <span className="inline-flex items-center gap-1 text-fg-3">
                    {c.provenance.startsWith("located verbatim") ? (
                      <BadgeCheck aria-hidden size={12} strokeWidth={1.75} className="text-ok" />
                    ) : (
                      <ShieldQuestion aria-hidden size={12} strokeWidth={1.75} className="text-warn" />
                    )}
                    {c.provenance}
                    {mine.has(c.n) && !/human-checked/.test(c.provenance) && <span className="text-ok"> · checked by you in this browser</span>}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-8 flex items-start gap-3 border-t border-divider pt-5">
        <LogoMark size={16} className="mt-px" />
        <p className="text-caption text-pretty text-fg-3">{brief.footer}</p>
      </footer>
    </article>
  );
}

function PairSide({ role, owners, title }: { role: "a" | "b"; owners: string; title: string }) {
  return (
    <div className={clsx("border-l-2 pl-3.5", role === "a" ? "border-util-a" : "border-util-b")}>
      <p className={clsx("eyebrow leading-[1.35]", role === "a" ? "text-util-a" : "text-util-b")}>{owners}</p>
      <p className="mt-1.5 text-heading font-semibold text-pretty text-fg-1">{title}</p>
    </div>
  );
}

/** Plain-word chips: status, place, time, and the caveats that change the call. */
function Chips({ m }: { m: Match }) {
  const closest = m.geoDetail.method === "measured" ? m.geoDetail.closest : undefined;
  // a crossing is a zero-mile approach, not a measured gap; a digitized or inferred line path makes the distance an estimate
  const place = closest?.touching ? "touching / crossing" : `${geoShort(m).text}${closest?.approximate ? " (estimated)" : ""}`;
  const t = timeShort(m);
  const timeText = ["Schedule unknown", "No window overlap", "—"].includes(t) ? "" : m.time === "unknown" ? `in-service ${t}` : t;
  const disputed = m.conflicts.some((c) => !c.versionOnly);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-1.5">
      <StatusTag status={m.reviewStatus} size="md" />
      <Tag icon={<MapPin size={12} strokeWidth={1.75} aria-hidden />} title="Place signal (closest points of the two projects' work, or a shared facility)">
        Place {LEVEL_WORD[m.geo]} · {place}
      </Tag>
      <Tag icon={<CalendarRange size={12} strokeWidth={1.75} aria-hidden />} title="Time signal (published construction windows or schedules)">
        Time {LEVEL_WORD[m.time]}
        {timeText && ` · ${timeText}`}
      </Tag>
      {m.conflicts.length > 0 &&
        (disputed ? (
          <Tag tone="warn" icon={<AlertTriangle size={12} strokeWidth={1.75} aria-hidden />} title="Current sources give different dates; all claims are kept">
            Sources disagree
          </Tag>
        ) : (
          <Tag tone="muted" title="A newer plan edition moved a date; the older one is kept as version history">
            Date revised
          </Tag>
        ))}
      {m.pastDue?.length ? (
        <Tag tone="muted" title="Planned date passed; completion not confirmed">
          Date passed
        </Tag>
      ) : null}
      {m.beyondRadius && (
        <Tag tone="muted" title="Flagged through a shared facility; the closest points are beyond the review radius">
          Beyond {m.geoDetail.thresholdMiles} mi · shared site
        </Tag>
      )}
    </div>
  );
}

function Row({ label, tone, children }: { label: string; tone?: "warn"; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-6 print:break-inside-avoid">
      <dt className={clsx("eyebrow pt-[5px] leading-[1.3]", tone === "warn" ? "text-warn" : "text-fg-2")}>{label}</dt>
      <dd className="text-body text-pretty text-fg-1">{children}</dd>
    </div>
  );
}

/** Text with its " [1, 2]" citation marks turned into small numbered links to the sources list. */
function Cited({ text, onJump }: { text: string; onJump: (n: number) => void }) {
  const parts = text.split(/(\s?\[\d+(?:,\s*\d+)*\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const nums = p.match(/^\s?\[(\d+(?:,\s*\d+)*)\]$/)?.[1];
        if (!nums) return <Fragment key={i}>{p}</Fragment>;
        const list = nums.split(/,\s*/).map(Number);
        return (
          <span key={i} className="num ml-1 text-[11px] whitespace-nowrap text-fg-3">
            [
            {list.map((n, j) => (
              <Fragment key={n}>
                {j > 0 && ", "}
                <a
                  href={`#brief-src-${n}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onJump(n);
                  }}
                  className="rounded-[3px] text-fg-2 underline-offset-2 hover:text-fg-1 hover:underline"
                  aria-label={`Source ${n}`}
                >
                  {n}
                </a>
              </Fragment>
            ))}
            ]
          </span>
        );
      })}
    </>
  );
}
