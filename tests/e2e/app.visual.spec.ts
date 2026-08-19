import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";
import type { Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > root.clientWidth + 1 || rect.left < -1;
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.clientWidth + 1
  );
}


async function pointerDragToColumn(page: import("@playwright/test").Page, cardTestId: string, columnIdentifier: string) {
  const card = page.getByTestId(cardTestId);
  const column = columnIdentifier.startsWith("diary-kanban-column-")
    ? page.getByTestId(columnIdentifier)
    : page.locator(`[data-column-name="${columnIdentifier}"]`);
  const cardBox = await card.boundingBox();
  const columnBox = await column.boundingBox();
  if (!cardBox || !columnBox) throw new Error(`Missing box for ${cardTestId} or ${columnIdentifier}`);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 15, cardBox.y + 25, { steps: 5 });
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + columnBox.height / 2, { steps: 12 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test.describe("Linux setup", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36",
  });

  test("shows a Linux Steam path during first-run setup", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
      useSettingsStore.getState().setSettings({ setupComplete: false, steamPath: "" });
    });

    const pathInput = page.getByPlaceholder("/home/you/.local/share/Steam");
    await expect(pathInput).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const screenshotPath = testInfo.outputPath("linux-setup.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("linux-setup", { path: screenshotPath, contentType: "image/png" });
  });
});

test.describe("macOS setup", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15",
  });

  test("shows the standard macOS Steam path during first-run setup", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
      useSettingsStore.getState().setSettings({ setupComplete: false, steamPath: "" });
    });

    await expect(page.getByPlaceholder("/Users/you/Library/Application Support/Steam")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.waitForTimeout(350);

    const screenshotPath = testInfo.outputPath("macos-setup.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("macos-setup", { path: screenshotPath, contentType: "image/png" });
  });
});

test("loads the main library surface with mocked Steam data", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Repressurizer" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^All\s+\d+$/ })).toBeVisible();
  await expect(page.getByText("Disco Elysium")).toBeVisible();
  await expect(page.getByText("Hades")).toBeVisible();
  await expect(page.getByText("It Takes Two")).toBeVisible();
  await expect(page.getByText("DEATH STRANDING 2")).toBeVisible();
  await expect(page.getByText("DRAGON QUEST VII")).toBeVisible();
  await expect(page.getByText("S.T.A.L.K.E.R. 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "FINAL FANTASY VII", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grand Theft Auto III", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grand Theft Auto III – The Definitive Edition", exact: true })).toBeVisible();
  await expect(page.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Diary" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Steam Family" })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  const cards = page.locator(".game-card");
  await expect(cards).toHaveCount(11);
  for (let i = 0; i < 11; i += 1) {
    const box = await cards.nth(i).boundingBox();
    expect(box?.width).toBeGreaterThan(180);
    expect(box?.height).toBeGreaterThan(120);
  }
  await expect
    .poll(() => page.locator(".game-card img").first().evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator(".game-card img").evaluateAll((images) =>
        images.filter((img) => (img as HTMLImageElement).naturalWidth > 0).length
      )
    )
    .toBeGreaterThanOrEqual(9);

  const screenshotPath = testInfo.outputPath("dashboard.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("dashboard", { path: screenshotPath, contentType: "image/png" });
});

test("opens the gaming backlog diary workspace", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();

  await expect(page.getByTestId("diary-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diary", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search your backlog" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter by status" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Filter by category:/ })).toBeVisible();
  await expect(page.getByTestId("diary-game-632470")).toBeVisible();
  await expect(page.getByTestId("diary-library-grid")).toBeVisible();
  await page.getByTestId("diary-view-list").click();
  await expect(page.getByTestId("diary-library-list")).toBeVisible();

  await page.getByTestId("diary-game-632470").click();
  await page.getByRole("button", { name: "Play now" }).click();
  await expect(page.getByTestId("diary-section-rail")).toBeVisible();
  await expect(page.getByText("Pages", { exact: true })).toBeVisible();
  await expect(page.getByTestId("diary-game-632470")).toContainText("In progress");

  const resizeHandle = page.getByRole("button", { name: "Resize game list" });
  const beforeWidth = await page.getByTestId("diary-game-list").evaluate((element) => element.parentElement?.getBoundingClientRect().width ?? 0);
  const handleBox = await resizeHandle.boundingBox();
  if (handleBox) {
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 34, handleBox.y + 80);
    await page.mouse.up();
    await expect.poll(() => page.getByTestId("diary-game-list").evaluate((element) => element.parentElement?.getBoundingClientRect().width ?? 0)).toBeGreaterThan(beforeWidth + 20);
  }

  await expectNoHorizontalOverflow(page);
  const screenshotPath = testInfo.outputPath("diary-workspace.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("diary-workspace", { path: screenshotPath, contentType: "image/png" });
});

test("finish prompts only fire for observed threshold crossings and support skip-all", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useHltbStore } = await import("/src/stores/hltbStore.ts");
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    useHltbStore.getState().setBulkData({
      // Disco Elysium: 12h played, session crossed the 11h estimate -> prompt.
      632470: { main_story: 11, main_extra: null, completionist: null },
      // Hades: 30h played against a 100h estimate -> no prompt.
      1145360: { main_story: 100, main_extra: null, completionist: null },
      // GTA III: 1.5h played, session crossed the 1h estimate -> prompt.
      12100: { main_story: 1, main_extra: null, completionist: null },
    });
    useSettingsStore.getState().setSettings({ showDiary: true, diaryFinishedPrompts: true });
    useCategoryStore.getState().setActiveCategory("all");
  });

  const prompt = page.getByRole("dialog", { name: "Mark this game as finished?" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Disco Elysium");
  // GTA III is queued behind the active Disco Elysium prompt.
  await expect(prompt.getByTestId("diary-finishprompt-pending")).toContainText("1");
  await expect(prompt.getByTestId("diary-finishprompt-skip-all")).toBeVisible();

  // The rating reaches any value from 1 to 10.
  await prompt.getByRole("button", { name: /Your rating 7:/ }).click();
  await expect(prompt.getByText("7/10")).toBeVisible();

  await prompt.getByTestId("diary-finishprompt-skip-all").click();
  await expect(prompt).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(prompt).toHaveCount(0);

  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const { useSettingsStore } = await import("/src/stores/settingsStore.ts");
    useCategoryStore.getState().setActiveCategory("diary");
    useSettingsStore.getState().setSettings({ showDiary: false });
  });
  await expect(page.getByRole("button", { name: "Diary" })).toHaveCount(0);
  await expect(page.getByTestId("diary-workspace")).toHaveCount(0);
});

