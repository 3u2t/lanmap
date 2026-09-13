# lanmap-agent (optional)

Reports host interfaces + gateway to the server. Not needed for basic discovery.

Build: `CGO_ENABLED=0 go build -o lanmap-agent .` (add `GOARCH=arm64` for Pi).

Run: `AGENT_SECRET=... ./lanmap-agent -server http://localhost:8081`
