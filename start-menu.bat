@echo off
setlocal enabledelayedexpansion

:: Colori
set "GREEN=[92m"
set "BLUE=[94m"
set "RED=[91m"
set "NC=[0m"

title Meluccio Chat - Menu di Gestione

:menu
cls
echo %BLUE%===============================
echo    Meluccio Chat - Menu
echo ===============================%NC%
echo.
echo 1. Avvia Server
echo 2. Avvia Client
echo 3. Avvia Entrambi
echo 4. Verifica Stato
echo 5. Visualizza Log
echo 6. Pulisci Cache
echo 7. Esci
echo.

set /p choice="Seleziona un'opzione (1-7): "

if "%choice%"=="1" goto startServer
if "%choice%"=="2" goto startClient
if "%choice%"=="3" goto startBoth
if "%choice%"=="4" goto checkStatus
if "%choice%"=="5" goto viewLogs
if "%choice%"=="6" goto cleanCache
if "%choice%"=="7" goto end

echo %RED%Opzione non valida!%NC%
timeout /t 2 >nul
goto menu

:startServer
echo %BLUE%Avvio server...%NC%
start "Meluccio Server" cmd /c "cd /d %~dp0 && node server.js"
echo %GREEN%Server avviato!%NC%
timeout /t 2 >nul
goto menu

:startClient
echo %BLUE%Avvio client...%NC%
cd Meluccio-frontend
start "Meluccio Client" cmd /c "npm run dev"
cd ..
echo %GREEN%Client avviato!%NC%
timeout /t 2 >nul
goto menu

:startBoth
echo %BLUE%Avvio server e client...%NC%
start "Meluccio Server" cmd /c "cd /d %~dp0 && node server.js"
cd Meluccio-frontend
start "Meluccio Client" cmd /c "npm run dev"
cd ..
echo %GREEN%Server e client avviati!%NC%
timeout /t 2 >nul
goto menu

:checkStatus
cls
echo %BLUE%Verifica stato servizi...%NC%
echo.
echo Server:
netstat -ano | findstr ":3001"
echo.
echo Client:
netstat -ano | findstr ":5173"
echo.
echo %BLUE%Verifica connessione...%NC%
curl -s http://localhost:3001/health
echo.
pause
goto menu

:viewLogs
cls
echo %BLUE%Log recenti:%NC%
echo.
if exist "logs\server.log" (
    type "logs\server.log"
) else (
    echo %RED%Nessun log disponibile%NC%
)
echo.
pause
goto menu

:cleanCache
echo %BLUE%Pulizia cache...%NC%
if exist "Meluccio-frontend\node_modules" (
    rmdir /s /q "Meluccio-frontend\node_modules"
)
if exist "node_modules" (
    rmdir /s /q "node_modules"
)
if exist "Meluccio-frontend\.cache" (
    rmdir /s /q "Meluccio-frontend\.cache"
)
echo %GREEN%Cache pulita!%NC%
timeout /t 2 >nul
goto menu

:end
echo %GREEN%Arrivederci!%NC%
timeout /t 2 >nul
exit /b 0
