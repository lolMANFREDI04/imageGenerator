@echo off
REM ============================================================
REM   ImageGenerator — full build orchestration
REM   Outputs:
REM     dist\ImageGenerator\ImageGenerator.exe   (the app)
REM     installer\Output\ImageGenerator-Setup.exe (the setup)
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

echo.
echo === [1/4] Build frontend (Vite) ===
pushd frontend
call npm install --no-audit --no-fund || goto :error
call npm run build || goto :error
popd

echo.
echo === [2/4] Install Python build deps ===
python -m pip install --upgrade pip || goto :error
python -m pip install -r requirements.txt || goto :error
python -m pip install pyinstaller==6.11.1 || goto :error

echo.
echo === [3/4] Build EXE with PyInstaller (onedir) ===
if exist dist\ImageGenerator rmdir /s /q dist\ImageGenerator
if exist build rmdir /s /q build
pyinstaller --noconfirm --distpath dist --workpath build installer\launcher.spec || goto :error

echo.
echo === [4/4] Build setup.exe with Inno Setup ===
set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo.
  echo [WARNING] Inno Setup not found at the standard locations.
  echo           Install it from https://jrsoftware.org/isdl.php and rerun this step:
  echo           "%%ISCC%%" installer\ImageGenerator.iss
  goto :exe_only
)
"%ISCC%" installer\ImageGenerator.iss || goto :error

echo.
echo ============================================================
echo   Build complete:
echo     - dist\ImageGenerator\ImageGenerator.exe
echo     - installer\Output\ImageGenerator-Setup.exe
echo ============================================================
goto :eof

:exe_only
echo.
echo ============================================================
echo   Build complete (EXE only — installer skipped):
echo     - dist\ImageGenerator\ImageGenerator.exe
echo ============================================================
goto :eof

:error
echo.
echo *** BUILD FAILED — see messages above ***
exit /b 1
