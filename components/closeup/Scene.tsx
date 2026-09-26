"use client";

import { ContactShadows, Environment, Lightformer, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Precision } from "@/lib/domain/types";
import { buildLatticeTower, buildMarkerPylon, buildSubstation, towerAttachments, towerTotalHeight } from "@/lib/models/structures";
import { anchorBox, arcHeight, BEACON_H, PIN_H, type Anchor, type AnchorSpec, type Band, type HoverInfo, type LabelSpec } from "./Labels";
import { alongPolyline, PLINTH_R, polyLength, type CloseupModel, type CuProject } from "./model";
import { arcPoints, backdropTexture, Bag, beamTexture, catenary, circlePoints, COLOR, floorTexture, gridSegments, hash01, tint } from "./three-helpers";

/*
 * The close-up diorama (SPEC §7): a to-scale plinth with symbolic structures, framed inside the focal hole with
 * camera.setViewOffset (so the rail, inspector and dock never cover it), orbitable within a narrow polar band.
 */

export interface Frame {
  l: number;
  t: number;
  r: number;
  b: number;
  /** Phone: full-screen, a steeper first view and the plinth allowed slightly wider than the screen. */
  compact?: boolean;
}

export interface CloseupCanvasProps {
  model: CloseupModel;
  frame: Frame;
  /** Bloom / tone mapping / vignette / SMAA (WebGL2, no reduced motion). */
  post: boolean;
  autoRotate: boolean;
  /** Reduced motion: click-to-focus jumps instead of gliding. */
  reducedMotion: boolean;
  /** Labels to keep on their 3D anchors, and the DOM elements PairCloseup rendered for them. */
  labels: LabelSpec[];
  labelEls: Map<string, Element>;
  /** First pointer/wheel interaction: auto-rotate stops for good. */
  onInteract: () => void;
  onHover: (h: HoverInfo | null) => void;
  /** The WebGL context was lost or is not WebGL2. */
  onFail: () => void;
}

const FOV = 30;
const POLAR0 = 0.29 * Math.PI;
const POLAR0_COMPACT = 0.18 * Math.PI;
const AZIMUTH0 = 0.26;
const TARGET = new THREE.Vector3(0, 0.35, 0);
/** Symbolic structure scale: scene units per metre of the procedural models (the plinth radius is always PLINTH_R). */
const STRUCT_SCALE = 0.03;
/** Towers are drawn smaller and sparser than yards so a line reads as a line, not a fence (spacing is symbolic). */
const TOWER_SCALE = 0.02;
const TOWER_SPACING = 1.15;
const TOWER_H = 40;
const TOWER_SPAN = 14;
/** Where the tower model's conductors and earth wires attach (metres, model frame): the model's own geometry. */
const TOWER_WIRES = towerAttachments(TOWER_H, TOWER_SPAN);
const DEG = Math.PI / 180;
/**
 * Heights of the flat overlays above the plinth top (y = 0). They sit BELOW the contact-shadow plane, so the shadow
 * camera (which looks up from that plane) never turns a translucent disc or a ground line into a shadow blob; the
 * camera's near plane (1.5) keeps these few-hundredths offsets free of z-fighting at orbit distance.
 */
const Y = { grid: 0.004, disc: 0.008, discEdge: 0.01, route: 0.012, ruler: 0.013, ring: 0.014, marker: 0.016, beacon: 0.018, shadows: 0.024 } as const;

const utilColor = (p: CuProject) => (p.side === "a" ? COLOR.a : COLOR.b);

const PRECISION_TEXT: Record<Precision, string> = {
  "official-gis": "official GIS",
  "official-map-digitized": "digitized from an official map · approximate",
  "named-facility": "named facility",
  locality: "town-level · approximate",
  county: "county-level only",
  unknown: "location unknown",
};

/* ───────────────────────────────────────────── canvas ───────────────────────────────────────────── */

interface FocusGoal {
  target: THREE.Vector3;
  dist: number;
}

