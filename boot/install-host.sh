#!/usr/bin/env bash
# Instalador de host (Linux / Raspberry Pi).
# Configura una regla udev y un servicio systemd para que el server arranque
# automaticamente cuando se conecta la USB MUSIC.
#
# Uso (una sola vez por host):
#   sudo bash install-host.sh
#
# La regla detecta cualquier USB en cuya raiz exista el archivo marcador
# ".usbmusic-volume". El servicio lanza autorun.sh desde la propia USB.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Necesita sudo: sudo bash $0"
  exit 1
fi

USB_MARKER=".usbmusic-volume"
UDEV_RULE="/etc/udev/rules.d/99-usbmusic.rules"
SYSTEMD_UNIT="/etc/systemd/system/usbmusic@.service"

THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Instalando regla udev en $UDEV_RULE"
cat > "$UDEV_RULE" <<'EOF'
# USBMUSIC: dispara el servicio cuando se monta una USB con el marcador
# .usbmusic-volume en su raiz. El nombre del dispositivo se pasa como instancia.
ACTION=="add", SUBSYSTEM=="block", ENV{ID_FS_USAGE}=="filesystem", \
    RUN+="/bin/sh -c 'sleep 2; for d in /media/*/*/; do [ -f \"$d.usbmusic-volume\" ] && systemctl start usbmusic@$(systemd-escape $d).service; done'"
EOF

echo "==> Instalando unidad systemd en $SYSTEMD_UNIT"
cat > "$SYSTEMD_UNIT" <<'EOF'
[Unit]
Description=USBMUSIC server desde USB montada en %I
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=PORT=3000
# %I es el path de la USB (decodificado por systemd-escape)
ExecStartPre=/bin/sh -c 'test -f /%I/.usbmusic-volume'
ExecStart=/bin/bash /%I/boot/autorun.sh
Restart=on-failure
RestartSec=3
# Usuario sin privilegios (ajusta a tu usuario; por defecto pi)
User=pi
Group=audio

[Install]
WantedBy=multi-user.target
EOF

echo "==> Recargando udev y systemd"
udevadm control --reload-rules
udevadm trigger
systemctl daemon-reload

echo ""
echo "Listo."
echo ""
echo "Para probar manualmente con la USB ya montada:"
echo "  sudo systemctl start usbmusic@\$(systemd-escape /media/\$USER/USBMUSIC/).service"
echo ""
echo "Para ver los logs:"
echo "  journalctl -u 'usbmusic@*' -f"
echo ""
echo "IMPORTANTE: en el archivo de unidad ($SYSTEMD_UNIT) el campo User=pi"
echo "puede necesitar ajustarse a tu usuario actual. Edita y luego:"
echo "  sudo systemctl daemon-reload"
