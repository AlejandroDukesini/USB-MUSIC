#include "web.h"
#include "config.h"
#include "net.h"
#include "player.h"
#include "settings.h"
#include "storage.h"
#include "util.h"
#include <WebServer.h>
#include <SD.h>
#include <Update.h>
#include <algorithm>

// API local. Todas las rutas /api/* salvo /api/info y /api/login exigen la
// cabecera X-Token. Al ser una cabecera personalizada, otra web abierta en el
// navegador no puede enviar ordenes (el navegador exige CORS y aqui no se concede).

extern const char index_html_start[] asm("_binary_web_index_html_start");
extern const char index_html_end[] asm("_binary_web_index_html_end");

static WebServer server(80);

static const char* CSP =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://i.ytimg.com https://*.scdn.co https://*.spotifycdn.com; "
    "connect-src 'self' https://www.youtube.com https://open.spotify.com; "
    "frame-src https://www.youtube-nocookie.com https://open.spotify.com; base-uri 'none'; form-action 'none'";

// ---------- utilidades de respuesta ----------

static void sendJson(const String& body, int code = 200) {
  server.sendHeader("Cache-Control", "no-store");
  server.send(code, "application/json", body);
}

static void sendOk() { sendJson("{\"ok\":true}"); }

static void sendErr(int code, const String& msg) {
  sendJson("{\"ok\":false,\"error\":" + jsonStr(msg) + "}", code);
}

// Respuesta troceada para listas largas sin reservar toda la memoria de golpe.
class Chunked {
  String buf;

 public:
  Chunked() {
    server.sendHeader("Cache-Control", "no-store");
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "");
  }
  void add(const String& s) {
    buf += s;
    if (buf.length() > 1400) flush();
  }
  void flush() {
    if (buf.length()) server.sendContent(buf);
    buf = "";
  }
  void end() {
    flush();
    server.sendContent("");
  }
};

static bool tokenValid() { return authCheckToken(server.header("X-Token")); }

// duringSetup: rutas permitidas antes de cambiar la clave inicial.
static bool requireAuth(bool duringSetup = false) {
  if (!tokenValid()) {
    sendErr(401, "Sesion no valida");
    return false;
  }
  if (!settings.setupDone && !duringSetup) {
    sendErr(403, "Cambie la clave inicial antes de continuar");
    return false;
  }
  return true;
}

static int argInt(const char* name, int def) {
  return server.hasArg(name) ? server.arg(name).toInt() : def;
}

static String cleanText(String s, size_t max) {
  for (size_t i = 0; i < s.length(); i++) {
    if ((uint8_t)s[i] < 0x20) s[i] = ' ';
  }
  s.trim();
  return s.substring(0, max);
}

static const char* stateName(PlayState s) {
  switch (s) {
    case PlayState::Playing: return "playing";
    case PlayState::Paused: return "paused";
    default: return "stopped";
  }
}

// ---------- sesion ----------

static uint8_t loginFails = 0;
static uint32_t loginLockUntil = 0;

static void handleInfo() {
  sendJson("{\"device\":" + jsonStr(settings.deviceName) + ",\"version\":\"" FW_VERSION "\",\"setup\":" +
           (settings.setupDone ? "true" : "false") + "}");
}

static void handleLogin() {
  if (millis() < loginLockUntil) {
    sendErr(429, "Demasiados intentos. Espere 30 segundos");
    return;
  }
  if (!settingsCheckPassword(server.arg("password"))) {
    if (++loginFails >= 5) {
      loginFails = 0;
      loginLockUntil = millis() + 30000;
    }
    log_w("Intento de acceso fallido desde %s", server.client().remoteIP().toString().c_str());
    sendErr(401, "Clave incorrecta");
    return;
  }
  loginFails = 0;
  sendJson("{\"ok\":true,\"token\":\"" + authIssueToken() + "\",\"setup\":" + (settings.setupDone ? "true" : "false") + "}");
}

static void handleLogout() {
  if (!requireAuth(true)) return;
  authRevokeToken(server.header("X-Token"));
  sendOk();
}

