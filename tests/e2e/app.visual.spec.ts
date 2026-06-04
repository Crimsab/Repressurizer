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
  await expect(page.getByText("DEATH STRANDING 2")).toBeVisible();
  await expect(page.getByText("DRAGON QUEST VII")).toBeVisible();
  await expect(page.getByText("S.T.A.L.K.E.R. 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "FINAL FANTASY VII", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grand Theft Auto III", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grand Theft Auto III – The Definitive Edition", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Steam Family" })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  const cards = page.locator(".game-card");
  await expect(cards).toHaveCount(11);
  for (let i = 0; i < 11; i += 1) {
    const box = await cards.nth(i).boundingBox();
    expect(box?.width).toBeGreaterThan(180);
    expect(box?.height).toBeGreaterThan(120);
  }
  await expect
    .poll(() => page.locator(".game-card img").first().evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator(".game-card img").evaluateAll((images) =>
        images.filter((img) => (img as HTMLImageElement).naturalWidth > 0).length
      )
    )
    .toBeGreaterThanOrEqual(9);

  const screenshotPath = testInfo.outputPath("dashboard.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("dashboard", { path: screenshotPath, contentType: "image/png" });
});

test("supports regex search and advanced duplicate filters", async ({ page }) => {
  await page.goto("/");

  await page.locator("[data-search-input]").fill("/disco.*elysium/i");
  await expect(page.getByText("Disco Elysium")).toBeVisible();
  await expect(page.getByText("Hades")).toBeHidden();
  await expect(page.locator(".game-card")).toHaveCount(1);

  await page.locator("[data-search-input]").fill("");
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByRole("heading", { name: "Advanced Filters" })).toBeVisible();
  await page.getByRole("button", { name: "Possible duplicates" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Grand Theft Auto III", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grand Theft Auto III – The Definitive Edition", exact: true })).toBeVisible();
  await expect(page.getByText("Disco Elysium")).toBeHidden();
  await expect(page.locator(".game-card")).toHaveCount(2);
});

test("creates a category from the compact sidebar plus button", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.sidebarWidth = 160;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await page.getByRole("button", { name: "New Category" }).click();
  await page.getByPlaceholder("Category name").fill("Dishonored");
  await page.getByRole("button", { name: "Create category" }).click();

  await expect(page.getByRole("button", { name: /Dishonored/ })).toBeVisible();
});

test("play history shows tracked deltas instead of lifetime playtime", async ({ page }) => {
  await page.goto("/");

  await page.getByTitle("Play History Timeline").click();

  const timeline = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Play History" }),
  });
  await expect(timeline.getByRole("heading", { name: "Play History" })).toBeVisible();
  await expect(timeline.getByRole("button", { name: /Hades/ })).toBeVisible();
  await expect(timeline.getByText("1.1h").first()).toBeVisible();
  await expect(timeline.getByText("30.0h")).toBeHidden();
});

test("opens settings maintenance and Steam Family controls without layout overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTitle("Settings").click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Crimsab (123456)")).toBeVisible();
  await expect(page.getByText("Steam App Index")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
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

test("uses the color picker as the primary custom accent control", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("Settings").click();
  await page.getByRole("button", { name: "Appearance" }).click();

  await page.getByLabel("Pick accent color").first().click();
  const picker = page.locator('input[type="color"]').first();
  await expect(picker).toBeAttached();
  await picker.evaluate((input) => {
    const el = input as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "#38bdf8");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.getByPlaceholder("#10b981")).toHaveValue("#38bdf8");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-repressurizer-accent").trim()))
    .toBe("#38bdf8");
});

test("keeps recommendation filters inside the dialog", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTitle("What to Play Next").click();

  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "What to Play Next" }),
  });
  await expect(dialog.getByRole("heading", { name: "What to Play Next" })).toBeVisible();
  await dialog.getByRole("button", { name: "All Genres" }).click();
  const rpgOption = dialog.getByRole("button", { name: "RPG", exact: true });
  await expect(rpgOption).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const viewport = page.viewportSize();
  const menuBox = await rpgOption.locator("..").boundingBox();
  expect(menuBox?.x ?? 0).toBeGreaterThanOrEqual(0);
  if (viewport && menuBox) expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);

  const screenshotPath = testInfo.outputPath("recommend-filters.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("recommend-filters", { path: screenshotPath, contentType: "image/png" });
});

test("guides Steam Family setup during onboarding", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.onboardingComplete = false;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome to Repressurizer!" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Steam Family" })).toBeVisible();
  await expect(page.getByText("Family library connected")).toBeVisible();
  await expect(page.getByText("Steam Family ready: 1 shared game found.")).toBeVisible();
});
