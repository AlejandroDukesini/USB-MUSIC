# USBMusic ESP32 — reproductor Wi-Fi para un parlante antiguo

Firmware para un ESP32 que reproduce MP3/WAV desde su propia tarjeta microSD y se
controla desde el navegador del celular o del PC. Las canciones se suben por Wi-Fi,
así que no hace falta volver a retirar la memoria USB del parlante.

> **Estado:** el firmware **aún no se ha compilado** (la compilación se interrumpió por falta
> de espacio en disco al instalar la toolchain). **Nada se ha probado todavía en hardware real**: el audio en el parlante, el Wi-Fi y la microSD quedan
> pendientes de validar físicamente con su placa.

---

## 1. Auditoría del hardware

### 1.1 ¿Qué es un "ESP32 MINI"?

El nombre se usa para placas muy distintas. Hay que mirar el texto del chip metálico
(o de la placa) para saber cuál es:

| Placa (texto típico) | Chip | CPU / RAM | Bluetooth | DAC interno | USB Host (OTG) | Soporte en este firmware |
|---|---|---|---|---|---|---|
| **"D1 Mini ESP32"**, "MH-ET Live MiniKit" (módulo **ESP32-WROOM-32**) | ESP32 clásico | 2 núcleos 240 MHz, 520 KB SRAM, 4 MB flash | Clásico (A2DP) + BLE | **Sí**, 2 × 8 bits (GPIO25/26) | No (el USB es un conversor USB-serie CH340/CP2104) | `esp32dev` y `esp32dev_dac` — **recomendada** |
| **"ESP32-C3 Super Mini"** | ESP32-C3 | 1 núcleo RISC-V 160 MHz, 400 KB SRAM, 4 MB flash | Solo BLE (sin A2DP) | No | No (USB Serial/JTAG, solo dispositivo) | `esp32c3` (pines sin validar) |
| "LOLIN S2 Mini" | ESP32-S2 | 1 núcleo 240 MHz, 320 KB SRAM, 2 MB PSRAM | No | Sí, 2 × 8 bits | Sí | No incluido |
| "ESP32-S3 Super Mini" | ESP32-S3 | 2 núcleos 240 MHz, 512 KB SRAM | Solo BLE | No | Sí | No incluido |

Datos de las hojas de datos de Espressif (ESP32, ESP32-C3, ESP32-S2, ESP32-S3).
Todas tienen Wi-Fi 802.11 b/g/n **solo en 2,4 GHz**.

### 1.2 El puerto USB del parlante

Los parlantes "con USB para MP3" usan un chip decodificador que actúa como **USB Host
de almacenamiento masivo**: lee una memoria FAT32 y decodifica los MP3 él mismo.
Ese puerto **no es una entrada de audio**:

- No acepta audio digital de un microcontrolador ni dispositivos de audio USB (USB Audio Class)
  salvo que el fabricante lo documente, lo que es muy raro en estos equipos.
- El ESP32 clásico y el C3 **no pueden** presentarse como memoria USB (no tienen USB OTG).
- Un ESP32-S2/S3 sí podría emular una memoria USB (TinyUSB MSC), pero se descartó:
  el parlante seguiría controlando la reproducción con sus botones (el ESP32 no puede
  ordenarle "siguiente" ni "pausa"), cambiar los archivos mientras el parlante los tiene
  montados corrompe su caché de la FAT, y la cola de la web no tendría efecto real.
  **No se ha implementado ninguna emulación USB.**

El puerto USB del parlante solo se usa, como mucho, para **alimentar** el ESP32 con 5 V.

### 1.3 Por dónde entra el audio en el parlante

La ruta de audio fiable es una **entrada analógica de línea** del parlante:

- **Si tiene entrada AUX** (jack 3,5 mm o RCA, a veces marcada "LINE IN"): es lo ideal.
- **Si no tiene AUX**: habría que inyectar la señal en la entrada del amplificador interno
  (abrir el equipo; depende del circuito) o usar un amplificador externo pequeño
  (por ejemplo PAM8403, 2 × 3 W) conectado directamente a los altavoces del parlante.
  Esto solo se debe hacer conociendo el circuito real.

**Dato que falta para cerrar el diseño:** si el parlante tiene entrada AUX/LINE IN
y el texto del chip de su placa ESP32. Mientras tanto, el diseño asume ESP32 clásico +
entrada AUX.

