"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Box, CircleAlert, RotateCw, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buildBrief } from "@/lib/brief";
import { IDX, SNAPSHOT } from "@/lib/data";
import { geoShort } from "@/lib/describe";
import type { Match, MatchRun } from "@/lib/domain/types";
import { precisionLabel } from "@/lib/format";
import { formatUsd, formatUsdRange, impactChannels } from "@/lib/impact";
import { getLayout, useLayout } from "@/lib/layout";
import { rankLabel, rankOf, regionMatches } from "@/lib/rank";
import { regionPairCounts } from "@/lib/selectors";
import { sponsorCheck, sponsorReplay, SPONSOR_RADIUS_MILES, withinSponsorRule } from "@/lib/sponsor";
import { useAtlas, type InspectorSection } from "@/lib/store";
import { overlapStatement } from "./timeline/model";
import { Button, IconButton, Kbd, mapUi, panelClass, Spinner, Tooltip, UtilityDot } from "./ui";

/*
 * Guided demo (SPEC §5.9): eight narrated steps that drive the real app. The card floats top-centre of the focal hole
 * (width min(520, focal − 24); the map key moves bottom-left while the demo runs) and pins bottom-left over the
 * brief's scrim on the last step. Every step's copy sits in one grid cell, so the card is as tall as its tallest step and
 * the camera padding never changes between steps. Test hooks: role=region "Guided demo" · "n/8" · one /^Next/ (it
 * becomes "Finish" on step 8: the same element, so focus stays on it) · "Previous step" · "Exit demo" · "Go to step N".
 */

/** The narration quotes the sponsor's radius, so the demo always runs at it. */
const DEMO_RADIUS = SPONSOR_RADIUS_MILES;
const FEATURED = ["dpc-alma-blair", "xcel-wwtc"];
const HOME_REGION = SNAPSHOT.regions.some((r) => r.id === "southeast") ? "southeast" : (SNAPSHOT.regions[0]?.id ?? "all");

const regionOfPair = (m: Match) => IDX.project(m.projectAId)?.region ?? HOME_REGION;
const inSE = (m: Match) => regionOfPair(m) === HOME_REGION;

function featured(run: MatchRun | null) {
  return run?.matches.find((m) => FEATURED.includes(m.projectAId) && FEATURED.includes(m.projectBId)) ?? null;
}

/** Top-ranked Savannah River lead: DESC × Georgia Power, place confirmed, not already coordinated. */
function topSoutheast(run: MatchRun | null) {
  return run?.matches.find((m) => inSE(m) && m.geo === "confirmed" && m.reviewStatus === "needs-review") ?? run?.matches.find(inSE) ?? null;
}

/** The conflict step 7 narrates: WWTC's completion dates (Xcel's page vs. the PSC filings), led and scrolled to by the inspector. */
function wwtcCompletion(m: Match) {
  return m.conflicts.find((c) => c.field === "completion" && c.projectId === FEATURED[1]) ?? m.conflicts.find((c) => c.field === "completion") ?? null;
}

/* ─────────────────────────────────────────────── step runners ─────────────────────────────────────────────── */

type Outcome = "ok" | "no-run" | "no-pair";

/** Each step run gets a token; work that resolves after the user moved on (or left the demo) is dropped. */
let stepToken = 0;
const stale = (token: number) => token !== stepToken || useAtlas.getState().demoStep === null;

async function ensureRun() {
  const st = useAtlas.getState();
  return st.run?.thresholdMiles === DEMO_RADIUS ? st.run : await st.compare({ thresholdMiles: DEMO_RADIUS });
}

type Patch = Partial<ReturnType<typeof useAtlas.getState>>;

function open(pick: (run: MatchRun | null) => Match | null, section: InspectorSection | null, extra: (m: Match) => Patch = () => ({})) {
  return async (): Promise<Outcome> => {
    const token = stepToken;
    const run = await ensureRun();
    if (stale(token)) return "ok";
    if (!run) return "no-run";
    const m = pick(run);
    if (!m) return "no-pair";
    const st = useAtlas.getState();
    if (st.selectedMatchId !== m.id) st.select(m.id, { section: section ?? undefined });
    // the list shows the pair under its own category, the one the narration names
    useAtlas.setState({
      inspectorOpen: true,
      inspectorSection: section,
      tab: m.reviewStatus,
      briefOpen: false,
      sourcesOpen: false,
      methodOpen: false,
      closeupOpen: false,
      highlightConflict: false,
      focusConflict: null,
      ...extra(m),
    });
    return "ok";
  };
}

/** Scroll the inspector back to its summary (once it has rendered the pair), inside the inspector only. */
function inspectorToTop() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('aside[aria-label="Evidence inspector"] [data-inspector-scroll]')?.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }),
  );
}

/* ─────────────────────────────────────────────── key numbers ─────────────────────────────────────────────── */

/**
 * One mono line per step, computed from the run and the lib helpers; null when unavailable (never a made-up number).
 * A part may carry a shorter wording (`short`: phones, a narrow tablet card, the short laptop card), or none
 * (`short: null` drops it there), so the honesty tag at the end ("stated", "never summed", "both kept") always fits.
 */
type KeyPart = { text: string; short?: string | null };
type KeyLine = KeyPart[] | null;
const kp = (text: string, short?: string | null): KeyPart => (short === undefined ? { text } : { text, short });
const keyParts = (key: KeyLine, short: boolean) => (key ?? []).map((part) => (short && part.short !== undefined ? part.short : part.text)).filter((t): t is string => !!t);

