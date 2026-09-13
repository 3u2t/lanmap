import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { normalizeMac } from "@lanmap/shared";

export interface Neighbor {
  ip: string;
  mac: string | null;
  iface: string | null;
}

export function parseArpTable(text: string): Neighbor[] {
  const out: Neighbor[] = [];
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].trim().split(/\s+/);
    if (f.length < 6) continue;
    const [ip, , , mac, , iface] = f;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue;
    out.push({ ip, mac: normalizeMac(mac) ?? null, iface: iface ?? null });
  }
  return out;
}

export function parseWindowsArp(text: string): Neighbor[] {
  const out: Neighbor[] = [];
  let currentIface: string | null = null;
  for (const line of text.split("\n")) {
    const ifaceMatch = line.match(/Interface:\s+(\d+\.\d+\.\d+\.\d+)\s+---/);
    if (ifaceMatch) {
      currentIface = ifaceMatch[1];
      continue;
    }
    const m = line.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})\s+\w+/);
    if (m) {
      const mac = normalizeMac(m[2]);
      if (mac) out.push({ ip: m[1], mac, iface: currentIface });
      else out.push({ ip: m[1], mac: null, iface: currentIface });
    }
  }
  return out;
}

export function parseIpNeigh(text: string): Neighbor[] {
  const out: Neighbor[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\S+)\s+dev\s+(\S+)\s+lladdr\s+(\S+)(?:\s+(\S+))?/);
    if (m) {
      if (m[4] === "FAILED" || m[4] === "INCOMPLETE") continue;
      out.push({ ip: m[1], mac: normalizeMac(m[3]) ?? null, iface: m[2] });
      continue;
    }
    const m2 = line.trim().match(/^(\S+)\s+dev\s+(\S+)(?:\s+(\S+))?/);
    if (m2 && /^\d+\.\d+\.\d+\.\d+$/.test(m2[1])) {
      if (m2[3] === "FAILED") continue;
      out.push({ ip: m2[1], mac: null, iface: m2[2] });
    }
  }
  return out;
}

function run(cmd: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1 << 20, windowsHide: true } as unknown as { timeout: number }, (err, stdout) => {
      if (err) return resolve("");
      resolve(stdout);
    });
  });
}

export async function getNeighbors(): Promise<Neighbor[]> {
  const byIp = new Map<string, Neighbor>();
  if (process.platform === "win32") {
    const out = await run("arp", ["-a"]);
    if (out) for (const n of parseWindowsArp(out)) byIp.set(n.ip, n);
    return [...byIp.values()];
  }
  try {
    const arp = readFileSync("/proc/net/arp", "utf8");
    for (const n of parseArpTable(arp)) byIp.set(n.ip, n);
  } catch {
  }
  const neigh = await run("ip", ["neigh", "show"]);
  if (neigh) {
    for (const n of parseIpNeigh(neigh)) {
      const prev = byIp.get(n.ip);
      if (!prev) byIp.set(n.ip, n);
      else if (!prev.mac && n.mac) byIp.set(n.ip, { ...prev, mac: n.mac });
    }
  }
  return [...byIp.values()];
}
