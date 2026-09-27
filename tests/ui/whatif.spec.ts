import { expect, test } from "@playwright/test";

/**
 * Schedule what-if (end of "When they build"): the engine re-answers for a schedule moved by whole months. Keyboard only:
 * the native range input moves one month per arrow press, and "Reset to plan" brings back the as-planned answer.
 */

const TOP = "desc-06367-d-g__gpc-20065"; // DESC Jasper – Okatie #2 × Georgia Power Goshen–McIntosh rebuild

test("schedule what-if: arrows move the schedule, the engine re-answers, Reset to plan restores it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?pair=${TOP}`);
  const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
  await expect(inspector).toBeVisible({ timeout: 20_000 });
  await inspector.getByRole("navigation", { name: "Inspector sections" }).getByRole("button", { name: "When" }).click();

  const card = inspector.getByRole("group", { name: "Schedule what-if" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("radio", { name: "Move DESC" })).toHaveAttribute("aria-checked", "true");
  await expect(card.getByRole("radio", { name: "Move Georgia Power" })).toHaveAttribute("aria-checked", "false");

  const slider = card.getByRole("slider", { name: "Months to move the project" });
  await expect(slider).toHaveAttribute("min", "-36");
  await expect(slider).toHaveAttribute("max", "36");
  await expect(slider).toHaveAttribute("step", "1");
  const offset = card.getByTestId("whatif-offset");
  const result = card.getByTestId("whatif-result");
  const reset = card.getByRole("button", { name: "Reset to plan" });
  await expect(offset).toHaveText("as planned");
  // as planned, the card says what the pair Gantt says
  const planned = "Schedules overlap Jun 2025–Dec 2026 · 18 months";
  await expect(result).toHaveText(planned);
  await expect(reset).toHaveCount(0);

  await slider.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("12");
  await expect(slider).toHaveAttribute("aria-valuetext", /^12 months later/);
  await expect(offset).toHaveText("12 months later");
  await expect(result).not.toHaveText(planned);
  await expect(result).toHaveText("Schedules overlap Jun 2025–Dec 2027 · 30 months");
  await expect(card).toContainText("14 months of it on or after the snapshot");
  await expect(card).toContainText(`As planned: ${planned}`);
  await expect(card.getByTestId("whatif-impact")).toContainText("Still applies");
  // no likelihoods, expected values or new dollar figures: the one dollar value is the staging channel's own
  const text = await card.innerText();
  expect(text).not.toMatch(/expected|chance|probab|will save|uncoordinated/i);
  expect(text.match(/\$/g)?.length).toBe(2); // "up to ≈ $100K" and the channel's "2018 $" dollar basis

  await reset.click();
  await expect(offset).toHaveText("as planned");
  await expect(slider).toHaveValue("0");
  await expect(result).toHaveText(planned);
  await expect(reset).toHaveCount(0);
  expect(errors).toEqual([]);
});
