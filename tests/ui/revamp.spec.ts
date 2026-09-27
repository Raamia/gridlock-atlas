import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Behaviours new in the UI revamp (SPEC v2): the Export menu, the proof button → Method "Proof at a glance", the
 * inspector's verdict line with Pair above / Pair below, the project focus chip, the 3D pair close-up, and Flat map
 * hiding the 3D scene. The kept behaviours (headline, timing chips, dates-revised chip …) live in interactions.spec.ts.
 */

const SE_PAIR = "desc-06367-d-g__gpc-20065"; // #01 in Savannah River Needs review: DESC Jasper – Okatie #2 × Georgia Power Goshen – McIntosh (Sperry's OVL_3)
const POSSIBLE_PAIR = "desc-6888__gpc-20065"; // a Savannah River possible lead: DESC Okatie – McIntosh × the same rebuild
const FEATURED = "dpc-alma-blair__xcel-wwtc"; // Upper Midwest, known coordination, official GIS routes

type MapHandle = {
  isStyleLoaded: () => boolean;
  getStyle: () => { layers: { id: string }[] };
  getLayoutProperty: (id: string, prop: string) => unknown;
  getCanvas: () => HTMLCanvasElement;
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

async function openPair(page: Page, id: string) {
  await page.goto(`/?pair=${id}`);
  const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
  await expect(inspector).toBeVisible({ timeout: 20_000 });
  return inspector;
}

async function mapReady(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as { __map?: MapHandle }).__map;
    return !!m && m.isStyleLoaded() && m.getStyle().layers.some((l) => l.id === "gl-centers");
  }, null, { timeout: 30_000 });
}

const queue = (page: Page) => page.getByRole("complementary", { name: "Coordination queue" });
const cards = (page: Page) => queue(page).getByRole("list").locator("[data-match-id]");
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

async function tabCount(t: Locator): Promise<number> {
  const text = (await t.textContent()) ?? "";
  const m = text.match(/(\d+)\s*$/);
  if (!m) throw new Error(`no count in: ${text}`);
  return Number(m[1]);
}

async function tabTotal(page: Page) {
  return (await tabCount(tab(page, /^Needs review/))) + (await tabCount(tab(page, /^Known/))) + (await tabCount(tab(page, /^Possible/)));
}

async function readDownload(page: Page, item: Locator) {
  const [dl] = await Promise.all([page.waitForEvent("download"), item.click()]);
  return { name: dl.suggestedFilename(), text: Buffer.concat(await (await dl.createReadStream()).toArray()).toString("utf8") };
}

