# Hướng dẫn sử dụng — Mark Tini Editor v1.3.0

Công cụ chuyển đổi tài liệu PDF/DOCX/PPTX/HTML/ảnh sang Markdown, chạy hoàn toàn ngoại tuyến trên máy người dùng, với hỗ trợ OCR tiếng Việt/Anh và dịch đoạn đã chọn.

## 1. Mục tiêu và giới hạn

- Ứng dụng chạy cục bộ trên Windows, không cần tài khoản.
- Phần lớn luồng chuyển đổi và OCR chạy offline sau khi model đã được đóng gói.
- Tính năng duy nhất cần internet là xác minh trích dẫn (OpenAlex + AI đánh giá tham khảo).
- Dữ liệu lưu trong `%APPDATA%\Mark Tini\` hoặc thư mục `userData` của ứng dụng.

## 2. Bắt đầu

1. Mở ứng dụng Mark Tini từ Desktop hoặc Start Menu.
2. Lần đầu mở có thể mất 10–60 giây để nạp model cục bộ.
3. Khi thanh trạng thái báo sẵn sàng, bạn có thể bắt đầu.

## 3. Chuyển đổi tài liệu

1. Ở Sidebar trái, chọn nút "Chọn PDF & Chuyển đổi".
2. Chọn một hoặc nhiều file hỗ trợ: `.pdf`, `.docx`, `.pptx`, `.html`, `.htm`, ảnh phổ biến.
3. Chọn ngôn ngữ OCR: `vi+en`, `vi`, hoặc `en`.
4. Chọn chế độ bảng: `Accurate` hoặc `Fast`.
5. Chờ tiến độ hoàn tất. Từng file được xử lý trong hàng đợi đơn worker để tránh quá tải RAM/CPU.

## 4. Tạo, xem và lưu Markdown

- Khung soạn thảo hiển thị nội dung Markdown đã chuyển đổi.
- Có thể chỉnh sửa trực tiếp, sao chép, mở file `.md` cũ hoặc tạo tài liệu mới.
- Nút "Lưu file" sẽ tải văn bản Markdown về máy.
- Tự động lưu nháp mỗi ~1 giây khi người dùng ngừng gõ, và dữ liệu được lưu vào IndexedDB để tránh mất nội dung.

## 5. Trích xuất vùng PDF

1. Mở một PDF trong ứng dụng.
2. Kéo khung chọn trên trang PDF để OCR riêng vùng cần thiết.
3. Kết quả nhận dạng sẽ hiện ở panel riêng dưới vùng xem PDF.
4. Bạn có thể sửa nội dung, tìm trên web, chèn vào tài liệu hiện tại, hoặc bỏ qua kết quả.

> Từ v1.3.0, lỗi placeholder `<!-- image -->` khi OCR vùng nhỏ đã được sửa; vùng chọn nhỏ/lớn đều trả về văn bản thật.

## 6. Xác minh trích dẫn

1. Bôi đen đoạn cần kiểm tra trong khung xem trước.
2. Chọn nút "Xác minh trích dẫn" trên thanh công cụ.
3. Hệ thống sẽ tra cứu tài liệu tương đồng từ OpenAlex và hiển thị mức độ phù hợp theo dạng khớp / có thể khớp / không tìm thấy.

Lưu ý:
- Đây là tính năng tra cứu tham khảo, không thay thế kiểm chứng nguồn chính thức.
- Cần internet để hoạt động.
- Nếu không có mạng, ứng dụng sẽ báo không xác minh được nhưng không ảnh hưởng tới các tính năng offline.

## 7. Dịch đoạn văn bản

1. Bôi đen đoạn cần dịch trong khung xem trước.
2. Chọn chiều dịch: Anh → Việt hoặc Việt → Anh.
3. Chọn lĩnh vực thuật ngữ (tùy chọn): AI/ML, Toán-Lý-Hóa, Kinh tế/Xã hội.
4. Chọn nút "Dịch đoạn đã chọn".
5. Kết quả hiện ở panel riêng, kèm badge chiều dịch và lĩnh vực.

Công thức toán/lý/hóa dạng `$...$` hoặc `$$...$$` được giữ nguyên trong quá trình dịch để tránh làm hỏng dữ liệu kỹ thuật.

## 8. Sidebar và cửa sổ làm việc

- Sidebar trái có thể thu gọn, mở rộng hoặc kéo giãn tùy ý.
- Trạng thái thu gọn và độ rộng được lưu lại để giữ nguyên khi mở lại app.
- Bảng điều khiển và toolbar hỗ trợ nhanh các thao tác chính.

## 9. Xử lý sự cố thường gặp

- Ứng dụng mở chậm lúc đầu: bình thường do model cục bộ đang được nạp vào bộ nhớ.
- Không chuyển đổi được: kiểm tra định dạng, dung lượng file dưới 100 MB, và model đã được đóng gói đúng.
- File log lỗi: `%APPDATA%\Mark Tini\data\logs\backend.log`
- Nếu ứng dụng bị crash ngay sau khi cài đặt: kiểm tra lại bundle runtime và file cài đặt đã build đúng phiên bản.

## 10. Thông tin phiên bản

| Mục | Giá trị |
|---|---|
| Sản phẩm | Mark Tini Editor |
| Phiên bản | 1.3.0 |
| Cập nhật nổi bật | OCR vùng PDF, dịch đoạn, xác minh trích dẫn, sidebar tùy chỉnh |
| Bản quyền | © 2026 DHSystem |
