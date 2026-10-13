#include "player.h"
#include "config.h"
#include "settings.h"
#include "storage.h"
#include "util.h"
#include <SD.h>
#include <AudioFileSourceFS.h>
#include <AudioFileSourceID3.h>
#include <AudioFileSourceBuffer.h>
#include <AudioGeneratorMP3.h>
#include <AudioGeneratorWAV.h>
#if AUDIO_OUTPUT_INTERNAL_DAC
#include <AudioOutputInternalDAC.h>
#else
#include <AudioOutputI2S.h>
#endif

namespace {

#if AUDIO_OUTPUT_INTERNAL_DAC
// AudioOutputInternalDAC ignora SetGain() y su escritura bloqueante nunca devuelve
// "lleno", asi que el generador no soltaria la CPU hasta el final de la pista.
// Se aplica la ganancia aqui y se devuelve "lleno" cada 1024 muestras (la muestra
// rechazada la reintenta el generador en la siguiente vuelta).
class GainDAC : public AudioOutputInternalDAC {
  uint16_t batch = 0;

 public:
  GainDAC() : AudioOutputInternalDAC(1024) {}
  bool ConsumeSample(int16_t s[2]) override {
    if (++batch >= 1024) {
      batch = 0;
      return false;
    }
    int16_t t[2] = {Amplify(s[0]), Amplify(s[1])};
    return AudioOutputInternalDAC::ConsumeSample(t);
  }
  uint16_t ConsumeSamples(int16_t* samples, uint16_t count) override {
    return AudioOutput::ConsumeSamples(samples, count);
  }
};
#endif

struct Cmd {
  PlayerCmd c;
  int arg;
};

struct Lock {
  SemaphoreHandle_t m;
  explicit Lock(SemaphoreHandle_t mtx) : m(mtx) { xSemaphoreTake(m, portMAX_DELAY); }
  ~Lock() { xSemaphoreGive(m); }
};

constexpr size_t READ_BUFFER = 8 * 1024;

SemaphoreHandle_t mtx;
QueueHandle_t cmdQ;

// Estado compartido (protegido por mtx)
std::vector<String> q;
int cur = -1;
volatile PlayState state = PlayState::Stopped;  // escrito bajo mtx, leido sin bloqueo por la tarea de audio
String curPath, curTitle, curArtist, lastError;
uint32_t qVersion = 1;
bool qDirty = false;
uint32_t qDirtyAt = 0;
bool prefsDirty = false;
uint32_t prefsDirtyAt = 0;
std::vector<int> history;
volatile uint32_t posBytes = 0, sizeBytes = 0;
volatile int volume = 60;
volatile uint8_t repeatMode = 0;
volatile bool shuffle = false;

// Propiedad exclusiva de la tarea de audio
AudioOutput* out = nullptr;
AudioGenerator* gen = nullptr;
AudioFileSourceFS* file = nullptr;
AudioFileSourceID3* id3 = nullptr;
AudioFileSourceBuffer* buf = nullptr;
void* mp3Mem = nullptr;
void* bufMem = nullptr;
int appliedVolume = -1;
int failures = 0;

void markQueueDirty() {
  qVersion++;
  qDirty = true;
  qDirtyAt = millis();
}

void setError(const String& e) {
  Lock l(mtx);
  lastError = e;
  log_w("%s", e.c_str());
}

void onMetadata(void*, const char* type, bool isUnicode, const char* str) {
  // Los marcos UTF-16 llegan truncados por la libreria: se conserva el nombre de archivo.
  if (isUnicode) return;
  String v = latin1ToUtf8(str);
  if (v.isEmpty()) return;
  Lock l(mtx);
  if (!strcmp(type, "Title")) curTitle = v;
  else if (!strcmp(type, "Performer")) curArtist = v;
}

void closeTrack() {
  if (gen) {
    gen->stop();
    delete gen;
    gen = nullptr;
  }
  delete buf;
  buf = nullptr;
  delete id3;
  id3 = nullptr;
  file->close();
  posBytes = sizeBytes = 0;
}

bool openTrack(int idx) {
  closeTrack();
  String path;
  {
    Lock l(mtx);
    if (idx < 0 || idx >= (int)q.size()) return false;
    path = q[idx];
    cur = idx;
    curPath = path;
    String name = baseName(path);
    int dot = name.lastIndexOf('.');
    curTitle = dot > 0 ? name.substring(0, dot) : name;
    curArtist = "";
    markQueueDirty();  // guarda la ultima cancion seleccionada
  }
  if (!sdReady()) {
    setError("microSD no disponible");
    return false;
  }
  if (!file->open(path.c_str())) {
    setError("No se pudo abrir " + path);
    return false;
  }
  String lower = path;
  lower.toLowerCase();
  bool isMp3 = lower.endsWith(".mp3");
  AudioFileSource* src = file;
  if (isMp3) {
    id3 = new AudioFileSourceID3(file);
    id3->RegisterMetadataCB(onMetadata, nullptr);
    src = id3;
  }
  buf = new AudioFileSourceBuffer(src, bufMem, READ_BUFFER);
  if (isMp3) gen = new AudioGeneratorMP3(mp3Mem, AudioGeneratorMP3::preAllocSize());
  else gen = new AudioGeneratorWAV();
  if (!gen->begin(buf, out)) {
    closeTrack();
    setError("Formato no compatible o archivo danado: " + baseName(path));
    return false;
  }
  {
    Lock l(mtx);
    state = PlayState::Playing;
    lastError = "";
  }
  log_i("Reproduciendo %s", path.c_str());
  return true;
}

// Siguiente indice segun repeticion/aleatorio. manual = pulsado por el usuario.
int pickNext(bool manual) {
  Lock l(mtx);
  int n = q.size();
  if (n == 0) return -1;
  if (!manual && repeatMode == 2 && cur >= 0 && cur < n) return cur;
  if (shuffle && n > 1) {
    int r;
    do r = esp_random() % n;
    while (r == cur);
    return r;
  }
  int nx = cur + 1;
  if (nx >= n) return (manual || repeatMode == 1) ? 0 : -1;
  return nx;
}

void stopPlayback() {
  closeTrack();
  Lock l(mtx);
  state = PlayState::Stopped;
}

void playFrom(int idx, bool pushHistory) {
  int prev;
  {
    Lock l(mtx);
    prev = cur;
  }
  // Si una pista falla se intenta la siguiente, sin entrar en bucle si fallan todas.
  int limit;
  {
    Lock l(mtx);
    limit = min<int>(q.size(), 10);
  }
  for (int tries = 0; idx >= 0 && tries < limit; tries++) {
    if (openTrack(idx)) {
      if (pushHistory && prev >= 0) {
        Lock l(mtx);
        history.push_back(prev);
        if (history.size() > 30) history.erase(history.begin());
      }
      return;
    }
    idx = pickNext(true);
  }
  stopPlayback();
}

void handle(const Cmd& c) {
  PlayState st;
  int idx;
  {
    Lock l(mtx);
    st = state;
    idx = cur;
  }
  switch (c.c) {
    case PlayerCmd::Play:
      if (st == PlayState::Paused && gen) {
        Lock l(mtx);
        state = PlayState::Playing;
      } else if (st != PlayState::Playing) {
        playFrom(idx >= 0 ? idx : 0, false);
      }
      break;
    case PlayerCmd::Pause:
      if (st == PlayState::Playing) {
        Lock l(mtx);
        state = PlayState::Paused;
      }
      break;
    case PlayerCmd::Toggle:
      handle({st == PlayState::Playing ? PlayerCmd::Pause : PlayerCmd::Play, 0});
      break;
    case PlayerCmd::Stop:
      stopPlayback();
      break;
    case PlayerCmd::Next: {
      int nx = pickNext(true);
      if (nx < 0) stopPlayback();
      else playFrom(nx, true);
      break;
    }
    case PlayerCmd::Prev: {
      int pv = -1;
      {
        Lock l(mtx);
        if (!history.empty()) {
          pv = history.back();
          history.pop_back();
        } else if (!q.empty()) {
          pv = cur > 0 ? cur - 1 : 0;
        }
      }
      if (pv >= 0) playFrom(pv, false);
      break;
    }
    case PlayerCmd::PlayIndex:
      playFrom(c.arg, true);
      break;
  }
}

void audioTask(void*) {
  int16_t silence[2] = {0, 0};
  for (;;) {
    Cmd c;
    while (xQueueReceive(cmdQ, &c, 0) == pdTRUE) handle(c);

    int v = volume;
    if (v != appliedVolume) {
      // Ganancia digital 0..1.0 (64 pasos; 1.0 = sin recorte). El volumen fuerte lo da el amplificador del parlante.
      out->SetGain(v / 100.0f);
      appliedVolume = v;
    }

    PlayState st = state;
    if (gen && st == PlayState::Playing) {
      if (gen->isRunning() && gen->loop()) {
        failures = 0;
        posBytes = file->getPos();
        sizeBytes = file->getSize();
        vTaskDelay(1);  // cede la CPU cuando el DMA esta lleno
        continue;
      }
      // Fin de pista
      closeTrack();
      int nx = pickNext(false);
      if (nx < 0) stopPlayback();
      else playFrom(nx, true);
      continue;
    }

    if (gen && st == PlayState::Paused) {
      // Rellenar el DMA con ceros: sin esto el I2S repetiria el ultimo bloque (zumbido).
      for (int i = 0; i < 256 && out->ConsumeSample(silence); i++) {
      }
      xQueuePeek(cmdQ, &c, pdMS_TO_TICKS(10));
      continue;
    }

    xQueuePeek(cmdQ, &c, pdMS_TO_TICKS(50));
  }
}

}  // namespace

