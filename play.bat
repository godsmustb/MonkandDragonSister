@echo off
cd /d "%~dp0"

:: Find a working Python launcher (prefer the official "py" launcher, then "python")
set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if not defined PYCMD (
  where python >nul 2>nul && set "PYCMD=python"
)

if not defined PYCMD (
  echo.
  echo   Python was not found on your PATH.
  echo   Install it from https://www.python.org/downloads/  ^(tick "Add python.exe to PATH"^),
  echo   or open this folder with any local web server and browse to index.html.
  echo.
  pause
  exit /b 1
)

echo Starting "The Monk ^& The Dragon Sister" on http://localhost:8321/ ...
echo (Keep the minimized server window open while you play. Close it to stop.)

:: Launch the static server (serves this folder) in its own minimized window
start "MonkDragon Server" /min %PYCMD% -m http.server 8321

:: Give it a moment to bind the port, then open the game in the default browser
:: (ping is used instead of timeout because it never fails under redirected input)
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:8321/index.html"

exit /b 0
