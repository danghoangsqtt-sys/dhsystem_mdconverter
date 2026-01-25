import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ngăn chặn ứng dụng chạy nhiều lần
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
            autoHideMenuBar: true, // Ẩn menu bar mặc định của Electron
            icon: path.join(__dirname, '../public/vite.svg'), // Icon ứng dụng
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false, // Cho phép đơn giản hóa việc giao tiếp trong app local
                webSecurity: false // Cho phép load local resources nếu cần thiết
            }
        });
        // Load nội dung ứng dụng
        if (process.env.NODE_ENV === 'development') {
            mainWindow.loadURL('http://localhost:5173');
            // mainWindow.webContents.openDevTools(); // Mở DevTools khi dev
        }
        else {
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        }
        mainWindow.on('ready-to-show', () => {
            mainWindow.show();
        });
        // Mở các liên kết ngoài (ví dụ nút tải Ollama) bằng trình duyệt mặc định thay vì trong app
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('https:')) {
                shell.openExternal(url);
                return { action: 'deny' };
            }
            return { action: 'allow' };
        });
    };
    app.whenReady().then(() => {
        createWindow();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0)
                createWindow();
        });
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
