# Brainstorm Session: Documark AI Editor
**Date:** 2026-05-17

## 1. Project Goal
Lập trình một ứng dụng chuyên nghiệp chạy local có giao diện hiện đại tương tự hoặc tích hợp với `documark-ai-editor`. 

## 2. Open Questions & Discovery
- Định hướng của ứng dụng: `documark-ai-editor` là dự án nền tảng hay dự án tham khảo?
- Giao diện mong muốn: Desktop App (Electron) hay Web App (trình duyệt)?
- Tính năng cốt lõi: Kết hợp bộ chuyển đổi Markdown hiện tại vào ứng dụng này?
- Tech Stack: React + Electron + Tailwind?

## 3. Decisions
- **Giao diện:** Chọn phong cách Sáng tối giản (Light Mode) giống Notion.
- **Trình soạn thảo:** Tích hợp bộ Editor chuyên nghiệp (`@uiw/react-md-editor`).
- **Kiến trúc (Mới):** Đề xuất hợp nhất `documark-ai-editor` thẳng vào thư mục `frontend/` của dự án `markdown_convert` hiện tại để tạo thành một thể thống nhất (Trình chuyển đổi Docling ở Backend + Trình soạn thảo Editor ở Frontend).

## 4. Phases (ENH-030)
- **Phase 1:** Phân tích yêu cầu & Thiết kế UI (TBD)

## Project meta intake (FEAT-009)
*(Pending)*
