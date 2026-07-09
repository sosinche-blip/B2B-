#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const port = Number(process.env.LOCAL_FOLDER_HELPER_PORT || 8791);
const host = process.env.LOCAL_FOLDER_HELPER_HOST || "0.0.0.0";
const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
const defaultRoot = path.join(os.homedir(), "Downloads");

const unifiedPurchaseFolder = path.join(defaultRoot, "B2B_발주폴더");
const defaultFolders = {
  purchase: unifiedPurchaseFolder,
  // invoice/upload are kept as aliases for older browser settings, but both resolve to the unified purchase folder.
  invoice: unifiedPurchaseFolder,
  upload: unifiedPurchaseFolder,
};

const openDebounceMs = 2200;
let lastOpenRequest = { folderPath: "", at: 0 };

function header(res, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

function send(res, status, body) {
  header(res, status);
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100 * 1024 * 1024) {
        reject(new Error("요청 파일이 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("JSON 요청을 읽지 못했습니다.")); }
    });
    req.on("error", reject);
  });
}

function cleanFilename(name) {
  return String(name || "file.xlsx").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 160);
}

function normalizeKind(kind) {
  return ["purchase", "invoice", "upload"].includes(kind) ? kind : "purchase";
}

function stripWrappingQuotes(value) {
  return String(value || "").trim().replace(/^["']+|["']+$/g, "").trim();
}

function isMalformedWindowsPath(value) {
  if (process.platform !== "win32") return false;
  const raw = stripWrappingQuotes(value);
  if (!raw) return false;
  const normalized = raw.replace(/\//g, "\\");
  // Bad values from an earlier version could be saved as "\\w" or "\\".
  // Those make Windows show: "\\w을(를) 찾을 수 없습니다".
  if (normalized === "\\" || normalized === "\\\\") return true;
  if (/^\\[^\\]*$/i.test(normalized)) return true;
  if (/^\\\\[^\\]+$/i.test(normalized)) return true;
  return false;
}

function normalizeFolderInput(kind, folderPath) {
  const k = normalizeKind(kind);
  let raw = stripWrappingQuotes(folderPath);
  if (raw.toLowerCase().startsWith("file:///")) {
    raw = decodeURIComponent(raw.replace(/^file:\/\//i, ""));
  }
  if (isMalformedWindowsPath(raw)) raw = "";
  return raw || defaultFolders[k];
}

function resolveFolder(kind, folderPath) {
  const target = normalizeFolderInput(kind, folderPath);
  return path.resolve(target.replace(/^~(?=$|[\\/])/, os.homedir()));
}

async function ensureFolder(kind, folderPath) {
  const folder = resolveFolder(kind, folderPath);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

function spawnDetached(command, args, options = {}) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false,
    ...options,
  });
  child.unref();
  return child.pid || 0;
}


function openFolder(folderPath) {
  const target = path.resolve(folderPath);
  const now = Date.now();
  if (lastOpenRequest.folderPath === target && now - lastOpenRequest.at < openDebounceMs) {
    return [{ label: "debounced", ok: true, skipped: true }];
  }
  lastOpenRequest = { folderPath: target, at: now };

  const attempts = [];
  const trySpawn = (label, command, args, options = {}) => {
    try {
      const pid = spawnDetached(command, args, options);
      attempts.push({ label, ok: true, pid });
      return true;
    } catch (error) {
      attempts.push({ label, ok: false, message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  if (process.platform === "win32") {
    // Open exactly once using argv, not a composed cmd string.
    // This prevents backslashes in paths from being misread as a target like "\w".
    trySpawn("explorer", "explorer.exe", [target]);
    return attempts;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  trySpawn(command, command, [target]);
  return attempts;
}


const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { dosTime, dosDate };
}

function u16(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value & 0xffff, 0);
  return b;
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

function makeZipBuffer(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const nameBuffer = Buffer.from(cleanFilename(file.filename), "utf8");
    const data = file.buffer;
    const checksum = crc32(data);
    const { dosTime, dosDate } = dosDateTime(file.modifiedAt ? new Date(file.modifiedAt) : new Date());
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(checksum), u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), nameBuffer,
    ]);
    locals.push(localHeader, data);
    const centralHeader = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(checksum), u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBuffer,
    ]);
    centrals.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(offset), u16(0),
  ]);
  return Buffer.concat([...locals, ...centrals, end]);
}


function resolveFileInFolder(kind, folderPath, filename) {
  const folder = resolveFolder(kind, folderPath);
  const safeName = cleanFilename(filename);
  const filePath = path.resolve(path.join(folder, safeName));
  const folderResolved = path.resolve(folder);
  const prefix = folderResolved.endsWith(path.sep) ? folderResolved : `${folderResolved}${path.sep}`;
  if (!filePath.startsWith(prefix)) {
    throw new Error("허용되지 않은 파일 경로입니다.");
  }
  return { folder: folderResolved, filename: safeName, filePath };
}

