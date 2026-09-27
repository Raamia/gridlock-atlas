import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Interaction scenarios: every control a judge is likely to touch during the demo.
 * Role-based selectors first; `data-match-id` is the queue's stable card hook.
 *
 * Regression tests for app defects found on 2026-09-26 (they assert the intended behavior and fail until fixed):
 * radius reply race, demo Finish under the brief, demo radius, headline flagged count (was the overview chip), filtered empty state,
 * engine failure message, 3D overview tilt, reviewer note on Escape, sources "no match" state, brief print,
 * demo card vs inspector, demo step 1 reset and tabs, demo keys behind a drawer, demo focus on start,
 * demo exit during a pending step, deep links at a non-default radius, keyboard presenter through Finish,
 * phone demo map strip, touch tap on a project dot.
 */

const SE_PAIR = "desc-06367-d-g__gpc-20065"; // top Savannah River lead: DESC Jasper – Okatie #2 × Georgia Power Goshen–McIntosh rebuild (Sperry's OVL_3)

type MapHandle = {
  getPitch: () => number;
  getCenter: () => { lng: number; lat: number };
  isStyleLoaded: () => boolean;
  loaded: () => boolean;
  isMoving: () => boolean;
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

/** Secondary controls are disclosed on demand so the queue stays scannable. */
async function radiusShown(page: Page) {
  const slider = page.getByRole("slider", { name: "Review radius" });
  if (!(await slider.isVisible())) await queue(page).getByRole("button", { name: /^Review radius/ }).click();
  await expect(slider).toBeVisible();
}

const queue = (page: Page) => page.getByRole("complementary", { name: "Coordination queue" });
/** The list's rows (the queue's cards; map chips and other surfaces never count). */
const cards = (page: Page) => queue(page).getByRole("list").locator("[data-match-id]");
/** Timing chips: "Schedules overlap / May overlap / Timing unknown / No overlap", each ending in its tab-scoped count. */
const timingChip = (page: Page, name: RegExp) => page.getByRole("group", { name: "Timing" }).getByRole("button", { name });
const disputedChip = (page: Page) => queue(page).getByRole("button", { name: /^Dates revised or disputed/ });

async function filtersShown(page: Page) {
  const group = page.getByRole("group", { name: "Timing" });
  if (!(await group.isVisible())) await queue(page).getByRole("button", { name: /^Filters/ }).click();
  await expect(group).toBeVisible();
}

async function cardIds(page: Page): Promise<string[]> {
  return cards(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.matchId ?? ""));
}

