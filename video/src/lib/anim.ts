import { Easing, interpolate, spring } from "remotion";

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
export const outQuint = Easing.bezier(0.22, 1, 0.36, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const inQuad = Easing.bezier(0.55, 0, 1, 0.45);

/** 0→1 over [start, start + dur] frames. */
export const prog = (f: number, start: number, dur: number, easing: (t: number) => number = outQuint) =>
  interpolate(f, [start, start + Math.max(1, dur)], [0, 1], { ...CLAMP, easing });

/** 1 while inside [start, end], fading in/out over `fade` frames. */
export const visible = (f: number, start: number, end: number, fade = 10) =>
  Math.min(prog(f, start, fade, inOut), 1 - prog(f, end - fade, fade, inOut));

export const pop = (f: number, fps: number, delay = 0, damping = 14, mass = 0.6) =>
  spring({ frame: f - delay, fps, config: { damping, mass, stiffness: 120 } });

export const smooth = (f: number, fps: number, delay = 0) => spring({ frame: f - delay, fps, config: { damping: 200 } });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Count up to `to` with thousands separators. */
export const count = (t: number, to: number, decimals = 0) =>
  (to * t).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Deterministic pseudo-random in [0, 1). */
export const rand = (i: number, seed = 1) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