static void handlePassword() {
  if (!requireAuth(true)) return;
  String current = server.arg("current"), next = server.arg("new");
  if (!settingsCheckPassword(current)) return sendErr(400, "La clave actual no es correcta");
  if (next.length() < 8 || next.length() > 64) return sendErr(400, "La nueva clave debe tener entre 8 y 64 caracteres");
  settingsSetPassword(next);
  settings.setupDone = true;
  settingsSave();
  sendJson("{\"ok\":true,\"token\":\"" + authIssueToken() + "\"}");
}

// ---------- estado y reproductor ----------

static void handleStatus() {
  if (!requireAuth(true)) return;
  PlayerStatus p = playerStatus();
  NetStatus n = netStatus();
  String o = "{\"device\":" + jsonStr(settings.deviceName);
  o += ",\"version\":\"" FW_VERSION "\",\"setup\":" + String(settings.setupDone ? "true" : "false");
  o += ",\"theme\":" + jsonStr(settings.theme);
  o += ",\"state\":\"" + String(stateName(p.state)) + "\",\"index\":" + p.index;
  o += ",\"title\":" + jsonStr(p.title) + ",\"artist\":" + jsonStr(p.artist) + ",\"path\":" + jsonStr(p.path);
  o += ",\"progress\":" + String(p.progress) + ",\"volume\":" + p.volume + ",\"repeat\":" + p.repeat;
  o += ",\"shuffle\":" + String(p.shuffle ? "true" : "false");
  o += ",\"queueLength\":" + String(p.queueLength) + ",\"queueVersion\":" + p.queueVersion;
  o += ",\"error\":" + jsonStr(p.error);
  o += ",\"net\":{\"sta\":" + String(n.staConnected ? "true" : "false") + ",\"staConfigured\":" +
       (n.staConfigured ? "true" : "false") + ",\"ap\":" + (n.apActive ? "true" : "false") +
       ",\"internet\":" + (n.internet ? "true" : "false") + ",\"ssid\":" + jsonStr(n.ssid) +
       ",\"ip\":" + jsonStr(n.staIp) + ",\"apIp\":" + jsonStr(n.apIp) + ",\"apSsid\":" + jsonStr(n.apSsid) +
       ",\"host\":" + jsonStr(n.hostname) + ",\"rssi\":" + n.rssi + "}";
  o += ",\"sd\":{\"ok\":" + String(sdReady() ? "true" : "false") + ",\"totalMB\":" +
       String((uint32_t)(sdTotalBytes() >> 20)) + ",\"usedMB\":" + String((uint32_t)(sdUsedBytes() >> 20)) + "}";
  o += ",\"heap\":" + String(ESP.getFreeHeap()) + ",\"heapMin\":" + ESP.getMinFreeHeap();
  o += ",\"uptime\":" + String(millis() / 1000) + "}";
  sendJson(o);
}

static void handlePlayer() {
  if (!requireAuth()) return;
  String a = server.arg("action");
  if (a == "play") playerCommand(PlayerCmd::Play);
  else if (a == "pause") playerCommand(PlayerCmd::Pause);
  else if (a == "toggle") playerCommand(PlayerCmd::Toggle);
  else if (a == "stop") playerCommand(PlayerCmd::Stop);
  else if (a == "next") playerCommand(PlayerCmd::Next);
  else if (a == "prev") playerCommand(PlayerCmd::Prev);
  else if (a == "index") {
    int i = argInt("index", -1);
    if (i < 0 || i >= playerStatus().queueLength) return sendErr(400, "Indice fuera de la cola");
    playerCommand(PlayerCmd::PlayIndex, i);
  } else {
    return sendErr(400, "Accion desconocida");
  }
  sendOk();
}

static void handleVolume() {
  if (!requireAuth()) return;
  playerSetVolume(argInt("value", 60));
  sendOk();
}

static void handleMode() {
  if (!requireAuth()) return;
  PlayerStatus p = playerStatus();
  playerSetMode(argInt("repeat", p.repeat), argInt("shuffle", p.shuffle) != 0);
  sendOk();
}

