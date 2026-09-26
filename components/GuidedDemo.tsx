"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SNAPSHOT } from "@/lib/data";
import type { Match, MatchRun } from "@/lib/domain/types";
import { useAtlas, type FlagFilter, type InspectorSection } from "@/lib/store";
import { Button, IconButton, Kbd } from "./ui";

interface Step {
  title: string;
  body: string;
  run: () => Promise<void> | void;
}

const FEATURED = ["dpc-alma-blair", "xcel-wwtc"];
/** The narration quotes the sponsor's radius, so the demo always runs at it. */
const DEMO_RADIUS = 25;
const ALL_FLAGS: FlagFilter[] = ["BOTH", "GEO", "TIME", "POSSIBLE"];

function featured(run: MatchRun | null) {
  return run?.matches.find((m) => FEATURED.includes(m.projectAId) && FEATURED.includes(m.projectBId)) ?? null;
}

/** Top-ranked Savannah River lead: DESC × Georgia Power, place confirmed, not already coordinated. */
function topSoutheast(run: MatchRun | null) {
  const inSE = (id: string) => SNAPSHOT.projects.find((p) => p.id === id)?.region === "southeast";
  return run?.matches.find((m) => inSE(m.projectAId) && m.geo === "confirmed" && m.reviewStatus === "needs-review") ?? run?.matches.find((m) => inSE(m.projectAId)) ?? null;
}

/** Each step run gets a token; work that resolves after the user moved on (or left the demo) is dropped. */
let stepToken = 0;
const stale = (token: number) => token !== stepToken || useAtlas.getState().demoStep === null;

async function ensureRun() {
  const st = useAtlas.getState();
  return st.run?.thresholdMiles === DEMO_RADIUS ? st.run : await st.compare({ thresholdMiles: DEMO_RADIUS });
}

type Patch = Partial<ReturnType<typeof useAtlas.getState>>;

function open(pick: (run: MatchRun | null) => Match | null, section: InspectorSection | null, extra: (m: Match) => Patch = () => ({})) {
  return async () => {
    const token = stepToken;
    const run = await ensureRun();
    if (stale(token)) return;
    const m = pick(run);
    if (!m) return;
    const st = useAtlas.getState();
    if (st.selectedMatchId !== m.id) st.select(m.id, { section: section ?? undefined });
    // the queue shows the pair under its own category, the one the narration names
    useAtlas.setState({ inspectorOpen: true, inspectorSection: section, tab: m.reviewStatus, briefOpen: false, sourcesOpen: false, methodOpen: false, highlightConflict: false, focusConflict: null, ...extra(m) });
  };
}

/** The conflict step 7 narrates: WWTC's completion dates (Xcel's page vs. the PSC filings), led and scrolled to by the inspector. */
function wwtcCompletion(m: Match) {
  return (m.conflicts.find((c) => c.field === "completion" && c.projectId === FEATURED[1]) ?? m.conflicts.find((c) => c.field === "completion"))?.id ?? null;
}

