import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
else {
    let mainWindow;
    const createWindow = () => {
        mainWindow = new BrowserWindow({
            width: 1280,
            height: 800,
            show: false,
            autoHideMenuBar: true,
            icon: path.join(__dirname, '../public/icon.ico'),
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                webSecurity: false
            }
        });
        // Ép buộc kiểm tra môi trường phát triển
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        if (isDev) {
            console.log('Chế độ: Development - Đang kết nối http://localhost:5173');
            mainWindow.loadURL('http://localhost:5173');
            mainWindow.webContents.openDevTools();
        }
        else {
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        }
        mainWindow.on('ready-to-show', () => {
            mainWindow.show();
        });
        mainWindow.webContents.on('did-fail-load', () => {
            if (isDev) {
                setTimeout(() => mainWindow.loadURL('http://localhost:5173'), 1000);
            }
        });
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('https:')) {
                shell.openExternal(url);
                return { action: 'deny' };
            }
            return { action: 'allow' };
        });
    };
    app.whenReady().then(createWindow);
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin')
            app.quit();
    });
}
