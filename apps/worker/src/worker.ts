import type { Env } from "./types";
import { jsonResponse, readJson } from "./lib/http";
import { supabaseAdmin } from "./lib/supabase";

type SimpleTempPayload = {
  sessionKey?: string;
  expiresInHours?: number;
  data?: Record<string, unknown>;
};

type PersistentSettingsPayload = {
  settingsKey?: string;
  data?: Record<string, unknown>;
};

type OperationLogPayload = {
  eventType?: string;
  payload?: Record<string, unknown>;
};

const SERVER_OPERATION_SQL_FILE =
  "supabase/migrations/20260705_v58_server_operation_schema.sql";

const SERVER_REQUIRED_APIS = [
  {
    feature: "현재 API 호출 IP 확인",
    method: "GET",
    path: "/api/system/public-ip",
  },
  {
    feature: "서버 운영점검",
    method: "GET",
    path: "/api/system/server-operation-check",
  },
  {
    feature: "운영로그 저장",
    method: "POST",
    path: "/api/operation/logs/save",
  },
  {
    feature: "최근 운영로그 확인",
    method: "GET",
    path: "/api/operation/logs/latest",
  },
  {
    feature: "Supabase 연결 확인",
    method: "GET",
    path: "/api/system/connection-check",
  },
];

const SERVER_REQUIRED_TABLES = [
  {
    table: "operation_temp_sessions",
    purpose: "주문·송장 등 당일 작업자료 1일 임시보관",
  },
  {
    table: "operation_persistent_settings",
    purpose: "매핑·양식·쿠폰 설정 영구보관",
  },
  {
    table: "operation_audit_logs",
    purpose: "서버 운영점검 및 수동 운영기록 저장",
  },
];

const DEFAULT_ORDER_COLLECT_LOOKBACK_DAYS = 7;
const COUPANG_DEFAULT_MAX_RETRIES = 4;
const COUPANG_DEFAULT_RETRY_BASE_MS = 850;
const COUPANG_DEFAULT_DAY_SPLIT_DELAY_MS = 250;

const COUPANG_DEFAULT_VENDOR_ITEM_INVENTORY_PATH =
  "/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/{vendorItemId}/inventories";
const COUPANG_DEFAULT_COUPON_CREATE_PATH =
  "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupon";
const COUPANG_DEFAULT_COUPON_ITEM_CREATE_PATH =
  "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items";
const COUPANG_DEFAULT_COUPON_EXPIRE_PATH =
  "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}";
const COUPANG_DEFAULT_COUPON_REQUEST_STATUS_PATH =
  "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/requested/{requestedId}";
const COUPANG_DEFAULT_COUPON_CONTRACT_LIST_PATH =
  "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/contract/list";
const COUPANG_DEFAULT_COUPON_LIST_PATH =
  "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupons";
const COUPANG_DEFAULT_COUPON_ITEM_LIST_PATH =
  "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items";
const COUPANG_DEFAULT_ORDER_ACK_PATH =
  "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets/acknowledgement";
const COUPANG_DEFAULT_SHIPMENT_UPLOAD_PATH =
  "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/orders/invoices";
const TOSS_DEFAULT_ORDERS_PATH = "/api/v3/shopping-fep/orders/v2";
const TOSS_DEFAULT_ORDER_STATUS_PATH = "/api/v3/shopping-fep/orders/products/status";
const TOSS_DEFAULT_SHIPMENT_DELIVERY_PATH = "/api/v3/shopping-fep/orders/products/delivery";
const TOSS_DEFAULT_MAX_PAGES = 20;

type RollingCouponTemplate = {
  id?: string;
  enabled?: boolean;
  sourceCouponId?: string;
  latestCouponId?: string;
  contractId?: string;
  couponName?: string;
  discountType?: "금액" | "율" | "";
  discountValue?: number;
  options?: Array<Record<string, unknown>>;
  lastGeneratedCouponId?: string;
  lastGeneratedAt?: string;
  lastCanceledAt?: string;
};

type CouponApiSettings = {
  selectedContractId?: string;
  selectedCouponId?: string;
  selectedCouponStatus?: string;
  selectedCouponName?: string;
  selectedCouponStartAt?: string;
  selectedCouponEndAt?: string;
  selectedMode?: "existing" | "new" | "daily_new" | "";
  sourceCouponId?: string;
  sourceDiscountType?: "금액" | "율" | "";
  sourceDiscountValue?: number;
  selectedCouponProductFilter?: string;
  lastGeneratedCouponIds?: string[];
  lastGeneratedCouponId?: string;
  lastGeneratedAt?: string;
  lastCancelCouponIds?: string[];
  lastCanceledAt?: string;
  dailyRollingEnabled?: boolean;
  rollingTemplates?: RollingCouponTemplate[];
};

type PreviewBody = Record<string, unknown> & {
  channel?: "쿠팡" | "토스" | "coupang" | "toss";
  action?: "cancel" | "apply";
  rows?: unknown[];
  schedules?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | null | undefined>;
  manual?: boolean;
  diagnosticOnly?: boolean;
  couponApiSettings?: CouponApiSettings;
};

function isEnabled(env: Env, key: keyof Env) {
  return String(env[key] ?? "").toLowerCase() === "true";
}

type ExternalDiagnosticStep = {
  step: string;
  status: "준비" | "정상" | "오류" | "건너뜀";
  detail: string;
};

type ExternalRequestInfo = {
  method: string;
  baseUrl?: string;
  path: string;
  queryKeys: string[];
};

type ExternalApiResult = {
  ok: boolean;
  status: number;
  data: unknown;
  request?: ExternalRequestInfo;
  diagnostics?: ExternalDiagnosticStep[];
  phase?: string;
};

function safeText(value: unknown, max = 260) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function redactDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[DEPTH_LIMIT]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return safeText(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => redactDiagnosticValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    if (/token|secret|authorization|access[-_]?key|client[-_]?secret|service[-_]?role/i.test(key)) {
      out[key] = "[MASKED]";
    } else {
      out[key] = redactDiagnosticValue(inner, depth + 1);
    }
  }
  return out;
}

function diagnosticPreview(data: unknown) {
  if (data === null || data === undefined) return null;
  const redacted = redactDiagnosticValue(data);
  if (typeof redacted === "string") return safeText(redacted, 500);
  return redacted;
}

function diagnosticMessage(data: unknown) {
  if (!data || typeof data !== "object") return safeText(data, 260);
  const obj = data as Record<string, unknown>;
  for (const key of ["message", "error_description", "errorDescription", "reason", "error", "errorCode", "code"]) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim()) return safeText(value, 260);
  }
  const nested = obj.success || obj.data || obj.result;
  if (nested && typeof nested === "object") return diagnosticMessage(nested);
  return safeText(JSON.stringify(diagnosticPreview(data)), 260);
}

function rootKeySummary(data: unknown, max = 20) {
  if (Array.isArray(data)) return `array(length=${data.length})`;
  if (!data || typeof data !== "object") return typeof data;
  return Object.keys(data as Record<string, unknown>).slice(0, max).join(", ") || "object(no keys)";
}

function tossBusinessErrorMessage(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const obj = data as Record<string, unknown>;
  const resultType = String(obj.resultType || obj.status || "").toUpperCase();
  const successValue = obj.success;
  const errorValue = obj.error;
  const successLooksFalse = successValue === false || resultType === "FAIL" || resultType === "FAILED" || resultType === "ERROR";
  if (!successLooksFalse && !errorValue) return "";
  const message = diagnosticMessage(errorValue || data);
  return message && message !== "{}" ? message : "HTTP 200 응답 안에 토스 비즈니스 오류 필드가 있습니다.";
}

function queryValueIsAll(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return !text || ["all", "전체", "none", "null", "undefined", "미지정", "전체조회"].includes(text);
}

const PROXY_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-requested-with",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function isNcloudServerMode(env: Env) {
  return String(env.NCLOUD_SERVER_MODE || "").toLowerCase() === "true";
}

const DEFAULT_NCLOUD_FIXED_IP_API_BASE = "http://101.79.27.234.sslip.io:8080";

function cleanProxyBase(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function withProxyCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(PROXY_CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function maybeProxyToNcloud(request: Request, env: Env) {
  if (isNcloudServerMode(env)) return null;
  // V179 final: use the fixed Ncloud DNS hostname because Worker subrequests to a raw IP can return Cloudflare 1003.
  const base = cleanProxyBase(env.NCLOUD_API_BASE) || DEFAULT_NCLOUD_FIXED_IP_API_BASE;
  const incomingUrl = new URL(request.url);
  const fixedIpPaths = [
    "/api/integrations/",
    "/api/system/public-ip",
    "/api/system/status",
    "/api/system/server-operation-check",
    "/api/scheduler/tick",
    "/api/scheduler/run-preview",
  ];
  const requiresFixedIp = fixedIpPaths.some((path) => incomingUrl.pathname === path || incomingUrl.pathname.startsWith(path));
  if (incomingUrl.pathname.startsWith("/api/") && !requiresFixedIp) return null;
  if (!incomingUrl.pathname.startsWith("/api/")) {
    return jsonResponse({
      ok: true,
      mode: "cloudflare_worker_to_ncloud_fixed_ip_gateway_v186",
      ncloudApiBase: base,
      message: "Cloudflare Worker uses R2/Supabase for cloud storage and routes fixed-IP marketplace API calls through Ncloud.",
    });
  }
  const target = new URL(base);
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  headers.set("x-b2b-proxy", "cloudflare-worker-to-ncloud-fixed-ip-v186");
  try {
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
    const upstreamContentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok && !upstreamContentType.toLowerCase().includes("application/json")) {
      const bodyPreview = (await upstream.text()).trim().replace(/\s+/g, " ").slice(0, 300);
      return jsonResponse({
        ok: false,
        mode: "cloudflare_worker_to_ncloud_origin_error_v186",
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        target: target.toString(),
        message: upstream.status === 521
          ? "Ncloud API 서버에 연결할 수 없습니다. 서버 프로세스가 0.0.0.0:8080에서 실행 중인지와 Ncloud ACG의 TCP 8080 허용 여부를 확인하세요."
          : `Ncloud 원본 서버가 HTTP ${upstream.status} ${upstream.statusText}를 반환했습니다.`,
        upstreamPreview: bodyPreview,
      }, { status: 503 });
    }
    return withProxyCors(upstream);
  } catch (error) {
    return jsonResponse({
      ok: false,
      mode: "cloudflare_worker_to_ncloud_origin_fetch_error_v186",
      target: target.toString(),
      message: "Ncloud API 서버 연결에 실패했습니다. 서버 프로세스, 8080 포트, ACG 규칙을 확인하세요.",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503 });
  }
}

function arrayPathSummaries(data: unknown, max = 12) {
  const out: string[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (out.length >= max || depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      out.push(`${path || "root"}:array(${value.length})`);
      if (value.length) visit(value[0], `${path || "root"}[0]`, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|authorization|access[-_]?key|client[-_]?secret|service[-_]?role/i.test(key)) continue;
      visit(inner, path ? `${path}.${key}` : key, depth + 1);
      if (out.length >= max) return;
    }
  };
  visit(data, "", 0);
  return out.join(", ") || "array path 없음";
}

function containsText(value: unknown, pattern: RegExp): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return pattern.test(String(value));
  }
  if (Array.isArray(value)) return value.some((item) => containsText(item, pattern));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((inner) =>
      containsText(inner, pattern),
    );
  }
  return false;
}

function externalErrorKind(result: ExternalApiResult) {
  if (result.status === 403 && containsText(result.data, /ip address|not allowed|FORBIDDEN/i)) {
    return "IP_NOT_ALLOWED";
  }
  if (result.status === 401) return "AUTH_REQUIRED";
  if (result.status === 400) return "BAD_REQUEST";
  return "EXTERNAL_ERROR";
}

function handledExternalHttpStatus(result: ExternalApiResult, diagnosticOnly?: boolean) {
  if (result.ok || diagnosticOnly) return 200;
  // 외부 API가 정상적으로 응답한 오류는 앱/Worker 장애가 아니므로 200으로 반환해
  // 화면에 진단표와 조치사항을 안정적으로 표시합니다.
  if (result.status >= 400 && result.status < 500) return 200;
  return 502;
}

function findAccessToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  for (const key of ["access_token", "accessToken", "token", "bearerToken"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const key of ["success", "data", "result"]) {
    const value = obj[key];
    const nested = findAccessToken(value);
    if (nested) return nested;
  }
  return "";
}

function dateOnly(value: unknown) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function todayDateText() {
  // Runtime timezone can be UTC. Use KST date so the default 7-day Coupang/Toss range does not shift by one day.
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function utcDateMs(date: string) {
  const safe = dateOnly(date);
  if (!safe) return NaN;
  const [year, month, day] = safe.split("-").map((part) => Number(part));
  if (!year || !month || !day) return NaN;
  return Date.UTC(year, month - 1, day);
}

function defaultCollectDateRange(days = DEFAULT_ORDER_COLLECT_LOOKBACK_DAYS) {
  const safeDays = Math.max(1, Math.min(31, Math.floor(days)));
  const endMs = utcDateMs(todayDateText());
  const startMs = endMs - (safeDays - 1) * 24 * 60 * 60 * 1000;
  return {
    startDate: new Date(startMs).toISOString().slice(0, 10),
    endDate: new Date(endMs).toISOString().slice(0, 10),
  };
}

function coupangLegacyDateTime(date: string, boundary: "start" | "end") {
  const safeDate = dateOnly(date) || todayDateText();
  return `${safeDate}T${boundary === "start" ? "00:00" : "23:59"}+09:00`;
}

function coupangMinuteDateTime(date: string, boundary: "start" | "end") {
  const safeDate = dateOnly(date) || todayDateText();
  return `${safeDate}T${boundary === "start" ? "00:00" : "23:59"}`;
}

function coupangDailyDateParam(date: string, withKstOffset = false) {
  const safeDate = dateOnly(date) || todayDateText();
  return withKstOffset ? `${safeDate}+09:00` : safeDate;
}

function coupangOrdersPath(env: Env) {
  // Primary path is the endpoint that was used in the previously working collection versions.
  // Fallback strategies below can still try the v5 daily-paging endpoint without changing .dev.vars.
  return String(env.COUPANG_ORDERS_PATH || "").trim() || "/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets";
}

function coupangOrdersPathVariant(rawPath: string, version: "v4" | "v5") {
  const fallback = "/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets";
  const path = String(rawPath || fallback).trim() || fallback;
  return version === "v4"
    ? path.replace("/apis/api/v5/", "/apis/api/v4/")
    : path.replace("/apis/api/v4/", "/apis/api/v5/");
}

function explicitAllStatus(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return ["all", "전체", "none", "null", "undefined", "미지정", "전체조회"].includes(text);
}

function coupangStatusList(body: PreviewBody, env: Env) {
  const sourceStatus = (body.query || {}).status;
  const envStatus = env.COUPANG_ORDER_COLLECT_STATUS;
  const raw = sourceStatus !== undefined && sourceStatus !== null && String(sourceStatus).trim()
    ? String(sourceStatus).trim()
    : String(envStatus || "INSTRUCT").trim();
  if (explicitAllStatus(raw)) return ["ACCEPT", "INSTRUCT"];
  return [raw || "INSTRUCT"];
}

function coupangNextToken(data: unknown) {
  const flat = flattenObject(data);
  return firstText(flat, ["data.nextToken", "nextToken", "result.nextToken", "success.nextToken", "pagination.nextToken", "page.nextToken"]);
}

function tossNextCursor(data: unknown) {
  const flat = flattenObject(data);
  return firstText(flat, ["success.nextCursor", "nextCursor", "data.nextCursor", "result.nextCursor", "pagination.nextCursor", "page.nextCursor"]);
}

function normalizeOrderQuery(channel: "쿠팡" | "토스", body: PreviewBody, env: Env) {
  const source = body.query || {};
  const ignoreDate = Boolean(source.ignoreDate || source.dateAgnostic || source.shipmentTarget);
  const defaultRange = defaultCollectDateRange();
  const startDate = dateOnly(source.startDate || source.startTime || source.createdAtFrom) || defaultRange.startDate;
  const endDate = dateOnly(source.endDate || source.endTime || source.createdAtTo) || defaultRange.endDate;
  if (channel === "쿠팡") {
    const query: Record<string, string | number | boolean | null | undefined> = {
      searchType: String(source.searchType || "timeFrame"),
      status: source.status || env.COUPANG_ORDER_COLLECT_STATUS || "INSTRUCT",
    };
    if (!ignoreDate) {
      query.createdAtFrom = coupangLegacyDateTime(startDate, "start");
      query.createdAtTo = coupangLegacyDateTime(endDate, "end");
    }
    return query;
  }
  const status = queryValueIsAll(source.status) ? "" : String(source.status || "").trim();
  const limit = envNumber(source.limit, 50, 1, 50);
  const partnerName = String(source.partnerName || env.TOSS_PARTNER_NAME || "").trim();
  return {
    ...(ignoreDate ? {} : { startDate, endDate }),
    limit,
    ...(partnerName ? { partnerName } : {}),
    ...(status ? { status } : {}),
    ...(source.nextCursor ? { nextCursor: source.nextCursor } : {}),
  } as Record<string, string | number | boolean | null | undefined>;
}


function dateRangeList(startDate: string, endDate: string, maxDays = 31) {
  const fallback = defaultCollectDateRange();
  const start = dateOnly(startDate) || fallback.startDate;
  const end = dateOnly(endDate) || fallback.endDate;
  const startMs = utcDateMs(start);
  const endMs = utcDateMs(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [start];
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  const days: string[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let cursor = from; cursor <= to && days.length < maxDays; cursor += dayMs) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days.length ? days : [start];
}

function isMultiDayCoupangQuery(body: PreviewBody) {
  const source = body.query || {};
  if (source.ignoreDate || source.dateAgnostic || source.shipmentTarget) return false;
  const fallback = defaultCollectDateRange();
  const startDate = dateOnly(source.startDate || source.startTime || source.createdAtFrom) || fallback.startDate;
  const endDate = dateOnly(source.endDate || source.endTime || source.createdAtTo) || fallback.endDate;
  return startDate !== endDate;
}

function coupangRangeDates(body: PreviewBody) {
  const source = body.query || {};
  const fallback = defaultCollectDateRange();
  const startDate = dateOnly(source.startDate || source.startTime || source.createdAtFrom) || fallback.startDate;
  const endDate = dateOnly(source.endDate || source.endTime || source.createdAtTo) || fallback.endDate;
  return dateRangeList(startDate, endDate, 31);
}

function withCoupangSingleDateQuery(body: PreviewBody, day: string, status?: string, nextToken?: string): PreviewBody {
  return {
    ...body,
    query: {
      ...(body.query || {}),
      startDate: day,
      endDate: day,
      createdAtFrom: day,
      createdAtTo: day,
      status: status || (body.query || {}).status,
      ...(nextToken ? { nextToken } : {}),
    },
  };
}

type CoupangOrderStrategyId =
  | "v5_daily_kst"
  | "v5_daily_date"
  | "legacy_v4_timeframe"
  | "v4_start_end";

type CoupangOrderStrategy = {
  id: CoupangOrderStrategyId;
  label: string;
  version: "v4" | "v5";
  paged: boolean;
};

const COUPANG_ORDER_STRATEGIES: CoupangOrderStrategy[] = [
  {
    id: "v5_daily_kst",
    label: "v5 일단위 +09:00",
    version: "v5",
    paged: true,
  },
  {
    id: "v5_daily_date",
    label: "v5 일단위 날짜",
    version: "v5",
    paged: true,
  },
  {
    id: "legacy_v4_timeframe",
    label: "v4 timeFrame",
    version: "v4",
    paged: false,
  },
  {
    id: "v4_start_end",
    label: "v4 startTime/endTime",
    version: "v4",
    paged: false,
  },
];

function coupangOrderQueryForStrategy(
  strategy: CoupangOrderStrategy,
  day: string,
  status: string,
  env: Env,
  body: PreviewBody,
  nextToken = "",
): Record<string, string | number | boolean | null | undefined> {
  const source = body.query || {};
  const maxPerPage = envNumber(source.maxPerPage || source.limit, 50, 1, 50);
  if (strategy.id === "legacy_v4_timeframe") {
    return {
      searchType: String(source.searchType || "timeFrame"),
      status: status || env.COUPANG_ORDER_COLLECT_STATUS || "ACCEPT",
      createdAtFrom: coupangLegacyDateTime(day, "start"),
      createdAtTo: coupangLegacyDateTime(day, "end"),
    };
  }
  if (strategy.id === "v4_start_end") {
    return {
      searchType: String(source.searchType || "timeFrame"),
      status: status || env.COUPANG_ORDER_COLLECT_STATUS || "ACCEPT",
      startTime: coupangMinuteDateTime(day, "start"),
      endTime: coupangMinuteDateTime(day, "end"),
    };
  }
  return {
    status: status || env.COUPANG_ORDER_COLLECT_STATUS || "ACCEPT",
    createdAtFrom: coupangDailyDateParam(day, strategy.id === "v5_daily_kst"),
    createdAtTo: coupangDailyDateParam(day, strategy.id === "v5_daily_kst"),
    maxPerPage,
    ...(nextToken ? { nextToken } : {}),
  };
}
function dedupeStandardOrders(rows: unknown[]) {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const row of rows) {
    const record = objectRecord(row);
    const key = [
      displayText(record.channel),
      displayText(record.orderNo),
      displayText(record.optionId),
      displayText(record.productName),
      displayText(record.receiverName),
      displayText(record.address),
      displayText(record.qty),
    ].join("|");
    const fallback = JSON.stringify(record);
    const finalKey = key.replace(/\|/g, "") ? key : fallback;
    if (seen.has(finalKey)) continue;
    seen.add(finalKey);
    out.push(row);
  }
  return out;
}

type CoupangStrategyRun = {
  strategy: CoupangOrderStrategy;
  ok: boolean;
  status: number;
  rows: unknown[];
  results: ExternalApiResult[];
  diagnostics: ExternalDiagnosticStep[];
};

function mergeStrategyResults(run: CoupangStrategyRun): ExternalApiResult {
  return combinedExternalResult(run.results, run.rows, run.diagnostics);
}

async function runCoupangOrderStrategyForDay(
  env: Env,
  body: PreviewBody,
  rawPath: string,
  day: string,
  status: string,
  strategy: CoupangOrderStrategy,
  maxPages: number,
): Promise<CoupangStrategyRun> {
  const path = coupangOrdersPathVariant(rawPath, strategy.version);
  const rows: unknown[] = [];
  const results: ExternalApiResult[] = [];
  const diagnostics: ExternalDiagnosticStep[] = [];
  let nextToken = "";
  const pageLimit = strategy.paged ? maxPages : 1;

  for (let page = 1; page <= pageLimit; page += 1) {
    const query = coupangOrderQueryForStrategy(strategy, day, status, env, body, nextToken);
    const result = await coupangSignedRequestWithRetry(env, "GET", path, query);
    const pageRows = normalizedOrdersFromExternal(result.data, "쿠팡");
    const tokenAfter = result.ok && strategy.paged ? coupangNextToken(result.data) : "";
    results.push(result);
    rows.push(...pageRows);
    diagnostics.push({
      step: `쿠팡 ${day} ${status} ${strategy.label}${strategy.paged ? ` ${page}페이지` : ""}`,
      status: result.ok ? "정상" : "오류",
      detail: result.ok
        ? `HTTP ${result.status}, 표준 주문행 ${pageRows.length}건${tokenAfter ? ", 다음 페이지 있음" : ""}`
        : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
    });
    if (!result.ok || !tokenAfter) break;
    nextToken = tokenAfter;
    await waitBetweenCoupangDayRequests(env);
  }

  const failed = results.find((result) => !result.ok);
  return {
    strategy,
    ok: !failed,
    status: failed?.status || results[results.length - 1]?.status || 0,
    rows: dedupeStandardOrders(rows),
    results,
    diagnostics,
  };
}

async function collectCoupangOrdersForDayStatus(
  env: Env,
  body: PreviewBody,
  rawPath: string,
  day: string,
  status: string,
  maxPages: number,
) {
  const runs: CoupangStrategyRun[] = [];
  for (const strategy of COUPANG_ORDER_STRATEGIES) {
    const run = await runCoupangOrderStrategyForDay(env, body, rawPath, day, status, strategy, maxPages);
    runs.push(run);
    if (run.ok && run.rows.length > 0) break;
    const kind = externalErrorKind(mergeStrategyResults(run));
    if (kind === "AUTH_REQUIRED" || kind === "IP_NOT_ALLOWED") break;
    await waitBetweenCoupangDayRequests(env);
  }

  const successfulWithRows = runs.filter((run) => run.ok && run.rows.length > 0);
  const selected = successfulWithRows.sort((a, b) => b.rows.length - a.rows.length)[0]
    || runs.find((run) => run.ok)
    || runs[runs.length - 1];
  const selectedResult = mergeStrategyResults(selected);
  const summaryDetail = runs
    .map((run) => `${run.strategy.label}:${run.ok ? `HTTP ${run.status}, ${run.rows.length}건` : `HTTP ${run.status}`}`)
    .join(" / ");
  const diagnostics: ExternalDiagnosticStep[] = [
    {
      step: `쿠팡 ${day} ${status} 선택방식`,
      status: selected.ok ? "정상" : "오류",
      detail: `${selected.strategy.label} / 표준 주문행 ${selected.rows.length}건 / 시도요약 ${summaryDetail}`,
    },
    ...selected.diagnostics,
    ...mergeExternalDiagnostics(selected.results),
  ];
  selectedResult.diagnostics = diagnostics;
  selectedResult.data = selected.rows;
  selectedResult.ok = selected.ok;
  selectedResult.status = selected.status;
  return selectedResult;
}

function mergeExternalDiagnostics(results: ExternalApiResult[]) {
  const diagnostics: ExternalDiagnosticStep[] = [];
  for (const result of results) diagnostics.push(...(result.diagnostics || []));
  return diagnostics;
}

function combinedExternalResult(results: ExternalApiResult[], data: unknown[], diagnostics: ExternalDiagnosticStep[]): ExternalApiResult {
  const firstFailed = results.find((item) => !item.ok);
  const last = results[results.length - 1];
  return {
    ok: !firstFailed,
    status: firstFailed?.status || last?.status || 200,
    data,
    request: last?.request,
    diagnostics,
    phase: firstFailed?.phase || last?.phase || 'order',
  };
}

function apiConnectionPaused(env: Env) {
  const value = env.API_CONNECTION_PAUSED;
  if (value === undefined || value === null || String(value).trim() === "") return true;
  return String(value).trim().toLowerCase() !== "false";
}

function liveExecutionAllowed(env: Env) {
  if (apiConnectionPaused(env)) return false;
  return (
    isEnabled(env, "ALLOW_LIVE_EXTERNAL_API") &&
    isEnabled(env, "ALLOW_FINAL_EXECUTION")
  );
}

function scheduledWritesAllowed(env: Env) {
  return isEnabled(env, "ALLOW_SCHEDULED_WRITES");
}

function supabaseConfigured(env: Env) {
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    !String(env.SUPABASE_URL).includes("example"),
  );
}

