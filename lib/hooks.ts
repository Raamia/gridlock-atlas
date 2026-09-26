"use client";

import { useEffect, useState, type RefObject } from "react";
import { IDX } from "@/lib/data";
import type { Match, Project } from "@/lib/domain/types";
import { useAtlas } from "@/lib/store";

export interface SelectedPair {
  match: Match;
  a: Project;
  b: Project;
}

export function useSelectedPair(): SelectedPair | null {
  const run = useAtlas((s) => s.run);
  const id = useAtlas((s) => s.selectedMatchId);
  const m = run?.matches.find((x) => x.id === id);
  if (!m) return null;
  return { match: m, a: IDX.project(m.projectAId), b: IDX.project(m.projectBId) };
}

/** The pair the map/timeline should preview: hovered card wins over the selection. */
export function usePreviewPair(): SelectedPair | null {
  const run = useAtlas((s) => s.run);
  const hovered = useAtlas((s) => s.hoveredMatchId);
  const id = useAtlas((s) => s.selectedMatchId);
  const m = run?.matches.find((x) => x.id === (hovered ?? id));
  if (!m) return null;
  return { match: m, a: IDX.project(m.projectAId), b: IDX.project(m.projectBId) };
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Live pixel width of an element (0 until first measured). */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
