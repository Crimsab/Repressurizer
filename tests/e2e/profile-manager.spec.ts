import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function openProfiles(page: Page) {
  const direct = page.getByRole("button", { name: "Profiles & Sync" });
  if (await direct.isVisible()) await direct.click();
  else { await page.getByRole("button", { name: "More tools" }).click(); await page.getByRole("menuitem", { name: "Profiles & Sync" }).click(); }
  return page.getByRole("dialog", { name: "Repressurizer Profiles" });
}
async function capture(page: Page, testInfo: TestInfo, name: string) { const path = testInfo.outputPath(`${name}.png`); await page.screenshot({ path, fullPage: true }); await testInfo.attach(name, { path, contentType: "image/png" }); }
test.beforeEach(async ({ page }) => installTauriMock(page));

test("profiles export without secrets and selectively import after backup", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 }); await page.goto("/"); const dialog = await openProfiles(page);
  await dialog.getByLabel("Profile name").fill("Portable Demo");
  await dialog.getByRole("button", { name: "Save profile file" }).click();
  const exported = await page.evaluate(() => window.localStorage.getItem("repressurizer-last-written-text") ?? "");
  expect(exported).toContain('"checksum"'); expect(exported).not.toContain("mock-key"); expect(exported).not.toContain("Program Files"); expect(exported).not.toContain("automationPublishBearerToken");
  await page.evaluate(async () => {
    const { createRepressurizerProfile } = await import("/src/lib/repressurizerProfile.ts");
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const profile = createRepressurizerProfile({ profileId: "incoming", name: "Incoming Deck", deviceId: "deck-device", steamAccountId: "76561198000000000", sections: { settings: { showEmptyLists: true }, collections: useCategoryStore.getState().collections } });
    window.localStorage.setItem("repressurizer-mock-open-path", "C:\\Users\\Demo\\incoming.repressurizer-profile.json");
    window.localStorage.setItem("repressurizer-mock-read-text", JSON.stringify(profile));
  });
  await dialog.getByRole("button", { name: "Choose profile" }).click();
  await expect(dialog.getByText("Incoming Deck", { exact: true })).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Manual collections Unchanged" }).uncheck();
  await dialog.getByRole("button", { name: "Create backups and import selected" }).click();
  const state = await page.evaluate(async () => { const { useSettingsStore } = await import("/src/stores/settingsStore.ts"); const { useProfileStore } = await import("/src/stores/profileStore.ts"); return { showEmptyLists: useSettingsStore.getState().showEmptyLists, backups: useProfileStore.getState().backups.length }; });
  expect(state).toEqual({ showEmptyLists: true, backups: 1 });
  await capture(page, testInfo, "profile-manager-desktop");
});

test("profile manager remains usable on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); const dialog = await openProfiles(page); await expect(dialog.getByText("Create or export profile")).toBeVisible();
  const overflow = await dialog.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })); expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1); await capture(page, testInfo, "profile-manager-mobile");
});
