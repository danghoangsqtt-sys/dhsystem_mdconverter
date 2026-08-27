# Testing Mark Tini

Run the frontend checks:

```powershell
cd frontend
npm run lint
npm run build
```

Run backend tests:

```powershell
docling-env\Scripts\python.exe -m pytest backend\tests -q
```

Run Electron end-to-end checks (requires the local runtime and models):

```powershell
cd frontend
npm run test:e2e
```

E2E runs are isolated from real user data by a temporary Mark Tini application-data directory.
