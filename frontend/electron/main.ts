import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;
let pythonProcess: ChildProcess | null = null;

function startPythonBackend() {
  // Path to the python executable and the backend script
  // Since this is run from `frontend` or `frontend/dist-electron`, we go up one directory
  const rootDir = path.join(process.env.APP_ROOT, '..');
  const pythonExe = path.join(rootDir, 'docling-env', 'Scripts', 'python.exe');
  const runServerScript = path.join(rootDir, 'backend', 'run_server.py');

  console.log('Starting Python backend...');
  console.log(`Python Exe: ${pythonExe}`);
  console.log(`Script: ${runServerScript}`);

  pythonProcess = spawn(pythonExe, [runServerScript], {
    cwd: rootDir,
    detached: false, // Kill python if electron dies
  });

  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data}`);
  });

  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Backend ERR] ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Backend] child process exited with code ${code}`);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DocuMark AI',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Test active push message to Renderer-process.
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
    pythonProcess.kill('SIGTERM');
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
  // Wait a bit for FastAPI to start
  setTimeout(() => {
    createWindow();
  }, 2000);
});
