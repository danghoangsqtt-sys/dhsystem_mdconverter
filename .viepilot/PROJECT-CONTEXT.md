# Bối Cảnh Dự Án & Tầm Nhìn (Project Context)

## ViePilot active profile (FEAT-009)
ViePilot profile: none / not configured

## Product Vision

```xml
<product_vision>
  <project_scope>
    Ứng dụng local chuyển đổi DOCX/PDF sang Markdown chất lượng cao, tối ưu cho AI đọc.
    Có giao diện editor chuyên nghiệp (Luxury Blue / Neutral), chạy offline hoàn toàn.
  </project_scope>

  <phase_overview>
    Phase 1-3: Foundation → Frontend → Packaging (ĐÃ HOÀN THÀNH)
    Phase 4: Fix DOCX table content loss (CRITICAL bug fix — code done, test pending)
    Phase 5: Improve PDF markdown quality (high priority)
    Phase 6: Fix UX processing status (simulated progress + type fixes)
    Phase 7: SSE real-time streaming (long-term enhancement)
  </phase_overview>

  <anti_goals>
    - KHÔNG lưu file ra ngoài thư mục data/ của dự án
    - KHÔNG ghi vào C:/Users hay bất kỳ system path nào
    - KHÔNG cần internet / cloud để hoạt động
    - KHÔNG thêm AI processing (Ollama/Gemini) — đã loại bỏ theo quyết định kiến trúc
  </anti_goals>
</product_vision>
```

## Domain Knowledge

### Docling
- Công cụ parse tài liệu PDF/DOCX → Markdown, bảo lưu format gốc, công thức toán, bảng biểu
- **PDF pipeline:** Dùng ML (TableFormer) để nhận diện cấu trúc trang, bảng, heading
- **DOCX pipeline:** Đọc trực tiếp OOXML XML (`MsWordDocumentBackend`) — không cần ML
- `TableFormerMode.ACCURATE` chậm hơn FAST ~2-3x nhưng xử lý merged cells và multi-row headers chính xác
- `do_cell_matching=True` đảm bảo data map đúng cột sau khi nhận diện cấu trúc bảng
- `export_to_markdown()` trả về chuỗi markdown với bảng dạng pipe format chuẩn

### Các loại bảng phức tạp gặp trong thực tế (Đề cương môn học)
| Loại bảng | Đặc điểm | Xử lý |
|-----------|---------|-------|
| Bảng đơn (≤8 cột, cell ≤200 chars) | Header 1 dòng, dữ liệu đơn giản | Giữ markdown table, remove empty cols |
| Bảng phức tạp (>8 cột hoặc cell dài) | Multi-row header, merged cells | Convert sang structured list |
| Bảng DOCX với vertical merge | Continuation rows = empty cells | Keep original nếu structured list fails |

### Markdown Cleaner — Business Rules
1. **Never drop content silently** — mọi fallback phải preserve content gốc
2. Sub-header detection: chỉ xác nhận sub-header khi ALL non-empty cells là bold (`**text**`)
3. Empty column: cột chỉ là "empty" khi KHÔNG có content trong BẤT KỲ row nào (kể cả header)
4. Complex table threshold: >8 columns OR bất kỳ cell nào >200 chars

## Business Rules
- File upload tối đa: (TBD — chưa set limit, backend mặc định FastAPI ~100MB)
- Supported formats: PDF, DOCX (Docling hỗ trợ nhiều hơn nhưng đây là 2 format chính)
- Output lưu tại: `data/{original_filename}.md` (relative to project root)
- Processing: synchronous (Phase 4-5), sẽ chuyển async với SSE (Phase 7)

## Ràng Buộc Kỹ Thuật
- Tất cả dữ liệu I/O phải nằm trong `data/`, tuyệt đối không ghi ra `C:/Users`
- Python virtual env dùng `docling-env/` (đã có sẵn, không cần install lại)
- Frontend build static được serve trực tiếp qua FastAPI `/` endpoint
- Chạy local: `start.bat` → khởi động FastAPI, mở browser
