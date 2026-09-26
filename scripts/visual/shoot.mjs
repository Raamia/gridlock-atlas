// Headless visual check: drives the running dev server with the system Chrome and saves screenshots.
//   node scripts/visual/shoot.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3217";
const out = process.argv[3] ?? "/tmp/gridlock-shots";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
};
const wait = (ms) => page.waitForTimeout(ms);
const steps = (process.env.STEPS ?? "overview,compare,pair,brief,method,sources,midwest,demo").split(",");

await page.goto(base, { waitUntil: "load" });
await wait(4000);
if (steps.includes("overview")) await shot("01-overview");
await page.getByRole("button", { name: /Compare public plans/ }).click();
await wait(3500);
if (steps.includes("compare")) await shot("02-compared");
await page.locator("[data-match-id]").first().click();
await wait(3500);
if (steps.includes("pair")) {
  await shot("03-pair");
  await page.locator('[data-section="schedule"]').scrollIntoViewIfNeeded();
  await wait(600);
  await shot("04-pair-schedule");
  await page.locator('[data-section="impact"]').scrollIntoViewIfNeeded();
  await wait(600);
  await shot("05-pair-impact");
}
if (steps.includes("brief")) {
  await page.getByRole("button", { name: /Create review brief/ }).click();
  await wait(900);
  await shot("06-brief");
  await page.keyboard.press("Escape");
  await wait(400);
}
if (steps.includes("method")) {
  await page.getByRole("button", { name: /^Method$/ }).click();
  await wait(900);
  await shot("07-method");
  await page.keyboard.press("Escape");
  await wait(400);
}
if (steps.includes("sources")) {
  await page.getByRole("button", { name: /Source registry/ }).click();
  await wait(900);
  await shot("08-sources");
  await page.keyboard.press("Escape");
  await wait(400);
}
if (steps.includes("midwest")) {
  await page.goto(`${base}/?pair=dpc-alma-blair__xcel-wwtc`, { waitUntil: "load" });
  await wait(6000);
  await shot("09-midwest-pair");
}
if (steps.includes("demo")) {
  await page.goto(base, { waitUntil: "load" });
  await wait(4000);
  await page.getByRole("button", { name: /guided demo/i }).click();
  await wait(1500);
  await shot("10-demo-1");
  for (let i = 2; i <= 8; i++) {
    await page.getByRole("button", { name: /^Next/ }).click().catch(() => {});
    await wait(i === 2 ? 3500 : 2600);
    await shot(`10-demo-${i}`);
  }
}
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
await browser.close();