// ---------- cola ----------

static void handleQueue() {
  if (!requireAuth()) return;
  PlayerStatus p = playerStatus();
  Chunked c;
  c.add("{\"index\":" + String(p.index) + ",\"version\":" + p.queueVersion + ",\"items\":[");
  std::vector<String> slice;
  int total = 0;
  for (int off = 0; off == 0 || off < total; off += 50) {
    total = queueSlice(off, 50, slice);
    for (size_t i = 0; i < slice.size(); i++) c.add((off + i ? "," : "") + jsonStr(slice[i]));
    if (slice.empty()) break;
  }
  c.add("]}");
  c.end();
}

static void collectAudio(const String& dir, int depth, std::vector<String>& out) {
  File d = SD.open(dir);
  if (!d || !d.isDirectory()) return;
  std::vector<String> subdirs;
  size_t start = out.size();
  for (File f = d.openNextFile(); f && out.size() < MAX_QUEUE; f = d.openNextFile()) {
    String name = f.name();
    if (name.startsWith(".")) continue;
    String p = dir + "/" + name;
    if (f.isDirectory()) {
      if (depth < 3) subdirs.push_back(p);
    } else if (isSupportedAudio(p)) {
      out.push_back(p);
    }
  }
  std::sort(out.begin() + start, out.end());
  std::sort(subdirs.begin(), subdirs.end());
  for (auto& s : subdirs) collectAudio(s, depth + 1, out);
}

static void handleQueueAdd() {
  if (!requireAuth()) return;
  std::vector<String> paths;
  for (int i = 0; i < server.args(); i++) {
    if (server.argName(i) != "path") continue;
    String p = server.arg(i);
    if (!isSafeMusicPath(p) || !isSupportedAudio(p)) return sendErr(400, "Ruta no valida: " + p);
    paths.push_back(p);
  }
  if (server.hasArg("dir")) {
    String dir = server.arg("dir");
    if (!isSafeMusicPath(dir)) return sendErr(400, "Carpeta no valida");
    if (!sdReady()) return sendErr(503, "microSD no disponible");
    collectAudio(dir, 0, paths);
  }
  if (paths.empty()) return sendErr(400, "No hay canciones compatibles para anadir");
  int added = queueAdd(paths, argInt("next", 0) != 0);
  if (added == 0) return sendErr(400, "La cola esta llena (maximo " + String(MAX_QUEUE) + ")");
  sendJson("{\"ok\":true,\"added\":" + String(added) + "}");
}

static void handleQueueRemove() {
  if (!requireAuth()) return;
  if (!queueRemove(argInt("index", -1))) return sendErr(400, "Indice fuera de la cola");
  sendOk();
}

static void handleQueueMove() {
  if (!requireAuth()) return;
  if (!queueMove(argInt("from", -1), argInt("to", -1))) return sendErr(400, "Movimiento no valido");
  sendOk();
}

static void handleQueueClear() {
  if (!requireAuth()) return;
  queueClear();
  sendOk();
}

// ---------- archivos ----------

static void handleFiles() {
  if (!requireAuth()) return;
  if (!sdReady()) return sendErr(503, "microSD no disponible");
  String dir = server.hasArg("dir") ? server.arg("dir") : String(MUSIC_DIR);
  if (!isSafeMusicPath(dir)) return sendErr(400, "Carpeta no valida");
  File d = SD.open(dir);
  if (!d || !d.isDirectory()) return sendErr(404, "La carpeta no existe");
  int offset = max(0, argInt("offset", 0)), skipped = 0, count = 0;
  bool more = false;
  Chunked c;
  c.add("{\"dir\":" + jsonStr(dir) + ",\"entries\":[");
  for (File f = d.openNextFile(); f; f = d.openNextFile()) {
    String name = f.name();
    bool isDir = f.isDirectory();
    if (name.startsWith(".") || (!isDir && !isSupportedAudio(name))) continue;
    if (skipped++ < offset) continue;
    if (count == 200) {
      more = true;
      break;
    }
    c.add(String(count++ ? "," : "") + "{\"name\":" + jsonStr(name) + ",\"dir\":" + (isDir ? "true" : "false") +
          ",\"size\":" + String((uint32_t)f.size()) + "}");
  }
  c.add("],\"more\":" + String(more ? "true" : "false") + "}");
  c.end();
}

