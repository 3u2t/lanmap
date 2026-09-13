import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Empty } from "../components/bits";

export function Network() {
  const [net, setNet] = useState<Awaited<ReturnType<typeof api.network>> | null>(null);
  const [host, setHost] = useState("example.com");
  const [dns, setDns] = useState<{ ok: boolean; ms: number; addresses: string[] } | null>(null);
  useEffect(() => {
    api.network().then(setNet).catch(() => {});
  }, []);
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
