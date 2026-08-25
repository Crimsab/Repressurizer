import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";
async function openPlanner(page: Page) { const direct = page.getByRole("button", { name: "Storage Planner" }); if (await direct.isVisible()) await direct.click(); else { await page.getByRole("button", { name: "More tools" }).click(); await page.getByRole("menuitem", { name: "Storage Planner" }).click(); } return page.getByRole("dialog", { name: "Storage Planner" }); }
test.beforeEach(async ({ page }) => installTauriMock(page));
test("storage planner explains candidates and simulates a reversible list", async ({ page }, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 }); await page.goto("/"); const dialog = await openPlanner(page); await expect(dialog.getByText("Disco Elysium - The Final Cut")).toBeVisible(); await dialog.getByRole("checkbox", { name: /Add to uninstall list Disco Elysium/ }).check(); await expect(dialog.getByText("20.0 GB").first()).toBeVisible(); const path = testInfo.outputPath("storage-planner-desktop.png"); await page.screenshot({ path, fullPage: true }); await testInfo.attach("storage-planner-desktop", { path, contentType: "image/png" });
});
test("storage planner is horizontally contained on mobile", async ({ page }, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); const dialog = await openPlanner(page); const overflow = await dialog.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })); expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1); const path = testInfo.outputPath("storage-planner-mobile.png"); await page.screenshot({ path, fullPage: true }); await testInfo.attach("storage-planner-mobile", { path, contentType: "image/png" });
});
