import { Router } from "express";
import { getDb, getSetting, setSetting } from "../db/db.js";
import { detectSubnets, getGatewayIp, getInterfaces } from "../network/interfaces.js";
import { dnsTest } from "../network/ping.js";
import { getScanState, startScan, stopScan } from "../discovery/scanner.js";
import { getTopology, refreshTopology } from "../network/topologyStore.js";
import { getVapidKeys, pushSubscriptionCount, readNtfy, readWebPush, sendNtfy, sendWebPush } from "../notify/notify.js";
import { ackAlert, listAlerts, networkHealth, raiseAlert } from "../alerts/alerts.js";
import {
  createSession,
  createUser,
  destroySession,
  getSessionUser,
  loginAllowed,
  recordLoginAttempt,
  requireAuth,
  setupNeeded,
  verifyUser,
} from "../auth/auth.js";
import { broadcast, wsClients } from "../ws/hub.js";
import {
  DEFAULT_SETTINGS,
  clampInt,
  isPrivateCidr,
  subnetOf,
  type Device,
} from "@lanmap/shared";

export const router = Router();

function rowToDevice(r: Record<string, unknown>): Device {
  let openPorts: number[] | null = null;
  try {
    const raw = r.open_ports as string | null;
    if (raw) {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) openPorts = p.filter((v): v is number => typeof v === "number");
    }
  } catch {
    openPorts = null;
  }
  return {
    id: String(r.id),
    ip: String(r.ip),
    ipv6: (r.ipv6 as string) ?? null,
    mac: (r.mac as string) ?? null,
    hostname: (r.hostname as string) ?? null,
    customName: (r.custom_name as string) ?? null,
    vendor: (r.vendor as string) ?? null,
    iface: (r.iface as string) ?? null,
    category: (r.category as string) ?? null,
    status: (r.status as Device["status"]) ?? "unknown",
    latencyMs: (r.latency_ms as number) ?? null,
    packetLossPct: (r.packet_loss_pct as number) ?? null,
    monitored: Number(r.monitored) === 1,
    ignored: Number(r.ignored) === 1,
    consecutiveFailures: Number(r.consecutive_failures) ?? 0,
    firstSeen: Number(r.first_seen),
    lastSeen: Number(r.last_seen),
    source: (r.source as string) ?? null,
    openPorts,
    hops: (r.hops as number) ?? null,
    l2: r.l2 === null || r.l2 === undefined ? null : Number(r.l2) === 1,
  };
}

router.post("/api/auth/setup", async (req, res) => {
  if (!setupNeeded()) {
    res.status(400).json({ error: "Setup already complete." });
    return;
  }
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || username.trim().length < 3 || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Username (3+) and password (8+) required." });
    return;
  }
  const id = await createUser(username, password);
  const s = createSession(id);
  res.cookie("lanmap_session", s.token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 3600000, path: "/" });
  res.json({ ok: true });
});

router.post("/api/auth/login", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (!loginAllowed(ip)) {
    res.status(429).json({ error: "Too many attempts. Try again in a minute." });
    return;
  }
  const { username, password } = req.body ?? {};
  const id = typeof username === "string" && typeof password === "string" ? await verifyUser(username, password) : null;
  if (!id) {
    recordLoginAttempt(ip);
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }
  const s = createSession(id);
  res.cookie("lanmap_session", s.token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 3600000, path: "/" });
  res.json({ ok: true });
});

router.post("/api/auth/logout", (req, res) => {
  destroySession(req.cookies?.lanmap_session);
  res.clearCookie("lanmap_session", { path: "/" });
  res.json({ ok: true });
});

router.get("/api/auth/me", (req, res) => {
  const u = getSessionUser(req.cookies?.lanmap_session);
  res.json({ authenticated: u !== null, setupNeeded: setupNeeded() });
});

router.get("/health", (_req, res) => res.json({ ok: true, app: "lanmap" }));
router.get("/api/health", (_req, res) => {
  let dbOk = true;
  try {
    getDb().prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }
  res.json({
    app: "lanmap",
    db: dbOk ? "ok" : "error",
    discovery: getScanState().state,
    monitoring: "ok",
    ws: { clients: wsClients() },
    demo: process.env.DEMO_MODE === "true",
  });
});

