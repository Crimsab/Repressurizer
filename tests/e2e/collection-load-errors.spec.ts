import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test("failed collection refresh reports the database error and preserves the loaded library", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await expect(page.locator(".game-card").first()).toBeVisible();
  const before = await page.locator(".game-card").count();
  await page.evaluate(() => {
    const runtime = (window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
    }).__TAURI_INTERNALS__;
    const original = runtime.invoke;
    runtime.invoke = async (command, args) => {
      if (command === "load_collections") throw new Error("Steam collection database cannot be read");
      return original(command, args);
    };
  });
  const refresh = page.getByRole("button", { name: /refresh.*library/i }).first();
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect(page.getByText(/Steam collection database cannot be read/).first()).toBeVisible();
  await expect(page.locator(".game-card")).toHaveCount(before);
});
