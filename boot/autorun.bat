@echo off
REM USBMUSIC - Lanzador manual para Windows.
REM Windows desactiva el autorun de USB por seguridad. Doble-click este .bat
REM al insertar la USB, o configura una tarea programada (ver docs/windows-autorun.md).

setlocal
set "USB_ROOT=%~dp0"
set "APP_DIR=%USB_ROOT%app"
set "RUNTIME_DIR=%USB_ROOT%runtime"
set "DATA_DIR=%USB_ROOT%data"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

echo [usbmusic] USB root: %USB_ROOT%

REM 1) Buscar node: sistema primero, runtime portatil despues
where node >nul 2>&1
if %errorlevel%==0 (
    set "NODE_BIN=node"
    echo [usbmusic] Usando node del sistema
) else (
    set "NODE_BIN=%RUNTIME_DIR%\node-win-x64\node.exe"
    if not exist "%NODE_BIN%" (
        echo [usbmusic] No hay node instalado ni portatil en %NODE_BIN%
        echo [usbmusic] Instala Node.js 18+ desde https://nodejs.org o copia uno portatil a runtime\node-win-x64\
        pause
        exit /b 1
    )
    echo [usbmusic] Usando node portatil
)

if not exist "%APP_DIR%\server\src\index.js" (
    echo [usbmusic] App no encontrada en %APP_DIR%
    pause
    exit /b 1
)

if not exist "%APP_DIR%\server\node_modules" (
    echo [usbmusic] Instalando dependencias de produccion (primera vez)...
    pushd "%APP_DIR%\server"
    call npm install --omit=dev --no-audit --no-fund
    popd
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=3000
set USBMUSIC_DATA_DIR=%DATA_DIR%

echo [usbmusic] Arrancando en puerto %PORT%
echo [usbmusic] Abre http://localhost:%PORT% en tu navegador
pushd "%APP_DIR%\server"
"%NODE_BIN%" src\index.js
popd
endlocal
