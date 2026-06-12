export function registerPlaylistRoutes(app) {
  const { db } = app;

  app.get("/api/playlists", { preHandler: app.requireAuth }, async (req) => {
    const rows = db
      .prepare(
        `
      SELECT p.*, (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = p.id) AS items_count
      FROM playlists p
      WHERE p.user_id IS NULL OR p.user_id = ?
      ORDER BY p.updated_at DESC
    `,
      )
      .all(req.user.id);
    return { items: rows };
  });

  app.post(
    "/api/playlists",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const { name, description = "" } = req.body ?? {};
      if (!name) return reply.code(400).send({ error: "missing_name" });
      const now = Date.now();
      const info = db
        .prepare(
          `
      INSERT INTO playlists (user_id, name, description, source, created_at, updated_at)
      VALUES (?, ?, ?, 'local', ?, ?)
    `,
        )
        .run(req.user.id, name, description, now, now);
      return { id: info.lastInsertRowid, name, description, source: "local" };
    },
  );

  app.get(
    "/api/playlists/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const id = Number(req.params.id);
      const pl = db.prepare("SELECT * FROM playlists WHERE id = ?").get(id);
      if (!pl) return reply.code(404).send({ error: "not_found" });
      const items = db
        .prepare(
          "SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC",
        )
        .all(id);
      return { ...pl, items };
    },
  );

  app.patch(
    "/api/playlists/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const id = Number(req.params.id);
      const { name, description } = req.body ?? {};
      const pl = db.prepare("SELECT * FROM playlists WHERE id = ?").get(id);
      if (!pl) return reply.code(404).send({ error: "not_found" });
      db.prepare(
        "UPDATE playlists SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ?",
      ).run(name ?? null, description ?? null, Date.now(), id);
      return { ok: true };
    },
  );

  app.delete(
    "/api/playlists/:id",
    { preHandler: app.requireAuth },
    async (req) => {
      db.prepare("DELETE FROM playlists WHERE id = ?").run(
        Number(req.params.id),
      );
      return { ok: true };
    },
  );

  app.post(
    "/api/playlists/:id/items",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const id = Number(req.params.id);
      const { source, externalId, title, artist, durationS, thumbnail } =
        req.body ?? {};
      if (!source || !externalId || !title)
        return reply.code(400).send({ error: "missing_fields" });
      const pl = db.prepare("SELECT id FROM playlists WHERE id = ?").get(id);
      if (!pl) return reply.code(404).send({ error: "not_found" });

      const maxPos = db
        .prepare(
          "SELECT COALESCE(MAX(position), -1) AS m FROM playlist_items WHERE playlist_id = ?",
        )
        .get(id);
      const info = db
        .prepare(
          `
      INSERT INTO playlist_items (playlist_id, position, source, external_id, title, artist, duration_s, thumbnail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
        )
        .run(
          id,
          maxPos.m + 1,
          source,
          externalId,
          title,
          artist ?? "",
          durationS ?? null,
          thumbnail ?? null,
        );
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(
        Date.now(),
        id,
      );
      return { id: info.lastInsertRowid };
    },
  );

  app.delete(
    "/api/playlists/:id/items/:itemId",
    { preHandler: app.requireAuth },
    async (req) => {
      db.prepare(
        "DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?",
      ).run(Number(req.params.itemId), Number(req.params.id));
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(
        Date.now(),
        Number(req.params.id),
      );
      return { ok: true };
    },
  );

  app.post(
    "/api/playlists/:id/reorder",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const id = Number(req.params.id);
      const { order } = req.body ?? {};
      if (!Array.isArray(order))
        return reply.code(400).send({ error: "bad_order" });
      const upd = db.prepare(
        "UPDATE playlist_items SET position = ? WHERE id = ? AND playlist_id = ?",
      );
      const tx = db.transaction((items) => {
        items.forEach((itemId, idx) => upd.run(idx, itemId, id));
      });
      tx(order);
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(
        Date.now(),
        id,
      );
      return { ok: true };
    },
  );
}
