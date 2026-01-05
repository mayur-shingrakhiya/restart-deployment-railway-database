@echo off
REM =====================================
REM Start Restate Server
REM =====================================
set PROJECT_NAME=restate-api

echo =====================================
echo Starting Restate Server (Docker)
echo =====================================
echo Project: %PROJECT_NAME%
echo.

REM Check if Docker is running
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running
    echo Please start Docker Desktop first
    pause
    exit /b 1
)

REM Stop existing container if running
docker stop %PROJECT_NAME%_restate >nul 2>&1
docker rm %PROJECT_NAME%_restate >nul 2>&1

REM Start Restate server with environment variables
echo Starting Restate server with custom timeout...
docker run -d ^
  --name %PROJECT_NAME%_restate ^
  -p 8080:8080 ^
  -p 9070:9070 ^
  -p 9071:9071 ^
  -e RESTATE_WORKER__INVOKER__ABORT_TIMEOUT=30m ^
  -e RESTATE_WORKER__INVOKER__CONCURRENT_INVOCATIONS_LIMIT=100 ^
  -e RESTATE_WORKER__INVOKER__MESSAGE_SIZE_LIMIT=10MB ^
  -e RESTATE_WORKER__INVOKER__RETRY_POLICY__INITIAL_INTERVAL=1s ^
  -e RESTATE_WORKER__INVOKER__RETRY_POLICY__MAX_INTERVAL=10s ^
  -e RESTATE_WORKER__INVOKER__RETRY_POLICY__MAX_ATTEMPTS=3 ^
  restatedev/restate:latest

if %errorlevel% neq 0 (
    echo ERROR: Failed to start Restate server
    pause
    exit /b 1
)

echo.
echo =====================================
echo Restate Server Started Successfully!
echo =====================================
echo Admin API: http://localhost:9070
echo Ingress: http://localhost:8080
echo.
echo Configuration Applied:
echo - Abort timeout: 30 minutes
echo - Max concurrent invocations: 100
echo - Max message size: 10MB
echo - Retry attempts: 3
echo =====================================

REM Show logs
echo.
echo Showing server logs (Ctrl+C to stop)...
docker logs -f %PROJECT_NAME%_restate

pause