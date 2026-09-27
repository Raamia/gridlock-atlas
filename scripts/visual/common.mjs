// Shared set-up for the visual scripts: where the running app is, where images go, and a headless system Chrome.
//   BASE=http://localhost:3000 node scripts/visual/<script>.mjs   (a full URL)
//   PORT=3000 node scripts/visual/<script>.mjs                    (localhost on that port)
// With neither, the scripts use http://localhost:3218.
import fs from "node:fs";
import { chromium } from "playwright-core";

export function baseUrl() {
  const base = process.env.BASE || `http://localhost:${process.env.PORT || 3218}`;
  if (!/^https?:\/\/[^/]/i.test(base)) {
    console.error(`BASE must be an http(s) URL, got "${base}"`);
    process.exit(1);
  }
  return base.replace(/\/+$/, "");
}

/** The output directory (created if missing). A URL here once created a directory literally named "http:" in the repo. */
export function outDir(arg, fallback) {
  const out = arg ?? fallback;
  if (/^[a-z][a-z0-9+.-]+:/i.test(out)) {
    console.error(`outDir must be a filesystem path, not a URL: "${out}" (the app's URL comes from BASE or PORT)`);
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  return out;
}

/** The installed Google Chrome, headless, with the GPU flags Mapbox GL and the 3D close-up need on macOS. */
export function launch() {
  return chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"] });
}

/** Collects page errors and console errors, to print at the end. */
export function collectErrors(page, errors = []) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 300)}`));
  return errors;
}

/**
 * Waits until the map has stopped moving and its tiles have loaded (the dev build exposes `window.__map`), then a
 * little longer for reveals, panels and 3D models to finish. Without `__map` (a production build) it waits a fixed time.
 */
export async function settle(page, extraMs = 900) {
  const hasMap = await page.evaluate(() => !!window.__map).catch(() => false);
  if (hasMap) {
    await page
      .waitForFunction(() => window.__map && !window.__map.isMoving() && window.__map.areTilesLoaded(), null, { timeout: 25000, polling: 250 })
      .catch(() => console.warn("  (the map did not report idle within 25 s)"));
  } else {
    await page.waitForTimeout(4000);
  }
  await page.waitForTimeout(extraMs);
}