test("Diary uses real game art, scoped Markdown pages, 1-10 scores, and timestamped notes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();
  await page.evaluate(async () => {
    const { useHltbStore } = await import("/src/stores/hltbStore.ts");
    useHltbStore.getState().setBulkData({ 632470: { main_story: 24, main_extra: 31, completionist: 46 } });
  });
  await page.getByTestId("diary-game-632470").click();

  await expect(page.getByTestId("diary-hero-image")).toBeVisible();
  await expect(page.getByTestId("diary-hero-image").locator("img")).toHaveAttribute("src", /632470/);
  await expect(page.getByTestId("diary-rating-input")).toBeVisible();
  await page.getByTestId("diary-rating-input").fill("8");
  await expect(page.getByText("8/10", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("diary-inspector")).toContainText("24h");

  await page.getByTestId("diary-add-section").click();
  await page.getByTestId("diary-section-name").fill("Quotes");
  await page.getByRole("combobox", { name: "Start with" }).selectOption("default-quotes");
  await page.getByTestId("diary-page-scope").selectOption("all");
  await page.getByRole("button", { name: "Create page" }).click();
  const editor = page.getByTestId("diary-markdown-editor");
  await expect(editor).toBeVisible();
  await editor.fill("# Quotes\n\n> The Pale still sings.\n\n| Moment | Score |\n| --- | --- |\n| Finale | 10 |\n\n- [x] Finished");
  await expect(page.getByText("Saved automatically", { exact: true })).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Redo" })).toBeVisible();
  const pageScreenshotPath = testInfo.outputPath("diary-markdown-page.png");
  await page.screenshot({ path: pageScreenshotPath, fullPage: true });
  await testInfo.attach("diary-markdown-page", { path: pageScreenshotPath, contentType: "image/png" });

  await page.getByTestId("diary-section-overview").click();
  await page.getByTestId("diary-overview-edit").click();
  await page.getByRole("textbox", { name: "Overview" }).fill("## Final thoughts\n\nThe dialogue still hits harder than I expected.");
  await expect(page.getByText("Saved automatically", { exact: true })).toBeVisible({ timeout: 3_000 });
  await page.getByTestId("diary-game-1145360").click();
  await page.getByTestId("diary-game-632470").click();
  await page.getByTestId("diary-overview-edit").click();
  await expect(page.getByRole("textbox", { name: "Overview" })).toHaveValue(/Final thoughts/);
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("button", { name: "Restore" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Version history" }).click();
  await page.getByTestId("diary-section-journal").click();
  await page.getByRole("textbox", { name: "Quick note / recap" }).fill("The tribunal changed everything.");
  await page.locator('input[type="datetime-local"]').fill("2026-11-17T20:00");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("The tribunal changed everything.", { exact: true })).toBeVisible();
  await expect(page.getByText(/At 12h played/)).toBeVisible();
  await page.getByRole("button", { name: "Export Diary" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export Diary" });
  await exportDialog.getByTestId("diary-export-run").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("repressurizer-last-written-text") ?? "")).toContain('"games"');
  // Folder layout writes a bundle through the Rust command.
  await exportDialog.getByRole("button", { name: "Folder archive" }).click();
  await exportDialog.getByTestId("diary-export-run").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("repressurizer-last-export-bundle") ?? "")).toContain("index.json");
  await exportDialog.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(350);
  const journalScreenshotPath = testInfo.outputPath("diary-notebook.png");
  await page.screenshot({ path: journalScreenshotPath, fullPage: true });
  await testInfo.attach("diary-notebook", { path: journalScreenshotPath, contentType: "image/png" });
  await page.getByRole("button", { name: "View options" }).click();
  await page.getByRole("button", { name: /Date format:/ }).click();
  await page.getByRole("option", { name: "ISO 8601" }).click();
  await page.waitForTimeout(200);
  await expect(page.getByText("2026-11-17 20:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View options" }).click();

  await page.getByTestId("diary-game-1145360").click();
  await expect(page.getByTestId("diary-hero-image").locator("img")).toHaveAttribute("src", /1145360/);
  await expect(page.getByRole("button", { name: "Quotes" })).toBeVisible();
  await expect(page.getByText("Open games", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(350);

  const screenshotPath = testInfo.outputPath("diary-notebook-tabs.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("diary-journal-tabs", { path: screenshotPath, contentType: "image/png" });
});

test("Diary templates resolve game data and support persistent CRUD", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();
  await page.getByTestId("diary-game-632470").click();
  await page.getByTestId("diary-overview-edit").click();
  const overview = page.getByRole("textbox", { name: "Overview" });

  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: /^Advanced review/ }).click();
  await expect(overview).toHaveValue(/# Review — Disco Elysium - The Final Cut/);
  await expect(overview).toHaveValue(/Playtime \| 12h/);
  await expect(overview).toHaveValue(/Last played/);

  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Manage templates" }).click();
  let dialog = page.getByRole("dialog", { name: "Manage templates" });
  await expect(dialog).toBeVisible();
  const screenshotPath = testInfo.outputPath("diary-template-manager.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("diary-template-manager", { path: screenshotPath, contentType: "image/png" });

  await dialog.getByRole("button", { name: "New template", exact: true }).click();
  await dialog.getByTestId("diary-template-name").fill("Session wrap-up");
  await dialog.getByTestId("diary-template-description").fill("A compact custom recap");
  await dialog.getByTestId("diary-template-markdown").fill("## <game_title>\n\nPlayed: <playtime>\n\n<custom_tag>");
  await dialog.getByRole("button", { name: "<rating>", exact: true }).dragTo(dialog.getByTestId("diary-template-markdown"));
  await expect(dialog.getByTestId("diary-template-markdown")).toHaveValue(/<rating>/);
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog.getByRole("button", { name: /^Session wrap-up/ })).toBeVisible();
  await dialog.getByTestId("diary-template-description").fill("Updated custom recap");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await dialog.getByRole("button", { name: "Use template" }).click();
  await expect(overview).toHaveValue(/Played: 12h/);
  await expect(overview).toHaveValue(/<custom_tag>/);

  await page.reload();
  await page.getByRole("button", { name: "Diary" }).click();
  await page.getByTestId("diary-game-632470").click();
  await page.getByTestId("diary-overview-edit").click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Session wrap-up/ })).toBeVisible();
  await page.getByRole("button", { name: "Manage templates" }).click();
  dialog = page.getByRole("dialog", { name: "Manage templates" });
  await dialog.getByRole("button", { name: /^Advanced review/ }).click();
  await dialog.getByRole("button", { name: "Duplicate" }).click();
  await expect(dialog.getByTestId("diary-template-name")).toHaveValue(/Copy/);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: /^Session wrap-up/ }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByRole("button", { name: /^Session wrap-up/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("Diary kanban board moves cards and the timeline lists diary events", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();
  await expect(page.getByTestId("diary-workspace")).toBeVisible();

  await page.getByTestId("diary-view-kanban").click();
  await expect(page.getByTestId("diary-kanban")).toBeVisible();
  await expect(page.getByTestId("diary-kanban-column-backlog")).toContainText("Outer Wilds");
  await expect(page.getByTestId("diary-kanban-column-playing")).toContainText("Disco Elysium");

  await pointerDragToColumn(page, "diary-kanban-card-753640", "diary-kanban-column-finished");
  await expect(page.getByTestId("diary-kanban-column-finished")).toContainText("Outer Wilds");
  await expect(page.getByTestId("diary-kanban-column-backlog")).not.toContainText("Outer Wilds");

  // Multi-select via ctrl-click, then move everything through the right-click menu.
  await page.getByTestId("diary-kanban-card-1145360").click();
  await expect(page.getByTestId("diary-kanban-selection")).toContainText("1");
  await page.getByTestId("diary-kanban-card-632470").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("diary-kanban-selection")).toContainText("2");
  await page.getByTestId("diary-kanban-card-1145360").click({ button: "right" });
  await expect(page.getByTestId("diary-kanban-context-menu")).toBeVisible();
  await page.getByTestId("diary-kanban-move-finished").click();
  await expect(page.getByTestId("diary-kanban-column-finished")).toContainText("Hades");
  await expect(page.getByTestId("diary-kanban-column-finished")).toContainText("Disco Elysium");
  await expect(page.getByTestId("diary-kanban-selection")).toHaveCount(0);

  // Double-click opens the game notebook.
  await page.getByTestId("diary-kanban-card-753640").dblclick();
  await expect(page.getByTestId("diary-hero-image")).toBeVisible();
  await expect(page.getByTestId("diary-hero-image").locator("img")).toHaveAttribute("src", /753640/);
  await page.getByRole("button", { name: "All diary games" }).click();
  await expect(page.getByTestId("diary-library")).toBeVisible();

  // Column headers are always tinted with the column color (defaults mirror statuses).
  await page.getByTestId("diary-view-kanban").click();
  await expect(page.getByTestId("diary-kanban-column-header-backlog")).toHaveAttribute("style", /rgba\(251, 191, 36/);

  // The dedicated Columns popover customizes colors and visibility.
  await page.getByTestId("diary-kanban-columns-button").click();
  await expect(page.getByTestId("diary-kanban-columns-popover")).toBeVisible();
  await page.getByTestId("diary-column-color-finished").click();
  await page.getByRole("button", { name: "#34d399" }).click();
  await expect(page.getByTestId("diary-kanban-column-header-finished")).toHaveAttribute("style", /rgba\(52, 211, 153/);
  await page.getByTestId("diary-kanban-columns-button").click();
  await page.getByTestId("diary-kanban-columns-button").click();
  await page.getByLabel("Show column: Abandoned").uncheck();
  await page.getByTestId("diary-kanban-columns-button").click();
  await expect(page.getByTestId("diary-kanban-column-abandoned")).toHaveCount(0);

  // WIP limit still lives in the view options.
  await page.getByRole("button", { name: "View options" }).click();
  await page.getByLabel("Max games in progress").fill("1");
  await page.getByRole("button", { name: "View options" }).click();
  await expect(page.getByTestId("diary-kanban-wip-over")).toBeVisible();

  // Custom columns: create one, fill it through the per-column add-game search and drag.
  await page.getByTestId("diary-kanban-columns-button").click();
  await page.getByTestId("diary-kanban-new-column-name").fill("To buy");
  await page.getByTestId("diary-kanban-new-column-add").click();
  await page.getByTestId("diary-kanban-columns-button").click();
  const toBuy = page.locator('[data-column-name="To buy"]');
  await expect(toBuy).toBeVisible();
  await toBuy.getByRole("button", { name: "Add game: To buy" }).click();
  await page.getByTestId("diary-kanban-addgame-search").fill("Outer");
  await page.getByTestId("diary-kanban-addgame-row-753640").click();
  await expect(toBuy).toContainText("Outer Wilds");
  await pointerDragToColumn(page, "diary-kanban-card-1145360", "To buy");
  await expect(toBuy).toContainText("Hades");

  const kanbanScreenshotPath = testInfo.outputPath("diary-kanban.png");
  await page.screenshot({ path: kanbanScreenshotPath, fullPage: true });
  await testInfo.attach("diary-kanban", { path: kanbanScreenshotPath, contentType: "image/png" });

  // Timeline: three layouts plus event filters.
  await page.getByTestId("diary-view-timeline").click();
  await expect(page.getByTestId("diary-timeline")).toBeVisible();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]').filter({ hasText: "Hades" })).toBeVisible();
  await page.getByTestId("diary-timeline-layout-cards").click();
  await expect(page.getByTestId("diary-timeline-game-1145360").first()).toBeVisible();
  await expect(page.getByTestId("diary-timeline-game-1145360").first()).toBeVisible();
  await expect(page.locator('[data-testid="diary-timeline-event-cardsrow"][data-kind="session"]').first()).toBeVisible();
  await page.getByTestId("diary-timeline-layout-compact").click();
  await expect(page.locator('[data-testid="diary-timeline-event-compact"][data-kind="session"]').filter({ hasText: "Hades" })).toBeVisible();
  await page.getByTestId("diary-timeline-layout-rail").click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="status"]').filter({ hasText: "Hades" })).toBeVisible();

  // Days collapse like accordions, and the rail groups each game's events together.
  const dayToggle = page.locator('[data-testid^="diary-timeline-day-toggle-"]').first();
  await dayToggle.click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="status"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]').first()).toBeVisible();
  await dayToggle.click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="status"]')).not.toHaveCount(0);
  const hadesGroupToggles = page.getByRole("button", { name: /Show or hide this game's events: Hades/ });
  const hadesToggleCount = await hadesGroupToggles.count();
  for (let index = 0; index < hadesToggleCount; index += 1) await hadesGroupToggles.nth(index).click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]').filter({ hasText: "Hades" })).toHaveCount(0);
  for (let index = 0; index < hadesToggleCount; index += 1) await hadesGroupToggles.nth(index).click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]').filter({ hasText: "Hades" })).toBeVisible();

  // Achievement unlock dates load on demand from the sync button and appear per game.
  await page.getByTestId("diary-timeline-sync").click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="achievement"]').filter({ hasText: "Begin" }).first()).toBeVisible();
  await page.getByTestId("diary-timeline-filter-achievement").click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="achievement"]')).toHaveCount(0);
  await page.getByTestId("diary-timeline-filter-achievement").click();

  await page.getByTestId("diary-timeline-filter-session").click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]')).toHaveCount(0);
  await page.getByTestId("diary-timeline-filter-session").click();
  await expect(page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]').filter({ hasText: "Hades" })).toBeVisible();

  const timelineScreenshotPath = testInfo.outputPath("diary-timeline.png");
  await page.screenshot({ path: timelineScreenshotPath, fullPage: true });
  await testInfo.attach("diary-timeline", { path: timelineScreenshotPath, contentType: "image/png" });

  await page.locator('[data-testid="diary-timeline-event-rail"][data-kind="session"]').filter({ hasText: "Hades" }).getByRole("button", { name: /Hades/ }).first().click();
  await expect(page.getByTestId("diary-hero-image")).toBeVisible();
  await expect(page.getByTestId("diary-hero-image").locator("img")).toHaveAttribute("src", /1145360/);
});

