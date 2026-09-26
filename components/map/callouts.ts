import type mapboxgl from "mapbox-gl";
import { getLayout } from "@/lib/layout";
import { useAtlas } from "@/lib/store";
import { hasLayer } from "./layers";

/**
 * The selected pair's HTML callouts (Mapbox markers holding a `[data-callout]` box) and their placement.
 * Glass pills with a utility-colour left bar; titles wrap to two lines instead of truncating.
 */

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const phone = () => typeof window !== "undefined" && window.innerWidth < 768;

/** A 0×0 marker root; the callout box inside is translated to its chosen spot. */
function root() {
  const el = document.createElement("div");
  el.className = "pointer-events-none relative";
  return el;
}

const BOX = "pointer-events-none absolute left-0 top-0 chrome rounded-control";

export function projectLabel(title: string, owner: string, role: "a" | "b") {
  const color = role === "a" ? "var(--util-a)" : "var(--util-b)";
  const el = root();
  // phones: title only and narrower, so the pair's callouts fit the strip of map above the inspector sheet
  el.innerHTML = `<div data-callout data-role="${role}" class="${BOX} w-max py-1.5 pl-3 pr-2.5 ${phone() ? "max-w-[150px]" : "max-w-[216px]"}" style="box-shadow: inset 2px 0 0 ${color}, var(--elev-chip)">
    ${phone() ? "" : `<div class="mb-0.5 truncate font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em]" style="color:${color}">${escapeHtml(owner)}</div>`}
    <div class="line-clamp-2 text-[12px] font-medium leading-[1.3] text-fg-1" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
  </div>`;
  return el;
}

export function siteMarker(label: string, caption: string) {
  const el = root();
  el.innerHTML = `<div data-callout data-role="site" class="${BOX} w-max py-1.5 pl-3 pr-2.5 ${phone() ? "max-w-[184px]" : "max-w-[232px]"}" style="box-shadow: inset 2px 0 0 var(--overlap), var(--elev-chip)">
    <div class="mb-0.5 font-mono text-[11px] font-medium uppercase leading-[1.25] tracking-[0.06em] text-overlap">${escapeHtml(caption)}</div>
    <div class="line-clamp-2 text-[12px] font-medium leading-[1.3] text-fg-1">${escapeHtml(label)}</div>
  </div>`;
  return el;
}

export function distanceLabel(label: string, beyond: boolean) {
  const el = root();
  el.innerHTML = `<div data-callout data-role="distance" class="${BOX} num w-max whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] leading-[1.35] ${beyond ? "text-fg-2" : "text-overlap"}">${escapeHtml(label)}</div>`;
  return el;
}

/** The shared site's amber beacon (its pulse is the page's one looping animation while such a pair is selected). */
export function siteDot() {
  const el = root();
  el.innerHTML = `
    <span class="site-pulse absolute left-1/2 top-1/2 block size-9 rounded-full" style="border:1.5px solid var(--overlap)"></span>
    <span class="absolute left-1/2 top-1/2 block size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style="background:var(--overlap);box-shadow:0 0 0 3px rgb(245 184 61 / .22),0 0 14px rgb(245 184 61 / .55)"></span>`;
  return el;
}

/** "01" "02" "03": mono map chips on the top-ranked links after a run (click selects the pair). */
export function rankChip(label: string, name: string, onClick: () => void) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", name);
  el.title = name;
  el.className =
    "num chrome grid h-6 min-w-8 cursor-pointer place-items-center rounded-full px-2 text-[11px] font-medium text-overlap transition-[transform,opacity,background-color] duration-200 ease-enter hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-1 active:scale-95";
  el.textContent = label;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

/* ------------------------------------------------ layout ------------------------------------------------ */

export interface Callout {
  /** the label box, absolutely placed inside a 0×0 marker root that sits on `at` */
  box: HTMLElement;
  at: [number, number];
  /** candidate top-left offsets from the marker point, best first */
  spots: (w: number, h: number) => { x: number; y: number }[];
  /** hide instead of drawing over something */
  optional: boolean;
}

