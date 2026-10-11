@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%~dp0"
set "CX_ROOT=%~dp0"
title CX Reply Assistant - Supabase Reset

echo ============================================================
echo  CX Reply Assistant - SUPABASE RESET + RESEED
echo ============================================================
echo.
echo This is a destructive operation. Back up your Supabase database first.
echo It deletes this app's data in its own tables, then inserts fresh demo data.
echo It does NOT drop Supabase-managed auth, storage, realtime, or extensions schemas.
echo.

if not exist "%ROOT%backend\package.json" goto PROJECT_FOLDER_ERROR
if not exist "%ROOT%database\schema.sql" goto PROJECT_FOLDER_ERROR
if not exist "%ROOT%backend\.env" goto ENV_FILE_ERROR

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$envFile = Join-Path $env:CX_ROOT 'backend\.env'; $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1; if (!$line) { Write-Host '[ERROR] DATABASE_URL was not found in backend\.env'; exit 1 }; $value = ($line -replace '^\s*DATABASE_URL\s*=\s*','').Trim().Trim([char]34).Trim([char]39); try { $u = [uri]$value } catch { Write-Host '[ERROR] DATABASE_URL is not a valid URL'; exit 1 }; if ($u.Scheme -notin @('postgres','postgresql') -or $u.Host -notmatch '\.supabase\.(co|com)$' -or $value -match 'PROJECT_REF|YOUR_ENCODED_DB_PASSWORD|URL_ENCODED_DB_PASSWORD|POOLER_HOST') { Write-Host '[ERROR] DATABASE_URL is a placeholder, invalid, or not a Supabase PostgreSQL URL'; exit 1 }; Write-Host ('Supabase database URL validated. Database: ' + $u.AbsolutePath.TrimStart('/'))"
if errorlevel 1 goto DATABASE_URL_ERROR

echo.
echo FINAL WARNING: all existing data in this app's tables will be deleted.
echo Copy this exact phrase into the confirmation prompt:
echo RESET CX REPLY ASSISTANT
set /p "RESET_CONFIRM=Confirmation: "
if not "%RESET_CONFIRM%"=="RESET CX REPLY ASSISTANT" goto CANCELLED

echo.
where node >nul 2>nul
if errorlevel 1 goto NODE_MISSING
where npm >nul 2>nul
if errorlevel 1 goto NPM_MISSING

pushd "%ROOT%backend"
if not exist node_modules (
  echo Installing backend dependencies. This may take a few minutes...
  call npm ci
  if errorlevel 1 goto DEPENDENCIES_FAILED
)
set "CONFIRM_SUPABASE_RESET=YES_I_BACKED_UP_AND_WANT_TO_RESET"
echo.
echo [1/2] Dropping application-owned tables...
call npm run db:reset:drop
if errorlevel 1 goto RESET_FAILED

echo.
echo [2/2] Recreating schema, migrations, demo agents, and sample data...
call npm run db:init
if errorlevel 1 goto INIT_FAILED
set "CONFIRM_SUPABASE_RESET="
popd

echo.
echo SUCCESS: Supabase application tables were recreated and reseeded.
echo Demo login agents: Sam Rivera and Alex Chen.
echo Customer names in the inbox are separate fictional customers.
echo All seeded customer email addresses use the reserved example.test domain.
echo.
pause
exit /b 0

:PROJECT_FOLDER_ERROR
echo [ERROR] You are running this file outside the project folder or the project files are missing.
echo Extract the FULL project ZIP first, then run this BAT from the main project folder.
echo Do not move or run this BAT by itself from Downloads.
goto STOP_ERROR

:ENV_FILE_ERROR
echo [ERROR] backend\.env was not found.
echo Run SETUP_SUPABASE.bat from the main project folder and configure DATABASE_URL first.
goto STOP_ERROR

:DATABASE_URL_ERROR
echo [ERROR] Could not validate DATABASE_URL as a Supabase PostgreSQL URL.
echo Open backend\.env and use the database connection URI from Supabase Dashboard - Connect.
echo Use the Session pooler URI when your network/provider requires it; remove template placeholders.
goto STOP_ERROR

:HOST_MISMATCH
echo [CANCELLED] The host confirmation did not match. No tables were changed.
goto STOP_ERROR

:CANCELLED
echo [CANCELLED] Confirmation was not exact. No tables were changed.
goto STOP_OK

:NODE_MISSING
echo [ERROR] Node.js was not found. Install Node.js 20 LTS or newer from https://nodejs.org/.
goto STOP_ERROR

:NPM_MISSING
echo [ERROR] npm was not found. Repair or reinstall Node.js, then try again.
goto STOP_ERROR

:DEPENDENCIES_FAILED
set "CONFIRM_SUPABASE_RESET="
popd
echo [ERROR] npm ci failed. Check the network and the error above.
goto STOP_ERROR

:RESET_FAILED
set "CONFIRM_SUPABASE_RESET="
popd
echo [ERROR] The database reset failed. See the error above. The initializer was not run.
goto STOP_ERROR

:INIT_FAILED
set "CONFIRM_SUPABASE_RESET="
popd
echo [ERROR] The tables were dropped, but schema/data initialization failed.
echo Fix the displayed database issue, then rerun this BAT to recreate the app tables.
goto STOP_ERROR

:STOP_ERROR
echo.
pause
exit /b 1

:STOP_OK
echo.
pause
exit /b 0
