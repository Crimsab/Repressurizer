import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

const GAME_COUNT = 2_500;
const BASE_APP_ID = 2_000_000;

async function fill2500games(page: Page) {
  await page.evaluate(async (count) => {
    const { useGameStore } = await import("/src/stores/gameStore.ts");
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const baseAppId = 2_000_000;
    const categoryStart = 700;
    const categoryEnd = 1_700;
    const longCategoryNames = [
      "Narrative Adventure Games With A Very Long Collection Name For Scroll Regression",
      "Strategy And Simulation Games With A Particularly Long Descriptive Collection Name",
      "Cooperative Multiplayer Games In A Long Category That Must Remain Bounded",
    ];
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
    const middleAppIds = Array.from(
      { length: categoryEnd - categoryStart },
      (_, offset) => baseAppId + categoryStart + offset,
    );
    useCategoryStore.getState().setCollections(
      longCategoryNames.map((name, categoryIndex) => ({
        id: `scroll-audit-category-${categoryIndex}`,
        key: `scroll-audit-category-${categoryIndex}`,
        name,
        // Keep the long labels in a contiguous middle block, with a mixture of
        // one, two, and three labels per row to exercise the list layout.
        added: middleAppIds.filter((_, offset) =>
          offset % longCategoryNames.length === categoryIndex || offset % 7 === 0,
        ),
        removed: [],
        timestamp: 1,
        is_deleted: false,
        is_dynamic: false,
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

async function waitForScrollGeometry(page: Page) {
  await page.evaluate(async () => {
    const scroller = document.querySelector<HTMLElement>("[data-library-scroll]");
    if (!scroller) throw new Error("library scroller not found");
    let previousHeight = scroller.scrollHeight;
    let stableFrames = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const height = scroller.scrollHeight;
      if (height > scroller.clientHeight && Math.abs(height - previousHeight) <= 2) {
        stableFrames += 1;
        if (stableFrames >= 8) return;
      } else {
        stableFrames = 0;
      }
      previousHeight = height;
    }
    throw new Error("library scroll geometry did not settle before sampling");
  });
}

async function captureAndAssert(page: Page, targetFraction: number, label: string, frameCount = 45) {
  await waitForScrollGeometry(page);
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

  expect(await page.locator(".game-row").count()).toBeLessThan(100);
  const titleWidthAt1110 = await page
    .locator(".game-row")
    .filter({ hasText: "Scroll Audit Game 1250" })
    .locator("span")
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(titleWidthAt1110, "long category labels must leave room for the game title").toBeGreaterThanOrEqual(90);

  await page.setViewportSize({ width: 900, height: 760 });
  await captureAndAssert(page, 0.5, "list narrow viewport");
  const titleWidthAt900 = await page
    .locator(".game-row")
    .filter({ hasText: "Scroll Audit Game 1250" })
    .locator("span")
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(titleWidthAt900, "narrow list rows must keep a usable title width").toBeGreaterThanOrEqual(90);

  await page.setViewportSize({ width: 1110, height: 760 });
  await captureAndAssert(page, 0.5, "list after resize");
  await captureAndAssert(page, 1, "list bottom");
  await expect(page.locator(".game-row").filter({ hasText: "Scroll Audit Game 2499" })).toBeVisible();

  await page.locator("[data-search-input]").fill(`appid:${BASE_APP_ID + 1250}..${BASE_APP_ID + 2499}`);
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
