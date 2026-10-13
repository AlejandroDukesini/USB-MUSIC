#pragma once
#include <Arduino.h>

struct NetStatus {
  bool staConfigured;
  bool staConnected;
  bool apActive;
  bool internet;
  String ssid;
  String staIp;
  String apIp;
  String apSsid;
  String hostname;
  int rssi;
};

void netBegin();
void netLoop();
NetStatus netStatus();

// Escaneo asincrono: devuelve JSON de redes o null si sigue escaneando.
String netScanJson();
