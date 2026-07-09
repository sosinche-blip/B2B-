import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

function loadDevVars(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = process.cwd();
loadDevVars(resolve(root, ".dev.vars"));
loadDevVars(resolve(root, "apps/worker/.dev.vars"));

mkdirSync(resolve(root, ".ncloud"), { recursive: true });
const outfile = resolve(root, ".ncloud/api-server.mjs");

await build({
  entryPoints: [resolve(root, "scripts/ncloud_node_server.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: false,
  logLevel: "info",
});

await import(pathToFileURL(outfile).href);
