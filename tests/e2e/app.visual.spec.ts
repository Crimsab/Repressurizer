import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";
import type { Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(hasOverflow).toBe(false);
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("loads the main library surface with mocked Steam data", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Repressurizer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All" })).toBeVisible();
  await expect(page.getByText("Disco Elysium")).toBeVisible();
  await expect(page.getByText("Hades")).toBeVisible();
  await expect(page.getByText("It Takes Two")).toBeVisible();
  await expect(page.getByRole("button", { name: "Steam Family" })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  const cards = page.locator(".game-card");
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    const box = await cards.nth(i).boundingBox();
    expect(box?.width).toBeGreaterThan(180);
    expect(box?.height).toBeGreaterThan(120);
  }
  await expect
    .poll(() => page.locator(".game-card img").first().evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const screenshotPath = testInfo.outputPath("dashboard.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("dashboard", { path: screenshotPath, contentType: "image/png" });
});

test("opens settings maintenance and Steam Family controls without layout overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTitle("Settings").click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Steam Family" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maintenance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export diagnostics" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  const dialog = page.locator(".fixed.inset-0").first();
  const box = await dialog.boundingBox();
  expect(box?.width).toBeGreaterThan(900);

  const settingsTopPath = testInfo.outputPath("settings-top.png");
  await page.screenshot({ path: settingsTopPath, fullPage: true });
  await testInfo.attach("settings-top", { path: settingsTopPath, contentType: "image/png" });

  await page.getByRole("heading", { name: "Maintenance" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Export diagnostics" })).toBeVisible();
  const maintenancePath = testInfo.outputPath("settings-maintenance.png");
  await page.screenshot({ path: maintenancePath, fullPage: true });
  await testInfo.attach("settings-maintenance", { path: maintenancePath, contentType: "image/png" });
});
