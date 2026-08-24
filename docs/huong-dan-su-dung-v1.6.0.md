# Hướng dẫn sử dụng — Tini Suite v1.6.0

Cập nhật: 24/08/2026 · Áp dụng cho Tini Suite v1.6.0 (Mark Tini + Tini OCR)

---

## Mục lục

1. [Mục tiêu và giới hạn](#1-mục-tiêu-và-giới-hạn)
2. [Bắt đầu](#2-bắt-đầu)
3. [Chuyển đổi tài liệu (Mark Tini)](#3-chuyển-đổi-tài-liệu-mark-tini)
4. [Xuất ra Word](#4-xuất-ra-word)
5. [Soạn thảo, xem trước và lưu Markdown](#5-soạn-thảo-xem-trước-và-lưu-markdown)
6. [Trích xuất vùng PDF (Region OCR)](#6-trích-xuất-vùng-pdf-region-ocr)
7. [Xác minh trích dẫn](#7-xác-minh-trích-dẫn)
8. [Dịch đoạn văn bản](#8-dịch-đoạn-văn-bản)
9. [Tini OCR — nhận dạng ảnh chụp](#9-tini-ocr--nhận-dạng-ảnh-chụp)
10. [Sidebar và cửa sổ làm việc](#10-sidebar-và-cửa-sổ-làm-việc)
11. [Xử lý sự cố thường gặp](#11-xử-lý-sự-cố-thường-gặp)
12. [Thông tin phiên bản](#12-thông-tin-phiên-bản)

---

## 1. Mục tiêu và giới hạn

Tini Suite gồm **hai ứng dụng cài từ một bộ cài duy nhất**:

- **Mark Tini** — chuyển PDF/DOCX/PPTX/HTML/ảnh sang Markdown chỉnh sửa được, hoặc xuất thẳng ra Word.
- **Tini OCR** — nhận dạng chữ trong nhiều ảnh chụp/scan cùng lúc, review theo từng trang rồi xuất ra file.

Cả hai chạy hoàn toàn cục bộ trên máy — tài liệu không được gửi lên server nào, không cần tài khoản. Ngoại lệ duy nhất là tính năng **Xác minh trích dẫn** (mục 7), cần kết nối mạng để tra cứu nguồn.

Giới hạn cần biết trước khi dùng:

- Mỗi lúc chỉ một tác vụ nặng (chuyển đổi, OCR, xuất Word) được xử lý — nếu gửi nhiều việc cùng lúc, việc sau sẽ xếp hàng chờ thay vì chạy song song. Đây là lựa chọn có chủ đích để không làm treo máy, không phải lỗi.
- Dịch chỉ áp dụng cho đoạn văn bản bạn bôi đen, không dịch nguyên văn bản trong một lần bấm.
- Xác minh trích dẫn đưa ra gợi ý tham khảo, không phải kết luận chắc chắn — luôn tự kiểm tra lại nguồn trước khi trích dẫn chính thức.
- Tini OCR nhận tối đa 50 ảnh mỗi lượt.

## 2. Bắt đầu

1. Sau khi cài đặt, Desktop/Start Menu sẽ có 2 shortcut: **Mark Tini** và **Tini OCR**.
2. Mở một trong hai — cửa sổ hiện lên ngay. Nếu đây là lần đầu mở kể từ khi cài hoặc từ khi khởi động lại máy, phần lõi xử lý phía sau có thể mất khoảng nửa phút tới vài phút để sẵn sàng (đang nạp model AI) — thanh trạng thái ở góc trên sẽ báo khi nào có thể bắt đầu dùng.
3. Có thể mở **cả hai ứng dụng cùng lúc** — mở ứng dụng thứ hai trong khi ứng dụng đầu đang chạy sẽ nhanh hơn nhiều vì dùng chung phần lõi đã sẵn sàng, không phải nạp lại từ đầu.
4. Đóng một cửa sổ không tắt phần lõi nếu cửa sổ còn lại vẫn đang mở — chỉ khi đóng cửa sổ cuối cùng, toàn bộ Tini Suite mới thực sự dừng.
5. Không cần mạng để mở và dùng các tính năng chính. Chỉ tính năng Xác minh trích dẫn (mục 7) cần mạng.

## 3. Chuyển đổi tài liệu (Mark Tini)

1. Mở Mark Tini.
2. Ở Sidebar bên trái, bấm **Thêm file** để chọn một hoặc nhiều file (PDF, DOCX, PPTX, HTML, hoặc ảnh), hoặc bấm **Chọn cả thư mục** để nạp toàn bộ file hỗ trợ trong một thư mục (kể cả thư mục con).
3. Chọn **ngôn ngữ OCR** (vi+en mặc định, hoặc chỉ vi / chỉ en) và **chế độ nhận dạng bảng** (accurate — chính xác hơn nhưng chậm hơn; hoặc fast) ngay dưới nút tải file.
4. Từng file được xử lý lần lượt — theo dõi tiến độ trong Sidebar. Có thể bấm hủy một file đang xử lý bất kỳ lúc nào; các file khác trong hàng đợi không bị ảnh hưởng.
5. Khi xong, nội dung Markdown hiện trong khung soạn thảo — xem mục 5 để soạn/lưu tiếp.

Với PDF nhiều trang, hệ thống tự chia nhỏ theo từng cụm trang khi xử lý — nếu một vài trang gặp lỗi khi đọc, các trang còn lại vẫn được giữ lại thay vì làm hỏng toàn bộ kết quả.

## 4. Xuất ra Word

Sau khi có nội dung (đã convert hoặc đang soạn), thanh công cụ phía trên khung soạn thảo có 2 nút xuất Word, phục vụ hai nhu cầu khác nhau:

| Nút | Dùng khi nào | Kết quả |
|---|---|---|
| **Xuất Word chỉnh sửa được** | Cần sửa tiếp nội dung trong Word (heading, đoạn văn, bảng, danh sách) | File .docx với văn bản Word thật, sửa chữ trực tiếp được |
| **Xuất Word giống PDF** | Cần giữ đúng bố cục gốc — công thức phức tạp, sơ đồ, hình ảnh, hướng trang | File .docx mà mỗi trang là ảnh chụp lại đúng như PDF gốc, không sửa chữ trực tiếp được |

Xuất Word chỉnh sửa được dùng ngay nội dung Markdown bạn đang xem/đã sửa trong Mark Tini, nên phản ánh đúng những gì bạn đã chỉnh sửa. Xuất Word giống PDF cần file PDF gốc và dựng lại từng trang từ đầu nên có thể mất thêm thời gian với file nhiều trang.

Khi bấm xuất, hộp thoại **Lưu thành** cho phép chọn thẳng thư mục đích — kể cả USB hoặc ổ đĩa ngoài — không bắt buộc phải lưu vào Downloads.

## 5. Soạn thảo, xem trước và lưu Markdown

- 3 chế độ xem ở góc trên khung soạn thảo: chỉ soạn thảo, soạn thảo + xem trước song song, chỉ xem trước.
- Nội dung **tự động lưu bản nháp** ngay trong trình duyệt nội bộ mỗi khi bạn ngừng gõ khoảng 1 giây — tắt app đột ngột cũng không mất bản đang soạn, mở lại app sẽ thấy đúng nội dung lần cuối.
- Lưu ra file: nút **Lưu** để ghi ra `.md`, hoặc dùng 1 trong 2 nút xuất Word ở mục 4.
- Nút **sao chép** để copy toàn bộ nội dung Markdown vào clipboard, dán sang nơi khác.
- Mở file `.md` có sẵn để sửa tiếp, hoặc bắt đầu tài liệu mới trống.

## 6. Trích xuất vùng PDF (Region OCR)

Khi đang xem một file PDF trong Mark Tini, có thể OCR riêng một vùng nhỏ trên trang thay vì chuyển cả file:

1. Vẽ khung chọn quanh vùng cần nhận dạng trên khung xem PDF bên trái (có thể vẽ nhiều vùng liên tiếp).
2. Mỗi vùng được nhận dạng riêng, kết quả hiện thành từng thẻ trong panel bên cạnh — chiều cao thẻ tự giãn theo lượng nội dung.
3. Với mỗi thẻ kết quả, có thể:
   - **Sửa trực tiếp** văn bản nếu nhận dạng chưa chính xác hoàn toàn.
   - **Tìm trên web** — mở tìm kiếm Google với nội dung đó qua trình duyệt mặc định.
   - **Chèn vào tài liệu** — nối văn bản vào cuối nội dung Markdown đang soạn.
   - **Bỏ qua** để xóa thẻ không cần.

Tính năng này dùng chung engine OCR với Tini OCR, áp dụng đúng ngôn ngữ đang chọn ở Sidebar.

## 7. Xác minh trích dẫn

Cần **kết nối mạng** cho mục này — đây là tính năng duy nhất trong Tini Suite gọi ra ngoài máy.

1. Bôi đen một đoạn trích dẫn hoặc tuyên bố cần kiểm tra trong bản xem trước.
2. Bấm **Xác minh trích dẫn**.
3. Hệ thống tra cứu nguồn khớp gần nhất (tiêu đề, tác giả, năm, DOI, điểm khớp) và hiển thị trong panel riêng.
4. Nếu máy đã cài sẵn Ollama, Mark Tini **tự khởi động Ollama khi cần** và bổ sung thêm một nhận định tham khảo bằng tiếng Việt bên dưới kết quả tra cứu — không cần tự mở Ollama trước.

Kết quả xác minh chỉ mang tính tham khảo. Không tìm thấy nguồn khớp không có nghĩa là trích dẫn sai — có thể do nguồn chưa được lập chỉ mục, hoặc do lỗi mạng tạm thời.

## 8. Dịch đoạn văn bản

**Không cần mạng** cho mục này.

1. Bôi đen đoạn văn bản cần dịch trong bản xem trước.
2. Chọn chiều dịch (Anh → Việt hoặc Việt → Anh) và, nếu muốn, một lĩnh vực thuật ngữ chuyên ngành (AI/Học máy, Toán-Lý-Hóa, hoặc Kinh tế/Xã hội) để dịch thuật ngữ chính xác hơn.
3. Bấm **Dịch đoạn đã chọn** — bản dịch hiện trong panel riêng bên cạnh, không đè lên đoạn gốc.

Công thức toán/lý/hóa trong đoạn được dịch sẽ được giữ nguyên, không bị dịch nhầm thành văn bản.

## 9. Tini OCR — nhận dạng ảnh chụp

Tini OCR là **ứng dụng riêng**, dùng cho ảnh chụp/scan tài liệu (khác với Region OCR ở mục 6, vốn dùng để cắt vùng từ một PDF đang mở trong Mark Tini).

1. Mở Tini OCR.
2. Chọn hoặc kéo-thả **nhiều ảnh JPG/PNG cùng lúc** (tối đa 50 ảnh một lượt).
3. Chọn kiểu xử lý ảnh trước khi nhận dạng:

   | Kiểu xử lý | Phù hợp khi |
   |---|---|
   | **Original** | Ảnh đã rõ nét, chụp thẳng, không cần chỉnh sửa gì thêm |
   | **Balanced** (mặc định) | Ảnh chụp bằng điện thoại thông thường — tự chỉnh phối cảnh nếu ảnh bị nghiêng góc, làm thẳng chữ bị xoay nhẹ, khử bóng, tăng tương phản |
   | **High contrast** | Ảnh mờ, thiếu sáng, hoặc chụp ngược sáng — tăng tương phản mạnh hơn và làm rõ nét chữ/nền |

4. Bấm bắt đầu nhận dạng — tiến độ hiện theo từng ảnh đã xử lý xong.
5. Sau khi hoàn tất, review kết quả theo từng trang: xem lại ảnh gốc, sửa trực tiếp phần chữ nhận dạng chưa đúng.
6. Xuất kết quả ra 1 trong 4 định dạng:
   - **TXT** — văn bản thuần.
   - **Markdown**.
   - **DOCX chỉnh sửa được** — văn bản Word thật.
   - **DOCX giống ảnh gốc** — mỗi trang là ảnh, giữ đúng như ảnh đã chụp.

Nếu một ảnh trong lô bị lỗi khi nhận dạng, các ảnh còn lại vẫn xử lý và trả kết quả bình thường — lỗi chỉ gắn vào đúng ảnh đó, kèm thông báo cụ thể.

Nếu hệ thống đang xử lý quá nhiều lô cùng lúc (hiếm khi xảy ra với người dùng cá nhân), Tini OCR sẽ báo **"Hàng đợi OCR đang đầy"** thay vì nhận thêm việc — đợi một lát rồi thử lại.

## 10. Sidebar và cửa sổ làm việc

Áp dụng cho Sidebar của cả Mark Tini và Tini OCR:

- Bấm nút mũi tên ở đầu Sidebar để thu gọn thành dải icon hẹp (56px) khi cần thêm không gian cho khung soạn thảo/review, hoặc mở rộng lại.
- Kéo dải viền phải của Sidebar để chỉnh độ rộng tự do trong khoảng 200–420px.
- Trạng thái thu gọn/độ rộng được nhớ lại — mở app lần sau sẽ giữ đúng như lần trước.

## 11. Xử lý sự cố thường gặp

**Ứng dụng mở lâu không vào được:** lần đầu mở sau khi cài hoặc sau khi khởi động lại máy có thể mất tới vài phút để nạp model AI — đây là bình thường, không phải treo. Theo dõi thanh trạng thái ở góc trên. Nếu quá 5 phút vẫn chưa sẵn sàng, đóng hẳn cả hai ứng dụng rồi mở lại.

**Xác minh trích dẫn không trả kết quả:** kiểm tra máy đang có kết nối mạng — đây là tính năng duy nhất cần internet, mọi tính năng khác đều hoạt động khi offline.

**Xuất Word báo lỗi với file rất lớn:** xuất Word chỉnh sửa được có giới hạn khoảng 10 triệu ký tự Markdown mỗi lượt — với tài liệu cực lớn, cân nhắc tách nhỏ hoặc dùng chế độ xuất giống PDF thay thế.

**Muốn xem log chi tiết khi báo lỗi:** log của Tini Suite (dùng chung cho cả Mark Tini và Tini OCR) nằm tại:

```
%APPDATA%\Tini Suite\data\logs\backend.log
```

Khi báo lỗi cho bộ phận hỗ trợ, đính kèm vài dòng log gần thời điểm xảy ra lỗi sẽ giúp xác định nguyên nhân nhanh hơn.

**Dữ liệu/lịch sử lưu ở đâu:** toàn bộ dữ liệu (file gốc đã upload, kết quả, lịch sử) lưu tại `%APPDATA%\Tini Suite\data`, tách biệt hoàn toàn khỏi thư mục cài đặt — gỡ cài đặt ứng dụng không tự xóa thư mục này.

## 12. Thông tin phiên bản

| Mục | Giá trị |
|---|---|
| Phiên bản | 1.6.0 |
| Sản phẩm | Mark Tini + Tini OCR (Tini Suite) |
| Bộ cài | Tini Suite Setup 1.6.0.exe (một bộ cài cho cả hai ứng dụng) |
| Yêu cầu mạng | Không, trừ Xác minh trích dẫn |
| Yêu cầu quyền cài đặt | Không cần quyền admin |

Những thay đổi đáng chú ý nhất so với các bản 1.3.x:

- Gộp thành **Tini Suite** — một bộ cài, hai ứng dụng dùng chung phần lõi xử lý.
- Thêm **Tini OCR** — nhận dạng ảnh chụp hàng loạt, review theo trang, xuất 4 định dạng.
- Thêm **2 chế độ xuất Word** trực tiếp từ Mark Tini.
- Xử lý ổn định hơn với PDF rất nhiều trang.
- Lịch sử giữ lại được file gốc đã upload để tải lại khi cần.
- Có thể chọn nguyên một thư mục để chuyển đổi hàng loạt trong Mark Tini.

Để biết chi tiết kỹ thuật đầy đủ (kiến trúc, API, cấu hình), xem [`bao-cao-ky-thuat-v1.6.0.md`](bao-cao-ky-thuat-v1.6.0.md).
