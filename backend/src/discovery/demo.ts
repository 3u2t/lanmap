import { randomUUID } from "node:crypto";
import { getDb } from "../db/db.js";

const NAMES = ["pi-hole", "living-pc", "phone-anna", "nas", "printer", "tv-living", "esp-kitchen", "laptop-tom", "ps5", "tablet", "cam-garage", "pi-garage"];

export function seedDemo(): string[] {
  const db = getDb();
  const now = Date.now();
  const ids: string[] = [];
  NAMES.forEach((h, i) => {
    const id = randomUUID();
    ids.push(id);
    const online = i % 5 !== 4;
    db.prepare(
      "INSERT OR REPLACE INTO devices (id, ip, mac, hostname, iface, status, latency_ms, packet_loss_pct, monitored, first_seen, last_seen) VALUES (?, ?, ?, ?, 'eth0', ?, ?, ?, 1, ?, ?)",
    ).run(
      id,
      `192.168.1.${10 + i}`,
      `02:00:00:00:00:${(10 + i).toString(16).padStart(2, "0").toUpperCase()}`,
      h,
      online ? "online" : "offline",
      online ? 2 + ((i * 7) % 40) : null,
      online ? (i % 4 === 0 ? 5 : 0) : 100,
      now - 86400000,
      online ? now : now - 3600000,
    );
  });
  return ids;
}

export function demoTick(): void {
  const db = getDb();
  const rows = db.prepare("SELECT id, latency_ms FROM devices WHERE monitored = 1").all() as {
    id: string;
    latency_ms: number | null;
  }[];
  const now = Date.now();
  for (const r of rows) {
    const base = r.latency_ms ?? 10;
    const next = Math.max(1, Math.round((base + (Math.random() * 6 - 3)) * 10) / 10);
    const ok = Math.random() > 0.03;
    db.prepare("UPDATE devices SET latency_ms = ?, status = ?, last_seen = ? WHERE id = ?").run(
      ok ? next : r.latency_ms,
      ok ? "online" : "offline",
      now,
      r.id,
    );
    db.prepare("INSERT INTO ping_samples (device_id, at, latency_ms, ok) VALUES (?, ?, ?, ?)").run(
      r.id,
      now,
      ok ? next : null,
      ok ? 1 : 0,
    );
  }
}
