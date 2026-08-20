<div align="center">
  <img src="docs/logo.svg" alt="Mark Tini Logo" width="128" height="128" />
  <h1>Mark Tini Editor</h1>
  <p><strong>Ứng dụng Windows chuyển tài liệu sang Markdown, xử lý cục bộ bằng Docling</strong></p>
  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-1.3.0-58A6FF?style=flat-square"/>
    <img alt="License" src="https://img.shields.io/badge/license-MIT-3FB950?style=flat-square"/>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows"/>
  </p>
</div>

## Tổng quan

Mark Tini chuyển PDF, DOCX, PPTX, HTML và ảnh sang Markdown. Ứng dụng có OCR Việt/Anh, hai chế độ nhận dạng bảng, trích xuất vùng PDF, lịch sử kết quả và trình soạn thảo Markdown.

Từ v1.2, luồng chuyển đổi dùng một hàng đợi backend có trạng thái thật. Mỗi file được kiểm tra loại/kích thước, xử lý tuần tự để tránh tranh chấp RAM/CPU, ghi kết quả nguyên tử và có thể hủy. Bản Electron production dùng API token theo phiên và lưu dữ liệu tại thư mục `userData` của ứng dụng.

## Tính năng chính

- Chuyển đổi `.pdf`, `.docx`, `.pptx`, `.html`, `.htm` và các ảnh phổ biến.
- OCR `vi + en`, chỉ `vi`, hoặc chỉ `en`.
- TableFormer `accurate`/`fast`; cleaner giữ nguyên bảng nếu không chứng minh được transform bảo toàn nội dung.
- Trạng thái job thật: `queued → converting → finalizing → complete`.
- Hủy ngay job đang chờ; job ML đang chạy được đánh dấu hủy và kết quả bị loại bỏ an toàn.
- Lịch sử giới hạn, tự xóa output bị loại khỏi lịch sử; OCR vùng không tạo file mồ côi.
- Runtime Python và model Docling/EasyOCR được đóng gói để conversion production chạy offline.

## Kiến trúc

```text
Electron/React ── token + HTTP ──> FastAPI ──> single-worker queue ──> Docling
      │                              │                                  │
      └── editor/history <───────────┴── atomic output/history <────────┘
```

- Frontend: React 19, TypeScript, Vite, Tailwind, MDEditor.
- Desktop: Electron 42, context isolation + sandbox, preload bridge tối thiểu.
- Backend: FastAPI, Docling 2.101.0, EasyOCR 1.7.2.
- Storage: development dùng `data/`; bản cài đặt dùng `app.getPath('userData')/data`.

Thiết kế chi tiết và các invariant nằm tại [ARCHITECTURE.md](.viepilot/ARCHITECTURE.md) và [SPEC v1.2](.viepilot/phases/phase-8-reliability-security-offline/SPEC.md).

## Tài liệu phiên bản hiện tại

Phiên bản hoàn thiện hiện tại: 1.3.0.

- [Báo cáo kỹ thuật v1.3.0](docs/bao-cao-ky-thuat-v1.3.0.md)
- [Hướng dẫn sử dụng v1.3.0](docs/huong-dan-su-dung-v1.3.0.md)
- [Luồng hoạt động dự án](docs/luong-hoat-dong-du-an.md)
- [Changelog](CHANGELOG.md)

## Trạng thái phát hành

v1.3.0 là phiên bản hiện tại và đã được đánh dấu là release hoàn thiện với các cải tiến chính: sửa lỗi OCR vùng PDF, đơn giản hóa giao diện dịch, sidebar thu gọn/kéo giãn, lưu tự động bằng IndexedDB, offline model bundle và kiểm soát queue backend. Dự án đang ở trạng thái ổn định cho việc phát hành và dùng nội bộ/đẩy GitHub.

## Chạy development

Yêu cầu Node.js hiện đại và Python tương thích với dependency đã khóa.

```powershell
python -m venv docling-env
docling-env\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location frontend
npm install
npm run dev:electron
```

Sau khi đã cài dependency, có thể chạy `start.bat` từ thư mục gốc. Script sẽ fail-fast nếu thiếu Python hoặc build frontend thất bại.

## Build bản Windows offline

```powershell
Set-Location frontend
npm run build:electron
```

Quy trình build:

1. Tạo/kiểm tra `python_runtime` độc lập (Python embeddable 3.14.0).
2. Cài các dependency Python đã pin bằng `-s`, không dùng user site-packages.
3. Tải `layout`, `tableformer`, `easyocr` vào `offline_models`.
4. Fail build nếu thiếu runtime, EasyOCR hoặc artifact.
5. Đóng gói runtime, model và backend vào NSIS installer trong `frontend/release/`.

Việc chuẩn bị model cần mạng một lần trên máy build. Đường chạy production đặt `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, tắt remote services và dùng artifact path cục bộ.

Kiểm tra bundle mà không tải/cài lại:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\prepare-offline-bundle.ps1 -ValidateOnly
powershell -ExecutionPolicy Bypass -File scripts\prepare-offline-bundle.ps1 -ValidateOnly -SmokeDocument .\sample.pdf
```

## Kiểm thử

```powershell
docling-env\Scripts\python.exe -m unittest discover -s backend\tests -v
docling-env\Scripts\python.exe -m compileall -q backend
Set-Location frontend
npm run lint
npm run build
npm audit --omit=dev
```

Bộ test bao phủ API token/origin, path traversal, giới hạn upload, queue/cancel/capacity, cleanup history/output và các regression làm mất nội dung bảng.

## Bảo mật và dữ liệu

- Mọi endpoint nghiệp vụ `/api/*` cần token phiên; bootstrap browser chỉ chấp nhận origin localhost tin cậy.
- Job/history ID phải là UUID; upload mặc định tối đa 100 MiB và chỉ nhận extension được hỗ trợ.
- File upload tạm được xóa sau complete/error/cancel.
- Electron chỉ mở URL `http(s)` ra trình duyệt; renderer không có generic IPC hay Node integration.
- `python_runtime/`, `offline_models/` và runtime data bị gitignore. Chạy `scripts/check-repository-hygiene.ps1` để phát hiện dữ liệu runtime đã bị Git theo dõi.

Lưu ý: lịch sử Git đã được rewrite để gỡ dữ liệu chuyển đổi cũ từng bị theo dõi trước đây (bản backup trước khi rewrite nằm ở branch `backup/pre-history-purge-20260818`). Script hygiene ở trên chỉ báo lỗi, không tự xóa hay rewrite lịch sử — dùng để phát hiện sớm nếu dữ liệu runtime vô tình bị theo dõi lại.

## Trạng thái phát hành

v1.3 đã vượt qua unit tests, lint/build, dependency audit và offline PDF smoke test tại workspace phát triển; installer đã được build lại và cài đặt/khởi chạy thành công trên máy phát triển sau các thay đổi mới nhất. Clean-machine installer test (máy Windows sạch, chưa từng cài Python/Node/IDE dev) vẫn là release gate thủ công trước khi công bố installer.

Xem lịch sử thay đổi tại [CHANGELOG.md](CHANGELOG.md).
