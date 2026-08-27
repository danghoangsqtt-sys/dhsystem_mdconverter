import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { PRODUCT_METADATA, productIdFromArguments } from '../src/shared/product';
import { TiniCoreSupervisor } from './coreSupervisor';

let API_TOKEN = '';
const PRODUCT_ID = productIdFromArguments(process.argv);
const PRODUCT = PRODUCT_METADATA[PRODUCT_ID];

// ─── Global EPIPE Guard ────────────────────────────────────────
// In packaged mode there is no console attached. Writing to
// process.stdout / process.stderr can throw EPIPE when the pipe
// is broken. Swallow these instead of crashing the app.
// ────────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') {
    // Silently ignore broken-pipe errors from console writes
    return;
  }
  // For all other uncaught exceptions, show an error dialog
  try {
    dialog.showErrorBox(
      `${PRODUCT.name} - Unexpected Error`,
      `${err.name}: ${err.message}\n\n${err.stack}`
    );
  } catch {
    // dialog might not be ready yet
  }
  // Attempt graceful shutdown on uncaught exception
  if (!shutdownStarted) {
    shutdownStarted = true;
    // Force exit after cleanup attempt
    setTimeout(() => process.exit(1), 2000).unref();
    void shutdownApplication();
  }
});

process.on('unhandledRejection', (reason) => {
  safeLog('Unhandled rejection:', reason);
  // Don't crash, but log for debugging
});

// Handle termination signals for graceful shutdown
const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGBREAK'] as const;
for (const signal of shutdownSignals) {
  process.on(signal, () => {
    safeLog(`Received ${signal}, shutting down gracefully...`);
    if (!shutdownStarted) {
      void shutdownApplication();
    }
  });
}

// Prevent EPIPE on stdout/stderr themselves
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});

// Final cleanup on process exit (last resort)
process.on('exit', () => {
  if (ollamaProcess?.pid && !ollamaProcess.killed) {
    try {
      process.kill(ollamaProcess.pid, 'SIGKILL');
    } catch { /* ignore */ }
  }
});

// `__dirname` is a native CommonJS global — the build now compiles this file
// to real CJS output (see vite.config.ts), so no ESM `import.meta.url` shim
// is needed to derive it.

// ─── Path Resolution ───────────────────────────────────────────
// Dev mode:  __dirname = frontend/dist-electron/  → APP_ROOT = frontend/
// Packaged:  __dirname points inside Electron's transparent
//            resources/app.asar/dist-electron/ virtual filesystem.
//            We need the REAL project root: resources/
// ────────────────────────────────────────────────────────────────

function getProjectRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    // Dev mode: __dirname = frontend/dist-electron/
    // Go up 2 levels: dist-electron → frontend → markdown_convert
    return path.resolve(__dirname, '..', '..');
  }
}

const PROJECT_ROOT = getProjectRoot();

// APP_ROOT: __dirname-based
// Dev:      __dirname = frontend/dist-electron/  → APP_ROOT = frontend/
// Packaged: __dirname = resources/app/dist-electron/ → APP_ROOT = resources/app/
// Electron path APIs transparently resolve renderer/preload files in ASAR.
process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;
let ollamaProcess: ChildProcess | null = null;
let coreSupervisor: TiniCoreSupervisor | null = null;
let shutdownStarted = false;

// Safe logging helper — never throws even if stdout/stderr is broken
function safeLog(...args: unknown[]) {
  try { console.log(...args); } catch { /* swallow */ }
}

type OllamaStartupStatus = 'running' | 'started' | 'not_installed' | 'start_failed';

async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function findOllamaExecutable(): string | null {
  const candidates = [
    process.env.OLLAMA_EXE,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')
      : undefined,
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe')
      : undefined,
  ];
  return candidates.find((candidate): candidate is string =>
    typeof candidate === 'string'
      && candidate.toLowerCase().endsWith('ollama.exe')
      && fs.existsSync(candidate)
  ) ?? null;
}

