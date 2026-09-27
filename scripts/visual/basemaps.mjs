// Switches the basemap (Satellite, Offline, Night) and the perspective (Flat map, 3D) on the Wisconsin pair, and reports
// what the map drew after each switch: loaded style, GridLock layers, callouts and terrain.
//   node scripts/visual/basemaps.mjs [outDir]      default outDir: /tmp/gridlock-shots
//   BASE=http://localhost:3000 node scripts/visual/basemaps.mjs   or PORT=3000 … (default http://localhost:3218)
import { baseUrl, collectErrors, launch, outDir, settle } from "./common.mjs";

const base = baseUrl();
const out = outDir(process.argv[2], "/tmp/gridlock-shots");
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = collectErrors(page);

await page.goto(`${base}/?pair=dpc-alma-blair__xcel-wwtc`, { waitUntil: "load" });
await page.locator('aside[aria-label="Evidence inspector"]').waitFor({ state: "visible", timeout: 30000 });
await settle(page, 1500);

const report = () =>
  page.evaluate(() => {
    const m = window.__map;
    const st = m.getStyle();
    const ids = st ? st.layers.map((l) => l.id) : [];
    return {
      loaded: m.isStyleLoaded(),
      layers2d: ids.filter((id) => id.startsWith("gl-")).length,
      layers3d: ids.filter((id) => id.startsWith("gl3d-")).length,
      callouts: document.querySelectorAll("[data-callout]").length,
      terrain: !!m.getTerrain(),
      pitch: Math.round(m.getPitch()),
    };
  });

const basemap = page.getByRole("group", { name: "Basemap" });
for (const b of ["Satellite", "Offline", "Night"]) {
  // a short focal hole folds the Basemap group into the "Basemap options" menu: open it first
  const menu = page.getByRole("button", { name: "Basemap options" });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await basemap.getByRole("button", { name: b, exact: true }).click();
  await page.waitForFunction(() => window.__map?.isStyleLoaded() && window.__map.getStyle()?.layers, null, { timeout: 30000 }).catch(() => {});
  await settle(page, 1500);
  console.log(b, JSON.stringify(await report()));
  await page.screenshot({ path: `${out}/basemap-${b.toLowerCase()}.png` });
}

const perspective = page.getByRole("group", { name: "Map perspective" });
await perspective.getByRole("button", { name: "Flat map", exact: true }).click();
await settle(page, 800);
console.log("Flat map", JSON.stringify(await report()));
await page.screenshot({ path: `${out}/basemap-flat.png` });
await perspective.getByRole("button", { name: "3D", exact: true }).click();
await settle(page, 800);
console.log("3D", JSON.stringify(await report()));

console.log(errors.length ? `ERRORS: ${errors.join(" | ")}` : "no errors");
await browser.close();
