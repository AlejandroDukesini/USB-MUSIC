export function registerScheduleRoutes(app) {
  const { db } = app;

  app.get("/api/schedules", { preHandler: app.requireAuth }, async () => ({
    items: db.prepare("SELECT * FROM schedules ORDER BY id").all(),
  }));

  app.post(
    "/api/schedules",
    { preHandler: app.requireAdmin },
    async (req, reply) => {
      const {
        name,
        cron,
        playlistId = null,
        action = "play",
        enabled = true,
      } = req.body ?? {};
      if (!name || !cron)
        return reply.code(400).send({ error: "missing_fields" });
      const info = db
        .prepare(
          `
      INSERT INTO schedules (name, cron, playlist_id, action, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
        )
        .run(name, cron, playlistId, action, enabled ? 1 : 0, Date.now());
      return { id: info.lastInsertRowid };
    },
  );

  app.patch(
    "/api/schedules/:id",
    { preHandler: app.requireAdmin },
    async (req) => {
      const id = Number(req.params.id);
      const { name, cron, playlistId, action, enabled } = req.body ?? {};
      db.prepare(
        `
      UPDATE schedules
      SET name = COALESCE(?, name),
          cron = COALESCE(?, cron),
          playlist_id = COALESCE(?, playlist_id),
          action = COALESCE(?, action),
          enabled = COALESCE(?, enabled)
      WHERE id = ?
    `,
      ).run(
        name ?? null,
        cron ?? null,
        playlistId ?? null,
        action ?? null,
        enabled === undefined ? null : enabled ? 1 : 0,
        id,
      );
      return { ok: true };
    },
  );

  app.delete(
    "/api/schedules/:id",
    { preHandler: app.requireAdmin },
    async (req) => {
      db.prepare("DELETE FROM schedules WHERE id = ?").run(
        Number(req.params.id),
      );
      return { ok: true };
    },
  );
}
