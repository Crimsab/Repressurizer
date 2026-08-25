import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function openTitleRuleInspector(page: Page) {
  await page.goto("/");
  const autoCategorize = page.getByRole("button", { name: /Auto-Categorize/ });
  if (await autoCategorize.isVisible()) {
    await autoCategorize.click();
  } else {
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: /Auto-Categorize/ }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Auto-Categorize" });
  await dialog.getByRole("button", { name: /Custom rule Build one/ }).click();
  await dialog.getByPlaceholder("Short RPG not in Backlog").fill("Hades Inspector");
  await dialog.getByRole("button", { name: "Title starts" }).click();
  await dialog.locator('input[value="A"]').fill("Hades");
  await expect(dialog.getByTestId("rule-inspector")).toBeVisible();
  return dialog;
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("Rule Inspector explains and exports the production result", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const dialog = await openTitleRuleInspector(page);

  await expect(dialog.getByTestId("rule-inspector")).toContainText("1Included");
  await dialog.getByTestId("rule-inspector-search").fill("Hades");
  await dialog.getByTestId("rule-inspector-game-1145360").click();
  await expect(dialog.getByTestId("rule-inspector-final-state")).toHaveText("Included");
  const condition = dialog.getByTestId(/rule-inspector-condition-/);
  await expect(condition).toContainText("Title");
  await expect(condition).toContainText("Pass");
  await expect(condition).toContainText("Hades");
  await expect(condition).toContainText("Decisive");

  await dialog.getByRole("button", { name: "Export report" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Inspection report saved.");
  const exported = await page.evaluate(() => JSON.parse(localStorage.getItem("repressurizer-last-written-text") ?? "{}"));
  expect(exported).toMatchObject({
    schema: "repressurizer.ruleInspection",
    version: 1,
    summary: { matched: 1 },
    selectedGame: { appId: 1145360, finalState: "included" },
  });

  await capture(page, testInfo, "rule-inspector-desktop");
});

test("Rule Inspector remains usable on a phone viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openTitleRuleInspector(page);
  await dialog.getByTestId("rule-inspector-search").fill("Outer Wilds");
  await dialog.getByTestId("rule-inspector-game-753640").click();
  await expect(dialog.getByTestId("rule-inspector-final-state")).toHaveText("Excluded");
  await expect(dialog.getByTestId("rule-inspector-details")).toContainText("Outer Wilds");

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await capture(page, testInfo, "rule-inspector-mobile");
});
