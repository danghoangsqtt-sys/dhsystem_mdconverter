import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
// Default-import instead of `import { autoUpdater } from 'electron-updater'`:
// electron-updater exports autoUpdater via a lazy Object.defineProperty
// getter, which some ESM/CJS interop paths resolve unreliably as a named
// import. Grabbing the whole CJS module.exports object (always available as
// the default export) sidesteps that entirely.
//
// Deliberately NOT destructured here (`const { autoUpdater } = ...`):
// reading that getter is what constructs the updater, which reads
// `app.getVersion()` - under `vite-plugin-electron`'s dev launcher that runs
// before Electron's `app` is in a state electron-updater expects, crashing
// the whole process at startup. Accessing `electronUpdater.autoUpdater` only
// at the call site below, inside the `app.isPackaged` + try/catch guard,
// keeps that access exactly where it's meaningful (a packaged build) and
// never lets it crash dev mode.
import electronUpdater from 'electron-updater';

const API_TOKEN = randomBytes(32).toString('base64url');
process.env.DOCUMARK_API_TOKEN = API_TOKEN;

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
      'Mark Tini - Unexpected Error',
      `${err.name}: ${err.message}\n\n${err.stack}`
    );
  } catch {
    // dialog might not be ready yet
  }
});

// Prevent EPIPE on stdout/stderr themselves
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});

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
let pythonProcess: ChildProcess | null = null;
let ollamaProcess: ChildProcess | null = null;

// ─── Backend Crash-Restart State ──────────────────────────────
// If the backend dies unexpectedly (crash, killed externally, etc.) we
// respawn it with exponential backoff, up to a cap. `intentionalShutdown`
// distinguishes our own deliberate kill (app quitting) from a real crash so
// we don't try to restart a backend we just told to die. A process that
// stays up for ~30s has its retry budget restored, so a flaky-but-mostly-ok
// backend doesn't permanently exhaust its restart attempts.
// ────────────────────────────────────────────────────────────────
let intentionalShutdown = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;
let restartResetTimer: NodeJS.Timeout | null = null;

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

