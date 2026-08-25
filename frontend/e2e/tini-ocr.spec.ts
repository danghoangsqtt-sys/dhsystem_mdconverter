import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { TEST_APP_DATA_DIR, TEST_ELECTRON_USER_DATA_DIR } from './testUserData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(__dirname, '..', 'dist-electron', 'main.cjs');
const SAMPLE_IMAGE = path.resolve(__dirname, 'fixtures', 'tini-ocr-sample.png');
// Isolates electron.launch() below from the real, shared Tini Core profile
// at %APPDATA%\Tini Suite - see testUserData.ts.
const ISOLATION_ARGS = [`--user-data-dir=${TEST_ELECTRON_USER_DATA_DIR}`];
const SAMPLE_IMAGE_NAME = 'tini-ocr-sample.png';
// Ground truth for the fixture image, confirmed via a real (unmocked)
// EasyOCR call against this exact file before it was checked in.
const REFERENCE_TEXT = 'Tài liệu tiếng Việt có dấu';

// electron.launch() replaces the child's env entirely with whatever is
// passed here (it does not merge with process.env) - see app.spec.ts for
// why ELECTRON_RUN_AS_NODE must be stripped before launching.
const electronEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined
    )
  ),
  // Redirects TiniCoreSupervisor's data/session root away from the real
  // profile - see testUserData.ts.
  DOCUMARK_APP_DATA_DIR: TEST_APP_DATA_DIR,
} as Record<string, string>;

// Drives the real, built Electron app against the real shared Tini Core
// backend and a real EasyOCR model - no mocking of recognition, export, or
// IPC. Run `npm run build` before this suite.
test.describe.serial('Tini OCR image recognition', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_ENTRY, '--product=tini-ocr', ...ISOLATION_ARGS],
      env: electronEnv,
    });
    page = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('launches the shell and accepts a real image', async () => {
    await expect(page).toHaveTitle('Tini OCR — Image to Text & Word');
    await expect(page.getByTestId('tini-ocr-shell')).toBeVisible();

    const fileInput = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    await fileInput.setInputFiles({
      name: SAMPLE_IMAGE_NAME,
      mimeType: 'image/png',
      buffer: fs.readFileSync(SAMPLE_IMAGE),
    });

    await expect(page.getByText(SAMPLE_IMAGE_NAME, { exact: true })).toBeVisible();
    // Use the untouched preset so the recognized text and box overlay match
    // the ground truth already verified with a direct recognize_image() call.
    // The native input is visually hidden (pointer-events: none) in favor of
    // the styled label text; click the label the way a real user would.
    await page.getByText('Giữ nguyên', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /Giữ nguyên/ })).toBeChecked();
  });

  test('recognizes real Vietnamese diacritics and allows editing the result', async () => {
    const startButton = page.getByRole('button', { name: /^(Bắt đầu nhận dạng|Đang khởi động máy chủ\.\.\.)$/ });
    // Generous timeout: covers real backend startup plus EasyOCR model
    // warm-up, which the component waits out via its own /api/health poll.
    await expect(startButton).toHaveText('Bắt đầu nhận dạng', { timeout: 120_000 });
    await startButton.click();

    const textarea = page.getByLabel(`Văn bản đã nhận dạng cho ${SAMPLE_IMAGE_NAME}`);
    await expect(textarea).toBeVisible({ timeout: 120_000 });
    await expect(textarea).toHaveValue(REFERENCE_TEXT);

    // The untouched preset keeps the original canvas size, so the
    // recognized-line overlay should be drawn on top of the preview image.
    await expect(page.locator('svg.ocr-page-overlay rect').first()).toBeVisible();

    await textarea.fill('Văn bản đã chỉnh sửa thủ công - Tini OCR');
    await expect(textarea).toHaveValue('Văn bản đã chỉnh sửa thủ công - Tini OCR');
  });

  test('exports the edited text as a Word document', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium');
    const exportButton = page.getByRole('button', { name: 'Xuất file' });
    await expect(exportButton).toBeEnabled();

    const exportedPath = testInfo.outputPath('tini-ocr-result.docx');
    fs.mkdirSync(path.dirname(exportedPath), { recursive: true });
    await electronApp.evaluate(({ dialog }, targetPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath });
    }, exportedPath);

    await exportButton.click();
    await expect(page.getByText(/^Đã lưu: /)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => fs.existsSync(exportedPath)).toBe(true);

    const bytes = fs.readFileSync(exportedPath);
    expect(bytes.length).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});
