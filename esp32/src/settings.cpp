#include "settings.h"
#include "config.h"
#include "util.h"
#include <Preferences.h>
#include <esp_random.h>

Settings settings;

static Preferences prefs;
static const char* NS = "usbmusic";
static const size_t MAX_TOKENS = 4;
static String tokens[MAX_TOKENS];

static String randomCode(size_t len) {
  // Sin caracteres ambiguos (0/O, 1/l/I)
  static const char alphabet[] = "abcdefghjkmnpqrstuvwxyz23456789";
  String o;
  for (size_t i = 0; i < len; i++) o += alphabet[esp_random() % (sizeof(alphabet) - 1)];
  return o;
}

static void loadTokens() {
  String all = prefs.getString("tokens", "");
  size_t n = 0;
  int start = 0;
  while (n < MAX_TOKENS && start < (int)all.length()) {
    int end = all.indexOf(',', start);
    if (end < 0) end = all.length();
    tokens[n++] = all.substring(start, end);
    start = end + 1;
  }
}

static void saveTokens() {
  String all;
  for (auto& t : tokens) {
    if (t.isEmpty()) continue;
    if (!all.isEmpty()) all += ',';
    all += t;
  }
  prefs.putString("tokens", all);
}

void settingsBegin() {
  prefs.begin(NS, false);
  if (!prefs.isKey("salt")) {
    String code = randomCode(10);
    prefs.putString("salt", randomHex(16));
    prefs.putString("initcode", code);
    prefs.putString("appass", code);
    prefs.putBool("setup", false);
    settingsSetPassword(code);
    log_i("Primer arranque: configuracion inicial creada");
  }
  settings.deviceName = prefs.getString("name", DEFAULT_DEVICE_NAME);
  settings.staSsid = prefs.getString("ssid", "");
  settings.staPass = prefs.getString("pass", "");
  settings.apPass = prefs.getString("appass", "");
  settings.theme = prefs.getString("theme", "auto");
  settings.volume = prefs.getUChar("vol", 60);
  settings.repeat = prefs.getUChar("repeat", 0);
  settings.shuffle = prefs.getBool("shuffle", false);
  settings.setupDone = prefs.getBool("setup", false);
  loadTokens();
}

void settingsSave() {
  prefs.putString("name", settings.deviceName);
  prefs.putString("ssid", settings.staSsid);
  prefs.putString("pass", settings.staPass);
  prefs.putString("appass", settings.apPass);
  prefs.putString("theme", settings.theme);
  prefs.putUChar("vol", settings.volume);
  prefs.putUChar("repeat", settings.repeat);
  prefs.putBool("shuffle", settings.shuffle);
  prefs.putBool("setup", settings.setupDone);
  if (settings.setupDone) prefs.remove("initcode");
}

void settingsFactoryReset() {
  prefs.clear();
}

bool settingsCheckPassword(const String& pass) {
  String h = sha256Hex(prefs.getString("salt", "") + pass);
  return constTimeEq(h, prefs.getString("hash", ""));
}

void settingsSetPassword(const String& pass) {
  prefs.putString("hash", sha256Hex(prefs.getString("salt", "") + pass));
  for (auto& t : tokens) t = "";
  saveTokens();
}

String settingsInitialCode() {
  return settings.setupDone ? String() : prefs.getString("initcode", "");
}

String authIssueToken() {
  // Desplaza las sesiones: la mas antigua se descarta
  for (size_t i = MAX_TOKENS - 1; i > 0; i--) tokens[i] = tokens[i - 1];
  tokens[0] = randomHex(16);
  saveTokens();
  return tokens[0];
}

bool authCheckToken(const String& token) {
  if (token.length() != 32) return false;
  bool ok = false;
  for (auto& t : tokens) ok |= constTimeEq(t, token);
  return ok;
}

void authRevokeToken(const String& token) {
  for (auto& t : tokens) {
    if (t == token) t = "";
  }
  saveTokens();
}
