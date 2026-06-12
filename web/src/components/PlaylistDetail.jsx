import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useUI } from "../lib/store.js";

export default function PlaylistDetail() {
  const { id } = useParams();
  const [pl, setPl] = useState(null);
  const showToast = useUI((s) => s.showToast);

  const load = () => api.playlist(id).then(setPl);
  useEffect(() => {
    load();
  }, [id]);

  if (!pl) return <div className="text-white/40">Cargando...</div>;

  const queue = pl.items.map((it) => ({
    source: it.source,
    externalId: it.external_id,
    title: it.title,
    artist: it.artist,
    thumbnail: it.thumbnail,
    durationS: it.duration_s,
  }));

  const playFrom = async (idx) => {
    try {
      await api.play(queue[idx], queue, idx);
    } catch {
      showToast("No se pudo reproducir", "error");
    }
  };

  const removeItem = async (itemId) => {
    await api.removeItem(pl.id, itemId);
    await load();
  };

  const playAll = () => playFrom(0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/playlists" className="text-white/50 text-sm hover:text-white">
        ← Playlists
      </Link>
      <header className="flex items-end gap-5">
        <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-accent/50 to-accent-soft/20 grid place-items-center text-5xl">
          ♫
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase text-white/40">
            {pl.source} · playlist
          </div>
          <h1 className="text-3xl font-bold">{pl.name}</h1>
          <p className="text-white/60 mt-1">
            {pl.description || "Sin descripcion"}
          </p>
          <p className="text-xs text-white/40 mt-1">{pl.items.length} pistas</p>
        </div>
        {pl.items.length > 0 && (
          <button className="btn" onClick={playAll}>
            ▶ Reproducir todo
          </button>
        )}
      </header>

      <div className="space-y-1">
        {pl.items.length === 0 && (
          <p className="text-white/40 text-center py-8">
            Playlist vacia. Busca canciones y anadelas desde la pagina de
            busqueda.
          </p>
        )}
        {pl.items.map((it, i) => (
          <div
            key={it.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 group"
          >
            <div className="w-6 text-white/40 text-sm text-right">{i + 1}</div>
            {it.thumbnail ? (
              <img
                src={it.thumbnail}
                className="w-10 h-10 rounded object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-bg-soft rounded" />
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{it.title}</div>
              <div className="truncate text-xs text-white/50">{it.artist}</div>
            </div>
            <div className="text-xs text-white/40 w-12 text-right">
              {it.duration_s
                ? `${Math.floor(it.duration_s / 60)}:${String(it.duration_s % 60).padStart(2, "0")}`
                : ""}
            </div>
            <button
              onClick={() => playFrom(i)}
              className="btn-ghost opacity-0 group-hover:opacity-100"
            >
              ▶
            </button>
            {pl.source === "local" && (
              <button
                onClick={() => removeItem(it.id)}
                className="btn-ghost text-red-300 opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