test("diary extras: months, game timeline, custom chip, full-text search, persisted filters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();
  await page.evaluate(async () => {
    const { useDiaryStore } = await import("/src/stores/diaryStore.ts");
    useDiaryStore.getState().addJournalEntry(632470, "Uniquetribunalword for search", Date.now(), 720);
    const columnId = useDiaryStore.getState().addCustomColumn("Wishlist", "#34d399");
    if (columnId) useDiaryStore.getState().setCustomAssignment(1145360, columnId);
    useDiaryStore.getState().setAchievements(1145360, [
      { apiName: "ACH_X", name: "First Blood", unlockedAt: Math.floor(Date.now() / 1000) - 3600, icon: null },
    ]);
  });

  // Full-text search finds a game through its diary content, not just metadata.
  await page.getByRole("searchbox", { name: "Search your backlog" }).fill("uniquetribunalword");
  await expect(page.getByTestId("diary-game-632470")).toBeVisible();
  await expect(page.getByTestId("diary-game-1145360")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search your backlog" }).fill("");

  // Notebook: custom column chip with removal, plus the per-game timeline tab.
  await page.getByTestId("diary-game-1145360").click();
  await expect(page.getByTestId("diary-custom-column-chip")).toContainText("Wishlist");
  await page.getByTestId("diary-section-gametimeline").click();
  await expect(page.getByTestId("diary-gametimeline")).toBeVisible();
  await expect(page.getByTestId("diary-gametimeline")).toContainText("65 min session");
  await page.getByTestId("diary-section-overview").click();
  await page.getByTestId("diary-custom-column-chip").getByRole("button").click();
  await expect(page.getByTestId("diary-custom-column-chip")).toHaveCount(0);
  await page.getByRole("button", { name: "All diary games" }).click();

  // Timeline: month stepper and filters persisted across view switches.
  await page.getByTestId("diary-view-timeline").click();
  await expect(page.getByTestId("diary-timeline-months")).toBeVisible();
  await expect(page.getByTestId("diary-timeline-months")).toContainText("August");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByTestId("diary-timeline-months")).toContainText("April");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByTestId("diary-timeline-months")).toContainText("August");

  await page.getByTestId("diary-timeline-filter-achievement").click();
  await expect(page.getByTestId("diary-timeline").locator('[data-kind="achievement"]')).toHaveCount(0);
  await page.getByTestId("diary-view-kanban").click();
  await page.getByTestId("diary-view-timeline").click();
  await expect(page.getByTestId("diary-timeline").locator('[data-kind="achievement"]')).toHaveCount(0);
  await page.getByTestId("diary-timeline-filter-achievement").click();
  await expect(page.getByTestId("diary-timeline").locator('[data-kind="achievement"]').first()).toBeVisible();
});

test("diary backups can be created, listed, and deleted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Diary" }).click();
  await page.getByTestId("diary-backup-button").click();
  const dialog = page.getByRole("dialog", { name: "Diary backups" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("No diary backups yet.")).toBeVisible();

  await dialog.getByLabel("Backup description (optional)").fill("Before kanban rework");
  await page.getByTestId("diary-backup-create").click();
  await expect(page.getByTestId("diary-backup-list")).toContainText("Before kanban rework");
  await expect(page.getByTestId("diary-backup-list")).toContainText("7 files");

  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByTestId("diary-backup-list").getByRole("button", { name: /^Delete: diary-backup-/ }).click();
  await expect(dialog.getByText("No diary backups yet.")).toBeVisible();
});

test("portable builds explain manual updates without offering in-place installation", async ({ page }, testInfo) => {
  await page.goto("/?updater-kind=windows-portable");
  await page.getByRole("button", { name: "Settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "About", exact: true }).click();

  await expect(settingsDialog.getByText("Portable builds do not update in place.", { exact: false })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Open GitHub Releases" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  await expect(settingsDialog.getByText("Automatically check for updates")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("portable-updates.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("portable-updates", { path: screenshotPath, contentType: "image/png" });
});

test("keeps every header action reachable at the minimum window size", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Repressurizer" })).toBeVisible();
  const setup = await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    useCategoryStore.getState().addCategory("Minimum Width Dirty State");
  });

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBe(0);

  await page.getByRole("button", { name: "More tools" }).click();
  await expect(page.getByRole("tooltip", { name: "More tools" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Statistics" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Auto-Categorize/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
});

test("shows accessible toolbar tooltips with available shortcuts", async ({ page }) => {
  await page.goto("/");

  const settings = page.getByRole("button", { name: "Settings" });
  await settings.hover();
  await expect(page.getByRole("tooltip", { name: "Settings" })).toBeVisible();

  const settingsBox = await settings.boundingBox();
  const tooltipBox = await page.getByRole("tooltip", { name: "Settings" }).boundingBox();
  expect(settingsBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  expect(Math.abs(
    (tooltipBox!.x + tooltipBox!.width / 2) - (settingsBox!.x + settingsBox!.width / 2),
  )).toBeLessThan(100);

  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    useCategoryStore.getState().addCategory("Shortcut Test");
  });
  const undo = page.getByRole("button", { name: "Undo" });
  await undo.focus();
  await expect(page.getByRole("tooltip", { name: "Undo (Ctrl+Z)" })).toBeVisible();
});

test("workspace reports use the persistent resizable dialog surface", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Repressurizer" })).toBeVisible();

  await page.getByRole("button", { name: "Statistics" }).click();
  await expect(page.locator('[data-resizable-dialog="statistics"]')).toBeVisible();
  await page.getByRole("dialog", { name: "Statistics" }).getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.locator('[data-resizable-dialog="export"]')).toBeVisible();
});

test("dialogs trap focus, close with Escape, and restore focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Repressurizer" })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Settings" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-resizable-dialog="settings"]')).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Maximize dialog" })).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect.poll(() =>
    page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("supports regex search and advanced duplicate filters", async ({ page }) => {
  await page.goto("/");

  await page.locator("[data-search-input]").fill("/disco.*elysium/i");
  await expect(page.getByText("Disco Elysium")).toBeVisible();
  await expect(page.getByText("Hades")).toBeHidden();
  await expect(page.locator(".game-card")).toHaveCount(1);

  await page.locator("[data-search-input]").fill("");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Advanced Filters" })).toBeVisible();
  await page.getByRole("button", { name: "Possible duplicates" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Grand Theft Auto III", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grand Theft Auto III – The Definitive Edition", exact: true })).toBeVisible();
  await expect(page.getByText("Disco Elysium")).toBeHidden();
  await expect(page.locator(".game-card")).toHaveCount(2);
});

test("filters the library and export preview by installation state", async ({ page }) => {
  await page.goto("/");

  const installation = () => page.getByRole("button", { name: /^Installation:/ });
  await expect(installation()).toHaveAccessibleName("Installation: All");
  await expect(installation()).toBeEnabled();
  await installation().click();
  await page.getByRole("listbox").getByRole("option", { name: "Installed only", exact: true }).click();

  await expect(page.locator(".game-card")).toHaveCount(3);
  await expect(page.locator(".game-card").filter({ hasText: "Disco Elysium" })).toHaveCount(1);
  await expect(page.locator(".game-card").filter({ hasText: "Hades" })).toHaveCount(1);
  await expect(page.locator(".game-card").filter({ hasText: "FINAL FANTASY VII" }).first()).toHaveCount(1);
  await expect(page.locator(".game-card").filter({ hasText: "Outer Wilds" })).toHaveCount(0);

  await installation().click();
  await page.getByRole("listbox").getByRole("option", { name: "Not installed", exact: true }).click();
  await expect(page.locator(".game-card")).toHaveCount(8);
  await expect(page.locator(".game-card").filter({ hasText: "Disco Elysium" })).toHaveCount(0);
  await expect(page.locator(".game-card").filter({ hasText: "Outer Wilds" })).toHaveCount(1);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  const exportInstallation = dialog.getByRole("button", { name: "Installation: All", exact: true });
  await expect(exportInstallation).toBeEnabled();
  await exportInstallation.click();
  await dialog.getByRole("listbox").getByRole("option", { name: "Installed only", exact: true }).click();

  const previewGames = dialog.getByText("Games", { exact: true }).locator("..");
  await expect(previewGames.getByText("3", { exact: true })).toBeVisible();
});

test("keeps advanced category filters compact and searchable", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    useCategoryStore.getState().setCollections(
      Array.from({ length: 12 }, (_, index) => ({
        id: `advanced-${index + 1}`,
        key: `user-collections.advanced-${index + 1}`,
        name: `Advanced Collection ${index + 1}`,
        added: [],
        removed: [],
        timestamp: 1,
        is_deleted: false,
        is_dynamic: false,
      }))
    );
  });

  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Advanced Filters" });
  const categories = dialog.getByRole("button", { name: /Categories 0\/12 selected/ });

  await expect(categories).toBeVisible();
  await expect(dialog.getByText("Advanced Collection 12", { exact: true })).toHaveCount(0);
  await categories.click();
  await dialog.getByPlaceholder("Search categories...").fill("Collection 12");
  await expect(dialog.getByText("Advanced Collection 12", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Advanced Collection 1", { exact: true })).toHaveCount(0);
});

