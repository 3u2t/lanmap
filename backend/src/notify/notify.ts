import webpush from "web-push";
import { getDb, getSetting, setSetting } from "../db/db.js";
import { passesSeverity } from "@lanmap/shared";
import type { NotifySeverity } from "@lanmap/shared";

export interface NtfyConfig {
  enabled: boolean;
  server: string;
  topic: string;
  minSeverity: NotifySeverity;
}

export interface WebPushConfig {
  enabled: boolean;
  minSeverity: NotifySeverity;
}

const SEVERITIES: NotifySeverity[] = ["info", "warning", "critical"];

function validSeverity(v: unknown, fb: NotifySeverity): NotifySeverity {
  return typeof v === "string" && (SEVERITIES as string[]).includes(v) ? (v as NotifySeverity) : fb;
}

export function readNtfy(): NtfyConfig {
  try {
    const j = JSON.parse(getSetting("ntfy", "{}")) as Partial<NtfyConfig>;
    return {
      enabled: j.enabled === true,
      server: typeof j.server === "string" && j.server ? j.server.replace(/\/+$/, "") : "https://ntfy.sh",
      topic: typeof j.topic === "string" ? j.topic : "",
      minSeverity: validSeverity(j.minSeverity, "warning"),
    };
  } catch {
    return { enabled: false, server: "https://ntfy.sh", topic: "", minSeverity: "warning" };
  }
}

export function readWebPush(): WebPushConfig {
  try {
    const j = JSON.parse(getSetting("webpush", "{}")) as Partial<WebPushConfig>;
    return {
      enabled: j.enabled === true,
      minSeverity: validSeverity(j.minSeverity, "warning"),
    };
  } catch {
    return { enabled: false, minSeverity: "warning" };
  }
}

export function getVapidKeys(): { publicKey: string; privateKey: string } {
  let pub = getSetting("vapidPublic", "");
  let priv = getSetting("vapidPrivate", "");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey;
    priv = k.privateKey;
    setSetting("vapidPublic", pub);
    setSetting("vapidPrivate", priv);
  }
  return { publicKey: pub, privateKey: priv };
}

export function pushSubscriptionCount(): number {
  try {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number };
    return r.n ?? 0;
  } catch {
    return 0;
  }
}

function ntfyPriority(severity: string): string {
  if (severity === "critical") return "urgent";
  if (severity === "warning") return "high";
  return "default";
}

export async function sendNtfy(
  cfg: NtfyConfig,
  title: string,
  message: string,
  severity: string,
): Promise<void> {
  if (!cfg.enabled || !cfg.topic) throw new Error("ntfy not configured.");
  const url = `${cfg.server}/${encodeURIComponent(cfg.topic)}`;
  const r = await fetch(url, {
    method: "POST",
    body: message,
    headers: {
      Title: title,
      Priority: ntfyPriority(severity),
      Tags: severity === "critical" ? "rotating_light" : severity === "warning" ? "warning" : "information_source",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`ntfy answered ${r.status}.`);
}

export async function sendWebPush(
  title: string,
  body: string,
  severity: string,
  url = "/alerts",
): Promise<{ sent: number; removed: number }> {
  const cfg = readWebPush();
  if (!cfg.enabled) throw new Error("Web Push not enabled.");
  const { publicKey, privateKey } = getVapidKeys();
  webpush.setVapidDetails("mailto:lanmap@localhost", publicKey, privateKey);
  const subs = getDb().prepare("SELECT endpoint, keys FROM push_subscriptions").all() as {
    endpoint: string;
    keys: string;
  }[];
  if (subs.length === 0) throw new Error("No push subscriptions. Subscribe a browser first.");
  const payload = JSON.stringify({ title, body, severity, url });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        const keys = JSON.parse(s.keys) as { p256dh: string; auth: string };
        await webpush.sendNotification({ endpoint: s.endpoint, keys }, payload);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(s.endpoint);
          removed++;
        }
      }
    }),
  );
  return { sent, removed };
}

export async function notifyAlert(a: {
  type: string;
  message: string;
  severity?: string;
}): Promise<void> {
  const severity = a.severity ?? "info";
  const ntfy = readNtfy();
  const wp = readWebPush();
  const jobs: Promise<unknown>[] = [];
  if (ntfy.enabled && passesSeverity(severity, ntfy.minSeverity)) {
    jobs.push(sendNtfy(ntfy, "LANMap", `${a.type}: ${a.message}`, severity).catch(() => null));
  }
  if (wp.enabled && passesSeverity(severity, wp.minSeverity)) {
    jobs.push(sendWebPush("LANMap", `${a.type}: ${a.message}`, severity).catch(() => null));
  }
  if (jobs.length > 0) await Promise.all(jobs);
}
