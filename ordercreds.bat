@echo off
echo =======================================================
echo Restaurando Credenciales de CenterMind - Shelfyy
echo =======================================================

:: Variables
set REPO_ROOT=%~dp0
set CREDS_DIR=%REPO_ROOT%creds

if not exist "%CREDS_DIR%" (
    echo [ERROR] La carpeta "creds" no existe en este directorio.
    echo Asegurate de haberla copiado junto con este .bat
    pause
    exit /b
)

echo.
echo Copiando archivos del backend (CenterMind)...
if exist "%CREDS_DIR%\.env" (
    copy /Y "%CREDS_DIR%\.env" "%REPO_ROOT%CenterMind\.env" >nul
    echo  - .env copiado
)
if exist "%CREDS_DIR%\credentials.json" (
    copy /Y "%CREDS_DIR%\credentials.json" "%REPO_ROOT%CenterMind\credentials.json" >nul
    echo  - credentials.json copiado
)
if exist "%CREDS_DIR%\token_drive.json" (
    copy /Y "%CREDS_DIR%\token_drive.json" "%REPO_ROOT%CenterMind\token_drive.json" >nul
    echo  - token_drive.json copiado
)
if exist "%CREDS_DIR%\setup_drive_oauth.py" (
    copy /Y "%CREDS_DIR%\setup_drive_oauth.py" "%REPO_ROOT%CenterMind\setup_drive_oauth.py" >nul
    echo  - setup_drive_oauth.py copiado
)

echo.
echo Copiando archivos del frontend (shelfy-frontend)...
if exist "%CREDS_DIR%\.env.local" (
    copy /Y "%CREDS_DIR%\.env.local" "%REPO_ROOT%shelfy-frontend\.env.local" >nul
    echo  - .env.local copiado
)

echo.
echo =======================================================
echo Credenciales ordenadas con exito.
echo ¡El repositorio ya cuenta con las credenciales!
echo =======================================================
pause
