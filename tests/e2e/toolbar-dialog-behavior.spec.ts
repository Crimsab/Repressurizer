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

test("toolbar tools can be configured from right click and Settings", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Achievements" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wishlist" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();

  await page.getByRole("button", { name: "More tools" }).click();
  await expect(page.getByRole("menuitem", { name: "Profiles & Sync" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Statistics" })).toBeHidden();
  await expect(
    page.getByRole("menuitem", { name: "Community Rule Packs" }),
  ).toBeHidden();
  const defaultsPath = testInfo.outputPath("toolbar-recommended-defaults.png");
  await page.screenshot({ path: defaultsPath, fullPage: true });
  await testInfo.attach("toolbar-recommended-defaults", {
    path: defaultsPath,
    contentType: "image/png",
  });
  await page.keyboard.press("Escape");

  const storage = page.getByRole("button", { name: "Storage Planner" });
  await expect(storage).toBeVisible();
  await storage.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide" }).click();
  await expect(storage).toBeHidden();

  const toolbarState = await page.evaluate(async () => {
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    const state = useSettingsStore.getState();
    return {
      hidden: state.toolbarHiddenToolIds,
      pinned: state.toolbarPinnedToolIds,
    };
  });
  expect(toolbarState.hidden).toContain("storage");
  expect(toolbarState.pinned).not.toContain("storage");

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Toolbar", exact: true }).click();
  await expect(
    settings.getByRole("heading", { name: "Toolbar" }),
  ).toBeVisible();
  await expect(
    settings.getByRole("button", { name: "Toolbar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    settings.getByRole("button", { name: "General", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await expect(
    settings.getByText("Storage Planner", { exact: true }),
  ).toBeVisible();

  const storageRow = settings.getByTestId("toolbar-tool-storage");
  await storageRow.getByRole("button", { name: "Keep in More" }).click();
  await expect(storageRow.getByRole("button", { name: "Keep in More" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await storageRow.getByRole("button", { name: "Pin to header" }).click();
  await expect(storageRow.getByRole("button", { name: "Pin to header" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await settings
    .getByTestId("toolbar-tool-profiles")
    .dragTo(settings.getByTestId("toolbar-tool-inbox"));
  const order = await page.evaluate(async () => {
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    return useSettingsStore.getState().toolbarToolOrder;
  });
  expect(order[0]).toBe("profiles");

  const path = testInfo.outputPath("toolbar-settings-desktop.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("toolbar-settings-desktop", {
    path,
    contentType: "image/png",
  });
});

test("toolbar Settings stays ordered and contained on mobile", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Toolbar", exact: true }).click();
  await expect(settings.getByRole("heading", { name: "Toolbar" })).toBeVisible();

  const overflow = await settings.evaluate((dialog) => ({
    clientWidth: dialog.clientWidth,
    scrollWidth: dialog.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const path = testInfo.outputPath("toolbar-settings-mobile.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("toolbar-settings-mobile", {
    path,
    contentType: "image/png",
  });
});
