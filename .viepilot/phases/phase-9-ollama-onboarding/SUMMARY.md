# Phase 9 Summary

Mark Tini now treats source lookup and local assessment as two explicit stages. OpenAlex remains the online source service. Ollama is optional, defaults to `qwen2.5:3b`, is started on demand by a purpose-specific Electron bridge, and reports actionable unavailable/missing-model states to the renderer.

The citation panel now links to the official Windows installer, supplies the exact model pull command, and explains that source lookup still works without local AI. The main Mark Tini installer remains below the practical 4 GB USB/FAT32 boundary by keeping Ollama/model as an optional companion.

Verification: 81 backend tests, frontend lint/build, 2 Electron E2E tests, IPC startup smoke, and real local model inference passed.

The rebuilt NSIS 1.3.2 installer completed successfully and the installed executable reported version 1.3.2, rendered the Mark Tini shell, and started Ollama through the purpose-specific bridge.
