@echo off
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env
  echo Created .env — edit it to add your alert email, then re-run this file.
  notepad .env
  exit /b 0
)
if not exist node_modules (
  echo Installing dependencies ^(first run only, takes ~2 min^)...
  npm install
  echo.
  echo Installing Chromium browser for scraping...
  npx playwright install chromium
  echo.
)
echo Starting Dropship Dashboard...
echo Open your browser at: http://localhost:3000
echo.
node server.js
pause
