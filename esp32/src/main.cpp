// USBMUSIC ESP32: reproductor de MP3/WAV desde microSD, controlado por Wi-Fi.
#include <Arduino.h>
#include <WiFi.h>
#include "config.h"
#include "net.h"
#include "player.h"
#include "settings.h"
#include "storage.h"
#include "web.h"

static bool resetButtonHeld() {
  pinMode(PIN_RESET_BUTTON, INPUT_PULLUP);
  uint32_t t0 = millis();
  while (digitalRead(PIN_RESET_BUTTON) == LOW) {
    if (millis() - t0 > 5000) return true;
    delay(50);
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nUSBMUSIC ESP32 v%s\n", FW_VERSION);

  // La radio encendida hace que esp_random() sea aleatorio real (claves iniciales).
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  settingsBegin();
  WiFi.mode(WIFI_OFF);

  if (resetButtonHeld()) {
    Serial.println("Boton mantenido 5 s: borrando configuracion y reiniciando");
    settingsFactoryReset();
    delay(200);
    ESP.restart();
  }

  storageBegin();
  playerBegin();
  netBegin();
  webBegin();

  NetStatus n = netStatus();
  if (n.staConnected) Serial.printf("Panel: http://%s  (o http://%s.local)\n", n.staIp.c_str(), n.hostname.c_str());
  if (n.apActive) Serial.printf("Red propia: '%s'  Panel: http://%s\n", n.apSsid.c_str(), n.apIp.c_str());

  // Solo se muestra mientras no se haya cambiado la clave inicial.
  String code = settingsInitialCode();
  if (!code.isEmpty()) {
    Serial.println("------------------------------------------------------------");
    Serial.printf("Configuracion inicial. Clave de la red '%s' y del panel: %s\n", n.apSsid.c_str(), code.c_str());
    Serial.println("Cambiela desde el panel; despues no se volvera a mostrar.");
    Serial.println("------------------------------------------------------------");
  }
}

void loop() {
  webLoop();
  netLoop();
  storageLoop();
  playerLoop();

  static uint32_t lastHeapLog = 0;
  if (millis() - lastHeapLog > 300000) {
    lastHeapLog = millis();
    log_i("Heap libre %u B, minimo %u B, bloque mayor %u B", ESP.getFreeHeap(), ESP.getMinFreeHeap(), ESP.getMaxAllocHeap());
  }
  delay(2);
}
