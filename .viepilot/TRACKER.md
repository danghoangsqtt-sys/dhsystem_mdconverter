# Theo Dõi Tiến Độ (Tracker)

## Current State
- **Current Phase:** Phase 13 — Tini Suite Ecosystem
- **Status:** T13.1 in progress — shared host and product boundaries
- **Released Version:** 1.5.0
- **Target Version:** 1.6.0
- **Last Updated:** 2026-08-21

## Phase Progress

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Foundation & Backend Core | ✅ Complete | 100% |
| 2 | Frontend & UI Integration | ✅ Complete | 100% |
| 3 | Packaging & Portability | ✅ Complete | 100% |
| 4 | Fix DOCX Table Content Loss | ↪ Absorbed into Phase 8 | Regression coverage required |
| 5 | Improve PDF Markdown Quality | ↪ Absorbed into Phase 8 | Accuracy guardrails required |
| 6 | Fix UX Processing Status | ↪ Absorbed into Phase 8 | Replaced by real job status |
| 7 | SSE Real-time Streaming | ↪ Superseded | Job polling chosen for reliable upload/cancel flow |
| 8 | Reliability, Security & True Offline Packaging | 🟡 Release Gated | Implementation/tests/installer complete; 2 manual gates remain |
| 9 | Ollama Citation Onboarding | ✅ Complete | Tests, Electron IPC smoke and real qwen2.5:3b inference pass |
| 10 | Large PDF Reliability & Document Workflow UX | ✅ Complete | 87 backend tests + lint/build + 4 real Electron E2E pass |
| 11 | Responsive Window UX | ✅ Complete | 820×700 geometry regression + lint/build + 5 Electron E2E pass |
| 12 | Faithful PDF-to-Word Export | ✅ Complete | Pixel-identical page images + 94 backend tests + 6 Electron E2E pass |
| 13 | Tini Suite Ecosystem | 🚧 In Progress | T13.1 shared host/product boundaries in progress |

## Phase 4 Task Detail
| Task | Description | Status |
|------|-------------|--------|
| T4.1 | `_clean_tables()` fallback — keep original on empty | ✅ Done |
| T4.2 | `_table_to_structured_list()` sub-header heuristic stricter | ✅ Done |
| T4.3 | `_count_empty_columns()` — check all rows including header | ✅ Done |
| T4.4 | `docling_service.py` — add `WordFormatOption` + comment | ✅ Done |
| T4.5 | User acceptance test with real DOCX file | ⏳ Pending user test |

## Decision Log
- **2026-05-17:** Chọn FastAPI + React/Vite cho stack; sử dụng Docling từ `docling-env`
- **2026-05-17:** Hợp nhất DocuMark AI Editor vào frontend/, loại bỏ giao diện kéo thả cũ
- **2026-05-17:** Loại bỏ AI local (Ollama/Gemini), mọi xử lý qua FastAPI Docling Backend
- **2026-05-18:** Nâng lên `TableFormerMode.ACCURATE` + `do_cell_matching=True` cho PDF
- **2026-05-18:** Tạo `markdown_cleaner.py` post-processing module
- **2026-05-18:** Fix 3 bugs CRITICAL trong `markdown_cleaner.py` — silent content drop với DOCX tables
- **2026-05-18:** Xác nhận DOCX dùng `WordFormatOption` (SimplePipeline + MsWordDocumentBackend), không cần ML config
- **2026-05-18:** Principle "never drop content silently" được đưa vào SYSTEM-RULES
- **2026-08-18:** Phase 8 implementation hoàn tất: tokenized API, bounded job queue, actual progress/cancel, atomic storage và content-preserving cleaner
- **2026-08-18:** Portable runtime + offline models và NSIS 1.2.0 build/smoke pass; clean-machine test và cleanup tracked runtime data vẫn là release gates
- **2026-08-20:** Đồng bộ phiên bản 1.3.2 và build lại installer Windows với các bản sửa lỗi của v1.3.1
- **2026-08-21:** Hoàn tất Phase 9: tự khởi động Ollama theo yêu cầu, model mặc định `qwen2.5:3b` và onboarding rõ ràng; 81 backend tests + lint/build + 2 Electron E2E pass
- **2026-08-21:** NSIS 1.3.2 build và cài đặt local pass; executable đã cài trả `version=1.3.2`, tiêu đề `Mark Tini`, bridge Ollama trả `started`
- **2026-08-21:** Hoàn tất Phase 10: chặn output PDF thiếu do `partial_success`, xử lý cả thư mục, OCR vùng chuyên dụng, lưu/mở lại tài liệu gốc và panel kết quả kéo giãn; 87 backend tests + 4 Electron E2E pass
- **2026-08-21:** NSIS 1.4.0 build/cài đặt local đạt; installer và executable đã cài đều trả version 1.4.0, smoke tiến trình phản hồi bình thường
- **2026-08-21:** Hoàn tất Phase 11: toolbar tự wrap theo cụm, Sidebar không tràn ở chiều rộng hẹp và nút tài liệu gốc luôn hiện; lint/build + React Doctor + 5 Electron E2E đạt
- **2026-08-21:** Đã tạo bộ cài offline v1.4.1, cài đè thành công (exit code 0), xác minh executable/app.asar cùng phiên bản và smoke-test bản cài đạt
- **2026-08-21:** Hoàn tất Phase 12: xuất toàn bộ PDF sang Word bằng ảnh lossless toàn trang, giữ đúng khổ/hướng trang, lưu native qua hộp thoại Electron; ảnh nhúng khớp từng pixel với PDF mẫu, 94 backend tests + lint/build + 6 Electron E2E đạt
- **2026-08-21:** NSIS 1.5.0 build/cài đặt local đạt; installer, executable và app.asar cùng phiên bản 1.5.0, ứng dụng đã cài khởi động và phản hồi bình thường
- **2026-08-21:** Chốt target v1.6.0 thành Tini Suite: một bộ cài, hai product entry (Mark Tini và Tini OCR), một shared Electron host/Tini Core/runtime/model; không dùng Windows Service và không tạo GitHub Release.
- **2026-08-21:** Chọn chiến lược OCR cần benchmark trước khi khóa: RapidOCR + OpenCV là candidate mặc định, EasyOCR là fallback/baseline, VietOCR chỉ là second pass có điều kiện; PaddleOCR/Surya không thuộc runtime mặc định v1.6.0.