function startPythonBackend() {
  const pythonCandidates = app.isPackaged
    ? [path.join(PROJECT_ROOT, 'python_runtime', 'python.exe')]
    : [
        path.join(PROJECT_ROOT, 'docling-env', 'Scripts', 'python.exe'),
        path.join(PROJECT_ROOT, 'python_runtime', 'python.exe'),
      ];
  const pythonExe = pythonCandidates.find(candidate => fs.existsSync(candidate));
  const runServerScript = path.join(PROJECT_ROOT, 'backend', 'run_server.py');
  const offlineModelsPath = path.join(PROJECT_ROOT, 'offline_models');
  const userDataPath = path.join(app.getPath('userData'), 'data');

  safeLog('─── Mark Tini Backend ───');
  safeLog(`  Project Root : ${PROJECT_ROOT}`);
  safeLog(`  Python Exe   : ${pythonExe ?? '(not found)'}`);
  safeLog(`  Script       : ${runServerScript}`);
  safeLog(`  Data Dir     : ${userDataPath}`);
  safeLog(`  Packaged     : ${app.isPackaged}`);

  // Validate paths before spawning
  if (!pythonExe) {
    safeLog(`[FATAL] Python executable not found. Checked: ${pythonCandidates.join(', ')}`);
    dialog.showErrorBox(
      'Mark Tini - Backend Not Found',
      `Không tìm thấy Python runtime.\n\nĐã kiểm tra:\n${pythonCandidates.join('\n')}\n\nHãy chạy script chuẩn bị offline bundle trước khi đóng gói.`
    );
    return;
  }

  if (app.isPackaged && !fs.existsSync(offlineModelsPath)) {
    safeLog(`[FATAL] Offline models not found: ${offlineModelsPath}`);
    dialog.showErrorBox(
      'Mark Tini - Offline Models Not Found',
      `Không tìm thấy model AI offline tại:\n${offlineModelsPath}\n\nBản cài đặt chưa được build đúng quy trình.`
    );
    return;
  }

  if (!fs.existsSync(runServerScript)) {
    safeLog(`[FATAL] Server script not found: ${runServerScript}`);
    dialog.showErrorBox(
      'Mark Tini - Server Script Not Found',
      `Không tìm thấy file server:\n${runServerScript}`
    );
    return;
  }

  const backendEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    DOCUMARK_API_TOKEN: API_TOKEN,
    DOCUMARK_DATA_DIR: userDataPath,
  };
  if (app.isPackaged) {
    backendEnvironment.DOCUMARK_OFFLINE_MODE = '1';
    backendEnvironment.DOCLING_ARTIFACTS_PATH = offlineModelsPath;
    backendEnvironment.DOCUMARK_TRANSLATION_MODEL_PATH = path.join(offlineModelsPath, 'translation');
    backendEnvironment.HF_HUB_OFFLINE = '1';
    backendEnvironment.TRANSFORMERS_OFFLINE = '1';
    backendEnvironment.PYTHONNOUSERSITE = '1';
  }

  pythonProcess = spawn(pythonExe, ['-s', runServerScript], {
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: backendEnvironment,
    windowsHide: true,
  });

  pythonProcess.stdout?.on('data', (data) => {
    safeLog(`[Backend] ${data}`);
  });

  // Use safeLog instead of console.error to avoid EPIPE crashes
  pythonProcess.stderr?.on('data', (data) => {
    safeLog(`[Backend ERR] ${data}`);
  });

  // Prevent stream errors from crashing the app
  pythonProcess.stdout?.on('error', () => {});
  pythonProcess.stderr?.on('error', () => {});

  pythonProcess.on('error', (err) => {
    safeLog(`[Backend SPAWN ERROR] ${err.message}`);
    dialog.showErrorBox(
      'Mark Tini - Lỗi khởi động Backend',
      `Không thể khởi chạy máy chủ Python:\n${err.message}`
    );
  });

  pythonProcess.on('spawn', () => {
    // Process survived long enough to be considered stable — restore its
    // full restart budget so an occasional crash long after startup isn't
    // penalized by attempts spent during an earlier rough patch.
    if (restartResetTimer) clearTimeout(restartResetTimer);
    restartResetTimer = setTimeout(() => {
      restartAttempts = 0;
      safeLog('[Backend] Stable for 30s — restart budget reset.');
    }, 30000);
  });

  pythonProcess.on('close', (code) => {
    safeLog(`[Backend] process exited with code ${code}`);
    pythonProcess = null;

    if (intentionalShutdown) {
      return;
    }

    if (restartResetTimer) {
      clearTimeout(restartResetTimer);
      restartResetTimer = null;
    }

    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
      safeLog(`[Backend] Giving up after ${restartAttempts} restart attempts.`);
      dialog.showErrorBox(
        'Mark Tini - Backend liên tục gặp sự cố',
        `Máy chủ xử lý đã dừng đột ngột ${restartAttempts} lần liên tiếp và sẽ không tự khởi động lại nữa.\n\nVui lòng khởi động lại ứng dụng. Nếu sự cố tiếp diễn, hãy kiểm tra log để biết chi tiết.`
      );
      return;
    }

    restartAttempts += 1;
    const delayMs = Math.min(1000 * 2 ** (restartAttempts - 1), 30000);
    safeLog(`[Backend] Unexpected exit — restarting in ${delayMs}ms (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
    setTimeout(() => {
      if (!intentionalShutdown) {
        startPythonBackend();
      }
    }, delayMs);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Mark Tini',
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [`--documark-api-token=${API_TOKEN}`],
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
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
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

// Purpose-specific bridge: the renderer can request the known local Ollama
// service, but cannot choose an executable or pass arbitrary arguments.
ipcMain.handle('ensure-ollama', async (): Promise<OllamaStartupStatus> => ensureOllama());

app.on('window-all-closed', () => {
  intentionalShutdown = true;
  if (pythonProcess) {
    safeLog('Killing python backend process...');
    try {
      // On Windows, SIGTERM may not work. Use taskkill instead.
      if (process.platform === 'win32' && pythonProcess.pid) {
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'], { windowsHide: true });
      } else {
        pythonProcess.kill('SIGTERM');
      }
    } catch (e) {
      safeLog('Error killing backend:', e);
    }
  }
  if (ollamaProcess?.pid) {
    try {
      spawn('taskkill', ['/pid', String(ollamaProcess.pid), '/f', '/t'], { windowsHide: true });
    } catch (e) {
      safeLog('Error stopping Ollama started by Mark Tini:', e);
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  startPythonBackend();
  // Show the window immediately rather than guessing how long the backend
  // needs — the renderer polls /api/health itself and shows real startup
  // progress (model loading can take much longer than any fixed delay,
  // especially on a first run that downloads OCR models).
  createWindow();

  // Only meaningful for a packaged, installed build (there's no update feed
  // to check against in dev, and unpackaged runs can't self-replace anyway).
  if (app.isPackaged) {
    try {
      electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        safeLog(`[AutoUpdater] Check failed: ${err instanceof Error ? err.message : err}`);
      });
    } catch (err) {
      safeLog(`[AutoUpdater] Failed to start update check: ${err instanceof Error ? err.message : err}`);
    }
  }
});
