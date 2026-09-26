import type mapboxgl from "mapbox-gl";

/**
 * Idle bearing drift for the pre-run overview (SPEC §4 A): a slow sway of ±8° over a minute (< 1°/s), applied as small
 * bearing increments so any camera move in between is respected. Stops for good on the first interaction anywhere, or
 * as soon as `keepGoing()` says so (a run, a selection, the demo, Flat map). Callers only start it on desktop, with
 * motion allowed and outside automation.
 */
export function canDrift(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return false;
  return window.innerWidth >= 1024;
}

const AMPLITUDE = 8; // degrees
const PERIOD = 60_000; // ms

export function startDrift(map: mapboxgl.Map, keepGoing: () => boolean): () => void {
  let raf = 0;
  let stopped = false;
  let prev = 0;
  let phase = 0; // ms of drift actually applied (paused while another camera move runs)
  const events = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const e of events) window.removeEventListener(e, stop, true);
  };
  for (const e of events) window.addEventListener(e, stop, { capture: true, passive: true });

  const tick = (t: number) => {
    if (stopped) return;
    if (!keepGoing()) return stop();
    const dt = prev ? Math.min(64, t - prev) : 0;
    prev = t;
    if (dt > 0 && !map.isEasing() && !map.isMoving()) {
      // d/dt of A·sin(ωt), integrated per frame: starts at the current bearing with zero jump
      const w = (2 * Math.PI) / PERIOD;
      const step = AMPLITUDE * w * Math.cos(w * phase) * dt;
      phase += dt;
      map.setBearing(map.getBearing() + step);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
