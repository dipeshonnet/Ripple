@echo off
setlocal
cd /d "%~dp0"
set PORT=5173
where python >nul 2>nul
if %errorlevel%==0 (
  set PY=python
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (set PY=py) else (
    echo Python was not found on PATH. Install Python or run this folder from an existing static host.
    pause
    exit /b 1
  )
)
echo Performance Arena desktop launcher
echo Serving folder: %cd%
echo Desktop URL: http://localhost:%PORT%/index.html
echo If same Wi-Fi allows it, open http://YOUR-LAPTOP-IP:%PORT%/index.html on mobile.
start "" http://localhost:%PORT%/index.html
%PY% -m http.server %PORT%
pause
