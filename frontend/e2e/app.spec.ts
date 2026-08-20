import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '..', 'dist-electron', 'main.cjs');
const SAMPLE_PDF = path.resolve(__dirname, 'fixtures', 'sample.pdf');

// electron.launch() replaces the child's env entirely with whatever is
// passed here (it does not merge with process.env), so build off a full
// copy. Some shells - notably VS Code's integrated terminal, itself an
// Electron app - leak ELECTRON_RUN_AS_NODE=1 into child processes; when set,
// electron.exe runs as a plain Node binary instead of bootstrapping the app,
// and fails immediately on Chromium-only switches like
// --remote-debugging-port with a "bad option" error. Strip it so the test
// launches the real app regardless of the parent shell's quirks.
const electronEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined
  )
) as Record<string, string>;

// Drives the real, built Electron app (main + preload + renderer), which in
// turn spawns the real Python backend as a child process (see main.ts's
// startPythonBackend) - this is the same code path a real user hits, not a
// mock of any layer. Run `npm run build` before this suite; there is
// nothing here to fall back to a dev server.
test.describe.serial('Mark Tini desktop app', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: [MAIN_ENTRY], env: electronEnv });
    page = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('launches and renders the main shell without crashing', async () => {
    await expect(page).toHaveTitle('Mark Tini');
    await expect(page.getByText('DHSystem').first()).toBeVisible();
    // Either state is fine here - this test only asserts the renderer
    // mounted correctly, not that the backend has finished starting yet.
    await expect(
      page.getByRole('button', { name: /Chọn PDF & Chuyển đổi|Đang khởi động/ })
    ).toBeVisible();
  });

  test('converts a real PDF and shows the extracted text in the editor', async () => {
    const uploadButton = page.getByRole('button', { name: 'Chọn PDF & Chuyển đổi' });
    // Generous timeout: covers real backend startup plus Docling model
    // warm-up (warm_up_models), which the renderer waits out via its own
    // /api/health poll rather than a fixed delay.
    await expect(uploadButton).toBeEnabled({ timeout: 120_000 });

    const fileInput = page.locator('input[type="file"][accept*=".pdf"]');
    await fileInput.setInputFiles(SAMPLE_PDF);

    await expect(page.locator('#root')).toContainText('Mark Tini E2E Fixture', { timeout: 60_000 });
  });
});
