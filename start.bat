@echo off
:: ─────────────────────────────────────────────────
:: Liquid Glass Bar — Launcher
:: Double-click this file to start the bar.
:: ─────────────────────────────────────────────────
cd /d "%~dp0"

:: Install dependencies on first run
if not exist "node_modules\" (
    echo Installing dependencies, please wait...
    call npm install
    echo.
    echo Done! Starting bar...
    echo.
)

:: Start bar via npm start (works regardless of electron.cmd path)
start "" /B cmd /c "npm start > nul 2>&1"

:: Small pause then close this window
timeout /t 2 /nobreak > nul
exit
