#pragma once
#include <Arduino.h>
#include <vector>

// microSD: archivos de musica en MUSIC_DIR.
// LittleFS (flash interna): cola, listas y enlaces en texto plano, una entrada por linea.

bool storageBegin();
void storageLoop();  // reintenta montar la microSD si no estaba
bool sdReady();
uint64_t sdTotalBytes();
uint64_t sdUsedBytes();
void sdInvalidateUsage();  // llamar tras subir o borrar archivos
size_t fsFreeBytes();

bool queueLoad(std::vector<String>& items, int& index);
bool queueSave(const std::vector<String>& items, int index);

struct PlaylistInfo {
  String name;
  int count;
};
bool playlistSave(const String& name, const std::vector<String>& items);
bool playlistLoad(const String& name, std::vector<String>& items);
bool playlistDelete(const String& name);
std::vector<PlaylistInfo> playlistList();

struct Link {
  String service;  // "youtube" | "spotify"
  String kind;     // video, playlist, track, album, ...
  String id;
  String title;
};
std::vector<Link> linksLoad();
bool linksSave(const std::vector<Link>& links);
