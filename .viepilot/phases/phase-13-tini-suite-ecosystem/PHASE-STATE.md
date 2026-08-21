# Phase 13 State — Tini Suite Ecosystem

- **Status:** In progress — T13.2 shared Tini Core lifecycle
- **Released version:** 1.5.0
- **Target version:** 1.6.0
- **Started:** 2026-08-21
- **Owner:** danghoangsqtt-sys
- **Next command:** Implement T13.2 Core supervisor and global scheduler

## Task state

| Task | State |
|---|---|
| T13.1 Shared host/product boundaries | Complete — lint/build + Electron E2E 8/8 pass |
| T13.2 Shared Tini Core lifecycle | In progress |
| T13.3 Tini OCR pipeline | Pending |
| T13.4 Dual-entry offline installer | Pending |
| T13.5 Migration/quality/release gates | Pending |

## Locked decisions

- Một bộ cài và một shared resource tree.
- Hai product entry độc lập, cùng một Electron host được phép.
- Không Windows Service; Core sống theo client lease/heartbeat.
- Không GitHub Release trong phase này; setup hỗ trợ phân phối bằng USB.
- Version sản phẩm chưa bump cho tới release gate cuối.
