"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { SNAPSHOT } from "@/lib/data";
import type { Match, MatchRun } from "@/lib/domain/types";
import { useAtlas, type InspectorSection } from "@/lib/store";
import { Button, IconButton, Kbd } from "./ui";

interface Step {
  title: string;
  body: string;
  run: () => Promise<void> | void;
}

const FEATURED = ["dpc-alma-blair", "xcel-wwtc"];

function featured(run: MatchRun | null) {
  return run?.matches.find((m) => FEATURED.includes(m.projectAId) && FEATURED.includes(m.projectBId)) ?? null;
}

/** Top-ranked Savannah River lead: DESC × Georgia Power, place confirmed, not already coordinated. */
function topSoutheast(run: MatchRun | null) {
  const inSE = (id: string) => SNAPSHOT.projects.find((p) => p.id === id)?.region === "southeast";
  return run?.matches.find((m) => inSE(m.projectAId) && m.geo === "confirmed" && m.reviewStatus === "needs-review") ?? run?.matches.find((m) => inSE(m.projectAId)) ?? null;
}

async function ensureRun() {
  const st = useAtlas.getState();
  return st.run ?? (await st.compare());
}

function open(pick: (run: MatchRun | null) => Match | null, section: InspectorSection | null, extra: Partial<ReturnType<typeof useAtlas.getState>> = {}) {
  return async () => {
    const run = await ensureRun();
    const m = pick(run);
    if (!m) return;
    const st = useAtlas.getState();
    if (st.selectedMatchId !== m.id) st.select(m.id, { section: section ?? undefined });
    useAtlas.setState({ inspectorOpen: true, inspectorSection: section, briefOpen: false, highlightConflict: false, ...extra });
  };
}

const STEPS: Step[] = [
  {
    title: "Two utilities, two separate plans",
    body: "Dominion Energy South Carolina and Georgia Power publish their future transmission work in separate documents — an SCRTP project list and an IRP ten-year plan. Here they are on one map for the first time.",
    run: () => {
      const region = SNAPSHOT.regions.some((r) => r.id === "southeast") ? "southeast" : (SNAPSHOT.regions[0]?.id ?? "all");
      useAtlas.setState((s) => ({ region, selectedMatchId: null, inspectorOpen: false, briefOpen: false, hoveredMatchId: null, cameraNonce: s.cameraNonce + 1 }));
    },
  },
  {
    title: "Compare public plans",
    body: "The deterministic engine measures every cross-utility pair center-to-center, keeps those within 25 miles, then ranks them by closeness and timing. Amber links mark every flagged pair.",
    run: async () => {
      await useAtlas.getState().compare();
      useAtlas.setState((s) => ({ tab: "needs-review", selectedMatchId: null, inspectorOpen: false, cameraNonce: s.cameraNonce + 1 }));
    },
  },
  {
    title: "The top coordination opportunity",
    body: "The highest-ranked Savannah River pair: where each project's terminals are, how far apart the centers are, and how precise each location is.",
    run: open(topSoutheast, "place"),
  },
  {
    title: "When they build",
    body: "Published windows are compared; where only in-service dates exist, the gap in days is the secondary signal. Nothing is inferred beyond what the sources state.",
    run: open(topSoutheast, "schedule"),
  },
  {
    title: "A rough, sourced impact estimate",
    body: "How much right-of-way one shared corridor would avoid encumbering twice — every default is a cited number, every assumption is editable, and it is labeled as a scenario, not a saving.",
    run: open(topSoutheast, "impact"),
  },
  {
    title: "Known coordination is kept separate",
    body: "In Wisconsin, the PSC decision has Dairyland's line ending at Tremval North, the substation approved for Xcel's project. GridLock files it under Known coordination — a known interface, not a new gap.",
    run: open(featured, "coordination"),
  },
  {
    title: "Sources disagree — both are kept",
    body: "Xcel's page and the Wisconsin PSC give different completion dates. The conflict is shown side by side and does not change the construction-window match.",
    run: open(featured, "conflicts", { highlightConflict: true }),
  },
  {
    title: "Export a cited review brief",
    body: "One question a planner can act on, with every fact numbered to a short excerpt and page. It never contacts a utility.",
    run: async () => {
      await open(topSoutheast, "coordination")();
      useAtlas.setState({ briefOpen: true });
    },
  },
];

export function GuidedDemo() {
  const step = useAtlas((s) => s.demoStep);
  const set = useAtlas((s) => s.set);

  const go = useCallback(
    (n: number) => {
      const k = Math.max(0, Math.min(STEPS.length - 1, n));
      set({ demoStep: k });
      void STEPS[k].run();
    },
    [set],
  );

  useEffect(() => {
    if (step === 0) void STEPS[0].run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step === null]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          key="demo"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-3 left-3 right-3 z-30 sm:bottom-4 sm:left-4 sm:right-auto sm:w-[440px]"
          role="region"
          aria-label="Guided demo"
        >
          <div className="glass overflow-hidden rounded-2xl ring-1 ring-amber/25">
            <div className="h-[2px] bg-bg-3">
              <motion.div className="h-full bg-gradient-to-r from-a via-amber to-b" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-amber">
                  Guided demo · {step + 1}/{STEPS.length}
                </span>
                <IconButton label="Exit demo" onClick={() => set({ demoStep: null, highlightConflict: false })} className="-mr-1.5 -mt-1.5 h-7 w-7">
                  <X size={14} />
                </IconButton>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                  <h3 className="mt-1 font-serif text-[22px] leading-[1.15] text-text-0">{STEPS[step].title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-[1.55] text-text-1">{STEPS[step].body}</p>
                </motion.div>
              </AnimatePresence>
              <div className="mt-3.5 flex items-center gap-2">
                <div className="flex gap-1">
                  {STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => go(i)}
                      aria-label={`Go to step ${i + 1}`}
                      className={clsx("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-amber" : i < step ? "w-1.5 bg-text-2" : "w-1.5 bg-line-3")}
                    />
                  ))}
                </div>
                <span className="ml-2 hidden items-center gap-1 text-[10.5px] text-text-3 sm:flex">
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd>
                </span>
                <div className="ml-auto flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0}>
                    <ArrowLeft size={13} />
                  </Button>
                  {step < STEPS.length - 1 ? (
                    <Button variant="primary" size="sm" onClick={() => go(step + 1)}>
                      Next <ArrowRight size={13} />
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => set({ demoStep: null })}>
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
