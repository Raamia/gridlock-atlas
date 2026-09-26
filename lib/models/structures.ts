import * as THREE from "three";

/**
 * Procedural low-poly structure models (SPEC §6.2), shared by the 3D map scene (exported to public/models/*.glb by
 * scripts/build-models.ts) and the 3D pair close-up (imported live).
 *
 * Units and frame: metres, Y-up, origin at the base centre (the model stands on y = 0, centred on x = z = 0).
 * Every model is at most three meshes, one per material part:
 *   - "structure": steel, MeshStandardMaterial #d9dde3, roughness 0.6 (the part a renderer tints per utility)
 *   - "accent":    insulators, transformer tanks, footings (a darker satin grey that keeps the silhouette legible)
 *   - "ground":    substation gravel pad / firewall (darkest, matte)
 * Geometry is flat-shaded (per-face normals), indexed, with no UVs and no textures.
 *
 * These are symbolic structures, not survey geometry: the map and the close-up say so.
 */

export interface LatticeTowerOptions {
  /** Height to the top cross-arm, metres (default 40). The earth-wire peak rises ~13% above it. */
  height?: number;
  /** Tip-to-tip span of the widest (middle) cross-arm, metres (default 14). */
  armSpan?: number;
  /** "high" (default): full lattice, arm lacing and disc insulators. "low": legs, panel bracing and arms only. */
  detail?: "high" | "low";
}

export interface SubstationOptions {
  /** Yard footprint along x, metres (default 60). */
  width?: number;
  /** Yard footprint along z, metres (default 40). */
  depth?: number;
  /** Gravel pad under the yard (default true; the map variant drops it so the yard reads as equipment, not a slab). */
  pad?: boolean;
}

/** Base colour of every structure's "structure" part (tinted per utility at render time). */
export const STRUCTURE_COLOR = "#d9dde3";
const ACCENT_COLOR = "#a3abb7";
const GROUND_COLOR = "#4a515c";

/** Heights in metres of the three conductor attachment points (bottom of each insulator string), low → high. */
export function towerConductorHeights(height = 40): [number, number, number] {
  const ins = insulatorLength(height);
  return [height * ARM_LEVELS[0] - ins, height * ARM_LEVELS[1] - ins, height * ARM_LEVELS[2] - ins];
}

/** Total model height of a lattice tower of the given `height` option (top of the earth-wire peak). */
export function towerTotalHeight(height = 40): number {
  return height * PEAK;
}

/**
 * Scale factors baked into the map GLBs by scripts/build-models.ts ([x, y-up, z]). lib/map3d.ts drives every structure
 * with one zoom curve (mapbox-gl 3.31 cannot vary it per feature), so relative sizes live in the files:
 * substation ×1.9 taller (and no gravel pad), pylon ×1.7, tower ×0.6 (towers repeat every few hundred metres).
 */
export const MAP_BAKE = {
  substation: [1, 1.9, 1],
  pylon: [1.7, 1.7, 1.7],
  tower: [0.6, 0.6, 0.6],
} as const satisfies Record<string, readonly [number, number, number]>;

/** Native heights (metres) of the fixed-size models. */
export const MODEL_HEIGHTS = { spire: 40, pylon: 20, substation: 16.2, tower: 40 * 1.13 } as const;

// ---------------------------------------------------------------------------------------------------------------
// geometry kit

