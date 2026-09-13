import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { BUILTIN_CATEGORIES, displayName, timeAgo, type Device } from "@lanmap/shared";
import { Empty } from "../components/bits";
import { LatencyChart } from "../components/LatencyChart";

const CAT_ICON: Record<string, string> = {
  PC: "🖥", Laptop: "💻", Phone: "📱", Tablet: "📲", Server: "🗄", "Raspberry Pi": "🥧",
  Console: "🎮", TV: "📺", IoT: "💡", Printer: "🖨", Network: "⬡", Other: "◻",
};

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="ghost"
      style={{ padding: "2px 6px", minHeight: 22, fontSize: 11, border: "none" }}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
      title="Kopieren"
    >
      {ok ? "✓" : "⧉"}
    </button>
  );
}

export function DeviceDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Device | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState("24h");
  const [points, setPoints] = useState<{ at: number; latencyMs: number | null; ok: number }[]>([]);
  const [events, setEvents] = useState<{ id: number; kind: string; message: string; createdAt: number }[]>([]);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.device(id).then((r) => {
      setD(r.device);
      setName(r.device.customName ?? "");
      setCat(r.device.category ?? "");
    }).catch((e: Error) => setErr(e.message));
    api.events(id).then((r) => setEvents(r.events)).catch(() => {});
  }, [id]);

  useEffect(() => {
    setPoints([]);
    api.history(id, range).then((r) => setPoints(r.points)).catch(() => {});
  }, [id, range]);

  async function save(patch: Record<string, unknown>) {
    if (!d) return;
    setSaving(true);
    try {
      const r = await api.updateDevice(id, patch);
      setD(r.device);
      setToast("Gespeichert");
      setTimeout(() => setToast(null), 1400);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (err) return <div><h1>Gerät</h1><Empty text={err} /></div>;
  if (!d) return <p className="pad">Lade…</p>;

  const dot = d.status === "online" ? "online" : d.status === "offline" ? "offline" : "unknown";
  const icon = CAT_ICON[cat] ?? CAT_ICON[d.category ?? ""] ?? "◻";

  return (
    <div>
      <button onClick={() => nav(-1)} className="link" style={{ fontSize: 13, marginBottom: 8 }}>← Zurück</button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{icon}</span> {displayName(d)}
            <span className={`dot ${dot}`} style={{ marginLeft: 8, verticalAlign: "middle" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: d.status === "online" ? "var(--ok)" : d.status === "offline" ? "var(--muted)" : "var(--warn)", textTransform: "uppercase", letterSpacing: ".04em" }}>{d.status}</span>
            {d.monitored && <span className="badge ok" style={{ marginLeft: 6 }}>überwacht</span>}
            {d.ignored && <span className="badge" style={{ marginLeft: 6 }}>ignoriert</span>}
          </h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            <span className="mono">{d.ip}</span>
            {d.mac && <span> · <span className="mono">{d.mac}</span></span>}
            <span> · Zuletzt gesehen {timeAgo(d.lastSeen)}</span>
          </div>
        </div>
        <div className="row" style={{ margin: 0 }}>
          <button className={d.monitored ? "" : "primary"} onClick={() => void save({ monitored: !d.monitored })}>
            {d.monitored ? "Überwachung stoppen" : "Überwachen"}
          </button>
          <button className="ghost" onClick={() => void save({ ignored: !d.ignored })}>
            {d.ignored ? "Ent-ignorieren" : "Ignorieren"}
          </button>
        </div>
      </div>

      <div className="kpis" style={{ marginTop: 14, gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="kpi"><span className="label">Latenz</span><span className="value">{d.latencyMs != null ? Math.round(d.latencyMs) : "—"}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{d.latencyMs != null ? " ms" : ""}</span></span><span className="hint">aktuell</span></div>
        <div className="kpi"><span className="label">Paketverlust</span><span className="value">{d.packetLossPct != null ? d.packetLossPct : "—"}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{d.packetLossPct != null ? "%" : ""}</span></span><span className="hint">letzte Messung</span></div>
        <div className="kpi"><span className="label">Erstmals gesehen</span><span className="value" style={{ fontSize: 13, paddingTop: 6 }}>{new Date(d.firstSeen).toLocaleDateString()}</span><span className="hint">{timeAgo(d.firstSeen)}</span></div>
        <div className="kpi"><span className="label">Kategorie</span><span className="value" style={{ fontSize: 13, paddingTop: 6 }}>{d.category ?? "—"}</span><span className="hint">{d.hostname ?? "kein Hostname"}</span></div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-head"><strong>Identität</strong></div>
          <div className="panel-body">
            <dl>
              <dt>Hostname</dt><dd>{d.hostname ?? <span className="dim">— kein Hostname</span>} {d.hostname && <Copy text={d.hostname} />}</dd>
              <dt>IP</dt><dd><span className="mono">{d.ip}</span> <Copy text={d.ip} /></dd>
              <dt>MAC</dt><dd><span className="mono">{d.mac ?? "—"}</span> {d.mac && <Copy text={d.mac} />}</dd>
              <dt>Vendor</dt><dd>{d.vendor ?? <span className="dim">Unbekannt</span>}</dd>
              <dt>Interface</dt><dd>{d.iface ?? <span className="dim">—</span>}</dd>
              <dt>IPv6</dt><dd><span className="mono">{(d as unknown as { ipv6: string | null }).ipv6 ?? "—"}</span></dd>
              <dt>Quelle</dt><dd>{d.source ?? "—"}{d.openPorts && d.openPorts.length > 0 ? <span className="mono"> · Ports {d.openPorts.join(", ")}</span> : ""}</dd>
              <dt>Link</dt><dd>{d.l2 === true ? "direkt (L2)" : d.l2 === false ? `geroutet${typeof d.hops === "number" ? ` · ${d.hops} Hops` : ""}` : "—"}</dd>
            </dl>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 8 }}>Anpassen</div>
              <label style={{ maxWidth: "none" }}>Anzeigename <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={d.hostname ?? d.ip} /></label>
              <label style={{ maxWidth: "none" }}>Kategorie
                <select value={BUILTIN_CATEGORIES.includes(cat as never) ? cat : "Other"} onChange={(e) => setCat(e.target.value)}>
                  {BUILTIN_CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICON[c] ?? "◻"} {c}</option>)}
                </select>
              </label>
              <div className="row">
                <button className="primary" disabled={saving} onClick={() => void save({ customName: name.trim() || null, category: cat || "Other" })}>
                  {saving ? "…" : "Speichern"}
                </button>
                {toast && <span style={{ fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>{toast}</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <strong>Verlauf</strong>
              <div className="pill-group">
                {(["1h", "6h", "24h", "7d"] as const).map((r) => (
                  <button key={r} className={range === r ? "pill active" : "pill"} onClick={() => setRange(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="panel-body" style={{ padding: 6 }}>
              <LatencyChart points={points} />
              <div className="muted" style={{ fontSize: 11, padding: "4px 6px 2px" }}>{points.length} Messpunkte · Lücke = keine Antwort</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><strong>Events</strong><span className="badge">{events.length}</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {events.length === 0 ? <div style={{ padding: 14 }}><Empty text="Noch keine Events für dieses Gerät." /></div> : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {events.map((e) => {
                    const col = e.kind === "appeared" ? "var(--ok)" : e.kind === "disappeared" ? "var(--crit)" : "var(--warn)";
                    return (
                      <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, marginTop: 6, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ color: "var(--text2)" }}>{new Date(e.createdAt).toLocaleString()}</span>
                          <span style={{ margin: "0 6px", color: "var(--dim)" }}>·</span>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: col }}>{e.kind}</span>
                          <span style={{ marginLeft: 6 }}>{e.message}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
