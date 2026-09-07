import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function openPlanner(page: Page) {
  const direct = page.getByRole("button", { name: "What to Play Next" });
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: "What to Play Next" }).click();
  }
  return page.getByRole("dialog", { name: "Session Planner" });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => {
  if (process.env.REPRESSURIZER_REAL_STEAM_IMAGES === "1") {
    await page.setExtraHTTPHeaders({
      "User-Agent": "OpenAI File Downloader, XaiImageApiFetch/1.0",
    });
  }
  await installTauriMock(page);
});

test("Session Planner builds an explainable queue and previews collection conversion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const dialog = await openPlanner(page);
  await expect(dialog.getByTestId("planner-result-best")).toBeVisible();
  await dialog.getByRole("button", { name: "Device profile" }).click();
  await expect(page.getByRole("option", { name: /Main PC/ })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Device profile" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(250);
  const popupId = await dialog.getByRole("button", { name: "Device profile" }).getAttribute("aria-controls");
  expect(popupId).toBeTruthy();
  await expect(page.locator(`[id="${popupId}"][role="listbox"]`)).toBeVisible();
  await capture(page, testInfo, "session-planner-device-dropdown");
  await page.keyboard.press("Escape");
  await capture(page, testInfo, "session-planner-results");
  await dialog.getByTestId("planner-duration-60").click();
  await dialog
    .getByRole("button", { name: "Requirements & preferences" })
    .click();
  await expect(dialog.getByTestId("planner-requirements")).toBeVisible();

  await dialog
    .getByTestId("planner-result-best")
    .getByRole("button", { name: "Add to queue" })
    .click();
  await dialog.getByTestId("planner-tab-queue").click();
  await expect(dialog.locator('[data-testid^="queue-item-"]')).toHaveCount(1);
  await dialog.getByTestId("queue-manual-search").fill("Outer Wilds");
  await dialog.getByRole("button", { name: /Outer Wilds/ }).click();
  await expect(dialog.locator('[data-testid^="queue-item-"]')).toHaveCount(2);
  await expect(
    dialog.getByText(/min planned of 60 min available/),
  ).toBeVisible();
  const firstQueueItem = dialog.locator('[data-testid^="queue-item-"]').first();
  await firstQueueItem.getByLabel("Planned game time").fill("37");
  await expect(firstQueueItem.getByLabel("Planned game time")).toHaveValue(
    "37",
  );
  await firstQueueItem.getByRole("button", { name: "Complete" }).click();
  await expect(firstQueueItem).toContainText("Complete");

  await dialog.getByRole("button", { name: "Convert to collection" }).click();
  await expect(
    dialog.getByRole("alertdialog", { name: "Preview collection conversion" }),
  ).toContainText("2 queue games");
  await dialog
    .getByRole("alertdialog")
    .getByRole("button", { name: "Create proposal" })
    .click();
  const proposal = await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    return useCategoryStore
      .getState()
      .collections.find((collection) =>
        collection.name.startsWith("Tonight Queue"),
      );
  });
  expect(proposal?.added).toHaveLength(2);
  await capture(page, testInfo, "session-planner-desktop");
});

test("Session Planner and Tonight Queue remain usable on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dialog = await openPlanner(page);
  await expect(dialog.getByTestId("planner-result-best")).toBeVisible();
  await capture(page, testInfo, "session-planner-mobile-results");
  await dialog
    .getByTestId("planner-result-best")
    .getByRole("button", { name: "Add to queue" })
    .click();
  await dialog.getByTestId("planner-tab-queue").click();
  await expect(dialog.locator('[data-testid^="queue-item-"]')).toHaveCount(1);
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await capture(page, testInfo, "session-planner-mobile");
});
