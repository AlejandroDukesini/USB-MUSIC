import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useUI, useSession } from "../lib/store.js";

export default function SettingsView() {
  const [health, setHealth] = useState(null);
  const [sp, setSp] = useState({ configured: false, connected: false });
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "user",
  });
  const showToast = useUI((s) => s.showToast);
  const me = useSession((s) => s.user);

  const load = async () => {
    setHealth(await api.health().catch(() => null));
    setSp(await api.spStatus().catch(() => sp));
    if (me?.role === "admin") {
      setUsers(await api.listUsers().catch(() => []));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connectSpotify = () => {
    window.location.href = api.spLoginUrl();
  };
  const disconnectSpotify = async () => {
    await api.spDisconnect();
    load();
  };

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(newUser.username, newUser.password, newUser.role);
      showToast("Usuario creado", "ok");
      setNewUser({ username: "", password: "", role: "user" });
      load();
    } catch (err) {
      showToast(err.message === "user_exists" ? "Ya existe" : "Error", "error");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Ajustes</h1>

      <section className="card">
        <h2 className="font-semibold mb-3">Sistema</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-white/50">Servicio</div>
          <div>USBMUSIC v{health?.version ?? "?"}</div>
          <div className="text-white/50">Node</div>
          <div>{health?.node ?? "?"}</div>
          <div className="text-white/50">Plataforma</div>
          <div>{health?.platform ?? "?"}</div>
          <div className="text-white/50">Uptime</div>
          <div>{health?.uptime ?? 0}s</div>
          <div className="text-white/50">Clientes WS</div>
          <div>{health?.wsClients ?? 0}</div>
          <div className="text-white/50">IPs locales</div>
          <div className="space-y-1">
            {(health?.ips ?? []).map((ip) => (
              <code key={ip} className="block">
                http://{ip}:3000
              </code>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Spotify</h2>
          <span
            className={`text-xs px-2 py-1 rounded ${sp.connected ? "bg-green-500/30 text-green-200" : "bg-white/10 text-white/60"}`}
          >
            {sp.connected
              ? "Conectado"
              : sp.configured
                ? "Sin conectar"
                : "Sin configurar"}
          </span>
        </div>
        {!sp.configured && (
          <p className="text-sm text-white/60 mb-3">
            Configura <code>SPOTIFY_CLIENT_ID</code> y{" "}
            <code>SPOTIFY_CLIENT_SECRET</code> en
            <code> config/default.json</code> o como variables de entorno, luego
            reinicia.
          </p>
        )}
        {sp.configured && !sp.connected && (
          <button
            className="btn bg-green-500 hover:bg-green-400"
            onClick={connectSpotify}
          >
            Conectar Spotify
          </button>
        )}
        {sp.connected && (
          <button
            className="btn-ghost text-red-300"
            onClick={disconnectSpotify}
          >
            Desconectar
          </button>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Apariencia</h2>
        <ThemeToggle />
      </section>

      {me?.role === "admin" && (
        <section className="card">
          <h2 className="font-semibold mb-3">Usuarios</h2>
          <div className="space-y-2 mb-4">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded bg-white/5"
              >
                <div className="font-medium">{u.username}</div>
                <div className="text-xs text-white/40">{u.role}</div>
              </div>
            ))}
          </div>
          <form
            onSubmit={createUser}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <input
              className="input"
              placeholder="Usuario"
              value={newUser.username}
              onChange={(e) =>
                setNewUser({ ...newUser, username: e.target.value })
              }
            />
            <input
              className="input"
              type="password"
              placeholder="Contrasena"
              value={newUser.password}
              onChange={(e) =>
                setNewUser({ ...newUser, password: e.target.value })
              }
            />
            <select
              className="input"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button className="btn">Crear</button>
          </form>
        </section>
      )}
    </div>
  );
}

function ThemeToggle() {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  return (
    <div className="flex gap-2">
      <button
        onClick={() => setTheme("dark")}
        className={`btn-ghost ${theme === "dark" ? "bg-white/10" : ""}`}
      >
        Oscuro
      </button>
      <button
        onClick={() => setTheme("light")}
        className={`btn-ghost ${theme === "light" ? "bg-white/10" : ""}`}
      >
        Claro
      </button>
    </div>
  );
}
