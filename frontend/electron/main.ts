import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Path Resolution ───────────────────────────────────────────
// Dev mode:  __dirname = frontend/dist-electron/  → APP_ROOT = frontend/
// Packaged:  exe lives in frontend/dist/win-unpacked/frontend.exe
//            but __dirname points inside resources/app.asar/dist-electron/
//            We need the REAL project root: markdown_convert/
// ────────────────────────────────────────────────────────────────

function getProjectRoot(): string {
  if (app.isPackaged) {
    // Packaged exe path: .../frontend/dist/win-unpacked/frontend.exe
    // Go up 3 levels:    win-unpacked → dist → frontend → markdown_convert
    const exeDir = path.dirname(process.execPath);
    return path.resolve(exeDir, '..', '..', '..');
  } else {
    // Dev mode: __dirname = frontend/dist-electron/
    // Go up 2 levels: dist-electron → frontend → markdown_convert
    return path.resolve(__dirname, '..', '..');
  }
}

const PROJECT_ROOT = getProjectRoot();

// APP_ROOT is the frontend directory
process.env.APP_ROOT = app.isPackaged
  ? path.dirname(path.dirname(path.dirname(process.execPath)))  // won't be used much in packaged
  : path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = app.isPackaged
  ? path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'dist')
  : path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;
let pythonProcess: ChildProcess | null = null;

function startPythonBackend() {
  const pythonExe = path.join(PROJECT_ROOT, 'docling-env', 'Scripts', 'python.exe');
  const runServerScript = path.join(PROJECT_ROOT, 'backend', 'run_server.py');

  console.log('─── DocuMark AI Backend ───');
  console.log(`  Project Root : ${PROJECT_ROOT}`);
  console.log(`  Python Exe   : ${pythonExe}`);
  console.log(`  Script       : ${runServerScript}`);
  console.log(`  Packaged     : ${app.isPackaged}`);

  // Validate paths before spawning
  if (!fs.existsSync(pythonExe)) {
    console.error(`[FATAL] Python executable not found: ${pythonExe}`);
    dialog.showErrorBox(
      'DocuMark AI - Backend Not Found',
      `Không tìm thấy Python tại:\n${pythonExe}\n\nVui lòng đảm bảo thư mục "docling-env" nằm trong thư mục gốc của dự án.`
    );
    return;
  }

  if (!fs.existsSync(runServerScript)) {
    console.error(`[FATAL] Server script not found: ${runServerScript}`);
    dialog.showErrorBox(
      'DocuMark AI - Server Script Not Found',
      `Không tìm thấy file server:\n${runServerScript}`
    );
    return;
  }

  pythonProcess = spawn(pythonExe, [runServerScript], {
    cwd: PROJECT_ROOT,
    detached: false,
  });

  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data}`);
  });

  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Backend ERR] ${data}`);
  });

  pythonProcess.on('error', (err) => {
    console.error(`[Backend SPAWN ERROR] ${err.message}`);
    dialog.showErrorBox(
      'DocuMark AI - Lỗi khởi động Backend',
      `Không thể khởi chạy máy chủ Python:\n${err.message}`
    );
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Backend] process exited with code ${code}`);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DocuMark AI',
    icon: path.join(
      app.isPackaged
        ? path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'dist')
        : path.join(process.env.APP_ROOT, 'public'),
      'favicon.png'
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (pythonProcess) {
    console.log('Killing python backend process...');
    try {
      // On Windows, SIGTERM may not work. Use taskkill instead.
      if (process.platform === 'win32' && pythonProcess.pid) {
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t']);
      } else {
        pythonProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('Error killing backend:', e);
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
