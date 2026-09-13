import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Device } from "@lanmap/shared";
import { displayName } from "@lanmap/shared";
import { Empty } from "../components/bits";
import { api } from "../lib/api";

type GroupBy = "subnet" | "interface" | "category";
type StatusFilter = "all" | "online" | "offline" | "unknown";

const CAT_ICON: Record<string, string> = {
  PC: "🖥", Laptop: "💻", Phone: "📱", Tablet: "📲", Server: "🗄", "Raspberry Pi": "🥧",
  Console: "🎮", TV: "📺", IoT: "💡", Printer: "🖨", Network: "⬡", Other: "◻",
};

function iconFor(d: Device) {
  const c = (d.category ?? "").trim();
  if (c && CAT_ICON[c]) return CAT_ICON[c];
  const h = (d.hostname ?? "").toLowerCase();
  if (h.includes("iphone") || h.includes("phone") || h.includes("android")) return "📱";
  if (h.includes("tv") || h.includes("ps5") || h.includes("playstation")) return "📺";
  if (h.includes("pi") || h.includes("rasp")) return "🥧";
  if (h.includes("printer")) return "🖨";
  if (h.includes("fritz")) return "⬡";
  return "◻";
}

function hopLabel(d: Device): string | null {
  if (d.hops === 1 || d.l2 === true) return "L2";
  if (typeof d.hops === "number" && d.hops > 1) return `${d.hops} Hops`;
  return null;
}

function linkStyle(d: Device): { dash: string; opacity: number } {
  if (d.l2 === true || d.hops === 1) return { dash: "", opacity: 0.9 };
  if (typeof d.hops === "number" && d.hops > 1) return { dash: "4 3", opacity: 0.75 };
  return { dash: "1 4", opacity: 0.4 };
}

