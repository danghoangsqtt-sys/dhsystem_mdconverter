# Theo Dõi Tiến Độ (Tracker)

## Current State
- **Current Phase:** Phase 8 — Reliability, Security & True Offline Packaging
- **Status:** Implementation Complete — release gated by clean-machine test and approved Git data cleanup
- **Version:** 1.2.0-rc
- **Last Updated:** 2026-08-18

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
