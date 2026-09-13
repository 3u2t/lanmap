import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { displayName, type Device } from "@lanmap/shared";
import { Link } from "react-router-dom";
import { Empty } from "../components/bits";

const RANGES = ["24h", "7d"] as const;

export function History() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("24h");
  const [data, setData] = useState<{ devices: { id: string; ip: string; hostname: string | null; customName: string | null; latency: number | null; loss: number | null; status: string }[]; disconnects: { deviceId: string; n: number }[]; recent: Device[] } | null>(null);

  useEffect(() => {
    setData(null);
    api.summary(range).then((d) => setData(d as typeof data)).catch(() => {});
  }, [range]);

  return (
    <div>
      <h1>Verlauf <span className="tag">{range}</span></h1>
      <div className="toolbar">
        <div className="pill-group">
          {RANGES.map((r) => <button key={r} className={range === r ? "pill active" : "pill"} onClick={() => setRange(r)}>{r}</button>)}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>Auswertung nur für überwachte Geräte</span>
      </div>

      {!data ? <p className="pad">Lade…</p> : (
        <>
          <div className="grid2">
            <div className="panel">
              <div className="panel-head"><strong>Zuverlässigkeit — am schlechtesten</strong><span className="badge warn">{data.devices.filter((d) => (d.loss ?? 0) > 0).length} mit Loss</span></div>
              <div className="panel-body" style={{ padding: 0 }}>
                {data.devices.length === 0 ? <div style={{ padding: 12 }}><Empty text="Keine überwachten Geräte — in Geräte-Details auf „Überwachen“ klicken." /></div> : (
                  <div className="tablewrap" style={{ border: "none", borderRadius: 0 }}>
                    <table>
                      <thead><tr><th>Gerät</th><th>Latenz</th><th>Loss</th><th>Status</th></tr></thead>
                      <tbody>{[...data.devices].sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0) || (b.latency ?? 0) - (a.latency ?? 0)).slice(0, 8).map((d) => (
                        <tr key={d.id}>
                          <td><Link to={`/devices/${d.id}`} style={{ fontWeight: 600, color: "var(--text)" }}>{d.customName || d.hostname || d.ip}</Link><span className="mono muted" style={{ marginLeft: 6, fontSize: 11 }}>{d.ip}</span></td>
                          <td>{d.latency != null ? <><strong>{Math.round(d.latency)}</strong> ms</> : <span className="dim">—</span>}</td>
                          <td>{d.loss != null && d.loss > 0 ? <span style={{ color: d.loss > 10 ? "var(--crit)" : "var(--warn)", fontWeight: 700 }}>{d.loss}%</span> : <span className="dim">—</span>}</td>
                          <td><span className={`dot ${d.status === "online" ? "online" : d.status === "offline" ? "offline" : "unknown"} small`} /> {d.status}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><strong>Häufigste Disconnects</strong></div>
              <div className="panel-body">
                {data.disconnects.length === 0 ? <Empty text="Keine Disconnects im Zeitraum — stabil." /> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.disconnects.slice(0, 6).map((x) => (
                      <div key={x.deviceId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--panel)" }}>
                        <Link to={`/devices/${x.deviceId}`} className="mono" style={{ fontSize: 12 }}>{x.deviceId.slice(0, 8)}…</Link>
                        <span className="badge warn">{x.n}× offline</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head"><strong>Zuletzt entdeckt</strong></div>
            <div className="panel-body">
              {data.recent.length === 0 ? <Empty text="Noch keine Historie." /> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8 }}>
                  {data.recent.map((d) => (
                    <Link key={d.id} to={`/devices/${d.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", textDecoration: "none", color: "inherit" }}>
                      <span className={`dot ${d.status === "online" ? "online" : "offline"} small`} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName(d)}</span>
                        <span className="mono muted" style={{ fontSize: 11 }}>{d.ip}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
