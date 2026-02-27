@echo off
title Estacion de Mando CenterMind
color 0b

:: 1. Configurar la variable de entorno
set SHELFMIND_API_KEY=shelfmind-clave-2025

:: 2. Abrir la API en una nueva ventana
echo [1/3] Iniciando Servidor API FastAPI...
start cmd /k "cd /d C:\Users\cigar\OneDrive\Desktop\BOT-SQL\CenterMind && python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload"

:: 3. Esperar a que la API este lista (se oculta el output del timeout)
timeout /t 3 >nul

:: 4. Buscar e iniciar el Tunel de Cloudflare
echo [2/3] Buscando y ejecutando Tunel de Cloudflare...

set "CLOUDFLARED_PATH="
:: Iterar sobre las rutas mas comunes de instalacion o descarga
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

:: Si el ciclo termina y no lo encuentra, falla con gracia
color 0c
echo ERROR CRITICO: No se encontro cloudflared.exe en ninguna de las rutas estandar.
echo Descargalo o muevelo a la raiz del disco C:.
pause
exit /b

:iniciar_tunel
echo [OK] cloudflared.exe encontrado en: %CLOUDFLARED_PATH%
start cmd /k ""%CLOUDFLARED_PATH%" tunnel --url http://localhost:8000"

:: 5. Abrir Streamlit en el navegador
echo [3/3] Abriendo panel de Streamlit...
start https://share.streamlit.io/

echo.
echo ====================================================== [cite: 2]
echo   SISTEMA ACTIVO
echo ====================================================== [cite: 2]
echo 1. Copia la URL de la ventana de Cloudflare. [cite: 2]
echo 2. Pegala en Secrets de Streamlit Cloud (API_URL). [cite: 3]
echo ====================================================== [cite: 3]
pause