import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';

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
      'DocuMark AI - Unexpected Error',
      `${err.name}: ${err.message}\n\n${err.stack}`
    );
  } catch {
    // dialog might not be ready yet
  }
});

// Prevent EPIPE on stdout/stderr themselves
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Path Resolution ───────────────────────────────────────────
// Dev mode:  __dirname = frontend/dist-electron/  → APP_ROOT = frontend/
// Packaged:  exe lives in frontend/dist/win-unpacked/frontend.exe
//            but __dirname points inside resources/app/dist-electron/
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
// With asar:false, __dirname always points to real filesystem paths.
process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;
let pythonProcess: ChildProcess | null = null;

// Safe logging helper — never throws even if stdout/stderr is broken
function safeLog(...args: unknown[]) {
  try { console.log(...args); } catch { /* swallow */ }
}

function startPythonBackend() {
  const pythonExe = path.join(PROJECT_ROOT, 'docling-env', 'Scripts', 'python.exe');
  const runServerScript = path.join(PROJECT_ROOT, 'backend', 'run_server.py');

  safeLog('─── DocuMark AI Backend ───');
  safeLog(`  Project Root : ${PROJECT_ROOT}`);
  safeLog(`  Python Exe   : ${pythonExe}`);
  safeLog(`  Script       : ${runServerScript}`);
  safeLog(`  Packaged     : ${app.isPackaged}`);

  // Validate paths before spawning
  if (!fs.existsSync(pythonExe)) {
    safeLog(`[FATAL] Python executable not found: ${pythonExe}`);
    dialog.showErrorBox(
      'DocuMark AI - Backend Not Found',
      `Không tìm thấy Python tại:\n${pythonExe}\n\nVui lòng đảm bảo thư mục "docling-env" nằm trong thư mục gốc của dự án.`
    );
    return;
  }

  if (!fs.existsSync(runServerScript)) {
    safeLog(`[FATAL] Server script not found: ${runServerScript}`);
    dialog.showErrorBox(
      'DocuMark AI - Server Script Not Found',
      `Không tìm thấy file server:\n${runServerScript}`
    );
    return;
  }

  pythonProcess = spawn(pythonExe, [runServerScript], {
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
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
      'DocuMark AI - Lỗi khởi động Backend',
      `Không thể khởi chạy máy chủ Python:\n${err.message}`
    );
  });

  pythonProcess.on('close', (code) => {
    safeLog(`[Backend] process exited with code ${code}`);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DocuMark AI',
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    safeLog(`[Renderer] Failed to load: ${validatedURL} — ${errorCode} ${errorDescription}`);
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (pythonProcess) {
    safeLog('Killing python backend process...');
    try {
      // On Windows, SIGTERM may not work. Use taskkill instead.
      if (process.platform === 'win32' && pythonProcess.pid) {
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t']);
      } else {
        pythonProcess.kill('SIGTERM');
      }
    } catch (e) {
      safeLog('Error killing backend:', e);
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
  // Wait for FastAPI to start up
  setTimeout(() => {
    createWindow();
  }, 2500);
});
