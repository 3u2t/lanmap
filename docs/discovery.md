# Discovery

Methods run in order; each is best-effort and failures don't stop the rest.

1. **Interfaces** — `os.networkInterfaces()` gives local IPs; subnets derived from the CIDR field (fallback /24). Never assumes names like eth0.
2. **ARP / neighbour** — `/proc/net/arp` parsed directly, plus `ip neigh show` (REACHABLE/STALE/DELAY ok, FAILED skipped). Gives IP+MAC without sending anything.
3. **Ping sweep** — `ping -c1 -W1` per host via execFile (no shell), concurrency 32, capped at 1024 hosts. Only private ranges (RFC1918, ULA, link-local) accepted — public targets are rejected with 400.
4. **Reverse DNS** — `dns.reverse()` per responding host, timeout-tolerant.
5. **mDNS** — currently via reverse DNS only; full mDNS browsing is on the roadmap.

Dedupe: match by normalized MAC when both sides have one, else by IP. New IPs on a known MAC record an `ip-changed` event.
