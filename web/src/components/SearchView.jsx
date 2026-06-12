import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useUI } from "../lib/store.js";

export default function SearchView() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("youtube");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const showToast = useUI((s) => s.showToast);

  useEffect(() => {
    api
      .spStatus()
      .then((s) => setSpotifyConnected(s.connected))
      .catch(() => {});
    api
      .playlists()
      .then((r) => setPlaylists(r.items))
      .catch(() => {});
  }, []);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const data =
        source === "spotify" ? await api.spSearch(q) : await api.ytSearch(q);
      setResults(data.results ?? []);
    } catch (err) {
      showToast(`Busqueda fallida (${err.message})`, "error");
    } finally {
      setBusy(false);
    }
  };

  const playNow = async (t) => {
    try {
      await api.play(t, results, results.indexOf(t));
    } catch (e) {
      showToast("No se pudo reproducir", "error");
    }
  };

  const addToPlaylist = async (t, playlistId) => {
    try {
      await api.addItem(playlistId, t);
      showToast("Anadido a la playlist", "ok");
    } catch (e) {
      showToast("Error anadiendo", "error");
    }
  };

  const addFavorite = async (t) => {
    try {
      await api.addFavorite(t);
      showToast("Anadido a favoritos", "ok");
    } catch (e) {
      showToast("Ya esta en favoritos", "info");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Buscar musica</h1>

      <form onSubmit={search} className="card flex flex-col sm:flex-row gap-3">
        <select
          className="input sm:w-40"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="youtube">YouTube</option>
          <option value="spotify" disabled={!spotifyConnected}>
            Spotify {spotifyConnected ? "" : "(no conectado)"}
          </option>
        </select>
        <input
          className="input flex-1"
          placeholder="Cancion, artista, album..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="btn" disabled={busy}>
          {busy ? "Buscando..." : "Buscar"}
        </button>
      </form>

      <div className="space-y-2">
        {results.map((t) => (
          <div
            key={`${t.source}:${t.externalId}`}
            className="card flex items-center gap-3"
          >
            {t.thumbnail ? (
              <img
                src={t.thumbnail}
                className="w-14 h-14 rounded object-cover"
              />
            ) : (
              <div className="w-14 h-14 bg-bg-soft rounded" />
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{t.title}</div>
              <div className="truncate text-sm text-white/50">{t.artist}</div>
              <div className="text-xs text-white/30">
                {t.source} ·{" "}
                {t.durationS
                  ? `${Math.floor(t.durationS / 60)}:${String(t.durationS % 60).padStart(2, "0")}`
                  : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn !px-3 !py-1.5 text-sm"
                onClick={() => playNow(t)}
              >
                ▶ Reproducir
              </button>
              <button
                className="btn-ghost text-sm"
                onClick={() => addFavorite(t)}
                title="Favorito"
              >
                ♥
              </button>
              {playlists.length > 0 && (
                <select
                  className="input !w-40 !py-1.5 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addToPlaylist(t, Number(e.target.value));
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">+ Playlist...</option>
                  {playlists
                    .filter((p) => p.source === "local")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>
        ))}
        {results.length === 0 && q && !busy && (
          <div className="text-white/40 text-center py-8">Sin resultados</div>
        )}
      </div>
    </div>
  );
}
