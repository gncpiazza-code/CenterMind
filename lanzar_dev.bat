@echo off
title Entorno de Desarrollo CenterMind
color 0e

echo ======================================================
echo   INICIANDO ENTORNO CENTERMIND + CLOUDFLARE
echo ======================================================

:: 1. Iniciar el Backend (FastAPI)
echo [1/3] Levantando API (FastAPI)...
start "Terminal 1 - API" cmd /k "cd /d C:\Users\cigar\OneDrive\Desktop\BOT-SQL\CenterMind && python -m uvicorn api:app --port 8000 --reload"

:: Pausa de 3 segundos para que el puerto 8000 responda antes del túnel
timeout /t 3 >nul

:: 2. Buscar e iniciar el Túnel de Cloudflare
echo [2/3] Buscando y ejecutando Tunel de Cloudflare...

set "CLOUDFLARED_PATH="
:: Rutas de búsqueda
for %%p in (
    "C:\cloudflared.exe"
    "C:\Users\cigar\cloudflared.exe"
    "%USERPROFILE%\cloudflared.exe"
    "%USERPROFILE%\Downloads\cloudflared.exe"
    "%PROGRAMFILES%\cloudflared\cloudflared.exe"
) do (
    if exist %%p (
        set "CLOUDFLARED_PATH=%%~p"
        goto :iniciar_tunel
    )
)

echo [!] ADVERTENCIA: No se encontro cloudflared.exe. Saltando paso...
goto :iniciar_frontend

:iniciar_tunel
echo [+] Cloudflare encontrado en: %CLOUDFLARED_PATH%
:: Cambia 'tunel-centermind' por el nombre de tu túnel configurado o usa 'tunnel --url http://localhost:8000'
start "Terminal 3 - Cloudflare" cmd /k "%CLOUDFLARED_PATH% tunnel --url http://localhost:8000"
timeout /t 2 >nul

:iniciar_frontend
:: 3. Iniciar el Frontend (Streamlit)
echo [3/3] Levantando Frontend (Streamlit)...
start "Terminal 2 - Streamlit" cmd /k "cd /d C:\Users\cigar\OneDrive\Desktop\BOT-SQL\CenterMind\StreamLitApp && streamlit run app.py"

echo.
echo ======================================================
echo   SERVICIOS DESPLEGADOS EXITOSAMENTE
echo ======================================================
echo Las consolas se abrieron en ventanas separadas.
pause >nul