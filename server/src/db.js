import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'local',
  external_id TEXT,
  cover_url   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  source      TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT,
  duration_s  INTEGER,
  thumbnail   TEXT,
  meta        TEXT,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist
  ON playlist_items(playlist_id, position);

CREATE TABLE IF NOT EXISTS favorites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  source      TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT,
  thumbnail   TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, source, external_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  source      TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT,
  thumbnail   TEXT,
  played_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at DESC);

CREATE TABLE IF NOT EXISTS schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  cron        TEXT NOT NULL,
  playlist_id INTEGER,
  action      TEXT NOT NULL DEFAULT 'play',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id       INTEGER PRIMARY KEY,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  scope         TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export function initDb(config, rootDir) {
  const dataDir = path.isAbsolute(config.data.dir)
    ? config.data.dir
    : path.join(rootDir, config.data.dir);
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, config.data.dbFile);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  db.exec(SCHEMA);

  return db;
}
