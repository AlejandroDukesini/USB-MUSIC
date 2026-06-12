export function registerPlayerRoutes(app) {
  const { db } = app;

  app.get("/api/player/state", { preHandler: app.requireAuth }, async () =>
    app.ws.getState(),
  );

  app.post(
    "/api/player/play",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { track, queue, queueIndex } = req.body ?? {};
      if (!track || !track.source || !track.externalId) {
        return reply.code(400).send({ error: "missing_track" });
      }
      const state = app.ws.setState({
        status: "playing",
        source: track.source,
        externalId: track.externalId,
        title: track.title ?? null,
        artist: track.artist ?? null,
        thumbnail: track.thumbnail ?? null,
        durationMs: (track.durationS ?? 0) * 1000,
        positionMs: 0,
        queue: Array.isArray(queue) ? queue : app.ws.getState().queue,
        queueIndex: Number.isInteger(queueIndex)
          ? queueIndex
          : app.ws.getState().queueIndex,
      });
      db.prepare(
        `
      INSERT INTO history (user_id, source, external_id, title, artist, thumbnail, played_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        req.user.id,
        track.source,
        track.externalId,
        track.title ?? "",
        track.artist ?? "",
        track.thumbnail ?? null,
        Date.now(),
      );
      return state;
    },
  );

  app.post("/api/player/pause", { preHandler: app.requireAuth }, async () =>
    app.ws.setState({ status: "paused" }),
  );
  app.post("/api/player/resume", { preHandler: app.requireAuth }, async () =>
    app.ws.setState({ status: "playing" }),
  );
  app.post("/api/player/stop", { preHandler: app.requireAuth }, async () =>
    app.ws.setState({
      status: "idle",
      source: null,
      externalId: null,
      title: null,
      artist: null,
      thumbnail: null,
      positionMs: 0,
      durationMs: 0,
    }),
  );

  app.post(
    "/api/player/seek",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const ms = Number(req.body?.positionMs);
      if (!Number.isFinite(ms) || ms < 0)
        return reply.code(400).send({ error: "bad_position" });
      return app.ws.setState({ positionMs: ms });
    },
  );

  app.post(
    "/api/player/volume",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const v = Number(req.body?.volume);
      if (!Number.isFinite(v) || v < 0 || v > 100)
        return reply.code(400).send({ error: "bad_volume" });
      return app.ws.setState({ volume: Math.round(v) });
    },
  );

  app.post(
    "/api/player/queue",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { queue, queueIndex = 0 } = req.body ?? {};
      if (!Array.isArray(queue))
        return reply.code(400).send({ error: "bad_queue" });
      return app.ws.setState({ queue, queueIndex });
    },
  );

  app.post("/api/player/next", { preHandler: app.requireAuth }, async () => {
    const s = app.ws.getState();
    const idx = s.queueIndex + 1;
    if (idx >= s.queue.length) return app.ws.setState({ status: "idle" });
    const t = s.queue[idx];
    return app.ws.setState({
      queueIndex: idx,
      status: "playing",
      source: t.source,
      externalId: t.externalId,
      title: t.title,
      artist: t.artist,
      thumbnail: t.thumbnail,
      durationMs: (t.durationS ?? 0) * 1000,
      positionMs: 0,
    });
  });

  app.post("/api/player/prev", { preHandler: app.requireAuth }, async () => {
    const s = app.ws.getState();
    const idx = Math.max(0, s.queueIndex - 1);
    const t = s.queue[idx];
    if (!t) return s;
    return app.ws.setState({
      queueIndex: idx,
      status: "playing",
      source: t.source,
      externalId: t.externalId,
      title: t.title,
      artist: t.artist,
      thumbnail: t.thumbnail,
      durationMs: (t.durationS ?? 0) * 1000,
      positionMs: 0,
    });
  });

  app.post(
    "/api/player/progress",
    { preHandler: app.requireAuth },
    async (req) => {
      const { positionMs, durationMs } = req.body ?? {};
      const partial = {};
      if (Number.isFinite(positionMs)) partial.positionMs = positionMs;
      if (Number.isFinite(durationMs)) partial.durationMs = durationMs;
      return app.ws.setState(partial);
    },
  );
}