test("AutoCat shows cached metadata suggestions and preview sorting controls", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const makeDetail = (
      appId: number,
      name: string,
      categories: string[],
      supportedLanguages = ["English"]
    ) => ({
      app_id: appId,
      name,
      genres: ["Adventure"],
      categories,
      release_date: "Jan 1, 2020",
      metacritic_score: null,
      developers: ["Demo Studio"],
      publishers: ["Demo Publisher"],
      supported_languages: supportedLanguages,
      platforms: { windows: true, mac: false, linux: false },
      header_image: null,
      capsule_image: null,
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
    });

    const details = {
      632470: makeDetail(632470, "Disco Elysium - The Final Cut", ["Single-player", "Steam Cloud"], ["English", "French"]),
      1145360: makeDetail(1145360, "Hades", ["Single-player", "Steam Achievements", "Steam Cloud"], ["English", "Italian"]),
      753640: makeDetail(753640, "Outer Wilds", ["Single-player"], ["English"]),
      39140: makeDetail(39140, "FINAL FANTASY VII", ["Single-player", "Steam Cloud"], ["English", "German", "French"]),
      12100: makeDetail(12100, "Grand Theft Auto III", ["Single-player"], ["English", "Italian"]),
      1546970: makeDetail(1546970, "Grand Theft Auto III - The Definitive Edition", ["Single-player"], ["English"]),
      1462040: makeDetail(1462040, "FINAL FANTASY VII REMAKE INTERGRADE", ["Single-player"], ["English"]),
      3280350: makeDetail(3280350, "DEATH STRANDING 2: ON THE BEACH", ["Single-player"], ["English"]),
      2499860: makeDetail(2499860, "DRAGON QUEST VII Reimagined", ["Single-player"], ["English"]),
      1643320: makeDetail(1643320, "S.T.A.L.K.E.R. 2: Heart of Chornobyl", ["Single-player"], ["English"]),
      1426210: makeDetail(1426210, "It Takes Two", ["Shared/Split Screen Co-op"], ["English"]),
    };

    window.localStorage.setItem("repressurizer-mock-details-cache", JSON.stringify(details));
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Auto-Categorize/ }).click();

  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Auto-Categorize" }),
  });
  await expect(dialog.getByRole("button", { name: /By Genre/ })).toContainText("Game details");
  await expect(dialog.getByRole("button", { name: /By Year/ })).toContainText("Store release dates");
  await expect(dialog.getByRole("button", { name: /By Steam Reviews/ })).toContainText("Steam reviews");
  await dialog.getByRole("button", { name: /Store flags/ }).click();

  await expect(dialog.getByText(/Flags:\s*4/)).toBeVisible();
  await expect(dialog.getByText("11/11 games with metadata")).toBeVisible();

  await dialog.getByPlaceholder("Type and press Enter").click();
  await dialog.getByRole("button", { name: "Steam Cloud" }).click();
  await expect(dialog.getByText("Steam Cloud")).toBeVisible();

  await dialog.getByRole("button", { name: "Run" }).click();
  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await expect(dialog.getByText("(Flag) Steam Cloud")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Games", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Natural" }).click();
  await dialog.getByRole("button", { name: "Export diff" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Preview diff exported.");

  const exportedDiff = await page.evaluate(() =>
    window.localStorage.getItem("repressurizer-last-written-text")
  );
  expect(exportedDiff).toContain('"schema": "repressurizer.autocat-preview-diff"');
  expect(exportedDiff).toContain('"gamesProcessed": 11');
  expect(exportedDiff).toContain('"type": "flags"');
  expect(exportedDiff).not.toMatch(/mock-key|steamPath|apiKey|token|cookie/i);

  const screenshotPath = testInfo.outputPath("autocat-export-diff.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("autocat-export-diff", { path: screenshotPath, contentType: "image/png" });
});

test("AutoCat resizes accessibly and restores its saved dialog layout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Auto-Categorize/ }).click();

  const panel = page.locator('[data-resizable-dialog="auto-categorize"]');
  const autoCatDialog = page.getByRole("dialog", { name: "Auto-Categorize" });
  const resizeHandle = page.getByRole("button", { name: /Resize dialog/ });
  await expect(panel).toBeVisible();
  await expect(
    autoCatDialog.getByRole("button", { name: "Close", exact: true })
  ).toBeFocused();

  const initial = await panel.boundingBox();
  expect(initial?.width).toBeGreaterThanOrEqual(880);
  expect(initial?.height).toBeGreaterThanOrEqual(700);

  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(
    (handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2,
    (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    (handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2 + 32,
    (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2 + 24,
    { steps: 4 }
  );
  await page.mouse.up();
  const pointerResized = await panel.boundingBox();
  expect(pointerResized?.width).toBeCloseTo((initial?.width ?? 0) + 32, 1);
  expect(pointerResized?.height).toBeCloseTo((initial?.height ?? 0) + 24, 1);

  await resizeHandle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const resized = await panel.boundingBox();
  expect(resized?.width).toBeCloseTo((pointerResized?.width ?? 0) + 16, 1);
  expect(resized?.height).toBeCloseTo((pointerResized?.height ?? 0) + 16, 1);

  await autoCatDialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /Auto-Categorize/ }).click();
  const reopened = await panel.boundingBox();
  expect(reopened?.width).toBeCloseTo(resized?.width ?? 0, 1);
  expect(reopened?.height).toBeCloseTo(resized?.height ?? 0, 1);

  await page.getByRole("button", { name: "Maximize dialog" }).click();
  const maximized = await panel.boundingBox();
  expect(maximized?.width).toBeGreaterThan(1300);
  expect(maximized?.height).toBeGreaterThan(830);

  await page.getByRole("button", { name: "Restore dialog size" }).click();
  const restored = await panel.boundingBox();
  expect(restored?.width).toBeCloseTo(resized?.width ?? 0, 1);
  expect(restored?.height).toBeCloseTo(resized?.height ?? 0, 1);

  await page.getByRole("button", { name: "Reset dialog size" }).click();
  const reset = await panel.boundingBox();
  expect(reset?.width).toBe(920);
  expect(reset?.height).toBe(760);
});

test("AutoCat custom rule creates one category from a title condition", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Auto-Categorize/ }).click();

  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Auto-Categorize" }),
  });
  await dialog.getByRole("button", { name: /Custom rule/ }).click();
  await dialog.getByRole("button", { name: "Add custom condition" }).click();
  await expect(dialog.getByRole("option", { name: /Diary/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.getByPlaceholder("Short RPG not in Backlog").fill("Hades Custom");
  await dialog.getByRole("button", { name: "Title starts" }).click();
  await dialog.locator('input[value="A"]').fill("Hades");
  await dialog.getByRole("button", { name: "Run" }).click();

  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await expect(dialog.getByText("Hades Custom")).toBeVisible();
  await expect(dialog.getByText("1 games")).toBeVisible();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.getByText("Close", { exact: true }).click();

  await expect(page.getByRole("button", { name: /Hades Custom/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("AutoCat does not apply categories when its safety backup fails", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const target = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const originalInvoke = target.__TAURI_INTERNALS__.invoke;
    target.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === "create_manual_backup") {
        return Promise.reject(new Error("mock backup unavailable"));
      }
      return originalInvoke(command, args);
    };
  });

  await page.getByRole("button", { name: /Auto-Categorize/ }).click();
  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Auto-Categorize" }),
  });
  await dialog.getByRole("button", { name: /Custom rule/ }).click();
  await dialog.getByPlaceholder("Short RPG not in Backlog").fill("Blocked Apply");
  await dialog.getByRole("button", { name: "Title starts" }).click();
  await dialog.locator('input[value="A"]').fill("Hades");
  await dialog.getByRole("button", { name: "Run" }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("Backup failed; no categories were changed");
  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await dialog.locator('button[aria-label="Close"]').click();
  await expect(page.getByRole("button", { name: /Blocked Apply/ })).toHaveCount(0);

  await page.evaluate(async () => {
    const modulePath = "/src/stores/settingsStore.ts";
    const settingsModule = await import(modulePath);
    settingsModule.useSettingsStore.getState().setSettings({ steamPath: "" });
  });
  await page.getByRole("button", { name: /Auto-Categorize/ }).click();
  const missingPrerequisiteDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Auto-Categorize" }),
  });
  await expect(missingPrerequisiteDialog.getByText("Preview sort")).toBeVisible();
  await missingPrerequisiteDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(missingPrerequisiteDialog.getByRole("alert")).toContainText(
    "Steam path or account ID is unavailable"
  );
  await missingPrerequisiteDialog.locator('button[aria-label="Close"]').click();
  await expect(page.getByRole("button", { name: /Blocked Apply/ })).toHaveCount(0);
});

test("AutoCat Run all skips permanently ignored detail gaps", async ({ page }) => {
  await page.addInitScript(() => {
    const ignoredIds = [
      632470,
      753640,
      39140,
      12100,
      1546970,
      1462040,
      3280350,
      2499860,
      1643320,
      1426210,
    ];
    window.localStorage.setItem(
      "repressurizer-mock-failed-cache",
      JSON.stringify(Object.fromEntries(ignoredIds.map((id) => [id, 3])))
    );
    window.localStorage.setItem(
      "repressurizer-autocategorize",
      JSON.stringify({
        lastType: "flags",
        lastStep: "choose",
        presets: [
          {
            id: "ignored-details-regression",
            name: "By Store Flags",
            type: "flags",
            config: { prefix: "(Flag) ", included_flags: [] },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      })
    );
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Auto-Categorize/ }).click();
  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Auto-Categorize" }),
  });

  await dialog.getByRole("button", { name: /Run all/ }).click();

  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /\(Flag\) Single-player 1 games/ })
  ).toBeVisible();
});