export function CloseupCanvas({ model, frame, post, autoRotate, reducedMotion, labels, labelEls, onInteract, onHover, onFail }: CloseupCanvasProps) {
  // click a structure → glide the orbit target to it; click empty space → back to the whole plinth
  const focusRef = useRef<FocusGoal | null>(null);
  const homeRef = useRef(0);
  const focusOn = useCallback((at: [number, number, number] | null) => {
    focusRef.current = at ? { target: new THREE.Vector3(at[0], 0.25, at[2]), dist: homeRef.current * 0.55 } : { target: TARGET.clone(), dist: homeRef.current };
  }, []);
  // R3F force-loses the context when the canvas unmounts: only a loss while we are still open is a failure
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.75]}
      frameloop={autoRotate ? "always" : "demand"}
      gl={{ antialias: !post, alpha: false, stencil: false, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 1.5, far: 420, position: [0, 30, 50] }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={({ gl }) => {
        // clear alpha 0: ContactShadows renders into a target cleared with it (an opaque clear paints a dark square);
        // the canvas itself is opaque (alpha:false) and scene.background covers every pixel anyway
        gl.setClearColor(COLOR.canvas, 0);
        if (!gl.capabilities.isWebGL2) onFail();
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (alive.current) onFail();
        });
      }}
    >
      <Backdrop frame={frame} />
      <Rig frame={frame} homeRef={homeRef} focusRef={focusRef} />
      <FocusGlide focusRef={focusRef} instant={reducedMotion} />
      <Lights />
      <Environment resolution={128} frames={1} environmentIntensity={0.65}>
        <Lightformer form="rect" intensity={2.6} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[16, 16, 1]} />
        <Lightformer form="rect" intensity={1.7} color="#a9c8ff" position={[-14, 3, 3]} rotation-y={Math.PI / 2} scale={[12, 2.2, 1]} />
        <Lightformer form="rect" intensity={1.3} color="#ffe0ba" position={[14, 2.5, -5]} rotation-y={-Math.PI / 2} scale={[10, 1.8, 1]} />
        <Lightformer form="ring" intensity={0.7} position={[0, 5, 14]} scale={7} />
      </Environment>
      <Floor />
      <Plinth model={model} onClick={() => focusOn(null)} />
      <ContactShadows key={model.id} position={[0, Y.shadows, 0]} scale={PLINTH_R * 2} resolution={1024} blur={1.6} far={1.6} opacity={0.8} frames={1} color="#000000" />
      <Structures model={model} onHover={onHover} onPick={focusOn}>
        <Links model={model} boost={post ? 1.7 : 1} />
      </Structures>
      <LabelSync labels={labels} els={labelEls} frame={frame} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.075}
        enablePan={false}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minPolarAngle={0.15 * Math.PI}
        maxPolarAngle={0.42 * Math.PI}
        autoRotate={autoRotate}
        autoRotateSpeed={AUTO_ROTATE_SPEED}
        target={TARGET}
        onStart={onInteract}
      />
      {autoRotate && <AutoRotatePace />}
      {post && <Effects />}
    </Canvas>
  );
}

/** OrbitControls' autoRotateSpeed at 60 fps (≈ one turn every 2.2 min). */
const AUTO_ROTATE_SPEED = 0.45;

/**
 * OrbitControls (three-stdlib) turns a fixed angle per update, i.e. per rendered frame, so a 120 Hz display would spin
 * the diorama twice as fast. Before the controls update (drei runs it at priority -1), scale the speed by this frame's
 * duration so the turn rate is the same at any frame rate (a long stall is capped, never a jump).
 */
function AutoRotatePace() {
  useFrame((state, delta) => {
    const c = state.controls as unknown as OrbitControlsImpl | null;
    if (c) c.autoRotateSpeed = AUTO_ROTATE_SPEED * Math.min(4, Math.max(0, delta * 60));
  }, -2);
  return null;
}

function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.18} intensity={0.55} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}

/* ───────────────────────────────────────── camera + backdrop ───────────────────────────────────────── */

/** Distance at which the plinth (plus the tallest structures) fits the frame hole at the given polar angle. */
function fitDistance(frame: Frame, w: number, h: number, polar: number): number {
  const fw = Math.max(120, w - frame.l - frame.r);
  const fh = Math.max(120, h - frame.t - frame.b);
  const k = h / (2 * Math.tan((FOV * DEG) / 2)); // px per unit at distance 1
  // phone / tall holes: let the plinth run a little past the sides rather than float small in a tall column
  const tall = THREE.MathUtils.clamp((fh / fw - 0.8) / 0.5, 0, 1);
  const spanW = 2 * PLINTH_R * (frame.compact ? 0.8 : THREE.MathUtils.lerp(1.0, 0.88, tall));
  const spanH = (2 * PLINTH_R * Math.cos(polar) + 2.2 * Math.sin(polar)) * 1.08;
  return Math.max((spanW * k) / fw, (spanH * k) / fh);
}

/** Frames the plinth inside the focal hole: off-axis projection (setViewOffset) + fitted orbit distance. */
function Rig({ frame, homeRef, focusRef }: { frame: Frame; homeRef: RefObject<number>; focusRef: RefObject<FocusGoal | null> }) {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const controlsReady = useThree((s) => s.controls !== null);
  const placed = useRef(false);
  const { l, t, r, b, compact } = frame;

  useLayoutEffect(() => {
    const { camera: cam, controls: ctl, invalidate } = get();
    const camera = cam as THREE.PerspectiveCamera;
    const controls = ctl as unknown as OrbitControlsImpl | null;
    const w = width;
    const h = height;
    if (!w || !h) return;
    const fw = Math.max(120, w - l - r);
    const fh = Math.max(120, h - t - b);
    const cx = l + fw / 2;
    const cy = t + fh / 2;
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    camera.updateProjectionMatrix();
    // first view: a tall frame hole (tablet portrait, phone) looks down more steeply so the plinth fills its height
    const tall = THREE.MathUtils.clamp((fh / fw - 0.8) / 0.5, 0, 1);
    const polar0 = compact ? POLAR0_COMPACT : THREE.MathUtils.lerp(POLAR0, 0.2 * Math.PI, tall);
    const dir = placed.current ? camera.position.clone().sub(TARGET).normalize() : new THREE.Vector3().setFromSphericalCoords(1, polar0, AZIMUTH0);
    const polar = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    const d = fitDistance({ l, t, r, b, compact }, w, h, Math.max(polar, 0.15 * Math.PI));
    camera.position.copy(TARGET).addScaledVector(dir, d);
    camera.lookAt(TARGET);
    placed.current = true;
    homeRef.current = d;
    focusRef.current = null;
    if (controls) {
      controls.minDistance = d * 0.42;
      controls.maxDistance = d * 1.3;
      controls.target.copy(TARGET);
      controls.update();
    }
    invalidate();
  }, [get, width, height, l, t, r, b, compact, controlsReady, homeRef, focusRef]);
  return null;
}

