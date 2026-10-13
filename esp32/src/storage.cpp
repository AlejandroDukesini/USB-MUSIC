#include "storage.h"
#include "config.h"
#include "util.h"
#include <SPI.h>
#include <SD.h>
#include <LittleFS.h>

static bool sdOk = false;
static uint32_t lastSdTry = 0;

static bool mountSd() {
  SD.end();
  if (!SD.begin(PIN_SD_CS, SPI, SD_SPI_HZ) || SD.cardType() == CARD_NONE) {
    SD.end();
    return false;
  }
  if (!SD.exists(MUSIC_DIR)) SD.mkdir(MUSIC_DIR);
  log_i("microSD montada: %llu MB", SD.cardSize() / (1024ULL * 1024ULL));
  return true;
}

bool storageBegin() {
  if (!LittleFS.begin(true)) {
    log_e("LittleFS no disponible: las listas no se guardaran");
  } else if (!LittleFS.exists("/pl")) {
    LittleFS.mkdir("/pl");
  }
  SPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  sdOk = mountSd();
  if (!sdOk) log_w("microSD no detectada (revise tarjeta, formato FAT32 y cableado)");
  lastSdTry = millis();
  return sdOk;
}

void storageLoop() {
  if (sdOk || millis() - lastSdTry < 10000) return;
  lastSdTry = millis();
  sdOk = mountSd();
}

bool sdReady() { return sdOk; }
uint64_t sdTotalBytes() { return sdOk ? SD.totalBytes() : 0; }
// usedBytes() recorre la FAT y puede tardar en tarjetas grandes: se guarda en cache.
static uint64_t usedCache = 0;
static uint32_t usedAt = 0;
static bool usedValid = false;
void sdInvalidateUsage() { usedValid = false; }
uint64_t sdUsedBytes() {
  if (!sdOk) return 0;
  if (!usedValid || millis() - usedAt > 300000) {
    usedCache = SD.usedBytes();
    usedAt = millis();
    usedValid = true;
  }
  return usedCache;
}
size_t fsFreeBytes() { return LittleFS.totalBytes() - LittleFS.usedBytes(); }

// Escribe a un temporal y renombra: un corte de luz no deja el archivo a medias.
static bool writeLines(const char* path, const String& header, const std::vector<String>& lines) {
  size_t estimate = header.length() + 1;
  for (auto& l : lines) estimate += l.length() + 1;
  if (estimate + 8192 > fsFreeBytes()) {
    log_e("Sin espacio en LittleFS para %s", path);
    return false;
  }
  String tmp = String(path) + ".tmp";
  File f = LittleFS.open(tmp, "w");
  if (!f) return false;
  bool ok = f.print(header) && f.print('\n');
  for (auto& l : lines) {
    if (!ok) break;
    ok = f.print(l) && f.print('\n');
  }
  f.close();
  if (!ok || !LittleFS.rename(tmp, path)) {
    LittleFS.remove(tmp);
    log_e("Error escribiendo %s", path);
    return false;
  }
  return true;
}

static bool readLines(const char* path, String& header, std::vector<String>& lines, size_t max) {
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  header = f.readStringUntil('\n');
  while (f.available() && lines.size() < max) {
    String l = f.readStringUntil('\n');
    if (!l.isEmpty()) lines.push_back(l);
  }
  f.close();
  return true;
}

bool queueLoad(std::vector<String>& items, int& index) {
  String header;
  items.clear();
  if (!readLines("/queue.txt", header, items, MAX_QUEUE)) return false;
  index = header.toInt();
  if (index < -1 || index >= (int)items.size()) index = items.empty() ? -1 : 0;
  return true;
}

bool queueSave(const std::vector<String>& items, int index) {
  return writeLines("/queue.txt", String(index), items);
}

static String playlistPath(const String& name) {
  String slug = sanitizeFileName(name);
  slug.toLowerCase();
  slug.replace(' ', '_');
  slug.replace('.', '_');
  return "/pl/" + slug.substring(0, 40) + ".txt";
}

bool playlistSave(const String& name, const std::vector<String>& items) {
  String path = playlistPath(name);
  if (!LittleFS.exists(path) && playlistList().size() >= MAX_PLAYLISTS) return false;
  return writeLines(path.c_str(), name, items);
}

bool playlistLoad(const String& name, std::vector<String>& items) {
  String header;
  items.clear();
  return readLines(playlistPath(name).c_str(), header, items, MAX_QUEUE);
}

bool playlistDelete(const String& name) {
  return LittleFS.remove(playlistPath(name));
}

std::vector<PlaylistInfo> playlistList() {
  std::vector<PlaylistInfo> out;
  File dir = LittleFS.open("/pl");
  if (!dir) return out;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    String name = String(f.name());
    if (!name.endsWith(".txt")) continue;
    PlaylistInfo info{f.readStringUntil('\n'), 0};
    while (f.available()) {
      if (f.readStringUntil('\n').length()) info.count++;
    }
    out.push_back(info);
  }
  return out;
}

std::vector<Link> linksLoad() {
  std::vector<Link> out;
  String header;
  std::vector<String> lines;
  if (!readLines("/links.txt", header, lines, MAX_LINKS)) return out;
  for (auto& l : lines) {
    int a = l.indexOf('\t'), b = l.indexOf('\t', a + 1), c = l.indexOf('\t', b + 1);
    if (a < 0 || b < 0 || c < 0) continue;
    out.push_back({l.substring(0, a), l.substring(a + 1, b), l.substring(b + 1, c), l.substring(c + 1)});
  }
  return out;
}

bool linksSave(const std::vector<Link>& links) {
  std::vector<String> lines;
  for (auto& l : links) lines.push_back(l.service + '\t' + l.kind + '\t' + l.id + '\t' + l.title);
  return writeLines("/links.txt", "v1", lines);
}
