@echo off
REM =====================================
REM Configuration
REM =====================================
set PROJECT_NAME=restate-api

echo =====================================
echo STEP 1: Registering Service
echo =====================================
echo Project: %PROJECT_NAME%
echo.

REM Check if Docker is running
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running or not accessible
    pause
    exit /b 1
)

REM Register the deployment
docker run ^
  -it ^
  --rm ^
  --name %PROJECT_NAME%_register ^
  --network=host ^
  docker.restate.dev/restatedev/restate-cli:latest ^
  deployments register http://host.docker.internal:9080

if %errorlevel% neq 0 (
    echo ERROR: Service registration failed
    pause
    exit /b 1
)

echo.
echo =====================================
echo Service registered successfully!
echo =====================================

pause