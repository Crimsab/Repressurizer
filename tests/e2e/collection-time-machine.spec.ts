import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function openTimeMachine(page: Page) {
  const direct = page.getByRole("button", { name: "Collection Time Machine" });
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: "Collection Time Machine" }).click();
  }
  return page.getByRole("dialog", { name: "Collection Time Machine" });
}

async function seedTimeline(page: Page) {
  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const { useCollectionTimeMachineStore } = await import("/src/stores/collectionTimeMachineStore.ts");
    const before = structuredClone(useCategoryStore.getState().collections);
    const after = structuredClone(before);
    if (after[0]) after[0] = { ...after[0], name: `${after[0].name} Updated`, added: [...after[0].added, 999999] };
    useCollectionTimeMachineStore.getState().recordTransition({ before, after, origin: "autocat", steamAccountId: "test-account", deviceId: "desktop-test", occurredAt: 1_800_000_000_000 });
    useCategoryStore.getState().applyImportedCollections(after, "autocat");
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => installTauriMock(page));

test("Collection Time Machine compares and previews a safe restore", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await seedTimeline(page);
  const dialog = await openTimeMachine(page);
  await expect(dialog.getByText("AutoCat").first()).toBeVisible();
  await expect(dialog.getByText("Games added")).toBeVisible();
  await dialog.getByRole("button", { name: "Preview restore" }).click();
  const preview = dialog.getByRole("alertdialog", { name: "Preview collection restore" });
  await expect(preview).toContainText("verified Steam backup");
  await preview.getByRole("button", { name: "Create backup and stage restore" }).click();
  await expect(preview).not.toBeVisible();
  await capture(page, testInfo, "collection-time-machine-desktop");
});

test("Collection Time Machine remains usable on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await seedTimeline(page);
  const dialog = await openTimeMachine(page);
  await expect(dialog.getByText("AutoCat").first()).toBeVisible();
  const overflow = await dialog.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await capture(page, testInfo, "collection-time-machine-mobile");
});
