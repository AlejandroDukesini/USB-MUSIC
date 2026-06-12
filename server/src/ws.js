import { WebSocketServer } from "ws";

const clients = new Set();
let playerState = {
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
  updatedAt: Date.now(),
};

export function attachWebSocket(app) {
  const wss = new WebSocketServer({ server: app.server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "state", state: playerState }));

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "ping")
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
    });

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  app.ws = {
    broadcast: (payload) => {
      const data = JSON.stringify(payload);
      for (const c of clients) {
        if (c.readyState === c.OPEN) c.send(data);
      }
    },
    setState: (partial) => {
      playerState = { ...playerState, ...partial, updatedAt: Date.now() };
      const data = JSON.stringify({ type: "state", state: playerState });
      for (const c of clients) if (c.readyState === c.OPEN) c.send(data);
      return playerState;
    },
    getState: () => playerState,
    clientCount: () => clients.size,
  };

  app.log.info(`WebSocket listo en /ws`);
}
