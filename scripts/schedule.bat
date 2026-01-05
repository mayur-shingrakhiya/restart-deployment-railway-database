@echo off
REM =====================================
REM Start BrokerageScheduler
REM =====================================
echo.
echo =====================================
echo Starting BrokerageScheduler
echo =====================================
echo.

REM Check if service is running
curl -s http://localhost:9070/services/BrokerageScheduler >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Restate service is not running!
    echo Please start your service first: npm run dev
    echo.
    pause
    exit /b 1
)

echo Sending START command to scheduler...
echo.

curl -X POST http://localhost:9080/BrokerageScheduler/main-scheduler/start

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start scheduler
    echo Make sure your service is running on port 9080
    echo.
    pause
    exit /b 1
)

echo.
echo =====================================
echo ✅ Scheduler Started Successfully!
echo =====================================
echo.
echo The scheduler will execute every 1 minute
echo.
echo Useful commands:
echo   - Check status: npm run checkstatus:win
echo   - Stop scheduler: curl -X POST http://localhost:9080/BrokerageScheduler/main-scheduler/stop
echo   - Reset: curl -X POST http://localhost:9080/BrokerageScheduler/main-scheduler/reset
echo.
echo =====================================

pause