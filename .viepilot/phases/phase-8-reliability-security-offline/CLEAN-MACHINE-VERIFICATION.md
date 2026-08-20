# Clean-Machine Verification — Mark Tini v1.2.0

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

- Nguồn: `frontend\release\Mark Tini Setup 1.2.0.exe` (1,992,746,966 bytes ≈ 1,900.4 MiB)
- Sau khi copy sang máy đích, chạy (PowerShell hoặc cmd, không cần cài gì thêm):
  ```
  certutil -hashfile "Mark Tini Setup 1.2.0.exe" SHA256
  ```
- Kết quả **phải khớp**:
  ```
  f83143354beadba77d968806ac83c28137738843c83c77370761975e4dc3f84c
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
- [ ] Vẫn trong lúc ngắt mạng: bôi đen một đoạn có công thức (`$...$`) hoặc code
  inline trong bản xem trước, bấm nút dịch ("Dịch đoạn đã chọn") — dịch ra tiếng
  Việt thành công, công thức/code giữ nguyên verbatim (không bị dịch/mất). Model
  EnViT5 nằm sẵn trong bundle nên bước này không được gọi mạng.

## 5. Smoke test chuyển đổi thực tế

Chuẩn bị sẵn 1 file PDF và 1 file DOCX thật (nên có ít nhất 1 bảng + 1 đoạn in đậm
để test đúng lỗi mà T8.2 đã sửa).

- [ ] Convert PDF: progress bar là thật (tăng dần theo trang thật), không phải timer giả.
- [ ] Convert DOCX: Markdown output giữ đúng in đậm, bảng, escaped pipe, inline code.
- [ ] Cancel một job đang chạy: job dừng ngay trong UI; kiểm tra Task Manager sau
  vài giây không còn tiến trình `python.exe` mồ côi.
- [ ] Thử 1 file gần/vượt 100 MiB: bị từ chối đúng cách, app không crash.
- [ ] Bật lại mạng, bôi đen một đoạn có trích dẫn thật, bấm "Xác minh trích dẫn"
  — đây là tính năng duy nhất cần internet (gọi OpenAlex), xác nhận trả kết quả
  đúng khi có mạng. Nếu muốn, tắt mạng lại và thử lần nữa: phải báo lỗi thân
  thiện bằng tiếng Việt, không crash app.

## 6. Vị trí lưu dữ liệu

- [ ] Sau khi convert, kiểm tra `%APPDATA%\Mark Tini\data\uploads` và
  `%APPDATA%\Mark Tini\data\outputs` — file phải nằm ở đây, **không** nằm trong
  thư mục cài đặt (`Program Files\...`) và không liên quan gì tới thư mục project.
- [ ] Panel history trong app hiển thị đúng job vừa convert, mở lại output cũ đọc được.

## 7. Gỡ cài đặt (khuyến nghị, không bắt buộc)

- [ ] Uninstall qua Settings/Control Panel không lỗi.
- [ ] Sau khi gỡ, Task Manager không còn tiến trình Mark Tini/python nào.

## Nếu có lỗi

- Chụp lại dialog lỗi nếu có.
- Thử mở file `.exe` đã cài từ terminal (cmd/PowerShell) thay vì double-click —
  đôi khi log backend (qua `console.log`/`safeLog` trong main process) sẽ hiện ra đó.
- Ghi lại: bước nào fail, thông báo lỗi chính xác, phiên bản Windows của máy test.

## Kết quả

Tất cả mục ở trên pass → tick "Clean-machine installer test completed" trong
`PHASE-STATE.md`, v1.2.0 hết release gate.