test("AutoCat Run all ignores orphaned detail-cache entries", async ({ page }) => {
  await page.addInitScript(() => {
    const settings = JSON.parse(window.localStorage.getItem("repressurizer-settings") ?? "{}");
    settings.libraryRefreshCacheMode = "none";
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /All 11/ })).toBeVisible();
  await page.evaluate(async () => {
    const [{ useGameStore }, { useAutoCategorizeStore }, { useBackgroundFetchStore }] =
      await Promise.all([
        import("/src/stores/gameStore.ts"),
        import("/src/stores/autoCategorizeStore.ts"),
        import("/src/stores/backgroundFetchStore.ts"),
      ]);

    const now = Date.now();
    useBackgroundFetchStore.getState().stopDetailsFetch();
    useBackgroundFetchStore.getState().stopRatingsFetch();
    const detailsFor = (appId: number, name: string, categories: string[]) => ({
      app_id: appId,
      name,
      cache_schema: 2,
      fetched_at: now,
      genres: ["Adventure"],
      tags: [],
      categories,
      release_date: "Jan 1, 2020",
      metacritic_score: null,
      developers: ["Demo Studio"],
      publishers: ["Demo Publisher"],
      supported_languages: ["English"],
      platforms: { windows: true, mac: false, linux: false },
      header_image: null,
      capsule_image: null,
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
    });

    const games = Object.values(useGameStore.getState().games);
    useGameStore.getState().setBulkDetails([
      ...games.map((game) => detailsFor(game.appid, game.name, ["Single-player"])),
      detailsFor(288220, "Backstage Pass", ["Captions available"]),
    ]);

    useAutoCategorizeStore.getState().set({
      lastStep: "choose",
      presets: [
        {
          id: "issue-24-flags",
          name: "Store flags",
          type: "flags",
          config: { prefix: "(FLAGS) ", included_flags: [] },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  await page.getByRole("button", { name: /Auto-Categorize/ }).click();
  const dialog = page.getByRole("dialog", { name: "Auto-Categorize" });
  await dialog.getByRole("button", { name: /Run all/ }).click();
  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await expect(dialog.getByText("#288220", { exact: false })).toHaveCount(0);
  await expect(dialog.getByText("(FLAGS) Captions available", { exact: true })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByText("Done!", { exact: true })).toBeVisible();

  const orphanCategory = await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    return useCategoryStore.getState().collections.some(
      (item) => item.name === "(FLAGS) Captions available"
    );
  });
  expect(orphanCategory).toBe(false);
});

test("AutoCat preserves flag and tag memberships when metadata is incomplete", async ({ page }) => {
  await page.addInitScript(() => {
    const settings = JSON.parse(window.localStorage.getItem("repressurizer-settings") ?? "{}");
    settings.libraryRefreshCacheMode = "none";
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /All 11/ })).toBeVisible();
  await page.evaluate(async () => {
    const [
      { useGameStore },
      { useCategoryStore },
      { useAutoCategorizeStore },
      { useBackgroundFetchStore },
    ] =
      await Promise.all([
        import("/src/stores/gameStore.ts"),
        import("/src/stores/categoryStore.ts"),
        import("/src/stores/autoCategorizeStore.ts"),
        import("/src/stores/backgroundFetchStore.ts"),
      ]);

    useBackgroundFetchStore.getState().stopDetailsFetch();
    useBackgroundFetchStore.getState().stopRatingsFetch();
    useGameStore.getState().mergeGames([{
      appid: 34330,
      name: "Total War: SHOGUN 2",
      playtime_forever: 0,
      img_icon_url: null,
      rtime_last_played: 0,
      is_collection_only: true,
    }]);
    const now = Date.now();
    const games = Object.values(useGameStore.getState().games);
    useGameStore.getState().setBulkDetails(games.map((game) => ({
      app_id: game.appid,
      name: game.name,
      cache_schema: 2,
      fetched_at: now,
      genres: game.appid === 34330 ? ["Strategy"] : ["Adventure"],
      tags: [],
      categories: game.appid === 34330 ? ["Family Sharing"] : ["Single-player"],
      release_date: game.appid === 34330 ? "Mar 15, 2011" : "Jan 1, 2020",
      metacritic_score: game.appid === 34330 ? 90 : null,
      developers: [game.appid === 34330 ? "CREATIVE ASSEMBLY" : "Demo Studio"],
      publishers: [game.appid === 34330 ? "SEGA" : "Demo Publisher"],
      supported_languages: ["English"],
      platforms: { windows: true, mac: game.appid === 34330, linux: game.appid === 34330 },
      header_image: null,
      capsule_image: null,
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
    })));

    const collection = (key: string, name: string) => ({
      id: key,
      key: `user-collections.${key}`,
      name,
      added: [34330],
      removed: [],
      timestamp: 1,
      is_deleted: false,
      is_dynamic: false,
    });
    useCategoryStore.getState().setCollections([
      collection("lan-coop", "(FLAGS) LAN Co-op"),
      collection("local-coop", "(TAGS) Local Co-Op"),
    ]);
    useAutoCategorizeStore.getState().set({
      lastStep: "choose",
      presets: [
        {
          id: "issue-25-flags",
          name: "Store flags",
          type: "flags",
          config: { prefix: "(FLAGS) ", included_flags: ["LAN Co-op"] },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "issue-25-tags",
          name: "Community tags",
          type: "tags",
          config: { prefix: "(TAGS) ", max_tags: 0, included_tags: ["Local Co-Op"] },
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    });
  });

  await page.getByRole("button", { name: /Auto-Categorize/ }).click();
  const dialog = page.getByRole("dialog", { name: "Auto-Categorize" });
  await dialog.getByRole("button", { name: /Run all/ }).click();
  await expect(dialog.getByText("Preview sort")).toBeVisible();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByText("Done!", { exact: true })).toBeVisible();

  const result = await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const collections = useCategoryStore.getState().collections;
    return {
      flags: collections.find((item) => item.name === "(FLAGS) LAN Co-op")?.added,
      tags: collections.find((item) => item.name === "(TAGS) Local Co-Op")?.added,
      tagFallback: collections.some((item) => item.name === "(TAGS) Family Sharing"),
    };
  });
  expect(result).toEqual({ flags: [34330], tags: [34330], tagFallback: false });
});

test("creates a category from the compact sidebar plus button", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.sidebarWidth = 160;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await page.getByRole("button", { name: "New Category" }).click();
  await page.getByPlaceholder("Category name").fill("Dishonored");
  await page.getByRole("button", { name: "Create category" }).click();

  await expect(page.getByRole("button", { name: /Dishonored/ })).toBeVisible();
});

test("reveals truncated category names on keyboard focus", async ({ page }) => {
  const categoryName = "Narrative Adventure Collection With A Long Name";
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.sidebarWidth = 160;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  await page.goto("/");
  await page.evaluate(async (name) => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    useCategoryStore.getState().addCategory(name);
  }, categoryName);

  const category = page.getByRole("button", { name: new RegExp(categoryName) });
  await category.focus();
  await expect(page.getByRole("tooltip", { name: categoryName })).toBeVisible();
});

test("save preview can reveal every changed collection", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { useCategoryStore } = await import("/src/stores/categoryStore.ts");
    const saved = Array.from({ length: 12 }, (_, index) => ({
      id: `preview-${index + 1}`,
      key: `user-collections.preview-${index + 1}`,
      name: `Preview Collection ${index + 1}`,
      added: [632470],
      removed: [],
      timestamp: 1,
      is_deleted: false,
      is_dynamic: false,
    }));
    useCategoryStore.getState().setCollections(saved);
    useCategoryStore.getState().applyImportedCollections(
      saved.map((collection) => ({
        ...collection,
        added: [...collection.added, 1145360],
      }))
    );
  });

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review Steam collection changes" });

  await expect(dialog.getByRole("heading", { name: "Review Steam collection changes" })).toBeFocused();
  await expect
    .poll(() => dialog.locator("[data-save-preview-scroll]").evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(dialog.getByText("Preview Collection 10", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Preview Collection 12", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", {
    name: "2 more changed collections are not shown.",
  }).click();
  await expect(dialog.getByText("Preview Collection 12", { exact: true })).toBeVisible();
});

test("save preview resolves names from cached details", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const [{ useCategoryStore }, { useGameStore }] = await Promise.all([
      import("/src/stores/categoryStore.ts"),
      import("/src/stores/gameStore.ts"),
    ]);
    const collection = {
      id: "cached-name-preview",
      key: "user-collections.cached-name-preview",
      name: "Cached name preview",
      added: [],
      removed: [],
      timestamp: 1,
      is_deleted: false,
      is_dynamic: false,
    };

    useGameStore.getState().setBulkDetails([{
      app_id: 288220,
      name: "Backstage Pass",
      genres: [],
      tags: [],
      categories: ["Captions available"],
      release_date: null,
      metacritic_score: null,
      developers: [],
      publishers: [],
      supported_languages: [],
      platforms: { windows: true, mac: false, linux: false },
      header_image: null,
      capsule_image: null,
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
    }]);
    useCategoryStore.getState().setCollections([collection]);
    useCategoryStore.getState().applyImportedCollections([{
      ...collection,
      added: [288220],
    }]);
  });

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review Steam collection changes" });
  await expect(dialog.getByText("Add: Backstage Pass", { exact: true })).toBeVisible();
  await expect(dialog.getByText("#288220", { exact: true })).toHaveCount(0);
});

