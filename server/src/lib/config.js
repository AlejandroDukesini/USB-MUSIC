import fs from "node:fs";
import path from "node:path";

const DEFAULT = {
  server: { host: "0.0.0.0", port: 3000, bindAllInterfaces: true },
  auth: {
    enabled: true,
    defaultAdminPassword: "usbmusic",
    sessionTtlHours: 168,
  },
  spotify: {
    clientId: "",
    clientSecret: "",
    redirectPath: "/api/spotify/callback",
    scopes: [
      "user-read-email",
      "user-read-private",
      "user-library-read",
      "playlist-read-private",
      "playlist-read-collaborative",
      "user-read-playback-state",
      "user-modify-playback-state",
      "streaming",
    ],
  },
  youtube: { embedMode: true, ytDlpPath: "" },
  audio: { outputMode: "browser", preferredQuality: "high" },
  data: { dir: "./data", dbFile: "usbmusic.db" },
  schedules: { enabled: true },
};

function deepMerge(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object"
    ) {
      out[k] = deepMerge(out[k] ?? {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function loadConfig(rootDir) {
  const cfgFile = path.join(rootDir, "config", "default.json");
  let loaded = {};
  if (fs.existsSync(cfgFile)) {
    try {
      loaded = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    } catch (e) {
      console.warn("Config invalido, usando defaults:", e.message);
    }
  }
  const merged = deepMerge(DEFAULT, loaded);

  if (process.env.SPOTIFY_CLIENT_ID)
    merged.spotify.clientId = process.env.SPOTIFY_CLIENT_ID;
  if (process.env.SPOTIFY_CLIENT_SECRET)
    merged.spotify.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (process.env.ADMIN_PASSWORD)
    merged.auth.defaultAdminPassword = process.env.ADMIN_PASSWORD;
  if (process.env.PORT) merged.server.port = Number(process.env.PORT);

  return merged;
}
