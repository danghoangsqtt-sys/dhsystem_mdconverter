import path from 'node:path';
import fs from 'node:fs';
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
      page.getByRole('button', { name: /Chọn tài liệu|Đang khởi động/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chọn cả thư mục' })).toBeVisible();
    await expect(page.locator('input[type="file"][webkitdirectory]')).toHaveCount(1);
  });

  test('converts a real PDF and shows the extracted text in the editor', async () => {
    const uploadButton = page.getByRole('button', { name: 'Chọn tài liệu' });
    // Generous timeout: covers real backend startup plus Docling model
    // warm-up (warm_up_models), which the renderer waits out via its own
    // /api/health poll rather than a fixed delay.
    await expect(uploadButton).toBeEnabled({ timeout: 120_000 });

    const fileInput = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await fileInput.setInputFiles(SAMPLE_PDF);

    await expect(page.locator('#root')).toContainText('Mark Tini E2E Fixture', { timeout: 60_000 });
  });

  test('restores the original PDF, extracts the full crop, and resizes the result panel', async () => {
    await page.getByText('sample.pdf', { exact: true }).first().click();
    await expect(page.getByText('Tài liệu gốc', { exact: true })).toHaveCount(0);

    const openOriginal = page.getByRole('button', { name: /Mở tài liệu gốc/ });
    await expect(openOriginal).toBeVisible();
    await openOriginal.click();
    await expect(page.getByText('Tài liệu gốc', { exact: true })).toBeVisible({ timeout: 30_000 });

    const canvas = page.locator('.react-pdf__Page canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const selectionSurface = page.getByTestId('pdf-selection-surface');
    const surfaceBox = await selectionSurface.boundingBox();
    expect(surfaceBox).not.toBeNull();
    if (!surfaceBox) return;
    const start = { clientX: surfaceBox.x + 4, clientY: surfaceBox.y + 4 };
    const end = {
      clientX: surfaceBox.x + surfaceBox.width - 4,
      clientY: surfaceBox.y + surfaceBox.height - 4,
    };
    await selectionSurface.dispatchEvent('mousedown', { ...start, button: 0 });
    await selectionSurface.dispatchEvent('mousemove', { ...end, button: 0 });
    await selectionSurface.dispatchEvent('mouseup', { ...end, button: 0 });
    await page.getByRole('button', { name: 'Trích xuất trang này (1)' }).click();

    const extractedText = page.locator('textarea[placeholder="Không nhận diện được văn bản..."]').first();
    await expect(extractedText).toHaveValue(/Mark Tini/i, { timeout: 120_000 });

    const resizeHandle = page.getByRole('separator', {
      name: 'Kéo để thay đổi chiều cao vùng đã trích xuất',
    });
    const panel = resizeHandle.locator('..');
    const before = await panel.boundingBox();
    const handleBox = await resizeHandle.boundingBox();
    expect(before).not.toBeNull();
    expect(handleBox).not.toBeNull();
    if (!before || !handleBox) return;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 80);
    await page.mouse.up();
    const after = await panel.boundingBox();
    expect(after?.height ?? 0).toBeGreaterThan(before.height + 40);
  });

  test('queues multiple selected documents and keeps both results in history', async () => {
    const uploadButton = page.getByRole('button', { name: 'Chọn tài liệu' });
    await expect(uploadButton).toBeEnabled({ timeout: 30_000 });

    const sampleBuffer = fs.readFileSync(SAMPLE_PDF);
    const suffix = Date.now();
    const firstName = `batch-a-${suffix}.pdf`;
    const secondName = `batch-b-${suffix}.pdf`;
    const fileInput = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await fileInput.setInputFiles([
      { name: firstName, mimeType: 'application/pdf', buffer: sampleBuffer },
      { name: secondName, mimeType: 'application/pdf', buffer: sampleBuffer },
    ]);

    await expect(page.getByText(firstName).first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(secondName).first()).toBeVisible({ timeout: 120_000 });
    await expect(uploadButton).toBeEnabled({ timeout: 30_000 });
  });
});
