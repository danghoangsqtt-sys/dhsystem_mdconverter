# Phase 13 State — Tini Suite Ecosystem

- **Status:** In progress — T13.1 verification control point
- **Released version:** 1.5.0
- **Target version:** 1.6.0
- **Started:** 2026-08-21
- **Owner:** danghoangsqtt-sys
- **Next command:** Close the installed Mark Tini safely, then rerun full Electron E2E

## Task state

| Task | State |
|---|---|
| T13.1 Shared host/product boundaries | In progress — smoke 3/3 pass; full regression waiting for port 8088 |
| T13.2 Shared Tini Core lifecycle | Pending |
| T13.3 Tini OCR pipeline | Pending |
| T13.4 Dual-entry offline installer | Pending |
| T13.5 Migration/quality/release gates | Pending |

## Locked decisions

- Một bộ cài và một shared resource tree.
- Hai product entry độc lập, cùng một Electron host được phép.
- Không Windows Service; Core sống theo client lease/heartbeat.
- Không GitHub Release trong phase này; setup hỗ trợ phân phối bằng USB.
- Version sản phẩm chưa bump cho tới release gate cuối.
