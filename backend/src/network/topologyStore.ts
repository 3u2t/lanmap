import { getDb, getSetting, setSetting } from "../db/db.js";
import { getNeighbors } from "./neighbors.js";
import { estimateHops } from "./topology.js";

let running = false;

export async function refreshTopology(opts: { force?: boolean; concurrency?: number } = {}): Promise<{
  devices: number;
  withHops: number;
  direct: number;
  skipped: boolean;
}> {
  if (running) return { devices: 0, withHops: 0, direct: 0, skipped: true };
  const last = Number(getSetting("topoGeneratedAt", "0")) || 0;
  if (!opts.force && Date.now() - last < 60_000) return { devices: 0, withHops: 0, direct: 0, skipped: true };
  running = true;
  try {
    const db = getDb();
    const devices = db.prepare("SELECT id, ip FROM devices").all() as { id: string; ip: string }[];
    const neigh = new Set((await getNeighbors().catch(() => [])).map((n) => n.ip));
    const concurrency = Math.max(1, Math.min(16, opts.concurrency ?? 8));
    let idx = 0;
    let withHops = 0;
    let direct = 0;
    const upd = db.prepare("UPDATE devices SET hops = ?, l2 = ? WHERE id = ?");
    async function worker() {
      while (idx < devices.length) {
        const d = devices[idx++];
        const hops = await estimateHops(d.ip).catch(() => null);
        let l2: number | null;
        if (hops === 1) l2 = 1;
        else if (hops !== null) l2 = 0;
        else l2 = neigh.has(d.ip) ? 1 : null;
        if (hops !== null) withHops++;
        if (l2 === 1) direct++;
        upd.run(hops, l2, d.id);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, devices.length)) }, worker));
    setSetting("topoGeneratedAt", String(Date.now()));
    return { devices: devices.length, withHops, direct, skipped: false };
  } finally {
    running = false;
  }
}

export function getTopology(): {
  gateway: string | null;
  generatedAt: number | null;
  nodes: { id: string; ip: string; hops: number | null; l2: boolean | null; iface: string | null; subnet: string | null }[];
} {
  const db = getDb();
  const gw = getSetting("gatewayIp", "");
  const gen = Number(getSetting("topoGeneratedAt", "0")) || null;
  const rows = db.prepare("SELECT id, ip, hops, l2, iface FROM devices ORDER BY ip").all() as {
    id: string;
    ip: string;
    hops: number | null;
    l2: number | null;
    iface: string | null;
  }[];
  return {
    gateway: gw || null,
    generatedAt: gen,
    nodes: rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      hops: r.hops,
      l2: r.l2 === null ? null : r.l2 === 1,
      iface: r.iface,
      subnet: null,
    })),
  };
}
