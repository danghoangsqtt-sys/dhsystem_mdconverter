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
