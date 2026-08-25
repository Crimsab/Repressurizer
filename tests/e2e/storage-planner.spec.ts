import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";
async function openPlanner(page: Page) {
  const direct = page.getByRole("button", { name: "Storage Planner" });
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: "Storage Planner" }).click();
  }
  return page.getByRole("dialog", { name: "Storage Planner" });
}
test.beforeEach(async ({ page }) => installTauriMock(page));
test("storage planner explains candidates and simulates a reversible list", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const dialog = await openPlanner(page);
  await expect(dialog.getByText("Disco Elysium - The Final Cut")).toBeVisible();
  await expect(dialog.getByText("Hades")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /All Steam libraries/ }),
  ).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: /Add to uninstall list Disco Elysium/ })
    .check();
  await expect(dialog.getByText("20.0 GB").first()).toBeVisible();
  const path = testInfo.outputPath("storage-planner-desktop.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("storage-planner-desktop", {
    path,
    contentType: "image/png",
  });
});
test("storage planner offers treemap, bars, and distribution views", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const dialog = await openPlanner(page);
  await dialog.getByRole("button", { name: "Treemap view" }).click();
  await expect(dialog.getByTestId("storage-treemap")).toBeVisible();
  const treemap = testInfo.outputPath("storage-treemap-desktop.png");
  await page.screenshot({ path: treemap, fullPage: true });
  await testInfo.attach("storage-treemap-desktop", {
    path: treemap,
    contentType: "image/png",
  });
  await dialog.getByRole("button", { name: "Bar chart" }).click();
  await expect(dialog.getByTestId("storage-bars")).toBeVisible();
  const bars = testInfo.outputPath("storage-bars-desktop.png");
  await page.screenshot({ path: bars, fullPage: true });
  await testInfo.attach("storage-bars-desktop", {
    path: bars,
    contentType: "image/png",
  });
  await dialog.getByRole("button", { name: "Storage distribution" }).click();
  await expect(dialog.getByTestId("storage-pie")).toBeVisible();
  const pie = testInfo.outputPath("storage-pie-desktop.png");
  await page.screenshot({ path: pie, fullPage: true });
  await testInfo.attach("storage-pie-desktop", {
    path: pie,
    contentType: "image/png",
  });
});
test("storage planner is horizontally contained on mobile", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dialog = await openPlanner(page);
  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  const path = testInfo.outputPath("storage-planner-mobile.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("storage-planner-mobile", {
    path,
    contentType: "image/png",
  });
});
