"use client";

import { create } from "zustand";

/**
 * Reviewer mode (plan.md P1): per-pair labels with elapsed review time, and human checks on excerpts.
 * Stored in this browser only (a per-viewer convenience); export as CSV for the paper and as
 * data/review-log.json, which the snapshot builder reads to set `reviewedByHuman`.
 */

export type ReviewLabel = "worth-review" | "already-coordinated" | "not-useful" | "insufficient-evidence";

export const LABELS: { id: ReviewLabel; text: string }[] = [
  { id: "worth-review", text: "Worth planner review" },
  { id: "already-coordinated", text: "Already coordinated" },
  { id: "not-useful", text: "Not useful" },
  { id: "insufficient-evidence", text: "Insufficient evidence" },
];

export interface PairReview {
  label: ReviewLabel;
  seconds: number;
  at: string;
  note?: string;
}

interface ReviewState {
  enabled: boolean;
  labels: Record<string, PairReview>;
  checked: Record<string, boolean>;
  toggle: () => void;
  setLabel: (matchId: string, label: ReviewLabel, seconds: number) => void;
  setNote: (matchId: string, note: string) => void;
  toggleCheck: (evidenceId: string) => void;
  clear: () => void;
}

const KEY = "gridlock-review-v1";

function load(): Pick<ReviewState, "labels" | "checked"> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable (private window, blocked) — start empty */
  }
  return { labels: {}, checked: {} };
}

function save(s: Pick<ReviewState, "labels" | "checked">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ labels: s.labels, checked: s.checked }));
  } catch {
    /* non-fatal */
  }
}

export const useReview = create<ReviewState>((set, get) => ({
  enabled: false,
  labels: {},
  checked: {},
  toggle() {
    const next = !get().enabled;
    set({ enabled: next, ...(next ? load() : {}) });
  },
  setLabel(matchId, label, seconds) {
    const labels = { ...get().labels, [matchId]: { ...get().labels[matchId], label, seconds, at: new Date().toISOString() } };
    set({ labels });
    save({ labels, checked: get().checked });
  },
  setNote(matchId, note) {
    const prev = get().labels[matchId];
    if (!prev) return;
    const labels = { ...get().labels, [matchId]: { ...prev, note } };
    set({ labels });
    save({ labels, checked: get().checked });
  },
  toggleCheck(id) {
    const checked = { ...get().checked, [id]: !get().checked[id] };
    if (!checked[id]) delete checked[id];
    set({ checked });
    save({ labels: get().labels, checked });
  },
  clear() {
    set({ labels: {}, checked: {} });
    save({ labels: {}, checked: {} });
  },
}));

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const csvCell = (v: string | number | undefined) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function labelsCsv(labels: Record<string, PairReview>, meta: (id: string) => Record<string, string | number>): string {
  const rows = Object.entries(labels).map(([id, r]) => ({ match_id: id, ...meta(id), label: r.label, review_seconds: r.seconds, labeled_at: r.at, note: r.note ?? "" }));
  if (!rows.length) return "match_id,label,review_seconds,labeled_at,note\n";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell((r as Record<string, string | number>)[c])).join(","))].join("\n") + "\n";
}
