# Discovery

Methods run in order; each is best-effort and failures don't stop the rest.
Every method can be toggled under Settings → Discovery. Up to 8 subnets
can be scanned in one run.

1. **Interfaces** — `os.networkInterfaces()` gives local IPs; subnets derived from the CIDR field (fallback /24). Never assumes names like eth0.
2. **ARP / neighbour** — `/proc/net/arp` parsed directly, plus `ip neigh show` (REACHABLE/STALE/DELAY ok, FAILED skipped). On Windows: `arp -a`. Gives IP+MAC without sending anything.
3. **Ping sweep** — `ping -c1 -W1` per host via execFile (no shell), concurrency 32, capped at 1024 hosts per subnet. Only private ranges (RFC1918, ULA, link-local) accepted — public targets are rejected with 400.
4. **Reverse DNS** — `dns.reverse()` per responding host, timeout-tolerant.
5. **mDNS** — minimal pure-Node browser (`_services._dns-sd._udp.local` + `_http._tcp.local` on 224.0.0.251:5353). Catches Bonjour/ESPHome/printers the sweep missed. Needs multicast; may return empty in Docker bridge mode.
6. **SSDP / UPnP** — M-SEARCH to 239.255.255.250:1900, LOCATION URL gives the IP. Finds TVs, consoles, speakers, routers.
7. **TCP connect** — for hosts with an ARP entry but no ping reply (ICMP blocked), a quick connect-scan of common ports (22/80/443/445/…) decides presence and records open ports.

Dedupe: match by normalized MAC when both sides have one, else by IP. New IPs on a known MAC record an `ip-changed` event. Each device stores how it was found (`source`) and any open ports.

# Topology

After every scan (and on demand via Network → "Neu vermessen" or
`POST /api/topology/refresh`) each known device is probed:

- **Hops** — ping with TTL 1..6. First TTL that gets a reply is the hop count. LAN devices answer at TTL 1.
- **L2 adjacency** — hops == 1 means directly on the local link; hops > 1 means routed. If the hop probe fails, presence in the ARP/neighbour table still counts as L2.

The map draws direct devices with solid lines and routed ones dashed, and can group by subnet, interface or category.
