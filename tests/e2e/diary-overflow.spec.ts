import { expect, test } from "@playwright/test";
import { installTauriMock } from "./tauriMock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("diary views have no horizontal overflow", async ({ page }) => {
  const offenders = async () => page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("main *, aside *, [data-testid='diary-kanban'] *, [data-testid='diary-timeline'] *")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0) return false;
          const scrollParent = el.closest("[data-testid='diary-kanban'], .overflow-x-auto");
          if (scrollParent) return false;
          return rect.right > root.clientWidth + 1 || rect.left < -1;
        })
        .slice(0, 4)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)} r=${Math.round(el.getBoundingClientRect().right)}`),
    };
  });

  for (const width of [1366, 1024, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Diary" }).click();

    for (const view of ["grid", "kanban", "timeline", "upcoming"] as const) {
      await page.getByTestId(`diary-view-${view}`).click();
      if (view === "timeline") {
        for (const layout of ["rail", "cards", "compact"] as const) {
          await page.getByTestId(`diary-timeline-layout-${layout}`).click();
          await page.waitForTimeout(150);
          const result = await offenders();
          expect(result.offenders, `${width}/${view}/${layout}: ${JSON.stringify(result)}`).toEqual([]);
        }
      } else {
        await page.waitForTimeout(250);
        const result = await offenders();
        expect(result.offenders, `${width}/${view}: ${JSON.stringify(result)}`).toEqual([]);
      }
    }
  }
});
