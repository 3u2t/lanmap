import { Socket } from "node:net";

export const COMMON_PORTS = [22, 80, 443, 445, 139, 8080, 554, 631, 9100, 1883, 8123, 32400, 8009, 2375];

export function probePort(ip: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket();
    let done = false;
    const finish = (open: boolean) => {
      if (done) return;
      done = true;
      try {
        s.destroy();
      } catch {
      }
      resolve(open);
    };
    s.setTimeout(timeoutMs, () => finish(false));
    s.once("error", () => finish(false));
    s.connect(port, ip, () => finish(true));
  });
}

export async function scanPorts(
  ip: string,
  ports: number[] = COMMON_PORTS,
  timeoutMs = 800,
  concurrency = 12,
): Promise<number[]> {
  const open: number[] = [];
  let idx = 0;
  async function worker() {
    while (idx < ports.length) {
      const p = ports[idx++];
      if (await probePort(ip, p, timeoutMs).catch(() => false)) open.push(p);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ports.length) }, worker));
  return open.sort((a, b) => a - b);
}