type V3 = [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const l = length(a);
  return l < 1e-12 ? [0, 0, 0] : mul(a, 1 / l);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Accumulates flat-shaded convex polygons into one indexed BufferGeometry (one per material part). */
class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /**
   * Adds a planar convex polygon. `inside` is any point behind the face: the winding is flipped when needed so the
   * face normal points away from it (so back-face culling and lighting are always right).
   */
  poly(pts: V3[], inside: V3): void {
    if (pts.length < 3) return;
    // Newell's normal (robust for slightly non-planar quads)
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1, z1] = pts[i];
      const [x2, y2, z2] = pts[(i + 1) % pts.length];
      nx += (y1 - y2) * (z1 + z2);
      ny += (z1 - z2) * (x1 + x2);
      nz += (x1 - x2) * (y1 + y2);
      cx += x1;
      cy += y1;
      cz += z1;
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return;
    nx /= l;
    ny /= l;
    nz /= l;
    cx /= pts.length;
    cy /= pts.length;
    cz /= pts.length;
    let ordered = pts;
    if ((cx - inside[0]) * nx + (cy - inside[1]) * ny + (cz - inside[2]) * nz < 0) {
      ordered = [...pts].reverse();
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const o = this.vertexCount;
    for (const p of ordered) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
    }
    for (let i = 1; i < ordered.length - 1; i++) this.idx.push(o, o + i, o + i + 1);
  }

  /**
   * An n-sided prism / frustum / cone along the segment a → b with end radii r0, r1 (r1 = 0 → apex).
   * `phase` rotates the cross-section; caps close the ends.
   */
  prism(a: V3, b: V3, r0: number, r1: number, n: number, caps: { start?: boolean; end?: boolean } = {}, phase = 0): void {
    const axis = sub(b, a);
    const L = length(axis);
    if (L < 1e-9) return;
    const u = mul(axis, 1 / L);
    const ref: V3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = unit(cross(u, ref));
    const s2 = unit(cross(u, s1));
    const ring = (c: V3, r: number): V3[] =>
      Array.from({ length: n }, (_, i) => {
        const t = phase + (i / n) * Math.PI * 2;
        return add(c, add(mul(s1, Math.cos(t) * r), mul(s2, Math.sin(t) * r)));
      });
    const A = ring(a, r0);
    const mid = lerp3(a, b, 0.5);
    if (r1 < 1e-9) {
      for (let i = 0; i < n; i++) this.poly([A[i], A[(i + 1) % n], b], mid);
    } else {
      const B = ring(b, r1);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.poly([A[i], A[j], B[j], B[i]], mid);
      }
      if (caps.end) this.poly(B, mid);
    }
    if (caps.start) this.poly(A, mid);
  }

  /**
   * Like `prism`, but the sides share vertices with radial normals (reads as round: porcelain, tanks, tubes) at
   * half the vertex count. Caps stay flat.
   */
  round(a: V3, b: V3, r0: number, r1: number, n: number, caps: { start?: boolean; end?: boolean } = {}): void {
    const axis = sub(b, a);
    const L = length(axis);
    if (L < 1e-9 || r0 < 1e-9 || r1 < 1e-9) return this.prism(a, b, r0, r1, n, caps);
    const u = mul(axis, 1 / L);
    const ref: V3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = unit(cross(u, ref));
    const s2 = unit(cross(u, s1));
    const slope = (r0 - r1) / L;
    const o = this.vertexCount;
    const dirs: V3[] = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      return add(mul(s1, Math.cos(t)), mul(s2, Math.sin(t)));
    });
    for (const [c, r] of [
      [a, r0],
      [b, r1],
    ] as const) {
      for (const d of dirs) {
        const p = add(c, mul(d, r));
        const nrm = unit(add(d, mul(u, slope)));
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nrm[0], nrm[1], nrm[2]);
      }
    }
    // orientation: triangle (A0, A1, B1) must face along dirs[0]+dirs[1]
    const A0 = add(a, mul(dirs[0], r0));
    const A1 = add(a, mul(dirs[1 % n], r0));
    const B1 = add(b, mul(dirs[1 % n], r1));
    const face = cross(sub(A1, A0), sub(B1, A0));
    const out = add(dirs[0], dirs[1 % n]);
    const ccw = face[0] * out[0] + face[1] * out[1] + face[2] * out[2] > 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ai = o + i;
      const aj = o + j;
      const bi = o + n + i;
      const bj = o + n + j;
      if (ccw) this.idx.push(ai, aj, bj, ai, bj, bi);
      else this.idx.push(ai, bj, aj, ai, bi, bj);
    }
    const mid = lerp3(a, b, 0.5);
    if (caps.start) this.poly(dirs.map((d) => add(a, mul(d, r0))), mid);
    if (caps.end) this.poly(dirs.map((d) => add(b, mul(d, r1))), mid);
  }

  /** A square-section member of width w between two points (no end caps: members meet other members). */
  beam(a: V3, b: V3, w: number, caps = false): void {
    this.prism(a, b, w / Math.SQRT2, w / Math.SQRT2, 4, { start: caps, end: caps }, Math.PI / 4);
  }

  /** Axis-aligned box w × h × d standing on y0 at (x, z). `open` skips the bottom face. */
  box(w: number, h: number, d: number, x = 0, z = 0, y0 = 0, open = true): void {
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const y1 = y0 + h;
    const c: V3 = [x, y0 + h / 2, z];
    this.poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c);
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c);
    this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], c);
    this.poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], c);
    this.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c);
    if (!open) this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], c);
  }

  /** A double cone (diamond / octahedron-like) centred at c. */
  diamond(c: V3, r: number, below: number, above: number, n = 4, phase = Math.PI / 4): void {
    const bottom: V3 = [c[0], c[1] - below, c[2]];
    const top: V3 = [c[0], c[1] + above, c[2]];
    this.prism(c, top, r, 0, n, {}, phase);
    this.prism(c, bottom, r, 0, n, {}, phase);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setIndex(this.idx);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

type Part = "structure" | "accent" | "ground";

function materialFor(part: Part): THREE.MeshStandardMaterial {
  if (part === "structure")
    return new THREE.MeshStandardMaterial({ name: "structure", color: STRUCTURE_COLOR, roughness: 0.6, metalness: 0 });
  if (part === "accent")
    return new THREE.MeshStandardMaterial({ name: "accent", color: ACCENT_COLOR, roughness: 0.5, metalness: 0 });
  return new THREE.MeshStandardMaterial({ name: "ground", color: GROUND_COLOR, roughness: 0.9, metalness: 0 });
}

function assemble(name: string, parts: Partial<Record<Part, Builder>>): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  for (const part of ["ground", "accent", "structure"] as const) {
    const b = parts[part];
    if (!b || b.vertexCount === 0) continue;
    const mesh = new THREE.Mesh(b.geometry(), materialFor(part));
    mesh.name = `${name}-${part}`;
    mesh.userData.part = part;
    mesh.castShadow = true;
    mesh.receiveShadow = part !== "structure";
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------------------------------------------------------
// lattice tower

/** Cross-arm levels as fractions of the tower height (lower, middle, top). */
const ARM_LEVELS = [0.64, 0.82, 1] as const;
/** Half-length of each arm as a fraction of the arm span (middle arm is the widest). */
const ARM_REACH = [0.43, 0.5, 0.41] as const;
/** Arm-tip reach per conductor level (lower, middle, top) as fractions of `armSpan`: tip x = ±reach × armSpan. */
export const TOWER_ARM_REACH = ARM_REACH;
const PEAK = 1.13;
const insulatorLength = (h: number) => 0.075 * h;

/** A single-string disc insulator hanging from `top`. */
function insulator(b: Builder, top: V3, len: number, k: number, discs: number): void {
  const bottom: V3 = [top[0], top[1] - len, top[2]];
  b.prism(top, bottom, 0.07 * k, 0.07 * k, 4, {}, Math.PI / 4);
  for (let i = 0; i < discs; i++) {
    const y = top[1] - len * (0.18 + (0.7 * i) / Math.max(1, discs - 1));
    b.round([top[0], y + 0.06 * k, top[2]], [top[0], y - 0.06 * k, top[2]], 0.3 * k, 0.24 * k, 8, { start: true, end: true });
  }
  // conductor clamp
  b.box(0.55 * k, 0.16 * k, 0.2 * k, bottom[0], bottom[2], bottom[1] - 0.16 * k, false);
}

/**
 * Double-circuit steel lattice transmission tower: flared four-leg body with X-braced panels, a slim upper cage with
 * three tiers of tapered truss cross-arms, disc insulator strings and an earth-wire peak. Stands on concrete piers.
 */
export function buildLatticeTower(opts: LatticeTowerOptions = {}): THREE.Group {
  const H = opts.height ?? 40;
  const span = opts.armSpan ?? 14;
  const high = (opts.detail ?? "high") === "high";
  const k = H / 40; // member-size scale
  const steel = new Builder();
  const accent = new Builder();

  const yW = 0.56 * H; // waist: top of the flared body
  const yPeak = PEAK * H;
  const b0 = 0.125 * H; // half-width at the ground
  const bW = 0.036 * H; // half-width at the waist
  const bTop = 0.027 * H; // half-width of the cage at the top arm
  const bPeak = 0.01 * H;
  const armDepth = 0.056 * H;
  const [a1, a2, a3] = ARM_LEVELS.map((f) => f * H);

  const hw = (y: number): number => {
    if (y <= yW) return bW + (b0 - bW) * Math.pow(1 - y / yW, 1.45);
    if (y <= a3 + armDepth) return lerp(bW, bTop, (y - yW) / (a3 + armDepth - yW));
    return lerp(bTop, bPeak, (y - a3 - armDepth) / (yPeak - a3 - armDepth));
  };

  // panel levels: six lower panels shrinking upward (ratio .84), then the cage broken at every arm
  const lower: number[] = [0];
  {
    const n = 6;
    const r = 0.84;
    let h = (yW * (1 - r)) / (1 - Math.pow(r, n));
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += h;
      lower.push(i === n - 1 ? yW : y);
      h *= r;
    }
  }
  const upper = [yW, a1, a1 + armDepth, (a1 + armDepth + a2) / 2, a2, a2 + armDepth, a3, a3 + armDepth, yPeak];
  const levels = [...lower, ...upper.slice(1)];

  const legW = (y: number) => lerp(0.5, 0.26, y / yPeak) * k;
  const braceW = 0.15 * k;
  const horizW = 0.19 * k;

  const corner = (sx: number, sz: number, y: number): V3 => [sx * hw(y), y, sz * hw(y)];
  // legs
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (let i = 0; i < levels.length - 1; i++)
        steel.beam(corner(sx, sz, levels[i]), corner(sx, sz, levels[i + 1]), legW(levels[i]));

  // faces: point on face f at parameter u ∈ [-1, 1] and height y
  const faces: ((u: number, y: number) => V3)[] = [
    (u, y) => [u * hw(y), y, hw(y)],
    (u, y) => [u * hw(y), y, -hw(y)],
    (u, y) => [hw(y), y, u * hw(y)],
    (u, y) => [-hw(y), y, u * hw(y)],
  ];
  for (const face of faces) {
    for (let i = 0; i < levels.length - 1; i++) {
      const y0 = levels[i];
      const y1 = levels[i + 1];
      const isLower = y1 <= yW + 1e-6;
      if (i > 0) steel.beam(face(-1, y0), face(1, y0), horizW);
      if (isLower) {
        // X bracing
        steel.beam(face(-1, y0), face(1, y1), braceW);
        steel.beam(face(1, y0), face(-1, y1), braceW);
      } else if (y1 - y0 > 0.02 * H) {
        // single zig-zag diagonal in the slim cage
        const flip = i % 2 === 0 ? 1 : -1;
        steel.beam(face(-flip, y0), face(flip, y1), braceW * 0.9);
      }
    }
  }
  // plan bracing at the waist keeps the waist from reading as a pinch
  steel.beam(corner(-1, -1, yW), corner(1, 1, yW), braceW);
  steel.beam(corner(1, -1, yW), corner(-1, 1, yW), braceW);

  // cross-arms: tapered triangular trusses (two bottom chords + a top chord meeting at the tip)
  const ins = insulatorLength(H);
  ARM_LEVELS.forEach((_, idx) => {
    const ya = [a1, a2, a3][idx];
    const reach = ARM_REACH[idx] * span;
    for (const sx of [-1, 1]) {
      const rootF: V3 = [sx * hw(ya), ya, hw(ya)];
      const rootB: V3 = [sx * hw(ya), ya, -hw(ya)];
      const rootT: V3 = [sx * hw(ya + armDepth), ya + armDepth, 0];
      const tip: V3 = [sx * reach, ya, 0];
      const F = (t: number) => lerp3(rootF, tip, t);
      const B = (t: number) => lerp3(rootB, tip, t);
      const T = (t: number) => lerp3(rootT, tip, t);
      steel.beam(rootF, tip, horizW * 1.1);
      steel.beam(rootB, tip, horizW * 1.1);
      steel.beam(rootT, tip, horizW);
      steel.beam(F(0.45), B(0.45), braceW * 0.9);
      if (high) {
        steel.beam(F(0), T(0.45), braceW * 0.85);
        steel.beam(T(0.45), F(0.78), braceW * 0.85);
        steel.beam(B(0), T(0.45), braceW * 0.85);
        steel.beam(T(0.45), B(0.78), braceW * 0.85);
        insulator(accent, tip, ins, k, 5);
      } else {
        accent.prism(tip, [tip[0], tip[1] - ins, tip[2]], 0.2 * k, 0.12 * k, 4, { end: true }, Math.PI / 4);
      }
    }
  });

  // earth-wire peak with two short horns
  const yE = yPeak - 0.035 * H;
  for (const sx of [-1, 1]) {
    const tip: V3 = [sx * 0.17 * span, yE + 0.012 * H, 0];
    steel.beam([sx * hw(yE), yE, hw(yE)], tip, braceW);
    steel.beam([sx * hw(yE), yE, -hw(yE)], tip, braceW);
    steel.beam([0, yPeak, 0], tip, braceW);
    accent.box(0.3 * k, 0.3 * k, 0.3 * k, tip[0], tip[2], tip[1] - 0.3 * k, false);
  }

  // concrete piers
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) accent.box(1.15 * k, 0.75 * k, 1.15 * k, sx * b0, sz * b0, 0, true);

  const g = assemble("lattice-tower", { structure: steel, accent });
  g.userData.conductorHeights = towerConductorHeights(H);
  g.userData.totalHeight = yPeak;
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// substation

/** A slim post insulator: pedestal + ribbed porcelain column. Returns the top point. */
function postInsulator(steel: Builder, accent: Builder, x: number, z: number, pedestal: number, height: number): V3 {
  steel.beam([x, 0, z], [x, pedestal, z], 0.32);
  const top: V3 = [x, pedestal + height, z];
  accent.round([x, pedestal, z], top, 0.16, 0.12, 6, { end: true });
  for (let i = 1; i <= 2; i++) {
    const y = pedestal + (height * i) / 3;
    accent.round([x, y - 0.06, z], [x, y + 0.06, z], 0.3, 0.3, 6, { start: true, end: true });
  }
  return top;
}

/** A lattice-look gantry girder between two column tops: two chords with a zig-zag web. */
function girder(steel: Builder, a: V3, b: V3, depth: number, bays: number, w: number): void {
  const a2: V3 = [a[0], a[1] - depth, a[2]];
  const b2: V3 = [b[0], b[1] - depth, b[2]];
  steel.beam(a, b, w);
  steel.beam(a2, b2, w);
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays;
    const t1 = (i + 1) / bays;
    steel.beam(i % 2 ? lerp3(a, b, t0) : lerp3(a2, b2, t0), i % 2 ? lerp3(a2, b2, t1) : lerp3(a, b, t1), w * 0.6);
  }
}

