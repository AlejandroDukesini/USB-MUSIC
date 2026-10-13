#include "util.h"
#include "config.h"
#include <esp_random.h>
#include <mbedtls/sha256.h>

String jsonStr(const String& s) {
  String o;
  o.reserve(s.length() + 2);
  o += '"';
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': o += "\\r"; break;
      case '\t': o += "\\t"; break;
      default:
        if ((uint8_t)c < 0x20) {
          char buf[7];
          snprintf(buf, sizeof(buf), "\\u%04x", (uint8_t)c);
          o += buf;
        } else {
          o += c;
        }
    }
  }
  o += '"';
  return o;
}

bool isSafeMusicPath(const String& p) {
  const size_t rootLen = strlen(MUSIC_DIR);
  if (p.length() > MAX_PATH_LEN || !p.startsWith(MUSIC_DIR)) return false;
  if (p.length() > rootLen && p[rootLen] != '/') return false;
  if (p.endsWith("/") && p.length() > rootLen) return false;
  for (size_t i = 0; i < p.length(); i++) {
    uint8_t c = p[i];
    if (c < 0x20 || c == '\\' || c == 0x7f) return false;
  }
  // Ningun segmento puede ser "." o ".." ni estar vacio.
  int start = 1;
  while (start <= (int)p.length()) {
    int end = p.indexOf('/', start);
    if (end < 0) end = p.length();
    String seg = p.substring(start, end);
    if (seg.isEmpty() || seg == "." || seg == "..") return false;
    start = end + 1;
  }
  return true;
}

bool isSupportedAudio(const String& p) {
  String l = p;
  l.toLowerCase();
  return l.endsWith(".mp3") || l.endsWith(".wav");
}

String baseName(const String& p) {
  int i = p.lastIndexOf('/');
  return i < 0 ? p : p.substring(i + 1);
}

String sanitizeFileName(const String& name) {
  String o;
  for (size_t i = 0; i < name.length(); i++) {
    uint8_t c = name[i];
    if (c == 0xC3 && i + 1 < name.length()) {
      uint8_t d = name[++i];
      // Vocales con tilde/dieresis y enie en UTF-8 (U+00C0..U+00FF)
      const char* map = "AAAAAAACEEEEIIIIDNOOOOOxOUUUUYTsaaaaaaaceeeeiiiidnooooo_ouuuuyty";
      o += (d >= 0x80 && d <= 0xBF) ? map[d - 0x80] : '_';
      continue;
    }
    if (isalnum(c) || c == ' ' || c == '.' || c == '-' || c == '_' || c == '(' || c == ')') {
      o += (char)c;
    } else if (c >= 0x80) {
      // Saltar el resto de una secuencia UTF-8 no reconocida
      while (i + 1 < name.length() && (name[i + 1] & 0xC0) == 0x80) i++;
      o += '_';
    } else {
      o += '_';
    }
  }
  o.trim();
  while (o.startsWith(".")) o.remove(0, 1);
  if (o.length() > 100) {
    int dot = o.lastIndexOf('.');
    String ext = dot > 0 ? o.substring(dot) : "";
    o = o.substring(0, 100 - ext.length()) + ext;
  }
  return o.isEmpty() ? String("archivo") : o;
}

String latin1ToUtf8(const char* s) {
  String o;
  for (; *s; s++) {
    uint8_t c = *s;
    if (c < 0x20) continue;
    if (c < 0x80) {
      o += (char)c;
    } else {
      o += (char)(0xC0 | (c >> 6));
      o += (char)(0x80 | (c & 0x3F));
    }
  }
  o.trim();
  return o;
}

String randomHex(size_t bytes) {
  String o;
  o.reserve(bytes * 2);
  for (size_t i = 0; i < bytes; i++) {
    char buf[3];
    snprintf(buf, sizeof(buf), "%02x", (unsigned)(esp_random() & 0xFF));
    o += buf;
  }
  return o;
}

String sha256Hex(const String& s) {
  uint8_t out[32];
  mbedtls_sha256((const uint8_t*)s.c_str(), s.length(), out, 0);
  String o;
  o.reserve(64);
  for (uint8_t b : out) {
    char buf[3];
    snprintf(buf, sizeof(buf), "%02x", b);
    o += buf;
  }
  return o;
}

bool constTimeEq(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) diff |= a[i] ^ b[i];
  return diff == 0;
}