static String upFinal, upTmp, upError;
static File upFile;

static void handleUploadData() {
  HTTPUpload& u = server.upload();
  if (u.status == UPLOAD_FILE_START) {
    upError = "";
    upFinal = "";
    if (!tokenValid() || !settings.setupDone) {
      upError = "Sesion no valida";
      return;
    }
    if (!sdReady()) {
      upError = "microSD no disponible";
      return;
    }
    String dir = server.hasArg("dir") ? server.arg("dir") : String(MUSIC_DIR);
    String name = sanitizeFileName(u.filename);
    if (!isSafeMusicPath(dir)) {
      upError = "Carpeta no valida";
      return;
    }
    if (!isSupportedAudio(name)) {
      upError = "Formato no admitido: solo .mp3 y .wav";
      return;
    }
    upFinal = dir + "/" + name;
    if (!isSafeMusicPath(upFinal)) {
      upError = "Nombre demasiado largo";
      return;
    }
    if (SD.exists(upFinal)) {
      upError = "Ya existe " + name;
      return;
    }
    upTmp = upFinal + ".part";
    upFile = SD.open(upTmp, FILE_WRITE);
    if (!upFile) upError = "No se pudo crear el archivo en la microSD";
    else log_i("Recibiendo %s", upFinal.c_str());
  } else if (u.status == UPLOAD_FILE_WRITE) {
    if (upFile && upError.isEmpty() && upFile.write(u.buf, u.currentSize) != u.currentSize) {
      upError = "Error de escritura (tarjeta llena o retirada)";
      upFile.close();
      SD.remove(upTmp);
    }
  } else if (u.status == UPLOAD_FILE_END) {
    if (upFile) {
      upFile.close();
      if (upError.isEmpty() && !SD.rename(upTmp, upFinal)) upError = "No se pudo guardar el archivo";
      if (!upError.isEmpty()) SD.remove(upTmp);
    }
    sdInvalidateUsage();
  } else if (u.status == UPLOAD_FILE_ABORTED) {
    if (upFile) {
      upFile.close();
      SD.remove(upTmp);
    }
    upError = "Subida interrumpida";
  }
}

static void handleUploadDone() {
  if (!upError.isEmpty()) return sendErr(400, upError);
  if (upFinal.isEmpty()) return sendErr(400, "No se recibio ningun archivo");
  log_i("Archivo guardado: %s", upFinal.c_str());
  sendJson("{\"ok\":true,\"path\":" + jsonStr(upFinal) + "}");
}

static void handleDelete() {
  if (!requireAuth()) return;
  String p = server.arg("path");
  if (!isSafeMusicPath(p) || p == MUSIC_DIR) return sendErr(400, "Ruta no valida");
  if (!sdReady()) return sendErr(503, "microSD no disponible");
  PlayerStatus s = playerStatus();
  if (s.state != PlayState::Stopped && (s.path == p || s.path.startsWith(p + "/")))
    return sendErr(409, "Detenga la reproduccion antes de borrar ese archivo");
  File f = SD.open(p);
  if (!f) return sendErr(404, "No existe");
  bool isDir = f.isDirectory();
  f.close();
  bool ok = isDir ? SD.rmdir(p) : SD.remove(p);
  sdInvalidateUsage();
  if (!ok) return sendErr(400, isDir ? "La carpeta debe estar vacia" : "No se pudo borrar");
  sendOk();
}

static void handleMkdir() {
  if (!requireAuth()) return;
  String parent = server.arg("dir"), name = sanitizeFileName(server.arg("name"));
  String p = parent + "/" + name;
  if (!isSafeMusicPath(parent) || !isSafeMusicPath(p)) return sendErr(400, "Nombre no valido");
  if (!sdReady()) return sendErr(503, "microSD no disponible");
  if (!SD.mkdir(p)) return sendErr(400, "No se pudo crear la carpeta");
  sendOk();
}

