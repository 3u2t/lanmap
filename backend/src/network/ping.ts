import { execFile } from "node:child_process";
import { lookup as dnsLookup, reverse as dnsReverse } from "node:dns/promises";

const IP_RE = /^[0-9a-fA-F.:]{3,45}$/;
const isWin = process.platform === "win32";

function runPing(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    execFile("ping", args, { timeout: timeoutMs + 2000, maxBuffer: 1 << 20, windowsHide: true }, (err, stdout) => {
      resolve(typeof stdout === "string" ? stdout : "");
      void err;
    });
  });
}

function parseLatency(out: string): number | null {
  const m = out.match(/(?:time|zeit)[=<]([\d.]+)\s*ms/i);
  if (m) return Math.round(Number(m[1]) * 10) / 10;
  if (/time<1ms/i.test(out) || /zeit<1ms/i.test(out)) return 0.5;
  return null;
}

export async function pingHost(
  ip: string,
  timeoutMs = 1500,
): Promise<{ ok: boolean; latencyMs: number | null }> {
  if (!IP_RE.test(ip) || ip.includes(" ") || ip.includes(";") || ip.includes("|")) {
    return { ok: false, latencyMs: null };
  }
  if (isWin) {
    const out = await runPing(["-n", "1", "-w", String(Math.max(500, timeoutMs)), ip], timeoutMs + 2000);
    const lat = parseLatency(out);
    const ok = /Received = 1|Empfangen = 1|Reply from|Antwort von/i.test(out) || lat !== null;
    if (!ok) return { ok: false, latencyMs: null };
    return { ok: true, latencyMs: lat };
  }
  const secs = Math.max(1, Math.ceil(timeoutMs / 1000));
  const out = await runPing(["-c1", `-W${secs}`, ip], timeoutMs + 2000);
  const m = out.match(/time[=<]([\d.]+)\s*ms/);
  if (m) return { ok: true, latencyMs: Math.round(Number(m[1]) * 10) / 10 };
  if (/1 (packets )?received|1 received/.test(out)) return { ok: true, latencyMs: null };
  return { ok: false, latencyMs: null };
}

export async function pingStats(
  ip: string,
  count = 3,
  timeoutMs = 1500,
): Promise<{ sent: number; received: number; min: number | null; avg: number | null; max: number | null }> {
  if (!IP_RE.test(ip)) return { sent: count, received: 0, min: null, avg: null, max: null };
  if (isWin) {
    const out = await runPing(["-n", String(Math.min(5, Math.max(1, count))), "-w", String(Math.max(500, timeoutMs)), ip], timeoutMs + 4000);
    const m = out.match(/Sent = (\d+).*Received = (\d+)/i) || out.match(/Gesendet = (\d+).*Empfangen = (\d+)/i);
    const sent = m ? Number(m[1]) : count;
    const received = m ? Number(m[2]) : 0;
    const rtt = out.match(/Minimum = ([\d]+)ms.*Maximum = ([\d]+)ms.*Average = ([\d]+)ms/i) || out.match(/Minimum = ([\d]+)ms.*Maximum = ([\d]+)ms.*Mittelwert = ([\d]+)ms/i);
    if (!rtt) return { sent, received, min: null, avg: null, max: null };
    return { sent, received, min: Number(rtt[1]), avg: Number(rtt[3]), max: Number(rtt[2]) };
  }
  const secs = Math.max(1, Math.ceil(timeoutMs / 1000));
  const out = await runPing(["-c" + String(Math.min(5, Math.max(1, count))), `-W${secs}`, ip], timeoutMs + 4000);
  const tx = out.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received/);
  const rtt = out.match(/min\/avg\/max[^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
  const sent = tx ? Number(tx[1]) : count;
  const received = tx ? Number(tx[2]) : 0;
  if (!rtt) return { sent, received, min: null, avg: null, max: null };
  return {
    sent,
    received,
    min: Number(rtt[1]),
    avg: Number(rtt[2]),
    max: Number(rtt[3]),
  };
}

export async function reverseDns(ip: string): Promise<string | null> {
  try {
    const names = await dnsReverse(ip);
    return names?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function dnsTest(
  host: string,
  timeoutMs = 3000,
): Promise<{ ok: boolean; ms: number; addresses: string[] }> {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      dnsLookup(host, { all: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    const addresses = (r as { address: string }[]).map((x) => x.address);
    return { ok: true, ms: Date.now() - t0, addresses };
  } catch {
    return { ok: false, ms: Date.now() - t0, addresses: [] };
  }
}
