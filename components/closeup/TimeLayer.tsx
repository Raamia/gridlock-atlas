"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";
import { PLINTH_R } from "./model";
import { SWEEP_MS } from "./story";
import { Bag, COLOR } from "./three-helpers";
import { GAP_OFFSET, yearAt, type TimeModel, type TimePillar } from "./time";

/*
 * The close-up's time axis in three.js (model: ./time.ts). Everything here is built once per pair and animated by ONE
 * shared state, so the labels (Scene.tsx LabelSync) and the geometry always agree:
 *
 * - rise 0…1: the axis raises out of the plinth (every height × rise); 0 = the flat ground view.
 * - sweep: the "now" of the intro / story, in axis units. Pillars, tubes and the overlap grow only up to it, a bead
 *   flashes when the sweep reaches its date, and a big year counter (DOM, written here) runs alongside. Infinity = done.
 *
 * Height is display only; nothing here feeds distance, overlap or ranking.
 */

/** What the scene reads each frame (written only by the TimeDriver). */
export interface TimeAnimState {
  /** Eased 0…1. */
  readonly rise: number;
  /** Sweep height in axis units; Infinity when no sweep is running. */
  readonly sweep: number;
  readonly sweeping: boolean;
}

const RISE_S = 1.1;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t: number) => THREE.MathUtils.smoothstep(t, 0, 1);

/**
 * Owns the rise / sweep state (one per close-up). Plain methods, so the per-frame writes live outside React's render
 * data; the scene, the label sync and the pins only read it.
 */
export class TimeDriver implements TimeAnimState {
  rise: number;
  sweep = Infinity;
  sweeping = false;
  private riseLin: number;
  private goal: number;
  private sweepStart: number | null = null;
  private lastEvent = "";
  /** A sweep ran to its end: its final year stays on the counter while the axis stands. */
  swept = false;

  constructor(on: boolean) {
    this.riseLin = this.rise = this.goal = on ? 1 : 0;
  }

  setGoal(on: boolean, instant: boolean, counter: HTMLElement | null): void {
    this.goal = on ? 1 : 0;
    if (instant) this.riseLin = this.rise = this.goal;
    // the year counter belongs to the standing axis: the flat view hides it, raising the axis again brings it back
    if (counter) counter.dataset.on = on && (this.sweeping || this.swept) ? "1" : "0";
  }

  startSweep(): void {
    this.sweepStart = performance.now() + 250;
    this.sweep = 0;
    this.sweeping = true;
    // never equal to a real caption: the first frame always rewrites the last sweep's text
    this.lastEvent = "\u0000";
  }

  stopSweep(counter: HTMLElement | null): void {
    this.sweepStart = null;
    this.sweep = Infinity;
    this.sweeping = false;
    this.swept = false;
    if (counter) counter.dataset.on = "0";
  }

  /** Advance one frame; true while something is still moving. */
  frame(delta: number, tm: TimeModel, counter: HTMLElement | null): boolean {
    let moving = false;
    if (this.riseLin !== this.goal) {
      const step = Math.min(delta, 0.05) / RISE_S;
      this.riseLin = this.goal > this.riseLin ? Math.min(this.goal, this.riseLin + step) : Math.max(this.goal, this.riseLin - step);
      this.rise = ease(this.riseLin);
      moving = true;
    }
    if (this.sweepStart === null) return moving;
    const t = (performance.now() - this.sweepStart) / SWEEP_MS;
    if (t >= 1) {
      this.sweepStart = null;
      this.sweep = Infinity;
      this.sweeping = false;
      this.swept = true;
      // the counter stays up on the sweep's last year (hidden only by the flat view or a stopped sweep)
      if (counter) {
        counter.dataset.on = this.rise > 0 && this.goal === 1 ? "1" : "0";
        const y = counter.querySelector("[data-year]");
        if (y) y.textContent = String(Math.min(tm.epoch + tm.years - 1, Math.floor(yearAt(tm, tm.height))));
      }
      return true;
    }
    this.sweep = Math.max(0, t) * (tm.height + tm.unitsPerYear * 0.15);
    if (counter) {
      counter.dataset.on = this.goal === 1 ? "1" : "0";
      const year = String(Math.min(tm.epoch + tm.years - 1, Math.floor(yearAt(tm, Math.min(this.sweep, tm.height)))));
      const y = counter.querySelector("[data-year]");
      if (y && y.textContent !== year) y.textContent = year;
      const ev = [...tm.events].reverse().find((e) => e.y <= this.sweep);
      const text = ev?.text ?? "";
      if (text !== this.lastEvent) {
        this.lastEvent = text;
        const e = counter.querySelector<HTMLElement>("[data-event]");
        if (e) {
          e.textContent = text;
          e.dataset.side = ev?.side ?? "";
        }
      }
    }
    return true;
  }
}

