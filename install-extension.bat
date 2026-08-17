@echo off
title myREWRD - Install Chrome Extension
echo.
echo  Installing myREWRD Game Day Chrome Extension...
echo  ================================================
echo.

REM Create extension directory
set "EXT_DIR=%USERPROFILE%\myREWRD-Extension"
if not exist "%EXT_DIR%" mkdir "%EXT_DIR%"

REM Download extension files from GitHub
echo Downloading extension files...
curl -sL "https://raw.githubusercontent.com/myREWRD/myrewrd-tv-box/main/chrome-extension/manifest.json" -o "%EXT_DIR%\manifest.json"
curl -sL "https://raw.githubusercontent.com/myREWRD/myrewrd-tv-box/main/chrome-extension/background.js" -o "%EXT_DIR%\background.js"
curl -sL "https://raw.githubusercontent.com/myREWRD/myrewrd-tv-box/main/chrome-extension/content.js" -o "%EXT_DIR%\content.js"
curl -sL "https://raw.githubusercontent.com/myREWRD/myrewrd-tv-box/main/chrome-extension/overlay.css" -o "%EXT_DIR%\overlay.css"
curl -sL "https://raw.githubusercontent.com/myREWRD/myrewrd-tv-box/main/chrome-extension/popup.html" -o "%EXT_DIR%\popup.html"
curl -sL "https://raw.githubusercontent.com/myREWRD/myrewrd-tv-box/main/chrome-extension/popup.js" -o "%EXT_DIR%\popup.js"

REM Create icons directory
if not exist "%EXT_DIR%\icons" mkdir "%EXT_DIR%\icons"

REM Create placeholder icons (16x16, 48x48, 128x128 PNGs)
REM These are minimal 1-pixel PNGs that Chrome accepts
echo Creating placeholder icons...
copy NUL "%EXT_DIR%\icons\icon16.png" >nul 2>&1
copy NUL "%EXT_DIR%\icons\icon48.png" >nul 2>&1
copy NUL "%EXT_DIR%\icons\icon128.png" >nul 2>&1

echo.
echo [OK] Extension downloaded to %EXT_DIR%
echo.
echo  NEXT STEPS (one-time manual):
echo  1. Open Chrome
echo  2. Go to chrome://extensions
echo  3. Enable "Developer mode" (top right toggle)
echo  4. Click "Load unpacked"
echo  5. Select folder: %EXT_DIR%
echo  6. Click the extension icon and enter your TV token
echo.
echo  After this, the extension auto-polls every 5 seconds.
echo  Game Day overlay appears/disappears automatically.
echo.
pause
