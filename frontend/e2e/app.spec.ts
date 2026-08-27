import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { TEST_APP_DATA_DIR, TEST_ELECTRON_USER_DATA_DIR } from './testUserData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '..', 'dist-electron', 'main.cjs');
const ISOLATION_ARGS = [`--user-data-dir=${TEST_ELECTRON_USER_DATA_DIR}`];

const electronEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
    ),
  ),
  DOCUMARK_APP_DATA_DIR: TEST_APP_DATA_DIR,
} as Record<string, string>;

test.describe.serial('Mark Tini desktop app', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_ENTRY, ...ISOLATION_ARGS],
      env: electronEnv,
    });
    page = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('launches the Mark Tini shell without crashing', async () => {
    await expect(page).toHaveTitle('Mark Tini');
    await expect(page.getByText('DHSystem').first()).toBeVisible();
    await expect(page.locator('[data-testid="main-toolbar"]')).toBeVisible();
  });
});
