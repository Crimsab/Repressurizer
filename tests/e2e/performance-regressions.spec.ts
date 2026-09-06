import { test, expect } from "@playwright/test";
import { installTauriMock } from "./tauriMock";
test.beforeEach(async ({ page }) => installTauriMock(page));

test("10,000 games keep bounded mounted cards, preserve Shift range and scroll", async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/stores/gameStore.ts");
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    useSettingsStore.getState().setSettings({ libraryRefreshCacheMode: "none", autoRefreshLibraryEnabled: false });
    useGameStore.getState().setGames(Array.from({ length: 10_000 }, (_, i) => ({
      appid: 1_000_000 + i, name: `Audit Game ${String(i).padStart(5, "0")}`,
      playtime_forever: 0, img_icon_url: null, rtime_last_played: 0,
    })));
  });
  await expect(page.locator(".game-card").first()).toContainText("Audit Game");
  expect(await page.locator(".game-card").count()).toBeLessThan(100);
  await page.locator(".game-card").nth(0).click();
  await page.locator(".game-card").nth(5).click({ modifiers: ["Shift"] });
  const selected = await page.evaluate(async () => {
    const { useGameStore } = await import("/src/stores/gameStore.ts");
    return Object.keys(useGameStore.getState().selectedGameIds).length;
  });
  expect(selected).toBe(6);
  await page.locator("[data-library-scroll]").evaluate((node) => { node.scrollTop = node.scrollHeight - node.clientHeight; });
  await expect(page.locator(".game-card").last()).toContainText("Audit Game 09999");
  expect(await page.locator(".game-card").count()).toBeLessThan(100);
  await page.screenshot({ path: info.outputPath("large-library-bottom.png") });
  await page.getByRole("button", { name: /list view/i }).click();
  await expect(page.locator(".game-row").first()).toBeVisible();
  expect(await page.locator(".game-row").count()).toBeLessThan(100);
});

test("manual refresh preserves an unsaved local collection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    useCategoryStore.getState().renameCategory("rpg", "Draft must survive refresh");
  });
  const refresh = page.getByRole("button", { name: /refresh.*library/i }).first();
  await refresh.click();
  await expect(refresh).toBeEnabled();
  const state = await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const state = useCategoryStore.getState();
    return { name: state.collections.find((item) => item.key === "rpg")?.name, dirty: state.dirty };
  });
  expect(state).toEqual({ name: "Draft must survive refresh", dirty: true });
});
