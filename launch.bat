@echo off
setlocal
cd /d "%~dp0"
set PORT=5173
set NODE_EXE=
echo.
echo Starting Performance Arena on http://localhost:%PORT%
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the server.
echo.
where node >nul 2>nul
if %errorlevel%==0 (
  set NODE_EXE=node
  goto start_node
)
if exist ".node\node.exe" (
  set NODE_EXE=.node\node.exe
  goto start_node
)
goto start_static

:start_node
echo API-enabled mode: Admin login is available at http://localhost:%PORT%/admin
start "" http://localhost:%PORT%/index.html
"%NODE_EXE%" api\server.js
goto :eof

:start_static
echo Node.js was not found. Starting static-only mode.
echo Admin login requires the Node API server and will not work in static-only mode.
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  python -m http.server %PORT%
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  py -3 -m http.server %PORT%
  goto :eof
)
echo Python 3 was not found on PATH.
echo Please install Node.js for full API-enabled mode, or Python 3 for static-only mode.
pause
