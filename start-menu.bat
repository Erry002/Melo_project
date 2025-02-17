@echo off
setlocal EnableDelayedExpansion

:: Colori per Windows
set "GREEN=[32m"
set "BLUE=[34m"
set "RED=[31m"
set "YELLOW=[33m"
set "NC=[0m"

title Meluccio Chat - Menu Interattivo

:menu
cls
echo %BLUE%╔════════════════════════════════╗
echo ║     Meluccio Chat Manager     ║
echo ╚════════════════════════════════╝%NC%
echo.
echo %GREEN%[1]%NC% Avvia tutto (modalità sviluppo)
echo %GREEN%[2]%NC% Avvia tutto (modalità produzione)
echo %GREEN%[3]%NC% Avvia solo il server
echo %GREEN%[4]%NC% Avvia solo il frontend
echo %GREEN%[5]%NC% Avvia solo Ngrok
echo %GREEN%[6]%NC% Gestione dipendenze
echo %GREEN%[7]%NC% Pulisci build e cache
echo %GREEN%[8]%NC% Visualizza log
echo %GREEN%[0]%NC% Esci
echo.
set /p choice="Seleziona un'opzione: "

if "%choice%"=="1" goto dev_mode
if "%choice%"=="2" goto prod_mode
if "%choice%"=="3" goto server_only
if "%choice%"=="4" goto frontend_only
if "%choice%"=="5" goto ngrok_only
if "%choice%"=="6" goto deps_menu
if "%choice%"=="7" goto clean
if "%choice%"=="8" goto logs
if "%choice%"=="0" goto end
goto menu

:deps_menu
cls
echo %BLUE%╔════════════════════════════════╗
echo ║      Gestione Dipendenze      ║
echo ╚════════════════════════════════╝%NC%
echo.
echo %GREEN%[1]%NC% Installa dipendenze frontend
echo %GREEN%[2]%NC% Installa dipendenze server
echo %GREEN%[3]%NC% Aggiorna tutte le dipendenze
echo %GREEN%[4]%NC% Torna al menu principale
echo.
set /p deps_choice="Seleziona un'opzione: "

if "%deps_choice%"=="1" (
    cd Meluccio-frontend
    call npm install
    cd ..
    pause
)
if "%deps_choice%"=="2" (
    call npm install
    pause
)
if "%deps_choice%"=="3" (
    cd Meluccio-frontend
    call npm update
    cd ..
    call npm update
    pause
)
if "%deps_choice%"=="4" goto menu
goto deps_menu

:dev_mode
echo %BLUE%🚀 Avvio in modalità sviluppo...%NC%
call :start_ngrok
call :start_server
cd Meluccio-frontend
start cmd /c "npm run dev"
cd ..
goto running

:prod_mode
echo %BLUE%🚀 Avvio in modalità produzione...%NC%
cd Meluccio-frontend
call npm run build
cd ..
call :start_ngrok
call :start_server
cd Meluccio-frontend
start cmd /c "npm run preview"
cd ..
goto running

:server_only
echo %BLUE%🖥️ Avvio server...%NC%
call :start_server
goto running

:frontend_only
echo %BLUE%🌟 Avvio frontend...%NC%
cd Meluccio-frontend
start cmd /c "npm run dev"
cd ..
goto running

:ngrok_only
echo %BLUE%🌐 Avvio Ngrok...%NC%
call :start_ngrok
goto running

:clean
echo %BLUE%🧹 Pulizia in corso...%NC%
cd Meluccio-frontend
rmdir /s /q node_modules dist .cache 2>nul
cd ..
rmdir /s /q node_modules 2>nul
del ngrok.log 2>nul
echo %GREEN%✨ Pulizia completata!%NC%
pause
goto menu

:logs
cls
echo %BLUE%📋 Log disponibili:%NC%
echo %GREEN%[1]%NC% Server
echo %GREEN%[2]%NC% Ngrok
echo %GREEN%[3]%NC% Torna al menu
echo.
set /p log_choice="Seleziona log da visualizzare: "

if "%log_choice%"=="1" (
    type server.log
    pause
)
if "%log_choice%"=="2" (
    type ngrok.log
    pause
)
if "%log_choice%"=="3" goto menu
goto logs

:start_ngrok
start /B cmd /c "ngrok http 3001 --log=stdout > ngrok.log"
timeout /t 2 /nobreak >nul
for /f "tokens=*" %%a in ('findstr /C:"url=https://" ngrok.log') do set "NGROK_LINE=%%a"
set "NGROK_URL=!NGROK_LINE:*url=!"
echo %GREEN%✅ Ngrok attivo: !NGROK_URL!%NC%
exit /b

:start_server
start /B cmd /c "node server.js > server.log 2>&1"
echo %GREEN%✅ Server avviato sulla porta 3001%NC%
exit /b

:running
echo.
echo %GREEN%✨ Componenti attivi:%NC%
echo  • Premi %YELLOW%Q%NC% per tornare al menu
echo  • Premi %YELLOW%X%NC% per terminare tutto
echo.
:check_input
choice /c QX /n >nul
if errorlevel 2 goto cleanup
if errorlevel 1 goto cleanup_and_menu

:cleanup_and_menu
call :cleanup
goto menu

:cleanup
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
exit /b

:end
echo %BLUE%👋 Arrivederci!%NC%
timeout /t 2 >nul
exit
