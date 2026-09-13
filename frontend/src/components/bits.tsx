import { Link } from "react-router-dom";
import type { Device } from "@lanmap/shared";
import { displayName, timeAgo } from "@lanmap/shared";
import { filterDevices, sortDevices } from "../lib/filter";
import { useMemo, useState } from "react";

export function StatusDot({ status }: { status: string }) {
  const cls = status === "online" ? "online" : status === "offline" ? "offline" : "unknown";
  return <i className={`dot ${cls}`} title={status} />;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function DeviceTable({ devices }: { devices: Device[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "online" | "offline" | "unknown">("");

  const rows = useMemo(() => sortDevices(filterDevices(devices, q, status), "ip"), [devices, q, status]);

  return (
    <div>
      <div className="toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suchen — Hostname, IP, MAC, Vendor…"
          aria-label="Search devices"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter status">
          <option value="">Alle Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
        <span className="muted" style={{ fontSize: 12 }}>{rows.length} / {devices.length}</span>
      </div>

      {rows.length === 0 ? (
        <Empty text={devices.length === 0 ? "Noch keine Geräte — starte einen Scan auf der Scan-Seite." : "Keine Treffer für den Filter."} />
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 220 }}>Gerät</th>
                <th>IP</th>
                <th>MAC</th>
                <th>Status</th>
                <th>Latenz</th>
                <th>Loss</th>
                <th>Zuletzt gesehen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/devices/${d.id}`} style={{ fontWeight: 600, color: "var(--text)" }}>{displayName(d)}</Link>
                    {d.customName && d.hostname && d.customName !== d.hostname && (
                      <div className="sub mono">{d.hostname}</div>
                    )}
                  </td>
                  <td className="mono">{d.ip}</td>
                  <td className="mono" style={{ color: d.mac ? undefined : "var(--dim)" }}>{d.mac ?? "—"}</td>
                  <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><StatusDot status={d.status} />{d.status}</span></td>
                  <td>{d.latencyMs != null ? <span><strong>{Math.round(d.latencyMs)}</strong> ms</span> : <span className="dim">—</span>}</td>
                  <td>{d.packetLossPct != null && d.packetLossPct > 0 ? `${d.packetLossPct}%` : <span className="dim">—</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{timeAgo(d.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
