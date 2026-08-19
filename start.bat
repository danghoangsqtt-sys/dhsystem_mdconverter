@echo off
setlocal
echo ===================================================
echo Starting Local Markdown Converter
echo ===================================================

cd /d "%~dp0"
set "PYTHON_EXE=docling-env\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Khong tim thay Python tai %PYTHON_EXE%.
    echo Hay tao virtual environment va cai backend\requirements.txt truoc.
    exit /b 1
)

echo [1/3] Building Frontend from current source...
cd frontend
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 exit /b 1
cd ..

echo [2/3] Checking Backend dependencies...
"%PYTHON_EXE%" -m pip install -r backend\requirements.txt -q
if errorlevel 1 exit /b 1

echo [3/3] Starting System...
echo ===================================================
echo Application is running at http://localhost:8088
echo You can close this window to stop the server.
echo ===================================================

start http://localhost:8088
"%PYTHON_EXE%" backend\run_server.py

pause
