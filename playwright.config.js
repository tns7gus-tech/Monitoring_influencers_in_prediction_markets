import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.js",
    env: {
      PORT: "4174",
      SYNC_INTERVAL_MS: "3600000",
    },
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:4174/api/health",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
