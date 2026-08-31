import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();
  await page.getByTestId("diary-view-kanban").click();
  await page.getByTestId("diary-kanban").waitFor();
});

const columnCount = (page: import("@playwright/test").Page) =>
  page.locator("[data-column-key]").count();

test("hide empty columns toggle hides empty columns and persists", async ({ page }) => {
  await expect.poll(() => columnCount(page)).toBe(4);
  await page.getByRole("button", { name: "View options" }).click();
  await page.getByLabel("Hide empty columns").check();
  await expect.poll(() => columnCount(page)).toBe(2);

  await page.reload();
  await page.getByRole("button", { name: "Diary" }).click();
  await page.getByTestId("diary-view-kanban").click();
  await expect.poll(() => columnCount(page)).toBe(2);
});

test("search filters kanban columns to matching columns", async ({ page }) => {
  await expect.poll(() => columnCount(page)).toBe(4);
  await page.locator("[data-diary-search]").first().fill("hades");
  await expect.poll(() => columnCount(page)).toBe(1);
  await expect(page.locator("[data-column-key='playing']")).toBeVisible();
  await page.locator("[data-diary-search]").first().fill("");
  await expect.poll(() => columnCount(page)).toBe(4);
});

test("columns popover board order arrows reorder the board", async ({ page }) => {
  await page.getByTestId("diary-kanban-columns-button").click();
  await page.getByTestId("diary-kanban-board-order").waitFor();
  await expect(page.getByTestId("diary-kanban-order-row-backlog")).toContainText("To play");
  await page.getByTestId("diary-kanban-order-right-backlog").click();
  await expect(page.locator("[data-column-key]").first()).toHaveAttribute("data-column-key", "playing");
  await expect(page.getByTestId("diary-kanban-order-row-playing")).toContainText("1");
});

test("ctrl+a toggles the focused column selection", async ({ page }) => {
  const column = page.locator("[data-column-key='playing']");
  await column.click({ position: { x: 30, y: 8 } });
  await page.keyboard.press("Control+a");
  await expect(page.getByTestId("diary-kanban-selection")).toBeVisible();
  await page.keyboard.press("Control+a");
  await expect(page.getByTestId("diary-kanban-selection")).toHaveCount(0);
});

test("add-game popover supports batch selection", async ({ page }) => {
  await page.evaluate(async () => {
    const { useDiaryStore } = await import("/src/stores/diaryStore.ts");
    useDiaryStore.getState().clearBulkDiaryState([1145360, 753640]);
  });
  await expect(page.getByTestId("diary-kanban-card-1145360")).toHaveCount(0);

  await page.getByRole("button", { name: "Add game: Finished" }).click();
  await page.getByTestId("diary-kanban-addgame-popover").waitFor();
  await page.getByTestId("diary-kanban-addgame-select-1145360").click();
  await page.getByTestId("diary-kanban-addgame-select-753640").click();
  await page.getByTestId("diary-kanban-addgame-add-selected").click();
  await expect(page.getByTestId("diary-kanban-column-finished")).toContainText("Hades");
  await expect(page.getByTestId("diary-kanban-column-finished")).toContainText("Outer Wilds");
});

test("column sort menu reorders cards and the direction icon inverts", async ({ page }) => {
  const firstCardName = () =>
    page.locator("[data-column-key='backlog'] [data-kanban-card]").first().textContent();

  await page.locator("[data-column-key='backlog']").click({ button: "right", position: { x: 160, y: 12 } });
  await page.getByTestId("diary-kanban-column-menu").waitFor();
  await page.getByLabel("Column sort").click();
  await page.getByRole("option", { name: "Name" }).click();
  await expect.poll(firstCardName).toContain("DEATH STRANDING 2");

  await page.getByTestId("diary-kanban-sort-direction-backlog").click();
  await expect.poll(firstCardName).toContain("S.T.A.L.K.E.R. 2");
});