/** Eases the orbit target and distance toward a picked structure (or back home); renders only while it moves. */
function FocusGlide({ focusRef, instant }: { focusRef: RefObject<FocusGoal | null>; instant: boolean }) {
  useFrame((state, delta) => {
    const goal = focusRef.current;
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    if (!goal || !controls) return;
    const k = instant ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 5);
    const offset = state.camera.position.clone().sub(controls.target);
    const len = offset.length();
    controls.target.lerp(goal.target, k);
    const next = len + (goal.dist - len) * k;
    state.camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    controls.update();
    if (controls.target.distanceTo(goal.target) < 0.005 && Math.abs(next - goal.dist) < 0.01) focusRef.current = null;
    else state.invalidate();
  });
  return null;
}

/** Opaque radial-gradient backdrop centred on the focal hole (scene.background; no map shows through). */
function Backdrop({ frame }: { frame: Frame }) {
  const get = useThree((s) => s.get);
  const w = useThree((s) => s.size.width) || 1;
  const h = useThree((s) => s.size.height) || 1;
  const cx = Math.round(((frame.l + (w - frame.l - frame.r) / 2) / w) * 50) / 50;
  const cy = Math.round(((frame.t + (h - frame.t - frame.b) / 2) / h) * 50) / 50;
  const aspect = Math.round((w / h) * 10) / 10;
  useEffect(() => {
    const { scene, invalidate } = get();
    const tex = backdropTexture(cx, cy, aspect);
    scene.background = tex ?? new THREE.Color(COLOR.canvas);
    invalidate();
    return () => {
      tex?.dispose();
      scene.background = null;
    };
  }, [get, cx, cy, aspect]);
  return null;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#dfe7f5", "#07090d", 0.6]} />
      <directionalLight position={[8, 13, 7]} intensity={2.1} color="#fff1de" />
      <directionalLight position={[-10, 6, -11]} intensity={1.5} color="#8fb6ff" />
      {/* a soft pool of light on the plinth top: the product-shot key */}
      <spotLight position={[2, 22, 8]} angle={0.4} penumbra={1} intensity={1.5} decay={0} distance={0} color="#dce6f7" />
    </>
  );
}

/* ───────────────────────────────────────────── labels ───────────────────────────────────────────── */

