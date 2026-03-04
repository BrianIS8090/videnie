@echo off
setlocal

cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] package.json ne naiden v papke skripta.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm ne naiden. Ustanovi Node.js i povtori zapusk.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Ustanavlivayu zavisimosti...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Ne udalos ustanovit zavisimosti.
    pause
    exit /b 1
  )
)

echo [INFO] Zapusk lokalnogo servera...
call npm run dev

endlocal
