@echo off
title Comic Studio Launcher
echo Freeing ports 8004 and 3002...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8004,3002 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Starting backend (port 8004)...
start "Comic Studio - Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8004"

echo Starting frontend (port 3002)...
start "Comic Studio - Frontend" cmd /k "cd /d %~dp0frontend && yarn start"

echo.
echo   Comic Studio is starting in two windows.
echo     App:     http://localhost:3002
echo     Backend: http://localhost:8004
echo.
echo   (First compile of the frontend takes ~30-60s.)
echo.
pause