function coupangConfigured(env: Env) {
  return Boolean(
    env.COUPANG_VENDOR_ID &&
    env.COUPANG_ACCESS_KEY &&
    env.COUPANG_SECRET_KEY &&
    !String(env.COUPANG_ACCESS_KEY).includes("여기에"),
  );
}

function tossConfigured(env: Env) {
  return Boolean(
    (env.TOSS_SHOPPING_API_KEY ||
      (env.TOSS_CLIENT_ID && env.TOSS_CLIENT_SECRET)) &&
    !String(env.TOSS_CLIENT_ID || env.TOSS_SHOPPING_API_KEY || "").includes(
      "여기에",
    ),
  );
}


function requestClientIp(request: Request) {
  for (const header of [
    "cf-connecting-ip",
    "x-forwarded-for",
    "x-real-ip",
    "fastly-client-ip",
  ]) {
    const value = request.headers.get(header);
    if (value && value.trim()) return value.split(",")[0].trim();
  }
  return "";
}

function isIpText(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value.trim()) || /^[0-9a-f:]{8,}$/i.test(value.trim());
}

async function readPublicIpFromService(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json,text/plain,*/*" },
  });
  const text = await response.text();
  let ip = "";
  try {
    const data = text ? JSON.parse(text) : null;
    ip = String(data?.ip || data?.address || data?.origin || "").trim();
  } catch {
    ip = text.trim().split(/\s+/)[0] || "";
  }
  return { ok: response.ok && Boolean(ip), status: response.status, ip, url };
}

async function publicIpCheck(request: Request, env: Env) {
  const clientIp = requestClientIp(request);
  const services = [
    env.PUBLIC_IP_CHECK_URL || "https://api.ipify.org?format=json",
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
  ];
  const tried: Array<{ source: string; status: string; detail: string }> = [];
  let outboundIp = "";
  let outboundSource = "";
  for (const service of services) {
    try {
      const result = await readPublicIpFromService(service);
      tried.push({
        source: service,
        status: result.ok ? "정상" : "확인필요",
        detail: result.ip ? `HTTP ${result.status}, IP ${result.ip}` : `HTTP ${result.status}, IP 응답 없음`,
      });
      if (result.ok && result.ip && isIpText(result.ip)) {
        outboundIp = result.ip;
        outboundSource = service;
        break;
      }
    } catch (error) {
      tried.push({ source: service, status: "확인필요", detail: String(error) });
    }
  }
  const rows = [
    {
      item: "현재 API 호출 공인 IP",
      status: outboundIp ? "확인" : "확인필요",
      detail: outboundIp
        ? `${outboundIp} / 쿠팡·토스 자체개발 또는 Open API 허용 IP에 등록하세요.`
        : "외부 IP 확인 서비스 호출에 실패했습니다. 브라우저에서 공인 IP를 확인해 쿠팡·토스에 등록하세요.",
    },
    {
      item: "IP 확인 출처",
      status: outboundSource ? "정상" : "확인필요",
      detail: outboundSource || tried.map((row) => `${row.source}: ${row.detail}`).join(" | "),
    },
    {
      item: "브라우저/요청 IP 참고값",
      status: clientIp ? "참고" : "미확인",
      detail: clientIp || "로컬 개발환경에서는 요청 IP 헤더가 없을 수 있습니다.",
    },
    {
      item: "쿠팡 IP 허용 조치",
      status: outboundIp ? "등록필요" : "확인필요",
      detail: outboundIp
        ? `쿠팡 Open API 연동정보의 허용 IP에 ${outboundIp} 등록 후 10~30분 뒤 재진단하세요.`
        : "쿠팡 오류가 IP_NOT_ALLOWED이면 쿠팡 허용 IP 등록이 필요합니다.",
    },
    {
      item: "토스 IP 허용 조치",
      status: outboundIp ? "등록필요" : "확인필요",
      detail: outboundIp
        ? `토스쇼핑 FEP 자체개발/API 호출 허용 IP에 ${outboundIp} 등록 후 재진단하세요.`
        : "토스 응답 내부에 '허가되지 않은 IP'가 있으면 토스 허용 IP 등록이 필요합니다.",
    },
  ];
  return jsonResponse({
    ok: Boolean(outboundIp),
    mode: "public_ip_allowlist_check_v69",
    summary: { outboundIp, outboundSource, clientIp, rows, tried },
    message: outboundIp
      ? `현재 API 호출 공인 IP는 ${outboundIp}입니다. 쿠팡·토스 허용 IP에 등록하세요.`
      : "현재 API 호출 공인 IP를 자동 확인하지 못했습니다. 인터넷 연결 또는 IP 확인 서비스 접근을 확인하세요.",
  }, { status: 200 });
}

function configuredEnvValue(value: unknown) {
  const text = String(value ?? "").trim();
  return Boolean(text && !/여기에|xxxxx|example|your_|changeme|secret key/i.test(text));
}

function configuredPath(value: unknown, fallback = "") {
  return String(value || fallback || "").trim();
}

function credentialStatus(env: Env): Record<string, boolean> {
  return {
    coupangConfigured: coupangConfigured(env),
    tossConfigured: tossConfigured(env),
    coupangOrderPathConfigured: Boolean(env.COUPANG_ORDERS_PATH),
    coupangShipmentPathConfigured: Boolean(configuredPath(env.COUPANG_SHIPMENT_UPLOAD_PATH, COUPANG_DEFAULT_SHIPMENT_UPLOAD_PATH)),
    coupangVendorItemInventoryPathConfigured: Boolean(configuredPath(env.COUPANG_VENDOR_ITEM_INVENTORY_PATH, COUPANG_DEFAULT_VENDOR_ITEM_INVENTORY_PATH)),
    coupangOrderAckPathConfigured: Boolean(configuredPath(env.COUPANG_ORDER_ACK_PATH, COUPANG_DEFAULT_ORDER_ACK_PATH)),
    coupangCouponCreatePathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_CREATE_PATH, COUPANG_DEFAULT_COUPON_CREATE_PATH)),
    coupangCouponApplyPathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_APPLY_PATH, COUPANG_DEFAULT_COUPON_ITEM_CREATE_PATH)),
    coupangCouponCancelPathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_CANCEL_PATH, COUPANG_DEFAULT_COUPON_EXPIRE_PATH)),
    coupangCouponRequestStatusPathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_REQUEST_STATUS_PATH, COUPANG_DEFAULT_COUPON_REQUEST_STATUS_PATH)),
    coupangCouponContractListPathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_CONTRACT_LIST_PATH, COUPANG_DEFAULT_COUPON_CONTRACT_LIST_PATH)),
    coupangCouponListPathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH)),
    coupangCouponItemListPathConfigured: Boolean(configuredPath(env.COUPANG_COUPON_ITEM_LIST_PATH, COUPANG_DEFAULT_COUPON_ITEM_LIST_PATH)),
    coupangCouponContractIdConfigured: configuredEnvValue(env.COUPANG_COUPON_CONTRACT_ID),
    coupangCouponIdConfigured: configuredEnvValue(env.COUPANG_COUPON_ID),
    tossOrderPathConfigured: Boolean(configuredPath(env.TOSS_ORDERS_PATH, TOSS_DEFAULT_ORDERS_PATH)),
    tossOrderStatusPathConfigured: Boolean(configuredPath(env.TOSS_ORDER_STATUS_PATH, TOSS_DEFAULT_ORDER_STATUS_PATH)),
    tossShipmentPathConfigured: Boolean(configuredPath(env.TOSS_SHIPMENT_UPLOAD_PATH, TOSS_DEFAULT_SHIPMENT_DELIVERY_PATH)),
    apiConnectionPaused: apiConnectionPaused(env),
    liveExecutionAllowed: liveExecutionAllowed(env),
    scheduledWritesAllowed: scheduledWritesAllowed(env),
  };
}

function applyCoupangPathParams(
  path: string,
  env: Env,
  params: Record<string, string | number | undefined> = {},
) {
  const replacements: Record<string, string | number | undefined> = {
    vendorId: env.COUPANG_VENDOR_ID || "",
    couponId: env.COUPANG_COUPON_ID || "",
    requestedId: "",
    ...params,
  };
  return String(path || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) =>
    encodeURIComponent(String(replacements[key] ?? "")),
  );
}

function pathWithVendor(path: string, env: Env) {
  return applyCoupangPathParams(path, env);
}

function queryFromRecord(
  record?: Record<string, string | number | boolean | null | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(record || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  });
  return params;
}

async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function coupangAuthorization(
  env: Env,
  method: string,
  path: string,
  query: string,
) {
  const signedDate = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .slice(2);
  const signature = await hmacSha256Hex(
    env.COUPANG_SECRET_KEY,
    `${signedDate}${method.toUpperCase()}${path}${query}`,
  );
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}

async function coupangSignedRequest(
  env: Env,
  method: string,
  rawPath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  body?: unknown,
) {
  if (!coupangConfigured(env))
    throw new Error("쿠팡 API 키가 설정되지 않았습니다.");
  const path = pathWithVendor(rawPath, env);
  const params = queryFromRecord(query);
  const queryText = params.toString();
  const authorization = await coupangAuthorization(
    env,
    method,
    path,
    queryText,
  );
  const url = `https://api-gateway.coupang.com${path}${queryText ? `?${queryText}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      Authorization: authorization,
    },
    body:
      body === undefined || method.toUpperCase() === "GET"
        ? undefined
        : JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  const diagnostics: ExternalDiagnosticStep[] = [
    {
      step: "쿠팡 요청 준비",
      status: "준비",
      detail: `${method.toUpperCase()} ${path}, query=${queryText || "없음"}`,
    },
    {
      step: "쿠팡 HMAC 서명",
      status: "정상",
      detail: "Access Key/Secret으로 Authorization 헤더를 생성했습니다. Secret 값은 표시하지 않습니다.",
    },
    {
      step: "쿠팡 주문조회 응답",
      status: response.ok ? "정상" : "오류",
      detail: response.ok
        ? `HTTP ${response.status}`
        : `HTTP ${response.status}: ${diagnosticMessage(data)}`,
    },
  ];
  if (response.status === 403 && containsText(data, /ip address|not allowed|FORBIDDEN/i)) {
    diagnostics.push({
      step: "쿠팡 IP 허용",
      status: "오류",
      detail:
        "쿠팡 Open API에서 현재 접속 IP를 허용하지 않았습니다. 쿠팡 판매자센터/개발자 설정에 현재 공인 IP 또는 배포 서버 IP를 허용한 뒤 다시 실행하세요.",
    });
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    request: { method: method.toUpperCase(), baseUrl: "https://api-gateway.coupang.com", path, queryKeys: Array.from(params.keys()) },
    diagnostics,
    phase: response.ok ? "order" : "coupang_order",
  } satisfies ExternalApiResult;
}

function envNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function retryableCoupangResult(result: ExternalApiResult) {
  if ([408, 425, 429, 500, 502, 503, 504].includes(result.status)) return true;
  return containsText(result.data, /rate|limit|too many|temporarily|timeout|timed out|busy|throttl|일시|잠시|과다|제한|초과|지연/i);
}

function coupangRetryDelayMs(env: Env, attemptIndex: number) {
  const base = envNumber(env.COUPANG_ORDER_RETRY_BASE_MS, COUPANG_DEFAULT_RETRY_BASE_MS, 200, 10000);
  const jitter = 137 * (attemptIndex + 1);
  return Math.min(30000, base * Math.pow(2, attemptIndex) + jitter);
}

function networkErrorResult(error: unknown, method: string, rawPath: string, query?: Record<string, string | number | boolean | null | undefined>): ExternalApiResult {
  const params = queryFromRecord(query);
  return {
    ok: false,
    status: 0,
    data: { error: String(error) },
    request: { method: method.toUpperCase(), path: rawPath, queryKeys: Array.from(params.keys()) },
    diagnostics: [
      {
        step: "쿠팡 네트워크 오류",
        status: "오류",
        detail: `요청 중 예외가 발생했습니다: ${String(error)}`,
      },
    ],
    phase: "coupang_order",
  };
}

async function coupangSignedRequestWithRetry(
  env: Env,
  method: string,
  rawPath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  body?: unknown,
) {
  const maxAttempts = envNumber(env.COUPANG_ORDER_MAX_RETRIES, COUPANG_DEFAULT_MAX_RETRIES, 1, 8);
  let last: ExternalApiResult | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let result: ExternalApiResult;
    try {
      result = await coupangSignedRequest(env, method, rawPath, query, body);
    } catch (error) {
      result = networkErrorResult(error, method, rawPath, query);
    }
    last = result;
    if (result.ok || !retryableCoupangResult(result) || attempt >= maxAttempts - 1) {
      if (maxAttempts > 1) {
        result.diagnostics = [
          ...(result.diagnostics || []),
          {
            step: "쿠팡 재시도 요약",
            status: result.ok ? "정상" : "오류",
            detail: `${attempt + 1}/${maxAttempts}회 시도 후 ${result.ok ? "성공" : "종료"}했습니다.`,
          },
        ];
      }
      return result;
    }
    const delay = coupangRetryDelayMs(env, attempt);
    result.diagnostics = [
      ...(result.diagnostics || []),
      {
        step: "쿠팡 요청 집중 재시도",
        status: "준비",
        detail: `HTTP ${result.status || "NETWORK"} 응답으로 ${attempt + 2}/${maxAttempts}회차를 ${delay}ms 뒤 재시도합니다.`,
      },
    ];
    await sleepMs(delay);
  }
  return last || networkErrorResult("unknown", method, rawPath, query);
}

async function waitBetweenCoupangDayRequests(env: Env) {
  const delay = envNumber(env.COUPANG_ORDER_DAY_SPLIT_DELAY_MS, COUPANG_DEFAULT_DAY_SPLIT_DELAY_MS, 0, 10000);
  if (delay > 0) await sleepMs(delay);
}

async function tossTokenRequest(env: Env) {
  const diagnostics: ExternalDiagnosticStep[] = [];
  if (env.TOSS_SHOPPING_API_KEY) {
    diagnostics.push({
      step: "토스 토큰 준비",
      status: "건너뜀",
      detail: "TOSS_SHOPPING_API_KEY가 있어 사전 발급 토큰 방식으로 주문 API를 호출합니다. 토큰 값은 표시하지 않습니다.",
    });
    return { ok: true, status: 200, token: env.TOSS_SHOPPING_API_KEY, data: null, diagnostics };
  }

  const tokenUrl = env.TOSS_TOKEN_URL || "https://oauth2.cert.toss.im/token";
  if (!env.TOSS_CLIENT_ID || !env.TOSS_CLIENT_SECRET) {
    diagnostics.push({
      step: "토스 토큰 준비",
      status: "오류",
      detail: "TOSS_CLIENT_ID 또는 TOSS_CLIENT_SECRET이 없습니다.",
    });
    return { ok: false, status: 0, token: "", data: null, diagnostics };
  }

  const form = new URLSearchParams();
  form.set("grant_type", "client_credentials");
  form.set("client_id", env.TOSS_CLIENT_ID);
  form.set("client_secret", env.TOSS_CLIENT_SECRET);
  if (env.TOSS_SCOPE) form.set("scope", env.TOSS_SCOPE);

  diagnostics.push({
    step: "토스 토큰 요청 준비",
    status: "준비",
    detail: `POST ${tokenUrl}, grant_type=client_credentials, scope=${env.TOSS_SCOPE || "없음"}`,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "application/json",
    },
    body: form.toString(),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  const token = findAccessToken(data);
  diagnostics.push({
    step: "토스 토큰 발급 응답",
    status: response.ok && token ? "정상" : "오류",
    detail:
      response.ok && token
        ? `HTTP ${response.status}, Access Token 발급 확인. 토큰 값은 표시하지 않습니다.`
        : `HTTP ${response.status}: ${diagnosticMessage(data)}`,
  });
  return { ok: response.ok && Boolean(token), status: response.status, token, data, diagnostics };
}

async function tossRequest(
  env: Env,
  method: string,
  rawPath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  body?: unknown,
) {
  if (!tossConfigured(env))
    throw new Error("토스 API 키가 설정되지 않았습니다.");
  const base = (env.TOSS_SHOPPING_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("TOSS_SHOPPING_BASE_URL이 설정되지 않았습니다.");
  const params = queryFromRecord(query);
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const url = `${base}${path}${params.toString() ? `?${params.toString()}` : ""}`;
  const tokenResult = await tossTokenRequest(env);
  const diagnostics: ExternalDiagnosticStep[] = [
    ...tokenResult.diagnostics,
  ];
  if (!tokenResult.ok || !tokenResult.token) {
    return {
      ok: false,
      status: tokenResult.status || 401,
      data: tokenResult.data,
      request: { method: method.toUpperCase(), baseUrl: base, path, queryKeys: Array.from(params.keys()) },
      diagnostics,
      phase: "toss_token",
    } satisfies ExternalApiResult;
  }

  diagnostics.push({
    step: "토스 주문조회 요청 준비",
    status: "준비",
    detail: `${method.toUpperCase()} ${path}, query=${params.toString() || "없음"}, Authorization=Bearer [MASKED]`,
  });

  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      Authorization: `Bearer ${tokenResult.token}`,
    },
    body:
      body === undefined || method.toUpperCase() === "GET"
        ? undefined
        : JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  const businessError = tossBusinessErrorMessage(data);
  const ok = response.ok && !businessError;
  diagnostics.push({
    step: "토스 주문조회 응답",
    status: ok ? "정상" : "오류",
    detail: ok
      ? `HTTP ${response.status}`
      : response.ok && businessError
        ? `HTTP ${response.status} / 토스 resultType=FAIL: ${businessError}`
        : `HTTP ${response.status}: ${diagnosticMessage(data)}`,
  });
  return {
    ok,
    status: response.status,
    data,
    request: { method: method.toUpperCase(), baseUrl: base, path, queryKeys: Array.from(params.keys()) },
    diagnostics,
    phase: ok ? "order" : "toss_order",
  } satisfies ExternalApiResult;
}


function tokenCandidate(value: unknown): string {
  return displayText(value).trim();
}

function firstNonEmptyTextFromAny(obj: Record<string, unknown>, keys: string[]) {
  return firstText(obj, keys);
}

function productIdFromRecord(obj: Record<string, unknown>) {
  return firstNonEmptyTextFromAny(obj, [
    "productId",
    "id",
    "productNo",
    "product.id",
    "item.productId",
  ]);
}

function tossProductOptionRowsFromProductItem(
  product: Record<string, unknown>,
  item: Record<string, unknown>,
) {
  const merged = mergeOrderParentAndItem(product, item);
  const productId = cleanDigitsOnly(firstNonEmptyTextFromAny(merged, [
    "parent.id",
    "parent.productId",
    "productId",
    "id",
  ]));
  // 토스 상품 API에서 상품 옵션 ID는 productItemId 계열입니다.
  // 공식 예시에서는 product-items 응답의 itemId가 상품 옵션 ID로 사용됩니다.
  const optionId = cleanDigitsOnly(firstNonEmptyTextFromAny(merged, [
    "item.itemId",
    "item.productItemId",
    "item.id",
    "item.productItem.id",
    "item.productOptionId",
    "item.optionId",
    "id",
    "itemId",
    "productItemId",
    "productOptionId",
    "optionId",
    "stockId",
  ]));
  const itemName = firstNonEmptyTextFromAny(merged, [
    "item.itemName",
    "item.optionName",
    "item.name",
    "item.productItemName",
    "itemName",
    "optionName",
    "name",
    "productItemName",
  ]);
  // 토스 판매자센터의 옵션 단위 관리코드는 상품 등록 시 stocks[].managementCode이며,
  // 주문 API에서는 productItemManagementCode로 내려옵니다.
  const managementCode = firstNonEmptyTextFromAny(merged, [
    "item.managementCode",
    "item.productItemManagementCode",
    "item.itemManagementCode",
    "item.optionManagementCode",
    "item.optionManageCode",
    "managementCode",
    "productItemManagementCode",
    "itemManagementCode",
    "optionManagementCode",
    "optionManageCode",
  ]);
  const optionCode = managementCode || itemName;
  const productName = firstNonEmptyTextFromAny(merged, [
    "parent.name",
    "parent.productName",
    "parent.sellerProductName",
    "parent.managementCode",
    "productName",
    "sellerProductName",
    "name",
  ]);
  const status = firstNonEmptyTextFromAny(merged, [
    "item.status.code",
    "item.status.label",
    "item.status",
    "item.itemStatus",
    "item.productItemStatus",
    "status.code",
    "status.label",
    "status",
    "itemStatus",
    "productItemStatus",
  ]);
  return { productId, optionId, optionCode, itemName, managementCode, productName, status };
}

function cleanDigitsOnly(value: unknown) {
  const text = displayText(value).trim();
  return text.replace(/[^0-9]/g, "");
}

function dedupeTossOptionMasterRows(rows: Array<Record<string, string>>) {
  const seen = new Set<string>();
  const result: Array<Record<string, string>> = [];
  for (const row of rows) {
    const optionId = cleanDigitsOnly(row.optionId);
    const optionCode = displayText(row.optionCode);
    if (!optionId || !optionCode) continue;
    const key = `${optionId}|${optionCode.replace(/\s+/g, "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      productId: cleanDigitsOnly(row.productId),
      optionId,
      optionCode,
      itemName: displayText(row.itemName),
      managementCode: displayText(row.managementCode),
      productName: displayText(row.productName),
      status: displayText(row.status),
    });
  }
  return result;
}

function tossArrayPaths(data: unknown) {
  return arrayPathSummaries(data);
}

async function tossJsonRequestWithToken(
  env: Env,
  method: string,
  rawPath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
) {
  const base = (env.TOSS_SHOPPING_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("TOSS_SHOPPING_BASE_URL이 설정되지 않았습니다.");
  const tokenResult = await tossTokenRequest(env);
  if (!tokenResult.ok || !tokenResult.token) {
    return { ok: false, status: tokenResult.status || 401, data: tokenResult.data, diagnostics: tokenResult.diagnostics };
  }
  const params = queryFromRecord(query);
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const response = await fetch(`${base}${path}${params.toString() ? `?${params.toString()}` : ""}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      Authorization: `Bearer ${tokenResult.token}`,
    },
  });
  const text = await response.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: response.ok, status: response.status, data, diagnostics: tokenResult.diagnostics };
}

function coupangInventoryPriceRowFromPayload(optionId: string, data: unknown) {
  const flat = flattenObject(objectRecord(data));
  const salePrice = cleanDigitsOnly(firstText(flat, [
    "data.salePrice",
    "salePrice",
    "success.salePrice",
    "result.salePrice",
    "item.salePrice",
  ]));
  const amountInStock = firstText(flat, [
    "data.amountInStock",
    "amountInStock",
    "success.amountInStock",
    "result.amountInStock",
  ]);
  const onSale = firstText(flat, [
    "data.onSale",
    "onSale",
    "success.onSale",
    "result.onSale",
  ]);
  const sellerItemId = cleanDigitsOnly(firstText(flat, [
    "data.sellerItemId",
    "sellerItemId",
    "success.sellerItemId",
    "result.sellerItemId",
  ]));
  return {
    optionId,
    salePrice,
    status: onSale ? `onSale=${onSale}` : "",
    amountInStock,
    sellerItemId,
  };
}

async function coupangVendorItemPriceSync(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  const rowsInput = Array.isArray(body.rows) ? body.rows : [];
  const optionIds = Array.from(new Set(rowsInput.map((row) => {
    const record = objectRecord(row);
    return cleanDigitsOnly(firstNonEmptyTextFromAny(record, [
      "optionId",
      "coupangOptionId",
      "쿠팡 옵션ID",
      "vendorItemId",
    ]));
  }).filter(Boolean))).slice(0, 200);

  if (!optionIds.length) {
    return jsonResponse({
      ok: false,
      mode: "coupang_vendor_item_price_sync_no_options_v150",
      summary: { rows: [] },
      message: "판매가를 조회할 쿠팡 옵션ID가 없습니다. 쿠폰양식 또는 매핑자료에 쿠팡 옵션ID를 먼저 입력하세요.",
    }, { status: 400 });
  }
  if (apiConnectionPaused(env)) {
    return jsonResponse({
      ok: true,
      mode: "coupang_vendor_item_price_sync_api_paused_v150",
      summary: { rows: [], requestedOptions: optionIds.length, credentials: credentialStatus(env) },
      safety: safetyStatus(env),
      message: "안전모드로 쿠팡 판매가 API 연결을 중단했습니다. API_CONNECTION_PAUSED=false 후 다시 실행하세요.",
    });
  }
  if (!coupangConfigured(env)) {
    return jsonResponse({ ok: false, message: "쿠팡 API 키가 설정되지 않았습니다." }, { status: 400 });
  }

  const pathTemplate = configuredPath(env.COUPANG_VENDOR_ITEM_INVENTORY_PATH, COUPANG_DEFAULT_VENDOR_ITEM_INVENTORY_PATH);
  const rows: Array<Record<string, string>> = [];
  const diagnostics: ExternalDiagnosticStep[] = [];
  const errors: Array<{ optionId: string; status: number; message: string }> = [];
  const delayMs = envNumber(env.COUPANG_ORDER_DAY_SPLIT_DELAY_MS, COUPANG_DEFAULT_DAY_SPLIT_DELAY_MS, 0, 5000);

  for (const optionId of optionIds) {
    if (rows.length || errors.length) await sleepMs(delayMs);
    const path = applyCoupangPathParams(pathTemplate, env, { vendorItemId: optionId });
    const result = await coupangSignedRequestWithRetry(env, "GET", path);
    diagnostics.push({
      step: `쿠팡 판매가 조회 ${optionId}`,
      status: result.ok ? "정상" : "오류",
      detail: result.ok ? `HTTP ${result.status}` : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
    });
    if (result.ok) {
      const row = coupangInventoryPriceRowFromPayload(optionId, result.data);
      if (row.salePrice) rows.push(row);
      else errors.push({ optionId, status: result.status, message: "응답은 정상이나 salePrice 값을 찾지 못했습니다." });
    } else {
      errors.push({ optionId, status: result.status, message: diagnosticMessage(result.data) });
    }
  }

  return jsonResponse({
    ok: errors.length === 0 || rows.length > 0,
    mode: "coupang_vendor_item_price_sync_v150",
    summary: { requestedOptions: optionIds.length, updatedOptions: rows.length, failedOptions: errors.length, rows, errors, diagnostics },
    safety: safetyStatus(env),
    message: errors.length
      ? `쿠팡 판매가 API에서 ${rows.length}/${optionIds.length}건을 확인했습니다. 실패 ${errors.length}건은 옵션ID, 허용 IP, API 권한을 확인하세요.`
      : `쿠팡 판매가 API에서 현재 옵션 ${rows.length}건의 판매가를 확인했습니다. 쿠폰 손익검증에 이 판매가를 우선 반영합니다.`,
  });
}

async function tossProductOptionSync(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  if (apiConnectionPaused(env)) {
    return jsonResponse({ ok: true, mode: "toss_product_option_sync_api_paused_v147", summary: { rows: [], credentials: credentialStatus(env) }, safety: safetyStatus(env), message: "안전모드로 토스 상품/옵션 API 연결을 중단했습니다." });
  }
  if (!tossConfigured(env)) {
    return jsonResponse({ ok: false, message: "토스 API 키가 설정되지 않았습니다." }, { status: 400 });
  }
  const size = Math.min(Math.max(Number(body.limit || 50), 1), 100);
  const productListPath = "/api/v3/shopping-fep/products/v2";
  const productRows: Record<string, unknown>[] = [];
  const optionRows: Array<Record<string, string>> = [];
  const diagnostics: ExternalDiagnosticStep[] = [];
  let nextToken = displayText((body as Record<string, unknown>).nextToken);
  const maxPages = Math.min(Math.max(Number((body as Record<string, unknown>).maxPages || 10), 1), 30);

  for (let page = 0; page < maxPages; page += 1) {
    const result = await tossJsonRequestWithToken(env, "GET", productListPath, {
      size,
      nextToken: nextToken || undefined,
      partnerName: env.TOSS_PARTNER_NAME || undefined,
    });
    diagnostics.push({
      step: `토스 상품목록 ${page + 1}페이지`,
      status: result.ok ? "정상" : "오류",
      detail: result.ok ? `HTTP ${result.status}, 응답 구조: ${rootKeySummary(result.data)}` : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
    });
    if (!result.ok) break;
    const products = firstArrayPayload(result.data).map(objectRecord).filter((r) => Object.keys(r).length);
    productRows.push(...products);
    const flat = flattenObject(objectRecord(result.data));
    nextToken = firstText(flat, ["success.nextToken", "nextToken", "success.page.nextToken", "page.nextToken"]);
    if (!nextToken || !products.length) break;
  }

  const uniqueProducts = new Map<string, Record<string, unknown>>();
  productRows.forEach((product) => {
    const productId = productIdFromRecord(product);
    if (productId && !uniqueProducts.has(productId)) uniqueProducts.set(productId, product);
  });

  for (const [productId, product] of uniqueProducts) {
    let cursorItemId = "";
    for (let page = 0; page < 20; page += 1) {
      const result = await tossJsonRequestWithToken(env, "GET", `/api/v3/shopping-fep/products/${productId}/product-items`, {
        pageSize: 50,
        cursorItemId: cursorItemId || undefined,
        partnerName: env.TOSS_PARTNER_NAME || undefined,
      });
      diagnostics.push({
        step: `토스 옵션목록 productId=${productId}${page ? ` page=${page + 1}` : ""}`,
        status: result.ok ? "정상" : "오류",
        detail: result.ok ? `HTTP ${result.status}, 배열: ${tossArrayPaths(result.data) || "확인 필요"}` : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
      });
      if (!result.ok) break;
      const items = firstArrayPayload(result.data).map(objectRecord).filter((r) => Object.keys(r).length);
      for (const item of items) optionRows.push(tossProductOptionRowsFromProductItem(product, item));
      const flat = flattenObject(objectRecord(result.data));
      const hasNextText = firstText(flat, ["success.hasNext", "hasNext", "page.hasNext"]);
      cursorItemId = firstText(flat, ["success.nextCursor", "nextCursor", "success.nextCursorItemId", "nextCursorItemId"]);
      if (!items.length || !cursorItemId || hasNextText === "false") break;
    }
  }

  const rows = dedupeTossOptionMasterRows(optionRows);
  return jsonResponse({
    ok: true,
    mode: "toss_product_option_sync_v77",
    summary: {
      products: uniqueProducts.size,
      options: rows.length,
      rows,
      diagnostics,
    },
    message: `토스 상품 API에서 상품 ${uniqueProducts.size}개, 옵션 ${rows.length}건을 자동 동기화했습니다. 엑셀 업로드 없이 이 기준으로 주문 옵션ID를 보정합니다.`,
  });
}

function compactExternalResult(result: ExternalApiResult) {
  return {
    ok: result.ok,
    status: result.status,
    receivedType: Array.isArray(result.data) ? "array" : typeof result.data,
    phase: result.phase || "unknown",
    request: result.request || null,
    diagnostics: result.diagnostics || [],
    responseShape: rootKeySummary(result.data),
    responseArrayPaths: arrayPathSummaries(result.data),
    tossBusinessError: tossBusinessErrorMessage(result.data) || null,
    errorKind: result.ok ? null : externalErrorKind(result),
    errorPreview: result.ok ? null : diagnosticPreview(result.data),
  };
}


function firstArrayPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  for (const key of [
    "data",
    "orders",
    "orderList",
    "orderLists",
    "orderSheets",
    "orderSheetList",
    "orderSheetListResponse",
    "items",
    "itemList",
    "products",
    "productList",
    "contents",
    "content",
    "elements",
    "rows",
    "list",
    "lists",
    "results",
    "result",
    "success",
    "payload",
  ]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = firstArrayPayload(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function flattenObject(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {},
  depth = 0,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) return out;
  Object.entries(value as Record<string, unknown>).forEach(([key, inner]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    out[nextKey] = inner;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      flattenObject(inner, nextKey, out, depth + 1);
    }
  });
  return out;
}

function displayText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(displayText).filter(Boolean).join(" ").trim();
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of [
      "name",
      "receiverName",
      "recipientName",
      "customerName",
      "phone",
      "mobile",
      "safeNumber",
      "address",
      "addr1",
      "receiverAddr1",
      "receiverAddress",
      "zipCode",
      "postCode",
      "postCode1",
      "parcelPrintMessage",
      "shippingNote",
      "deliveryMessage",
      "shippingMessage",
      "memo",
      "message",
    ]) {
      const text = displayText(obj[key]);
      if (text) return text;
    }
  }
  return "";
}

function firstText(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = nestedValue(obj, key);
    const text = displayText(value);
    if (text) return text;
  }
  return "";
}


const DELIVERY_MESSAGE_EXACT_KEYS = new Set([
  "parcelprintmessage",
  "shippingnote",
  "deliverymessage",
  "deliverymemo",
  "shippingmessage",
  "shippingmemo",
  "ordermemo",
  "ordermessage",
  "requestmessage",
  "requestmemo",
  "customerrequest",
  "customermemo",
  "buyermemo",
  "receiverrequest",
  "recipientrequest",
  "배송메시지",
  "배송메세지",
  "배송요청사항",
  "배송요청",
  "주문요청사항",
  "고객요청사항",
  "수취인요청사항",
  "요청사항",
  "전달메시지",
  "전달메세지",
]);

const DELIVERY_MESSAGE_CONTEXT_KEYS = [
  "parcel",
  "shipping",
  "delivery",
  "receiver",
  "recipient",
  "order",
  "customer",
  "buyer",
  "request",
  "memo",
  "message",
  "배송",
  "수취",
  "수령",
  "주문",
  "고객",
  "요청",
  "메모",
  "메시지",
  "메세지",
];

function normalizeDeliveryKey(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function isDeliveryMessageKey(key: string, path: string[]) {
  const normalizedKey = normalizeDeliveryKey(key);
  if (DELIVERY_MESSAGE_EXACT_KEYS.has(normalizedKey)) return true;
  if (normalizedKey === "memo" || normalizedKey === "message") {
    const normalizedPath = normalizeDeliveryKey(path.join("."));
    return DELIVERY_MESSAGE_CONTEXT_KEYS.some((hint) => normalizedPath.includes(normalizeDeliveryKey(hint)));
  }
  return (
    (normalizedKey.includes("delivery") || normalizedKey.includes("shipping") || normalizedKey.includes("parcel") || normalizedKey.includes("배송")) &&
    (normalizedKey.includes("memo") || normalizedKey.includes("message") || normalizedKey.includes("note") || normalizedKey.includes("request") || normalizedKey.includes("요청") || normalizedKey.includes("메모") || normalizedKey.includes("메시지") || normalizedKey.includes("메세지"))
  );
}

function extractDeliveryMessageDeep(value: unknown, path: string[] = [], depth = 0): string {
  if (value === undefined || value === null || depth > 7) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractDeliveryMessageDeep(item, path, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  for (const [key, inner] of Object.entries(obj)) {
    const nextPath = [...path, key];
    if (isDeliveryMessageKey(key, nextPath)) {
      const candidate = displayText(inner);
      if (candidate) return candidate;
    }
  }
  for (const [key, inner] of Object.entries(obj)) {
    const found = extractDeliveryMessageDeep(inner, [...path, key], depth + 1);
    if (found) return found;
  }
  return "";
}

function numericValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const units = numericValue(obj.units ?? obj.value ?? obj.amount ?? obj.price);
    const nanos = numericValue(obj.nanos);
    if (units !== null || nanos !== null) {
      return (units || 0) + (nanos || 0) / 1_000_000_000;
    }
  }
  return null;
}

function firstNumber(
  obj: Record<string, unknown>,
  keys: string[],
  fallback = 0,
) {
  for (const key of keys) {
    const n = numericValue(nestedValue(obj, key));
    if (n !== null) return n;
  }
  return fallback;
}

function firstPositiveNumber(
  obj: Record<string, unknown>,
  keys: string[],
  fallback = 0,
) {
  let zeroCandidate: number | null = null;
  for (const key of keys) {
    const n = numericValue(nestedValue(obj, key));
    if (n === null) continue;
    if (n > 0) return n;
    if (zeroCandidate === null) zeroCandidate = n;
  }
  return zeroCandidate ?? fallback;
}

const ORDER_ITEM_ARRAY_KEYS = [
  "orderItems",
  "orderItemList",
  "orderSheetItems",
  "orderSheetItemList",
  "items",
  "itemList",
  "products",
  "productList",
  "orderProducts",
  "orderProductList",
  "productItems",
  "productItemList",
  "orderLines",
  "orderLineList",
  "orderLineItems",
  "lines",
  "lineItems",
  "options",
  "optionItems",
];

const SHIPMENT_BOX_ARRAY_KEYS = [
  "shipmentBoxList",
  "shipmentBoxes",
  "shipmentBoxs",
  "shippingBoxList",
  "shippingBoxes",
  "deliveryBoxList",
  "deliveryBoxes",
  "packages",
  "packageList",
];

function arrayAtAnyKey(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = nestedValue(obj, key);
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function firstNestedArray(obj: Record<string, unknown>): unknown[] {
  return arrayAtAnyKey(obj, ORDER_ITEM_ARRAY_KEYS);
}

function firstShipmentBoxArray(obj: Record<string, unknown>): unknown[] {
  return arrayAtAnyKey(obj, SHIPMENT_BOX_ARRAY_KEYS);
}

function mergeOrderParentAndItem(parent: Record<string, unknown>, item: unknown) {
  const itemObj = objectRecord(item);
  return {
    ...flattenObject(parent, "parent"),
    ...flattenObject(itemObj, "item"),
    ...parent,
    ...itemObj,
    _parent: parent,
    _item: itemObj,
  } as Record<string, unknown>;
}

function mergeOrderShipmentBoxAndItem(
  parent: Record<string, unknown>,
  box: Record<string, unknown>,
  item: unknown,
) {
  const itemObj = objectRecord(item);
  return {
    ...flattenObject(parent, "parent"),
    ...flattenObject(box, "shipmentBox"),
    ...flattenObject(itemObj, "item"),
    ...parent,
    ...box,
    ...itemObj,
    _parent: parent,
    _shipmentBox: box,
    _item: itemObj,
  } as Record<string, unknown>;
}

function pushExpandedParentRows(parent: Record<string, unknown>, expanded: Record<string, unknown>[]) {
  const shipmentBoxes = firstShipmentBoxArray(parent).map(objectRecord).filter((row) => Object.keys(row).length);
  if (shipmentBoxes.length) {
    shipmentBoxes.forEach((box) => {
      const boxItems = firstNestedArray(box);
      if (boxItems.length) {
        boxItems.forEach((item) => expanded.push(mergeOrderShipmentBoxAndItem(parent, box, item)));
      } else {
        expanded.push(mergeOrderShipmentBoxAndItem(parent, box, box));
      }
    });
    return;
  }

  const nestedItems = firstNestedArray(parent);
  if (nestedItems.length) {
    nestedItems.forEach((item) => expanded.push(mergeOrderParentAndItem(parent, item)));
    return;
  }

  expanded.push({ ...flattenObject(parent), ...parent, _parent: parent });
}

function expandedOrderPayloadRows(data: unknown): Record<string, unknown>[] {
  const baseRows = firstArrayPayload(data);
  const expanded: Record<string, unknown>[] = [];
  baseRows.forEach((base) => {
    const parent = objectRecord(base);
    if (!Object.keys(parent).length) return;
    pushExpandedParentRows(parent, expanded);
  });
  return expanded;
}

function joinedAddress(row: Record<string, unknown>) {
  const direct = firstText(row, [
    "address",
    "receiverAddress",
    "shippingAddress",
    "deliveryAddress",
    "recipientAddress",
    "parent.address",
    "parent.receiverAddress",
    "parent.shippingAddress",
    "parent.deliveryAddress",
    "parent.recipientAddress",
    "receiver.address",
    "receiver.receiverAddress",
    "recipient.address",
    "shipmentBox.address",
    "shipmentBox.receiverAddress",
    "shipmentBox.shippingAddress",
    "shipmentBox.deliveryAddress",
    "shipmentBox.recipientAddress",
    "shipmentBox.receiver.address",
    "shipmentBox.receiver.receiverAddress",
    "shipmentBox.recipient.address",
    "shipping.address",
    "delivery.address",
  ]);
  const parts = [
    firstText(row, [
      "receiverAddr1",
      "receiverAddress1",
      "addr1",
      "address1",
      "parent.receiverAddr1",
      "parent.receiverAddress1",
      "parent.addr1",
      "parent.address1",
      "receiver.receiverAddr1",
      "receiver.addr1",
      "receiver.address1",
      "recipient.addr1",
      "shipmentBox.receiverAddr1",
      "shipmentBox.receiverAddress1",
      "shipmentBox.addr1",
      "shipmentBox.address1",
      "shipmentBox.receiver.receiverAddr1",
      "shipmentBox.receiver.addr1",
      "shipmentBox.receiver.address1",
      "shipmentBox.recipient.addr1",
      "shipping.addr1",
      "delivery.addr1",
    ]),
    firstText(row, [
      "receiverAddr2",
      "receiverAddress2",
      "addr2",
      "address2",
      "parent.receiverAddr2",
      "parent.receiverAddress2",
      "parent.addr2",
      "parent.address2",
      "receiver.receiverAddr2",
      "receiver.addr2",
      "receiver.address2",
      "recipient.addr2",
      "shipmentBox.receiverAddr2",
      "shipmentBox.receiverAddress2",
      "shipmentBox.addr2",
      "shipmentBox.address2",
      "shipmentBox.receiver.receiverAddr2",
      "shipmentBox.receiver.addr2",
      "shipmentBox.receiver.address2",
      "shipmentBox.recipient.addr2",
      "shipping.addr2",
      "delivery.addr2",
    ]),
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : direct;
}

function normalizedOrdersFromExternal(data: unknown, channel: "쿠팡" | "토스") {
  return expandedOrderPayloadRows(data)
    .slice(0, 500)
    .map((row) => {
      const qty = firstNumber(
        row,
        [
          "qty",
          "quantity",
          "orderCount",
          "shippingCount",
          "purchaseCount",
          "count",
          "item.qty",
          "item.quantity",
          "item.orderCount",
          "item.shippingCount",
          "item.purchaseCount",
          "item.count",
          "parent.qty",
          "parent.quantity",
        ],
        1,
      );
      const unitOrTotal = firstPositiveNumber(
        row,
        [
          "orderPrice",
          "orderAmount",
          "settlementAmount",
          "paidAmount",
          "paymentAmount",
          "totalPrice",
          "totalAmount",
          "salePrice",
          "salesPrice",
          "price",
          "item.orderPrice",
          "item.orderAmount",
          "item.settlementAmount",
          "item.paidAmount",
          "item.paymentAmount",
          "item.totalPrice",
          "item.totalAmount",
          "item.salePrice",
          "item.salesPrice",
          "item.price",
          "item.orderPrice.units",
          "item.salesPrice.units",
          "parent.orderPrice",
          "parent.orderAmount",
          "parent.settlementAmount",
          "parent.paidAmount",
          "parent.paymentAmount",
          "parent.totalPrice",
          "parent.totalAmount",
          "parent.salePrice",
          "parent.salesPrice",
          "parent.shippingPrice",
        ],
        0,
      );
      const unitPrice = firstPositiveNumber(row, [
        "unitPrice",
        "item.unitPrice",
        "optionPrice",
        "item.optionPrice",
        "item.salesPrice",
        "item.salesPrice.units",
        "salesPrice",
        "salesPrice.units",
      ], 0);
      return {
        orderNo: firstText(row, [
          "orderNo",
          "orderId",
          "orderSheetNo",
          "shipmentBoxId",
          "marketplaceOrderId",
          "orderNumber",
          "item.orderNo",
          "item.orderId",
          "item.orderSheetNo",
          "item.shipmentBoxId",
          "parent.orderNo",
          "parent.orderId",
          "parent.orderSheetNo",
          "parent.shipmentBoxId",
          "parent.marketplaceOrderId",
          "parent.orderNumber",
        ]),
        orderedAt: firstText(row, [
          "orderedAt",
          "orderDate",
          "orderedDate",
          "paidAt",
          "createdAt",
          "orderCreatedAt",
          "item.orderedAt",
          "item.orderDate",
          "item.paidAt",
          "parent.orderedAt",
          "parent.orderDate",
          "parent.orderedDate",
          "parent.paidAt",
          "parent.createdAt",
          "parent.orderCreatedAt",
        ]),
        shipmentBoxId: channel === "쿠팡"
          ? firstText(row, [
              "shipmentBoxId",
              "shipmentBox.shipmentBoxId",
              "parent.shipmentBoxId",
              "item.shipmentBoxId",
              "shippingBoxId",
              "packageId",
            ])
          : "",
        orderProductId: channel === "토스"
          ? firstText(row, [
              "orderProductId",
              "item.orderProductId",
              "parent.orderProductId",
            ])
          : "",
        optionId: channel === "토스"
          ? firstText(row, [
              // 토스 판매자센터의 실제 "옵션 ID" 우선 후보입니다.
              // 기존 버전은 productItemId/sellerProductItemId 같은 주문상품 내부ID를 옵션ID로 잡는 문제가 있었습니다.
              "stockId",
              "productOptionId",
              "productOptionNo",
              "sellerProductOptionId",
              "sellerProductOptionNo",
              "saleProductOptionId",
              "saleProductOptionNo",
              "optionItemId",
              "sellerOptionId",
              "option.id",
              "option.optionId",
              "item.stockId",
              "item.productOptionId",
              "item.productOptionNo",
              "item.sellerProductOptionId",
              "item.sellerProductOptionNo",
              "item.saleProductOptionId",
              "item.saleProductOptionNo",
              "item.optionItemId",
              "item.sellerOptionId",
              "item.option.id",
              "item.option.optionId",
              "parent.stockId",
              "parent.productOptionId",
              "parent.productOptionNo",
              "parent.option.id",
              "parent.option.optionId",
              // 그래도 없을 때만 하위 호환 후보를 사용합니다.
              "optionId",
              "optionID",
              "item.optionId",
              "item.optionID",
              "parent.optionId",
              "productItemId",
              "sellerProductItemId",
              "item.productItemId",
              "item.sellerProductItemId",
              "parent.productItemId",
              "parent.sellerProductItemId",
            ])
          : firstText(row, [
              "optionId",
              "optionID",
              "vendorItemId",
              "vendorItemNo",
              "stockId",
              "marketplaceItemId",
              "productItemId",
              "sellerProductItemId",
              "item.optionId",
              "item.optionID",
              "item.vendorItemId",
              "item.vendorItemNo",
              "item.stockId",
              "item.marketplaceItemId",
              "item.productItemId",
              "item.sellerProductItemId",
              "parent.optionId",
              "parent.vendorItemId",
            ]),
        productName: firstText(row, [
          "productName",
          "sellerProductName",
          "goodsName",
          "name",
          "item.productName",
          "item.sellerProductName",
          "item.goodsName",
          "item.name",
          "item.vendorItemName",
          "item.itemName",
          "parent.productName",
          "parent.sellerProductName",
          "parent.goodsName",
        ]),
        optionName: firstText(row, [
          "optionName",
          "vendorItemName",
          "itemName",
          "productItemName",
          "item.optionName",
          "item.vendorItemName",
          "item.itemName",
          "item.productItemName",
          "parent.optionName",
          "parent.vendorItemName",
          // 옵션관리코드는 표시용 옵션명이 아니라 매칭 보조키입니다.
          // 실제 옵션명이 없을 때만 마지막 후보로 사용합니다.
          "productItemManagementCode",
          "item.productItemManagementCode",
          "parent.productItemManagementCode",
          "optionManagementCode",
          "optionManageCode",
          "optionCode",
          "managementCode",
          "item.optionManagementCode",
          "item.optionManageCode",
          "item.optionCode",
          "item.managementCode",
          "parent.optionManagementCode",
          "parent.optionManageCode",
        ]),
        qty,
        receiverName: firstText(row, [
          "receiverName",
          "recipientName",
          "receiver.name",
          "recipient.name",
          "shipmentBox.receiverName",
          "shipmentBox.recipientName",
          "shipmentBox.receiver.name",
          "shipmentBox.recipient.name",
          "shipping.receiverName",
          "delivery.receiverName",
          "parent.receiverName",
          "parent.recipientName",
          "parent.receiver.name",
          "parent.recipient.name",
          "parent.shipping.receiverName",
          "parent.delivery.receiverName",
        ]),
        receiverPhone: firstText(row, [
          "receiverPhone",
          "receiverPhoneNumber",
          "recipientPhone",
          "safeNumber",
          "receiver.phone",
          "receiver.mobile",
          "receiver.safeNumber",
          "recipient.phone",
          "recipient.mobile",
          "shipmentBox.receiverPhone",
          "shipmentBox.receiverPhoneNumber",
          "shipmentBox.recipientPhone",
          "shipmentBox.safeNumber",
          "shipmentBox.receiver.phone",
          "shipmentBox.receiver.mobile",
          "shipmentBox.receiver.safeNumber",
          "shipmentBox.recipient.phone",
          "shipmentBox.recipient.mobile",
          "shipping.receiverPhone",
          "delivery.receiverPhone",
          "parent.receiverPhone",
          "parent.receiverPhoneNumber",
          "parent.recipientPhone",
          "parent.safeNumber",
          "parent.receiver.phone",
          "parent.receiver.mobile",
          "parent.receiver.safeNumber",
          "parent.recipient.phone",
          "parent.recipient.mobile",
        ]),
        zip: firstText(row, [
          "zip",
          "zipCode",
          "postCode",
          "postcode",
          "receiverPostCode",
          "receiver.postCode",
          "receiver.zipCode",
          "recipient.postCode",
          "shipmentBox.zip",
          "shipmentBox.zipCode",
          "shipmentBox.postCode",
          "shipmentBox.receiverPostCode",
          "shipmentBox.receiver.postCode",
          "shipmentBox.receiver.zipCode",
          "shipmentBox.recipient.postCode",
          "shipping.zipCode",
          "delivery.zipCode",
          "parent.zip",
          "parent.zipCode",
          "parent.postCode",
          "parent.postcode",
          "parent.receiverPostCode",
          "parent.receiver.postCode",
          "parent.receiver.zipCode",
          "parent.recipient.postCode",
        ]),
        address: joinedAddress(row),
        memo: firstText(row, [
          // 쿠팡 발주서 목록/단건 API의 배송메시지 공식 필드입니다.
          "parcelPrintMessage",
          "parent.parcelPrintMessage",
          "item.parcelPrintMessage",
          "shipmentBox.parcelPrintMessage",
          "shipmentBoxes.parcelPrintMessage",
          "shipmentBoxList.parcelPrintMessage",
          "shipmentBox.parcelPrintMessage",
          "shipmentBox.deliveryMessage",
          "shipmentBox.deliveryMemo",
          "shipmentBox.shippingMessage",
          "shipmentBox.shippingMemo",
          "shipmentBox.orderMemo",
          "shipmentBox.requestMessage",
          "shipmentBox.requestMemo",
          "shipmentBox.receiver.memo",
          "shipmentBox.receiver.message",
          "shipmentBox.recipient.memo",
          "shipmentBox.recipient.message",
          "parent.shipmentBox.parcelPrintMessage",
          "parent.shipmentBoxes.parcelPrintMessage",
          "parent.shipmentBoxList.parcelPrintMessage",
          // 토스 쇼핑 주문 API의 배송 요청사항 후보입니다.
          "shippingNote",
          "parent.shippingNote",
          "item.shippingNote",
          // 기타 커머스/엑셀 호환 배송 요청사항 후보입니다.
          "memo",
          "deliveryMessage",
          "deliveryMemo",
          "shippingMessage",
          "shippingMemo",
          "orderMemo",
          "orderMessage",
          "requestMessage",
          "requestMemo",
          "customerRequest",
          "customerMemo",
          "buyerMemo",
          "receiverRequest",
          "recipientRequest",
          "message",
          "item.memo",
          "item.deliveryMessage",
          "item.deliveryMemo",
          "item.shippingMessage",
          "item.shippingMemo",
          "item.orderMemo",
          "item.orderMessage",
          "item.requestMessage",
          "item.requestMemo",
          "item.customerRequest",
          "item.customerMemo",
          "item.buyerMemo",
          "parent.memo",
          "parent.deliveryMessage",
          "parent.deliveryMemo",
          "parent.shippingMessage",
          "parent.shippingMemo",
          "parent.orderMemo",
          "parent.orderMessage",
          "parent.requestMessage",
          "parent.requestMemo",
          "parent.customerRequest",
          "parent.customerMemo",
          "parent.buyerMemo",
          "parent.message",
          "receiver.memo",
          "receiver.message",
          "receiver.deliveryMessage",
          "receiver.parcelPrintMessage",
          "recipient.memo",
          "recipient.message",
          "delivery.memo",
          "delivery.message",
          "shipping.memo",
          "shipping.message",
        ]) || extractDeliveryMessageDeep(row),
        salePrice: unitOrTotal || (unitPrice ? unitPrice * qty : 0),
        status: firstText(row, [
          "status",
          "deliveryStatus",
          "deliveryStatusDesc",
          "orderStatus",
          "orderProductStatus",
          "item.status",
          "item.deliveryStatus",
          "item.deliveryStatusDesc",
          "item.orderStatus",
          "item.orderProductStatus",
          "parent.status",
          "parent.deliveryStatus",
          "parent.deliveryStatusDesc",
          "parent.orderStatus",
          "parent.orderProductStatus",
        ]),
        courier: firstText(row, [
          "courier",
          "carrier",
          "deliveryCompany",
          "deliveryCompanyName",
          "invoiceCompany",
          "invoiceCompanyName",
          "shippingCompany",
          "shipmentCompany",
          "logisticsCompany",
          "item.courier",
          "item.carrier",
          "item.deliveryCompany",
          "item.deliveryCompanyName",
          "item.invoiceCompany",
          "item.invoiceCompanyName",
          "parent.courier",
          "parent.carrier",
          "parent.deliveryCompany",
          "parent.deliveryCompanyName",
          "parent.invoiceCompany",
          "parent.invoiceCompanyName",
        ]),
        trackingNo: firstText(row, [
          "trackingNo",
          "trackingNumber",
          "invoiceNumber",
          "shipmentNumber",
          "waybillNo",
          "waybillNumber",
          "deliveryInvoiceNo",
          "deliveryInvoiceNumber",
          "trackingCode",
          "shippingTrackingNumber",
          "item.trackingNo",
          "item.trackingNumber",
          "item.invoiceNumber",
          "item.shipmentNumber",
          "item.waybillNo",
          "item.waybillNumber",
          "item.deliveryInvoiceNo",
          "item.shippingTrackingNumber",
          "parent.trackingNo",
          "parent.trackingNumber",
          "parent.invoiceNumber",
          "parent.shipmentNumber",
          "parent.waybillNo",
          "parent.waybillNumber",
          "parent.deliveryInvoiceNo",
          "parent.shippingTrackingNumber",
        ]),
        // Extra Toss identifiers are kept in the standard row so the web app can match mapping rows
        // by either stockId (numeric option ID) or productItemManagementCode (seller option code).
        tossStockId: channel === "토스" ? firstText(row, ["stockId", "item.stockId", "parent.stockId"]) : "",
        tossOrderProductId: channel === "토스" ? firstText(row, ["orderProductId", "item.orderProductId", "parent.orderProductId"]) : "",
        tossProductId: channel === "토스" ? firstText(row, ["productId", "item.productId", "parent.productId"]) : "",
        tossProductManagementCode: channel === "토스" ? firstText(row, ["productManagementCode", "item.productManagementCode", "parent.productManagementCode"]) : "",
        tossProductItemManagementCode: channel === "토스" ? firstText(row, ["productItemManagementCode", "item.productItemManagementCode", "parent.productItemManagementCode"]) : "",
        tossProductItemName: channel === "토스" ? firstText(row, ["itemName", "optionName", "productItemName", "item.itemName", "item.optionName", "item.productItemName", "parent.optionName"]) : "",
        optionManagementCode: channel === "토스"
          ? firstText(row, [
              "productItemManagementCode",
              "item.productItemManagementCode",
              "parent.productItemManagementCode",
              "optionManagementCode",
              "item.optionManagementCode",
              "parent.optionManagementCode",
            ])
          : firstText(row, ["optionManagementCode", "item.optionManagementCode", "parent.optionManagementCode"]),
        channel,
      };
    })
    .filter((row) => row.orderNo || row.optionId || row.productName);
}

function sanitizeTempSessionKey(value: unknown) {
  const text = String(value || "").trim();
  return (
    text.replace(/[^0-9A-Za-z가-힣_.-]/g, "-").slice(0, 80) ||
    `b2b-${new Date().toISOString().slice(0, 10)}`
  );
}

function sanitizeSettingsKey(value: unknown) {
  const text = String(value || "").trim();
  return (
    text.replace(/[^0-9A-Za-z가-힣_.-]/g, "-").slice(0, 80) ||
    "b2b-master-settings"
  );
}

function safeExpiryHours(value: unknown) {
  const hours = Number(value || 24);
  if (!Number.isFinite(hours)) return 24;
  return Math.min(Math.max(hours, 1), 24);
}

function expiresAtAfterHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function safetyStatus(env: Env) {
  return {
    externalApiExecuted: false,
    finalExecutionStillDisabled: !isEnabled(env, "ALLOW_FINAL_EXECUTION"),
    API_CONNECTION_PAUSED: apiConnectionPaused(env),
    ALLOW_LIVE_EXTERNAL_API: isEnabled(env, "ALLOW_LIVE_EXTERNAL_API"),
    ALLOW_FINAL_EXECUTION: isEnabled(env, "ALLOW_FINAL_EXECUTION"),
    ALLOW_SCHEDULED_WRITES: isEnabled(env, "ALLOW_SCHEDULED_WRITES"),
    liveExecutionAllowed: liveExecutionAllowed(env),
    credentials: credentialStatus(env),
  };
}

function routeInventory() {
  return [
    { method: "GET", path: "/api/health", purpose: "Health check" },
    { method: "GET", path: "/api/system/public-ip", purpose: "Current outbound public IP for Coupang/Toss allowlist checks" },
    {
      method: "GET",
      path: "/api/system/status",
      purpose: "Safety gate and storage status",
    },
    { method: "GET", path: "/api/system/routes", purpose: "Route inventory" },
    {
      method: "GET",
      path: "/api/system/connection-check",
      purpose: "Supabase table and credential connection check",
    },
    {
      method: "GET",
      path: "/api/system/server-operation-check",
      purpose:
        "Server operation readiness checklist for deployment and live use before step 1",
    },
    {
      method: "GET",
      path: "/api/system/readiness",
      purpose: "V62 full workflow readiness",
    },
    {
      method: "GET",
      path: "/api/dashboard",
      purpose: "Workflow dashboard summary",
    },
    {
      method: "POST",
      path: "/api/operation/simple-temp/save",
      purpose: "Save operation data for up to 24 hours",
    },
    {
      method: "GET",
      path: "/api/operation/simple-temp/load",
      purpose: "Load operation data before expiration",
    },
    {
      method: "GET",
      path: "/api/operation/simple-temp/latest",
      purpose: "Load the latest non-expired Supabase temp session",
    },
    {
      method: "GET",
      path: "/api/operation/simple-temp/latest-orders",
      purpose:
        "Load latest non-expired session that contains order rows for mapping audit",
    },
    {
      method: "POST",
      path: "/api/operation/settings/save",
      purpose:
        "Persist mapping, purchase, invoice, and marketplace shipment form settings until explicit deletion",
    },
    {
      method: "GET",
      path: "/api/operation/settings/load",
      purpose: "Load persistent mapping and form settings by settings key",
    },
    {
      method: "GET",
      path: "/api/operation/settings/latest",
      purpose: "Load latest persistent mapping and form settings",
    },
    {
      method: "POST",
      path: "/api/operation/settings/delete",
      purpose: "Delete persistent mapping and form settings by settings key",
    },
    {
      method: "POST",
      path: "/api/operation/logs/save",
      purpose: "Save a manual server operation audit log",
    },
    {
      method: "GET",
      path: "/api/operation/logs/latest",
      purpose: "Read recent server operation audit logs",
    },
    {
      method: "POST",
      path: "/api/integrations/orders/collect-preview",
      purpose: "Coupang/Toss order collection preview with manual trigger",
    },
    {
      method: "POST",
      path: "/api/integrations/orders/diagnose",
      purpose: "Coupang/Toss order API diagnostic test without importing rows",
    },
    {
      method: "POST",
      path: "/api/integrations/coupang/products/prices-sync",
      purpose: "Fetch current Coupang vendorItem sale prices for coupon profit validation",
    },
    {
      method: "POST",
      path: "/api/integrations/toss/products/options-sync",
      purpose: "Fetch Toss product item option IDs from product APIs and build option mapping automatically",
    },
    {
      method: "POST",
      path: "/api/integrations/shipments/upload-plan",
      purpose: "Coupang/Toss shipment registration file generation preview",
    },
    {
      method: "POST",
      path: "/api/integrations/shipments/upload-execute",
      purpose: "Upload Coupang/Toss shipment registrations when live Gate and channel paths are configured",
    },
    {
      method: "POST",
      path: "/api/integrations/coupons/action-preview",
      purpose:
        "Coupang option-level instant discount coupon cancel/apply preview or live gated call",
    },
    {
      method: "POST",
      path: "/api/scheduler/run-preview",
      purpose: "Scheduler automatic-run preview",
    },
    {
      method: "POST",
      path: "/api/scheduler/tick",
      purpose: "Manual scheduler tick using saved coupon and storage schedules",
    },
    {
      method: "GET",
      path: "/api/storage/status",
      purpose: "Server storage usage preview",
    },
    {
      method: "POST",
      path: "/api/storage/cleanup",
      purpose: "Delete expired temp sessions only",
    },
    {
      method: "POST",
      path: "/api/operation/v2/dry-run/full",
      purpose: "Full workflow dry run without external API",
    },
  ];
}

function supabaseNotConfiguredResponse(action: string) {
  return jsonResponse({
    ok: false,
    mode: `${action}_supabase_not_configured`,
    data: null,
    safety: { externalApiExecuted: false, finalExecutionStillDisabled: true },
    message:
      "Supabase 환경변수가 없어서 서버 작업을 실행하지 않았습니다. 브라우저 저장자료는 유지됩니다.",
  });
}

async function deleteExpiredTempSessions(env: Env) {
  if (!supabaseConfigured(env))
    return {
      deleted: false,
      reason: "supabase_not_configured",
      deletedRows: 0,
    };
  const db = supabaseAdmin(env);
  const { count, error } = await db
    .from("operation_temp_sessions")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
  return {
    deleted: true,
    reason: "expired_temp_sessions_deleted",
    deletedRows: count || 0,
  };
}

async function saveSimpleTempSession(request: Request, env: Env) {
  const body = await readJson<SimpleTempPayload>(request);
  const sessionKey = sanitizeTempSessionKey(body.sessionKey);
  const expiresInHours = safeExpiryHours(body.expiresInHours);
  const expiresAt = expiresAtAfterHours(expiresInHours);
  const data = body.data || {};

  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("simple_temp_save");

  const db = supabaseAdmin(env);
  await deleteExpiredTempSessions(env);
  const { error } = await db.from("operation_temp_sessions").upsert(
    {
      session_key: sessionKey,
      payload: data,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_key" },
  );

  if (error) throw error;
  return jsonResponse({
    ok: true,
    mode: "server_temp_saved_24h_v62",
    sessionKey,
    expiresAt,
    safety: safetyStatus(env),
    message: `서버에 1일 임시보관했습니다. 만료시각: ${expiresAt}`,
  });
}

async function loadSimpleTempSession(url: URL, env: Env) {
  const sessionKey = sanitizeTempSessionKey(url.searchParams.get("sessionKey"));
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("simple_temp_load");

  const db = supabaseAdmin(env);
  await deleteExpiredTempSessions(env);
  const { data, error } = await db
    .from("operation_temp_sessions")
    .select("session_key,payload,expires_at,updated_at")
    .eq("session_key", sessionKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return jsonResponse({
      ok: false,
      mode: "server_temp_not_found_or_expired_v62",
      sessionKey,
      data: null,
      safety: safetyStatus(env),
      message: "서버 임시자료가 없거나 1일 보관기간이 만료되었습니다.",
    });
  }

  return jsonResponse({
    ok: true,
    mode: "server_temp_loaded_v62",
    sessionKey: data.session_key,
    expiresAt: data.expires_at,
    updatedAt: data.updated_at,
    data: data.payload,
    safety: safetyStatus(env),
    message: "서버 1일 임시자료를 불러왔습니다.",
  });
}

async function loadLatestTempSession(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("simple_temp_latest");

  const db = supabaseAdmin(env);
  await deleteExpiredTempSessions(env);
  const { data, error } = await db
    .from("operation_temp_sessions")
    .select("session_key,payload,expires_at,updated_at")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return jsonResponse({
      ok: false,
      mode: "server_temp_latest_not_found_v62",
      data: null,
      safety: safetyStatus(env),
      message: "Supabase에 불러올 최신 1일 임시자료가 없습니다.",
    });
  }

  return jsonResponse({
    ok: true,
    mode: "server_temp_latest_loaded_v62",
    sessionKey: data.session_key,
    expiresAt: data.expires_at,
    updatedAt: data.updated_at,
    data: data.payload,
    safety: safetyStatus(env),
    message: `Supabase 최신 임시자료를 불러왔습니다. 키: ${data.session_key}`,
  });
}

async function loadLatestOrderSession(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("simple_temp_latest_orders");

  const db = supabaseAdmin(env);
  await deleteExpiredTempSessions(env);
  const { data, error } = await db
    .from("operation_temp_sessions")
    .select("session_key,payload,expires_at,updated_at")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  const found = (data || []).find((row) => {
    const payload = row.payload as Record<string, unknown> | null;
    return Array.isArray(payload?.orders) && payload.orders.length > 0;
  });

  if (!found) {
    return jsonResponse({
      ok: false,
      mode: "server_temp_latest_orders_not_found_v45",
      data: null,
      safety: safetyStatus(env),
      message:
        "Supabase 1일 임시자료 안에서 주문 행이 들어 있는 자료를 찾지 못했습니다.",
    });
  }

  return jsonResponse({
    ok: true,
    mode: "server_temp_latest_orders_loaded_v45",
    sessionKey: found.session_key,
    expiresAt: found.expires_at,
    updatedAt: found.updated_at,
    data: found.payload,
    safety: safetyStatus(env),
    message: `Supabase 주문자료를 불러왔습니다. 키: ${found.session_key}`,
  });
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function makePersistentSettingsSummary(data: Record<string, unknown>) {
  return {
    mappingRows: asArray(data.mappings).length,
    tossOptionIdRows: asArray(data.tossOptionIdRows).length,
    coupangOptionMasterRows: asArray(data.coupangOptionMasterRows).length,
    purchaseTemplates: asArray(data.purchaseTemplates).length,
    invoiceTemplates: asArray(data.invoiceTemplates).length,
    shipmentTemplates: asArray(data.shipmentTemplates).length,
    channelPurchaseTemplates: asArray(data.channelPurchaseTemplates).length,
    couponRows: asArray(data.couponRows).length,
    savedAt: data.savedAt,
    version: data.version,
    serverSaveMode: data.serverSaveMode || "settings-save-v175",
  };
}

function compactPersistentSettingsData(data: Record<string, unknown>, settingsKey: string) {
  const compact: Record<string, unknown> = {
    mappings: asArray(data.mappings),
    tossOptionIdRows: asArray(data.tossOptionIdRows),
    coupangOptionMasterRows: asArray(data.coupangOptionMasterRows),
    purchaseTemplates: asArray(data.purchaseTemplates),
    invoiceTemplates: asArray(data.invoiceTemplates),
    shipmentTemplates: asArray(data.shipmentTemplates),
    channelPurchaseTemplates: asArray(data.channelPurchaseTemplates),
    couponRows: asArray(data.couponRows),
    rollingCouponTemplates: asArray(data.rollingCouponTemplates),
    b2bVendorLinks: asArray(data.b2bVendorLinks),
    couponApiSettings: asPlainRecord(data.couponApiSettings),
    folderNames: asPlainRecord(data.folderNames),
    schedules: asPlainRecord(data.schedules),
    settingsKey,
    savedAt: new Date().toISOString(),
    version: data.version || "V177 Worker 고정IP 게이트웨이 안정화",
    serverSaveMode: "server-compacted-v175",
  };
  compact.serverSaveSummary = makePersistentSettingsSummary(compact);
  return compact;
}

async function upsertPersistentSettingsRow(env: Env, settingsKey: string, data: Record<string, unknown>) {
  const db = supabaseAdmin(env);
  return db.from("operation_persistent_settings").upsert(
    {
      settings_key: settingsKey,
      payload: data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "settings_key" },
  );
}

function supabaseErrorMessage(error: unknown) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message;
  const record = asPlainRecord(error);
  return String(record.message || record.details || record.hint || JSON.stringify(error));
}

async function savePersistentSettings(request: Request, env: Env) {
  const body = await readJson<PersistentSettingsPayload>(request);
  const settingsKey = sanitizeSettingsKey(body.settingsKey);
  const incoming = asPlainRecord(body.data);
  const data: Record<string, unknown> = {
    ...incoming,
    settingsKey,
    savedAt: new Date().toISOString(),
    serverSaveSummary: makePersistentSettingsSummary(incoming),
  };

  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("settings_save");

  const first = await upsertPersistentSettingsRow(env, settingsKey, data);
  if (!first.error) {
    const summary = makePersistentSettingsSummary(data);
    return jsonResponse({
      ok: true,
      mode: "persistent_settings_saved_v175",
      sessionKey: settingsKey,
      summary,
      data,
      safety: safetyStatus(env),
      message: `서버에 매핑/양식 설정을 저장했습니다. 매핑 ${summary.mappingRows}건 / 설정 키: ${settingsKey}`,
    });
  }

  const compactData = compactPersistentSettingsData(data, settingsKey);
  const fallback = await upsertPersistentSettingsRow(env, settingsKey, compactData);
  if (!fallback.error) {
    const summary = makePersistentSettingsSummary(compactData);
    return jsonResponse({
      ok: true,
      mode: "persistent_settings_saved_compact_fallback_v175",
      sessionKey: settingsKey,
      summary,
      data: compactData,
      warning: supabaseErrorMessage(first.error),
      safety: safetyStatus(env),
      message: `서버에 매핑 중심 설정을 저장했습니다. 매핑 ${summary.mappingRows}건 / 설정 키: ${settingsKey}`,
    });
  }

  return jsonResponse(
    {
      ok: false,
      mode: "persistent_settings_save_failed_v175",
      sessionKey: settingsKey,
      summary: makePersistentSettingsSummary(compactData),
      error: supabaseErrorMessage(fallback.error),
      firstError: supabaseErrorMessage(first.error),
      safety: safetyStatus(env),
      message: `서버 설정 저장 실패: ${supabaseErrorMessage(fallback.error)}`,
    },
    { status: 500 },
  );
}

async function loadPersistentSettings(url: URL, env: Env) {
  const settingsKey = sanitizeSettingsKey(url.searchParams.get("settingsKey"));
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("settings_load");

  const db = supabaseAdmin(env);
  const { data, error } = await db
    .from("operation_persistent_settings")
    .select("settings_key,payload,updated_at")
    .eq("settings_key", settingsKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return jsonResponse({
      ok: false,
      mode: "persistent_settings_not_found_v62",
      sessionKey: settingsKey,
      data: null,
      safety: safetyStatus(env),
      message: "서버에 저장된 매핑/양식 설정이 없습니다.",
    });
  }

  return jsonResponse({
    ok: true,
    mode: "persistent_settings_loaded_v62",
    sessionKey: data.settings_key,
    updatedAt: data.updated_at,
    data: data.payload,
    safety: safetyStatus(env),
    message: `서버 매핑/양식 설정을 불러왔습니다. 설정 키: ${data.settings_key}`,
  });
}

async function loadLatestPersistentSettings(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("settings_latest");

  const db = supabaseAdmin(env);
  const { data, error } = await db
    .from("operation_persistent_settings")
    .select("settings_key,payload,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return jsonResponse({
      ok: false,
      mode: "persistent_settings_latest_not_found_v62",
      data: null,
      safety: safetyStatus(env),
      message: "서버에 저장된 최신 매핑/양식 설정이 없습니다.",
    });
  }

  return jsonResponse({
    ok: true,
    mode: "persistent_settings_latest_loaded_v62",
    sessionKey: data.settings_key,
    updatedAt: data.updated_at,
    data: data.payload,
    safety: safetyStatus(env),
    message: `서버 최신 매핑/양식 설정을 불러왔습니다. 설정 키: ${data.settings_key}`,
  });
}

async function deletePersistentSettings(request: Request, env: Env) {
  const body = await readJson<PersistentSettingsPayload>(request);
  const settingsKey = sanitizeSettingsKey(body.settingsKey);
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("settings_delete");

  const db = supabaseAdmin(env);
  const { count, error } = await db
    .from("operation_persistent_settings")
    .delete({ count: "exact" })
    .eq("settings_key", settingsKey);

  if (error) throw error;
  return jsonResponse({
    ok: true,
    mode: "persistent_settings_deleted_v62",
    sessionKey: settingsKey,
    summary: { deletedRows: count || 0 },
    safety: safetyStatus(env),
    message: count
      ? `서버 매핑/양식 설정을 삭제했습니다. 설정 키: ${settingsKey}`
      : `삭제할 서버 설정이 없습니다. 설정 키: ${settingsKey}`,
  });
}

async function supabaseConnectionCheck(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("supabase_connection_check");
  const db = supabaseAdmin(env);
  const temp = await db
    .from("operation_temp_sessions")
    .select("session_key", { count: "exact", head: true });
  const settings = await db
    .from("operation_persistent_settings")
    .select("settings_key", { count: "exact", head: true });
  const logs = await db
    .from("operation_audit_logs")
    .select("id", { count: "exact", head: true });
  const tempOk = !temp.error;
  const settingsOk = !settings.error;
  const logsOk = !logs.error;
  return jsonResponse(
    {
      ok: tempOk && settingsOk && logsOk,
      mode: "supabase_connection_check_v62",
      summary: {
        sqlFile: SERVER_OPERATION_SQL_FILE,
        requiredTables: SERVER_REQUIRED_TABLES,
        supabaseConfigured: true,
        tempTable: tempOk ? "ok" : "error",
        persistentSettingsTable: settingsOk ? "ok" : "error",
        auditLogTable: logsOk ? "ok" : "error",
        tempRows: temp.count || 0,
        settingsRows: settings.count || 0,
        logRows: logs.count || 0,
        tempError: temp.error?.message || null,
        settingsError: settings.error?.message || null,
        logsError: logs.error?.message || null,
      },
      safety: safetyStatus(env),
      message:
        tempOk && settingsOk && logsOk
          ? `Supabase 연결 확인 완료: 임시자료 ${temp.count || 0}건, 영구설정 ${settings.count || 0}건, 운영로그 ${logs.count || 0}건을 확인했습니다.`
          : `Supabase 환경변수는 있으나 테이블 확인 중 오류가 있습니다. ${SERVER_OPERATION_SQL_FILE} 실행 여부를 확인하세요.`,
    },
    { status: tempOk && settingsOk && logsOk ? 200 : 500 },
  );
}

type ServerCheck = {
  name: string;
  status: "정상" | "확인필요" | "차단유지" | "준비";
  detail: string;
};

async function serverOperationCheck(env: Env) {
  const checks: ServerCheck[] = [
    {
      name: "스케줄 쓰기",
      status: scheduledWritesAllowed(env) ? "확인필요" : "차단유지",
      detail: scheduledWritesAllowed(env)
        ? "ALLOW_SCHEDULED_WRITES가 켜져 있습니다. 예약 실행 범위를 재확인하세요."
        : "ALLOW_SCHEDULED_WRITES=false, 예약 쓰기 실행은 차단됩니다.",
    },
    {
      name: "실 API 수동 Gate",
      status: liveExecutionAllowed(env) ? "준비" : "차단유지",
      detail: apiConnectionPaused(env)
        ? "안전모드(API_CONNECTION_PAUSED=true)로 실제 쿠팡/토스 API 연결을 중단했습니다."
        : liveExecutionAllowed(env)
          ? "실 API 수동 Gate 2개가 켜져 있습니다. 버튼 수동 실행은 가능합니다."
          : "수동 실 API 실행에는 API_CONNECTION_PAUSED=false, live API Gate, final execution Gate가 모두 필요합니다.",
    },
    {
      name: "쿠팡 API 키",
      status: coupangConfigured(env) ? "준비" : "확인필요",
      detail: coupangConfigured(env)
        ? "Vendor ID, Access Key, Secret Key가 설정되어 있습니다."
        : "Cloudflare Secret 또는 .dev.vars에 쿠팡 키를 입력해야 합니다.",
    },
    {
      name: "토스 API 키",
      status: tossConfigured(env) ? "준비" : "확인필요",
      detail: tossConfigured(env)
        ? "토스 인증 값이 설정되어 있습니다."
        : "토스 API 키 또는 Client ID/Secret 설정이 필요합니다.",
    },
    {
      name: "쿠팡 주문 경로",
      status: env.COUPANG_ORDERS_PATH ? "준비" : "확인필요",
      detail: env.COUPANG_ORDERS_PATH
        ? "COUPANG_ORDERS_PATH가 설정되어 있습니다."
        : "쿠팡 주문조회 API 경로를 환경변수로 확정해야 합니다.",
    },
    {
      name: "토스 주문 경로",
      status: configuredPath(env.TOSS_ORDERS_PATH, TOSS_DEFAULT_ORDERS_PATH) ? "준비" : "확인필요",
      detail: env.TOSS_ORDERS_PATH
        ? "TOSS_ORDERS_PATH가 설정되어 있습니다."
        : `TOSS_ORDERS_PATH 미입력 시 기본 주문조회 경로 ${TOSS_DEFAULT_ORDERS_PATH}를 사용합니다.`,
    },
    {
      name: "송장 API 경로",
      status:
        env.COUPANG_SHIPMENT_UPLOAD_PATH || env.TOSS_SHIPMENT_UPLOAD_PATH
          ? "준비"
          : "확인필요",
      detail:
        env.COUPANG_SHIPMENT_UPLOAD_PATH || env.TOSS_SHIPMENT_UPLOAD_PATH
          ? "송장등록 경로 일부가 설정되어 있습니다."
          : "실 송장등록 전 쿠팡/토스 송장 API 경로 확정이 필요합니다.",
    },
    {
      name: "쿠폰 API 경로",
      status:
        env.COUPANG_COUPON_APPLY_PATH && env.COUPANG_COUPON_CANCEL_PATH
          ? "준비"
          : "확인필요",
      detail:
        env.COUPANG_COUPON_APPLY_PATH && env.COUPANG_COUPON_CANCEL_PATH
          ? "쿠폰 등록/취소 경로가 모두 설정되어 있습니다."
          : "옵션별 쿠폰 등록/취소 API 경로를 환경변수로 확정해야 합니다.",
    },
  ];

  checks.unshift({
    name: "현재 API 호출 IP",
    status: "확인필요",
    detail: "쿠팡/토스 IP 제한 오류가 있으면 운영설정의 '현재 API 호출 IP 확인' 버튼으로 공인 IP를 확인해 양쪽 허용 IP에 등록하세요.",
  });

  if (!supabaseConfigured(env)) {
    checks.unshift({
      name: "Supabase",
      status: "확인필요",
      detail: "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
    });
  } else {
    const db = supabaseAdmin(env);
    const temp = await db
      .from("operation_temp_sessions")
      .select("session_key", { count: "exact", head: true });
    const settings = await db
      .from("operation_persistent_settings")
      .select("settings_key", { count: "exact", head: true });
    const logs = await db
      .from("operation_audit_logs")
      .select("id", { count: "exact", head: true });
    checks.unshift(
      {
        name: "Supabase 1일 임시보관",
        status: temp.error ? "확인필요" : "정상",
        detail: temp.error
          ? temp.error.message
          : `operation_temp_sessions ${temp.count || 0}건 확인`,
      },
      {
        name: "Supabase 영구설정",
        status: settings.error ? "확인필요" : "정상",
        detail: settings.error
          ? settings.error.message
          : `operation_persistent_settings ${settings.count || 0}건 확인`,
      },
      {
        name: "Supabase 운영로그",
        status: logs.error ? "확인필요" : "정상",
        detail: logs.error
          ? logs.error.message
          : `operation_audit_logs ${logs.count || 0}건 확인`,
      },
    );
  }

  const needsAttention = checks.filter(
    (check) => check.status === "확인필요",
  ).length;
  return jsonResponse(
    {
      ok: needsAttention === 0,
      mode: "server_operation_check_v62",
      summary: {
        sqlFile: SERVER_OPERATION_SQL_FILE,
        requiredApis: SERVER_REQUIRED_APIS,
        requiredTables: SERVER_REQUIRED_TABLES,
        checks,
        needsAttention,
        total: checks.length,
      },
      safety: safetyStatus(env),
      message: needsAttention
        ? `서버 운영점검 완료: 확인필요 ${needsAttention}건이 있습니다.`
        : "서버 운영점검 완료: 필수 서버 항목이 정상입니다.",
    },
    { status: 200 },
  );
}

function sanitizeEventType(value: unknown) {
  return (
    String(value || "manual_operation_checkpoint")
      .replace(/[^0-9A-Za-z가-힣_.:-]/g, "-")
      .slice(0, 80) || "manual_operation_checkpoint"
  );
}

async function saveOperationLog(request: Request, env: Env) {
  const body = await readJson<OperationLogPayload>(request);
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("operation_log_save");
  const db = supabaseAdmin(env);
  const eventType = sanitizeEventType(body.eventType);
  const payload = {
    ...(body.payload || {}),
    safety: safetyStatus(env),
    savedAt: new Date().toISOString(),
  };
  const { error } = await db
    .from("operation_audit_logs")
    .insert({ event_type: eventType, payload });
  if (error) throw error;
  return jsonResponse({
    ok: true,
    mode: "operation_log_saved_v62",
    summary: { eventType },
    safety: safetyStatus(env),
    message: `서버 운영로그를 저장했습니다. 유형: ${eventType}`,
  });
}

async function loadLatestOperationLogs(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("operation_logs_latest");
  const db = supabaseAdmin(env);
  const { data, error } = await db
    .from("operation_audit_logs")
    .select("id,event_type,payload,created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return jsonResponse({
    ok: true,
    mode: "operation_logs_latest_v62",
    data: data || [],
    safety: safetyStatus(env),
    message: `최근 운영로그 ${(data || []).length}건을 확인했습니다.`,
  });
}

function approximatePayloadBytes(rows: Array<Record<string, unknown>> | null | undefined) {
  return (rows || []).reduce((sum, row) => sum + new TextEncoder().encode(JSON.stringify(row.payload || {})).length, 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function storageRetentionDays(env: Env) {
  const days = Number(env.STORAGE_AUDIT_LOG_RETENTION_DAYS || 30);
  return Number.isFinite(days) ? Math.min(Math.max(days, 7), 365) : 30;
}

async function storageUsageSummary(env: Env) {
  const db = supabaseAdmin(env);
  const now = new Date().toISOString();
  const [{ count: tempCount, error: tempCountError }, { count: activeCount, error: activeError }, { count: expiredCount, error: expiredError }, { count: settingsCount, error: settingsCountError }, { count: logCount, error: logCountError }] = await Promise.all([
    db.from("operation_temp_sessions").select("session_key", { count: "exact", head: true }),
    db.from("operation_temp_sessions").select("session_key", { count: "exact", head: true }).gt("expires_at", now),
    db.from("operation_temp_sessions").select("session_key", { count: "exact", head: true }).lt("expires_at", now),
    db.from("operation_persistent_settings").select("settings_key", { count: "exact", head: true }),
    db.from("operation_audit_logs").select("id", { count: "exact", head: true }),
  ]);
  for (const error of [tempCountError, activeError, expiredError, settingsCountError, logCountError]) {
    if (error) throw error;
  }
  const [{ data: tempPayloads, error: tempPayloadError }, { data: settingPayloads, error: settingPayloadError }, { data: logPayloads, error: logPayloadError }] = await Promise.all([
    db.from("operation_temp_sessions").select("payload").limit(500),
    db.from("operation_persistent_settings").select("payload").limit(200),
    db.from("operation_audit_logs").select("payload").order("created_at", { ascending: false }).limit(1000),
  ]);
  for (const error of [tempPayloadError, settingPayloadError, logPayloadError]) {
    if (error) throw error;
  }
  const approxPayloadBytes = approximatePayloadBytes(tempPayloads as Array<Record<string, unknown>>) + approximatePayloadBytes(settingPayloads as Array<Record<string, unknown>>) + approximatePayloadBytes(logPayloads as Array<Record<string, unknown>>);
  return {
    tempSessionRows: tempCount || 0,
    activeSessionRows: activeCount || 0,
    expiredSessionRows: expiredCount || 0,
    persistentSettingsRows: settingsCount || 0,
    auditLogRows: logCount || 0,
    approxPayloadBytes,
    approxPayloadSize: formatBytes(approxPayloadBytes),
    retentionHours: 24,
    auditLogRetentionDays: storageRetentionDays(env),
    cleanupTarget: "expired operation_temp_sessions + old operation_audit_logs only",
    protectedTarget: "operation_persistent_settings / current active temp sessions",
  };
}

async function deleteOldAuditLogs(env: Env) {
  if (!supabaseConfigured(env))
    return { deleted: false, reason: "supabase_not_configured", deletedRows: 0 };
  const db = supabaseAdmin(env);
  const cutoff = new Date(Date.now() - storageRetentionDays(env) * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from("operation_audit_logs")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (error) throw error;
  return {
    deleted: true,
    reason: "old_audit_logs_deleted",
    retentionDays: storageRetentionDays(env),
    deletedRows: count || 0,
  };
}

async function storageStatus(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("storage_status");
  const summary = await storageUsageSummary(env);
  return jsonResponse({
    ok: true,
    mode: "storage_status_v91_rows_and_payload_size",
    summary,
    safety: safetyStatus(env),
    message: `서버 임시저장 ${summary.tempSessionRows}건(활성 ${summary.activeSessionRows}건, 만료 ${summary.expiredSessionRows}건), 영구설정 ${summary.persistentSettingsRows}건, 운영로그 ${summary.auditLogRows}건입니다. 추정 JSON 용량은 ${summary.approxPayloadSize}이며 정리는 만료 임시자료와 ${summary.auditLogRetentionDays}일 초과 운영로그만 대상으로 합니다.`,
  });
}

async function cleanupStorage(env: Env) {
  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("storage_cleanup");
  const temp = await deleteExpiredTempSessions(env);
  const logs = await deleteOldAuditLogs(env);
  const after = await storageUsageSummary(env);
  return jsonResponse({
    ok: true,
    mode: "storage_cleanup_expired_and_old_logs_v91",
    summary: { temp, logs, after },
    safety: safetyStatus(env),
    message:
      `서버 보관기간이 지난 임시자료 ${temp.deletedRows}건과 ${after.auditLogRetentionDays}일 초과 운영로그 ${logs.deletedRows}건을 정리했습니다. 현재 작업자료와 매핑·양식·쿠폰 영구설정은 삭제하지 않았습니다. 현재 추정 용량은 ${after.approxPayloadSize}입니다.`,
  });
}


function addNormalizationDiagnostic(
  result: ExternalApiResult,
  rawCount: number,
  normalizedCount: number,
) {
  let status: ExternalDiagnosticStep["status"] = "정상";
  let detail = `외부 응답 원본 ${rawCount}건에서 표준 주문행 ${normalizedCount}건을 변환했습니다.`;

  const tossBizError = tossBusinessErrorMessage(result.data);
  if (!result.ok) {
    status = "오류";
    detail =
      externalErrorKind(result) === "IP_NOT_ALLOWED"
        ? "쿠팡 API가 현재 접속 IP를 허용하지 않아 주문행으로 변환할 데이터가 없습니다. IP 허용 설정 후 다시 조회하세요."
        : `외부 응답은 HTTP ${result.status} 오류라 표준 주문행으로 변환하지 않았습니다.`;
  } else if (tossBizError) {
    status = "오류";
    detail = `HTTP ${result.status} 응답은 받았지만 토스 응답 내부 오류가 있습니다: ${tossBizError}`;
  } else if (rawCount === 0 && normalizedCount === 0) {
    status = "정상";
    detail = `HTTP ${result.status} 정상 응답이지만 조회기간/상태값에 해당하는 주문이 없습니다. 토스는 상태값을 비우거나 전체로 두고 날짜 범위를 넓혀 다시 확인하세요. 응답 구조: ${rootKeySummary(result.data)}, 배열 위치: ${arrayPathSummaries(result.data)}`;
  } else if (rawCount > 0 && normalizedCount === 0) {
    status = "오류";
    detail = `외부 응답 원본 ${rawCount}건을 받았지만 표준 주문행으로 변환된 데이터가 없습니다. 응답 구조: ${rootKeySummary(result.data)}, 배열 위치: ${arrayPathSummaries(result.data)}`;
  }

  result.diagnostics = [
    ...(result.diagnostics || []),
    {
      step: "표준 주문 변환",
      status,
      detail,
    },
  ];
}

async function collectOrdersPreview(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const channel =
    body.channel === "토스" || body.channel === "toss" ? "토스" : "쿠팡";
  const live = liveExecutionAllowed(env);

  if (live && channel === "쿠팡" && coupangOrdersPath(env)) {
    const rangeDays = coupangRangeDates(body);
    const statuses = coupangStatusList(body, env);
    const maxPages = envNumber((body.query || {}).maxPages || env.COUPANG_ORDER_MAX_PAGES, 10, 1, 100);
    const rawPath = coupangOrdersPath(env);
    const dayResults: ExternalApiResult[] = [];
    const allOrders: unknown[] = [];
    const diagnostics: ExternalDiagnosticStep[] = [
      {
        step: "쿠팡 주문수집",
        status: "준비",
        detail: `쿠팡 수집은 v5 일단위 +09:00을 1순위로 사용하고, 0건/400 응답이면 계정별 차이에 대비해 검증된 대체방식을 자동 확인합니다. 조회범위 ${rangeDays.length}일 x 상태 ${statuses.join(",")}.`,
      },
    ];

    for (const status of statuses) {
      for (const day of rangeDays) {
        const result = await collectCoupangOrdersForDayStatus(env, body, rawPath, day, status, maxPages);
        const dayRows = normalizedOrdersFromExternal(result.data, channel);
        dayResults.push(result);
        allOrders.push(...dayRows);
        diagnostics.push({
          step: `쿠팡 ${day} ${status} 최종수집`,
          status: result.ok ? "정상" : "오류",
          detail: result.ok
            ? `쿠팡 일단위 조회로 표준 주문행 ${dayRows.length}건을 수집했습니다.`
            : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
        });
        await waitBetweenCoupangDayRequests(env);
      }
    }

    const dedupedOrders = dedupeStandardOrders(allOrders);
    const combined = combinedExternalResult(dayResults, dedupedOrders, [
      ...diagnostics,
      ...mergeExternalDiagnostics(dayResults),
    ]);
    addNormalizationDiagnostic(combined, dedupedOrders.length, dedupedOrders.length);
    return jsonResponse(
      {
        ok: combined.ok,
        mode: "coupang_order_collect_live_v147_stable_fallback",
        channel,
        summary: {
          ...compactExternalResult(combined),
          rangeDays,
          statuses,
          rawRows: dedupedOrders.length,
          normalizedRows: dedupedOrders.length,
          sampleOrders: dedupedOrders,
          deliveryMessageRows: dedupedOrders.filter((row) => safeText((row as Record<string, unknown>).memo)).length,
        },
        externalApiExecuted: true,
        safety: safetyStatus(env),
        message: combined.ok
          ? `쿠팡 주문 API ${body.diagnosticOnly ? "진단" : "수집"}을 실행했습니다. ${dedupedOrders.length}건을 표준 주문행으로 확인했고 배송메시지 ${dedupedOrders.filter((row) => safeText((row as Record<string, unknown>).memo)).length}건을 반영했습니다.`
          : "쿠팡 주문조회에 실패했습니다. 진단표의 HTTP 상태, IP 허용, 인증 정보를 확인하세요.",
      },
      { status: handledExternalHttpStatus(combined, body.diagnosticOnly) },
    );
  }

  if (live && channel === "토스" && configuredPath(env.TOSS_ORDERS_PATH, TOSS_DEFAULT_ORDERS_PATH)) {
    const rawPath = configuredPath(env.TOSS_ORDERS_PATH, TOSS_DEFAULT_ORDERS_PATH);
    const baseQuery = normalizeOrderQuery(channel, body, env);
    const maxPages = envNumber((body.query || {}).maxPages || env.TOSS_ORDER_MAX_PAGES, TOSS_DEFAULT_MAX_PAGES, 1, 100);
    const pageResults: ExternalApiResult[] = [];
    const allOrders: unknown[] = [];
    const diagnostics: ExternalDiagnosticStep[] = [
      {
        step: "토스 주문수집",
        status: "준비",
        detail: `공식 주문조회 경로 ${rawPath}, limit ${baseQuery.limit || 50}, 최대 ${maxPages}페이지, nextCursor 방식으로 수집합니다.`,
      },
    ];
    let nextCursor = String(baseQuery.nextCursor || "").trim();

    for (let page = 1; page <= maxPages; page += 1) {
      const query = {
        ...baseQuery,
        ...(nextCursor ? { nextCursor } : {}),
      };
      const result = await tossRequest(env, "GET", rawPath, query);
      const pageRawRows = firstArrayPayload(result.data);
      const pageOrders = normalizedOrdersFromExternal(result.data, channel);
      pageResults.push(result);
      allOrders.push(...pageOrders);
      diagnostics.push({
        step: `토스 주문 ${page}페이지`,
        status: result.ok ? "정상" : "오류",
        detail: result.ok
          ? `원본 ${pageRawRows.length}건, 표준 주문행 ${pageOrders.length}건을 확인했습니다.`
          : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
      });
      if (!result.ok) break;
      nextCursor = tossNextCursor(result.data);
      if (!nextCursor) break;
    }

    const dedupedOrders = dedupeStandardOrders(allOrders);
    const combined = combinedExternalResult(pageResults, dedupedOrders, [
      ...diagnostics,
      ...mergeExternalDiagnostics(pageResults),
    ]);
    addNormalizationDiagnostic(combined, dedupedOrders.length, dedupedOrders.length);
    return jsonResponse(
      {
        ok: combined.ok,
        mode: "toss_order_collect_live_v151_orders_v2_paging",
        channel,
        summary: {
          ...compactExternalResult(combined),
          rawRows: dedupedOrders.length,
          normalizedRows: dedupedOrders.length,
          sampleOrders: dedupedOrders,
          pages: pageResults.length,
          hasNextCursor: Boolean(nextCursor),
          deliveryMessageRows: dedupedOrders.filter((row) => safeText((row as Record<string, unknown>).memo)).length,
        },
        externalApiExecuted: true,
        safety: safetyStatus(env),
        message: combined.ok
          ? `토스 주문 API ${body.diagnosticOnly ? "진단" : "수집"}을 실행했습니다. ${dedupedOrders.length}건을 표준 주문행으로 확인했고 배송메시지 ${dedupedOrders.filter((row) => safeText((row as Record<string, unknown>).memo)).length}건을 반영했습니다.`
          : combined.phase === "toss_token"
            ? `토스 토큰 발급 오류: ${combined.status}. 진단 표에서 Token URL, scope, 권한/IP 설정을 확인하세요.`
            : `토스 주문 API ${body.diagnosticOnly ? "진단" : "응답"} 오류: ${combined.status}. 진단 표에서 Bearer 인증, IP 허용, 주문조회 응답을 확인하세요.`,
      },
      { status: handledExternalHttpStatus(combined, body.diagnosticOnly) },
    );
  }

  const paused = apiConnectionPaused(env);
  return jsonResponse({
    ok: true,
    mode: paused
      ? "order_collect_api_connection_paused_v147"
      : live
        ? "order_collect_live_waiting_for_endpoint_v70"
        : "order_collect_preview_only_v70",
    channel,
    summary: {
      sampleOrders: [],
      scheduled: body.schedules || null,
      manual: Boolean(body.manual),
      credentials: credentialStatus(env),
    },
    safety: safetyStatus(env),
    message: paused
      ? `${channel} API 연결은 안전모드에서 중단되어 외부 주문 API를 호출하지 않았습니다. 수집 실패 원인을 먼저 점검하려면 진단표와 .dev.vars 값을 확인하세요.`
      : live
        ? `${channel} API 키/Gate는 확인했지만 주문 API 호출 조건이 부족해 실제 호출은 실행하지 않았습니다. 토스는 기본 경로가 내장되어 있으므로 인증값과 IP 허용을 확인하세요.`
        : `${channel} API 주문 수집 Preview를 완료했습니다. 실제 외부 API 호출은 Gate로 차단되어 주문 데이터는 추가하지 않았습니다.`,
  });
}

async function shipmentUploadPlan(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (liveExecutionAllowed(env)) {
    return jsonResponse({
      ok: true,
      mode: "shipment_upload_live_ready_v62",
      requestedRows: rows.length,
      readyRows: rows.length,
      externalApiExecuted: false,
      safety: safetyStatus(env),
      message:
        "송장등록 API는 실제 호출 전 쿠팡/토스별 최종 업로드 경로와 요청 필드 검증이 필요합니다. 현재는 파일 생성과 Gate 검증까지만 완료했습니다.",
    });
  }
  return jsonResponse({
    ok: true,
    mode: "shipment_upload_preview_only_v62",
    requestedRows: rows.length,
    readyRows: rows.length,
    externalApiExecuted: false,
    finalExecutionStillDisabled: true,
    safety: safetyStatus(env),
    message: `쿠팡/토스 송장 등록 Preview ${rows.length}건을 생성했습니다. 실제 송장 등록은 실행하지 않았습니다.`,
  });
}

function shipmentChannel(row: unknown) {
  const obj = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const value = String(obj.channel || obj.marketplace || "");
  return value === "토스" || value.toLowerCase() === "toss" ? "토스" : "쿠팡";
}


function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function rowChannelText(row: unknown) {
  const obj = asRecord(row);
  return String(obj.channel || obj.marketplace || "").trim();
}

function rowRawRecord(row: unknown) {
  const obj = asRecord(row);
  return asRecord(obj.raw);
}

function cleanNumericId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const digits = text.replace(/[^0-9]/g, "");
  return digits || "";
}

function uniqueNumericIds(values: Array<string | number>) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = cleanNumericId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

function coupangPreparingShipmentBoxIds(rows: unknown[]) {
  const values: Array<string | number> = [];
  for (const row of rows) {
    if (!rowChannelText(row).includes("쿠팡")) continue;
    const obj = asRecord(row);
    const raw = rowRawRecord(row);
    values.push(
      obj.shipmentBoxId as string,
      raw.shipmentBoxId as string,
      raw["shipmentBox.shipmentBoxId"] as string,
      raw["parent.shipmentBoxId"] as string,
      raw["item.shipmentBoxId"] as string,
      obj.orderNo as string,
      raw.orderNo as string,
    );
  }
  return uniqueNumericIds(values);
}

function tossPreparingOrderProductIds(rows: unknown[]) {
  const values: Array<string | number> = [];
  for (const row of rows) {
    if (!rowChannelText(row).includes("토스")) continue;
    const obj = asRecord(row);
    const raw = rowRawRecord(row);
    values.push(
      obj.orderProductId as string,
      obj.tossOrderProductId as string,
      raw.orderProductId as string,
      raw.tossOrderProductId as string,
      raw["item.orderProductId"] as string,
      raw["parent.orderProductId"] as string,
    );
  }
  return uniqueNumericIds(values);
}

function coupangAckSuccessCount(data: unknown, requested: number) {
  const flat = flattenObject(data);
  const responseList = firstArrayPayload(flat["data.responseList"] || nestedValue(objectRecord(data), "data.responseList") || data);
  if (responseList.length) {
    return responseList.filter((item) => objectRecord(item).succeed === true || String(objectRecord(item).resultCode || "").toUpperCase() === "OK").length;
  }
  const responseCode = String(firstText(flat, ["data.responseCode", "responseCode"]));
  if (responseCode === "0") return requested;
  return 0;
}

function tossStatusSuccessCount(data: unknown, requested: number) {
  const flat = flattenObject(data);
  const total = numericValue(flat["success.totalCount"] ?? nestedValue(objectRecord(data), "success.totalCount"));
  const failed = numericValue(flat["success.failedCount"] ?? nestedValue(objectRecord(data), "success.failedCount"));
  if (total !== null || failed !== null) return Math.max(0, (total ?? requested) - (failed ?? 0));
  return tossBusinessErrorMessage(data) ? 0 : requested;
}

function externalResultSucceeded(result: ExternalApiResult) {
  return result.ok && !tossBusinessErrorMessage(result.data);
}

async function orderAcknowledgeExecute(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const coupangIds = coupangPreparingShipmentBoxIds(rows);
  const tossIds = tossPreparingOrderProductIds(rows);

  if (!liveExecutionAllowed(env)) {
    return jsonResponse({
      ok: true,
      mode: "order_acknowledge_preview_gate_closed_v154",
      requestedRows: rows.length,
      externalApiExecuted: false,
      finalExecutionStillDisabled: true,
      safety: safetyStatus(env),
      summary: { coupangShipmentBoxIds: coupangIds.length, tossOrderProductIds: tossIds.length, results: [], diagnostics: [
        { step: "상품준비중 변경", status: "건너뜀", detail: "안전 Gate가 닫혀 있어 쿠팡/토스 실제 상태 변경은 실행하지 않았습니다." },
      ] },
      message: `상품수합 후 상태변경 대상 확인: 쿠팡 ${coupangIds.length}건, 토스 ${tossIds.length}건. 현재 안전 Gate가 닫혀 있어 판매자센터 상태는 변경하지 않았습니다.`,
    });
  }

  const diagnostics: ExternalDiagnosticStep[] = [];
  const results: Array<{ channel: string; requested: number; succeeded: number; ok: boolean; status: number; message: string }> = [];

  if (coupangIds.length) {
    const path = configuredPath(env.COUPANG_ORDER_ACK_PATH, COUPANG_DEFAULT_ORDER_ACK_PATH);
    for (const chunk of chunkArray(coupangIds, 50)) {
      const result = await coupangSignedRequestWithRetry(env, "PATCH", path, undefined, {
        vendorId: env.COUPANG_VENDOR_ID,
        shipmentBoxIds: chunk.map((id) => Number(id)),
      });
      diagnostics.push(...(result.diagnostics || []));
      const succeeded = coupangAckSuccessCount(result.data, chunk.length);
      results.push({
        channel: "쿠팡",
        requested: chunk.length,
        succeeded,
        ok: externalResultSucceeded(result) && succeeded === chunk.length,
        status: result.status,
        message: diagnosticMessage(result.data) || `HTTP ${result.status}`,
      });
    }
  }

  if (tossIds.length) {
    const path = configuredPath(env.TOSS_ORDER_STATUS_PATH, TOSS_DEFAULT_ORDER_STATUS_PATH);
    for (const chunk of chunkArray(tossIds, 100)) {
      const result = await tossRequest(env, "PUT", path, undefined, {
        orderProductIds: chunk.map((id) => Number(id)),
        status: "PREPARING_PRODUCT",
        partnerName: env.TOSS_PARTNER_NAME || "토스쇼핑",
      });
      diagnostics.push(...(result.diagnostics || []));
      const succeeded = tossStatusSuccessCount(result.data, chunk.length);
      results.push({
        channel: "토스",
        requested: chunk.length,
        succeeded,
        ok: externalResultSucceeded(result) && succeeded === chunk.length,
        status: result.status,
        message: diagnosticMessage(result.data) || `HTTP ${result.status}`,
      });
    }
  }

  if (!coupangIds.length && !tossIds.length) {
    diagnostics.push({
      step: "상품준비중 변경 대상", 
      status: "오류", 
      detail: "쿠팡 shipmentBoxId 또는 토스 orderProductId를 찾지 못했습니다. 주문수집 원본 필드가 보존되는지 확인하세요.",
    });
  }

  const requested = results.reduce((sum, row) => sum + row.requested, 0);
  const succeeded = results.reduce((sum, row) => sum + row.succeeded, 0);
  const allOk = requested > 0 && results.every((row) => row.ok);
  return jsonResponse({
    ok: allOk,
    mode: "order_acknowledge_live_v154_coupang_toss_preparing",
    requestedRows: rows.length,
    externalApiExecuted: results.length > 0,
    safety: safetyStatus(env),
    diagnostics,
    summary: {
      coupangShipmentBoxIds: coupangIds.length,
      tossOrderProductIds: tossIds.length,
      requested,
      succeeded,
      results,
      diagnostics,
    },
    message: results.length
      ? `상품수합 후 판매자센터 상태변경 실행: 요청 ${requested}건, 성공 ${succeeded}건. ${results.map((row) => `${row.channel} ${row.succeeded}/${row.requested}`).join(" / ")}`
      : "상품준비중으로 변경할 쿠팡 shipmentBoxId 또는 토스 orderProductId를 찾지 못했습니다.",
  }, { status: 200 });
}

function shipmentUploadPayloadRow(row: unknown) {
  const obj = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const raw = asRecord(obj.raw);
  const channel = shipmentChannel(row);
  const orderNo = String(obj.orderNo || obj.marketplaceOrderId || raw.orderNo || raw.orderId || "");
  return {
    channel,
    orderNo,
    shipmentBoxId: cleanNumericId(obj.shipmentBoxId || raw.shipmentBoxId || raw["shipmentBox.shipmentBoxId"] || raw["parent.shipmentBoxId"] || raw["item.shipmentBoxId"]),
    orderId: cleanNumericId(obj.orderId || raw.orderId || raw.marketplaceOrderId || orderNo),
    vendorItemId: cleanNumericId(obj.vendorItemId || obj.optionId || raw.vendorItemId || raw.vendorItemIdStr || raw["item.vendorItemId"] || raw["parent.vendorItemId"]),
    orderProductId: cleanNumericId(obj.orderProductId || obj.tossOrderProductId || raw.orderProductId || raw.tossOrderProductId || raw["item.orderProductId"] || raw["parent.orderProductId"]),
    vendorName: String(obj.vendorName || ""),
    productName: String(obj.productName || ""),
    receiverName: String(obj.receiverName || ""),
    courier: String(obj.courier || obj.deliveryCompany || obj.deliveryCompanyCode || raw.deliveryCompany || raw.deliveryCompanyCode || ""),
    trackingNo: normalizeTrackingNo(obj.trackingNo || obj.invoiceNumber || obj.trackingNumber || raw.trackingNo || raw.invoiceNumber || raw.trackingNumber),
    sourceFile: String(obj.sourceFile || ""),
  };
}

function normalizeShipmentText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function normalizeTrackingNo(value: unknown) {
  return String(value ?? "").trim().replace(/[\s-]+/g, "");
}

const COUPANG_DELIVERY_COMPANY_CODES: Record<string, string> = {
  "CJ대한통운": "CJGLS",
  "CJ": "CJGLS",
  "대한통운": "CJGLS",
  "씨제이대한통운": "CJGLS",
  "롯데택배": "HYUNDAI",
  "롯데글로벌로지스": "HYUNDAI",
  "현대택배": "HYUNDAI",
  "한진택배": "HANJIN",
  "한진": "HANJIN",
  "로젠택배": "KGB",
  "로젠": "KGB",
  "우체국택배": "EPOST",
  "우체국": "EPOST",
  "경동택배": "KDEXP",
  "경동": "KDEXP",
  "합동택배": "HDEXP",
  "대신택배": "DAESIN",
  "일양택배": "ILYANG",
  "천일택배": "CHUNIL",
  "CVS택배": "CVS",
  "CU편의점택배": "BGF",
  "편의점택배": "BGF",
  "건영택배": "KUNYOUNG",
  "한의사랑택배": "HPL",
  "홈픽택배": "HOMEPICK",
  "용마로지스": "YONGMA",
  "큐익스프레스": "QXPRESS",
  "팀프레시": "TEAMFRESH",
  "직접전달": "DIRECT",
  "업체직송": "DIRECT",
  "직접배송": "DIRECT",
};

const TOSS_DELIVERY_COMPANY_NAMES: Record<string, string> = {
  "CJGLS": "CJ대한통운",
  "CJ대한통운": "CJ대한통운",
  "대한통운": "CJ대한통운",
  "HYUNDAI": "롯데택배",
  "롯데글로벌로지스": "롯데택배",
  "롯데택배": "롯데택배",
  "HANJIN": "한진택배",
  "한진": "한진택배",
  "한진택배": "한진택배",
  "KGB": "로젠택배",
  "로젠": "로젠택배",
  "로젠택배": "로젠택배",
  "EPOST": "우체국택배",
  "우체국": "우체국택배",
  "우체국택배": "우체국택배",
  "KDEXP": "경동택배",
  "경동": "경동택배",
  "경동택배": "경동택배",
  "DAESIN": "대신택배",
  "대신택배": "대신택배",
  "ILYANG": "일양로지스",
  "일양택배": "일양로지스",
  "CHUNIL": "천일택배",
  "천일택배": "천일택배",
  "BGF": "CU편의점택배",
  "CU편의점택배": "CU편의점택배",
  "CVS": "GS25편의점택배",
  "GS25편의점택배": "GS25편의점택배",
  "DIRECT": "직접전달",
  "직접배송": "직접전달",
  "업체직송": "직접전달",
  "직접전달": "직접전달",
};

function coupangDeliveryCompanyCode(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (/^[A-Z0-9_]+$/.test(upper) && upper.length >= 2) return upper;
  const compact = normalizeShipmentText(raw);
  return COUPANG_DELIVERY_COMPANY_CODES[compact] || "";
}

function tossDeliveryCompanyName(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (TOSS_DELIVERY_COMPANY_NAMES[upper]) return TOSS_DELIVERY_COMPANY_NAMES[upper];
  const compact = normalizeShipmentText(raw);
  return TOSS_DELIVERY_COMPANY_NAMES[compact] || raw;
}

function coupangShipmentReadyRows(rows: ReturnType<typeof shipmentUploadPayloadRow>[]) {
  return rows.map((row) => ({
    ...row,
    deliveryCompanyCode: coupangDeliveryCompanyCode(row.courier),
  })).filter((row) => row.shipmentBoxId && row.orderId && row.vendorItemId && row.deliveryCompanyCode && row.trackingNo);
}

function tossShipmentReadyRows(rows: ReturnType<typeof shipmentUploadPayloadRow>[]) {
  return rows.map((row) => ({
    ...row,
    deliveryCompany: tossDeliveryCompanyName(row.courier),
  })).filter((row) => row.orderProductId && row.deliveryCompany && row.trackingNo);
}

async function shipmentUploadExecute(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const coupangRows = rows.filter((row) => shipmentChannel(row) === "쿠팡").map(shipmentUploadPayloadRow);
  const tossRows = rows.filter((row) => shipmentChannel(row) === "토스").map(shipmentUploadPayloadRow);
  const coupangReadyRows = coupangShipmentReadyRows(coupangRows);
  const tossReadyRows = tossShipmentReadyRows(tossRows);
  const missingRows = [
    ...coupangRows.filter((row) => !coupangReadyRows.some((ready) => ready.orderNo === row.orderNo && ready.trackingNo === row.trackingNo)).map((row) => ({ channel: "쿠팡", orderNo: row.orderNo, reason: "shipmentBoxId/orderId/vendorItemId/택배사코드/운송장번호 중 누락" })),
    ...tossRows.filter((row) => !tossReadyRows.some((ready) => ready.orderProductId === row.orderProductId && ready.trackingNo === row.trackingNo)).map((row) => ({ channel: "토스", orderNo: row.orderNo, reason: "orderProductId/택배사/운송장번호 중 누락" })),
  ].slice(0, 20);

  if (!liveExecutionAllowed(env)) {
    return jsonResponse({
      ok: true,
      mode: "shipment_upload_execute_preview_gate_closed_v157",
      requestedRows: rows.length,
      readyRows: coupangReadyRows.length + tossReadyRows.length,
      externalApiExecuted: false,
      finalExecutionStillDisabled: true,
      safety: safetyStatus(env),
      summary: { coupangRows: coupangRows.length, tossRows: tossRows.length, coupangReadyRows: coupangReadyRows.length, tossReadyRows: tossReadyRows.length, missingRows },
      message: `쿠팡 ${coupangReadyRows.length}/${coupangRows.length}건, 토스 ${tossReadyRows.length}/${tossRows.length}건 송장 업로드 대상입니다. 현재 안전 Gate가 닫혀 있어 실제 쿠팡/토스 배송중 처리는 실행하지 않았습니다.`,
    });
  }

  const diagnostics: ExternalDiagnosticStep[] = [];
  const results: Array<{ channel: string; ok: boolean; status: number; requested: number; succeeded: number; message: string; pathConfigured: boolean }> = [];

  if (coupangRows.length) {
    const path = configuredPath(env.COUPANG_SHIPMENT_UPLOAD_PATH, COUPANG_DEFAULT_SHIPMENT_UPLOAD_PATH);
    for (const chunk of chunkArray(coupangReadyRows, 50)) {
      const body = {
        vendorId: env.COUPANG_VENDOR_ID,
        orderSheetInvoiceApplyDtos: chunk.map((row) => ({
          shipmentBoxId: Number(row.shipmentBoxId),
          orderId: Number(row.orderId),
          vendorItemId: Number(row.vendorItemId),
          deliveryCompanyCode: row.deliveryCompanyCode,
          invoiceNumber: row.trackingNo,
          splitShipping: false,
          preSplitShipped: false,
          estimatedShippingDate: "",
        })),
      };
      const result = await coupangSignedRequestWithRetry(env, "POST", path, undefined, body);
      diagnostics.push(...(result.diagnostics || []));
      const succeeded = coupangAckSuccessCount(result.data, chunk.length);
      results.push({
        channel: "쿠팡",
        ok: externalResultSucceeded(result) && succeeded === chunk.length,
        status: result.status,
        requested: chunk.length,
        succeeded,
        pathConfigured: true,
        message: diagnosticMessage(result.data) || `HTTP ${result.status}`,
      });
    }
    if (!coupangReadyRows.length) {
      results.push({ channel: "쿠팡", ok: false, status: 0, requested: coupangRows.length, succeeded: 0, pathConfigured: true, message: "쿠팡 송장등록 필수값 부족: shipmentBoxId/orderId/vendorItemId/택배사코드/운송장번호 확인" });
    }
  }

  if (tossRows.length) {
    const path = configuredPath(env.TOSS_SHIPMENT_UPLOAD_PATH, TOSS_DEFAULT_SHIPMENT_DELIVERY_PATH);
    for (const row of tossReadyRows) {
      const result = await tossRequest(env, "PUT", path, undefined, {
        orderProductId: Number(row.orderProductId),
        deliveryCompany: row.deliveryCompany,
        trackingNumber: row.trackingNo,
        partnerName: env.TOSS_PARTNER_NAME || "토스쇼핑",
      });
      diagnostics.push(...(result.diagnostics || []));
      const succeeded = externalResultSucceeded(result) ? 1 : 0;
      results.push({
        channel: "토스",
        ok: succeeded === 1,
        status: result.status,
        requested: 1,
        succeeded,
        pathConfigured: true,
        message: diagnosticMessage(result.data) || `HTTP ${result.status}`,
      });
    }
    if (!tossReadyRows.length) {
      results.push({ channel: "토스", ok: false, status: 0, requested: tossRows.length, succeeded: 0, pathConfigured: true, message: "토스 배송정보 변경 필수값 부족: orderProductId/택배사/운송장번호 확인" });
    }
  }

  const requested = results.reduce((sum, row) => sum + row.requested, 0);
  const succeeded = results.reduce((sum, row) => sum + row.succeeded, 0);
  const executed = requested > 0 && results.some((row) => row.status !== 0);
  const allOk = requested > 0 && results.every((row) => row.ok);
  return jsonResponse({
    ok: allOk,
    mode: "shipment_upload_execute_live_v157_coupang_toss_delivery",
    requestedRows: rows.length,
    readyRows: coupangReadyRows.length + tossReadyRows.length,
    externalApiExecuted: executed,
    safety: safetyStatus(env),
    diagnostics,
    summary: { coupangRows: coupangRows.length, tossRows: tossRows.length, coupangReadyRows: coupangReadyRows.length, tossReadyRows: tossReadyRows.length, requested, succeeded, missingRows, results, diagnostics },
    message: results.length
      ? `송장 입력파일은 발주폴더에 생성했습니다. 쿠팡/토스 송장 업로드 실행: 요청 ${requested}건, 성공 ${succeeded}건. ${results.map((row) => `${row.channel} ${row.succeeded}/${row.requested}${row.ok ? "" : ` 확인필요(${row.message})`}`).join(" / ")}`
      : "업로드할 송장 행이 없습니다.",
  }, { status: 200 });
}

function profitNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function schedulerAddKstDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function couponScheduleWindowForAction(action: "apply" | "cancel", schedules: SchedulerConfig, nowDate: string) {
  const applyTime = String(schedules.couponApply?.time || "23:51");
  const cancelTime = String(schedules.couponCancel?.time || "23:50");
  if (action === "cancel") {
    const startDate = schedulerAddKstDays(nowDate, -1);
    return {
      startAt: `${startDate} ${applyTime}`,
      endAt: `${nowDate} ${cancelTime}`,
      applyTime,
      cancelTime,
    };
  }
  const endDate = cancelTime <= applyTime ? schedulerAddKstDays(nowDate, 1) : nowDate;
  return {
    startAt: `${nowDate} ${applyTime}`,
    endAt: `${endDate} ${cancelTime}`,
    applyTime,
    cancelTime,
  };
}

function scheduledCouponRowsForAction(
  rawRows: unknown[],
  action: "apply" | "cancel",
  schedules: SchedulerConfig,
  nowDate: string,
) {
  const sourceRows = rawRows
    .map((row) => (row && typeof row === "object" ? row as Record<string, unknown> : null))
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const directRows = sourceRows.filter((row) => String(row.action || "apply") === action);
  const baseRows = directRows.length ? directRows : sourceRows.filter((row) => String(row.action || "apply") === "apply");
  const window = couponScheduleWindowForAction(action, schedules, nowDate);
  return baseRows.map((row) => ({
    ...row,
    action,
    startAt: window.startAt,
    endAt: window.endAt,
    memo: action === "cancel"
      ? `매일 ${window.cancelTime} 강제 취소 대상`
      : `매일 ${window.applyTime} 등록 후 다음 ${window.cancelTime} 취소 대상`,
  }));
}

function couponRowRecord(row: unknown) {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function couponVendorItemIds(rows: unknown[]) {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const row of rows) {
    const optionId = cleanDigitsOnly(couponRowRecord(row).optionId || couponRowRecord(row).vendorItemId);
    if (!optionId || seen.has(optionId)) continue;
    seen.add(optionId);
    ids.push(Number(optionId));
  }
  return ids.filter((value) => Number.isFinite(value) && value > 0);
}

function couponGroupKey(row: Record<string, unknown>) {
  return [
    displayText(row.rollingTemplateId) || displayText(row.sourceCouponId) || "single",
    displayText(row.couponName) || "24시간 즉시할인",
    displayText(row.discountType) || "금액",
    String(profitNumber(row.discountValue)),
    displayText(row.startAt),
    displayText(row.endAt),
  ].join("|");
}

function groupCouponRows(rows: unknown[]) {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const record = couponRowRecord(row);
    const key = couponGroupKey(record);
    const list = map.get(key) || [];
    list.push(record);
    map.set(key, list);
  }
  return Array.from(map.values());
}

function couponDateTime(value: unknown, fallback: string) {
  const text = displayText(value || fallback).replace("T", " ").slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) return text;
  return fallback;
}

function buildCoupangCouponCreatePayload(rows: Record<string, unknown>[], env: Env, couponApiSettings?: CouponApiSettings) {
  const first = rows[0] || {};
  const discountType = displayText(first.discountType) === "율" || (!displayText(first.discountType) && couponApiSettings?.sourceDiscountType === "율") ? "율" : "금액";
  const discountValue = Math.max(1, profitNumber(first.discountValue) || profitNumber(couponApiSettings?.sourceDiscountValue));
  const maxDiscountPrice = discountType === "율"
    ? Math.max(10, profitNumber(env.COUPANG_COUPON_MAX_DISCOUNT_PRICE || first.maxDiscountPrice || discountValue))
    : Math.max(10, discountValue);
  const defaultStart = `${todayDateText()} 00:00:00`;
  const defaultEnd = `${todayDateText()} 23:59:00`;
  return {
    contractId: displayText(first.contractId) || couponApiSettings?.selectedContractId || env.COUPANG_COUPON_CONTRACT_ID,
    name: safeText(displayText(first.couponName) || displayText(couponApiSettings?.selectedCouponName) || "24시간 즉시할인", 45),
    maxDiscountPrice,
    discount: discountValue,
    startAt: couponDateTime(first.startAt, defaultStart),
    endAt: couponDateTime(first.endAt, defaultEnd),
    type: discountType === "율" ? "RATE" : "PRICE",
    wowExclusive: String(env.COUPANG_COUPON_WOW_EXCLUSIVE || "false").toLowerCase() === "true",
  };
}

function requestedIdFromCoupang(data: unknown) {
  const flat = flattenObject(data);
  return firstText(flat, [
    "data.content.requestedId",
    "content.requestedId",
    "requestedId",
    "data.requestedId",
    "result.requestedId",
  ]);
}

function couponIdFromCoupangStatus(data: unknown) {
  const flat = flattenObject(data);
  return firstText(flat, [
    "data.content.couponId",
    "content.couponId",
    "couponId",
    "data.couponId",
    "result.couponId",
  ]);
}

function normalizeCouponIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanDigitsOnly(item))
      .filter(Boolean);
  }
  return String(value || "")
    .split(/[;,\s]+/)
    .map((item) => cleanDigitsOnly(item))
    .filter(Boolean);
}

function uniqueCouponIdList(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const id = cleanDigitsOnly(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function dailyRollingCouponMode(couponApiSettings?: CouponApiSettings) {
  return couponApiSettings?.selectedMode === "daily_new" || couponApiSettings?.dailyRollingEnabled === true;
}

function normalizeRollingTemplates(value: unknown): RollingCouponTemplate[] {
  return Array.isArray(value)
    ? value.filter((item): item is RollingCouponTemplate => Boolean(item && typeof item === "object"))
    : [];
}

function templateIdFromRow(row: Record<string, unknown>) {
  return displayText(row.rollingTemplateId || row.templateId || row.sourceCouponId || row.couponName);
}

function rowCancelCouponIds(rows: unknown[]) {
  const ids: string[] = [];
  for (const row of rows) {
    const record = couponRowRecord(row);
    ids.push(
      ...normalizeCouponIdList(record.cancelCouponId),
      ...normalizeCouponIdList(record.latestCouponId),
      ...normalizeCouponIdList(record.sourceCouponId),
      ...normalizeCouponIdList(record.couponId),
    );
  }
  return ids;
}


async function checkCoupangCouponRequestStatus(env: Env, requestedId: string) {
  const rawPath = configuredPath(env.COUPANG_COUPON_REQUEST_STATUS_PATH, COUPANG_DEFAULT_COUPON_REQUEST_STATUS_PATH);
  const path = applyCoupangPathParams(rawPath, env, { requestedId });
  return coupangSignedRequestWithRetry(env, "GET", path);
}


function firstNumericTextFromFlat(flat: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const textValue = cleanDigitsOnly(firstText(flat, [key]));
    if (textValue) return textValue;
  }
  return "";
}

function collectCandidateArrays(value: unknown, out: unknown[][] = [], depth = 0) {
  if (!value || depth > 6) return out;
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object")) out.push(value);
    value.forEach((item) => collectCandidateArrays(item, out, depth + 1));
    return out;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((inner) => collectCandidateArrays(inner, out, depth + 1));
  }
  return out;
}

function collectCoupangCouponContracts(data: unknown) {
  const rows: Array<Record<string, string | number>> = [];
  const seen = new Set<string>();
  const arrays = collectCandidateArrays(data);
  for (const array of arrays) {
    for (const item of array) {
      if (!item || typeof item !== "object") continue;
      const flat = flattenObject(item);
      const contractId = firstNumericTextFromFlat(flat, [
        "contractId",
        "id",
        "couponContractId",
        "data.contractId",
      ]);
      if (!contractId || seen.has(contractId)) continue;
      seen.add(contractId);
      rows.push({
        contractId,
        vendorContractId: firstText(flat, ["vendorContractId", "vendorContractNo", "contractNo"]),
        contractName: firstText(flat, ["contractName", "name", "title", "promotionName"]),
        status: firstText(flat, ["status", "contractStatus", "state"]),
        startAt: firstText(flat, ["startAt", "startDate", "startDt"]),
        endAt: firstText(flat, ["endAt", "endDate", "endDt"]),
        budget: cleanDigitsOnly(firstText(flat, ["budget", "totalBudget", "contractBudget", "amount"])),
      });
    }
  }
  return rows;
}


function couponDiscountInfoFromFlat(flat: Record<string, unknown>) {
  const typeText = firstText(flat, [
    "type",
    "discountType",
    "discount.type",
    "data.type",
    "content.type",
  ]).toUpperCase();
  const valueText = firstText(flat, [
    "discountValue",
    "discount",
    "discountPrice",
    "discountAmount",
    "discountRate",
    "price",
    "amount",
    "rate",
    "data.discount",
    "content.discount",
    "couponDiscount",
    "maxDiscountPrice",
  ]);
  const value = profitNumber(String(valueText).replace(/[^0-9.]/g, ""));
  const discountType = /RATE|PERCENT|%|율/.test(typeText) || /%|율/.test(valueText)
    ? "율"
    : /PRICE|AMOUNT|WON|원|금액/.test(typeText) || value > 0
      ? "금액"
      : "";
  return { discountType, discountValue: value };
}

function collectCoupangCoupons(data: unknown) {
  const rows: Array<Record<string, string | number>> = [];
  const seen = new Set<string>();
  const arrays = collectCandidateArrays(data);
  for (const array of arrays) {
    for (const item of array) {
      if (!item || typeof item !== "object") continue;
      const flat = flattenObject(item);
      const couponId = firstNumericTextFromFlat(flat, [
        "couponId",
        "id",
        "instantCouponId",
        "data.couponId",
      ]);
      if (!couponId || seen.has(couponId)) continue;
      seen.add(couponId);
      const discountInfo = couponDiscountInfoFromFlat(flat);
      rows.push({
        couponId,
        contractId: firstNumericTextFromFlat(flat, ["contractId", "couponContractId"]),
        couponName: firstText(flat, ["promotionName", "couponName", "name", "title"]),
        status: firstText(flat, ["status", "couponStatus", "state"]),
        type: firstText(flat, ["type", "discountType"]),
        discount: cleanDigitsOnly(firstText(flat, ["discount", "discountPrice", "discountAmount", "discountRate", "maxDiscountPrice"])),
        discountType: discountInfo.discountType,
        discountValue: discountInfo.discountValue,
        startAt: firstText(flat, ["startAt", "startDate", "startDt"]),
        endAt: firstText(flat, ["endAt", "endDate", "endDt"]),
      });
    }
  }
  return rows;
}

function couponRequestStatusSummary(data: unknown) {
  const flat = flattenObject(objectRecord(data));
  return {
    requestedId: firstText(flat, ["data.content.requestedId", "content.requestedId", "requestedId", "data.requestedId", "result.requestedId"]),
    couponId: couponIdFromCoupangStatus(data),
    status: firstText(flat, ["data.content.status", "content.status", "status", "data.status", "result.status"]),
    type: firstText(flat, ["data.content.type", "content.type", "type", "data.type", "result.type"]),
    message: firstText(flat, ["message", "data.message", "content.message", "result.message"]),
  };
}

async function coupangCouponContractList(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  if (apiConnectionPaused(env)) {
    return jsonResponse({
      ok: true,
      mode: "coupang_coupon_contract_list_api_paused_v155",
      summary: { rows: [], credentials: credentialStatus(env) },
      safety: safetyStatus(env),
      message: "안전모드로 쿠팡 계약서 목록 조회 API 연결을 중단했습니다. API_CONNECTION_PAUSED=false 후 다시 실행하세요.",
    });
  }
  if (!coupangConfigured(env)) return jsonResponse({ ok: false, message: "쿠팡 API 키가 설정되지 않았습니다." }, { status: 400 });
  const path = configuredPath(env.COUPANG_COUPON_CONTRACT_LIST_PATH, COUPANG_DEFAULT_COUPON_CONTRACT_LIST_PATH);
  const result = await coupangSignedRequestWithRetry(env, "GET", path, {
    page: (body.query?.page as number | string | undefined) || 0,
    size: (body.query?.size as number | string | undefined) || 100,
  });
  const rows = result.ok ? collectCoupangCouponContracts(result.data) : [];
  return jsonResponse({
    ok: result.ok,
    mode: "coupang_coupon_contract_list_v155",
    summary: { rows, diagnostics: result.diagnostics, response: compactExternalResult(result), credentials: credentialStatus(env) },
    safety: safetyStatus(env),
    message: result.ok
      ? `쿠팡 계약서 목록에서 contractId ${rows.length}건을 확인했습니다. 신규 쿠폰 생성용 계약서를 선택하세요.`
      : `쿠팡 계약서 목록 조회 실패: HTTP ${result.status}. ${diagnosticMessage(result.data)}`,
  }, { status: handledExternalHttpStatus(result, body.diagnosticOnly) });
}

async function coupangCouponList(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  if (apiConnectionPaused(env)) {
    return jsonResponse({
      ok: true,
      mode: "coupang_coupon_list_api_paused_v155",
      summary: { rows: [], credentials: credentialStatus(env) },
      safety: safetyStatus(env),
      message: "안전모드로 쿠팡 쿠폰 목록 조회 API 연결을 중단했습니다. API_CONNECTION_PAUSED=false 후 다시 실행하세요.",
    });
  }
  if (!coupangConfigured(env)) return jsonResponse({ ok: false, message: "쿠팡 API 키가 설정되지 않았습니다." }, { status: 400 });
  const status = displayText(body.query?.status || body.couponApiSettings?.selectedCouponStatus || "APPLIED") || "APPLIED";
  const page = displayText(body.query?.page) || "1";
  const size = displayText(body.query?.size) || "50";
  const path = configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH);
  const result = await coupangSignedRequestWithRetry(env, "GET", path, { status, page, size, sort: "desc" });
  const rows = result.ok ? collectCoupangCoupons(result.data) : [];
  return jsonResponse({
    ok: result.ok,
    mode: "coupang_coupon_list_v155",
    summary: { status, rows, diagnostics: result.diagnostics, response: compactExternalResult(result), credentials: credentialStatus(env) },
    safety: safetyStatus(env),
    message: result.ok
      ? `쿠팡 쿠폰 목록에서 ${status} 상태 couponId ${rows.length}건을 확인했습니다. 기존 쿠폰에 상품을 붙이거나 취소할 쿠폰을 선택하세요.`
      : `쿠팡 쿠폰 목록 조회 실패: HTTP ${result.status}. ${diagnosticMessage(result.data)}`,
  }, { status: handledExternalHttpStatus(result, body.diagnosticOnly) });
}

function collectCoupangCouponItems(data: unknown) {
  const rows: Array<Record<string, string | number>> = [];
  const seen = new Set<string>();
  const arrays = collectCandidateArrays(data);
  for (const array of arrays) {
    for (const item of array) {
      if (!item || typeof item !== "object") continue;
      const flat = flattenObject(item);
      const vendorItemId = firstNumericTextFromFlat(flat, [
        "vendorItemId",
        "item.vendorItemId",
        "optionId",
        "couponItem.vendorItemId",
        "data.vendorItemId",
      ]);
      const couponItemId = firstNumericTextFromFlat(flat, ["couponItemId", "id", "data.couponItemId"]);
      const couponId = firstNumericTextFromFlat(flat, ["couponId", "data.couponId"]);
      const key = `${couponId || "coupon"}:${vendorItemId || couponItemId}`;
      if (!vendorItemId || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        couponItemId,
        couponId,
        vendorItemId,
        status: firstText(flat, ["status", "couponStatus", "state"]),
        startAt: firstText(flat, ["startAt", "startDate", "startDt"]),
        endAt: firstText(flat, ["endAt", "endDate", "endDt"]),
      });
    }
  }
  return rows;
}

async function coupangCouponItemList(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  const couponId = cleanDigitsOnly(body.query?.couponId || body.couponApiSettings?.sourceCouponId || body.couponApiSettings?.selectedCouponId || (body as Record<string, unknown>).couponId);
  if (!couponId) return jsonResponse({ ok: false, message: "조회할 couponId가 없습니다. 쿠폰 목록에서 24시간 반복 기준을 먼저 선택하세요." }, { status: 400 });
  if (apiConnectionPaused(env)) {
    return jsonResponse({
      ok: true,
      mode: "coupang_coupon_items_list_api_paused_v163",
      summary: { couponId, rows: [], credentials: credentialStatus(env) },
      safety: safetyStatus(env),
      message: "안전모드로 쿠팡 쿠폰 적용상품 조회 API 연결을 중단했습니다. 현재 주문·매핑자료 기준으로만 반영됩니다.",
    });
  }
  if (!coupangConfigured(env)) return jsonResponse({ ok: false, message: "쿠팡 API 키가 설정되지 않았습니다." }, { status: 400 });
  const status = displayText(body.query?.status || body.couponApiSettings?.selectedCouponStatus || "APPLIED") || "APPLIED";
  const size = Number(displayText(body.query?.size) || 1000) || 1000;
  const sort = displayText(body.query?.sort || "desc") || "desc";
  const path = applyCoupangPathParams(configuredPath(env.COUPANG_COUPON_ITEM_LIST_PATH, COUPANG_DEFAULT_COUPON_ITEM_LIST_PATH), env, { couponId });
  const allRows: Array<Record<string, string | number>> = [];
  const diagnostics: unknown[] = [];
  let finalResult: ExternalApiResult | null = null;
  for (let page = 0; page < 20; page += 1) {
    const result = await coupangSignedRequestWithRetry(env, "GET", path, { status, page, size, sort });
    finalResult = result;
    diagnostics.push(...(result.diagnostics || []));
    if (!result.ok) break;
    const rows = collectCoupangCouponItems(result.data);
    allRows.push(...rows);
    if (rows.length < size) break;
  }
  const deduped = Array.from(new Map(allRows.map((row) => [`${row.couponId}:${row.vendorItemId}`, row])).values());
  const ok = finalResult?.ok ?? false;
  return jsonResponse({
    ok,
    mode: "coupang_coupon_items_list_v163",
    summary: {
      couponId,
      status,
      rows: deduped,
      diagnostics,
      response: finalResult ? compactExternalResult(finalResult) : null,
      credentials: credentialStatus(env),
    },
    safety: safetyStatus(env),
    message: ok
      ? `쿠팡 쿠폰 couponId=${couponId}의 ${status} 적용상품 vendorItemId ${deduped.length}건을 확인했습니다. 이 목록만 24시간 반복 대상으로 사용합니다.`
      : `쿠팡 쿠폰 적용상품 조회 실패: HTTP ${finalResult?.status || "unknown"}. ${diagnosticMessage(finalResult?.data)}`,
  }, { status: finalResult ? handledExternalHttpStatus(finalResult, body.diagnosticOnly) : 500 });
}

async function coupangCouponRequestStatus(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  const requestedId = displayText(body.query?.requestedId || (body as Record<string, unknown>).requestedId);
  if (!requestedId) return jsonResponse({ ok: false, message: "확인할 requestedId가 없습니다." }, { status: 400 });
  if (apiConnectionPaused(env)) {
    return jsonResponse({ ok: true, mode: "coupang_coupon_request_status_api_paused_v155", summary: { credentials: credentialStatus(env) }, safety: safetyStatus(env), message: "안전모드로 쿠팡 요청상태 확인 API 연결을 중단했습니다." });
  }
  if (!coupangConfigured(env)) return jsonResponse({ ok: false, message: "쿠팡 API 키가 설정되지 않았습니다." }, { status: 400 });
  const result = await checkCoupangCouponRequestStatus(env, requestedId);
  const row = result.ok ? couponRequestStatusSummary(result.data) : null;
  return jsonResponse({
    ok: result.ok,
    mode: "coupang_coupon_request_status_v155",
    summary: { row, diagnostics: result.diagnostics, response: compactExternalResult(result), credentials: credentialStatus(env) },
    safety: safetyStatus(env),
    message: result.ok
      ? `쿠팡 요청상태를 확인했습니다. status=${row?.status || "확인필요"}, couponId=${row?.couponId || "미확인"}.`
      : `쿠팡 요청상태 확인 실패: HTTP ${result.status}. ${diagnosticMessage(result.data)}`,
  }, { status: handledExternalHttpStatus(result, body.diagnosticOnly) });
}

async function runCoupangCouponApply(env: Env, rows: unknown[], couponApiSettings?: CouponApiSettings) {
  const itemCreatePath = configuredPath(env.COUPANG_COUPON_APPLY_PATH, COUPANG_DEFAULT_COUPON_ITEM_CREATE_PATH);
  const createPath = configuredPath(env.COUPANG_COUPON_CREATE_PATH, COUPANG_DEFAULT_COUPON_CREATE_PATH);
  const vendorItems = couponVendorItemIds(rows);
  if (!vendorItems.length) {
    return {
      ok: false,
      externalApiExecuted: false,
      results: [],
      message: "쿠팡 옵션ID(vendorItemId)가 없어 쿠폰 등록 API를 호출하지 않았습니다.",
    };
  }

  const results: ExternalApiResult[] = [];
  const generatedCouponIds: string[] = [];
  const generatedRequestedIds: string[] = [];
  const generatedCouponRecords: Array<Record<string, string>> = [];
  const itemRequestedIds: string[] = [];
  const rollingMode = dailyRollingCouponMode(couponApiSettings);
  const selectedCouponId = displayText(couponApiSettings?.selectedCouponId);
  const configuredCouponId = selectedCouponId || (configuredEnvValue(env.COUPANG_COUPON_ID) ? String(env.COUPANG_COUPON_ID) : "");
  if (configuredCouponId && !rollingMode) {
    const path = applyCoupangPathParams(itemCreatePath, env, { couponId: configuredCouponId });
    const result = await coupangSignedRequestWithRetry(env, "POST", path, undefined, { vendorItems });
    results.push(result);
    const requestedId = result.ok ? requestedIdFromCoupang(result.data) : "";
    if (requestedId) itemRequestedIds.push(requestedId);
    return {
      ok: result.ok,
      externalApiExecuted: true,
      results,
      generatedCouponIds,
      generatedRequestedIds,
      generatedCouponRecords,
      itemRequestedIds,
      message: result.ok
        ? `쿠팡 즉시할인쿠폰 아이템 등록 API를 실행했습니다. couponId=${configuredCouponId}, 옵션 ${vendorItems.length}건입니다.`
        : `쿠팡 즉시할인쿠폰 아이템 등록 API 응답 확인필요: HTTP ${result.status}`,
    };
  }

  const selectedContractId = displayText(couponApiSettings?.selectedContractId);
  const hasRowContractId = rows.some((row) => displayText(couponRowRecord(row).contractId));
  if (!selectedContractId && !hasRowContractId && !configuredEnvValue(env.COUPANG_COUPON_CONTRACT_ID)) {
    return {
      ok: false,
      externalApiExecuted: false,
      results,
      message: "쿠팡 쿠폰 경로는 적용됐지만 화면에서 신규 생성용 계약서(contractId)를 선택하지 않아 실제 24시간 신규 쿠폰 생성을 실행하지 않았습니다.",
    };
  }

  for (const group of groupCouponRows(rows)) {
    const createPayload = buildCoupangCouponCreatePayload(group, env, couponApiSettings);
    const createResult = await coupangSignedRequestWithRetry(env, "POST", createPath, undefined, createPayload);
    results.push(createResult);
    const requestedId = createResult.ok ? requestedIdFromCoupang(createResult.data) : "";
    if (!requestedId) continue;
    generatedRequestedIds.push(requestedId);
    const statusResult = await checkCoupangCouponRequestStatus(env, requestedId);
    results.push(statusResult);
    const couponId = statusResult.ok ? couponIdFromCoupangStatus(statusResult.data) : "";
    if (!couponId) continue;
    generatedCouponIds.push(couponId);
    generatedCouponRecords.push({
      templateId: templateIdFromRow(group[0] || {}),
      sourceCouponId: displayText((group[0] || {}).sourceCouponId),
      couponName: displayText((group[0] || {}).couponName),
      couponId,
      requestedId,
    });
    const ids = couponVendorItemIds(group);
    const itemPath = applyCoupangPathParams(itemCreatePath, env, { couponId });
    const itemResult = await coupangSignedRequestWithRetry(env, "POST", itemPath, undefined, { vendorItems: ids });
    results.push(itemResult);
    const itemRequestedId = itemResult.ok ? requestedIdFromCoupang(itemResult.data) : "";
    if (itemRequestedId) itemRequestedIds.push(itemRequestedId);
  }

  const executed = results.length > 0;
  const allOk = executed && results.every((result) => result.ok);
  return {
    ok: allOk,
    externalApiExecuted: executed,
    results,
    generatedCouponIds: uniqueCouponIdList(generatedCouponIds),
    generatedCouponRecords,
    generatedRequestedIds: uniqueCouponIdList(generatedRequestedIds),
    itemRequestedIds: uniqueCouponIdList(itemRequestedIds),
    message: allOk
      ? `쿠팡 즉시할인쿠폰 24시간 신규 생성/아이템 등록 API를 실행했습니다. 신규 couponId ${uniqueCouponIdList(generatedCouponIds).length}개, 옵션 ${vendorItems.length}건입니다.`
      : `쿠팡 즉시할인쿠폰 생성 요청은 실행했으나 일부 요청상태 또는 아이템 등록 확인이 필요합니다. 옵션 ${vendorItems.length}건입니다.`,
  };
}

function configuredCouponIds(env: Env, couponApiSettings?: CouponApiSettings, rows: unknown[] = []) {
  const rollingMode = dailyRollingCouponMode(couponApiSettings);
  const fromRows = uniqueCouponIdList(rowCancelCouponIds(rows));
  if (rollingMode && fromRows.length) return fromRows;
  const templates = normalizeRollingTemplates(couponApiSettings?.rollingTemplates);
  const fromTemplates = uniqueCouponIdList(templates.flatMap((template) => [
    template.latestCouponId,
    template.lastGeneratedCouponId,
    template.sourceCouponId,
  ].map((value) => displayText(value))));
  if (rollingMode && fromTemplates.length) return fromTemplates;
  const generated = uniqueCouponIdList([
    ...normalizeCouponIdList(couponApiSettings?.lastGeneratedCouponIds),
    ...normalizeCouponIdList(couponApiSettings?.lastGeneratedCouponId),
  ]);
  if (rollingMode && generated.length) return generated;
  const selectedCouponId = displayText(couponApiSettings?.selectedCouponId);
  return uniqueCouponIdList(normalizeCouponIdList(selectedCouponId || env.COUPANG_COUPON_ID || ""));
}

async function runCoupangCouponCancel(env: Env, rows: unknown[], couponApiSettings?: CouponApiSettings) {
  const ids = configuredCouponIds(env, couponApiSettings, rows);
  if (!ids.length) {
    return {
      ok: false,
      externalApiExecuted: false,
      results: [],
      message: `쿠팡 쿠폰 취소 경로는 적용됐지만 화면에서 취소할 기존 쿠폰(couponId)을 선택하지 않아 실제 파기 API를 호출하지 않았습니다. 취소 대상 옵션 ${rows.length}건을 확인했습니다.`,
    };
  }
  const rawPath = configuredPath(env.COUPANG_COUPON_CANCEL_PATH, COUPANG_DEFAULT_COUPON_EXPIRE_PATH);
  const results: ExternalApiResult[] = [];
  for (const couponId of ids) {
    const path = applyCoupangPathParams(rawPath, env, { couponId });
    const result = await coupangSignedRequestWithRetry(env, "PUT", path, { action: "expire" });
    results.push(result);
  }
  const allOk = results.every((result) => result.ok);
  return {
    ok: allOk,
    externalApiExecuted: true,
    results,
    canceledCouponIds: ids,
    message: allOk
      ? `쿠팡 즉시할인쿠폰 파기 API를 실행했습니다. couponId ${ids.length}개, 화면 취소 대상 옵션 ${rows.length}건입니다.`
      : `쿠팡 즉시할인쿠폰 파기 API 응답 중 확인필요가 있습니다. couponId ${ids.length}개입니다.`,
  };
}

async function couponActionPreview(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const action = body.action === "apply" ? "apply" : "cancel";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const forceCancel = action === "cancel" && Boolean(body.forceCancel);
  const label = action === "apply" ? "일괄 등록/적용" : forceCancel ? "강제 취소" : "일괄 취소";
  const time = String(
    body.scheduledTime || (action === "apply" ? "23:51" : "23:50"),
  );

  if (liveExecutionAllowed(env) && coupangConfigured(env)) {
    const liveResult = action === "apply"
      ? await runCoupangCouponApply(env, rows, body.couponApiSettings)
      : await runCoupangCouponCancel(env, rows, body.couponApiSettings);
    const liveSummary = liveResult as Record<string, unknown> & { results: ExternalApiResult[]; ok: boolean; externalApiExecuted: boolean; message: string };
    const compactResults = liveSummary.results.map((result) => compactExternalResult(result));
    return jsonResponse(
      {
        ok: liveSummary.ok,
        mode: `coupang_coupon_${action}_live_paths_v148`,
        summary: {
          action,
          time,
          requestedRows: rows.length,
          forceCancel,
          daily24h: Boolean(body.daily24h),
          results: compactResults,
          generatedCouponIds: action === "apply" ? uniqueCouponIdList(normalizeCouponIdList(liveSummary.generatedCouponIds)) : [],
          generatedCouponRecords: action === "apply" && Array.isArray(liveSummary.generatedCouponRecords) ? liveSummary.generatedCouponRecords : [],
          generatedRequestedIds: action === "apply" ? uniqueCouponIdList(normalizeCouponIdList(liveSummary.generatedRequestedIds)) : [],
          itemRequestedIds: action === "apply" ? uniqueCouponIdList(normalizeCouponIdList(liveSummary.itemRequestedIds)) : [],
          canceledCouponIds: action === "cancel" ? uniqueCouponIdList(normalizeCouponIdList(liveSummary.canceledCouponIds)) : [],
          credentials: credentialStatus(env),
        },
        externalApiExecuted: liveSummary.externalApiExecuted,
        safety: safetyStatus(env),
        message: liveSummary.message,
      },
      { status: 200 },
    );
  }

  return jsonResponse({
    ok: true,
    mode: liveExecutionAllowed(env)
      ? `coupang_coupon_${action}_live_waiting_for_credentials_v148`
      : `coupang_coupon_${action}_preview_only_v148`,
    summary: {
      action,
      time,
      manual: Boolean(body.manual),
      requestedRows: rows.length,
      forceCancel,
      daily24h: Boolean(body.daily24h),
      credentials: credentialStatus(env),
    },
    safety: safetyStatus(env),
    message: liveExecutionAllowed(env)
      ? `쿠팡 할인쿠폰 ${label} 대상 ${rows.length}건을 확인했습니다. 쿠팡 인증값 또는 허용 IP 확인이 필요해 실제 쿠폰 API 호출은 실행하지 않았습니다.`
      : `쿠팡 할인쿠폰 ${label} Preview를 완료했습니다. 대상 ${rows.length}건, 설정 시간은 ${time}이며 실제 쿠폰 변경은 실행하지 않았습니다.`,
  });
}

async function schedulerRunPreview(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const schedules = normalizeScheduleConfig(body.schedules);
  return jsonResponse({
    ok: true,
    mode: "scheduler_run_preview_only_v147",
    summary: {
      schedules,
      steps: [
        "쿠팡 할인쿠폰 취소",
        "쿠팡 할인쿠폰 적용",
        "서버 저장용량 점검·정리",
      ],
      manualButtons: "all core operations are available manually in the web app",
    },
    safety: safetyStatus(env),
    message: scheduledWritesAllowed(env)
      ? "스케줄러 Gate가 열려 있습니다. 저장된 시간 기준으로 쿠폰·저장소 정리만 실행 대상입니다."
      : "스케줄러 자동 실행 Preview를 완료했습니다. ALLOW_SCHEDULED_WRITES=false 상태입니다.",
  });
}

type SchedulerEntry = { enabled?: boolean; time?: string };
type SchedulerConfig = Record<string, SchedulerEntry>;

function normalizeScheduleConfig(value: unknown): SchedulerConfig {
  const input = value && typeof value === "object" ? (value as Record<string, SchedulerEntry>) : {};
  return {
    couponCancel: { enabled: input.couponCancel?.enabled !== false, time: input.couponCancel?.time || "23:50" },
    couponApply: { enabled: input.couponApply?.enabled !== false, time: input.couponApply?.time || "23:51" },
    storageCleanup: { enabled: input.storageCleanup?.enabled !== false, time: input.storageCleanup?.time || "03:20" },
  };
}

function kstParts(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
}

function kstPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value || "00";
}

function kstDateText(date = new Date()) {
  const parts = kstParts(date);
  return `${kstPart(parts, "year")}-${kstPart(parts, "month")}-${kstPart(parts, "day")}`;
}

function kstTimeText(date = new Date()) {
  const parts = kstParts(date);
  return `${kstPart(parts, "hour")}:${kstPart(parts, "minute")}`;
}

function timeToMinutes(value: unknown) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN;
  return hour * 60 + minute;
}

function scheduleWindowMinutes(env: Env) {
  const raw = Number(env.SCHEDULER_MATCH_WINDOW_MINUTES || 0);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 10) : 0;
}

function scheduleDue(entry: SchedulerEntry | undefined, nowText: string, env: Env) {
  if (!entry?.enabled) return false;
  const target = timeToMinutes(entry.time);
  const now = timeToMinutes(nowText);
  if (!Number.isFinite(target) || !Number.isFinite(now)) return false;
  const diff = Math.abs(target - now);
  const circularDiff = Math.min(diff, 24 * 60 - diff);
  return circularDiff <= scheduleWindowMinutes(env);
}

async function loadLatestSchedulerPayload(env: Env) {
  if (!supabaseConfigured(env)) return {} as Record<string, unknown>;
  const db = supabaseAdmin(env);
  const { data, error } = await db
    .from("operation_persistent_settings")
    .select("settings_key,payload,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const first = (data || [])[0] as { payload?: Record<string, unknown>; settings_key?: string; updated_at?: string } | undefined;
  return first?.payload || {};
}

async function saveLatestSchedulerPayload(env: Env, payload: Record<string, unknown>) {
  if (!supabaseConfigured(env)) return;
  const settingsKey = sanitizeSettingsKey(displayText(payload.settingsKey) || "default");
  const db = supabaseAdmin(env);
  await db.from("operation_persistent_settings").upsert(
    {
      settings_key: settingsKey,
      payload: {
        ...payload,
        settingsKey,
        savedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "settings_key" },
  );
}

async function saveSchedulerAudit(env: Env, eventType: string, payload: Record<string, unknown>) {
  if (!supabaseConfigured(env)) return;
  const db = supabaseAdmin(env);
  await db.from("operation_audit_logs").insert({ event_type: eventType, payload });
}

function schedulerActionRunKey(action: string, entry: SchedulerEntry | undefined, dateText: string) {
  const time = String(entry?.time || "manual");
  return `${dateText}|${action}|${time}`;
}

async function schedulerActionAlreadyRecorded(env: Env, runKey: string) {
  if (!supabaseConfigured(env)) return false;
  const db = supabaseAdmin(env);
  const { data, error } = await db
    .from("operation_audit_logs")
    .select("payload,created_at")
    .eq("event_type", "scheduler_action_v90")
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  return (data || []).some((row) => {
    const payload = (row as { payload?: Record<string, unknown> }).payload || {};
    return payload.runKey === runKey;
  });
}

async function recordSchedulerAction(env: Env, payload: Record<string, unknown>) {
  await saveSchedulerAudit(env, "scheduler_action_v90", payload);
}

async function runSchedulerActionOnce(
  env: Env,
  actions: Array<Record<string, unknown>>,
  action: string,
  entry: SchedulerEntry | undefined,
  nowDate: string,
  nowTime: string,
  runner: () => Promise<Record<string, unknown>>,
) {
  const runKey = schedulerActionRunKey(action, entry, nowDate);
  if (await schedulerActionAlreadyRecorded(env, runKey)) {
    actions.push({
      action,
      status: "skipped_duplicate",
      runKey,
      message: "오늘 같은 시간대의 스케줄러 실행이 이미 운영로그에 기록되어 중복 실행을 차단했습니다.",
    });
    return;
  }

  let result: Record<string, unknown>;
  try {
    result = await runner();
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      message: `스케줄러 ${action} 실행 중 오류가 발생했습니다.`,
    };
  }

  const auditPayload = {
    runKey,
    action,
    scheduledTime: entry?.time || "",
    nowKst: `${nowDate} ${nowTime}`,
    result,
  };
  await recordSchedulerAction(env, auditPayload);
  actions.push({ action, runKey, ...result });
}

function schedulerRequest(body: Record<string, unknown>) {
  return new Request("https://scheduler.local/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function schedulerTick(env: Env, manualBody?: PreviewBody) {
  const manualTick = Boolean(manualBody?.schedules);
  const savedPayload = manualTick ? ((manualBody || {}) as Record<string, unknown>) : await loadLatestSchedulerPayload(env);
  const schedules = normalizeScheduleConfig(manualBody?.schedules || savedPayload.schedules);
  const couponRows = Array.isArray(savedPayload.couponRows) ? savedPayload.couponRows : [];
  const couponApiSettings = objectRecord(savedPayload.couponApiSettings) as CouponApiSettings;
  const nowDate = kstDateText();
  const nowText = kstTimeText();
  const actions: Array<Record<string, unknown>> = [];

  if (!scheduledWritesAllowed(env)) {
    return jsonResponse({
      ok: true,
      mode: "scheduler_tick_gate_closed_v147",
      summary: { nowKst: `${nowDate} ${nowText}`, schedules, actions },
      safety: safetyStatus(env),
      message: "스케줄러 쓰기 Gate가 OFF라 자동 실행하지 않았습니다. 수동 버튼은 앱 화면에서 계속 사용할 수 있습니다.",
    });
  }

  if (!manualTick && !supabaseConfigured(env)) {
    return jsonResponse({
      ok: false,
      mode: "scheduler_tick_supabase_required_v147",
      summary: { nowKst: `${nowDate} ${nowText}`, schedules, actions },
      safety: safetyStatus(env),
      message: "자동 스케줄러 실행은 저장된 시간·쿠폰목록·중복실행 이력을 확인해야 하므로 Supabase 설정 후 사용할 수 있습니다.",
    });
  }

  if (scheduleDue(schedules.couponCancel, nowText, env)) {
    await runSchedulerActionOnce(env, actions, "couponCancel", schedules.couponCancel, nowDate, nowText, async () => {
      const rows = scheduledCouponRowsForAction(couponRows, "cancel", schedules, nowDate);
      const response = await couponActionPreview(schedulerRequest({ action: "cancel", rows, scheduledTime: schedules.couponCancel.time, forceCancel: true, daily24h: true, manual: false, couponApiSettings }), env);
      const result = await response.json() as Record<string, unknown>;
      const summary = objectRecord(result.summary);
      const canceledCouponIds = uniqueCouponIdList(normalizeCouponIdList(summary.canceledCouponIds));
      if (canceledCouponIds.length) {
        const nextCouponApiSettings = {
          ...couponApiSettings,
          lastCancelCouponIds: canceledCouponIds,
          lastCanceledAt: `${nowDate} ${nowText}`,
        };
        savedPayload.couponApiSettings = nextCouponApiSettings;
        await saveLatestSchedulerPayload(env, savedPayload);
      }
      return { rows: rows.length, ok: result.ok, message: result.message, canceledCouponIds };
    });
  }

  if (scheduleDue(schedules.couponApply, nowText, env)) {
    await runSchedulerActionOnce(env, actions, "couponApply", schedules.couponApply, nowDate, nowText, async () => {
      const rows = scheduledCouponRowsForAction(couponRows, "apply", schedules, nowDate);
      const response = await couponActionPreview(schedulerRequest({ action: "apply", rows, scheduledTime: schedules.couponApply.time, daily24h: true, manual: false, couponApiSettings }), env);
      const result = await response.json() as Record<string, unknown>;
      const summary = objectRecord(result.summary);
      const generatedCouponIds = uniqueCouponIdList(normalizeCouponIdList(summary.generatedCouponIds));
      const generatedRecords = Array.isArray(summary.generatedCouponRecords) ? summary.generatedCouponRecords as Array<Record<string, unknown>> : [];
      if (generatedCouponIds.length || generatedRecords.length) {
        const templates = normalizeRollingTemplates(couponApiSettings.rollingTemplates).map((template) => {
          const record = generatedRecords.find((item) => displayText(item.templateId) === displayText(template.id));
          const couponId = cleanDigitsOnly(record?.couponId || "");
          return couponId ? { ...template, latestCouponId: couponId, lastGeneratedCouponId: couponId, lastGeneratedAt: `${nowDate} ${nowText}` } : template;
        });
        const nextCouponApiSettings = {
          ...couponApiSettings,
          selectedMode: "daily_new",
          dailyRollingEnabled: true,
          selectedCouponId: (templates.length ? templates.map((template) => template.latestCouponId || template.sourceCouponId) : generatedCouponIds).join(","),
          lastGeneratedCouponIds: templates.length ? templates.map((template) => displayText(template.latestCouponId)).filter(Boolean) : generatedCouponIds,
          lastGeneratedCouponId: templates[0]?.latestCouponId || generatedCouponIds[0] || "",
          lastGeneratedAt: `${nowDate} ${nowText}`,
          rollingTemplates: templates.length ? templates : couponApiSettings.rollingTemplates,
        };
        savedPayload.couponApiSettings = nextCouponApiSettings;
        await saveLatestSchedulerPayload(env, savedPayload);
      }
      return { rows: rows.length, ok: result.ok, message: result.message, generatedCouponIds, generatedRecords };
    });
  }


  if (scheduleDue(schedules.storageCleanup, nowText, env)) {
    await runSchedulerActionOnce(env, actions, "storageCleanup", schedules.storageCleanup, nowDate, nowText, async () => {
      const response = await cleanupStorage(env);
      const result = await response.json() as Record<string, unknown>;
      return { ok: result.ok, message: result.message };
    });
  }

  if (actions.length) await saveSchedulerAudit(env, "scheduler_tick_v147", { nowKst: `${nowDate} ${nowText}`, actions });

  return jsonResponse({
    ok: true,
    mode: "scheduler_tick_v147",
    summary: { nowKst: `${nowDate} ${nowText}`, schedules, actions },
    safety: safetyStatus(env),
    message: actions.length
      ? `스케줄러 실행 대상 ${actions.length}개를 처리했습니다. 오늘 같은 시간대 중복 실행은 운영로그 기준으로 차단합니다.`
      : `현재 시간(${nowText})에 실행할 예약 작업이 없습니다.`,
  });
}


const R2_FOLDER_ROOT = "b2b-operation";
const R2_ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv", ".zip"]);

function r2Configured(env: Env) {
  return Boolean(env.B2B_FILES);
}

function r2Kind(value: unknown) {
  const kind = String(value || "purchase").trim().toLowerCase();
  return ["purchase", "invoice", "upload"].includes(kind) ? kind : "purchase";
}

function r2FolderPrefix(kindValue: unknown) {
  return `${R2_FOLDER_ROOT}/${r2Kind(kindValue)}/`;
}

function cleanR2Filename(value: unknown) {
  const filename = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[\u0000-\u001f<>:"|?*]+/g, "_")
    .trim()
    .slice(0, 180);
  if (!filename || filename.startsWith("~$")) throw new Error("허용되지 않은 파일명입니다.");
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (!R2_ALLOWED_EXTENSIONS.has(ext)) throw new Error("xlsx, xls, csv, zip 파일만 저장할 수 있습니다.");
  return filename;
}

function base64ToBytes(value: unknown) {
  const text = String(value || "").replace(/^data:[^,]+,/, "");
  if (!text) return new Uint8Array();
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function r2ContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function zipU16(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}
function zipU32(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}
function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
const zipCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();
function zipCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = zipCrcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipDateTime(date = new Date()) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    dosTime: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}
function createStoreZip(files: Array<{ filename: string; bytes: Uint8Array }>) {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { dosTime, dosDate } = zipDateTime();
  for (const file of files) {
    const name = encoder.encode(file.filename);
    const crc = zipCrc32(file.bytes);
    const localHeader = concatBytes([zipU32(0x04034b50), zipU16(20), zipU16(0x0800), zipU16(0), zipU16(dosTime), zipU16(dosDate), zipU32(crc), zipU32(file.bytes.length), zipU32(file.bytes.length), zipU16(name.length), zipU16(0), name]);
    local.push(localHeader, file.bytes);
    central.push(concatBytes([zipU32(0x02014b50), zipU16(20), zipU16(20), zipU16(0x0800), zipU16(0), zipU16(dosTime), zipU16(dosDate), zipU32(crc), zipU32(file.bytes.length), zipU32(file.bytes.length), zipU16(name.length), zipU16(0), zipU16(0), zipU16(0), zipU16(0), zipU32(0), zipU32(offset), name]));
    offset += localHeader.length + file.bytes.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  return concatBytes([...local, ...central, concatBytes([zipU32(0x06054b50), zipU16(0), zipU16(0), zipU16(files.length), zipU16(files.length), zipU32(centralSize), zipU32(offset), zipU16(0)])]);
}

async function r2ListFiles(env: Env, body: Record<string, unknown>) {
  if (!env.B2B_FILES) throw new Error("Cloudflare R2 바인딩 B2B_FILES가 설정되지 않았습니다.");
  const prefix = r2FolderPrefix(body.kind);
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || 80), 200));
  const maxBytes = Math.max(1024, Math.min(Number(body.maxBytes || 25 * 1024 * 1024), 80 * 1024 * 1024));
  const extensions = new Set((Array.isArray(body.extensions) ? body.extensions : [".xlsx", ".xls", ".csv"]).map((v) => String(v).toLowerCase()));
  const listed = await env.B2B_FILES.list({ prefix, limit: 1000 });
  const objects = listed.objects
    .filter((obj) => {
      const filename = obj.key.slice(prefix.length);
      const dot = filename.lastIndexOf(".");
      return filename && !filename.startsWith("~$") && extensions.has(dot >= 0 ? filename.slice(dot).toLowerCase() : "") && obj.size > 0 && obj.size <= maxBytes;
    })
    .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
    .slice(0, maxFiles);
  const files: Array<Record<string, unknown>> = [];
  for (const obj of objects) {
    const filename = obj.key.slice(prefix.length);
    const item: Record<string, unknown> = { filename, filePath: `r2://${obj.key}`, size: obj.size, modifiedAt: obj.uploaded.toISOString() };
    if (body.includeBase64 === true) {
      const stored = await env.B2B_FILES.get(obj.key);
      if (stored) item.base64 = bytesToBase64(new Uint8Array(await stored.arrayBuffer()));
    }
    files.push(item);
  }
  return { prefix, files };
}

async function handleR2FolderApi(request: Request, env: Env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/local/")) return null;
  if (!env.B2B_FILES) return jsonResponse({ ok: false, message: "Cloudflare R2 바인딩 B2B_FILES가 없습니다. wrangler.toml의 R2 bucket 설정과 실제 버킷 생성을 확인하세요." }, { status: 503 });
  if (request.method === "GET" && url.pathname === "/api/local/health") {
    return jsonResponse({ ok: true, mode: "cloudflare_r2_purchase_folder_v186", folderPath: "R2://b2b-operation" });
  }
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "not_found" }, { status: 404 });
  const body = await readJson<Record<string, unknown>>(request);
  const kind = r2Kind(body.kind);
  const prefix = r2FolderPrefix(kind);
  const base = { ok: true, folderPath: `R2://${prefix}`, folderName: `Cloudflare R2/${kind}`, cloudManaged: true };
  if (["/api/local/ensure-folder", "/api/local/open-folder"].includes(url.pathname)) return jsonResponse({ ...base, opened: false });
  if (url.pathname === "/api/local/save-many") {
    const rawFiles = Array.isArray(body.files) ? body.files as Array<Record<string, unknown>> : [];
    if (!rawFiles.length) return jsonResponse({ ok: false, message: "저장할 파일이 없습니다." }, { status: 400 });
    const saved = [];
    for (const item of rawFiles) {
      const filename = cleanR2Filename(item.filename);
      const bytes = base64ToBytes(item.base64);
      if (!bytes.length) continue;
      const key = `${prefix}${filename}`;
      await env.B2B_FILES.put(key, bytes, { httpMetadata: { contentType: r2ContentType(filename) }, customMetadata: { kind, source: "b2b-web-v186" } });
      saved.push({ filename, filePath: `r2://${key}` });
    }
    return jsonResponse({ ...base, files: saved, opened: false });
  }
  if (url.pathname === "/api/local/save-blob") {
    const filename = cleanR2Filename(body.filename);
    const bytes = base64ToBytes(body.base64);
    if (!bytes.length) return jsonResponse({ ok: false, message: "빈 파일은 저장할 수 없습니다." }, { status: 400 });
    const key = `${prefix}${filename}`;
    await env.B2B_FILES.put(key, bytes, { httpMetadata: { contentType: r2ContentType(filename) }, customMetadata: { kind, source: "b2b-web-v186" } });
    return jsonResponse({ ...base, filename, filePath: `r2://${key}` });
  }
  if (url.pathname === "/api/local/list-files") {
    const result = await r2ListFiles(env, body);
    return jsonResponse({ ...base, files: result.files });
  }
  if (url.pathname === "/api/local/read-file") {
    const filename = cleanR2Filename(body.filename);
    const key = `${prefix}${filename}`;
    const stored = await env.B2B_FILES.get(key);
    if (!stored) return jsonResponse({ ok: false, message: "R2 발주폴더에서 파일을 찾지 못했습니다." }, { status: 404 });
    const bytes = new Uint8Array(await stored.arrayBuffer());
    return jsonResponse({ ...base, filename, size: bytes.length, modifiedAt: stored.uploaded.toISOString(), base64: bytesToBase64(bytes) });
  }
  if (url.pathname === "/api/local/download-zip") {
    const requestedNames = Array.isArray(body.filenames)
      ? Array.from(new Set(body.filenames.map((value) => cleanR2Filename(value))))
      : [];
    const result = requestedNames.length
      ? { files: requestedNames.map((filename) => ({ filename })) }
      : await r2ListFiles(env, { ...body, includeBase64: false });
    const zipFiles: Array<{ filename: string; bytes: Uint8Array }> = [];
    for (const item of result.files) {
      const filename = String(item.filename || "");
      const stored = await env.B2B_FILES.get(`${prefix}${filename}`);
      if (stored) zipFiles.push({ filename, bytes: new Uint8Array(await stored.arrayBuffer()) });
    }
    if (!zipFiles.length) return jsonResponse({ ok: false, message: "ZIP으로 묶을 파일이 없습니다." }, { status: 404 });
    const filename = cleanR2Filename(body.filename || `B2B_${kind}_files.zip`);
    const zip = createStoreZip(zipFiles);
    return jsonResponse({ ...base, filename, count: zipFiles.length, size: zip.length, base64: bytesToBase64(zip) });
  }
  return jsonResponse({ ok: false, message: "not_found" }, { status: 404 });
}


async function cleanupR2ExpiredFiles(env: Env) {
  if (!env.B2B_FILES) return { configured: false, deleted: 0 };
  const retentionDays = Math.max(1, Math.min(Number(env.R2_FILE_RETENTION_DAYS || 30), 365));
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await env.B2B_FILES.list({ prefix: `${R2_FOLDER_ROOT}/`, limit: 1000, cursor });
    const expired = page.objects.filter((obj) => obj.uploaded.getTime() < cutoff).map((obj) => obj.key);
    if (expired.length) {
      await env.B2B_FILES.delete(expired);
      deleted += expired.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { configured: true, retentionDays, deleted };
}

async function route(request: Request, env: Env): Promise<Response> {
  try {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const r2Response = await handleR2FolderApi(request, env);
    if (r2Response) return r2Response;
    const proxied = await maybeProxyToNcloud(request, env);
    if (proxied) return proxied;
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        version: "v186-r2-fixed-ip-gateway",
        at: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/system/public-ip") {
      return publicIpCheck(request, env);
    }

    if (url.pathname === "/api/system/status") {
      return jsonResponse({
        ok: true,
        version: "v186-r2-fixed-ip-gateway",
        safety: safetyStatus(env),
        storage: {
          supabaseConfigured: supabaseConfigured(env),
          r2Configured: r2Configured(env),
          fileStorage: r2Configured(env) ? "Cloudflare R2" : "not_configured",
          tempTtlHours: 24,
          persistentSettings: "operation_persistent_settings",
        },
        credentials: credentialStatus(env),
      });
    }

    if (url.pathname === "/api/system/routes") {
      return jsonResponse({
        ok: true,
        routes: routeInventory(),
        safety: safetyStatus(env),
      });
    }

    if (url.pathname === "/api/system/connection-check")
      return supabaseConnectionCheck(env);

    if (url.pathname === "/api/system/server-operation-check")
      return serverOperationCheck(env);

    if (url.pathname === "/api/system/readiness") {
      return jsonResponse({
        ok: true,
        mode: "full_operation_workflow_ready_v90",
        checks: [
          {
            name: "쿠팡 주문 수집",
            status: liveExecutionAllowed(env)
              ? "live_gate_open"
              : "preview_ready",
            detail: "시간설정 없이 수동 실행 버튼 + API 경로 환경변수 연결",
          },
          {
            name: "토스 주문 수집",
            status: liveExecutionAllowed(env)
              ? "live_gate_open"
              : "preview_ready",
            detail: "시간설정 없이 수동 실행 버튼 + API 경로 환경변수 연결",
          },
          {
            name: "B2B 업체별 실제 발주양식",
            status: "ready",
            detail: "업체별 열 설정/수정/저장",
          },
          {
            name: "Supabase 주문자료 매핑검사",
            status: supabaseConfigured(env) ? "ready" : "needs_supabase",
            detail: "최신 주문자료만 불러와 현재 매핑 기준으로 검사",
          },
          {
            name: "B2B 송장 회수양식",
            status: "ready",
            detail: "업체별 택배사열/운송장번호열 설정/수정/저장",
          },
          {
            name: "쿠팡/토스 송장 등록",
            status: "preview_only",
            detail: "쿠팡·토스 출력양식 설정 + Gate 차단",
          },
          {
            name: "쿠팡 할인쿠폰 취소/적용",
            status: liveExecutionAllowed(env)
              ? "live_gate_open"
              : "preview_only",
            detail: "옵션ID별 쿠폰 양식 + 23:50/23:51 시간설정",
          },
          {
            name: "스케줄러 자동 실행",
            status: scheduledWritesAllowed(env) ? "scheduled_gate_open" : "off",
            detail: "ALLOW_SCHEDULED_WRITES 기준. 자동 실행 대상은 쿠폰·저장소 정리만 포함",
          },
          {
            name: "쿠폰 안전검증",
            status: "client_ready",
            detail:
              "매출-원가-판매수수료-광고료-배송료 기준, API/원본 정산값 우선 반영, 스케줄러 운영로그 스냅샷 저장",
          },
          {
            name: "매핑/양식/쿠폰 영구저장",
            status: supabaseConfigured(env) ? "ready" : "needs_supabase",
            detail:
              "매핑·발주·송장·쿠팡/토스 양식·쿠폰 설정을 operation_persistent_settings 테이블에 삭제 전까지 보관",
          },
          {
            name: "서버 저장용량 점검·정리",
            status: supabaseConfigured(env) ? "ready" : "needs_supabase",
            detail: "1일 임시자료/만료자료 정리",
          },
        ],
        safety: safetyStatus(env),
      });
    }

    if (url.pathname === "/api/dashboard") {
      return jsonResponse({
        ok: true,
        version: "v186-r2-fixed-ip-gateway",
        summary: {
          flow: "api/excel orders -> mapping -> vendor/channel purchase files -> vendor invoice excel -> shipment preview -> accounting profit/storage",
          serverRetentionHours: 24,
          persistentSettings:
            "mapping/purchaseTemplates/channelPurchaseTemplates/invoiceTemplates/shipmentTemplates/profitSettings until explicit deletion",
          liveExecution: liveExecutionAllowed(env),
          scheduledWrites: scheduledWritesAllowed(env),
        },
        safety: safetyStatus(env),
      });
    }

    if (
      url.pathname === "/api/operation/simple-temp/save" &&
      request.method === "POST"
    )
      return saveSimpleTempSession(request, env);
    if (
      url.pathname === "/api/operation/simple-temp/load" &&
      request.method === "GET"
    )
      return loadSimpleTempSession(url, env);
    if (
      url.pathname === "/api/operation/simple-temp/latest" &&
      request.method === "GET"
    )
      return loadLatestTempSession(env);
    if (
      url.pathname === "/api/operation/simple-temp/latest-orders" &&
      request.method === "GET"
    )
      return loadLatestOrderSession(env);
    if (
      url.pathname === "/api/operation/settings/save" &&
      request.method === "POST"
    )
      return savePersistentSettings(request, env);
    if (
      url.pathname === "/api/operation/settings/load" &&
      request.method === "GET"
    )
      return loadPersistentSettings(url, env);
    if (
      url.pathname === "/api/operation/settings/latest" &&
      request.method === "GET"
    )
      return loadLatestPersistentSettings(env);
    if (
      url.pathname === "/api/operation/settings/delete" &&
      request.method === "POST"
    )
      return deletePersistentSettings(request, env);
    if (
      url.pathname === "/api/operation/logs/save" &&
      request.method === "POST"
    )
      return saveOperationLog(request, env);
    if (
      url.pathname === "/api/operation/logs/latest" &&
      request.method === "GET"
    )
      return loadLatestOperationLogs(env);
    if (
      url.pathname === "/api/integrations/orders/acknowledge-execute" &&
      request.method === "POST"
    )
      return orderAcknowledgeExecute(request, env);

    if (
      url.pathname === "/api/integrations/orders/collect-preview" &&
      request.method === "POST"
    )
      return collectOrdersPreview(request, env);
    if (
      url.pathname === "/api/integrations/orders/diagnose" &&
      request.method === "POST"
    )
      return collectOrdersPreview(request, env);
    if (
      url.pathname === "/api/integrations/coupang/products/prices-sync" &&
      request.method === "POST"
    )
      return coupangVendorItemPriceSync(request, env);
    if (
      url.pathname === "/api/integrations/toss/products/options-sync" &&
      request.method === "POST"
    )
      return tossProductOptionSync(request, env);
    if (
      url.pathname === "/api/integrations/shipments/upload-plan" &&
      request.method === "POST"
    )
      return shipmentUploadPlan(request, env);
    if (
      url.pathname === "/api/integrations/shipments/upload-execute" &&
      request.method === "POST"
    )
      return shipmentUploadExecute(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/contracts-list" &&
      request.method === "POST"
    )
      return coupangCouponContractList(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/list" &&
      request.method === "POST"
    )
      return coupangCouponList(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/items-list" &&
      request.method === "POST"
    )
      return coupangCouponItemList(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/request-status" &&
      request.method === "POST"
    )
      return coupangCouponRequestStatus(request, env);
    if (
      url.pathname === "/api/integrations/coupons/action-preview" &&
      request.method === "POST"
    )
      return couponActionPreview(request, env);
    if (
      url.pathname === "/api/scheduler/run-preview" &&
      request.method === "POST"
    )
      return schedulerRunPreview(request, env);
    if (url.pathname === "/api/scheduler/tick" && request.method === "POST")
      return schedulerTick(env, await readJson<PreviewBody>(request));
    if (url.pathname === "/api/storage/status" && request.method === "GET")
      return storageStatus(env);
    if (url.pathname === "/api/storage/cleanup" && request.method === "POST")
      return cleanupStorage(env);

    if (
      url.pathname === "/api/operation/v2/dry-run/full" &&
      request.method === "POST"
    ) {
      return jsonResponse({
        ok: true,
        mode: "dry_run_only_v70",
        externalApiExecuted: false,
        finalExecutionStillDisabled: true,
        safety: safetyStatus(env),
        steps: [
          "쿠팡/토스 주문 수집 Preview",
          "매핑 엑셀",
          "업체별 실제 발주양식",
          "업체 송장 엑셀",
          "송장 등록 Preview",
          "쿠폰 Preview",
          "저장소 정리",
        ],
      });
    }

    return jsonResponse(
      { ok: false, error: "Not Found", path: url.pathname },
      { status: 404 },
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        safety: safetyStatus(env),
      },
      { status: 500 },
    );
  }
}

export default {
  fetch: route,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    try {
      await cleanupR2ExpiredFiles(env);
      const base = cleanProxyBase(env.NCLOUD_API_BASE) || DEFAULT_NCLOUD_FIXED_IP_API_BASE;
      await fetch(`${base}/api/scheduler/tick`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-b2b-proxy": "cloudflare-cron-to-ncloud-fixed-ip-v186" },
        body: JSON.stringify({ source: "cloudflare-cron-v186" }),
      });
    } catch (error) {
      console.error("V186 scheduled task failed", error);
    }
  },
};