test("compare collections follows sidebar order and opens game details", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /RPG/ }).click({ button: "right" });
  await page.getByRole("button", { name: /Compare/ }).click();

  const compare = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Compare Collections" }),
  });
  await expect(compare).toBeVisible();
  await expect(page.locator('[data-resizable-dialog="collection-compare"]')).toBeVisible();

  await compare.getByRole("button", { name: /Collection B:/ }).click();
  const options = page.getByRole("option");
  await expect(options.nth(0)).toContainText("Favorites (2)");
  await expect(options.nth(1)).toContainText("RPG (4)");
  await page.keyboard.press("Escape");

  await compare.getByRole("button", { name: /Open details for Disco Elysium/ }).click();
  await expect(compare).toBeHidden();

  const details = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Disco Elysium - The Final Cut" }),
  });
  await expect(details).toBeVisible();
  await expect(page.locator('[data-resizable-dialog="game-detail"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("GG.deals pricing is opt-in, lazy, cached, and readable", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.ggDealsEnabled = true;
    settings.ggDealsApiKey = "test-gg-deals-key";
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-gg-deals-request-count"))).toBeNull();

  const hadesCard = page.locator(".game-card").filter({ hasText: "Hades" });
  await hadesCard.dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await expect(detail.getByRole("region", { name: "GG.deals" })).toBeVisible();
  await expect(detail.getByText("Best current deal")).toBeVisible();
  await expect(detail.getByText("10.99€", { exact: true })).toBeVisible();
  await expect(detail.getByText("Official historical low")).toBeVisible();
  await expect(detail.getByText("8.49€", { exact: true })).toBeVisible();
  await expect(detail.getByText("Data by GG.deals")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-gg-deals-request-count"))).toBe("1");
  await expectNoHorizontalOverflow(page);

  await detail.getByRole("button", { name: "Close" }).click();
  await hadesCard.dblclick();
  await expect(page.getByRole("region", { name: "GG.deals" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-gg-deals-request-count"))).toBe("1");

  const screenshotPath = testInfo.outputPath("gg-deals-game-detail.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("gg-deals-game-detail", { path: screenshotPath, contentType: "image/png" });
});

test("play history shows tracked deltas instead of lifetime playtime", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Play History Timeline" }).click();

  const timeline = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Play History" }),
  });
  await expect(timeline.getByRole("heading", { name: "Play History" })).toBeVisible();
  await expect(timeline.getByRole("button", { name: /Hades/ })).toBeVisible();
  await expect(timeline.getByText("1.1h").first()).toBeVisible();
  await expect(timeline.getByText("30.0h")).toBeHidden();
});

test("groups SAM and GG.deals in the Integrations settings", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByTitle("Integrations")).toBeHidden();
  await page.getByRole("button", { name: "Settings" }).click();

  const settingsDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Settings" }),
  });
  await settingsDialog.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Integrations" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: /SAM/ })).toHaveAttribute("aria-expanded", "true");
  await expect(settingsDialog.getByRole("button", { name: /GG\.deals/ })).toHaveAttribute("aria-expanded", "false");
  await expect(settingsDialog.getByRole("switch", { name: "Enable SAM achievement changes" })).toBeVisible();

  await settingsDialog.getByRole("button", { name: /GG\.deals/ }).click();
  await expect(settingsDialog.getByRole("button", { name: /SAM/ })).toHaveAttribute("aria-expanded", "false");
  await settingsDialog.getByRole("switch", { name: "Enable GG.deals pricing" }).click();
  await expect(settingsDialog.getByLabel("GG.deals API key")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("settings-integrations-entry.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("settings-integrations-entry", { path: screenshotPath, contentType: "image/png" });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePanel = settingsDialog.locator('[data-resizable-dialog="settings"]');
  await expect
    .poll(() => mobilePanel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    .toBe(true);
  await expectNoHorizontalOverflow(page);
  const mobileScreenshotPath = testInfo.outputPath("settings-integrations-mobile.png");
  await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
  await testInfo.attach("settings-integrations-mobile", { path: mobileScreenshotPath, contentType: "image/png" });
});

test("explains and enables the local MCP connection", async ({ page }, testInfo) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  const settingsDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Settings" }),
  });
  await settingsDialog.getByRole("button", { name: "Integrations", exact: true }).click();
  const mcp = settingsDialog.getByRole("button", { name: /MCP/ });
  await mcp.click();
  await expect(settingsDialog.getByLabel("SAM: Disabled")).toBeVisible();
  await expect(settingsDialog.getByLabel("GG.deals: Disabled")).toBeVisible();
  await expect(settingsDialog.getByLabel("MCP: Disabled")).toBeVisible();
  const mcpControl = settingsDialog.getByRole("group", { name: /Enable local MCP/ });
  await expect(mcpControl.getByRole("button", { name: "Disabled" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(mcpControl.getByRole("button", { name: "Enabled" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(settingsDialog.getByText("repressurizer-mcp")).toBeVisible();
  await expect(settingsDialog.getByText("repressurizer-cli mcp doctor")).toBeVisible();
  const permissionMenu = settingsDialog.getByRole("button", { name: "Agent permissions: Read-only" });
  await expect(permissionMenu).toBeVisible();
  await expect(settingsDialog.getByRole("group", { name: /Enable local HTTP API/ })).toBeVisible();
  await expect(settingsDialog.getByText("repressurizer-cli api token")).toBeVisible();
  await permissionMenu.click();
  await settingsDialog.getByRole("option", { name: "Manage library" }).click();
  await expect(settingsDialog.getByText(/collection edits/)).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Copy config command" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Copy starter prompt" })).toBeVisible();

  await mcpControl.getByRole("button", { name: "Enabled" }).click();
  await expect(mcpControl.getByRole("button", { name: "Disabled" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(mcpControl.getByRole("button", { name: "Enabled" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("settings-mcp-entry.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("settings-mcp-entry", { path: screenshotPath, contentType: "image/png" });

  const settingsContent = settingsDialog.locator(".flex-1.overflow-auto").last();
  await settingsContent.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  const lowerScreenshotPath = testInfo.outputPath("settings-mcp-lower.png");
  await page.screenshot({ path: lowerScreenshotPath, fullPage: true });
  await testInfo.attach("settings-mcp-lower", { path: lowerScreenshotPath, contentType: "image/png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await settingsContent.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  await expectNoHorizontalOverflow(page);
  const mobileScreenshotPath = testInfo.outputPath("settings-mcp-mobile.png");
  await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
  await testInfo.attach("settings-mcp-mobile", { path: mobileScreenshotPath, contentType: "image/png" });
});

test("shows every generated release since the previously launched version once", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("repressurizer-changelog-test-initialized") == null) {
      window.localStorage.setItem("repressurizer-last-seen-version", "0.6.1");
      window.sessionStorage.setItem("repressurizer-changelog-test-initialized", "true");
    }
  });

  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: /What's new in v0\.7\.0/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("v0.6.4")).toBeVisible();
  await expect(dialog.getByText("v0.6.3")).toBeVisible();
  await expect(dialog.getByText("v0.6.2")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const screenshotPath = testInfo.outputPath("update-changelog.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("update-changelog", { path: screenshotPath, contentType: "image/png" });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole("dialog", { name: /What's new/ })).toBeHidden();
});

test("settings search finds local-only visibility and generated changelog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  const settingsDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Settings" }),
  });
  const search = settingsDialog.getByPlaceholder("Search settings, tokens, HLTB, tray, exports...");

  await expect(search).toHaveAttribute("type", "text");
  await search.fill("empty lists");
  const visibilityAccordion = settingsDialog.locator("button[aria-expanded]").filter({ hasText: "Visibility" });
  await expect(visibilityAccordion).toBeVisible();
  await visibilityAccordion.click();
  await expect(settingsDialog.getByText("Hide local-only games")).toBeVisible();

  await search.fill("socks5 proxy");
  await expect(settingsDialog.getByText("Proxy routing")).toBeVisible();

  await search.fill("apii key");
  await expect(settingsDialog.getByText("Steam Web API Key").first()).toBeVisible();

  await search.fill("webook token");
  await expect(settingsDialog.getByText("Automation export").first()).toBeVisible();

  await search.fill("depresurizer profile");
  await expect(settingsDialog.getByText("Import Depressurizer profile")).toBeVisible();

  await search.fill("changelog");
  await expect(settingsDialog.getByText("Changelog").first()).toBeVisible();
  await expect(settingsDialog.getByText("v0.6.3")).toBeVisible();
  await expect(settingsDialog.getByText("Windows: use MSI installer to avoid NSIS false positives")).toBeVisible();
});

test("game achievement details show Steam Achievement Manager preflight separately from Steam Web API data", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await expect(detail.getByRole("heading", { name: "Hades" })).toBeVisible();
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeVisible();
  await expect(detail.getByText("Ready").first()).toBeVisible();
  await expect(detail.getByText("1 / 3 achievements")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("game-achievements-sam-bridge.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("game-achievements-sam-bridge", { path: screenshotPath, contentType: "image/png" });
});

test("achievement write controls require explicit SAM integration opt-in", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeVisible();
  await expect(detail.getByText("Ready").first()).toBeVisible();
  await expect(detail.getByRole("button", { name: "Backups" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Restore backup" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock all (2)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Lock all (1)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock", exact: true }).first()).toBeVisible();

  await detail.getByRole("button", { name: "Unlock all (2)" }).click();
  await expect(detail.getByText("achievement change(s) stored")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("runtime-verified achievements require an explicit unverified-permission confirmation", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-runtime-only-achievement", "ACH_SECRET");
  });
  await page.goto("/");
  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();
  const secretRow = detail.locator("[data-achievement-row]").filter({ hasText: "Secret route" });
  await expect(secretRow).toHaveAttribute("data-permission-verified", "false");
  await expect(detail.locator("[data-sam-schema-status]")).toContainText(
    "2 local permissions, 1 runtime-only"
  );
  const refreshCount = await page.evaluate(() =>
    Number(
      window.localStorage.getItem("repressurizer-sam-schema-refresh-count") ?? 0
    )
  );
  await detail.getByRole("button", { name: "Refresh schema" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          window.localStorage.getItem("repressurizer-sam-schema-refresh-count") ?? 0
        )
      )
    )
    .toBeGreaterThan(refreshCount);
  await secretRow.getByRole("button", { name: "Unlock", exact: true }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("repressurizer-last-confirm-message")
      )
    )
    .toContain("local binary schema");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("repressurizer-last-sam-allow-unverified")
      )
    )
    .toBe("true");
});

test("SAM backup buttons show the in-app backup viewer and restore a selected snapshot", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-runtime-only-achievement", "ACH_SECRET");
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Backups" }).click();
  const backupViewer = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "SAM backups for Hades" }),
  });
  await expect(backupViewer.getByRole("heading", { name: "SAM backups for Hades" })).toBeVisible();
  await expect(backupViewer.locator("[data-sam-backup-count]")).toContainText("Steam app 1145360");
  await expect(backupViewer.locator("[data-sam-backup-count]")).toContainText("3 of 3 shown");
  await expect(backupViewer.getByText("mock-before.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-after.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-lock-after.json")).toBeVisible();

  await backupViewer.getByRole("button", { name: /^Action:/ }).click();
  await page.getByRole("option", { name: "Lock", exact: true }).click();
  await expect(backupViewer.getByText("mock-lock-after.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-before.json")).toBeHidden();
  await expect(backupViewer.locator("[data-sam-backup-count]")).toContainText("1 of 3 shown");

  await backupViewer.getByRole("button", { name: /^Action:/ }).click();
  await page.getByRole("option", { name: "All actions", exact: true }).click();
  await backupViewer.getByRole("button", { name: /^Phase:/ }).click();
  await page.getByRole("option", { name: "Before", exact: true }).click();
  await expect(backupViewer.getByText("mock-before.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-after.json")).toBeHidden();

  await backupViewer.getByRole("button", { name: /^Phase:/ }).click();
  await page.getByRole("option", { name: "All phases", exact: true }).click();
  await backupViewer.getByPlaceholder("Search date, action, filename...").fill("mock-after");
  await expect(backupViewer.getByText("mock-after.json")).toBeVisible();
  await expect(backupViewer.getByText("mock-before.json")).toBeHidden();

  await backupViewer.getByPlaceholder("Search date, action, filename...").fill("");
  await backupViewer.getByRole("button", { name: /^Sort:/ }).click();
  await page.getByRole("option", { name: "Oldest", exact: true }).click();
  await expect(backupViewer.locator("[data-sam-backup-row]").first()).toContainText("mock-lock-after.json");
  const screenshotPath = testInfo.outputPath("sam-backup-viewer-filters.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("sam-backup-viewer-filters", { path: screenshotPath, contentType: "image/png" });

  await backupViewer.getByRole("button", { name: "Open folder" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("repressurizer-open-sam-backup-dir-app-id"))
    )
    .toBe("1145360");

  await backupViewer
    .locator("[data-sam-backup-row]")
    .filter({ hasText: "mock-before.json" })
    .getByRole("button", { name: "Restore backup" })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-last-sam-action")))
    .toBe("restore_backup");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("repressurizer-last-sam-backup-path")))
    .toContain("mock-before.json");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("repressurizer-last-sam-allow-unverified")
      )
    )
    .toBe("true");
  await expect(detail.getByText("After backup:")).toBeVisible();
});

