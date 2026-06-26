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

test("AutoCat shows cached metadata suggestions and preview sorting controls", async ({ page }) => {
  await page.addInitScript(() => {
    const makeDetail = (
      appId: number,
      name: string,
      categories: string[],
      supportedLanguages = ["English"]
    ) => ({
      app_id: appId,
      name,
      genres: ["Adventure"],
      categories,
      release_date: "Jan 1, 2020",
      metacritic_score: null,
      developers: ["Demo Studio"],
      publishers: ["Demo Publisher"],
      supported_languages: supportedLanguages,
      platforms: { windows: true, mac: false, linux: false },
      header_image: null,
      capsule_image: null,
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
    });

    const details = {
      632470: makeDetail(632470, "Disco Elysium - The Final Cut", ["Single-player", "Steam Cloud"], ["English", "French"]),
      1145360: makeDetail(1145360, "Hades", ["Single-player", "Steam Achievements", "Steam Cloud"], ["English", "Italian"]),
      753640: makeDetail(753640, "Outer Wilds", ["Single-player"], ["English"]),
      39140: makeDetail(39140, "FINAL FANTASY VII", ["Single-player", "Steam Cloud"], ["English", "German", "French"]),
      12100: makeDetail(12100, "Grand Theft Auto III", ["Single-player"], ["English", "Italian"]),
      1546970: makeDetail(1546970, "Grand Theft Auto III - The Definitive Edition", ["Single-player"], ["English"]),
      1462040: makeDetail(1462040, "FINAL FANTASY VII REMAKE INTERGRADE", ["Single-player"], ["English"]),
      3280350: makeDetail(3280350, "DEATH STRANDING 2: ON THE BEACH", ["Single-player"], ["English"]),
      2499860: makeDetail(2499860, "DRAGON QUEST VII Reimagined", ["Single-player"], ["English"]),
      1643320: makeDetail(1643320, "S.T.A.L.K.E.R. 2: Heart of Chornobyl", ["Single-player"], ["English"]),
      1426210: makeDetail(1426210, "It Takes Two", ["Shared/Split Screen Co-op"], ["English"]),
    };

    window.localStorage.setItem("repressurizer-mock-details-cache", JSON.stringify(details));
  });

  await page.goto("/");
  await page.getByTitle(/Auto-Categorize/).click();

  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Auto-Categorize" }),
  });
  await dialog.getByRole("button", { name: /Store flags/ }).click();

  await expect(dialog.getByText(/Flags:\s*4/)).toBeVisible();
  await expect(dialog.getByText("11/11 games with metadata")).toBeVisible();

  await dialog.getByPlaceholder("Type and press Enter").click();
  await dialog.getByRole("button", { name: "Steam Cloud" }).click();
  await expect(dialog.getByText("Steam Cloud")).toBeVisible();

  await dialog.getByRole("button", { name: "Run" }).click();
  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await expect(dialog.getByText("(Flag) Steam Cloud")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Games", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Natural" }).click();
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

