import { create } from "zustand";

export const useUI = create((set) => ({
  theme: localStorage.getItem("um.theme") || "dark",
  setTheme: (t) => {
    localStorage.setItem("um.theme", t);
    document.documentElement.classList.toggle("light", t === "light");
    document.documentElement.classList.toggle("dark", t === "dark");
    set({ theme: t });
  },
  toast: null,
  showToast: (msg, kind = "info") =>
    set({ toast: { msg, kind, t: Date.now() } }),
}));

export const usePlayer = create((set) => ({
  state: {
    status: "idle",
    source: null,
    externalId: null,
    title: null,
    artist: null,
    thumbnail: null,
    positionMs: 0,
    durationMs: 0,
    volume: 80,
    queue: [],
    queueIndex: -1,
  },
  setState: (s) => set({ state: s }),
}));

export const useSession = create((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
}));
