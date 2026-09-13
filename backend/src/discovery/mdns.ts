import { createSocket } from "node:dgram";

export interface MdnsDevice {
  ip: string;
  hostname: string | null;
  services: string[];
}

const MDNS_GROUP = "224.0.0.251";
const MDNS_PORT = 5353;

function encodeName(name: string): Buffer {
  const parts: Buffer[] = [];
  for (const label of name.split(".")) {
    const b = Buffer.from(label, "utf8");
    parts.push(Buffer.from([b.length]), b);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

export function buildMdnsQuery(service: string, id = 0x42): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0000, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  const q = encodeName(service);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(12, 0);
  tail.writeUInt16BE(1, 2);
  return Buffer.concat([header, q, tail]);
}

interface DnsRecord {
  name: string;
  type: number;
  ttl: number;
  target: string | null;
  addr: string | null;
}

function readName(buf: Buffer, off: number): { name: string; next: number } {
  const labels: string[] = [];
  let pos = off;
  let jumped = false;
  let end = off;
  for (let steps = 0; steps < 32; steps++) {
    if (pos >= buf.length) break;
    const len = buf[pos];
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      if (!jumped) end = pos + 2;
      pos = ptr;
      jumped = true;
      continue;
    }
    if (len === 0) {
      if (!jumped) end = pos + 1;
      break;
    }
    pos++;
    labels.push(buf.slice(pos, pos + len).toString("utf8"));
    pos += len;
    if (!jumped) end = pos;
  }
  return { name: labels.join("."), next: end };
}

export function parseMdnsPacket(buf: Buffer): DnsRecord[] {
  const out: DnsRecord[] = [];
  if (buf.length < 12) return out;
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  let pos = 12;
  for (let i = 0; i < qd && pos < buf.length; i++) {
    const { next } = readName(buf, pos);
    pos = next + 4;
  }
  for (let i = 0; i < an && pos + 10 <= buf.length; i++) {
    const n = readName(buf, pos);
    pos = n.next;
    if (pos + 10 > buf.length) break;
    const type = buf.readUInt16BE(pos);
    const ttl = buf.readUInt32BE(pos + 4);
    const rdlen = buf.readUInt16BE(pos + 8);
    pos += 10;
    if (pos + rdlen > buf.length) break;
    const rdata = pos;
    let target: string | null = null;
    let addr: string | null = null;
    if (type === 12) target = readName(buf, rdata).name;
    else if (type === 33) target = readName(buf, rdata + 6).name;
    else if (type === 1 && rdlen === 4) addr = `${buf[rdata]}.${buf[rdata + 1]}.${buf[rdata + 2]}.${buf[rdata + 3]}`;
    else if (type === 28 && rdlen === 16) {
      const parts: string[] = [];
      for (let k = 0; k < 16; k += 2) parts.push(buf.readUInt16BE(rdata + k).toString(16));
      addr = parts.join(":").replace(/(^|:)0(:0)+:/, "$1::");
    }
    out.push({ name: n.name, type, ttl, target, addr });
    pos += rdlen;
  }
  return out;
}

function shortHost(name: string | null): string | null {
  if (!name) return null;
  const h = name.replace(/\.local\.?$/i, "").split(".")[0];
  return h || null;
}

export async function browseMdns(timeoutMs = 3500): Promise<MdnsDevice[]> {
  const byIp = new Map<string, MdnsDevice>();
  const hostByTarget = new Map<string, string>();
  const sock = createSocket("udp4");
  const queries = [buildMdnsQuery("_services._dns-sd._udp.local", 0x42), buildMdnsQuery("_http._tcp.local", 0x43)];
  try {
    await new Promise<void>((resolve, reject) => {
      sock.once("error", reject);
      sock.bind(0, "0.0.0.0", () => {
        try {
          sock.setMulticastTTL(255);
          sock.addMembership(MDNS_GROUP);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    sock.on("message", (msg) => {
      let recs: DnsRecord[];
      try {
        recs = parseMdnsPacket(msg);
      } catch {
        return;
      }
      for (const r of recs) {
        if ((r.type === 33 || r.type === 12) && r.target) {
          const h = shortHost(r.target);
          if (h) hostByTarget.set(r.target.toLowerCase(), h);
        }
        if ((r.type === 1 || r.type === 28) && r.addr) {
          const cur = byIp.get(r.addr) ?? { ip: r.addr, hostname: null as string | null, services: [] as string[] };
          const h = shortHost(hostByTarget.get(r.name.toLowerCase()) ?? r.name) ?? shortHost(r.name);
          if (h && !cur.hostname) cur.hostname = h;
          byIp.set(r.addr, cur);
        }
        if (r.type === 12 && r.target) {
          for (const d of byIp.values()) {
            if (!d.services.includes(r.name) && r.name.endsWith(".local")) d.services.push(r.name);
          }
        }
      }
    });
    for (const q of queries) sock.send(q, MDNS_PORT, MDNS_GROUP);
    await new Promise((r) => setTimeout(r, timeoutMs));
  } catch {
    return [...byIp.values()];
  } finally {
    try {
      sock.close();
    } catch {
    }
  }
  return [...byIp.values()];
}
