import crypto from "node:crypto";

const SPOTIFY_AUTH = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

const pendingStates = new Map();

function buildRedirectUri(req, config) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  return `${proto}://${host}${config.spotify.redirectPath}`;
}

async function refreshIfNeeded(app, userId) {
  const { db, config } = app;
  const row = db
    .prepare("SELECT * FROM spotify_tokens WHERE user_id = ?")
    .get(userId);
  if (!row) return null;
  if (row.expires_at - 30_000 > Date.now()) return row;
  if (!config.spotify.clientId || !config.spotify.clientSecret) return row;

  const basic = Buffer.from(
    `${config.spotify.clientId}:${config.spotify.clientSecret}`,
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  const res = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    app.log.warn({ status: res.status }, "spotify refresh failed");
    return row;
  }
  const data = await res.json();
  const newRow = {
    ...row,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? row.scope,
  };
  db.prepare(
    "UPDATE spotify_tokens SET access_token = ?, expires_at = ?, scope = ? WHERE user_id = ?",
  ).run(newRow.access_token, newRow.expires_at, newRow.scope, userId);
  return newRow;
}

async function spotifyGet(token, pathPart) {
  const res = await fetch(`${SPOTIFY_API}${pathPart}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify ${res.status}`);
  return res.json();
}

export function registerSpotifyRoutes(app) {
  const { config, db } = app;

  app.get(
    "/api/spotify/status",
    { preHandler: app.requireAuth },
    async (req) => {
      const configured = Boolean(
        config.spotify.clientId && config.spotify.clientSecret,
      );
      const token = req.user.id
        ? db
            .prepare("SELECT expires_at FROM spotify_tokens WHERE user_id = ?")
            .get(req.user.id)
        : null;
      return {
        configured,
        connected: Boolean(token),
        expiresAt: token?.expires_at ?? null,
      };
    },
  );

  app.get(
    "/api/spotify/login",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      if (!config.spotify.clientId)
        return reply.code(412).send({ error: "spotify_not_configured" });
      const state = crypto.randomBytes(16).toString("hex");
      pendingStates.set(state, { userId: req.user.id, at: Date.now() });
      for (const [k, v] of pendingStates)
        if (Date.now() - v.at > 600_000) pendingStates.delete(k);

      const redirectUri = buildRedirectUri(req, config);
      const url = new URL(SPOTIFY_AUTH);
      url.searchParams.set("client_id", config.spotify.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", config.spotify.scopes.join(" "));
      url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    },
  );

  app.get(config.spotify.redirectPath, async (req, reply) => {
    const { code, state, error } = req.query ?? {};
    if (error)
      return reply
        .type("text/html")
        .send(`<h1>Spotify error</h1><p>${error}</p>`);
    const pending = pendingStates.get(state);
    if (!pending) return reply.code(400).send("state invalido");
    pendingStates.delete(state);

    const redirectUri = buildRedirectUri(req, config);
    const basic = Buffer.from(
      `${config.spotify.clientId}:${config.spotify.clientSecret}`,
    ).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const res = await fetch(SPOTIFY_TOKEN, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) return reply.code(502).send("token exchange fallo");
    const data = await res.json();
    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

    db.prepare(
      `
      INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at, scope)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token=excluded.access_token,
        refresh_token=excluded.refresh_token,
        expires_at=excluded.expires_at,
        scope=excluded.scope
    `,
    ).run(
      pending.userId,
      data.access_token,
      data.refresh_token,
      expiresAt,
      data.scope ?? "",
    );

    return reply.type("text/html").send(`
      <html><body style="font-family:sans-serif;background:#0b0b0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h1>Spotify conectado</h1>
          <p>Puedes cerrar esta pestana y volver a la app.</p>
          <script>setTimeout(()=>window.close(),1500)</script>
        </div>
      </body></html>
    `);
  });

  app.post(
    "/api/spotify/disconnect",
    { preHandler: app.requireAuth },
    async (req) => {
      db.prepare("DELETE FROM spotify_tokens WHERE user_id = ?").run(
        req.user.id,
      );
      return { ok: true };
    },
  );

  app.get(
    "/api/spotify/me",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const tok = await refreshIfNeeded(app, req.user.id);
      if (!tok) return reply.code(412).send({ error: "not_connected" });
      try {
        return await spotifyGet(tok.access_token, "/me");
      } catch (e) {
        return reply.code(502).send({ error: "spotify_failed" });
      }
    },
  );

  app.get(
    "/api/spotify/playlists",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const tok = await refreshIfNeeded(app, req.user.id);
      if (!tok) return reply.code(412).send({ error: "not_connected" });
      try {
        const data = await spotifyGet(
          tok.access_token,
          "/me/playlists?limit=50",
        );
        return {
          items: (data.items ?? []).map((p) => ({
            source: "spotify",
            externalId: p.id,
            name: p.name,
            description: p.description ?? "",
            cover: p.images?.[0]?.url ?? null,
            tracks: p.tracks?.total ?? 0,
            owner: p.owner?.display_name ?? "",
          })),
        };
      } catch (e) {
        return reply.code(502).send({ error: "spotify_failed" });
      }
    },
  );

  app.get(
    "/api/spotify/search",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const q = (req.query?.q ?? "").toString().trim();
      if (!q) return reply.code(400).send({ error: "missing_query" });
      const tok = await refreshIfNeeded(app, req.user.id);
      if (!tok) return reply.code(412).send({ error: "not_connected" });
      try {
        const data = await spotifyGet(
          tok.access_token,
          `/search?type=track&limit=20&q=${encodeURIComponent(q)}`,
        );
        return {
          results: (data.tracks?.items ?? []).map((t) => ({
            source: "spotify",
            externalId: t.id,
            title: t.name,
            artist: (t.artists ?? []).map((a) => a.name).join(", "),
            durationS: Math.round((t.duration_ms ?? 0) / 1000),
            thumbnail: t.album?.images?.[0]?.url ?? null,
            uri: t.uri,
          })),
        };
      } catch (e) {
        return reply.code(502).send({ error: "spotify_failed" });
      }
    },
  );

  app.post(
    "/api/spotify/sync/:playlistId",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const tok = await refreshIfNeeded(app, req.user.id);
      if (!tok) return reply.code(412).send({ error: "not_connected" });
      const spId = req.params.playlistId;
      try {
        const meta = await spotifyGet(tok.access_token, `/playlists/${spId}`);
        const tracksRes = await spotifyGet(
          tok.access_token,
          `/playlists/${spId}/tracks?limit=100`,
        );
        const now = Date.now();
        const insertPl = db.prepare(`
        INSERT INTO playlists (user_id, name, description, source, external_id, cover_url, created_at, updated_at)
        VALUES (?, ?, ?, 'spotify', ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `);
        insertPl.run(
          req.user.id,
          meta.name,
          meta.description ?? "",
          spId,
          meta.images?.[0]?.url ?? null,
          now,
          now,
        );
        const pl = db
          .prepare(
            "SELECT id FROM playlists WHERE source=? AND external_id=? AND user_id=?",
          )
          .get("spotify", spId, req.user.id);
        db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(
          pl.id,
        );
        const ins = db.prepare(`
        INSERT INTO playlist_items (playlist_id, position, source, external_id, title, artist, duration_s, thumbnail)
        VALUES (?, ?, 'spotify', ?, ?, ?, ?, ?)
      `);
        let i = 0;
        for (const it of tracksRes.items ?? []) {
          const t = it.track;
          if (!t) continue;
          ins.run(
            pl.id,
            i++,
            t.id,
            t.name,
            (t.artists ?? []).map((a) => a.name).join(", "),
            Math.round((t.duration_ms ?? 0) / 1000),
            t.album?.images?.[0]?.url ?? null,
          );
        }
        return { ok: true, playlistId: pl.id, tracks: i };
      } catch (e) {
        app.log.error({ err: e }, "spotify sync failed");
        return reply.code(502).send({ error: "sync_failed" });
      }
    },
  );
}