type Box = { x: number; y: number; w: number; h: number };
export type Dot = { at: [number, number]; weight: number; site?: boolean };

function overlapArea(a: Box, b: Box) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The part of the map no panel covers, in map-container px: the focal hole, below a floating demo card. */
function usableView(host: DOMRect): Box {
  const l = getLayout();
  const st = useAtlas.getState();
  let top = l.focal.t;
  let bottom = l.vh - l.focal.b;
  const left = l.focal.l;
  const right = l.vw - l.focal.r;
  if (st.demoStep !== null && !st.briefOpen) {
    const card = document.querySelector('[data-demo-card], [role="region"][aria-label="Guided demo"]')?.getBoundingClientRect();
    if (card && card.height > 0 && card.bottom < l.vh / 2) top = Math.max(top, card.bottom);
  }
  if (l.tier === "phone" && st.inspectorOpen) {
    // the sheet's settled top (its slide-in transform would read too low mid-animation)
    const sheet = document.querySelector('aside[aria-label="Evidence inspector"]')?.getBoundingClientRect();
    if (sheet && sheet.height > 0) bottom = Math.min(bottom, sheet.top);
  }
  return {
    x: left - host.left + 4,
    y: top - host.top + 4,
    w: Math.max(80, right - left - 8),
    h: Math.max(40, bottom - top - 8),
  };
}

/**
 * Label placement, in rank order: each callout wants a spot that stays inside the focal hole and clear of floating UI,
 * the pair's dots and every higher-ranked callout. At rest, a small branch-and-bound search takes the combination with
 * the least covered area, ties going to the preferred spots; an optional callout that cannot sit clear is hidden.
 * While the camera moves, a callout keeps its spot as long as that spot stays clear, so labels do not hop mid-flight.
 */
