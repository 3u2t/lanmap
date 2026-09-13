# Architecture

```
browser (React/Vite) <--HTTP+WS--> backend (Express + ws) --> SQLite (node:sqlite)
                                              |-> ping / ip / /proc/net/*
                                              |-> optional Go agent POSTs
```

Backend modules (`backend/src/`):

- `db/` — `node:sqlite` DatabaseSync, WAL, hand-written schema. Tables: users, sessions, devices, events, alerts, ping_samples, settings, gateway, internet.
- `network/` — interfaces (os.networkInterfaces + /sys/class/net), gateway (/proc/net/route), neighbours (/proc/net/arp + `ip neigh`), ping (system binary via execFile, never shell), DNS.
- `discovery/` — cancellable ping sweep (≤1024 hosts, concurrency 32), merges neighbour MACs + reverse DNS, dedupes by MAC then IP. `demo.ts` simulates when DEMO_MODE=true.
- `monitoring/` — 10s tick over monitored devices only; 3-strike presence; writes samples; raises alerts; updates gateway/internet rows.
- `alerts/` — 15-minute dedupe per (type, device).
- `auth/` — scrypt + sessions + rate limit.
- `api/` — routes listed in `docs/api.md`. All scan/host inputs validated.
- `ws/` — `/ws` broadcast: device-updated, presence, latency, alert, scan-progress.

Frontend (`frontend/src/`): pages per nav item, `useDevices` (10s poll + WS merge), `useWs` with reconnect + polling fallback, uPlot charts, SVG map grouped by /24.
