#include "net.h"
#include "settings.h"
#include "util.h"
#include <WiFi.h>
#include <ESPmDNS.h>

// Politica de red:
// - Sin red domestica configurada: solo punto de acceso (Modo A).
// - Con red configurada: solo estacion (Modo B). Si se pierde la red durante 30 s,
//   se levanta el punto de acceso de respaldo para no dejar el equipo inaccesible.
//   Mientras haya clientes en el AP no se reintenta la conexion (los reintentos
//   cambian de canal y desconectarian a esos clientes).

static bool apActive = false;
static uint32_t lastStaUp = 0;
static uint32_t apSince = 0;
static uint32_t lastRetry = 0;
static volatile bool internetOk = false;
static String hostname;
static String apSsid;

static String makeHostname(const String& name) {
  String h;
  for (size_t i = 0; i < name.length() && h.length() < 24; i++) {
    char c = tolower(name[i]);
    if (isalnum(c)) h += c;
    else if ((c == ' ' || c == '-' || c == '_') && !h.isEmpty() && !h.endsWith("-")) h += '-';
  }
  while (h.endsWith("-")) h.remove(h.length() - 1);
  return h.isEmpty() ? String("usbmusic") : h;
}

static void startAp() {
  WiFi.mode(settings.staSsid.isEmpty() ? WIFI_AP : WIFI_AP_STA);
  WiFi.setAutoReconnect(false);
  if (WiFi.softAP(apSsid.c_str(), settings.apPass.c_str())) {
    apActive = true;
    apSince = millis();
    log_i("Punto de acceso '%s' activo en %s", apSsid.c_str(), WiFi.softAPIP().toString().c_str());
  } else {
    log_e("No se pudo iniciar el punto de acceso");
  }
}

static void stopAp() {
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  apActive = false;
  log_i("Punto de acceso de respaldo desactivado (estacion conectada)");
}

static void internetTask(void*) {
  for (;;) {
    bool ok = false;
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClient c;
      if (c.connect("connectivitycheck.gstatic.com", 80, 3000)) {
        c.print("GET /generate_204 HTTP/1.1\r\nHost: connectivitycheck.gstatic.com\r\nConnection: close\r\n\r\n");
        uint32_t t0 = millis();
        while (!c.available() && c.connected() && millis() - t0 < 3000) vTaskDelay(pdMS_TO_TICKS(50));
        ok = c.available() && c.readStringUntil('\n').indexOf(" 204") > 0;
        c.stop();
      }
    }
    internetOk = ok;
    vTaskDelay(pdMS_TO_TICKS(ok ? 60000 : 20000));
  }
}

void netBegin() {
  hostname = makeHostname(settings.deviceName);
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  apSsid = settings.deviceName.substring(0, 26) + "-" + mac.substring(8);

  WiFi.setHostname(hostname.c_str());
  if (settings.staSsid.isEmpty()) {
    startAp();
  } else {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(settings.staSsid.c_str(), settings.staPass.c_str());
    log_i("Conectando a la red '%s'...", settings.staSsid.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(100);
    if (WiFi.status() == WL_CONNECTED) {
      lastStaUp = millis();
      log_i("Conectado. IP: %s", WiFi.localIP().toString().c_str());
    } else {
      log_w("No se pudo conectar a la red domestica; activando punto de acceso");
      startAp();
      lastRetry = millis();
    }
  }

  if (MDNS.begin(hostname.c_str())) {
    MDNS.addService("http", "tcp", 80);
  } else {
    log_w("mDNS no disponible");
  }
  xTaskCreate(internetTask, "inet", 4096, nullptr, 1, nullptr);
}

void netLoop() {
  if (settings.staSsid.isEmpty()) return;
  uint32_t now = millis();
  if (WiFi.status() == WL_CONNECTED) {
    lastStaUp = now;
    if (apActive && now - apSince > 60000 && WiFi.softAPgetStationNum() == 0) stopAp();
    return;
  }
  if (!apActive && now - lastStaUp > 30000) {
    log_w("Red domestica perdida durante 30 s; activando punto de acceso de respaldo");
    startAp();
    lastRetry = now;
  }
  if (apActive && WiFi.softAPgetStationNum() == 0 && now - lastRetry > 60000) {
    lastRetry = now;
    log_i("Reintentando conexion a '%s'", settings.staSsid.c_str());
    WiFi.begin(settings.staSsid.c_str(), settings.staPass.c_str());
  }
}

NetStatus netStatus() {
  NetStatus s;
  s.staConfigured = !settings.staSsid.isEmpty();
  s.staConnected = WiFi.status() == WL_CONNECTED;
  s.apActive = apActive;
  s.internet = s.staConnected && internetOk;
  s.ssid = settings.staSsid;
  s.staIp = s.staConnected ? WiFi.localIP().toString() : String();
  s.apIp = apActive ? WiFi.softAPIP().toString() : String();
  s.apSsid = apSsid;
  s.hostname = hostname;
  s.rssi = s.staConnected ? WiFi.RSSI() : 0;
  return s;
}

String netScanJson() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return String();
  if (n < 0) {
    WiFi.scanNetworks(true);
    return String();
  }
  String o = "[";
  int count = 0;
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.isEmpty()) continue;
    bool dup = false;
    for (int j = 0; j < i; j++) dup |= WiFi.SSID(j) == ssid;
    if (dup) continue;
    if (count++) o += ',';
    o += "{\"ssid\":" + jsonStr(ssid) + ",\"rssi\":" + String(WiFi.RSSI(i)) +
         ",\"open\":" + (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "true" : "false") + "}";
  }
  o += ']';
  WiFi.scanDelete();
  return o;
}
