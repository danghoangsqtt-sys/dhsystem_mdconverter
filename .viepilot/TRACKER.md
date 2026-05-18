# Theo Dõi Tiến Độ (Tracker)

## Current State
- **Current Phase:** Phase 4 — Fix DOCX Table Content Loss
- **Status:** In Progress — code fixes done (T4.1–T4.4), waiting for user acceptance test (T4.5)
- **Version:** 1.1.0
- **Last Updated:** 2026-05-18

## Phase Progress

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Foundation & Backend Core | ✅ Complete | 100% |
| 2 | Frontend & UI Integration | ✅ Complete | 100% |
| 3 | Packaging & Portability | ✅ Complete | 100% |
| 4 | Fix DOCX Table Content Loss | 🔧 In Progress | 80% (4/5 tasks done) |
| 5 | Improve PDF Markdown Quality | 📋 Pending | 20% (T5.1 already implemented) |
| 6 | Fix UX Processing Status | 📋 Pending | 0% |
| 7 | SSE Real-time Streaming | 📋 Backlog | 0% |

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
