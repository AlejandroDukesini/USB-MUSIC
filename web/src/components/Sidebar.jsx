import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useSession, useUI } from "../lib/store.js";

const items = [
  {
    to: "/",
    label: "Inicio",
    icon: "M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2V11z",
  },
  {
    to: "/search",
    label: "Buscar",
    icon: "M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  },
  {
    to: "/playlists",
    label: "Playlists",
    icon: "M4 6h16M4 12h10M4 18h7M17 14l5 3-5 3v-6z",
  },
  {
    to: "/library",
    label: "Biblioteca",
    icon: "M4 4h6v16H4zM14 4h6v10h-6zM14 16h6v4h-6z",
  },
  {
    to: "/settings",
    label: "Ajustes",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  },
];

export default function Sidebar() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const nav = useNavigate();

  const logout = async () => {
    await api.logout();
    setUser(null);
    nav("/login");
  };

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/5 bg-bg-soft/40 p-4">
      <div className="flex items-center gap-2 mb-6 px-2">
        <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center font-bold">
          U
        </div>
        <div>
          <div className="font-semibold">USBMUSIC</div>
          <div className="text-xs text-white/40">Audio inteligente</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                isActive
                  ? "bg-accent/20 text-white"
                  : "text-white/70 hover:bg-white/5"
              }`
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={it.icon} />
            </svg>
            {it.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="btn-ghost justify-start"
        >
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
        <div className="px-3 py-2 rounded-lg bg-white/5 text-xs">
          <div className="text-white/50">Conectado como</div>
          <div className="font-medium">{user?.username ?? "anon"}</div>
          <div className="text-white/40">{user?.role}</div>
        </div>
        <button
          onClick={logout}
          className="btn-ghost justify-start text-red-300 hover:text-red-200"
        >
          Salir
        </button>
      </div>
    </aside>
  );
}