// ---------- listas ----------

static bool validName(const String& n) { return n.length() >= 1 && n.length() <= 40 && cleanText(n, 40) == n; }

static void handlePlaylists() {
  if (!requireAuth()) return;
  String o = "[";
  int i = 0;
  for (auto& p : playlistList()) o += String(i++ ? "," : "") + "{\"name\":" + jsonStr(p.name) + ",\"count\":" + p.count + "}";
  sendJson(o + "]");
}

static void handlePlaylistGet() {
  if (!requireAuth()) return;
  std::vector<String> items;
  if (!playlistLoad(server.arg("name"), items)) return sendErr(404, "La lista no existe");
  Chunked c;
  c.add("{\"name\":" + jsonStr(server.arg("name")) + ",\"items\":[");
  for (size_t i = 0; i < items.size(); i++) c.add((i ? "," : "") + jsonStr(items[i]));
  c.add("]}");
  c.end();
}

static void handlePlaylistSave() {
  if (!requireAuth()) return;
  String name = server.arg("name");
  if (!validName(name)) return sendErr(400, "Nombre de lista no valido (1-40 caracteres)");
  std::vector<String> items;
  queueCopy(items);
  if (items.empty()) return sendErr(400, "La cola esta vacia");
  if (!playlistSave(name, items)) return sendErr(507, "No se pudo guardar (limite de listas o memoria llena)");
  sendOk();
}

static void handlePlaylistLoad() {
  if (!requireAuth()) return;
  std::vector<String> items;
  if (!playlistLoad(server.arg("name"), items)) return sendErr(404, "La lista no existe");
  if (server.arg("mode") == "append") queueAdd(items, false);
  else queueReplace(items);
  sendOk();
}

static void handlePlaylistDelete() {
  if (!requireAuth()) return;
  if (!playlistDelete(server.arg("name"))) return sendErr(404, "La lista no existe");
  sendOk();
}

// ---------- enlaces ----------
// El servidor nunca descarga nada de estas direcciones: solo guarda servicio,
// tipo e identificador validados. Las URL se reconstruyen en el navegador.

static bool validLinkId(const String& service, const String& kind, const String& id) {
  auto charset = [&](bool allowDashUnderscore) {
    for (char ch : id) {
      if (!isalnum((unsigned char)ch) && !(allowDashUnderscore && (ch == '-' || ch == '_'))) return false;
    }
    return true;
  };
  if (service == "youtube") {
    if (kind == "video") return id.length() == 11 && charset(true);
    if (kind == "playlist") return id.length() >= 10 && id.length() <= 64 && charset(true);
    return false;
  }
  if (service == "spotify") {
    static const char* kinds[] = {"track", "album", "playlist", "episode", "show", "artist"};
    bool kindOk = false;
    for (auto k : kinds) kindOk |= kind == k;
    return kindOk && id.length() == 22 && charset(false);
  }
  return false;
}

static void handleLinks() {
  if (!requireAuth()) return;
  String o = "[";
  int i = 0;
  for (auto& l : linksLoad()) {
    o += String(i++ ? "," : "") + "{\"service\":" + jsonStr(l.service) + ",\"kind\":" + jsonStr(l.kind) +
         ",\"id\":" + jsonStr(l.id) + ",\"title\":" + jsonStr(l.title) + "}";
  }
  sendJson(o + "]");
}

static void handleLinkAdd() {
  if (!requireAuth()) return;
  Link l{server.arg("service"), server.arg("kind"), server.arg("id"), cleanText(server.arg("title"), 120)};
  if (!validLinkId(l.service, l.kind, l.id)) return sendErr(400, "Enlace no compatible");
  auto links = linksLoad();
  if (links.size() >= MAX_LINKS) return sendErr(507, "Limite de enlaces alcanzado");
  for (auto& x : links) {
    if (x.service == l.service && x.id == l.id && x.kind == l.kind) return sendErr(409, "Ese enlace ya esta guardado");
  }
  links.push_back(l);
  if (!linksSave(links)) return sendErr(507, "No se pudo guardar");
  sendOk();
}

