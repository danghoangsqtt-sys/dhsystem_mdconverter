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