export function Map({ devices }: { devices: Device[] }) {
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("subnet");
  const [selected, setSelected] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [subnetByIp, setSubnetByIp] = useState<Record<string, string>>({});

  useEffect(() => {
    api.topology().then((t) => {
      const m: Record<string, string> = {};
      for (const n of t.nodes) if (n.subnet) m[n.ip] = n.subnet;
      setSubnetByIp(m);
    }).catch(() => {});
  }, []);

  const needle = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (!needle) return true;
      return [d.hostname, d.customName, d.ip, d.vendor, d.category].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [devices, needle, status]);

  const groups = useMemo(() => {
    const m = new globalThis.Map<string, Device[]>();
    for (const d of filtered) {
      let key: string;
      if (groupBy === "category") key = (d.category ?? "Other") || "Other";
      else if (groupBy === "interface") key = d.iface || "unknown interface";
      else if (subnetByIp[d.ip]) key = subnetByIp[d.ip];
      else key = d.ip.includes(":") ? "IPv6" : d.ip.split(".").slice(0, 3).join(".") + ".0/24";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    for (const [, list] of m) list.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
    return m;
  }, [filtered, groupBy, subnetByIp]);

  const online = filtered.filter((d) => d.status === "online").length;
  const isSingleSubnet = groups.size === 1;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a,button,input")) return;
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      el.style.cursor = "grabbing";
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPan((p) => ({ x: p.x + e.clientX - last.current.x, y: p.y + e.clientY - last.current.y }));
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging.current = false;
      if (el) el.style.cursor = "grab";
    };
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const radial = useMemo(() => {
    if (!isSingleSubnet) return null;
    const list = [...groups.values()][0] ?? [];
    const n = list.length;
    if (n === 0) return null;
    const R = Math.min(260, Math.max(160, n * 11));
    const cx = 400, cy = 300, gwY = 90;
    return list.map((d, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * R;
      const y = cy + Math.sin(angle) * R;
      return { d, x, y, gwY, cx };
    });
  }, [groups, isSingleSubnet]);

  return (
    <div>
      <h1>
        Map <span className="tag">logisch — physische Topologie unbekannt</span>
        <span className="muted" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500 }}>
          {filtered.length} Geräte · {online} online
        </span>
      </h1>

      <div className="map-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suchen… Hostname, IP, Vendor, Kategorie"
          aria-label="Search map"
        />
        <div className="pill-group" role="group" aria-label="Status filter">
          {(["all", "online", "offline", "unknown"] as const).map((s) => (
            <button key={s} className={status === s ? "pill active" : "pill"} onClick={() => setStatus(s)}>
              {s === "all" ? "Alle" : s}
            </button>
          ))}
        </div>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Gruppierung">
          <option value="subnet">Nach Subnetz</option>
          <option value="interface">Nach Interface</option>
          <option value="category">Nach Kategorie</option>
        </select>
        <div className="row" style={{ margin: 0, gap: 4 }}>
          <button className="ghost" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}>+</button>
          <button className="ghost" onClick={() => setZoom((z) => Math.max(0.7, Math.round((z - 0.1) * 10) / 10))}>−</button>
          <button className="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>100%</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty text={needle || status !== "all" ? "Keine Geräte passen zum Filter." : "Noch keine Geräte gefunden — starte einen Scan."} />
      ) : (
        <div className="map-stage" ref={stageRef} style={{ cursor: "grab" }}>
          <div
            className="map-inner"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <div className="map-top">
              <div className="map-node internet">◎ Internet</div>
              <div className="map-stem" />
              <div className="map-node gateway" title="Fritz!Box · 192.168.178.1">
                <span style={{ fontSize: 13 }}>⬡</span> Gateway · Fritz!Box
                <span className="badge ok" style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}>online</span>
              </div>
              <div className="map-stem" />
              <div className="dim" style={{ fontSize: 11, letterSpacing: ".02em" }}>
                {groups.size} {groups.size === 1 ? "Gruppe" : "Gruppen"} · {filtered.length} Geräte · Drag zum Verschieben · Scroll zum Zoomen
              </div>
            </div>

            {isSingleSubnet && radial ? (
              <div className="radial-wrap">
                <svg className="radial-svg" viewBox="0 0 800 600" width={800} height={560} aria-hidden>
                  <circle cx={400} cy={90} r={28} fill="var(--ok-bg)" opacity={0.6} />
                  {radial.map(({ d, x, y, gwY, cx }) => {
                    const ls = linkStyle(d);
                    return (
                      <line
                        key={x + "-" + y}
                        x1={cx}
                        y1={gwY + 18}
                        x2={x}
                        y2={y}
                        stroke="var(--border-2)"
                        strokeWidth={d.l2 === true ? 1.6 : 1.2}
                        strokeDasharray={ls.dash || undefined}
                        opacity={ls.opacity}
                      />
                    );
                  })}
                  <circle cx={400} cy={300} r={Math.min(260, Math.max(160, filtered.length * 11))} fill="none" stroke="var(--border)" strokeDasharray="4 6" opacity={0.5} />
                </svg>
                <div className="radial-gw" style={{ left: 400, top: 90 }}>
                  <div className="gw-dot" />
                </div>
                {radial.map(({ d, x, y }) => {
                  const dot = d.status === "online" ? "online" : d.status === "offline" ? "offline" : "unknown";
                  const isSel = selected === d.id;
                  return (
                    <Link
                      key={d.id}
                      to={`/devices/${d.id}`}
                      className={`radial-node ${isSel ? "selected" : ""}`}
                      style={{ left: x, top: y }}
                      onMouseEnter={() => setSelected(d.id)}
                      onMouseLeave={() => setSelected(null)}
                    >
                      <span className="rn-icon">{iconFor(d)}</span>
                      <span className={`dot ${dot}`} />
                      <span className="rn-name">{displayName(d)}</span>
                      <span className="rn-ip mono">{d.ip}</span>
                      {d.latencyMs != null && <span className="rn-lat">{Math.round(d.latencyMs)} ms</span>}
                      {hopLabel(d) && (
                        <span className="rn-lat" title={d.l2 === true ? "Direkt im lokalen Netz (Layer 2)" : `Erreichbar über ${d.hops} Hops`}>
                          {hopLabel(d)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="map-branch">
                {[...groups.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, list]) => (
                    <div key={key} className="subnet">
                      <div className="subnet-head">
                        <strong>
                          <span style={{ marginRight: 6 }}>{groupBy === "category" ? (CAT_ICON[key] ?? "◻") : groupBy === "interface" ? "⧉" : "▦"}</span>
                          {key}
                        </strong>
                        <span className="count">
                          {list.filter((d) => d.status === "online").length}/{list.length}
                        </span>
                      </div>
                      <div className="subnet-body">
                        {list.map((d) => {
                          const dot = d.status === "online" ? "online" : d.status === "offline" ? "offline" : "unknown";
                          return (
                            <Link key={d.id} to={`/devices/${d.id}`} className="device-card">
                              <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{iconFor(d)}</span>
                              <span className={`dot ${dot}`} title={d.status} />
                              <span className="meta">
                                <span className="name">{displayName(d)}</span>
                                <span className="ip">{d.ip} {d.vendor ? `· ${d.vendor}` : ""}{d.source && d.source !== "ping" && d.source !== "arp" ? ` · via ${d.source}` : ""}{typeof d.hops === "number" ? ` · ${d.hops === 1 ? "L2" : `${d.hops} Hops`}` : ""}</span>
                              </span>
                              <span className="lat">
                                {d.latencyMs != null ? (
                                  <>
                                    <strong>{Math.round(d.latencyMs)}</strong> ms
                                  </>
                                ) : (
                                  <span className="dim">—</span>
                                )}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="legend">
              <span><i className="dot online small" /> online</span>
              <span><i className="dot unknown small" /> unknown</span>
              <span><i className="dot offline small" /> offline</span>
              <span className="dim">Klick → Details · Hover highlight · Drag & Zoom</span>
              <span style={{ marginLeft: "auto" }} className="dim">
                {groupBy === "subnet" ? "Gruppiert nach Subnetz" : groupBy === "interface" ? "Gruppiert nach Interface" : "Gruppiert nach Kategorie"} · {filtered.length} sichtbar · Linie solid = direkt (L2), gestrichelt = geroutet
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