### 1.4 Wi-Fi simultáneo

El ESP32 puede funcionar como estación (conectado a la red de casa) y punto de acceso
a la vez, pero **ambos comparten el mismo canal de radio**: si el router cambia de canal
o el ESP32 busca la red, los clientes del punto de acceso se desconectan. Por eso el
firmware no los mantiene a la vez de forma permanente (ver [sección 3](#3-arquitectura-de-red)).

---

## 2. Arquitectura de audio elegida

| Opción | Qué es | Coste aprox.* | Calidad | Veredicto |
|---|---|---|---|---|
| **A1. DAC I2S PCM5102A → AUX** | El ESP32 decodifica MP3/WAV de la microSD y envía audio digital I2S a un DAC de 16-32 bits con salida de línea (~2,1 Vrms) | 4–7 USD (DAC) + 1–2 USD (lector microSD) + tarjeta | Alta (SNR 112 dB según TI) | **Principal** |
| **A2. DAC interno de 8 bits → AUX** | La misma decodificación, salida por GPIO25/26 con un condensador y un divisor | < 1 USD en componentes + lector microSD | Baja: 8 bits, ruido audible en pasajes suaves | **Alternativa económica** |
| B. Receptor Bluetooth independiente → AUX | El teléfono envía su audio (YouTube, Spotify, lo que sea) a un receptor BT conectado al parlante | 3–10 USD | La del códec BT (SBC/AAC) | **Complemento** para contenido online |
| C. Puerto USB del parlante | Emular una memoria USB | — | — | Descartada (ver 1.2) |
| D. Equipo de red más capaz (Raspberry Pi, receptor Spotify Connect comercial) | Linux o equipo certificado | 25–60 USD o más | Alta | Solo si se quiere Spotify Connect/AirPlay; fuera del objetivo de bajo coste |

\* Precios orientativos de tiendas de componentes en 2025-2026; varían por país.

**Por qué esta elección:** el ESP32 clásico decodifica MP3 por software con margen
(la librería ESP8266Audio lo hace en un núcleo), tiene I2S y DAC propios, y un lector
microSD por SPI le da almacenamiento de gigabytes. La flash interna (4 MB) no alcanza
para una biblioteca musical: solo guarda firmware, cola, listas y ajustes.

### Formatos

| Formato | Soporte |
|---|---|
| MP3 (MPEG-1/2 Layer III, CBR y VBR, hasta 320 kbps) | Sí (decodificador libmad de ESP8266Audio) |
| WAV PCM 8/16 bits | Sí |
| AAC, M4A, FLAC, OGG, WMA | No: conviértalos a MP3 antes de subirlos |

---

## 3. Arquitectura de red

| Situación | Comportamiento | Dirección del panel |
|---|---|---|
| Primer arranque o sin red configurada | **Modo A:** crea su propia red `USBMusic-XXXXXX` (WPA2) | `http://192.168.4.1` |
| Red doméstica configurada y disponible | **Modo B:** se conecta como estación; no hay punto de acceso | `http://<IP>` o `http://usbmusic.local` |
| Red doméstica caída más de 30 s | Levanta su red propia de respaldo; reintenta la de casa cada 60 s **solo si no hay nadie conectado** a la red propia | `http://192.168.4.1` |
| Vuelve la red doméstica | Apaga la red de respaldo (si nadie la usa) | IP doméstica |

- La IP en modo B la asigna el router; se muestra en el monitor serie y en Ajustes.
  `usbmusic.local` funciona en Windows 10/11, iOS y macOS; en Android depende de la
  versión (Android 12+ suele resolverlo). Si no funciona, reserve una IP fija en el router.
- El indicador **Internet** del panel lo calcula el propio ESP32 consultando
  `connectivitycheck.gstatic.com/generate_204` cada 20-60 s.
- En modo A el celular suele avisar de "red sin Internet"; acepte quedarse conectado.
  En ese modo YouTube/Spotify **no** están disponibles desde el panel.

---

## 4. Componentes y conexiones

### 4.1 Lista de componentes

| Componente | Especificación | Necesario |
|---|---|---|
| Placa ESP32 clásico | ESP32-WROOM-32, 4 MB flash (p. ej. "D1 Mini ESP32") | Sí |
| Lector microSD SPI | Módulo a 3,3 V (o con regulador y adaptador de nivel) | Sí |
| Tarjeta microSD | 4–32 GB, **FAT32** (las de 64 GB+ vienen en exFAT: reformatear a FAT32) | Sí |
| DAC I2S | Módulo **PCM5102A** (placa morada "GY-PCM5102") con salida jack 3,5 mm | Opción A1 |
| Cable de audio | Jack 3,5 mm macho-macho (o 3,5 mm a 2×RCA) | Sí |
| Para opción A2 | 2 condensadores electrolíticos 10 µF, resistencias 10 kΩ y 4,7 kΩ (×2) | Opción A2 |
| Fuente | 5 V ≥ 500 mA por USB (cargador o el propio puerto USB del parlante si da suficiente corriente) | Sí |
| Receptor Bluetooth de audio | Con salida jack 3,5 mm y alimentación 5 V USB | Opcional (YouTube/Spotify en el parlante) |

### 4.2 Conexiones (ESP32 clásico, entorno `esp32dev`)

```
 ESP32 (WROOM-32)            Lector microSD           PCM5102A (GY-PCM5102)
 ----------------            --------------           ---------------------
 3V3  ───────────────────────  VCC (3,3 V)  ───────── VIN
 GND  ───────────────────────  GND          ───────── GND
 GPIO18 ─────────────────────  SCK                    SCK ── GND (sin MCLK)
 GPIO19 ─────────────────────  MISO
 GPIO23 ─────────────────────  MOSI
 GPIO5  ─────────────────────  CS
 GPIO26 ────────────────────────────────────────────  BCK
 GPIO25 ────────────────────────────────────────────  LCK (LRCK / WS)
 GPIO22 ────────────────────────────────────────────  DIN
                                                      Jack 3,5 mm ──► AUX del parlante
```

Puentes de soldadura del PCM5102A (cara trasera): **H1L, H2L, H3H, H4L**
(FLT=normal, DEMP=off, **XSMT=alto (sin silencio)**, FMT=I2S). Si XSMT queda en bajo, el
DAC está silenciado y no sonará nada. Algunas placas ya traen estos puentes hechos:
compruébelo con un polímetro.

> El ESP32 trabaja a 3,3 V. No conecte salidas de 5 V a sus pines. No conecte la salida
> del DAC a un altavoz directamente: es salida de línea y necesita el amplificador del parlante.

### 4.3 Opción económica: DAC interno (entorno `esp32dev_dac`)

Sin PCM5102A. La salida del DAC interno va de 0 a 3,3 V con una componente continua de
~1,65 V: hay que bloquearla y atenuarla a nivel de línea (≈1 V pico a pico):

```
 GPIO25 ──┤+ 10 µF ├── 10 kΩ ──┬──► Punta del jack (canal izquierdo)
                               4,7 kΩ
                               │
 GND ──────────────────────────┴──► Manguito del jack (masa)

 GPIO26: el mismo circuito ──► Anillo del jack (canal derecho)
```

Con esta opción, GPIO25/26 quedan ocupados por el audio (no se usa I2S externo).
**Circuito no validado en hardware**: si suena distorsionado, aumente la resistencia de 10 kΩ.

### 4.4 Audio de YouTube/Spotify en el parlante (opcional)

Conecte un receptor Bluetooth a la AUX. Si el parlante tiene **una sola** entrada AUX y
quiere dejar el ESP32 y el receptor conectados a la vez, use un mezclador pasivo:
cada canal de cada fuente pasa por una resistencia de 4,7 kΩ hacia el canal
correspondiente del jack de salida, con masas comunes. Baja algo el volumen, pero no
daña ninguna salida. Alternativa: un conmutador de jack 3,5 mm.

### 4.5 ESP32-C3 Super Mini (entorno `esp32c3`)

microSD: SCK=4, MISO=5, MOSI=6, CS=7. PCM5102A: BCK=0, LCK=1, DIN=3. Botón de borrado: GPIO9 (BOOT).
Requiere PCM5102A (no tiene DAC interno). Un solo núcleo comparte audio y Wi-Fi:
**sin validar**, podría haber cortes con la web muy activa.

---

## 5. Instalación de herramientas y flasheo (Windows)

1. Instale **Visual Studio Code** y la extensión **PlatformIO IDE**
   (o solo la CLI: `pip install platformio`).
2. Si Windows no reconoce la placa, instale el driver del conversor USB-serie de su placa:
   CH340 (WCH) o CP210x (Silicon Labs).
3. Abra la carpeta `esp32/` en VS Code.
4. Compile y suba. La primera vez descarga e instala herramientas: **reserve al menos 5 GB libres**.
   En Windows ejecute `pio` desde PowerShell o CMD, **no desde Git Bash** (pioarduino no admite MSYS):

```sh
cd esp32
pio run -e esp32dev -t upload        # con PCM5102A
pio run -e esp32dev_dac -t upload    # alternativa con DAC interno
pio device monitor                   # monitor serie, 115200 baudios
```

Si la subida no arranca, mantenga pulsado el botón **BOOT** de la placa al empezar a subir.

El firmware usa Arduino-ESP32 3.x (ESP-IDF 5.x) mediante la plataforma *pioarduino*,
fijada a una versión concreta en `platformio.ini`. La librería de audio es
ESP8266Audio 2.4.2. Se eligió Arduino porque ESP8266Audio, `WebServer`, `LittleFS` y
`Preferences` cubren todo lo necesario sin mezclar APIs de ESP-IDF directamente.

---

## 6. Primera configuración

1. Conecte la placa por USB y abra el monitor serie (115200). Al arrancar verá:
   ```
   Configuracion inicial. Clave de la red 'USBMusic-XXXXXX' y del panel: abcd2345ef
   ```
2. En el celular o PC, conéctese a la red `USBMusic-XXXXXX` con esa clave.
3. Abra `http://192.168.4.1`, entre con la misma clave y **elija una clave de panel nueva**
   (obligatorio; hasta entonces el panel no permite otras acciones).
4. En **Ajustes → Red Wi-Fi doméstica**, pulse *Buscar redes*, elija la suya, escriba la
   clave y guarde. El equipo se reinicia y se conecta a su red.
5. Vuelva a la red de casa y abra `http://usbmusic.local` o la IP que muestra el monitor serie.
6. Recomendado: en **Ajustes → Red propia** cambie la clave del punto de acceso de respaldo.

**Borrar toda la configuración:** mantenga pulsado **BOOT** (GPIO0) durante 5 s mientras
la placa arranca (pulse RESET con BOOT presionado y siga sujetándolo). Se generará una clave
inicial nueva. Las canciones de la microSD no se borran.

Las claves Wi-Fi se guardan en la NVS del ESP32, nunca en el código ni en la web, y no se
devuelven por la API ni salen en los registros. La clave del panel se guarda como SHA-256
con sal.

---

## 7. Uso

### Android (Chrome) y Windows (Edge/Chrome/Firefox)

- **Reproducir:** canción actual, progreso aproximado, ⏮ ⏯ ⏭ ⏹, volumen, repetición
  (no / toda la cola / una canción) y aleatorio.
- **Cola:** tocar una canción la reproduce; ↑ ↓ reordenan; ✕ quita. *Guardar como lista*.
  La cola y la canción en curso se recuperan tras reiniciar.
- **Música:** navega por las carpetas de la microSD (`/music`), sube MP3/WAV desde el
  teléfono o el PC (varios a la vez), crea carpetas, borra, añade canciones o carpetas
  completas a la cola o como "siguiente".
- **Listas:** guardar la cola, cargarla (reemplazando o añadiendo) y borrar listas.
- **Enlaces:** pegue un enlace de YouTube o Spotify; ver la matriz siguiente.
- **Ajustes:** estado, nombre, tema claro/oscuro/automático, Wi-Fi, claves, actualización de firmware.

Consejo: en Android, menú de Chrome → *Añadir a pantalla de inicio* para abrirlo como una app.
Para cargar muchas canciones de una vez es más rápido sacar la microSD y copiarlas en el PC
(carpeta `music/` de la tarjeta); para el día a día basta con la web.

---

## 8. Matriz de compatibilidad

| Contenido | Guardar en la web | Metadatos | Abrir en la app oficial | Reproductor oficial en la página | Suena por el ESP32 | Cómo llega al parlante |
|---|---|---|---|---|---|---|
| MP3 / WAV en la microSD | Sí (cola y listas) | Nombre de archivo y etiquetas ID3v2 Latin-1 | — | — | **Sí** | ESP32 → DAC → AUX |
| Vídeo / lista de YouTube | Sí | oEmbed oficial, si el teléfono/PC tiene Internet | Sí | Sí (youtube-nocookie, con anuncios y restricciones del servicio) | **No** | Teléfono/PC → receptor Bluetooth → AUX |
| Canción / álbum / lista / pódcast de Spotify | Sí | oEmbed oficial, si hay Internet | Sí | Sí (embed: vista previa sin sesión, completo con sesión según la cuenta) | **No** | App de Spotify → receptor Bluetooth → AUX |
| Enlaces cortos `spotify.link` | No (se pide la URL `open.spotify.com`) | — | — | — | No | — |
| Otras webs, MP3 por URL | No | — | — | — | No | — |

Por qué YouTube y Spotify no suenan en el ESP32:

- **YouTube:** sus condiciones de los Servicios de API prohíben separar el audio del vídeo
  y descargar o reproducir el contenido fuera de su reproductor. No existe una API oficial
  de audio para microcontroladores. El reproductor insertado suena en el navegador
  del teléfono/PC, no en el ESP32.
- **Spotify:** la Web API solo **controla** dispositivos Spotify Connect (requiere Premium).
  Ser un dispositivo Connect exige el SDK de Spotify para fabricantes certificados,
  no disponible para este proyecto. Las implementaciones no oficiales infringen sus
  condiciones y no se usan.

El ESP32 **nunca** descarga nada de esos servicios: solo guarda servicio, tipo e
identificador validados. Los metadatos los consulta el navegador directamente.

---

## 9. Seguridad

- El panel solo escucha en la red local; no se abre ningún puerto en el router.
- Todas las rutas de la API (salvo `/api/info` y `/api/login`) exigen un token en la cabecera
  `X-Token`. Al ser una cabecera personalizada, otra web abierta en el navegador no puede
  enviar órdenes al equipo (CORS no concedido), lo que evita CSRF.
- 5 claves erróneas seguidas bloquean el acceso 30 s. Cambiar la clave cierra las demás sesiones.
- No hay ejecución de comandos ni peticiones salientes a direcciones elegidas por el usuario
  (sin SSRF). Rutas de archivos limitadas a `/music`, sin `..`.
- CSP restrictiva: solo se permiten imágenes y reproductores de los dominios oficiales.
- **Limitaciones conocidas:** el panel usa HTTP sin cifrar (la clave viaja protegida solo por el
  WPA2 de la red); la NVS no está cifrada (alguien con acceso físico a la placa puede leer
  las claves Wi-Fi); la actualización OTA comprueba la integridad de la imagen pero no una
  firma criptográfica. El cifrado de flash y el arranque seguro del ESP32 son posibles,
  pero son irreversibles y no se activan por defecto.

---

## 10. Pruebas

### Realizadas (sin hardware)

| Prueba | Resultado |
|---|---|
| Compilación del firmware `esp32dev` (pioarduino 55.03.311, Arduino-ESP32 3.3.11, ESP8266Audio 2.4.1) | **Pendiente**: dependencias resueltas, pero la instalación de la toolchain falló por disco lleno (`WinError 112`) |
| Sintaxis del JavaScript de la interfaz (`node --check`) | OK |
| Analizador de enlaces: 15 casos (YouTube watch/youtu.be/shorts/music/listas, Spotify con `intl-es`, URI `spotify:`, dominios falsos tipo `youtube.com.evil.com`, `javascript:`, IDs inválidos, IP local) | 15/15 OK |

### Pendientes en hardware (protocolo)

| # | Prueba | Cómo verificarla | Estado |
|---|---|---|---|
| 1 | Arranque | Monitor serie muestra versión, microSD y clave inicial | Pendiente |
| 2 | Wi-Fi | Modo A: conectar a `USBMusic-XXXXXX`; modo B: IP en el monitor serie | Pendiente |
| 3 | Android | Chrome → panel, login, cambio de clave | Pendiente |
| 4 | Windows | Edge/Chrome → `http://usbmusic.local` | Pendiente |
| 5 | Cola | Añadir, quitar, ↑↓ con dos navegadores abiertos: ambos se actualizan en ≤ 2 s | Pendiente |
| 6 | Listas | Guardar, cargar, añadir, borrar | Pendiente |
| 7 | Reinicio | Desenchufar; al volver se conservan cola, canción, volumen, listas, Wi-Fi | Pendiente |
| 8 | Desconexión Wi-Fi | Apagar el router: a los ~30 s aparece la red propia; al encenderlo vuelve a casa | Pendiente |
| 9 | Enlaces no compatibles | `spotify.link`, otras webs: mensaje claro, no se guardan | Pendiente (lógica probada en Node) |
| 10 | Memoria | Ajustes → *Memoria libre* (mínimo) tras 8 h reproduciendo y usando la web; el monitor serie registra el heap cada 5 min | Pendiente |
| 11 | Archivo local | Subir un MP3 de 128 y uno de 320 kbps; medir la velocidad que muestra la web | Pendiente |
| 12 | **Audio en el parlante** | Escuchar por la AUX con el PCM5102A (y la variante DAC interno) | **Pendiente: es el criterio de éxito** |

---

## 11. Limitaciones conocidas

- Solo MP3 y WAV. Las etiquetas ID3 en UTF-16 no se muestran (se usa el nombre del archivo).
- El progreso es aproximado (por bytes leídos); no hay barra de búsqueda dentro de la pista.
- No hay portadas de MP3 locales (extraerlas consumiría demasiada RAM).
- Volumen digital 0-100 % sin amplificación; el volumen fuerte lo da el parlante.
- Límites: 500 canciones en la cola y por lista, 30 listas, 200 enlaces, ~896 KB para listas.
- La subida de archivos por Wi-Fi está limitada por el ESP32 y la tarjeta (velocidad sin medir todavía).
- La interfaz se actualiza por sondeo cada 2 s (10 s en segundo plano), no en tiempo real.
- Un solo cliente HTTP a la vez: con varias pestañas abiertas las respuestas pueden tardar algo más.

## 12. Estructura

```
esp32/
├── platformio.ini      Entornos: esp32dev (PCM5102A), esp32dev_dac (DAC interno), esp32c3
├── partitions.csv      2 × 1,5 MB app (OTA) + 896 KB LittleFS + coredump
├── include/config.h    Pines y límites
├── src/
│   ├── main.cpp        Arranque, botón de borrado, bucle principal
│   ├── net.*           Modo A/B, red de respaldo, mDNS, comprobación de Internet
│   ├── settings.*      NVS: ajustes, claves, sesiones
│   ├── storage.*       microSD (música) y LittleFS (cola, listas, enlaces)
│   ├── player.*        Tarea de audio (MP3/WAV → I2S o DAC), cola, repetición, aleatorio
│   ├── web.*           Servidor HTTP, API, subida de archivos, OTA
│   └── util.*          JSON, validación de rutas, hash
└── web/index.html      Interfaz (HTML/CSS/JS sin dependencias, embebida en el firmware)
```

### API local

Todas devuelven JSON. `POST` con cuerpo `application/x-www-form-urlencoded`.

| Ruta | Método | Parámetros |
|---|---|---|
| `/api/info` | GET | — (sin sesión) |
| `/api/login` | POST | `password` |
| `/api/logout`, `/api/reboot` | POST | — |
| `/api/password` | POST | `current`, `new` |
| `/api/status` | GET | — |
| `/api/player` | POST | `action` = play/pause/toggle/stop/next/prev/index, `index` |
| `/api/volume` | POST | `value` 0-100 |
| `/api/mode` | POST | `repeat` 0-2, `shuffle` 0/1 |
| `/api/queue` | GET | — |
| `/api/queue/add` | POST | `path` (repetible) o `dir`, `next`=1 |
| `/api/queue/remove` · `/move` · `/clear` | POST | `index` · `from`,`to` · — |
| `/api/files` | GET | `dir`, `offset` |
| `/api/files/delete` · `/mkdir` | POST | `path` · `dir`,`name` |
| `/api/upload?dir=` | POST | multipart `file` |
| `/api/playlists` · `/api/playlist?name=` | GET | — |
| `/api/playlists/save` · `/load` · `/delete` | POST | `name` (`mode=append` en load) |
| `/api/links` · `/api/links/add` · `/delete` | GET/POST | `service`,`kind`,`id`,`title` · `index` |
| `/api/settings` | GET/POST | `deviceName`, `theme` |
| `/api/wifi/scan` · `/api/wifi` · `/api/appass` | GET/POST | — · `ssid`,`password` · `password` |
| `/api/ota` | POST | multipart `firmware.bin` |
