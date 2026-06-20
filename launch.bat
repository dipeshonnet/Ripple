@echo off
setlocal
cd /d "%~dp0"
echo.
echo Starting Performance Arena on http://localhost:5173
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the server.
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:5173
  python -m http.server 5173
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:5173
  py -3 -m http.server 5173
  goto :eof
)
echo Python 3 was not found on PATH.
echo Please install Python 3 or run: py -3 -m http.server 5173
pause
