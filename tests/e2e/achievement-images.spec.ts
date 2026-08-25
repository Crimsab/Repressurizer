import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

for (const viewport of [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`legacy Steam achievement icons load from the current CDN on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();

    const detail = page.locator(".fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "Hades" }),
    });
    await detail.getByRole("button", { name: /Achievements/ }).click();

    const row = detail.locator("[data-achievement-row]").filter({ hasText: "Begin" });
    const icon = row.locator("img");
    await expect(icon).toHaveAttribute(
      "src",
      "https://shared.fastly.steamstatic.com/community_assets/images/apps/1623730/4fdae6f7bfdc6bf912aa5d72eb133ca75fd666a9.jpg",
    );
    await expect
      .poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
      .toBe(true);
    await expect
      .poll(() =>
        detail
          .getByTestId("game-detail-tabs")
          .evaluate((tabs) => tabs.scrollWidth <= tabs.clientWidth),
      )
      .toBe(true);

    await page.screenshot({
      path: testInfo.outputPath(`achievement-icon-${viewport.name}.png`),
      fullPage: true,
    });
  });
}
