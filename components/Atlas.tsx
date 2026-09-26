"use client";

import { MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useReview } from "@/lib/review";
import { useEffect } from "react";
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
      {/* desktop: queue | map+timeline. narrow: map on top, queue below as a scrollable sheet */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,55fr)_minmax(0,45fr)] lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
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

/** ?pair=<id> deep links: run the engine quietly, then open that pair. */
function useUrlSync() {
  const selected = useAtlas((s) => s.selectedMatchId);
  useEffect(() => {
    const pair = new URLSearchParams(window.location.search).get("pair");
    if (!pair) return;
    void useAtlas
      .getState()
      .compare({ quiet: true })
      .then((run) => {
        if (run?.matches.some((m) => m.id === pair)) useAtlas.getState().select(pair);
      });
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("pair", selected);
    else url.searchParams.delete("pair");
    window.history.replaceState(null, "", url.toString());
  }, [selected]);
}
