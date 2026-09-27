import type mapboxgl from "mapbox-gl";
import { getLayout } from "@/lib/layout";
import { useAtlas } from "@/lib/store";
import { demoCardRect } from "./camera";
import { hasLayer } from "./layers";

/**
 * The selected pair's HTML callouts (Mapbox markers holding a `[data-callout]` box) and their placement.
 * Glass pills with a utility-colour left bar; titles wrap to two lines instead of truncating.
 */

/**
 * Popups and markers live inside Mapbox's canvas container, whose handlers turn a tap on them into a map tap (which
 * would close a card before its button's click fires). Stop pointer/touch events at the element's root.
 */
export function shieldFromMap(el: HTMLElement) {
  for (const type of ["touchstart", "touchend", "touchmove", "mousedown", "mouseup", "pointerdown", "pointerup", "click", "dblclick", "wheel"]) {
    el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
}

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

/** Where the challenge rule runs out: "25 mi from {A}" in amber, set just outside the ring (placed by layoutCallouts). */
export function ringCallout(text: string) {
  const el = root();
  el.innerHTML = `<div data-callout data-role="ring" class="${BOX} w-max max-w-[208px] rounded-full px-2.5 py-1 text-[11px] font-medium leading-[1.35] text-overlap">${escapeHtml(text)}</div>`;
  return el;
}

/** A line drawn terminal to terminal says so (3D: the ghosted chord), in the line's utility colour. */
export function caveatCallout(color: string) {
  const el = root();
  el.innerHTML = `<div data-callout data-role="caveat" class="${BOX} w-max py-1 pl-2.5 pr-2.5 text-[11px] leading-[1.3] text-fg-2" style="box-shadow: inset 2px 0 0 ${color}, var(--elev-chip)">
    <div class="font-medium" style="color:${color}">Route not published</div>
    <div class="text-fg-3">drawn terminal to terminal</div>
  </div>`;
  return el;
}

/** "01" "02" "03": mono map chips on the top-ranked links after a run (click selects the pair). */
/**
 * Returns `{ root, chip }`: the marker gets `root` (Mapbox owns a marker element's own opacity for terrain occlusion),
 * the reveal fades `chip`.
 */
export function rankChip(label: string, name: string, onClick: () => void): { root: HTMLElement; chip: HTMLElement } {
  const root = document.createElement("div");
  root.className = "pointer-events-none";
  const el = document.createElement("button");
  root.appendChild(el);
  el.type = "button";
  el.setAttribute("aria-label", name);
  el.title = name;
  el.className =
    "num chrome pointer-events-auto grid h-6 min-w-8 cursor-pointer place-items-center rounded-full px-2 text-[11px] font-medium text-overlap transition-[transform,opacity,background-color] duration-200 ease-enter hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-1 active:scale-95";
  el.textContent = label;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  shieldFromMap(root);
  return { root, chip: el };
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
  /** Keep exactly to the listed spots (no slid-into-view variants): a ring label must stay outside its ring. */
  noSlide?: boolean;
}

type Box = { x: number; y: number; w: number; h: number };
/**
 * Something on the map a callout should not cover: a dot (18px square on its point), or a 3D structure (`w`×`h` px
 * standing on its point, `rise`).
 */
export type Dot = { at: [number, number]; weight: number; site?: boolean; w?: number; h?: number; rise?: boolean };

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
  if (st.demoStep !== null) {
    const card = demoCardRect();
    if (card && card.bottom < l.vh / 2) top = Math.max(top, card.bottom);
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
  // floating UI, plus Mapbox's own logo and attribution button (kept visible for attribution)
  const panels: Box[] = [...document.querySelectorAll<HTMLElement>("[data-map-ui], .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib")]
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
    const [w, h] = [d.w ?? 18, d.h ?? 18];
    return {
      x: p.x - w / 2,
      y: d.rise ? p.y - h : p.y - h / 2,
      w,
      h: d.rise ? h + 6 : h,
      weight: d.weight,
      site: !!d.site,
      px: p.x,
      py: p.y,
    };
  });
  const sites = dotBoxes.filter((d) => d.site).map((d) => ({ x: d.px, y: d.py }));
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
  // map-3d's own rendered map text (the gl3d-labels layer: hotspot counts, 11.5px centred on their point)
  const chips: Box[] = [];
  const scene = hasLayer(map, "gl3d-labels") ? map.queryRenderedFeatures({ layers: ["gl3d-labels"] }) : [];
  for (const f of scene) {
    if (f.geometry.type !== "Point") continue;
    const p = map.project(f.geometry.coordinates as [number, number]);
    const w = String(f.properties?.t ?? "").length * 6.6 + 8;
    chips.push({ x: p.x - w / 2, y: p.y - 9, w, h: 18 });
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const cands = items.map((c) => {
    const p = map.project(c.at);
    const [w, h] = [c.box.offsetWidth, c.box.offsetHeight];
    const base = c.spots(w, h).map((s) => ({ s, r: { x: p.x + s.x, y: p.y + s.y, w, h } }));
    if (c.noSlide) return base;
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
  // an optional callout (distance, ring, caveat) shows only where it is fully in view and clear of every panel, chip,
  // callout and the shared site; it may graze a place name or a structure (≤12% of its box), never more
  const optionalFit = (r: Box, placed: Box[]) => {
    const hard =
      r.w * r.h - overlapArea(r, view) +
      panels.reduce((sum, t) => sum + overlapArea(r, t), 0) +
      chips.reduce((sum, t) => sum + overlapArea(r, t), 0) +
      placed.reduce((sum, t) => sum + overlapArea(r, t), 0) +
      dotBoxes.reduce((sum, t) => sum + (t.site || t.weight > 2 ? overlapArea(r, t) : 0), 0);
    if (hard > 0) return Infinity;
    const soft = names.reduce((sum, t) => sum + overlapArea(r, t), 0) + dotBoxes.reduce((sum, t) => sum + (t.site || t.weight > 2 ? 0 : overlapArea(r, t)), 0);
    return soft <= 0.12 * r.w * r.h ? soft : Infinity;
  };
  const bestOptional = (list: { r: Box }[], placed: Box[], prefer = -1) => {
    let [best, low] = [-1, Infinity];
    const order = list.map((_, k) => k).sort((x, y) => Number(y === prefer) - Number(x === prefer));
    for (const k of order) {
      const v = optionalFit(list[k].r, placed);
      if (v < low) [best, low] = [k, v];
      if (v === 0) break;
    }
    return best;
  };

  // -1 = hidden (optional callouts only)
  let pick: number[] = [];
  if (moving) {
    const placed: Box[] = [];
    items.forEach((c, i) => {
      const prev = Number(c.box.dataset.spot ?? -1);
      if (c.optional) {
        pick[i] = bestOptional(cands[i], placed, prev);
        if (pick[i] >= 0) placed.push(grow(cands[i][pick[i]].r));
        return;
      }
      const order = cands[i].map((_, k) => k).sort((x, y) => Number(y === prev) - Number(x === prev));
      let [best, low] = [order[0], Infinity];
      for (const k of order) {
        const v = cost(cands[i][k].r, placed);
        if (v < low) [best, low] = [k, v];
        if (v === 0) break;
      }
      pick[i] = best;
      placed.push(grow(cands[i][best].r));
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
        cur[i] = bestOptional(cands[i], placed);
        return walk(i + 1, cur[i] >= 0 ? [...placed, grow(cands[i][cur[i]].r)] : placed, total);
      }
      cands[i].forEach((c, k) => {
        cur[i] = k;
        walk(i + 1, [...placed, grow(c.r)], total + cost(c.r, placed));
      });
    };
    walk(0, [], 0);
  }
  const drawn: Box[] = [];
  items.forEach((c, i) => {
    const k = pick[i];
    let s = cands[i][Math.max(0, k)].s;
    let r = cands[i][Math.max(0, k)].r;
    // a shown callout lies wholly inside the view (the strip between a phone's demo card and sheet included): a spot
    // that only partly fits slides the rest of the way in, even if that loosens it from its point a little
    if (k >= 0 && !c.noSlide && r.w <= view.w && r.h <= view.h) {
      const dx = clamp(r.x, view.x, view.x + view.w - r.w) - r.x;
      const dy = clamp(r.y, view.y, view.y + view.h - r.h) - r.y;
      if (dx || dy) {
        s = { x: s.x + dx, y: s.y + dy };
        r = { ...r, x: r.x + dx, y: r.y + dy };
      }
    }
    // a callout whose box would end up outside the focal hole altogether is hidden, never drawn under a panel; one that
    // would sit mostly on top of a higher-ranked callout (a cramped phone strip) steps aside instead of stacking
    const buried = drawn.some((t) => overlapArea(r, t) > r.w * r.h * 0.2);
    const off = overlapArea(r, view) < r.w * r.h * 0.5 || (k >= 0 && buried);
    if (k >= 0 && !off) drawn.push(r);
    const shown = c.box.dataset.spot !== undefined;
    c.box.style.transition = shown ? "transform .2s var(--ease-enter), opacity .2s" : "none";
    c.box.style.transform = `translate(${Math.round(s.x)}px,${Math.round(s.y)}px)`;
    c.box.style.opacity = k < 0 || off ? "0" : "";
    if (k >= 0 || !shown) c.box.dataset.spot = String(Math.max(0, k));
  });
}