static void handleLinkDelete() {
  if (!requireAuth()) return;
  auto links = linksLoad();
  int i = argInt("index", -1);
  if (i < 0 || i >= (int)links.size()) return sendErr(400, "Indice no valido");
  links.erase(links.begin() + i);
  if (!linksSave(links)) return sendErr(507, "No se pudo guardar");
  sendOk();
}

// ---------- ajustes ----------

static void handleSettingsGet() {
  if (!requireAuth()) return;
  NetStatus n = netStatus();
  sendJson("{\"deviceName\":" + jsonStr(settings.deviceName) + ",\"theme\":" + jsonStr(settings.theme) +
           ",\"ssid\":" + jsonStr(settings.staSsid) + ",\"apSsid\":" + jsonStr(n.apSsid) +
           ",\"host\":" + jsonStr(n.hostname) + ",\"fsFree\":" + String((uint32_t)fsFreeBytes()) + "}");
}

static void handleSettingsPost() {
  if (!requireAuth()) return;
  if (server.hasArg("deviceName")) {
    String name = cleanText(server.arg("deviceName"), 24);
    if (name.isEmpty()) return sendErr(400, "Nombre no valido");
    settings.deviceName = name;
  }
  if (server.hasArg("theme")) {
    String t = server.arg("theme");
    if (t != "auto" && t != "dark" && t != "light") return sendErr(400, "Tema no valido");
    settings.theme = t;
  }
  settingsSave();
  sendOk();
}

static void handleWifiScan() {
  if (!requireAuth()) return;
  String r = netScanJson();
  if (r.isEmpty()) return sendJson("{\"scanning\":true}");
  sendJson("{\"scanning\":false,\"networks\":" + r + "}");
}

static bool restartPending = false;
static uint32_t restartAt = 0;

static void scheduleRestart() {
  restartPending = true;
  restartAt = millis() + 1500;
}

static void handleWifiSave() {
  if (!requireAuth()) return;
  String ssid = server.arg("ssid"), pass = server.arg("password");
  if (ssid.length() > 32 || (pass.length() && (pass.length() < 8 || pass.length() > 63)))
    return sendErr(400, "Red o clave no valida (clave WPA2: 8-63 caracteres)");
  settings.staSsid = ssid;
  settings.staPass = pass;
  settingsSave();
  sendJson("{\"ok\":true,\"restarting\":true}");
  scheduleRestart();
}

static void handleApPassword() {
  if (!requireAuth()) return;
  String pass = server.arg("password");
  if (pass.length() < 8 || pass.length() > 63) return sendErr(400, "La clave del punto de acceso debe tener 8-63 caracteres");
  settings.apPass = pass;
  settingsSave();
  sendJson("{\"ok\":true,\"restarting\":true}");
  scheduleRestart();
}

static void handleReboot() {
  if (!requireAuth(true)) return;
  sendJson("{\"ok\":true,\"restarting\":true}");
  scheduleRestart();
}

// ---------- actualizacion de firmware ----------

static String otaError;
static bool otaStarted = false;

static void handleOtaData() {
  HTTPUpload& u = server.upload();
  if (u.status == UPLOAD_FILE_START) {
    otaError = "";
    otaStarted = false;
    if (!tokenValid() || !settings.setupDone) {
      otaError = "Sesion no valida";
      return;
    }
    if (!u.filename.endsWith(".bin")) {
      otaError = "Seleccione el archivo firmware.bin";
      return;
    }
    playerShutdown();
    log_i("Actualizacion de firmware iniciada");
    otaStarted = Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH);
    if (!otaStarted) otaError = Update.errorString();
  } else if (u.status == UPLOAD_FILE_WRITE) {
    if (otaStarted && otaError.isEmpty() && Update.write(u.buf, u.currentSize) != u.currentSize)
      otaError = Update.errorString();
  } else if (u.status == UPLOAD_FILE_END) {
    if (otaStarted && otaError.isEmpty() && !Update.end(true)) otaError = Update.errorString();
    if (otaStarted && !otaError.isEmpty()) Update.abort();
  } else if (u.status == UPLOAD_FILE_ABORTED) {
    if (otaStarted) Update.abort();
    otaError = "Subida interrumpida";
  }
}

