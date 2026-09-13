import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { initDb, pruneSamples, getSetting } from "./db/db.js";
import { router } from "./api/routes.js";
import { attachWs } from "./ws/hub.js";
import { startMonitor } from "./monitoring/monitor.js";
import { seedDemo } from "./discovery/demo.js";

const here = (() => {
  try {
    const m = eval("import.meta") as { url: string } | undefined;
    if (m?.url) {
      const { fileURLToPath } = eval("require")("node:url") as { fileURLToPath: (u: string) => string };
      return dirname(fileURLToPath(m.url));
    }
  } catch {
  }
  try {
    const d = eval("__dirname") as string | undefined;
    if (d) return d;
  } catch {
  }
  return dirname(process.execPath);
})();

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(router);

function findFrontendDist(): string | null {
  const candidates = [
    join(here, "..", "..", "frontend", "dist"),
    join(here, "..", "..", "frontend-dist"),
    join(dirname(process.execPath), "frontend", "dist"),
    join(dirname(process.execPath), "frontend-dist"),
    join(process.cwd(), "frontend", "dist"),
    join(process.cwd(), "frontend-dist"),
    join(process.cwd(), "dist", "lanmap-windows", "frontend", "dist"),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}

const frontendDist = findFrontendDist();
if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => res.sendFile(join(frontendDist, "index.html")));
}

const server = createServer(app);
attachWs(server);

initDb();
if (process.env.DEMO_MODE === "true") {
  try {
    seedDemo();
    console.log("lanmap: demo mode — simulated devices, no real scanning.");
  } catch {
  }
}

const retentionDays = Number(getSetting("retentionDays", "30")) || 30;
pruneSamples(retentionDays * 86400000);

startMonitor(Number(process.env.MONITOR_INTERVAL_MS) || 10_000);

const port = Number(process.env.PORT) || 8081;
server.listen(port, () => console.log(`lanmap listening on :${port}`));