test.describe("revamp", () => {
  test("Export menu: whole-region scope, every table downloads, the brief needs an open pair", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("gridlock-review-v1"));
    await page.reload();
    await compare(page);
    const flagged = await tabTotal(page);
    // a list filter that the export ignores
    await page.getByRole("button", { name: /^Dates revised or disputed/ }).click();
    await expect.poll(() => tabTotal(page)).toBeLessThan(flagged);
    const trigger = page.getByRole("button", { name: "Export", exact: true });
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Export" });
    await expect(menu).toBeVisible();
    // the menu says what it exports: the region at the run's radius, not the filtered list
    await expect(menu).toHaveAccessibleDescription(/25 mi · whole region — list filters not applied/);
    // nothing labelled or checked yet, no pair open: those items can't be chosen
    await expect(menu.getByRole("menuitem", { name: /Review brief/ })).toHaveAttribute("aria-disabled", "true");
    await expect(menu.getByRole("menuitem", { name: /Reviewer labels/ })).toHaveAttribute("aria-disabled", "true");
    await expect(menu.getByRole("menuitem", { name: /Human-check log/ })).toHaveAttribute("aria-disabled", "true");
    // a disabled item does nothing and leaves the menu open
    await menu.getByRole("menuitem", { name: /Review brief/ }).click({ force: true }); // aria-disabled: Playwright would wait for it to enable
    await expect(menu).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Review brief" })).toHaveCount(0);

    // every flagged pair of the region, whatever the list filters show: the sponsor's columns, one row per pair
    const all = await readDownload(page, menu.getByRole("menuitem", { name: /All flagged pairs/ }));
    await expect(menu).toBeHidden();
    expect(all.name).toMatch(/\.csv$/);
    expect(all.text.startsWith("\uFEFF")).toBe(true);
    const split = (r: string) => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, ""));
    const [head, ...lines] = all.text.replace(/^\uFEFF/, "").trim().split("\n");
    expect(head.startsWith("overlap_id,distance_mi,time_gap (day),utility_a,project_id_a,")).toBe(true);
    expect(head.endsWith(",pair_id,sponsor_rule,beyond_rule_reason")).toBe(true);
    const cols = head.split(",");
    const rows = lines.map(split);
    expect(rows).toHaveLength(flagged);
    const ids = new Set(rows.map((r) => r[cols.indexOf("pair_id")]));
    expect(ids.size).toBe(flagged);
    // pairs inside Sperry's rule keep their OVL id (the headline's 116); the rest are EXT_n, each with its reason
    const ext = rows.filter((r) => /^EXT_\d+$/.test(r[0]));
    expect(rows.filter((r) => /^OVL_\d+$/.test(r[0]))).toHaveLength(116);
    expect(ext).toHaveLength(flagged - 116);
    for (const r of ext) expect(r[cols.indexOf("beyond_rule_reason")], r[0]).not.toBe("");
    for (const id of await cards(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.matchId ?? ""))) expect(ids).toContain(id);

    // with a pair open the brief item opens its review brief
    await cards(page).first().click();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible();
    await trigger.click();
    const briefItem = page.getByRole("menuitem", { name: /Review brief/ });
    await expect(briefItem).not.toHaveAttribute("aria-disabled", "true");
    await briefItem.click();
    await expect(page.getByRole("dialog", { name: "Review brief" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the proof button opens Method at Proof at a glance; a Sperry chip opens Sperry's six rows today", async ({ page }) => {
    await page.goto("/");
    const proofName = /Reproduces Sperry.s worked example · 6\/6 overlap rows · 10\/10 project rows/;
    const method = page.getByRole("dialog", { name: "Method & audit" });
    const toc = method.getByRole("navigation", { name: "Method sections" });
    const atProof = async () => {
      await expect(method).toBeVisible();
      await expect(toc.getByRole("button", { name: /^Proof at a glance/ })).toHaveAttribute("aria-current", "true");
      await expect(method.locator('[data-method-section="proof"]')).toBeInViewport();
      await expect(method).toContainText("All rows match the sponsor's table");
    };

    // pre-run: the hero's proof button
    await page.getByRole("button", { name: proofName }).click();
    await atProof();
    // move away inside Method, close it
    const questions = toc.getByRole("button", { name: /^Open research questions/ });
    await questions.click();
    await expect(questions).toHaveAttribute("aria-current", "true");
    await expect(method.locator('[data-method-section="proof"]')).not.toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(method).toBeHidden();

    // post-run: the results panel's proof button lands on the proof again
    await compare(page);
    await page.getByRole("button", { name: proofName }).click();
    await atProof();
    await page.keyboard.press("Escape");
    await expect(method).toBeHidden();

    // the inspector's Sperry OVL chip (pair #01 is Sperry's OVL_3) → "Sperry's six rows today"
    const first = await cards(page).first().getAttribute("data-match-id");
    await cards(page).first().click();
    const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
    await expect(page).toHaveURL(new RegExp(`pair=${first}`));
    await inspector.getByRole("button", { name: /^Sperry OVL_\d+: open Sperry.s six rows today in Method/ }).click();
    await expect(method).toBeVisible();
    await expect(toc.getByRole("button", { name: /^Sperry.s six rows today/ })).toHaveAttribute("aria-current", "true");
    await expect(method.locator('[data-method-section="sperry-rows"]')).toBeInViewport();
  });

  test("inspector verdict line: status, rank and guidance; Pair above / Pair below step through the list", async ({ page }) => {
    const inspector = await openPair(page, SE_PAIR);
    await expect(cards(page).first()).toBeVisible();
    const ids = await cards(page).evaluateAll((els) => els.slice(0, 3).map((e) => (e as HTMLElement).dataset.matchId ?? ""));
    expect(ids[0]).toBe(SE_PAIR);
    const needs = await tabCount(tab(page, /^Needs review/));

    await expect(inspector).toContainText("Needs review");
    await expect(inspector).toContainText(`#01 of ${needs}`);
    await expect(inspector).toContainText(/nothing on record; worth a planner call\?/i);
    const above = inspector.getByRole("button", { name: "Pair above" });
    const below = inspector.getByRole("button", { name: "Pair below" });
    // the first row has nothing above it
    await expect(above).toHaveAttribute("aria-disabled", "true");
    await above.click({ force: true }); // aria-disabled (it keeps focus): a click does nothing
    await expect(page).toHaveURL(new RegExp(`pair=${SE_PAIR}`));
    await expect(inspector).toContainText(`#01 of ${needs}`);

    await below.click();
    await expect(page).toHaveURL(new RegExp(`pair=${ids[1]}`));
    await expect(page.locator(`[data-match-id="${ids[1]}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toContainText(`#02 of ${needs}`);
    await expect(above).not.toHaveAttribute("aria-disabled", "true");
    // J from the inspector steps the same way
    await page.keyboard.press("j");
    await expect(page).toHaveURL(new RegExp(`pair=${ids[2]}`));
    await expect(inspector).toContainText(`#03 of ${needs}`);
    await above.click();
    await above.click();
    await expect(page).toHaveURL(new RegExp(`pair=${SE_PAIR}`));
    await expect(page.locator(`[data-match-id="${SE_PAIR}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(above).toHaveAttribute("aria-disabled", "true");

    // a known-coordination pair: its verdict says so and what to ask
    await openPair(page, FEATURED);
    await expect(inspector).toContainText("Known coordination");
    await expect(inspector).toContainText(/already coordinating; ask only about uncovered construction-phase needs/i);
  });

  test("All N pairs with this project focuses the list on that project; ranks never change", async ({ page }) => {
    const inspector = await openPair(page, SE_PAIR);
    await expect(cards(page).first()).toBeVisible();
    const project = SE_PAIR.split("__")[0];
    const needs = tab(page, /^Needs review/);
    const n0 = await tabCount(needs);
    const rankOf = () =>
      cards(page).evaluateAll((els) => Object.fromEntries(els.map((e) => [(e as HTMLElement).dataset.matchId, e.querySelector(".sr-only")?.textContent?.trim() ?? ""])));
    const before = await rankOf();

    const all = inspector.getByRole("button", { name: /^All \d+ pairs with this project/ }).first();
    const n = Number(((await all.textContent()) ?? "").match(/All (\d+) pairs/)![1]);
    expect(n).toBeGreaterThan(1);
    await all.click();
    await expect(all).toHaveAttribute("aria-pressed", "true");
    const clear = queue(page).getByRole("button", { name: "Clear focus" });
    await expect(clear).toBeVisible();
    await expect(queue(page)).toContainText(`· ${n} pairs`);
    // tab counts and rows are focus-scoped
    await expect.poll(() => tabTotal(page)).toBe(n);
    await expect(cards(page)).toHaveCount(await tabCount(needs));
    const after = await rankOf();
    for (const [id, rank] of Object.entries(after)) {
      expect(id.split("__"), id).toContain(project);
      expect(rank, `${id} keeps its rank`).toBe(before[id]);
    }
    // the open pair stays open and selected
    await expect(inspector).toBeVisible();
    await expect(page.locator(`[data-match-id="${SE_PAIR}"]`)).toHaveAttribute("aria-pressed", "true");

    await clear.click();
    await expect(clear).toBeHidden();
    await expect.poll(() => tabCount(needs)).toBe(n0);
    await expect(all).toHaveAttribute("aria-pressed", "false");
  });

  test("3D close-up opens over the map and closes with Esc or Back to map", async ({ page }) => {
    const errors = trackErrors(page);
    const inspector = await openPair(page, SE_PAIR);
    await mapReady(page);
    const webgl2 = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return !!gl;
    });
    test.skip(!webgl2, "WebGL2 is unavailable in this browser: the close-up is replaced by a notice");
    const mapVisibility = () => page.evaluate(() => getComputedStyle((window as unknown as { __map: MapHandle }).__map.getCanvas()).visibility);
    const closeup = page.getByRole("region", { name: "3D close-up" });

    // from the inspector's footer; Esc closes it before the inspector
    const fromInspector = inspector.getByRole("button", { name: "3D close-up" });
    await fromInspector.click();
    await expect(closeup).toBeVisible({ timeout: 15_000 });
    await expect(closeup.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(closeup.getByRole("button", { name: "Back to map" })).toBeFocused();
    await expect(closeup).toContainText("Illustrative close-up");
    // the map is paused and hidden underneath
    await expect.poll(mapVisibility).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(closeup).toBeHidden();
    await expect(inspector).toBeVisible();
    await expect(fromInspector).toBeFocused();
    await expect.poll(mapVisibility).toBe("visible");

    // from the map's own control; Back to map closes it
    await page.locator("[data-map-controls]").getByRole("button", { name: "3D close-up" }).click();
    await expect(closeup).toBeVisible({ timeout: 15_000 });
    await closeup.getByRole("button", { name: "Back to map" }).click();
    await expect(closeup).toBeHidden();
    await expect(inspector).toBeVisible();
    await expect(page.getByText("3D close-up unavailable on this device")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Flat map hides the whole 3D scene; 3D brings it back", async ({ page }) => {
    await openPair(page, SE_PAIR);
    await mapReady(page);
    const scene = () =>
      page.evaluate(() => {
        const m = (window as unknown as { __map: MapHandle }).__map;
        const ids = m.getStyle().layers.map((l) => l.id);
        const shown = (id: string) => m.getLayoutProperty(id, "visibility") !== "none";
        const gl3d = ids.filter((id) => id.startsWith("gl3d-"));
        return { gl3d: gl3d.length, shown3d: gl3d.filter(shown).length, points: ids.includes("gl-points") && shown("gl-points") };
      });
    const perspective = page.getByRole("group", { name: "Map perspective" });
    const caption = page.getByText("3D · symbolic structures", { exact: false });

    await expect(perspective.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await scene()).shown3d, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(caption.first()).toBeVisible();

    await perspective.getByRole("button", { name: "Flat map" }).click();
    await expect(perspective.getByRole("button", { name: "Flat map" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await scene()).shown3d, { timeout: 10_000 }).toBe(0);
    const flat = await scene();
    expect(flat.gl3d).toBeGreaterThan(0); // hidden, not removed
    expect(flat.points).toBe(true); // the 2D map stays
    await expect(caption).toHaveCount(0);

    await perspective.getByRole("button", { name: "3D" }).click();
    await expect.poll(async () => (await scene()).shown3d, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(caption.first()).toBeVisible();
  });

  test("panels resize: drag the queue edge, arrow keys on the inspector and timeline edges, reset, sizes persist", async ({ page }) => {
    const errors = trackErrors(page);
    await openPair(page, SE_PAIR);
    await mapReady(page);
    const rail = page.locator("[data-slot=rail]");
    const inspector = page.locator("[data-slot=inspector]");
    const dock = page.locator("[data-slot=dock]");
    const width = async (l: Locator) => Math.round((await l.boundingBox())!.width);
    const height = async (l: Locator) => Math.round((await l.boundingBox())!.height);
    const railHandle = page.getByRole("separator", { name: "Resize coordination queue" });
    const inspectorHandle = page.getByRole("separator", { name: "Resize evidence inspector" });
    const dockHandle = page.getByRole("separator", { name: "Resize construction timeline" });
    await expect(railHandle).toHaveAttribute("aria-valuenow", "360");
    await expect(inspectorHandle).toHaveAttribute("aria-valuenow", "418");
    await expect(dockHandle).toHaveAttribute("aria-valuenow", "196");
    expect(await width(rail)).toBe(360);

    // drag the queue's right edge 80px out; transitions are off while the edge moves
    const box = (await railHandle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator(".atlas-shell")).toHaveAttribute("data-resizing", "");
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator(".atlas-shell")).not.toHaveAttribute("data-resizing", "");
    await expect(railHandle).toHaveAttribute("aria-valuenow", "440");
    await expect.poll(() => width(rail)).toBe(440);

    // keyboard: ArrowLeft grows the inspector (16px, Shift 64px), the dock grows with ArrowUp
    await inspectorHandle.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(inspectorHandle).toHaveAttribute("aria-valuenow", "498");
    await expect.poll(() => width(inspector)).toBe(498);
    await dockHandle.focus();
    await page.keyboard.press("Shift+ArrowUp");
    await expect.poll(() => height(dock)).toBe(260);
    // the map keeps a focal hole ≥ 360px wide however far a panel is dragged
    await railHandle.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
    const max = Number(await railHandle.getAttribute("aria-valuemax"));
    await expect(railHandle).toHaveAttribute("aria-valuenow", String(max));
    const focalW = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--focal-w")));
    expect(focalW).toBeGreaterThanOrEqual(360);

    // sizes persist per browser; Home resets one panel, a double-click another
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible({ timeout: 20_000 });
    await expect(inspectorHandle).toHaveAttribute("aria-valuenow", "498");
    await expect(railHandle).toHaveAttribute("aria-valuenow", String(max));
    await railHandle.focus();
    await page.keyboard.press("Home");
    await expect(railHandle).toHaveAttribute("aria-valuenow", "360");
    await inspectorHandle.dblclick();
    await expect(inspectorHandle).toHaveAttribute("aria-valuenow", "418");
    expect(errors).toEqual([]);
  });

  test("rows read in plain words: two-line titles, “4.3 mi apart”, “may overlap 2028”; Export is a labelled button", async ({ page }) => {
    await page.goto("/");
    await compare(page);
    const first = page.locator(`[data-match-id="${SE_PAIR}"]`);
    // distances are closest points
    await expect(first).toContainText("4.3 mi apart");
    await expect(first).toContainText("schedules overlap 2025–26");
    await expect(cards(page).nth(1)).toContainText(/schedules overlap 20\d\d/);
    // never a "construction overlap" for a schedule-basis pair (honesty T2)
    await expect(queue(page)).not.toContainText(/construction overlap/i);
    // titles wrap to at most two lines instead of truncating on one
    const clamp = await first.locator("[title]").filter({ hasText: "Okatie" }).first().evaluate((el) => getComputedStyle(el).webkitLineClamp);
    expect(clamp).toBe("2");
    // a possible lead reads the same way
    await tab(page, /^Possible/).click();
    const possible = page.locator(`[data-match-id="${POSSIBLE_PAIR}"]`);
    await expect(possible).toContainText("6.4 mi apart");
    await expect(possible).toContainText("may overlap 2028");
    const exportBtn = queue(page).getByRole("button", { name: "Export", exact: true });
    await expect(exportBtn).toHaveText(/Export/);
    await exportBtn.click();
    await expect(page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Export overlap table as CSV" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(queue(page).getByRole("button", { name: "Re-run comparison", exact: true })).toBeVisible();
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("the header's More options menu opens Sources and Method and toggles Reviewer mode as a checkbox", async ({ page }) => {
      await page.goto("/");
      const more = page.getByRole("button", { name: "More options" });
      await more.click();
      const reviewer = page.getByRole("menuitemcheckbox", { name: "Reviewer mode" });
      await expect(reviewer).toHaveAttribute("aria-checked", "false");
      await reviewer.click();
      await expect(reviewer).toBeHidden();
      await more.click();
      await expect(page.getByRole("menuitemcheckbox", { name: "Reviewer mode" })).toHaveAttribute("aria-checked", "true");

      await page.getByRole("menuitem", { name: "Method", exact: true }).click();
      const method = page.getByRole("dialog", { name: "Method & audit" });
      await expect(method).toBeVisible();
      await expect(method).toContainText("All rows match the sponsor's table");
      await page.keyboard.press("Escape");
      await expect(method).toBeHidden();

      await more.click();
      await page.getByRole("menuitem", { name: "Sources", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Source registry" })).toContainText("sha256");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
});
