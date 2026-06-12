export function registerLibraryRoutes(app) {
  const { db } = app;

  app.get("/api/favorites", { preHandler: app.requireAuth }, async (req) => {
    return {
      items: db
        .prepare(
          "SELECT * FROM favorites WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 200",
        )
        .all(req.user.id),
    };
  });

  app.post(
    "/api/favorites",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { source, externalId, title, artist, thumbnail } = req.body ?? {};
      if (!source || !externalId || !title)
        return reply.code(400).send({ error: "missing_fields" });
      try {
        const info = db
          .prepare(
            `
        INSERT INTO favorites (user_id, source, external_id, title, artist, thumbnail, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
          )
          .run(
            req.user.id,
            source,
            externalId,
            title,
            artist ?? "",
            thumbnail ?? null,
            Date.now(),
          );
        return { id: info.lastInsertRowid };
      } catch (e) {
        return reply.code(409).send({ error: "already_favorite" });
      }
    },
  );

  app.delete(
    "/api/favorites/:source/:externalId",
    { preHandler: app.requireAuth },
    async (req) => {
      db.prepare(
        "DELETE FROM favorites WHERE user_id = ? AND source = ? AND external_id = ?",
      ).run(req.user.id, req.params.source, req.params.externalId);
      return { ok: true };
    },
  );

  app.get("/api/history", { preHandler: app.requireAuth }, async (req) => {
    const limit = Math.min(200, Number(req.query?.limit) || 50);
    return {
      items: db
        .prepare(
          "SELECT * FROM history WHERE user_id = ? OR user_id IS NULL ORDER BY played_at DESC LIMIT ?",
        )
        .all(req.user.id, limit),
    };
  });

  app.get("/api/stats", { preHandler: app.requireAuth }, async (req) => {
    const totalPlays = db
      .prepare(
        "SELECT COUNT(*) AS n FROM history WHERE user_id = ? OR user_id IS NULL",
      )
      .get(req.user.id).n;
    const last7 = db
      .prepare(
        "SELECT COUNT(*) AS n FROM history WHERE played_at > ? AND (user_id = ? OR user_id IS NULL)",
      )
      .get(Date.now() - 7 * 86400_000, req.user.id).n;
    const topTracks = db
      .prepare(
        `
      SELECT source, external_id, title, artist, thumbnail, COUNT(*) AS plays
      FROM history WHERE user_id = ? OR user_id IS NULL
      GROUP BY source, external_id
      ORDER BY plays DESC LIMIT 10
    `,
      )
      .all(req.user.id);
    return { totalPlays, last7Days: last7, topTracks };
  });

  app.delete("/api/history", { preHandler: app.requireAuth }, async (req) => {
    db.prepare("DELETE FROM history WHERE user_id = ? OR user_id IS NULL").run(
      req.user.id,
    );
    return { ok: true };
  });
}