/** The engine's own answer at 25 mi, to check what a filter lets through. */
async function run25(page: Page) {
  const body = (await (await page.request.get("/api/matches?threshold=25")).json()) as { matches: { id: string; time: string; conflicts: unknown[] }[] };
  return new Map(body.matches.map((m) => [m.id, m]));
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

    await radiusShown(page);
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
    await radiusShown(page);
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

  test("timing chips and the utility filter narrow the queue; empty states render", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    await filtersShown(page);
    const engine = await run25(page);
    const needs = tab(page, /^Needs review/);
    const possible = tab(page, /^Possible/);
    const n0 = await tabCount(needs);
    const p0 = await tabCount(possible);
    expect(n0).toBeGreaterThan(0);
    expect(p0).toBeGreaterThan(0);

    const schedules = timingChip(page, /^Schedules overlap/);
    const may = timingChip(page, /^May overlap/);
    const unknown = timingChip(page, /^Timing unknown/);
    const none = timingChip(page, /^No overlap/);
    // none pressed = every pair; the four counts are the tab's facets and add up to it
    for (const c of [schedules, may, unknown, none]) await expect(c).toHaveAttribute("aria-pressed", "false");
    let sum = 0;
    for (const c of [schedules, may, unknown, none]) sum += await tabCount(c);
    expect(sum).toBe(n0);

    // one chip: only that timing, exactly the chip's count
    const kSched = await tabCount(schedules);
    expect(kSched).toBeGreaterThan(0);
    expect(kSched).toBeLessThan(n0);
    await schedules.click();
    await expect(schedules).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tabCount(needs)).toBe(kSched);
    await expect(cards(page)).toHaveCount(kSched);
    for (const id of await cardIds(page)) expect(engine.get(id)?.time, id).toBe("confirmed");

    // chips are independent toggles: a second one adds its pairs
    const kNone = await tabCount(none);
    await none.click();
    await expect(none).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tabCount(needs)).toBe(kSched + kNone);
    await expect(cards(page)).toHaveCount(kSched + kNone);
    for (const id of await cardIds(page)) expect(["confirmed", "no-match"]).toContain(engine.get(id)?.time);

    // the other tabs count through the same filters
    await expect.poll(() => tabCount(possible)).toBeLessThan(p0);
    await possible.click();
    await expect(possible).toHaveAttribute("aria-selected", "true");
    await expect(cards(page)).toHaveCount(await tabCount(possible));
    for (const id of await cardIds(page)) expect(["confirmed", "no-match"]).toContain(engine.get(id)?.time);

    // Clear restores every pair
    await queue(page).getByRole("button", { name: "Clear", exact: true }).click();
    for (const c of [schedules, none]) await expect(c).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => tabCount(possible)).toBe(p0);
    await expect.poll(() => tabCount(needs)).toBe(n0);

    // narrow by utility across all regions (options are region-scoped: Dairyland is a Midwest utility)
    await page.getByRole("navigation", { name: "Region" }).getByRole("button", { name: "All" }).click();
    await tab(page, /^Known/).click();
    const knownAll = await tabCount(tab(page, /^Known/));
    // a timing with no pair in this tab can't be chosen
    await expect(schedules).toBeDisabled();
    await page.getByLabel("Utility").selectOption({ label: "Dairyland Power Cooperative" });
    await expect.poll(() => tabCount(tab(page, /^Known/))).toBeLessThan(knownAll);
    // wait for the exit animation of the previous tab's cards to finish
    await expect(cards(page)).toHaveCount(await tabCount(tab(page, /^Known/)));
    await expect(cards(page).first()).toBeVisible();
    for (const t of await cards(page).allTextContents()) expect(t).toContain("Dairyland");
    await page.getByLabel("Utility").selectOption({ label: "All utilities" });
    await expect.poll(() => tabCount(tab(page, /^Known/))).toBe(knownAll);
  });

  test("tabs switch, the dates-revised-or-disputed chip narrows the list, and each empty category explains itself", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    await filtersShown(page);
    const engine = await run25(page);
    const known = tab(page, /^Known/);
    await known.click();
    await expect(known).toHaveAttribute("aria-selected", "true");
    if ((await tabCount(known)) === 0) {
      await expect(page.getByText("No documented coordination")).toBeVisible();
      // …and points to the regions that do have documented interfaces
      await expect(queue(page).getByRole("button", { name: /Show them/ })).toBeVisible();
    }

    // the retired Conflicts tab is the "Dates revised or disputed" chip: pairs with any date conflict, in every tab
    const needs = tab(page, /^Needs review/);
    await needs.click();
    await expect(needs).toHaveAttribute("aria-selected", "true");
    const n0 = await tabCount(needs);
    const disputed = disputedChip(page);
    const k = await tabCount(disputed);
    expect(k).toBeGreaterThan(0);
    await disputed.click();
    await expect(disputed).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tabCount(needs)).toBe(k);
    await expect(cards(page)).toHaveCount(k);
    for (const id of await cardIds(page)) expect(engine.get(id)?.conflicts.length, id).toBeGreaterThan(0);
    await disputed.click();
    await expect(disputed).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => tabCount(needs)).toBe(n0);

    // Southern Plains has only a known-coordination pair: Needs review is an honest empty state
    await page.getByRole("navigation", { name: "Region" }).getByRole("button", { name: "Southern Plains" }).click();
    await needs.click();
    await expect.poll(() => tabCount(needs)).toBe(0);
    await expect(page.getByText("No open review leads")).toBeVisible();
    await known.click();
    await expect(cards(page)).toHaveCount(await tabCount(known));
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
    await expect(drawer).toContainText(/1\s*pair labeled/);
    await expect(drawer).toContainText(/1\s*excerpt human-checked/);
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
    await expect(drawer).toContainText(/1\s*pair labeled/);
    await expect(drawer).toContainText(/1\s*excerpt human-checked/);
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
    for (const name of ["Satellite", "Offline", "Dusk"]) {
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

  test("region switcher moves the queue, headline and camera", async ({ page }) => {
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
    await expect(page).not.toHaveURL(/pair=/);
    await expect.poll(() => tabCount(tab(page, /^Known/))).toBeGreaterThan(0);
    // the headline counts the new region's pairs (the old Overview chip is gone)
    const n = (await tabCount(tab(page, /^Needs review/))) + (await tabCount(tab(page, /^Known/))) + (await tabCount(tab(page, /^Possible/)));
    await expect(queue(page).getByText(`${n} pairs flagged`, { exact: true })).toBeVisible();
    // a shared facility is a zero-mile closest approach: every Midwest pair is inside 25 mi
    await expect(queue(page)).toContainText(new RegExp(`${n}\\s*within Sperry.s 25 miles`));
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
    await radiusShown(page);
    await page.getByRole("slider", { name: "Review radius" }).focus();
    await page.keyboard.press("End");
    const queue = page.getByRole("complementary", { name: "Coordination queue" });
    await expect(queue).toContainText("· 100 mi");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await demo.getByRole("button", { name: /^Next/ }).click();
    await expect(demo).toContainText("2/8");
    // the step on screen (every step's text stays in the card's DOM; #demo-body is the current one)
    await expect(demo.locator("#demo-body")).toContainText("within 25 miles");
    await expect(queue).toContainText("· 25 mi", { timeout: 10_000 });
    await expect(page.getByRole("slider", { name: "Review radius" })).toHaveValue("25");
  });

  test("guided demo: Next stays clear of the evidence inspector on a 1024px laptop", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await demo.getByRole("button", { name: "Go to step 5" }).click();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toContainText("Rough impact estimate", { timeout: 15_000 });
    await page.waitForTimeout(600);
    const box = (await demo.getByRole("button", { name: /^Next/ }).boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "", [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toMatch(/Next/);
  });

  test("guided demo: step 1 starts from no comparison, and narrated pairs sit under their own tab", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    await radiusShown(page);
    await filtersShown(page);
    await page.getByRole("slider", { name: "Review radius" }).focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("complementary", { name: "Coordination queue" })).toContainText("· 100 mi");
    // a presenter's leftover list state: Possible tab, conflicts only, and a timing the narrated pairs don't have
    await tab(page, /^Possible/).click();
    await disputedChip(page).click();
    await timingChip(page, /^Schedules overlap/).click();
    await expect(disputedChip(page)).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await expect(page.getByRole("button", { name: /Compare public plans/ })).toBeVisible();
    await expect(page.locator("[data-match-id]")).toHaveCount(0);

    await demo.getByRole("button", { name: "Go to step 6" }).click();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toContainText("Alma-Blair", { timeout: 15_000 });
    await expect(tab(page, /^Known/)).toHaveAttribute("aria-selected", "true");
    // the narrated pair's row is in the list, selected: no leftover filter hides it
    await expect(page.locator('[data-match-id="dpc-alma-blair__xcel-wwtc"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-match-id="dpc-alma-blair__xcel-wwtc"]')).toBeVisible();
    await expect(disputedChip(page)).toHaveAttribute("aria-pressed", "false");
    await expect(timingChip(page, /^Schedules overlap/)).toHaveAttribute("aria-pressed", "false");
  });

  test("guided demo: arrow keys do not step the demo behind the Method drawer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await demo.getByRole("button", { name: "Go to step 3" }).click();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Method$/ }).click();
    await expect(page.getByRole("dialog", { name: "Method & audit" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(demo).toContainText("3/8");
    await expect(page.getByRole("dialog", { name: "Review brief" })).toHaveCount(0);
  });

  test("guided demo: Space right after starting advances the demo instead of exiting it", async ({ page }) => {
    await page.goto("/");
    await mapReady(page);
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    await expect(demo).toContainText("1/8");
    await expect(demo.getByRole("button", { name: /^Next/ })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(demo).toContainText("2/8");
    // the demo owns ← / →: the map's keyboard pan is off while it runs
    expect(await page.evaluate(() => (window as unknown as { __map: { keyboard: { isEnabled: () => boolean } } }).__map.keyboard.isEnabled())).toBe(false);
  });

  test("guided demo: a keyboard presenter finishes with Space, and never copies the brief", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await mapReady(page);
    await page.evaluate(() => navigator.clipboard.writeText("untouched"));
    await page.getByRole("button", { name: "Start guided demo" }).click();
    const demo = page.getByRole("region", { name: "Guided demo" });
    const brief = page.getByRole("dialog", { name: "Review brief" });
    const next = demo.getByRole("button", { name: /^Next/ });
    await expect(next).toBeFocused();

    // Previous disables itself on step 1: focus goes back to Next, not to <body>
    await page.keyboard.press("Space");
    await expect(demo).toContainText("2/8");
    await page.keyboard.press("Shift+Tab");
    await expect(demo.getByRole("button", { name: "Previous step" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(demo).toContainText("1/8");
    await expect(next).toBeFocused();

    for (let step = 2; step <= 8; step++) {
      await page.keyboard.press("Space");
      await expect(demo).toContainText(`${step}/8`);
    }
    await expect(brief).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400); // past the brief's own initial focus
    const finish = demo.getByRole("button", { name: "Finish" });
    await expect(finish).toBeFocused();
    // the card's buttons share the brief's Tab cycle
    await page.keyboard.press("Shift+Tab");
    await expect(demo.getByRole("button", { name: "Previous step" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(finish).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(brief.getByRole("button", { name: "Copy Markdown" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(finish).toBeFocused();

    await page.keyboard.press("Space");
    await expect(demo).toBeHidden();
    await expect(brief).toBeHidden();
    await expect(page.getByRole("button", { name: "Start guided demo" })).toBeFocused();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("untouched");
  });

  test("guided demo: leaving while a step waits for the engine drops that step", async ({ page }) => {
    await page.route(/\/api\/matches/, async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto("/");
    const demo = page.getByRole("region", { name: "Guided demo" });
    const inspector = page.getByRole("complementary", { name: "Evidence inspector" });

    // card X during step 8 (which would open the brief)
    await page.getByRole("button", { name: "Start guided demo" }).click();
    await demo.getByRole("button", { name: "Go to step 8" }).click();
    await demo.getByRole("button", { name: "Exit demo" }).click();
    await expect(demo).toBeHidden();
    await expect(page.getByRole("button", { name: "Start guided demo" })).toBeFocused();
    await page.waitForTimeout(2600);
    await expect(page.getByRole("dialog", { name: "Review brief" })).toHaveCount(0);
    await expect(inspector).toBeHidden();

    // top-bar Exit during step 3 (which would open the inspector)
    await page.getByRole("button", { name: "Start guided demo" }).click();
    await demo.getByRole("button", { name: "Go to step 3" }).click();
    await page.getByRole("button", { name: "Exit guided demo" }).click();
    await expect(demo).toBeHidden();
    await page.waitForTimeout(2600);
    await expect(inspector).toBeHidden();
    await expect(page).not.toHaveURL(/pair=/);
  });

  test("a deep link with &r= opens a pair flagged only at that radius; without it, the link says why", async ({ page, request }) => {
    const ids = async (r: number) => ((await (await request.get(`/api/matches?threshold=${r}`)).json()) as { matches: { id: string }[] }).matches.map((m) => m.id);
    const at25 = new Set(await ids(25));
    const pair = (await ids(40)).find((id) => !at25.has(id));
    expect(pair, "a pair flagged at 40 mi but not at 25 mi").toBeTruthy();

    const inspector = await openPair(page, `${pair}&r=40`);
    await expect(page.locator(`[data-match-id="${pair}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "Coordination queue" })).toContainText("· 40 mi");
    await expect(inspector).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("r")).toBe("40");
    expect(new URL(page.url()).searchParams.get("pair")).toBe(pair);

    // the same pair at the default radius: nothing opens, and a notice says why instead of failing silently
    await page.goto(`/?pair=${pair}`);
    const notice = page.getByRole("status").filter({ hasText: "not flagged at 25 mi" });
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeHidden();
    await expect.poll(() => new URL(page.url()).searchParams.has("pair")).toBe(false);
    await notice.getByRole("button", { name: "Dismiss notice" }).click();
    await expect(notice).toBeHidden();
  });

  test("the headline counts the region's flagged pairs once, and those within Sperry's 25 miles", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    const n = (await tabCount(tab(page, /^Needs review/))) + (await tabCount(tab(page, /^Known/))) + (await tabCount(tab(page, /^Possible/)));
    expect(n).toBe(137);
    // "{n} pairs flagged" appears exactly once on the page (the phone peek's copy is not rendered on desktop)
    const flagged = page.getByText(`${n} pairs flagged`, { exact: true });
    await expect(flagged).toBeVisible();
    await expect(flagged).toHaveCount(1);
    await expect(queue(page)).toContainText(/116\s*within Sperry.s 25 miles/);
    await expect(queue(page)).toContainText(/of 7,830 pairs checked/);
    // the 25 mi rows of the sponsor's overlap table are the headline's number
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Export overlap table as CSV" })).toContainText("116 rows");
    await page.keyboard.press("Escape");
  });

  test("an empty queue caused by a filter says so instead of calling it an honest result", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    // utility options are region-scoped: pick, across all regions, a utility with documented coordination only
    await page.getByRole("navigation", { name: "Region" }).getByRole("button", { name: "All" }).click();
    const needs = tab(page, /^Needs review/);
    await expect(needs).toHaveAttribute("aria-selected", "true");
    const n0 = await tabCount(needs);
    expect(n0).toBeGreaterThan(0);
    await page.getByLabel("Utility").selectOption({ label: "GridLiance Heartland" });
    const list = queue(page).getByRole("list");
    await expect.poll(() => tabCount(needs)).toBe(0);
    await expect(list).toContainText("No open review leads");
    await expect(list).not.toContainText("honest result");
    await expect(list).toContainText(/filter/i);
    await expect(list).toContainText(`${n0} pairs in this tab are hidden`);
    await list.getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(() => tabCount(needs)).toBe(n0);
    await expect(page.getByLabel("Utility")).toHaveValue("");
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

  test("Print / PDF of a review brief prints only the brief, on as many pages as it needs", async ({ page }) => {
    const inspector = await openPair(page, "dpc-alma-blair__xcel-wwtc");
    await inspector.getByRole("button", { name: /Create review brief/ }).click();
    const brief = page.getByRole("dialog", { name: "Review brief" });
    await expect(brief).toContainText("Review question");
    await page.waitForTimeout(500); // enter animation
    await page.emulateMedia({ media: "print" });
    // innerText follows the print stylesheet: the brief through its footer, none of the app shell around it
    const printed = await page.evaluate(() => document.body.innerText);
    expect(printed).toContain("Generated by GridLock Atlas");
    expect(printed).not.toContain("Coordination queue");
    expect(printed).not.toContain("Guided demo");
    await expect(page.getByRole("banner")).toBeHidden();

    // Chrome writes page objects and link annotations uncompressed
    const pdf = (await page.pdf({ format: "Letter" })).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0).toBeGreaterThan(1);
    const citations = await brief.locator("ol > li").count();
    expect(citations).toBeGreaterThan(5);
    expect(pdf.match(/\/URI\s*\(/g)?.length ?? 0).toBeGreaterThanOrEqual(citations);
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

  test.describe("phone", () => {
    test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

    test("guided demo keeps a strip of map for the pair between the card and the inspector sheet", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Start guided demo" }).click();
      const demo = page.getByRole("region", { name: "Guided demo" });
      const sheet = page.getByRole("complementary", { name: "Evidence inspector" });
      await expect(demo).toContainText("1/8");
      for (let step = 2; step <= 7; step++) {
        await demo.getByRole("button", { name: /^Next/ }).click();
        await expect(demo).toContainText(`${step}/8`);
        if (step < 3) {
          await expect(page.locator("[data-match-id]").first()).toBeVisible({ timeout: 15_000 });
          continue;
        }
        await expect(sheet).toBeVisible({ timeout: 15_000 });
        // once the camera and the callouts settle: at least 110 px of map between the card and the sheet, and the
        // pair's callouts all drawn inside that strip, on screen
        const strip = () =>
          page.evaluate(() => {
            const card = document.querySelector('[aria-label="Guided demo"]')!.getBoundingClientRect();
            const top = document.querySelector('aside[aria-label="Evidence inspector"]')!.getBoundingClientRect().top;
            const shown = [...document.querySelectorAll<HTMLElement>("[data-callout]")]
              .filter((c) => Number(getComputedStyle(c).opacity) > 0.1)
              .map((c) => c.getBoundingClientRect());
            const stray = shown.filter((r) => r.top < card.bottom - 1 || r.bottom > top + 1 || r.left < -1 || r.right > window.innerWidth + 1);
            const gap = Math.round(top - card.bottom);
            const moving = (window as unknown as { __map: MapHandle }).__map.isMoving();
            return { gap, moving, enough: gap >= 110, labels: shown.length >= 2, stray: stray.length };
          });
        await expect.poll(strip, { timeout: 10_000, message: `step ${step}` }).toMatchObject({ moving: false, enough: true, labels: true, stray: 0 });
      }
    });

    test("tapping a project dot shows its card", async ({ page }) => {
      await page.goto("/");
      await mapReady(page);
      await page.waitForTimeout(800);
      type Touchable = { getCanvas: () => HTMLCanvasElement; project: (c: [number, number]) => { x: number; y: number }; queryRenderedFeatures: (o: { layers: string[] }) => { properties: Record<string, unknown>; geometry: { coordinates: [number, number] } }[] };
      const pt = await page.evaluate(() => {
        const m = (window as unknown as { __map: Touchable }).__map;
        const canvas = m.getCanvas();
        const rect = canvas.getBoundingClientRect();
        for (const f of m.queryRenderedFeatures({ layers: ["gl-points"] })) {
          if (!f.properties.projectId) continue;
          const p = m.project(f.geometry.coordinates);
          const [x, y] = [rect.left + p.x, rect.top + p.y];
          if (document.elementFromPoint(x, y) === canvas) return { x, y };
        }
        return null;
      });
      expect(pt, "a plan dot on the visible map").toBeTruthy();
      await page.touchscreen.tap(pt!.x, pt!.y);
      const card = page.locator(".mapboxgl-popup");
      await expect(card).toBeVisible();
      await expect(card).not.toBeEmpty();
    });
  });
});
