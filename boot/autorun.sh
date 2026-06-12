#!/usr/bin/env bash
# USBMUSIC - Punto de entrada cuando la USB es detectada.
# Llamado por systemd (usbmusic.service) o manualmente desde la USB.
set -euo pipefail

# Directorio raiz de la USB (donde esta este script)
USB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$USB_ROOT/app"
RUNTIME_DIR="$USB_ROOT/runtime"
DATA_DIR="$USB_ROOT/data"

mkdir -p "$DATA_DIR"

log() { printf '[usbmusic] %s\n' "$*"; }

log "USB root: $USB_ROOT"

# 1) Seleccionar binario de Node: del sistema si existe, si no del runtime portatil
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
  log "Usando node del sistema: $NODE_BIN ($($NODE_BIN -v))"
else
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64)   PORTABLE="$RUNTIME_DIR/node-linux-x64/bin/node" ;;
    aarch64|arm64)  PORTABLE="$RUNTIME_DIR/node-linux-arm64/bin/node" ;;
    armv7l|armv6l)  PORTABLE="$RUNTIME_DIR/node-linux-armv7l/bin/node" ;;
    *) log "Arquitectura no soportada: $ARCH"; exit 1 ;;
  esac
  if [[ ! -x "$PORTABLE" ]]; then
    log "No hay node portatil para $ARCH en $PORTABLE"
    log "Instala node (apt install nodejs) o copia un node portatil a runtime/"
    exit 1
  fi
  NODE_BIN="$PORTABLE"
  log "Usando node portatil: $NODE_BIN"
fi

# 2) Confirmar que la app esta ahi
if [[ ! -f "$APP_DIR/server/src/index.js" ]]; then
  log "App no encontrada en $APP_DIR"
  exit 1
fi

# 3) Si no hay node_modules, instalar (solo primera vez en host nuevo)
if [[ ! -d "$APP_DIR/server/node_modules" ]]; then
  log "Instalando dependencias de produccion (primera vez)..."
  if command -v npm >/dev/null 2>&1; then
    (cd "$APP_DIR/server" && npm install --omit=dev --no-audit --no-fund)
  else
    log "ERROR: no hay npm. Empaqueta node_modules dentro de la USB o instala npm en el host."
    exit 1
  fi
fi

# 4) Arrancar el server
export NODE_ENV=production
export PORT="${PORT:-3000}"
export USBMUSIC_DATA_DIR="$DATA_DIR"

cd "$APP_DIR/server"
log "Arrancando en puerto $PORT"
exec "$NODE_BIN" src/index.js
