import { useEffect, useState } from "react";
import { api, exportUrl } from "../lib/api";
import type { AppSettings } from "@lanmap/shared";

export function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [notify, setNotify] = useState<Awaited<ReturnType<typeof api.notifyStatus>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "blocked">("unknown");
  useEffect(() => {
    api.settings().then((r) => setS(r.settings)).catch(() => {});
    api.notifyStatus().then(setNotify).catch(() => {});
    if ("Notification" in window) {
      setPushState(Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "blocked" : "off");
    }
  }, []);
  if (!s) return <div><h1>Settings</h1><p>Loading…</p></div>;
  async function save(patch: unknown) {
    const r = await api.saveSettings(patch);
    setS(r.settings);
    const n = await api.notifyStatus().catch(() => null);
    if (n) setNotify(n);
  }
  async function testNotify(channel: "ntfy" | "webpush") {
    setMsg(null);
    try {
      await api.notifyTest(channel);
      setMsg(`${channel}: Test gesendet.`);
    } catch (e) {
      setMsg(`${channel}: ${(e as Error).message}`);
    }
  }
  async function subscribePush() {
    setMsg(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMsg("Dieser Browser unterstützt kein Web Push.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushState("blocked");
        setMsg("Benachrichtigungen wurden blockiert.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.vapidKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Leeres Subscription-Objekt.");
      await api.pushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
      setPushState("on");
      const n = await api.notifyStatus().catch(() => null);
      if (n) setNotify(n);
      setMsg("Browser registriert — Test schicken nicht vergessen.");
    } catch (e) {
      setMsg(`Push: ${(e as Error).message}`);
    }
  }
  const m = s.discovery.methods;
  const methodDefs: [keyof typeof m, string, string][] = [
    ["arp", "ARP-Tabelle", "Nachbarn aus /proc/net/arp bzw. arp -a"],
    ["ping", "Ping-Sweep", "ICMP über alle Hosts des Subnetzes"],
    ["mdns", "mDNS", "Bonjour-Namen im lokalen Netz"],
    ["ssdp", "SSDP / UPnP", "Smart-TVs, Drucker, Konsolen per Multicast"],
    ["tcp", "TCP-Connect", "Offene Ports als Fallback bei geblocktem Ping"],
  ];
  return (
    <div>
      <h1>Settings</h1>
      <section>
        <h2>Monitoring</h2>
        <label>Interval (ms) <input type="number" value={s.monitoring.intervalMs} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, intervalMs: Number(e.target.value) } })} /></label>
        <label>Ping timeout (ms) <input type="number" value={s.monitoring.pingTimeoutMs} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, pingTimeoutMs: Number(e.target.value) } })} /></label>
        <label>Failures before offline <input type="number" value={s.monitoring.offlineAfterFailures} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, offlineAfterFailures: Number(e.target.value) } })} /></label>
        <label>Latency threshold (ms) <input type="number" value={s.monitoring.latencyThresholdMs} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, latencyThresholdMs: Number(e.target.value) } })} /></label>
        <label>Packet loss threshold (%) <input type="number" value={s.monitoring.packetLossThresholdPct} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, packetLossThresholdPct: Number(e.target.value) } })} /></label>
        <button onClick={() => void save({ monitoring: s.monitoring })}>Save monitoring</button>
      </section>
      <section>
        <h2>Discovery</h2>
        <label>Subnet (legacy, einzeln) <input value={s.discovery.subnet ?? ""} placeholder="192.168.178.0/24" onChange={(e) => setS({ ...s, discovery: { ...s.discovery, subnet: e.target.value || null } })} className="mono" /></label>
        <label>Subnets (multi, eins pro Zeile)
          <textarea
            value={s.discovery.subnets.join("\n")}
            placeholder={"192.168.178.0/24\n192.168.2.0/24"}
            onChange={(e) => setS({ ...s, discovery: { ...s.discovery, subnets: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } })}
            className="mono"
            rows={3}
          />
        </label>
        <label>Gateway IP <input value={s.discovery.gatewayIp ?? ""} placeholder="192.168.178.1" onChange={(e) => setS({ ...s, discovery: { ...s.discovery, gatewayIp: e.target.value || null } })} className="mono" /></label>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Im Docker-Bridge-Modus hier dein Fritz!Box-Gateway eintragen — sonst zeigt er das Docker-Gateway 172.x. Oder <span className="mono">network_mode: host</span> im Compose aktivieren.</p>
        <div style={{ display: "grid", gap: 6, margin: "8px 0" }}>
          {methodDefs.map(([key, label, desc]) => (
            <label key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", maxWidth: 520 }}>
              <input
                type="checkbox"
                checked={m[key]}
                onChange={(e) => setS({ ...s, discovery: { ...s.discovery, methods: { ...m, [key]: e.target.checked } } })}
                style={{ marginTop: 3 }}
              />
              <span><strong>{label}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{desc}</span></span>
            </label>
          ))}
        </div>
        <button onClick={() => void save({ discovery: { subnet: s.discovery.subnet, subnets: s.discovery.subnets, gatewayIp: s.discovery.gatewayIp, methods: s.discovery.methods } })}>Save discovery</button>
      </section>
      <section>
        <h2>Notifications</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Push bei neuen Alerts — pro Kanal mit Mindest-Schweregrad. Dedupte Alerts (15-Min-Fenster) lösen kein erneutes Push aus.</p>
        <h3 style={{ fontSize: 13, margin: "10px 0 4px" }}>ntfy</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={s.notifications.ntfy.enabled} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, ntfy: { ...s.notifications.ntfy, enabled: e.target.checked } } })} /> Aktiviert
        </label>
        <label>Server <input value={s.notifications.ntfy.server} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, ntfy: { ...s.notifications.ntfy, server: e.target.value } } })} className="mono" placeholder="https://ntfy.sh" /></label>
        <label>Topic <input value={s.notifications.ntfy.topic} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, ntfy: { ...s.notifications.ntfy, topic: e.target.value } } })} className="mono" placeholder="lanmap-xyz" /></label>
        <label>Ab Schweregrad
          <select value={s.notifications.ntfy.minSeverity} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, ntfy: { ...s.notifications.ntfy, minSeverity: e.target.value as AppSettings["notifications"]["ntfy"]["minSeverity"] } } })}>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <div className="row">
          <button onClick={() => void save({ notifications: { ntfy: s.notifications.ntfy } })}>Save ntfy</button>
          <button onClick={() => void testNotify("ntfy")}>Test senden</button>
        </div>
        <h3 style={{ fontSize: 13, margin: "14px 0 4px" }}>Web Push (Browser)</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={s.notifications.webpush.enabled} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, webpush: { ...s.notifications.webpush, enabled: e.target.checked } } })} /> Aktiviert
        </label>
        <label>Ab Schweregrad
          <select value={s.notifications.webpush.minSeverity} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, webpush: { ...s.notifications.webpush, minSeverity: e.target.value as AppSettings["notifications"]["webpush"]["minSeverity"] } } })}>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <div className="row">
          <button onClick={() => void save({ notifications: { webpush: s.notifications.webpush } })}>Save Web Push</button>
          <button onClick={() => void subscribePush()} disabled={pushState === "blocked"}>
            {pushState === "on" ? "Browser erneut registrieren" : "Diesen Browser registrieren"}
          </button>
          <button onClick={() => void testNotify("webpush")}>Test senden</button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Status: {pushState === "on" ? "Berechtigung erteilt" : pushState === "blocked" ? "Im Browser blockiert" : pushState === "off" ? "Noch nicht registriert" : "…"}
          {notify ? ` · ${notify.webpush.subscriptions} Browser registriert` : ""}
        </p>
        {msg && <p style={{ fontSize: 13 }}>{msg}</p>}
      </section>
      <section>
        <h2>Appearance</h2>
        <select value={s.appearance.theme} onChange={(e) => {
          const theme = e.target.value as AppSettings["appearance"]["theme"];
          try { localStorage.setItem("lanmap-theme", theme === "system" ? "dark" : theme); } catch {  }
          document.documentElement.dataset.theme = theme === "system" ? "dark" : theme;
          setS({ ...s, appearance: { theme } });
          void save({ appearance: { theme } });
        }}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </section>
      <section>
        <h2>Data</h2>
        <label>Retention (days) <input type="number" value={s.retentionDays} onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })} /></label>
        <button onClick={() => void save({ retentionDays: s.retentionDays })}>Save</button>
        <div className="row">
          <a href={exportUrl("csv")} className="btn">Export CSV</a>
          <a href={exportUrl("json")} className="btn">Export JSON</a>
        </div>
      </section>
    </div>
  );
}
