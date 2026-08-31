import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).waitFor();
});

test("ctrl+k opens the palette and opens a tool", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette").waitFor();
  await page.getByTestId("command-palette-input").fill("stat");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
  await expect(page.getByText("Library Statistics", { exact: true }).first()).toBeVisible();
});

test("palette opens a game detail", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette-input").fill("hades");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("game-detail-tabs")).toBeVisible();
});

test("escape closes the palette", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
});