void playerBegin() {
  mtx = xSemaphoreCreateMutex();
  cmdQ = xQueueCreate(8, sizeof(Cmd));

  volume = settings.volume;
  repeatMode = settings.repeat;
  shuffle = settings.shuffle;
  queueLoad(q, cur);

  mp3Mem = malloc(AudioGeneratorMP3::preAllocSize());
  bufMem = malloc(READ_BUFFER);
  file = new AudioFileSourceFS(SD);
#if AUDIO_OUTPUT_INTERNAL_DAC
  out = new GainDAC();
  log_i("Salida de audio: DAC interno (GPIO25/26)");
#else
  auto* i2s = new AudioOutputI2S();
  i2s->SetPinout(PIN_I2S_BCLK, PIN_I2S_LRCK, PIN_I2S_DOUT);
  i2s->SetBuffers(8);
  out = i2s;
  log_i("Salida de audio: I2S BCK=%d WS=%d DIN=%d", PIN_I2S_BCLK, PIN_I2S_LRCK, PIN_I2S_DOUT);
#endif
  if (!mp3Mem || !bufMem) {
    log_e("Memoria insuficiente para el decodificador");
    return;
  }
  // Prioridad sobre loop() (1) para que la web no corte el audio.
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, nullptr, 3, nullptr, ARDUINO_RUNNING_CORE);
  log_i("Cola restaurada: %u canciones", (unsigned)q.size());
}

