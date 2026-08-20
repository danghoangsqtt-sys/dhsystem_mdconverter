# Hướng dẫn sử dụng — Mark Tini Editor v1.2.0

Công cụ chuyển đổi tài liệu PDF/DOCX/PPTX/HTML sang Markdown, chạy hoàn toàn ngoại tuyến trên máy của bạn.

## 1. Trước khi bắt đầu

- Ứng dụng chạy 100% trên máy bạn, không cần internet — trừ 1 tính năng duy nhất là **"Xác minh trích dẫn"**.
- Không cần tài khoản, không cần đăng nhập.
- Dữ liệu và lịch sử chuyển đổi được lưu tại:
  `%APPDATA%\mark-tini\data`
  (gõ đường dẫn này vào thanh địa chỉ File Explorer để mở nhanh)

## 2. Mở ứng dụng lần đầu

- Double-click biểu tượng **Mark Tini** trên Desktop hoặc Start Menu.
- Lần mở đầu tiên có thể mất khoảng 10-30 giây để nạp các model AI — đây là điều bình thường, ứng dụng đang tự tải model đã đóng gói sẵn vào bộ nhớ, **không** phải đang tải từ mạng.
- Khi thanh trạng thái ở góc dưới (Sidebar) chuyển sang màu báo "sẵn sàng", bạn có thể bắt đầu dùng.

## 3. Chuyển đổi tài liệu sang Markdown

1. Ở khung bên trái (Sidebar), bấm nút **"Chọn PDF & Chuyển đổi"**.
2. Chọn 1 hoặc nhiều file (`.pdf`, `.docx`, `.pptx`, `.html`).
3. Chờ thanh tiến độ chạy xong — nếu chọn nhiều file, các file được xử lý lần lượt (không xử lý đồng thời, tránh treo máy chậm).
4. Nội dung Markdown hiện ra trong khung soạn thảo, sẵn sàng chỉnh sửa.

**Tuỳ chọn trước khi chuyển đổi** (2 ô chọn ngay dưới nút tải file):

- **Ngôn ngữ OCR:** chọn `vi+en` (mặc định, dùng cho tài liệu lẫn cả tiếng Việt và tiếng Anh), hoặc chỉ `vi`, hoặc chỉ `en` nếu biết chắc tài liệu chỉ có 1 ngôn ngữ (xử lý nhanh hơn một chút).
- **Chế độ nhận dạng bảng:** `Accurate` (chính xác hơn, chậm hơn — nên dùng mặc định) hoặc `Fast` (nhanh hơn, dùng khi tài liệu có ít bảng phức tạp).

Muốn huỷ giữa chừng? Bấm nút Huỷ ngay trong lúc thanh tiến độ đang chạy — an toàn, không để lại file rác.

## 4. Trích xuất một vùng trong file PDF

Dùng khi bạn chỉ cần đọc/OCR một vùng nhỏ (một hình, một bảng nhỏ) thay vì chuyển cả trang.

1. Mở một file PDF (theo hướng dẫn ở mục 3) — khung xem PDF sẽ hiện ở phía bên trái màn hình.
2. Kéo chuột để vẽ khung chọn quanh vùng cần đọc.
3. Kết quả nhận dạng hiện ở panel bên dưới khung xem, dưới dạng từng thẻ có thể:
   - Sửa lại văn bản nếu nhận dạng chưa đúng hoàn toàn
   - **"Tìm trên web"** — mở tìm kiếm Google với nội dung đó
   - **"Chèn vào tài liệu"** — nối văn bản vào cuối bản Markdown đang soạn
   - Bỏ qua — xoá thẻ nếu không cần

## 5. Xác minh trích dẫn (cần có internet)

Dùng khi bạn muốn kiểm tra nhanh một câu trích dẫn/tuyên bố có nguồn học thuật hay không.

1. Bôi đen đoạn văn bản cần kiểm tra trong khung xem trước.
2. Bấm nút **"Xác minh trích dẫn"** trên thanh công cụ phía trên.
3. Kết quả hiện ở panel riêng: nguồn gần khớp nhất tìm được (tiêu đề, tác giả, năm, DOI) và điểm khớp.

