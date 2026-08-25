import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function createRenameConflict(page: Page) {
  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const state = useCategoryStore.getState();
    const steam = structuredClone(state._saved);
    const rpg = steam.find((collection) => collection.key === "rpg");
    if (rpg) rpg.name = "Steam RPG";
    window.localStorage.setItem("repressurizer-mock-steam-collections", JSON.stringify(steam));
    state.renameCategory("rpg", "Local RPG");
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savePreview = page.getByRole("dialog", { name: "Review Steam collection changes" });
  await savePreview.getByRole("button", { name: "Create backup and save" }).click();
  return page.getByRole("dialog", { name: "Collection Conflict Resolver" });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => installTauriMock(page));

test("three-way save requires an explicit reviewed conflict resolution", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const dialog = await createRenameConflict(page);
  await expect(dialog.getByText("Steam RPG", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Local RPG", { exact: true })).toBeVisible();
  await dialog.getByLabel("Conflict choice").selectOption("steam");
  await dialog.getByRole("button", { name: "Apply to similar" }).click();
  await dialog.getByRole("button", { name: "Preview final result" }).click();
  await expect(dialog.getByText("This is the exact collection result that will be written to Steam.")).toBeVisible();
  await capture(page, testInfo, "collection-conflict-preview-desktop");
  await dialog.getByRole("button", { name: "Write reviewed merge" }).click();
  await expect(dialog).not.toBeVisible();
  const savedName = await page.evaluate(() => {
    const saved = JSON.parse(window.localStorage.getItem("repressurizer-mock-saved-collections") ?? "[]") as Array<{ key: string; name: string }>;
    return saved.find((collection) => collection.key === "rpg")?.name;
  });
  expect(savedName).toBe("Steam RPG");
});

test("conflict resolver remains usable on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dialog = await createRenameConflict(page);
  await expect(dialog.getByLabel("Conflict choice")).toBeVisible();
  const overflow = await dialog.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await capture(page, testInfo, "collection-conflict-mobile");
});
