import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

const GAME_COUNT = 2_500;

async function fill2500games(page: Page) {
  await page.evaluate(async (count) => {
    const { useGameStore } = await import("/src/stores/gameStore.ts");
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    useSettingsStore.getState().setSettings({
      libraryRefreshCacheMode: "none",
      autoRefreshLibraryEnabled: false,
      steamToolsEnabled: false,
      steamToolsAchievementWritesEnabled: false,
      steamToolsCardFarmingEnabled: false,
    });
    useGameStore.getState().setGames(
      Array.from({ length: count }, (_, index) => ({
        appid: 2_000_000 + index,
        name: `Scroll Audit Game ${String(index).padStart(4, "0")}`,
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
      })),
    );
  }, GAME_COUNT);
}

type ScrollSample = {
  top: number;
  height: number;
};

async function sampleScrollFrames(page: Page, targetFraction: number, frameCount = 45) {
  return page.evaluate(async ({ fraction, frameCount: frames }) => {
    const scroller = document.querySelector<HTMLElement>("[data-library-scroll]");
    if (!scroller) throw new Error("library scroller not found");
    const target = Math.max(0, (scroller.scrollHeight - scroller.clientHeight) * fraction);
    scroller.scrollTop = target;
    const samples: Array<ScrollSample> = [];
    for (let frame = 0; frame < frames; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push({
        top: scroller.scrollTop,
        height: scroller.scrollHeight,
      });
    }
    return { target, samples };
  }, { fraction: targetFraction, frameCount });
}

function assertStableScroll(samples: ScrollSample[], label: string) {
  expect(samples, `${label}: no scroll samples`).not.toHaveLength(0);
  const heights = samples.map((sample) => sample.height);
  const tops = samples.map((sample) => sample.top);
  expect(Math.max(...heights) - Math.min(...heights), `${label}: scrollHeight changed`).toBeLessThanOrEqual(2);
  expect(Math.max(...tops) - Math.min(...tops), `${label}: scrollTop changed after settling`).toBeLessThanOrEqual(2);
}

async function captureAndAssert(page: Page, targetFraction: number, label: string, frameCount = 45) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const result = await sampleScrollFrames(page, targetFraction, frameCount);
  assertStableScroll(result.samples, label);
  expect(result.samples.at(-1)!.top, `${label}: target scroll position`).toBeCloseTo(result.target, -1);
  return result;
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.setViewportSize({ width: 1366, height: 900 });
});

test("virtualized library keeps scroll geometry stable through jumps, resize, and filter", async ({ page }, testInfo: TestInfo) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await fill2500games(page);
  await expect(page.locator(".game-card").first()).toContainText("Scroll Audit Game");

  expect(await page.locator(".game-card").count()).toBeLessThan(100);
  await page.screenshot({ path: testInfo.outputPath("virtual-scroll-top.png") });
  await captureAndAssert(page, 0.5, "grid middle");
  await page.screenshot({ path: testInfo.outputPath("virtual-scroll-middle.png") });
  await captureAndAssert(page, 1, "grid bottom");

  await page.setViewportSize({ width: 1110, height: 760 });
  await captureAndAssert(page, 0.65, "grid after resize");

  await page.getByRole("button", { name: /list view/i }).click();
  await expect(page.locator(".game-row").first()).toBeVisible();
  await captureAndAssert(page, 0.5, "list middle");
  await page.screenshot({ path: testInfo.outputPath("virtual-scroll-list.png") });

  await page.locator("[data-search-input]").fill("appid:2001250..2002499");
  await expect(page.locator(".game-row").first()).toContainText("Scroll Audit Game 1250");
  await captureAndAssert(page, 0.5, "filtered list");

  await page.locator("[data-search-input]").fill("");
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/stores/gameStore.ts");
    useGameStore.getState().setViewMode("grid");
  });
  await expect(page.locator(".game-card").first()).toBeVisible();
  await captureAndAssert(page, 0.5, "grid after clearing filter", 30);
});
