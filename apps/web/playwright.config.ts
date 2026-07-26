import { defineConfig, devices } from "@playwright/test";

const webOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://127.0.0.1:3101";

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "test-results",
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "line",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: {
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: `${apiOrigin}/__test__/health`,
    },
    {
      command: "node .next/standalone/apps/web/server.js",
      env: {
        API_BASE_URL: apiOrigin,
        HOSTNAME: "127.0.0.1",
        PORT: "3100",
        PUBLIC_WEB_URL: webOrigin,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: webOrigin,
    },
  ],
  workers: 1,
});
