@echo off
setlocal EnableExtensions
chcp 65001 >nul

title PJC Launcher
cd /d "%~dp0"

set "PJC_MODE=%~1"
set "PJC_URL=http://localhost:5000/app/dashboard"
set "PJC_DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

echo.
echo ========================================
echo   PJC Job Tracker
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  goto fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  goto fail
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker Desktop is not installed or docker.exe is not in PATH.
  goto fail
)

if not exist ".env" (
  echo [SETUP] Creating local .env file...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$bytes = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose(); $secret = ([BitConverter]::ToString($bytes)).Replace('-', ''); $content = (Get-Content -Raw '.env.example').Replace('replace-with-at-least-32-random-characters', $secret); Set-Content -Path '.env' -Value $content -Encoding Ascii"
  if errorlevel 1 (
    echo [ERROR] Could not create .env.
    goto fail
  )
)

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

if not exist "%PJC_DOCKER_DESKTOP%" (
  echo [ERROR] Docker Engine is not running.
  goto fail
)

echo [DOCKER] Starting Docker Desktop...
start "" "%PJC_DOCKER_DESKTOP%"
set /a PJC_TRIES=0

:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a PJC_TRIES+=1
if %PJC_TRIES% GEQ 60 (
  echo [ERROR] Docker Desktop did not become ready in time.
  goto fail
)
powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul 2>&1
goto wait_docker

:docker_ready
echo [DOCKER] Starting PostgreSQL...
docker compose up -d db
if errorlevel 1 (
  echo [ERROR] PostgreSQL container could not be started.
  goto fail
)

set /a PJC_TRIES=0

:wait_database
docker compose exec -T db pg_isready -U postgres -d pjc_db >nul 2>&1
if not errorlevel 1 goto database_ready
set /a PJC_TRIES+=1
if %PJC_TRIES% GEQ 45 (
  echo [ERROR] PostgreSQL did not become ready in time.
  goto fail
)
powershell -NoProfile -Command "Start-Sleep -Seconds 1" >nul 2>&1
goto wait_database

:database_ready
echo [NPM] Checking dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] npm install failed.
  goto fail
)

echo [DATABASE] Applying migrations...
call npm run prisma:migrate
if errorlevel 1 (
  echo [ERROR] Database migration failed.
  goto fail
)

if /I "%PJC_MODE%"=="--check" (
  echo.
  echo [OK] Environment, dependencies, Docker, and database are ready.
  exit /b 0
)

call :health_check
if not errorlevel 1 (
  echo [SERVER] PJC is already running.
  goto open_application
)

powershell -NoProfile -Command "$connection = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($connection) { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] Port 5000 is occupied by another application.
  goto fail
)

echo [SERVER] Starting PJC...
if /I "%PJC_MODE%"=="--no-browser" goto run_server

echo [BROWSER] The application will open when the server is ready.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$url = '%PJC_URL%'; for ($i = 0; $i -lt 60; $i++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5000/health' -TimeoutSec 2; if ($response.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }"

:run_server
title PJC Server
echo [SERVER] Close this window or press Ctrl+C to stop PJC.
echo.
call npm start
if errorlevel 1 goto fail
exit /b 0

:open_application
if /I "%PJC_MODE%"=="--no-browser" (
  echo [OK] %PJC_URL%
  exit /b 0
)

echo [BROWSER] Opening %PJC_URL%
start "" "%PJC_URL%"
exit /b 0

:health_check
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5000/health' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%

:fail
echo.
echo PJC was not started. Fix the error above and run this file again.
if /I not "%PJC_MODE%"=="--check" pause
exit /b 1
