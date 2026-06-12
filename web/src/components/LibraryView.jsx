import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function LibraryView() {
  const [tab, setTab] = useState("favorites");
  const [favs, setFavs] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.favorites().then((r) => setFavs(r.items));
    api.history(100).then((r) => setHistory(r.items));
    api.stats().then(setStats);
  }, []);

  const play = (t) =>
    api
      .play(
        {
          source: t.source,
          externalId: t.external_id,
          title: t.title,
          artist: t.artist,
          thumbnail: t.thumbnail,
        },
        [],
        -1,
      )
      .catch(() => {});

  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-lg text-sm ${tab === id ? "bg-accent/20 text-white" : "text-white/60 hover:bg-white/5"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Biblioteca</h1>

      <div className="flex gap-2 border-b border-white/10 pb-2">
        <TabBtn id="favorites" label="Favoritos" />
        <TabBtn id="history" label="Historial" />
        <TabBtn id="stats" label="Estadisticas" />
      </div>

      {tab === "favorites" && (
        <div className="space-y-2">
          {favs.length === 0 && (
            <p className="text-white/40">Sin favoritos todavia.</p>
          )}
          {favs.map((f) => (
            <div key={f.id} className="card flex items-center gap-3">
              {f.thumbnail ? (
                <img src={f.thumbnail} className="w-12 h-12 rounded" />
              ) : (
                <div className="w-12 h-12 bg-bg-soft rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{f.title}</div>
                <div className="truncate text-sm text-white/50">{f.artist}</div>
                <div className="text-xs text-white/30">{f.source}</div>
              </div>
              <button
                className="btn !px-3 !py-1.5 text-sm"
                onClick={() => play(f)}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {history.length === 0 && (
            <p className="text-white/40">Aun no has reproducido nada.</p>
          )}
          {history.map((h) => (
            <div key={h.id} className="card flex items-center gap-3">
              {h.thumbnail ? (
                <img src={h.thumbnail} className="w-12 h-12 rounded" />
              ) : (
                <div className="w-12 h-12 bg-bg-soft rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{h.title}</div>
                <div className="truncate text-sm text-white/50">{h.artist}</div>
                <div className="text-xs text-white/30">
                  {new Date(h.played_at).toLocaleString()}
                </div>
              </div>
              <button
                className="btn !px-3 !py-1.5 text-sm"
                onClick={() => play(h)}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Total reproducciones" value={stats?.totalPlays ?? 0} />
            <Stat label="Ultimos 7 dias" value={stats?.last7Days ?? 0} />
            <Stat
              label="Pistas unicas top"
              value={stats?.topTracks?.length ?? 0}
            />
          </div>
          <h2 className="text-sm uppercase text-white/40 mt-6">
            Top 10 mas reproducidas
          </h2>
          <div className="space-y-2">
            {(stats?.topTracks ?? []).map((t, i) => (
              <div
                key={`${t.source}:${t.external_id}`}
                className="card flex items-center gap-3"
              >
                <div className="w-6 text-white/40 text-right">{i + 1}</div>
                {t.thumbnail ? (
                  <img src={t.thumbnail} className="w-10 h-10 rounded" />
                ) : (
                  <div className="w-10 h-10 bg-bg-soft rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-sm text-white/50">
                    {t.artist}
                  </div>
                </div>
                <div className="text-sm text-white/60">{t.plays} plays</div>
              </div>
            ))}
          </div>
        </div>
      )}
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
