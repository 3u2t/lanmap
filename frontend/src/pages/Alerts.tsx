import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Alert } from "@lanmap/shared";
import { Empty } from "../components/bits";
import { Link } from "react-router-dom";
import { timeAgo } from "@lanmap/shared";

type Filter = "all" | "open" | "ack";

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [severity, setSeverity] = useState<string>("all");

  useEffect(() => {
    api.alerts().then((r) => setAlerts(r.alerts)).catch(() => {});
  }, []);

  async function ack(id: number) {
    await api.ackAlert(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }
  async function ackAll() {
    const open = alerts.filter((a) => !a.acknowledged);
    for (const a of open) {
      try { await api.ackAlert(a.id); } catch {  }
    }
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  }

  const shown = useMemo(() => {
    return alerts.filter((a) => {
      if (filter === "open" && a.acknowledged) return false;
      if (filter === "ack" && !a.acknowledged) return false;
      if (severity !== "all" && a.severity !== severity) return false;
      return true;
    });
  }, [alerts, filter, severity]);

  const open = alerts.filter((a) => !a.acknowledged).length;

  const groups = useMemo(() => {
    const m = new Map<string, Alert[]>();
    for (const a of shown) {
      const day = new Date(a.createdAt).toLocaleDateString();
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(a);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div>
      <h1>Alerts <span className="tag">{open} offen</span> <span className="muted" style={{ fontSize: 12 }}>{alerts.length} gesamt</span></h1>

      <div className="toolbar">
        <div className="pill-group">
          {(["all", "open", "ack"] as const).map((f) => (
            <button key={f} className={filter === f ? "pill active" : "pill"} onClick={() => setFilter(f)}>
              {f === "all" ? "Alle" : f === "open" ? "Offen" : "Erledigt"}
            </button>
          ))}
        </div>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="all">Alle Schweregrade</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        {open > 0 && <button className="ghost" onClick={() => void ackAll()}>Alle quittieren</button>}
      </div>

      {alerts.length === 0 ? <Empty text="Keine Alerts — alles ruhig." /> : shown.length === 0 ? <Empty text="Kein Alert passt zum Filter." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map(([day, list]) => (
            <div key={day}>
              <div className="muted" style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", margin: "6px 2px" }}>{day} · {list.length}</div>
              <ul className="alerts">
                {list.map((a) => (
                  <li key={a.id} className={`alert-${a.severity}`} style={{ opacity: a.acknowledged ? 0.62 : 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: a.severity === "critical" ? "var(--crit)" : a.severity === "warning" ? "var(--warn)" : "var(--muted)" }}>{a.severity}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{a.type}</span>
                    <span style={{ flex: 1 }}>{a.message} {a.deviceId && <Link to={`/devices/${a.deviceId}`} className="mono" style={{ fontSize: 11, marginLeft: 6 }}>→ Gerät</Link>}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{timeAgo(a.createdAt)}</span>
                    {!a.acknowledged ? <button style={{ padding: "4px 8px", minHeight: 28, fontSize: 12 }} onClick={() => void ack(a.id)}>Quittieren</button> : <span className="badge" style={{ fontSize: 10 }}>erledigt</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
