import { execFile } from "node:child_process";

export type ProbeResult = "reply" | "exceeded" | "none";

const isWin = process.platform === "win32";

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs + 2000, maxBuffer: 1 << 20, windowsHide: true } as unknown as { timeout: number },
      (_err, stdout) => resolve(typeof stdout === "string" ? stdout : ""),
    );
  });
}

export function parseProbe(out: string): ProbeResult {
  if (!out) return "none";
  if (/(?:time|zeit)[=<][\d.]+\s*ms/i.test(out)) return "reply";
  if (/1 (packets )?received|1 received/i.test(out)) return "reply";
  if (/Reply from|Antwort von/i.test(out)) {
    if (/ttl expired|ttl.*abgelaufen|time to live exceeded/i.test(out)) return "exceeded";
    return "reply";
  }
  if (/time to live exceeded|ttl expired|ttl.*abgelaufen/i.test(out)) return "exceeded";
  if (/From .* (icmp_seq|Time to live)/i.test(out) && /exceeded/i.test(out)) return "exceeded";
  return "none";
}

export async function probeTtl(
  ip: string,
  ttl: number,
  timeoutMs = 1500,
  runFn: (cmd: string, args: string[], timeoutMs: number) => Promise<string> = run,
): Promise<ProbeResult> {
  if (!/^[0-9a-fA-F.:]{3,45}$/.test(ip)) return "none";
  const args = isWin
    ? ["-n", "1", "-w", String(Math.max(500, timeoutMs)), "-i", String(ttl), ip]
    : ["-c1", `-W${Math.max(1, Math.ceil(timeoutMs / 1000))}`, "-t", String(ttl), ip];
  const out = await runFn("ping", args, timeoutMs + 2000).catch(() => "");
  return parseProbe(out);
}

export async function estimateHops(
  ip: string,
  timeoutMs = 1500,
  probe: (ip: string, ttl: number, timeoutMs: number) => Promise<ProbeResult> = probeTtl,
  maxTtl = 6,
): Promise<number | null> {
  for (let ttl = 1; ttl <= maxTtl; ttl++) {
    const r = await probe(ip, ttl, timeoutMs).catch(() => "none" as ProbeResult);
    if (r === "reply") return ttl;
    if (r === "none") return null;
  }
  return null;
}
