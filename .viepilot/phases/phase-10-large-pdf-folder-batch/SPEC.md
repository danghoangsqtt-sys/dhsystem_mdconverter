# Phase 10 — Large PDF Reliability & Folder Batch

## Problem

Docling can return `partial_success` after native memory allocation failures. Mark Tini currently ignores that status and persists incomplete Markdown as a successful job. The renderer also supports multi-select but gives users no explicit way to select and process a whole folder.

## Decision

- Reduce ML batch sizes to lower peak memory.
- Convert PDFs in bounded page ranges.
- Recursively split a range that returns partial/failure; rasterize and OCR a single failing page at a safe resolution.
- Never persist a result unless every requested page completed successfully.
- Keep document batch processing sequential because the backend owns one memory-heavy ML pipeline.
- Add a dedicated folder picker, filter supported document types, and show file-level batch progress.
- Use a dedicated full-crop OCR profile for small region images.
- Persist successful source documents with their history entries so the original can be restored after restart.
- Make the extracted-region panel vertically resizable.

## Acceptance Criteria

- A Docling `partial_success` is never reported as a complete job.
- Long PDFs are processed in bounded ranges and concatenated in source order.
- A failing singleton PDF page is retried through bounded raster OCR.
- Folder selection accepts PDF, DOCX, PPTX and HTML, ignores unsupported files, and processes supported files sequentially.
- Batch UI identifies the current file and completed/total count.
- Region OCR forces the whole crop through OCR with a lower confidence threshold suitable for small text.
- A history entry can restore its persisted PDF in the in-app viewer; old entries fall back to a correct source-document picker.
- The extracted-region panel has a keyboard-accessible/drag resize handle with bounded height.
- Backend tests, frontend lint/build, React Doctor and Electron E2E gates pass.
