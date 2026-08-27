# Mark Tini

Mark Tini is a Windows desktop application for converting local documents to Markdown and editable Word files. Processing happens on the user's machine.

## Build the application

```powershell
cd frontend
npm ci
npm run build:electron
```

The installer is written to `frontend/release/` as `Mark Tini Setup <version>.exe`.

## Development checks

```powershell
cd frontend
npm run lint
npm run build
..\docling-env\Scripts\python.exe -m pytest ..\backend\tests -q
```

## Data location

Mark Tini stores application data, conversion history, and logs under `%APPDATA%\Mark Tini\data`.
