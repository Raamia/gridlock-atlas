/**
 * Warm the 3D close-up before anyone opens it (SPEC §7 "Preload"): fetch the PairCloseup chunk (three.js, R3F, drei,
 * postprocessing) while the browser is idle and pre-build the procedural structures once, so the first open takes
 * well under 300 ms. Light on purpose: importing THIS module pulls in nothing heavy, so the inspector, demo or map can
 * call it on first pair selection / after demo step 2.
 *
 * The close-up builds its structures procedurally (lib/models/structures.ts), so no /models/*.glb fetch is needed.
 */
let started = false;

export function preloadCloseup(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const run = () => {
    void import("../PairCloseup")
      .then((m) => m.warmCloseup?.())
      .catch(() => {
        started = false; // offline dev hiccup: allow a later retry
      });
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 1200);
}
