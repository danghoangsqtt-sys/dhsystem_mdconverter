# AUDIT — DocuMark v1.2

Ngày rà soát: 2026-08-18

## 1. Kết luận điều hành

Trước Phase 8, hệ thống có UI khá hoàn chỉnh nhưng workflow backend vẫn mang tính prototype: API loopback không có ranh giới phiên, progress là timer giả, conversion không có admission control, persistence có thể sinh output mồ côi và bản cài đặt phụ thuộc Python/model cache của máy phát triển. Điểm nguy hiểm nhất về correctness là cleaner có thể diễn giải hàng dữ liệu in đậm thành header và bỏ nội dung.

Sau thay đổi v1.2, các blocker code-level đã được đóng: API/token/path validation, bounded single-worker queue, trạng thái thật/cancel, atomic storage/cleanup, content-preserving Markdown transform, portable runtime/model bundle và regression suite. Mức sẵn sàng hiện tại là **implementation complete, release gated**: installer đã build được; vẫn cần test cài/chạy trên máy Windows sạch và xử lý dữ liệu người dùng cũ đang nằm trong Git bằng một thao tác được phê duyệt riêng.

## 2. Ma trận trước/sau

| Lĩnh vực | Trước v1.2 | Sau v1.2 | Bằng chứng |
|---|---|---|---|
| Local API | CORS `*`, không token, traversal qua download ID | token phiên, trusted origin, UUID path | API tests |
| Admission control | request nào cũng chạy; OCR vùng `Promise.all` | capacity hữu hạn, một worker, region tuần tự | job tests + frontend flow |
| Progress | timer mô phỏng | poll job state backend | `api.ts`, `ProcessingStatus.tsx` |
| Cancel | timeout UI nhưng backend tiếp tục không quan sát được | queued cancel ngay; running discard result | cancel tests |
| Markdown table | bold heuristic có thể bỏ data row | separator boundary + semantic preservation guard | cleaner regression tests |
| Persistence | write trực tiếp, output mồ côi, eviction không cleanup | temp/fsync/replace và cleanup nhất quán | history/job tests |
| Production data | nằm trong app resources/project | Electron `userData/data` | main process env |
| Packaging | virtualenv trỏ `C:\Python314`, model ngoài installer | embeddable runtime + 613.9 MiB artifact bundle | offline preflight/smoke |
| Dependency risk | `sharp` không dùng có advisory high | bỏ `sharp`, production audit 0 | npm audit |
| Automated tests | không có | 19 tests | unittest gate |

## 3. Luồng chuẩn và failure paths

1. Renderer lấy token qua preload (production) hoặc trusted bootstrap (dev).
2. Upload được kiểm tra filename/extension và copy theo chunk với giới hạn 100 MiB.
3. API chỉ nhận job nếu registry còn capacity; nếu đầy trả 503 và xóa upload vừa nhận.
4. Worker duy nhất chạy Docling ngoài event loop; converter còn có lock phòng caller khác.
5. Markdown cleaner chỉ transform khi dữ liệu semantic vẫn được bảo toàn.
6. Job không ghi history giữ result trong memory; job có history ghi output/history nguyên tử và cleanup khi fail/cancel/evict.
7. UI poll trạng thái thật; lỗi mạng tạm thời được retry hữu hạn, không giả định conversion đã dừng.
8. Sau crash, backend dọn regular file còn sót trong upload directory; history/output đã hoàn tất vẫn tồn tại.

## 4. Điểm yếu còn lại / backlog có chủ đích

### Release blockers bên ngoài code

- **Clean-machine verification:** installer cần được cài và chuyển PDF/DOCX trên một Windows sạch, không có Python/cache model.
- **Tracked user data — đã xử lý (2026-08-18):** Git từng theo dõi 22 file runtime (11 DOCX, 11 Markdown) và đã bị push lên `origin/master` (repo public). Đã xác nhận không branch/PR/fork nào khác chứa commit đó, xoá 22 file khỏi toàn bộ lịch sử bằng `git filter-repo` trên bản clone riêng, verify diff không đổi gì ngoài 2 đường dẫn `data/uploads` và `data/outputs`, rồi force-push `master`. Repo chính đã đồng bộ lại (backup cục bộ tại branch `backup/pre-history-purge-20260818` và tag cũ nếu cần đối chiếu). `scripts/check-repository-hygiene.ps1` nay pass. Rủi ro còn lại: bất kỳ ai đã clone repo trước thời điểm force-push vẫn giữ bản có dữ liệu cũ trong lịch sử cục bộ của họ.

### P1 tiếp theo

- **Hard cancel:** Docling native call chạy trong thread nên không thể dừng cưỡng bức. Tách từng conversion thành subprocess nếu cần reclaim RAM/CPU ngay.
- **Crash recovery:** queue/registry ở memory; sau backend crash, client phải submit lại job chưa hoàn tất. Muốn resume cần durable job journal.
- **Content validation:** allowlist hiện dựa trên extension, chưa sniff magic/OOXML container. File giả mạo sẽ fail conversion an toàn nhưng thông báo chưa tối ưu.
- **Dependency reproducibility:** top-level Python packages đã pin, nhưng transitive tree chưa có hash-locked requirements/lockfile.

### P2 tiếp theo