interface Placing {
  s: LabelSpec;
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gap kept between two labels, px. */
const LABEL_GAP = 4;

/**
 * Keeps the DOM labels on their 3D anchors. Every rendered frame (demand mode renders only while something moves) it
 * projects each anchor, then places labels in priority order, trying each label's anchors until one doesn't overlap a
 * label already placed (sticking with last frame's anchor when it still fits, so labels don't flicker while orbiting).
 * A label that fits nowhere is hidden unless it is `always` (then it takes the least-overlapping anchor). Labels stay
 * inside the frame hole; one whose anchor leaves the hole is hidden. Callout placements draw their leader line.
 */
function LabelSync({ labels, els, frame }: { labels: LabelSpec[]; els: Map<string, Element>; frame: Frame }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const latest = useRef(labels);
  const sizes = useRef(new WeakMap<Element, [number, number]>());
  const last = useRef(new Map<string, Anchor>());
  /** Ring labels: the ring angle chosen last frame (kept while it stays clear, so the label does not hop). */
  const lastRing = useRef(new Map<string, number>());
  const get = useThree((s) => s.get);
  useEffect(() => {
    latest.current = labels;
    sizes.current = new WeakMap();
    get().invalidate();
    // re-measure once the DOM (and web fonts) settle
    const ids = [60, 300, 900].map((ms) =>
      window.setTimeout(() => {
        sizes.current = new WeakMap();
        get().invalidate();
      }, ms),
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [labels, get]);

  const bounds = useRef(frame);
  useEffect(() => {
    bounds.current = frame;
    get().invalidate();
  }, [frame, get]);

  useFrame(({ camera, size }) => {
    const f = bounds.current;
    // labels stay inside the frame hole (never under the rail, inspector, demo card or legend), with a little slack
    const minX = Math.max(8, f.l - 16);
    const maxX = size.width - Math.max(8, f.r - 16);
    const minY = f.t - 20;
    const maxY = size.height - f.b + 20;
    const band: Band = { minX, maxX, top: Math.max(8, f.compact ? f.t : f.t - 14) };
    const clampX = (l: number, w: number) => Math.min(Math.max(l, minX), Math.max(minX, maxX - w));
    const clampY = (t: number, h: number) => Math.min(Math.max(t, minY), Math.max(minY, maxY - h));
    const hideLeader = (id: string) => {
      const g = els.get(`leader:${id}`) as SVGGElement | undefined;
      if (g) g.style.visibility = "hidden";
    };

    const items: Placing[] = [];
    for (const s of latest.current) {
      const el = els.get(s.id) as HTMLElement | undefined;
      if (!el) continue;
      v.set(...s.at).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      // behind the camera, or outside the frame hole (zoomed in / under a panel): the label would point at nothing
      // (a ring label picks its own point on the ring, below)
      if (!s.ring && (v.z > 1 || v.z < -1 || x < minX || x > maxX || y < minY || y > maxY)) {
        el.style.visibility = "hidden";
        hideLeader(s.id);
        last.current.delete(s.id);
        continue;
      }
      let wh = s.id === "hover" ? undefined : sizes.current.get(el);
      if (!wh || !wh[0]) {
        wh = [el.offsetWidth, el.offsetHeight];
        sizes.current.set(el, wh);
      }
      items.push({ s, el, x, y, w: wh[0], h: wh[1] });
    }
    const pa = items.find((i) => i.s.side === "a");
    const pb = items.find((i) => i.s.side === "b");
    const aLeft = pa && pb ? pa.x < pb.x : true;
    const resolve = (an: AnchorSpec, side: LabelSpec["side"]): Anchor => {
      const leftSide = side === "a" ? aLeft : !aLeft;
      if (an === "outward") return leftSide ? "above-left" : "above-right";
      if (an === "callout") return side === "site" ? "callout-top" : leftSide ? "callout-left" : "callout-right";
      return an;
    };

    items.sort((p, q) => q.s.priority - p.s.priority);
    const placed: [number, number, number, number][] = [];
    const overlap = (l: number, t: number, w: number, h: number) => {
      let area = 0;
      for (const [L, T, W, H] of placed) {
        const ox = Math.min(l + w + LABEL_GAP, L + W) - Math.max(l, L - LABEL_GAP);
        const oy = Math.min(t + h + LABEL_GAP, T + H) - Math.max(t, T - LABEL_GAP);
        if (ox > 0 && oy > 0) area += ox * oy;
      }
      return area;
    };
    const toScreen = (x: number, y: number, z: number): [number, number, boolean] => {
      v.set(x, y, z).project(camera);
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, v.z > -1 && v.z < 1];
    };
    for (const it of items) {
      if (it.s.ring) {
        const box = placeOnRing(it, it.s.ring, toScreen, placed, overlap, lastRing.current, { minX, maxX, minY: f.t + 4, maxY: size.height - f.b - 4 });
        if (!box) {
          it.el.style.visibility = "hidden";
          continue;
        }
        placed.push([box[0], box[1], it.w, it.h]);
        it.el.style.transform = `translate3d(${box[0].toFixed(1)}px, ${box[1].toFixed(1)}px, 0)`;
        it.el.style.visibility = "visible";
        continue;
      }
      const options = [it.s.anchor, ...(it.s.alts ?? [])].map((an) => resolve(an, it.s.side));
      const prev = last.current.get(it.s.id);
      const tries = [...new Set<Anchor>([...(prev && options.includes(prev) ? [prev] : []), ...options])];
      let pick: Anchor | null = null;
      let box: [number, number] = [0, 0];
      let best: { an: Anchor; box: [number, number]; cost: number } | null = null;
      for (const an of tries) {
        const [bl, bt] = anchorBox(an, it.x, it.y, it.w, it.h, band);
        const b: [number, number] = [clampX(bl, it.w), clampY(bt, it.h)];
        // a callout must sit above its anchor, or the leader would run up through the card
        if (an.startsWith("callout") && it.y < b[1] + it.h + 16) continue;
        const cost = overlap(b[0], b[1], it.w, it.h);
        if (cost === 0) {
          pick = an;
          box = b;
          break;
        }
        if (!best || cost < best.cost) best = { an, box: b, cost };
      }
      if (!pick && it.s.always && best) {
        pick = best.an;
        box = best.box;
      }
      if (!pick) {
        it.el.style.visibility = "hidden";
        hideLeader(it.s.id);
        last.current.delete(it.s.id);
        continue;
      }
      last.current.set(it.s.id, pick);
      placed.push([box[0], box[1], it.w, it.h]);
      it.el.style.transform = `translate3d(${box[0].toFixed(1)}px, ${box[1].toFixed(1)}px, 0)`;
      it.el.style.visibility = "visible";

      const g = els.get(`leader:${it.s.id}`) as SVGGElement | undefined;
      if (g) {
        if (pick.startsWith("callout")) {
          const ax = Math.min(Math.max(it.x, box[0] + 14), box[0] + it.w - 14);
          const ay = box[1] + it.h;
          const line = g.firstElementChild as SVGLineElement | null;
          const dot = g.lastElementChild as SVGCircleElement | null;
          line?.setAttribute("x1", ax.toFixed(1));
          line?.setAttribute("y1", ay.toFixed(1));
          line?.setAttribute("x2", it.x.toFixed(1));
          line?.setAttribute("y2", it.y.toFixed(1));
          dot?.setAttribute("cx", ax.toFixed(1));
          dot?.setAttribute("cy", ay.toFixed(1));
          g.style.visibility = "visible";
        } else g.style.visibility = "hidden";
      }
    }
  });
  return null;
}

/** Ring-label candidates: every 10° around the ring, nearest the preferred angle first. */
const RING_STEPS = Array.from({ length: 36 }, (_, i) => (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * ((10 * Math.PI) / 180)));

/**
 * Puts a ring label just outside its ring: for each candidate point on the ring (on the plinth, in the frame), the box
 * sits past the ring's on-screen outward normal, so it never lies on the stroke. It must also clear the rest of the
 * ring, every obstacle (structures, pins, towers, beacon) and every label placed before it. The last frame's point is
 * kept while it stays clear. Returns the box's top-left, or null (hidden) when no point is clear.
 */
function placeOnRing(
  it: Placing,
  ring: NonNullable<LabelSpec["ring"]>,
  toScreen: (x: number, y: number, z: number) => [number, number, boolean],
  placed: [number, number, number, number][],
  overlap: (l: number, t: number, w: number, h: number) => number,
  lastRing: Map<string, number>,
  view: { minX: number; maxX: number; minY: number; maxY: number },
): [number, number] | null {
  const { center: c, r, y } = ring;
  const at = (a: number) => toScreen(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
  const onPlinth = (a: number) => Math.hypot(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) <= PLINTH_R - 0.1;
  const [cx, cy] = toScreen(c.x, y, c.z);
  // the ring itself (only where it is drawn: on the plinth) and the obstacles, as small screen boxes
  const stroke: [number, number][] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    if (!onPlinth(a)) continue;
    const [sx, sy, ok] = at(a);
    if (ok) stroke.push([sx, sy]);
  }
  const things = ring.avoid.map(([x, yy, z]) => toScreen(x, yy, z)).filter(([, , ok]) => ok);
  const clear = (l: number, t: number) => {
    if (l < view.minX || t < view.minY || l + it.w > view.maxX || t + it.h > view.maxY) return false;
    if (overlap(l, t, it.w, it.h) > 0) return false;
    for (const [sx, sy] of stroke) if (sx > l - 3 && sx < l + it.w + 3 && sy > t - 3 && sy < t + it.h + 3) return false;
    // a structure stands up from its point: keep ~22px either side and ~30px above it clear
    for (const [sx, sy] of things) if (sx > l - 22 && sx < l + it.w + 22 && sy > t - 8 && sy < t + it.h + 30) return false;
    return true;
  };
  const boxAt = (a: number): [number, number] | null => {
    if (!onPlinth(a)) return null;
    const [qx, qy, ok] = at(a);
    if (!ok) return null;
    const [ax, ay] = at(a - 0.02);
    const [bx, by] = at(a + 0.02);
    let [nx, ny] = [by - ay, -(bx - ax)];
    const len = Math.hypot(nx, ny) || 1;
    [nx, ny] = [nx / len, ny / len];
    if (nx * (qx - cx) + ny * (qy - cy) < 0) [nx, ny] = [-nx, -ny];
    const reach = 8 + (it.w / 2) * Math.abs(nx) + (it.h / 2) * Math.abs(ny);
    return [qx + nx * reach - it.w / 2, qy + ny * reach - it.h / 2];
  };
  const prev = lastRing.get(it.s.id);
  const tries = prev != null ? [prev, ...RING_STEPS.map((d) => ring.prefer + d)] : RING_STEPS.map((d) => ring.prefer + d);
  for (const a of tries) {
    const b = boxAt(a);
    if (b && clear(b[0], b[1])) {
      lastRing.set(it.s.id, a);
      return b;
    }
  }
  lastRing.delete(it.s.id);
  return null;
}

/* ───────────────────────────────────────────── plinth ───────────────────────────────────────────── */

const PLINTH_H = 0.7;

function Floor() {
  const tex = useMemo(() => floorTexture(1 / 3.2), []);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!tex) return null;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -PLINTH_H - 0.1, 0]} renderOrder={-2}>
      <planeGeometry args={[PLINTH_R * 6.4, PLINTH_R * 6.4]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Plinth({ model, onClick }: { model: CloseupModel; onClick: () => void }) {
  const get = useThree((s) => s.get);
  const grid = useMemo(() => gridSegments(PLINTH_R - 0.04, model.gridMiles * model.unitsPerMile, Y.grid), [model.gridMiles, model.unitsPerMile]);
  const rings = useMemo(() => [0.25, 0.5, 0.75].map((k) => circlePoints(0, 0, PLINTH_R * k, Y.grid, 160)), []);
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: "#0b111b", metalness: 0.7, roughness: 0.3, envMapIntensity: 1.2 }), // side
      new THREE.MeshStandardMaterial({ color: "#0f1724", metalness: 0.22, roughness: 0.6, envMapIntensity: 0.55 }), // satin top
      new THREE.MeshStandardMaterial({ color: "#05080e", roughness: 1 }), // bottom
    ],
    [],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  return (
    <group>
      <mesh
        position={[0, -PLINTH_H / 2, 0]}
        material={materials}
        onClick={(e) => {
          // empty plinth: back to the whole view (not at the end of an orbit drag)
          if (e.delta > 4) return;
          onClick();
          get().invalidate();
        }}
      >
        <cylinderGeometry args={[PLINTH_R, PLINTH_R * 0.985, PLINTH_H, 192, 1]} />
      </mesh>
      {/* the crisp top edge that catches the key light */}
      <mesh rotation-x={Math.PI / 2} position={[0, -0.004, 0]}>
        <torusGeometry args={[PLINTH_R, 0.02, 8, 320]} />
        <meshStandardMaterial color="#c9d2df" metalness={0.9} roughness={0.22} emissive="#c9d2df" emissiveIntensity={0.14} />
      </mesh>
      <lineSegments renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[grid, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.04} depthWrite={false} />
      </lineSegments>
      {rings.map((pts, i) => (
        <Line key={i} points={pts} color="#ffffff" lineWidth={1} transparent opacity={0.055} depthWrite={false} renderOrder={1} />
      ))}
    </group>
  );
}

