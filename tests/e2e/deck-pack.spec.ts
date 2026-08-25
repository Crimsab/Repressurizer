import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function seedDeckMetadata(page: Page) {
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/stores/gameStore.ts");
    const make = (appId: number, name: string, genres: string[]) => ({
      app_id: appId,
      name,
      genres,
      tags: genres,
      categories: ["Single-player", "Full controller support"],
      release_date: "2020",
      metacritic_score: 85,
      developers: [],
      publishers: [],
      supported_languages: ["English"],
      platforms: { windows: true, mac: false, linux: true },
      header_image: null,
      capsule_image: null,
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
      deck_status: "verified" as const,
      full_controller_support: true,
      external_launcher: false,
      offline_support: true,
      first_launch_online: false,
    });
    useGameStore
      .getState()
      .setBulkDetails([
        make(632470, "Disco Elysium - The Final Cut", ["Narrative", "RPG"]),
        make(1145360, "Hades", ["Roguelike", "Difficult"]),
        make(39140, "FINAL FANTASY VII", ["RPG", "Adventure"]),
      ]);
  });
}

async function openPack(page: Page) {
  const direct = page.getByRole("button", { name: "Pack My Deck" });
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: "Pack My Deck" }).click();
  }
  return page.getByRole("dialog", { name: "Pack My Deck" });
}

test.beforeEach(async ({ page }) => installTauriMock(page));

test("Pack My Deck builds an explainable plan and stages a reversible collection", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await seedDeckMetadata(page);
  const dialog = await openPack(page);
  const sidebar = dialog.locator("aside");
  const originalSidebarWidth = (await sidebar.boundingBox())?.width ?? 0;
  await dialog
    .getByRole("separator", { name: "Resize configuration column" })
    .press("ArrowRight");
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBeGreaterThan(originalSidebarWidth);
  await dialog.getByRole("button", { name: "Build pack" }).click();
  await expect(dialog.getByRole("heading", { name: "Hades" })).toBeVisible();
  await dialog.getByRole("button", { name: "Require Hades" }).click();
  await dialog.getByLabel("Pack name").fill("Long trip");
  await dialog.getByRole("button", { name: "Stage as collection" }).click();
  const state = await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    return {
      dirty: useCategoryStore.getState().dirty,
      names: useCategoryStore.getState().collections.map((item) => item.name),
    };
  });
  expect(state.dirty).toBe(true);
  expect(state.names).toContain("Deck · Long trip");
  const path = testInfo.outputPath("deck-pack-desktop.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("deck-pack-desktop", {
    path,
    contentType: "image/png",
  });
});

test("Pack My Deck controls remain contained on mobile", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await seedDeckMetadata(page);
  const dialog = await openPack(page);
  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  const path = testInfo.outputPath("deck-pack-mobile.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("deck-pack-mobile", { path, contentType: "image/png" });
});
