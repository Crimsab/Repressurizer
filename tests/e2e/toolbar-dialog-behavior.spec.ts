import { expect, test, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test.beforeEach(async ({ page }) => installTauriMock(page));

test("product dialogs close when the backdrop is clicked", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "What to Play Next" }).click();
  const dialog = page.getByRole("dialog", { name: "Session Planner" });
  await expect(dialog).toBeVisible();

  await page.mouse.click(6, 6);
  await expect(dialog).toBeHidden();
});

test("toolbar tools can be configured from right click and Settings", async ({ page }, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");

  const storage = page.getByRole("button", { name: "Storage Planner" });
  await expect(storage).toBeVisible();
  await storage.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide" }).click();
  await expect(storage).toBeHidden();

  const toolbarState = await page.evaluate(async () => {
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    return useSettingsStore.getState().toolbarHiddenToolIds;
  });
  expect(toolbarState).toContain("storage");

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Toolbar", exact: true }).click();
  await expect(settings.getByRole("heading", { name: "Toolbar" })).toBeVisible();
  await expect(settings.getByText("Storage Planner", { exact: true })).toBeVisible();

  const path = testInfo.outputPath("toolbar-settings-desktop.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("toolbar-settings-desktop", { path, contentType: "image/png" });
});
