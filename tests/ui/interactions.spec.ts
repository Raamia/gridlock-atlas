import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Interaction scenarios: every control a judge is likely to touch during the demo.
 * Role-based selectors first; `data-match-id` is the queue's stable card hook.
 *
 * Regression tests for app defects found on 2026-09-26 (they assert the intended behavior and fail until fixed):
 * radius reply race, demo Finish under the brief, demo radius, overview chip count, filtered empty state,
 * engine failure message, 3D overview tilt, reviewer note on Escape, sources "no match" state.
 */

const SE_PAIR = "desc-6888__gpc-20065"; // top Savannah River lead: DESC Deerfield × Georgia Power Goshen–McIntosh rebuild

type MapHandle = {
  getPitch: () => number;
  getCenter: () => { lng: number; lat: number };
  isStyleLoaded: () => boolean;
  loaded: () => boolean;
  getStyle: () => { layers: { id: string }[] };
  getSource: (id: string) => { serialize: () => { data: { features: unknown[] } } } | undefined;
};

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function compare(page: Page) {
  await page.getByRole("button", { name: /Compare public plans/ }).click();
  await expect(page.locator("[data-match-id]").first()).toBeVisible({ timeout: 15_000 });
}

const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

async function tabCount(t: Locator): Promise<number> {
  const text = (await t.textContent()) ?? "";
  const m = text.match(/(\d+)\s*$/);
  if (!m) throw new Error(`no count in tab text: ${text}`);
  return Number(m[1]);
}

async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /Filters & review radius/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.getByRole("slider", { name: "Review radius" })).toBeVisible();
}

async function mapReady(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as { __map?: MapHandle }).__map;
    return !!m && m.isStyleLoaded() && m.getStyle().layers.some((l) => l.id === "gl-centers");
  }, null, { timeout: 30_000 });
}

async function pairLayerState(page: Page) {
  return page.evaluate(() => {
    const m = (window as unknown as { __map: MapHandle }).__map;
    const n = (id: string) => m.getSource(id)?.serialize().data.features.length ?? -1;
    return {
      centers: n("gl-centers"),
      connector: n("gl-connector"),
      markers: document.querySelectorAll(".mapboxgl-marker").length,
      layers: m.getStyle().layers.filter((l) => l.id.startsWith("gl-")).length,
    };
  });
}

async function openPair(page: Page, id: string) {
  await page.goto(`/?pair=${id}`);
  const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
  await expect(inspector).toBeVisible({ timeout: 20_000 });
  return inspector;
}

