# Changelog
Tất cả các thay đổi của dự án sẽ được cập nhật tại đây.

## [Unreleased]

## [1.6.0] — 2026-08-21

### Added
- **Tini Suite:** Một bộ cài offline tạo hai ứng dụng/shortcut riêng: **Mark Tini — Document Studio** và **Tini OCR — Image to Text & Word**; cả hai dùng chung Electron host, Tini Core, Python runtime và model store.
- **Tini OCR thực tế:** Nhập/xếp lại nhiều ảnh JPG/PNG, tiền xử lý an toàn, OCR Việt–Anh bằng EasyOCR offline, overlay vùng chữ/confidence, sửa kết quả và xuất TXT/Markdown/DOCX editable hoặc DOCX giữ ảnh.
- **DOCX chỉnh sửa được:** Luồng PDF đi qua Docling như trước, sau đó nội dung Markdown có cấu trúc/đã review được chuyển thành heading, đoạn, danh sách, bảng và code Word native. Hai lựa chọn Word nằm ngay dưới nút **Thêm file** ở sidebar.
- **Branding:** Nhập ba icon chính thức do người dùng cung cấp; loại nền đen ngoài Mark Tini/Tini OCR thành alpha trong suốt và tạo bộ `.ico` 7 kích thước cho installer cùng hai product shortcut.

### Changed
- **Tini Core:** Hai product dùng chung lock/session/lease, crash recovery và last-client shutdown; Docling, OCR và export nặng dùng scheduler chung.
- **Hiệu năng backend:** OCR vùng và Tini OCR dùng chung một EasyOCR singleton được warm-up cùng Core, loại hai model instance trùng và tránh warm-up song song tranh RAM. DOCX editable tái sử dụng kết quả Docling hiện có nên không chạy ML lần hai.
- **Installer:** Shortcut chỉ được tạo bởi NSIS, không còn chạy PowerShell mỗi lần mở app; không tạo shortcut Tini Suite thứ ba và không gọi auto-update/GitHub khi khởi động offline.

### Fixed
- **PDF-to-DOCX:** Sửa trải nghiệm chỉ tạo ảnh toàn trang không thể biên soạn; mode này vẫn còn dưới nhãn rõ **DOCX giống PDF (dạng ảnh)** khi người dùng cần giữ bố cục tuyệt đối.
- **Quality:** 109 backend tests, lint/build và 12 Electron E2E đạt, gồm PDF→Docling→DOCX editable, OCR Việt thật, export DOCX và hai app mở đồng thời/tự phục hồi Core.

## [1.5.0] — 2026-08-21

### Added
- **Backend:** Thêm route `POST /api/export/pdf-to-word` và dịch vụ `pdf_to_word_service.py`, render tuần tự toàn bộ trang PDF ở 180 DPI thành PNG lossless rồi nhúng mỗi trang vào một section Word đúng kích thước/hướng. Văn bản, công thức, sơ đồ khối và hình ảnh giữ nguyên hình thức như PDF; nội dung trong DOCX là ảnh toàn trang nên không chỉnh sửa từng chữ.
- **Frontend:** Thêm nút **Xuất Word giống PDF** trên toolbar. Có thể xuất PDF đang mở hoặc tự khôi phục PDF gốc đã lưu trong lịch sử, hiển thị trạng thái xử lý và thời gian chờ phù hợp với tài liệu dài.
- **Electron:** Thêm bridge lưu Word chuyên dụng và hộp thoại **Lưu thành**, cho phép chọn trực tiếp ổ USB. Tên file/đuôi `.docx` và dữ liệu được kiểm tra trước khi main process ghi file.

