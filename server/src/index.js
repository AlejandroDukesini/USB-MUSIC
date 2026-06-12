import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";

import { loadConfig } from "./lib/config.js";
import { getLocalAddresses } from "./lib/network.js";
import { initDb } from "./db.js";
import { attachWebSocket } from "./ws.js";
import { registerAuth } from "./auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerYoutubeRoutes } from "./routes/youtube.js";
import { registerSpotifyRoutes } from "./routes/spotify.js";
import { registerPlaylistRoutes } from "./routes/playlists.js";
import { registerPlayerRoutes } from "./routes/player.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerScheduleRoutes } from "./routes/schedules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const config = loadConfig(ROOT);
  const db = initDb(config, ROOT);

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    bodyLimit: 2 * 1024 * 1024,
  });

  app.decorate("config", config);
  app.decorate("db", db);
  app.decorate("rootDir", ROOT);

  await app.register(fastifyCookie, {
    secret: getOrCreateCookieSecret(db),
    parseOptions: { sameSite: "lax", httpOnly: true, path: "/" },
  });

  registerAuth(app);
  registerHealthRoutes(app);
  registerYoutubeRoutes(app);
  registerSpotifyRoutes(app);
  registerPlaylistRoutes(app);
  registerPlayerRoutes(app);
  registerLibraryRoutes(app);
  registerScheduleRoutes(app);

  const webDist = path.join(ROOT, "web", "dist");
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      wildcard: false,
      decorateReply: true,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.type("text/html").sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({
      service: "usbmusic",
      message:
        "Backend activo. El frontend aun no esta compilado (ejecuta npm run build:web).",
      api: "/api/health",
    }));
  }

  const host = config.server.bindAllInterfaces ? "0.0.0.0" : "127.0.0.1";
  const port = Number(process.env.PORT) || config.server.port || 3000;

  try {
    await app.listen({ host, port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  attachWebSocket(app);

  const addrs = getLocalAddresses();
  app.log.info("---- USBMUSIC arriba ----");
  app.log.info(`  Local:    http://localhost:${port}`);
  for (const ip of addrs) {
    app.log.info(`  Red:      http://${ip}:${port}`);
  }
  app.log.info("-------------------------");
}

function getOrCreateCookieSecret(db) {
  const row = db
    .prepare("SELECT value FROM kv WHERE key = 'cookie_secret'")
    .get();
  if (row) return row.value;
  const secret = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?)").run(
    "cookie_secret",
    secret,
  );
  return secret;
}

main().catch((err) => {
  console.error("Fallo arrancando el server:", err);
  process.exit(1);
});