test("single achievement write updates only the targeted achievement locally", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Unlock", exact: true }).first().click();

  await expect(detail.getByText("2 / 3 achievements")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock all (1)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Lock all (2)" })).toBeVisible();
});

test("multi-select achievement writes act on selected locked achievements", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByText("0 selected")).toBeHidden();
  await expect(detail.getByRole("checkbox", { name: "Select Secret route" })).toBeVisible();
  await detail.getByRole("button", { name: "Locked", exact: true }).click();
  await expect(detail.getByText("2 selected")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock selected (2)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Lock selected (0)" })).toBeHidden();
  await detail.getByPlaceholder("Search achievements...").fill("Secret");
  await expect(detail.getByText("Secret route")).toBeVisible();
  const modalBox = await detail.locator(":scope > div").first().boundingBox();
  expect(modalBox?.height ?? 0).toBeLessThan(760);
  await detail.getByPlaceholder("Search achievements...").fill("");

  await detail.getByRole("button", { name: "Unlock selected (2)" }).click();
  await expect(detail.getByText("3 / 3 achievements")).toBeVisible();
  await expect(detail.getByText("0 selected")).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test("long achievement multi-select does not create a nested blank scroll panel", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-achievement-count", "24");
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Locked", exact: true }).click();
  await expect(detail.getByText("23 selected")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Unlock selected (23)" })).toBeVisible();

  const listMetrics = await detail.locator("[data-achievement-list]").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      overflowY: styles.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(listMetrics.overflowY).toBe("visible");
  expect(listMetrics.scrollHeight).toBe(listMetrics.clientHeight);

  const detailScrollMetrics = await detail.locator("[data-game-detail-scroll]").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      overflowY: styles.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(detailScrollMetrics.overflowY).toBe("auto");
  expect(detailScrollMetrics.scrollHeight).toBeGreaterThan(detailScrollMetrics.clientHeight);

  await expectNoHorizontalOverflow(page);
  const screenshotPath = testInfo.outputPath("long-achievement-multi-select.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("long-achievement-multi-select", { path: screenshotPath, contentType: "image/png" });
});

test("manual achievement checkbox selection does not scroll the modal shell", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-achievement-count", "100");
  });

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  const readMetrics = async () =>
    detail.locator("[data-game-detail-scroll]").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const shell = element.closest(".max-w-4xl") as HTMLElement | null;
      const visibleRows = Array.from(document.querySelectorAll("[data-achievement-row]"))
        .filter((row) => {
          const rowRect = row.getBoundingClientRect();
          return rowRect.bottom > rect.top && rowRect.top < rect.bottom;
        }).length;
      return {
        shellScrollTop: shell?.scrollTop ?? 0,
        rectTop: rect.top,
        rectBottom: rect.bottom,
        visibleRows,
        activeTag: document.activeElement?.tagName ?? "",
        activeClass: String(document.activeElement?.className ?? ""),
      };
    });

  const start = await readMetrics();
  expect(start.shellScrollTop).toBe(0);
  expect(start.rectTop).toBeGreaterThan(0);

  await detail.getByRole("checkbox", { name: "Select Cat 2", exact: true }).click();
  await detail.getByRole("checkbox", { name: "Select Cat 3", exact: true }).click();
  await detail.getByRole("checkbox", { name: "Select Cat 4", exact: true }).click();
  await detail.locator("[data-game-detail-scroll]").evaluate((element) => {
    element.scrollTop = 900;
  });
  await detail.getByRole("checkbox", { name: "Select Cat 20", exact: true }).click();

  const after = await readMetrics();
  expect(after.shellScrollTop).toBe(0);
  expect(Math.abs(after.rectTop - start.rectTop)).toBeLessThan(1);
  expect(after.visibleRows).toBeGreaterThan(4);
  expect(after.activeTag).toBe("BUTTON");
  expect(after.activeClass).not.toContain("sr-only");
  await expect(detail.getByText("4 selected")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("manual-achievement-checkbox-selection.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("manual-achievement-checkbox-selection", { path: screenshotPath, contentType: "image/png" });
});

test("achievement write controls stay visible while SAM action is running", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.steamToolsEnabled = true;
    settings.steamToolsAchievementWritesEnabled = true;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
    window.localStorage.setItem("repressurizer-sam-action-delay-ms", "900");
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await detail.getByRole("button", { name: "Locked", exact: true }).click();
  await expect(detail.getByText("2 selected")).toBeVisible();

  await detail.getByRole("button", { name: "Unlock selected (2)" }).click();

  await expect(detail.getByText("2 selected")).toBeVisible();
  await expect(detail.getByRole("checkbox", { name: "Select Secret route" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Working..." })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Locked", exact: true })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "Unlock all (2)" })).toBeDisabled();
});

test("achievement details do not probe SAM while the integration is disabled", async ({ page }) => {
  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Hades" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Hades" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByText("1 / 3 achievements")).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeHidden();
});

test("games without Steam achievements skip the Steam Achievement Manager panel", async ({ page }) => {
  await page.goto("/");

  await page.locator(".game-card").filter({ hasText: "Outer Wilds" }).dblclick();
  const detail = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Outer Wilds" }),
  });
  await detail.getByRole("button", { name: /Achievements/ }).click();

  await expect(detail.getByText("This game has no achievements.")).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Steam Achievement Manager" })).toBeHidden();
});

