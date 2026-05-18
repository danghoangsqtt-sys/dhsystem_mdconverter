# AI Navigation Guide — DocuMark AI Editor

## Bối Cảnh Nhanh
- **Dự án:** Local Markdown Converter — chuyển đổi DOCX/PDF sang Markdown dùng Docling
- **Stack:** FastAPI (Python) + React/Vite/TypeScript + Docling
- **Chạy:** Local only (`start.bat` → FastAPI serve cả backend + static frontend)
- **Data:** Tất cả files I/O qua thư mục `data/` — tuyệt đối không ghi vào `C:/Users`
- **ViePilot profile:** none / not configured

## Chiến Lược Load Context (Token-Efficient)

### Luôn đọc trước:
1. `AI-GUIDE.md` (file này)
2. `.viepilot/TRACKER.md` — phase hiện tại + trạng thái
3. `.viepilot/ROADMAP.md` — toàn bộ phases + tasks

### Đọc khi cần:
- `.viepilot/ARCHITECTURE.md` — khi làm việc với luồng dữ liệu / service mới
- `.viepilot/SYSTEM-RULES.md` — khi code mới cần tuân thủ conventions
- `.viepilot/PROJECT-CONTEXT.md` — khi cần domain knowledge / business rules

### File nguồn theo domain:
| Domain | File chính |
|--------|-----------|
| Docling conversion | `backend/src/services/docling_service.py` |
| Markdown post-processing | `backend/src/services/markdown_cleaner.py` |
| API endpoints | `backend/src/main.py` |
| Frontend state/types | `frontend/src/types.ts` |
| Processing UI | `frontend/src/components/ProcessingStatus.tsx` |
| API calls | `frontend/src/services/api.ts` |
| Main app logic | `frontend/src/App.tsx` |

## Quan Hệ File

```
docling_service.py
  → gọi Docling DocumentConverter (PDF: ACCURATE mode, DOCX: WordFormatOption)
  → gọi clean_markdown() từ markdown_cleaner.py
  → trả về cleaned markdown string

App.tsx
  → gọi api.ts (uploadAndConvert)
  → nhận ProcessingStage updates
  → render ProcessingStatus.tsx trong quá trình xử lý
  → render MDEditor khi complete
```

## Nguyên Tắc Cốt Lõi
- **Never drop content silently** — mọi fallback trong markdown_cleaner phải giữ nguyên content gốc
- Data files chỉ lưu trong `data/`, không được hard-code path ra ngoài project
- DOCX dùng `MsWordDocumentBackend` (XML trực tiếp), PDF dùng ML `TableFormerMode.ACCURATE`
