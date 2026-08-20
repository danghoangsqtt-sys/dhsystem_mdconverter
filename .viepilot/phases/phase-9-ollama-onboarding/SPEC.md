# Phase 9 — Ollama Citation Onboarding

## Problem

The citation panel currently says only that Ollama must be running. Packaged builds leave `DOCUMARK_OLLAMA_MODEL` empty, so the local assessment remains disabled even when Ollama and a compatible model are already installed. OpenAlex lookup and local Ollama assessment are also not explained as independent stages.

## Decision

- Keep OpenAlex as the online source-discovery service.
- Use `qwen2.5:3b` as the default local advisory model because it supports Vietnamese and is small enough for ordinary Windows machines; preserve environment overrides.
- Do not embed the 1.9 GB model into the already ~1.99 GB main installer. Treat Ollama as an optional companion and provide actionable first-use guidance.
- Ask Electron to start an existing Windows Ollama installation on demand. Never expose a generic process-launch IPC primitive.

## Acceptance Criteria

- `ensureOllama()` is purpose-specific, returns a typed status, and only starts a validated Ollama executable path.
- The verification response identifies the configured model and whether local assessment succeeded.
- The UI links only to the official Windows Ollama page and supplies the exact pull command.
- Source lookup remains usable when local AI is unavailable.
- Automated backend and frontend gates pass.