test.describe("interactions", () => {
  test("review radius slider re-runs the engine and changes the counts", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await compare(page);
    const needs = tab(page, /^Needs review/);
    const at25 = await tabCount(needs);
    expect(at25).toBeGreaterThan(0);

    await openFilters(page);
    const slider = page.getByRole("slider", { name: "Review radius" });
    const queue = page.getByRole("complementary", { name: "Coordination queue" });

    const req5 = page.waitForRequest((r) => r.url().includes("/api/matches?threshold=5"));
    await slider.focus();
    await page.keyboard.press("Home");
    await req5;
    await expect(queue).toContainText("· 5 mi");
    await expect.poll(() => tabCount(needs)).toBeLessThan(at25);
    const at5 = await tabCount(needs);

    const req100 = page.waitForRequest((r) => r.url().includes("/api/matches?threshold=100"));
    await page.keyboard.press("End");
    await req100;
    await expect(queue).toContainText("· 100 mi");
    await expect.poll(() => tabCount(needs)).toBeGreaterThan(at25);

    // the radius sticks through a manual re-run
    await page.getByRole("button", { name: "Re-run comparison" }).click();
    await expect(queue).toContainText("· 100 mi", { timeout: 10_000 });
    expect(at5).toBeLessThan(at25);
    expect(errors).toEqual([]);
  });

  test("a faster reply to an older radius never overwrites the newest radius", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    await openFilters(page);
    // make the 100 mi run slow (as a larger run would be on a real server) so it resolves after the 5 mi run
    await page.route(/\/api\/matches\?threshold=100/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const slider = page.getByRole("slider", { name: "Review radius" });
    await slider.focus();
    await page.keyboard.press("End"); // 100 mi
    await page.waitForTimeout(300); // past the 180 ms debounce: the 100 mi request is in flight
    await page.keyboard.press("Home"); // 5 mi
    await page.waitForTimeout(2500);
    await expect(slider).toHaveValue("5");
    const queue = page.getByRole("complementary", { name: "Coordination queue" });
    await expect(queue).toContainText("· 5 mi");
  });

  test("signal chips and the utility filter narrow the queue; empty states render", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    const needs = tab(page, /^Needs review/);
    const possible = tab(page, /^Possible/);
    const n0 = await tabCount(needs);
    const p0 = await tabCount(possible);
    expect(n0).toBeGreaterThan(0);
    expect(p0).toBeGreaterThan(0);

    await openFilters(page);
    await page.getByRole("button", { name: "PLACE CONFIRMED" }).click();
    await expect(page.getByRole("button", { name: "PLACE CONFIRMED" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => tabCount(needs)).toBeLessThan(n0);
    if ((await tabCount(needs)) === 0) await expect(page.getByText("No open review leads")).toBeVisible();

    await page.getByRole("button", { name: "PLACE POSSIBLE" }).click();
    await expect.poll(() => tabCount(possible)).toBe(0);
    await possible.click();
    await expect(possible).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Nothing only-possible")).toBeVisible();
    await expect(page.locator("[data-match-id]")).toHaveCount(0);

    // restore, then narrow by utility across all regions
    await page.getByRole("button", { name: "PLACE CONFIRMED" }).click();
    await page.getByRole("button", { name: "PLACE POSSIBLE" }).click();
    await expect.poll(() => tabCount(needs)).toBe(n0);
    await page.getByRole("navigation", { name: "Region" }).getByRole("button", { name: "All" }).click();
    await tab(page, /^Known/).click();
    const knownAll = await tabCount(tab(page, /^Known/));
    await page.getByLabel("Utility").selectOption({ label: "Dairyland Power Cooperative" });
    await expect.poll(() => tabCount(tab(page, /^Known/))).toBeLessThan(knownAll);
    const cards = page.locator("[data-match-id]");
    // wait for the exit animation of the previous tab's cards to finish
    await expect(cards).toHaveCount(await tabCount(tab(page, /^Known/)));
    await expect(cards.first()).toBeVisible();
    for (const t of await cards.allTextContents()) expect(t).toContain("Dairyland");
    await page.getByLabel("Utility").selectOption({ label: "All utilities" });
    await expect.poll(() => tabCount(tab(page, /^Known/))).toBe(knownAll);
  });

  test("tabs switch and each empty category explains itself", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    const known = tab(page, /^Known/);
    await known.click();
    await expect(known).toHaveAttribute("aria-selected", "true");
    if ((await tabCount(known)) === 0) await expect(page.getByText("No documented coordination")).toBeVisible();

    const conflicts = tab(page, /^Conflicts/);
    await conflicts.click();
    await expect(conflicts).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-match-id]")).toHaveCount(await tabCount(conflicts));

    // Southern Plains has only a known-coordination pair: Needs review is an honest empty state
    await page.getByRole("navigation", { name: "Region" }).getByRole("button", { name: "Southern Plains" }).click();
    const needs = tab(page, /^Needs review/);
    await needs.click();
    await expect.poll(() => tabCount(needs)).toBe(0);
    await expect(page.getByText("No open review leads")).toBeVisible();
    await known.click();
    await expect(page.locator("[data-match-id]")).toHaveCount(await tabCount(known));
    expect(await tabCount(known)).toBeGreaterThan(0);
  });

  test("reviewer mode: label, timer, excerpt check, exports, persistence", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("gridlock-review-v1"));
    const inspector = await openPair(page, SE_PAIR);

    await page.getByRole("button", { name: "Reviewer mode", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reviewer mode on" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toContainText("Reviewer label");
    const timer = inspector.getByLabel("Time on this pair");
    const t0 = (await timer.textContent())?.trim();
    await expect.poll(async () => (await timer.textContent())?.trim(), { timeout: 5000 }).not.toBe(t0);

    const worth = inspector.getByRole("button", { name: "Worth planner review" });
    await worth.click();
    await expect(worth).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toContainText("Saved in this browser");

    const mark = inspector.getByRole("button", { name: "Mark checked" }).first();
    await mark.click();
    await expect(inspector.getByRole("button", { name: "✓ checked" }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toContainText("checked by you");

    await page.getByRole("button", { name: /^Method$/ }).click();
    const drawer = page.getByRole("dialog", { name: "Method & audit" });
    await expect(drawer).toContainText(/1\s*pairs labeled/);
    await expect(drawer).toContainText(/1\s*excerpts human-checked/);
    const csvBtn = drawer.getByRole("button", { name: "Labels CSV" });
    const jsonBtn = drawer.getByRole("button", { name: "review-log.json" });
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    const [csv] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const csvText = Buffer.concat(await (await csv.createReadStream()).toArray()).toString("utf8");
    expect(csvText.split("\n")[0]).toContain("match_id");
    expect(csvText).toContain(SE_PAIR);
    expect(csvText).toContain("worth-review");
    const [json] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
    expect(json.suggestedFilename()).toBe("review-log.json");
    const log = JSON.parse(Buffer.concat(await (await json.createReadStream()).toArray()).toString("utf8"));
    expect(log.reviewedEvidenceIds).toHaveLength(1);

    // persistence: labels and checks survive a reload
    await page.reload();
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Method$/ }).click();
    await expect(drawer).toContainText(/1\s*pairs labeled/);
    await expect(drawer).toContainText(/1\s*excerpts human-checked/);
    await drawer.getByRole("button", { name: /Turn on reviewer mode/ }).click();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(inspector.getByRole("button", { name: "Worth planner review" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toContainText("checked by you");
    expect(errors).toEqual([]);
  });

  test("basemap switches keep the selected pair on the map", async ({ page }) => {
    const errors = trackErrors(page);
    await openPair(page, SE_PAIR);
    await mapReady(page);
    await expect.poll(async () => (await pairLayerState(page)).centers).toBe(2);
    const before = await pairLayerState(page);
    expect(before.markers).toBeGreaterThanOrEqual(3);

    const basemap = page.getByRole("group", { name: "Basemap" });
    for (const name of ["Satellite", "Offline", "Night"]) {
      await basemap.getByRole("button", { name, exact: true }).click();
      await expect(basemap.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(400);
      await mapReady(page);
      await expect.poll(async () => (await pairLayerState(page)).centers, { message: `${name}: pair centers` }).toBe(2);
      const s = await pairLayerState(page);
      expect(s.connector, `${name}: connector`).toBe(1);
      expect(s.markers, `${name}: labels`).toBe(before.markers);
      await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("3D / Flat toggle changes the camera pitch", async ({ page }) => {
    await openPair(page, SE_PAIR);
    await mapReady(page);
    const pitch = () => page.evaluate(() => (window as unknown as { __map: MapHandle }).__map.getPitch());
    const perspective = page.getByRole("group", { name: "Map perspective" });
    await expect(perspective.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(pitch, { timeout: 8000 }).toBeGreaterThan(40);

    await perspective.getByRole("button", { name: "Flat map" }).click();
    await expect(perspective.getByRole("button", { name: "Flat map" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(pitch, { timeout: 8000 }).toBeLessThan(1);

    await perspective.getByRole("button", { name: "3D" }).click();
    await expect.poll(pitch, { timeout: 8000 }).toBeGreaterThan(40);
  });

  test("region switcher moves the queue, focus chip and camera", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await compare(page);
    await mapReady(page);
    const nav = page.getByRole("navigation", { name: "Region" });
    await expect(nav.getByRole("button", { name: /Savannah River/ })).toHaveAttribute("aria-pressed", "true");

    await page.locator(`[data-match-id]`).first().click();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible();

    await nav.getByRole("button", { name: "Upper Midwest" }).click();
    await expect(nav.getByRole("button", { name: "Upper Midwest" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeHidden();
    await expect(page.getByText("Overview", { exact: true })).toBeVisible();
    await expect.poll(() => tabCount(tab(page, /^Known/))).toBeGreaterThan(0);
    await page.waitForTimeout(2200);
    const c = await page.evaluate(() => (window as unknown as { __map: MapHandle }).__map.getCenter());
    expect(c.lat).toBeGreaterThan(40); // Wisconsin / Minnesota, not the Savannah River
    expect(errors).toEqual([]);
  });

  test("deep link opens a Southeast pair and Copy link returns the same URL", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const inspector = await openPair(page, SE_PAIR);
    await expect(page.locator(`[data-match-id="${SE_PAIR}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("navigation", { name: "Region" }).getByRole("button", { name: /Savannah River/ })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toContainText("Georgia Power");
    await expect(inspector).toContainText("Dominion Energy South Carolina");
    await expect(page).toHaveURL(new RegExp(`pair=${SE_PAIR}`));

    const link = inspector.getByRole("button", { name: /^Link$/ });
    await link.click();
    await expect(inspector.getByRole("button", { name: /Copied/ })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copied).searchParams.get("pair")).toBe(SE_PAIR);

    // the copied link reproduces the view in a fresh page
    const fresh = await context.newPage();
    await fresh.goto(copied);
    await expect(fresh.getByRole("complementary", { name: "Evidence inspector" })).toContainText("Georgia Power", { timeout: 20_000 });
    await fresh.close();
  });

  test("guided demo runs all eight steps without page errors", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await expect(demo).toContainText("1/8");
    const inspector = page.getByRole("complementary", { name: "Evidence inspector" });

    const expectations: Record<number, () => Promise<void>> = {
      2: async () => expect(page.locator("[data-match-id]").first()).toBeVisible({ timeout: 15_000 }),
      3: async () => expect(inspector).toContainText("Where they meet", { timeout: 15_000 }),
      4: async () => expect(inspector).toContainText("When they build"),
      5: async () => expect(inspector).toContainText("Rough impact estimate"),
      6: async () => expect(inspector).toContainText("Alma-Blair", { timeout: 15_000 }),
      7: async () => expect(inspector).toContainText("Sources disagree"),
      8: async () => expect(page.getByRole("dialog", { name: "Review brief" })).toBeVisible({ timeout: 15_000 }),
    };
    for (let step = 2; step <= 8; step++) {
      await demo.getByRole("button", { name: /^Next/ }).click();
      await expect(demo).toContainText(`${step}/8`);
      await expectations[step]();
    }
    expect(errors).toEqual([]);
  });

  test("guided demo: the last step's Finish button is clickable while the brief is shown", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await demo.getByRole("button", { name: "Go to step 8" }).click();
    await expect(page.getByRole("dialog", { name: "Review brief" })).toBeVisible({ timeout: 15_000 });
    // one click on Finish ends the demo (today the brief's backdrop sits on top of the demo card)
    await demo.getByRole("button", { name: "Finish" }).click({ timeout: 3000 });
    await expect(demo).toBeHidden();
  });

  test("guided demo narrates a 25 mi run even after the radius was changed", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    await openFilters(page);
    await page.getByRole("slider", { name: "Review radius" }).focus();
    await page.keyboard.press("End");
    const queue = page.getByRole("complementary", { name: "Coordination queue" });
    await expect(queue).toContainText("· 100 mi");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await demo.getByRole("button", { name: /^Next/ }).click();
    await expect(demo).toContainText("within 25 miles");
    await expect(queue).toContainText("· 25 mi", { timeout: 10_000 });
  });

  test("overview chip counts the candidate pairs of the region on screen", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    const n = (await tabCount(tab(page, /^Needs review/))) + (await tabCount(tab(page, /^Known/))) + (await tabCount(tab(page, /^Possible/)));
    const chip = page.getByText(/candidate pairs/);
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(`${n} candidate pairs`);
  });

  test("an empty queue caused by a filter says so instead of calling it an honest result", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    await openFilters(page);
    await page.getByLabel("Utility").selectOption({ label: "Dairyland Power Cooperative" });
    await page.getByRole("button", { name: /Filters & review radius/ }).click(); // collapse, as a presenter would
    const list = page.getByRole("complementary", { name: "Coordination queue" }).getByRole("list");
    await expect.poll(() => tabCount(tab(page, /^Needs review/))).toBe(0);
    await expect(list).toContainText("No open review leads");
    await expect(list).not.toContainText("honest result");
    await expect(list).toContainText(/filter/i);
  });

  test("an engine failure is reported instead of silently returning to the start screen", async ({ page }) => {
    await page.route(/\/api\/matches/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/");
    await page.getByRole("button", { name: /Compare public plans/ }).click();
    await expect(page.getByText(/Engine request failed|Engine unavailable|could not|failed/i)).toBeVisible({ timeout: 5000 });
  });

  test("3D toggle tilts the overview map, not only a selected pair", async ({ page }) => {
    await page.goto("/");
    await mapReady(page);
    const pitch = () => page.evaluate(() => (window as unknown as { __map: MapHandle }).__map.getPitch());
    const perspective = page.getByRole("group", { name: "Map perspective" });
    await perspective.getByRole("button", { name: "Flat map" }).click();
    await expect.poll(pitch, { timeout: 5000 }).toBeLessThan(1);
    await perspective.getByRole("button", { name: "3D" }).click();
    await expect(perspective.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(pitch, { timeout: 5000 }).toBeGreaterThan(20);
  });

  test("reviewer note survives closing the inspector with Escape", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("gridlock-review-v1"));
    const inspector = await openPair(page, SE_PAIR);
    await page.getByRole("button", { name: "Reviewer mode", exact: true }).click();
    await inspector.getByRole("button", { name: "Worth planner review" }).click();
    const note = inspector.getByRole("textbox", { name: "Reviewer note" });
    await note.fill("check McIntosh outage window");
    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gridlock-review-v1") ?? "{}"));
    expect(saved.labels?.[SE_PAIR]?.note).toBe("check McIntosh outage window");
  });

  test("sources drawer filter narrows the registry and reports no matches", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Source registry/ }).click();
    const drawer = page.getByRole("dialog", { name: "Source registry" });
    await expect(drawer).toBeVisible();
    const rows = drawer.locator('a[href^="http"]');
    const all = await rows.count();
    expect(all).toBeGreaterThan(5);

    const filter = drawer.getByPlaceholder("Filter sources");
    await filter.fill("psc");
    await expect.poll(() => rows.count()).toBeLessThan(all);
    expect(await rows.count()).toBeGreaterThan(0);
    for (const t of await rows.evaluateAll((as) => as.map((a) => `${a.textContent} ${(a as HTMLAnchorElement).href}`.toLowerCase()))) expect(t).toContain("psc");

    await filter.fill("zzzz-no-such-source");
    await expect(rows).toHaveCount(0);
    await expect(drawer.getByText(/No sources match/i)).toBeVisible();

    await filter.fill("");
    await expect(rows).toHaveCount(all);
  });
});
