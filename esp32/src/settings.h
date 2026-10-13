#pragma once
#include <Arduino.h>

// Configuracion persistente en NVS. Las claves Wi-Fi y el hash de la
// contrasena de administrador nunca se envian a la interfaz ni a los logs.
struct Settings {
  String deviceName;
  String staSsid;
  String staPass;
  String apPass;
  String theme;     // "auto" | "dark" | "light"
  uint8_t volume;   // 0..100
  uint8_t repeat;   // 0 = no, 1 = toda la cola, 2 = una cancion
  bool shuffle;
  bool setupDone;   // false hasta que el usuario cambia la clave inicial
};

extern Settings settings;

// Debe llamarse con la radio ya iniciada (WiFi.mode) para que esp_random sea aleatorio real.
void settingsBegin();
void settingsSave();
void settingsFactoryReset();

bool settingsCheckPassword(const String& pass);
void settingsSetPassword(const String& pass);  // tambien revoca todas las sesiones
String settingsInitialCode();                  // vacio cuando setupDone

String authIssueToken();
bool authCheckToken(const String& token);
void authRevokeToken(const String& token);
