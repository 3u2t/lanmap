#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import https from "node:https";
import { pipeline } from "node:stream/promises";

const ROOT = join(import.meta.dirname ?? ".", "..");
const DIST = join(ROOT, "dist");
const STAGE = join(DIST, "lanmap-windows");
const NODE_VER = process.env.NODE_WIN_VER || "v22.20.0";
const NODE_URL = `https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-win-x64.zip`;

function sh(cmd, opts = {}) {
  console.log("$", cmd);
  execSync(cmd, { stdio: "inherit", ...opts });
}

async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`Node zip schon vorhanden: ${dest}`);
    return;
  }
  console.log(`Lade ${url} ...`);
  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} für ${url}`));
      pipeline(res, createWriteStream(dest)).then(resolve, reject);
    }).on("error", reject);
  });
}

async function main() {
  mkdirSync(DIST, { recursive: true });
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  console.log("== 1/5 build workspaces ==");
  sh("npm run build --workspaces", { cwd: ROOT });

  console.log("\n== 2/5 bundle backend (ncc) ==");
  try {
    sh("npx --yes @vercel/ncc build backend/src/index.ts -o dist/lanmap-windows/backend/dist --no-cache", { cwd: ROOT });
  } catch (e) {
    console.warn("ncc fehlgeschlagen, fallback auf tsc output:", e.message);
    cpSync(join(ROOT, "backend", "dist"), join(STAGE, "backend", "dist"), { recursive: true });
    cpSync(join(ROOT, "backend", "package.json"), join(STAGE, "backend", "package.json"));
    try {
      sh("npm install --omit=dev --no-audit --no-fund --prefix " + STAGE + "/backend", { cwd: ROOT });
    } catch {
      console.warn("fallback npm install fehlgeschlagen");
    }
  }
  if (existsSync(join(ROOT, "backend", "package.json"))) {
    try { cpSync(join(ROOT, "backend", "package.json"), join(STAGE, "backend", "package.json")); } catch {}
  }

  console.log("\n== 3/5 frontend ==");
  const feSrc = existsSync(join(ROOT, "frontend", "dist")) ? join(ROOT, "frontend", "dist") : join(ROOT, "frontend-dist");
  if (existsSync(feSrc)) cpSync(feSrc, join(STAGE, "frontend", "dist"), { recursive: true });

  console.log("\n== 4/5 Go launcher -> lanmap.exe (Windows) ==");
  const hasGo = (() => {
    try { execSync("go version", { stdio: "ignore" }); return true; } catch { return false; }
  })();
  if (hasGo) {
    try {
      sh("GOOS=windows GOARCH=amd64 go build -o " + join(STAGE, "lanmap.exe") + " ./windows/launcher.go", { cwd: ROOT });
    } catch (e) {
      console.warn("Go build fehlgeschlagen:", e.message);
    }
  } else {
    console.warn("Go nicht gefunden — lanmap.exe wird in CI gebaut (windows-latest)");
  }
  if (!existsSync(join(STAGE, "lanmap.exe"))) {
    console.warn("Kein lanmap.exe im Stage — zip wird ohne exe gebaut (CI ergänzt)");
  }
  for (const f of [".env.example", "README.md", "windows/README.md"]) {
    const src = join(ROOT, f);
    if (existsSync(src)) cpSync(src, join(STAGE, f.replace("windows/", "")));
  }

  console.log("\n== 5/5 Node Windows Binary laden ==");
  const zipPath = join(DIST, `node-${NODE_VER}-win-x64.zip`);
  await download(NODE_URL, zipPath);
  try {
    sh(`unzip -o -j ${zipPath} node-${NODE_VER}-win-x64/node.exe -d ${STAGE}`);
  } catch {
    console.warn("unzip fehlgeschlagen — versuche 7z");
    try { sh(`7z e ${zipPath} -o${STAGE} node-${NODE_VER}-win-x64/node.exe -y`); } catch {}
  }

  console.log("\n== zip (portabel) ==");
  const outZip = join(DIST, "lanmap-windows-x64.zip");
  rmSync(outZip, { force: true });
  try {
    sh(`cd ${DIST} && zip -r lanmap-windows-x64.zip lanmap-windows`);
  } catch {
    sh(`powershell -Command "Compress-Archive -Path '${STAGE}' -DestinationPath '${outZip}' -Force"`);
  }
  console.log(`\n✓ Portabel: ${outZip}`);
  try { sh(`ls -lh ${outZip}`); } catch {}

  console.log("\n== 6/6 Single-File .exe (lanmap.exe) ==");
  const singleDir = join(ROOT, "windows", "single");
  const singleStage = join(singleDir, "backend", "dist");
  const singleFe = join(singleDir, "frontend", "dist");
  try {
    rmSync(join(singleDir, "backend"), { recursive: true, force: true });
    rmSync(join(singleDir, "frontend"), { recursive: true, force: true });
    rmSync(join(singleDir, "node.exe"), { force: true });
    mkdirSync(singleStage, { recursive: true });
    mkdirSync(singleFe, { recursive: true });
    cpSync(join(STAGE, "backend", "dist", "index.js"), join(singleStage, "index.js"));
    cpSync(join(STAGE, "frontend", "dist"), singleFe, { recursive: true });
    cpSync(join(STAGE, "node.exe"), join(singleDir, "node.exe"));
    try { cpSync(join(ROOT, "backend", "package.json"), join(singleDir, "backend", "package.json")); } catch {}
    if (hasGo) {
      sh(`GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o ${join(DIST, "lanmap.exe")} ./windows/single/main.go`, { cwd: ROOT });
      console.log(`\n✓ Single-File: ${join(DIST, "lanmap.exe")}`);
      try { sh(`ls -lh ${join(DIST, "lanmap.exe")}`); } catch {}
    } else {
      console.warn("Go nicht gefunden — lanmap.exe (single) wird in CI gebaut");
    }
  } catch (e) {
    console.warn("Single-File Build fehlgeschlagen:", e.message);
  }
  try { rmSync(join(singleDir, "backend"), { recursive: true, force: true }); } catch {}
  try { rmSync(join(singleDir, "frontend"), { recursive: true, force: true }); } catch {}
  try { rmSync(join(singleDir, "node.exe"), { force: true }); } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });
