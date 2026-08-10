@echo off
cd /d "%~dp0"

set PATH="%~dp0node";%PATH%

echo ============================================
echo   FH6 Livery Manager
echo ============================================
echo.
echo [1/2] Patching car name map...
node apply_all.js
if errorlevel 1 goto err1
echo.
echo [2/2] Scanning save...
node livery_analyzer.js
if errorlevel 1 goto err2
echo.
echo Report ready. Opening...
start "" report.html
echo Done.
pause
goto :end

:err1
echo ERROR: apply_all.js failed
pause
exit /b 1

:err2
echo ERROR: livery_analyzer.js failed
pause
exit /b 1

:end