void playerLoop() {
  uint32_t now = millis();
  if (qDirty && now - qDirtyAt > 2000) {
    Lock l(mtx);
    queueSave(q, cur);
    qDirty = false;
  }
  if (prefsDirty && now - prefsDirtyAt > 3000) {
    prefsDirty = false;
    settings.volume = volume;
    settings.repeat = repeatMode;
    settings.shuffle = shuffle;
    settingsSave();
  }
}

void playerShutdown() {
  playerCommand(PlayerCmd::Stop);
  delay(200);
  Lock l(mtx);
  if (qDirty) queueSave(q, cur);
  qDirty = false;
}

void playerCommand(PlayerCmd c, int arg) {
  Cmd cmd{c, arg};
  xQueueSend(cmdQ, &cmd, pdMS_TO_TICKS(100));
}

void playerSetVolume(int v) {
  volume = constrain(v, 0, 100);
  prefsDirty = true;
  prefsDirtyAt = millis();
}

void playerSetMode(int r, bool s) {
  repeatMode = constrain(r, 0, 2);
  shuffle = s;
  prefsDirty = true;
  prefsDirtyAt = millis();
}

PlayerStatus playerStatus() {
  PlayerStatus s;
  Lock l(mtx);
  s.state = state;
  s.index = cur;
  bool active = state != PlayState::Stopped;
  s.path = active ? curPath : String();
  s.title = active ? curTitle : String();
  s.artist = active ? curArtist : String();
  s.error = lastError;
  uint32_t size = sizeBytes;
  s.progress = (active && size) ? (int)((uint64_t)posBytes * 100 / size) : -1;
  s.volume = volume;
  s.repeat = repeatMode;
  s.shuffle = shuffle;
  s.queueLength = q.size();
  s.queueVersion = qVersion;
  return s;
}