### Changed
- **Reliability:** Các lượt xuất Word được tuần tự hóa để nhiều PDF lớn không tranh bộ nhớ; upload/output tạm được dọn trên mọi trạng thái và file DOCX phía backend được xóa ngay sau khi gửi xong.
- **Tests:** Tăng lên 94 backend tests và 6 Electron E2E. Bổ sung kiểm tra PDF hai trang dọc/ngang, số section/ảnh neo, kích thước trang, token/API security, lưu native và so sánh ảnh nhúng với PDF nguồn từng pixel.

## [1.4.1] — 2026-08-21

### Fixed
- **Frontend:** Sửa các nút toolbar bị ép co, xuống chữ từng dòng và chồng lên nhau khi thu nhỏ cửa sổ. Toolbar giờ tự xuống hàng theo nguyên cụm, tự tăng chiều cao và giữ nhãn nút trên một dòng.
- **Frontend:** Sửa hai ô **Ngôn ngữ OCR**/**Chế độ bảng** tràn hoặc dính nhau khi Sidebar hẹp; các ô được giới hạn trong cột và tự chuyển thành một cột khi chiều rộng Sidebar dưới 260 px.
- **Frontend:** Nút tài liệu gốc giờ luôn hiển thị. Khi chưa có liên kết nguồn, nút mang nhãn **Chọn tài liệu gốc** để người dùng chọn lại PDF/DOCX/PPTX/HTML thay vì biến mất.
- **Tests:** Thêm Electron E2E ở cửa sổ 820×700, đo trực tiếp vị trí control để chặn tái diễn chồng lấn/tràn ngang; đồng thời làm test conversion dùng tên file duy nhất để không đạt giả từ autosave cũ.

## [1.4.0] — 2026-08-21

### Added
- **Frontend:** Thêm nút **Chọn cả thư mục** để xếp hàng toàn bộ tệp PDF, DOCX, PPTX và HTML trong thư mục/các thư mục con. Hàng đợi hiển thị rõ `[tệp hiện tại/tổng số]`, bỏ qua định dạng không hỗ trợ và tổng kết số tệp thành công.
- **Backend/Frontend:** Lưu bản sao tài liệu gốc cùng mục lịch sử và thêm nút **Mở tài liệu gốc**. PDF được khôi phục ngay trong trình xem sau khi mở lại ứng dụng; mục lịch sử cũ chưa có bản sao sẽ yêu cầu người dùng chọn lại đúng định dạng nguồn.

### Changed
- **Backend:** PDF được xử lý theo cụm tối đa 8 trang và batch ML được giảm từ 4 xuống 1 để hạ đỉnh RAM. Cụm lỗi tự chia đôi; trang đơn vẫn lỗi được raster hóa với giới hạn 2.200 px rồi OCR lại.
- **Frontend:** Batch nhiều tài liệu tiếp tục chạy tuần tự có chủ đích để không cho nhiều pipeline Docling tranh bộ nhớ trên máy người dùng.
- **Frontend:** Khung **Vùng đã trích xuất** có tay nắm kéo dọc, hỗ trợ bàn phím và nhớ chiều cao đã chọn; từng ô kết quả cũng có thể kéo cao/thấp riêng.

### Fixed
- **Backend:** Sửa nguyên nhân thật khiến PDF bộ 600 câu hỏi (128+ trang) chỉ xuất đến câu 195/trang 44. Docling đã báo `std::bad_alloc` và trả `partial_success`, nhưng ứng dụng cũ bỏ qua trạng thái này rồi lưu kết quả thiếu như hoàn tất. Bản mới kiểm tra đủ số trang và tuyệt đối không ghi lịch sử thành công nếu vẫn còn trang lỗi.
- **Backend/Frontend:** Sửa OCR vùng khoanh nhỏ bỏ sót chữ bằng pipeline EasyOCR chuyên dụng, phóng đại ảnh và dùng ngưỡng nhận dạng phù hợp với chữ nhỏ; đồng thời giữ tọa độ kéo đồng bộ để thao tác khoanh nhanh không bị bỏ lỡ.
- **Frontend:** Sửa nút mở tài liệu gốc trước đây trỏ nhầm tới ô chọn Markdown và sửa luồng metadata bị đứt giữa hàng đợi chuyển đổi với bộ xuất Markdown.
- **Frontend:** Đồng bộ nhãn phiên bản trong Sidebar từ giá trị cũ 1.2.0 lên 1.4.0 và cập nhật hướng dẫn cho PDF dài/batch thư mục.

## [1.3.2] — 2026-08-20

### Changed
- **Packaging:** Đồng bộ metadata phiên bản và build lại bộ cài Windows để phân phối ngoại tuyến đầy đủ các bản sửa lỗi của v1.3.1 trong installer `Mark Tini Setup 1.3.2.exe`.

### Fixed
- **Frontend:** Sửa lỗi kiểm tra React 19 ở thao tác kéo giãn Sidebar do đọc `ref.current` trong lúc render; dùng state hiển thị riêng để tắt transition trong khi kéo mà không thay đổi hành vi người dùng.
- **Backend/Electron:** Sửa tích hợp Ollama không thể kích hoạt trong bản đóng gói vì `DOCUMARK_OLLAMA_MODEL` mặc định để trống và app không khởi động service đã cài. Bản mới mặc định dùng `qwen2.5:3b`, vẫn cho phép override, và Electron tự khởi động Ollama theo yêu cầu khi người dùng xác minh nội dung.
- **Frontend:** Thay thông báo cụt "Cần Ollama đang chạy" bằng hướng dẫn phân biệt OpenAlex online với đánh giá AI local, kèm nút mở trang cài Ollama chính thức và sao chép chính xác lệnh tải model.

## [1.3.1] — 2026-08-20

### Fixed
- **Frontend:** Sửa lỗi không có nút "Mở file gốc" khi mở lại ứng dụng với file Markdown đã trích xuất — thêm nút trên toolbar hiển thị tên file PDF gốc (từ metadata `<!-- Source file: ... -->` nhúng trong Markdown) để người dùng chọn lại file PDF để trích xuất lại.
- **Frontend:** Tăng timeout tạo tác vụ từ 120 giây lên **10 phút** (600 giây), cùng timeout từng lần polling job status/result từ 10s lên 30s. Thay đổi này giúp kết nối ổn định hơn nhưng chưa xử lý lỗi native `std::bad_alloc` của PDF dài; nguyên nhân đó được sửa đầy đủ ở v1.4.0.

## [1.3.0] — 2026-08-20

### Changed
- **Rebrand:** Đổi tên sản phẩm từ "DocuMark AI" thành "Mark Tini" (phát triển bởi DHSystem, 2026) — cập nhật `productName`/`appId`/`name` trong `package.json`, tiêu đề cửa sổ Electron, toàn bộ UI, API title và README. `appId` đổi từ `com.dhsystem.documark-ai` thành `com.dhsystem.marktini`, kéo theo thư mục `userData` production chuyển sang `%APPDATA%\Mark Tini\` (dữ liệu cũ dưới tên "DocuMark AI" không tự động chuyển).
- **Frontend:** Bỏ khung hiển thị văn bản gốc trong `TranslationPanel` — kết quả dịch giờ chỉ hiển thị bản dịch (kèm badge chiều dịch/lĩnh vực), không lặp lại đoạn văn bản gốc mà người dùng vừa tự bôi đen ngay phía trên, giảm chiều cao panel không cần thiết.

### Added
- **Backend:** Bật nhận diện công thức toán/lý/hóa (xuất LaTeX `$...$`) và khối mã nguồn khi convert PDF, dùng model `CodeFormulaV2` chạy cục bộ (`do_formula_enrichment`, `do_code_enrichment` trong `docling_service.py`).
- **Packaging:** Thêm model `code_formula` vào danh sách tải của `prepare-offline-bundle.ps1`.
- **Backend:** Thêm route `POST /api/verify-citation` và `citation_service.py` — tra cứu nguồn trích dẫn theo tiêu đề/tác giả qua OpenAlex API (miễn phí, không cần key), kèm đánh giá mức độ phù hợp mang tính **tham khảo** (advisory-only) từ Ollama cục bộ nếu được cấu hình (`DOCUMARK_OLLAMA_URL`/`DOCUMARK_OLLAMA_MODEL`). Đây là tính năng đầu tiên của Mark Tini cần kết nối internet — chỉ chạy khi người dùng chủ động bấm nút cho một đoạn đã chọn, không ảnh hưởng các luồng offline-first hiện có.
- **Frontend:** Thêm nút "Xác minh trích dẫn" trên toolbar — bôi đen một đoạn trích dẫn/tuyên bố trong bản xem trước Markdown để kiểm tra. Kết quả hiển thị ở `CitationVerificationPanel` với badge độ khớp nguồn (khớp/có thể khớp/không tìm thấy) và phần đánh giá nội dung AI luôn kèm cảnh báo độ tin cậy thấp, tách biệt rõ với kết quả tra cứu nguồn.
- **Backend:** Thêm route `POST /api/translate` và `translation_service.py` — dịch hai chiều Anh↔Việt cho đoạn văn bản đã bôi đen bằng model NMT cục bộ (`VietAI/envit5-translation`, chọn chiều qua tiền tố `"en: "`/`"vi: "` trên cùng một checkpoint), chạy hoàn toàn offline sau khi model đã được tải (không cần internet, khác với xác minh trích dẫn). Công thức LaTeX (`$...$`, `$$...$$`) được che tạm trước khi dịch và khôi phục nguyên vẹn sau đó; chiều dịch không hợp lệ trả về lỗi 400 rõ ràng.
- **Backend:** Thêm tùy chọn lĩnh vực thuật ngữ khi dịch (`translation_glossaries.py`) — 3 từ điển offline theo lĩnh vực (Khoa học máy tính/AI-ML, Toán-Lý-Hóa, Kinh tế/Khoa học xã hội), ép model dùng đúng thuật ngữ chuẩn của lĩnh vực đó thay vì bản dịch chung chung/không nhất quán của model, dùng chung cơ chế che/khôi phục với công thức toán. Lĩnh vực không hợp lệ hoặc bỏ trống chỉ tắt tính năng này (không ảnh hưởng bản dịch chính). Nếu việc khôi phục công thức hoặc thuật ngữ không khớp (placeholder bị thiếu/lặp/hỏng), tự động dịch lại văn bản gốc chưa che thay vì trả về kết quả bị hỏng.
- **Packaging:** Thêm bước tải model dịch `VietAI/envit5-translation` vào `prepare-offline-bundle.ps1` (qua `huggingface_hub.snapshot_download`, chỉ lấy các file cần thiết, bỏ qua bản TF/Flax dư thừa) và mở rộng smoke test offline để dịch thử một câu ngay sau khi đóng gói, tránh phát hiện lỗi model muộn ở lần bấm nút đầu tiên của người dùng.
- **Frontend:** Thêm nút "Dịch đoạn đã chọn" trên toolbar, dùng chung cơ chế bôi đen với nút xác minh trích dẫn, kèm 2 ô chọn chiều dịch (Anh→Việt/Việt→Anh) và lĩnh vực thuật ngữ ngay cạnh nút. Kết quả hiển thị ở `TranslationPanel` với văn bản gốc và bản dịch xếp chồng, badge chiều dịch và lĩnh vực (nếu có) trên mỗi kết quả, có thể bỏ qua từng kết quả.
- **Backend:** Thêm kiểm tra nội dung file upload theo magic byte/container thật (PDF/PNG/JPEG/TIFF/BMP theo header, DOCX/PPTX theo member bắt buộc bên trong zip `word/document.xml`/`ppt/presentation.xml`) thay vì chỉ dựa vào đuôi file như trước — file đổi tên/giả mạo đuôi bị chặn ngay với lỗi 415 rõ ràng và không để lại file trên đĩa, thay vì trôi xuống tận Docling mới báo lỗi.
- **Frontend:** Chuyển bản tự lưu (autosave) từ `localStorage` sang IndexedDB (`autosaveDb.ts`) — bỏ giới hạn dung lượng vài MB của `localStorage` vốn khiến tài liệu lớn tự lưu thất bại âm thầm (chỉ báo lỗi "vượt giới hạn bộ nhớ"). Tự động di chuyển bản tự lưu cũ từ `localStorage` sang IndexedDB một lần duy nhất ở lần mở đầu tiên sau khi cập nhật, không mất dữ liệu đang soạn dở.
- **Frontend:** Code-split trình soạn thảo (`@uiw/react-md-editor`) và trình xem PDF (`PdfViewerBox`/`react-pdf`) bằng `React.lazy`/`Suspense` thay vì import tĩnh — bundle chính khi khởi động giảm từ ~1,77 MB xuống ~294 KB (đo qua `vite build`), phần trình xem PDF (~426 KB) giờ chỉ tải khi thực sự mở một file PDF.
- **Packaging:** Thêm `backend/requirements.lock.txt` khóa hash (hash-locked) cho toàn bộ cây dependency transitive (124 package), sinh và tự kiểm tra bằng `scripts/lock-requirements.ps1` + `scripts/generate_lock.py` (đóng băng đúng phiên bản đã qua test trong `docling-env`, không resolve mới). `prepare-offline-bundle.ps1` giờ cài đặt qua `pip install --require-hashes` từ file lock này thay vì `requirements.txt` gốc, dừng ngay nếu thiếu file lock hoặc phát sinh transitive dependency chưa được khóa hash — đóng gap "Dependency reproducibility" nêu trong AUDIT.md.
- **Backend:** Thêm log rotation (`RotatingFileHandler`, tối đa 5 MB × 5 file backup, `logging_utils.py`) ghi ra `data/logs/backend.log` thay vì chỉ in ra console như trước, cùng correlation ID cho từng request — một ID ngắn được gán mỗi request (trả về qua header `X-Request-ID`), tự động gắn vào mọi dòng log phát sinh trong lúc xử lý request đó (qua `contextvars`, middleware ASGI thuần) để tra cứu nhanh theo một ID khi người dùng báo lỗi. Mức log chỉnh được qua biến môi trường `DOCUMARK_LOG_LEVEL`. Đóng phần rotation/correlation ID trong gap "Observability" nêu ở AUDIT.md; màn hình diagnostics để export support bundle vẫn chưa làm.
- **Frontend:** Thêm hạ tầng kiểm thử end-to-end bằng Playwright (`@playwright/test`, điều khiển trực tiếp app Electron đã build qua `_electron`, không mock tầng nào) — 2 test: shell chính hiển thị đúng không crash, và test đường đi chính (golden path) thật: tải PDF mẫu thật → đợi backend Python thật + Docling khởi động xong → convert thật → xác nhận nội dung trích xuất hiển thị đúng trong editor. Chạy qua `npm run test:e2e`. Tự loại biến môi trường `ELECTRON_RUN_AS_NODE` (có thể bị rò từ terminal tích hợp của VS Code) trước khi launch app test, tránh test fail giả do app bị chạy nhầm ở chế độ Node thuần thay vì chế độ ứng dụng Electron. Hạ tầng test frontend tự động đầu tiên của dự án (trước đây chỉ có backend test).
- **Backend:** Thêm bước dọn file output mồ côi lúc khởi động (`_cleanup_orphaned_outputs` trong `main.py`) — nếu backend crash/bị kill đúng lúc giữa việc ghi xong file Markdown và ghi mục lịch sử tương ứng (hoặc bị kill giữa lúc ghi file tạm của atomic-write), file đó trước đây nằm lại vĩnh viễn trên đĩa, không cách nào xem hay xóa qua UI. Giờ mọi file trong `data/outputs/` không có mục lịch sử tương ứng sẽ tự động bị xóa ở lần khởi động kế tiếp, đối chiếu trực tiếp với `history.json` hiện có thay vì cần thêm journal/trạng thái mới. Cơ chế dọn upload dở dang (`_cleanup_stale_uploads`) đã có sẵn từ trước nhưng chưa từng có test; bổ sung 4 test cho cả hai hàm ở `test_startup_cleanup.py`.
- **Frontend:** Sidebar giờ thu gọn/mở rộng được (`Sidebar.tsx`) — nút thu gọn còn lại dải icon 56px, và kéo dải viền phải để chỉnh độ rộng tự do từ 200-420px (mặc định 256px). Trạng thái (đang thu gọn hay không, độ rộng đã chọn) lưu vào `localStorage` (`documark_sidebar_collapsed`/`documark_sidebar_width`) nên giữ nguyên qua các lần mở app. Đã verify end-to-end qua Playwright điều khiển app Electron thật: thu gọn còn đúng 56px, mở rộng lại đúng 256px, kéo giãn +100px ra đúng 356px, và cả hai giá trị đều đọc lại đúng từ `localStorage` sau khi thao tác.

### Fixed
- **Backend:** Sửa lỗi tác vụ convert trả về HTTP 500 không rõ nguyên nhân khi hàng đợi job đã đầy, thay vì thông báo 503 thân thiện đã dự định từ trước — đoạn xử lý `JobCapacityError` bị đặt sai vị trí (không bao giờ có thể chạy tới) sau một lần refactor trước đó. Đã chuyển xử lý đến đúng nơi gọi `job_manager.submit()` và thêm regression test ở tầng API route để tránh tái diễn.
- **Electron:** Sửa lỗi nghiêm trọng khiến app **không mở được sau khi cài đặt** (crash ngay lập tức với "Uncaught Exception... Calling `require` for 'fs' in an environment that doesn't expose the `require` function"). Nguyên nhân: `package.json` có `"type": "module"` nên `vite-plugin-electron` build main process ra ESM, nhưng `electron-updater` kéo theo `graceful-fs` (CommonJS) — Rolldown (bundler mới của Vite 8) không thể chuyển các lời gọi `require()` nội bộ của gói này sang `import` tĩnh, nên chèn một shim gọi `require` thật ở runtime, thứ không tồn tại trong file `.js` chạy dưới ESM. Đã sửa bằng cách build riêng main process ra CommonJS thật (`dist-electron/main.cjs`, qua `rollupOptions.input`/`output.format: 'cjs'` thay vì entry mode mặc định của plugin), đồng thời bỏ `import.meta.url` (không tương thích CJS) khi tính `__dirname`. Đã verify lại bằng cài đặt thật, mở app thật, và convert tài liệu thật end-to-end sau khi fix.
- **Electron:** Sửa crash ngay khi khởi động ở chế độ dev (`npm run dev`/`vite`, qua `vite-plugin-electron`): `const { autoUpdater } = electronUpdater` ở top-level module đọc property getter lazy của `electron-updater` ngay lúc import, khiến nó dựng `NsisUpdater` và gọi `app.getVersion()` trước khi Electron `app` sẵn sàng theo đúng cách `electron-updater` cần trong môi trường dev launcher này → `TypeError: Cannot read properties of undefined (reading 'getVersion')`, crash toàn bộ tiến trình. Bản đóng gói thật không gặp lỗi này (đã verify trước đó) vì `app` đã sẵn sàng đầy đủ khi code này chạy. Đã sửa bằng cách không destructure `autoUpdater` ở module scope nữa — chỉ đọc `electronUpdater.autoUpdater` ngay tại nơi dùng, trong khối `if (app.isPackaged)` đã có sẵn (nơi duy nhất tính năng này có ý nghĩa) và trong `try/catch` đã có sẵn. Đã verify lại bằng cách chạy `vite` dev mode thật: lỗi không còn xuất hiện.
- **Backend:** Sửa lỗi trích xuất vùng PDF (Region OCR, mục 3.4) trả về placeholder `<!-- image -->` thay vì văn bản nhận dạng thật. Nguyên nhân: với input dạng ảnh (`InputFormat.IMAGE`), `export_to_markdown()` của docling đôi khi phân loại nhầm toàn bộ vùng ảnh đã cắt thành một cluster loại "Picture" (lỗi của model layout khi ảnh đầu vào chỉ chứa đúng một vùng nhỏ, không có ngữ cảnh trang đầy đủ), nên xuất ra placeholder ảnh thay vì nội dung. Đã sửa bằng cách đọc thẳng `result.document.texts` cho input dạng ảnh thay vì đi qua `export_to_markdown()`, bỏ qua bước phân loại cluster sai. Lỗi này cũng khiến tính năng "Tìm trên web" từ nội dung trích xuất bị hỏng theo (tìm placeholder thay vì nội dung thật) — cùng được sửa vì dùng chung dữ liệu. Đã verify end-to-end qua Playwright điều khiển app Electron thật: vẽ cả vùng chọn nhỏ (đo tọa độ thật bằng `pypdfium2` để trúng đúng chữ) lẫn vùng lớn trên PDF mẫu, cả hai đều trả về đúng văn bản gốc, không còn placeholder.

## [1.2.0] — 2026-08-18

### Security
- Đóng Windows path traversal bằng UUID validation và không còn CORS wildcard.
- Thêm API token theo phiên, trusted-origin bootstrap và Electron preload bridge tối thiểu.
- Giới hạn upload 100 MiB, allowlist định dạng và cleanup file tạm trên mọi terminal state.

### Reliability
- Thêm single-worker job queue, trạng thái/progress backend thật, bounded capacity và cancel semantics trung thực.
- Ghi output/history nguyên tử; tự cleanup output khi lỗi, hủy, history eviction hoặc `record_history=false`.
- Sửa Markdown table parser cho escaped pipe/inline code; bỏ bold-row heuristic và thêm content-preservation fallback.
- Thêm 19 regression/unit tests cho API, queue, storage và Markdown correctness.

### Packaging
- Thay virtualenv không portable bằng Python embeddable runtime và model bundle Docling/EasyOCR cục bộ.
- Thêm offline preflight/smoke test và production data path dưới Electron `userData`.
- Khóa Docling/EasyOCR, bỏ dependency `sharp` không dùng; production npm audit còn 0 vulnerability.

### Known release gate
- Cần chạy installer trên máy Windows sạch trước khi phát hành công khai.
- Runtime data cũ đã được Git theo dõi cần cleanup/rewrite riêng sau khi chủ sở hữu phê duyệt.

## [1.1.0] — 2026-05-18

### Fixed
- **CRITICAL:** `markdown_cleaner.py` — Nội dung bảng DOCX bị mất hoàn toàn do 3 bugs:
  - `_clean_tables()`: Fallback khi structured list = empty giờ giữ nguyên bảng gốc thay vì drop silently
  - `_table_to_structured_list()`: Sub-header heuristic chỉ nhận khi ALL non-empty cells là bold (trước đây: 70%)
  - `_count_empty_columns()`: Check tất cả rows kể cả header row (trước đây bỏ qua header)
- **Enhancement:** `docling_service.py` — Thêm `InputFormat.DOCX: WordFormatOption()` tường minh với comment giải thích DOCX pipeline (SimplePipeline + MsWordDocumentBackend)

### Added
- Principle "never drop content silently" vào SYSTEM-RULES — mọi fallback trong markdown_cleaner phải preserve content

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
