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
  let convertedFileName: string;

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: [MAIN_ENTRY, '--product=mark-tini'], env: electronEnv });
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
      page.getByRole('button', { name: /^(Chọn tài liệu|Đang khởi động\.\.\.)$/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chọn cả thư mục' })).toBeVisible();
    await expect(page.locator('input[type="file"][webkitdirectory]')).toHaveCount(1);
  });

  test('keeps toolbar and sidebar controls separate in a narrow window', async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(820, 700);
    });
    await page.waitForTimeout(250);

    const layout = await page.evaluate(() => {
      const inspectGroup = (selector: string) => {
        const group = document.querySelector<HTMLElement>(selector);
        if (!group) return { missing: true, overflow: true, overlaps: ['missing'] };
        const groupRect = group.getBoundingClientRect();
        const children = Array.from(group.children)
          .filter((child): child is HTMLElement => child instanceof HTMLElement)
          .filter((child) => {
            const style = window.getComputedStyle(child);
            const rect = child.getBoundingClientRect();
            return style.display !== 'none' && rect.width > 0 && rect.height > 0;
          });
        const overlaps: string[] = [];
        children.forEach((left, leftIndex) => {
          const a = left.getBoundingClientRect();
          children.slice(leftIndex + 1).forEach((right, rightOffset) => {
            const b = right.getBoundingClientRect();
            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapX > 1 && overlapY > 1) {
              overlaps.push(`${leftIndex}-${leftIndex + rightOffset + 1}`);
            }
          });
        });
        return {
          missing: false,
          overflow: children.some((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left < groupRect.left - 1 || rect.right > groupRect.right + 1
              || rect.top < groupRect.top - 1 || rect.bottom > groupRect.bottom + 1;
          }),
          overlaps,
        };
      };

      const toolbar = document.querySelector<HTMLElement>('[data-testid="main-toolbar"]');
      const sidebarOptions = document.querySelector<HTMLElement>('[data-testid="sidebar-conversion-options"]');
      return {
        toolbar: inspectGroup('[data-testid="toolbar-actions"]'),
        sidebar: inspectGroup('[data-testid="sidebar-conversion-options"]'),
        toolbarScrollsHorizontally: Boolean(toolbar && toolbar.scrollWidth > toolbar.clientWidth + 1),
        sidebarScrollsHorizontally: Boolean(sidebarOptions && sidebarOptions.scrollWidth > sidebarOptions.clientWidth + 1),
      };
    });

    expect(layout.toolbar).toEqual({ missing: false, overflow: false, overlaps: [] });
    expect(layout.sidebar).toEqual({ missing: false, overflow: false, overlaps: [] });
    expect(layout.toolbarScrollsHorizontally).toBe(false);
    expect(layout.sidebarScrollsHorizontally).toBe(false);
    await expect(page.getByRole('button', { name: /Chọn tài liệu gốc|Mở tài liệu gốc/ })).toBeVisible();

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1200, 800);
    });
    await page.waitForTimeout(250);
  });

  test('converts a real PDF and shows the extracted text in the editor', async () => {
    const uploadButton = page.getByRole('button', { name: 'Chọn tài liệu', exact: true });
    // Generous timeout: covers real backend startup plus Docling model
    // warm-up (warm_up_models), which the renderer waits out via its own
    // /api/health poll rather than a fixed delay.
    await expect(uploadButton).toBeEnabled({ timeout: 120_000 });

    const fileInput = page.locator('input[type="file"][multiple]:not([webkitdirectory])');
    convertedFileName = `single-${Date.now()}.pdf`;
    await fileInput.setInputFiles({
      name: convertedFileName,
      mimeType: 'application/pdf',
      buffer: fs.readFileSync(SAMPLE_PDF),
    });

    await expect(page.locator('#root')).toContainText('Mark Tini E2E Fixture', { timeout: 60_000 });
    await expect(page.getByText(convertedFileName, { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  });

  test('exports the complete original PDF as a faithful Word document', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium');
    const exportButton = page.getByRole('button', { name: 'Xuất Word giống PDF', exact: true });
    await expect(exportButton).toBeEnabled({ timeout: 30_000 });

    const exportedPath = testInfo.outputPath(convertedFileName.replace(/\.pdf$/i, '-giong-pdf.docx'));
    fs.mkdirSync(path.dirname(exportedPath), { recursive: true });
    await electronApp.evaluate(({ dialog }, targetPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath });
    }, exportedPath);
    await exportButton.click();
    await expect(page.getByText('Đã tạo file Word giữ nguyên nội dung và bố cục PDF.')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => fs.existsSync(exportedPath)).toBe(true);
    const bytes = fs.readFileSync(exportedPath);
    expect(bytes.length).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  test('restores the original PDF, extracts the full crop, and resizes the result panel', async () => {
    await page.evaluate(() => localStorage.setItem('marktini_extraction_panel_height', '240'));
    await page.getByText(convertedFileName, { exact: true }).first().click();
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
    const uploadButton = page.getByRole('button', { name: 'Chọn tài liệu', exact: true });
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

test.describe('Tini Suite product boundaries', () => {
  test('launches the Tini OCR shell without Mark Tini controls', async () => {
    const ocrApp = await electron.launch({
      args: [MAIN_ENTRY, '--product=tini-ocr'],
      env: electronEnv,
    });
    try {
      const ocrPage = await ocrApp.firstWindow();
      await expect(ocrPage).toHaveTitle('Tini OCR — Image to Text & Word');
      await expect(ocrPage.getByTestId('tini-ocr-shell')).toBeVisible();
      await expect(ocrPage.getByRole('heading', { name: 'Biến ảnh chụp tài liệu thành nội dung có thể chỉnh sửa' })).toBeVisible();
      await expect(ocrPage.getByRole('button', { name: 'Chọn ảnh' })).toBeVisible();
      await expect(ocrPage.getByRole('button', { name: 'Chọn tài liệu' })).toHaveCount(0);
    } finally {
      await ocrApp.close();
    }
  });

  test('opens Mark Tini and Tini OCR at the same time', async () => {
    const [markApp, ocrApp] = await Promise.all([
      electron.launch({ args: [MAIN_ENTRY, '--product=mark-tini'], env: electronEnv }),
      electron.launch({ args: [MAIN_ENTRY, '--product=tini-ocr'], env: electronEnv }),
    ]);
    try {
      const [markPage, ocrPage] = await Promise.all([markApp.firstWindow(), ocrApp.firstWindow()]);
      await expect(markPage).toHaveTitle('Mark Tini');
      await expect(ocrPage).toHaveTitle('Tini OCR — Image to Text & Word');
      await expect(markPage.getByText('DHSystem').first()).toBeVisible();
      await expect(ocrPage.getByTestId('tini-ocr-shell')).toBeVisible();
    } finally {
      await Promise.all([ocrApp.close(), markApp.close()]);
    }
  });
});
