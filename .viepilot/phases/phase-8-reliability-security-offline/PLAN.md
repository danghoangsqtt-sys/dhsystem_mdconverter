# PLAN — Phase 8

## Chiến lược

Thực hiện theo thứ tự giảm rủi ro: khóa ranh giới API trước, sau đó bảo toàn dữ liệu, đưa conversion vào queue, cuối cùng mới đổi packaging. Mỗi task có test độc lập và giữ compatibility cho endpoint cũ trong v1.2.

## Task map

| Task | Nội dung | Phụ thuộc | Quality gate |
|---|---|---|---|
| T8.1 | API security, validation, resource limits | — | API unit tests |
| T8.2 | Markdown content-preservation | — | Cleaner regression tests |
| T8.3 | Job queue, real progress, cancel semantics | T8.1 | Backend + frontend tests/build |
| T8.4 | Durable storage/history cleanup | T8.1 | Storage tests |
| T8.5 | Portable runtime + offline models + Electron bridge | T8.1, T8.4 | Packaging preflight |
| T8.6 | Version/docs/state/dependency cleanup | T8.1–T8.5 | Full quality gate |

## File-level plan

### Backend

- `backend/src/config.py`: environment parsing, trusted origins, token, upload limits, storage/model paths.
- `backend/src/main.py`: API router/dependencies, UUID validation, job endpoints, compatibility endpoint.
- `backend/src/services/job_service.py`: in-memory job registry, single-worker semaphore, lifecycle/cancel/result cleanup.
- `backend/src/services/history_service.py`: atomic write và trả danh sách entry bị evict.
- `backend/src/services/docling_service.py`: artifacts path, offline mode, converter execution lock.
- `backend/src/services/markdown_cleaner.py`: safe parser và preservation guard.
- `backend/tests/`: regression tests cho API, cleaner, history và job state.

### Frontend/Electron

- `frontend/src/services/api.ts`: session token, job create/poll/cancel/result.
- `frontend/src/App.tsx`: bỏ simulated timers, dùng trạng thái job thật.
- `frontend/src/components/ProcessingStatus.tsx`: trạng thái queue/cancel và nút hủy.
- `frontend/src/types.ts`: canonical processing stages.
- `frontend/electron/main.ts`: random session token, userData, portable runtime, offline environment.
- `frontend/electron/preload.ts`, `frontend/src/electron.d.ts`: bridge tối thiểu.
- `frontend/package.json`: v1.2.0, offline preflight, bỏ dependency không dùng.

### Build/docs

- `scripts/prepare-offline-bundle.ps1`: chuẩn bị/validate runtime và models.
- `scripts/check-repository-hygiene.ps1`: fail khi runtime data bị tracked.
- `README.md`, `CHANGELOG.md`, `.viepilot/*`: đồng bộ kiến trúc, version và vận hành.

## Verification commands

```powershell
docling-env\Scripts\python.exe -m unittest discover -s backend\tests -v
docling-env\Scripts\python.exe -m compileall -q backend\src backend\run_server.py
cd frontend
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
powershell -ExecutionPolicy Bypass -File ..\scripts\prepare-offline-bundle.ps1 -ValidateOnly
```

## Rủi ro và phương án giảm thiểu

- **Docling không hỗ trợ hard cancel trong thread:** mô tả trạng thái `cancelling` trung thực và bỏ kết quả; subprocess isolation để milestone sau.
- **Runtime/model rất lớn:** preflight không tự commit binary, chỉ validate/build local assets; source control giữ script và manifest.
- **Working tree đang có nhiều thay đổi:** chỉ patch phần liên quan, không reset/revert, không tự commit hoặc rewrite history.
- **Endpoint migration:** giữ `/api/convert` trong v1.2 và chuyển frontend sang `/api/jobs`.
