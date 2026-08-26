<div align="center">
  <img src="docs/logo.svg" alt="Tini Suite Logo" width="120" height="120" style="margin: 20px 0;" />
  
  # Tini Suite
  
  **🚀 Mark Tini (tài liệu → Markdown/Word) & Tini OCR (ảnh → text/Word) — Hoàn toàn ngoại tuyến, chạy cục bộ trên Windows**

  [![Version](https://img.shields.io/badge/version-1.6.0-58A6FF?style=for-the-badge)](CHANGELOG.md)
  [![License](https://img.shields.io/badge/license-MIT-3FB950?style=for-the-badge)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](README.md)
  [![Made with](https://img.shields.io/badge/made%20with-Electron%20%7C%20React-black?style=for-the-badge&logo=electron&logoColor=white)](frontend/package.json)

</div>

---

## 📚 Tài liệu & Hướng dẫn

Dự án Tini Suite có đầy đủ tài liệu cho cả người dùng cuối và nhà phát triển:

### 👤 Cho người dùng cuối

| Tài liệu | Nội dung | Link |
|----------|---------|------|
| 📖 **Hướng dẫn sử dụng v1.6.0** | Cách sử dụng từng tính năng, xử lý lỗi, FAQ | [📖 Mở](docs/huong-dan-su-dung-v1.6.0.md) |
| 🎓 **Báo cáo kỹ thuật v1.6.0** | Chi tiết implementation, tính năng mới, fix bugs, test coverage | [📋 Xem](docs/bao-cao-ky-thuat-v1.6.0.md) |

### 👨‍💻 Cho nhà phát triển

| Tài liệu | Nội dung | Link |
|----------|---------|------|
| 🏗️ **Luồng hoạt động** | Sơ đồ data flow, queue, OCR, dịch, xác minh trích dẫn | [🔄 Xem](docs/luong-hoat-dong-du-an.md) |
| 🏛️ **Kiến trúc hệ thống** | Thiết kế hệ thống, Tini Core, invariant bảo mật, offline strategy | [🏛️ Xem](.viepilot/ARCHITECTURE.md) |
| 🧪 **Testing / E2E** | Kiến trúc cách ly kép cho Playwright E2E test | [🧪 Xem](TESTING.md) |
| 🔐 **Spec v1.2** | Bảo mật, reliability, offline packaging requirements | [🔐 Xem](.viepilot/phases/phase-8-reliability-security-offline/SPEC.md) |
| 📝 **Changelog** | Lịch sử phiên bản, fix & feature mỗi release | [📜 Xem](CHANGELOG.md) |

---

## 📋 Tổng quan

**Tini Suite** là bộ công cụ Windows gồm hai ứng dụng riêng nhưng dùng chung một bộ cài: **Mark Tini** chuyển PDF/DOCX/PPTX/HTML sang Markdown/Word có cấu trúc, và **Tini OCR** chuyển ảnh chụp thành text/Word. Cả hai xử lý **hoàn toàn trên máy của bạn** — không upload lên cloud — và dùng chung một **Tini Core** (FastAPI backend), một runtime Python và một bộ model offline duy nhất, để không nhân đôi dung lượng cài đặt hay tài nguyên máy.

| | Mark Tini | Tini OCR |
|---|---|---|
| **Input** | PDF, DOCX, PPTX, HTML | Ảnh chụp (PNG, JPEG, TIFF, BMP) |
| **Output** | Markdown có cấu trúc, DOCX chỉnh sửa được | TXT, Markdown, DOCX |
| **Engine chính** | Docling 2.101.0 (layout, bảng, formula/code) | EasyOCR 1.7.2 (Việt–Anh) |
| **Tính năng riêng** | Dịch đoạn EN↔VI, xác minh trích dẫn, trích xuất vùng PDF | Review theo trang, hai chế độ export DOCX |
| **Shortcut** | `Tini Suite.exe --product=mark-tini` | `Tini Suite.exe --product=tini-ocr` |

Cả hai chạy trên cùng một Electron host binary. Sản phẩm khởi động trước sẽ giành quyền khởi động Tini Core; sản phẩm khởi động sau tự động gắn vào tiến trình Core đang chạy thay vì mở thêm bản backend thứ hai — xem [ARCHITECTURE.md §7.2](.viepilot/ARCHITECTURE.md#72-core-ownership) để biết chi tiết cơ chế lock/lease.

## 🛠️ Tech Stack

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| **Desktop shell** | Electron 42 | Host binary dùng chung cho cả hai sản phẩm, context isolation + sandbox, preload bridge tối thiểu |
| **Frontend** | React 19, TypeScript, Vite | UI hai sản phẩm (`frontend/src/products/mark-tini`, `frontend/src/products/tini-ocr`) trên một shared layer |
| **Styling / Editor** | Tailwind CSS, MDEditor | Giao diện responsive, editor Markdown WYSIWYG |
| **Backend** | Python, FastAPI, Uvicorn | Tini Core: xác thực token, hàng đợi job, orchestration |
| **Document AI** | Docling 2.101.0 | Layout detection, table structure (TableFormer), code/formula enrichment |
| **OCR** | EasyOCR 1.7.2 | Nhận dạng chữ Việt–Anh, dùng chung cho crop vùng (Mark Tini) và Tini OCR |
| **Dịch máy** | VietAI/envit5-translation | Dịch đoạn EN↔VI offline, bảo toàn công thức/code |
| **Đánh giá AI cục bộ** | Ollama (`qwen2.5:3b`, tuỳ chọn) | Đánh giá mức độ nội dung được nguồn tham khảo hỗ trợ |
| **Packaging** | electron-builder, NSIS | Installer per-user (không cần admin), hai shortcut → một uninstall entry |
| **Runtime offline** | Python embeddable 3.14 | Đóng gói sẵn trong installer, không phụ thuộc Python hệ thống |
| **Testing** | Playwright, `unittest` | E2E (Electron thật, cách ly kép — xem [TESTING.md](TESTING.md)), 117 unit test backend |

## ⭐ Tính năng nổi bật

| Tính năng | Mô tả |
|-----------|--------|
| 📄 **Chuyển đổi đa định dạng** | PDF, DOCX, PPTX, HTML, ảnh (PNG, JPEG, TIFF, BMP) |
| 📝 **DOCX chỉnh sửa được** | PDF qua Docling rồi xuất heading, đoạn, danh sách, bảng và hình ảnh/sơ đồ Word native (ảnh nhúng thật, tự co theo trang, căn giữa); dùng chính nội dung người dùng đã review |
| 📷 **Tini OCR riêng** | OCR nhiều ảnh Việt–Anh, review theo trang và xuất TXT/Markdown/hai mode DOCX |
| 🗣️ **OCR Việt/Anh** | Lựa chọn ngôn ngữ: `vi+en`, `vi`, hoặc `en` tùy theo tài liệu |
| 📊 **Nhận dạng bảng thông minh** | Hai chế độ: `Accurate` (chính xác) hoặc `Fast` (nhanh) |
| ✂️ **Trích xuất vùng PDF** | Vẽ khung chọn để OCR riêng một vùng, không phải cả trang |
| 🔄 **Dịch đoạn Anh ↔ Việt** | Dịch offline bằng model NMT cục bộ, hỗ trợ thuật ngữ chuyên ngành |
| 🔍 **Xác minh trích dẫn** | Tra nguồn qua OpenAlex (online) và đánh giá tham khảo bằng Ollama `qwen2.5:3b` (local, tùy chọn) |
| 📝 **Soạn thảo tích hợp** | Editor Markdown WYSIWYG, lưu tự động vào IndexedDB |
| 📋 **Lịch sử chuyển đổi** | Giữ kết quả và bản tài liệu gốc để mở lại sau khi khởi động ứng dụng |
| 📂 **Batch theo thư mục** | Chọn cả thư mục, tự lọc định dạng hỗ trợ và xử lý tuần tự an toàn bộ nhớ |
| 📚 **PDF dài đáng tin cậy** | Chia cụm trang, tự cứu trang lỗi và chỉ lưu khi đã kiểm tra đủ trang |
| 🛡️ **Bảo mật & Riêng tư** | Chạy 100% cục bộ, token API per-session, giới hạn upload 100 MB |
| 🔌 **Offline-first** | Model Docling/EasyOCR/dịch được đóng gói, không cần mạng cho conversion |

---

## 🖼️ Giao diện ứng dụng

### Các thành phần chính:

1. **Sidebar trái** (thu gọn/mở rộng được)
   - Nút chọn tài liệu & chuyển đổi
   - Tuỳ chọn OCR language + table mode
   - Danh sách lịch sử chuyển đổi

2. **Khung xem PDF**
   - Hiển thị file PDF đang xử lý hoặc công việc trước
   - Vẽ khung để trích xuất vùng (Region OCR)

3. **Panel soạn thảo Markdown**
   - Editor WYSIWYG, có thể chỉnh sửa trực tiếp
   - Lưu tự động mỗi ~1 giây
   - Copy/lưu file nhanh chóng

4. **Toolbar công cụ**
   - Nút dịch đoạn (chọn chiều dịch + lĩnh vực)
   - Nút xác minh trích dẫn
   - Nút tạo/mở/lưu tài liệu

5. **Panel kết quả phụ**
   - Hiển thị kết quả dịch, xác minh trích dẫn, hoặc trích xuất vùng
   - Có thể chỉnh sửa, tìm trên web, hoặc chèn vào editor

> 📸 **Tip:** Để capture screenshot ứng dụng, mở app đã build → menu Capture từ thanh công cụ hoặc sử dụng `Win + Shift + S` trên Windows 11.

---

## Kiến trúc

```text
Mark Tini / Tini OCR renderer ── token + HTTP ──> FastAPI (Tini Core) ──> single-worker queue ──> Docling/EasyOCR
                │                                        │                                              │
                │                          TiniCoreSupervisor: lock, PID+health, lease/heartbeat          │
                └── editor/history <─────────────────────┴──────────── atomic output/history <───────────┘
```

- Frontend: React 19, TypeScript, Vite, Tailwind, MDEditor.
- Desktop: Electron 42, context isolation + sandbox, preload bridge tối thiểu, `frontend/electron/coreSupervisor.ts` quản lý vòng đời Tini Core.
- Backend: FastAPI, Docling 2.101.0, EasyOCR 1.7.2.
- Storage: development dùng `data/`; bản cài đặt dùng `<appData>/Tini Suite/data`, truyền xuống backend qua `DOCUMARK_DATA_DIR`.

Thiết kế chi tiết và các invariant nằm tại [ARCHITECTURE.md](.viepilot/ARCHITECTURE.md) và [SPEC v1.2](.viepilot/phases/phase-8-reliability-security-offline/SPEC.md).

## Tài liệu phiên bản hiện tại

Phiên bản hoàn thiện hiện tại: 1.6.0.

- [Báo cáo kỹ thuật v1.6.0](docs/bao-cao-ky-thuat-v1.6.0.md)
- [Hướng dẫn sử dụng v1.6.0](docs/huong-dan-su-dung-v1.6.0.md)
- [Luồng hoạt động dự án](docs/luong-hoat-dong-du-an.md)
- [Changelog](CHANGELOG.md)

## 🚀 Cài đặt và sử dụng

### Cài đặt (Người dùng cuối)

1. **Nhận installer**: Chép file `Tini Suite Setup 1.6.0.exe` từ USB hoặc kênh lưu trữ nội bộ do DHSystem cung cấp
2. **Chạy installer**: Double-click file `.exe`, làm theo hướng dẫn
3. **Khởi chạy**: Desktop và Start Menu có hai mục riêng **Mark Tini** và **Tini OCR**; cả hai dùng chung một bộ cài và một mục gỡ cài đặt
4. **Lần đầu**: Chờ 10-60 giây để nạp model AI (tuỳ thuộc cấu hình máy)

> 💡 Không cần cài Python, Node.js, hoặc bất kỳ dependency nào — mọi thứ đã được đóng gói sẵn

#### Bật đánh giá AI cục bộ khi xác minh nội dung (tùy chọn)

Tra cứu nguồn OpenAlex hoạt động qua internet mà không cần Ollama. Để có thêm phần đánh giá AI cục bộ về mức độ nội dung được nguồn tìm thấy hỗ trợ:

1. Cài [Ollama cho Windows](https://ollama.com/download/windows).
2. Mở PowerShell hoặc Command Prompt và chạy `ollama pull qwen2.5:3b` (khoảng 1,9 GB).
3. Bôi đen nội dung và bấm **Xác minh trích dẫn**. Mark Tini sẽ tự khởi động Ollama đã cài khi cần.

Model mặc định hỗ trợ tiếng Việt và có thể thay bằng biến môi trường `DOCUMARK_OLLAMA_MODEL`. Ollama/model không được nhúng vào installer chính để tránh tăng bộ cài gần 2 GB lên gần 4 GB; có thể chuẩn bị Ollama và model riêng trên USB cho máy không có internet.

### Hướng dẫn sử dụng

Xem [**📖 Hướng dẫn sử dụng đầy đủ v1.6.0**](docs/huong-dan-su-dung-v1.6.0.md) để biết chi tiết.

**Quick start** — 5 bước cơ bản:

1. Mở ứng dụng
2. Ở Sidebar trái, chọn **"Thêm file"** hoặc **"Chọn cả thư mục"**
3. Chọn một/nhiều file, hoặc chọn thư mục chứa PDF/DOCX/PPTX/HTML
4. Chọn ngôn ngữ OCR và chế độ nhận dạng bảng
5. Chờ xong, chỉnh sửa Markdown trong editor, rồi lưu/copy kết quả

### Development (Nhà phát triển)

Yêu cầu Node.js 18+ và Python tương thích với dependency.

```powershell
# Clone repo
git clone https://github.com/danghoangsqtt-sys/dhsystem_mdconverter.git
cd dhsystem_mdconverter

# Tạo virtual environment
python -m venv docling-env
docling-env\Scripts\python.exe -m pip install -r backend\requirements.txt

# Cài frontend dependency
cd frontend
npm install

# Chạy dev mode
npm run dev:electron
```

Hoặc sử dụng script nhanh:

```powershell
.\start.bat   # Khởi chạy dev (nếu đã cài dependency)
```

### Build bản Windows offline (Cho nhà phát triển)

```powershell
cd frontend
npm run build:electron
```

Quy trình build tự động (`npm run build:electron` = `prepare:offline` → `tsc -b` → `vite build` → `electron-builder`):
1. Tạo runtime Python embeddable 3.14 nếu chưa có (`python_runtime/`)
2. Cài dependency theo hash-lock (`--require-hashes -r backend/requirements.lock.txt`)
3. Tải model Docling/EasyOCR/translation vào `offline_models/` — bỏ qua nếu file đã đủ (idempotent)
4. Chạy smoke test thật: import fastapi/docling/easyocr, dựng `DocumentConverter` thật, dịch thử một câu và kiểm tra công thức không bị mất
5. Compile TypeScript, build renderer (Vite), đóng gói NSIS installer → `frontend/release/Tini Suite Setup 1.6.0.exe`

### 📜 Bảng lệnh npm nhanh

| Lệnh (`cd frontend` trước) | Dùng khi nào |
|---|---|
| `npm install` | Cài dependency frontend lần đầu / sau khi pull |
| `npm run dev:electron` | Chạy dev mode (hot reload) |
| `npm run lint` | Kiểm tra ESLint |
| `npm run build` | Build TypeScript + Vite (không đóng gói installer) |
| `npm run test:e2e` | Build rồi chạy Playwright E2E — xem [TESTING.md](TESTING.md) |
| `npm run validate:offline` | Kiểm tra bundle offline hiện có mà không tải/cài lại gì |
| `npm run prepare:offline` | Chỉ chạy bước chuẩn bị runtime/model offline (không build/đóng gói) |
| `npm run build:electron` | Full pipeline → installer sản xuất tại `release/` |

---

## 🏗️ Kiến trúc hệ thống

Sơ đồ dưới đây là lát cắt UI của **Mark Tini**. **Tini OCR** dùng chung FastAPI backend, Tini Core, hàng đợi và model store — chỉ khác panel giao diện (hàng đợi ảnh/review theo trang thay vì Translation/Citation Panel).

```
┌─────────────────────────────────────────────────────────────┐
│                   MARK TINI ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐         ┌──────────────────┐     │
│  │   Electron/React UI  │         │  FastAPI Backend │     │
│  │  ─────────────────   │──HTTP──▶│  ─────────────── │     │
│  │ • Editor Markdown    │ token   │ • Job Queue      │     │
│  │ • PDF Viewer         │◀────────│ • Docling        │     │
│  │ • Toolbar & Sidebar  │         │ • Storage        │     │
│  │ • History Panel      │         │ • Logging        │     │
│  │ • Translation Panel  │         └──────────────────┘     │
│  │ • Citation Verify    │                   │              │
│  └──────────────────────┘                   │              │
│           │                         ┌───────▼────────┐     │
│           │                         │ Offline Models │     │
│           │                         │ ────────────── │     │
│           │                         │ • Docling      │     │
│           │                         │ • EasyOCR      │     │
│           │                         │ • Translation  │     │
│           │                         │ • Code-Formula │     │
│           │                         └────────────────┘     │
│           ▼                                                 │
│  ┌──────────────────────┐                                  │
│  │   Data Storage       │                                  │
│  │ ──────────────────── │                                  │
│  │ • IndexedDB (UI)     │                                  │
│  │ • data/outputs/      │                                  │
│  │ • data/logs/         │                                  │
│  │ • history.json       │                                  │
│  └──────────────────────┘                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Bảo mật:** API token per-session, trusted-origin bootstrap, content validation (chi tiết stack công nghệ xem mục [Kiến trúc](#kiến-trúc) ở trên).

Chi tiết kiến trúc: [ARCHITECTURE.md](.viepilot/ARCHITECTURE.md) | [SPEC v1.2](.viepilot/phases/phase-8-reliability-security-offline/SPEC.md)

---

## 🔒 Bảo mật & Dữ liệu

- ✅ **100% cục bộ**: Toàn bộ conversion xảy ra trên máy, không đẩy lên cloud
- ✅ **Không tài khoản**: Không cần đăng nhập hoặc tạo tài khoản
- ✅ **Token per-session**: API token được tạo mới khi ứng dụng khởi động, hết hạn khi đóng
- ✅ **Path traversal protection**: UUID validation, sandbox upload directory
- ✅ **Content validation**: Magic byte checking (PDF/image), OOXML member validation (DOCX/PPTX)
- ✅ **Atomic storage**: File output được ghi nguyên tử, không để lại state trung gian
- ✅ **Cleanup tự động**: Output bị loại bỏ khỏi lịch sử, upload rác, mồ côi đều được xóa
- ✅ **Offline-first**: Model ML đóng gói, không cần internet cho conversion, dịch, OCR

> 🔗 Chi tiết bảo mật: [SPEC v1.2 - Security](.viepilot/phases/phase-8-reliability-security-offline/SPEC.md#p0-release-blocker)

---

## 🧪 Kiểm thử

### Unit tests

```powershell
docling-env\Scripts\python.exe -m unittest discover -s backend\tests -v
```

**Coverage:** 117 tests / 15 module, gồm:
- API token validation, path traversal
- Job queue (Mark Tini), cancel semantics, capacity limits
- Storage atomicity, cleanup orphaned outputs/uploads, startup cleanup
- Docling: chunked large-PDF conversion, markdown table correctness
- Word export: DOCX chỉnh sửa (markdown → docx), gồm nhúng ảnh/sơ đồ thật
- Tini OCR: nhận dạng ảnh (EasyOCR), export kết quả OCR
- Dịch EN↔VI, xác minh trích dẫn (citation), resource scheduler

### Lint & Build

```powershell
cd frontend
npm run lint
npm run build
npm audit --omit=dev
```

### End-to-End tests (Playwright)

```powershell
cd frontend
npm run test:e2e
```

Kiểm tra:
- Shell chính khởi chạy, không crash
- Golden path: tải PDF thật → convert thật → xác minh output
- Sidebar collapse/expand, width persistence
- IndexedDB autosave recovery

Bộ test chạy **ứng dụng Electron thật**, gắn vào Tini Core thật — không mock. Để làm được vậy an toàn, mỗi lần chạy cách ly kép khỏi dữ liệu người dùng thật: cờ `--user-data-dir` (Electron/Chromium) cho lớp userData, và biến môi trường `DOCUMARK_APP_DATA_DIR` (tự định nghĩa) cho lớp dữ liệu/session của Tini Core — biến thứ hai này lan tự động xuống tận `DOCUMARK_DATA_DIR` của backend. Chi tiết đầy đủ, kèm trích dẫn code: [**TESTING.md**](TESTING.md).

---

## 📊 Trạng thái phát hành

### Phiên bản hiện tại: **v1.6.0** (2026-08-21)

**Cải tiến chính:**
- ✅ Một setup offline tạo hai ứng dụng riêng Mark Tini và Tini OCR, dùng chung Tini Core/runtime/model
- ✅ OCR ảnh Việt–Anh thực tế, review và xuất TXT/Markdown/DOCX
- ✅ PDF → Docling → DOCX editable với chữ/bảng biên soạn được, ảnh/sơ đồ khối được tách và nhúng thật (căn giữa, tự co theo trang) ngay dưới nút Thêm file
- ✅ Hộp thoại Lưu thành cho phép chọn trực tiếp USB; có thể xuất lại PDF gốc từ lịch sử
- ✅ Toolbar/Sidebar responsive, không chồng lấn khi thu nhỏ cửa sổ
- ✅ Nút chọn hoặc mở tài liệu gốc luôn hiển thị
- ✅ Sửa lỗi PDF 128+ trang bị lưu thiếu do `std::bad_alloc`/`partial_success`
- ✅ Chọn cả thư mục và xử lý nhiều tài liệu theo hàng đợi an toàn bộ nhớ
- ✅ Khôi phục PDF gốc trực tiếp từ lịch sử sau khi mở lại ứng dụng
- ✅ OCR vùng khoanh chữ nhỏ chính xác hơn và bảng kết quả kéo cao/thấp tự do
- ✅ Sửa lỗi trích xuất vùng PDF trả về placeholder
- ✅ Đơn giản hoá UI panel dịch
- ✅ Thêm sidebar thu gọn/kéo giãn
- ✅ Chuyển autosave sang IndexedDB
- ✅ Model code-formula enrichment
- ✅ Backend log rotation + correlation ID
- ✅ E2E test infrastructure (Playwright)

**Trạng thái:**
- ✅ Implementation hoàn tất
- ✅ Unit/integration tests pass
- ✅ Lint, build, security audit pass
- ⏳ Clean-machine installer test (manual gate)

> Xem [CHANGELOG.md](CHANGELOG.md) để xem lịch sử phiên bản chi tiết.

---

## 🐛 Báo cáo lỗi & Yêu cầu tính năng

Gặp sự cố? Hãy:

1. Kiểm tra [Troubleshooting](docs/huong-dan-su-dung-v1.6.0.md#11-xử-lý-sự-cố-thường-gặp) trong hướng dẫn
2. Xem file log tại `%APPDATA%\Tini Suite\data\logs\backend.log`
3. Mở [Issue trên GitHub](../../issues) với:
   - Phiên bản ứng dụng (xem trong About)
   - Bước tái tạo lỗi
   - Ảnh chụp hoặc log lỗi
   - Phiên bản Windows của máy

---

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng:

1. **Fork** repo
2. **Tạo branch** cho tính năng mới hoặc fix bug: `git checkout -b feature/your-feature`
3. **Commit** thay đổi: `git commit -m "Add your feature"`
4. **Push** lên branch của bạn: `git push origin feature/your-feature`
5. **Mở Pull Request** với mô tả chi tiết

---

## 📜 License

Tini Suite được phát hành dưới license **MIT**. Xem [LICENSE](LICENSE) để biết chi tiết.

---

## 👥 Về dự án

**Tini Suite** (gồm **Mark Tini** và **Tini OCR**) là sản phẩm của [DHSystem](https://dhsystem.example.com), được phát triển với mục đích cung cấp bộ công cụ chuyển đổi & nhận dạng tài liệu mạnh mẽ, bảo mật và riêng tư cho người dùng Windows.

**Tác giả:** DHSystem (@danghoangsqtt-sys)  
**Năm**: 2026

---

## 🔗 Liên kết nhanh

- 📖 [Hướng dẫn sử dụng](docs/huong-dan-su-dung-v1.6.0.md)
- 🔄 [Luồng hoạt động](docs/luong-hoat-dong-du-an.md)
- 🏗️ [Kiến trúc hệ thống](.viepilot/ARCHITECTURE.md)
- 🧪 [Testing / E2E](TESTING.md)
- 🔐 [Bảo mật & SPEC](.viepilot/phases/phase-8-reliability-security-offline/SPEC.md)
- 📝 [Changelog](CHANGELOG.md)
- 🐛 [Issues](../../issues)
- 📮 [Discussions](../../discussions)

---

<div align="center">

**Được xây dựng với ❤️ bởi DHSystem**

![GitHub stars](https://img.shields.io/github/stars/danghoangsqtt-sys/dhsystem_mdconverter?style=social)
![GitHub forks](https://img.shields.io/github/forks/danghoangsqtt-sys/dhsystem_mdconverter?style=social)

</div>

