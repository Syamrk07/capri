@echo off
setlocal
cd /d "%~dp0server"
echo.
echo ================================================
echo          CAPRI - SIDE PILOT BACKEND
echo ================================================
echo.
echo Checking Python...
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.10 or newer, then retry.
  pause
  exit /b 1
)
python server.py
goto finished

:use_py
py -3 server.py

:finished
if errorlevel 1 (
  echo.
  echo Capri stopped because of an error. Read the message above.
  pause
)
