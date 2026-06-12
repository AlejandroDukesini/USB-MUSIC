import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { api } from "./lib/api.js";
import { connectPlayerSocket } from "./lib/ws.js";
import { useUI, usePlayer, useSession } from "./lib/store.js";

import Layout from "./components/Layout.jsx";
import HomeView from "./components/HomeView.jsx";
import SearchView from "./components/SearchView.jsx";
import PlaylistsView from "./components/PlaylistsView.jsx";
import PlaylistDetail from "./components/PlaylistDetail.jsx";
import LibraryView from "./components/LibraryView.jsx";
import SettingsView from "./components/SettingsView.jsx";
import LoginView from "./components/LoginView.jsx";

export default function App() {
  const theme = useUI((s) => s.theme);
  const setUser = useSession((s) => s.setUser);
  const user = useSession((s) => s.user);
  const setPlayerState = usePlayer((s) => s.setState);
  const [bootChecked, setBootChecked] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setBootChecked(true));
  }, [setUser]);

  useEffect(() => {
    if (!user) return;
    const stop = connectPlayerSocket((state) => setPlayerState(state));
    return stop;
  }, [user, setPlayerState]);

  if (!bootChecked) {
    return (
      <div className="h-full grid place-items-center text-white/60">
        Cargando...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeView />} />
        <Route path="/search" element={<SearchView />} />
        <Route path="/playlists" element={<PlaylistsView />} />
        <Route path="/playlists/:id" element={<PlaylistDetail />} />
        <Route path="/library" element={<LibraryView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