router.use("/api/devices", requireAuth);
router.use("/api/network", requireAuth);
router.use("/api/interfaces", requireAuth);
router.use("/api/discovery", requireAuth);
router.use("/api/scan", requireAuth);
router.use("/api/history", requireAuth);
router.use("/api/alerts", requireAuth);
router.use("/api/settings", requireAuth);
router.use("/api/export", requireAuth);
router.use("/api/agent", requireAuth);
router.use("/api/topology", requireAuth);
router.use("/api/notify", requireAuth);
router.use("/api/push", requireAuth);

router.get("/api/devices", (req, res) => {
  const { search = "", status = "", monitored = "" } = req.query as Record<string, string>;
  const rows = getDb().prepare("SELECT * FROM devices ORDER BY last_seen DESC LIMIT 2000").all() as Record<string, unknown>[];
  let devices = rows.map(rowToDevice);
  if (monitored === "1") devices = devices.filter((d) => d.monitored);
  if (status) devices = devices.filter((d) => d.status === status);
  if (!["1", ""].includes(monitored) && monitored !== "") {
    res.status(400).json({ error: "Bad monitored filter." });
    return;
  }
  const q = search.trim().toLowerCase();
  if (q) {
    devices = devices.filter((d) =>
      [d.hostname, d.customName, d.ip, d.mac, d.vendor].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }
  res.json({ devices });
});

const PATCH_FIELDS = new Set(["customName", "category", "monitored", "ignored"]);

router.patch("/api/devices/:id", (req, res) => {
  const body = req.body ?? {};
  for (const k of Object.keys(body)) {
    if (!PATCH_FIELDS.has(k)) {
      res.status(400).json({ error: `Unknown field: ${k}` });
      return;
    }
  }
  const db = getDb();
  const cur = db.prepare("SELECT id FROM devices WHERE id = ?").get(req.params.id) as unknown;
  if (!cur) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  if (body.customName !== undefined && (typeof body.customName !== "string" || body.customName.length > 64)) {
    res.status(400).json({ error: "customName must be a string up to 64 chars." });
    return;
  }
  if (body.category !== undefined && (typeof body.category !== "string" || body.category.length > 32)) {
    res.status(400).json({ error: "category must be a string up to 32 chars." });
    return;
  }
  db.prepare(
    "UPDATE devices SET custom_name = COALESCE(?, custom_name), category = COALESCE(?, category), monitored = COALESCE(?, monitored), ignored = COALESCE(?, ignored) WHERE id = ?",
  ).run(
    body.customName ?? null,
    body.category ?? null,
    body.monitored === undefined ? null : body.monitored ? 1 : 0,
    body.ignored === undefined ? null : body.ignored ? 1 : 0,
    req.params.id,
  );
  const row = db.prepare("SELECT * FROM devices WHERE id = ?").get(req.params.id) as Record<string, unknown>;
  broadcast({ type: "device-updated", payload: rowToDevice(row) });
  res.json({ device: rowToDevice(row) });
});

router.get("/api/devices/:id", (req, res) => {
  const row = getDb().prepare("SELECT * FROM devices WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  res.json({ device: rowToDevice(row) });
});

router.get("/api/devices/:id/events", (req, res) => {
  const rows = getDb()
    .prepare("SELECT id, kind, message, created_at AS createdAt FROM events WHERE device_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(req.params.id);
  res.json({ events: rows });
});

router.get("/api/devices/:id/history", (req, res) => {
  const range = (req.query.range as string) || "24h";
  const spans: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
  if (!spans[range]) {
    res.status(400).json({ error: "Bad range." });
    return;
  }
  const since = Date.now() - spans[range];
  const rows = getDb()
    .prepare("SELECT at, latency_ms AS latencyMs, ok FROM ping_samples WHERE device_id = ? AND at > ? ORDER BY at ASC LIMIT 5000")
    .all(req.params.id, since) as { at: number; latencyMs: number | null; ok: number }[];
  const step = Math.max(1, Math.ceil(rows.length / 500));
  const points = rows.filter((_, i) => i % step === 0);
  res.json({ points });
});

function effectiveGatewayIp(): string | null {
  const fromSettings = getSetting("gatewayIp", "");
  if (fromSettings && /^\d+\.\d+\.\d+\.\d+$/.test(fromSettings)) return fromSettings;
  return getGatewayIp();
}
function effectiveSubnets(): string[] {
  try {
    const raw = getSetting("subnets", "");
    if (raw) {
      const list = JSON.parse(raw) as unknown;
      if (Array.isArray(list)) {
        const clean = list.filter((s): s is string => typeof s === "string" && isPrivateCidr(s));
        if (clean.length > 0) return clean.slice(0, 8);
      }
    }
  } catch {
  }
  const s = getSetting("subnet", "");
  if (s) return [s];
  return detectSubnets();
}

router.get("/api/network", async (_req, res) => {
  const db = getDb();
  const gw = db.prepare("SELECT ts, ip, reachable, latency_ms AS latencyMs FROM gateway WHERE id = 1").get();
  const inet = db.prepare("SELECT ts, reachable, dns_ok AS dnsOk, latency_ms AS latencyMs FROM internet WHERE id = 1").get();
  const ifaces = getInterfaces();
  const subnets = effectiveSubnets();
  res.json({ gateway: gw ?? null, internet: inet ?? null, interfaces: ifaces, subnets, effectiveGateway: effectiveGatewayIp(), health: (await import("../alerts/alerts.js")).networkHealth() });
});

router.get("/api/interfaces", (_req, res) => {
  res.json({ interfaces: getInterfaces(), subnets: effectiveSubnets(), gateway: effectiveGatewayIp() });
});

router.get("/api/discovery", (_req, res) => {
  res.json({ subnets: effectiveSubnets(), gateway: effectiveGatewayIp(), scan: getScanState() });
});

router.post("/api/scan/start", async (req, res) => {
  const body = req.body ?? {};
  let targets: string[];
  if (Array.isArray(body.targets)) targets = body.targets.filter((t: unknown) => typeof t === "string" && t);
  else if (typeof body.target === "string" && body.target) targets = [body.target];
  else targets = effectiveSubnets();
  if (targets.length === 0) {
    res.status(400).json({ error: "No local subnet detected. Enter one like 192.168.1.0/24." });
    return;
  }
  targets = [...new Set(targets)].slice(0, 8);
  for (const t of targets) {
    if (!isPrivateCidr(t)) {
      res.status(400).json({ error: `Only local/private ranges allowed: ${t} (e.g. 192.168.1.0/24).` });
      return;
    }
  }
  try {
    broadcast({ type: "scan-progress", payload: { state: "running", target: targets.join(", ") } });
    void startScan(targets, {
      onProgress: (p) => broadcast({ type: "scan-progress", payload: p }),
    }).then(
      () => {
        broadcast({ type: "scan-progress", payload: getScanState() });
        void refreshTopology().catch(() => null);
      },
      (e: Error) => broadcast({ type: "scan-progress", payload: { state: "error", error: e.message } }),
    );
    res.json({ ok: true, target: targets.join(", "), targets, scan: getScanState() });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post("/api/scan/stop", (_req, res) => res.json({ scan: stopScan() }));
router.get("/api/scan", (_req, res) => res.json({ scan: getScanState() }));

router.get("/api/history/summary", (req, res) => {
  const rangeMs = req.query.range === "7d" ? 604800000 : 86400000;
  const since = Date.now() - rangeMs;
  const db = getDb();
  const devices = db.prepare("SELECT id, ip, hostname, custom_name AS customName, latency_ms AS latency, packet_loss_pct AS loss, status FROM devices WHERE monitored = 1 ORDER BY ip").all();
  const disconnects = db
    .prepare("SELECT device_id AS deviceId, COUNT(*) AS n FROM events WHERE kind = 'disappeared' AND created_at > ? GROUP BY device_id ORDER BY n DESC LIMIT 10")
    .all(since);
  const recent = db.prepare("SELECT * FROM devices ORDER BY first_seen DESC LIMIT 5").all() as Record<string, unknown>[];
  res.json({
    devices,
    disconnects,
    recent: recent.map((r) => rowToDevice(r)),
  });
});

router.get("/api/alerts", (req, res) => {
  res.json({ alerts: listAlerts(Number(req.query.limit) || 100, req.query.open === "1") });
});

router.post("/api/alerts/:id/ack", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Bad id." });
    return;
  }
  ackAlert(id);
  res.json({ ok: true });
});

function readSubnetsSetting(): string[] {
  try {
    const raw = getSetting("subnets", "");
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is string => typeof s === "string" && isPrivateCidr(s)).slice(0, 8);
  } catch {
    return [];
  }
}

function readMethodsSetting(): { arp: boolean; ping: boolean; mdns: boolean; ssdp: boolean; tcp: boolean } {
  const fb = { arp: true, ping: true, mdns: true, ssdp: true, tcp: true };
  try {
    const raw = getSetting("methods", "");
    if (!raw) return fb;
    const j = JSON.parse(raw) as Partial<typeof fb>;
    return {
      arp: j.arp !== false,
      ping: j.ping !== false,
      mdns: j.mdns !== false,
      ssdp: j.ssdp !== false,
      tcp: j.tcp !== false,
    };
  } catch {
    return fb;
  }
}

function readNotifySettings() {
  let ntfy = { enabled: false, server: "https://ntfy.sh", topic: "", minSeverity: "warning" as const };
  let webpush = { enabled: false, minSeverity: "warning" as const };
  try {
    const j = JSON.parse(getSetting("ntfy", "{}")) as Partial<typeof ntfy>;
    ntfy = {
      enabled: j.enabled === true,
      server: typeof j.server === "string" && j.server ? j.server : "https://ntfy.sh",
      topic: typeof j.topic === "string" ? j.topic : "",
      minSeverity: ["info", "warning", "critical"].includes(j.minSeverity as string)
        ? (j.minSeverity as typeof ntfy.minSeverity)
        : "warning",
    };
  } catch {
  }
  try {
    const j = JSON.parse(getSetting("webpush", "{}")) as Partial<typeof webpush>;
    webpush = {
      enabled: j.enabled === true,
      minSeverity: ["info", "warning", "critical"].includes(j.minSeverity as string)
        ? (j.minSeverity as typeof webpush.minSeverity)
        : "warning",
    };
  } catch {
  }
  return { ntfy, webpush };
}

function currentSettings() {
  return {
    monitoring: {
      intervalMs: clampInt(Number(getSetting("intervalMs", String(DEFAULT_SETTINGS.monitoring.intervalMs))), 5000, 300000, 10000),
      pingTimeoutMs: clampInt(Number(getSetting("pingTimeoutMs", "1500")), 500, 10000, 1500),
      offlineAfterFailures: clampInt(Number(getSetting("offlineAfterFailures", "3")), 1, 10, 3),
      latencyThresholdMs: clampInt(Number(getSetting("latencyThresholdMs", "200")), 10, 5000, 200),
      packetLossThresholdPct: clampInt(Number(getSetting("packetLossThresholdPct", "10")), 0, 100, 10),
    },
    discovery: {
      subnet: getSetting("subnet", "") || null,
      subnets: readSubnetsSetting(),
      gatewayIp: getSetting("gatewayIp", "") || null,
      scanIntervalMs: clampInt(Number(getSetting("scanIntervalMs", "300000")), 60000, 3600000, 300000),
      methods: readMethodsSetting(),
    },
    alerts: {
      newDevice: getSetting("alertNew", "1") === "1",
      offline: getSetting("alertOffline", "1") === "1",
      onlineAgain: getSetting("alertOnline", "1") === "1",
      highLatency: getSetting("alertLatency", "1") === "1",
      packetLoss: getSetting("alertLoss", "1") === "1",
    },
    notifications: readNotifySettings(),
    appearance: { theme: (getSetting("theme", "dark") as "dark" | "light" | "system") ?? "dark" },
    retentionDays: clampInt(Number(getSetting("retentionDays", "30")), 1, 365, 30),
  };
}

router.get("/api/settings", (_req, res) => res.json({ settings: currentSettings() }));

router.put("/api/settings", (req, res) => {
  const b = req.body ?? {};
  try {
    if (b.monitoring) {
      const m = b.monitoring;
      if (m.intervalMs !== undefined) setSetting("intervalMs", String(clampInt(m.intervalMs, 5000, 300000, 10000)));
      if (m.pingTimeoutMs !== undefined) setSetting("pingTimeoutMs", String(clampInt(m.pingTimeoutMs, 500, 10000, 1500)));
      if (m.offlineAfterFailures !== undefined) setSetting("offlineAfterFailures", String(clampInt(m.offlineAfterFailures, 1, 10, 3)));
      if (m.latencyThresholdMs !== undefined) setSetting("latencyThresholdMs", String(clampInt(m.latencyThresholdMs, 10, 5000, 200)));
      if (m.packetLossThresholdPct !== undefined) setSetting("packetLossThresholdPct", String(clampInt(m.packetLossThresholdPct, 0, 100, 10)));
    }
    if (b.discovery?.subnet !== undefined) {
      if (b.discovery.subnet !== null && !isPrivateCidr(String(b.discovery.subnet))) {
        res.status(400).json({ error: "Subnet must be a private range." });
        return;
      }
      setSetting("subnet", b.discovery.subnet ?? "");
    }
    if (b.discovery?.gatewayIp !== undefined) {
      if (b.discovery.gatewayIp !== null && !/^\d+\.\d+\.\d+\.\d+$/.test(String(b.discovery.gatewayIp))) {
        res.status(400).json({ error: "Gateway must be an IPv4 address." });
        return;
      }
      if (b.discovery.gatewayIp !== null && !isPrivateCidr(String(b.discovery.gatewayIp) + "/32")) {
        res.status(400).json({ error: "Gateway must be a private address." });
        return;
      }
      setSetting("gatewayIp", b.discovery.gatewayIp ?? "");
    }
    if (b.discovery?.subnets !== undefined) {
      if (!Array.isArray(b.discovery.subnets) || b.discovery.subnets.length > 8) {
        res.status(400).json({ error: "subnets must be an array of up to 8 ranges." });
        return;
      }
      for (const s of b.discovery.subnets) {
        if (typeof s !== "string" || !isPrivateCidr(s)) {
          res.status(400).json({ error: `Not a private range: ${String(s)}` });
          return;
        }
      }
      setSetting("subnets", JSON.stringify(b.discovery.subnets));
    }
    if (b.discovery?.methods !== undefined) {
      const m = b.discovery.methods;
      const cur = readMethodsSetting();
      const merged = {
        arp: m.arp === undefined ? cur.arp : m.arp === true,
        ping: m.ping === undefined ? cur.ping : m.ping === true,
        mdns: m.mdns === undefined ? cur.mdns : m.mdns === true,
        ssdp: m.ssdp === undefined ? cur.ssdp : m.ssdp === true,
        tcp: m.tcp === undefined ? cur.tcp : m.tcp === true,
      };
      if (!merged.arp && !merged.ping && !merged.mdns && !merged.ssdp && !merged.tcp) {
        res.status(400).json({ error: "At least one discovery method must stay enabled." });
        return;
      }
      setSetting("methods", JSON.stringify(merged));
    }
    if (b.notifications?.ntfy !== undefined) {
      const n = b.notifications.ntfy;
      const cur = readNotifySettings().ntfy;
      const server = n.server === undefined ? cur.server : String(n.server || "").replace(/\/+$/, "");
      if (server && !/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(server)) {
        res.status(400).json({ error: "ntfy server must be an http(s) URL." });
        return;
      }
      const topic = n.topic === undefined ? cur.topic : String(n.topic || "");
      if (topic && !/^[a-zA-Z0-9_-]{1,64}$/.test(topic)) {
        res.status(400).json({ error: "ntfy topic must be 1-64 chars: letters, numbers, _ -." });
        return;
      }
      const minSeverity = n.minSeverity === undefined ? cur.minSeverity : n.minSeverity;
      if (!["info", "warning", "critical"].includes(minSeverity)) {
        res.status(400).json({ error: "Bad minSeverity." });
        return;
      }
      setSetting("ntfy", JSON.stringify({
        enabled: n.enabled === undefined ? cur.enabled : n.enabled === true,
        server: server || "https://ntfy.sh",
        topic,
        minSeverity,
      }));
    }
    if (b.notifications?.webpush !== undefined) {
      const w = b.notifications.webpush;
      const cur = readNotifySettings().webpush;
      const minSeverity = w.minSeverity === undefined ? cur.minSeverity : w.minSeverity;
      if (!["info", "warning", "critical"].includes(minSeverity)) {
        res.status(400).json({ error: "Bad minSeverity." });
        return;
      }
      setSetting("webpush", JSON.stringify({
        enabled: w.enabled === undefined ? cur.enabled : w.enabled === true,
        minSeverity,
      }));
    }
    if (b.retentionDays !== undefined) setSetting("retentionDays", String(clampInt(b.retentionDays, 1, 365, 30)));
    if (b.appearance?.theme !== undefined) {
      if (!["dark", "light", "system"].includes(b.appearance.theme)) {
        res.status(400).json({ error: "Bad theme." });
        return;
      }
      setSetting("theme", b.appearance.theme);
    }
    res.json({ settings: currentSettings() });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post("/api/dns-test", async (req, res) => {
  const { host } = req.body ?? {};
  if (typeof host !== "string" || !/^[a-zA-Z0-9.-]{1,253}$/.test(host)) {
    res.status(400).json({ error: "Invalid hostname." });
    return;
  }
  res.json(await dnsTest(host));
});

router.get("/api/export", (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "json";
  const rows = getDb().prepare("SELECT id, ip, mac, hostname, custom_name, status, latency_ms, packet_loss_pct, first_seen, last_seen FROM devices ORDER BY ip").all();
  if (format === "csv") {
    const head = "id,ip,mac,hostname,custom_name,status,latency_ms,packet_loss_pct,first_seen,last_seen";
    const lines = (rows as Record<string, unknown>[]).map((r) =>
      [r.id, r.ip, r.mac ?? "", r.hostname ?? "", r.custom_name ?? "", r.status, r.latency_ms ?? "", r.packet_loss_pct ?? "", r.first_seen, r.last_seen].join(","),
    );
    res.header("Content-Type", "text/csv").send(head + "\n" + lines.join("\n"));
    return;
  }
  res.json({ devices: rows });
});

router.post("/api/agent/report", (req, res) => {
  const secret = process.env.AGENT_SECRET;
  if (secret && req.header("X-Agent-Secret") !== secret) {
    res.status(401).json({ error: "Bad agent secret." });
    return;
  }
  res.json({ ok: true });
});

router.post("/api/_test/alert", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const a = raiseAlert({ type: "new-device", message: String(req.body?.message ?? "test"), severity: "info" });
  res.json(a);
});

router.get("/api/topology", (_req, res) => {
  const topo = getTopology();
  const subs = effectiveSubnets();
  res.json({
    ...topo,
    subnets: subs,
    nodes: topo.nodes.map((n) => ({ ...n, subnet: subnetOf(n.ip, subs) })),
  });
});

router.post("/api/topology/refresh", async (_req, res) => {
  const r = await refreshTopology({ force: true }).catch((e: Error) => ({ error: e.message }));
  res.json(r);
});

router.get("/api/notify/status", (_req, res) => {
  const ntfy = readNtfy();
  const webpush = readWebPush();
  res.json({
    ntfy: { enabled: ntfy.enabled, server: ntfy.server, topic: ntfy.topic, minSeverity: ntfy.minSeverity },
    webpush: { enabled: webpush.enabled, minSeverity: webpush.minSeverity, subscriptions: pushSubscriptionCount() },
  });
});

router.post("/api/notify/test", async (req, res) => {
  const channel = (req.body as { channel?: string } | undefined)?.channel;
  try {
    if (channel === "ntfy") {
      const cfg = readNtfy();
      await sendNtfy(cfg, "LANMap", "Test notification from LANMap.", "info");
      res.json({ ok: true, channel });
      return;
    }
    if (channel === "webpush") {
      const r = await sendWebPush("LANMap", "Test notification from LANMap.", "info");
      res.json({ ok: true, channel, ...r });
      return;
    }
    res.status(400).json({ error: "channel must be ntfy or webpush." });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get("/api/push/vapid", (_req, res) => {
  res.json({ publicKey: getVapidKeys().publicKey });
});

router.post("/api/push/subscribe", (req, res) => {
  const { endpoint, keys } = (req.body ?? {}) as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 2000) {
    res.status(400).json({ error: "Invalid endpoint." });
    return;
  }
  const k = keys as { p256dh?: unknown; auth?: unknown } | undefined;
  if (!k || typeof k.p256dh !== "string" || typeof k.auth !== "string" || !k.p256dh || !k.auth) {
    res.status(400).json({ error: "Invalid keys." });
    return;
  }
  getDb()
    .prepare("INSERT INTO push_subscriptions (endpoint, keys, created_at) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET keys = excluded.keys")
    .run(endpoint, JSON.stringify({ p256dh: k.p256dh, auth: k.auth }), Date.now());
  res.json({ ok: true });
});

router.delete("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = (req.body ?? {}) as { endpoint?: unknown };
  if (typeof endpoint === "string" && endpoint) {
    getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }
  res.json({ ok: true });
});

export { networkHealth };