test("opens organized settings tabs, automation logs, and Steam controls without layout overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const settingsDialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "Settings" }),
  });

  await expect(page.getByText("DemoUser (123456)")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const settingsPanel = settingsDialog.locator(":scope > div").first();
  const initialPanelBox = await settingsPanel.boundingBox();
  expect(initialPanelBox?.width).toBeGreaterThan(900);
  expect(initialPanelBox?.height).toBeGreaterThan(700);

  const settingsTopPath = testInfo.outputPath("settings-top.png");
  await page.screenshot({ path: settingsTopPath, fullPage: true });
  await testInfo.attach("settings-top", { path: settingsTopPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Steam", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Steam Family" })).toBeVisible();
  await expect(settingsDialog.getByText("Steam Web API Key", { exact: true })).toBeVisible();
  const steamPanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((steamPanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);
  const apiKeyInput = settingsDialog.locator('input[type="password"]').last();
  const apiSaveButton = settingsDialog.getByRole("button", { name: "Save", exact: true });
  await expect(apiSaveButton).toBeVisible();
  const apiInputBox = await apiKeyInput.boundingBox();
  const apiButtonBox = await apiSaveButton.boundingBox();
  expect(Math.abs((apiInputBox?.height ?? 0) - (apiButtonBox?.height ?? 0))).toBeLessThanOrEqual(1);

  const steamPath = testInfo.outputPath("settings-steam.png");
  await page.screenshot({ path: steamPath, fullPage: true });
  await testInfo.attach("settings-steam", { path: steamPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Integrations" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: /SAM/ })).toBeVisible();
  await expect(settingsDialog.getByText("Enable SAM achievement changes")).toBeVisible();
  await expect(settingsDialog.getByText("Allow card farming lab")).toBeHidden();
  await expect(settingsDialog.getByRole("switch")).toHaveCount(1);
  await settingsDialog.getByRole("switch", { name: "Enable SAM achievement changes" }).click();
  await expect(settingsDialog.getByRole("switch", { name: "Enable SAM achievement changes" })).toBeChecked();

  const toolsPath = testInfo.outputPath("settings-integrations.png");
  await page.screenshot({ path: toolsPath, fullPage: true });
  await testInfo.attach("settings-integrations", { path: toolsPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Data", exact: true }).click();
  await expect(settingsDialog.getByText("Steam App Index")).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(settingsDialog.getByRole("heading", { name: "Maintenance" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Export diagnostics" })).toBeVisible();
  const dataPanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((dataPanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);

  const dataPath = testInfo.outputPath("settings-data.png");
  await page.screenshot({ path: dataPath, fullPage: true });
  await testInfo.attach("settings-data", { path: dataPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Import Depressurizer database" }).click();
  const databaseImportDialog = settingsDialog.getByRole("dialog", { name: "Import Depressurizer database" });
  await expect(databaseImportDialog.getByText("Source", { exact: true })).toBeVisible();
  await expect(databaseImportDialog.getByText("Extra App IDs", { exact: true })).toBeVisible();
  await databaseImportDialog.getByRole("button", { name: "Cancel" }).click();

  await settingsDialog.getByRole("button", { name: "Ignored", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: /Steam Details/ })).toBeVisible();
  await expect(settingsDialog.getByRole("heading", { name: /HLTB/ })).toBeVisible();

  await settingsDialog.getByRole("button", { name: "About", exact: true }).click();
  await expect(settingsDialog.getByText(/Repressurizer v/)).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Check for updates" })).toBeVisible();
  await expect(settingsDialog.getByText("Automatically check for updates")).toBeVisible();
  await expect(settingsDialog.getByText("Credits")).toBeVisible();
  const aboutPanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((aboutPanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);

  await settingsDialog.getByRole("button", { name: "General", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Background" })).toBeVisible();
  const startupSwitch = settingsDialog.getByRole("switch", { name: "Start Repressurizer when you sign in" });
  await expect(startupSwitch).toBeVisible();
  await startupSwitch.click();
  await expect(settingsDialog.getByText("Startup behavior")).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: /Open in tray/ })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: /Open window/ })).toBeVisible();
  const generalPanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((generalPanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);

  await settingsDialog.getByRole("button", { name: "Appearance", exact: true }).click();
  await settingsDialog.getByRole("button", { name: "Visibility", exact: true }).click();
  await expect(settingsDialog.getByRole("switch", { name: "Show empty lists" })).toBeVisible();
  await expect(settingsDialog.getByRole("heading", { name: "System Tray" })).toBeHidden();
  const appearancePanelBox = await settingsPanel.boundingBox();
  expect(Math.abs((appearancePanelBox?.height ?? 0) - (initialPanelBox?.height ?? 0))).toBeLessThanOrEqual(1);

  const appearancePath = testInfo.outputPath("settings-appearance-tray.png");
  await page.screenshot({ path: appearancePath, fullPage: true });
  await testInfo.attach("settings-appearance-tray", { path: appearancePath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Automation", exact: true }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Automation Export" })).toBeVisible();
  await expect(settingsDialog.getByText("Result:")).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Guide" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "View logs" })).toBeVisible();
  await expect(settingsDialog.getByRole("button", { name: "Publish now" })).toBeVisible();

  const automationPath = testInfo.outputPath("settings-automation.png");
  await page.screenshot({ path: automationPath, fullPage: true });
  await testInfo.attach("settings-automation", { path: automationPath, contentType: "image/png" });

  await settingsDialog.getByRole("button", { name: "Guide" }).click();
  const guideDialog = settingsDialog.getByRole("dialog", { name: "Automation export guide" });
  await expect(guideDialog.getByRole("heading", { name: "Automation export guide" })).toBeVisible();
  await expect(guideDialog.getByText("Integration libraries")).toBeVisible();
  await expect(guideDialog.getByRole("button", { name: "Automation docs" })).toBeVisible();
  await expect(guideDialog.getByRole("button", { name: "Snapshot schema" })).toBeVisible();
  const guidePath = testInfo.outputPath("settings-automation-guide.png");
  await page.screenshot({ path: guidePath, fullPage: true });
  await testInfo.attach("settings-automation-guide", { path: guidePath, contentType: "image/png" });
  await guideDialog.getByRole("button", { name: "Close" }).click();

  await settingsDialog.getByRole("button", { name: "View logs" }).click();
  await expect(settingsDialog.getByRole("heading", { name: "Automation export logs" })).toBeVisible();
  await expect(settingsDialog.getByText("All results")).toBeVisible();
  await expect(settingsDialog.getByText("Newest first")).toBeVisible();
  await expect(settingsDialog.getByText("HTTP 200", { exact: true })).toBeVisible();
  await expect(settingsDialog.getByText("HTTP 500", { exact: true })).toBeVisible();

  const logsPath = testInfo.outputPath("settings-automation-logs.png");
  await page.screenshot({ path: logsPath, fullPage: true });
  await testInfo.attach("settings-automation-logs", { path: logsPath, contentType: "image/png" });

  await expectNoHorizontalOverflow(page);
});

test("pastes only Steam Family webapi_token through the token field", async ({ page }, testInfo) => {
  const token = "mock-store-token-for-e2e";
  await page.setViewportSize({ width: 900, height: 600 });

  await page.goto("/");
  await page.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "Steam", exact: true }).click();

  await expect(
    settingsDialog.getByRole("button", { name: "Import from clipboard" })
  ).toHaveCount(0);

  const tokenInput = settingsDialog.getByPlaceholder("Paste token or full Steam JSON");
  const pastedJson = JSON.stringify({
    success: 1,
    data: { webapi_token: token },
    browser_cookie: "must-not-be-persisted",
  });
  await tokenInput.evaluate((input, value) => {
    const transfer = new DataTransfer();
    transfer.setData("text", String(value));
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      })
    );
  }, pastedJson);
  await expect(tokenInput).toHaveValue(token);
  await expect(
    settingsDialog.getByText("Steam Store token extracted from pasted JSON.")
  ).toBeVisible();
  await settingsDialog.getByRole("button", { name: "Save token" }).click();
  await expect(
    settingsDialog.getByText("Steam Store token saved.")
  ).toBeVisible();

  const saved = await page.evaluate(() =>
    window.localStorage.getItem("repressurizer-app-data:steam_family_token.json")
  );
  expect(saved).not.toBeNull();
  expect(saved).not.toContain("browser_cookie");
  expect(saved).not.toContain("must-not-be-persisted");
  expect(Object.keys(JSON.parse(saved ?? "{}")).sort()).toEqual([
    "accessToken",
    "lastValidatedAt",
    "savedAt",
  ]);
  expect(JSON.parse(saved ?? "{}").accessToken).toBe(token);
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("steam-family-helper-minimum.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("steam-family-helper-minimum", {
    path: screenshotPath,
    contentType: "image/png",
  });
});

test("keeps beta updates opt-in and isolated from the stable target", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "About", exact: true }).click();

  const channelSelect = settingsDialog.getByRole("button", {
    name: "Release channel: Stable",
  });
  await expect(channelSelect).toBeVisible();
  await channelSelect.click();
  await settingsDialog.getByRole("option", { name: "Beta" }).click();
  await expect(
    settingsDialog.getByText(/Opt in to signed prereleases/)
  ).toBeVisible();

  await settingsDialog.getByRole("button", { name: "Check for updates" }).click();
  await expect(settingsDialog.getByText("Repressurizer is up to date.")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("repressurizer-last-updater-target")
      )
    )
    .toBe("windows-x86_64-beta");
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("repressurizer-last-updater-allow-downgrades")
    )
  ).toBe("false");

  const screenshotPath = testInfo.outputPath("settings-release-channel.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("settings-release-channel", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await settingsDialog.getByRole("button", { name: "Release channel: Beta" }).click();
  await settingsDialog.getByRole("option", { name: "Stable" }).click();
  await settingsDialog.getByRole("button", { name: "Check for updates" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("repressurizer-last-updater-target")
      )
    )
    .toBe("windows-x86_64-stable");
});

test("uses the color picker as the primary custom accent control", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Appearance" }).click();

  await page.getByRole("button", { name: "Accent Color" }).click();
  await page.getByLabel("Pick accent color").first().click();
  const picker = page.locator('input[type="color"]').first();
  await expect(picker).toBeAttached();
  await picker.evaluate((input) => {
    const el = input as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "#38bdf8");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.getByPlaceholder("#10b981")).toHaveValue("#38bdf8");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-repressurizer-accent").trim()))
    .toBe("#38bdf8");
});

test("keeps selected appearance controls legible in light theme", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.theme = "light";
    settings.language = "en";
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Appearance" }).click();

  // Appearance sections are collapsible: expand Theme and Language first.
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();

  const lightButton = page.getByRole("button", { name: "Light" });
  await expect(lightButton).toBeVisible();
  const lightTextColor = await lightButton.evaluate((el) => getComputedStyle(el).color);
  expect(lightTextColor).not.toBe("rgb(255, 255, 255)");

  const englishButton = page.getByRole("button", { name: /English/ });
  await expect(englishButton).toBeVisible();
  const englishTextColor = await englishButton.evaluate((el) => getComputedStyle(el).color);
  expect(englishTextColor).not.toBe("rgb(255, 255, 255)");

  await lightButton.scrollIntoViewIfNeeded();
  const screenshotPath = testInfo.outputPath("settings-light-appearance.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("settings-light-appearance", { path: screenshotPath, contentType: "image/png" });
});

test("keeps recommendation filters inside the dialog", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "What to Play Next" }).click();

  const dialog = page.locator(".fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "What to Play Next" }),
  });
  await expect(dialog.getByRole("heading", { name: "What to Play Next" })).toBeVisible();
  await dialog.getByRole("button", { name: "All Genres" }).click();
  const rpgOption = dialog.getByRole("button", { name: "RPG", exact: true });
  await expect(rpgOption).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const viewport = page.viewportSize();
  const menuBox = await rpgOption.locator("..").boundingBox();
  expect(menuBox?.x ?? 0).toBeGreaterThanOrEqual(0);
  if (viewport && menuBox) expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);

  const screenshotPath = testInfo.outputPath("recommend-filters.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("recommend-filters", { path: screenshotPath, contentType: "image/png" });
});

test("explains and tunes smart backlog ranking", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await page.evaluate(async () => {
    const { useWishlistStore } = await import("/src/stores/wishlistStore.ts");
    const { useAchievementsStore } = await import("/src/stores/achievementsStore.ts");
    useWishlistStore.getState().setItems([{ appid: 753640, priority: 1, date_added: 1_700_000_000 }]);
    useAchievementsStore.getState().setSummary(753640, { total: 20, achieved: 10, achievements: [] });
  });

  await page.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("menuitem", { name: "What to Play Next" }).click();
  const dialog = page.getByRole("dialog", { name: "What to Play Next" });
  await expect(dialog.getByText(/Wishlist/).first()).toBeVisible();
  await expect(dialog.getByText(/pts$/).first()).toBeVisible();
  await expect(dialog.getByText(/\+\d+ more/).first()).toBeVisible();

  await dialog.getByRole("button", { name: "Tune ranking" }).click();
  await expect(dialog.getByText("Ranking signals", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Playtime" }).click();
  await dialog.getByRole("button", { name: "Off", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const stored = window.localStorage.getItem("repressurizer-ranking-weights");
    return stored ? JSON.parse(stored).playtime : null;
  })).toBe(0);
  await expectNoHorizontalOverflow(page);

  const screenshotPath = testInfo.outputPath("recommend-ranking-tuning.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("recommend-ranking-tuning", { path: screenshotPath, contentType: "image/png" });
});

test("guides Steam Family setup during onboarding", async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem("repressurizer-settings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.onboardingComplete = false;
    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome to Repressurizer!" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Steam Family" })).toBeVisible();
  await expect(page.getByText("Family library connected")).toBeVisible();
  await expect(page.getByText("Steam Family ready: 1 shared game found.")).toBeVisible();
});
