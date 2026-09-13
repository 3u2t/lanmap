import { useEffect, useState } from "react";
import { api, exportUrl } from "../lib/api";
import type { AppSettings } from "@lanmap/shared";

export function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  useEffect(() => {
    api.settings().then((r) => setS(r.settings)).catch(() => {});
  }, []);
  if (!s) return <div><h1>Settings</h1><p>Loading…</p></div>;
  async function save(patch: unknown) {
    const r = await api.saveSettings(patch);
    setS(r.settings);
  }
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
        <label>Subnet <input value={s.discovery.subnet ?? ""} placeholder="192.168.178.0/24" onChange={(e) => setS({ ...s, discovery: { ...s.discovery, subnet: e.target.value || null } })} className="mono" /></label>
        <label>Gateway IP <input value={s.discovery.gatewayIp ?? ""} placeholder="192.168.178.1" onChange={(e) => setS({ ...s, discovery: { ...s.discovery, gatewayIp: e.target.value || null } })} className="mono" /></label>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Im Docker-Bridge-Modus hier dein Fritz!Box-Gateway eintragen — sonst zeigt er das Docker-Gateway 172.x. Oder <span className="mono">network_mode: host</span> im Compose aktivieren.</p>
        <button onClick={() => void save({ discovery: { subnet: s.discovery.subnet, gatewayIp: s.discovery.gatewayIp } })}>Save discovery</button>
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
