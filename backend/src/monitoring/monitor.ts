import { getDb } from "../db/db.js";
import { getGatewayIp } from "../network/interfaces.js";
import { dnsTest, pingHost, pingStats } from "../network/ping.js";
import { raiseAlert } from "../alerts/alerts.js";
import { broadcast } from "../ws/hub.js";
import { nextPresenceState, packetLossPct } from "@lanmap/shared";
import { demoTick } from "../discovery/demo.js";

let timer: NodeJS.Timeout | null = null;
let intervalMs = Number(process.env.MONITOR_INTERVAL_MS) || 10_000;

function settings() {
  const db = getDb();
  const get = (k: string, fb: string) =>
    (db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as { value: string } | undefined)?.value ?? fb;
  return {
    offlineAfterFailures: Math.max(1, Number(get("offlineAfterFailures", "3")) || 3),
    latencyThresholdMs: Number(get("latencyThresholdMs", "200")) || 200,
    packetLossThresholdPct: Number(get("packetLossThresholdPct", "10")) || 10,
    pingTimeoutMs: Number(get("pingTimeoutMs", process.env.PING_TIMEOUT_MS || "1500")) || 1500,
  };
}

export async function monitorOnce(): Promise<void> {
  if (process.env.DEMO_MODE === "true") {
    demoTick();
    return;
  }
  const db = getDb();
  const s = settings();
  const rows = db
    .prepare("SELECT id, ip, status, consecutive_failures AS fails, monitored FROM devices WHERE monitored = 1 AND ignored = 0")
    .all() as { id: string; ip: string; status: string; fails: number; monitored: number }[];
  const now = Date.now();
  for (const r of rows) {
    const st = await pingStats(r.ip, 3, s.pingTimeoutMs).catch(() => ({
      sent: 3,
      received: 0,
      min: null,
      avg: null,
      max: null,
    }));
    const loss = packetLossPct(st.sent, st.received);
    const probeOk = st.received > 0;
    const next = nextPresenceState({
      probeOk,
      consecutiveFailures: r.fails ?? 0,
      offlineAfterFailures: s.offlineAfterFailures,
    });
    db.prepare(
      "UPDATE devices SET status = ?, latency_ms = ?, packet_loss_pct = ?, consecutive_failures = ?, last_seen = ? WHERE id = ?",
    ).run(next.status, st.avg, loss, next.consecutiveFailures, probeOk ? now : now, r.id);
    db.prepare("INSERT INTO ping_samples (device_id, at, latency_ms, ok) VALUES (?, ?, ?, ?)").run(
      r.id,
      now,
      st.avg,
      probeOk ? 1 : 0,
    );
    if (r.status !== "offline" && next.status === "offline") {
      db.prepare("INSERT INTO events (device_id, kind, message, created_at) VALUES (?, 'disappeared', ?, ?)").run(
        r.id,
        `${r.ip} stopped responding.`,
        now,
      );
      raiseAlert({ type: "device-offline", deviceId: r.id, message: `${r.ip} is offline.`, severity: "warning" });
      broadcast({ type: "presence", payload: { id: r.id, status: "offline" } });
    } else if (r.status === "offline" && next.status === "online") {
      db.prepare("INSERT INTO events (device_id, kind, message, created_at) VALUES (?, 'appeared', ?, ?)").run(
        r.id,
        `${r.ip} is back online.`,
        now,
      );
      raiseAlert({ type: "device-online", deviceId: r.id, message: `${r.ip} is back online.`, severity: "info" });
      broadcast({ type: "presence", payload: { id: r.id, status: "online" } });
    }
    if (probeOk && st.avg != null && st.avg > s.latencyThresholdMs) {
      raiseAlert({
        type: "high-latency",
        deviceId: r.id,
        message: `${r.ip} latency ${st.avg} ms exceeds ${s.latencyThresholdMs} ms.`,
        severity: "warning",
      });
    }
    if (loss > s.packetLossThresholdPct && st.sent > 0) {
      raiseAlert({
        type: "packet-loss",
        deviceId: r.id,
        message: `${r.ip} packet loss ${loss}%.`,
        severity: "warning",
      });
    }
    broadcast({ type: "latency", payload: { id: r.id, latencyMs: st.avg, loss } });
  }

  const gwIp =
    (db.prepare("SELECT value FROM settings WHERE key = 'gatewayIp'").get() as { value: string } | undefined)?.value ||
    getGatewayIp();
  if (gwIp) {
    const g = await pingHost(gwIp, 1500).catch(() => ({ ok: false, latencyMs: null }));
    db.prepare("UPDATE gateway SET ts = ?, ip = ?, reachable = ?, latency_ms = ? WHERE id = 1").run(
      now,
      gwIp,
      g.ok ? 1 : 0,
      g.latencyMs,
    );
    if (!g.ok) raiseAlert({ type: "gateway-unreachable", message: `Gateway ${gwIp} unreachable.`, severity: "critical" });
  }
  const inet = await pingHost("1.1.1.1", 2000).catch(() => ({ ok: false, latencyMs: null }));
  const dns = await dnsTest("example.com", 3000).catch(() => ({ ok: false, ms: 0, addresses: [] as string[] }));
  db.prepare("UPDATE internet SET ts = ?, reachable = ?, dns_ok = ?, latency_ms = ? WHERE id = 1").run(
    now,
    inet.ok ? 1 : 0,
    dns.ok ? 1 : 0,
    inet.latencyMs,
  );
  if (!inet.ok && !dns.ok)
    raiseAlert({ type: "internet-unreachable", message: "Internet unreachable.", severity: "critical" });
}

export function startMonitor(ms?: number): void {
  stopMonitor();
  if (ms) intervalMs = ms;
  timer = setInterval(() => void monitorOnce(), intervalMs);
  timer.unref?.();
  void monitorOnce();
}

export function stopMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
