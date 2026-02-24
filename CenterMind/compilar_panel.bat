@echo off
REM ============================================================
REM  ShelfMind — Compilar Panel Maestro a .exe
REM  Ejecutar desde el directorio CenterMind/
REM ============================================================

echo.
echo  Compilando Panel Maestro...
echo.

pip install pyinstaller -q

pyinstaller ^
    --onefile ^
    --windowed ^
    --name "ShelfMind_PanelMaestro" ^
    --add-data "base_datos;base_datos" ^
    --add-data "hardening;hardening" ^
    --hidden-import "zoneinfo" ^
    --hidden-import "sqlite3" ^
    --hidden-import "tkinter" ^
    --hidden-import "tkinter.ttk" ^
    --hidden-import "tkinter.messagebox" ^
    --hidden-import "tkinter.filedialog" ^
    panel_maestro.py

echo.
echo  Listo. El ejecutable esta en: dist\ShelfMind_PanelMaestro.exe
echo  Copiarlo junto a la carpeta base_datos\ y hardening\
echo.
pause
