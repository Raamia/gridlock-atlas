"use client";

import { MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useReview } from "@/lib/review";
import { useEffect, useRef } from "react";
import { SNAPSHOT } from "@/lib/data";
import { useAtlas } from "@/lib/store";
import { BriefModal } from "./BriefModal";
import { MethodDrawer, SourcesDrawer } from "./Drawers";
import { GuidedDemo } from "./GuidedDemo";
import { Inspector } from "./Inspector";
import { MapOverlays } from "./MapOverlays";
import { Queue } from "./Queue";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

const MapStage = dynamic(() => import("./MapStage"), {
  ssr: false,
  loading: () => <div className="shimmer absolute inset-0 bg-bg-0" aria-label="Loading map" />,
});

export function Atlas() {
  useKeyboard();
  useUrlSync();
  useEffect(() => useReview.getState().hydrate(), []);
  return (
    <MotionConfig reducedMotion="user">
    <div className="atlas-shell grid h-dvh w-full max-w-[100vw] grid-cols-[minmax(0,1fr)] grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-bg-0">
      <TopBar />
      {/* desktop: queue | map+timeline. narrow: map on top, queue below as a scrollable sheet (phones give the sheet more, so a whole card shows) */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,55fr)_minmax(0,45fr)] max-sm:grid-rows-[minmax(0,45fr)_minmax(0,55fr)] lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
        <div className="order-2 min-h-0 lg:order-1 [&>aside]:h-full">
          <Queue />
        </div>
        <main className="order-1 flex min-h-0 min-w-0 flex-col lg:order-2">
          <div className="relative min-h-0 flex-1 overflow-hidden bg-bg-0">
            <MapStage />
            <MapOverlays />
            <Inspector />
            <GuidedDemo />
          </div>
          <Timeline />
        </main>
      </div>
      <BriefModal />
      <SourcesDrawer />
      <MethodDrawer />
    </div>
    </MotionConfig>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const st = useAtlas.getState();
      // Escape always works, even from a text field inside a drawer or the inspector
      if (e.key === "Escape") {
        if (st.briefOpen) return st.set({ briefOpen: false });
        if (st.sourcesOpen || st.methodOpen) return st.set({ sourcesOpen: false, methodOpen: false });
        if (st.inspectorOpen) return st.select(null);
        if (st.demoStep !== null) return st.set({ demoStep: null });
        return;
      }
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // shortcuts never act behind a modal or drawer
      if (st.briefOpen || st.sourcesOpen || st.methodOpen || t?.closest("[role=dialog]")) return;
      if ((e.key === "c" || e.key === "C") && !st.running) {
        e.preventDefault();
        void st.compare();
      }
      const onCard = !t || t === document.body || !!t.closest("[data-match-id]");
      if ((e.key === "j" || e.key === "k" || ((e.key === "ArrowDown" || e.key === "ArrowUp") && onCard)) && st.run && st.demoStep === null) {
        const cards = [...document.querySelectorAll<HTMLElement>("[data-match-id]")];
        if (!cards.length) return;
        const ids = cards.map((c) => c.dataset.matchId!);
        const i = st.selectedMatchId ? ids.indexOf(st.selectedMatchId) : -1;
        const next = e.key === "j" || e.key === "ArrowDown" ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
        e.preventDefault();
        st.select(ids[next]);
        cards[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** ?pair=<id>[&r=<mi>] deep links: run the engine quietly at the link's radius, then open that pair. */
function useUrlSync() {
  const selected = useAtlas((s) => s.selectedMatchId);
  const radius = useAtlas((s) => s.run?.thresholdMiles);
  // the link stays in the address bar until its own comparison has resolved
  const linking = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pair = params.get("pair");
    if (!pair) return;
    // the slider's grid: 5–100 mi in 5 mi steps
    const r = Math.round(Number(params.get("r")) / 5) * 5;
    linking.current = true;
    void useAtlas
      .getState()
      .compare({ quiet: true, thresholdMiles: r >= 5 && r <= 100 ? r : undefined })
      .then((run) => {
        linking.current = false;
        const st = useAtlas.getState();
        // engine unavailable (the queue reports it): keep the link, so a reload retries it
        if (!run) return;
        if (run.matches.some((m) => m.id === pair)) return st.select(pair);
        const known = pair.split("__").every((id) => SNAPSHOT.projects.some((p) => p.id === id));
        st.set({ linkNotice: known ? `The linked pair is not flagged at ${run.thresholdMiles} mi` : "The linked pair is not in this snapshot" });
        writeUrl(st.selectedMatchId, st.run?.thresholdMiles);
      });
  }, []);
  useEffect(() => {
    if (!linking.current) writeUrl(selected, radius);
  }, [selected, radius]);
}

function writeUrl(pair: string | null, radius: number | undefined) {
  const url = new URL(window.location.href);
  if (pair) url.searchParams.set("pair", pair);
  else url.searchParams.delete("pair");
  if (pair && radius !== undefined && radius !== 25) url.searchParams.set("r", String(radius));
  else url.searchParams.delete("r");
  window.history.replaceState(null, "", url.toString());
}
