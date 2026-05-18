# Quy Tắc Hệ Thống (System Rules)

## 1. Architecture Rules
- Backend (FastAPI) và Frontend (React) tách biệt hoàn toàn — giao tiếp qua HTTP API
- Tất cả business logic xử lý tài liệu nằm trong `backend/src/services/`
- Frontend chỉ render và gọi API — không xử lý file trực tiếp
- Docling chỉ khởi tạo một lần (module-level singleton `converter`) — không khởi tạo lại mỗi request

## 2. Data & Storage Rules
- **CRITICAL:** Tuyệt đối không ghi file ra ngoài thư mục `data/` của project
- Không dùng `os.path.expanduser()`, `Path.home()`, hay bất kỳ path tuyệt đối ngoài project
- Tên file output: `data/{original_stem}.md` — giữ tên gốc, đổi extension

## 3. Markdown Cleaner Rules
- **Never drop content silently:** Mọi transformation thất bại → preserve input nguyên vẹn
- Khi `_table_to_structured_list()` trả về empty string → `result.extend(table_lines)`, không xóa
- Sub-header heuristic: chỉ nhận khi `all('**' in c for c in non_empty_cells)` — không dùng tỷ lệ %
- Empty column check: phải check ALL rows kể cả header row

  **Good:**
  ```python
  if structured:
      result.append(structured)
  else:
      result.extend(table_lines)  # ← preserve original
  ```
  **Bad:**
  ```python
  else:
      cleaned_rows = _remove_empty_columns(rows, empty_cols)
      result.append(_rebuild_table(cleaned_rows))  # ← có thể trả về ""
  ```

## 4. Coding Standards

### Python (Backend)
- Type hints bắt buộc cho tất cả function signatures
- Exception handling: log lỗi và re-raise, không swallow silently
- Logging: dùng `logger = logging.getLogger(__name__)`, không dùng `print()`
- File paths: dùng `os.path.join()` hoặc `pathlib.Path`

### TypeScript (Frontend)
- Luôn define explicit types — tránh `any`
- `ProcessingStage` type phải match với step IDs trong `ProcessingStatus.tsx`
- Axios calls: luôn có error handling với proper user feedback
- Tuân thủ thiết kế Luxury Blue / Neutral theo `05-DESIGN_STANDARD.md`

## 5. Git Conventions (Conventional Commits)
```
feat: add new feature
fix: bug fix
refactor: code refactor without behavior change
test: add/update tests
docs: documentation only
chore: build, config, deps
```

## 6. Versioning — SemVer
- PATCH: bug fix (markdown_cleaner fixes)
- MINOR: new feature (SSE streaming, UX improvements)
- MAJOR: breaking changes

## 7. Quality Gates
- Syntax check: `python -m py_compile backend/src/services/*.py`
- Smoke test: convert PDF + DOCX mẫu sau mỗi thay đổi backend
- Frontend build: `cd frontend && npm run build` phải pass

## 8. Comment Standards
- Chỉ comment khi WHY không rõ ràng từ code
- Workarounds và invariants PHẢI có comment ngắn giải thích lý do
- Không comment lại WHAT — tên biến và hàm phải tự giải thích

## 9. Stack-Specific Rules

### Docling
- Luôn wrap khởi tạo converter trong `try/except` — fallback `converter = None`
- Không hạ `TableFormerMode.FAST` để tăng tốc — chất lượng ưu tiên hơn speed
- DOCX: `WordFormatOption()` default là đủ — SimplePipeline + MsWordDocumentBackend

### FastAPI
- CORS: chỉ allow localhost origins
- Giữ endpoint convert synchronous (Phase 5-6); chuyển async SSE ở Phase 7
- Static files: serve qua `StaticFiles` mount tại `/` sau khi build frontend
