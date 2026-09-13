import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import type { InterfaceInfo } from "@lanmap/shared";

import { execFile as _execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(_execFile);

const VIRTUAL_RE = /^(lo|docker|veth|br-|virbr|tun|tap|wg|tailscale|zt|vEthernet|Loopback|isatap|Teredo)/i;

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function prefixToMask(prefix: number): string {
  const m = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join(".");
}

function cidrFor(ip: string, cidrField?: string): string | null {
  if (cidrField && cidrField.includes("/")) return cidrField;
  if (!ip || ip.startsWith("127.")) return null;
  return `${ip}/24`;
}

export function getInterfaces(): InterfaceInfo[] {
  const all = networkInterfaces();
  const out: InterfaceInfo[] = [];
  for (const [name, addrs] of Object.entries(all)) {
    if (!addrs) continue;
    const v4 = addrs.find((a) => a.family === "IPv4" && !a.internal);
    const v4any = addrs.find((a) => a.family === "IPv4");
    const v6 = addrs.find((a) => a.family === "IPv6" && !a.internal && !a.address.startsWith("fe80"));
    const v6any = addrs.find((a) => a.family === "IPv6");
    const oper = readText(`/sys/class/net/${name}/operstate`)?.trim();
    const speedRaw = readText(`/sys/class/net/${name}/speed`)?.trim();
    let linkSpeedMbps: number | null = null;
    if (speedRaw && /^\d+$/.test(speedRaw)) linkSpeedMbps = Number(speedRaw);
    const ip = v4?.address ?? v4any?.address ?? null;
    out.push({
      name,
      ipv4: ip,
      ipv6: v6?.address ?? v6any?.address ?? null,
      mac: (v4 ?? v4any ?? v6 ?? v6any)?.mac && (v4 ?? v4any ?? v6 ?? v6any)!.mac !== "00:00:00:00:00:00"
        ? (v4 ?? v4any ?? v6 ?? v6any)!.mac.toUpperCase()
        : null,
      cidr: ip ? cidrFor(ip, (v4 ?? v4any)?.cidr ?? undefined) : null,
      status: oper === "up" ? "up" : oper === "down" || oper === "dormant" ? "down" : "unknown",
      linkSpeedMbps,
      virtual: VIRTUAL_RE.test(name),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function detectSubnets(): string[] {
  const envSubnet = process.env.LAN_SUBNET?.trim();
  if (envSubnet) return [envSubnet];
  const out: string[] = [];
  for (const i of getInterfaces()) {
    if (!i.cidr || i.name === "lo") continue;
    if (i.cidr.startsWith("127.")) continue;
    if (!out.includes(i.cidr)) out.push(i.cidr);
  }
  return out;
}

export function getGatewayIp(): string | null {
  const envGw = process.env.GATEWAY_IP?.trim();
  if (envGw && /^\d+\.\d+\.\d+\.\d+$/.test(envGw)) return envGw;
  if (process.platform === "win32") {
    return getGatewayWindowsSync();
  }
  const tryParse = (text: string | null): string | null => {
    if (!text) return null;
    for (const line of text.split("\n").slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 3) continue;
      if (f[1] !== "00000000") continue;
      const hex = f[2];
      if (!/^[0-9a-fA-F]{8}$/.test(hex)) continue;
      const n = parseInt(hex, 16);
      const b = [(n & 255), ((n >> 8) & 255), ((n >> 16) & 255), ((n >> 24) & 255)];
      return b.join(".");
    }
    return null;
  };
  const hostRoute = readText("/host_proc/net/route");
  const fromHost = tryParse(hostRoute);
  if (fromHost) return fromHost;
  try {
    const text = readText("/proc/net/route");
    return tryParse(text);
  } catch {
    return null;
  }
}

function getGatewayWindowsSync(): string | null {
  try {
    const out = execFileSync("route", ["print", "-4"], { timeout: 3000, windowsHide: true, encoding: "utf8" } as unknown as { timeout: number });
    const gw = parseWindowsRoute(out as unknown as string);
    if (gw) return gw;
  } catch {
  }
  try {
    const out = execFileSync("netstat", ["-rn"], { timeout: 3000, windowsHide: true, encoding: "utf8" } as unknown as { timeout: number });
    return parseWindowsRoute(out as unknown as string);
  } catch {
    return null;
  }
}

export async function getGatewayWindows(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("route", ["print", "-4"], { timeout: 3000, windowsHide: true } as unknown as { timeout: number });
    return parseWindowsRoute(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync("netstat", ["-rn"], { timeout: 3000, windowsHide: true } as unknown as { timeout: number });
      return parseWindowsRoute(stdout);
    } catch {
      return null;
    }
  }
}

export function parseWindowsRoute(text: string): string | null {
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m) return m[1];
  }
  return null;
}

export { prefixToMask };
