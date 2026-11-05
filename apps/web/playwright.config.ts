import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Smoke test against the BUILT app (`pnpm --filter web build` first) on a fresh temp DATA_DIR.
// All credentials below are throwaway test values.
const port = Number(process.env.E2E_PORT ?? 4173);
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), "ft-e2e-"));
process.env.E2E_DATA_DIR = dataDir; // workers re-read this config and must see the same directory
process.env.E2E_BASE_URL = `http://127.0.0.1:${port}`;
process.env.E2E_PASSWORD = "e2e-fake-password";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/usr/bin/chromium" },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "node build",
    cwd: ".",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      OWNER_PASSWORD: process.env.E2E_PASSWORD,
      SESSION_SECRET: "e2e-fake-session-secret-0123456789abcdef",
      BODY_SIZE_LIMIT: "8M",
    },
  },
});
