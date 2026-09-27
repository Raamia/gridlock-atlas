import * as THREE from "three";
import type { V2 } from "./model";

/*
 * three.js helpers for the close-up: tinted clones of the shared procedural structures, a disposal bag, the backdrop and
 * floor textures, and catenary wires. Colours here are 3D materials (SPEC §11 allows hex for them); they mirror the
 * tokens in app/globals.css (--util-a #49a8ff, --util-b #ff5263, --overlap #d4b875, --canvas #1f252d).
 */

export const COLOR = {
  a: "#49a8ff",
  b: "#ff5263",
  overlap: "#d4b875",
  neutral: "#c7cccf",
  canvas: "#1f252d",
} as const;

/** Everything a scene build allocates, disposed together when the close-up closes or the pair changes. */
export class Bag {
  private items = new Set<{ dispose: () => void }>();
  add<T extends { dispose: () => void }>(x: T): T {
    this.items.add(x);
    return x;
  }
  /** Adopt every geometry and material under an object. */
  adopt(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) this.add(mesh.geometry);
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => this.add(x));
      else if (mat) this.add(mat);
    });
  }
  dispose(): void {
    for (const x of this.items) x.dispose();
    this.items.clear();
  }
}

export interface TintOptions {
  /** 0 = the model's own light grey, 1 = pure utility colour (the steel "structure" part). */
  mix?: number;
  /** Emissive intensity of the steel (≤ .35 per the glow budget; hover raises it briefly). */
  emissive?: number;
}

/**
 * Re-material a structure for one owner. lib/models/structures.ts tags each mesh `userData.part`: the steel
 * "structure" part is tinted toward the utility colour (with a faint emissive of the same hue); "accent" (insulators,
 * tanks, footings) keeps its satin grey with a hint of the hue; "ground" (gravel pad, firewall) stays muted. Each
 * distinct source material is cloned once. Returns the steel materials so hover can raise their emissive.
 */
export function tint(obj: THREE.Object3D, color: string, bag: Bag, o: TintOptions = {}): THREE.MeshStandardMaterial[] {
  const mix = o.mix ?? 0.5;
  const target = new THREE.Color(color);
  const cache = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const steel: THREE.MeshStandardMaterial[] = [];
  const convert = (src: THREE.Material, part: string): THREE.MeshStandardMaterial => {
    let out = cache.get(src);
    if (out) return out;
    const base = src as THREE.MeshStandardMaterial;
    const c = base.color ? base.color.clone() : new THREE.Color(COLOR.neutral);
    if (part === "structure") {
      out = new THREE.MeshStandardMaterial({
        color: c.lerp(target, mix),
        roughness: 0.44,
        metalness: 0.3,
        emissive: target.clone(),
        emissiveIntensity: o.emissive ?? 0.12,
        envMapIntensity: 0.9,
        flatShading: base.flatShading,
      });
      steel.push(out);
    } else if (part === "accent") {
      out = new THREE.MeshStandardMaterial({ color: c.lerp(target, mix * 0.16), roughness: 0.44, metalness: 0.18, envMapIntensity: 0.75, flatShading: base.flatShading });
    } else {
      out = new THREE.MeshStandardMaterial({ color: c.multiplyScalar(0.46), roughness: 0.95, metalness: 0, envMapIntensity: 0.3, flatShading: base.flatShading });
    }
    cache.set(src, bag.add(out));
    return out;
  };
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const part = (mesh.userData?.part as string | undefined) ?? "structure";
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => convert(m, part)) : convert(mesh.material, part);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  return steel;
}

/** Stable pseudo-random in [0, 1) from a string (for small, deterministic yaw variation). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * One conductor strung across tower attachment points, sagging as a catenary (parabola approximation) between them.
 * Returns a flat [x,y,z,…] point list for drei <Line>.
 */
export function catenary(attach: THREE.Vector3[], samples = 10, sagRatio = 0.09): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < attach.length - 1; i++) {
    const p0 = attach[i];
    const p1 = attach[i + 1];
    const span = p0.distanceTo(p1);
    const sag = Math.min(span * sagRatio, p0.y * 0.35);
    for (let k = i === 0 ? 0 : 1; k <= samples; k++) {
      const t = k / samples;
      out.push([p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t - sag * 4 * t * (1 - t), p0.z + (p1.z - p0.z) * t]);
    }
  }
  return out;
}

/** Raised arc between two ground points (sine profile, like the map's line-z-offset arcs). */
export function arcPoints(a: V2, b: V2, height: number, n = 64, y0 = 0.01): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a.x + (b.x - a.x) * t, y0 + height * Math.sin(Math.PI * t), a.z + (b.z - a.z) * t]);
  }
  return out;
}

function noiseDither(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 3) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * The opaque backdrop (SPEC §7: no map showing through): a radial gradient centred on the focal hole, dithered so the
 * charcoal ramp never bands. Used as scene.background (drawn full-viewport, independent of the camera's view offset).
 */
export function backdropTexture(cx: number, cy: number, aspect: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const h = 360;
  const w = Math.max(360, Math.round(h * aspect));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = COLOR.canvas;
  ctx.fillRect(0, 0, w, h);
  const r = Math.hypot(w, h) * 0.62;
  const g = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, r);
  g.addColorStop(0, "#3b454f");
  g.addColorStop(0.32, "#303741");
  g.addColorStop(0.7, "#252c35");
  g.addColorStop(1, COLOR.canvas);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  noiseDither(ctx, w, h, 2.5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The floor under the plinth: a soft occlusion ring right under the plinth edge, then a faint cool pool of light
 * that fades into the backdrop. `edge` = plinth radius / floor radius.
 */
export function floorTexture(edge: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const s = 512;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.72)");
  g.addColorStop(Math.max(0, edge - 0.02), "rgba(0,0,0,0.58)");
  g.addColorStop(Math.min(1, edge + 0.06), "rgba(118,171,174,0.16)");
  g.addColorStop(Math.min(1, edge + 0.3), "rgba(49,54,63,0.08)");
  g.addColorStop(1, "rgba(31,37,45,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A vertical alpha ramp for the shared-site beacon's light column (opaque at the base, gone at the top). */
export function beamTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.55, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Straight segments of a regular grid (spacing `step`) clipped to a circle of radius `r`, as a flat position array. */
export function gridSegments(r: number, step: number, y: number): Float32Array {
  const out: number[] = [];
  const n = Math.floor(r / step);
  for (let i = -n; i <= n; i++) {
    const c = i * step;
    const half = Math.sqrt(Math.max(0, r * r - c * c));
    if (half <= 0) continue;
    out.push(c, y, -half, c, y, half);
    out.push(-half, y, c, half, y, c);
  }
  return new Float32Array(out);
}

/** Circle as a closed point list (for drei <Line>). */
export function circlePoints(cx: number, cz: number, r: number, y: number, n = 128): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(t) * r, y, cz + Math.sin(t) * r]);
  }
  return out;
}