async function getFolderFiles(kind, folderPath, options = {}) {
  const folder = await ensureFolder(kind, folderPath);
  const allowedExt = new Set((Array.isArray(options.extensions) ? options.extensions : [".xlsx", ".xls", ".csv", ".zip"]).map((ext) => String(ext).toLowerCase()));
  const maxFiles = Math.max(1, Math.min(Number(options.maxFiles || 80), 200));
  const maxBytes = Math.max(1024, Math.min(Number(options.maxBytes || 15 * 1024 * 1024), 80 * 1024 * 1024));
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const metas = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith("~$")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExt.has(ext)) continue;
    const filePath = path.join(folder, entry.name);
    const stat = await fs.stat(filePath);
    if (stat.size <= 0 || stat.size > maxBytes) continue;
    metas.push({ filename: entry.name, filePath, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  metas.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  const selected = metas.slice(0, maxFiles);
  if (!options.includeBase64 && !options.includeBuffer) return { folder, files: selected };
  const files = [];
  for (const meta of selected) {
    const buffer = await fs.readFile(meta.filePath);
    files.push({ ...meta, ...(options.includeBuffer ? { buffer } : {}), ...(options.includeBase64 ? { base64: buffer.toString("base64") } : {}) });
  }
  return { folder, files };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return header(res, 204), res.end();
  try {
    if (req.method === "GET" && req.url === "/api/local/health") {
      return send(res, 200, { ok: true, message: "local_folder_helper_ready", defaultFolders });
    }
    if (req.method !== "POST") return send(res, 404, { ok: false, message: "not_found" });
    const body = await readJson(req);
    if (req.url === "/api/local/ensure-folder") {
      const folder = await ensureFolder(body.kind, body.folderPath);
      return send(res, 200, { ok: true, folderPath: folder, folderName: path.basename(folder) });
    }
    if (req.url === "/api/local/open-folder") {
      const folder = await ensureFolder(body.kind, body.folderPath);
      const attempts = openFolder(folder);
      return send(res, 200, { ok: true, opened: true, folderPath: folder, folderName: path.basename(folder), attempts });
    }
    if (req.url === "/api/local/save-blob") {
      const folder = await ensureFolder(body.kind, body.folderPath);
      const filename = cleanFilename(body.filename);
      const filePath = path.join(folder, filename);
      const buffer = Buffer.from(String(body.base64 || ""), "base64");
      await fs.writeFile(filePath, buffer);
      return send(res, 200, { ok: true, folderPath: folder, folderName: path.basename(folder), filename, filePath });
    }
    if (req.url === "/api/local/save-many") {
      const folder = await ensureFolder(body.kind, body.folderPath);
      const rawFiles = Array.isArray(body.files) ? body.files : [];
      if (!rawFiles.length) return send(res, 400, { ok: false, message: "저장할 파일이 없습니다." });
      const files = [];
      for (const item of rawFiles) {
        const filename = cleanFilename(item?.filename);
        const filePath = path.join(folder, filename);
        const buffer = Buffer.from(String(item?.base64 || ""), "base64");
        await fs.writeFile(filePath, buffer);
        files.push({ filename, filePath });
      }
      let opened = false;
      let attempts = [];
      if (body.openFolder !== false) {
        try { attempts = openFolder(folder); opened = true; } catch { opened = false; }
      }
      return send(res, 200, { ok: true, folderPath: folder, folderName: path.basename(folder), files, opened, attempts });
    }
    if (req.url === "/api/local/list-files") {
      const { folder, files } = await getFolderFiles(body.kind, body.folderPath, {
        extensions: body.extensions,
        maxFiles: body.maxFiles,
        maxBytes: body.maxBytes,
        includeBase64: body.includeBase64 === true,
      });
      return send(res, 200, { ok: true, folderPath: folder, folderName: path.basename(folder), files });
    }
    if (req.url === "/api/local/read-file") {
      const { folder, filename, filePath } = resolveFileInFolder(body.kind, body.folderPath, body.filename);
      const ext = path.extname(filename).toLowerCase();
      const allowedExt = new Set((Array.isArray(body.extensions) ? body.extensions : [".xlsx", ".xls", ".csv", ".zip"]).map((item) => String(item).toLowerCase()));
      if (!allowedExt.has(ext)) return send(res, 400, { ok: false, message: "허용되지 않은 파일 형식입니다." });
      const stat = await fs.stat(filePath);
      const maxBytes = Math.max(1024, Math.min(Number(body.maxBytes || 25 * 1024 * 1024), 80 * 1024 * 1024));
      if (!stat.isFile() || stat.size <= 0) return send(res, 404, { ok: false, message: "파일을 찾지 못했습니다." });
      if (stat.size > maxBytes) return send(res, 413, { ok: false, message: "파일이 너무 커서 모바일 다운로드 대상에서 제외했습니다." });
      const buffer = await fs.readFile(filePath);
      return send(res, 200, { ok: true, folderPath: folder, folderName: path.basename(folder), filename, size: stat.size, modifiedAt: stat.mtime.toISOString(), base64: buffer.toString("base64") });
    }
    if (req.url === "/api/local/download-zip") {
      const { folder, files } = await getFolderFiles(body.kind, body.folderPath, {
        extensions: body.extensions,
        maxFiles: body.maxFiles || 80,
        maxBytes: body.maxBytes || 25 * 1024 * 1024,
        includeBuffer: true,
      });
      if (!files.length) return send(res, 404, { ok: false, message: "압축할 파일이 없습니다." });
      const zip = makeZipBuffer(files);
      const filename = cleanFilename(body.filename || `${path.basename(folder)}_${new Date().toISOString().slice(0, 10)}.zip`);
      return send(res, 200, { ok: true, folderPath: folder, folderName: path.basename(folder), filename, count: files.length, size: zip.length, base64: zip.toString("base64") });
    }
    return send(res, 404, { ok: false, message: "not_found" });
  } catch (error) {
    return send(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Local folder helper: http://${displayHost}:${port}/api/local/health`);
  console.log(`Default purchase folder: ${defaultFolders.purchase}`);
  console.log(`Unified purchase folder: ${defaultFolders.purchase}`);
});
