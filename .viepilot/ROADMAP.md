# Lộ Trình Phát Triển (Roadmap)

## Phase 1: Foundation & Backend Core ✅ COMPLETE
**Mục tiêu:** Nền tảng cơ sở hoạt động được
- [x] Thiết lập thư mục cấu trúc chuẩn (`backend/`, `frontend/`, `data/`)
- [x] Viết API Backend bằng FastAPI
- [x] Tích hợp Docling, chuyển đổi PDF/DOCX sang Markdown
- [x] Cấu hình thư mục `data/` lưu trữ an toàn

## Phase 2: Frontend & UI Integration ✅ COMPLETE
**Mục tiêu:** Giao diện chuyên nghiệp kết nối đầy đủ
- [x] Khởi tạo Vite React App
- [x] Tích hợp Agentation
- [x] Hợp nhất DocuMark AI Editor (MDEditor Luxury Blue / Neutral)
- [x] Kết nối Sidebar với API upload, hiển thị Markdown Preview

## Phase 3: Packaging & Portability ✅ COMPLETE
**Mục tiêu:** Ứng dụng portable chạy 1-click
- [x] Tạo `start.bat` / `.ps1` khởi động 1-click
- [x] Frontend build static được serve qua FastAPI
- [x] Đóng gói phục vụ tính portable (Electron packaging)

---

## Phase 4: Fix DOCX Table Content Loss 🔧 IN PROGRESS
**Mục tiêu:** Sửa bug CRITICAL — toàn bộ nội dung bảng biến mất khi convert DOCX
**Priority:** CRITICAL

### Tasks:
- [x] **T4.1** Fix `markdown_cleaner.py` — `_clean_tables()` fallback: `result.extend(table_lines)` khi structured list = ""
  - *File:* `backend/src/services/markdown_cleaner.py`
  - *Verification:* Smoke test với DOCX có merged cells — không được có table nào biến mất
- [x] **T4.2** Fix `markdown_cleaner.py` — `_table_to_structured_list()` sub-header heuristic: `all('**' in c for c in non_empty_cells)` thay vì 70%
  - *File:* `backend/src/services/markdown_cleaner.py`
- [x] **T4.3** Fix `markdown_cleaner.py` — `_count_empty_columns()`: check ALL rows kể cả header
  - *File:* `backend/src/services/markdown_cleaner.py`
- [x] **T4.4** Thêm `InputFormat.DOCX: WordFormatOption()` vào `docling_service.py` + xác nhận DOCX dùng SimplePipeline không cần ML config
  - *File:* `backend/src/services/docling_service.py`
- [ ] **T4.5** User acceptance test: convert file DOCX đề cương thực tế → verify tất cả bảng có content
  - *Verification:* Bảng "Bài 2 (3)" với merged cells phải có đủ nội dung trong markdown output

**Acceptance Criteria:**
- DOCX convert: không có bảng nào bị mất hoàn toàn
- Smoke test Python pass: `python -c "from services.markdown_cleaner import clean_markdown; ..."`

---

## Phase 5: Improve PDF Markdown Quality 📋 PENDING
**Mục tiêu:** Nâng cao chất lượng bảng từ PDF (đặc biệt bảng phức tạp)
**Priority:** High

### Tasks:
- [x] **T5.1** Cấu hình `PdfPipelineOptions` với `TableFormerMode.ACCURATE` + `do_cell_matching=True`
  - *File:* `backend/src/services/docling_service.py` (đã có)
- [ ] **T5.2** Test convert PDF đề cương IoT — verify Bảng E (13 cột) và Bảng F (cell dài)
- [ ] **T5.3** Tinh chỉnh `_format_cell_content()` trong `markdown_cleaner.py` nếu cần
- [ ] **T5.4** Đánh giá: structured list output của Bảng F có dễ đọc hơn table gốc không?

**Acceptance Criteria:**
- PDF convert: Bảng E không có 8+ cột rỗng thừa
- PDF convert: Bảng F content readable (không phải 800+ char một dòng)

---

## Phase 6: Fix UX Processing Status 📋 PENDING
**Mục tiêu:** UI progress không treo, người dùng luôn biết app đang làm gì
**Priority:** High

### Tasks:
- [ ] **T6.1** Fix `types.ts` — thêm stages: `'uploading' | 'reading' | 'analyzing' | 'formatting' | 'complete' | 'error'`
  - *File:* `frontend/src/types.ts`