export function layoutCallouts(map: mapboxgl.Map, items: Callout[], dots: Dot[], moving = false) {
  if (!items.length) return;
  const host = map.getContainer().getBoundingClientRect();
  const view = usableView(host);
  const panels: Box[] = [...document.querySelectorAll<HTMLElement>("[data-map-ui]")]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      x: r.left - host.left,
      y: r.top - host.top,
      w: r.width,
      h: r.height,
    }));
  const dotBoxes = dots.map((d) => {
    const p = map.project(d.at);
    return {
      x: p.x - 9,
      y: p.y - 9,
      w: 18,
      h: 18,
      weight: d.weight,
      site: !!d.site,
    };
  });
  const sites = dotBoxes.filter((d) => d.site).map((d) => ({ x: d.x + 9, y: d.y + 9 }));
  // the pair's place names (gl-point-labels: 11px, anchored top below the dot, wrapped at 10em); the one on the shared
  // site is left out, since the site callout already names that place
  const names: Box[] = [];
  const labels = hasLayer(map, "gl-point-labels") ? map.queryRenderedFeatures({ layers: ["gl-point-labels"] }) : [];
  for (const f of labels) {
    if (f.geometry.type !== "Point") continue;
    const p = map.project(f.geometry.coordinates as [number, number]);
    if (sites.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 2)) continue;
    const text = String(f.properties?.label ?? "");
    const w = Math.min(text.length * 6, 116);
    const h = Math.ceil((text.length * 6) / 116) * 13;
    names.push({ x: p.x - w / 2, y: p.y + 10, w, h });
  }
  // map-3d's ground chips ("25 mi from …", "Beyond 25 mi · shared site"): centred on their point, ~11.5px text + chip padding
  const chips: Box[] = [];
  const scene = hasLayer(map, "gl3d-labels") ? map.queryRenderedFeatures({ layers: ["gl3d-labels"] }) : [];
  for (const f of scene) {
    if (f.geometry.type !== "Point" || f.properties?.k === "rank") continue;
    const p = map.project(f.geometry.coordinates as [number, number]);
    const w = String(f.properties?.t ?? "").length * 6.4 + 18;
    chips.push({ x: p.x - w / 2, y: p.y - 11, w, h: 22 });
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const cands = items.map((c) => {
    const p = map.project(c.at);
    const [w, h] = [c.box.offsetWidth, c.box.offsetHeight];
    const base = c.spots(w, h).map((s) => ({ s, r: { x: p.x + s.x, y: p.y + s.y, w, h } }));
    // each spot again, slid back inside the view by at most half the box so it stays attached to its point; the
    // originals keep indices 0..n-1, so a callout's remembered spot stays stable and ties go to the preferred spots
    const slid = base.map(({ s, r }) => {
      const sx = clamp(clamp(r.x, view.x, view.x + view.w - w) - r.x, -w / 2, w / 2);
      const sy = clamp(clamp(r.y, view.y, view.y + view.h - h) - r.y, -h / 2, h / 2);
      return {
        s: { x: s.x + sx, y: s.y + sy },
        r: { x: r.x + sx, y: r.y + sy, w, h },
      };
    });
    return [...base, ...slid];
  });
  const grow = (r: Box): Box => ({
    x: r.x - 4,
    y: r.y - 4,
    w: r.w + 8,
    h: r.h + 8,
  });
  // clipped or hidden text is lost outright; covering map UI costs as much as covering another callout; the shared
  // site's dot is weighted near a hard rule; a pair's own place names cost least
  const cost = (r: Box, placed: Box[]) =>
    (r.w * r.h - overlapArea(r, view)) * 16 +
    panels.reduce((sum, t) => sum + 3 * overlapArea(r, t), 0) +
    names.reduce((sum, t) => sum + overlapArea(r, t), 0) +
    chips.reduce((sum, t) => sum + 3 * overlapArea(r, t), 0) +
    dotBoxes.reduce((sum, t) => sum + t.weight * overlapArea(r, t), 0) +
    placed.reduce((sum, t) => sum + 3 * overlapArea(r, t), 0);

  // -1 = hidden (optional callouts only)
  let pick: number[] = [];
  if (moving) {
    const placed: Box[] = [];
    items.forEach((c, i) => {
      const prev = Number(c.box.dataset.spot ?? -1);
      const order = cands[i].map((_, k) => k).sort((x, y) => Number(y === prev) - Number(x === prev));
      let [best, low] = [order[0], Infinity];
      for (const k of order) {
        const v = cost(cands[i][k].r, placed);
        if (v < low) [best, low] = [k, v];
        if (v === 0) break;
      }
      pick[i] = low > 0 && c.optional ? -1 : best;
      if (pick[i] >= 0) placed.push(grow(cands[i][best].r));
    });
  } else {
    let bound = Infinity;
    const cur: number[] = [];
    const walk = (i: number, placed: Box[], total: number) => {
      if (total >= bound) return;
      if (i === items.length) {
        [bound, pick] = [total, [...cur]];
        return;
      }
      if (items[i].optional) {
        cur[i] = cands[i].findIndex((c) => cost(c.r, placed) === 0);
        return walk(i + 1, cur[i] >= 0 ? [...placed, grow(cands[i][cur[i]].r)] : placed, total);
      }
      cands[i].forEach((c, k) => {
        cur[i] = k;
        walk(i + 1, [...placed, grow(c.r)], total + cost(c.r, placed));
      });
    };
    walk(0, [], 0);
  }
  items.forEach((c, i) => {
    const k = pick[i];
    const s = cands[i][Math.max(0, k)].s;
    const r = cands[i][Math.max(0, k)].r;
    // a callout whose box would end up outside the focal hole altogether is hidden, never drawn under a panel
    const off = overlapArea(r, view) < r.w * r.h * 0.5;
    const shown = c.box.dataset.spot !== undefined;
    c.box.style.transition = shown ? "transform .2s var(--ease-enter), opacity .2s" : "none";
    c.box.style.transform = `translate(${Math.round(s.x)}px,${Math.round(s.y)}px)`;
    c.box.style.opacity = k < 0 || off ? "0" : "";
    if (k >= 0 || !shown) c.box.dataset.spot = String(Math.max(0, k));
  });
}