/**
 * Drives rise and sweep (runs before the controls and the label sync). `sweepKey` > 0 starts a sweep whenever it (or
 * the pair) changes; `instant` (reduced motion, automation) jumps to the end state.
 */
export function TimeAnim({
  anim,
  timeOn,
  sweepKey,
  instant,
  tm,
  counter,
}: {
  anim: TimeDriver;
  timeOn: boolean;
  sweepKey: number;
  instant: boolean;
  tm: TimeModel;
  counter: RefObject<HTMLDivElement | null>;
}) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    anim.setGoal(timeOn, instant, counter.current);
    get().invalidate();
  }, [timeOn, instant, anim, counter, get]);
  useEffect(() => {
    if (!sweepKey || instant) anim.stopSweep(counter.current);
    else anim.startSweep();
    get().invalidate();
  }, [sweepKey, instant, anim, counter, get, tm]);
  useFrame((state, delta) => {
    if (anim.frame(delta, tm, counter.current)) state.invalidate();
  }, -3);
  return null;
}

/* ─────────────────────────────────────────── the layer ─────────────────────────────────────────── */

type Kind = "seg" | "point" | "sheet" | "now";

interface Item {
  obj: THREE.Object3D;
  kind: Kind;
  /** Axis heights (units): a segment spans from → to; a point / sheet sits at `from`. */
  from: number;
  to: number;
  /** Grows with the sweep (false: the axis and its ticks, always there once raised). */
  reveal: boolean;
  mats: { m: THREE.Material; base: number }[];
  /** Beads pulse when the sweep reaches them. */
  flash?: boolean;
}

interface Hover {
  text: string;
  sub?: string;
  y: number;
  mats: THREE.MeshStandardMaterial[];
  /** Click-to-focus keeps the height that was clicked (things standing in the air). */
  keepY?: boolean;
}

/** Hidden meshes must not catch the pointer (three's raycaster ignores `visible`). */
function onlyWhenVisible<T extends THREE.Mesh>(mesh: T): T {
  const cast = mesh.raycast.bind(mesh);
  mesh.raycast = (rc, hits) => {
    if (mesh.visible) cast(rc, hits);
  };
  return mesh;
}

