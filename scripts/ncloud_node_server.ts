import { createServer, type IncomingHttpHeaders } from "node:http";
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
const port = Number(process.env.PORT || 8791);
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
  console.log(`[NCLOUD] CORS enabled for browser/Tunnel operation (V177)`);
  console.log(`[NCLOUD] persistent settings save fallback enabled (V177, V175-compatible)`);
  console.log(`[NCLOUD] Health check: http://localhost:${port}/api/system/status`);
});