async function ensureOllama(): Promise<OllamaStartupStatus> {
  if (await isOllamaRunning()) return 'running';

  const ollamaExe = findOllamaExecutable();
  if (!ollamaExe) return 'not_installed';

  if (!ollamaProcess || ollamaProcess.exitCode !== null) {
    try {
      ollamaProcess = spawn(ollamaExe, ['serve'], {
        detached: false,
        stdio: 'ignore',
        windowsHide: true,
      });
      ollamaProcess.on('error', (error) => {
        safeLog(`[Ollama] Failed to start: ${error.message}`);
        ollamaProcess = null;
      });
      ollamaProcess.on('close', () => {
        ollamaProcess = null;
      });
    } catch (error) {
      safeLog(`[Ollama] Failed to spawn: ${error instanceof Error ? error.message : error}`);
      return 'start_failed';
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (await isOllamaRunning()) return 'started';
  }
  return 'start_failed';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: PRODUCT.windowTitle,
    icon: path.join(process.env.VITE_PUBLIC!, PRODUCT.iconFile),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [
        `--documark-api-token=${API_TOKEN}`,
        `--product=${PRODUCT_ID}`,
        `--app-version=${app.getVersion()}`,
      ],
    },
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    safeLog(`[Renderer] Failed to load: ${validatedURL} — ${errorCode} ${errorDescription}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win?.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  if (VITE_DEV_SERVER_URL) {
    const rendererUrl = new URL(VITE_DEV_SERVER_URL);
    rendererUrl.searchParams.set('product', PRODUCT_ID);
    win.loadURL(rendererUrl.toString());
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { product: PRODUCT_ID },
    });
  }
}

// ─── IPC: Open External URL ────────────────────────────────────
// The renderer runs with nodeIntegration disabled and no direct Electron
// API access, so opening a web-search URL (region-extraction "search on
// web" action) has to be brokered through the main process. Restricted to
// http(s) to avoid the renderer ever getting a general-purpose "run any
// shell handler" primitive via a crafted url/file/javascript: URL.
// ────────────────────────────────────────────────────────────────
ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    safeLog(`[IPC] Rejected open-external for non-http(s) URL: ${url}`);
    return;
  }
  await shell.openExternal(url);
});

type SaveWordFileResult =
  | { status: 'saved'; filePath: string }
  | { status: 'cancelled' };

ipcMain.handle(
  'save-word-file',
  async (event, requestedName: unknown, bytes: unknown): Promise<SaveWordFileResult> => {
    if (typeof requestedName !== 'string') {
      throw new Error('Tên file Word không hợp lệ.');
    }
    const safeName = path.basename(requestedName.trim());
    if (!safeName || safeName.length > 255 || !safeName.toLowerCase().endsWith('.docx')) {
      throw new Error('Tên file Word không hợp lệ.');
    }
    const data = bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : null;
    if (!data || data.byteLength === 0) {
      throw new Error('Dữ liệu file Word trống hoặc không hợp lệ.');
    }

    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Lưu tài liệu Microsoft Word',
      defaultPath: path.join(app.getPath('documents'), safeName),
      filters: [{ name: 'Tài liệu Microsoft Word', extensions: ['docx'] }],
    };
    const selection = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);
    if (selection.canceled || !selection.filePath) return { status: 'cancelled' };

    await fs.promises.writeFile(selection.filePath, data);
    return { status: 'saved', filePath: selection.filePath };
  },
);

ipcMain.handle(
  'save-export-file',
  async (event, requestedName: unknown, bytes: unknown): Promise<SaveWordFileResult> => {
    if (typeof requestedName !== 'string') throw new Error('Tên file xuất không hợp lệ.');
    const safeName = path.basename(requestedName.trim());
    const extension = path.extname(safeName).toLowerCase();
    const filters: Record<string, { name: string; extensions: string[] }> = {
      '.txt': { name: 'Văn bản thuần', extensions: ['txt'] },
      '.md': { name: 'Markdown', extensions: ['md'] },
      '.docx': { name: 'Tài liệu Microsoft Word', extensions: ['docx'] },
    };
    if (!safeName || safeName.length > 255 || !filters[extension]) {
      throw new Error('Tên hoặc định dạng file xuất không hợp lệ.');
    }
    const data = bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : null;
    if (!data || data.byteLength === 0) throw new Error('Dữ liệu file xuất trống hoặc không hợp lệ.');

    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Lưu kết quả Tini OCR',
      defaultPath: path.join(app.getPath('documents'), safeName),
      filters: [filters[extension]],
    };
    const selection = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);
    if (selection.canceled || !selection.filePath) return { status: 'cancelled' };
    await fs.promises.writeFile(selection.filePath, data);
    return { status: 'saved', filePath: selection.filePath };
  },
);

// Purpose-specific bridge: the renderer can request the known local Ollama
// service, but cannot choose an executable or pass arbitrary arguments.
ipcMain.handle('ensure-ollama', async (): Promise<OllamaStartupStatus> => ensureOllama());

async function shutdownApplication() {
  if (shutdownStarted) return;
  shutdownStarted = true;

  if (ollamaProcess?.pid) {
    try {
      spawn('taskkill', ['/pid', String(ollamaProcess.pid), '/f', '/t'], { windowsHide: true });
    } catch (e) {
      safeLog('Error stopping Ollama started by Mark Tini:', e);
    }
  }

  try {
    await coreSupervisor?.dispose();
  } catch (error) {
    safeLog(`[Tini Core] Shutdown failed: ${error instanceof Error ? error.message : error}`);
  }

  coreSupervisor = null;
  win = null;
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') void shutdownApplication();
});

app.on('before-quit', (event) => {
  if (!shutdownStarted && coreSupervisor) {
    event.preventDefault();
    void shutdownApplication();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId(PRODUCT.appUserModelId);
  coreSupervisor = new TiniCoreSupervisor({
    // Override hook for e2e tests only (see frontend/e2e/testUserData.ts) -
    // redirects the "Tini Suite" data/session root away from the real
    // %APPDATA%\Tini Suite profile. Unset in dev and packaged builds, so
    // app.getPath('appData') is used exactly as before.
    appDataDir: process.env.DOCUMARK_APP_DATA_DIR || app.getPath('appData'),
    legacyUserDataDir: app.getPath('userData'),
    projectRoot: PROJECT_ROOT,
    productId: PRODUCT_ID,
    packaged: app.isPackaged,
    appVersion: app.getVersion(),
    log: safeLog,
  });

  try {
    const session = await coreSupervisor.connect();
    API_TOKEN = session.token;
    process.env.DOCUMARK_API_TOKEN = API_TOKEN;
  } catch (error) {
    shutdownStarted = true;
    const message = error instanceof Error ? error.message : String(error);
    safeLog(`[Tini Core] Startup failed: ${message}`);
    dialog.showErrorBox(`${PRODUCT.name} - Tini Core`, message);
    app.exit(1);
    return;
  }

  // Show the window immediately rather than guessing how long the backend
  // needs — the renderer polls /api/health itself and shows real startup
  // progress (model loading can take much longer than any fixed delay,
  // especially on a first run that downloads OCR models).
  createWindow();

});
