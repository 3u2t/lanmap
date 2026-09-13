import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ScanProgress } from "@lanmap/shared";

export function Scan() {
  const [targets, setTargets] = useState<string[]>(["192.168.178.0/24"]);
  const [scan, setScan] = useState<ScanProgress>({ state: "idle", at: 0 } as unknown as ScanProgress);
  const [err, setErr] = useState<string | null>(null);
  const [subnets, setSubnets] = useState<string[]>([]);

  useEffect(() => {
    api.network().then((n) => {
      if (n.subnets?.length) {
        setSubnets(n.subnets);
        setTargets(n.subnets);
      } else if ((n as unknown as { effectiveGateway: string }).effectiveGateway) {
        const gw = (n as unknown as { effectiveGateway: string }).effectiveGateway;
        const base = gw.split(".").slice(0, 3).join(".") + ".0/24";
        setTargets([base]);
      }
    }).catch(() => {});
    api.scanState().then((r) => setScan(r.scan)).catch(() => {});
  }, []);

  useEffect(() => {
    if (scan.state !== "running") return;
    const t = setInterval(() => {
      api.scanState().then((r) => setScan(r.scan)).catch(() => {});
    }, 1200);
    return () => clearInterval(t);
  }, [scan.state]);

  async function start() {
    setErr(null);
    const clean = targets.map((t) => t.trim()).filter(Boolean);
    if (clean.length === 0) {
      setErr("Mindestens ein Subnetz angeben.");
      return;
    }
    try {
      const r = await api.scanStart(clean);
      setScan({ state: "running", target: r.target } as ScanProgress);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function setTargetAt(i: number, v: string) {
    setTargets((ts) => ts.map((t, j) => (j === i ? v : t)));
  }

  const pct = scan.total ? Math.round(((scan.done ?? 0) / scan.total) * 100) : 0;
  const elapsed = scan.startedAt ? Math.max(0, Math.floor((Date.now() - scan.startedAt) / 1000)) : 0;

  return (
    <div>
      <h1>Scan <span className="tag">nur private Netze</span></h1>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-body">
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>
            Durchsucht deine lokalen Netze (Ping-Sweep max 1024 Hosts pro Subnetz, ~32 parallel). ARP-Tabelle, Reverse-DNS, SSDP, mDNS und TCP-Fallback ergänzen automatisch — je nach aktivierten Methoden unter Settings → Discovery. Nur private Ranges erlaubt, mehrere Subnetze werden nacheinander gescannt.
          </div>
          {targets.map((t, i) => (
            <div className="row" style={{ gap: 8, marginBottom: 6 }} key={i}>
              <input
                value={t}
                onChange={(e) => setTargetAt(i, e.target.value)}
                aria-label={`Subnet ${i + 1}`}
                className="mono"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="192.168.178.0/24"
              />
              {targets.length > 1 && (
                <button onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))} aria-label="Entfernen">−</button>
              )}
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <button onClick={() => setTargets((ts) => [...ts, ""])}>+ Subnetz</button>
            <span style={{ flex: 1 }} />
            <button className="primary" onClick={() => void start()} disabled={scan.state === "running"}>Start</button>
            <button onClick={() => api.scanStop().then((r) => setScan(r.scan)).catch(() => {})} disabled={scan.state !== "running"}>Stop</button>
          </div>
          {subnets.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>Vorschläge:</span>
              {subnets.map((s) => (
                <button key={s} className="pill" onClick={() => setTargets((ts) => (ts.includes(s) ? ts : [...ts, s]))} style={{ fontSize: 11 }}>{s}</button>
              ))}
            </div>
          )}
          {err && <div className="error" style={{ marginTop: 8, fontSize: 13, background: "var(--crit-bg)", border: "1px solid rgba(232,78,78,.18)", padding: "8px 10px", borderRadius: 6 }}>{err}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><strong>Status</strong><span className={`badge ${scan.state === "running" ? "warn" : scan.state === "done" ? "ok" : ""}`}>{scan.state}</span></div>
        <div className="panel-body">
          {scan.state === "idle" && <p className="muted" style={{ margin: 0 }}>Bereit — wähle Subnetze und starte.</p>}
          {scan.state === "running" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span>Scanne <span className="mono">{scan.target}</span> … {pct}%</span>
                <span className="muted">{scan.done}/{scan.total} · {elapsed}s · {scan.found ?? 0} gefunden</span>
              </div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            </>
          )}
          {(scan.state === "done" || scan.state === "stopped") && (
            <div className="empty" style={{ margin: 0, borderStyle: "solid", background: "var(--ok-bg)", borderColor: "rgba(47,191,113,.18)" }}>
              <strong>{scan.found ?? 0} Geräte</strong> auf <span className="mono">{scan.target}</span> gefunden · {scan.done}/{scan.total} Hosts geprüft · {elapsed}s
              <span style={{ marginLeft: 8 }}><a href="/devices">→ Geräte ansehen</a></span>
            </div>
          )}
          {scan.state === "error" && <p className="error">{scan.error}</p>}
          {scan.state !== "idle" && scan.state !== "running" && (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Letzter Scan: {scan.target ?? "—"} · {(scan.done ?? 0) + "/" + (scan.total ?? "—")}</div>
          )}
        </div>
      </div>

      <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        Tipp: Im Docker-Bridge-Modus zeigt die Auto-Erkennung nur `172.x`. Trage oben `192.168.178.0/24` ein oder setze `LAN_SUBNET` in der `.env`. Nach dem Scan wird die Topologie (Hops, direkt/geroutet) automatisch aktualisiert.
      </div>
    </div>
  );
}