/** A power transformer: tank, radiator fins, conservator, three HV bushings. Centred at (x, z), long axis along z. */
function transformer(accent: Builder, steel: Builder, x: number, z: number): void {
  const tw = 4.2;
  const th = 4.4;
  const td = 6.4;
  accent.box(tw, 0.35, td + 0.6, x, z, 0, true); // skid
  accent.box(tw, th, td, x, z, 0.35, true);
  // radiator fins on both long sides
  for (const sx of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const zz = z - td * 0.38 + (i * td * 0.76) / 5;
      accent.box(1.3, 3.2, 0.16, x + sx * (tw / 2 + 0.65), zz, 0.8, false);
    }
  // conservator on two stands
  const cy = 0.35 + th + 1.35;
  for (const zz of [z - 1.6, z + 1.6]) steel.beam([x + 1.1, 0.35 + th, zz], [x + 1.1, cy - 0.6, zz], 0.2);
  accent.round([x + 1.1, cy, z - 2.4], [x + 1.1, cy, z + 2.4], 0.72, 0.72, 12, { start: true, end: true });
  // HV bushings
  for (let i = -1; i <= 1; i++) {
    const bz = z + i * 1.7;
    const base: V3 = [x - 0.8, 0.35 + th, bz];
    const top: V3 = [x - 1.3, 0.35 + th + 3.4, bz];
    accent.round(base, top, 0.26, 0.12, 8, { end: true });
    for (let d = 1; d <= 3; d++) {
      const p = lerp3(base, top, d / 4);
      accent.round(sub(p, [0, 0.05, 0]), add(p, [0, 0.05, 0]), 0.36, 0.36, 8, { start: true, end: true });
    }
  }
}

