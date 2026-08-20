# Phase 12 — Faithful PDF-to-Word Export

## Goal

Cho phép người dùng xuất toàn bộ PDF sang DOCX mà hình thức của văn bản, công thức, sơ đồ khối và hình ảnh không thay đổi so với PDF gốc.

## Fidelity contract

- Mỗi trang PDF được render ở 180 DPI thành PNG lossless.
- Mỗi ảnh được neo tại `(0,0)` trên một Word section có đúng kích thước và hướng trang PDF.
- Thứ tự và tổng số trang phải giữ nguyên; trang lỗi làm toàn bộ lượt xuất thất bại, không trả file thiếu.
- Kết quả ưu tiên độ trung thực hình thức; nội dung Word là ảnh toàn trang, không chỉnh sửa từng chữ.
- Xử lý hoàn toàn local/offline, tuần tự từng trang và tuần tự giữa các lượt export để giới hạn RAM.

## API and UX

- `POST /api/export/pdf-to-word` chỉ nhận PDF thật, bắt buộc token phiên và giới hạn 100 MiB như upload chính.
- Toolbar hiển thị **Xuất Word giống PDF** khi có PDF đang mở hoặc PDF gốc trong lịch sử.
- Electron dùng hộp thoại Lưu thành để người dùng chọn ổ đĩa/USB; browser-dev dùng blob download fallback.
- Upload/output tạm được dọn sau thành công hoặc lỗi.

## Acceptance

- Ảnh nhúng khớp từng pixel với ảnh render từ PDF fixture.
- PDF hỗn hợp trang dọc/ngang tạo đúng số section, đúng hướng và đúng thứ tự.
- API security/cleanup, Electron native save và responsive toolbar có regression coverage.
- 94 backend tests, lint/build và 6 Electron E2E đạt.
