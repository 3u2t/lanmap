# Windows

LANMap läuft ohne Docker direkt als `.exe` auf Windows 10/11.

## Distribution

`lanmap-windows-x64.zip` (aus Releases oder `npm run build:win`) enthält:

```
lanmap.exe          ← Go-Launcher, doppelklicken
node.exe            ← Node 22 (kein extra Install)
backend/dist/       ← Backend (node:sqlite, Express)
frontend/dist/      ← Frontend (React)
```

Nach Doppelklick:

- Backend startet auf `http://localhost:8081` (Port via `PORT` in `.env` änderbar)
- Daten in `%LOCALAPPDATA%\LANMap\data\lanmap.db`
- Browser öffnet automatisch

## Manuell

Mit installiertem Node 22+ und Go:

```powershell
npm install
npm run build --workspaces
go build -o lanmap.exe ./windows/launcher.go
.\lanmap.exe
```

Ohne Go, nur Node:

```powershell
npm run build --workspaces
node backend/dist/index.js
```

## Wie Windows-Erkennung funktioniert

Statt Linux-`/proc`:

- **Gateway**: `route print -4` → `0.0.0.0 0.0.0.0 <gateway>`
- **Nachbarn**: `arp -a` → `192.168.178.x  aa-bb-cc-...`
- **Ping**: `ping -n 1 -w 1500 <ip>` (parst `time=2ms` / `Zeit=2ms`, `<1ms`)
- **Interfaces**: `os.networkInterfaces()` (wie Linux) + `route print` Fallback

Falls `arp -a` leer bleibt: PowerShell **als Admin** starten.

Falls Gateway falsch (z.B. `172.x` bei WSL): in **Settings → Gateway IP** manuell `192.168.178.1` setzen oder `GATEWAY_IP` in `.env`.

## Firewall

Windows fragt beim ersten Start nach Firewall-Freigabe — für **privates Netzwerk** erlauben.

## Build

`scripts/build-windows.mjs` macht alles:

```bash
node scripts/build-windows.mjs
# lädt Node-Windows Binary, baut Go-Launcher, packt zip nach dist/lanmap-windows-x64.zip
```

CI baut das gleiche auf `windows-latest` (siehe `.github/workflows/ci.yml`).

## Troubleshooting

Siehe `windows/README.md` und `docs/troubleshooting.md`.