const STEPS: Step[] = [
  {
    title: "Two utilities, two separate plans",
    body: "Dominion Energy South Carolina (cyan) and Georgia Power (violet) publish their future transmission work in separate documents — an SCRTP project list and an IRP ten-year plan. Here they are on one map for the first time.",
    run: () => {
      // "for the first time": no earlier comparison, radius or tab carries into the opening beat
      useAtlas.getState().resetRun();
      const region = SNAPSHOT.regions.some((r) => r.id === "southeast") ? "southeast" : (SNAPSHOT.regions[0]?.id ?? "all");
      useAtlas.setState((s) => ({
        region,
        selectedMatchId: null,
        inspectorOpen: false,
        briefOpen: false,
        sourcesOpen: false,
        methodOpen: false,
        highlightConflict: false,
        focusConflict: null,
        hoveredMatchId: null,
        utilityFilter: null,
        flags: ALL_FLAGS,
        cameraNonce: s.cameraNonce + 1,
      }));
    },
  },
  {
    title: "Compare public plans",
    body: `The deterministic engine measures every cross-utility pair center-to-center and keeps those within ${DEMO_RADIUS} miles — or that share a facility — then ranks them by closeness and timing. Amber links mark every flagged pair.`,
    run: async () => {
      const token = stepToken;
      await useAtlas.getState().compare({ thresholdMiles: DEMO_RADIUS });
      if (stale(token)) return;
      useAtlas.setState((s) => ({ tab: "needs-review", selectedMatchId: null, inspectorOpen: false, sourcesOpen: false, methodOpen: false, cameraNonce: s.cameraNonce + 1 }));
    },
  },
  {
    title: "The top coordination opportunity",
    body: "The highest-ranked Savannah River pair: where each project's terminals are, how far apart the centers are, and how precise each location is.",
    run: open(topSoutheast, "place"),
  },
  {
    title: "When they build",
    body: "Windows are compared source by source. Where a plan gives only a start and need date, or budget years, the overlap can only be “possible”; the gap between in-service dates is the secondary signal.",
    run: open(topSoutheast, "schedule"),
  },
  {
    title: "A rough, sourced impact estimate",
    body: "What one shared corridor could avoid encumbering twice. Equipment work, rebuilds on existing right-of-way and lines that only meet at a substation start at 0 mi; defaults cite public sources where one exists, anything unsourced is marked, and every input is editable — a scenario, not a saving.",
    run: open(topSoutheast, "impact"),
  },
  {
    title: "Known coordination is kept separate",
    body: "In Wisconsin, the PSC decision has Dairyland's line ending at Tremval North, the substation approved for Xcel's project. GridLock files it under Known coordination — a known interface, not a new gap.",
    run: open(featured, "coordination"),
  },
  {
    title: "Sources disagree — both are kept",
    body: "Xcel's page and the Wisconsin PSC give different completion dates. Both are kept side by side and every source's own construction window is compared; the in-service gap (secondary signal) uses NSPW's latest filing, Q3 2029.",
    run: open(featured, "conflicts", (m) => ({ highlightConflict: true, focusConflict: wwtcCompletion(m) })),
  },
  {
    title: "Export a cited review brief",
    body: "One question a planner can act on, with every fact numbered to a short excerpt and page. It never contacts a utility.",
    run: async () => {
      const token = stepToken;
      await open(topSoutheast, "coordination")();
      if (stale(token)) return;
      useAtlas.setState({ briefOpen: true });
    },
  },
];