const n = (x: number) => x.toLocaleString("en-US");
const yearOf = (iso: string | undefined) => (iso ? iso.slice(0, 4) : null);

function prerunLine(): KeyLine {
  const counts = new Map<string, number>();
  const plans = SNAPSHOT.projects.filter((p) => p.region === HOME_REGION);
  for (const p of plans) {
    const owner = p.owners[0]?.utilityId;
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  const top = [...counts].sort((x, y) => y[1] - x[1]);
  if (!plans.length || top.length < 2) return null;
  const name = (id: string) => IDX.utility(id)?.shortName ?? id;
  // focal pair in their header order (DESC first), then the plan count
  const shown = top.slice(0, 2).sort(([a], [b]) => a.localeCompare(b));
  // the short card keeps the two plans' counts (their sum is the total)
  return [kp(`${n(plans.length)} plans`, null), ...shown.map(([id, c]) => kp(`${name(id)} ${n(c)}`))];
}

/**
 * `docked`: the list is on screen beside the map. Step 4 then points at Sperry's OVL_3 row (#02) and holds a spotlight on
 * it; without the list (phones, the tablet pill) it speaks about the pair the inspector shows instead.
 */
function keyLines(run: MatchRun | null, docked: boolean): KeyLine[] {
  const lines: KeyLine[] = [prerunLine(), null, null, null, null, null, null, null];
  if (!run || run.thresholdMiles !== DEMO_RADIUS) return lines;
  try {
    const counts = regionPairCounts(run, SNAPSHOT.projects, HOME_REGION);
    const inRule = regionMatches(run, HOME_REGION).filter(withinSponsorRule).length;
    lines[1] = [kp(`${n(counts.evaluated)} → ${n(inRule)} within ${DEMO_RADIUS} mi`)];

    const top = topSoutheast(run);
    const topRank = top ? rankOf(run, regionOfPair(top), top.id) : undefined;
    if (top) {
      const ip = top.timeDetail.inService;
      const [ya, yb] = [yearOf(ip?.a), yearOf(ip?.b)];
      const when = ya && yb ? (ya === yb ? kp(`both in service ${ya}`, `in service ${ya}`) : kp(`in service ${ya} · ${yb}`)) : null;
      // approximate, as in the row and the inspector tile (G3): "≈6.7 mi apart"
      const place = top.geoDetail.method === "measured" && top.geoDetail.center ? `≈${geoShort(top).text}` : geoShort(top).text;
      lines[2] = [topRank ? kp(`#${rankLabel(topRank)}`) : null, kp(place), when].filter((x): x is KeyPart => !!x);

      const staging = impactChannels(top).find((c) => c.key === "staging");
      if (staging?.usd) lines[4] = [kp(`Staging up to ≈ ${formatUsd(staging.usd[1])}`), kp("never summed")];

      const brief = buildBrief(top);
      if (brief.citations.length) lines[7] = [kp("Every fact numbered to its page"), kp(`${n(brief.citations.length)} excerpts`, null)];
    }

    const ovl3 = sponsorReplay(run, SNAPSHOT).find((r) => r.id === "OVL_3" && r.status === "in-queue");
    const m3 = ovl3?.matchId ? run.matches.find((m) => m.id === ovl3.matchId) : undefined;
    if (docked && ovl3?.rank && m3) {
      const sched = m3.timeDetail.schedule;
      const overlap = sched?.confirmed && sched.days >= 30 ? `schedules overlap ${Math.round(sched.days / 30.44)} mo` : null;
      const r = rankLabel(ovl3.rank);
      lines[3] = [kp(`Row #${r} is Sperry's OVL_3`, `#${r} = OVL_3`), ...(overlap ? [kp(overlap)] : [])];
    } else if (top) {
      // the pair on screen, in the timeline's own words ("Possible overlap 2028 · year precision")
      lines[3] = [...(topRank ? [kp(`#${rankLabel(topRank)}`, null)] : []), ...overlapStatement(top).text.split(" · ").map((t) => kp(t))];
    }

    const feat = featured(run);
    if (feat) {
      const terminal = impactChannels(feat).find((c) => c.key === "shared-terminal");
      if (terminal?.usd) lines[5] = [kp("One terminal, not two", null), kp(`≈ ${formatUsdRange(terminal.usd)}`), kp(terminal.basis)];
      const c = wwtcCompletion(feat);
      const current = c?.sides.filter((s) => !s.earlier) ?? [];
      if (c && current.length >= 2) lines[6] = [kp("Completion", null), kp(current.map((s) => s.value).join(" vs ")), kp("both kept")];
      else if (c) lines[6] = [kp("Completion dates disagree"), kp("both kept")];
    }
  } catch {
    // a helper that throws on unexpected data only costs the key line, never the step
  }
  return lines;
}

/** Step 4's second sentence, from the top lead's own TIME signal (never a claim its data doesn't make). */
function leadTiming(run: MatchRun | null): string | null {
  const top = run?.thresholdMiles === DEMO_RADIUS ? topSoutheast(run) : null;
  if (!top) return null;
  const t = top.timeDetail;
  if (top.time === "possible" && t.possibleOverlap) return `This lead may overlap only at ${precisionLabel(t.precision)} precision.`;
  if (top.time === "confirmed" && t.basis === "schedule") return "This lead's published schedules overlap.";
  if (top.time === "confirmed") return "This lead's construction windows overlap.";
  return null;
}

/**
 * The row / button / section a step talks about, found once it exists (the narration moves the UI first). `hold`: the
 * ring stays (with a soft glow) for the whole step instead of pulsing once, so a projector audience can find it.
 */
type Target = { find: () => HTMLElement | null; inset?: boolean; scroll?: boolean; hold?: boolean };

function visible(el: HTMLElement | null): el is HTMLElement {
  if (!el || el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return false;
  // not under a sheet or a panel (phones: the list sits under the inspector sheet)
  const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 20)));
  const hit = document.elementFromPoint(x, y);
  return !!hit && (el === hit || el.contains(hit));
}

