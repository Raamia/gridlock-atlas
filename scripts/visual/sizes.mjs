// Overflow check and screenshots of pair #2 at three desktop sizes.
//   node scripts/visual/sizes.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3217";
const out = process.argv[3] ?? "/tmp/atlas-shots";
if (!/^https?:\/\//i.test(base)) {
  console.error(`baseUrl must be an http(s) URL, got "${base}"`);
  process.exit(1);
}
// a URL passed as the out dir once created a directory literally named "http:" in the repo
if (/^[a-z][a-z0-9+.-]+:/i.test(out)) {
  console.error(`outDir must be a filesystem path, not a URL: "${out}"`);
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
for (const [w, h] of [[1280, 800], [1920, 1080], [1024, 768]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?pair=desc-06367-d-g__gpc-20065`, { waitUntil: "load" });
  await page.waitForTimeout(6500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.screenshot({ path: `${out}/size-${w}.png` });
  console.log(w, h, "overflow", overflow);
  await page.close();
}
await browser.close();
