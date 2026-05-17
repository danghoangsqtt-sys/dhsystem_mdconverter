# Changelog
Tất cả các thay đổi của dự án sẽ được cập nhật tại đây.

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