export function GuidedDemo() {
  const step = useAtlas((s) => s.demoStep);
  const briefOpen = useAtlas((s) => s.briefOpen);
  const inspectorOpen = useAtlas((s) => s.inspectorOpen && s.selectedMatchId !== null);
  const drawerOpen = useAtlas((s) => s.sourcesOpen || s.methodOpen);
  const set = useAtlas((s) => s.set);
  // phones: with the inspector sheet up, the card shrinks to its title, two lines and the buttons, so the pair keeps a strip of map
  const compact = inspectorOpen && !briefOpen;
  const [more, setMore] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);
  const active = step !== null;
  // the demo opened the brief on its last beat, so leaving the demo closes it too
  const end = () => set({ demoStep: null, briefOpen: false, highlightConflict: false, focusConflict: null });

  const go = useCallback(
    (n: number) => {
      const k = Math.max(0, Math.min(STEPS.length - 1, n));
      stepToken++;
      setMore(false);
      set({ demoStep: k });
      void STEPS[k].run();
    },
    [set],
  );

  useEffect(() => {
    // entering or leaving the demo (card X, Finish, top-bar Exit, Escape) drops any step still waiting on the engine
    stepToken++;
    const was = wasActive.current;
    wasActive.current = active;
    if (active) {
      if (step === 0) void STEPS[0].run();
      // off the top-bar toggle (now "Exit demo"), so Space / Enter advance the demo instead of ending it
      const id = requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(id);
    }
    // the card's buttons leave with it: hand focus back to the toggle rather than dropping it to <body>
    const el = document.activeElement;
    if (was && (!el || el === document.body || card.current?.contains(el))) document.getElementById("demo-toggle")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Previous disables itself on step 1, and an arrow-key step can leave focus on <body>: hand it to the primary button
  useEffect(() => {
    if (step === null) return;
    const id = requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!el || el === document.body || (el instanceof HTMLButtonElement && el.disabled && card.current?.contains(el))) nextRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      // never step the demo behind a drawer: its backdrop covers this card (the brief does not, so no brief guard)
      const st = useAtlas.getState();
      if (st.sourcesOpen || st.methodOpen) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  // with the brief open below lg, the card rides over the brief's bottom: publish its height so the brief can scroll clear of it
  useEffect(() => {
    const el = card.current;
    if (!el || !briefOpen) return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => root.setProperty("--demo-card-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--demo-card-h");
    };
  }, [briefOpen, active]);

  // phones: publish the card's bottom edge so the inspector sheet starts below it, leaving a strip of map for the pair.
  // A layout effect, so the camera (which reads the sheet's top) sees it on the same commit; the layout box, not the
  // entry animation's transform (the card is fixed there, so offsetTop is from the viewport)
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !active || briefOpen) return;
    const root = document.documentElement.style;
    const upd = () => {
      if (getComputedStyle(el).position === "fixed") root.setProperty("--demo-card-bottom", `${el.offsetTop + el.offsetHeight}px`);
      else root.removeProperty("--demo-card-bottom");
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--demo-card-bottom");
    };
  }, [active, briefOpen, compact]);

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          key="demo"
          ref={card}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={clsx(
            "fixed left-3 right-3 sm:right-auto sm:w-[440px]",
            // with the brief open the card rides above its backdrop, pinned to the viewport corner, so Finish stays reachable
            // phones: above the inspector sheet (z-40), but behind an open drawer (z-40) as on desktop
            briefOpen ? "bottom-3 z-[60] sm:bottom-4 sm:left-4" : clsx("top-[60px] sm:absolute sm:bottom-4 sm:left-4 sm:top-auto sm:z-30", drawerOpen ? "z-30" : "z-50"),
            // stay left of the evidence inspector (right-3 + 360/408px) with a 12px gap, so Next is never under it
            !briefOpen && inspectorOpen && "sm:max-w-[calc(100%-400px)] xl:max-w-[calc(100%-448px)]",
          )}
          role="region"
          aria-label="Guided demo"
          data-map-ui
        >
          <div className="glass glass-solid overflow-hidden rounded-2xl ring-1 ring-line-2">
            <div className="h-[2px] bg-bg-3">
              <motion.div className="h-full bg-gradient-to-r from-a to-b" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
            <div className={clsx("p-4", compact && "max-sm:p-3")}>
              <div className="flex items-center justify-between">
                <span className="eyebrow text-text-1">
                  Guided demo · {step + 1}/{STEPS.length}
                </span>
                <IconButton label="Exit demo" onClick={end} className="-mr-1.5 -mt-1.5 h-7 w-7">
                  <X size={14} />
                </IconButton>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                  <h3 className={clsx("mt-1 font-serif text-[22px] leading-[1.15] text-text-0", compact && "max-sm:text-[18px]")}>{STEPS[step].title}</h3>
                  <p id="demo-body" className={clsx("mt-1.5 text-[12.5px] leading-[1.55] text-text-1", compact && !more && "max-sm:line-clamp-2")}>
                    {STEPS[step].body}
                  </p>
                </motion.div>
              </AnimatePresence>
              <div className={clsx("mt-3.5 flex flex-wrap items-center gap-2", compact && "max-sm:mt-2")}>
                {compact && (
                  <button
                    type="button"
                    onClick={() => setMore(!more)}
                    aria-expanded={more}
                    aria-controls="demo-body"
                    className="text-[11.5px] text-text-2 underline underline-offset-2 hover:text-text-0 sm:hidden"
                  >
                    {more ? "Less" : "More"}
                  </button>
                )}
                {/* the eyebrow already counts the steps: compact phones drop the dots */}
                <div className={clsx("flex gap-1", compact && "max-sm:hidden")}>
                  {STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => go(i)}
                      aria-label={`Go to step ${i + 1}`}
                      className={clsx("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-text-0" : i < step ? "w-1.5 bg-text-2" : "w-1.5 bg-line-3")}
                    />
                  ))}
                </div>
                <span className={clsx("ml-2 hidden items-center gap-1 text-[10.5px] text-text-3", !inspectorOpen && "sm:flex")}>
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd>
                </span>
                <div className="ml-auto flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step">
                    <ArrowLeft size={13} />
                  </Button>
                  {step < STEPS.length - 1 ? (
                    <Button ref={nextRef} variant="primary" size="sm" onClick={() => go(step + 1)}>
                      Next <ArrowRight size={13} />
                    </Button>
                  ) : (
                    <Button ref={nextRef} variant="primary" size="sm" onClick={end}>
                      Finish
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
