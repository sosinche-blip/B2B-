import { createServer, type IncomingHttpHeaders } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import worker from "../apps/worker/src/worker";
import type { Env } from "../apps/worker/src/types";

const DEFAULT_ENV: Partial<Env> = {
  APP_ENV: "production",
  DEFAULT_TIMEZONE: "Asia/Seoul",
  TOSS_SHOPPING_BASE_URL: "https://shopping-fep.toss.im",
  TOSS_TOKEN_URL: "https://oauth2.cert.toss.im/token",
  TOSS_SCOPE: "toss-shopping-fep:write",
  TOSS_PARTNER_NAME: "토스쇼핑",
  TOSS_ORDERS_CURSOR_PARAM: "nextCursor",
  TOSS_ORDER_MAX_PAGES: "20",
  COUPANG_ORDERS_PATH: "/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets",
  COUPANG_SHIPMENT_UPLOAD_PATH: "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/orders/invoices",
  COUPANG_VENDOR_ITEM_INVENTORY_PATH: "/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/{vendorItemId}/inventories",
  COUPANG_ORDER_ACK_PATH: "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets/acknowledgement",
  COUPANG_COUPON_CREATE_PATH: "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupon",
  COUPANG_COUPON_APPLY_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items",
  COUPANG_COUPON_CANCEL_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}",
  COUPANG_COUPON_REQUEST_STATUS_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/requested/{requestedId}",
  COUPANG_COUPON_CONTRACT_LIST_PATH: "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/contract/list",
  COUPANG_COUPON_LIST_PATH: "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupons",
  COUPANG_COUPON_ITEM_LIST_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items",
  COUPANG_COUPON_MAX_DISCOUNT_PRICE: "100000",
  COUPANG_COUPON_WOW_EXCLUSIVE: "false",
  TOSS_ORDERS_PATH: "/api/v3/shopping-fep/orders/v2",
  TOSS_ORDER_STATUS_PATH: "/api/v3/shopping-fep/orders/products/status",
  TOSS_SHIPMENT_UPLOAD_PATH: "/api/v3/shopping-fep/orders/products/delivery",
  API_CONNECTION_PAUSED: "false",
  ALLOW_LIVE_EXTERNAL_API: "true",
  ALLOW_FINAL_EXECUTION: "true",
  ALLOW_SCHEDULED_WRITES: "true",
  SCHEDULER_MATCH_WINDOW_MINUTES: "0",
  STORAGE_AUDIT_LOG_RETENTION_DAYS: "30",
};

const env = { ...DEFAULT_ENV, ...process.env, NCLOUD_SERVER_MODE: "true" } as unknown as Env;
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";

function copyRequestHeaders(headers: IncomingHttpHeaders) {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const inner of value) out.append(key, inner);
    } else {
      out.set(key, value);
    }
  }
  return out;
}


const NCLOUD_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-requested-with",
  "access-control-max-age": "86400",
};

function applyNcloudCors(outgoing: Parameters<Parameters<typeof createServer>[0]>[1]) {
  for (const [key, value] of Object.entries(NCLOUD_CORS_HEADERS)) outgoing.setHeader(key, value);
}



const SERVER_FILE_ROOT = process.env.B2B_SERVER_FILE_ROOT || path.join(os.homedir(), "B2B_발주폴더");
const LOCAL_FILE_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".zip"]);

function cleanManagedFilename(value: unknown) {
  return String(value || "file.xlsx")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 160);
}

function managedFolderPath(input: unknown) {
  const raw = String(input || "").trim();
  // 브라우저에 남은 Windows 로컬경로는 Linux Ncloud에서 사용하지 않습니다.
  if (!raw || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
    return path.resolve(SERVER_FILE_ROOT);
  }
  const resolved = path.resolve(raw.replace(/^~(?=$|[\\/])/, os.homedir()));
  const home = path.resolve(os.homedir());
  return resolved.startsWith(home + path.sep) || resolved === home
    ? resolved
    : path.resolve(SERVER_FILE_ROOT);
}

