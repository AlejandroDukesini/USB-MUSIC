import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useUI } from "../lib/store.js";

export default function PlaylistsView() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const showToast = useUI((s) => s.showToast);

  const load = () => api.playlists().then((r) => setItems(r.items));

  useEffect(() => {
    load();
    api
      .spStatus()
      .then((s) => {
        setSpotifyConnected(s.connected);
        if (s.connected)
          api
            .spPlaylists()
            .then((r) => setSpotifyPlaylists(r.items))
            .catch(() => {});
      })
      .catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.createPlaylist(name.trim(), "");
      setName("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const del = async (id) => {
    if (!confirm("Eliminar playlist?")) return;
    await api.deletePlaylist(id);
    await load();
  };

  const importSpotify = async (spId) => {
    try {
      await api.spSync(spId);
      showToast("Playlist importada desde Spotify", "ok");
      await load();
    } catch (e) {
      showToast("Error importando", "error");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Playlists</h1>

      <form onSubmit={create} className="card flex gap-3">
        <input
          className="input flex-1"
          placeholder="Nombre de la nueva playlist"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={creating || !name.trim()}>
          Crear
        </button>
      </form>

      <section>
        <h2 className="text-sm uppercase text-white/40 mb-3">Locales</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items
            .filter((p) => p.source === "local")
            .map((p) => (
              <div key={p.id} className="card">
                <Link to={`/playlists/${p.id}`}>
                  <div className="aspect-square rounded bg-gradient-to-br from-accent/40 to-accent-soft/20 mb-2 grid place-items-center text-3xl">
                    ♫
                  </div>
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-white/40">
                    {p.items_count} pistas
                  </div>
                </Link>
                <button
                  onClick={() => del(p.id)}
                  className="text-xs text-red-300 mt-2 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            ))}
        </div>
        {items.filter((p) => p.source === "local").length === 0 && (
          <p className="text-white/40">Aun no tienes playlists. Crea una.</p>
        )}
      </section>

      <section>
        <h2 className="text-sm uppercase text-white/40 mb-3">
          Importadas de Spotify
        </h2>
        {items.filter((p) => p.source === "spotify").length === 0 ? (
          <p className="text-white/40">Ninguna sincronizada.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items
              .filter((p) => p.source === "spotify")
              .map((p) => (
                <Link key={p.id} to={`/playlists/${p.id}`} className="card">
                  <div className="aspect-square rounded bg-gradient-to-br from-green-500/40 to-green-700/20 mb-2 grid place-items-center text-3xl">
                    ♫
                  </div>
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-white/40">
                    {p.items_count} pistas · spotify
                  </div>
                </Link>
              ))}
          </div>
        )}
      </section>

      {spotifyConnected && spotifyPlaylists.length > 0 && (
        <section>
          <h2 className="text-sm uppercase text-white/40 mb-3">
            Disponibles en tu cuenta de Spotify
          </h2>
          <div className="space-y-2">
            {spotifyPlaylists.map((p) => (
              <div key={p.externalId} className="card flex items-center gap-3">
                {p.cover ? (
                  <img src={p.cover} className="w-12 h-12 rounded" />
                ) : (
                  <div className="w-12 h-12 bg-bg-soft rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-white/50 truncate">
                    {p.tracks} pistas · {p.owner}
                  </div>
                </div>
                <button
                  className="btn !px-3 !py-1.5 text-sm"
                  onClick={() => importSpotify(p.externalId)}
                >
                  Importar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
