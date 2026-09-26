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
    const raw = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
    // UTF-8 byte-order mark, so Excel reads en dashes and accents in project names
    expect(raw.startsWith("﻿")).toBe(true);
    const [head, first, ...rest] = raw.replace(/^﻿/, "").trim().split("\n");
    expect(head.startsWith("overlap_id,distance_mi,time_gap (day),utility_a,project_id_a,project_name_a,utility_b,project_id_b,project_name_b")).toBe(true);
    expect(head).toContain(",priority_rank,queue_rank,");
    // the radius each row was flagged at, so geo_signal reads against it
    expect(head).toContain(",geo_method,review_radius_mi,time_signal,");
    expect(head).toContain(",time_gap_basis,in_service_a,in_service_b,docket_a,docket_b,pair_id");
    expect(first).toMatch(/^OVL_1,\d+\.\d{2},/);
    // project ids are the app's unique ids: never the same on both sides, and each row opens a distinct pair
    const cols = head.split(",");
    const rows = [first, ...rest].map((r) => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "")));
    for (const r of rows) {
      expect(r[cols.indexOf("project_id_a")]).not.toBe(r[cols.indexOf("project_id_b")]);
      expect(["exact", "at-least", "ranges-overlap", ""]).toContain(r[cols.indexOf("time_gap_basis")]);
      expect(r[cols.indexOf("review_radius_mi")]).toBe("25");
    }
    expect(new Set(rows.map((r) => r[cols.indexOf("pair_id")])).size).toBe(rows.length);
    // a published in-service date is filled even when the other side has none
    const eff = rows.find((r) => r[cols.indexOf("pair_id")] === "desc-6888__gpc-effingham-500");
    if (eff) expect(eff[cols.indexOf("in_service_a")]).toBe("2028-12-31");
  });

  test("the pair API returns every excerpt its projects cite", async ({ request }) => {
    const body = await (await request.get("/api/matches/desc-6888__gpc-20065")).json();
    const ids = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          if (/evidenceids$/i.test(k) && Array.isArray(x)) x.forEach((id) => ids.add(id));
          else walk(x);
        }
    };
    walk([body.match, body.projects]);
    expect(ids.size).toBeGreaterThan(6);
    for (const id of ids) expect(body.evidence[id], id).toBeTruthy();
  });

  test("shortcuts do not act behind the brief; Escape works from inside inputs", async ({ page }) => {
    await page.goto(`/?pair=${FEATURED}`);
    const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
    await expect(inspector).toBeVisible({ timeout: 20_000 });
    await inspector.getByRole("button", { name: /Create review brief/ }).click();
    await expect(page.getByRole("dialog", { name: "Review brief" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("j");
    await expect(page).toHaveURL(new RegExp(`pair=${FEATURED}`));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Review brief" })).toBeHidden();

    await page.getByRole("button", { name: /Source registry/ }).click();
    const drawer = page.getByRole("dialog", { name: "Source registry" });
    await drawer.getByPlaceholder("Filter sources").fill("psc");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("phone: the camera reaches the selected pair and demo controls stay usable", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /Compare public plans/ }).click();
    await expect(page.locator("[data-match-id]").first()).toBeVisible({ timeout: 15_000 });
    await page.locator("[data-match-id]").first().click();
    await expect(page.getByRole("complementary", { name: "Evidence inspector" })).toBeVisible();
    await page.waitForTimeout(2500);
    const zoom = await page.evaluate(() => (window as unknown as { __map: { getZoom: () => number } }).__map.getZoom());
    expect(zoom).toBeGreaterThan(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("combobox", { name: "Region" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Start guided demo" }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Next/ }).click();
    const next = page.getByRole("button", { name: /^Next/ });
    const box = (await next.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "", [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toMatch(/Next/);
    await ctx.close();
  });
});
