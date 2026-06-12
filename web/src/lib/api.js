async function req(method, path, body) {
  const opts = { method, credentials: "include", headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    const err = new Error("unauthorized");
    err.status = 401;
    throw err;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => req("GET", "/api/health"),
  me: () => req("GET", "/api/auth/me"),
  login: (u, p) => req("POST", "/api/auth/login", { username: u, password: p }),
  logout: () => req("POST", "/api/auth/logout"),
  listUsers: () => req("GET", "/api/auth/users"),
  createUser: (u, p, r) =>
    req("POST", "/api/auth/users", { username: u, password: p, role: r }),

  ytSearch: (q) => req("GET", `/api/youtube/search?q=${encodeURIComponent(q)}`),

  spStatus: () => req("GET", "/api/spotify/status"),
  spLoginUrl: () => "/api/spotify/login",
  spDisconnect: () => req("POST", "/api/spotify/disconnect"),
  spMe: () => req("GET", "/api/spotify/me"),
  spPlaylists: () => req("GET", "/api/spotify/playlists"),
  spSearch: (q) => req("GET", `/api/spotify/search?q=${encodeURIComponent(q)}`),
  spSync: (id) => req("POST", `/api/spotify/sync/${id}`),

  playlists: () => req("GET", "/api/playlists"),
  playlist: (id) => req("GET", `/api/playlists/${id}`),
  createPlaylist: (name, description) =>
    req("POST", "/api/playlists", { name, description }),
  updatePlaylist: (id, patch) => req("PATCH", `/api/playlists/${id}`, patch),
  deletePlaylist: (id) => req("DELETE", `/api/playlists/${id}`),
  addItem: (id, item) => req("POST", `/api/playlists/${id}/items`, item),
  removeItem: (id, itemId) =>
    req("DELETE", `/api/playlists/${id}/items/${itemId}`),
  reorder: (id, order) =>
    req("POST", `/api/playlists/${id}/reorder`, { order }),

  playerState: () => req("GET", "/api/player/state"),
  play: (track, queue, queueIndex) =>
    req("POST", "/api/player/play", { track, queue, queueIndex }),
  pause: () => req("POST", "/api/player/pause"),
  resume: () => req("POST", "/api/player/resume"),
  stop: () => req("POST", "/api/player/stop"),
  seek: (positionMs) => req("POST", "/api/player/seek", { positionMs }),
  setVolume: (volume) => req("POST", "/api/player/volume", { volume }),
  next: () => req("POST", "/api/player/next"),
  prev: () => req("POST", "/api/player/prev"),
  progress: (p) => req("POST", "/api/player/progress", p),

  favorites: () => req("GET", "/api/favorites"),
  addFavorite: (t) => req("POST", "/api/favorites", t),
  removeFavorite: (src, id) =>
    req("DELETE", `/api/favorites/${src}/${encodeURIComponent(id)}`),

  history: (limit = 50) => req("GET", `/api/history?limit=${limit}`),
  clearHistory: () => req("DELETE", "/api/history"),
  stats: () => req("GET", "/api/stats"),

  schedules: () => req("GET", "/api/schedules"),
  createSchedule: (s) => req("POST", "/api/schedules", s),
  updateSchedule: (id, patch) => req("PATCH", `/api/schedules/${id}`, patch),
  deleteSchedule: (id) => req("DELETE", `/api/schedules/${id}`),
};