test("keeps Steam Tools in Settings instead of the home toolbar", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByTitle("Steam Tools")).toBeHidden();
  await page.getByTitle("Settings").click();

  const settingsDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Settings" }),
  });
  await settingsDialog.getByRole("button", { name: "Steam Tools", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Steam Tools" })).toBeVisible();
  await expect(settingsDialog.getByText("SAM integration: Steam Achievement Manager")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("settings-steam-tools-entry.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("settings-steam-tools-entry", { path: screenshotPath, contentType: "image/png" });
});

test("game achievement details show Steam Achievement Manager preflight separately from Steam Web API data", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await expect(detail.getByRole("heading", { name: "Hades" })).toBeVisible();
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeVisible();
  await expect(detail.getByText("Ready").first()).toBeVisible();
  await expect(detail.getByText("1 / 3 achievements")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("game-achievements-sam-bridge.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("game-achievements-sam-bridge", { path: screenshotPath, contentType: "image/png" });
});

test("achievement write controls require explicit Steam Tools write opt-in", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeVisible();
  await expect(detail.getByText("Ready").first()).toBeVisible();
  await expect(detail.getByRole("button", { name: "Backups" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Restore backup" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock all (2)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Lock all (1)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock", exact: true }).first()).toBeVisible();

  await detail.getByRole("button", { name: "Unlock all (2)" }).click();
  await expect(detail.getByText("achievement change(s) stored")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("SAM backup buttons show the in-app backup viewer and restore a selected snapshot", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Backups" }).click();
  const backupViewer = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "SAM backups for Hades" }),
  });
  await expect(backupViewer.getByRole("heading", { name: "SAM backups for Hades" })).toBeVisible();
  await expect(backupViewer.locator("[data-sam-backup-count]")).toContainText("Steam app 1145360");
  await expect(backupViewer.locator("[data-sam-backup-count]")).toContainText("3 of 3 shown");
  await expect(backupViewer.getByText("mock-before.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-after.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-lock-after.json")).toBeVisible();

  await backupViewer.getByRole("button", { name: /^Action:/ }).click();
  await page.getByRole("option", { name: "Lock", exact: true }).click();
  await expect(backupViewer.getByText("mock-lock-after.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-before.json")).toBeHidden();
  await expect(backupViewer.locator("[data-sam-backup-count]")).toContainText("1 of 3 shown");

  await backupViewer.getByRole("button", { name: /^Action:/ }).click();
  await page.getByRole("option", { name: "All actions", exact: true }).click();
  await backupViewer.getByRole("button", { name: /^Phase:/ }).click();
  await page.getByRole("option", { name: "Before", exact: true }).click();
  await expect(backupViewer.getByText("mock-before.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-after.json")).toBeHidden();

  await backupViewer.getByRole("button", { name: /^Phase:/ }).click();
  await page.getByRole("option", { name: "All phases", exact: true }).click();
  await backupViewer.getByPlaceholder("Search date, action, filename...").fill("mock-after");
  await expect(backupViewer.getByText("mock-after.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-before.json")).toBeHidden();

  await backupViewer.getByPlaceholder("Search date, action, filename...").fill("");
  await backupViewer.getByRole("button", { name: /^Sort:/ }).click();
  await page.getByRole("option", { name: "Oldest", exact: true }).click();
  await expect(backupViewer.locator("[data-sam-backup-row]").first()).toContainText("mock-lock-after.json");
  const screenshotPath = testInfo.outputPath("sam-backup-viewer-filters.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("sam-backup-viewer-filters", { path: screenshotPath, contentType: "image/png" });

  await backupViewer.getByRole("button", { name: "Open folder" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("repressurizer-open-sam-backup-dir-app-id"))
    )
    .toBe("1145360");

  await backupViewer
    .locator("[data-sam-backup-row]")
    .filter({ hasText: "mock-before.json" })
    .getByRole("button", { name: "Restore backup" })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-last-sam-action")))
    .toBe("restore_backup");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-last-sam-backup-path")))
    .toContain("mock-before.json");
  await expect(detail.getByText("After backup:")).toBeVisible();
});

test("single achievement write updates only the targeted achievement locally", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Unlock", exact: true }).first().click();

  await expect(detail.getByText("2 / 3 achievements")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock all (1)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Lock all (2)" })).toBeVisible();
});

test("multi-select achievement writes act on selected locked achievements", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByText("0 selected")).toBeHidden();
  await expect(detail.getByRole("checkbox", { name: "Select Secret route" })).toBeVisible();
  await detail.getByRole("button", { name: "Locked", exact: true }).click();
  await expect(detail.getByText("2 selected")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock selected (2)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Lock selected (0)" })).toBeHidden();
  await detail.getByPlaceholder("Search achievements...").fill("Secret");
  await expect(detail.getByText("Secret route")).toBeVisible();
  const modalBox = await detail.locator(":scope > div").first().boundingBox();
  expect(modalBox?.height ?? 0).toBeLessThan(760);
  await detail.getByPlaceholder("Search achievements...").fill("");

  await detail.getByRole("button", { name: "Unlock selected (2)" }).click();
  await expect(detail.getByText("3 / 3 achievements")).toBeVisible();
  await expect(detail.getByText("0 selected")).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test("long achievement multi-select does not create a nested blank scroll panel", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-achievement-count", "24");
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Locked", exact: true }).click();
  await expect(detail.getByText("23 selected")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock selected (23)" })).toBeVisible();

  const listMetrics = await detail.locator("[data-achievement-list]").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      overflowY: styles.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(listMetrics.overflowY).toBe("visible");
  expect(listMetrics.scrollHeight).toBe(listMetrics.clientHeight);

  const detailScrollMetrics = await detail.locator("[data-game-detail-scroll]").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      overflowY: styles.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(detailScrollMetrics.overflowY).toBe("auto");
  expect(detailScrollMetrics.scrollHeight).toBeGreaterThan(detailScrollMetrics.clientHeight);

  await expectNoHorizontalOverflow(page);
  const screenshotPath = testInfo.outputPath("long-achievement-multi-select.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("long-achievement-multi-select", { path: screenshotPath, contentType: "image/png" });
});

test("manual achievement checkbox selection does not scroll the modal shell", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-achievement-count", "100");
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  const readMetrics = async () =>
    detail.locator("[data-game-detail-scroll]").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const shell = element.closest(".max-w-4xl") as HTMLElement | null;
      const visibleRows = Array.from(document.querySelectorAll("[data-achievement-row]"))
        .filter((row) => {
          const rowRect = row.getBoundingClientRect();
          return rowRect.bottom > rect.top && rowRect.top < rect.bottom;
        }).length;
      return {
        shellScrollTop: shell?.scrollTop ?? 0,
        rectTop: rect.top,
        rectBottom: rect.bottom,
        visibleRows,
        activeTag: document.activeElement?.tagName ?? "",
        activeClass: String(document.activeElement?.className ?? ""),
      };
    });

  const start = await readMetrics();
  expect(start.shellScrollTop).toBe(0);
  expect(start.rectTop).toBeGreaterThan(0);

  await detail.getByRole("checkbox", { name: "Select Cat 2", exact: true }).click();
  await detail.getByRole("checkbox", { name: "Select Cat 3", exact: true }).click();
  await detail.getByRole("checkbox", { name: "Select Cat 4", exact: true }).click();
  await detail.locator("[data-game-detail-scroll]").evaluate((element) => {
    element.scrollTop = 900;
  });
  await detail.getByRole("checkbox", { name: "Select Cat 20", exact: true }).click();

  const after = await readMetrics();
  expect(after.shellScrollTop).toBe(0);
  expect(Math.abs(after.rectTop - start.rectTop)).toBeLessThan(1);
  expect(after.visibleRows).toBeGreaterThan(4);
  expect(after.activeTag).toBe("BUTTON");
  expect(after.activeClass).not.toContain("sr-only");
  await expect(detail.getByText("4 selected")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("manual-achievement-checkbox-selection.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("manual-achievement-checkbox-selection", { path: screenshotPath, contentType: "image/png" });
});

test("achievement write controls stay visible while SAM action is running", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-sam-action-delay-ms", "900");
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Locked", exact: true }).click();
  await expect(detail.getByText("2 selected")).toBeVisible();

  await detail.getByRole("button", { name: "Unlock selected (2)" }).click();

  await expect(detail.getByText("2 selected")).toBeVisible();
  await expect(detail.getByRole("checkbox", { name: "Select Secret route" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Working..." })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Locked", exact: true })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "Unlock all (2)" })).toBeDisabled();
});

