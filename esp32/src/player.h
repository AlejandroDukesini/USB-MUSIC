#pragma once
#include <Arduino.h>
#include <vector>

enum class PlayState : uint8_t { Stopped, Playing, Paused };
enum class PlayerCmd : uint8_t { Play, Pause, Toggle, Stop, Next, Prev, PlayIndex };

struct PlayerStatus {
  PlayState state;
  int index;
  String path;
  String title;
  String artist;
  String error;
  int progress;  // 0..100 segun bytes leidos; -1 si no hay pista
  uint8_t volume;
  uint8_t repeat;
  bool shuffle;
  int queueLength;
  uint32_t queueVersion;
};

// La decodificacion corre en una tarea propia; la interfaz web solo envia
// ordenes y modifica la cola bajo un mutex.
void playerBegin();
void playerLoop();      // guardado diferido de cola y preferencias
void playerShutdown();  // detiene el audio (antes de OTA o reinicio)

void playerCommand(PlayerCmd c, int arg = 0);
void playerSetVolume(int v);
void playerSetMode(int repeat, bool shuffle);
PlayerStatus playerStatus();

int queueAdd(const std::vector<String>& paths, bool next);
bool queueRemove(int i);
bool queueMove(int from, int to);
void queueClear();
void queueReplace(const std::vector<String>& paths);
void queueCopy(std::vector<String>& out);
// Copia un tramo de la cola (para enviarla por partes sin retener el mutex). Devuelve el total.
int queueSlice(int offset, int count, std::vector<String>& out);