/**
 * Open-air substation yard: gravel pad and perimeter fence, two incoming dead-end gantries, a row of circuit
 * breakers, a three-phase rigid bus on post insulators, two power transformers behind a firewall and a control house.
 */
export function buildSubstation(opts: SubstationOptions = {}): THREE.Group {
  const W = opts.width ?? 60;
  const D = opts.depth ?? 40;
  const steel = new Builder();
  const accent = new Builder();
  const ground = new Builder();

  // gravel pad
  if (opts.pad ?? true) ground.box(W, 0.25, D, 0, 0, 0, true);

  // perimeter fence: posts every ~6 m, two rails
  const fx = W / 2 - 0.6;
  const fz = D / 2 - 0.6;
  const fenceH = 2.4;
  const cornersXZ: [number, number][] = [
    [-fx, -fz],
    [fx, -fz],
    [fx, fz],
    [-fx, fz],
  ];
  for (let s = 0; s < 4; s++) {
    const [x0, z0] = cornersXZ[s];
    const [x1, z1] = cornersXZ[(s + 1) % 4];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 6));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      steel.beam([lerp(x0, x1, t), 0.25, lerp(z0, z1, t)], [lerp(x0, x1, t), 0.25 + fenceH, lerp(z0, z1, t)], 0.12);
    }
    for (const y of [1.2, fenceH + 0.1]) steel.beam([x0, y, z0], [x1, y, z1], 0.08);
  }

  // incoming dead-end gantries (two bays) on the -z side
  const gz = -D * 0.34;
  const colH = 14;
  const bays = [-W * 0.2, W * 0.2];
  for (const bx of bays) {
    const half = Math.min(5.5, W * 0.09);
    const tops: V3[] = [];
    for (const sx of [-1, 1]) {
      const x = bx + sx * half;
      // tapered lattice-look column: four legs with bracing
      const legs: V3[][] = [];
      for (const lx of [-1, 1])
        for (const lz of [-1, 1]) {
          const bottom: V3 = [x + lx * 0.7, 0.25, gz + lz * 0.7];
          const top: V3 = [x + lx * 0.35, colH, gz + lz * 0.35];
          steel.beam(bottom, top, 0.16);
          legs.push([bottom, top]);
        }
      for (let i = 0; i < 4; i++) {
        const t0 = i / 4;
        const t1 = (i + 1) / 4;
        steel.beam(lerp3(legs[0][0], legs[0][1], t0), lerp3(legs[1][0], legs[1][1], t1), 0.08);
        steel.beam(lerp3(legs[2][0], legs[2][1], t0), lerp3(legs[3][0], legs[3][1], t1), 0.08);
        steel.beam(lerp3(legs[0][0], legs[0][1], t0), lerp3(legs[2][0], legs[2][1], t1), 0.08);
        steel.beam(lerp3(legs[1][0], legs[1][1], t0), lerp3(legs[3][0], legs[3][1], t1), 0.08);
      }
      // earth spike
      steel.beam([x, colH, gz], [x, colH + 2.2, gz], 0.12);
      tops.push([x, colH - 0.4, gz]);
    }
    girder(steel, tops[0], tops[1], 1.3, 8, 0.22);
    // three strain insulators hanging from the girder toward the yard
    for (let p = -1; p <= 1; p++) {
      const top: V3 = [bx + p * half * 0.55, colH - 1.7, gz];
      accent.prism(top, [top[0], top[1] - 1.1, top[2] + 1.6], 0.1, 0.1, 4, {}, Math.PI / 4);
      for (let d = 1; d <= 3; d++) {
        const c = lerp3(top, [top[0], top[1] - 1.1, top[2] + 1.6], d / 4);
        accent.round([c[0], c[1] + 0.05, c[2]], [c[0], c[1] - 0.05, c[2]], 0.28, 0.28, 6, { start: true, end: true });
      }
    }
  }

  // breakers: per bay, three phases on support columns
  const bz = -D * 0.13;
  for (const bx of bays)
    for (let p = -1; p <= 1; p++) {
      const x = bx + p * 2.4;
      steel.beam([x, 0.25, bz], [x, 2.6, bz], 0.36);
      accent.box(1.1, 1.3, 1.5, x, bz, 2.6, false);
      accent.round([x, 3.9, bz - 0.4], [x, 5.6, bz - 0.4], 0.18, 0.1, 6, { end: true });
      accent.round([x, 3.9, bz + 0.4], [x, 5.6, bz + 0.4], 0.18, 0.1, 6, { end: true });
    }

  // rigid three-phase bus on post insulators
  const busZ = D * 0.02;
  const busY = 6.4;
  const busX0 = -W * 0.4;
  const busX1 = W * 0.4;
  const posts = 5;
  for (let p = -1; p <= 1; p++) {
    const z = busZ + p * 1.8;
    for (let i = 0; i < posts; i++) postInsulator(steel, accent, lerp(busX0, busX1, i / (posts - 1)), z, 3.6, busY - 3.6);
    steel.round([busX0, busY + 0.12, z], [busX1, busY + 0.12, z], 0.12, 0.12, 6, { start: true, end: true });
  }

  // transformers with a firewall between them
  const tz = D * 0.25;
  const t1x = -W * 0.15;
  const t2x = W * 0.085;
  transformer(accent, steel, t1x, tz);
  transformer(accent, steel, t2x, tz);
  ground.box(0.5, 7.2, 8.2, (t1x + t2x) / 2, tz, 0.25, true);

  // control house with a thin roof slab
  const hx = W * 0.34;
  const hz = D * 0.3;
  accent.box(8.5, 3.4, 5.6, hx, hz, 0.25, true);
  steel.box(9.3, 0.35, 6.4, hx, hz, 3.65, false);

  return assemble("substation", { structure: steel, accent, ground });
}

