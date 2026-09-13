export type DeviceStatus = "online" | "offline" | "unknown";

export const BUILTIN_CATEGORIES = [
  "PC",
  "Laptop",
  "Phone",
  "Tablet",
  "Server",
  "Raspberry Pi",
  "Console",
  "TV",
  "IoT",
  "Printer",
  "Network",
  "Other",
] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];
export type DeviceCategory = BuiltinCategory | (string & {});

export interface Device {
  id: string;
  ip: string;
  ipv6?: string | null;
  mac?: string | null;
  hostname?: string | null;
  customName?: string | null;
  vendor?: string | null;
  iface?: string | null;
  category?: string | null;
  status: DeviceStatus;
  latencyMs?: number | null;
  packetLossPct?: number | null;
  monitored: boolean;
  ignored: boolean;
  consecutiveFailures: number;
  firstSeen: number;
  lastSeen: number;
  source?: string | null;
  openPorts?: number[] | null;
  hops?: number | null;
  l2?: boolean | null;
}

export interface InterfaceInfo {
  name: string;
  ipv4?: string | null;
  ipv6?: string | null;
  mac?: string | null;
  cidr?: string | null;
  status: "up" | "down" | "unknown";
  linkSpeedMbps?: number | null;
  virtual: boolean;
}

export type AlertType =
  | "device-offline"
  | "device-online"
  | "new-device"
  | "high-latency"
  | "packet-loss"
  | "gateway-unreachable"
  | "internet-unreachable"
  | "ip-changed"
  | "hostname-changed";

export interface Alert {
  id: number;
  type: AlertType;
  deviceId?: string | null;
  message: string;
  severity: "info" | "warning" | "critical";
  createdAt: number;
  acknowledged: boolean;
}

export interface ScanProgress {
  state: "idle" | "running" | "done" | "stopped" | "error";
  target?: string | null;
  total?: number | null;
  done?: number | null;
  found?: number | null;
  startedAt?: number | null;
  error?: string | null;
}

export interface WsMessage {
  type:
    | "device-updated"
    | "presence"
    | "alert"
    | "scan-progress"
    | "latency"
    | "hello";
  payload: unknown;
  at: number;
}

export type NotifySeverity = "info" | "warning" | "critical";

export interface NtfySettings {
  enabled: boolean;
  server: string;
  topic: string;
  minSeverity: NotifySeverity;
}

export interface WebPushSettings {
  enabled: boolean;
  minSeverity: NotifySeverity;
}

export interface NotificationSettings {
  ntfy: NtfySettings;
  webpush: WebPushSettings;
}

export interface DiscoveryMethods {
  arp: boolean;
  ping: boolean;
  mdns: boolean;
  ssdp: boolean;
  tcp: boolean;
}

export interface AppSettings {
  monitoring: {
    intervalMs: number;
    pingTimeoutMs: number;
    offlineAfterFailures: number;
    latencyThresholdMs: number;
    packetLossThresholdPct: number;
  };
  discovery: {
    subnet: string | null;
    subnets: string[];
    gatewayIp: string | null;
    scanIntervalMs: number;
    methods: DiscoveryMethods;
  };
  alerts: {
    newDevice: boolean;
    offline: boolean;
    onlineAgain: boolean;
    highLatency: boolean;
    packetLoss: boolean;
  };
  notifications: NotificationSettings;
  appearance: { theme: "dark" | "light" | "system" };
  retentionDays: number;
}

export interface TopoNode {
  id: string;
  ip: string;
  hops: number | null;
  l2: boolean | null;
  iface: string | null;
  subnet: string | null;
}

