import { getDb } from "../db/db.js";
import type { AlertType } from "@lanmap/shared";

const WINDOW_MS = 15 * 60_000;

export function raiseAlert(opts: {
  type: AlertType;
  deviceId?: string | null;
  message: string;
  severity?: "info" | "warning" | "critical";
}): { id: number; deduped: boolean } {
  const db = getDb();
  const since = Date.now() - WINDOW_MS;
  const dup = db
    .prepare("SELECT id FROM alerts WHERE type = ? AND COALESCE(device_id,'') = COALESCE(?,'') AND created_at > ? LIMIT 1")
    .get(opts.type, opts.deviceId ?? null, since) as { id: number } | undefined;
  if (dup) return { id: dup.id, deduped: true };
  const r = db
    .prepare("INSERT INTO alerts (type, device_id, message, severity, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(opts.type, opts.deviceId ?? null, opts.message, opts.severity ?? "info", Date.now());
  return { id: Number(r.lastInsertRowid), deduped: false };
}

export function listAlerts(limit = 100, onlyOpen = false): unknown[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, type, device_id AS deviceId, message, severity, created_at AS createdAt, acknowledged FROM alerts ${onlyOpen ? "WHERE acknowledged = 0" : ""} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function ackAlert(id: number): void {
  getDb().prepare("UPDATE alerts SET acknowledged = 1 WHERE id = ?").run(id);
}

export function networkHealth(): { state: "healthy" | "warning" | "critical"; reasons: string[] } {
  const db = getDb();
  const reasons: string[] = [];
  const dayAgo = Date.now() - 86400000;
  const lossy = db
    .prepare("SELECT COUNT(*) AS n FROM devices WHERE monitored = 1 AND ignored = 0 AND COALESCE(packet_loss_pct,0) > 10")
    .get() as { n: number };
  if (lossy.n > 0)
    reasons.push(`${lossy.n} monitored device${lossy.n === 1 ? " has" : "s have"} more than 10% packet loss.`);
  const offline = db
    .prepare("SELECT COUNT(*) AS n FROM devices WHERE monitored = 1 AND ignored = 0 AND status = 'offline'")
    .get() as { n: number };
  if (offline.n > 0) reasons.push(`${offline.n} monitored device${offline.n === 1 ? " is" : "s are"} offline.`);
  const gw = db.prepare("SELECT reachable FROM gateway WHERE id = 1").get() as
    | { reachable: number }
    | undefined;
  if (gw && !gw.reachable) reasons.push("Gateway unreachable.");
  const inet = db.prepare("SELECT reachable FROM internet WHERE id = 1").get() as
    | { reachable: number }
    | undefined;
  const inetChecked = (db.prepare("SELECT ts FROM internet WHERE id = 1").get() as { ts: number } | undefined)?.ts ?? 0;
  if (inet && !inet.reachable && Date.now() - inetChecked < 3600000 && dayAgo > 0)
    reasons.push("Internet unreachable.");
  if (reasons.length === 0) return { state: "healthy", reasons: ["All monitored devices reachable."] };
  if (offline.n > 0 || (gw && !gw.reachable)) return { state: "critical", reasons };
  return { state: "warning", reasons };
}
