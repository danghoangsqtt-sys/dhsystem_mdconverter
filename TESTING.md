# Kiểm thử End-to-End — Kiến trúc cách ly kép

Tài liệu này giải thích cách bộ E2E test (Playwright, `frontend/e2e/`) chạy **ứng dụng Electron thật** (main + preload + renderer, gắn vào Tini Core thật) mà không đụng vào dữ liệu người dùng thật. Xem [README.md](README.md#-kiểm-thử) để biết lệnh chạy nhanh; tài liệu này tập trung vào *tại sao* và *như thế nào*.

## 1. Vấn đề: hai lớp profile cần cách ly

Khi Playwright gọi `electron.launch()`, ứng dụng khởi động **giống hệt** một lần chạy thật của người dùng — nghĩa là nó cũng chạm vào hai lớp dữ liệu thật nếu không được redirect:

| Lớp | Ai sở hữu | Mặc định trỏ tới | Rủi ro nếu không cách ly |
|---|---|---|---|
| **Electron userData** | Chromium (bên trong Electron) | Thư mục theo tên app (`app.getPath('userData')`) | Đọc/ghi `localStorage`, IndexedDB, cache thật của UI — test có thể đọc phải sidebar state cũ, hoặc ghi đè autosave thật |
| **Tini Suite data/session root** | `TiniCoreSupervisor` (`frontend/electron/coreSupervisor.ts`) | `app.getPath('appData')` → `%APPDATA%\Tini Suite` | Ghi lịch sử chuyển đổi thật vào `history.json`, spawn/attach vào Tini Core thật đang chạy cho người dùng |

Hai lớp này **độc lập với nhau** — không có cách nào tắt cả hai bằng một cờ duy nhất. Vì vậy bộ test dùng đúng hai cơ chế tương ứng, mỗi cơ chế xử lý một lớp.

## 2. Cơ chế cách ly kép

Định nghĩa tập trung tại [`frontend/e2e/testUserData.ts`](frontend/e2e/testUserData.ts):

```ts
export const TEST_PROFILE_ROOT = path.join(os.tmpdir(), 'tini-suite-e2e-userdata');
export const TEST_ELECTRON_USER_DATA_DIR = path.join(TEST_PROFILE_ROOT, 'electron-userdata');
export const TEST_APP_DATA_DIR = path.join(TEST_PROFILE_ROOT, 'appdata');
export const TEST_CORE_DESCRIPTOR = path.join(TEST_APP_DATA_DIR, 'Tini Suite', 'core', 'session.json');
```

### 2.1. `--user-data-dir` — cách ly lớp Electron/Chromium

Cờ khởi chạy chuẩn của Electron/Chromium, ép `app.getPath('userData')` trỏ vào thư mục tạm thay vì thư mục thật:

```ts
// frontend/e2e/app.spec.ts
const ISOLATION_ARGS = [`--user-data-dir=${TEST_ELECTRON_USER_DATA_DIR}`];
```

### 2.2. `DOCUMARK_APP_DATA_DIR` — cách ly lớp Tini Core

Biến môi trường tự định nghĩa, được `frontend/electron/main.ts` đọc khi tính `appDataDir` truyền vào `TiniCoreSupervisor`:

```ts
// frontend/electron/main.ts
appDataDir: process.env.DOCUMARK_APP_DATA_DIR || app.getPath('appData'),
```

```ts
// frontend/e2e/app.spec.ts
const electronEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined
    )
  ),
  DOCUMARK_APP_DATA_DIR: TEST_APP_DATA_DIR,
};
```

**Vì sao một biến này đủ để cách ly luôn cả backend:** `TiniCoreSupervisor` không dừng ở việc dùng `appDataDir` cho riêng nó — nó tính tiếp `dataDir` từ đó, rồi bơm xuống Tini Core (tiến trình Python) khi spawn:

```
DOCUMARK_APP_DATA_DIR (env, do test set)
  └─▶ main.ts: appDataDir = process.env.DOCUMARK_APP_DATA_DIR || app.getPath('appData')
        └─▶ coreSupervisor.ts: this.suiteRoot = <appDataDir>/Tini Suite
              └─▶ coreSupervisor.ts: this.dataDir = <suiteRoot>/data
                    └─▶ spawn backend: env.DOCUMARK_DATA_DIR = this.dataDir
                          └─▶ backend/src/config.py đọc DOCUMARK_DATA_DIR
                                → uploads/, outputs/, history.json, logs/
```

Nói cách khác, override một biến duy nhất (`DOCUMARK_APP_DATA_DIR`) ở tầng Electron sẽ tự động lan xuống tận backend — test không cần set `DOCUMARK_DATA_DIR` thủ công, và không có đường nào để một giá trị cũ/thật lọt qua.

> ⚠️ **Lưu ý khi viết test mới**: `electron.launch({ env })` **thay thế toàn bộ** env của tiến trình con thay vì merge với `process.env` của tiến trình cha. Vì vậy `electronEnv` ở trên luôn phải copy đầy đủ `process.env` trước khi override — quên bước này sẽ khiến app con thiếu biến hệ thống (PATH, v.v.) chứ không chỉ thiếu `DOCUMARK_APP_DATA_DIR`.
>
> Một số shell — đáng chú ý là terminal tích hợp của VS Code (bản thân nó cũng là app Electron) — rò rỉ `ELECTRON_RUN_AS_NODE=1` vào tiến trình con. Nếu biến này lọt vào, `electron.exe` sẽ chạy như một Node binary thuần thay vì bootstrap ứng dụng, và crash ngay khi gặp cờ Chromium-only như `--remote-debugging-port` với lỗi "bad option". `app.spec.ts` lọc bỏ biến này trước khi truyền env cho `electron.launch()`.

## 3. `globalSetup.ts` — đảm bảo khởi đầu sạch

Chạy một lần trước toàn bộ suite ([`frontend/e2e/globalSetup.ts`](frontend/e2e/globalSetup.ts)):

```ts
export default function globalSetup() {
  fs.rmSync(TEST_PROFILE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEST_PROFILE_ROOT, { recursive: true });
}
```

Xoá và tạo lại toàn bộ `TEST_PROFILE_ROOT` (bao gồm cả hai thư mục con `electron-userdata` và `appdata`) trước khi chạy, thay vì trông chờ `electron.launch()` tự tạo thư mục rỗng ở lần dùng đầu. Điều này đảm bảo mỗi lần chạy suite đều xuất phát từ trạng thái sạch, kể cả khi lần chạy trước bị crash giữa chừng và để lại state dở dang (ví dụ: lock file hoặc descriptor của Tini Core chưa được dọn).

## 4. Chạy test

```powershell
cd frontend
npm run test:e2e
```

Script `test:e2e` tự chạy `npm run build` trước (build renderer + main + preload thật) rồi mới chạy Playwright — bộ test luôn drive app đã build, không có dev-server fallback nào để rơi vào im lặng nếu build lỗi.

Test bao gồm: shell chính khởi chạy không crash, golden path tải PDF thật → convert thật → xác minh output, sidebar collapse/expand + width persistence, IndexedDB autosave recovery. Vì app chạy thật (không mock), mỗi lần chạy cũng gián tiếp xác nhận Tini Core khởi động, health check, và descriptor/lease hoạt động đúng như mô tả ở [ARCHITECTURE.md §7.2](.viepilot/ARCHITECTURE.md#72-core-ownership).

## 5. Không đụng tới gì

Vì cách ly diễn ra ở tầng Electron (trước khi bất kỳ code nào của app chạy), các thư mục sau **không bao giờ** bị test chạm vào, kể cả khi test crash giữa chừng:

- `%APPDATA%\Tini Suite` — profile thật đang dùng (lịch sử chuyển đổi, session Tini Core thật)
- `%APPDATA%\mark-tini`, `%APPDATA%\tini-suite` — profile của các phiên bản trước rename