/* ─────────────────────────────────────────── structures ─────────────────────────────────────────── */

interface HoverData {
  text: string;
  sub?: string;
  y: number;
  mats: THREE.MeshStandardMaterial[];
}

interface Built {
  root: THREE.Group;
  wires: { key: string; pts: [number, number, number][]; color: string; width: number; opacity: number }[];
}

function buildLayer(model: CloseupModel, bag: Bag): Built {
  const root = new THREE.Group();
  const wires: Built["wires"] = [];
  for (const p of [model.a, model.b]) {
    const color = utilColor(p);
    const mul = p.heightMul ?? 1;
    for (const pl of p.places) {
      if (pl.hidden) continue;
      if (pl.treatment === "structure") {
        const pylon = p.heightMul == null;
        const g = pylon ? buildMarkerPylon() : buildSubstation({ width: 60, depth: 40 });
        bag.adopt(g); // the builder's own materials/geometries (materials are swapped for tinted clones below)
        const mats = tint(g, pl.shared ? COLOR.neutral : color, bag, { mix: pl.shared ? 0 : 0.72, emissive: pl.shared ? 0.08 : 0.25 });
        g.scale.set(STRUCT_SCALE, STRUCT_SCALE * (pylon ? 1.4 : mul * 1.25), STRUCT_SCALE);
        g.position.set(pl.pos.x, 0, pl.pos.z);
        g.rotation.y = (hash01(pl.id) - 0.5) * 0.8;
        g.updateMatrixWorld(true);
        const top = new THREE.Box3().setFromObject(g).max.y;
        const kind = pylon ? "structure (voltage not published)" : "substation";
        g.userData.hover = {
          text: `Symbolic ${kind} · ${pl.label}`,
          sub: `${PRECISION_TEXT[pl.precision]}${pl.shared ? " · shared by both projects" : ""}`,
          y: top,
          mats,
        } satisfies HoverData;
        root.add(g);
      } else if (pl.treatment === "marker") {
        const mat = bag.add(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
        const ring = new THREE.Mesh(bag.add(new THREE.RingGeometry(0.08, 0.115, 40)), mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pl.pos.x, Y.marker, pl.pos.z);
        ring.renderOrder = 2;
        ring.userData.hover = {
          text: `${pl.role === "context" ? "Context point" : "Mapped point"} · ${pl.label}`,
          sub: `${PRECISION_TEXT[pl.precision]} · no structure drawn`,
          y: 0.05,
          mats: [],
        } satisfies HoverData;
        root.add(ring);
      } else {
        const fill = bag.add(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.085, depthWrite: false, toneMapped: false }));
        const disc = new THREE.Mesh(bag.add(new THREE.CircleGeometry(pl.radius, 96)), fill);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(pl.pos.x, Y.disc, pl.pos.z);
        const mi = pl.radius / model.unitsPerMile;
        disc.userData.hover = {
          text: `Approximate location · ${pl.label}`,
          sub: `${PRECISION_TEXT[pl.precision]} · within ≈${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`,
          y: 0.02,
          mats: [],
        } satisfies HoverData;
        const edgeGeo = bag.add(new THREE.BufferGeometry().setFromPoints(circlePoints(0, 0, pl.radius, 0, 128).map(([x, y, z]) => new THREE.Vector3(x, y, z))));
        const edge = new THREE.Line(edgeGeo, bag.add(new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.55, dashSize: 0.14, gapSize: 0.1, depthWrite: false, toneMapped: false })));
        edge.computeLineDistances();
        edge.position.set(pl.pos.x, Y.discEdge, pl.pos.z);
        edge.renderOrder = 1;
        root.add(disc, edge);
      }
    }
    if (p.route?.precision === "official-gis") {
      const len = polyLength(p.route.pts);
      const count = THREE.MathUtils.clamp(Math.round(len / TOWER_SPACING) + 1, 5, 18);
      const template = buildLatticeTower({ height: TOWER_H, armSpan: TOWER_SPAN });
      bag.adopt(template);
      const mats = tint(template, color, bag, { mix: 0.62, emissive: 0.25 });
      const s = TOWER_SCALE * mul;
      template.scale.setScalar(s);
      const hover: HoverData = { text: `Symbolic line · ${p.title}`, sub: "towers along the official GIS route · spacing symbolic", y: towerTotalHeight(TOWER_H) * s, mats };
      const strands: THREE.Vector3[][] = [[], [], [], [], [], []];
      const earth: THREE.Vector3[][] = [[], []];
      for (const { p: q, t } of alongPolyline(p.route.pts, count)) {
        const tw = template.clone();
        tw.position.set(q.x, 0, q.z);
        tw.rotation.y = Math.atan2(t.x, t.z);
        tw.userData.hover = hover;
        root.add(tw);
        // local +x (the arms) after the yaw: (t.z, 0, -t.x)
        const ax = t.z;
        const az = -t.x;
        TOWER_WIRES.conductors.forEach(({ y, reach: r }, li) => {
          const reach = r * s;
          strands[li * 2].push(new THREE.Vector3(q.x + ax * reach, y * s, q.z + az * reach));
          strands[li * 2 + 1].push(new THREE.Vector3(q.x - ax * reach, y * s, q.z - az * reach));
        });
        const ey = TOWER_WIRES.earth.y * s;
        const er = TOWER_WIRES.earth.reach * s;
        earth[0].push(new THREE.Vector3(q.x + ax * er, ey, q.z + az * er));
        earth[1].push(new THREE.Vector3(q.x - ax * er, ey, q.z - az * er));
      }
      strands.forEach((st, i) => wires.push({ key: `${p.side}-c${i}`, pts: catenary(st, 8, 0.07), color, width: 1, opacity: 0.8 }));
      earth.forEach((st, i) => wires.push({ key: `${p.side}-e${i}`, pts: catenary(st, 8, 0.05), color: COLOR.neutral, width: 0.7, opacity: 0.35 }));
    }
  }
  return { root, wires };
}