export interface Topology {
  gateway: string | null;
  generatedAt: number | null;
  nodes: TopoNode[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  monitoring: {
    intervalMs: 10_000,
    pingTimeoutMs: 1500,
    offlineAfterFailures: 3,
    latencyThresholdMs: 200,
    packetLossThresholdPct: 10,
  },
  discovery: {
    subnet: null,
    subnets: [],
    gatewayIp: null,
    scanIntervalMs: 5 * 60_000,
    methods: { arp: true, ping: true, mdns: true, ssdp: true, tcp: true },
  },
  alerts: {
    newDevice: true,
    offline: true,
    onlineAgain: true,
    highLatency: true,
    packetLoss: true,
  },
  notifications: {
    ntfy: { enabled: false, server: "https://ntfy.sh", topic: "", minSeverity: "warning" },
    webpush: { enabled: false, minSeverity: "warning" },
  },
  appearance: { theme: "dark" },
  retentionDays: 30,
};


export function parseIpv4(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

export function ipv4ToString(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export interface ParsedCidr {
  ip: string;
  prefix: number;
  network: string;
  broadcast: string;
  mask: string;
  hostCount: number;
}

export function parseCidr(cidr: string): ParsedCidr | null {
  const m = cidr.trim().split("/");
  if (m.length !== 2) return null;
  const ipNum = parseIpv4(m[0]);
  const prefix = Number(m[1]);
  if (ipNum === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostBits = 32 - prefix;
  const hostCount = hostBits >= 31 ? (hostBits === 32 ? 1 : 2) : 2 ** hostBits;
  return {
    ip: m[0].trim(),
    prefix,
    network: ipv4ToString(network),
    broadcast: ipv4ToString(broadcast),
    mask: ipv4ToString(mask),
    hostCount,
  };
}

export function listHosts(cidr: string, max = 1024): string[] | null {
  const p = parseCidr(cidr);
  if (!p) return null;
  if (p.hostCount > max + 2) return null;
  const net = parseIpv4(p.network)!;
  const bcast = parseIpv4(p.broadcast)!;
  const out: string[] = [];
  for (let n = net + 1; n < bcast; n++) {
    out.push(ipv4ToString(n >>> 0));
    if (out.length > max) return null;
  }
  return out;
}


function firstHextet(ipv6: string): number | null {
  const noZone = ipv6.split("%")[0].toLowerCase().trim();
  if (!noZone.includes(":")) return null;
  const head = noZone.startsWith(":") ? "0" : noZone.split(":")[0];
  if (head === "") return 0;
  if (!/^[0-9a-f]{1,4}$/.test(head)) return null;
  return parseInt(head, 16);
}

export function isPrivateIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    const b0 = (v4 >>> 24) & 255;
    const b1 = (v4 >>> 16) & 255;
    if (b0 === 10) return true;
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    if (b0 === 192 && b1 === 168) return true;
    if (b0 === 169 && b1 === 254) return true;
    if ((v4 >>> 24) === 0xfc || (v4 >>> 24) === 0xfd) return false;
    return false;
  }
  const first = firstHextet(ip);
  if (first === null) return false;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  return false;
}

export function isPrivateCidr(cidr: string): boolean {
  const s = cidr.trim();
  const slash = s.lastIndexOf("/");
  if (slash === -1) return false;
  const addr = s.slice(0, slash).trim();
  const prefix = Number(s.slice(slash + 1));
  if (!Number.isInteger(prefix)) return false;

  if (addr.includes(".")) {
    if (prefix < 0 || prefix > 32) return false;
    const n = parseIpv4(addr);
    if (n === null) return false;
    const b0 = (n >>> 24) & 255;
    if (b0 === 127 || n === 0) return false;
    if (prefix === 0) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (n & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    return isPrivateIp(ipv4ToString(network)) && isPrivateIp(ipv4ToString(broadcast));
  }

  if (!addr.includes(":")) return false;
  if (prefix < 0 || prefix > 128) return false;
  if (prefix === 0) return false;
  const first = firstHextet(addr);
  if (first === null) return false;
  if (addr === "::1" || addr === "::") return false;
  return isPrivateIp(addr);
}


export function normalizeMac(input: string): string | null {
  const s = input.trim().toLowerCase();
  let hex: string;
  if (s.includes(":")) hex = s.split(":").join("");
  else if (s.includes("-")) hex = s.split("-").join("");
  else if (s.includes(".")) hex = s.split(".").join("");
  else hex = s;
  if (!/^[0-9a-f]{12}$/.test(hex)) return null;
  return hex
    .match(/.{2}/g)!
    .join(":")
    .toUpperCase();
}


export function sameDevice(
  a: { mac?: string | null; ip: string },
  b: { mac?: string | null; ip: string },
): boolean {
  const ma = a.mac ? normalizeMac(a.mac) : null;
  const mb = b.mac ? normalizeMac(b.mac) : null;
  if (ma && mb) return ma === mb;
  return a.ip === b.ip;
}


export function packetLossPct(sent: number, received: number): number {
  if (sent <= 0) return 0;
  const lost = Math.max(0, sent - received);
  return Math.round((lost / sent) * 1000) / 10;
}

export function summarizeLatencies(samples: number[]): {
  avg: number;
  min: number;
  max: number;
  count: number;
} | null {
  const vals = samples.filter((v) => Number.isFinite(v) && v >= 0);
  if (vals.length === 0) return null;
  let min = vals[0];
  let max = vals[0];
  let sum = 0;
  for (const v of vals) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    avg: Math.round((sum / vals.length) * 10) / 10,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    count: vals.length,
  };
}

export function nextPresenceState(args: {
  probeOk: boolean;
  consecutiveFailures: number;
  offlineAfterFailures: number;
}): { status: DeviceStatus; consecutiveFailures: number } {
  const threshold = Math.max(1, Math.floor(args.offlineAfterFailures));
  if (args.probeOk) return { status: "online", consecutiveFailures: 0 };
  const fails = args.consecutiveFailures + 1;
  if (fails >= threshold) return { status: "offline", consecutiveFailures: fails };
  return { status: "unknown", consecutiveFailures: fails };
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function displayName(d: {
  customName?: string | null;
  hostname?: string | null;
  ip: string;
}): string {
  return d.customName || d.hostname || d.ip;
}

export function severityRank(s: string): number {
  if (s === "critical") return 3;
  if (s === "warning") return 2;
  return 1;
}

export function passesSeverity(severity: string, min: NotifySeverity): boolean {
  return severityRank(severity) >= severityRank(min);
}

export function subnetOf(ip: string, subnets: string[]): string | null {
  const n = parseIpv4(ip);
  if (n === null) return null;
  for (const cidr of subnets) {
    const p = parseCidr(cidr);
    if (!p) continue;
    const mask = p.prefix === 0 ? 0 : (0xffffffff << (32 - p.prefix)) >>> 0;
    const net = (parseIpv4(p.network) ?? 0) & mask;
    if (((n & mask) >>> 0) === (net >>> 0)) return `${p.network}/${p.prefix}`;
  }
  return null;
}

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}
