# Security

LANMap is for administering networks you own.

It does not do credential attacks, spoofing, interception, or exploitation of any kind, and contributions adding such functionality will be rejected.

- Passwords: scrypt-hashed, never logged.
- Sessions: random tokens in httpOnly cookies, 24h expiry.
- Login is rate-limited (5/min/IP).
- Only private/local scan targets are accepted; shell commands are never exposed to the browser.

To report a vulnerability, open a GitHub issue (or email the maintainer if the repo lists one). Please include steps to reproduce and avoid probing other people's networks.
