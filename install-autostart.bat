@echo off
:: ─────────────────────────────────────────────────
:: Liquid Glass Bar — Install Autostart
:: Run this once to auto-start on Windows login.
:: ─────────────────────────────────────────────────
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\LiquidGlassBar.bat"
set "HERE=%~dp0"

:: Write a launcher to the Startup folder
(
  echo @echo off
  echo cd /d "%HERE%"
  echo start "" /B cmd /c "npm start > nul 2>&1"
) > "%TARGET%"

echo.
echo Autostart installed successfully!
echo Location: %TARGET%
echo.
echo The bar will now launch automatically when you log in.
echo To remove: delete "%TARGET%"
echo.
pause
