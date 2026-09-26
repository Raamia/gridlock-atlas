import { expect, test } from "@playwright/test";

const FEATURED = "dpc-alma-blair__xcel-wwtc";

test.describe("GridLock Atlas smoke path", () => {
  test("compare, inspect the featured pair, open sources and export a brief", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByRole("button", { name: /Compare public plans/ })).toBeVisible();
    await page.getByRole("button", { name: /Compare public plans/ }).click();
    await expect(page.locator("[data-match-id]").first()).toBeVisible({ timeout: 15_000 });

    // queue, map and inspector agree on the selected pair
    await page.goto(`/?pair=${FEATURED}`);
    const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    await expect(inspector).toContainText("Alma-Blair");
    await expect(inspector).toContainText("Western Wisconsin");
    await expect(inspector).toContainText("Known coordination");
    await expect(inspector).toContainText("Tremval North");
    await expect(page.getByText("PAIR IN VIEW", { exact: false })).toBeVisible();
    await expect(page.locator(`[data-match-id="${FEATURED}"]`)).toHaveAttribute("aria-pressed", "true");
    const timeline = page.getByRole("region", { name: "Construction timeline" }).or(page.locator('section[aria-label="Construction timeline"]'));
    await expect(timeline).toContainText("Alma-Blair");
    await expect(timeline).toContainText(/Shared window|Possible overlap/);

    // every evidence link points at a public http(s) source
    const links = inspector.locator('a[href^="http"]');
    expect(await links.count()).toBeGreaterThan(3);
    for (const href of await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      expect(href).toMatch(/^https?:\/\//);
    }

    // brief: opens, carries numbered sources, copies
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await inspector.getByRole("button", { name: /Create review brief/ }).click();
    const brief = page.getByRole("dialog", { name: "Review brief" });
    await expect(brief).toBeVisible();
    await expect(brief).toContainText("Review question");
    await expect(brief).toContainText("Sources");
    await brief.getByRole("button", { name: /Copy Markdown/ }).click();
    const md = await page.evaluate(() => navigator.clipboard.readText());
    expect(md).toContain("# Review brief");
    expect(md).toMatch(/\n1\. .+https?:\/\//);

    // keyboard: Escape closes the brief, then the inspector
    await page.keyboard.press("Escape");
    await expect(brief).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();

    expect(errors).toEqual([]);
  });

  test("queue cards are keyboard reachable and the sources drawer lists hashed documents", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Compare public plans/ }).click();
    const first = page.locator("[data-match-id]").first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Source registry/ }).click();
    const drawer = page.getByRole("dialog", { name: "Source registry" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("sha256");
    await expect(drawer).toContainText("located verbatim");
  });

  test("respects reduced motion and still renders the map", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`/?pair=${FEATURED}`);
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
    await ctx.close();
  });

  test("method drawer reproduces the sponsor's worked example", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Method$/ }).click();
    const drawer = page.getByRole("dialog", { name: "Method & audit" });
    await expect(drawer).toContainText("All rows match the sponsor's table");
  });

  test("falls back to bundled boundaries when Mapbox is unreachable", async ({ page }) => {
    await page.route(/mapbox\.com/, (route) => route.abort("internetdisconnected"));
    await page.goto(`/?pair=${FEATURED}`);
    await expect(page.getByText(/Basemap unavailable/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Offline", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toContainText("Tremval North");
    const layers = await page.evaluate(() => (window as unknown as { __map: { getStyle: () => { layers: { id: string }[] } } }).__map.getStyle().layers.filter((l) => l.id.startsWith("gl-")).length);
    expect(layers).toBeGreaterThan(5);
  });

  test("exports the ranked overlap table in the sponsor's column format", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Compare public plans/ }).click();
    await expect(page.locator("[data-match-id]").first()).toBeVisible({ timeout: 15_000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export overlap table as CSV" }).click()]);
    const text = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
    const [head, first] = text.split("\n");
    expect(head.startsWith("overlap_id,distance_mi,time_gap (day),utility_a,project_id_a,project_name_a,utility_b,project_id_b,project_name_b")).toBe(true);
    expect(first).toMatch(/^OVL_1,\d+\.\d{2},/);
  });
});
