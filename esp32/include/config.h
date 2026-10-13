#pragma once

// Pines por defecto: ESP32 clasico (ESP32-WROOM-32 / "D1 Mini ESP32").
// Cada entorno de platformio.ini puede sobreescribirlos con -D.

// Lector microSD por SPI (bus VSPI)
#ifndef PIN_SD_SCK
#define PIN_SD_SCK 18
#endif
#ifndef PIN_SD_MISO
#define PIN_SD_MISO 19
#endif
#ifndef PIN_SD_MOSI
#define PIN_SD_MOSI 23
#endif
#ifndef PIN_SD_CS
#define PIN_SD_CS 5
#endif

// DAC I2S externo (PCM5102A): BCK, LCK/WS, DIN
#ifndef PIN_I2S_BCLK
#define PIN_I2S_BCLK 26
#endif
#ifndef PIN_I2S_LRCK
#define PIN_I2S_LRCK 25
#endif
#ifndef PIN_I2S_DOUT
#define PIN_I2S_DOUT 22
#endif

// 1 = DAC interno de 8 bits del ESP32 clasico (salida en GPIO25 y GPIO26).
#ifndef AUDIO_OUTPUT_INTERNAL_DAC
#define AUDIO_OUTPUT_INTERNAL_DAC 0
#endif

// Mantener pulsado al arrancar durante 5 s borra la configuracion (boton BOOT).
#ifndef PIN_RESET_BUTTON
#define PIN_RESET_BUTTON 0
#endif

#define SD_SPI_HZ 20000000
#define MUSIC_DIR "/music"

#define MAX_QUEUE 500
#define MAX_PLAYLISTS 30
#define MAX_LINKS 200
#define MAX_PATH_LEN 240

#define DEFAULT_DEVICE_NAME "USBMusic"
#define FW_VERSION "0.1.0"