static void handleOtaDone() {
  if (!otaError.isEmpty()) {
    log_e("OTA fallida: %s", otaError.c_str());
    return sendErr(400, otaError);
  }
  if (!otaStarted) return sendErr(400, "No se recibio firmware");
  log_i("Firmware actualizado, reiniciando");
  sendJson("{\"ok\":true,\"restarting\":true}");
  scheduleRestart();
}

// ---------- arranque ----------

void webBegin() {
  static const char* headers[] = {"X-Token"};
  server.collectHeaders(headers, 1);

  server.on("/", HTTP_GET, [] {
    server.sendHeader("Content-Security-Policy", CSP);
    server.sendHeader("X-Content-Type-Options", "nosniff");
    server.sendHeader("Referrer-Policy", "no-referrer");
    server.send_P(200, "text/html; charset=utf-8", index_html_start, index_html_end - index_html_start - 1);
  });

  server.on("/api/info", HTTP_GET, handleInfo);
  server.on("/api/login", HTTP_POST, handleLogin);
  server.on("/api/logout", HTTP_POST, handleLogout);
  server.on("/api/password", HTTP_POST, handlePassword);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/player", HTTP_POST, handlePlayer);
  server.on("/api/volume", HTTP_POST, handleVolume);
  server.on("/api/mode", HTTP_POST, handleMode);
  server.on("/api/queue", HTTP_GET, handleQueue);
  server.on("/api/queue/add", HTTP_POST, handleQueueAdd);
  server.on("/api/queue/remove", HTTP_POST, handleQueueRemove);
  server.on("/api/queue/move", HTTP_POST, handleQueueMove);
  server.on("/api/queue/clear", HTTP_POST, handleQueueClear);
  server.on("/api/files", HTTP_GET, handleFiles);
  server.on("/api/files/delete", HTTP_POST, handleDelete);
  server.on("/api/files/mkdir", HTTP_POST, handleMkdir);
  server.on("/api/upload", HTTP_POST, handleUploadDone, handleUploadData);
  server.on("/api/playlists", HTTP_GET, handlePlaylists);
  server.on("/api/playlist", HTTP_GET, handlePlaylistGet);
  server.on("/api/playlists/save", HTTP_POST, handlePlaylistSave);
  server.on("/api/playlists/load", HTTP_POST, handlePlaylistLoad);
  server.on("/api/playlists/delete", HTTP_POST, handlePlaylistDelete);
  server.on("/api/links", HTTP_GET, handleLinks);
  server.on("/api/links/add", HTTP_POST, handleLinkAdd);
  server.on("/api/links/delete", HTTP_POST, handleLinkDelete);
  server.on("/api/settings", HTTP_GET, handleSettingsGet);
  server.on("/api/settings", HTTP_POST, handleSettingsPost);
  server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
  server.on("/api/wifi", HTTP_POST, handleWifiSave);
  server.on("/api/appass", HTTP_POST, handleApPassword);
  server.on("/api/reboot", HTTP_POST, handleReboot);
  server.on("/api/ota", HTTP_POST, handleOtaDone, handleOtaData);

  server.onNotFound([] {
    if (server.uri().startsWith("/api/")) return sendErr(404, "Ruta desconocida");
    server.sendHeader("Location", "/");
    server.send(302, "text/plain", "");
  });

  server.begin();
  log_i("Servidor HTTP en el puerto 80");
}

void webLoop() {
  server.handleClient();
  if (restartPending && (int32_t)(millis() - restartAt) > 0) {
    playerShutdown();
    ESP.restart();
  }
}
