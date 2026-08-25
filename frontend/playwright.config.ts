import { defineConfig } from '@playwright/test';

// Electron-only: there is no separate browser/webServer target here, so most
// of Playwright's usual multi-browser/webServer config has nothing to do.
// workers is pinned to 1 because the app spawns a real backend on a fixed
// port (8088, see backend/run_server.py) - two instances launched in
// parallel would fight over that port.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
