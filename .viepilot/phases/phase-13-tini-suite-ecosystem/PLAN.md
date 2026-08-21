# PLAN — Phase 13: Tini Suite Ecosystem

## 1. Chiến lược thực hiện

Triển khai theo chiều dọc, giữ Mark Tini chạy được ở cuối mỗi task. Không tách thành hai Electron project hoặc hai Python runtime. Điểm kiểm soát quan trọng nhất nằm trước khi thêm UI OCR: phải chứng minh shared host/shared Core có thể chạy hai product đồng thời và nâng cấp không mất dữ liệu.

## 2. Thứ tự task

| Thứ tự | Task | Kết quả | Phụ thuộc |
|---:|---|---|---|
| 1 | [T13.1](T13.1-suite-host-product-boundaries.md) | Shared host và ranh giới hai product | Không |
| 2 | [T13.2](T13.2-shared-tini-core-lifecycle.md) | Một Core dùng chung, lifecycle an toàn | T13.1 |
| 3 | [T13.3](T13.3-tini-ocr-pipeline.md) | Pipeline ảnh → review → text/Markdown/DOCX | T13.2 |
| 4 | [T13.4](T13.4-dual-entry-offline-installer.md) | Một installer, hai shortcut, không duplicate runtime/model | T13.1–T13.3 |
| 5 | [T13.5](T13.5-migration-quality-release-gates.md) | Migration, benchmark, regression và clean-machine gates | T13.1–T13.4 |

## 3. Milestone và control point

### M1 — Product shell

- Mark Tini chạy qua `--product=mark-tini` mà không thay đổi hành vi.
- Tini OCR có shell riêng, navigation riêng và empty state.
- Control point: so sánh E2E Mark Tini trước/sau migration.

### M2 — Shared Core

- Concurrent launch chỉ sinh một Core.
- Client register/heartbeat/graceful exit và stale recovery đạt integration test.
- Control point: đóng/crash từng app theo mọi thứ tự, không mất job và không để orphan.

### M3 — OCR vertical slice

- Một ảnh PNG/JPG đi qua validate, preprocessing, OCR, review và xuất TXT/DOCX.
- Multi-image/folder và cancel chạy qua cùng contract.
- Control point: benchmark RapidOCR candidate với EasyOCR baseline trước khi khóa engine mặc định.

### M4 — Offline installer

- Hai shortcut chạy đúng product và dùng một resource tree.
- Upgrade v1.5.0 giữ dữ liệu.
- Control point: duplicate hash audit và bundle delta report.

### M5 — Release candidate

- Toàn bộ regression, security, OCR benchmark, clean-machine offline và USB save smoke đạt.
- Chỉ tại đây mới bump package/runtime version thành v1.6.0.

## 4. Test matrix tối thiểu

| Nhóm | Trường hợp bắt buộc |
|---|---|
| Launch | Mark trước/OCR sau; OCR trước/Mark sau; mở đồng thời; Core crash; stale descriptor |
| OCR input | JPG/PNG; EXIF rotate; ảnh nghiêng; perspective; bóng/chói; ảnh hỏng; decompression bomb |
| Batch | 1, 10 và 100 ảnh; reorder; một file lỗi giữa batch; cancel khi preprocessing/recognizing |
| Output | TXT, Markdown, DOCX editable, DOCX image-faithful; đường dẫn Unicode; lưu vào USB |
| Upgrade | Fresh install; upgrade v1.5.0; uninstall; dữ liệu và shortcut |
| Regression | 94+ backend tests hiện có, frontend lint/build, React Doctor changed scope, Electron E2E hiện có |
| Offline | Máy sạch, network disabled, không Python/Node/Ollama, model không tải ngầm |

## 5. Quy tắc version và phát hành

- `1.5.0` là phiên bản đang phát hành trong toàn bộ giai đoạn implementation.
- `1.6.0` là target milestone và chỉ được ghi vào `frontend/package.json`, UI metadata và installer sau khi T13.5 đạt.
- Không tạo GitHub Release. Artifact setup được chuẩn bị để người dùng lưu/phân phối qua USB.
- Commit nên theo từng task, không trộn runtime/model binary chưa được audit vào source commit.

## 6. Lệnh xác minh dự kiến

```powershell
python -m pytest backend/tests
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e
powershell -ExecutionPolicy Bypass -File scripts/validate-tini-suite.ps1
```

Tên script cuối là deliverable dự kiến của T13.4/T13.5; không được coi là đang tồn tại trước khi task tương ứng thực hiện.

## 7. Điểm dừng/rollback

- Nếu shared host làm E2E Mark Tini hồi quy, dừng ở T13.1 và khôi phục product selection layer, không tiến sang OCR.
- Nếu RapidOCR không vượt gate hoặc wheel/model không phân phối được, ship Tini OCR bằng EasyOCR + preprocessing đã benchmark; ghi rõ engine fallback.
- Nếu dual-entry NSIS không ổn định, vẫn giữ một resource host nhưng tạo launcher nhỏ riêng; không nhân đôi toàn bộ Electron/runtime.
- Nếu migration userData không chứng minh idempotent, không cho phép cài đè v1.5.0.
