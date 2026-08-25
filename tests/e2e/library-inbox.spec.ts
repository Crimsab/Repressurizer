import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

async function seedInbox(page: Page) {
  await page.evaluate(async () => {
    const { useLibraryInboxStore } = await import("/src/stores/libraryInboxStore.ts");
    const base = { occurredAt: Date.now() - 60_000, lastObservedAt: Date.now(), status: "unread" as const, snoozedUntil: null, confidence: "high" as const };
    useLibraryInboxStore.setState({
      hydrated: true,
      events: [
        { ...base, id: "new", kind: "games-added", category: "library", importance: "important", source: "Steam Web API", recommendedAction: "review", appIds: [1145360], count: 1 },
        { ...base, id: "diary", kind: "diary-started-not-started", category: "diary", importance: "important", source: "Steam playtime + Diary", recommendedAction: "fix-diary", appIds: [1145360], count: 1, context: "1145360" },
        { ...base, id: "provider", kind: "provider-error", category: "provider", importance: "error", source: "hltb", recommendedAction: "refresh-provider", appIds: [], count: 0, provider: "hltb", context: "rate-limited" },
      ],
      history: [],
      disabledCategories: [],
    });
  });
}

async function openInbox(page: Page) {
  const direct = page.getByRole("button", { name: "Library Changes Inbox" });
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("menuitem", { name: "Library Changes Inbox" }).click();
  }
  return page.getByRole("dialog", { name: "Library Changes Inbox" });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("Inbox filters, previews bulk actions, and records reversible Diary fixes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await seedInbox(page);
  const dialog = await openInbox(page);

  await expect(dialog.getByTestId("inbox-event-games-added")).toBeVisible();
  await dialog.getByRole("button", { name: "Errors" }).click();
  await expect(dialog.getByTestId("inbox-event-provider-error")).toBeVisible();
  await dialog.getByRole("button", { name: "New" }).click();

  await dialog.getByTestId("inbox-event-games-added").getByRole("checkbox").check();
  await dialog.getByTestId("inbox-event-diary-started-not-started").getByRole("checkbox").check();
  await dialog.locator("footer").getByRole("button", { name: "Accept" }).click();
  await expect(dialog.getByRole("alertdialog", { name: "Preview bulk action" })).toContainText("2 Inbox items");
  await dialog.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();

  const state = await page.evaluate(async () => {
    const { useLibraryInboxStore } = await import("/src/stores/libraryInboxStore.ts");
    const { useStatusStore } = await import("/src/stores/statusStore.ts");
    const { useDiaryActionHistoryStore } = await import("/src/stores/diaryActionHistoryStore.ts");
    return {
      statuses: useLibraryInboxStore.getState().events.map((event) => [event.id, event.status]),
      gameStatus: useStatusStore.getState().statuses[1145360],
      diaryHistory: useDiaryActionHistoryStore.getState().entries.length,
    };
  });
  expect(state.statuses).toEqual(expect.arrayContaining([["new", "accepted"], ["diary", "accepted"]]));
  expect(state.gameStatus).toBe("playing");
  expect(state.diaryHistory).toBeGreaterThan(0);

  await capture(page, testInfo, "library-inbox-desktop");
});

test("Inbox preferences and filters remain usable on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await seedInbox(page);
  const dialog = await openInbox(page);
  await dialog.getByRole("button", { name: "Notification categories" }).click();
  await expect(dialog.getByTestId("inbox-preferences")).toBeVisible();
  await dialog.getByText("Provider errors", { exact: true }).locator("..").getByRole("checkbox").uncheck();

  const disabled = await page.evaluate(async () => {
    const { useLibraryInboxStore } = await import("/src/stores/libraryInboxStore.ts");
    return useLibraryInboxStore.getState().disabledCategories;
  });
  expect(disabled).toContain("provider");
  const overflow = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await capture(page, testInfo, "library-inbox-mobile");
});
