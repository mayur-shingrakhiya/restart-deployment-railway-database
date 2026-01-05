@echo off
REM =====================================
REM Stop All Services
REM =====================================
set PROJECT_NAME=restate-api

echo =====================================
echo Stopping All Services
echo =====================================
echo.

echo Stopping Restate server...
docker stop %PROJECT_NAME%_restate
docker rm %PROJECT_NAME%_restate

echo.
echo =====================================
echo All services stopped!
echo =====================================

pause