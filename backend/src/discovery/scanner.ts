import { randomUUID } from "node:crypto";
import { getDb, getSetting } from "../db/db.js";
import { getNeighbors } from "../network/neighbors.js";
import { pingHost, reverseDns } from "../network/ping.js";
import { browseSsdp } from "./ssdp.js";
import { scanPorts } from "./tcp.js";
import { browseMdns } from "./mdns.js";
import { isPrivateCidr, listHosts, normalizeMac, sameDevice } from "@lanmap/shared";
import type { DiscoveryMethods, ScanProgress } from "@lanmap/shared";

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

export function readMethods(): DiscoveryMethods {
  const fb: DiscoveryMethods = { arp: true, ping: true, mdns: true, ssdp: true, tcp: true };
  try {
    const raw = getSetting("methods", "");
    if (!raw) return fb;
    const j = JSON.parse(raw) as Partial<DiscoveryMethods>;
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

function rowToMatch(r: { ip: string; mac: string | null }) {
  return { ip: r.ip, mac: r.mac };
}

export async function startScan(target: string | string[], ev: ScanEvents = {}): Promise<ScanProgress> {
  if (scan.state === "running") return getScanState();
  const targets = [...new Set((Array.isArray(target) ? target : [target]).map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  if (targets.length === 0) throw new Error("No scan target given.");
  for (const t of targets) {
    if (!isPrivateCidr(t)) {
      const err = `Refusing to scan ${t}: only local/private ranges allowed.`;
      scan.state = "error";
      scan.error = err;
      throw new Error(err);
    }
  }
  const methods = readMethods();
  const perTarget: { cidr: string; hosts: string[] }[] = [];
  for (const t of targets) {
    const hosts = listHosts(t, 1024);
    if (!hosts) {
      const err = `Range too large (max ~1024 hosts): ${t}. Pick a smaller subnet.`;
      scan.state = "error";
      scan.error = err;
      throw new Error(err);
    }
    perTarget.push({ cidr: t, hosts });
  }
  const concurrency = Math.max(1, Math.min(64, Number(process.env.SCAN_CONCURRENCY) || 32));
  const allHosts = perTarget.flatMap((p) => p.hosts);
  const label = targets.join(", ");
  Object.assign(scan, {
    state: "running",
    target: label,
    total: allHosts.length,
    done: 0,
    found: 0,
    startedAt: Date.now(),
    error: null,
    stop: false,
  });

  const db = getDb();
  const neigh = methods.arp ? await getNeighbors().catch(() => []) : [];
  const macByIp = new Map(neigh.map((n) => [n.ip, n] as const));

  const ssdpP = methods.ssdp ? browseSsdp(3500).catch(() => []) : Promise.resolve([]);
  const mdnsP = methods.mdns ? browseMdns(3000).catch(() => []) : Promise.resolve([]);

  const seen = new Set<string>();
  const emit = () => ev.onProgress?.(getScanState());

  async function worker(queue: string[]) {
    while (queue.length > 0 && !scan.stop) {
      const ip = queue.shift()!;
      let ok = false;
      let latency: number | null = null;
      let source = "arp";
      let openPorts: number[] = [];
      if (methods.ping) {
        const res = await pingHost(ip, 1200).catch(() => ({ ok: false as const, latencyMs: null }));
        ok = res.ok;
        latency = res.latencyMs;
        if (ok) source = "ping";
      }
      if (!ok) {
        if (!macByIp.has(ip)) {
          if (methods.tcp) {
            openPorts = await scanPorts(ip).catch(() => []);
            if (openPorts.length > 0) {
              ok = true;
              source = "tcp";
            }
          }
          if (!ok) {
            scan.done = (scan.done ?? 0) + 1;
            if (scan.done % 10 === 0) emit();
            continue;
          }
        } else {
          source = "arp";
          ok = true;
        }
      }
      const mac = macByIp.get(ip)?.mac ?? null;
      const iface = macByIp.get(ip)?.iface ?? null;
      const hostname = await reverseDns(ip).catch(() => null);
      upsertDevice(db, { ip, mac, iface, hostname, latencyMs: latency, source, openPorts });
      scan.found = (scan.found ?? 0) + 1;
      seen.add(ip);
      scan.done = (scan.done ?? 0) + 1;
      if (scan.done % 10 === 0) emit();
    }
  }

  const queue = [...allHosts];
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, () =>
    worker(queue),
  );
  const [ssdpList, mdnsList] = await Promise.all([
    ssdpP.catch(() => [] as Awaited<ReturnType<typeof browseSsdp>>),
    mdnsP.catch(() => [] as Awaited<ReturnType<typeof browseMdns>>),
    Promise.all(workers).then(() => null),
  ]).then(([s, m]) => [s, m] as const);
  for (const s of ssdpList) {
    if (seen.has(s.ip)) continue;
    const mac = macByIp.get(s.ip)?.mac ?? null;
    upsertDevice(db, {
      ip: s.ip,
      mac,
      iface: macByIp.get(s.ip)?.iface ?? null,
      hostname: null,
      latencyMs: null,
      source: "ssdp",
      openPorts: [],
    });
    scan.found = (scan.found ?? 0) + 1;
    seen.add(s.ip);
  }
  for (const m of mdnsList) {
    if (seen.has(m.ip)) continue;
    const mac = macByIp.get(m.ip)?.mac ?? null;
    upsertDevice(db, {
      ip: m.ip,
      mac,
      iface: macByIp.get(m.ip)?.iface ?? null,
      hostname: m.hostname,
      latencyMs: null,
      source: "mdns",
      openPorts: [],
    });
    scan.found = (scan.found ?? 0) + 1;
    seen.add(m.ip);
  }

  emit();
  scan.state = scan.stop ? "stopped" : "done";
  emit();
  return getScanState();
}

export function stopScan(): ScanProgress {
  scan.stop = true;
  return getScanState();
}

export interface UpsertInput {
  ip: string;
  mac: string | null;
  iface: string | null;
  hostname: string | null;
  latencyMs: number | null;
  source?: string | null;
  openPorts?: number[];
}

export function upsertDevice(
  db: ReturnType<typeof getDb>,
  d: UpsertInput,
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
  const ports = d.openPorts && d.openPorts.length > 0 ? JSON.stringify(d.openPorts) : null;
  if (!match) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO devices (id, ip, mac, hostname, iface, status, latency_ms, source, open_ports, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, 'online', ?, ?, ?, ?, ?)",
    ).run(id, d.ip, mac, d.hostname, d.iface, d.latencyMs, d.source ?? "ping", ports, now, now);
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
    "UPDATE devices SET ip = ?, mac = COALESCE(?, mac), hostname = COALESCE(?, hostname), iface = COALESCE(?, iface), status = 'online', latency_ms = COALESCE(?, latency_ms), source = COALESCE(source, ?), open_ports = COALESCE(?, open_ports), last_seen = ? WHERE id = ?",
  ).run(d.ip, mac, d.hostname, d.iface, d.latencyMs, d.source ?? "ping", ports, now, match.id);
}