test("achievement details do not probe SAM while Steam Tools is disabled", async ({ page }) => {
  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByText("1 / 3 achievements")).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeHidden();
});

test("games without Steam achievements skip the Steam Achievement Manager panel", async ({ page }) => {
  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Outer Wilds" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Outer Wilds" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByText("This game has no achievements.")).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeHidden();
});

test("opens organized settings tabs, automation logs, and Steam controls without layout overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTitle("Settings").click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const settingsDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Settings" }),
  });

  await expect(page.getByText("DemoUser (123456)")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const settingsPanel = settingsDialog.locator(":scope > div").first();
  const initialPanelBox = await settingsPanel.boundingBox();
  expect(initialPanelBox?.width).toBeGreaterThan(900);
  expect(initialPanelBox?.height).toBeGreaterThan(700);

  const settingsTopPath = testInfo.outputPath("settings-top.png");
  await page.screenshot({ path: settingsTopPath, fullPage: true });
  await testInfo.attach("settings-top", { path: settingsTopPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Steam", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Steam Family" })).toBeVisible();
  await expect(settingsDialog.getByText("Steam Web API Key", { exact: true })).toBeVisible();
  const steamPanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((steamPanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);
  const apiKeyInput = settingsDialog.locator('input[type="password"]').last();
  const apiSaveButton = settingsDialog.getByRole("button", { name: "Save", exact: true });
  await expect(apiSaveButton).toBeVisible();
  const apiInputBox = await apiKeyInput.boundingBox();
  const apiButtonBox = await apiSaveButton.boundingBox();
  expect(Math.abs((apiInputBox?.height ?? 0) - (apiButtonBox?.height ?? 0))).toBeLessThanOrEqual(1);

  const steamPath = testInfo.outputPath("settings-steam.png");
  await page.screenshot({ path: steamPath, fullPage: true });
  await testInfo.attach("settings-steam", { path: steamPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Steam Tools", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Steam Tools" })).toBeVisible();
  await expect(settingsDialog.getByText("SAM integration: Steam Achievement Manager")).toBeVisible();
  await expect(settingsDialog.getByText("Enable SAM achievement changes")).toBeHidden();
  await expect(settingsDialog.getByText("Allow card farming lab")).toBeHidden();
  await expect(settingsDialog.getByRole("switch")).toHaveCount(1);
  await settingsDialog.getByRole("switch", { name: /SAM integration/ }).click();
  await expect(settingsDialog.getByRole("switch", { name: /SAM integration/ })).toBeChecked();
  await expect(settingsDialog.getByText("Enable SAM achievement changes")).toBeHidden();

  const toolsPath = testInfo.outputPath("settings-steam-tools.png");
  await page.screenshot({ path: toolsPath, fullPage: true });
  await testInfo.attach("settings-steam-tools", { path: toolsPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Data", exact: true }).click();
  await expect(settingsDialog.getByText("Steam App Index")).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(settingsDialog.getByRole("heading", { name: "Maintenance" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Export diagnostics" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Check for updates" })).toBeVisible();
  const dataPanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((dataPanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);

  const dataPath = testInfo.outputPath("settings-data.png");
  await page.screenshot({ path: dataPath, fullPage: true });
  await testInfo.attach("settings-data", { path: dataPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "System Tray" })).toBeVisible();
  const startupSwitch = settingsDialog.getByRole("switch", { name: "Start Repressurizer when you sign in" });
  await expect(startupSwitch).toBeVisible();
  await startupSwitch.click();
  await expect(settingsDialog.getByText("Startup behavior")).toBeVisible();
  await expect(settingsDialog.getByRole("switch", { name: "Show empty lists" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: /Open in tray/ })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: /Open window/ })).toBeVisible();
  const appearancePanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((appearancePanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);

  const appearancePath = testInfo.outputPath("settings-appearance-tray.png");
  await page.screenshot({ path: appearancePath, fullPage: true });
  await testInfo.attach("settings-appearance-tray", { path: appearancePath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Automation", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Automation Export" })).toBeVisible();
  await expect(settingsDialog.getByText("Result:")).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Guide" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "View logs" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Publish now" })).toBeVisible();

  const automationPath = testInfo.outputPath("settings-automation.png");
  await page.screenshot({ path: automationPath, fullPage: true });
  await testInfo.attach("settings-automation", { path: automationPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Guide" }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Automation export guide" })).toBeVisible();
  await expect(settingsDialog.getByText("Integration libraries")).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Automation docs" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Snapshot schema" })).toBeVisible();
  const guidePath = testInfo.outputPath("settings-automation-guide.png");
  await page.screenshot({ path: guidePath, fullPage: true });
  await testInfo.attach("settings-automation-guide", { path: guidePath, contentType: "image/png" });
  await settingsDialog.getByRole("button", { name: "Close" }).click();

  await settingsDialog.getByRole("button", { name: "View logs" }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Automation export logs" })).toBeVisible();
  await expect(settingsDialog.getByText("All results")).toBeVisible();
  await expect(settingsDialog.getByText("Newest first")).toBeVisible();
  await expect(settingsDialog.getByText("HTTP 200", { exact: true })).toBeVisible();
  await expect(settingsDialog.getByText("HTTP 500", { exact: true })).toBeVisible();

  const logsPath = testInfo.outputPath("settings-automation-logs.png");
  await page.screenshot({ path: logsPath, fullPage: true });
  await testInfo.attach("settings-automation-logs", { path: logsPath, contentType: "image/png" });

  await expectNoHorizontalOverflow(page);
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

test("keeps selected appearance controls legible in light theme", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.theme = "light";
    settings.language = "en";
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");
  await page.getByTitle("Settings").click();
  await page.getByRole("button", { name: "Appearance" }).click();

  const lightButton = page.getByRole("button", { name: "Light" });
  await expect(lightButton).toBeVisible();
  const lightTextColor = await lightButton.evaluate((el) => getComputedStyle(el).color);
  expect(lightTextColor).not.toBe("rgb(255, 255, 255)");

  const englishButton = page.getByRole("button", { name: /English/ });
  await expect(englishButton).toBeVisible();
  const englishTextColor = await englishButton.evaluate((el) => getComputedStyle(el).color);
  expect(englishTextColor).not.toBe("rgb(255, 255, 255)");

  await lightButton.scrollIntoViewIfNeeded();
  const screenshotPath = testInfo.outputPath("settings-light-appearance.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("settings-light-appearance", { path: screenshotPath, contentType: "image/png" });
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