// ---------------------------------------------------------------------------------------------------------------
// marker pylon & spire

/**
 * Marker pylon for a project center with an unknown voltage class (20 m): hexagonal plinth, tapered shaft,
 * a collar band and a faceted diamond head. Deliberately abstract: it marks a place, not a structure type.
 */
export function buildMarkerPylon(): THREE.Group {
  const steel = new Builder();
  const accent = new Builder();
  accent.prism([0, 0, 0], [0, 0.8, 0], 1.7, 1.45, 6, { end: true });
  steel.prism([0, 0.8, 0], [0, 15.9, 0], 0.72, 0.34, 6, { end: true });
  accent.prism([0, 13.4, 0], [0, 14.2, 0], 0.62, 0.6, 6, { start: true, end: true });
  steel.diamond([0, 17.7, 0], 1.15, 1.8, 2.3, 4);
  return assemble("marker-pylon", { structure: steel, accent });
}

/**
 * Region-zoom spire (40 m tall, 16 m across at the foot). Natively it is a stout obelisk; the map scales it
 * non-uniformly [0.4s, 0.4s, s] so it reads as a slim needle 2–3 px wide and 10–16 px tall: octagonal footing,
 * long tapered shaft, a ring collar just below a faceted crown (the brightest part under the height-based emissive).
 */
export function buildSpire(): THREE.Group {
  const steel = new Builder();
  const accent = new Builder();
  accent.prism([0, 0, 0], [0, 1.6, 0], 8, 7.2, 8, { end: true }, Math.PI / 8);
  steel.prism([0, 1.6, 0], [0, 31.5, 0], 5.6, 1.7, 8, { end: true }, Math.PI / 8);
  accent.prism([0, 28.2, 0], [0, 29.6, 0], 3.6, 3.4, 8, { start: true, end: true }, Math.PI / 8);
  steel.diamond([0, 34.4, 0], 3.1, 2.9, 5.6, 4);
  return assemble("spire", { structure: steel, accent });
}
