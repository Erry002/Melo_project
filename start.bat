@echo off
setlocal EnableDelayedExpansion

:: Colori per Windows
set "GREEN=[32m"
set "BLUE=[34m"
set "RED=[31m"
set "NC=[0m"

title Meluccio Chat Starter

echo %BLUE%🚀 Avvio Meluccio Chat...%NC%
echo.

:: Funzione per la pulizia
:cleanup
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
exit /b

:: Gestione CTRL+C
if not "%1"=="am_admin" (
    powershell -Command "Start-Process -Verb RunAs -FilePath '%0' -ArgumentList 'am_admin'"
    exit /b
)

:: Verifica le dipendenze
echo %BLUE%📦 Verifica dipendenze...%NC%
cd Meluccio-frontend
call npm install
cd ..
call npm install

:: Costruisce il frontend
echo.
echo %BLUE%🏗️  Build frontend...%NC%
cd Meluccio-frontend
call npm run build
cd ..

:: Avvia ngrok e cattura l'URL
echo.
echo %BLUE%🌐 Avvio tunnel Ngrok...%NC%
start /B ngrok http 3001 --log=stdout > ngrok.log

:: Attende che Ngrok sia pronto
:waitForNgrok
timeout /t 1 /nobreak >nul
findstr /C:"started tunnel" ngrok.log >nul
if errorlevel 1 goto waitForNgrok

:: Ottiene l'URL di Ngrok
for /f "tokens=*" %%a in ('findstr /C:"url=https://" ngrok.log') do set "NGROK_LINE=%%a"
set "NGROK_URL=!NGROK_LINE:*url=!"
echo %GREEN%✅ Ngrok attivo: !NGROK_URL!%NC%

:: Aggiorna l'URL nel frontend
echo.
echo %BLUE%🔄 Aggiornamento configurazione...%NC%
powershell -Command "(Get-Content Meluccio-frontend\src\App.jsx) -replace 'const SOCKET_URL = .*', 'const SOCKET_URL = \"!NGROK_URL!\";' | Set-Content Meluccio-frontend\src\App.jsx"

:: Avvia il server
echo.
echo %BLUE%🖥️  Avvio server...%NC%
start /B cmd /c "node server.js"

:: Avvia il frontend in development mode
echo.
echo %BLUE%🌟 Avvio frontend...%NC%
cd Meluccio-frontend
start /B cmd /c "npm run dev"
cd ..

:: Mostra le istruzioni
echo.
echo %GREEN%✨ Tutto pronto!%NC%
echo 📱 App disponibile su:
echo    Local: %GREEN%http://localhost:5173%NC%
echo    Online: %GREEN%!NGROK_URL!%NC%
echo.
echo %BLUE%Premi CTRL+C per terminare tutto%NC%

:: Mantiene lo script in esecuzione
:loop
timeout /t 1 /nobreak >nul
tasklist | find "node.exe" >nul
if errorlevel 1 goto cleanup
goto loop
