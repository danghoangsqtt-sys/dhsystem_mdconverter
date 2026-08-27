# Changelog

## 2.0.0

- Removed the retired OCR product and all multi-product installer logic.
- Rebuilt the package as a single Mark Tini installer with standard NSIS shortcuts.
- Moved runtime state to the Mark Tini application profile.
- Kept the asynchronous Core supervisor fix so process cleanup never blocks Electron's UI.