function hoverTarget(o: THREE.Object3D | null): THREE.Object3D | null {
  for (let n = o; n; n = n.parent) if (n.userData?.hover) return n;
  return null;
}

function Structures({
  model,
  onHover,
  onPick,
  children,
}: {
  model: CloseupModel;
  onHover: (h: HoverInfo | null) => void;
  onPick: (at: [number, number, number] | null) => void;
  /** More hoverable scene parts (links, beacon) that share the hover/click handling. */
  children?: ReactNode;
}) {
  const get = useThree((s) => s.get);
  const built = useMemo(() => {
    const bag = new Bag();
    return { ...buildLayer(model, bag), bag };
  }, [model]);
  useEffect(() => () => built.bag.dispose(), [built]);
  const lit = useRef<HoverData | null>(null);

  const light = useCallback(
    (h: HoverData | null) => {
      if (lit.current === h) return;
      lit.current?.mats.forEach((m) => (m.emissiveIntensity = (m.userData.baseEmissive as number | undefined) ?? m.emissiveIntensity));
      h?.mats.forEach((m) => {
        m.userData.baseEmissive ??= m.emissiveIntensity;
        m.emissiveIntensity = 0.6;
      });
      lit.current = h;
      get().invalidate();
    },
    [get],
  );

  /** The nearest intersection that explains itself (a ground rule line in front of a yard shouldn't hide the yard). */
  const pickHit = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    for (const hit of e.intersections) {
      const target = hoverTarget(hit.object);
      if (target) return { target, h: target.userData.hover as HoverData, point: hit.point };
    }
    return null;
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const hit = pickHit(e);
    light(hit?.h ?? null);
    if (!hit) return onHover(null);
    const { target, h, point } = hit;
    const wp = new THREE.Vector3();
    target.getWorldPosition(wp);
    onHover({ text: h.text, sub: h.sub, pos: h.mats.length || h.y > 0.5 ? [wp.x, h.y + 0.08, wp.z] : [point.x, point.y + 0.05, point.z] });
  };
  const out = () => {
    light(null);
    onHover(null);
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return; // the end of an orbit drag, not a click
    const hit = pickHit(e);
    if (!hit) {
      onPick(null);
      get().invalidate();
      return;
    }
    const wp = new THREE.Vector3();
    hit.target.getWorldPosition(wp);
    // flat things (discs, markers, lines) focus where they were clicked; structures and pins on their base
    const flat = !hit.h.mats.length && hit.h.y < 0.5;
    onPick(flat ? [hit.point.x, 0, hit.point.z] : [wp.x, 0, wp.z]);
    get().invalidate();
  };
  // a click anywhere else (plinth, backdrop): back to the whole plinth
  const missed = () => {
    out();
    onPick(null);
    get().invalidate();
  };

  return (
    <>
      <group onPointerMove={move} onPointerOut={out} onClick={click} onPointerMissed={missed}>
        <primitive object={built.root} />
        {[model.a, model.b].map((p) => p.center && <CenterPin key={p.side} p={p} />)}
        {[model.a, model.b].map((p) => (
          <Routes key={p.side} p={p} />
        ))}
        {children}
      </group>
      {built.wires.map((w) => (
        <Line key={w.key} points={w.pts} color={w.color} lineWidth={w.width} transparent opacity={w.opacity} toneMapped={false} />
      ))}
    </>
  );
}

