import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.e2e\.ts/,
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    ...(process.env["PLAYWRIGHT_CHROMIUM_PATH"]
      ? { launchOptions: { executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"] } }
      : {}),
  },
  ...(process.env["E2E_BASE_URL"]
    ? {}
    : {
        webServer: {
          command: "bun run dev",
          url: "http://localhost:8080",
          reuseExistingServer: true,
        },
      }),
});
