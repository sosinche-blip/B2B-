import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";
import os from "node:os";

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const children = [];

function canListen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function isPortFree(port, hosts) {
  for (const host of hosts) {
    if (!(await canListen(port, host))) return false;
  }
  return true;
}

async function findFreePort(start, maxOffset = 20, hosts = ["127.0.0.1"]) {
  for (let port = start; port <= start + maxOffset; port += 1) {
    if (await isPortFree(port, hosts)) return port;
  }
  throw new Error(`No free port found from ${start} to ${start + maxOffset}`);
}

function start(name, args, env = {}) {
  const child = spawn(npmCmd, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, ...env }
  });

  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    shutdown(1);
  });

  children.push(child);
}

function startNode(name, args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env }
  });

  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    shutdown(1);
  });

  children.push(child);
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill(isWin ? undefined : "SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const workerPort = Number(process.env.WORKER_DEV_PORT || await findFreePort(8787, 30, ["127.0.0.1"]));
const localFolderPort = Number(process.env.LOCAL_FOLDER_HELPER_PORT || await findFreePort(8791, 30, ["127.0.0.1"]));
const webPort = Number(process.env.VITE_WEB_PORT || await findFreePort(5173, 30, ["0.0.0.0", "127.0.0.1"]));
const workerOrigin = `http://127.0.0.1:${workerPort}`;
const localFolderOrigin = `http://127.0.0.1:${localFolderPort}`;
const mobileWebUrls = localLanUrls(webPort);
const mobileFolderUrls = localLanUrls(localFolderPort);
const webOrigin = `http://127.0.0.1:${webPort}`;
const safeMode = ["1", "true", "yes", "on"].includes(String(process.env.B2B_SAFE_MODE || "").toLowerCase());
const workerGateEnv = safeMode
  ? {
      API_CONNECTION_PAUSED: "true",
      ALLOW_LIVE_EXTERNAL_API: "false",
      ALLOW_FINAL_EXECUTION: "false",
    }
  : {
      API_CONNECTION_PAUSED: "false",
      ALLOW_LIVE_EXTERNAL_API: "true",
      ALLOW_FINAL_EXECUTION: "true",
    };

function localLanUrls(port) {
  const urls = [];
  for (const values of Object.values(os.networkInterfaces())) {
    for (const item of values || []) {
      if (item.family === "IPv4" && !item.internal) urls.push(`http://${item.address}:${port}`);
    }
  }
  return urls;
}

console.log("B2B V169 PC/mobile local preview server starting...");
console.log(`Worker API:    ${workerOrigin}/api/health`);
console.log(`System status: ${workerOrigin}/api/system/status`);
console.log(`Route list:    ${workerOrigin}/api/system/routes`);
console.log(`Local folders: ${localFolderOrigin}/api/local/health`);
console.log(`Web UI:        ${webOrigin}`);
if (mobileWebUrls.length) console.log(`Mobile Web UI: ${mobileWebUrls.join("  ")}`);
if (mobileFolderUrls.length) console.log(`Mobile files:  ${mobileFolderUrls.map((u) => `${u}/api/local/health`).join("  ")}`);
console.log("Stop:          Ctrl + C");
console.log(`API mode:      ${safeMode ? "SAFE - live marketplace calls blocked" : "LIVE - order collection enabled"}`);
console.log("Order collect:  manual button only, default range is last 7 days");
console.log("Port note:     if 5173 or 8787 is busy, this launcher automatically selects the next free port.");

startNode("local-folder-helper", ["scripts/local_folder_helper.mjs"], {
  LOCAL_FOLDER_HELPER_PORT: String(localFolderPort),
  LOCAL_FOLDER_HELPER_HOST: "0.0.0.0"
});
start("worker", ["--workspace", "apps/worker", "run", "dev", "--", "--port", String(workerPort)], workerGateEnv);
start("web", ["--workspace", "apps/web", "run", "dev", "--", "--host", "0.0.0.0", "--port", String(webPort), "--strictPort"], {
  VITE_WORKER_PROXY_TARGET: workerOrigin,
  VITE_LOCAL_FOLDER_HELPER_PORT: String(localFolderPort),
  VITE_WEB_PORT: String(webPort)
});

