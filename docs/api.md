# API

Base: same origin. Auth via `lanmap_session` cookie (first-run setup first). Errors: `{ "error": "..." }`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | /health, /api/health | — | app, db, discovery, monitoring, ws |
| POST | /api/auth/setup | {username, password} | sets cookie (only before first user) |
| POST | /api/auth/login | {username, password} | sets cookie (5/min/IP) |
| POST | /api/auth/logout | — | clears cookie |
| GET | /api/auth/me | — | {authenticated, setupNeeded} |
| GET | /api/devices | ?search=&status=&monitored=1 | {devices} |
| PATCH | /api/devices/:id | {customName?, category?, monitored?, ignored?} | {device} |
| GET | /api/devices/:id | — | {device} |
| GET | /api/devices/:id/events | — | {events} |
| GET | /api/devices/:id/history | ?range=1h\|6h\|24h\|7d\|30d | {points} (≤500) |
| GET | /api/network | — | gateway, internet, interfaces, subnets, health |
| GET | /api/interfaces | — | interfaces, subnets, gateway |
| GET | /api/discovery | — | subnets, gateway, scan |
| POST | /api/scan/start | {target?} or {targets[]} private CIDRs (max 8) | starts job over all subnets |
| POST | /api/scan/stop | — | stops job |
| GET | /api/scan | — | scan state |
| GET | /api/topology | — | gateway, generatedAt, nodes {id, ip, hops, l2, iface, subnet} |
| POST | /api/topology/refresh | — | re-measures hops/L2 (throttled) |
| GET | /api/notify/status | — | ntfy + webpush config state, subscription count |
| POST | /api/notify/test | {channel: ntfy\|webpush} | sends test push |
| GET | /api/push/vapid | — | VAPID public key (generated on first use) |
| POST | /api/push/subscribe | {endpoint, keys:{p256dh, auth}} | registers browser |
| DELETE | /api/push/unsubscribe | {endpoint?} | removes browser |
| POST | /api/scan/stop | — | stops job |
| GET | /api/scan | — | scan state |
| GET | /api/history/summary | ?range=24h\|7d | devices, disconnects, recent |
| GET | /api/alerts | ?open=1&limit= | {alerts} |
| POST | /api/alerts/:id/ack | — | {ok} |
| GET/PUT | /api/settings | settings patch | {settings} |
| POST | /api/dns-test | {host} | {ok, ms, addresses} |
| GET | /api/export | ?format=csv\|json | devices (no secrets) |
| POST | /api/agent/report | agent JSON + X-Agent-Secret | {ok} |

WS `/ws`: hello, device-updated, presence, latency, alert, scan-progress.
