import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./lib/api";
import { useDevices } from "./hooks/useDevices";
import { useWs } from "./hooks/useWs";
import { Dashboard } from "./pages/Dashboard";
import { Devices } from "./pages/Devices";
import { DeviceDetail } from "./pages/DeviceDetail";
import { Network } from "./pages/Network";
import { Map } from "./pages/Map";
import { History } from "./pages/History";
import { Alerts } from "./pages/Alerts";
import { Scan } from "./pages/Scan";
import { Settings } from "./pages/Settings";
import type { Device } from "@lanmap/shared";

const NAV = [
  ["Dashboard", "/", "◧"],
  ["Geräte", "/devices", "▦"],
  ["Netzwerk", "/network", "⧉"],
  ["Karte", "/map", "⬢"],
  ["Verlauf", "/history", "◷"],
  ["Alerts", "/alerts", "⚑"],
  ["Scan", "/scan", "◎"],
  ["Settings", "/settings", "⚙"],
] as const;

function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.me().then((m) => {
      if (m.authenticated) onDone();
      else if (m.setupNeeded) setMode("setup");
    }).catch(() => {});
  }, [onDone]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (mode === "setup") await api.setup(user, pass);
      else await api.login(user, pass);
      onDone();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }
  return (
    <div className="loginwrap">
      <form onSubmit={submit} className="login">
        <div style={{ fontWeight: 750, fontSize: 16, letterSpacing: "-.02em" }}>LANMap</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: -2, marginBottom: 6 }}>
          {mode === "setup" ? "Admin-Account anlegen — läuft lokal auf deinem Pi." : "Anmelden"}
        </div>
        {err && <div className="error" style={{ fontSize: 13, padding: "6px 8px", background: "var(--crit-bg)", borderRadius: 6 }}>{err}</div>}
        <label style={{ maxWidth: "none" }}>Benutzer <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" placeholder="admin" /></label>
        <label style={{ maxWidth: "none" }}>Passwort <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === "setup" ? "new-password" : "current-password"} /></label>
        <button type="submit" className="primary" style={{ marginTop: 4 }}>{mode === "setup" ? "Account erstellen" : "Anmelden"}</button>
        <span className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Nur für dein lokales Netz. Kein Cloud-Zeug.</span>
      </form>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { devices, loading, refresh, applyUpdate } = useDevices();
  const { state } = useWs((m) => {
    if (m.type === "device-updated") applyUpdate(m.payload as Device);
    if (m.type === "presence" || m.type === "latency" || m.type === "alert" || m.type === "scan-progress") refresh();
  });
  const [palette, setPalette] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.me().then((m) => setAuthed(m.authenticated || import.meta.env.DEV)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (authed === null) return <p className="pad">Lade…</p>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const liveColor = state === "live" ? "var(--ok)" : state === "reconnecting" ? "var(--warn)" : "var(--muted)";
  const liveLabel = state === "live" ? "Live" : state === "reconnecting" ? "Verbinde…" : "Offline";

  return (
    <div className="layout">
      <aside className="side">
        <div className="brand">
          <div className="brand-title">LANMap</div>
          <div className="brand-sub">See what's on your network.</div>
        </div>
        <nav>
          {NAV.map(([label, path, ico]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <span className="ico">{ico}</span> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidefoot">
          <span className="live-dot" title="WebSocket">
            <i style={{ background: liveColor, boxShadow: state === "live" ? "0 0 0 4px var(--ok-bg)" : "none" }} /> {liveLabel}
          </span>
          <button className="link" onClick={() => api.logout().then(() => setAuthed(false)).catch(() => setAuthed(false))}>Logout</button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard devices={devices} />} />
          <Route path="/devices" element={<Devices devices={devices} loading={loading} />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/network" element={<Network />} />
          <Route path="/map" element={<Map devices={devices} />} />
          <Route path="/history" element={<History />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <div className="muted" style={{ fontSize: 11, marginTop: 28, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          LANMap · lokal · <span style={{ color: "var(--dim)" }}>⌘K</span> Suche · {devices.length} Geräte bekannt
        </div>
      </main>
      {palette && (
        <div className="palette-back" onClick={() => setPalette(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", padding: "4px 8px 6px" }}>Springe zu…</div>
            {NAV.map(([label, path]) => (
              <button key={path} onClick={() => { nav(path); setPalette(false); }}>{label}</button>
            ))}
            <button onClick={() => { refresh(); setPalette(false); }}>↻ Geräte neu laden</button>
          </div>
        </div>
      )}
    </div>
  );
}
