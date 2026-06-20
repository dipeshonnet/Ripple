@echo off
setlocal
cd /d "%~dp0"
echo Running Performance Arena tests...
where node >nul 2>nul
if %errorlevel%==0 (
  node test_prototype.js
  pause
  exit /b
)
if exist ".node\node.exe" (
  .node\node.exe test_prototype.js
  pause
  exit /b
)
echo Node.js not found. Install Node.js or run tests on a machine with Node.
pause