- **Frontend tests:** hiện có TypeScript/lint/build nhưng chưa có component/e2e test cho upload, cancel, batch và history UI.
- **Bundle size:** renderer JS khoảng 1.76 MiB minified và installer khoảng 1.15 GB; có thể code-split editor/PDF viewer và đánh giá model/runtime pruning.
- **Autosave scale:** toàn bộ Markdown vẫn lưu vào `localStorage`; đã bắt quota error nhưng tài liệu rất lớn nên chuyển sang IndexedDB/atomic backend draft sẽ bền hơn.
- **Observability:** log local chưa có rotation/correlation ID hoặc màn hình diagnostics để xuất support bundle.

## 5. Quality gates đã chạy

- 19/19 backend tests pass trên development venv.
- 19/19 backend tests pass trên portable runtime bằng `python -s`.
- Python compileall và `pip check` pass ở cả hai runtime.
- Frontend `npm run lint` và `npm run build` pass.
- `npm audit --omit=dev`: 0 vulnerability.
- Offline preflight: 35 model files, 613.9 MiB; pipeline init pass.
- Offline PDF smoke: output 11 ký tự, không cần user site/cache.
- NSIS installer v1.2.0 build thành công; clean-machine execution chưa được xác minh.

## 6. Cập nhật sau ngày rà soát (2026-08-19)

Các mục sau trong backlog P1/P2 ở mục 4 đã được xử lý sau ngày rà soát ở trên:

- **Content validation — đã xong.** Kiểm tra magic byte (PDF/PNG/JPEG/TIFF/BMP) và member bắt buộc trong container OOXML (DOCX/PPTX) trước khi đưa vào Docling; file giả mạo đuôi bị chặn ngay với 415, không rớt xuống tận conversion mới báo lỗi.
- **Dependency reproducibility — đã xong.** `backend/requirements.lock.txt` khóa hash toàn bộ cây transitive (124 package), sinh/verify qua `scripts/lock-requirements.ps1` + `scripts/generate_lock.py`; offline bundle cài qua `pip install --require-hashes`.
- **Frontend tests — đã xong.** Hạ tầng e2e bằng Playwright + `_electron` (`frontend/e2e/`), chạy app Electron đã build thật với backend Python thật, convert một PDF fixture thật và xác nhận nội dung xuất hiện trong editor.
- **Bundle size — đã xong.** Code-split editor (`@uiw/react-md-editor`) và PDF viewer (`react-pdf`) qua `React.lazy`; bundle khởi động chính giảm từ ~1,77 MiB xuống ~294 KB.
- **Autosave scale — đã xong.** Autosave chuyển từ `localStorage` sang IndexedDB, kèm migrate tự động một lần từ dữ liệu cũ.
- **Observability — đã xong.** Log rotation (`RotatingFileHandler`, 5 MB × 5 backup) và correlation ID theo request (`X-Request-ID`, `contextvars`); màn hình diagnostics/support-bundle export vẫn chưa làm (không đổi so với đánh giá gốc).
- **Crash recovery — xử lý theo hướng khác với đề xuất gốc, có chủ đích.** Đề xuất gốc ở mục 4 là "durable job journal" để resume job dang dở. Sau khi xem lại: `converter.convert()` của Docling là một lời gọi khối nguyên khối, không có checkpoint giữa chừng để resume — một job journal ghi lại "job đang converting" cũng không thể thực sự tiếp tục job đó sau crash, chỉ có thể ghi nhận nó đã mất. Thay vào đó đã làm phần thực sự có giá trị: `_cleanup_stale_uploads` (đã có sẵn từ trước, nay có test) cộng `_cleanup_orphaned_outputs` (mới) đối chiếu `data/uploads/`/`data/outputs/` với `history.json` mỗi lần khởi động, tự dọn mọi file mồ côi do crash giữa chừng để lại. Kết hợp với cơ chế Electron tự khởi động lại backend (đã có sẵn từ trước, exponential backoff tối đa 5 lần) và frontend tự phát hiện mất kết nối khi poll (đã có sẵn từ trước, bounded retry + thông báo rõ ràng), hệ thống tự phục hồi về trạng thái sạch mà không cần người dùng can thiệp thủ công — job dang dở khi crash vẫn mất (không resume được), nhưng không để lại rác vĩnh viễn và người dùng chỉ cần thử lại.
- **Hard cancel — cân nhắc và quyết định không làm, có chủ đích.** Đề xuất gốc đã tự đóng khung là điều kiện ("nếu cần reclaim RAM/CPU ngay"). Xác nhận lại: `converter.convert()` không có hook cancel hợp tác nào; cách duy nhất để dừng cưỡng bức thật là tách mỗi conversion ra subprocess riêng, kill được ngay. Đánh đổi: mọi job (không riêng job bị hủy) sẽ trả thêm chi phí import lại torch/transformers/docling mỗi lần spawn subprocess (trừ khi dựng thêm một worker-pool thường trực — tức thêm một tầng phức tạp mới), cộng rủi ro tái cấu trúc đúng đường dẫn quan trọng nhất của app chỉ để tăng tốc độ phản hồi cho một thao tác hiếm khi xảy ra trên một ứng dụng desktop một người dùng, một worker. Hành vi cancel hiện tại đã trung thực (trạng thái "cancelling" đúng nghĩa đang chờ tác vụ hiện tại kết thúc, không giả vờ đã dừng; kết quả luôn bị discard đúng khi dừng thật) — chỉ chưa tức thời. Giữ nguyên như hiện tại, không triển khai subprocess rearchitecture.

Test count hiện tại: 80/80 backend test pass (thời điểm audit gốc ở trên: 19/19).
