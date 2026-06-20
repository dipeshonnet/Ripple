@echo off
setlocal
cd /d "%~dp0"
echo Running Performance Arena regression tests...
echo.
where node >nul 2>nul
if %errorlevel%==0 (
  node test_prototype.js
  pause
  goto :eof
)
if exist ".node\node.exe" (
  .node\node.exe test_prototype.js
  pause
  goto :eof
)
echo Node.js was not found on PATH and bundled .node\node.exe was not found.
echo Install Node.js or use the original test.bat from the package.
pause
