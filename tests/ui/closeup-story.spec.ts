import { expect, test, type Page } from "@playwright/test";

/**
 * The 3D close-up's time axis and "Play the story": the Ground / Time toggle, the five captioned beats (built from the
 * snapshot), jumping between beats, and Esc stopping the story before it closes the close-up. Under automation the
 * time animations jump to their end state, so every assertion here is about state, not timing.
 */

const SE_PAIR = "desc-06367-d-g__gpc-20065"; // DESC Jasper – Okatie #2 × Georgia Power Goshen – McIntosh (Sperry's OVL_3)

async function openCloseup(page: Page) {
  await page.goto(`/?pair=${SE_PAIR}`);
  const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
  await expect(inspector).toBeVisible({ timeout: 20_000 });
  const webgl2 = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  });
  test.skip(!webgl2, "WebGL2 is unavailable in this browser: the close-up is replaced by a notice");
  await inspector.getByRole("button", { name: "3D close-up" }).click();
  const closeup = page.getByRole("region", { name: "3D close-up" });
  await expect(closeup.locator("canvas")).toBeVisible({ timeout: 15_000 });
  return closeup;
}

test.describe("3D close-up: time axis and story", () => {
  test("opens with time raised; Ground flattens it and the caption says what height means", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const closeup = await openCloseup(page);
    const view = closeup.getByRole("group", { name: "Close-up view" });
    await expect(view.getByRole("button", { name: "Time" })).toHaveAttribute("aria-pressed", "true");
    await expect(closeup).toContainText("height is time, not elevation");
    await expect(closeup).toContainText("Height = time · 2022–2029");
    await view.getByRole("button", { name: "Ground" }).click();
    await expect(view.getByRole("button", { name: "Ground" })).toHaveAttribute("aria-pressed", "true");
    await expect(closeup).not.toContainText("height is time, not elevation");
    await expect(closeup).not.toContainText("Height = time");
    expect(errors).toEqual([]);
  });

  test("plays five captioned beats; Esc stops the story first, then closes the close-up", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const closeup = await openCloseup(page);
    const play = closeup.getByRole("button", { name: "Play the story" });
    await play.click();
    const caption = closeup.getByRole("status").filter({ hasText: "/ 05" });
    await expect(caption).toContainText("01 / 05 · The pair");
    await expect(caption).toContainText("Jasper – Okatie 230 kV #2");
    // the story flattens the axis for the ground beats
    await expect(closeup.getByRole("button", { name: "Ground" })).toHaveAttribute("aria-pressed", "true");

    // jump to the time beat: the axis rises and the caption carries the honesty wording
    await caption.getByRole("button", { name: "Story step 4 of 5" }).click();
    await expect(caption).toContainText("04 / 05 · Overlapping in time");
    await expect(caption).toContainText("field-work dates are not published");
    await expect(caption).toContainText("at least 396 days apart");
    await expect(closeup.getByRole("button", { name: "Time" })).toHaveAttribute("aria-pressed", "true");

    await caption.getByRole("button", { name: "Story step 5 of 5" }).click();
    await expect(caption).toContainText("not “uncoordinated.”");

    // Esc: the story stops, the close-up stays
    await page.keyboard.press("Escape");
    await expect(caption).toBeHidden();
    await expect(closeup).toBeVisible();
    await expect(closeup.getByRole("button", { name: "Play the story" })).toBeVisible();
    // Esc again: the close-up closes
    await page.keyboard.press("Escape");
    await expect(closeup).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("the story advances on its own and ends by handing the view back", async ({ page }) => {
    test.setTimeout(90_000);
    const closeup = await openCloseup(page);
    await closeup.getByRole("button", { name: "Play the story" }).click();
    const caption = closeup.getByRole("status").filter({ hasText: "/ 05" });
    await expect(caption).toContainText("01 / 05");
    await expect(caption).toContainText("02 / 05 · On the ground", { timeout: 12_000 });
    await expect(caption).toContainText("Closest points 4.3 mi apart");
    // the whole story is about 35 s
    await expect(caption).toBeHidden({ timeout: 45_000 });
    await expect(closeup.getByRole("button", { name: "Play the story" })).toBeVisible();
    await expect(closeup.getByRole("button", { name: "Time" })).toHaveAttribute("aria-pressed", "true");
  });
});
