import { createSocket } from "node:dgram";

export interface SsdpDevice {
  ip: string;
  location: string | null;
  st: string | null;
  server: string | null;
}

const MULTICAST = "239.255.255.250";
const PORT = 1900;

export function parseSsdpResponse(text: string): Omit<SsdpDevice, "ip"> | null {
  if (!/^HTTP\/1/i.test(text.trim())) return null;
  const headers: Record<string, string> = {};
  for (const line of text.split("\r\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  if (!headers.location) return null;
  return {
    location: headers.location,
    st: headers.st ?? null,
    server: headers.server ?? null,
  };
}

export function ipFromUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/:]+)/i);
  if (!m) return null;
  const host = m[1].replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  return null;
}

export async function browseSsdp(timeoutMs = 4000): Promise<SsdpDevice[]> {
  const found = new Map<string, SsdpDevice>();
  const sock = createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      sock.once("error", reject);
      sock.bind(0, "0.0.0.0", () => {
        try {
          sock.setMulticastTTL(2);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    sock.on("message", (msg) => {
      const p = parseSsdpResponse(msg.toString("utf8"));
      if (!p || !p.location) return;
      const ip = ipFromUrl(p.location);
      if (!ip) return;
      if (!found.has(ip)) found.set(ip, { ip, ...p });
    });
    const query = [
      "M-SEARCH * HTTP/1.1",
      `HOST: ${MULTICAST}:${PORT}`,
      'MAN: "ns=01"',
      "MX: 2",
      "ST: ssdp:all",
      "",
      "",
    ].join("\r\n");
    sock.send(query, PORT, MULTICAST);
    await new Promise((r) => setTimeout(r, timeoutMs));
  } catch {
    return [...found.values()];
  } finally {
    try {
      sock.close();
    } catch {
    }
  }
  return [...found.values()];
}