/** A vertical alpha ramp for tubes whose start (bottom) or end (top) is not published. */
function fadeTexture(where: "bottom" | "top", solid = 0): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  // canvas y = 0 is the top of the texture (flipY maps it to the tube's top)
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  if (where === "bottom") {
    g.addColorStop(0, "#fff");
    g.addColorStop(solid, "#fff");
    g.addColorStop(1, "#000");
  } else {
    g.addColorStop(0, "#000");
    g.addColorStop(1 - solid, "#fff");
    g.addColorStop(1, "#fff");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function buildTimeLayer(tm: TimeModel, bag: Bag): { root: THREE.Group; update: (anim: TimeAnimState) => void } {
  const root = new THREE.Group();
  root.name = "time-layer";
  const items: Item[] = [];
  const unitCyl = bag.add(new THREE.CylinderGeometry(1, 1, 1, 18, 1, false));
  const unitTube = bag.add(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true));
  const basic = (color: THREE.ColorRepresentation, opacity: number, extra: THREE.MeshBasicMaterialParameters = {}) =>
    bag.add(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, ...extra }));

  const seg = (x: number, z: number, from: number, to: number, r: number, mat: THREE.MeshBasicMaterial, hover: Hover | null, opts: { reveal?: boolean; open?: boolean; order?: number } = {}) => {
    const mesh = onlyWhenVisible(new THREE.Mesh(opts.open ? unitTube : unitCyl, mat));
    mesh.position.set(x, 0, z);
    mesh.scale.set(r, 1, r);
    mesh.renderOrder = opts.order ?? 5;
    if (hover) mesh.userData.hover = hover;
    root.add(mesh);
    items.push({ obj: mesh, kind: "seg", from, to, reveal: opts.reveal ?? true, mats: [{ m: mat, base: mat.opacity }] });
    return mesh;
  };

  const colorOf = (p: TimePillar) => (p.side === "a" ? COLOR.a : COLOR.b);

  for (const p of tm.pillars) {
    const color = colorOf(p);
    const { x, z } = p.at;
    // the stalk: ground → the pillar's top
    if (p.top > 0) seg(x, z, 0, p.top, 0.026, basic(color, 0.6), { text: `${p.owner} · ${p.title}`, sub: "height is time, not elevation", y: 0, mats: [], keepY: true });
    if (p.bar) {
      const b = p.bar;
      const honesty =
        b.tone === "schedule" ? "start → in-service · not field-work dates" : b.tone === "construction" ? "published construction window" : "published window · phase not stated";
      const hover: Hover = { text: b.text, sub: b.openStart ? `${honesty} · started earlier; the start year is not published` : honesty, y: 0, mats: [], keepY: true };
      const fillOpacity = b.tone === "construction" ? 0.34 : 0.26;
      const tex = b.openEnd ? fadeTexture("top", 0.45) : null;
      if (tex) bag.add(tex);
      seg(x, z, b.from, b.to, 0.14, basic(color, fillOpacity, tex ? { alphaMap: tex } : {}), hover);
      // a bright core so the tube reads as a span, not a glow
      seg(x, z, b.from, b.to, 0.055, basic(color, 0.6, tex ? { alphaMap: tex } : {}), null);
      if (b.openStart) {
        const fade = fadeTexture("bottom");
        if (fade) seg(x, z, Math.max(0, b.from - tm.unitsPerYear), b.from, 0.14, basic(color, fillOpacity, { alphaMap: bag.add(fade) }), hover);
      }
    }
    if (p.isd) {
      const d = p.isd;
      const hover: Hover = {
        text: `${p.owner} · in service ${d.text}`,
        sub: d.crisp ? "stated to the day" : "stated as a period: drawn across all of it",
        y: 0,
        mats: [],
        keepY: true,
      };
      const glow = new THREE.Color(color).multiplyScalar(1.9);
      if (d.crisp) {
        const mat = basic(glow, 1);
        const bead = onlyWhenVisible(new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.17, 28, 18)), mat));
        bead.position.set(x, 0, z);
        bead.renderOrder = 6;
        bead.userData.hover = hover;
        root.add(bead);
        items.push({ obj: bead, kind: "point", from: d.from, to: d.from, reveal: true, mats: [{ m: mat, base: 1 }], flash: true });
      } else {
        seg(x, z, d.from, Math.max(d.to, d.from + 0.02), 0.17, basic(glow, 0.92), hover, { order: 6 });
      }
      // a halo on the date, so it reads from any angle
      const halo = basic(color, 0.7, { side: THREE.DoubleSide });
      const ring = new THREE.Mesh(bag.add(new THREE.RingGeometry(0.26, 0.3, 48)), halo);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0, z);
      ring.renderOrder = 6;
      root.add(ring);
      items.push({ obj: ring, kind: "point", from: d.crisp ? d.from : d.to, to: d.to, reveal: true, mats: [{ m: halo, base: 0.7 }] });
    }
  }

  // ---- overlap: a gold bridge between the pillars over the shared span ----
  const [pA, pB] = [tm.pillars.find((p) => p.side === "a"), tm.pillars.find((p) => p.side === "b")];
  if (tm.overlap && pA && pB) {
    const o = tm.overlap;
    const dx = pB.at.x - pA.at.x;
    const dz = pB.at.z - pA.at.z;
    const w = Math.hypot(dx, dz);
    const hover: Hover = { text: o.text, sub: o.confirmed ? `both ${o.noun} run through this span` : "at the precision the sources state · not confirmed", y: 0, mats: [], keepY: true };
    const fill = basic(COLOR.overlap, o.confirmed ? 0.2 : 0.1, { side: THREE.DoubleSide });
    if (w > 0.3) {
      const plane = onlyWhenVisible(new THREE.Mesh(bag.add(new THREE.PlaneGeometry(w, 1)), fill));
      plane.position.set(tm.mid.x, 0, tm.mid.z);
      plane.rotation.y = -Math.atan2(dz, dx);
      plane.renderOrder = 4;
      plane.userData.hover = hover;
      root.add(plane);
      items.push({ obj: plane, kind: "seg", from: o.from, to: o.to, reveal: true, mats: [{ m: fill, base: fill.opacity }] });
      // bright edges at the span's start and end
      const edgeGeo = bag.add(new THREE.BoxGeometry(w, 0.024, 0.024));
      for (const at of [o.from, o.to]) {
        const em = basic(COLOR.overlap, o.confirmed ? 0.9 : 0.55);
        const edge = new THREE.Mesh(edgeGeo, em);
        edge.position.set(tm.mid.x, 0, tm.mid.z);
        edge.rotation.y = plane.rotation.y;
        edge.renderOrder = 5;
        root.add(edge);
        items.push({ obj: edge, kind: "point", from: at, to: at, reveal: true, mats: [{ m: em, base: em.opacity }] });
      }
    } else {
      // both pillars stand on one spot: a gold sleeve around them instead
      seg(tm.mid.x, tm.mid.z, o.from, o.to, 0.4, fill, hover, { open: true, order: 4 });
    }
  }

  // ---- in-service gap: a measured bracket beside the pair, toward the side-on camera ----
  if (tm.gap && pA && pB) {
    const g = tm.gap;
    const dx = pB.at.x - pA.at.x;
    const dz = pB.at.z - pA.at.z;
    const len = Math.hypot(dx, dz) || 1;
    const [ux, uz] = len > 0.3 ? [dx / len, dz / len] : [1, 0];
    const bx = tm.mid.x - uz * GAP_OFFSET;
    const bz = tm.mid.z + ux * GAP_OFFSET;
    const hover: Hover = { text: g.text, sub: "between the nearest stated in-service dates", y: 0, mats: [], keepY: true };
    seg(bx, bz, g.from, g.to, 0.022, basic(COLOR.overlap, 0.95), hover, { order: 6 });
    const capGeo = bag.add(new THREE.BoxGeometry(0.5, 0.024, 0.024));
    for (const at of [g.from, g.to]) {
      const cm = basic(COLOR.overlap, 0.95);
      const cap = new THREE.Mesh(capGeo, cm);
      cap.position.set(bx, 0, bz);
      cap.rotation.y = -Math.atan2(uz, ux);
      cap.renderOrder = 6;
      root.add(cap);
      items.push({ obj: cap, kind: "point", from: at, to: at, reveal: true, mats: [{ m: cm, base: 0.95 }] });
    }
  }

  // ---- the snapshot sheet: translucent glass across the plinth at the snapshot date ----
  {
    const glass = basic("#dfe7ee", 0.035, { side: THREE.DoubleSide });
    const sheet = new THREE.Mesh(bag.add(new THREE.CircleGeometry(PLINTH_R * 0.985, 160)), glass);
    sheet.rotation.x = -Math.PI / 2;
    sheet.renderOrder = 3;
    root.add(sheet);
    items.push({ obj: sheet, kind: "sheet", from: tm.snapshot.y, to: tm.snapshot.y, reveal: true, mats: [{ m: glass, base: 0.035 }] });
    const rimMat = basic("#dfe7ee", 0.2, { side: THREE.DoubleSide });
    const rim = new THREE.Mesh(bag.add(new THREE.RingGeometry(PLINTH_R * 0.975, PLINTH_R * 0.985, 200)), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.renderOrder = 3;
    root.add(rim);
    items.push({ obj: rim, kind: "sheet", from: tm.snapshot.y, to: tm.snapshot.y, reveal: true, mats: [{ m: rimMat, base: 0.2 }] });
  }

  // ---- the year ruler on the rim ----
  {
    const { x, z } = tm.axis.at;
    seg(x, z, 0, tm.height, 0.018, basic(COLOR.neutral, 0.55), { text: `Time axis · ${tm.epoch}–${tm.epoch + tm.years}`, sub: "height is time, not elevation", y: 0, mats: [], keepY: true }, { reveal: false });
    const r = Math.hypot(x, z) || 1;
    const out = Math.atan2(z / r, x / r);
    const major = bag.add(new THREE.BoxGeometry(0.3, 0.012, 0.012));
    const minor = bag.add(new THREE.BoxGeometry(0.16, 0.01, 0.01));
    for (const tk of tm.axis.ticks) {
      const m = basic(COLOR.neutral, tk.label ? 0.7 : 0.38);
      const tick = new THREE.Mesh(tk.label ? major : minor, m);
      // pointing outward from the plinth center, starting at the ruler
      const half = (tk.label ? 0.3 : 0.16) / 2;
      tick.position.set(x + Math.cos(out) * half, 0, z + Math.sin(out) * half);
      tick.rotation.y = -out;
      root.add(tick);
      items.push({ obj: tick, kind: "point", from: tk.y, to: tk.y, reveal: false, mats: [{ m, base: m.opacity }] });
    }
  }

  // ---- the moving "now" ring while a sweep runs ----
  {
    const nowMat = basic(COLOR.overlap, 0.4, { side: THREE.DoubleSide });
    const now = new THREE.Mesh(bag.add(new THREE.RingGeometry(PLINTH_R * 0.97, PLINTH_R * 0.99, 200)), nowMat);
    now.rotation.x = -Math.PI / 2;
    now.visible = false;
    root.add(now);
    items.push({ obj: now, kind: "now", from: 0, to: 0, reveal: false, mats: [] });
  }

  return { root, update: (anim) => updateItems(root, items, tm, anim) };
}

