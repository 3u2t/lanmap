import { randomUUID } from "node:crypto";
import { getDb } from "../db/db.js";
import { getNeighbors } from "../network/neighbors.js";
import { pingHost, reverseDns } from "../network/ping.js";
import { isPrivateCidr, listHosts, normalizeMac, sameDevice } from "@lanmap/shared";
import type { ScanProgress } from "@lanmap/shared";

export type ScanEvents = {
  onProgress?: (p: ScanProgress) => void;
  onDevice?: (id: string, isNew: boolean) => void;
};

const scan: ScanProgress & { stop: boolean } = {
  state: "idle",
  target: null,
  total: null,
  done: null,
  found: null,
  startedAt: null,
  error: null,
  stop: false,
};

export function getScanState(): ScanProgress {
  const { stop: _s, ...rest } = scan;
  return rest;
}

function rowToMatch(r: { ip: string; mac: string | null }) {
  return { ip: r.ip, mac: r.mac };
}

export async function startScan(targetCidr: string, ev: ScanEvents = {}): Promise<ScanProgress> {
  if (scan.state === "running") return getScanState();
  if (!isPrivateCidr(targetCidr)) {
    const err = "Refusing to scan: only local/private ranges allowed.";
    scan.state = "error";
    scan.error = err;
    throw new Error(err);
  }
  const hosts = listHosts(targetCidr, 1024);
  if (!hosts) {
    const err = "Range too large (max ~1024 hosts). Pick a smaller subnet.";
    scan.state = "error";
    scan.error = err;
    throw new Error(err);
  }
  const concurrency = Math.max(1, Math.min(64, Number(process.env.SCAN_CONCURRENCY) || 32));
  Object.assign(scan, {
    state: "running",
    target: targetCidr,
    total: hosts.length,
    done: 0,
    found: 0,
    startedAt: Date.now(),
    error: null,
    stop: false,
  });

  const db = getDb();
  const neigh = await getNeighbors().catch(() => []);
  const macByIp = new Map(neigh.map((n) => [n.ip, n] as const));
  const found: string[] = [];

  let idx = 0;
  const emit = () => ev.onProgress?.(getScanState());
  const targets: string[] = hosts;

  async function worker() {
    while (idx < targets.length && !scan.stop) {
      const ip = targets[idx++];
      const res = await pingHost(ip, 1200).catch(() => ({ ok: false as const, latencyMs: null }));
      scan.done = (scan.done ?? 0) + 1;
      if (scan.done % 10 === 0) emit();
      if (!res.ok && !macByIp.has(ip)) continue;
      const mac = macByIp.get(ip)?.mac ?? null;
      const iface = macByIp.get(ip)?.iface ?? null;
      const hostname = await reverseDns(ip).catch(() => null);
      upsertDevice(db, { ip, mac, iface, hostname, latencyMs: res.latencyMs });
      scan.found = (scan.found ?? 0) + 1;
      found.push(ip);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  emit();
  scan.state = scan.stop ? "stopped" : "done";
  emit();
  return getScanState();
}

export function stopScan(): ScanProgress {
  scan.stop = true;
  return getScanState();
}

function upsertDevice(
  db: ReturnType<typeof getDb>,
  d: { ip: string; mac: string | null; iface: string | null; hostname: string | null; latencyMs: number | null },
): void {
  const now = Date.now();
  const rows = db.prepare("SELECT id, ip, mac, hostname, first_seen FROM devices").all() as {
    id: string;
    ip: string;
    mac: string | null;
    hostname: string | null;
    first_seen: number;
  }[];
  const match = rows.find((r) =>
    sameDevice(rowToMatch(r), { ip: d.ip, mac: d.mac }),
  );
  const mac = d.mac ? normalizeMac(d.mac) : null;
  if (!match) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO devices (id, ip, mac, hostname, iface, status, latency_ms, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, 'online', ?, ?, ?)",
    ).run(id, d.ip, mac, d.hostname, d.iface, d.latencyMs, now, now);
    db.prepare("INSERT INTO events (device_id, kind, message, created_at) VALUES (?, 'appeared', ?, ?)").run(
      id,
      `New device detected: ${d.ip}${mac ? " (" + mac + ")" : ""}`,
      now,
    );
    return;
  }
  if (match.ip !== d.ip) {
    db.prepare("INSERT INTO events (device_id, kind, message, created_at) VALUES (?, 'ip-changed', ?, ?)").run(
      match.id,
      `IP changed: ${match.ip} -> ${d.ip}`,
      now,
    );
  }
  if ((d.hostname ?? null) !== (match.hostname ?? null) && d.hostname) {
    db.prepare(
      "INSERT INTO events (device_id, kind, message, created_at) VALUES (?, 'hostname-changed', ?, ?)",
    ).run(match.id, `Hostname: ${match.hostname ?? "Unknown"} -> ${d.hostname}`, now);
  }
  db.prepare(
    "UPDATE devices SET ip = ?, mac = COALESCE(?, mac), hostname = COALESCE(?, hostname), iface = COALESCE(?, iface), status = 'online', latency_ms = COALESCE(?, latency_ms), last_seen = ? WHERE id = ?",
  ).run(d.ip, mac, d.hostname, d.iface, d.latencyMs, now, match.id);
}