/** Ground lines: the official route under its towers (solid), a digitized route (dashed), or the unpublished chord. */
function Routes({ p }: { p: CuProject }) {
  const color = utilColor(p);
  if (p.route) {
    const pts = p.route.pts.map((v) => [v.x, Y.route, v.z] as [number, number, number]);
    return p.route.precision === "official-gis" ? (
      <Line
        points={pts}
        color={color}
        lineWidth={1.4}
        transparent
        opacity={0.45}
        depthWrite={false}
        renderOrder={2}
        userData={{ hover: { text: `Official GIS route · ${p.title}`, sub: "the route is published; towers and spacing are symbolic", y: 0, mats: [] } satisfies HoverData }}
      />
    ) : (
      <Line
        points={pts}
        color={color}
        lineWidth={1.5}
        dashed
        dashSize={0.16}
        gapSize={0.1}
        transparent
        opacity={0.8}
        depthWrite={false}
        renderOrder={2}
        userData={{ hover: { text: `Digitized route · ${p.title}`, sub: "schematic, traced from an official map · not survey accurate", y: 0, mats: [] } satisfies HoverData }}
      />
    );
  }
  if (p.chord) {
    const [a, b] = p.chord;
    return (
      <Line
        points={[
          [a.x, Y.route, a.z],
          [b.x, Y.route, b.z],
        ]}
        color={color}
        lineWidth={1.5}
        dashed
        dashSize={0.14}
        gapSize={0.12}
        transparent
        opacity={0.75}
        depthWrite={false}
        renderOrder={2}
        userData={{ hover: { text: "Route not published · drawn terminal to terminal", sub: `${p.title} · not the line's real path`, y: 0, mats: [] } satisfies HoverData }}
      />
    );
  }
  return null;
}

