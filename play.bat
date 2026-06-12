@echo off
cd /d "%~dp0"

:: Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
  echo Python not found -- install from python.org, or open index.html with any local web server
  pause
  exit /b 1
)

:: Try python -m http.server first, then py -m http.server as fallback
python -m http.server --version >nul 2>nul
if %errorlevel% equ 0 (
  start "MonkDragon" /min python -m http.server 8321
) else (
  py -m http.server --version >nul 2>nul
  if %errorlevel% equ 0 (
    start "MonkDragon" /min py -m http.server 8321
  ) else (
    echo Python http.server module not available.
    echo Please open index.html with any local web server.
    pause
    exit /b 1
  )
)

timeout /t 1 >nul
start "" http://localhost:8321/
