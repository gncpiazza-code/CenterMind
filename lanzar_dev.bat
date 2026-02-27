@echo off
title Entorno de Desarrollo CenterMind
color 0e

:: Directorio raiz = carpeta donde esta este .bat (sin importar usuario ni maquina)
set "ROOT=%~dp0"
set "API_DIR=%ROOT%CenterMind"
set "APP_DIR=%ROOT%CenterMind\StreamLitApp"

echo ======================================================
echo   INICIANDO ENTORNO CENTERMIND + CLOUDFLARE
echo ======================================================

:: 1. Iniciar el Backend (FastAPI)
:: Usamos /d para setear el directorio de trabajo sin anidar comillas
echo [1/3] Levantando API (FastAPI)...
start "Terminal 1 - API" /d "%API_DIR%" cmd /k "python -m uvicorn api:app --port 8000 --reload"

:: Pausa de 3 segundos para que el puerto 8000 responda antes del tunel
timeout /t 3 >nul

:: 2. Buscar e iniciar el Tunel de Cloudflare
echo [2/3] Buscando y ejecutando Tunel de Cloudflare...

set "CLOUDFLARED_PATH="
for %%p in (
    "C:\cloudflared.exe"
    "%USERPROFILE%\Downloads\cloudflared.exe"
    "%USERPROFILE%\cloudflared.exe"
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
start "Terminal 3 - Cloudflare" cmd /k ""%CLOUDFLARED_PATH%" tunnel --url http://localhost:8000"
timeout /t 2 >nul

:iniciar_frontend
:: 3. Iniciar el Frontend (Streamlit)
echo [3/3] Levantando Frontend (Streamlit)...
start "Terminal 2 - Streamlit" /d "%APP_DIR%" cmd /k "python -m streamlit run app.py"

echo.
echo ======================================================
echo   SERVICIOS DESPLEGADOS EXITOSAMENTE
echo ======================================================
echo Las consolas se abrieron en ventanas separadas.
pause >nul
