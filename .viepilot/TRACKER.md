# Theo Dõi Tiến Độ (Tracker)

- **Current Phase:** Hoàn thiện dự án (Completed)
- **Status:** Đã hoàn thành toàn bộ Phase 1, Phase 2, Phase 3. Ứng dụng đã sẵn sàng chạy độc lập qua script `start.bat`.

## Quyết Định Gần Đây (Decision Log)
- Chọn FastAPI cho backend kết nối với docling-env.
- Hợp nhất (Merge) dự án DocuMark AI Editor vào Frontend, loại bỏ hoàn toàn giao diện kéo thả cũ để dùng MDEditor.
- Loại bỏ xử lý AI bằng Ollama/Gemini cục bộ, chuyển mọi tác vụ xử lý PDF sang FastAPI Docling Backend.
- Tích hợp Agentation vào Frontend để hỗ trợ gỡ lỗi giao diện.
- Tích hợp static build của Frontend vào FastAPI server qua endpoint gốc (`/`) để đóng gói thành 1 ứng dụng portable duy nhất.
