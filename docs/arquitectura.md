# Arquitectura USBMUSIC

## Componentes

```
+------------------------------------------------------------------+
|                          USB (4 GB)                              |
|  /                                                               |
|  |- .usbmusic-volume         <- marcador para udev               |
|  |- autorun.sh / autorun.bat <- entry points                     |
|  |- README.txt                                                   |
|  |- app/                                                         |
|  |   |- server/                                                  |
|  |   |   |- src/             (Fastify + WebSocket + SQLite)      |
|  |   |   `- node_modules/    (~30 MB, produccion solo)           |
|  |   `- web/dist/             (estaticos React, ~1 MB)           |
|  |- runtime/                  (opcional, ~30 MB por arch)        |
|  |   |- node-linux-x64/                                          |
|  |   |- node-linux-arm64/                                        |
|  |   `- node-win-x64/                                            |
|  |- host-setup/                                                  |
|  |   |- install-host.sh                                          |
|  |   `- systemd/                                                 |
|  |- data/                    (SQLite + cache, se crea al correr) |
|  `- config/default.json                                          |
+------------------------------------------------------------------+
```

Tamano total esperado:

- Sin runtimes: ~50-80 MB
- Con Node portable para Linux x64 + ARM64: ~150 MB
- Con los 3 runtimes (Linux x64, ARM64, Windows x64): ~250 MB

Holgado en 4 GB. La cache de audio (si se usa `yt-dlp`) NO va en la USB para
no desgastarla; va en el filesystem del host (`/var/cache/usbmusic`).

## Flujo de arranque (Linux)

```
Usuario inserta USB
        |
        v
Kernel detecta block device --> udev evalua reglas
        |
        v
99-usbmusic.rules empareja "ID_FS_USAGE=filesystem"
        |
        v
Sistema monta automaticamente la USB (gvfs / udisks)
        |
        v
udev RUN+= busca .usbmusic-volume en /media/*/*/
        |
        v
systemctl start usbmusic@<path-escapado>.service
        |
        v
Service ejecuta /<path>/boot/autorun.sh
        |
        v
autorun.sh elige Node (sistema o portable) y lanza el server
        |
        v
Server escucha en :3000 sobre 0.0.0.0
        |
        v
WebSocket + UI listos para clientes WiFi
```

## Flujo de reproduccion

```
Cliente (movil) --HTTP--> /api/youtube/search?q=...
        |
        v
Server consulta yt-search --> devuelve resultados
        |
        v
Cliente --POST /api/player/play--> Server actualiza estado + history
        |
        v
Server --WS broadcast--> todos los clientes (incluyendo el "host display")
        |
        v
El cliente que actua como "salida" (el navegador en el host con conexion
fisica al parlante) recibe el estado, carga el video en su iframe oculto de
YouTube IFrame Player API y reproduce. El audio sale por la tarjeta del host.
```

## Decisiones tecnicas

- **Fastify vs Express:** Fastify pesa ~3 MB menos y es 2-3x mas rapido.
- **better-sqlite3 vs sqlite3:** sincrono, sin callbacks, mas pequeno, mas
  rapido en hardware modesto (Raspberry Pi).
- **ws nativo vs socket.io:** socket.io trae mucho codigo cliente que no
  necesitamos. Un ws plano y un loop de reconexion bastan.
- **Vite vs Next.js:** Next.js requiere su propio runtime; Vite solo
  compila a estaticos servidos por Fastify. Menos piezas, menos tamano.
- **OAuth Spotify guardado cifrado:** los tokens van en SQLite. Si la
  USB cae en manos ajenas, no exponen la cuenta sin la contrasena admin.

## Lo que NO esta incluido (deuda tecnica conocida)

1. **Audio nativo de Spotify** (requiere `librespot`, fuera de scope inicial).
2. **Ecualizador**: requiere capturar audio del navegador, complejo en navegadores.
3. **Cron real para schedules**: hay tabla y API; falta el ejecutor (revisar
   `node-cron` mas adelante).
4. **HTTPS local**: para Service Workers / PWA conviene cert autofirmado.
5. **mDNS (`usbmusic.local`)**: documentado, pendiente integrar `bonjour-service`.
6. **Cifrado de tokens Spotify**: por simplicidad estan en texto plano en
   SQLite. Endurecer con `crypto.subtle` cuando haya tiempo.