int queueAdd(const std::vector<String>& paths, bool next) {
  Lock l(mtx);
  int added = 0;
  int pos = (next && cur >= 0) ? cur + 1 : q.size();
  for (auto& p : paths) {
    if (q.size() >= MAX_QUEUE) break;
    q.insert(q.begin() + pos++, p);
    added++;
  }
  if (added) {
    if (cur < 0) cur = 0;
    history.clear();
    markQueueDirty();
  }
  return added;
}

bool queueRemove(int i) {
  bool restart = false, stop = false;
  {
    Lock l(mtx);
    if (i < 0 || i >= (int)q.size()) return false;
    q.erase(q.begin() + i);
    history.clear();
    markQueueDirty();
    if (i < cur) {
      cur--;
    } else if (i == cur) {
      // Se elimino la cancion en curso: suena la que ocupa su lugar.
      if (cur >= (int)q.size()) cur = q.empty() ? -1 : 0;
      restart = state != PlayState::Stopped && cur >= 0;
      stop = state != PlayState::Stopped && cur < 0;
    }
  }
  if (restart) playerCommand(PlayerCmd::PlayIndex, cur);
  if (stop) playerCommand(PlayerCmd::Stop);
  return true;
}

bool queueMove(int from, int to) {
  Lock l(mtx);
  int n = q.size();
  if (from < 0 || from >= n || to < 0 || to >= n || from == to) return false;
  String item = q[from];
  q.erase(q.begin() + from);
  q.insert(q.begin() + to, item);
  if (cur == from) cur = to;
  else if (from < cur && to >= cur) cur--;
  else if (from > cur && to <= cur) cur++;
  history.clear();
  markQueueDirty();
  return true;
}

void queueClear() {
  playerCommand(PlayerCmd::Stop);
  Lock l(mtx);
  q.clear();
  cur = -1;
  history.clear();
  markQueueDirty();
}

void queueReplace(const std::vector<String>& paths) {
  playerCommand(PlayerCmd::Stop);
  Lock l(mtx);
  q.assign(paths.begin(), paths.begin() + min<size_t>(paths.size(), MAX_QUEUE));
  cur = q.empty() ? -1 : 0;
  history.clear();
  markQueueDirty();
}

void queueCopy(std::vector<String>& outv) {
  Lock l(mtx);
  outv = q;
}

int queueSlice(int offset, int count, std::vector<String>& outv) {
  Lock l(mtx);
  outv.clear();
  for (int i = offset; i < (int)q.size() && i < offset + count; i++) outv.push_back(q[i]);
  return q.size();
}
