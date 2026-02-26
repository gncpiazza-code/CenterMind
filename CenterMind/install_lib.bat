@echo off
echo ===================================================
echo   Instalando dependencias para CenterMind...
echo ===================================================
echo.

:: Verifica si Python está instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo Por favor, instala Python y vuelve a intentarlo.
    pause
    exit /b
)

:: Actualiza pip e instala las librerías
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo.
echo ===================================================
echo   ¡Instalacion completada con exito!
echo ===================================================
pause