async function ensureManagedFolder(input: unknown) {
  const folder = managedFolderPath(input);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

function jsonNodeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function listManagedFiles(folder: string, body: Record<string, unknown>) {
  const allowed = new Set(
    (Array.isArray(body.extensions) ? body.extensions : Array.from(LOCAL_FILE_EXTENSIONS))
      .map((value) => String(value).toLowerCase()),
  );
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || 80), 200));
  const maxBytes = Math.max(1024, Math.min(Number(body.maxBytes || 25 * 1024 * 1024), 80 * 1024 * 1024));
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const files: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith("~$")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowed.has(ext)) continue;
    const filePath = path.join(folder, entry.name);
    const stat = await fs.stat(filePath);
    if (stat.size <= 0 || stat.size > maxBytes) continue;
    files.push({ filename: entry.name, filePath, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  files.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  const selected = files.slice(0, maxFiles);
  if (body.includeBase64 === true) {
    for (const item of selected) {
      const buffer = await fs.readFile(String(item.filePath));
      item.base64 = buffer.toString("base64");
    }
  }
  return selected;
}

async function handleManagedFolderApi(reqUrl: URL, method: string, bodyBuffer?: Buffer) {
  if (!reqUrl.pathname.startsWith("/api/local/")) return null;
  if (method === "GET" && reqUrl.pathname === "/api/local/health") {
    const folder = await ensureManagedFolder("");
    return jsonNodeResponse({ ok: true, mode: "ncloud_managed_purchase_folder_v182", folderPath: folder });
  }
  if (method !== "POST") return jsonNodeResponse({ ok: false, message: "not_found" }, 404);
  let body: Record<string, unknown> = {};
  try {
    body = bodyBuffer?.length ? JSON.parse(bodyBuffer.toString("utf8")) : {};
  } catch {
    return jsonNodeResponse({ ok: false, message: "JSON 요청을 읽지 못했습니다." }, 400);
  }
  const folder = await ensureManagedFolder(body.folderPath);
  const base = { ok: true, folderPath: folder, folderName: path.basename(folder) };
  if (reqUrl.pathname === "/api/local/ensure-folder" || reqUrl.pathname === "/api/local/open-folder") {
    return jsonNodeResponse({ ...base, opened: false, serverManaged: true });
  }
  if (reqUrl.pathname === "/api/local/save-many") {
    const rawFiles = Array.isArray(body.files) ? body.files as Array<Record<string, unknown>> : [];
    if (!rawFiles.length) return jsonNodeResponse({ ok: false, message: "저장할 파일이 없습니다." }, 400);
    const saved = [];
    for (const item of rawFiles) {
      const filename = cleanManagedFilename(item.filename);
      const buffer = Buffer.from(String(item.base64 || ""), "base64");
      if (!buffer.length) continue;
      const filePath = path.join(folder, filename);
      await fs.writeFile(filePath, buffer);
      saved.push({ filename, filePath });
    }
    return jsonNodeResponse({ ...base, files: saved, opened: false, serverManaged: true });
  }
  if (reqUrl.pathname === "/api/local/list-files") {
    const files = await listManagedFiles(folder, body);
    return jsonNodeResponse({ ...base, files, serverManaged: true });
  }
  if (reqUrl.pathname === "/api/local/read-file") {
    const filename = cleanManagedFilename(body.filename);
    const filePath = path.resolve(path.join(folder, filename));
    if (!filePath.startsWith(folder + path.sep)) return jsonNodeResponse({ ok: false, message: "허용되지 않은 파일 경로입니다." }, 400);
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    return jsonNodeResponse({ ...base, filename, size: stat.size, modifiedAt: stat.mtime.toISOString(), base64: buffer.toString("base64") });
  }
  return jsonNodeResponse({ ok: false, message: "not_found" }, 404);
}

const executionContext = {
  waitUntil(promise: Promise<unknown>) {
    promise.catch((error) => console.error("Background task failed", error));
  },
  passThroughOnException() {
    // Cloudflare Workers compatibility shim for Node server mode.
  },
} as ExecutionContext;

const server = createServer(async (incoming, outgoing) => {
  try {
    applyNcloudCors(outgoing);
    if ((incoming.method || "GET").toUpperCase() === "OPTIONS") {
      outgoing.statusCode = 204;
      outgoing.end();
      return;
    }
    const method = incoming.method || "GET";
    const reqUrl = new URL(incoming.url || "/", `http://${incoming.headers.host || `localhost:${port}`}`);
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    if (reqUrl.pathname.startsWith("/api/local/")) {
      const response = jsonNodeResponse({ ok: false, message: "V183부터 파일 저장은 Cloudflare R2에서 처리합니다. Ncloud는 고정 IP API 게이트웨이만 담당합니다." }, 410);
      outgoing.statusCode = response.status;
      response.headers.forEach((value: string, key: string) => outgoing.setHeader(key, value));
      applyNcloudCors(outgoing);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    const request = new Request(reqUrl.toString(), {
      method,
      headers: copyRequestHeaders(incoming.headers),
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });

    const response = await (worker as any).fetch(request, env, executionContext);
    outgoing.statusCode = response.status;
    response.headers.forEach((value: string, key: string) => outgoing.setHeader(key, value));
    applyNcloudCors(outgoing);
    const responseBody = Buffer.from(await response.arrayBuffer());
    outgoing.end(responseBody);
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "application/json; charset=utf-8");
    applyNcloudCors(outgoing);
    outgoing.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  }
});

server.listen(port, host, () => {
  console.log(`[NCLOUD] API server listening on http://${host}:${port}`);
  console.log(`[NCLOUD] CORS enabled for Worker/browser operation (V182)`);
  console.log(`[NCLOUD] persistent settings save fallback enabled (V177, V175-compatible)`);
  console.log(`[NCLOUD] Health check: http://localhost:${port}/api/system/status`);
});
