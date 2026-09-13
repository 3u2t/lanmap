import type { Device, DeviceStatus } from "@lanmap/shared";

export function filterDevices(devices: Device[], q: string, status: "" | DeviceStatus): Device[] {
  const needle = q.trim().toLowerCase();
  return devices.filter((d) => {
    if (status && d.status !== status) return false;
    if (!needle) return true;
    return [d.hostname, d.customName, d.ip, d.mac, d.vendor]
      .map((v) => (v ?? "").toLowerCase())
      .some((v) => v.includes(needle));
  });
}

export function sortDevices(devices: Device[], key: "ip" | "latency" | "lastSeen"): Device[] {
  const arr = [...devices];
  if (key === "latency") arr.sort((a, b) => (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9));
  else if (key === "lastSeen") arr.sort((a, b) => b.lastSeen - a.lastSeen);
  else arr.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return arr;
}
