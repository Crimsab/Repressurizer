import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const collectIndexFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return collectIndexFiles(path);
  return entry.name === "index.html" ? [relative("site", path)] : [];
});

const routes = collectIndexFiles("site")
  .map((file) => `/${file.replace(/index\.html$/, "")}`)
  .sort();

for (const route of routes) {
  test(`${route} renders without accessibility regressions`, async ({ page }, testInfo) => {
    await page.goto(route, { waitUntil: "networkidle" });

    const expectedScheme = testInfo.project.name.endsWith("dark") ? "slate" : "default";
    await expect(page.locator("body")).toHaveAttribute("data-md-color-scheme", expectedScheme);
    await expect(page.locator("body")).not.toContainText(/:material-[a-z0-9-]+:/i);

    const pageMetrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      brokenImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    }));

    expect(pageMetrics.brokenImages, "broken images").toEqual([]);
    expect(pageMetrics.content, "page-level horizontal overflow").toBeLessThanOrEqual(pageMetrics.viewport + 1);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);

    if (route === "/") {
      for (const button of await page.locator(".md-button").all()) {
        await button.hover();
        const hoveredAccessibility = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          hoveredAccessibility.violations,
          JSON.stringify(hoveredAccessibility.violations, null, 2),
        ).toEqual([]);
      }
    }
  });
}
