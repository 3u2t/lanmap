# LANMap für Windows (.exe)

Doppelklick statt Docker — für Windows 10/11.

## Was du bekommst

`lanmap-windows-x64.zip` enthält:

```
lanmap.exe          ← doppelklicken
node.exe            ← Node 22 (wird mitgeliefert, kein extra Install nötig)
backend/dist/       ← kompiliertes Backend (Express + node:sqlite)
frontend/dist/      ← gebautes Frontend (React)
.env.example        ← Vorlage
```

Beim ersten Start legt `lanmap.exe`:

- Daten in `%LOCALAPPDATA%\LANMap\data\lanmap.db` (SQLite, WAL)
- Log in der Konsole (Port 8081)

Dann öffnet sich automatisch `http://localhost:8081` — dort legst du den Admin-Account an.

## Schnellstart

1. **Entpacken** (irgendwohin, z.B. `C:\LANMap` oder Desktop)
2. **Doppelklick** `lanmap.exe`
3. Browser öffnet sich → Admin anlegen → Scan starten (z.B. `192.168.178.0/24` für Fritz!Box)

> Hinweis: Windows nutzt `ping -n` und `arp -a` statt Linux-`/proc`. Die Erkennung funktioniert genauso, aber am besten
> als Admin starten, falls `arp` leer bleibt. Gateway wird via `route print -4` erkannt — notfalls in
> **Settings → Gateway IP** manuell auf `192.168.178.1` setzen.

## Ohne mitgeliefertes Node

Wenn du Node 22+ schon hast:

```powershell
npm install
npm run build --workspaces
.\lanmap.exe   # nutzt dann dein System-node
```

## Manuell bauen (Windows)

```powershell
npm install
npm run build --workspaces
go build -o lanmap.exe ./windows/launcher.go
.\lanmap.exe
```

## Manuell bauen (Linux → Windows Cross-Build)

```bash
npm run build --workspaces
GOOS=windows GOARCH=amd64 go build -o lanmap.exe ./windows/launcher.go
# dann mit Node-Windows Binary + backend/frontend zu zip packen:
node scripts/build-windows.mjs
```

## Ports / Firewall

Standard-Port `8081` (in `.env` via `PORT` änderbar). Beim ersten Start fragt Windows Firewall — **Zugriff erlauben** für privates Netzwerk, sonst siehst du nur `localhost`.

## Daten löschen

Einfach `%LOCALAPPDATA%\LANMap` löschen oder `DATA_DIR` in `.env` auf einen anderen Ordner setzen.

## Troubleshooting

- **„node:sqlite“ Fehler** → du nutzt Node <22. Nimm die mitgelieferte `node.exe` (22.20+) oder update Node.
- **Kein Gateway / nur 172.x** → in Settings Gateway auf `192.168.178.1` setzen.
- **arp leer, keine MACs** → PowerShell als Admin starten, dann `lanmap.exe` nochmal.
- **Port belegt** → `.env` anlegen: `PORT=8085` und neu starten.
