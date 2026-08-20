# Phase 11 — Responsive Window UX

## Problem

Toolbar uses a fixed 64 px single row while its controls exceed the available main-pane width. Flex shrink then breaks labels into vertical text and lets controls visually collide. Sidebar conversion selects similarly exceed narrow grid columns.

## Decision

- Wrap toolbar controls as indivisible groups and let the toolbar grow vertically.
- Keep action labels on one line and allow the main flex pane to shrink correctly.
- Constrain Sidebar grid children and switch to one column below 260 px.
- Keep the original-document action visible even without source metadata.
- Verify geometry in the real Electron renderer at 820×700.

## Architecture Compatibility

Presentation-only change. No API, persistence, conversion pipeline or security boundary changes.

## Acceptance Criteria

- No toolbar action overlaps or leaves its container at 820×700.
- Sidebar OCR/table controls never overlap or cause horizontal overflow.
- Original-document action is always visible.
- Lint, production build, React Doctor changed-scope and Electron E2E pass.