/** Per frame: every item's height, clip at the sweep, and fade with the rise. */
function updateItems(root: THREE.Group, items: Item[], tm: TimeModel, anim: TimeAnimState): void {
  const rise = anim.rise;
  const fade = smooth(Math.min(1, rise * 1.6));
  const sweep = anim.sweep;
  root.visible = rise > 0.002;
  if (!root.visible) return;
  for (const it of items) {
    const cut = it.reveal ? sweep : Infinity;
    if (it.kind === "seg") {
      const top = Math.min(it.to, cut);
      const a = it.from * rise;
      const b = top * rise;
      const show = b - a > 0.002;
      it.obj.visible = show;
      if (!show) continue;
      it.obj.position.y = (a + b) / 2;
      it.obj.scale.y = b - a;
    } else if (it.kind === "now") {
      it.obj.visible = anim.sweeping && sweep <= tm.height;
      it.obj.position.y = Math.min(sweep, tm.height) * rise;
      continue;
    } else {
      const show = cut >= it.from;
      it.obj.visible = show;
      if (!show) continue;
      it.obj.position.y = it.from * rise + (it.kind === "sheet" ? 0.002 : 0);
      if (it.flash) {
        const f = anim.sweeping ? Math.max(0, 1 - (sweep - it.from) / (tm.unitsPerYear * 0.7)) : 0;
        it.obj.scale.setScalar(1 + f * 1.6);
      }
    }
    for (const { m, base } of it.mats) m.opacity = base * fade;
  }
}

/** The time axis for one pair. Mounted inside the close-up's hoverable group. */
export function TimeLayer({ tm, anim }: { tm: TimeModel; anim: TimeAnimState }) {
  const built = useMemo(() => {
    const bag = new Bag();
    return { ...buildTimeLayer(tm, bag), bag };
  }, [tm]);
  useEffect(() => () => built.bag.dispose(), [built]);
  useFrame(() => built.update(anim));
  return <primitive object={built.root} />;
}
