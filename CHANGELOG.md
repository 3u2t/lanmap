# Changelog

## 0.2.0 (2026-09-13)

- Topology: TTL hop estimation + ARP adjacency (direct L2 vs routed), auto-refresh after scans, map badges/line styles, interface grouping, Network → Topology table
- Discovery: SSDP/UPnP browse, mDNS browse, TCP-connect fallback for ping-blocked hosts; per-method toggles
- Push: ntfy + browser Web Push (VAPID, service worker), severity gates, test buttons, dedup-aware fan-out
- Multi-network: up to 8 subnets per scan run, subnet list in Settings, map groups per configured network

## 0.1.0 (unreleased)

- Local device discovery (ARP, neighbour table, ping sweep, reverse DNS)
- Monitored-device ping tracking with latency + packet loss
- Device history, events and export
- Logical network map
- Gateway + internet monitoring
- Alerts with configurable thresholds
- Auth (first-run setup, sessions) and Docker/CasaOS files
