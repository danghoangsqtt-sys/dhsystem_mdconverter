@echo off
echo ===================================================
echo Starting Local Markdown Converter
echo ===================================================

cd /d "%~dp0"
set PYTHON_EXE="docling-env\Scripts\python.exe"
set PIP_EXE="docling-env\Scripts\pip.exe"

echo [1/3] Checking Frontend build...
if not exist "frontend\dist" (
    echo Building frontend for the first time...
    cd frontend
    call npm install
    call npm run build
    cd ..
) else (
    echo Frontend already built.
)

echo [2/3] Checking Backend dependencies...
%PIP_EXE% install -r backend\requirements.txt -q

echo [3/3] Starting System...
echo ===================================================
echo Application is running at http://localhost:8000
echo You can close this window to stop the server.
echo ===================================================

start http://localhost:8000
%PYTHON_EXE% backend\run_server.py

pause
