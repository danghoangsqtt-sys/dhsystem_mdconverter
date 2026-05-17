@echo off
echo ===================================================
echo Starting Local Markdown Converter Backend Server
echo ===================================================

cd /d "%~dp0"
set PYTHON_EXE="..\docling-env\Scripts\python.exe"
set PIP_EXE="..\docling-env\Scripts\pip.exe"

echo [1/2] Installing requirements...
%PIP_EXE% install -r requirements.txt

echo [2/2] Starting server...
%PYTHON_EXE% run_server.py

pause
