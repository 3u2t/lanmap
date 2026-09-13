# Troubleshooting

- **"Ping unavailable" / all latencies —**: container lacks NET_RAW, or `ping` missing. Compose adds the capability and the image ships iputils-ping. On bare metal, ensure `ping` is on PATH.
- **"Gateway unavailable"**: non-Linux host or no default route in /proc/net/route. Check `ip route`.
- **"No local subnet detected"**: only loopback up. Bring an interface up or type the subnet manually (must be private, e.g. 192.168.1.0/24).
- **Login loops**: cookies blocked? The session cookie is httpOnly + SameSite=Lax; allow cookies for the host.
- **DB locked / permission denied**: DATA_DIR must be writable by uid 1000 (docker) or your user (bare metal).
- **Scan rejected**: only private ranges allowed; /8 and public IPs return 400.
- **Flapping online/offline**: raise "failures before offline" in Settings.
