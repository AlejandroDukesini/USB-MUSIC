import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

export default function HomeView() {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    Promise.allSettled([
      api.stats().then(setStats),
      api.history(8).then((r) => setHistory(r.items)),
      api.playlists().then((r) => setPlaylists(r.items.slice(0, 6))),
      api.health().then(setHealth),
    ]);
  }, []);

  const playTrack = (t) =>
    api
      .play(
        {
          source: t.source,
          externalId: t.external_id,
          title: t.title,
          artist: t.artist,
          thumbnail: t.thumbnail,
          durationS: t.duration_s,
        },
        [],
        -1,
      )
      .catch(() => {});

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Hola 👋</h1>
        <p className="text-white/50">Tu centro de musica local</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Reproducciones" value={stats?.totalPlays ?? "—"} />
        <Stat label="Ultimos 7 dias" value={stats?.last7Days ?? "—"} />
        <Stat label="Playlists" value={playlists.length} />
        <Stat label="IPs locales" value={health?.ips?.length ?? 0} />
      </section>

      {health?.ips?.length > 0 && (
        <section className="card">
          <h2 className="text-sm uppercase text-white/40 mb-2">
            Acceso desde la red
          </h2>
          <div className="flex flex-wrap gap-2">
            {health.ips.map((ip) => (
              <code
                key={ip}
                className="px-2 py-1 rounded bg-white/5 text-sm"
              >{`http://${ip}:3000`}</code>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Reproducido recientemente</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-white/40">
            Sin historial todavia. Ve a{" "}
            <Link to="/search" className="text-accent underline">
              buscar
            </Link>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => playTrack(h)}
                className="card flex gap-3 items-center text-left hover:border-accent/50 transition"
              >
                {h.thumbnail ? (
                  <img
                    src={h.thumbnail}
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-bg-soft rounded" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{h.title}</div>
                  <div className="truncate text-xs text-white/50">
                    {h.artist}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Tus playlists</h2>
          <Link to="/playlists" className="text-sm text-accent hover:underline">
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {playlists.map((p) => (
            <Link
              key={p.id}
              to={`/playlists/${p.id}`}
              className="card hover:border-accent/50 transition"
            >
              <div className="aspect-square rounded bg-gradient-to-br from-accent/40 to-accent-soft/20 mb-2 grid place-items-center text-2xl">
                ♫
              </div>
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-white/40">
                {p.items_count} pistas · {p.source}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card">
      <div className="text-xs text-white/40 uppercase">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
