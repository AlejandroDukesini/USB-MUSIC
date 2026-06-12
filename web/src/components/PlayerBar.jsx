import { useEffect, useRef, useState } from "react";
import { usePlayer } from "../lib/store.js";
import { api } from "../lib/api.js";

function fmt(ms) {
  if (!ms || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PlayerBar() {
  const state = usePlayer((s) => s.state);
  const [localVol, setLocalVol] = useState(state.volume);
  const iframeRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const progressTimer = useRef(null);

  useEffect(() => setLocalVol(state.volume), [state.volume]);

  // Cargar IFrame API de YouTube una sola vez
  useEffect(() => {
    if (window.YT && window.YT.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  // Inicializar/sincronizar reproductor YouTube cuando hay un track de yt
  useEffect(() => {
    const ensure = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(ensure, 200);
        return;
      }
      if (!ytPlayerRef.current && iframeRef.current) {
        ytPlayerRef.current = new window.YT.Player(iframeRef.current, {
          height: "0",
          width: "0",
          playerVars: { autoplay: 1, controls: 0 },
          events: {
            onReady: () => {
              ytPlayerRef.current.setVolume(state.volume);
              if (state.source === "youtube" && state.externalId) {
                ytPlayerRef.current.loadVideoById(state.externalId);
              }
            },
            onStateChange: (ev) => {
              // 0 = ended
              if (ev.data === 0) api.next().catch(() => {});
            },
          },
        });
      }
    };
    ensure();
  }, []); // eslint-disable-line

  // Reaccionar a cambios de estado
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (!p || typeof p.loadVideoById !== "function") return;

    if (state.source === "youtube" && state.externalId) {
      const cur =
        typeof p.getVideoData === "function"
          ? p.getVideoData()?.video_id
          : null;
      if (cur !== state.externalId) p.loadVideoById(state.externalId);
      if (state.status === "playing") p.playVideo();
      else if (state.status === "paused") p.pauseVideo();
      else if (state.status === "idle") p.stopVideo();
    } else if (state.status === "idle" && typeof p.stopVideo === "function") {
      p.stopVideo();
    }
  }, [state.source, state.externalId, state.status]);

  // Volumen
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (p && typeof p.setVolume === "function") p.setVolume(state.volume);
  }, [state.volume]);

  // Reportar progreso
  useEffect(() => {
    clearInterval(progressTimer.current);
    if (state.status !== "playing") return;
    progressTimer.current = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      const positionMs = Math.round(p.getCurrentTime() * 1000);
      const durationMs = Math.round(p.getDuration() * 1000);
      api.progress({ positionMs, durationMs }).catch(() => {});
    }, 2000);
    return () => clearInterval(progressTimer.current);
  }, [state.status]);

  const togglePlay = async () => {
    if (state.status === "playing") await api.pause();
    else if (state.status === "paused") await api.resume();
  };

  const pct = state.durationMs
    ? Math.min(100, (state.positionMs / state.durationMs) * 100)
    : 0;

  return (
    <>
      <div className="hidden">
        <div ref={iframeRef} />
      </div>
      <div className="border-t border-white/10 bg-bg-soft/95 backdrop-blur px-3 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {state.thumbnail ? (
            <img
              src={state.thumbnail}
              alt=""
              className="w-12 h-12 rounded object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-bg-card grid place-items-center text-white/30">
              ♪
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {state.title ?? "Sin reproduccion"}
            </div>
            <div className="truncate text-xs text-white/50">
              {state.artist ?? "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-ghost"
            onClick={() => api.prev()}
            title="Anterior"
          >
            ⏮
          </button>
          <button
            className="btn !px-3 !py-2"
            onClick={togglePlay}
            title="Play/Pause"
          >
            {state.status === "playing" ? "❚❚" : "▶"}
          </button>
          <button
            className="btn-ghost"
            onClick={() => api.next()}
            title="Siguiente"
          >
            ⏭
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md">
          <span className="text-xs text-white/50 w-10 text-right">
            {fmt(state.positionMs)}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-white/50 w-10">
            {fmt(state.durationMs)}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <span className="text-white/40 text-xs">vol</span>
          <input
            type="range"
            min="0"
            max="100"
            value={localVol}
            onChange={(e) => setLocalVol(Number(e.target.value))}
            onMouseUp={(e) => api.setVolume(Number(e.target.value))}
            onTouchEnd={(e) => api.setVolume(Number(e.target.value))}
            className="w-24 accent-purple-500"
          />
        </div>
      </div>
    </>
  );
}
