@echo off
title Estacion de Mando CenterMind
color 0b

:: Directorio raiz = carpeta donde esta este .bat (sin importar usuario ni maquina)
set "ROOT=%~dp0"
set "API_DIR=%ROOT%CenterMind"

:: 1. Configurar la variable de entorno
set SHELFMIND_API_KEY=shelfmind-clave-2025

:: 2. Abrir la API en una nueva ventana
:: Usamos /d para setear el directorio de trabajo sin anidar comillas
echo [1/3] Iniciando Servidor API FastAPI...
start "API FastAPI" /d "%API_DIR%" cmd /k "python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload"

:: 3. Esperar a que la API este lista
<<<<<<< Updated upstream
timeout /t 3

:: 4. Abrir el Tunel de Cloudflare en otra ventana
echo [2/3] Iniciando Tunel de Cloudflare...
start cmd /k "C:\cloudflared.exe tunnel --url http://localhost:8000"
=======
timeout /t 3 >nul

:: 4. Buscar e iniciar el Tunel de Cloudflare
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

color 0c
echo ERROR CRITICO: No se encontro cloudflared.exe en ninguna de las rutas estandar.
echo Descargalo y colocalo en C:\ o en tu carpeta Descargas.
pause
exit /b

:iniciar_tunel
echo [OK] cloudflared.exe encontrado en: %CLOUDFLARED_PATH%
start "Cloudflare Tunnel" cmd /k ""%CLOUDFLARED_PATH%" tunnel --url http://localhost:8000"
>>>>>>> Stashed changes

:: 5. Abrir Streamlit en el navegador
echo [3/3] Abriendo panel de Streamlit...
start https://share.streamlit.io/

echo.
echo ======================================================
echo   SISTEMA ACTIVO
echo ======================================================
echo 1. Copia la URL de la ventana de Cloudflare.
echo 2. Pegala en Secrets de Streamlit Cloud (API_URL).
echo ======================================================
pause
