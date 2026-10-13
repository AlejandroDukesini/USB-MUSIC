#pragma once
#include <Arduino.h>

// Texto entre comillas y escapado para JSON.
String jsonStr(const String& s);

// Ruta absoluta dentro de MUSIC_DIR, sin "..", sin caracteres de control.
bool isSafeMusicPath(const String& p);
bool isSupportedAudio(const String& p);
String baseName(const String& p);

// Nombre de archivo ASCII seguro para FAT (translitera acentos comunes).
String sanitizeFileName(const String& name);

// Los marcos ID3 no Unicode vienen en ISO-8859-1.
String latin1ToUtf8(const char* s);

String randomHex(size_t bytes);
String sha256Hex(const String& s);
bool constTimeEq(const String& a, const String& b);
