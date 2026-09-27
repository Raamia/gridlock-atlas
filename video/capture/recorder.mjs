// Deterministic app recorder: Playwright's fake clock drives JS time (rAF, timers, performance.now) one video frame at a
// time; CSS/WAAPI animations are slowed to match the real capture rate via CDP. Each frame is a JPEG screenshot.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

export const FPS = 30;
const FRAME_MS = 1000 / FPS;

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24"><path d="M4.5 2.8l14.6 8.4c.7.4.6 1.4-.2 1.6l-6 1.5-3 5.6c-.4.7-1.4.6-1.6-.2L4.5 2.8z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

export async function openApp({ base = "http://localhost:3217", url = "/", width = 1440, height = 810, scale = 1.5 } = {}) {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.clock.install();
  await page.goto(base + url, { waitUntil: "load" });
  await page.waitForTimeout(7000); // boot on natural time: map style, workers, fonts
  // pause the fake clock where it is: it has flowed with real time so far, so performance.now() and the document
  // animation timeline agree, and the frame loop below keeps them locked together
  const fakeNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(fakeNow + 1000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Animation.enable");
  await page.addStyleTag({
    content: `#rec-cursor{position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;transform-origin:4px 3px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45));transition:none!important}
#rec-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid rgba(255,255,255,.9);z-index:2147483646;pointer-events:none;opacity:0}`,
  });
  await page.evaluate((svg) => {
    const c = document.createElement("div");
    c.id = "rec-cursor";
    c.innerHTML = svg;
    c.style.opacity = "0";
    document.body.appendChild(c);
    const r = document.createElement("div");
    r.id = "rec-ripple";
    document.body.appendChild(r);
  }, CURSOR_SVG);
  // this machine cannot reach Mapbox, so the app shows a basemap-failure toast; it is about the recording machine's
  // network, not the plans, so keep it out of the footage (the basemap switcher still reads "Offline")
  await page.evaluate(() => {
    const hide = () =>
      document.querySelectorAll('[role="status"]').forEach((e) => {
        if (/Basemap unavailable/.test(e.textContent ?? "")) e.style.display = "none";
      });
    new MutationObserver(hide).observe(document.body, { subtree: true, childList: true });
    hide();
  });
  return new Recorder(browser, page, cdp, width, height);
}

export class Recorder {
  constructor(browser, page, cdp, width, height) {
    Object.assign(this, { browser, page, cdp, width, height });
    this.cursor = { x: width * 0.6, y: height * 0.6, visible: false, press: 0 };
    this.ripple = null;
    this.dir = null;
    this.n = 0;
    this.lastReal = 400;
  }

  /** Let the app settle on virtual time without recording (e.g. between clips). */
  async settle(ms) {
    for (let t = 0; t < ms; t += 100) await this.page.clock.runFor(100);
    await this.page.waitForTimeout(300);
  }

  start(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.n = 0;
  }

  async drawCursor() {
    const { x, y, visible, press } = this.cursor;
    const rp = this.ripple;
    return await this.page.evaluate(
      ({ x, y, visible, press, rp }) => {
        const c = document.getElementById("rec-cursor");
        if (c) {
          c.style.opacity = visible ? "1" : "0";
          c.style.transform = `translate(${x - 4}px, ${y - 3}px) scale(${1 - press * 0.18})`;
        }
        const r = document.getElementById("rec-ripple");
        if (r) {
          if (rp) {
            r.style.left = rp.x + "px";
            r.style.top = rp.y + "px";
            r.style.opacity = String(Math.max(0, 1 - rp.t));
            r.style.transform = `scale(${0.4 + rp.t * 1.4})`;
          } else r.style.opacity = "0";
        }
        return { fake: performance.now(), doc: document.timeline.currentTime ?? 0 };
      },
      { x, y, visible, press, rp },
    );
  }

  /** Advance one frame of virtual time and capture it. */
  async frame() {
    const t0 = Date.now();
    await this.page.clock.runFor(FRAME_MS);
    if (this.ripple) {
      this.ripple.t += FRAME_MS / 450;
      if (this.ripple.t >= 1) this.ripple = null;
    }
    const clocks = await this.drawCursor();
    if (this.dir) {
      await this.page.screenshot({ path: path.join(this.dir, `f${String(this.n).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
      this.n++;
    }
    // CSS/WAAPI animations run on the document timeline, not the fake clock: steer its playback rate so that by the
    // next frame it has caught up with where the fake clock will be (closed loop, so drift never accumulates)
    const target = clocks.fake + FRAME_MS - clocks.doc;
    const rate = Math.max(0.001, Math.min(4, target / Math.max(this.lastReal, 50)));
    await this.cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
    this.lastReal = Date.now() - t0;
  }

  async hold(seconds) {
    const n = Math.round(seconds * FPS);
    for (let i = 0; i < n; i++) await this.frame();
  }

  showCursor(v = true) {
    this.cursor.visible = v;
  }

  /** Glide the cursor to (x, y) over `seconds` with an ease-in-out curve. */
  async moveTo(x, y, seconds = 0.8) {
    const sx = this.cursor.x, sy = this.cursor.y;
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // slight arc so motion reads as a hand, not a robot
      const arc = Math.sin(Math.PI * t) * Math.min(40, Math.hypot(x - sx, y - sy) * 0.08);
      this.cursor.x = sx + (x - sx) * e;
      this.cursor.y = sy + (y - sy) * e - arc;
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.frame();
    }
  }

  async click(x, y, { move = 0.8 } = {}) {
    if (x !== undefined) await this.moveTo(x, y, move);
    for (const p of [0.5, 1]) {
      this.cursor.press = p;
      await this.frame();
    }
    await this.page.mouse.click(this.cursor.x, this.cursor.y);
    this.ripple = { x: this.cursor.x, y: this.cursor.y, t: 0 };
    for (const p of [0.6, 0.2, 0]) {
      this.cursor.press = p;
      await this.frame();
    }
  }

  async center(locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error("no bounding box for " + locator);
    return [b.x + b.width / 2, b.y + b.height / 2];
  }

  async clickOn(locator, opts) {
    const [x, y] = await this.center(locator);
    await this.click(x, y, opts);
  }

  /** Smoothly scroll a scrollable element (CSS selector) by dy pixels. */
  async scroll(selector, dy, seconds = 1.2) {
    const start = await this.page.evaluate((s) => document.querySelector(s)?.scrollTop ?? 0, selector);
    const n = Math.round(seconds * FPS);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      await this.page.evaluate(({ s, y }) => { const el = document.querySelector(s); if (el) el.scrollTop = y; }, { s: selector, y: start + dy * e });
      await this.frame();
    }
  }

  async close() {
    await this.browser.close();
  }
}

/** Encode a frame directory to an H.264 clip. */
export async function encode(dir, out, { fps = FPS } = {}) {
  const { execFileSync } = await import("node:child_process");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(fps), "-i", path.join(dir, "f%05d.jpg"),
    "-vf", "scale=1920:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", out]);
}
