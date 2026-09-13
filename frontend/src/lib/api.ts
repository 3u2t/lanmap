async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", ...init });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = await r.json();
      if (j?.error) msg = j.error;
    } catch {
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  me: () => req<{ authenticated: boolean; setupNeeded: boolean }>("/api/auth/me"),
  setup: (username: string, password: string) =>
    req<{ ok: boolean }>("/api/auth/setup", json({ username, password })),
  login: (username: string, password: string) =>
    req<{ ok: boolean }>("/api/auth/login", json({ username, password })),
  logout: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  devices: (q = "") => req<{ devices: import("@lanmap/shared").Device[] }>("/api/devices" + q),
  device: (id: string) => req<{ device: import("@lanmap/shared").Device }>(`/api/devices/${id}`),
  updateDevice: (id: string, patch: Record<string, unknown>) =>
    req<{ device: import("@lanmap/shared").Device }>(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  events: (id: string) => req<{ events: { id: number; kind: string; message: string; createdAt: number }[] }>(`/api/devices/${id}/events`),
  history: (id: string, range = "24h") =>
    req<{ points: { at: number; latencyMs: number | null; ok: number }[] }>(`/api/devices/${id}/history?range=${range}`),
  network: () => req<{
    gateway: { ip: string | null; reachable: number; latencyMs: number | null } | null;
    internet: { reachable: number; dnsOk: number; latencyMs: number | null } | null;
    interfaces: import("@lanmap/shared").InterfaceInfo[];
    subnets: string[];
    effectiveGateway: string | null;
    health: { state: string; reasons: string[] };
  }>("/api/network"),
  interfaces: () => req<{ interfaces: import("@lanmap/shared").InterfaceInfo[]; subnets: string[]; gateway: string | null; effectiveGateway?: string | null }>("/api/interfaces"),
  scanState: () => req<{ scan: import("@lanmap/shared").ScanProgress }>("/api/scan"),
  scanStart: (target: string) => req<{ ok: boolean; target: string }>(`/api/scan/start`, json({ target })),
  scanStop: () => req<{ scan: import("@lanmap/shared").ScanProgress }>(`/api/scan/stop`, { method: "POST" }),
  alerts: () => req<{ alerts: import("@lanmap/shared").Alert[] }>("/api/alerts"),
  ackAlert: (id: number) => req<{ ok: boolean }>(`/api/alerts/${id}/ack`, { method: "POST" }),
  summary: (range = "24h") =>
    req<{ devices: unknown[]; disconnects: { deviceId: string; n: number }[]; recent: import("@lanmap/shared").Device[] }>(`/api/history/summary?range=${range}`),
  settings: () => req<{ settings: import("@lanmap/shared").AppSettings }>("/api/settings"),
  saveSettings: (patch: unknown) =>
    req<{ settings: import("@lanmap/shared").AppSettings }>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  dnsTest: (host: string) => req<{ ok: boolean; ms: number; addresses: string[] }>("/api/dns-test", json({ host })),
  health: () => req<Record<string, unknown>>("/api/health"),
};

export function exportUrl(format: "csv" | "json"): string {
  return `/api/export?format=${format}`;
}
