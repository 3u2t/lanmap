import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let db: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  ipv6 TEXT,
  mac TEXT,
  hostname TEXT,
  custom_name TEXT,
  vendor TEXT,
  iface TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  latency_ms REAL,
  packet_loss_pct REAL,
  monitored INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  device_id TEXT,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  created_at INTEGER NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ping_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  latency_ms REAL,
  ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_samples_device_at ON ping_samples(device_id, at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gateway (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ts INTEGER NOT NULL,
  ip TEXT,
  reachable INTEGER NOT NULL DEFAULT 0,
  latency_ms REAL
);
CREATE TABLE IF NOT EXISTS internet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ts INTEGER NOT NULL,
  reachable INTEGER NOT NULL DEFAULT 0,
  dns_ok INTEGER NOT NULL DEFAULT 0,
  latency_ms REAL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  keys TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;
export function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    return join(base, "LANMap", "data");
  }
  return join(process.cwd(), "data");
}

export function initDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dataDir(), { recursive: true });
  db = new DatabaseSync(join(dataDir(), "lanmap.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  migrate(db);
  const now = Date.now();
  const gw = db.prepare("SELECT id FROM gateway WHERE id = 1").get();
  if (!gw) db.prepare("INSERT INTO gateway (id, ts, ip, reachable) VALUES (1, ?, NULL, 0)").run(now);
  const inet = db.prepare("SELECT id FROM internet WHERE id = 1").get();
  if (!inet)
    db.prepare("INSERT INTO internet (id, ts, reachable, dns_ok) VALUES (1, ?, 0, 0)").run(now);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) return initDb();
  return db;
}

function migrate(d: DatabaseSync): void {
  const cols = new Set(
    (d.prepare("PRAGMA table_info(devices)").all() as { name: string }[]).map((c) => c.name),
  );
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) d.exec(`ALTER TABLE devices ADD COLUMN ${ddl}`);
  };
  add("source", "source TEXT");
  add("open_ports", "open_ports TEXT");
  add("hops", "hops INTEGER");
  add("l2", "l2 INTEGER");
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as {
    value: string;
  } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function pruneSamples(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs;
  const r = getDb().prepare("DELETE FROM ping_samples WHERE at < ?").run(cutoff);
  return Number(r.changes ?? 0);
}
