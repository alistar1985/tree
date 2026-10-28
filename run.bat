@echo off
chcp 65001 >nul
title Clan Tree - http://localhost:8080
cd /d "%~dp0"
set PHP=php
if exist "C:\xampp\php\php.exe" set PHP=C:\xampp\php\php.exe
echo.
echo   Clan Tree is running at:  http://localhost:8080
echo   Admin panel:              http://localhost:8080/admin/
echo   Keep this window open. Press Ctrl+C to stop.
echo.
start "" http://localhost:8080
"%PHP%" -S 0.0.0.0:8080 router.php