> **Lưu ý quan trọng:** đây là công cụ tra cứu tham khảo, không phải kết luận chắc chắn 100%. Luôn tự kiểm tra lại nguồn trước khi trích dẫn vào bài viết chính thức của bạn. Nếu không có mạng, tính năng này sẽ báo không xác minh được — mọi tính năng khác trong ứng dụng vẫn hoạt động bình thường.

## 6. Dịch đoạn văn bản (Anh ↔ Việt, không cần mạng)

1. Bôi đen đoạn văn bản cần dịch trong khung xem trước.
2. Trên thanh công cụ, chọn:
   - **Chiều dịch:** Anh → Việt hoặc Việt → Anh
   - **Lĩnh vực thuật ngữ** (tuỳ chọn, để trống nếu không cần):
     - Khoa học máy tính / AI-ML
     - Toán - Lý - Hoá
     - Kinh tế / Khoa học xã hội

     Chọn đúng lĩnh vực giúp bản dịch dùng đúng thuật ngữ chuyên ngành tiếng Việt thay vì dịch chung chung.
3. Bấm **"Dịch đoạn đã chọn"**. Kết quả hiện song song bản gốc và bản dịch.

Công thức toán/lý/hoá (dạng `$...$`) trong đoạn được dịch sẽ tự động được giữ nguyên, không bị dịch nhầm hay làm hỏng.

Lưu ý: hiện chỉ dịch được đoạn văn bản bạn bôi đen, chưa hỗ trợ dịch toàn bộ tài liệu trong một lần bấm.

## 7. Lưu kết quả

- Nút **"Lưu file"** (thanh công cụ trên): tải file `.md` về máy, bạn chọn nơi lưu.
- Nút **"Sao chép"**: copy toàn bộ nội dung Markdown vào clipboard, dán thẳng vào ứng dụng khác (Notion, Obsidian, VS Code...).
- Ứng dụng tự động lưu bản nháp mỗi khi bạn gõ (khoảng 1 giây sau khi ngừng gõ) — nếu tắt máy đột ngột hoặc mất điện, mở lại ứng dụng sẽ khôi phục đúng nội dung đang dở dang.

## 8. Lịch sử chuyển đổi

- Danh sách các lần chuyển đổi trước hiện ở cuối Sidebar (khung bên trái).
- Click vào một mục để mở lại kết quả cũ.
- Biểu tượng thùng rác bên cạnh mỗi mục để xoá khi không cần nữa.

## 9. Tạo tài liệu mới / mở file Markdown có sẵn

Trong nhóm "Chức năng" ở Sidebar:

- **"Tài liệu mới":** xoá khung soạn thảo để bắt đầu lại (sẽ hỏi xác nhận nếu đang có nội dung chưa lưu).
- **"Mở file Markdown":** mở một file `.md` có sẵn trên máy để chỉnh sửa tiếp.

## 10. Xử lý sự cố thường gặp

- **Ứng dụng mở lâu / đứng ở "đang tải model":** lần đầu mở sau khi cài có thể mất đến khoảng 1 phút trên máy cấu hình thấp — đây là lúc nạp model AI vào bộ nhớ, không phải bị treo. Hãy đợi thay vì tắt ứng dụng giữa chừng.
- **Báo "mất kết nối" khi đang chuyển đổi:** đóng và mở lại ứng dụng; nếu vẫn lỗi, kiểm tra RAM máy còn trống hay không (ứng dụng cần khoảng 2-2.5 GB RAM khi đang hoạt động đầy đủ tính năng).
- **File không chuyển đổi được:** kiểm tra đúng định dạng hỗ trợ (`.pdf`, `.docx`, `.pptx`, `.html`) và dung lượng dưới 100 MB.
- **Bảng biểu trong kết quả trông lạ** (dạng danh sách thay vì bảng): xảy ra khi bảng gốc quá phức tạp (quá nhiều cột hoặc ô quá dài) — đây là cách ứng dụng chủ động tránh làm hỏng dữ liệu, toàn bộ thông tin vẫn còn đầy đủ, chỉ đổi cách trình bày.
- **Muốn xem log chi tiết khi báo lỗi:** file log nằm tại `%APPDATA%\mark-tini\data\logs\backend.log`

## Thông tin phiên bản

| | |
|---|---|
| Sản phẩm | Mark Tini Editor |
| Phiên bản | 1.2.0 |
| Engine xử lý | DHSystem Core Engine v2 |
| Bản quyền | © 2026 DHSystem |
