import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Device } from "@lanmap/shared";
import { displayName, timeAgo } from "@lanmap/shared";

export function Dashboard({ devices }: { devices: Device[] }) {
  const [net, setNet] = useState<Awaited<ReturnType<typeof api.network>> | null>(null);

  useEffect(() => {
    let alive = true;
    api.network().then((n) => { if (alive) setNet(n); }).catch(() => {});
    const t = setInterval(() => api.network().then((n) => { if (alive) setNet(n); }).catch(() => {}), 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const online = devices.filter((d) => d.status === "online").length;
  const offline = devices.filter((d) => d.status === "offline").length;
  const unknown = devices.filter((d) => d.status === "unknown").length;
  const monitored = devices.filter((d) => d.monitored).length;
  const lats = devices.filter((d) => d.latencyMs != null).map((d) => d.latencyMs as number);
  const avg = lats.length ? Math.round((lats.reduce((a, b) => a + b, 0) / lats.length) * 10) / 10 : null;
  const lossy = devices.filter((d) => (d.packetLossPct ?? 0) > 5).length;
  const health = net?.health?.state ?? "healthy";

  return (
    <div>
      <h1>
        Dashboard
        <span className={`health ${health}`}>{health}</span>
        <span className="tag">{devices.length} Geräte</span>
      </h1>

      <div className="kpis">
        <div className="kpi ok">
          <span className="label">Online</span>
          <span className="value">{online}</span>
          <span className="hint">{offline} offline · {unknown} unknown</span>
        </div>
        <div className="kpi">
          <span className="label">Überwacht</span>
          <span className="value">{monitored}</span>
          <span className="hint">{devices.length - monitored} nicht überwacht</span>
        </div>
        <div className="kpi">
          <span className="label">Ø Latenz</span>
          <span className="value">{avg != null ? `${avg}` : "—"}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>{avg != null ? " ms" : ""}</span></span>
          <span className="hint">{lats.length} mit Messung</span>
        </div>
        <div className="kpi warn">
          <span className="label">Paketverlust &gt;5%</span>
          <span className="value">{lossy}</span>
          <span className="hint">{lossy === 0 ? "alles stabil" : "prüfen"}</span>
        </div>
        <div className="kpi">
          <span className="label">Gateway</span>
          <span className="value" style={{ fontSize: 14, fontFamily: "ui-monospace, monospace", paddingTop: 6 }}>{net?.effectiveGateway ?? net?.gateway?.ip ?? "—"}</span>
          <span className="hint">{net?.effectiveGateway?.startsWith("172.") ? "Docker-Bridge · in Settings korrigieren" : net?.gateway?.reachable ? `✓ ${net.gateway.latencyMs ?? "—"} ms` : net?.effectiveGateway ? "konfiguriert" : "nicht erreichbar"}</span>
        </div>
        <div className="kpi">
          <span className="label">Internet</span>
          <span className="value" style={{ fontSize: 15, paddingTop: 4 }}>{net?.internet?.reachable ? "online" : net ? "offline" : "…"}</span>
          <span className="hint">{net?.internet?.dnsOk ? "DNS ok" : net?.internet ? "DNS Fehler" : "prüfe…"}</span>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-head"><strong>Letzte Geräte</strong><Link to="/devices" className="muted" style={{ fontSize: 12 }}>Alle →</Link></div>
          <div className="panel-body" style={{ padding: 0 }}>
            {devices.length === 0 ? (
              <div style={{ padding: 14, color: "var(--muted)" }}>Noch keine Geräte — Scan starten.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[...devices].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 6).map((d) => (
                  <Link key={d.id} to={`/devices/${d.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit" }}>
                    <span className={`dot ${d.status === "online" ? "online" : d.status === "offline" ? "offline" : "unknown"} small`} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{displayName(d)}</span>
                      <span className="mono" style={{ color: "var(--muted)", fontSize: 11, marginLeft: 7 }}>{d.ip}</span>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{timeAgo(d.lastSeen)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><strong>Netzwerk</strong><span className="badge" style={{ fontSize: 11 }}>{net?.health?.state ?? "…"}</span></div>
          <div className="panel-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span className="muted">Gateway</span>
                <span className="mono">{net?.effectiveGateway ?? net?.gateway?.ip ?? "—"} {net?.gateway?.reachable ? <span style={{ color: "var(--ok)" }}>●</span> : <span style={{ color: "var(--crit)" }}>○</span>}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span className="muted">Internet / DNS</span>
                <span>{net?.internet?.reachable ? "erreichbar" : "offline"} · {net?.internet?.dnsOk ? "DNS ok" : "DNS?"}</span>
              </div>
              {net?.effectiveGateway?.startsWith("172.") && (
                <div style={{ fontSize: 12, color: "var(--warn)", background: "var(--warn-bg)", border: "1px solid rgba(232,168,56,.2)", borderRadius: 6, padding: "6px 8px" }}>
                  Bridge-Modus: Gateway zeigt Docker-IP. Unter Settings → Gateway auf <span className="mono">192.168.178.1</span> setzen.
                </div>
              )}
              <div style={{ fontSize: 13, color: "var(--text2)", borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
                {(net?.health?.reasons ?? ["Lade…"]).map((r, i) => <div key={i} style={{ padding: "2px 0" }}>{r}</div>)}
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                <Link to="/scan" className="btn primary" style={{ fontSize: 12, padding: "6px 10px", minHeight: 30 }}>Scan starten</Link>
                <Link to="/map" className="btn" style={{ fontSize: 12, padding: "6px 10px", minHeight: 30 }}>Karte öffnen</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
