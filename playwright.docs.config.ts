import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.DOCS_PORT ?? 8125);
const baseURL = process.env.DOCS_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/docs",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : 2,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report-docs", open: "never" }]]
    : "list",
  outputDir: "test-results-docs",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory site 2>/dev/null`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "desktop-light",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, colorScheme: "light" },
    },
    {
      name: "desktop-dark",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, colorScheme: "dark" },
    },
    {
      name: "mobile-light",
      use: { ...devices["Pixel 7"], colorScheme: "light" },
    },
    {
      name: "mobile-dark",
      use: { ...devices["Pixel 7"], colorScheme: "dark" },
    },
  ],
});