function CenterPin({ p }: { p: CuProject }) {
  const color = utilColor(p);
  if (!p.center) return null;
  return (
    <group position={[p.center.x, 0, p.center.z]} userData={{ hover: { text: `Project center · ${p.title}`, sub: p.centerNote, y: PIN_H, mats: [] } satisfies HoverData }}>
      <mesh position={[0, PIN_H / 2, 0]}>
        <cylinderGeometry args={[0.014, 0.014, PIN_H, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
      </mesh>
      <mesh position={[0, PIN_H, 0]}>
        <sphereGeometry args={[0.06, 24, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, Y.marker, 0]} renderOrder={3}>
        <ringGeometry args={[0.07, 0.1, 40]} />
        <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, Y.marker, 0]} renderOrder={3}>
        <circleGeometry args={[0.032, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────────── link, rule, beacon ─────────────────────────────────────── */

function Links({ model, boost }: { model: CloseupModel; boost: number }) {
  const { a, b, site } = model;
  const color = useMemo(() => new THREE.Color(COLOR.overlap).multiplyScalar(boost), [boost]);
  const opacity = model.possible ? 0.5 : 1;
  const beam = useMemo(() => beamTexture(), []);
  useEffect(() => () => beam?.dispose(), [beam]);

  // ground ruler with tick marks between the two centers (only when the rule applies center to center)
  const ruler = useMemo(() => {
    if (!model.rulerText || !a.center || !b.center) return null;
    const dx = b.center.x - a.center.x;
    const dz = b.center.z - a.center.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const ticks: [number, number, number][] = [];
    const step = model.tickMiles * model.unitsPerMile;
    for (let i = 0; i * step <= len + 1e-6; i++) {
      const s = i * step;
      const half = i % 5 === 0 ? 0.14 : 0.08;
      const x = a.center.x + ux * s;
      const z = a.center.z + uz * s;
      ticks.push([x - uz * half, Y.ruler, z + ux * half], [x + uz * half, Y.ruler, z - ux * half]);
    }
    return {
      line: [
        [a.center.x, Y.ruler, a.center.z],
        [b.center.x, Y.ruler, b.center.z],
      ] as [number, number, number][],
      ticks,
    };
  }, [model.rulerText, model.tickMiles, model.unitsPerMile, a.center, b.center]);

  const arcs = useMemo(() => {
    const out: [number, number, number][][] = [];
    if (site) {
      // a center that IS the shared site (a one-terminal project) needs no arc to itself
      for (const p of [a, b]) if (p.center && Math.hypot(p.center.x - site.pos.x, p.center.z - site.pos.z) > 0.08) out.push(arcPoints(p.center, site.pos, arcHeight(p.center, site.pos, 0.24)));
    } else if (a.center && b.center) out.push(arcPoints(a.center, b.center, arcHeight(a.center, b.center)));
    return out;
  }, [a, b, site]);

  return (
    <>
      {arcs.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color={color}
          lineWidth={2.6}
          transparent={opacity < 1}
          opacity={opacity}
          toneMapped={false}
          userData={{
            hover: site
              ? { text: `Link to the shared site · ${site.label}`, sub: "center to facility · not a route", y: 0, mats: [] }
              : { text: "Center to center · not a route", sub: model.rulerText ?? undefined, y: 0, mats: [] },
          }}
        />
      ))}
      {ruler && (
        <>
          <Line points={ruler.line} color={COLOR.overlap} lineWidth={1.2} transparent opacity={0.55} depthWrite={false} renderOrder={3} />
          <Line points={ruler.ticks} segments color={COLOR.overlap} lineWidth={1.2} transparent opacity={0.6} depthWrite={false} renderOrder={3} />
        </>
      )}
      {model.ring?.arcs.map((arc, i) => (
        <Line key={`ring-${i}`} points={arc.pts.map((v) => [v.x, Y.ring, v.z] as [number, number, number])} color={COLOR.overlap} lineWidth={1.3} transparent opacity={0.42} depthWrite={false} renderOrder={3} />
      ))}
      {site && (
        <group position={[site.pos.x, 0, site.pos.z]} userData={{ hover: { text: `Shared site · ${site.label}`, sub: site.basis, y: BEACON_H, mats: [] } satisfies HoverData }}>
          {beam && (
            <mesh position={[0, BEACON_H / 2, 0]}>
              <cylinderGeometry args={[0.075, 0.075, BEACON_H, 24, 1, true]} />
              <meshBasicMaterial map={beam} color={COLOR.overlap} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          )}
          <mesh position={[0, BEACON_H, 0]}>
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshStandardMaterial color={COLOR.overlap} emissive={COLOR.overlap} emissiveIntensity={3} toneMapped={false} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, Y.beacon, 0]} renderOrder={4}>
            <ringGeometry args={[0.24, 0.28, 56]} />
            <meshBasicMaterial color={COLOR.overlap} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, Y.beacon, 0]} renderOrder={4}>
            <ringGeometry args={[0.46, 0.475, 72]} />
            <meshBasicMaterial color={COLOR.overlap} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      )}
    </>
  );
}
