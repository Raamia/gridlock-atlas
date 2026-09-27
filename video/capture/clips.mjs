// Records the real-app clips used in the video (needs the app running: npm run build && npm start -- -p 3217).
//   node video/capture/clips.mjs savannah|midwest [outDir]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openApp, encode } from "./recorder.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const which = process.argv[2] ?? "savannah";
const OUT = process.argv[3] ?? path.join(HERE, "..", "public", "clips");
const FRAMES = path.join(OUT, "_frames");

async function clip(r, name, fn) {
  const t0 = Date.now();
  r.start(path.join(FRAMES, name));
  await fn();
  const n = r.n;
  r.dir = null;
  await encode(path.join(FRAMES, name), path.join(OUT, `${name}.mp4`));
  console.log(`${name}: ${n} frames in ${Math.round((Date.now() - t0) / 1000)}s`);
}

async function savannah() {
  const r = await openApp({ url: "/" });
  const { page } = r;

  await clip(r, "a-compare", async () => {
    r.cursor = { ...r.cursor, x: 900, y: 420 };
    r.showCursor(true);
    await r.hold(0.4);
    await r.clickOn(page.getByRole("button", { name: /Compare public plans/ }), { move: 0.9 });
    await r.hold(5.8);
  });

  await clip(r, "b-select", async () => {
    await r.hold(0.3);
    await r.clickOn(page.locator("[data-match-id]").first(), { move: 0.8 });
    await r.hold(3.6);
    await r.clickOn(page.getByRole("button", { name: /^When$/ }).first(), { move: 0.7 });
    await r.hold(3.2);
  });

  await clip(r, "c-closeup", async () => {
    await r.hold(0.2);
    await r.clickOn(page.getByRole("button", { name: /3D close-up/ }).first(), { move: 0.8 });
    await r.hold(2.6);
    await r.clickOn(page.getByRole("button", { name: /Run simulation/ }), { move: 0.7 });
    r.showCursor(false);
    await r.hold(13.5);
  });

  await clip(r, "d-brief", async () => {
    await page.keyboard.press("Escape"); // leave the close-up (not recorded frames yet)
    await r.hold(1.0);
    r.showCursor(true);
    await r.clickOn(page.getByRole("button", { name: /Create review brief/ }).first(), { move: 0.8 });
    await r.hold(1.4);
    r.showCursor(false);
    await r.scroll("div.fixed.overflow-y-auto", 520, 3.2);
    await r.hold(1.0);
  });

  await page.keyboard.press("Escape"); // close the brief
  await methodClip(r);
  await r.close();
}

async function methodClip(r) {
  const { page } = r;
  await clip(r, "f-method", async () => {
    await r.hold(0.6);
    r.showCursor(true);
    await r.clickOn(page.getByRole("button", { name: "Method", exact: true }), { move: 0.8 });
    await r.hold(2.4);
    r.showCursor(false);
    await r.scroll('[role="dialog"] div.min-h-0.flex-1.overflow-y-auto', 330, 2.2);
    await r.hold(1.6);
  });
}

async function method() {
  const r = await openApp({ url: "/" });
  await r.page.getByRole("button", { name: /Compare public plans/ }).click();
  await r.settle(7000);
  r.cursor = { ...r.cursor, x: 900, y: 420 };
  await methodClip(r);
  await r.close();
}

async function midwest() {
  const r = await openApp({ url: "/?pair=dpc-alma-blair__xcel-wwtc" });
  const { page } = r;
  await clip(r, "e-midwest", async () => {
    r.cursor = { ...r.cursor, x: 700, y: 500 };
    r.showCursor(true);
    await r.hold(1.2);
    // the Impact pill scrolls the inspector to the impact channels; the shared-terminal channel is first
    await r.clickOn(page.getByRole("button", { name: /^Impact$/ }).first(), { move: 0.9 });
    await r.hold(0.8);
    await r.moveTo(1230, 470, 1.0);
    await r.hold(3.2);
  });
  await r.close();
}

if (which === "savannah") await savannah();
else if (which === "method") await method();
else await midwest();
