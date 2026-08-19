# Clean-Machine Verification — DocuMark AI v1.2.0

Gate cuối cùng trong `PHASE-STATE.md` trước khi release: xác nhận installer NSIS
chạy được trên Windows không có Python, pip cache, hay model cache nào từ máy dev.
Checklist này để chạy tay trên máy/VM sạch — không thể tự động hoá từ môi trường dev.

## 1. Chuẩn bị máy test

- [ ] Windows 10/11, chưa cài Python/Node/bất kỳ IDE dev nào của project này.
- Cách nhanh nhất: **Windows Sandbox** (bật ở Settings → Apps → Optional features →
  "Windows Sandbox", cần Windows 10/11 Pro trở lên). Mỗi lần mở là một Windows sạch
  hoàn toàn, tự huỷ khi đóng — không cần VM riêng.
- Nếu dùng máy/VM khác: xác nhận không có `%LOCALAPPDATA%\docling` hay cache
  model Docling/HuggingFace nào còn sót từ trước.

## 2. Chuyển file & xác minh toàn vẹn

- Nguồn: `frontend\release\DocuMark AI Setup 1.2.0.exe` (1,138,879,545 bytes ≈ 1,086.1 MiB)
- Sau khi copy sang máy đích, chạy (PowerShell hoặc cmd, không cần cài gì thêm):
  ```
  certutil -hashfile "DocuMark AI Setup 1.2.0.exe" SHA256
  ```
- Kết quả **phải khớp**:
  ```
  d3904f5638f4bc7136d23054b026e2e3f9e51cdaebc533f3dc21eb643f3a3ef0
  ```
- Không khớp → file hỏng/thiếu khi copy, copy lại trước khi tiếp tục, đừng cài.

## 3. Cài đặt

- [ ] Chạy installer, không lỗi/crash giữa chừng, không yêu cầu tải thêm gì qua mạng.
- [ ] UAC prompt (nếu có) bình thường, chấp nhận được.
- [ ] Cài xong, shortcut xuất hiện.

## 4. Khởi động lần đầu

- [ ] App mở lên, **không** có dialog lỗi kiểu "Python executable not found" hoặc
  "Offline models not found" (đây là 2 lỗi fatal cụ thể trong `main.ts` nếu bundle
  runtime/model bị thiếu — đúng thứ checklist này cần bắt được).
- [ ] Khuyến nghị: ngắt mạng (tắt Wi-Fi/rút cáp) **trước khi** mở app lần đầu, xác
  nhận app vẫn khởi động và convert bình thường — đây là phép thử "true offline" thật sự.
- [ ] UI load đầy đủ, không màn hình trắng.

## 5. Smoke test chuyển đổi thực tế

Chuẩn bị sẵn 1 file PDF và 1 file DOCX thật (nên có ít nhất 1 bảng + 1 đoạn in đậm
để test đúng lỗi mà T8.2 đã sửa).

- [ ] Convert PDF: progress bar là thật (tăng dần theo trang thật), không phải timer giả.
- [ ] Convert DOCX: Markdown output giữ đúng in đậm, bảng, escaped pipe, inline code.
- [ ] Cancel một job đang chạy: job dừng ngay trong UI; kiểm tra Task Manager sau
  vài giây không còn tiến trình `python.exe` mồ côi.
- [ ] Thử 1 file gần/vượt 100 MiB: bị từ chối đúng cách, app không crash.

## 6. Vị trí lưu dữ liệu

- [ ] Sau khi convert, kiểm tra `%APPDATA%\DocuMark AI\data\uploads` và
  `%APPDATA%\DocuMark AI\data\outputs` — file phải nằm ở đây, **không** nằm trong
  thư mục cài đặt (`Program Files\...`) và không liên quan gì tới thư mục project.
- [ ] Panel history trong app hiển thị đúng job vừa convert, mở lại output cũ đọc được.

## 7. Gỡ cài đặt (khuyến nghị, không bắt buộc)

- [ ] Uninstall qua Settings/Control Panel không lỗi.
- [ ] Sau khi gỡ, Task Manager không còn tiến trình DocuMark/python nào.

## Nếu có lỗi

- Chụp lại dialog lỗi nếu có.
- Thử mở file `.exe` đã cài từ terminal (cmd/PowerShell) thay vì double-click —
  đôi khi log backend (qua `console.log`/`safeLog` trong main process) sẽ hiện ra đó.
- Ghi lại: bước nào fail, thông báo lỗi chính xác, phiên bản Windows của máy test.

## Kết quả

Tất cả mục ở trên pass → tick "Clean-machine installer test completed" trong
`PHASE-STATE.md`, v1.2.0 hết release gate.
