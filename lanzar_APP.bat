@echo off
title Estacion de Mando CenterMind
color 0b

:: 1. Configurar la variable de entorno
set SHELFMIND_API_KEY=shelfmind-clave-2025

:: 2. Abrir la API en una nueva ventana
echo [1/3] Iniciando Servidor API FastAPI...
start cmd /k "cd /d C:\Users\cigar\OneDrive\Desktop\BOT-SQL\CenterMind && python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload"

:: 3. Esperar a que la API este lista
timeout /t 3

:: 4. Abrir el Tunel de Cloudflare en otra ventana
echo [2/3] Iniciando Tunel de Cloudflare...
start cmd /k "C:\cloudflared.exe tunnel --url http://localhost:8000"

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
