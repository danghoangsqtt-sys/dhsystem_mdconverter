# Changelog
Tất cả các thay đổi của dự án sẽ được cập nhật tại đây.

## [Unreleased]

### Added
- **Backend:** Bật nhận diện công thức toán/lý/hóa (xuất LaTeX `$...$`) và khối mã nguồn khi convert PDF, dùng model `CodeFormulaV2` chạy cục bộ (`do_formula_enrichment`, `do_code_enrichment` trong `docling_service.py`).
- **Packaging:** Thêm model `code_formula` vào danh sách tải của `prepare-offline-bundle.ps1`.
- **Backend:** Thêm route `POST /api/verify-citation` và `citation_service.py` — tra cứu nguồn trích dẫn theo tiêu đề/tác giả qua OpenAlex API (miễn phí, không cần key), kèm đánh giá mức độ phù hợp mang tính **tham khảo** (advisory-only) từ Ollama cục bộ nếu được cấu hình (`DOCUMARK_OLLAMA_URL`/`DOCUMARK_OLLAMA_MODEL`). Đây là tính năng đầu tiên của DocuMark cần kết nối internet — chỉ chạy khi người dùng chủ động bấm nút cho một đoạn đã chọn, không ảnh hưởng các luồng offline-first hiện có.
- **Frontend:** Thêm nút "Xác minh trích dẫn" trên toolbar — bôi đen một đoạn trích dẫn/tuyên bố trong bản xem trước Markdown để kiểm tra. Kết quả hiển thị ở `CitationVerificationPanel` với badge độ khớp nguồn (khớp/có thể khớp/không tìm thấy) và phần đánh giá nội dung AI luôn kèm cảnh báo độ tin cậy thấp, tách biệt rõ với kết quả tra cứu nguồn.
- **Backend:** Thêm route `POST /api/translate` và `translation_service.py` — dịch Anh→Việt cho đoạn văn bản đã bôi đen bằng model NMT cục bộ (`VietAI/envit5-translation`), chạy hoàn toàn offline sau khi model đã được tải (không cần internet, khác với xác minh trích dẫn). Công thức LaTeX (`$...$`, `$$...$$`) được che tạm trước khi dịch và khôi phục nguyên vẹn sau đó; nếu việc khôi phục không khớp (placeholder bị thiếu/lặp), tự động dịch lại văn bản gốc chưa che thay vì trả về công thức bị hỏng.
- **Packaging:** Thêm bước tải model dịch `VietAI/envit5-translation` vào `prepare-offline-bundle.ps1` (qua `huggingface_hub.snapshot_download`, chỉ lấy các file cần thiết, bỏ qua bản TF/Flax dư thừa) và mở rộng smoke test offline để dịch thử một câu ngay sau khi đóng gói, tránh phát hiện lỗi model muộn ở lần bấm nút đầu tiên của người dùng.
- **Frontend:** Thêm nút "Dịch đoạn đã chọn" trên toolbar, dùng chung cơ chế bôi đen với nút xác minh trích dẫn. Kết quả hiển thị ở `TranslationPanel` với văn bản gốc và bản dịch tiếng Việt xếp chồng, có thể bỏ qua từng kết quả.

### Fixed
- **Backend:** Sửa lỗi tác vụ convert trả về HTTP 500 không rõ nguyên nhân khi hàng đợi job đã đầy, thay vì thông báo 503 thân thiện đã dự định từ trước — đoạn xử lý `JobCapacityError` bị đặt sai vị trí (không bao giờ có thể chạy tới) sau một lần refactor trước đó. Đã chuyển xử lý đến đúng nơi gọi `job_manager.submit()` và thêm regression test ở tầng API route để tránh tái diễn.

## [1.2.0] — 2026-08-18

### Security
- Đóng Windows path traversal bằng UUID validation và không còn CORS wildcard.
- Thêm API token theo phiên, trusted-origin bootstrap và Electron preload bridge tối thiểu.
- Giới hạn upload 100 MiB, allowlist định dạng và cleanup file tạm trên mọi terminal state.

### Reliability
- Thêm single-worker job queue, trạng thái/progress backend thật, bounded capacity và cancel semantics trung thực.
- Ghi output/history nguyên tử; tự cleanup output khi lỗi, hủy, history eviction hoặc `record_history=false`.
- Sửa Markdown table parser cho escaped pipe/inline code; bỏ bold-row heuristic và thêm content-preservation fallback.
- Thêm 19 regression/unit tests cho API, queue, storage và Markdown correctness.

### Packaging
- Thay virtualenv không portable bằng Python embeddable runtime và model bundle Docling/EasyOCR cục bộ.
- Thêm offline preflight/smoke test và production data path dưới Electron `userData`.
- Khóa Docling/EasyOCR, bỏ dependency `sharp` không dùng; production npm audit còn 0 vulnerability.

### Known release gate
- Cần chạy installer trên máy Windows sạch trước khi phát hành công khai.
- Runtime data cũ đã được Git theo dõi cần cleanup/rewrite riêng sau khi chủ sở hữu phê duyệt.

## [1.1.0] — 2026-05-18

### Fixed
- **CRITICAL:** `markdown_cleaner.py` — Nội dung bảng DOCX bị mất hoàn toàn do 3 bugs:
  - `_clean_tables()`: Fallback khi structured list = empty giờ giữ nguyên bảng gốc thay vì drop silently
  - `_table_to_structured_list()`: Sub-header heuristic chỉ nhận khi ALL non-empty cells là bold (trước đây: 70%)
  - `_count_empty_columns()`: Check tất cả rows kể cả header row (trước đây bỏ qua header)
- **Enhancement:** `docling_service.py` — Thêm `InputFormat.DOCX: WordFormatOption()` tường minh với comment giải thích DOCX pipeline (SimplePipeline + MsWordDocumentBackend)

### Added
- Principle "never drop content silently" vào SYSTEM-RULES — mọi fallback trong markdown_cleaner phải preserve content

## [Unreleased]
- **System:** Đóng gói hoàn chỉnh thành hệ thống Portable, có thể chia sẻ không cần cài đặt.
- **System:** Cung cấp script `start.bat` để chạy ứng dụng 1-click (frontend được serve qua FastAPI tĩnh).
- **Frontend:** Hợp nhất (Merge) dự án DocuMark AI Editor, nâng cấp toàn diện giao diện với MDEditor chuyên nghiệp (chuẩn Luxury Blue/Neutral).
- **Frontend:** Loại bỏ kiến trúc giao diện kéo thả cũ và gỡ bỏ module xử lý AI (Ollama/Gemini) cục bộ để nhường chỗ cho FastAPI.
- **Frontend:** Tích hợp `agentation` giúp gỡ lỗi UI dễ dàng hơn.
- **Frontend:** Kết nối Sidebar tải file và hiển thị kết quả (Markdown Preview) trực tiếp từ API `docling`.
- **Backend:** Thêm FastAPI server để làm nền tảng xử lý tài liệu.
- **Backend:** Tích hợp `docling` qua thư mục ảo `docling-env` để chuyển đổi PDF/DOCX sang Markdown.
- **Data:** Khởi tạo thư mục `data/` phân tách với hệ thống để lưu trữ độc lập.
- Khởi tạo dự án và cấu trúc kiến trúc tiêu chuẩn.
