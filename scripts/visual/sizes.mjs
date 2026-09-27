// Overflow check and screenshots of pair #02 (Sperry's OVL_3) at the desktop sizes the layout is tuned for,
// including a 1280×720 projector.
//   node scripts/visual/sizes.mjs [outDir]      default outDir: /tmp/gridlock-shots
//   BASE=http://localhost:3000 node scripts/visual/sizes.mjs   or PORT=3000 … (default http://localhost:3218)
import { baseUrl, launch, outDir, settle } from "./common.mjs";

const base = baseUrl();
const out = outDir(process.argv[2], "/tmp/gridlock-shots");
const browser = await launch();
for (const [w, h] of [[1280, 720], [1280, 800], [1440, 900], [1920, 1080], [1024, 768]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?pair=desc-06367-d-g__gpc-20065`, { waitUntil: "load" });
  await page.locator('aside[aria-label="Evidence inspector"]').waitFor({ state: "visible", timeout: 30000 });
  await settle(page, 1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.screenshot({ path: `${out}/size-${w}x${h}.png` });
  console.log(`${w}x${h}`, "overflow", overflow);
  await page.close();
}
await browser.close();
