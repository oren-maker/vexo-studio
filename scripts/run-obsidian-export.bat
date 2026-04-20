@echo off
REM Auto-export vexo brain state to Obsidian vault.
REM Loads env from .env.prod, sets VAULT_PATH, runs npm run export:obsidian.
REM Register with Windows Task Scheduler to run every 30 minutes.

cd /d "C:\Users\oren\OneDrive\שולחן העבודה\CLAUDE\vexo"

REM Load env vars from .env.prod (skips lines starting with # and empty lines)
for /f "usebackq tokens=1,* delims==" %%a in (".env.prod") do (
  if not "%%a"=="" if not "%%a:~0,1"=="#" set "%%a=%%~b"
)

set "VAULT_PATH=C:\Users\oren\OneDrive\שולחן העבודה\CLAUDE\OB\VEXO"

call npm run export:obsidian >> "%TEMP%\vexo-obsidian-export.log" 2>&1
