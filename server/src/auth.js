import crypto from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const candidate = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function makeSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function ensureAdminUser(db, config) {
  const row = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get();
  if (row) return;
  const hash = hashPassword(config.auth.defaultAdminPassword);
  db.prepare(
    "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
  ).run("admin", hash, "admin", Date.now());
}

export function registerAuth(app) {
  const { db, config } = app;

  if (config.auth.enabled) ensureAdminUser(db, config);

  app.decorate("requireAuth", async (req, reply) => {
    if (!config.auth.enabled) {
      req.user = { id: 0, username: "anonymous", role: "admin" };
      return;
    }
    const token = req.cookies?.um_session;
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const row = db
      .prepare(
        "SELECT s.user_id, s.expires_at, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
      )
      .get(token);
    if (!row || row.expires_at < Date.now()) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    req.user = { id: row.user_id, username: row.username, role: row.role };
  });

  app.decorate("requireAdmin", async (req, reply) => {
    await app.requireAuth(req, reply);
    if (reply.sent) return;
    if (req.user?.role !== "admin") {
      return reply.code(403).send({ error: "forbidden" });
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password)
      return reply.code(400).send({ error: "missing_fields" });

    const user = db
      .prepare("SELECT id, password_hash, role FROM users WHERE username = ?")
      .get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const token = makeSessionToken();
    const expires = Date.now() + config.auth.sessionTtlHours * 3600 * 1000;
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    ).run(token, user.id, expires);

    reply.setCookie("um_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: config.auth.sessionTtlHours * 3600,
    });
    return { username, role: user.role };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies?.um_session;
    if (token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      reply.clearCookie("um_session", { path: "/" });
    }
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    if (!config.auth.enabled)
      return { username: "anonymous", role: "admin", authDisabled: true };
    const token = req.cookies?.um_session;
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const row = db
      .prepare(
        "SELECT u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
      )
      .get(token, Date.now());
    if (!row) return reply.code(401).send({ error: "unauthorized" });
    return row;
  });

  app.post(
    "/api/auth/users",
    { preHandler: app.requireAdmin },
    async (req, reply) => {
      const { username, password, role = "user" } = req.body ?? {};
      if (!username || !password)
        return reply.code(400).send({ error: "missing_fields" });
      if (!["admin", "user"].includes(role))
        return reply.code(400).send({ error: "bad_role" });
      try {
        const hash = hashPassword(password);
        const info = db
          .prepare(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(username, hash, role, Date.now());
        return { id: info.lastInsertRowid, username, role };
      } catch (e) {
        return reply.code(409).send({ error: "user_exists" });
      }
    },
  );

  app.get("/api/auth/users", { preHandler: app.requireAdmin }, async () => {
    return db
      .prepare("SELECT id, username, role, created_at FROM users ORDER BY id")
      .all();
  });
}
