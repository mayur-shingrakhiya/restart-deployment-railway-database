@echo off
REM =====================================
REM Check Scheduler Status
REM =====================================
echo.
echo =====================================
echo Scheduler Status Check
echo =====================================
echo.

curl http://localhost:9080/BrokerageScheduler/main-scheduler/getStatus

echo.
echo.
echo =====================================
pause