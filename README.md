# LANMap

**See what's on your network.**

I run a Raspberry Pi at home and could never remember what was on my LAN — the printer kept changing IPs, an old ESP would drop off, and I had no idea when the internet actually went down versus "the wifi feels slow". So I built this: a small self-hosted dashboard that discovers devices, pings the ones you care about, and shows what happened.

## Features

- **Discovery** — ARP / neighbour table + ping sweep + reverse DNS + mDNS + SSDP/UPnP + TCP-connect fallback. Each method is optional and one failing doesn't stop the others.
- **Presence tracking** — 3-strike rule, so a single dropped ping doesn't flap a device online/offline.
- **Monitoring** — latency + packet loss for monitored devices, ticking every 10s, with 1h–30d history and uPlot charts.
- **Network map** — groups by subnet, interface or category. TTL-based hop estimation and ARP adjacency mark devices as direct (L2, solid line) or routed (dashed).
- **Multi-network** — scan up to 8 private subnets in one run; the map groups devices per configured network.
- **Gateway + internet checks** — ICMP gateway ping plus DNS resolution test.
- **Alerts** — offline/online, new device, high latency, packet loss, gateway/internet down, IP/hostname changes.
- **Push notifications** — ntfy and browser Web Push (VAPID) with per-channel severity gate and test buttons.
- **Live UI** — WebSocket updates with polling fallback, `Ctrl+K` command palette, dark/light theme, CSV/JSON export.
- **Auth** — single admin account created on first run, cookie sessions, rate-limited login.
- **Demo mode** — `DEMO_MODE=true` seeds simulated devices, clearly bannered.

## Stack

- **Backend** — Node 22, Express, `ws`, `node:sqlite` (no ORM). Uses the system `ping` binary via `execFile` (no shell). Reads `/proc/net/route`, `/proc/net/arp`, `ip neigh` on Linux; `route print`, `arp -a`, `ping -n` on Windows.
- **Frontend** — React + Vite + uPlot, hand-written CSS, no component framework.
- **Shared** — pure TS types + validation (`@lanmap/shared`) used by both sides.
- **Agent (optional)** — tiny Go binary (stdlib only) that posts extra host detail. The server works fine without it.
- **Windows launcher** — small Go starter that launches the bundled Node backend and opens the browser.

```
lanmap/
  backend/src/    express api, db, discovery, monitoring, network, ws
  frontend/src/   pages, components, hooks, lib
  shared/src/     types + validation
  agent/          optional Go reporter
  windows/        Go launcher + single-file builder
  scripts/        windows build script
  docs/           architecture, api, discovery, casaos, windows, troubleshooting
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up -d --build
# open http://<host>:8081 — create the admin account on first run
```

Needs `NET_RAW` for ping inside Docker (already in compose). Data lives in the `lanmap-data` volume. For CasaOS see `docs/casaos.md`.

Local dev:

```bash
npm install
npm run dev -w lanmap-backend    # needs ping + ip on PATH
npm run dev -w lanmap-frontend
```

## Windows (.exe, no Docker)

Download `lanmap-windows-x64.zip` from **Releases** (contains `lanmap.exe` + `node.exe` + `backend/` + `frontend/`), or build it yourself. Two variants:

| Variant | File | Size | What |
|---|---|---|---|
| Portable | `lanmap-windows-x64.zip` | ~36 MB | `lanmap.exe` + `node.exe` + `backend/dist` + `frontend/dist` |
| Single-file | `lanmap.exe` | ~89 MB | everything embedded, just double-click |

Quick start:

1. Extract the zip anywhere, e.g. `C:\LANMap` (or just take the single-file `lanmap.exe`).
2. Double-click `lanmap.exe` — the browser opens `http://localhost:8081`.
3. Create the admin account, start a scan (e.g. `192.168.178.0/24` on a Fritz!Box).

Data goes to `%LOCALAPPDATA%\LANMap\data\lanmap.db`. Port via `PORT` env var. Details in `windows/README.md` and `docs/windows.md`.

Build it yourself:

```powershell
npm install
npm run build --workspaces
go build -o lanmap.exe ./windows/launcher.go
.\lanmap.exe
# or full bundle with Node binary + zip + single-file exe:
npm run build:win
```

## Notifications

Two channels, both configured under Settings → Notifications and gated per severity (info/warning/critical):

- **ntfy** — set server (default `https://ntfy.sh`, self-hosted works too) and topic, subscribe the topic in the ntfy app, hit Test.
- **Web Push** — enable, then register the browser (VAPID keys are generated automatically). Works for phones/desktops even with the tab closed, via the bundled service worker.

Only fresh alerts push — deduped repeats inside the 15-minute window stay quiet.

## Configuration

| Var | Default | What |
|---|---|---|
| `PORT` | 8081 | HTTP port |
| `DATA_DIR` | ./data (`/data` in Docker, `%LOCALAPPDATA%\LANMap\data` on Windows) | SQLite dir |
| `DEMO_MODE` | false | `true` = simulated devices |
| `MONITOR_INTERVAL_MS` | 10000 | ping tick |
| `SCAN_CONCURRENCY` | 32 | sweep parallelism |
| `GATEWAY_IP` | auto | override gateway detection (useful in Docker bridge mode) |
| `LAN_SUBNET` | auto | override subnet detection |
| `AGENT_SECRET` | — | shared secret for the Go agent |

More in Settings: ping timeout, offline-after-N, latency/loss thresholds, subnet, retention.

In Docker bridge mode `/proc/net/route` only shows the Docker gateway (`172.x`). Either set `GATEWAY_IP` / `LAN_SUBNET` or use `network_mode: host`.

## API

| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/setup` | first-run admin creation |
| POST | `/api/auth/login` | rate-limited |
| GET | `/api/devices` | `?search=&status=&monitored=1` |
| PATCH | `/api/devices/:id` | `customName`, `category`, `monitored`, `ignored` |
| GET | `/api/devices/:id/history?range=24h` | downsampled to ≤500 points |
| POST | `/api/scan/start` | `{ target: "192.168.1.0/24" }`, private ranges only |
| GET | `/api/network` | gateway, internet, interfaces, health |
| GET | `/api/alerts` | `?open=1&limit=100` |
| PUT | `/api/settings` | validated, see docs |

Full reference in `docs/api.md`. WebSocket on `/ws`: `device-updated`, `scan-progress`, `alert`, `latency`, `presence`.

## Limitations

- Only scans private ranges — no WAN scanning, by design.
- No physical topology beyond subnet grouping.
- Hosts that block ICMP show as best-effort (ARP data) or unknown latency.
- Vendor lookup is minimal (no OUI database shipped yet).

## Roadmap

- [x] Discovery, monitoring, latency, packet loss, history, alerts, map, CasaOS files
- [x] Better topology detection (TTL hops, L2 adjacency, interface grouping)
- [x] More discovery methods (mDNS, SSDP/UPnP, TCP-connect fallback)
- [x] Push notifications (ntfy + Web Push/VAPID)
- [x] Multi-network support (up to 8 subnets per scan)
- [ ] Push notifications for more channels
- [ ] Multi-user support

## License

MIT — see `LICENSE`.
