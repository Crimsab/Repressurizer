import { test, expect } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test.beforeEach(async ({ page }) => installTauriMock(page));

async function seedRatings(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const { useSteamRatingsStore } = await import("/src/stores/steamRatingsStore.ts");
    const now = Date.now();
    const rating = (app_id: number, review_score: number, review_score_desc: string, total_reviews: number, positive_percentage: number) =>
      ({ app_id, review_score, review_score_desc, total_reviews, positive_percentage, total_positive: 0, total_negative: 0, fetched_at: now });
    const store = useSteamRatingsStore.getState();
    store.setRating(1145360, rating(1145360, 9, "Overwhelmingly Positive", 287964, 98));
    store.setRating(12100, rating(12100, 5, "Mixed", 4300, 62));
  });
}

test("list view shows Steam reviews, review count and HLTB columns and sorts from the header", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await seedRatings(page);
  await page.getByRole("button", { name: /list view/i }).click();

  const header = page.getByTestId("game-list-header");
  await expect(header).toContainText("Steam Reviews");
  await expect(header).toContainText("Review Count");
  await expect(header).toContainText("HLTB Length");

  const hades = page.locator(".game-row", { hasText: "Hades" });
  await expect(hades).toContainText("Overwhelmingly Positive");
  await expect(hades).toContainText("288K");
  await expect(page.locator(".game-row", { hasText: "Grand Theft Auto III" }).first()).toContainText("Mixed");

  await header.getByRole("button", { name: /Review Count/ }).click();
  await expect(header.getByRole("button", { name: /Review Count/ })).toHaveAttribute("aria-pressed", "true");
  const sortBy = await page.evaluate(async () => (await import("/src/stores/gameStore.ts")).useGameStore.getState().sortBy);
  expect(sortBy).toBe("reviewCount");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("game detail shows the Steam review summary", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await seedRatings(page);
  await page.locator(".game-card", { hasText: "Hades" }).first().dblclick();
  await expect(page.getByTestId("detail-steam-reviews")).toHaveText("Overwhelmingly Positive · 98%");
});
