import { chromium } from "playwright-core";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
for (const [w, h] of [[1280, 800], [1920, 1080], [1024, 768]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto("http://localhost:3217/?pair=desc-06367-d-g__gpc-20065", { waitUntil: "load" });
  await page.waitForTimeout(6500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.screenshot({ path: `${out}/size-${w}.png` });
  console.log(w, h, "overflow", overflow);
  await page.close();
}
await browser.close();