- [ ] **T6.2** Cập nhật `ProcessingStatus.tsx` — step IDs match với `ProcessingStage` type mới
  - *File:* `frontend/src/components/ProcessingStatus.tsx`
- [ ] **T6.3** Cập nhật `App.tsx` — simulated progress với timer (không cần SSE)
  - *File:* `frontend/src/App.tsx`
  - *Logic:* `uploading` → 2s → `reading` → 5s → `analyzing` → timer → `formatting` → await resolve → `complete`
- [ ] **T6.4** Cập nhật `api.ts` — thêm `onUploadProgress` callback cho axios
  - *File:* `frontend/src/services/api.ts`
- [ ] **T6.5** Thêm estimated time display và log messages thực tế vào ProcessingStatus

**Acceptance Criteria:**
- Khi upload file: progress bar chạy thực tế (không phải 0% → 100% đột ngột)
- Stepper UI chuyển qua ít nhất 3 bước trước khi complete
- Không có mismatch TypeScript compile errors giữa types và UI

---

## Phase 7: SSE Real-time Streaming 📋 BACKLOG
**Mục tiêu:** Progress thật từ backend, không cần simulation
**Priority:** Enhancement (long-term)

### Tasks:
- [ ] **T7.1** Backend: tạo `/api/convert-stream` SSE endpoint
  - Chạy Docling trong `asyncio.get_event_loop().run_in_executor()`
  - Push events: `uploading → reading → table_analysis → formatting → complete`
- [ ] **T7.2** Backend: remove synchronous `/api/convert` endpoint (hoặc giữ cho compatibility)
- [ ] **T7.3** Frontend: replace axios POST với `EventSource` để nhận SSE
- [ ] **T7.4** Frontend: update ProcessingStatus nhận events thật từ backend

**Acceptance Criteria:**
- Progress percentage reflects actual Docling processing stage
- Cancel button terminates backend conversion (via server-side signal)

---

## Phase 8: Reliability, Security & True Offline Packaging 🟡 RELEASE GATED

**Mục tiêu:** Hợp nhất các phase 4–7 còn dang dở thành một release v1.2.0 có ranh giới bảo mật, không mất dữ liệu, tiến độ backend thực, storage bền vững và packaging offline có thể kiểm chứng.

**SPEC:** `.viepilot/phases/phase-8-reliability-security-offline/SPEC.md`
**PLAN:** `.viepilot/phases/phase-8-reliability-security-offline/PLAN.md`

### Tasks

- [x] **T8.1** API session boundary, UUID/input validation, upload/concurrency limits
- [x] **T8.2** Markdown content-preservation parser + regression tests
- [x] **T8.3** Job queue, polling progress thực và cancel semantics
- [x] **T8.4** Durable userData storage, atomic history, orphan cleanup
- [x] **T8.5** Portable Python runtime, bundled Docling/EasyOCR models, offline preflight
- [x] **T8.6** Version/docs/dependency cleanup và automated verification

### Release gates

- [x] Automated backend/frontend quality gates pass
- [x] Security reproductions đóng hoàn toàn
- [x] Offline bundle preflight và packaged-layout PDF smoke pass
- [x] NSIS installer 1.2.0 build pass
- [ ] Clean-machine installer test pass
- [ ] Runtime documents không còn nằm trong Git index/release commit

---

## Phase 9: Ollama Citation Onboarding ✅ COMPLETE

**Mục tiêu:** Loại bỏ ngõ cụt UX của tính năng xác minh nội dung: OpenAlex và Ollama phải được mô tả tách biệt, Ollama đã cài được tự khởi động khi cần, và người dùng biết chính xác model/lệnh cần cài nếu máy chưa sẵn sàng.

**SPEC:** `.viepilot/phases/phase-9-ollama-onboarding/SPEC.md`

### Tasks

- [x] **T9.1** Cấu hình model mặc định, tự khởi động Ollama theo yêu cầu và bổ sung onboarding có thao tác cụ thể

### Acceptance Criteria

- OpenAlex vẫn tra cứu online độc lập khi Ollama không khả dụng.
- Bản Electron yêu cầu main process thử khởi động Ollama đã cài trước khi gọi xác minh.
- Backend mặc định dùng `qwen2.5:3b`, nhưng vẫn cho phép override bằng biến môi trường.
- UI nêu rõ Ollama là tùy chọn, model cần dùng, trang cài chính thức và lệnh `ollama pull`.
- Backend tests, frontend lint/build và E2E liên quan vượt qua.
