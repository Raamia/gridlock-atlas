import { chromium } from "playwright-core";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("http://localhost:3217/?pair=dpc-alma-blair__xcel-wwtc", { waitUntil: "load" });
await page.waitForTimeout(7000);
for (const b of ["Satellite", "Offline", "Night"]) {
  // a short or narrow focal hole folds the Basemap group into the "Basemap options" menu: open it first
  const menu = page.getByRole("button", { name: "Basemap options" });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await page.getByRole("button", { name: b, exact: true }).click();
  await page.waitForFunction(() => window.__map?.isStyleLoaded() && window.__map.getStyle()?.layers, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const m = window.__map;
    const st = m.getStyle();
    return { loaded: m.isStyleLoaded(), layers: st ? st.layers.filter((l) => l.id.startsWith("gl-")).length : -1, markers: document.querySelectorAll(".mapboxgl-marker").length, terrain: !!m.getTerrain() };
  });
  console.log(b, JSON.stringify(info));
  await page.screenshot({ path: `${out}/basemap-${b.toLowerCase()}.png` });
}
await page.getByRole("button", { name: "Flat map" }).click();
await page.waitForTimeout(1500);
console.log("flat pitch", await page.evaluate(() => window.__map.getPitch()));
console.log(errors.length ? "ERRORS: " + errors.join(" | ") : "no errors");
await browser.close();