const cardEl = () => document.querySelector<HTMLElement>('[aria-label="Guided demo"]');

function byMatchId(id: string | undefined): Target | null {
  if (!id) return null;
  return {
    find: () =>
      document.querySelector<HTMLElement>(`[aria-label="Coordination queue"] [data-match-id="${CSS.escape(id)}"]`) ??
      document.querySelector<HTMLElement>(`button[data-match-id="${CSS.escape(id)}"]`),
    inset: true,
    scroll: true,
  };
}

const closeupButton: Target = {
  // prefer the map's own control (the showcase), else the inspector's footer action; never the card's
  find: () => {
    const card = cardEl();
    const all = [...document.querySelectorAll<HTMLElement>("button")].filter(
      (b) => !card?.contains(b) && ((b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === "3D close-up" || b.textContent?.trim() === "3D close-up"),
    );
    const shown = all.filter((b) => b.offsetParent !== null);
    return shown.find((b) => b.closest('[data-slot="focal"]')) ?? shown[0] ?? null;
  },
};

function inInspector(selector: string): Target {
  return { find: () => document.querySelector<HTMLElement>(`aside[aria-label="Evidence inspector"] ${selector}`), inset: true };
}

/* ─────────────────────────────────────────────── the eight steps ─────────────────────────────────────────────── */

interface Step {
  title: string;
  body: ReactNode;
  /** Plain-text narration for the live region when `body` is not a string. */
  say?: string;
  /** Narration computed from the run (it replaces `body` once the run can say it). */
  bodyFor?: (run: MatchRun | null) => string | null;
  run: () => Promise<Outcome>;
  /** The pair the step opens (steps 3–8), to tell a missing pair from a slow engine. */
  pick?: (run: MatchRun | null) => Match | null;
  /** Card action on the left of the footer. */
  action?: "closeup" | "proof";
  /** What the step points at, given the current run and whether the list is on screen. */
  spotlight?: (run: MatchRun | null, docked: boolean) => Target | null;
}

const TIMING = "Timing is secondary: published schedules, never field-work dates.";

const STEPS: Step[] = [
  {
    title: "Two utilities, two separate plans",
    body: (
      <>
        Dominion Energy South Carolina <UtilityDot utility="a" className="mx-0.5 -translate-y-px" /> and Georgia Power{" "}
        <UtilityDot utility="b" className="mx-0.5 -translate-y-px" /> publish their plans in separate documents. Here they are on one map.
      </>
    ),
    say: "Dominion Energy South Carolina and Georgia Power publish their plans in separate documents. Here they are on one map.",
    run: async () => {
      // "one map": no earlier comparison, radius, filter or tab carries into the opening beat
      const st = useAtlas.getState();
      st.resetRun();
      st.setRegion(HOME_REGION);
      useAtlas.setState({ briefOpen: false, sourcesOpen: false, methodOpen: false, mapKeyOpen: false, sheetSnap: "peek", uiHidden: false });
      return "ok";
    },
  },
  {
    title: "Compare public plans",
    body: `Pairs whose centers are within ${DEMO_RADIUS} miles turn amber, plus a few beyond that share a facility or sit on uncertain locations.`,
    run: async () => {
      const token = stepToken;
      const st = useAtlas.getState();
      // back from a pair (Previous): close it first, so the reveal frames the flagged pairs rather than skipping for a selection
      if (st.region !== HOME_REGION) st.setRegion(HOME_REGION);
      else st.select(null);
      useAtlas.setState({ tab: "needs-review", briefOpen: false, sourcesOpen: false, methodOpen: false });
      // an explicit Compare: bumps revealNonce, which moves the camera itself (no cameraNonce bump here)
      const run = await st.compare({ thresholdMiles: DEMO_RADIUS, explicit: true });
      if (stale(token)) return "ok";
      if (!run) return "no-run";
      if (useAtlas.getState().tab !== "needs-review") useAtlas.setState({ tab: "needs-review" });
      return "ok";
    },
  },
  {
    title: "The top coordination opportunity",
    body: "The top Savannah River lead; the reviewed sources are silent on coordination. See each terminal and its precision.",
    // no section: the verdict, tiles and question (the summary) stay in view; back from step 4 scrolls up to them again
    run: async () => {
      const token = stepToken;
      const out = await open(topSoutheast, null)();
      if (out === "ok" && !stale(token)) inspectorToTop();
      return out;
    },
    pick: topSoutheast,
    action: "closeup",
  },
  {
    title: "When they build",
    body: `${TIMING} Schedules that overlap by 30+ days confirm a timing match.`,
    bodyFor: (run) => {
      const lead = leadTiming(run);
      return lead ? `${TIMING} ${lead}` : null;
    },
    run: open(topSoutheast, "schedule"),
    pick: topSoutheast,
    // the key line names Sperry's OVL_3 row: it keeps a ring for the whole step (only while the list is on screen)
    spotlight: (run, docked) => {
      if (!docked) return null;
      const row = run ? sponsorReplay(run, SNAPSHOT).find((r) => r.id === "OVL_3" && r.status === "in-queue") : undefined;
      const t = byMatchId(row?.matchId);
      return t && { ...t, hold: true };
    },
  },
  {
    title: "A rough, sourced impact estimate",
    body: "Each sharing channel stands alone, with cited costs where they exist. Never added up: a scenario, not a saving.",
    run: open(topSoutheast, "impact"),
    pick: topSoutheast,
    spotlight: () => inInspector('[data-channel="staging"]'),
  },
  {
    title: "Known coordination is kept separate",
    body: "Dairyland's line ends at Xcel's Tremval North: a known interface, not a new gap. The 3D close-up shows its official GIS routes.",
    run: open(featured, "coordination"),
    pick: featured,
    spotlight: () => closeupButton,
  },
  {
    title: "Sources disagree — both are kept",
    body: "Xcel's page and the PSC give different completion dates, side by side. The in-service gap uses NSPW's latest filing.",
    run: open(featured, "conflicts", (m) => ({ highlightConflict: true, focusConflict: wwtcCompletion(m)?.id ?? null })),
    pick: featured,
    spotlight: (run) => {
      const m = featured(run);
      const c = m && wwtcCompletion(m);
      return c ? inInspector(`[data-conflict-id="${CSS.escape(c.id)}"]`) : null;
    },
  },
  {
    title: "Export a cited review brief",
    body: "One question a planner can act on, every fact numbered to a short excerpt and its page. It never contacts a utility.",
    run: async () => {
      const token = stepToken;
      const out = await open(topSoutheast, "coordination")();
      if (stale(token) || out !== "ok") return out;
      useAtlas.setState({ briefOpen: true });
      return "ok";
    },
    pick: topSoutheast,
    action: "proof",
  },
];

/** The card itself offers "3D close-up" on this step (MapControls then drops its own pill, so it never shows twice). */
export function demoCardOffersCloseup(step: number | null): boolean {
  return step !== null && STEPS[step]?.action === "closeup";
}

/* ─────────────────────────────────────────────── spotlight ─────────────────────────────────────────────── */

let ringColor: string | null = null;
/** fg-1 as "r g b" from the token (the ring is the one white accent the demo may add to someone else's element). */
function ring(): string {
  if (ringColor) return ringColor;
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--fg-1").trim().replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const v = /^[0-9a-f]{6}$/i.test(full) ? [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(" ") : "243 245 249";
  return (ringColor = v);
}

/** A 2px white ring that pulses once on the element (static, then gone, with reduced motion). */
function pulse(el: HTMLElement, inset: boolean) {
  const c = ring();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const edge = (a: number) => `${inset ? "inset " : ""}0 0 0 2px rgb(${c} / ${a})`;
  const halo = (a: number, spread: number) => (inset ? `inset 0 0 ${spread}px 0 rgb(${c} / ${a})` : `0 0 0 ${spread}px rgb(${c} / ${a})`);
  const frames: Keyframe[] = reduced
    ? [{ boxShadow: `${edge(0.95)}` }, { boxShadow: `${edge(0.95)}` }]
    : [
        { boxShadow: `${edge(0)}, ${halo(0, 0)}`, offset: 0 },
        { boxShadow: `${edge(0.95)}, ${halo(0.3, 2)}`, offset: 0.16 },
        { boxShadow: `${edge(0.95)}, ${halo(0.22, 4)}`, offset: 0.5 },
        { boxShadow: `${edge(0)}, ${halo(0, 12)}`, offset: 1 },
      ];
  el.animate(frames, { id: "demo-spotlight", duration: reduced ? 1600 : 1500, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
}

/** The spotlight a step holds (step 4's row): released when the step changes or the demo ends. */
let held: Animation | null = null;
function release() {
  held?.cancel();
  held = null;
}

/**
 * A steady 2px white ring with a soft inner glow, held until `release()` (it eases in once; static with reduced motion).
 * No side stripe: cards never carry a coloured left edge.
 */
function hold(el: HTMLElement) {
  release();
  const c = ring();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const on = `inset 0 0 0 2px rgb(${c} / 0.95), inset 0 0 12px 0 rgb(${c} / 0.16)`;
  const frames: Keyframe[] = reduced
    ? [{ boxShadow: on }, { boxShadow: on }]
    : [
        { boxShadow: `inset 0 0 0 2px rgb(${c} / 0), inset 0 0 0 0 rgb(${c} / 0)`, offset: 0 },
        { boxShadow: `inset 0 0 0 2px rgb(${c} / 0.95), inset 0 0 18px 0 rgb(${c} / 0.3)`, offset: 0.35 },
        { boxShadow: on, offset: 1 },
      ];
  held = el.animate(frames, { id: "demo-spotlight", duration: reduced ? 1 : 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
}

/** The nearest ancestor that scrolls vertically (the list), or null. */
function scrollBox(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/**
 * Bring the row into view inside its own list only, and only while that list is on screen: never scrollIntoView, which
 * also scrolls every ancestor (the shell, a hidden phone sheet) and would pull the map stage along.
 */
function revealInList(el: HTMLElement, smooth: boolean): boolean {
  const box = scrollBox(el);
  if (!box || !visible(box)) return false;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const pad = 12;
  const dy = r.top < b.top + pad ? r.top - b.top - pad : r.bottom > b.bottom - pad ? r.bottom - b.bottom + pad : 0;
  if (!dy) return false;
  box.scrollBy({ top: dy, behavior: smooth ? "smooth" : "auto" });
  return true;
}

/** Wait until the target exists and is on screen (panels animate in, the list re-renders), then scroll and pulse once. */
function spotlightWhenReady(target: Target, token: number) {
  const started = performance.now();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let scrolled = false;
  const tick = () => {
    if (stale(token)) return;
    const el = target.find();
    if (el && target.scroll && !scrolled && el.offsetParent !== null) {
      scrolled = true;
      if (revealInList(el, !reduced)) {
        window.setTimeout(tick, reduced ? 60 : 420);
        return;
      }
    }
    if (visible(el)) return target.hold ? hold(el) : pulse(el, !!target.inset);
    if (performance.now() - started < 3200) window.setTimeout(tick, 160);
  };
  // after the inspector and camera have started moving, so the ring lands where the eye already is
  window.setTimeout(tick, reduced ? 120 : 650);
}

/* ─────────────────────────────────────────────── the card ─────────────────────────────────────────────── */

let proofOk: boolean | null = null;
const sponsorProofOk = () => (proofOk ??= (() => {
  try {
    return sponsorCheck().allOk;
  } catch {
    return false;
  }
})());

const NO_KEYS: KeyLine[] = STEPS.map(() => null);

/** Numbers bright, words quieter: "7,830 → 111 within 25 mi". */
const NUM = /((?:[#≈$]\s?)*\$?\d[\d,.]*(?:[KM]|\s?mo|\s?mi)?(?:–\$?\d[\d,.]*[KM]?)?)/g;
function KeyText({ text }: { text: string }) {
  return (
    <>
      {text.split(NUM).map((t, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-fg-1">
            {t}
          </span>
        ) : (
          t
        ),
      )}
    </>
  );
}

export function GuidedDemo() {
  const step = useAtlas((s) => s.demoStep);
  const briefOpen = useAtlas((s) => s.briefOpen);
  const drawerOpen = useAtlas((s) => s.sourcesOpen || s.methodOpen);
  const pairOpen = useAtlas((s) => s.inspectorOpen && s.selectedMatchId !== null);
  const selected = useAtlas((s) => s.selectedMatchId);
  const run = useAtlas((s) => s.run);
  const running = useAtlas((s) => s.running);
  const runError = useAtlas((s) => s.runError);
  const set = useAtlas((s) => s.set);
  const layout = useLayout();
  const phone = layout.tier === "phone";
  const wide = layout.tier === "xl" || layout.tier === "lg";
  const docked = layout.railDocked;
  const active = step !== null;
  // last step: the card rides above the brief's scrim, pinned bottom-left (bottom edge below lg), so Finish stays reachable
  const pinned = active && briefOpen;
  // phones with the inspector sheet up: title, two lines and the buttons, so the pair keeps a strip of map
  const compact = phone && pairOpen && !briefOpen;
  // phones over the brief: title and the buttons only (the narration one tap away), so the review question stays in view
  const phoneBrief = phone && pinned;
  // short laptop screens (720–800px tall): the buttons join the key-number line and the title steps down, so the pair keeps
  // its map (≈170px instead of ≈232px); --demo-card-h and the camera padding follow on their own
  const short = !phone && !pinned && layout.vh < 800;
  // a narrow tablet card: the shorter key-number wording, so "≈ $9.0M–$12.4M · stated" is never cut
  const shortKeys = phone || short || (!pinned && layout.demoCardW < 480);

  const [more, setMore] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);
  /** Focus is (or was last) on one of the card's controls. */
  const focusInCard = useRef(false);
  /** The engine let this step down; a run arriving later (the Opportunities panel's Retry, C) picks the narration up again. */
  const stalled = useRef(false);

  const keys = useMemo(() => (active ? keyLines(run, docked) : NO_KEYS), [active, run, docked]);
  const bodies = useMemo(() => STEPS.map((s) => (active && s.bodyFor?.(run)) || s.body), [active, run]);
  const proof = active && step === STEPS.length - 1 && sponsorProofOk();
  // derived from the store, never narrated over: no 25 mi run after the engine answered with an error, or no such pair in it
  const demoRun = run?.thresholdMiles === DEMO_RADIUS ? run : null;
  const engineDown = active && step > 0 && !running && !!runError && !demoRun;
  const pairMissing = active && !!demoRun && !!STEPS[step].pick && !STEPS[step].pick!(demoRun);
  const failed = engineDown || pairMissing;

  // the demo opened the brief on its last beat, so leaving the demo closes it too
  const end = useCallback(() => set({ demoStep: null, briefOpen: false, highlightConflict: false, focusConflict: null }), [set]);

  const runStep = useCallback(async (k: number) => {
    const token = ++stepToken;
    stalled.current = false;
    release();
    useAtlas.setState({ closeupOpen: false });
    const out = await STEPS[k].run();
    if (stale(token)) return;
    // the card reads the failure from the store (runError / the run), so it can say so instead of narrating a missing pair
    if (out !== "ok") return void (stalled.current = true);
    const target = STEPS[k].spotlight?.(useAtlas.getState().run, getLayout().railDocked);
    if (target) spotlightWhenReady(target, token);
  }, []);

  const go = useCallback(
    (to: number) => {
      const k = Math.max(0, Math.min(STEPS.length - 1, to));
      setMore(false);
      set({ demoStep: k });
      void runStep(k);
    },
    [set, runStep],
  );

  useEffect(() => {
    // entering or leaving the demo (card X, Finish, top-bar Exit, Escape) drops any step still waiting on the engine
    stepToken++;
    const was = wasActive.current;
    wasActive.current = active;
    if (active) {
      void runStep(useAtlas.getState().demoStep ?? 0);
      // off the top-bar toggle (now "Exit guided demo"), so Space / Enter advance the demo instead of ending it
      const id = requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(id);
    }
    release();
    // the card's buttons leave with it: hand focus back to the toggle rather than dropping it to <body>
    const el = document.activeElement;
    if (was && (!el || el === document.body || card.current?.contains(el))) document.getElementById("demo-toggle")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // the engine came back (the Opportunities panel's Retry, the C key): pick the narration up where it stopped
  useEffect(() => {
    if (!stalled.current || step === null || !demoRun) return;
    stalled.current = false;
    if (step > 1) void runStep(step);
  }, [demoRun, step, runStep]);

  // Previous disables itself on step 1, and an arrow-key step can leave focus on <body>: hand it to the primary button
  useEffect(() => {
    if (step === null) return;
    const id = requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!el || el === document.body || (el instanceof HTMLButtonElement && el.disabled && card.current?.contains(el))) nextRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  // the card changes shape (the short card's key row → the footer beside the brief, the phone's compact cards): a focused
  // Next can be re-mounted and focus drops to <body>. Put it back on Next at once, before the brief's own first focus
  const mode = phoneBrief ? "phone-brief" : short ? "short" : compact ? "compact" : pinned ? "pinned" : "full";
  useLayoutEffect(() => {
    if (step === null || !focusInCard.current) return;
    const el = document.activeElement;
    if (!el || el === document.body) nextRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // arrow keys that already mean something where focus is (tabs, segmented controls, menus, sliders)
      if (t?.closest?.('[role=tablist],[role=radiogroup],[role=menu],[role=slider],[role=listbox]')) return;
      // never step the demo behind a drawer: its scrim covers this card (the brief does not, so no brief guard)
      const st = useAtlas.getState();
      if (st.sourcesOpen || st.methodOpen) return;
      const to = step + (e.key === "ArrowRight" ? 1 : -1);
      if (to < 0 || to >= STEPS.length) return;
      e.preventDefault();
      go(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  // publish the card's height (the brief keeps its end scrollable clear of it below lg) and, while it sits at the top, its
  // bottom edge (the phone inspector sheet starts 120px below it). A layout effect, so the camera (which reads them) sees
  // them on the same commit; the layout box, not the entry animation's transform (the card is fixed: offsetTop is from the viewport)
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !active) return;
    const root = document.documentElement.style;
    const upd = () => {
      root.setProperty("--demo-card-h", `${el.offsetHeight}px`);
      if (!pinned) root.setProperty("--demo-card-bottom", `${el.offsetTop + el.offsetHeight}px`);
      else root.removeProperty("--demo-card-bottom");
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--demo-card-h");
      root.removeProperty("--demo-card-bottom");
    };
  }, [active, pinned, compact, phone, short, layout.pillVisible, layout.focal.t]);

  // geometry (SPEC §3): only from the layout variables
  const cardW = "var(--demo-card-w, 520px)";
  const style: CSSProperties = pinned
    ? wide
      ? { left: "var(--gutter)", bottom: "calc(var(--gutter) + var(--safe-b, 0px))", width: 400 }
      : { left: "var(--gutter)", right: "var(--gutter)", bottom: "calc(var(--gutter) + var(--safe-b, 0px))" }
    : phone
      ? { left: "var(--gutter)", right: "var(--gutter)", top: "var(--panel-top)" }
      : {
          width: cardW,
          // centred in the focal hole (the map key waits bottom-left while the demo runs); --focal-t already clears the lg/md rail pill
          left: `calc(var(--focal-l) + (var(--focal-w) - ${cardW}) / 2)`,
          top: "var(--focal-t)",
        };

  const failureText = engineDown
    ? "The engine didn't return a comparison, so this step has no pairs to show. The Opportunities panel has the details."
    : "This pair isn't in the current comparison, so this step has nothing to show.";

  if (step === null) return <AnimatePresence />;

  const last = step === STEPS.length - 1;
  const closeupButton = (size: "sm" | "lg", tight?: boolean) => (
    <Button
      variant="ghost"
      size={size}
      className={clsx("bg-fill-1", tight && "px-3!")}
      icon={<Box size={14} strokeWidth={1.75} />}
      disabled={!selected || !pairOpen}
      onClick={() => useAtlas.getState().openCloseup()}
    >
      3D close-up
    </Button>
  );
  const proofButton = (
    <Button
      variant="ghost"
      size={phone ? "lg" : "sm"}
      className="bg-fill-1"
      onClick={() => {
        end();
        useAtlas.getState().openMethod("proof");
      }}
    >
      Sperry&apos;s worked example <span className="text-ok">✓</span> <span className="num">6/6</span>
    </Button>
  );
  const retryButton = (
    <Button variant="secondary" size={phone ? "lg" : "sm"} icon={<RotateCw size={14} />} onClick={() => void runStep(step)} aria-label="Retry this step">
      Retry
    </Button>
  );
  const moreButton = (
    <button
      type="button"
      onClick={() => setMore(!more)}
      aria-expanded={more}
      aria-controls="demo-body"
      className="h-11 rounded-control px-1 text-caption text-fg-2 underline decoration-fg-4 underline-offset-2 hover:text-fg-1"
    >
      {more ? "Less" : "More"}
    </button>
  );
  // Previous · Next / Finish (the same element on every step, so focus stays on it)
  const stepButtons = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <IconButton label="Previous step" tooltip="Previous step · ←" size={phone ? "xl" : "md"} variant="secondary" onClick={() => go(step - 1)} disabled={step === 0}>
        <ArrowLeft size={phone ? 18 : 15} strokeWidth={1.75} />
      </IconButton>
      <Tooltip content={short && !last ? "Next step" : null} shortcut="→" side="bottom" describe={false}>
        <Button
          ref={nextRef}
          variant="primary"
          size={phone ? "xl" : "md"}
          onClick={() => (!last ? go(step + 1) : end())}
          iconRight={!last ? <ArrowRight size={phone ? 17 : 15} strokeWidth={1.75} /> : undefined}
          className={phone ? "min-w-[104px]" : "min-w-[92px]"}
        >
          {!last ? "Next" : "Finish"}
        </Button>
      </Tooltip>
    </div>
  );

  /** The key number well of step i (one grid cell per step, so its height never jumps). */
  const keyWell = (i: number, className?: string) => {
    const on = i === step;
    const key = keys[i];
    const showFailure = on && failed;
    const parts = keyParts(key, shortKeys);
    return (
      <div
        className={clsx(
          "num flex min-h-9 min-w-0 items-center gap-2 rounded-card bg-fill-1 px-3 py-1.5 text-fg-2",
          // the 400px card pinned beside the brief takes the caption size, so step 8's line reads in full
          phone || pinned || short ? "text-caption" : "text-ui",
          !showFailure && (key || (on && running)) ? "" : "invisible",
          className,
        )}
      >
        {key && !(on && running && i > 0) ? (
          // up to two lines (a narrow card), never cut mid-figure
          <span className="line-clamp-2 min-w-0 text-pretty">
            {parts.map((t, j) => (
              <Fragment key={j}>
                {j > 0 && <span className="px-1.5 text-fg-4">·</span>}
                <KeyText text={t} />
              </Fragment>
            ))}
          </span>
        ) : on && running ? (
          <span className="flex items-center gap-2 text-fg-2">
            <Spinner size={13} /> Running the comparison…
          </span>
        ) : (
          <span aria-hidden>&nbsp;</span>
        )}
      </div>
    );
  };

  /** The per-step cell classes: the outgoing step clears quickly, the incoming one settles in just after it. */
  const cell = (i: number) =>
    clsx(
      "col-start-1 row-start-1 flex min-w-0 flex-col transition-[opacity,transform,visibility] ease-enter",
      i === step
        ? "visible translate-x-0 opacity-100 delay-(--dur-1) duration-(--dur-3)"
        : clsx("invisible opacity-0 duration-(--dur-1)", i < step ? "-translate-x-2" : "translate-x-2"),
    );

  const keySay = keyParts(keys[step], shortKeys).join(" · ");
  const bodySay = failed ? failureText : typeof bodies[step] === "string" ? (bodies[step] as string) : (STEPS[step].say ?? "");

  return (
    <AnimatePresence>
      <motion.div
        key="demo"
        ref={card}
        role="region"
        aria-label="Guided demo"
        data-demo-card=""
        {...mapUi(pinned ? "bottom" : "top")}
        initial={{ opacity: 0, y: pinned ? 12 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        style={style}
        onFocusCapture={() => (focusInCard.current = true)}
        onBlurCapture={(e) => {
          const to = e.relatedTarget as Node | null;
          if (to && !card.current?.contains(to)) focusInCard.current = false;
        }}
        className={clsx(
          "fixed flex flex-col print:hidden",
          // over the brief's light paper a frosted card turns muddy grey: solid there
          panelClass(pinned ? "solid" : "panel"),
          phone ? "p-3" : "p-4",
          // above the brief's scrim, and on phones above the sheets and the full-screen close-up; behind an open drawer (its
          // scrim covers the card); on desktop under the panels, so the lg/md rail overlay is never covered
          drawerOpen ? "z-(--z-chrome)" : pinned || phone ? "z-(--z-demo)" : "z-(--z-chrome)",
          !pinned && !phone && "transition-[left,width] duration-(--dur-4) ease-enter",
        )}
      >
        {/* header: counter · progress (Go to step N, the same segmented dashes on every step and tier) · exit */}
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0 text-fg-2">
            Guided demo · <span className="num text-fg-1">{step + 1}/{STEPS.length}</span>
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {STEPS.map((s, i) => (
              <Tooltip key={i} content={`${i + 1} · ${s.title}`} side="bottom" delay={250}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to step ${i + 1}`}
                  aria-current={i === step ? "step" : undefined}
                  // the phone card over the inspector sheet keeps its 24px header, so the pair's strip of map never shrinks
                  className={clsx("group tap-44 relative flex flex-1 items-center rounded-chip", phone ? (compact ? "h-6" : "h-8") : "h-5")}
                >
                  <span
                    className={clsx(
                      "h-[3px] w-full rounded-pill transition-colors duration-(--dur-2)",
                      i === step ? "bg-fg-1" : i < step ? "bg-fg-3 group-hover:bg-fg-2" : "bg-fill-3 group-hover:bg-edge-strong",
                    )}
                  />
                </button>
              </Tooltip>
            ))}
          </div>
          <IconButton label="Exit demo" tooltip="Exit demo · Esc" size={phone ? "lg" : "sm"} onClick={end} className={phone ? "-my-2 -mr-2" : "-my-1 -mr-1.5"}>
            <X size={phone ? 18 : 14} strokeWidth={1.75} />
          </IconButton>
        </div>

        {phoneBrief ? (
          // phones over the brief: title + Previous / Finish on one row; the narration and the proof behind "More"
          <>
            <div className="mt-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-heading font-semibold text-balance text-fg-1">{STEPS[step].title}</h2>
                {!failed && <span className="-ml-1 -my-3 block">{moreButton}</span>}
              </div>
              {failed ? retryButton : null}
              {stepButtons}
            </div>
            {(more || failed) && (
              <div className="mt-1.5 flex flex-col gap-2">
                <p id="demo-body" className="text-ui text-pretty text-fg-2">
                  {failed ? failureText : bodies[step]}
                </p>
                {!failed && proof && <div>{proofButton}</div>}
              </div>
            )}
          </>
        ) : (
          <>
            {/* every step in one grid cell: the card is always as tall as its tallest step */}
            <div className={clsx("grid", phone || short ? "mt-2" : "mt-2.5")}>
              {STEPS.map((s, i) => {
                const on = i === step;
                const showFailure = on && failed;
                return (
                  <div key={i} aria-hidden={!on || undefined} inert={!on} className={cell(i)}>
                    <div className="flex min-w-0 items-start gap-3">
                      <h2 className={clsx("min-w-0 flex-1 font-semibold text-balance text-fg-1", phone || short ? "text-heading" : "text-title")}>{s.title}</h2>
                      {/* the short card has no footer: the step's own action rides beside its title */}
                      {short && s.action === "closeup" && !showFailure && <span className="-my-0.5 shrink-0">{closeupButton("sm")}</span>}
                    </div>
                    {showFailure ? (
                      <p className={clsx("mt-1 flex gap-2 text-fg-2", phone ? "mb-2 text-ui" : short ? "mb-2.5 text-body" : "mb-3 text-body")}>
                        <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                        <span>{failureText}</span>
                      </p>
                    ) : (
                      <p
                        id={on ? "demo-body" : undefined}
                        className={clsx(
                          "mt-1 text-pretty text-fg-2",
                          phone ? "mb-2 text-ui" : short ? "mb-2.5 text-body" : "mb-3 text-body",
                          compact && !(on && more) && "line-clamp-2",
                        )}
                      >
                        {bodies[i]}
                      </p>
                    )}
                    {/* the key number: one mono line (two on a narrow card), reserved on every step so the height never
                        jumps; the short card sets it beside the buttons instead */}
                    {!short && keyWell(i, "mt-auto")}
                  </div>
                );
              })}
            </div>

            {short ? (
              // short laptop screens: key number · (Retry) · Previous · Next on one line, no footer
              <div className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1">
                  {STEPS.map((_, i) => (
                    <div key={i} aria-hidden={i !== step || undefined} className={cell(i)}>
                      {keyWell(i)}
                    </div>
                  ))}
                </div>
                {failed && retryButton}
                {stepButtons}
              </div>
            ) : (
              // footer: the step's own action (or the keys) · Previous · Next / Finish
              <div className={clsx("flex flex-wrap items-center gap-2", phone ? "mt-2" : "mt-3")}>
                {failed ? (
                  retryButton
                ) : compact ? (
                  // phones with the sheet up: the step's "3D close-up" (tighter, so it fits beside the text toggle and the step
                  // buttons on a 375px line) and the rest of the body one tap away
                  <>
                    {STEPS[step].action === "closeup" && closeupButton("lg", true)}
                    <span className="-ml-1">{moreButton}</span>
                  </>
                ) : STEPS[step].action === "closeup" ? (
                  closeupButton(phone ? "lg" : "sm")
                ) : STEPS[step].action === "proof" && proof ? (
                  proofButton
                ) : (
                  !phone && (
                    <span className="fine:flex hidden items-center gap-1 text-caption text-fg-3" aria-hidden>
                      <Kbd size="sm">←</Kbd>
                      <Kbd size="sm">→</Kbd>
                      <span className="ml-1">to step</span>
                    </span>
                  )
                )}
                {stepButtons}
              </div>
            )}
          </>
        )}
        {/* the narration itself, not only the title: a screen reader hears what the card says */}
        <p className="sr-only" aria-live="polite">
          {`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].title}. ${bodySay}${keySay ? ` ${keySay}.` : ""}`}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
