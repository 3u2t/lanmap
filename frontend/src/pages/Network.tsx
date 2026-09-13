import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Empty } from "../components/bits";

export function Network() {
  const [net, setNet] = useState<Awaited<ReturnType<typeof api.network>> | null>(null);
  const [host, setHost] = useState("example.com");
  const [dns, setDns] = useState<{ ok: boolean; ms: number; addresses: string[] } | null>(null);
  const [topo, setTopo] = useState<Awaited<ReturnType<typeof api.topology>> | null>(null);
  const [topoBusy, setTopoBusy] = useState(false);
  useEffect(() => {
    api.network().then(setNet).catch(() => {});
    api.topology().then(setTopo).catch(() => {});
  }, []);
  async function refreshTopo() {
    setTopoBusy(true);
    try {
      await api.topologyRefresh();
      const t = await api.topology();
      setTopo(t);
    } catch {
    } finally {
      setTopoBusy(false);
    }
  }
  const direct = topo?.nodes.filter((n) => n.l2 === true).length ?? 0;
  const routed = topo?.nodes.filter((n) => n.l2 === false).length ?? 0;
  const isDockerGw = net?.effectiveGateway?.startsWith("172.");
  return (
    <div>
      <h1>Network</h1>
      {!net ? <p>Loading…</p> : (
        <>
          <h2>Interfaces {net.interfaces.length === 1 && net.interfaces[0]?.name === "eth0" && net.interfaces[0]?.ipv4?.startsWith("172.") ? <span className="badge warn">Docker-Bridge erkannt</span> : null}</h2>
          {net.interfaces.length === 0 ? <Empty text="No interfaces found." /> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Name</th><th>IPv4</th><th>IPv6</th><th>MAC</th><th>Subnet</th><th>Status</th><th>Speed</th></tr></thead>
              <tbody>{net.interfaces.map((i) => (
                <tr key={i.name}>
                  <td className="mono">{i.name}{i.virtual ? " (virtual)" : ""}</td>
                  <td className="mono">{i.ipv4 ?? "—"}</td>
                  <td className="mono">{i.ipv6 ?? "—"}</td>
                  <td className="mono">{i.mac ?? "—"}</td>
                  <td className="mono">{i.cidr ?? "—"}</td>
                  <td>{i.status}</td>
                  <td>{i.linkSpeedMbps != null ? `${i.linkSpeedMbps} Mb/s` : "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {isDockerGw && (
            <div className="empty" style={{ borderStyle: "solid", borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
              Container läuft im Bridge-Modus — echtes Gateway ist <strong>192.168.178.1</strong> (Fritz!Box), nicht {net.effectiveGateway}.
              Unter <strong>Settings → Discovery → Gateway IP</strong> auf <span className="mono">192.168.178.1</span> setzen oder im Compose <span className="mono">network_mode: host</span> aktivieren. Siehe <span className="mono">docker-compose.yml</span> Kommentar.
            </div>
          )}
          <h2>Gateway</h2>
          {net.effectiveGateway ? (
            <p className="mono">{net.effectiveGateway} — {net.gateway?.ip === net.effectiveGateway ? (net.gateway.reachable ? "Reachable" : "Unreachable") : "konfiguriert"} {net.gateway?.latencyMs != null ? `· ${net.gateway.latencyMs} ms` : ""}</p>
          ) : net.gateway?.ip ? <p className="mono">{net.gateway.ip} — {net.gateway.reachable ? "Reachable" : "Unreachable"}</p> : <Empty text="Gateway unavailable." />}
          <p className="muted" style={{ fontSize: 12 }}>Effektiv: {net.effectiveGateway ?? "nicht erkannt"} {net.gateway?.ip && net.gateway.ip !== net.effectiveGateway ? `· gemessen: ${net.gateway.ip}` : ""} · Subnetze: {net.subnets.join(", ") || "—"}</p>
          <h2>Topologie
            <button className="ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={() => void refreshTopo()} disabled={topoBusy}>
              {topoBusy ? "Messe…" : "Neu vermessen"}
            </button>
          </h2>
          {!topo || topo.nodes.length === 0 ? <Empty text="Noch keine Topologie-Daten — Scan starten oder neu vermessen." /> : (
            <>
              <p className="muted" style={{ fontSize: 12 }}>
                {direct} direkt (L2) · {routed} geroutet · {topo.nodes.length - direct - routed} unbekannt
                {topo.generatedAt ? ` · Stand: ${new Date(topo.generatedAt).toLocaleString()}` : ""}
              </p>
              <div className="tablewrap"><table>
                <thead><tr><th>IP</th><th>Hops</th><th>Link</th><th>Interface</th><th>Subnetz</th></tr></thead>
                <tbody>{topo.nodes.map((n) => (
                  <tr key={n.id}>
                    <td className="mono">{n.ip}</td>
                    <td>{n.hops ?? "—"}</td>
                    <td>{n.l2 === true ? "direkt (L2)" : n.l2 === false ? "geroutet" : "—"}</td>
                    <td className="mono">{n.iface ?? "—"}</td>
                    <td className="mono">{n.subnet ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </>
          )}
          <h2>DNS test</h2>
          <div className="row">
            <input value={host} onChange={(e) => setHost(e.target.value)} aria-label="Hostname" />
            <button onClick={() => api.dnsTest(host).then(setDns).catch(() => setDns(null))}>Test</button>
          </div>
          {dns && <p>{dns.ok ? `OK in ${dns.ms} ms: ${dns.addresses.join(", ")}` : `Failed after ${dns.ms} ms`}</p>}
        </>
      )}
    </div>
  );
}
