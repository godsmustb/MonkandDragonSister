@echo off
cd /d "%~dp0"
start "MonkDragon" /min python -m http.server 8321
timeout /t 1 >nul
start "" http://localhost:8321/
