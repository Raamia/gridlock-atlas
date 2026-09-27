// Screenshots for the README (docs/screenshots/*.jpg) and for visual review, taken headless with the system Chrome
// against a running dev server at 1440×900.
//   node scripts/visual/shoot.mjs [outDir]                 default outDir: docs/screenshots
//   BASE=http://localhost:3000 node scripts/visual/shoot.mjs   or PORT=3000 … (default http://localhost:3218)
//   SHOTS=top-lead,brief node scripts/visual/shoot.mjs      a subset. Extra review shots, not in the default set:
//                                                          prerun, sources, demo (the eight guided-demo steps as demo-N.jpg)
import { baseUrl, collectErrors, launch, outDir, settle } from "./common.mjs";

const base = baseUrl();
const out = outDir(process.argv[2], "docs/screenshots");
const DOCS = ["top-lead", "overlaps", "known-coordination", "impact", "brief", "method", "closeup"];
const wanted = (process.env.SHOTS ?? DOCS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const TOP_LEAD = "desc-6888__gpc-20065"; // Savannah River #01: DESC Okatie–McIntosh × Georgia Power Goshen–McIntosh
const WISCONSIN = "dpc-alma-blair__xcel-wwtc"; // Upper Midwest known coordination at Tremval North

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
const failed = [];

const inspector = (page) => page.locator('aside[aria-label="Evidence inspector"]');

/** Opens a path and waits for the map (and, for a deep-linked pair, the inspector) to settle. */
async function open(page, path) {
  await page.goto(base + path, { waitUntil: "load" });
  if (path.includes("pair=")) await inspector(page).waitFor({ state: "visible", timeout: 30000 });
  await settle(page, 1200);
}

/** No hover card, tooltip or focus ring left over from the last click (focus inside a dialog stays put). */
async function calm(page) {
  await page.mouse.move(110, 30); // the wordmark: no tooltip, not over the map
  await page.evaluate(() => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && !a.closest('[role="dialog"]')) a.blur();
  });
  await page.waitForTimeout(400);
}

async function save(page, name) {
  await calm(page);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 88 });
  console.log("saved", `${out}/${name}.jpg`);
}

const SCENES = {
  // the top lead: verdict, tiles, question, the arc on the map and the pair's construction windows in the dock
  "top-lead": async (page) => {
    await open(page, `/?pair=${TOP_LEAD}`);
    await save(page, "top-lead");
  },
  // after Compare: the 111 headline, ranked list and every flagged pair's arc over the Savannah River
  overlaps: async (page) => {
    await open(page, "/");
    await page.getByRole("button", { name: /Compare public plans/ }).click();
    await page.mouse.move(110, 30);
    await page.locator('[aria-label="Coordination queue"] [data-match-id]').first().waitFor({ timeout: 30000 });
    await settle(page, 2500); // the reveal draws arcs and rank chips for about 1.2 s after the camera lands
    await save(page, "overlaps");
  },
  "known-coordination": async (page) => {
    await open(page, `/?pair=${WISCONSIN}`);
    await save(page, "known-coordination");
  },
  impact: async (page) => {
    await open(page, `/?pair=${TOP_LEAD}`);
    await inspector(page).getByRole("button", { name: "Impact", exact: true }).click();
    await page.waitForTimeout(1500);
    await save(page, "impact");
  },
  brief: async (page) => {
    await open(page, `/?pair=${TOP_LEAD}`);
    await inspector(page).getByRole("button", { name: "Create review brief" }).click();
    await page.getByRole("dialog", { name: "Review brief" }).waitFor({ state: "visible" });
    await page.waitForTimeout(1200);
    await save(page, "brief");
  },
  // Method & audit, opened by the ✓ proof button on "Proof at a glance"
  method: async (page) => {
    await open(page, `/?pair=${TOP_LEAD}`);
    await page.getByRole("button", { name: /Reproduces Sperry/ }).first().click();
    await page.getByRole("dialog", { name: "Method & audit" }).waitFor({ state: "visible" });
    await page.waitForTimeout(1200);
    await save(page, "method");
  },
  closeup: async (page) => {
    await open(page, `/?pair=${WISCONSIN}`);
    await page.getByRole("button", { name: "3D close-up" }).first().click();
    await page.getByRole("button", { name: "Back to map" }).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(6000); // models, lights and the entrance settle
    await save(page, "closeup");
  },
  prerun: async (page) => {
    await open(page, "/");
    await save(page, "prerun");
  },
  sources: async (page) => {
    await open(page, "/");
    await page.getByRole("button", { name: /Source registry/ }).click();
    await page.getByRole("dialog", { name: "Source registry" }).waitFor({ state: "visible" });
    await page.waitForTimeout(1200);
    await save(page, "sources");
  },
  demo: async (page) => {
    await open(page, "/");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const card = page.getByRole("region", { name: "Guided demo" });
    await card.waitFor({ state: "visible" });
    await settle(page);
    await save(page, "demo-1");
    for (let i = 2; i <= 8; i++) {
      await card.getByRole("button", { name: /^Next/ }).click();
      await settle(page, i === 2 ? 2500 : 1500);
      await save(page, `demo-${i}`);
    }
  },
};

for (const name of wanted) {
  const scene = SCENES[name];
  if (!scene) {
    failed.push(`unknown shot "${name}" (known: ${Object.keys(SCENES).join(", ")})`);
    continue;
  }
  const page = await context.newPage();
  collectErrors(page, errors);
  try {
    await scene(page);
  } catch (e) {
    failed.push(`${name}: ${e.message.split("\n")[0]}`);
  }
  await page.close();
}
console.log(errors.length ? `PAGE ERRORS:\n${errors.join("\n")}` : "no page errors");
if (failed.length) console.log(`FAILED SHOTS:\n${failed.join("\n")}`);
await browser.close();
process.exit(failed.length ? 1 : 0);
