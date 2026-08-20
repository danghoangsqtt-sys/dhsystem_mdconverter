# Luồng hoạt động của dự án Mark Tini

## 1. Tổng quan kiến trúc

Hệ thống gồm 3 lớp chính:

1. Frontend Electron + React
   - Giao diện người dùng Windows
   - Hiển thị Markdown, PDF preview, toolbar, sidebar, lịch sử
   - Gửi yêu cầu tới backend qua HTTP local API

2. Backend FastAPI
   - Khởi tạo job queue, xác thực token, quản lý nhập/xuất, log correlation
   - Chạy conversion document-to-Markdown thông qua Docling
   - Quản lý trạng thái job `queued -> converting -> finalizing -> complete`

3. Runtime offline + model bundle
   - Python embeddable runtime
   - Model Docling, EasyOCR, translation model, code-formula model
   - Dữ liệu lưu cục bộ dưới thư mục runtime/data, không cần internet cho phần lớn chức năng

## 2. Luồng xử lý file đầu vào

```text
Người dùng chọn file
        ↓
Frontend xác thực và validate file
        ↓
Upload tới backend /api/convert hoặc /api/jobs
        ↓
Backend kiểm tra extension, magic bytes, kích thước, UUID, token
        ↓
Đưa vào single-worker queue
        ↓
Docling xử lý file PDF/DOCX/PPTX/HTML/ảnh
        ↓
PDF được chia cụm tối đa 8 trang; cụm partial/failure tự chia nhỏ
        ↓
Trang đơn lỗi được raster hóa có giới hạn kích thước và OCR lại
        ↓
Kiểm tra ConversionStatus + đủ số trang (không chấp nhận partial_success)
        ↓
Markdown output được lưu atomically vào thư mục outputs
        ↓
History/metadata được ghi lại
        ↓
Frontend đọc kết quả và hiển thị trong editor
```

## 3. Luồng OCR vùng PDF

```text
User kéo vùng trên PDF
        ↓
Frontend gửi vùng bbox + file nguồn tới backend
        ↓
Backend xác định input dạng ảnh hoặc vùng cắt
        ↓
Docling extract text từ vùng được chọn
        ↓
Nếu input ảnh, bỏ qua nhánh export_to_markdown có thể tạo placeholder
        ↓
Trả về đoạn văn bản thật và UI hiển thị trong panel riêng
```

## 4. Luồng dịch đoạn văn bản

```text
User bôi đen text
        ↓
Frontend gửi content + direction + glossary
        ↓
Backend che khỏi công thức toán/lý/hóa
        ↓
Model dịch offline (VietAI/envit5-translation)
        ↓
Khôi phục lại công thức nguyên vẹn
        ↓
Trả về bản dịch kèm badge chiều dịch và lĩnh vực
```

## 5. Luồng xác minh trích dẫn

```text
User bôi đen câu trích dẫn
        ↓
Frontend gửi đoạn text tới /api/verify-citation
        ↓
Backend gọi OpenAlex tìm nguồn gần khớp
        ↓
Electron kiểm tra và tự khởi động Ollama đã cài (nếu cần)
        ↓
Backend dùng model mặc định qwen2.5:3b để đánh giá tham khảo bằng AI cục bộ
        ↓
Frontend hiển thị nguồn, khớp/không khớp và cảnh báo độ tin cậy
```

- OpenAlex là bước tra cứu nguồn online và vẫn hoạt động khi Ollama không có.
- Ollama là bước đánh giá AI local tùy chọn. Nếu thiếu Ollama/model, UI hiển thị trang cài chính thức và lệnh `ollama pull qwen2.5:3b` thay vì chỉ báo chung chung.

## 6. Luồng lưu trữ và lịch sử

- Output file được lưu dưới thư mục `data/outputs/`
- History metadata lưu trong `history.json` hoặc dữ liệu tương ứng
- Khi backend khởi động, hệ thống tự dọn:
  - file upload rác
  - output mồ côi không còn trong history
  - lỗi khỏi trạng thái trước đó
- Autosave trên frontend dùng IndexedDB để tránh mất dữ liệu khi tắt ứng dụng đột ngột

## 7. Luồng release và packaging

```text
Build frontend Electron
        ↓
Tạo runtime Python embeddable + model bundle
        ↓
Lock dependency bằng requirements.lock.txt
        ↓
Chạy smoke test + build validation
        ↓
Package NSIS installer
        ↓
Test trên Windows sạch / clean machine
        ↓
Đánh dấu phiên bản release
```

## 8. Điểm nổi bật của phiên bản hiện tại (v1.3.0)

- Sửa lỗi trả về placeholder khi OCR vùng PDF nhỏ
- Giảm độ phức tạp UI của panel dịch
- Thêm sidebar thu gọn và kéo giãn
- Chuyển autosave sang IndexedDB
- Cải thiện offline bundle và reproducible dependency
- Bảo vệ nguồn dữ liệu và điều kiện an toàn từ backend

## 9. Kết luận

Mark Tini là một hệ thống chuyển đổi tài liệu sang Markdown theo hướng offline-first, chạy cục bộ hơn là phụ thuộc vào dịch vụ đám mây. Luồng hoạt động được thiết kế để đảm bảo tính ổn định, không mất dữ liệu, xử lý tuần tự và dễ debug khi triển khai cho người dùng Windows cuối.
