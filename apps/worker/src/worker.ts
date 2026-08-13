// 회귀검증 호환 표식: version: "v208-adminplus-multi-account-automation"
import type { Env } from "./types";
import { joinAddressParts } from "./address";
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

type MappingSyncPayload = {
  settingsKey?: string;
  mappings?: unknown[];
  deletedKeys?: string[];
  source?: string;
};

type OperationLogPayload = {
  eventType?: string;
  payload?: Record<string, unknown>;
};

const SERVER_OPERATION_SQL_FILE =
  "supabase/migrations/20260710_v187_coupon_automation.sql";

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
  {
    table: "coupon_automation_retries",
    purpose: "쿠폰 생성·적용·정리 30분 뒤 최종 재시도 저장",
  },
  {
    table: "coupon_automation_failures",
    purpose: "쿠폰별 미확인 실패 알림과 수동 확인 기록",
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
  status?: string;
  type?: string;
  discountType?: "금액" | "율" | "";
  discountValue?: number;
  startAt?: string;
  endAt?: string;
  options?: Array<Record<string, unknown>>;
  lastGeneratedCouponId?: string;
  lastGeneratedAt?: string;
  lastCanceledAt?: string;
  lastCanceledAtIso?: string;
  baseCouponName?: string;
  maxDiscountPrice?: number;
  wowExclusive?: boolean;
  automationState?: "draft" | "validated" | "active" | "stopped" | "failed";
  preflightStatus?: "미검증" | "통과" | "실패";
  preflightAt?: string;
  preflightIssues?: string[];
  failureAcknowledgedAt?: string;
  scheduleStartDate?: string;
  lastCouponHealthCheckedAtIso?: string;
  nextCouponHealthCheckAtIso?: string;
  inactiveObservedAtIso?: string;
  couponHealthBackoffMinutes?: number;
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
  automationEnabled?: boolean;
  automationValidatedAt?: string;
  automationActivatedAt?: string;
  automationStoppedAt?: string;
  lastPreflightAt?: string;
  unacknowledgedFailureCount?: number;
  tossCouponAutomationAvailable?: boolean;
  rollingTemplates?: RollingCouponTemplate[];
};

const RUNTIME_API_PATH_KEYS = [
  "COUPANG_ORDERS_PATH",
  "COUPANG_VENDOR_ITEM_INVENTORY_PATH",
  "COUPANG_SHIPMENT_UPLOAD_PATH",
  "COUPANG_ORDER_ACK_PATH",
  "COUPANG_COUPON_CREATE_PATH",
  "COUPANG_COUPON_APPLY_PATH",
  "COUPANG_COUPON_CANCEL_PATH",
  "COUPANG_COUPON_REQUEST_STATUS_PATH",
  "COUPANG_COUPON_CONTRACT_LIST_PATH",
  "COUPANG_COUPON_LIST_PATH",
  "COUPANG_COUPON_ITEM_LIST_PATH",
  "TOSS_ORDERS_PATH",
  "TOSS_ORDER_STATUS_PATH",
  "TOSS_SHIPMENT_UPLOAD_PATH",
] as const;

type RuntimeApiPathKey = (typeof RUNTIME_API_PATH_KEYS)[number];
type ApiEndpointSettings = Partial<Record<RuntimeApiPathKey, string>>;

type PreviewBody = Record<string, unknown> & {
  channel?: "쿠팡" | "토스" | "coupang" | "toss";
  action?: "cancel" | "apply";
  rows?: unknown[];
  schedules?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | null | undefined>;
  manual?: boolean;
  diagnosticOnly?: boolean;
  couponApiSettings?: CouponApiSettings;
  apiEndpointSettings?: ApiEndpointSettings;
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
  const resultType = String(obj.resultType || obj.status || "").trim().toUpperCase();
  const successValue = obj.success;
  const errorValue = obj.error;

  // Toss Shopping 공식 응답의 성공/실패 기준은 resultType입니다.
  // SUCCESS 응답에 schema placeholder 또는 빈 error 객체가 존재해도 실패로 오판하지 않습니다.
  if (resultType === "SUCCESS" || resultType === "OK") return "";

  const explicitFailure = successValue === false || ["FAIL", "FAILED", "ERROR"].includes(resultType);
  const errorObj = objectRecord(errorValue);
  const meaningfulError = Boolean(
    String(errorObj.errorCode || errorObj.code || errorObj.reason || errorObj.message || "").trim()
  );
  if (!explicitFailure && !meaningfulError) return "";

  const message = diagnosticMessage(errorValue || data);
  return message && message !== "{}" ? message : "토스 resultType=FAIL 응답입니다.";
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

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bearerTokenFromRequest(request: Request) {
  return String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function credentialAdminOriginAllowed(request: Request) {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && (url.hostname === "b2b-bpt.pages.dev" || url.hostname.endsWith(".b2b-bpt.pages.dev"))) return true;
    return ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function buildCredentialSecurityEnvelope(request: Request, pathname: string) {
  const adminToken = bearerTokenFromRequest(request);
  if (adminToken.length < 32) throw new Error("Ncloud 관리 토큰을 다시 확인하세요.");
  const plain = new Uint8Array(await request.arrayBuffer());
  if (!plain.length || plain.length > 64 * 1024) throw new Error("인증키 요청 본문 크기가 올바르지 않습니다.");
  const encoder = new TextEncoder();
  const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(adminToken));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const timestamp = String(Date.now());
  const additionalData = encoder.encode(`b2b-coupang-credentials-v1\n${timestamp}\n${pathname}`);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData, tagLength: 128 },
    key,
    plain,
  );
  return JSON.stringify({
    version: 1,
    timestamp,
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(cipher)),
  });
}

async function maybeProxyToNcloud(request: Request, env: Env) {
  if (isNcloudServerMode(env)) return null;
  // V179 final: use the fixed Ncloud DNS hostname because Worker subrequests to a raw IP can return Cloudflare 1003.
  const base = cleanProxyBase(env.NCLOUD_API_BASE) || DEFAULT_NCLOUD_FIXED_IP_API_BASE;
  const incomingUrl = new URL(request.url);
  const fixedIpPaths = [
    "/api/integrations/",
    "/api/admin/coupang-credentials/",
    "/api/admin/toss-credentials/",
    "/api/admin/adminplus-credentials/",
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
      mode: "cloudflare_worker_to_ncloud_fixed_ip_gateway_v187",
      ncloudApiBase: base,
      message: "Cloudflare Worker uses R2/Supabase for cloud storage and routes fixed-IP marketplace API calls through Ncloud.",
    });
  }
  const target = new URL(base);
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const headers = new Headers();
  const isCredentialAdminRequest = ["/api/admin/coupang-credentials/", "/api/admin/toss-credentials/", "/api/admin/adminplus-credentials/"].some((path) => incomingUrl.pathname.startsWith(path));
  let upstreamBody: BodyInit | null | undefined;
  try {
    if (isCredentialAdminRequest) {
      if (request.method.toUpperCase() !== "POST") {
        return jsonResponse({ ok: false, message: "인증키 관리는 POST 요청만 허용합니다." }, { status: 405 });
      }
      if (!credentialAdminOriginAllowed(request)) {
        return jsonResponse({ ok: false, message: "허용된 B2B 웹앱에서만 인증키를 변경할 수 있습니다." }, { status: 403 });
      }
      upstreamBody = await buildCredentialSecurityEnvelope(request, incomingUrl.pathname);
      headers.set("content-type", "application/json");
      headers.set("x-b2b-credential-envelope", "aes-256-gcm-v1");
    } else {
      const contentType = request.headers.get("content-type");
      if (contentType) headers.set("content-type", contentType);
      const authorization = request.headers.get("authorization");
      if (authorization) headers.set("authorization", authorization);
      upstreamBody = ["GET", "HEAD"].includes(request.method) ? undefined : request.body;
    }
    headers.set("x-b2b-proxy", "cloudflare-worker-to-ncloud-fixed-ip-v201");
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: upstreamBody,
      redirect: "manual",
    });
    const upstreamContentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok && !upstreamContentType.toLowerCase().includes("application/json")) {
      const bodyPreview = (await upstream.text()).trim().replace(/\s+/g, " ").slice(0, 300);
      return jsonResponse({
        ok: false,
        mode: "cloudflare_worker_to_ncloud_origin_error_v187",
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
      mode: "cloudflare_worker_to_ncloud_origin_fetch_error_v187",
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
    // 신규 등록 상품은 optionId가 잠시 비어 있거나 늦게 내려올 수 있습니다.
    // 주문상품ID·묶음배송번호·옵션명까지 포함해 서로 다른 신규 상품행이
    // 같은 주문으로 잘못 합쳐지는 일을 막습니다.
    const key = [
      displayText(record.channel),
      displayText(record.orderNo),
      displayText(record.shipmentBoxId),
      displayText(record.orderProductId),
      displayText(record.optionId),
      displayText(record.productName),
      displayText(record.optionName),
      displayText(record.receiverName),
      displayText(record.address),
      displayText(record.qty),
      displayText(record.orderedAt),
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

function normalizeRuntimeApiPath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const pathOnly = withoutOrigin.split("?")[0].trim();
  if (!pathOnly.startsWith("/") || /[\r\n]/.test(pathOnly) || pathOnly.includes("://")) return "";
  return pathOnly;
}

function normalizeRuntimeApiEndpointSettings(value: unknown): ApiEndpointSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalized: ApiEndpointSettings = {};
  for (const key of RUNTIME_API_PATH_KEYS) {
    const pathValue = normalizeRuntimeApiPath(source[key]);
    if (pathValue) normalized[key] = pathValue;
  }
  return normalized;
}

function envWithApiEndpointSettings(env: Env, value: unknown): Env {
  const settings = normalizeRuntimeApiEndpointSettings(value);
  if (!Object.keys(settings).length) return env;
  const next = { ...env } as Env;
  const target = next as unknown as Record<string, unknown>;
  for (const key of RUNTIME_API_PATH_KEYS) {
    const pathValue = settings[key];
    if (pathValue) target[key] = pathValue;
  }
  return next;
}

async function apiEndpointSettingsFromRequest(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return {};
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  try {
    const body = await request.clone().json() as Record<string, unknown>;
    return normalizeRuntimeApiEndpointSettings(body.apiEndpointSettings);
  } catch {
    return {};
  }
}

function credentialStatus(env: Env): Record<string, boolean> {
  return {
    coupangConfigured: coupangConfigured(env),
    tossConfigured: tossConfigured(env),
    adminplusConfigured: adminplusAccounts(env).length > 0,
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

function queryKeysFromParams(params: URLSearchParams) {
  const keys: string[] = [];
  params.forEach((_value, key) => keys.push(key));
  return Array.from(new Set(keys));
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

function cleanCoupangCredential(value: unknown) {
  // systemd/Cloudflare secret 등록 과정에서 붙은 공백·개행·따옴표 때문에
  // HMAC이 달라지는 문제를 방지합니다. 실제 키 내부 문자는 변경하지 않습니다.
  return String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

async function coupangAuthorization(
  env: Env,
  method: string,
  path: string,
  query: string,
) {
  // Coupang 공식 형식: yyMMdd'T'HHmmss'Z' (UTC)
  const signedDate = new Date()
    .toISOString()
    .split(".")[0]
    .replace(/[-:]/g, "")
    .slice(2) + "Z";
  const accessKey = cleanCoupangCredential(env.COUPANG_ACCESS_KEY);
  const secretKey = cleanCoupangCredential(env.COUPANG_SECRET_KEY);
  const message = `${signedDate}${method.toUpperCase()}${path}${query}`;
  const signature = await hmacSha256Hex(secretKey, message);
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}


type CoupangRawJsonBody = { __coupangRawJson: string };

function coupangRawJsonBody(jsonText: string): CoupangRawJsonBody {
  return { __coupangRawJson: jsonText };
}

function coupangRequestBodyText(body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).__coupangRawJson === "string"
  ) {
    return String((body as Record<string, unknown>).__coupangRawJson);
  }
  return JSON.stringify(body);
}

function exactJsonInteger(value: unknown, fieldName: string) {
  const digits = String(value ?? "").trim().replace(/[^0-9]/g, "");
  if (!digits) throw new Error(`${fieldName} 숫자값이 없습니다.`);
  return digits;
}

function coupangAckRawJson(vendorId: string, shipmentBoxIds: string[]) {
  const ids = shipmentBoxIds.map((id) => exactJsonInteger(id, "shipmentBoxId")).join(",");
  return `{"vendorId":${JSON.stringify(vendorId)},"shipmentBoxIds":[${ids}]}`;
}

function coupangInvoiceRawJson(
  vendorId: string,
  rows: Array<{
    shipmentBoxId: string;
    orderId: string;
    vendorItemId: string;
    deliveryCompanyCode: string;
    trackingNo: string;
  }>,
) {
  const items = rows.map((row) => [
    `{"shipmentBoxId":${exactJsonInteger(row.shipmentBoxId, "shipmentBoxId")}`,
    `"orderId":${exactJsonInteger(row.orderId, "orderId")}`,
    `"vendorItemId":${exactJsonInteger(row.vendorItemId, "vendorItemId")}`,
    `"deliveryCompanyCode":${JSON.stringify(row.deliveryCompanyCode)}`,
    `"invoiceNumber":${JSON.stringify(row.trackingNo)}`,
    `"splitShipping":false`,
    `"preSplitShipped":false`,
    `"estimatedShippingDate":""}`,
  ].join(",")).join(",");
  return `{"vendorId":${JSON.stringify(vendorId)},"orderSheetInvoiceApplyDtos":[${items}]}`;
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
      // 2025년 이후 Coupang Open API 테스트 가이드의 필수 요청자 헤더
      "X-Requested-By": cleanCoupangCredential(env.COUPANG_VENDOR_ID),
      "X-MARKET": "KR",
      "X-EXTENDED-TIMEOUT": "90000",
    },
    body:
      body === undefined || method.toUpperCase() === "GET"
        ? undefined
        : coupangRequestBodyText(body),
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
  if (response.status === 401) {
    diagnostics.push({
      step: "쿠팡 인증 점검",
      status: "오류",
      detail: containsText(data, /expired/i)
        ? "서버 시간이 쿠팡과 5분 이상 차이납니다. NTP 동기화 상태를 확인하세요."
        : "Invalid signature입니다. Access Key/Secret Key/Vendor ID 조합, 키 앞뒤 공백, 서버 UTC 시간, 실제 전송 URL과 서명 URL 일치 여부를 확인하세요.",
    });
  }
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

type CachedAccessToken = { token: string; expiresAt: number; issuedAt: number; expiresIn: number; credentialFingerprint?: string };
let tossAccessTokenCache: CachedAccessToken | null = null;
const adminplusAccessTokenCache = new Map<string, CachedAccessToken>();

function credentialFingerprint(...values: unknown[]) {
  const text = values.map((value) => String(value ?? "")).join("\u001f");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function tokenExpiresInSeconds(data: unknown, fallback = 0) {
  const obj = objectRecord(data);
  const nested = objectRecord(obj.data);
  const value = Number(obj.expires_in ?? obj.expiresIn ?? nested.expires_in ?? nested.expiresIn ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function tossTokenRequest(env: Env, forceRefresh = false) {
  const diagnostics: ExternalDiagnosticStep[] = [];
  if (env.TOSS_SHOPPING_API_KEY) {
    diagnostics.push({ step: "토스 토큰 준비", status: "건너뜀", detail: "사전 발급 토큰을 사용합니다. 토큰 값은 표시하지 않습니다." });
    return { ok: true, status: 200, token: env.TOSS_SHOPPING_API_KEY, data: null, diagnostics, expiresAt: 0, expiresIn: 0, cached: true };
  }

  const tossCredentialFingerprint = credentialFingerprint(env.TOSS_CLIENT_ID, env.TOSS_CLIENT_SECRET, env.TOSS_SHOPPING_API_KEY);
  if (!forceRefresh && tossAccessTokenCache && tossAccessTokenCache.credentialFingerprint === tossCredentialFingerprint && tossAccessTokenCache.expiresAt - Date.now() > 5 * 60 * 1000) {
    diagnostics.push({ step: "토스 토큰 캐시", status: "정상", detail: `기존 Access Token을 재사용합니다. 만료까지 약 ${Math.ceil((tossAccessTokenCache.expiresAt-Date.now())/60000)}분 남았습니다.` });
    return { ok: true, status: 200, token: tossAccessTokenCache.token, data: null, diagnostics, expiresAt: tossAccessTokenCache.expiresAt, expiresIn: Math.max(0, Math.floor((tossAccessTokenCache.expiresAt-Date.now())/1000)), cached: true };
  }

  const tokenUrl = env.TOSS_TOKEN_URL || "https://oauth2.cert.toss.im/token";
  if (!env.TOSS_CLIENT_ID || !env.TOSS_CLIENT_SECRET) {
    diagnostics.push({ step: "토스 토큰 준비", status: "오류", detail: "TOSS_CLIENT_ID 또는 TOSS_CLIENT_SECRET이 없습니다." });
    return { ok: false, status: 0, token: "", data: null, diagnostics, expiresAt: 0, expiresIn: 0, cached: false };
  }

  const form = new URLSearchParams();
  form.set("grant_type", "client_credentials");
  form.set("client_id", env.TOSS_CLIENT_ID);
  form.set("client_secret", env.TOSS_CLIENT_SECRET);
  if (env.TOSS_SCOPE) form.set("scope", env.TOSS_SCOPE);
  diagnostics.push({ step: "토스 토큰 요청 준비", status: "준비", detail: `POST ${tokenUrl}, grant_type=client_credentials, scope=${env.TOSS_SCOPE || "없음"}` });

  const response = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", accept: "application/json" }, body: form.toString() });
  const responseText = await response.text();
  let data: unknown = responseText;
  try { data = responseText ? JSON.parse(responseText) : null; } catch { /* keep text */ }
  const token = findAccessToken(data);
  const expiresIn = tokenExpiresInSeconds(data, 0);
  const expiresAt = token && expiresIn ? Date.now() + expiresIn * 1000 : 0;
  if (response.ok && token) tossAccessTokenCache = { token, expiresAt: expiresAt || Date.now() + 60 * 60 * 1000, issuedAt: Date.now(), expiresIn, credentialFingerprint: tossCredentialFingerprint };
  diagnostics.push({ step: "토스 토큰 발급 응답", status: response.ok && token ? "정상" : "오류", detail: response.ok && token ? `HTTP ${response.status}, Access Token 발급 확인${expiresIn ? `, 유효기간 ${expiresIn}초` : ""}. 토큰 값은 표시하지 않습니다.` : `HTTP ${response.status}: ${diagnosticMessage(data)}` });
  return { ok: response.ok && Boolean(token), status: response.status, token, data, diagnostics, expiresAt, expiresIn, cached: false };
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

  const perform = async (token: string) => {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body:
        body === undefined || method.toUpperCase() === "GET"
          ? undefined
          : JSON.stringify(body),
    });
    const text = await response.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { response, data };
  };

  let performed = await perform(tokenResult.token);
  if (performed.response.status === 401 && !env.TOSS_SHOPPING_API_KEY) {
    tossAccessTokenCache = null;
    const refreshed = await tossTokenRequest(env, true);
    diagnostics.push(...refreshed.diagnostics);
    if (refreshed.ok && refreshed.token) {
      diagnostics.push({ step: "토스 만료 토큰 자동교체", status: "준비", detail: "HTTP 401을 감지해 Access Token을 새로 발급받아 요청을 1회 재시도합니다." });
      performed = await perform(refreshed.token);
    }
  }

  const response = performed.response;
  const data = performed.data;
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

type AdminPlusCredentialAccount = {
  id: string;
  label: string;
  vendorName: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
};

type AdminPlusAutomationConfig = {
  enabled?: boolean;
  shipmentTimes?: string[];
  priceWatchEnabled?: boolean;
  priceCheckTimes?: string[];
  startedAt?: string;
  lastPurchaseAt?: string;
  lastShipmentAt?: string;
  lastPriceCheckAt?: string;
  accountRules?: Array<{
    accountId?: string;
    vendorName?: string;
    enabled?: boolean;
    autoPurchase?: boolean;
    autoPayment?: boolean;
    paymentMaxPerBatch?: number;
    paymentDailyLimit?: number;
    autoShipment?: boolean;
  }>;
};

type AdminPlusPurchaseHistoryRow = {
  id?: string;
  sourceKey?: string;
  accountId?: string;
  vendorName?: string;
  channel?: string;
  orderNo?: string;
  orderedAt?: string;
  optionId?: string;
  vendorProductName?: string;
  customerOrderCode?: string;
  orderKey?: string;
  adminplusOrderCode?: string;
  orderAmount?: number;
  paymentKey?: string;
  paymentStatus?: string;
  paymentAmount?: number;
  paymentCompletedAt?: string;
  marketplacePreparingAt?: string;
  paymentError?: string;
  shipmentBoxId?: string;
  orderId?: string;
  orderProductId?: string;
  vendorItemId?: string;
  receiverName?: string;
  submittedAt?: string;
  shipmentUploadedAt?: string;
  operatorResolvedAt?: string;
  operatorResolveReason?: string;
  marketRecheckedAt?: string;
  marketRecheckedStatus?: string;
  trackingNo?: string;
  courier?: string;
  error?: string;
};

function adminplusAccounts(env: Env): AdminPlusCredentialAccount[] {
  const raw = String(env.ADMINPLUS_ACCOUNTS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.accounts) ? parsed.accounts : [];
    return source.map((item: any, index: number) => ({
      id: String(item?.id || `adminplus-${index + 1}`).trim(),
      label: String(item?.label || item?.vendorName || `어드민플러스 ${index + 1}`).trim(),
      vendorName: String(item?.vendorName || item?.label || "").trim(),
      clientId: String(item?.clientId || item?.client_id || "").trim(),
      clientSecret: String(item?.clientSecret || item?.client_secret || "").trim(),
      enabled: item?.enabled !== false,
    })).filter((row: AdminPlusCredentialAccount) => row.id && row.clientId && row.clientSecret);
  } catch {
    return [];
  }
}

function adminplusAccountById(env: Env, accountId: unknown) {
  const id = String(accountId || "").trim();
  return adminplusAccounts(env).find((account) => account.id === id);
}

async function adminplusTokenRequest(env: Env, account: AdminPlusCredentialAccount, forceRefresh = false) {
  const diagnostics: ExternalDiagnosticStep[] = [];
  const cached = adminplusAccessTokenCache.get(account.id);
  const accountCredentialFingerprint = credentialFingerprint(account.clientId, account.clientSecret);
  if (!forceRefresh && cached && cached.credentialFingerprint === accountCredentialFingerprint && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    diagnostics.push({ step: `어드민플러스 ${account.label} 토큰`, status: "정상", detail: `기존 Access Token 재사용 · 만료까지 약 ${Math.ceil((cached.expiresAt-Date.now())/60000)}분` });
    return { ok: true, status: 200, token: cached.token, data: null, diagnostics, expiresAt: cached.expiresAt, expiresIn: Math.max(0, Math.floor((cached.expiresAt-Date.now())/1000)), cached: true };
  }
  const base = String(env.ADMINPLUS_BASE_URL || "https://api.adminplus.co.kr").replace(/\/$/, "");
  const form = new URLSearchParams();
  form.set("client_id", account.clientId);
  form.set("client_secret", account.clientSecret);
  const response = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
  });
  const responseText = await response.text();
  let data: unknown = responseText;
  try { data = responseText ? JSON.parse(responseText) : null; } catch { /* keep text */ }
  const obj = objectRecord(data);
  const nested = objectRecord(obj.data);
  const token = String(nested.access_token || obj.access_token || "").trim();
  const expiresIn = tokenExpiresInSeconds(data, 0);
  const expiresAt = token && expiresIn ? Date.now() + expiresIn * 1000 : 0;
  const ok = response.ok && obj.success !== false && Boolean(token);
  if (ok && token) adminplusAccessTokenCache.set(account.id, { token, expiresAt: expiresAt || Date.now() + 29 * 24 * 60 * 60 * 1000, issuedAt: Date.now(), expiresIn, credentialFingerprint: accountCredentialFingerprint });
  diagnostics.push({
    step: `어드민플러스 ${account.label} 토큰`,
    status: ok ? "정상" : "오류",
    detail: ok ? `HTTP ${response.status} · Access Token 확인${expiresIn ? ` · ${expiresIn}초 유효` : ""}` : `HTTP ${response.status}: ${diagnosticMessage(data)}`,
  });
  return { ok, status: response.status, token, data, diagnostics, expiresAt, expiresIn, cached: false };
}

async function adminplusRequest(
  env: Env,
  account: AdminPlusCredentialAccount,
  method: string,
  rawPath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  body?: unknown,
  retry401 = true,
): Promise<ExternalApiResult> {
  const base = String(env.ADMINPLUS_BASE_URL || "https://api.adminplus.co.kr").replace(/\/$/, "");
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const params = queryFromRecord(query);
  const tokenResult = await adminplusTokenRequest(env, account, false);
  const diagnostics = [...tokenResult.diagnostics];
  if (!tokenResult.ok || !tokenResult.token) return { ok: false, status: tokenResult.status || 401, data: tokenResult.data, request: { method, baseUrl: base, path, queryKeys: queryKeysFromParams(params) }, diagnostics, phase: "adminplus_token" };
  const url = `${base}${path}${params.toString() ? `?${params}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${tokenResult.token}`, accept: "application/json", "content-type": "application/json" },
    body: method.toUpperCase() === "GET" || body === undefined ? undefined : JSON.stringify(body),
  });
  const responseText = await response.text();
  let data: unknown = responseText;
  try { data = responseText ? JSON.parse(responseText) : null; } catch { /* keep text */ }
  if (response.status === 401 && retry401) {
    adminplusAccessTokenCache.delete(account.id);
    const fresh = await adminplusTokenRequest(env, account, true);
    diagnostics.push(...fresh.diagnostics);
    if (fresh.ok && fresh.token) {
      const retry = await fetch(url, { method, headers: { authorization: `Bearer ${fresh.token}`, accept: "application/json", "content-type": "application/json" }, body: method.toUpperCase() === "GET" || body === undefined ? undefined : JSON.stringify(body) });
      const retryText = await retry.text();
      let retryData: unknown = retryText;
      try { retryData = retryText ? JSON.parse(retryText) : null; } catch { /* keep */ }
      const retryObj = objectRecord(retryData);
      const retryOk = retry.ok && retryObj.success !== false;
      diagnostics.push({ step: `어드민플러스 ${account.label} API 재시도`, status: retryOk ? "정상" : "오류", detail: `HTTP ${retry.status}${retryOk ? "" : `: ${diagnosticMessage(retryData)}`}` });
      return { ok: retryOk, status: retry.status, data: retryData, request: { method, baseUrl: base, path, queryKeys: queryKeysFromParams(params) }, diagnostics, phase: retryOk ? "adminplus" : "adminplus_api" };
    }
  }
  const dataObj = objectRecord(data);
  const ok = response.ok && dataObj.success !== false;
  diagnostics.push({ step: `어드민플러스 ${account.label} API`, status: ok ? "정상" : "오류", detail: `HTTP ${response.status}${ok ? "" : `: ${diagnosticMessage(data)}`}` });
  return { ok, status: response.status, data, request: { method, baseUrl: base, path, queryKeys: queryKeysFromParams(params) }, diagnostics, phase: ok ? "adminplus" : "adminplus_api" };
}

function adminplusAccountPublicRow(account: AdminPlusCredentialAccount, token?: { expiresAt?: number; expiresIn?: number; ok?: boolean; status?: number }) {
  return {
    id: account.id,
    label: account.label,
    vendorName: account.vendorName,
    enabled: account.enabled,
    clientIdMasked: account.clientId.length > 8 ? `${account.clientId.slice(0,4)}…${account.clientId.slice(-4)}` : "설정됨",
    tokenOk: token?.ok ?? null,
    tokenStatus: token?.status ?? null,
    tokenExpiresAt: token?.expiresAt ? new Date(token.expiresAt).toISOString() : null,
    tokenExpiresIn: token?.expiresIn ?? null,
  };
}

async function adminplusAccountsStatus(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const shouldTest = body.testTokens !== false;
  const rows = [];
  for (const account of adminplusAccounts(env)) {
    if (!shouldTest) { rows.push(adminplusAccountPublicRow(account)); continue; }
    const token = await adminplusTokenRequest(env, account, false);
    const orderProbe = token.ok ? await adminplusRequest(env, account, "GET", "/v1/seller/orders", { limit: 1 }) : null;
    const productProbe = token.ok ? await adminplusRequest(env, account, "GET", "/v1/seller/products", { limit: 1 }) : null;
    const paymentProbe = token.ok ? await adminplusRequest(env, account, "GET", "/v1/seller/payments", { limit: 1 }) : null;
    const balanceProbe = token.ok ? await adminplusRequest(env, account, "GET", "/v1/seller/balance") : null;
    rows.push({
      ...adminplusAccountPublicRow(account, token),
      orderReadScopeOk: orderProbe?.ok ?? null,
      productReadScopeOk: productProbe?.ok ?? null,
      paymentReadScopeOk: paymentProbe?.ok ?? null,
      balanceReadScopeOk: balanceProbe?.ok ?? null,
    });
  }
  return jsonResponse({
    ok: true,
    mode: "adminplus_accounts_status_v228_operational",
    summary: { rows, count: rows.length },
    message: `어드민플러스 운영 계정 ${rows.length}개와 권한을 확인했습니다. 관리 토큰은 인증정보 변경시에만 필요합니다.`,
  });
}

const ADMINPLUS_SHIPMENT_DEFAULT_TIMES = ["14:00", "18:00", "23:00"];

function adminplusShipmentTimes(input: unknown) {
  const arr = Array.isArray(input) ? input : [];
  const valid = Array.from(new Set(arr.map((v) => String(v || "").trim()).filter((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v))));
  // V248 R4: 지정시간 운영은 유지하되 10:00 슬롯은 폐기하고 23:00 슬롯을 항상 보장합니다.
  const migrated = valid.filter((time) => time !== "10:00");
  if (!migrated.includes("23:00")) migrated.push("23:00");
  return (migrated.length ? migrated : [...ADMINPLUS_SHIPMENT_DEFAULT_TIMES]).sort();
}

function adminplusAutomationConfig(value: unknown): AdminPlusAutomationConfig {
  const obj = objectRecord(value);
  const cleanTimes = (input: unknown, fallback: string[]) => {
    const arr = Array.isArray(input) ? input : [];
    const out = Array.from(new Set(arr.map((v) => String(v || "").trim()).filter((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v))));
    return out.length ? out : fallback;
  };
  return {
    enabled: obj.enabled === true,
    shipmentTimes: adminplusShipmentTimes(obj.shipmentTimes),
    priceWatchEnabled: obj.priceWatchEnabled !== false,
    priceCheckTimes: cleanTimes(obj.priceCheckTimes, ["08:30", "13:30", "18:30"]),
    startedAt: String(obj.startedAt || ""),
    lastPurchaseAt: String(obj.lastPurchaseAt || ""),
    lastShipmentAt: String(obj.lastShipmentAt || ""),
    lastPriceCheckAt: String(obj.lastPriceCheckAt || ""),
    accountRules: asArray(obj.accountRules).map((r) => {
      const row = objectRecord(r);
      return {
        accountId: String(row.accountId || ""),
        vendorName: String(row.vendorName || ""),
        enabled: row.enabled !== false,
        autoPurchase: row.autoPurchase !== false,
        autoPayment: row.autoPayment === true,
        paymentMaxPerBatch: Math.max(0, Number(row.paymentMaxPerBatch || 0) || 0),
        paymentDailyLimit: Math.max(0, Number(row.paymentDailyLimit || 0) || 0),
        autoShipment: row.autoShipment !== false,
      };
    }),
  };
}

function adminplusRuleForAccount(config: AdminPlusAutomationConfig, account: AdminPlusCredentialAccount) {
  return (config.accountRules || []).find((rule) => String(rule.accountId || "") === account.id || (rule.vendorName && String(rule.vendorName) === account.vendorName));
}

function adminplusHistoryKey(channel: unknown, orderNo: unknown, optionId: unknown) {
  return `${String(channel || "").trim()}|${String(orderNo || "").trim()}|${String(optionId || "").trim()}`;
}

function adminplusCustomerOrderCode(row: Record<string, unknown>) {
  const prefix = String(row.channel || "").includes("토스") ? "T" : "C";
  const raw = `${prefix}-${String(row.orderNo || "")}-${String(row.optionId || "")}`.replace(/[^0-9A-Za-z_-]/g, "-");
  return `B2B-${raw}`.slice(0, 120);
}



const ADMINPLUS_DEFAULT_ORDERER = {
  name: "소신채",
  phone: "010-6880-9413",
};

function adminplusNormalizePhone(value: unknown) {
  const raw = String(value || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function adminplusOrdererInfo(_payload: Record<string, unknown>) {
  // 운영 정책: AdminPlus 주문자는 마켓 구매자가 아니라 자사 고정 발주자 정보입니다.
  // persisted/browser 값이 오래되어도 수취인 정보로 오염되지 않도록 서버에서 고정합니다.
  return {
    name: ADMINPLUS_DEFAULT_ORDERER.name,
    phone: adminplusNormalizePhone(ADMINPLUS_DEFAULT_ORDERER.phone),
  };
}

function adminplusNormalizeReceiverPhone(value: unknown) {
  return adminplusNormalizePhone(value);
}

function adminplusNormalizeReceiverZip(value: unknown, address: unknown) {
  const direct = String(value || "").replace(/\D/g, "");
  if (/^\d{5}$/.test(direct)) return direct;
  const match = String(address || "").match(/(?:^|\D)(\d{5})(?:\D|$)/);
  return match ? match[1] : "";
}

function adminplusBuildOrderPayload(row: {
  order: Record<string, unknown>;
  mapping: ReturnType<typeof adminplusMappingRows>[number];
  matchString: string;
  ordererName: string;
  ordererPhone: string;
}) {
  const ordererName = String(row.ordererName || "").trim();
  const ordererPhone = adminplusNormalizePhone(row.ordererPhone);
  const receiverName = String(row.order.receiverName || "").trim();
  const address = String(row.order.address || "").trim();
  const phone = adminplusNormalizeReceiverPhone(row.order.receiverPhone);
  const zipcode = adminplusNormalizeReceiverZip(row.order.zip || row.order.zipCode, address);
  const qty = Math.max(1, Math.floor(Number(row.order.qty || row.order.quantity || 1) || 1));
  const customerOrderCode = adminplusCustomerOrderCode({ ...row.order, channel: row.order.channel, optionId: row.mapping.optionId });
  const isVirtualTelephone = /^050\d{9}$/.test(phone);
  // AdminPlus order creation requires the receiver mobile field to be populated.
  // Preserve the real marketplace 050 virtual number in both tel/hp instead of inventing a fallback number.
  const receiverTel = phone;
  const receiverHp = phone;
  const payload = {
    customer_order_code: customerOrderCode,
    // AdminPlus official seller API fields. Omitting these makes AdminPlus copy receiver_* into orderer_*.
    orderer_name: ordererName,
    orderer_hp: ordererPhone,
    orderer_tel: ordererPhone,
    receiver_name: receiverName,
    receiver_tel: receiverTel,
    receiver_hp: receiverHp,
    receiver_zipcode: zipcode,
    receiver_addr1: address,
    delivery_msg: String(row.order.memo || "").trim(),
    items: [{ product_string: String(row.matchString || "").trim(), qty }],
  };
  const validationErrors: string[] = [];
  if (!customerOrderCode) validationErrors.push("customer_order_code 누락");
  if (!ordererName) validationErrors.push("주문자 업체명 누락");
  if (!ordererPhone || ordererPhone.length < 9 || ordererPhone.length > 12) validationErrors.push(`주문자 연락처 형식 오류(${ordererPhone.length}자리)`);
  if (!receiverName) validationErrors.push("수령인 누락");
  if (!receiverTel || receiverTel.length < 9 || receiverTel.length > 12) validationErrors.push(`수취인 연락처 형식 오류(${receiverTel.length}자리)`);
  if (receiverHp && !(/^050\d{9}$/.test(receiverHp) || (receiverHp.length >= 10 && receiverHp.length <= 11))) validationErrors.push(`수취인 휴대폰 형식 오류(${receiverHp.length}자리)`);
  if (!zipcode || !/^\d{5}$/.test(zipcode)) validationErrors.push("우편번호 5자리 누락/형식오류");
  if (!address || address.length < 5) validationErrors.push("배송주소 누락/형식오류");
  if (!payload.items[0].product_string) validationErrors.push("AdminPlus 상품문자열 누락");
  if (!(qty > 0)) validationErrors.push("주문수량 오류");
  return { payload, validationErrors, customerOrderCode, diagnostic: `orderer=${ordererName ? "Y" : "N"}/${ordererPhone.length}digits, receiver=${receiverName ? "Y" : "N"}, tel=${receiverTel.length}digits, hp=${receiverHp ? `${receiverHp.length}digits${isVirtualTelephone ? "(virtual-mirrored)" : ""}` : "empty"}, zip=${zipcode ? "5자리" : "없음"}, addressLen=${address.length}, product=${payload.items[0].product_string ? "Y" : "N"}, qty=${qty}` };
}

function adminplusValidationDiagnostic(data: unknown, fallback = "") {
  const texts: string[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown, path = "", depth = 0) => {
    if (depth > 5 || value === null || value === undefined || seen.has(value)) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value).trim();
      if (text && !["false", "true"].includes(text.toLowerCase())) texts.push(path ? `${path}: ${text}` : text);
      return;
    }
    if (typeof value !== "object") return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 10).forEach((item, idx) => walk(item, `${path}[${idx}]`, depth + 1));
      return;
    }
    const obj = value as Record<string, unknown>;
    for (const key of ["message","reason","detail","details","errors","error","validation","violations","field","fields","code"]) {
      if (obj[key] !== undefined) walk(obj[key], path ? `${path}.${key}` : key, depth + 1);
    }
  };
  walk(data);
  const unique = Array.from(new Set(texts)).filter((text) => !/^message:\s*validation failed$/i.test(text));
  return safeText(unique.join(" / ") || diagnosticMessage(data) || fallback, 700);
}

function normalizeOptionPurchaseTimeList(value: unknown, fallback = "09:00") {
  const parts = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  const valid = parts.filter((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item));
  const unique = Array.from(new Set(valid)).slice(0, 2);
  return unique.length ? unique.join(",") : fallback;
}

function optionPurchaseTimes(value: unknown) {
  return normalizeOptionPurchaseTimeList(value).split(",").filter(Boolean);
}

function adminplusMappingRows(payload: Record<string, unknown>) {
  return asArray(payload.mappings).map((item) => {
    const row = objectRecord(item);
    const purchaseTimeRaw = String(row.purchaseTime || row.purchase_time || "09:00").trim();
    return {
      channel: String(row.channel || ""),
      optionId: String(row.optionId || ""),
      vendorName: String(row.vendorName || ""),
      vendorProductName: String(row.vendorProductName || ""),
      baseQty: Math.max(1, Math.floor(Number(row.baseQty || 1) || 1)),
      shippingFee: Math.max(0, Number(row.shippingFee || 0) || 0),
      purchaseTime: normalizeOptionPurchaseTimeList(purchaseTimeRaw),
    };
  }).filter((row) => row.channel && row.optionId && row.vendorName && row.vendorProductName);
}

function adminplusOrderMappingCandidateIds(order: Record<string, unknown>) {
  const raw = objectRecord(order.raw);
  const candidates = [
    order.optionId,
    order.vendorItemId,
    order.tossStockId,
    order.tossProductItemManagementCode,
    order.optionManagementCode,
    order.productItemManagementCode,
    raw.optionId,
    raw.vendorItemId,
    raw.stockId,
    raw.productItemManagementCode,
    raw.optionManagementCode,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}


function normalizeTossBridgeKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[()（）\[\]{}·.,:;_\-\/\\]/g, "");
}

function adminplusTossOptionBridgeRows(payload: Record<string, unknown>) {
  return asArray(payload.tossOptionIdRows).map((value) => {
    const row = objectRecord(value);
    return {
      productId: String(row.productId || "").trim(),
      optionId: String(row.optionId || "").trim(), // productItemId
      stockId: String(row.stockId || "").trim(),
      managementCode: String(row.managementCode || row.optionCode || "").trim(),
      optionCode: String(row.optionCode || row.managementCode || "").trim(),
      itemName: String(row.itemName || "").trim(),
      productName: String(row.productName || "").trim(),
      memo: String(row.memo || "").trim(),
    };
  }).filter((row) => row.optionId);
}

function adminplusMergeTossBridgeRows(payload: Record<string, unknown>, incoming: Array<Record<string, string>>) {
  const current = adminplusTossOptionBridgeRows(payload);
  const merged = dedupeTossOptionMasterRows([
    ...current.map((row) => ({ ...row, status: "" })),
    ...incoming,
  ]);
  payload.tossOptionIdRows = merged.map((row, index) => ({
    id: `toss-option-auto-${row.optionId || index}`,
    productId: row.productId || "",
    optionId: row.optionId || "",
    stockId: row.stockId || "",
    optionCode: row.optionCode || row.managementCode || row.itemName || "",
    itemName: row.itemName || "",
    managementCode: row.managementCode || "",
    productName: row.productName || "",
    memo: "Ncloud 자동발주 stockId→productItemId bridge 자동보강",
  }));
  return adminplusTossOptionBridgeRows(payload);
}

function adminplusFindTossBridgeOptionId(order: Record<string, unknown>, rows: ReturnType<typeof adminplusTossOptionBridgeRows>) {
  const raw = objectRecord(order.raw);
  const productId = String(order.tossProductId || raw.productId || raw.tossProductId || "").trim();
  const stockIds = [
    order.tossStockId,
    raw.stockId,
    raw.tossStockId,
    // 표준화 전 order.optionId가 stockId인 자료 호환
    order.optionId,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const codes = [
    order.tossProductItemManagementCode,
    order.optionManagementCode,
    order.productItemManagementCode,
    raw.productItemManagementCode,
    raw.optionManagementCode,
    raw.tossProductItemManagementCode,
  ].map(normalizeTossBridgeKey).filter(Boolean);
  const names = [
    order.tossProductItemName,
    order.optionName,
    raw.itemName,
    raw.optionName,
  ].map(normalizeTossBridgeKey).filter(Boolean);

  for (const stockId of stockIds) {
    const exact = rows.find((row) => row.stockId === stockId && (!productId || !row.productId || row.productId === productId));
    if (exact) return { optionId: exact.optionId, via: `stockId:${stockId}`, row: exact };
  }
  for (const code of codes) {
    const matches = rows.filter((row) =>
      normalizeTossBridgeKey(row.managementCode || row.optionCode) === code &&
      (!productId || !row.productId || row.productId === productId),
    );
    const optionIds = Array.from(new Set(matches.map((row) => row.optionId).filter(Boolean)));
    if (optionIds.length === 1) return { optionId: optionIds[0], via: `managementCode:${code}`, row: matches[0] };
  }
  for (const name of names) {
    const matches = rows.filter((row) =>
      normalizeTossBridgeKey(row.itemName) === name &&
      (!productId || !row.productId || row.productId === productId),
    );
    const optionIds = Array.from(new Set(matches.map((row) => row.optionId).filter(Boolean)));
    if (optionIds.length === 1) return { optionId: optionIds[0], via: `itemName:${name}`, row: matches[0] };
  }
  return { optionId: "", via: "", row: null as ReturnType<typeof adminplusTossOptionBridgeRows>[number] | null };
}

function tossProductDetailRecord(data: unknown, fallbackProductId = "") {
  const root = objectRecord(data);
  const firstLevel = [objectRecord(root.success), objectRecord(root.data), objectRecord(root.result), root];
  const candidates: Record<string, unknown>[] = [];
  for (const row of firstLevel) {
    if (!Object.keys(row).length) continue;
    candidates.push(row);
    const nested = [objectRecord(row.product), objectRecord(row.item), objectRecord(row.data), objectRecord(row.result)];
    candidates.push(...nested.filter((value) => Object.keys(value).length));
  }
  const found = candidates.find((row) => Array.isArray(row.stocks)) || candidates.find((row) => Object.keys(row).length) || {};
  if (!fallbackProductId || displayText(found.id || found.productId)) return found;
  return { ...found, id: fallbackProductId, productId: fallbackProductId };
}

async function adminplusFetchTossBridgeRowsForProduct(env: Env, productId: string) {
  if (!productId || !tossConfigured(env)) return [] as Array<Record<string, string>>;
  const result = await tossJsonRequestWithToken(env, "GET", `/api/v3/shopping-fep/products/${productId}/v2`, { partnerName: env.TOSS_PARTNER_NAME || undefined });
  if (!result.ok) return [];
  const product = tossProductDetailRecord(result.data, productId);
  return asArray(product.stocks).map(objectRecord).map((stock) => tossProductOptionRowFromProductDetailStock(product, stock)).filter((row) => row.optionId && (row.stockId || row.managementCode || row.itemName));
}

async function adminplusResolveMappingForOrder(
  env: Env,
  payload: Record<string, unknown>,
  order: Record<string, unknown>,
  mappings: ReturnType<typeof adminplusMappingRows>,
  tossProductCache: Map<string, Array<Record<string, string>>>,
) {
  const direct = adminplusFindMappingForOrder(order, mappings);
  if (String(order.channel || "").trim() !== "토스") {
    return { ...direct, matchedVia: direct.mapping ? `direct:${direct.matchedOptionId}` : "", linkCandidateOptionIds: direct.mapping ? [direct.mapping.optionId] : direct.candidates };
  }

  // Toss는 주문 API stockId와 상품 API productItemId가 다른 체계이므로
  // legacy direct key보다 stockId→productItemId bridge를 먼저 적용합니다.
  let bridgeRows = adminplusTossOptionBridgeRows(payload);
  let bridged = adminplusFindTossBridgeOptionId(order, bridgeRows);
  const raw = objectRecord(order.raw);
  const productId = String(order.tossProductId || raw.productId || raw.tossProductId || "").trim();

  if (!bridged.optionId && productId) {
    let liveRows = tossProductCache.get(productId);
    if (!liveRows) {
      liveRows = await adminplusFetchTossBridgeRowsForProduct(env, productId);
      tossProductCache.set(productId, liveRows);
    }
    if (liveRows.length) {
      bridgeRows = adminplusMergeTossBridgeRows(payload, liveRows);
      bridged = adminplusFindTossBridgeOptionId(order, bridgeRows);
    }
  }

  if (bridged.optionId) {
    const mapping = mappings.find((row) => row.channel === "토스" && row.optionId === bridged.optionId) || null;
    if (mapping) {
      const bridgeAliases = [mapping.optionId, bridged.optionId, bridged.row?.stockId, bridged.row?.managementCode, bridged.row?.optionCode, ...direct.candidates].map((value) => String(value || "").trim()).filter(Boolean);
      return { mapping, matchedOptionId: bridged.optionId, candidates: Array.from(new Set([...direct.candidates, bridged.optionId])), matchedVia: `toss-bridge:${bridged.via}->productItemId:${bridged.optionId}`, linkCandidateOptionIds: Array.from(new Set(bridgeAliases)) };
    }
  }

  // 과거 설정이 stockId 또는 관리코드를 optionId로 저장한 경우의 하위호환입니다.
  if (direct.mapping) {
    return { ...direct, matchedVia: `legacy-direct:${direct.matchedOptionId}`, linkCandidateOptionIds: Array.from(new Set([direct.mapping.optionId, ...direct.candidates])) };
  }

  return { ...direct, matchedVia: bridged.via ? `toss-bridge-unmapped:${bridged.via}->${bridged.optionId}` : "toss-bridge-not-found", linkCandidateOptionIds: Array.from(new Set([bridged.optionId, bridged.row?.stockId, bridged.row?.managementCode, bridged.row?.optionCode, ...direct.candidates].map((value) => String(value || "").trim()).filter(Boolean))) };
}

function adminplusFindMappingForOrder(order: Record<string, unknown>, mappings: ReturnType<typeof adminplusMappingRows>) {
  const channel = String(order.channel || "").trim();
  const candidates = adminplusOrderMappingCandidateIds(order);
  for (const candidate of candidates) {
    const found = mappings.find((mapping) => mapping.channel === channel && mapping.optionId === candidate);
    if (found) return { mapping: found, matchedOptionId: candidate, candidates };
  }
  return { mapping: null as ReturnType<typeof adminplusMappingRows>[number] | null, matchedOptionId: "", candidates };
}

function adminplusPurchaseTimesFromMappings(payload: Record<string, unknown>) {
  return Array.from(new Set(adminplusMappingRows(payload).flatMap((row) => optionPurchaseTimes(row.purchaseTime)))).sort();
}

async function collectCurrentMarketplaceOrders(env: Env) {
  const end = kstDateText();
  const start = schedulerAddKstDays(end, -6);
  const responses: Array<{ channel: string; response: Response }> = [];
  responses.push({ channel: "쿠팡", response: await collectOrdersPreview(schedulerRequest({ channel: "쿠팡", manual: true, query: { startDate: start, endDate: end, status: "ACCEPT", maxPerPage: 50, maxPages: 10 } }), env) });
  responses.push({ channel: "토스", response: await collectOrdersPreview(schedulerRequest({ channel: "토스", manual: true, query: { startDate: start, endDate: end, status: "PAID", limit: 50, maxPages: 20 } }), env) });
  const rows: Record<string, unknown>[] = [];
  const results: Record<string, unknown>[] = [];
  for (const item of responses) {
    const data = await item.response.json() as Record<string, unknown>;
    const summary = objectRecord(data.summary);
    const sample = asArray(summary.sampleOrders).map((v) => objectRecord(v));
    rows.push(...sample.map((row) => ({ ...row, channel: item.channel })));
    results.push({ channel: item.channel, ok: data.ok !== false, count: sample.length, message: data.message || "" });
  }
  return { rows, results };
}

function adminplusResponseItems(data: unknown) {
  const root = objectRecord(data);
  const containers = [root, objectRecord(root.data), objectRecord(root.success), objectRecord(root.result)];
  for (const container of containers) {
    const items = asArray(container.items);
    if (items.length) return items.map((value) => objectRecord(value));
  }
  return [] as Record<string, unknown>[];
}

async function adminplusExactMatch(env: Env, account: AdminPlusCredentialAccount, matchString: string) {
  const result = await adminplusRequest(env, account, "GET", "/v1/seller/product_matches", { match_string: matchString, limit: 100 });
  if (!result.ok) return { ok: false, matched: false, message: diagnosticMessage(result.data), result };
  const items = adminplusResponseItems(result.data);
  const exact = items.find((row) => String(row.match_string || "").trim() === matchString.trim() && row.is_temp !== true && Number(row.product_count || asArray(row.products).length || 0) > 0);
  return { ok: true, matched: Boolean(exact), match: exact || null, message: exact ? "매칭 확인" : "어드민플러스 상품문자열 매칭이 없습니다.", result };
}

function adminplusCatalogProductRow(value: unknown) {
  const row = objectRecord(value);
  const nested = objectRecord(row.data);
  const optionSource =
    asArray(row.option).length ? asArray(row.option) :
    asArray(row.options).length ? asArray(row.options) :
    asArray(nested.option).length ? asArray(nested.option) :
    asArray(nested.options);
  return {
    productCode: String(row.product_code || row.productCode || nested.product_code || nested.productCode || ""),
    name: String(row.name || row.product_name || row.productName || nested.name || nested.product_name || ""),
    price: Number(row.price || row.supply_price || row.supplyPrice || nested.price || 0) || 0,
    stock: String(row.stock ?? row.stock_qty ?? row.stockQty ?? nested.stock ?? ""),
    status: String(row.status || row.product_status || row.productStatus || nested.status || ""),
    lastUpdatedAt: String(row.last_updated_date || row.updated_at || row.updatedAt || nested.last_updated_date || ""),
    options: optionSource.map((item) => {
      const option = objectRecord(item);
      return {
        optionCode: String(option.option_code || option.optionCode || option.code || ""),
        optionName: String(option.option_name || option.optionName || option.name || ""),
        stock: String(option.stock ?? option.stock_qty ?? option.stockQty ?? ""),
      };
    }).filter((option) => option.optionCode || option.optionName),
  };
}

async function adminplusCatalogProducts(env: Env, account: AdminPlusCredentialAccount, limit = 500, includeInactive = false) {
  const rows: ReturnType<typeof adminplusCatalogProductRow>[] = [];
  let cursor = "";
  let pages = 0;
  const seenCursors = new Set<string>();
  do {
    const query: Record<string, string | number> = { limit: Math.max(1, Math.min(500, limit)) };
    if (!includeInactive) query.status = "active";
    if (cursor) query.cursor = cursor;
    const result = await adminplusRequest(env, account, "GET", "/v1/seller/products", query);
    if (!result.ok) return { ok: false, rows, pages, message: diagnosticMessage(result.data), status: result.status };
    const data = objectRecord(objectRecord(result.data).data);
    rows.push(...asArray(data.items).map(adminplusCatalogProductRow));
    const nextCursor = data.has_more ? String(data.next_cursor || "").trim() : "";
    pages += 1;
    if (!nextCursor || seenCursors.has(nextCursor) || pages >= 100) {
      cursor = "";
    } else {
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
  } while (cursor);
  return { ok: true, rows, pages, message: `어드민플러스 ${account.label} 상품 ${rows.length}건 조회` };
}


function adminplusCatalogProductIsActiveUnlimited(product: ReturnType<typeof adminplusCatalogProductRow>) {
  const status = String(product.status || "").trim().toLowerCase();
  const stock = String(product.stock || "").trim().toLowerCase();
  return status === "active" && stock === "unlimited";
}

async function adminplusGlobalCatalogSearchEndpoint(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const query = String(body.query || body.keyword || "").trim();
  if (!query) return jsonResponse({
    ok: true,
    mode: "adminplus_global_catalog_search_v232",
    summary: { rows: [], count: 0, accounts: 0 },
    message: "상품명 검색어를 1글자 이상 입력하세요.",
  }, { status: 200 });

  const normalizedQuery = normalizeAdminPlusProductName(query);
  const maxResults = Math.max(1, Math.min(500, Number(body.limit || 200) || 200));
  const activeUnlimitedOnly = body.activeUnlimitedOnly !== false;
  const accounts = adminplusAccounts(env).filter((account) => account.enabled);
  const rows: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];

  for (const account of accounts) {
    const result = await adminplusCatalogProducts(env, account, 500, !activeUnlimitedOnly);
    if (!result.ok) {
      errors.push({ accountId: account.id, vendorName: account.vendorName, reason: result.message });
      continue;
    }
    for (const product of result.rows) {
      if (activeUnlimitedOnly && !adminplusCatalogProductIsActiveUnlimited(product)) continue;
      const searchable = normalizeAdminPlusProductName(
        `${product.name} ${product.productCode} ${product.options.map((option) => `${option.optionCode} ${option.optionName}`).join(" ")}`
      );
      if (!searchable.includes(normalizedQuery)) continue;
      rows.push({
        accountId: account.id,
        accountLabel: account.label,
        vendorName: account.vendorName,
        ...product,
      });
      if (rows.length >= maxResults) break;
    }
    if (rows.length >= maxResults) break;
  }

  rows.sort((a, b) => {
    const vendorCompare = String(a.vendorName || "").localeCompare(String(b.vendorName || ""), "ko");
    if (vendorCompare) return vendorCompare;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });

  return jsonResponse({
    ok: errors.length === 0,
    mode: "adminplus_global_catalog_search_v232",
    summary: { rows, count: rows.length, accounts: accounts.length, errors, activeUnlimitedOnly },
    message: `"${query}" 포함 AdminPlus 상품 ${rows.length}건 · 연결업체 ${accounts.length}개 검색 · ${activeUnlimitedOnly ? "active+unlimited만 표시" : "전체 상태/재고 표시"}${errors.length ? ` · 오류업체 ${errors.length}개` : ""}`,
  }, { status: 200 });
}

async function adminplusCatalogMatches(env: Env, account: AdminPlusCredentialAccount, matchString = "") {
  const rows: Record<string, unknown>[] = [];
  let cursor = "";
  let pages = 0;
  do {
    const query: Record<string, string | number> = { limit: 500 };
    if (matchString) query.match_string = matchString;
    if (cursor) query.cursor = cursor;
    const result = await adminplusRequest(env, account, "GET", "/v1/seller/product_matches", query);
    if (!result.ok) return { ok: false, rows, pages, message: diagnosticMessage(result.data), status: result.status };
    const data = objectRecord(objectRecord(result.data).data);
    rows.push(...asArray(data.items).map((item) => objectRecord(item)));
    cursor = data.has_more ? String(data.next_cursor || "") : "";
    pages += 1;
    if (pages >= 20) cursor = "";
  } while (cursor);
  return { ok: true, rows, pages, message: `어드민플러스 ${account.label} 상품문자열 매칭 ${rows.length}건 조회` };
}

async function adminplusCatalogEndpoint(request: Request, env: Env, action: "products" | "match-list" | "match-apply" | "match-delete") {
  const body = objectRecord(await readJson<PreviewBody>(request));
  const account = adminplusAccountById(env, body.accountId);
  if (!account || !account.enabled) return jsonResponse({ ok: false, message: "사용 가능한 어드민플러스 계정을 찾지 못했습니다." }, { status: 400 });
  if (action === "products") {
    const result = await adminplusCatalogProducts(env, account, Number(body.limit || 500));
    return jsonResponse({ ok: result.ok, mode: "adminplus_catalog_products_v209", summary: { rows: result.rows, count: result.rows.length, pages: result.pages || 0 }, message: result.message }, { status: 200 });
  }
  if (action === "match-list") {
    const matchString = String(body.matchString || "").trim();
    const result = await adminplusCatalogMatches(env, account, matchString);
    return jsonResponse({ ok: result.ok, mode: "adminplus_catalog_match_list_v210", summary: { rows: result.rows, count: result.rows.length, pages: result.pages }, message: result.message }, { status: 200 });
  }
  if (body.confirm !== true) return jsonResponse({ ok: false, message: "매칭 변경은 confirm=true 확인이 필요합니다." }, { status: 400 });
  if (action === "match-apply") {
    const matchString = String(body.matchString || "").trim();
    const products = asArray(body.products).map((item) => { const row = objectRecord(item); return { product_code: Number(row.productCode || 0), ...(row.optionCode ? { option_code: Number(row.optionCode) } : {}), qty: Math.max(1, Math.floor(Number(row.qty || 1) || 1)) }; }).filter((row) => row.product_code > 0);
    if (!matchString || !products.length) return jsonResponse({ ok: false, message: "매칭 문자열과 상품 선택이 필요합니다." }, { status: 400 });
    const existing = await adminplusExactMatch(env, account, matchString);
    const existingMatch = objectRecord(existing.match);
    const existingProducts = asArray(existingMatch.products);
    if (existing.matched && (Number(existingMatch.product_count || existingProducts.length || 0) > 1 || existingProducts.length > 1)) {
      return jsonResponse({ ok: false, mode: "adminplus_catalog_match_apply_v211", message: "기존 1:N 다상품 매칭은 웹앱에서 단일 상품으로 덮어쓰지 않습니다. 단일 상품의 qty>1 기본수량 변경은 허용합니다." }, { status: 409 });
    }
    const requested = products.length === 1 ? products[0] : undefined;
    const catalog = await adminplusCatalogProducts(env, account, 500, true);
    if (requested && catalog.ok) {
      const catalogProduct = catalog.rows.find((row) => Number(row.productCode || 0) === Number(requested.product_code || 0));
      if (!catalogProduct) {
        return jsonResponse({
          ok: false,
          mode: "adminplus_catalog_match_apply_v237_preflight",
          message: `AdminPlus 상품 ${Number(requested.product_code || 0)}을 전체 상품목록에서 찾지 못했습니다. 상품을 다시 검색해 선택하세요.`,
          summary: { catalogPages: catalog.pages, requested },
        }, { status: 200 });
      }
      const requestedRecord = requested as Record<string, unknown>;
      let requestedOptionCode = Number(requestedRecord.option_code || 0);

      if (catalogProduct.options.length === 0) {
        // 옵션이 없는 새 상품에 이전 상품의 option_code가 섞여 들어오면 제거합니다.
        if ("option_code" in requestedRecord) delete requestedRecord.option_code;
        requestedOptionCode = 0;
      } else {
        const availableOptionCodes = catalogProduct.options
          .map((option) => Number(option.optionCode || 0))
          .filter((code) => code > 0);

        if (requestedOptionCode && !availableOptionCodes.includes(requestedOptionCode)) {
          return jsonResponse({
            ok: false,
            mode: "adminplus_catalog_match_apply_v239_option_mismatch",
            message: `상품 ${catalogProduct.productCode}의 요청 옵션 ${requestedOptionCode}은 현재 상품 옵션이 아닙니다. 사용가능 옵션: ${availableOptionCodes.join(", ") || "없음"}. 상품 변경 시 이전 상품 옵션은 재사용할 수 없습니다.`,
            summary: { product: catalogProduct, requested, availableOptionCodes },
          }, { status: 200 });
        }

        if (catalogProduct.options.length > 1 && !requestedOptionCode) {
          return jsonResponse({
            ok: false,
            mode: "adminplus_catalog_match_apply_v237_preflight",
            message: `상품 ${catalogProduct.productCode} ${catalogProduct.name}에 옵션이 ${catalogProduct.options.length}개 있습니다. AdminPlus 옵션을 선택한 뒤 다시 수정 확정하세요.`,
            summary: { product: catalogProduct, requested, availableOptionCodes },
          }, { status: 200 });
        }

        if (catalogProduct.options.length === 1 && !requestedOptionCode) {
          const onlyOptionCode = availableOptionCodes[0] || 0;
          if (onlyOptionCode > 0) requestedRecord.option_code = onlyOptionCode;
        }
      }
    }
    const result = await adminplusRequest(env, account, "POST", "/v1/seller/product_matches", undefined, { matches: [{ match_string: matchString, products }] });
    let verified: Awaited<ReturnType<typeof adminplusExactMatch>> | null = null;
    let verifiedMatch: Record<string, unknown> = {};
    let verifiedProducts: Record<string, unknown>[] = [];
    let actual: Record<string, unknown> = {};
    let verifiedExact = false;

    // AdminPlus 저장 직후 GET이 이전 값을 잠깐 반환하는 경우가 있어 짧게 재조회합니다.
    // POST가 성공했는데 첫 GET이 stale이어도 "Error: success"로 오판하지 않습니다.
    if (result.ok && requested) {
      for (const wait of [0, 250, 750, 1500]) {
        if (wait) await sleepMs(wait);
        verified = await adminplusExactMatch(env, account, matchString);
        verifiedMatch = objectRecord(verified?.match);
        verifiedProducts = asArray(verifiedMatch.products).map((value) => objectRecord(value));
        actual = verifiedProducts.length === 1 ? verifiedProducts[0] : {};
        const requestedHasOptionCode = "option_code" in requested && Number(requested.option_code || 0) > 0;
        const requestedOptionCode = requestedHasOptionCode ? Number(requested.option_code || 0) : 0;
        const actualOptionCode = Number(actual.option_code || 0);
        // option_code를 보내지 않은 레거시 요청은 AdminPlus가 상품의 유일/기본 옵션코드를 채워 반환할 수 있습니다.
        // 이 경우 product_code와 qty가 정확히 일치하면 정상 저장으로 보고, 실제 option_code는 응답으로 돌려줘 B2B 링크에 보존합니다.
        const optionMatches = !requestedHasOptionCode || actualOptionCode === requestedOptionCode;
        verifiedExact = Boolean(
          verified?.matched === true &&
          products.length === 1 &&
          verifiedMatch.is_temp !== true &&
          Number(verifiedMatch.product_count || verifiedProducts.length || 0) === 1 &&
          verifiedProducts.length === 1 &&
          Number(actual.product_code || 0) === Number(requested.product_code || 0) &&
          optionMatches &&
          Math.max(1, Math.floor(Number(actual.qty || 1) || 1)) === Math.max(1, Math.floor(Number(requested.qty || 1) || 1))
        );
        if (verifiedExact) break;
      }
    }

    const rawMessage = diagnosticMessage(result.data);
    const validationDetail = adminplusValidationDiagnostic(result.data, rawMessage);
    const failureMessage = /^(success|ok|true)$/i.test(String(rawMessage || "").trim()) ? "" : (validationDetail || rawMessage);
    const requestedSummary = requested
      ? `요청 상품 ${Number(requested.product_code || 0)} / 옵션 ${Number((requested as Record<string, unknown>).option_code || 0)} / 수량 ${Math.max(1, Math.floor(Number(requested.qty || 1) || 1))}`
      : "요청 상품정보 없음";
    const actualSummary = verified?.matched
      ? `재조회 상품 ${Number(actual.product_code || 0)} / 옵션 ${Number(actual.option_code || 0)} / 수량 ${Math.max(1, Math.floor(Number(actual.qty || 1) || 1))}`
      : "재조회에서 매칭을 찾지 못함";

    return jsonResponse({
      ok: verifiedExact,
      mode: "adminplus_catalog_match_apply_v217_retry_verify",
      summary: {
        verified: verifiedExact,
        match: verified?.match || null,
        requested,
        requestedProductCode: Number(requested?.product_code || 0) || 0,
        requestedOptionCode: Number((requested as Record<string, unknown> | undefined)?.option_code || 0) || 0,
        requestedQty: Math.max(1, Math.floor(Number(requested?.qty || 1) || 1)),
        resolvedOptionCode: Number(actual.option_code || 0) || 0,
        actualProductCode: Number(actual.product_code || 0) || 0,
        actualOptionCode: Number(actual.option_code || 0) || 0,
        actualQty: Math.max(1, Math.floor(Number(actual.qty || 1) || 1)),
        verificationAttempts: result.ok ? 4 : 0,
        matchValidationRevision: "v238-ncloud-revision-guard-diagnostic-20260811",
      },
      message: verifiedExact
        ? "어드민플러스 옵션별 매칭 저장 후 상품·옵션·수량 재조회 검증까지 완료했습니다."
        : result.ok
          ? `AdminPlus 저장 응답은 성공했지만 재조회 검증값이 일치하지 않습니다. ${requestedSummary} / ${actualSummary}.`
          : failureMessage || verified?.message || `상품매칭 저장 요청 실패. ${requestedSummary}`,
    }, { status: 200 });
  }
  const matchString = String(body.matchString || "").trim();
  const result = await adminplusRequest(env, account, "POST", "/v1/seller/product_matches/delete", undefined, { match_strings: [matchString] });
  return jsonResponse({ ok: result.ok, mode: "adminplus_catalog_match_delete_v209", message: result.ok ? "어드민플러스 상품매칭을 삭제했습니다." : diagnosticMessage(result.data) }, { status: 200 });
}

function normalizeAdminPlusProductName(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeAdminPlusVendorName(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s._\-()㈜주식회사]+/g, "");
}

function adminplusProductAvailabilityLabel(status: unknown) {
  const raw = String(status || "").trim();
  const normalized = raw.toLowerCase();
  if (/inactive|disabled|stop|suspend|판매중지|중지|비활성/.test(normalized)) return "판매중지";
  if (/sold.?out|out.?of.?stock|품절/.test(normalized)) return "품절";
  if (/deleted|ended|판매종료|종료|삭제/.test(normalized)) return "판매종료";
  return "";
}

async function adminplusPriceCheckRun(env: Env, payload: Record<string, unknown>) {
  const mappings = adminplusMappingRows(payload);
  const automationConfig = adminplusAutomationConfig(payload.adminplusAutomation);
  const mappingById = new Map(mappings.map((row) => [`${row.channel}|${row.optionId}`, row]));
  const rawLinks = asArray(payload.adminplusProductLinks).map((v) => objectRecord(v));
  const mappingResets: Record<string, unknown>[] = [];
  const links = rawLinks.filter((link) => {
    const linkId = String(link.id || `${link.channel}|${link.optionId}`);
    const mapping = mappingById.get(linkId);
    if (!mapping) return true;
    if (normalizeAdminPlusVendorName(mapping.vendorName) === normalizeAdminPlusVendorName(link.vendorName)) return true;
    mappingResets.push({
      linkId,
      channel: link.channel,
      optionId: link.optionId,
      oldVendorName: link.vendorName,
      excelVendorName: mapping.vendorName,
      reason: "동일 옵션ID의 업체가 최신 엑셀에서 변경되어 기존 AdminPlus API 확정링크를 초기화했습니다.",
    });
    return false;
  });
  const resetIds = new Set(mappingResets.map((row) => String(row.linkId || "")));
  let alerts = asArray(payload.adminplusPriceAlerts)
    .map((v) => objectRecord(v))
    .filter((row) => !resetIds.has(String(row.linkId || "")));
  const accounts = adminplusAccounts(env).filter((account) => account.enabled);
  const now = new Date().toISOString();
  const errors: Record<string, unknown>[] = [];
  const accountCorrections: Record<string, unknown>[] = [];
  const unresolvedAccountLinks: Record<string, unknown>[] = [];
  const linksByAccount = new Map<string, Record<string, unknown>[]>();

  const resolvePriceWatchAccount = (link: Record<string, unknown>) => {
    const linkId = String(link.id || `${link.channel}|${link.optionId}`);
    const mapping = mappingById.get(linkId);
    const vendorName = String(mapping?.vendorName || link.vendorName || "").trim();
    const vendorKey = normalizeAdminPlusVendorName(vendorName);

    const rule = (automationConfig.accountRules || []).find((row) =>
      row.enabled !== false &&
      normalizeAdminPlusVendorName(row.vendorName) === vendorKey &&
      String(row.accountId || "").trim()
    );
    if (rule?.accountId) {
      const account = accounts.find((row) => row.id === String(rule.accountId));
      if (account) return { account, source: "accountRule", vendorName };
    }

    const linkedAccount = accounts.find((row) => row.id === String(link.accountId || ""));
    if (linkedAccount && normalizeAdminPlusVendorName(linkedAccount.vendorName) === vendorKey) {
      return { account: linkedAccount, source: "confirmedLink", vendorName };
    }

    const vendorAccounts = accounts.filter((row) => normalizeAdminPlusVendorName(row.vendorName) === vendorKey);
    if (vendorAccounts.length === 1) return { account: vendorAccounts[0], source: "uniqueVendor", vendorName };

    return { account: undefined, source: vendorAccounts.length > 1 ? "ambiguousVendor" : "missingVendor", vendorName };
  };

  for (const link of links) {
    const resolved = resolvePriceWatchAccount(link);
    const linkId = String(link.id || `${link.channel}|${link.optionId}`);
    if (!resolved.account) {
      unresolvedAccountLinks.push({
        linkId,
        vendorName: resolved.vendorName,
        oldAccountId: String(link.accountId || ""),
        reason: resolved.source === "ambiguousVendor"
          ? "같은 업체명에 여러 AdminPlus 계정이 있어 가격감시 계정을 확정할 수 없습니다."
          : "최신 엑셀 업체에 연결된 AdminPlus 계정을 찾지 못했습니다.",
      });
      continue;
    }
    if (String(link.accountId || "") !== resolved.account.id) {
      accountCorrections.push({
        linkId,
        vendorName: resolved.vendorName,
        oldAccountId: String(link.accountId || ""),
        newAccountId: resolved.account.id,
        accountLabel: resolved.account.label,
        source: resolved.source,
      });
      link.accountId = resolved.account.id;
      link.vendorName = resolved.vendorName || resolved.account.vendorName;
      link.updatedAt = now;
    }
    const bucket = linksByAccount.get(resolved.account.id) || [];
    bucket.push(link);
    linksByAccount.set(resolved.account.id, bucket);
  }

  let checked = 0;
  let changed = 0;
  for (const account of accounts) {
    const accountLinks = linksByAccount.get(account.id) || [];
    if (!accountLinks.length) continue;
    // 가격감시는 활성상품 조회를 1순위로 사용합니다.
    // AdminPlus의 status 생략 조회가 빈 목록/상이한 범위를 반환해도 활성상품을 품절로 오판하지 않습니다.
    const activeResult = await adminplusCatalogProducts(env, account, 500, false);
    if (!activeResult.ok) {
      errors.push({ accountId: account.id, vendorName: account.vendorName, reason: `활성상품 조회 실패: ${activeResult.message}` });
      continue;
    }
    const fullResult = await adminplusCatalogProducts(env, account, 500, true);
    const activeRows = activeResult.rows;
    const fullRows = fullResult.ok ? fullResult.rows : [];
    const mergedRows = [...activeRows];
    const mergedCodes = new Set(mergedRows.map((row) => String(row.productCode || "")));
    for (const row of fullRows) {
      const code = String(row.productCode || "");
      if (!mergedCodes.has(code)) {
        mergedRows.push(row);
        mergedCodes.add(code);
      }
    }
    const catalogSuspiciouslyEmpty = activeRows.length === 0 && fullRows.length === 0 && accountLinks.length > 0;
    if (catalogSuspiciouslyEmpty) {
      errors.push({
        accountId: account.id,
        vendorName: account.vendorName,
        reason: `AdminPlus 상품조회가 0건입니다. 확정링크 ${accountLinks.length}건의 품절 판정을 보류합니다.`,
      });
    }
    const byCode = new Map(mergedRows.map((row) => [String(row.productCode || ""), row]));
    for (const link of accountLinks) {
      let product = byCode.get(String(link.productCode || ""));
      checked += 1;
      link.lastCheckedAt = now;
      const linkId = String(link.id || `${link.channel}|${link.optionId}`);
      // 지금 가격확인은 과거 미확인 스냅샷을 누적하지 않고 이 매핑의 현재 상태로 교체합니다.
      alerts = alerts.filter((row) => String(row.linkId || "") !== linkId || Boolean(row.acknowledgedAt));
      const mapping = mappingById.get(linkId);
      const expectedProductName = String(mapping?.vendorProductName || link.productName || "").trim();
      const confirmedProductName = String(link.productName || "").trim();
      const mappingAwaitingReconfirm = Boolean(
        mapping &&
        expectedProductName &&
        confirmedProductName &&
        normalizeAdminPlusProductName(expectedProductName) !== normalizeAdminPlusProductName(confirmedProductName)
      );
      if (mappingAwaitingReconfirm) {
        link.priceStatus = "확인필요";
        alerts.push({
          id: `${linkId}|reconfirm|${Date.now()}|${alerts.length}`,
          linkId,
          alertKind: "재확정대기",
          message: "최신 엑셀 상품과 현재 서버 확정상품이 다릅니다. 품절 판정이 아니라 재확정 대기 상태입니다. API 상품매칭에서 수정 확정 후 다시 가격확인하세요.",
          expectedProductName,
          actualProductName: confirmedProductName,
          accountId: account.id,
          vendorName: String(link.vendorName || account.vendorName),
          channel: String(link.channel || ""),
          optionId: String(link.optionId || ""),
          productCode: String(link.productCode || ""),
          productName: confirmedProductName,
          oldPrice: Number(link.baselinePrice || 0) || 0,
          newPrice: Number(link.currentPrice || link.baselinePrice || 0) || 0,
          difference: 0,
          differenceRate: 0,
          detectedAt: now,
          acknowledgedAt: "",
        });
        continue;
      }
      let recoveredByName = false;
      if (!product && expectedProductName) {
        const normalizedExpected = normalizeAdminPlusProductName(expectedProductName);
        const exactNameMatches = mergedRows.filter((row) => normalizeAdminPlusProductName(row.name) === normalizedExpected);
        if (exactNameMatches.length === 1) {
          product = exactNameMatches[0];
          recoveredByName = true;
          link.productCode = product.productCode;
          link.productName = product.name;
          link.updatedAt = now;
        }
      }
      if (!product) {
        if (catalogSuspiciouslyEmpty || !fullResult.ok) {
          link.priceStatus = "확인필요";
          alerts.push({
            id: `${linkId}|catalog-unavailable|${Date.now()}|${alerts.length}`,
            linkId,
            alertKind: "조회확인필요",
            message: catalogSuspiciouslyEmpty
              ? "AdminPlus 상품조회 결과가 비정상적으로 0건이라 품절 판정을 보류했습니다. 계정/상품조회 API 상태를 확인한 뒤 다시 가격확인하세요."
              : `AdminPlus 보조 상품조회 실패(${fullResult.message || "응답오류"})로 품절 판정을 보류했습니다.`,
            expectedProductName,
            actualProductName: "",
            accountId: account.id,
            vendorName: String(link.vendorName || account.vendorName),
            channel: String(link.channel || ""),
            optionId: String(link.optionId || ""),
            productCode: String(link.productCode || ""),
            productName: expectedProductName || String(link.productName || ""),
            oldPrice: Number(link.baselinePrice || 0) || 0,
            newPrice: Number(link.currentPrice || link.baselinePrice || 0) || 0,
            difference: 0,
            differenceRate: 0,
            detectedAt: now,
            acknowledgedAt: "",
          });
          continue;
        }

        link.priceStatus = "품절";
        const alreadyMissing = alerts.some((row) => String(row.linkId || "") === linkId && !row.acknowledgedAt && String(row.alertKind || "") === "품절");
        if (!alreadyMissing) alerts.push({
          id: `${linkId}|missing|${Date.now()}|${alerts.length}`,
          linkId,
          alertKind: "품절",
          message: "활성상품 조회와 전체상품 보조조회 모두 정상 완료했지만 해당 상품을 찾지 못했습니다. 품절/판매종료 후보로 처리합니다. 대체상품이 있으면 매핑을 다시 확정하세요.",
          expectedProductName,
          actualProductName: "",
          accountId: account.id,
          vendorName: String(link.vendorName || account.vendorName),
          channel: String(link.channel || ""),
          optionId: String(link.optionId || ""),
          productCode: String(link.productCode || ""),
          productName: expectedProductName || String(link.productName || ""),
          oldPrice: Number(link.baselinePrice || 0) || 0,
          newPrice: Number(link.currentPrice || link.baselinePrice || 0) || 0,
          difference: 0,
          differenceRate: 0,
          detectedAt: now,
          acknowledgedAt: "",
        });
        continue;
      }

      const actualProductName = String(product.name || "").trim();
      const availabilityLabel = adminplusProductAvailabilityLabel(product.status);
      if (availabilityLabel) {
        link.priceStatus = "품절";
        link.currentPrice = Number(product.price || link.currentPrice || link.baselinePrice || 0) || 0;
        link.productName = product.name || link.productName;
        alerts.push({
          id: `${linkId}|soldout|${Date.now()}|${alerts.length}`,
          linkId,
          alertKind: "품절",
          message: `AdminPlus 현재 상품 상태: ${availabilityLabel}${product.status ? ` (${String(product.status)})` : ""}. 자동으로 다른 상품으로 변경하지 않습니다.`,
          expectedProductName,
          actualProductName,
          accountId: account.id,
          vendorName: String(link.vendorName || account.vendorName),
          channel: String(link.channel || ""),
          optionId: String(link.optionId || ""),
          productCode: product.productCode,
          productName: actualProductName,
          oldPrice: Number(link.baselinePrice || 0) || product.price,
          newPrice: product.price,
          difference: product.price - (Number(link.baselinePrice || 0) || product.price),
          differenceRate: 0,
          detectedAt: now,
          acknowledgedAt: "",
        });
        continue;
      }
      if (recoveredByName) link.priceStatus = "정상";
      const productNameMismatch = Boolean(
        expectedProductName &&
        actualProductName &&
        expectedProductName.toLowerCase().replace(/\s+/g, "") !== actualProductName.toLowerCase().replace(/\s+/g, "")
      );
      if (productNameMismatch) {
        link.priceStatus = "확인필요";
        const alreadyNameChanged = alerts.some((row) =>
          String(row.linkId || "") === linkId &&
          !row.acknowledgedAt &&
          String(row.alertKind || "") === "상품명변경" &&
          String(row.actualProductName || "") === actualProductName
        );
        if (!alreadyNameChanged) alerts.push({
          id: `${linkId}|name|${Date.now()}|${alerts.length}`,
          linkId,
          alertKind: "상품명변경",
          message: "업체명은 같지만 엑셀 기준 상품명과 AdminPlus 현재 상품명이 다릅니다. 품절·대체상품·규격변경 여부를 확인하세요. 자동으로 새 상품으로 변경하지 않습니다.",
          expectedProductName,
          actualProductName,
          accountId: account.id,
          vendorName: String(link.vendorName || account.vendorName),
          channel: String(link.channel || ""),
          optionId: String(link.optionId || ""),
          productCode: product.productCode,
          productName: actualProductName,
          oldPrice: Number(link.baselinePrice || 0) || product.price,
          newPrice: product.price,
          difference: product.price - (Number(link.baselinePrice || 0) || product.price),
          differenceRate: 0,
          detectedAt: now,
          acknowledgedAt: "",
        });
      }

      const baseline = Number(link.baselinePrice || 0) || product.price;
      const previousCurrent = Number(link.currentPrice || baseline) || baseline;
      const baseQty = Math.max(1, Math.floor(Number(link.qty || 1) || 1));
      const shippingFee = Math.max(0, Number(link.shippingFee || 0) || 0);
      const baselineConfiguredCost = baseline * baseQty + shippingFee;
      const currentConfiguredCost = product.price * baseQty + shippingFee;
      link.qty = baseQty;
      link.shippingFee = shippingFee;
      link.baselinePrice = baseline;
      link.currentPrice = product.price;
      link.baselineConfiguredCost = baselineConfiguredCost;
      link.currentConfiguredCost = currentConfiguredCost;
      link.productName = product.name || link.productName;
      if (product.price !== baseline) {
        link.priceStatus = "변동";
        if (!link.priceChangedAt || previousCurrent !== product.price) link.priceChangedAt = now;
        const linkId = String(link.id || `${link.channel}|${link.optionId}`);
        const already = alerts.some((row) => String(row.linkId || "") === linkId && !row.acknowledgedAt && Number(row.newPrice || 0) === product.price);
        if (!already) {
          const difference = product.price - baseline;
          const configuredDifference = currentConfiguredCost - baselineConfiguredCost;
          alerts.push({ id: `${linkId}|${Date.now()}|${alerts.length}`, linkId, accountId: account.id, vendorName: String(link.vendorName || account.vendorName), channel: String(link.channel || ""), optionId: String(link.optionId || ""), productCode: product.productCode, productName: product.name, oldPrice: baseline, newPrice: product.price, baseQty, shippingFee, oldConfiguredCost: baselineConfiguredCost, newConfiguredCost: currentConfiguredCost, configuredDifference, configuredDifferenceRate: baselineConfiguredCost ? configuredDifference / baselineConfiguredCost * 100 : 0, difference, differenceRate: baseline ? difference / baseline * 100 : 0, detectedAt: now, acknowledgedAt: "" });
        }
        changed += 1;
      } else if (!productNameMismatch) { link.priceStatus = "정상"; link.priceChangedAt = ""; }
    }
  }
  for (const row of unresolvedAccountLinks) {
    const linkId = String(row.linkId || "");
    const link = links.find((item) => String(item.id || `${item.channel}|${item.optionId}`) === linkId);
    if (!link) continue;
    alerts = alerts.filter((item) => String(item.linkId || "") !== linkId || Boolean(item.acknowledgedAt));
    link.priceStatus = "확인필요";
    alerts.push({
      id: `${linkId}|account-check|${Date.now()}|${alerts.length}`,
      linkId,
      alertKind: "계정확인필요",
      message: String(row.reason || "AdminPlus 가격감시 계정을 확인하세요."),
      expectedProductName: String(mappingById.get(linkId)?.vendorProductName || link.productName || ""),
      actualProductName: "",
      accountId: String(link.accountId || ""),
      vendorName: String(row.vendorName || link.vendorName || ""),
      channel: String(link.channel || ""),
      optionId: String(link.optionId || ""),
      productCode: String(link.productCode || ""),
      productName: String(link.productName || ""),
      oldPrice: Number(link.baselinePrice || 0) || 0,
      newPrice: Number(link.currentPrice || link.baselinePrice || 0) || 0,
      difference: 0,
      differenceRate: 0,
      detectedAt: now,
      acknowledgedAt: "",
    });
  }
  return {
    ok: errors.length === 0 && unresolvedAccountLinks.length === 0,
    checked,
    changed,
    mappingResets,
    accountCorrections,
    unresolvedAccountLinks,
    links,
    alerts: alerts.slice(-1000),
    errors,
  };
}

async function adminplusPriceCheckEndpoint(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request);
  const payload = Object.keys(objectRecord(body.data)).length ? objectRecord(body.data) : await loadLatestSchedulerPayload(env);
  const result = await adminplusPriceCheckRun(env, payload);
  payload.adminplusProductLinks = result.links;
  payload.adminplusPriceAlerts = result.alerts;
  payload.adminplusAutomation = { ...objectRecord(payload.adminplusAutomation), ...adminplusAutomationConfig(payload.adminplusAutomation), lastPriceCheckAt: new Date().toISOString() };
  await saveLatestSchedulerPayload(env, payload);
  return jsonResponse({ ok: result.ok, mode: "adminplus_price_check_v211", summary: result, message: `어드민플러스 가격확인 ${result.checked}건 · 가격변동 ${result.changed}건 · 엑셀업체 변경 초기화 ${result.mappingResets.length}건${result.errors.length ? ` · 오류 ${result.errors.length}건` : ""}` }, { status: 200 });
}


function adminplusDeepObjects(value: unknown, maxObjects = 2000) {
  const out: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();
  while (queue.length && out.length < maxObjects) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const row = current as Record<string, unknown>;
    out.push(row);
    for (const nested of Object.values(row)) if (nested && typeof nested === "object") queue.push(nested);
  }
  return out;
}

function adminplusCustomerCodeFromObject(row: Record<string, unknown>) {
  const direct = String(row.customer_order_code || row.customerOrderCode || "").trim();
  if (direct) return direct;
  for (const product of adminplusOrderProducts(row)) {
    const code = String(product.customer_order_code || product.customerOrderCode || "").trim();
    if (code) return code;
  }
  return "";
}

function adminplusOrderCodeFromObject(row: Record<string, unknown>) {
  return String(row.adminplus_order_code || row.adminplusOrderCode || row.order_code || row.orderCode || "").trim();
}

function adminplusScalarFromDeep(value: unknown, keys: string[]) {
  const keySet = new Set(keys);
  for (const row of adminplusDeepObjects(value)) {
    for (const [key, raw] of Object.entries(row)) {
      if (!keySet.has(key)) continue;
      const text = String(raw ?? "").trim();
      if (text) return text;
    }
  }
  return "";
}

function adminplusOrderContainersFromResponse(value: unknown) {
  const containers: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const row of adminplusDeepObjects(value)) {
    const products = adminplusOrderProducts(row);
    const orderCode = adminplusOrderCodeFromObject(row);
    const customerCode = adminplusCustomerCodeFromObject(row);
    if (!products.length && !orderCode && !customerCode) continue;
    const key = `${orderCode}|${customerCode}|${products.length}|${String(row.id || row.order_id || "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    containers.push(row);
  }
  return containers;
}

function adminplusOrderContainerForCustomer(value: unknown, customerOrderCode: string) {
  const code = String(customerOrderCode || "").trim();
  if (!code) return null as Record<string, unknown> | null;
  for (const order of adminplusOrderContainersFromResponse(value)) {
    const direct = String(order.customer_order_code || order.customerOrderCode || "").trim();
    const products = adminplusOrderProducts(order);
    if (direct === code || products.some((product) => String(product.customer_order_code || product.customerOrderCode || "").trim() === code)) {
      return order;
    }
  }
  return null as Record<string, unknown> | null;
}

function adminplusCreateResponseMatch(value: unknown, customerOrderCode: string) {
  const code = String(customerOrderCode || "").trim();
  for (const row of adminplusDeepObjects(value)) {
    if (adminplusCustomerCodeFromObject(row) !== code) continue;
    const adminplusOrderCode = adminplusOrderCodeFromObject(row) || adminplusScalarFromDeep(row, ["adminplus_order_code", "adminplusOrderCode", "order_code", "orderCode"]);
    if (adminplusOrderCode) return { matched: true, adminplusOrderCode, row };
  }
  return { matched: false, adminplusOrderCode: "", row: null as Record<string, unknown> | null };
}

function adminplusCreateResponseMeta(value: unknown) {
  return {
    orderKey: adminplusScalarFromDeep(value, ["order_key", "orderKey"]),
    totalAmount: Math.max(0, Number(adminplusScalarFromDeep(value, ["total_amount", "totalAmount"])) || 0),
  };
}

async function adminplusFindOrderByCustomerCode(env: Env, account: AdminPlusCredentialAccount, customerOrderCode: string) {
  const code = String(customerOrderCode || "").trim();
  if (!code) return { ok: false, found: false, adminplusOrderCode: "", orderKey: "", orderAmount: 0, message: "고객주문번호가 없습니다." };
  const result = await adminplusRequest(env, account, "GET", "/v1/seller/orders", { keyword: code, limit: 100 });
  if (!result.ok) return { ok: false, found: false, adminplusOrderCode: "", orderKey: "", orderAmount: 0, message: diagnosticMessage(result.data), result };
  const container = adminplusOrderContainerForCustomer(result.data, code);
  const match = adminplusCreateResponseMatch(result.data, code);
  const meta = adminplusCreateResponseMeta(result.data);
  if (container) {
    const adminplusOrderCode = adminplusOrderCodeFromObject(container) || match.adminplusOrderCode || adminplusScalarFromDeep(container, ["order_code","orderCode","adminplus_order_code","adminplusOrderCode"]);
    return { ok: true, found: true, adminplusOrderCode, orderKey: meta.orderKey, orderAmount: meta.totalAmount, order: container, result, matchSource: "full_order_container" };
  }
  if (match.matched && match.row) {
    return { ok: true, found: true, adminplusOrderCode: match.adminplusOrderCode, orderKey: meta.orderKey, orderAmount: meta.totalAmount, order: match.row, result, matchSource: "deep_fallback" };
  }
  return { ok: true, found: false, adminplusOrderCode: "", orderKey: meta.orderKey, orderAmount: meta.totalAmount, message: "동일 customer_order_code 주문을 찾지 못했습니다.", result };
}

async function adminplusRecoverCreatedOrder(env: Env, account: AdminPlusCredentialAccount, customerOrderCode: string) {
  let latest: Awaited<ReturnType<typeof adminplusFindOrderByCustomerCode>> | null = null;
  for (const wait of [0, 700, 1800]) {
    if (wait) await sleepMs(wait);
    latest = await adminplusFindOrderByCustomerCode(env, account, customerOrderCode);
    if (latest.ok && latest.found) return latest;
  }
  return latest || { ok: false, found: false, adminplusOrderCode: "", orderKey: "", orderAmount: 0, message: "주문 재조회 결과가 없습니다." };
}

async function adminplusPendingPaymentAmount(env: Env, account: AdminPlusCredentialAccount, orderKey: string) {
  const key = String(orderKey || "").trim();
  if (!key) return { ok: false, amount: 0, message: "order_key가 없습니다." };
  const result = await adminplusRequest(env, account, "GET", "/v1/seller/payments/pending", { order_key: key, limit: 10 });
  if (!result.ok) return { ok: false, amount: 0, message: diagnosticMessage(result.data) || `HTTP ${result.status}` };
  const data = objectRecord(objectRecord(result.data).data);
  const rows = asArray(data.datas).map((value) => objectRecord(value));
  const exact = rows.find((row) => String(row.order_key || "").trim() === key) || rows[0];
  const amount = Math.max(0, Number(exact?.total_amount || 0) || 0);
  return { ok: amount > 0, amount, message: amount > 0 ? "결제대기 금액 확인" : "결제대기 주문금액을 찾지 못했습니다." };
}

async function adminplusBalance(env: Env, account: AdminPlusCredentialAccount) {
  const result = await adminplusRequest(env, account, "GET", "/v1/seller/balance");
  const data = objectRecord(objectRecord(result.data).data);
  const depositBalance = Math.max(0, Number(data.deposit_balance || data.deposit || 0) || 0);
  const pointBalance = Math.max(0, Number(data.point_balance || data.point || 0) || 0);
  return { ok: result.ok, depositBalance, pointBalance, message: result.ok ? "잔액 확인" : diagnosticMessage(result.data) || `HTTP ${result.status}`, result };
}

async function adminplusPaymentStatus(env: Env, account: AdminPlusCredentialAccount, paymentKey: string) {
  const key = String(paymentKey || "").trim();
  if (!key) return { ok: false, completed: false, status: "", amount: 0, message: "payment_key가 없습니다." };
  const result = await adminplusRequest(env, account, "GET", "/v1/seller/payments", { payment_key: key, limit: 10 });
  if (!result.ok) return { ok: false, completed: false, status: "", amount: 0, message: diagnosticMessage(result.data) || `HTTP ${result.status}` };
  const data = objectRecord(objectRecord(result.data).data);
  const rows = asArray(data.datas).map((value) => objectRecord(value));
  const exact = rows.find((row) => String(row.payment_key || "").trim() === key) || rows[0];
  const status = String(exact?.payment_status || "").trim().toLowerCase();
  const amount = Math.max(0, Number(exact?.total_amount || exact?.paid_amount || 0) || 0);
  return { ok: Boolean(exact), completed: status === "completed", status, amount, message: exact ? `결제상태 ${status || "확인불가"}` : "결제내역을 찾지 못했습니다.", row: exact || null };
}

function adminplusKstDay(value: unknown) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function adminplusOrderShowsPaymentCompleted(order: Record<string, unknown>) {
  const paymentStatus = String(adminplusScalarFromDeep(order, ["payment_status", "paymentStatus", "payment_state", "paymentState"]) || "").trim().toLowerCase();
  const orderStatus = String(adminplusScalarFromDeep(order, ["status", "order_status", "orderStatus"]) || "").trim().toLowerCase();
  const paidAt = String(adminplusScalarFromDeep(order, ["paid_at", "paidAt", "payment_completed_at", "paymentCompletedAt", "payment_at", "paymentAt"]) || "").trim();
  const paidAmount = Math.max(0, Number(adminplusScalarFromDeep(order, ["paid_amount", "paidAmount", "payment_amount", "paymentAmount"])) || 0);
  return { completed: /^(completed|complete|paid|success|succeeded|결제완료|입금완료)$/.test(paymentStatus) || /^(paid|payment_completed|payment-completed|결제완료|입금완료)$/.test(orderStatus) || Boolean(paidAt), paidAt, paidAmount };
}

function adminplusResolvePurchaseAccount(config: AdminPlusAutomationConfig, accounts: AdminPlusCredentialAccount[], vendorName: string) {
  const key = normalizeAdminPlusVendorName(vendorName);
  for (const rule of (config.accountRules || []).filter((r) => r.enabled !== false && normalizeAdminPlusVendorName(r.vendorName) === key)) {
    const account = accounts.find((a) => a.id === String(rule.accountId || ""));
    if (account) return { account, source: "accountRule" };
  }
  const matches = accounts.filter((a) => normalizeAdminPlusVendorName(a.vendorName) === key || normalizeAdminPlusVendorName(a.label) === key);
  return { account: matches.length === 1 ? matches[0] : undefined, source: matches.length === 1 ? "normalizedVendor" : matches.length > 1 ? "ambiguousVendor" : "missingVendor" };
}

async function adminplusReconcileRecordedPayments(env: Env, accounts: AdminPlusCredentialAccount[], history: AdminPlusPurchaseHistoryRow[]) {
  let completed = 0; let checked = 0; const errors: Array<Record<string, unknown>> = [];
  for (const row of history) {
    if (String(row.paymentStatus || "") === "완료" || !adminplusHistorySubmitted(row)) continue;
    const account = accounts.find((a) => a.id === String(row.accountId || "")); if (!account) continue;
    checked += 1;
    if (row.paymentKey) {
      const ps = await adminplusPaymentStatus(env, account, String(row.paymentKey));
      if (ps.completed) { row.paymentStatus="완료"; row.paymentAmount=ps.amount||Number(row.orderAmount||0)||0; row.paymentCompletedAt=row.paymentCompletedAt||new Date().toISOString(); row.paymentError=""; completed+=1; continue; }
    }
    const code=String(row.customerOrderCode||"").trim(); if(!code) continue;
    const found=await adminplusFindOrderByCustomerCode(env, account, code);
    if(!found.ok){errors.push({accountId:account.id,customerOrderCode:code,stage:"payment_reconcile_order",reason:found.message||"AdminPlus 주문 재조회 실패"});continue;}
    if(!found.found||!found.order) continue;
    const observed=adminplusOrderShowsPaymentCompleted(objectRecord(found.order)); if(!observed.completed) continue;
    row.paymentStatus="완료"; row.paymentAmount=observed.paidAmount||Number(row.paymentAmount||row.orderAmount||0)||0; row.paymentCompletedAt=row.paymentCompletedAt||observed.paidAt||new Date().toISOString(); row.paymentError=""; row.adminplusOrderCode=row.adminplusOrderCode||found.adminplusOrderCode; completed+=1;
  }
  return {completed,checked,errors};
}

function adminplusCompletedDailyPaymentTotal(history: AdminPlusPurchaseHistoryRow[], accountId: string, day = kstDateText()) {
  const unique = new Map<string, number>();
  for (const row of history) {
    if (String(row.accountId || "") !== accountId || String(row.paymentStatus || "") !== "완료" || adminplusKstDay(row.paymentCompletedAt) !== day) continue;
    const key = String(row.paymentKey || row.orderKey || row.id || "").trim();
    if (!key || unique.has(key)) continue;
    unique.set(key, Math.max(0, Number(row.paymentAmount || row.orderAmount || 0) || 0));
  }
  return Array.from(unique.values()).reduce((sum, value) => sum + value, 0);
}

async function adminplusEnsureMarketplacePreparing(env: Env, history: AdminPlusPurchaseHistoryRow[], currentPaidRows: Record<string, unknown>[] = []) {
  const errors: Array<Record<string, unknown>> = []; let attempted=0; let prepared=0; let alreadyPrepared=0;
  const targets=history.filter((row)=>!row.marketplacePreparingAt && adminplusHistorySubmitted(row) && String(row.paymentStatus||"")==="완료");
  for(const hist of targets){const live=currentPaidRows.find((row)=>String(row.channel||"")===String(hist.channel||"")&&String(row.orderNo||"")===String(hist.orderNo||"")); if(!live) continue; hist.shipmentBoxId=String(live.shipmentBoxId||hist.shipmentBoxId||""); hist.orderProductId=String(live.orderProductId||live.tossOrderProductId||hist.orderProductId||""); hist.orderId=String(live.marketplaceOrderId||live.orderId||hist.orderId||hist.orderNo||""); hist.vendorItemId=String(live.vendorItemId||live.tossStockId||live.optionId||hist.vendorItemId||hist.optionId||"");}
  const groups=new Map<string,AdminPlusPurchaseHistoryRow[]>();
  for(const row of targets){const ackId=String(row.channel||"").includes("토스")?String(row.orderProductId||""):String(row.shipmentBoxId||""); if(!ackId){errors.push({sourceKey:row.sourceKey,channel:row.channel,orderNo:row.orderNo,reason:"결제완료 후 상품준비중 변경 식별자가 없습니다.",nextAction:"결제완료 주문을 재수집해 식별자를 보강한 뒤 재시도합니다."});continue;} const key=`${row.channel}|${ackId}`; const bucket=groups.get(key)||[]; bucket.push(row); groups.set(key,bucket);}
  for(const rows of groups.values()){attempted+=rows.length; const first=rows[0]; const response=await orderAcknowledgeExecute(schedulerRequest({rows:[adminplusShipmentRowFromHistory(first,first.vendorName||"AdminPlus")]}),env); const data=await response.json() as Record<string,unknown>; if(data.ok===true){const now=new Date().toISOString(); rows.forEach((row)=>{row.marketplacePreparingAt=now;}); prepared+=rows.length;} else errors.push({sourceKey:first.sourceKey,channel:first.channel,orderNo:first.orderNo,reason:String(data.message||"상품준비중 변경 실패")});}
  return {attempted,prepared,alreadyPrepared,failed:targets.filter((row)=>!row.marketplacePreparingAt).length,errors};
}


async function adminplusProcessPayments(env: Env, config: AdminPlusAutomationConfig, accounts: AdminPlusCredentialAccount[], history: AdminPlusPurchaseHistoryRow[]) {
  const errors: Array<Record<string, unknown>> = [];
  let completed = 0;
  let pending = 0;
  const byBatch = new Map<string, AdminPlusPurchaseHistoryRow[]>();
  for (const row of history) {
    const orderKey = String(row.orderKey || "").trim();
    if (!orderKey || String(row.paymentStatus || "") === "완료") continue;
    const key = `${row.accountId}|${orderKey}`;
    const rows = byBatch.get(key) || [];
    rows.push(row);
    byBatch.set(key, rows);
  }

  for (const rows of byBatch.values()) {
    const first = rows[0];
    const account = accounts.find((value) => value.id === String(first.accountId || ""));
    if (!account) { pending += rows.length; continue; }
    const reconciled = await adminplusReconcileRecordedPayments(env, [account], rows);
    if (rows.every((row) => String(row.paymentStatus || "") === "완료")) { completed += rows.length; continue; }
    errors.push(...reconciled.errors);
    const rule = adminplusRuleForAccount(config, account);
    if (!rule?.autoPayment) { rows.forEach((row) => { row.paymentStatus = row.paymentStatus || "대기"; row.paymentError = "예치금 자동결제 OFF"; }); pending += rows.length; continue; }
    const maxPerBatch = Math.max(0, Number(rule.paymentMaxPerBatch || 0) || 0);
    const dailyLimit = Math.max(0, Number(rule.paymentDailyLimit || 0) || 0);
    if (!maxPerBatch || !dailyLimit) { rows.forEach((row) => { row.paymentStatus = "대기"; row.paymentError = "자동결제 한도(1회/일일)를 1원 이상 설정하세요."; }); pending += rows.length; continue; }

    let amount = Math.max(0, Number(first.orderAmount || 0) || 0);
    if (!amount) {
      const pendingAmount = await adminplusPendingPaymentAmount(env, account, String(first.orderKey || ""));
      if (!pendingAmount.ok) { rows.forEach((row) => { row.paymentStatus = "대기"; row.paymentError = pendingAmount.message; }); errors.push({ accountId: account.id, orderKey: first.orderKey, stage: "payment_amount", reason: pendingAmount.message }); pending += rows.length; continue; }
      amount = pendingAmount.amount;
      rows.forEach((row) => { row.orderAmount = amount; });
    }
    if (amount > maxPerBatch) { rows.forEach((row) => { row.paymentStatus = "대기"; row.paymentError = `1회 자동결제 한도 초과: ${amount}원 > ${maxPerBatch}원`; }); pending += rows.length; continue; }
    const dailySpent = adminplusCompletedDailyPaymentTotal(history, account.id);
    if (dailySpent + amount > dailyLimit) { rows.forEach((row) => { row.paymentStatus = "대기"; row.paymentError = `일일 자동결제 한도 초과: 누적 ${dailySpent}원 + ${amount}원 > ${dailyLimit}원`; }); pending += rows.length; continue; }

    if (first.paymentKey) {
      const existing = await adminplusPaymentStatus(env, account, String(first.paymentKey));
      if (existing.completed) {
        const now = new Date().toISOString();
        rows.forEach((row) => { row.paymentStatus = "완료"; row.paymentAmount = existing.amount || amount; row.paymentCompletedAt = row.paymentCompletedAt || now; row.paymentError = ""; });
        completed += rows.length;
        continue;
      }
    }

    const balance = await adminplusBalance(env, account);
    if (!balance.ok) { rows.forEach((row) => { row.paymentStatus = "대기"; row.paymentError = `예치금 잔액 조회 실패: ${balance.message}`; }); errors.push({ accountId: account.id, orderKey: first.orderKey, stage: "balance", reason: balance.message }); pending += rows.length; continue; }
    if (balance.depositBalance < amount) { rows.forEach((row) => { row.paymentStatus = "대기"; row.paymentError = `예치금 부족: 잔액 ${balance.depositBalance}원 / 필요 ${amount}원`; }); pending += rows.length; continue; }

    const payment = await adminplusRequest(env, account, "POST", "/v1/seller/payments", undefined, {
      order_key: [String(first.orderKey || "")],
      payments: [{ method: "deposit", amount }, { method: "point", amount: 0 }],
    });
    if (!payment.ok) {
      const reason = diagnosticMessage(payment.data) || `HTTP ${payment.status}`;
      const permissionError = payment.status === 401 || payment.status === 403 || /권한|permission|forbidden|unauthorized/i.test(reason);
      rows.forEach((row) => {
        row.paymentStatus = permissionError ? "권한확인필요" : "실패";
        row.paymentAmount = amount;
        row.paymentError = permissionError ? `결제 API 권한 확인 필요: ${reason}` : reason;
      });
      errors.push({ accountId: account.id, orderKey: first.orderKey, stage: "payment", reason });
      pending += rows.length;
      continue;
    }
    const paymentData = objectRecord(objectRecord(payment.data).data);
    const paymentKey = String(paymentData.payment_key || "").trim();
    rows.forEach((row) => { row.paymentKey = paymentKey; row.paymentAmount = amount; row.paymentStatus = "대기"; row.paymentError = ""; });
    let status = { ok: false, completed: false, status: "", amount: 0, message: "결제상태 미확인" };
    for (const wait of [0, 800, 2000]) {
      if (wait) await sleepMs(wait);
      status = await adminplusPaymentStatus(env, account, paymentKey);
      if (status.completed) break;
    }
    if (status.completed) {
      const now = new Date().toISOString();
      rows.forEach((row) => { row.paymentStatus = "완료"; row.paymentAmount = status.amount || amount; row.paymentCompletedAt = now; row.paymentError = ""; });
      completed += rows.length;
    } else {
      rows.forEach((row) => { row.paymentStatus = status.ok ? "대기" : "실패"; row.paymentError = status.message; });
      errors.push({ accountId: account.id, orderKey: first.orderKey, paymentKey, stage: "payment_status", reason: status.message });
      pending += rows.length;
    }
  }
  return { completed, pending, errors };
}

async function adminplusPurchaseRun(env: Env, payload: Record<string, unknown>, dryRun = false, dueTime = "", manualRun = false) {
  const config = adminplusAutomationConfig(payload.adminplusAutomation);
  const accounts = adminplusAccounts(env).filter((account) => account.enabled && (adminplusRuleForAccount(config, account)?.enabled !== false));
  const mappings = adminplusMappingRows(payload);
  const confirmedLinks = asArray(payload.adminplusProductLinks).map((value) => objectRecord(value));
  const history = asArray(payload.adminplusPurchaseHistory).map((v) => objectRecord(v)) as AdminPlusPurchaseHistoryRow[];
  const historyKeys = new Set(history.map((row) => String(row.sourceKey || adminplusHistoryKey(row.channel, row.orderNo, row.optionId))));
  const collected = await collectCurrentMarketplaceOrders(env);
  const ordererInfo = adminplusOrdererInfo(payload);
  const candidates: Array<{ account: AdminPlusCredentialAccount; order: Record<string, unknown>; mapping: ReturnType<typeof adminplusMappingRows>[number]; matchString: string; sourceKey: string; matchedOptionId: string; matchedVia: string; confirmedLinkOptionId: string; ordererName: string; ordererPhone: string }> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const tossProductCache = new Map<string, Array<Record<string, string>>>();
  for (const order of collected.rows) {
    const channel = String(order.channel || "");
    const actualOptionId = String(order.optionId || "");
    const matchResult = await adminplusResolveMappingForOrder(env, payload, order, mappings, tossProductCache);
    const mapping = matchResult.mapping;
    if (!mapping) {
      skipped.push({
        channel,
        orderNo: order.orderNo,
        optionId: actualOptionId,
        mappingCandidates: matchResult.candidates,
        tossStockId: order.tossStockId || "",
        tossProductId: order.tossProductId || "",
        tossProductItemManagementCode: order.tossProductItemManagementCode || order.optionManagementCode || "",
        matchedVia: matchResult.matchedVia || "",
        reason: channel === "토스"
          ? "토스 옵션 미매핑: 주문 stockId를 상품 API productItemId로 변환한 뒤 엑셀 옵션ID와 비교했지만 일치하는 매핑이 없습니다."
          : "미매핑",
      });
      continue;
    }
    if (dueTime && !optionPurchaseTimes(mapping.purchaseTime).includes(dueTime)) { skipped.push({ channel, orderNo: order.orderNo, optionId: actualOptionId, mappingOptionId: mapping.optionId, reason: `발주시간 대기(${mapping.purchaseTime})` }); continue; }
    const accountResolution = adminplusResolvePurchaseAccount(config, accounts, mapping.vendorName);
    const account = accountResolution.account;
    if (!account || adminplusRuleForAccount(config, account)?.autoPurchase === false) { skipped.push({ channel, orderNo: order.orderNo, optionId: actualOptionId, vendorName: mapping.vendorName, reason: "어드민플러스 계정 미연결/자동발주 OFF" }); continue; }
    const linkId = `${mapping.channel}|${mapping.optionId}`;
    const linkCandidates = Array.from(new Set((Array.isArray(matchResult.linkCandidateOptionIds) ? matchResult.linkCandidateOptionIds : [mapping.optionId]).map((value) => String(value || "").trim()).filter(Boolean)));
    const linkMatchesAccount = (row: Record<string, unknown>) => String(row.accountId || "") === account.id || normalizeAdminPlusVendorName(row.vendorName) === normalizeAdminPlusVendorName(mapping.vendorName);
    let confirmedLink: Record<string, unknown> | undefined = confirmedLinks.find((row) => linkMatchesAccount(row) && String(row.id || "") === linkId);
    let confirmedLinkOptionId = confirmedLink ? mapping.optionId : "";
    for (const candidateId of confirmedLink ? [] : linkCandidates) {
      const candidateLinkId = `${mapping.channel}|${candidateId}`;
      const found = confirmedLinks.find((row) => linkMatchesAccount(row) && (String(row.id || "") === candidateLinkId || (String(row.channel || "") === mapping.channel && String(row.optionId || "") === candidateId)));
      if (found) { confirmedLink = found; confirmedLinkOptionId = candidateId; break; }
    }
    const matchString = String(confirmedLink?.matchString || "").trim();
    if (!matchString) { skipped.push({ channel, orderNo: order.orderNo, optionId: mapping.optionId, vendorName: mapping.vendorName, matchedVia: matchResult.matchedVia || "", confirmedLinkCandidates: linkCandidates, reason: channel === "토스" ? "토스 옵션은 매핑됐지만 동등 식별자(productItemId/stockId/관리코드) 중 API 확정매핑을 찾지 못했습니다." : "API 확정매핑 없음: API 상품매칭에서 확정 후 자동발주합니다." }); continue; }
    const sourceKey = adminplusHistoryKey(channel, order.orderNo, mapping.optionId);
    if (historyKeys.has(sourceKey)) { skipped.push({ channel, orderNo: order.orderNo, optionId: mapping.optionId, reason: "이미 발주됨" }); continue; }
    // 예약 스케줄러는 자동화 시작 이후 주문만 처리하지만, 사용자가 직접 누르는
    // `지금 발주·결제 실행`은 현재 마켓의 결제완료·미발주 backlog를 복구/처리해야 합니다.
    // 따라서 startedAt 컷오프는 자동 스케줄 실행에만 적용합니다.
    if (!manualRun && config.startedAt && String(order.orderedAt || "") && new Date(String(order.orderedAt)).getTime() < new Date(config.startedAt).getTime()) {
      skipped.push({ channel, orderNo: order.orderNo, optionId: mapping.optionId, reason: "자동화 시작 전 주문" });
      continue;
    }
    candidates.push({ account, order, mapping, matchString, sourceKey, matchedOptionId: matchResult.matchedOptionId, matchedVia: matchResult.matchedVia || "", confirmedLinkOptionId, ordererName: ordererInfo.name, ordererPhone: ordererInfo.phone });
  }

  const matchCache = new Map<string, Awaited<ReturnType<typeof adminplusExactMatch>>>();
  const issues: Array<Record<string, unknown>> = [];
  const ready: typeof candidates = [];
  for (const candidate of candidates) {
    const cacheKey = `${candidate.account.id}|${candidate.matchString}`;
    let match = matchCache.get(cacheKey);
    if (!match) {
      match = await adminplusExactMatch(env, candidate.account, candidate.matchString);
      matchCache.set(cacheKey, match);
    }
    if (!match.ok || !match.matched) {
      issues.push({ accountId: candidate.account.id, vendorName: candidate.mapping.vendorName, orderNo: candidate.order.orderNo, optionId: candidate.mapping.optionId, productString: candidate.matchString, reason: match.message });
      continue;
    }
    const matchedRow = objectRecord(match.match);
    const matchedProducts = asArray(matchedRow.products).map((value) => objectRecord(value));
    if (matchedProducts.length === 1) {
      const actualBaseQty = Math.max(1, Math.floor(Number(matchedProducts[0].qty || 1) || 1));
      if (actualBaseQty !== candidate.mapping.baseQty) {
        issues.push({ accountId: candidate.account.id, vendorName: candidate.mapping.vendorName, orderNo: candidate.order.orderNo, optionId: candidate.mapping.optionId, productString: candidate.matchString, reason: `기본수량 불일치: 엑셀 매핑 ${candidate.mapping.baseQty} / AdminPlus 옵션별 매칭 ${actualBaseQty}. API 상품매칭에서 해당 옵션ID를 수정 확정하세요.` });
        continue;
      }
    }
    const built = adminplusBuildOrderPayload(candidate);
    if (built.validationErrors.length) {
      issues.push({
        accountId: candidate.account.id,
        vendorName: candidate.mapping.vendorName,
        channel: candidate.order.channel,
        orderNo: candidate.order.orderNo,
        optionId: candidate.mapping.optionId,
        stage: "order_payload_preflight",
        reason: `AdminPlus 주문등록 필드 검증 실패: ${built.validationErrors.join(", ")} · ${built.diagnostic}`,
      });
      continue;
    }
    ready.push(candidate);
  }

  const skipReasonCounts = skipped.reduce<Record<string, number>>((acc, row) => {
    const reason = String(row.reason || "기타");
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});
  const collectedByChannel = collected.rows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.channel || "미확인");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const paymentPreview = accounts.map((account) => {
    const rule = adminplusRuleForAccount(config, account);
    return { accountId: account.id, vendorName: account.vendorName, autoPayment: rule?.autoPayment === true, paymentMaxPerBatch: Number(rule?.paymentMaxPerBatch || 0), paymentDailyLimit: Number(rule?.paymentDailyLimit || 0) };
  });
  const readyAccountIds = new Set(ready.map((row) => row.account.id));
  const paymentBlockers = paymentPreview
    .filter((row) => readyAccountIds.has(row.accountId))
    .flatMap((row) => {
      const reasons: string[] = [];
      if (!row.autoPayment) reasons.push("예치금 자동결제 OFF");
      if (!(row.paymentMaxPerBatch > 0)) reasons.push("1회 한도 0원");
      if (!(row.paymentDailyLimit > 0)) reasons.push("일일 한도 0원");
      return reasons.length ? [{ accountId: row.accountId, vendorName: row.vendorName, reason: reasons.join(", ") }] : [];
    });
  if (dryRun) return {
    ok: issues.length === 0,
    dryRun: true,
    dueTime,
    collected: collected.results,
    collectedRows: collected.rows.length,
    collectedByChannel,
    manualRun,
    candidates: candidates.length,
    ready: ready.length,
    tossBridgeRows: adminplusTossOptionBridgeRows(payload).length,
    tossLiveProductsChecked: tossProductCache.size,
    matchChecks: matchCache.size,
    paymentRules: paymentPreview,
    paymentBlockers,
    paymentWarnings: paymentBlockers,
    orderRegistrationReady: ready.length,
    paymentReady: Math.max(0, ready.length - ready.filter((row) => paymentBlockers.some((blocker) => blocker.accountId === row.account.id)).length),
    issues: issues.slice(0, 100),
    skipped: skipped.slice(0, 100),
    skipReasonCounts,
    history,
  };

  // V248: 결제정책 미설정은 주문등록 차단이 아니라 결제 보류 사유입니다.

  const created: AdminPlusPurchaseHistoryRow[] = [];
  const createdKeys = new Set<string>();
  const errors: Array<Record<string, unknown>> = [...issues];
  const addHistory = (row: typeof ready[number], customerOrderCode: string, orderKey: string, adminplusOrderCode: string, orderAmount: number, recovered = false) => {
    if (createdKeys.has(row.sourceKey) || historyKeys.has(row.sourceKey)) return;
    createdKeys.add(row.sourceKey);
    historyKeys.add(row.sourceKey);
    created.push({
      id: `${row.sourceKey}|${Date.now()}|${created.length}`,
      sourceKey: row.sourceKey,
      accountId: row.account.id,
      vendorName: row.mapping.vendorName,
      channel: String(row.order.channel || ""),
      orderNo: String(row.order.orderNo || ""),
      orderedAt: String(row.order.orderedAt || ""),
      optionId: row.mapping.optionId,
      vendorProductName: row.mapping.vendorProductName,
      customerOrderCode,
      orderKey,
      adminplusOrderCode,
      orderAmount,
      paymentStatus: "대기",
      shipmentBoxId: String(row.order.shipmentBoxId || ""),
      orderId: String(row.order.marketplaceOrderId || row.order.orderId || row.order.orderNo || ""),
      orderProductId: String(row.order.orderProductId || row.order.tossOrderProductId || ""),
      vendorItemId: String(row.order.vendorItemId || row.order.tossStockId || row.order.optionId || ""),
      receiverName: String(row.order.receiverName || ""),
      submittedAt: new Date().toISOString(),
      error: recovered ? "API 응답 불확실 후 customer_order_code 조회로 기존 등록 확인" : "",
    });
  };

  for (const account of accounts) {
    const accountRows = ready.filter((row) => row.account.id === account.id);
    for (let i = 0; i < accountRows.length; i += 100) {
      const batch = accountRows.slice(i, i + 100);
      const builtOrders = batch.map((row) => adminplusBuildOrderPayload(row));
      const orders = builtOrders.map((built) => built.payload);
      const validIndexes = builtOrders.map((built, idx) => built.validationErrors.length ? -1 : idx).filter((idx) => idx >= 0);
      if (validIndexes.length !== orders.length) batch.forEach((row, idx) => {
        const built = builtOrders[idx];
        if (built.validationErrors.length) errors.push({
          accountId: account.id,
          channel: row.order.channel,
          orderNo: row.order.orderNo,
          optionId: row.mapping.optionId,
          customerOrderCode: built.customerOrderCode,
          stage: "order_payload_validation",
          reason: `AdminPlus 주문등록 필드 검증 실패: ${built.validationErrors.join(", ")} · ${built.diagnostic}`,
        });
      });
      const validBatch = batch.filter((_r, idx) => validIndexes.includes(idx));
      const validOrders = orders.filter((_r, idx) => validIndexes.includes(idx));
      if (!validOrders.length) continue;

      let result: ExternalApiResult | null = null;
      try { result = await adminplusRequest(env, account, "POST", "/v1/seller/orders", undefined, { orders: validOrders }); }
      catch (error) { result = null; errors.push({ accountId: account.id, stage: "order_create_batch_network", reason: `주문등록 네트워크 오류: ${error instanceof Error ? error.message : String(error)}` }); }
      const batchMeta = adminplusCreateResponseMeta(result?.data);
      for (let rowIndex = 0; rowIndex < validBatch.length; rowIndex += 1) {
        const row = validBatch[rowIndex];
        const orderPayload = validOrders[rowIndex];
        const customerOrderCode = adminplusCustomerOrderCode({ ...row.order, channel: row.order.channel, optionId: row.mapping.optionId });
        const direct = result?.ok ? adminplusCreateResponseMatch(result.data, customerOrderCode) : { matched: false, adminplusOrderCode: "", row: null };
        if (result?.ok && direct.matched && direct.adminplusOrderCode) {
          addHistory(row, customerOrderCode, batchMeta.orderKey, direct.adminplusOrderCode, batchMeta.totalAmount, false);
          continue;
        }

        // 응답 래핑이 달라졌거나 배치 응답이 불완전해도 customer_order_code로 실제 등록을 재확인합니다.
        let recovered = await adminplusRecoverCreatedOrder(env, account, customerOrderCode);
        if (recovered.ok && recovered.found) {
          addHistory(row, customerOrderCode, recovered.orderKey || batchMeta.orderKey, recovered.adminplusOrderCode, recovered.orderAmount || batchMeta.totalAmount, true);
          continue;
        }

        // 배치 요청 자체가 실패한 경우에만 미등록 건을 1건씩 재시도합니다.
        // 성공 응답인데 구조만 미확인인 경우에는 중복 생성을 피하기 위해 재POST하지 않습니다.
        if (result && !result.ok) {
          let single: ExternalApiResult | null = null;
          try { single = await adminplusRequest(env, account, "POST", "/v1/seller/orders", undefined, { orders: [orderPayload] }); }
          catch (error) {
            errors.push({ accountId: account.id, channel: row.order.channel, orderNo: row.order.orderNo, optionId: row.mapping.optionId, customerOrderCode, stage: "order_create_single_network", reason: `개별 주문등록 네트워크 오류: ${error instanceof Error ? error.message : String(error)}` });
          }
          const singleMeta = adminplusCreateResponseMeta(single?.data);
          const singleMatch = single?.ok ? adminplusCreateResponseMatch(single.data, customerOrderCode) : { matched: false, adminplusOrderCode: "", row: null };
          if (single?.ok && singleMatch.matched && singleMatch.adminplusOrderCode) {
            addHistory(row, customerOrderCode, singleMeta.orderKey, singleMatch.adminplusOrderCode, singleMeta.totalAmount, false);
            continue;
          }
          recovered = await adminplusRecoverCreatedOrder(env, account, customerOrderCode);
          if (recovered.ok && recovered.found) {
            addHistory(row, customerOrderCode, recovered.orderKey || singleMeta.orderKey, recovered.adminplusOrderCode, recovered.orderAmount || singleMeta.totalAmount, true);
            continue;
          }
          errors.push({
            accountId: account.id,
            channel: row.order.channel,
            orderNo: row.order.orderNo,
            optionId: row.mapping.optionId,
            customerOrderCode,
            stage: "order_create_single",
            reason: adminplusValidationDiagnostic(single?.data, recovered.message || (single ? `HTTP ${single.status}` : diagnosticMessage(result.data) || `배치 HTTP ${result.status}`)) + ` · ${adminplusBuildOrderPayload(row).diagnostic}`,
          });
          continue;
        }

        errors.push({
          accountId: account.id,
          channel: row.order.channel,
          orderNo: row.order.orderNo,
          optionId: row.mapping.optionId,
          customerOrderCode,
          stage: "order_create_reconcile",
          reason: result
            ? `AdminPlus 주문등록 HTTP ${result.status} 성공 응답을 받았지만 주문코드를 확인하지 못했습니다. 중복방지를 위해 재등록하지 않았습니다. ${adminplusValidationDiagnostic(result.data, recovered.message || "응답 구조 확인 필요")} · ${adminplusBuildOrderPayload(row).diagnostic}`
            : recovered.message || "주문등록 결과를 확인할 수 없습니다.",
        });
      }
    }
  }

  const nextHistory = [...history, ...created].slice(-5000);
  const payments = await adminplusProcessPayments(env, config, accounts, nextHistory);
  // 주문등록과 예치금 결제는 별도 단계입니다. 결제 권한/잔액/한도 오류는 이미 생성된 AdminPlus 주문을 실패로 되돌리지 않습니다.
  const paymentErrors = payments.errors;
  const preparing = await adminplusEnsureMarketplacePreparing(env, nextHistory, collected.rows);
  errors.push(...preparing.errors);
  return { ok: errors.length === 0, dryRun: false, dueTime, manualRun, collected: collected.results, collectedRows: collected.rows.length, collectedByChannel, candidates: candidates.length, ready: ready.length, matchChecks: matchCache.size, created: created.length, paymentCompleted: payments.completed, paymentPending: payments.pending, paymentErrors: paymentErrors.slice(0, 100), marketplacePreparing: preparing.prepared, errors: errors.slice(0, 100), skipped: skipped.slice(0, 100), skipReasonCounts, history: nextHistory };
}

async function adminplusShipmentResolveEndpoint(request: Request, env: Env) {
  const body = await readJson<Record<string, unknown>>(request);
  const sourceKey = displayText(body.sourceKey);
  const action = displayText(body.action);
  if (!sourceKey) return jsonResponse({ ok: false, message: "처리할 송장 대기 주문의 sourceKey가 없습니다." }, { status: 400 });
  const payload = await loadLatestSchedulerPayload(env);
  const history = asArray(payload.adminplusPurchaseHistory).map((value) => objectRecord(value)) as AdminPlusPurchaseHistoryRow[];
  const hist = history.find((row) => String(row.sourceKey || adminplusHistoryKey(row.channel, row.orderNo, row.optionId)) === sourceKey);
  if (!hist) return jsonResponse({ ok: false, message: `송장 대기 주문을 찾지 못했습니다. sourceKey=${sourceKey}` }, { status: 404 });

  if (action === "acknowledge") {
    hist.operatorResolvedAt = new Date().toISOString();
    hist.operatorResolveReason = "운영자가 마켓에서 직접 처리 완료 확인";
    payload.adminplusPurchaseHistory = history.slice(-5000);
    await saveLatestSchedulerPayload(env, payload);
    return jsonResponse({ ok: true, mode: "adminplus_shipment_operator_ack_v248", summary: { rows: history.slice(-5000), sourceKey, operatorResolvedAt: hist.operatorResolvedAt }, message: `주문 ${hist.orderNo || sourceKey}을 운영자 확인완료로 저장했습니다. 실제 shipmentUploadedAt은 변경하지 않고 대기열에서만 제외합니다.` });
  }

  if (action === "recheck_market") {
    if (!String(hist.channel || "").includes("토스")) return jsonResponse({ ok: false, message: "현재 마켓 상태 재조회는 토스 주문에만 지원합니다." }, { status: 400 });
    const end = kstDateText();
    const start = schedulerAddKstDays(end, -6);
    const response = await collectOrdersPreview(schedulerRequest({ channel: "토스", manual: true, query: { startDate: start, endDate: end, limit: 100, maxPages: 30 } }), env);
    const data = await response.json() as Record<string, unknown>;
    const rows = asArray(objectRecord(data.summary).sampleOrders).map((value) => objectRecord(value));
    const matched = rows.find((row) => {
      const orderNo = displayText(row.orderNo || row.orderId);
      const orderProductId = displayText(row.orderProductId || row.orderProductID);
      return (hist.orderNo && orderNo === String(hist.orderNo)) || (hist.orderProductId && orderProductId === String(hist.orderProductId));
    });
    if (!matched) return jsonResponse({ ok: false, mode: "adminplus_shipment_toss_recheck_v248", summary: { rows: history.slice(-5000), checked: rows.length }, message: `토스 주문을 다시 조회했지만 주문 ${hist.orderNo || sourceKey}을 찾지 못했습니다. 조회기간/주문번호를 확인하세요.` });
    const status = displayText(matched.status || matched.orderStatus || matched.orderProductStatus).toUpperCase();
    hist.marketRecheckedAt = new Date().toISOString();
    hist.marketRecheckedStatus = status || "확인필요";
    const completed = ["SHIPPING", "DELIVERING", "DELIVERY", "DELIVERED", "COMPLETED", "COMPLETE"].some((value) => status.includes(value));
    if (completed) hist.shipmentUploadedAt = hist.shipmentUploadedAt || hist.marketRecheckedAt;
    payload.adminplusPurchaseHistory = history.slice(-5000);
    await saveLatestSchedulerPayload(env, payload);
    return jsonResponse({ ok: true, mode: "adminplus_shipment_toss_recheck_v248", summary: { rows: history.slice(-5000), sourceKey, status, completed }, message: completed ? `토스에서 주문 ${hist.orderNo || sourceKey}의 현재 상태 ${status}를 확인해 실제 마켓 처리완료로 반영했습니다.` : `토스에서 주문 ${hist.orderNo || sourceKey}의 현재 상태 ${status || "확인필요"}를 확인했습니다. 배송완료/배송중 상태가 아니므로 송장 대기열은 유지합니다.` });
  }

  return jsonResponse({ ok: false, message: `지원하지 않는 송장 처리 action=${action}` }, { status: 400 });
}

function adminplusKstDateTime(ms: number) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function adminplusOrderProducts(order: Record<string, unknown>) {
  const nested = objectRecord(order.data);
  const candidates = [
    order.order_producs,
    order.order_products,
    order.orderProducts,
    order.products,
    order.items,
    order.order_items,
    order.orderItems,
    order.product_items,
    order.productItems,
    nested.order_producs,
    nested.order_products,
    nested.orderProducts,
    nested.products,
    nested.items,
    nested.order_items,
    nested.orderItems,
    nested.product_items,
    nested.productItems,
  ];
  for (const candidate of candidates) {
    const rows = asArray(candidate).map((value) => objectRecord(value));
    if (rows.length) return rows;
  }
  return [];
}


function adminplusTrackingText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const text = String(row[key] ?? "").trim();
    if (text) return text;
  }
  const keySet = new Set(keys);
  for (const nested of adminplusDeepObjects(row)) {
    if (nested === row) continue;
    for (const [key, raw] of Object.entries(nested)) {
      if (!keySet.has(key)) continue;
      const text = String(raw ?? "").trim();
      if (text) return text;
    }
  }
  return "";
}

function adminplusTrackingPairsFromOrder(order: Record<string, unknown>, customerOrderCode = "") {
  const orderCode = adminplusCustomerCodeFromObject(order);
  const targetCode = String(customerOrderCode || orderCode || "").trim();
  const orderCourier = adminplusTrackingText(order, ["shipping_company","shippingCompany","shipping_company_name","shippingCompanyName","courier","courier_name","courierName","delivery_company","deliveryCompany","delivery_company_name","deliveryCompanyName","carrier","carrierName","invoice_company","invoiceCompany","invoice_company_name","invoiceCompanyName","shipment_company","shipmentCompany","logistics_company","logisticsCompany","delivery_corp","deliveryCorp","delivery_corp_name","deliveryCorpName"]);
  const orderTracking = adminplusTrackingText(order, ["tracking_number","trackingNumber","tracking_no","trackingNo","invoice_number","invoiceNumber","invoice_no","invoiceNo","waybill","waybill_number","waybillNumber","waybill_no","waybillNo","delivery_number","deliveryNumber","delivery_invoice_no","deliveryInvoiceNo","delivery_invoice_number","deliveryInvoiceNumber","shipment_number","shipmentNumber","tracking_code","trackingCode","shipping_tracking_number","shippingTrackingNumber"]);
  const products = adminplusOrderProducts(order);
  const relevant = products.filter((product) => {
    const code = String(product.customer_order_code || product.customerOrderCode || "").trim();
    return !targetCode || !code || code === targetCode;
  });
  const rows = (relevant.length ? relevant : products).map((product) => ({
    customerOrderCode: String(product.customer_order_code || product.customerOrderCode || targetCode || orderCode || "").trim(),
    courier: adminplusTrackingText(product, ["shipping_company","shippingCompany","shipping_company_name","shippingCompanyName","courier","courier_name","courierName","delivery_company","deliveryCompany","delivery_company_name","deliveryCompanyName","carrier","carrierName","invoice_company","invoiceCompany","invoice_company_name","invoiceCompanyName","shipment_company","shipmentCompany","logistics_company","logisticsCompany","delivery_corp","deliveryCorp","delivery_corp_name","deliveryCorpName"]) || orderCourier,
    trackingNo: adminplusTrackingText(product, ["tracking_number","trackingNumber","tracking_no","trackingNo","invoice_number","invoiceNumber","invoice_no","invoiceNo","waybill","waybill_number","waybillNumber","waybill_no","waybillNo","delivery_number","deliveryNumber","delivery_invoice_no","deliveryInvoiceNo","delivery_invoice_number","deliveryInvoiceNumber","shipment_number","shipmentNumber","tracking_code","trackingCode","shipping_tracking_number","shippingTrackingNumber"]) || orderTracking,
    status: String(product.status || order.status || "").trim(),
  }));
  if (!rows.length && (orderCourier || orderTracking)) rows.push({ customerOrderCode: targetCode || orderCode, courier: orderCourier, trackingNo: orderTracking, status: String(order.status || "").trim() });
  return rows;
}

function adminplusTrackingResultForCustomer(order: Record<string, unknown>, customerOrderCode: string) {
  const rows = adminplusTrackingPairsFromOrder(order, customerOrderCode)
    .filter((row) => !["cancelled","refunded","returned","deleted"].includes(String(row.status || "").toLowerCase()));
  if (!rows.length) return { ok: false, complete: false, courier: "", trackingNo: "", reason: "주문상품을 찾지 못했습니다." };
  const completed = rows.filter((row) => row.courier && row.trackingNo);
  if (!completed.length) return { ok: true, complete: false, courier: "", trackingNo: "", reason: "송장정보가 아직 없습니다." };
  if (completed.length !== rows.length) return { ok: true, complete: false, courier: "", trackingNo: "", reason: "1:N 매칭 주문의 일부 상품만 송장이 확정되어 자동등록을 보류합니다." };
  const pairs = Array.from(new Map(completed.map((row) => [`${row.courier}|${row.trackingNo}`, row])).values());
  if (pairs.length !== 1) return { ok: true, complete: false, courier: "", trackingNo: "", reason: `동일 원주문에 서로 다른 송장 ${pairs.length}개가 확인되어 자동등록을 보류합니다.` };
  return { ok: true, complete: true, courier: pairs[0].courier, trackingNo: pairs[0].trackingNo, reason: "" };
}

function adminplusHistorySubmitted(hist: AdminPlusPurchaseHistoryRow) {
  return Boolean(
    String(hist.submittedAt || "").trim() ||
    String(hist.orderKey || "").trim() ||
    String(hist.customerOrderCode || "").trim() ||
    String(hist.adminplusOrderCode || "").trim()
  );
}

function adminplusShipmentRowFromHistory(hist: AdminPlusPurchaseHistoryRow, accountLabel = "") {
  return {
    sourceKey: String(hist.sourceKey || adminplusHistoryKey(hist.channel, hist.orderNo, hist.optionId)),
    channel: hist.channel,
    orderNo: hist.orderNo,
    shipmentBoxId: hist.shipmentBoxId,
    orderId: hist.orderId || hist.orderNo,
    orderProductId: hist.orderProductId,
    vendorItemId: hist.vendorItemId || hist.optionId,
    optionId: hist.optionId,
    vendorName: hist.vendorName,
    productName: hist.vendorProductName,
    receiverName: hist.receiverName,
    courier: hist.courier,
    trackingNo: hist.trackingNo,
    sourceFile: `AdminPlus:${accountLabel || hist.accountId || "pending"}`,
    raw: { adminplusOrderCode: hist.adminplusOrderCode, customerOrderCode: hist.customerOrderCode },
  } as Record<string, unknown>;
}




async function adminplusFindOrderForHistory(
  env: Env,
  account: AdminPlusCredentialAccount,
  hist: AdminPlusPurchaseHistoryRow,
) {
  const customerCode = String(hist.customerOrderCode || "").trim();
  const adminplusOrderCode = String(hist.adminplusOrderCode || "").trim();

  if (customerCode) {
    const byCustomer = await adminplusFindOrderByCustomerCode(env, account, customerCode);
    if (byCustomer.ok && byCustomer.found) return byCustomer;
  }

  if (adminplusOrderCode) {
    const result = await adminplusRequest(env, account, "GET", "/v1/seller/orders", { keyword: adminplusOrderCode, limit: 100 });
    if (!result.ok) return { ok: false, found: false, adminplusOrderCode: "", message: diagnosticMessage(result.data), result };
    const data = objectRecord(objectRecord(result.data).data);
    const orders = asArray(data.orders).map((value) => objectRecord(value));
    const exact = orders.find((order) => String(order.order_code || order.orderCode || "").trim() === adminplusOrderCode);
    if (exact) return { ok: true, found: true, adminplusOrderCode, order: exact, result };
  }

  // keyword 검색이 customer_order_code를 색인하지 않는 계정을 위해 최근 주문 페이지를 직접 스캔합니다.
  let cursor = "";
  let scanned = 0;
  for (let page = 0; page < 8; page += 1) {
    const query: Record<string, string | number> = { limit: 500 };
    if (cursor) query.cursor = cursor;
    const result = await adminplusRequest(env, account, "GET", "/v1/seller/orders", query);
    if (!result.ok) break;
    const data = objectRecord(objectRecord(result.data).data);
    const orderRows = [
      ...asArray(data.orders),
      ...asArray(data.datas),
      ...asArray(data.items),
    ].map((value) => objectRecord(value));
    scanned += orderRows.length;
    const exact = orderRows.find((order) => {
      const orderCode = adminplusOrderCodeFromObject(order);
      if (adminplusOrderCode && orderCode === adminplusOrderCode) return true;
      if (!customerCode) return false;
      const direct = String(order.customer_order_code || order.customerOrderCode || "").trim();
      return direct === customerCode || adminplusOrderProducts(order).some((product) => String(product.customer_order_code || product.customerOrderCode || "").trim() === customerCode);
    });
    if (exact) {
      return {
        ok: true,
        found: true,
        adminplusOrderCode: adminplusOrderCodeFromObject(exact) || adminplusOrderCode,
        order: exact,
        result,
        matchSource: "recent_orders_scan",
        scanned,
      };
    }
    cursor = data.has_more ? String(data.next_cursor || "") : "";
    if (!cursor) break;
  }

  return { ok: true, found: false, adminplusOrderCode: "", message: `발주이력의 customer_order_code/order_code로 AdminPlus 주문을 찾지 못했습니다. 최근 주문 ${scanned}건까지 재검색했습니다.`, scanned };
}

function adminplusCurrentOrderStatus(order: Record<string, unknown>) {
  return String(
    order.status || order.order_status || order.orderStatus || order.state || order.order_state || order.orderState || ""
  ).trim();
}


function adminplusMarketplacePreparingKey(channel: unknown, orderNo: unknown, optionId: unknown) {
  return `${String(channel || "").trim()}|${String(orderNo || "").trim()}|${String(optionId || "").trim()}`;
}

function adminplusMarketplacePreparingMatch(rows: Array<Record<string, unknown>>, channel: unknown, orderNo: unknown, optionId: unknown) {
  const ch = String(channel || "").trim();
  const no = String(orderNo || "").trim();
  const opt = String(optionId || "").trim();
  return rows.find((row) =>
    String(row.channel || "").trim() === ch &&
    String(row.orderNo || "").trim() === no &&
    (!opt || String(row.optionId || row.vendorItemId || "").trim() === opt)
  );
}

function adminplusParseCustomerOrderCode(value: unknown) {
  const code = String(value || "").trim();
  const match = code.match(/^B2B-([CT])-(.+)-([^-]+)$/);
  if (!match) return { channel: "", orderNo: "", optionId: "" };
  return { channel: match[1] === "T" ? "토스" : "쿠팡", orderNo: match[2], optionId: match[3] };
}

function adminplusRelinkText(value: unknown) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function adminplusRelinkPhone(value: unknown) {
  const digits = adminplusNormalizePhone(value);
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

function adminplusRelinkAddressPrefix2(value: unknown) {
  const normalized = String(value || "").normalize("NFKC").toLowerCase().trim();
  if (!normalized) return "";
  return normalized
    .replace(/[(),[\]{}]/g, " ")
    .replace(/[^0-9a-z가-힣\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function adminplusRelinkOrderReceiver(order: Record<string, unknown>) {
  const nested = objectRecord(order.data);
  return {
    name: firstText(order, ["receiver_name","receiverName","recipient_name","recipientName","receiver.name","recipient.name"])
      || firstText(nested, ["receiver_name","receiverName","recipient_name","recipientName","receiver.name","recipient.name"]),
    phone: firstText(order, ["receiver_hp","receiver_tel","receiverPhone","recipientPhone","receiver.phone","receiver.mobile","recipient.phone","recipient.mobile"])
      || firstText(nested, ["receiver_hp","receiver_tel","receiverPhone","recipientPhone","receiver.phone","receiver.mobile","recipient.phone","recipient.mobile"]),
    address: firstText(order, ["address","receiver_address","receiverAddress","shipping_address","shippingAddress","receiver.address","recipient.address"])
      || firstText(nested, ["address","receiver_address","receiverAddress","shipping_address","shippingAddress","receiver.address","recipient.address"]),
  };
}

function adminplusRelinkOrderProductEvidence(order: Record<string, unknown>) {
  const products = adminplusOrderProducts(order);
  const names = products.map((product) => firstText(product, ["product_string","product_name","productName","name","item_name","itemName"])).filter(Boolean);
  const qty = products.reduce((sum, product) => sum + Math.max(0, Number(firstText(product, ["qty","quantity","count"]) || 0) || 0), 0);
  return { names, qty };
}

function adminplusManualRelinkCandidate(
  market: Record<string, unknown>,
  order: Record<string, unknown>,
  account: AdminPlusCredentialAccount,
) {
  const marketName = adminplusRelinkText(market.receiverName);
  const marketPhone = adminplusRelinkPhone(market.receiverPhone);
  const marketAddressPrefix2 = adminplusRelinkAddressPrefix2(market.address);
  const marketProduct = adminplusRelinkText(market.productName || market.vendorProductName || market.optionName);
  const marketQty = Math.max(0, Number(market.qty || market.quantity || 0) || 0);

  const receiver = adminplusRelinkOrderReceiver(order);
  const orderName = adminplusRelinkText(receiver.name);
  const orderPhone = adminplusRelinkPhone(receiver.phone);
  const orderAddressPrefix2 = adminplusRelinkAddressPrefix2(receiver.address);
  const product = adminplusRelinkOrderProductEvidence(order);
  const orderProducts = product.names.map(adminplusRelinkText).filter(Boolean);

  const receiverMatched = Boolean(marketName && orderName && marketName === orderName);
  if (!receiverMatched) return { eligible: false, score: 0, reason: "수취인 불일치" };

  const phoneMatched = Boolean(marketPhone && orderPhone && marketPhone === orderPhone);
  if (!phoneMatched) return { eligible: false, score: 0, reason: "수취인 연락처 불일치" };

  const addressPrefixMatched = Boolean(
    marketAddressPrefix2 &&
    orderAddressPrefix2 &&
    marketAddressPrefix2 === orderAddressPrefix2
  );
  if (!addressPrefixMatched) return { eligible: false, score: 0, reason: "주소 앞 2단어 불일치" };

  // R7.1: 상품/수량은 필수 차단조건이 아니라 운영 진단용 보조증거입니다.
  const productMatched = Boolean(marketProduct && orderProducts.some((name) =>
    name === marketProduct || name.includes(marketProduct) || marketProduct.includes(name)
  ));
  const qtyMatched = marketQty > 0 && product.qty > 0 ? marketQty === product.qty : null;

  const score = 10 + (productMatched ? 2 : 0) + (qtyMatched === true ? 1 : 0);
  return {
    eligible: true,
    score,
    reason: "수취인·연락처·주소2단어 수동발주 재매칭",
    evidence: {
      accountId: account.id,
      receiverName: true,
      phoneMatched: true,
      addressPrefixMatched: true,
      addressPrefix2: marketAddressPrefix2,
      productMatched,
      qtyMatched,
    },
  };
}

async function adminplusCurrentMarketplacePreparingOrders(env: Env) {
  const rows: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  let coupangRows = 0;
  let tossRows = 0;

  if (liveExecutionAllowed(env) && coupangOrdersPath(env)) {
    const today = new Date();
    const days = Array.from({ length: 8 }, (_v, index) => {
      const date = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);
      return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    });
    const body: PreviewBody = { channel: "쿠팡", manual: true, query: { status: "INSTRUCT", maxPerPage: 50, maxPages: 10 } };
    for (const day of days) {
      const result = await collectCoupangOrdersForDayStatus(env, body, coupangOrdersPath(env), day, "INSTRUCT", 10);
      if (!result.ok) {
        errors.push({ channel: "쿠팡", stage: "market_preparing_fetch", day, reason: diagnosticMessage(result.data) || `HTTP ${result.status}` });
        continue;
      }
      const live = normalizedOrdersFromExternal(result.data, "쿠팡").map((value) => ({ ...objectRecord(value), channel: "쿠팡", marketplacePreparingStatus: "INSTRUCT" }));
      rows.push(...live); coupangRows += live.length;
    }
  }

  if (liveExecutionAllowed(env) && configuredPath(env.TOSS_ORDERS_PATH, TOSS_DEFAULT_ORDERS_PATH)) {
    const path = configuredPath(env.TOSS_ORDERS_PATH, TOSS_DEFAULT_ORDERS_PATH);
    const range = defaultCollectDateRange(31);
    let cursor = "";
    for (let page = 0; page < 20; page += 1) {
      const query: Record<string, string | number> = { startDate: range.startDate, endDate: range.endDate, limit: 50, status: "PREPARING_PRODUCT" };
      if (cursor) query.nextCursor = cursor;
      const result = await tossRequest(env, "GET", path, query);
      if (!result.ok) {
        errors.push({ channel: "토스", stage: "market_preparing_fetch", reason: diagnosticMessage(result.data) || `HTTP ${result.status}` });
        break;
      }
      const live = normalizedOrdersFromExternal(result.data, "토스")
        .filter((value) => { const status = String(objectRecord(value).status || "").trim().toUpperCase(); return !status || status === "PREPARING_PRODUCT"; })
        .map((value) => ({ ...objectRecord(value), channel: "토스", marketplacePreparingStatus: "PREPARING_PRODUCT" }));
      rows.push(...live); tossRows += live.length;
      cursor = tossNextCursor(result.data);
      if (!cursor) break;
    }
  }

  const deduped = Array.from(new Map(rows.map((row) => [
    `${String(row.channel || "")}|${String(row.orderProductId || row.shipmentBoxId || "")}|${adminplusMarketplacePreparingKey(row.channel, row.orderNo, row.optionId || row.vendorItemId)}`, row
  ])).values());
  return { rows: deduped, coupangRows, tossRows, total: deduped.length, errors };
}

async function adminplusRecoverShipmentFromCurrentOrders(
  env: Env,
  accounts: AdminPlusCredentialAccount[],
  history: AdminPlusPurchaseHistoryRow[],
  pendingRows: Map<string, Record<string, unknown>>,
  accountLabels: Map<string, string>,
  marketplacePreparingRows: Array<Record<string, unknown>>,
) {
  const historyByCustomer = new Map<string, AdminPlusPurchaseHistoryRow>();
  const historyByOrderCode = new Map<string, AdminPlusPurchaseHistoryRow>();
  for (const hist of history) {
    if (hist.shipmentUploadedAt || hist.operatorResolvedAt || !adminplusHistorySubmitted(hist)) continue;
    if (!adminplusMarketplacePreparingMatch(marketplacePreparingRows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId)) continue;
    const customer = String(hist.customerOrderCode || "").trim();
    const orderCode = String(hist.adminplusOrderCode || "").trim();
    if (customer) historyByCustomer.set(`${hist.accountId}|${customer}`, hist);
    if (orderCode) historyByOrderCode.set(`${hist.accountId}|${orderCode}`, hist);
  }

  let scannedOrders = 0;
  let shipmentEvidenceOrders = 0;
  let matchedHistory = 0;
  let manualRelinkMatched = 0;
  let manualRelinkAmbiguous = 0;
  let manualRelinkRejected = 0;
  let unmatchedShipmentOrders = 0;
  let preShipmentOrders = 0;
  const accountResults: Record<string, unknown>[] = [];
  const diagnostics: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  const manualRelinkCandidates: Array<{
    account: AdminPlusCredentialAccount;
    order: Record<string, unknown>;
    orderCode: string;
    tracking: ReturnType<typeof adminplusTrackingResultForCustomer>;
    market: Record<string, unknown>;
    check: ReturnType<typeof adminplusManualRelinkCandidate>;
  }> = [];

  for (const account of accounts) {
    let cursor = "";
    let pages = 0;
    let accountScanned = 0;
    let accountEvidence = 0;
    let accountMatched = 0;
    for (let page = 0; page < 12; page += 1) {
      const query: Record<string, string | number> = { limit: 500 };
      if (cursor) query.cursor = cursor;
      let result: ExternalApiResult;
      try {
        result = await adminplusRequest(env, account, "GET", "/v1/seller/orders", query);
      } catch (error) {
        errors.push({ accountId: account.id, stage: "current_orders_fetch", reason: error instanceof Error ? error.message : String(error) });
        break;
      }
      if (!result.ok) {
        errors.push({ accountId: account.id, stage: "current_orders_fetch", reason: diagnosticMessage(result.data) });
        break;
      }
      pages += 1;
      const data = objectRecord(objectRecord(result.data).data);
      const orders = [...asArray(data.orders), ...asArray(data.datas), ...asArray(data.items)].map((value) => objectRecord(value));
      scannedOrders += orders.length;
      accountScanned += orders.length;

      for (const order of orders) {
        const orderCode = adminplusOrderCodeFromObject(order);
        const customerCodes = Array.from(new Set([
          adminplusCustomerCodeFromObject(order),
          ...adminplusOrderProducts(order).map((product) => String(product.customer_order_code || product.customerOrderCode || "").trim()),
        ].filter(Boolean)));

        let hist: AdminPlusPurchaseHistoryRow | undefined;
        for (const customerCode of customerCodes) {
          hist = historyByCustomer.get(`${account.id}|${customerCode}`);
          if (hist) break;
        }
        if (!hist && orderCode) hist = historyByOrderCode.get(`${account.id}|${orderCode}`);

        if (!hist) {
          for (const customerCode of customerCodes) {
            const parsed = adminplusParseCustomerOrderCode(customerCode);
            if (!parsed.channel || !parsed.orderNo) continue;
            const market = adminplusMarketplacePreparingMatch(marketplacePreparingRows, parsed.channel, parsed.orderNo, parsed.optionId);
            if (!market) continue;
            const synthetic: AdminPlusPurchaseHistoryRow = {
              id: `market-reconcile-${account.id}-${customerCode}`,
              sourceKey: adminplusHistoryKey(parsed.channel, parsed.orderNo, parsed.optionId),
              accountId: account.id, vendorName: account.vendorName, channel: parsed.channel, orderNo: parsed.orderNo, optionId: parsed.optionId,
              customerOrderCode: customerCode, adminplusOrderCode: orderCode, submittedAt: new Date().toISOString(),
              marketplacePreparingAt: new Date().toISOString(),
              shipmentBoxId: String(market.shipmentBoxId || ""), orderId: String(market.marketplaceOrderId || market.orderId || parsed.orderNo),
              orderProductId: String(market.orderProductId || ""), vendorItemId: String(market.vendorItemId || market.optionId || parsed.optionId),
              vendorProductName: String(market.productName || ""), receiverName: String(market.receiverName || ""),
            };
            history.push(synthetic); hist = synthetic; break;
          }
        }

        const tracking = hist
          ? adminplusTrackingResultForCustomer(order, String(hist.customerOrderCode || customerCodes[0] || ""))
          : adminplusTrackingResultForCustomer(order, customerCodes[0] || "");
        if (!tracking.complete) {
          const status = adminplusCurrentOrderStatus(order).toLowerCase();
          if (status && /draft|pending|unpaid|입금전|주문접수/.test(status)) preShipmentOrders += 1;
          continue;
        }

        shipmentEvidenceOrders += 1;
        accountEvidence += 1;
        if (!hist) {
          const candidates = marketplacePreparingRows
            .map((market) => ({ market, check: adminplusManualRelinkCandidate(market, order, account) }))
            .filter((row) => row.check.eligible);
          if (candidates.length) {
            for (const candidate of candidates) manualRelinkCandidates.push({ account, order, orderCode, tracking, market: candidate.market, check: candidate.check });
          } else {
            manualRelinkRejected += 1;
          }
          continue;
        }
        const market = adminplusMarketplacePreparingMatch(marketplacePreparingRows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId);
        if (!market) continue;
        hist.adminplusOrderCode = hist.adminplusOrderCode || orderCode || "";
        hist.marketplacePreparingAt = hist.marketplacePreparingAt || new Date().toISOString();
        hist.shipmentBoxId = String(market.shipmentBoxId || hist.shipmentBoxId || "");
        hist.orderId = String(market.marketplaceOrderId || market.orderId || hist.orderId || hist.orderNo || "");
        hist.orderProductId = String(market.orderProductId || hist.orderProductId || "");
        hist.vendorItemId = String(market.vendorItemId || market.optionId || hist.vendorItemId || hist.optionId || "");
        hist.courier = tracking.courier;
        hist.trackingNo = tracking.trackingNo;
        const key = String(hist.sourceKey || adminplusHistoryKey(hist.channel, hist.orderNo, hist.optionId));
        pendingRows.set(key, adminplusShipmentRowFromHistory(hist, accountLabels.get(account.id) || account.label));
        matchedHistory += 1;
        accountMatched += 1;
      }

      cursor = data.has_more ? String(data.next_cursor || "") : "";
      if (!cursor) break;
    }
    accountResults.push({ accountId: account.id, vendorName: account.vendorName, pages, scannedOrders: accountScanned, shipmentEvidenceOrders: accountEvidence, matchedHistory: accountMatched });
  }

  const byMarket = new Map<string, typeof manualRelinkCandidates>();
  const byAdmin = new Map<string, typeof manualRelinkCandidates>();
  for (const candidate of manualRelinkCandidates) {
    const marketKey = adminplusMarketplacePreparingKey(candidate.market.channel, candidate.market.orderNo, candidate.market.optionId || candidate.market.vendorItemId);
    const adminKey = `${candidate.account.id}|${candidate.orderCode || adminplusCustomerCodeFromObject(candidate.order) || JSON.stringify(candidate.order).slice(0,120)}`;
    byMarket.set(marketKey, [...(byMarket.get(marketKey) || []), candidate]);
    byAdmin.set(adminKey, [...(byAdmin.get(adminKey) || []), candidate]);
  }

  for (const [marketKey, candidates] of byMarket.entries()) {
    const uniqueForMarket = candidates.length === 1 ? candidates[0] : undefined;
    if (!uniqueForMarket) {
      manualRelinkAmbiguous += 1;
      diagnostics.push({ stage: "manual_order_relink_ambiguous", marketKey, candidateCount: candidates.length, reason: "현재 상품준비중 주문에 맞는 AdminPlus 송장 주문이 2건 이상이라 자동등록을 보류합니다." });
      continue;
    }
    const adminKey = `${uniqueForMarket.account.id}|${uniqueForMarket.orderCode || adminplusCustomerCodeFromObject(uniqueForMarket.order) || JSON.stringify(uniqueForMarket.order).slice(0,120)}`;
    if ((byAdmin.get(adminKey) || []).length !== 1) {
      manualRelinkAmbiguous += 1;
      diagnostics.push({ stage: "manual_order_relink_ambiguous", marketKey, candidateCount: (byAdmin.get(adminKey) || []).length, reason: "하나의 AdminPlus 주문이 여러 마켓 주문 후보와 일치하여 자동등록을 보류합니다." });
      continue;
    }

    const { account, orderCode, tracking, market, check } = uniqueForMarket;
    const parsedOption = String(market.optionId || market.vendorItemId || "").trim();
    const syntheticCustomerCode = adminplusCustomerOrderCode({ channel: String(market.channel || ""), orderNo: String(market.orderNo || ""), optionId: parsedOption });
    const synthetic: AdminPlusPurchaseHistoryRow = {
      id: `manual-relink-${account.id}-${String(orderCode || syntheticCustomerCode || Date.now())}`,
      sourceKey: adminplusHistoryKey(String(market.channel || ""), String(market.orderNo || ""), parsedOption),
      accountId: account.id, vendorName: account.vendorName,
      channel: String(market.channel || ""), orderNo: String(market.orderNo || ""), optionId: parsedOption,
      customerOrderCode: syntheticCustomerCode, adminplusOrderCode: orderCode,
      submittedAt: new Date().toISOString(), marketplacePreparingAt: new Date().toISOString(),
      shipmentBoxId: String(market.shipmentBoxId || ""),
      orderId: String(market.marketplaceOrderId || market.orderId || market.orderNo || ""),
      orderProductId: String(market.orderProductId || ""),
      vendorItemId: String(market.vendorItemId || market.optionId || parsedOption),
      vendorProductName: String(market.productName || ""), receiverName: String(market.receiverName || ""),
      courier: tracking.courier, trackingNo: tracking.trackingNo,
    };
    history.push(synthetic);
    const key = String(synthetic.sourceKey || adminplusHistoryKey(synthetic.channel, synthetic.orderNo, synthetic.optionId));
    pendingRows.set(key, adminplusShipmentRowFromHistory(synthetic, accountLabels.get(account.id) || account.label));
    manualRelinkMatched += 1;
    matchedHistory += 1;
    unmatchedShipmentOrders = Math.max(0, unmatchedShipmentOrders - 1);
    diagnostics.push({ accountId: account.id, orderCode, stage: "manual_order_safe_relink", marketKey, score: check.score, evidence: check.evidence });
  }

  unmatchedShipmentOrders += Math.max(0, shipmentEvidenceOrders - matchedHistory);

  return { scannedOrders, shipmentEvidenceOrders, matchedHistory, manualRelinkMatched, manualRelinkAmbiguous, manualRelinkRejected, unmatchedShipmentOrders, preShipmentOrders, accountResults, diagnostics: diagnostics.slice(0,100), errors };
}

function adminplusLegacyShipmentCandidate(hist: AdminPlusPurchaseHistoryRow, activeAccountIds: Set<string>) {
  if (hist.shipmentUploadedAt || hist.operatorResolvedAt) return { eligible: false, reason: hist.shipmentUploadedAt ? "이미 송장등록 완료" : "운영자 확인완료" };
  if (!activeAccountIds.has(String(hist.accountId || ""))) return { eligible: false, reason: "비활성/미연결 계정" };
  if (!adminplusHistorySubmitted(hist)) return { eligible: false, reason: "AdminPlus 주문등록 이력 없음" };
  if (String(hist.trackingNo || "").trim() && String(hist.courier || "").trim()) return { eligible: false, reason: "송장정보 이미 보유 - 직접조회 불필요" };
  if (!hist.customerOrderCode && !hist.adminplusOrderCode) return { eligible: false, reason: "customer_order_code/order_code 없음" };
  const paymentCompleted = String(hist.paymentStatus || "") === "완료" || Boolean(String(hist.paymentCompletedAt || "").trim());
  const marketplacePrepared = Boolean(String(hist.marketplacePreparingAt || "").trim());
  if (!paymentCompleted && !marketplacePrepared) return { eligible: false, reason: "입금전/사전배송 단계 - 현재 AdminPlus 송장보유 주문 스캔에서만 회수" };
  return { eligible: true, reason: paymentCompleted ? "결제완료 주문 보조 직접조회" : "상품준비중 주문 보조 직접조회" };
}

async function adminplusRecoverMissingShipmentTracking(
  env: Env,
  accounts: AdminPlusCredentialAccount[],
  history: AdminPlusPurchaseHistoryRow[],
  pendingRows: Map<string, Record<string, unknown>>,
  accountLabels: Map<string, string>,
) {
  const active = new Set(accounts.map((account) => account.id));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const errors: Record<string, unknown>[] = [];
  const diagnostics: Record<string, unknown>[] = [];
  let checked = 0;
  let recovered = 0;
  let orderNotFound = 0;
  let trackingIncomplete = 0;

  const candidateDiagnostics = { totalHistory: history.length, eligible: 0, skippedUploaded: 0, skippedAccount: 0, skippedTrackingReady: 0, skippedNoOrderKey: 0, skippedState: 0 };
  const candidates = history.filter((hist) => {
    const check = adminplusLegacyShipmentCandidate(hist, active);
    if (check.eligible) { candidateDiagnostics.eligible += 1; return true; }
    if (hist.shipmentUploadedAt || hist.operatorResolvedAt) candidateDiagnostics.skippedUploaded += 1;
    else if (!active.has(String(hist.accountId || ""))) candidateDiagnostics.skippedAccount += 1;
    else if (String(hist.trackingNo || "").trim() && String(hist.courier || "").trim()) candidateDiagnostics.skippedTrackingReady += 1;
    else if (!hist.customerOrderCode && !hist.adminplusOrderCode) candidateDiagnostics.skippedNoOrderKey += 1;
    else candidateDiagnostics.skippedState += 1;
    return false;
  }).slice(-300);

  for (const hist of candidates) {
    const key = String(hist.sourceKey || adminplusHistoryKey(hist.channel, hist.orderNo, hist.optionId));
    const existing = pendingRows.get(key);
    if (existing && String(existing.trackingNo || "").trim() && String(existing.courier || "").trim()) continue;
    const account = accountById.get(String(hist.accountId || ""));
    if (!account) continue;
    checked += 1;
    try {
      const found = await adminplusFindOrderForHistory(env, account, hist);
      if (!found.ok || !found.found || !found.order) {
        orderNotFound += 1;
        diagnostics.push({
          accountId: account.id,
          vendorName: account.vendorName,
          channel: hist.channel,
          orderNo: hist.orderNo,
          optionId: hist.optionId,
          customerOrderCode: hist.customerOrderCode,
          adminplusOrderCode: hist.adminplusOrderCode,
          stage: "order_lookup",
          reason: found.message || "AdminPlus 주문 미조회",
          scanned: Number(objectRecord(found).scanned || 0) || 0,
        });
        continue;
      }
      const tracking = adminplusTrackingResultForCustomer(objectRecord(found.order), String(hist.customerOrderCode || ""));
      if (!tracking.complete) {
        trackingIncomplete += 1;
        diagnostics.push({
          accountId: account.id,
          vendorName: account.vendorName,
          channel: hist.channel,
          orderNo: hist.orderNo,
          optionId: hist.optionId,
          customerOrderCode: hist.customerOrderCode,
          adminplusOrderCode: found.adminplusOrderCode || hist.adminplusOrderCode,
          stage: "tracking_parse",
          matchSource: found.matchSource || "",
          reason: tracking.reason || "송장정보 미완성",
          trackingRows: adminplusTrackingPairsFromOrder(objectRecord(found.order), String(hist.customerOrderCode || "")).slice(0, 10),
          deepTrackingHint: {
            courier: adminplusTrackingText(objectRecord(found.order), ["shipping_company","shippingCompany","delivery_company","deliveryCompany","invoice_company","invoiceCompany","invoice_company_name","invoiceCompanyName","shipment_company","shipmentCompany","logistics_company","logisticsCompany","delivery_corp","deliveryCorp"]),
            trackingNo: adminplusTrackingText(objectRecord(found.order), ["tracking_number","trackingNumber","invoice_number","invoiceNumber","invoice_no","invoiceNo","waybill_no","waybillNo","delivery_invoice_no","deliveryInvoiceNo","shipment_number","shipmentNumber","tracking_code","trackingCode","shipping_tracking_number","shippingTrackingNumber"]),
          },
        });
        continue;
      }
      hist.adminplusOrderCode = hist.adminplusOrderCode || found.adminplusOrderCode || "";
      hist.courier = tracking.courier;
      hist.trackingNo = tracking.trackingNo;
      pendingRows.set(key, adminplusShipmentRowFromHistory(hist, accountLabels.get(account.id) || account.label));
      recovered += 1;
    } catch (error) {
      errors.push({ accountId: account.id, channel: hist.channel, orderNo: hist.orderNo, customerOrderCode: hist.customerOrderCode, stage: "shipment_direct_reconcile", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    checked,
    recovered,
    orderNotFound,
    trackingIncomplete,
    errors,
    diagnostics: diagnostics.slice(0, 100),
    candidateDiagnostics,
  };
}

async function adminplusRefreshCoupangShipmentIdentifiers(
  env: Env,
  rows: Array<Record<string, unknown>>,
): Promise<{
  rows: Array<Record<string, unknown>>;
  refreshed: number;
  liveRows: number;
  errors: Array<Record<string, unknown>>;
}> {
  const targets = rows.filter((row) => String(row.channel || "") === "쿠팡");
  if (!targets.length || !liveExecutionAllowed(env) || !coupangOrdersPath(env)) {
    return { rows, refreshed: 0, liveRows: 0, errors: [] as Record<string, unknown>[] };
  }

  const today = new Date();
  const days = Array.from({ length: 8 }, (_v, index) => {
    const date = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  });
  const liveRows: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  const body: PreviewBody = { channel: "쿠팡", manual: true, query: { status: "INSTRUCT", maxPerPage: 50, maxPages: 10 } };

  for (const day of days) {
    const result = await collectCoupangOrdersForDayStatus(env, body, coupangOrdersPath(env), day, "INSTRUCT", 10);
    if (!result.ok) {
      errors.push({ stage: "coupang_instruct_refresh", day, reason: diagnosticMessage(result.data) || `HTTP ${result.status}` });
      continue;
    }
    liveRows.push(...normalizedOrdersFromExternal(result.data, "쿠팡").map((row) => objectRecord(row)));
  }

  let refreshed = 0;
  const nextRows = rows.map((row) => {
    if (String(row.channel || "") !== "쿠팡") return row;
    const shipmentBoxId = String(row.shipmentBoxId || "").trim();
    const orderNo = String(row.orderNo || "").trim();
    const optionId = String(row.optionId || row.vendorItemId || "").trim();

    const match = liveRows.find((candidate) => shipmentBoxId && String(candidate.shipmentBoxId || "") === shipmentBoxId)
      || liveRows.find((candidate) =>
        orderNo &&
        String(candidate.orderNo || "") === orderNo &&
        (!optionId || String(candidate.vendorItemId || candidate.optionId || "") === optionId)
      );
    if (!match) return { ...row, coupangInstructMatched: false };

    const updated: Record<string, unknown> = {
      ...row,
      shipmentBoxId: String(match.shipmentBoxId || row.shipmentBoxId || ""),
      orderId: String(match.marketplaceOrderId || match.orderId || row.orderId || row.orderNo || ""),
      vendorItemId: String(match.vendorItemId || match.optionId || row.vendorItemId || row.optionId || ""),
      coupangInstructMatched: true,
    };
    if (
      updated.shipmentBoxId !== row.shipmentBoxId ||
      updated.orderId !== row.orderId ||
      updated.vendorItemId !== row.vendorItemId
    ) refreshed += 1;
    return updated;
  });

  return { rows: nextRows, refreshed, liveRows: liveRows.length, errors };
}

async function adminplusShipmentRun(env: Env, payload: Record<string, unknown>, dryRun = false) {
  const config = adminplusAutomationConfig(payload.adminplusAutomation);
  const accounts = adminplusAccounts(env).filter((account) => account.enabled && (adminplusRuleForAccount(config, account)?.enabled !== false) && adminplusRuleForAccount(config, account)?.autoShipment !== false);
  const activeAccountIds = new Set(accounts.map((account) => account.id));
  const accountLabels = new Map(accounts.map((account) => [account.id, account.label]));
  const history = asArray(payload.adminplusPurchaseHistory).map((v) => objectRecord(v)) as AdminPlusPurchaseHistoryRow[];
  // V248 R6: source of truth는 AdminPlus 전체주문이 아니라 마켓의 현재 상품준비중 목록입니다.
  const marketplacePreparing = await adminplusCurrentMarketplacePreparingOrders(env);

  // 현재 마켓 상품준비중 주문 중 송장을 이미 확보한 행만 등록후보입니다.
  const trackingReadyBefore = history.filter((row) =>
    !row.shipmentUploadedAt &&
    adminplusHistorySubmitted(row) &&
    String(row.trackingNo || "").trim() &&
    String(row.courier || "").trim() &&
    activeAccountIds.has(String(row.accountId || "")) &&
    Boolean(adminplusMarketplacePreparingMatch(marketplacePreparing.rows, row.channel, row.orderNo, row.optionId || row.vendorItemId))
  ).length;

  const historyByCustomerCode = new Map(history.filter((row) => row.customerOrderCode).map((row) => [String(row.customerOrderCode), row]));
  const lastShipmentMs = config.lastShipmentAt ? Date.parse(config.lastShipmentAt) : NaN;
  const sinceDefault = adminplusKstDateTime(Number.isFinite(lastShipmentMs) ? lastShipmentMs - 15 * 60 * 1000 : Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pendingRows = new Map<string, Record<string, unknown>>();
  const accountResults: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  const fetchErrors: Record<string, unknown>[] = [];
  const consistencyErrors: Record<string, unknown>[] = [];
  errors.push(...marketplacePreparing.errors);

  for (const account of accounts) {
    let cursor = "";
    let pages = 0;
    let found = 0;
    do {
      const query: Record<string, string | number> = { updated_since: sinceDefault, limit: 500 };
      if (cursor) query.cursor = cursor;
      let result: ExternalApiResult;
      try {
        result = await adminplusRequest(env, account, "GET", "/v1/seller/orders/changed", query);
      } catch (error) {
        const issue = { accountId: account.id, vendorName: account.vendorName, stage: "fetch", reason: error instanceof Error ? error.message : String(error) };
        fetchErrors.push(issue); errors.push(issue); break;
      }
      pages += 1;
      if (!result.ok) {
        const issue = { accountId: account.id, vendorName: account.vendorName, stage: "fetch", reason: diagnosticMessage(result.data) };
        fetchErrors.push(issue); errors.push(issue); break;
      }
      const data = objectRecord(objectRecord(result.data).data);
      const orders = asArray(data.orders).map((v) => objectRecord(v));
      for (const order of orders) {
        const products = adminplusOrderProducts(order);
        const customerCodes = Array.from(new Set([
          adminplusCustomerCodeFromObject(order),
          ...products.map((product) => String(product.customer_order_code || product.customerOrderCode || "").trim()),
        ].filter(Boolean)));

        for (const customerOrderCode of customerCodes) {
          const hist = historyByCustomerCode.get(customerOrderCode);
          if (!hist || hist.shipmentUploadedAt || hist.operatorResolvedAt || !adminplusHistorySubmitted(hist) || String(hist.accountId || "") !== account.id) continue;
          const market = adminplusMarketplacePreparingMatch(marketplacePreparing.rows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId);
          if (!market) continue;
          hist.marketplacePreparingAt = hist.marketplacePreparingAt || new Date().toISOString();
          hist.shipmentBoxId = String(market.shipmentBoxId || hist.shipmentBoxId || "");
          hist.orderId = String(market.marketplaceOrderId || market.orderId || hist.orderId || hist.orderNo || "");
          hist.orderProductId = String(market.orderProductId || hist.orderProductId || "");
          hist.vendorItemId = String(market.vendorItemId || market.optionId || hist.vendorItemId || hist.optionId || "");
          const tracking = adminplusTrackingResultForCustomer(order, customerOrderCode);
          if (!tracking.complete) {
            if (tracking.reason && tracking.reason !== "송장정보가 아직 없습니다.") {
              const issue = { accountId: account.id, vendorName: account.vendorName, stage: "tracking", customerOrderCode, reason: tracking.reason };
              consistencyErrors.push(issue); errors.push(issue);
            }
            continue;
          }
          hist.courier = tracking.courier;
          hist.trackingNo = tracking.trackingNo;
          const key = String(hist.sourceKey || adminplusHistoryKey(hist.channel, hist.orderNo, hist.optionId));
          pendingRows.set(key, adminplusShipmentRowFromHistory(hist, account.label));
          found += 1;
        }
      }
      cursor = data.has_more ? String(data.next_cursor || "") : "";
      if (pages >= 20) cursor = "";
    } while (cursor);
    accountResults.push({ accountId: account.id, vendorName: account.vendorName, pages, shipmentRows: found });
  }

  // V248 R5: 송장 source of truth는 과거 purchaseHistory가 아니라 현재 AdminPlus 주문 중 실제 송장증거(courier+trackingNo)입니다.
  const currentShipmentRecovery = await adminplusRecoverShipmentFromCurrentOrders(env, accounts, history, pendingRows, accountLabels, marketplacePreparing.rows);
  errors.push(...currentShipmentRecovery.errors);

  // 현재 마켓 상품준비중 주문에서만 보조 직접조회를 허용합니다. 과거/입금전/현재 비대상 주문은 조회하지 않습니다.
  const marketEligibleHistory = history.filter((hist) => Boolean(adminplusMarketplacePreparingMatch(marketplacePreparing.rows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId)));
  const directRecovery = await adminplusRecoverMissingShipmentTracking(env, accounts, marketEligibleHistory, pendingRows, accountLabels);
  errors.push(...directRecovery.errors);

  const preparingRetry = { attempted: 0, prepared: 0, alreadyPrepared: marketplacePreparing.total, failed: 0, errors: [] as Record<string, unknown>[] };

  pendingRows.clear();
  for (const hist of history) {
    if (hist.shipmentUploadedAt || hist.operatorResolvedAt || !adminplusHistorySubmitted(hist) || !hist.marketplacePreparingAt || !hist.trackingNo || !hist.courier || !activeAccountIds.has(String(hist.accountId || ""))) continue;
    if (!adminplusMarketplacePreparingMatch(marketplacePreparing.rows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId)) continue;
    const key = String(hist.sourceKey || adminplusHistoryKey(hist.channel, hist.orderNo, hist.optionId));
    pendingRows.set(key, adminplusShipmentRowFromHistory(hist, accountLabels.get(String(hist.accountId || "")) || "pending"));
  }

  const rawShipmentRows: Array<Record<string, unknown>> = Array.from(pendingRows.values()).map((row) => objectRecord(row));
  const refreshedCoupang = await adminplusRefreshCoupangShipmentIdentifiers(env, rawShipmentRows);
  const shipmentRows = refreshedCoupang.rows.filter((row) =>
    String(row.channel || "") !== "쿠팡" || row.coupangInstructMatched === true
  );
  const coupangUnmatched = refreshedCoupang.rows.filter((row) =>
    String(row.channel || "") === "쿠팡" && row.coupangInstructMatched !== true
  ).length;
  errors.push(...refreshedCoupang.errors);
  const canAdvanceWatermark = marketplacePreparing.errors.length === 0 && preparingRetry.errors.length === 0 && fetchErrors.length === 0 && consistencyErrors.length === 0 && directRecovery.errors.length === 0 && refreshedCoupang.errors.length === 0;
  if (dryRun || !shipmentRows.length) return {
    ok: errors.length === 0,
    dryRun,
    shipmentRows: shipmentRows.length,
    rows: shipmentRows.slice(0,100),
    accountResults,
    shipmentTargetSummary: {
      trackingReadyBefore,
      preparingRetryAttempted: preparingRetry.attempted,
      preparingRetryPrepared: preparingRetry.prepared,
      preparingAlreadyPrepared: preparingRetry.alreadyPrepared,
      preparingRetryFailed: preparingRetry.failed,
      registrationTarget: shipmentRows.length,
    },
    marketplacePreparing: { total: marketplacePreparing.total, coupangRows: marketplacePreparing.coupangRows, tossRows: marketplacePreparing.tossRows, keys: marketplacePreparing.rows.map((row) => adminplusMarketplacePreparingKey(row.channel, row.orderNo, row.optionId || row.vendorItemId)).filter(Boolean).slice(0,5000), errors: marketplacePreparing.errors },
    currentShipmentRecovery: {
      scannedOrders: currentShipmentRecovery.scannedOrders,
      shipmentEvidenceOrders: currentShipmentRecovery.shipmentEvidenceOrders,
      matchedHistory: currentShipmentRecovery.matchedHistory,
      unmatchedShipmentOrders: currentShipmentRecovery.unmatchedShipmentOrders,
      preShipmentOrders: currentShipmentRecovery.preShipmentOrders,
      accountResults: currentShipmentRecovery.accountResults,
      diagnostics: currentShipmentRecovery.diagnostics,
    },
    shipmentRecovery: {
      directChecked: directRecovery.checked,
      directRecovered: directRecovery.recovered,
      orderNotFound: directRecovery.orderNotFound,
      trackingIncomplete: directRecovery.trackingIncomplete,
      diagnostics: directRecovery.diagnostics,
      candidateDiagnostics: directRecovery.candidateDiagnostics,
    },
    coupangIdentifierRefresh: {
      refreshed: refreshedCoupang.refreshed,
      liveRows: refreshedCoupang.liveRows,
      unmatched: coupangUnmatched,
    },
    errors,
    canAdvanceWatermark,
    history,
  };

  const uploadResults: Record<string, unknown>[] = [];
  const succeededKeys = new Set<string>();
  for (const value of shipmentRows) {
    const row = objectRecord(value);
    const key = String(row.sourceKey || adminplusHistoryKey(row.channel, row.orderNo, row.optionId));
    const response = await shipmentUploadExecute(schedulerRequest({ rows: [row] }), env);
    const upload = await response.json() as Record<string, unknown>;
    const rowOk = upload.ok === true;
    uploadResults.push({ sourceKey: key, ok: rowOk, message: upload.message || "" });
    if (rowOk) succeededKeys.add(key);
    else errors.push({ sourceKey: key, channel: row.channel, orderNo: row.orderNo, stage: "marketplace_shipment", reason: String(upload.message || "송장등록 실패") });
  }

  const now = new Date().toISOString();
  history.forEach((row) => {
    const key = String(row.sourceKey || adminplusHistoryKey(row.channel, row.orderNo, row.optionId));
    if (succeededKeys.has(key)) row.shipmentUploadedAt = now;
  });
  return {
    ok: errors.length === 0,
    dryRun: false,
    shipmentRows: shipmentRows.length,
    succeeded: succeededKeys.size,
    accountResults,
    shipmentTargetSummary: {
      trackingReadyBefore,
      preparingRetryAttempted: preparingRetry.attempted,
      preparingRetryPrepared: preparingRetry.prepared,
      preparingAlreadyPrepared: preparingRetry.alreadyPrepared,
      preparingRetryFailed: preparingRetry.failed,
      registrationTarget: shipmentRows.length,
    },
    marketplacePreparing: { total: marketplacePreparing.total, coupangRows: marketplacePreparing.coupangRows, tossRows: marketplacePreparing.tossRows, keys: marketplacePreparing.rows.map((row) => adminplusMarketplacePreparingKey(row.channel, row.orderNo, row.optionId || row.vendorItemId)).filter(Boolean).slice(0,5000), errors: marketplacePreparing.errors },
    currentShipmentRecovery: {
      scannedOrders: currentShipmentRecovery.scannedOrders,
      shipmentEvidenceOrders: currentShipmentRecovery.shipmentEvidenceOrders,
      matchedHistory: currentShipmentRecovery.matchedHistory,
      unmatchedShipmentOrders: currentShipmentRecovery.unmatchedShipmentOrders,
      preShipmentOrders: currentShipmentRecovery.preShipmentOrders,
      accountResults: currentShipmentRecovery.accountResults,
      diagnostics: currentShipmentRecovery.diagnostics,
    },
    shipmentRecovery: {
      directChecked: directRecovery.checked,
      directRecovered: directRecovery.recovered,
      orderNotFound: directRecovery.orderNotFound,
      trackingIncomplete: directRecovery.trackingIncomplete,
      diagnostics: directRecovery.diagnostics,
      candidateDiagnostics: directRecovery.candidateDiagnostics,
    },
    coupangIdentifierRefresh: {
      refreshed: refreshedCoupang.refreshed,
      liveRows: refreshedCoupang.liveRows,
      unmatched: coupangUnmatched,
    },
    errors: errors.slice(0,100),
    canAdvanceWatermark,
    upload: { rows: uploadResults },
    history: history.slice(-5000),
  };
}

async function adminplusPurchaseEndpoint(request: Request, env: Env, dryRun: boolean) {
  const body = await readJson<PreviewBody>(request);
  const incoming = objectRecord(body.data);
  const serverPayload = await loadLatestSchedulerPayload(env);
  // 수동 발주 실행은 브라우저의 오래된 캐시가 서버 확정매핑/발주이력을 덮어쓰지 않도록
  // 서버 저장값을 source-of-truth로 사용합니다. 화면에서 바로 바꾼 자동화 토글/결제정책만 incoming을 허용합니다.
  const payload: Record<string, unknown> = { ...serverPayload, ...incoming };
  for (const protectedKey of ["mappings", "adminplusProductLinks", "adminplusPurchaseHistory", "tossOptionMaster", "tossOptionBridgeRows"]) {
    if (serverPayload[protectedKey] !== undefined) payload[protectedKey] = serverPayload[protectedKey];
  }
  if (Object.keys(objectRecord(incoming.adminplusAutomation)).length) {
    payload.adminplusAutomation = { ...objectRecord(serverPayload.adminplusAutomation), ...objectRecord(incoming.adminplusAutomation) };
  }
  const result = await adminplusPurchaseRun(env, payload, dryRun, "", true);
  if (!dryRun && result.history) {
    payload.adminplusPurchaseHistory = result.history;
    const config = adminplusAutomationConfig(payload.adminplusAutomation);
    payload.adminplusAutomation = { ...objectRecord(payload.adminplusAutomation), ...config, lastPurchaseAt: new Date().toISOString() };
    await saveLatestSchedulerPayload(env, payload);
  }
  const collectedText = Object.entries(result.collectedByChannel || {}).map(([channel, count]) => `${channel} ${count}건`).join(" · ");
  const baseMessage = dryRun
    ? `어드민플러스 발주·결제 사전검증: 수집 ${result.collectedRows || 0}건${collectedText ? ` (${collectedText})` : ""} / 후보 ${result.candidates}건 / 실행가능 ${result.ready}건`
    : `어드민플러스 발주·결제 실행: 수집 ${result.collectedRows || 0}건${collectedText ? ` (${collectedText})` : ""} · 후보 ${result.candidates}건 · 실행가능 ${result.ready}건 · 신규 ${result.created || 0}건 · 결제완료 ${result.paymentCompleted || 0}건 · 상품준비중 ${result.marketplacePreparing || 0}건`;
  return jsonResponse({ ok: result.ok, mode: dryRun ? "adminplus_purchase_preflight_v222_manual_queue" : "adminplus_purchase_execute_v222_manual_queue", summary: result, message: baseMessage }, { status: 200 });
}

async function adminplusPurchaseStatusEndpoint(request: Request, env: Env) {
  await readJson<PreviewBody>(request);
  const payload=await loadLatestSchedulerPayload(env);
  const rows=asArray(payload.adminplusPurchaseHistory).map((v)=>objectRecord(v)) as AdminPlusPurchaseHistoryRow[];
  const config=adminplusAutomationConfig(payload.adminplusAutomation);
  const accounts=adminplusAccounts(env).filter((account)=>account.enabled && (adminplusRuleForAccount(config,account)?.enabled!==false));
  const reconciliation=await adminplusReconcileRecordedPayments(env,accounts,rows);
  let preparing={attempted:0,prepared:0,alreadyPrepared:0,failed:0,errors:[] as Array<Record<string,unknown>>};
  const needsPreparing=rows.some((row)=>String(row.paymentStatus||"")==="완료"&&!row.marketplacePreparingAt);
  if(reconciliation.completed>0||needsPreparing){const currentPaid=await collectCurrentMarketplaceOrders(env); preparing=await adminplusEnsureMarketplacePreparing(env,rows,currentPaid.rows);}
  if(reconciliation.completed>0||preparing.prepared>0){payload.adminplusPurchaseHistory=rows.slice(-5000); await saveLatestSchedulerPayload(env,payload);}
  return jsonResponse({ok:reconciliation.errors.length===0&&preparing.errors.length===0,mode:"adminplus_purchase_status_v249_payment_reconcile",summary:{rows:rows.slice(-5000),count:rows.length,paymentReconciled:reconciliation.completed,paymentChecked:reconciliation.checked,marketplacePreparing:preparing.prepared,errors:[...reconciliation.errors,...preparing.errors].slice(0,100)},message:`어드민플러스 발주·결제 이력 ${rows.length}건 확인 · 외부결제 재확인 ${reconciliation.completed}건 · 상품준비중 전환 ${preparing.prepared}건`});
}

async function adminplusShipmentEndpoint(request: Request, env: Env, dryRun: boolean) {
  const body = await readJson<PreviewBody>(request);
  const payload = Object.keys(objectRecord(body.data)).length ? objectRecord(body.data) : await loadLatestSchedulerPayload(env);
  const result = await adminplusShipmentRun(env, payload, dryRun);
  if (!dryRun && result.history) {
    payload.adminplusPurchaseHistory = result.history;
    const config = adminplusAutomationConfig(payload.adminplusAutomation);
    payload.adminplusAutomation = { ...objectRecord(payload.adminplusAutomation), ...config, ...(result.canAdvanceWatermark ? { lastShipmentAt: new Date().toISOString() } : {}) };
    await saveLatestSchedulerPayload(env, payload);
  }
  const target = objectRecord(result.shipmentTargetSummary);
  const currentRecovery = objectRecord(result.currentShipmentRecovery);
  const recovery = objectRecord(result.shipmentRecovery);
  const refresh = objectRecord(result.coupangIdentifierRefresh);
  const candidate = objectRecord(recovery.candidateDiagnostics);
  const market = objectRecord(result.marketplacePreparing);
  const diag = ` · 마켓 현재 상품준비중 ${Number(market.total || 0)}건(쿠팡 ${Number(market.coupangRows || 0)} · 토스 ${Number(market.tossRows || 0)}) · AdminPlus 현재주문 ${Number(currentRecovery.scannedOrders || 0)}건 스캔 · 송장증거 ${Number(currentRecovery.shipmentEvidenceOrders || 0)}건 · B2B/기존매칭 ${Math.max(0, Number(currentRecovery.matchedHistory || 0) - Number(currentRecovery.manualRelinkMatched || 0))}건 · 수동발주 복구매칭 ${Number(currentRecovery.manualRelinkMatched || 0)}건 · 중복후보/확인필요 ${Number(currentRecovery.manualRelinkAmbiguous || 0)}건 · 송장보유 등록대상 ${Number(target.registrationTarget || 0)}건 · 보조 직접조회 ${Number(recovery.directRecovered || 0)}건/${Number(recovery.directChecked || 0)}건(후보 ${Number(candidate.eligible || 0)}건 · 주문미조회 ${Number(recovery.orderNotFound || 0)}건 · 송장미완성 ${Number(recovery.trackingIncomplete || 0)}건) · 현재 상품준비중 외 주문은 자동 제외`;
  return jsonResponse({
    ok: result.ok,
    mode: dryRun ? "adminplus_shipment_preflight_v229_reconcile" : "adminplus_shipment_sync_v229_reconcile",
    summary: result,
    message: dryRun
      ? `어드민플러스 송장 사전확인: 등록대상 ${result.shipmentRows}건${diag}`
      : `어드민플러스 송장 회수·마켓 등록: 대상 ${result.shipmentRows}건 · 성공 ${result.succeeded || 0}건${diag}`,
  }, { status: 200 });
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
  const stockId = cleanDigitsOnly(firstNonEmptyTextFromAny(merged, [
    "item.stockId",
    "stockId",
    "parent.stockId",
  ]));
  return { productId, optionId, stockId, optionCode, itemName, managementCode, productName, status };
}

function cleanDigitsOnly(value: unknown) {
  const text = displayText(value).trim();
  return text.replace(/[^0-9]/g, "");
}

function dedupeTossOptionMasterRows(rows: Array<Record<string, string>>) {
  // Toss 상품 상세의 stocks[].id(stockId)와 stocks[].itemId(productItemId)는 서로 다른 값입니다.
  // productItemId를 canonical 옵션ID로 삼고, stockId/managementCode/itemName을 같은 행에 병합합니다.
  const byOptionId = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const optionId = cleanDigitsOnly(row.optionId);
    if (!optionId) continue;
    const current = byOptionId.get(optionId) || {};
    byOptionId.set(optionId, {
      ...current,
      productId: cleanDigitsOnly(row.productId) || current.productId || "",
      optionId,
      stockId: cleanDigitsOnly(row.stockId) || current.stockId || "",
      optionCode: displayText(row.optionCode) || current.optionCode || "",
      itemName: displayText(row.itemName) || current.itemName || "",
      managementCode: displayText(row.managementCode) || current.managementCode || "",
      productName: displayText(row.productName) || current.productName || "",
      status: displayText(row.status) || current.status || "",
    });
  }
  return Array.from(byOptionId.values()).filter((row) =>
    Boolean(row.optionId && (row.stockId || row.optionCode || row.managementCode || row.itemName)),
  );
}

function tossOptionNameFromStock(stock: Record<string, unknown>) {
  const direct = firstNonEmptyTextFromAny(stock, ["itemName", "optionName", "name"]);
  if (direct) return direct;
  const parts = asArray(stock.options).map((value) => {
    const option = objectRecord(value);
    return firstNonEmptyTextFromAny(option, ["valueName", "value", "name"]);
  }).filter(Boolean);
  return parts.join(" / ");
}

function tossProductOptionRowFromProductDetailStock(
  product: Record<string, unknown>,
  stock: Record<string, unknown>,
) {
  const productId = cleanDigitsOnly(firstNonEmptyTextFromAny(product, ["id", "productId"]));
  const optionId = cleanDigitsOnly(firstNonEmptyTextFromAny(stock, [
    "itemId",
    "productItemId",
    "productItem.id",
  ]));
  const stockId = cleanDigitsOnly(firstNonEmptyTextFromAny(stock, [
    "id",
    "stockId",
  ]));
  const managementCode = firstNonEmptyTextFromAny(stock, [
    "managementCode",
    "productItemManagementCode",
    "optionManagementCode",
  ]);
  const itemName = tossOptionNameFromStock(stock);
  const productName = firstNonEmptyTextFromAny(product, ["name", "productName", "sellerProductName"]);
  const optionCode = managementCode || itemName;
  const status = firstNonEmptyTextFromAny(stock, ["status.code", "status.label", "status", "isHide"]);
  return { productId, optionId, stockId, optionCode, itemName, managementCode, productName, status };
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
    // 상품 상세 stocks[]가 주문 API stockId와 실제 상품 옵션 ID(productItemId=itemId)의
    // 공식 bridge를 함께 제공합니다. 이 자료를 먼저 수집합니다.
    const detailResult = await tossJsonRequestWithToken(env, "GET", `/api/v3/shopping-fep/products/${productId}/v2`, {
      partnerName: env.TOSS_PARTNER_NAME || undefined,
    });
    diagnostics.push({
      step: `토스 상품상세 productId=${productId}`,
      status: detailResult.ok ? "정상" : "오류",
      detail: detailResult.ok ? `HTTP ${detailResult.status}, stockId→productItemId bridge 확인` : `HTTP ${detailResult.status}: ${diagnosticMessage(detailResult.data)}`,
    });
    if (detailResult.ok) {
      const detailSuccess = objectRecord(objectRecord(detailResult.data).success);
      const detailProduct = Object.keys(detailSuccess).length ? detailSuccess : product;
      for (const stock of asArray(detailProduct.stocks).map(objectRecord)) {
        optionRows.push(tossProductOptionRowFromProductDetailStock(detailProduct, stock));
      }
    }

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
    message: `토스 상품 API에서 상품 ${uniqueProducts.size}개, 옵션 ${rows.length}건을 자동 동기화했습니다. 주문 stockId → 실제 상품옵션ID(productItemId) 변환표를 함께 적용합니다.`,
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
  const baseAddress = firstText(row, [
    "receiverAddr1",
    "receiverAddress1",
    "addr1",
    "address1",
    "parent.receiverAddr1",
    "parent.receiverAddress1",
    "parent.addr1",
    "parent.address1",
    "parent.receiver.addr1",
    "parent.receiver.address1",
    "receiver.receiverAddr1",
    "receiver.addr1",
    "receiver.address1",
    "recipient.addr1",
    "recipient.address1",
    "shipmentBox.receiverAddr1",
    "shipmentBox.receiverAddress1",
    "shipmentBox.addr1",
    "shipmentBox.address1",
    "shipmentBox.receiver.receiverAddr1",
    "shipmentBox.receiver.addr1",
    "shipmentBox.receiver.address1",
    "shipmentBox.recipient.addr1",
    "shipmentBox.recipient.address1",
    "shipping.addr1",
    "shipping.address1",
    "delivery.addr1",
    "delivery.address1",
  ]);

  const directAddress = firstText(row, [
    "address",
    "fullAddress",
    "receiverAddress",
    "shippingAddress",
    "deliveryAddress",
    "recipientAddress",
    "parent.address",
    "parent.fullAddress",
    "parent.receiverAddress",
    "parent.shippingAddress",
    "parent.deliveryAddress",
    "parent.recipientAddress",
    "receiver.address",
    "receiver.fullAddress",
    "receiver.receiverAddress",
    "recipient.address",
    "recipient.fullAddress",
    "shipmentBox.address",
    "shipmentBox.fullAddress",
    "shipmentBox.receiverAddress",
    "shipmentBox.shippingAddress",
    "shipmentBox.deliveryAddress",
    "shipmentBox.recipientAddress",
    "shipmentBox.receiver.address",
    "shipmentBox.receiver.fullAddress",
    "shipmentBox.receiver.receiverAddress",
    "shipmentBox.recipient.address",
    "shipmentBox.recipient.fullAddress",
    "shipping.address",
    "shipping.fullAddress",
    "delivery.address",
    "delivery.fullAddress",
  ]);

  const detailAddress = firstText(row, [
    // 쿠팡 공식 필드 receiver.addr2 및 호환 필드
    "receiverAddr2",
    "receiverAddress2",
    "addr2",
    "address2",
    "parent.receiverAddr2",
    "parent.receiverAddress2",
    "parent.addr2",
    "parent.address2",
    "parent.receiver.addr2",
    "parent.receiver.address2",
    "receiver.receiverAddr2",
    "receiver.addr2",
    "receiver.address2",
    "recipient.addr2",
    "recipient.address2",
    "shipmentBox.receiverAddr2",
    "shipmentBox.receiverAddress2",
    "shipmentBox.addr2",
    "shipmentBox.address2",
    "shipmentBox.receiver.receiverAddr2",
    "shipmentBox.receiver.addr2",
    "shipmentBox.receiver.address2",
    "shipmentBox.recipient.addr2",
    "shipmentBox.recipient.address2",
    "shipping.addr2",
    "shipping.address2",
    "delivery.addr2",
    "delivery.address2",
    // 토스 및 기타 주문 API의 상세주소 필드
    "detailAddress",
    "detailedAddress",
    "addressDetail",
    "receiverDetailAddress",
    "recipientDetailAddress",
    "parent.detailAddress",
    "parent.detailedAddress",
    "parent.addressDetail",
    "parent.receiverDetailAddress",
    "parent.receiver.detailAddress",
    "parent.receiver.detailedAddress",
    "parent.receiver.addressDetail",
    "receiver.detailAddress",
    "receiver.detailedAddress",
    "receiver.addressDetail",
    "recipient.detailAddress",
    "recipient.detailedAddress",
    "recipient.addressDetail",
    "shipmentBox.detailAddress",
    "shipmentBox.detailedAddress",
    "shipmentBox.addressDetail",
    "shipmentBox.receiverDetailAddress",
    "shipmentBox.receiver.detailAddress",
    "shipmentBox.receiver.detailedAddress",
    "shipmentBox.receiver.addressDetail",
    "shipmentBox.recipient.detailAddress",
    "shipmentBox.recipient.detailedAddress",
    "shipmentBox.recipient.addressDetail",
    "shipping.detailAddress",
    "shipping.detailedAddress",
    "shipping.addressDetail",
    "delivery.detailAddress",
    "delivery.detailedAddress",
    "delivery.addressDetail",
  ]);

  // 기본주소에 괄호로 된 지번/건물명이 포함되어도 그 뒤 상세주소를 절대 버리지 않습니다.
  // directAddress가 addr1보다 더 긴 전체주소이면 joinAddressParts가 해당 값을 우선 보존합니다.
  return joinAddressParts(baseAddress, directAddress, detailAddress);
}

function normalizedOrdersFromExternal(data: unknown, channel: "쿠팡" | "토스") {
  return expandedOrderPayloadRows(data)
    // 다페이지 조회에서 최근 등록 상품이 500번째 뒤에 있어도 누락하지 않습니다.
    // API별 최대 페이지 제한 안에서 충분한 상한만 둡니다.
    .slice(0, 5000)
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
        marketplaceOrderId: channel === "쿠팡" ? firstText(row, [
          "orderId",
          "item.orderId",
          "parent.orderId",
          "marketplaceOrderId",
          "item.marketplaceOrderId",
          "parent.marketplaceOrderId",
        ]) : "",
        vendorItemId: channel === "쿠팡" ? firstText(row, [
          "vendorItemId",
          "item.vendorItemId",
          "parent.vendorItemId",
          "vendorItemNo",
          "item.vendorItemNo",
          "parent.vendorItemNo",
        ]) : "",
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
        statusUpdatedAt: firstText(row, [
          "statusUpdatedAt",
          "deliveryStatusUpdatedAt",
          "deliveryStatusChangedAt",
          "updatedAt",
          "modifiedAt",
          "shippedAt",
          "shippingAt",
          "departureAt",
          "departuredAt",
          "item.statusUpdatedAt",
          "item.deliveryStatusUpdatedAt",
          "item.updatedAt",
          "item.modifiedAt",
          "item.shippedAt",
          "parent.statusUpdatedAt",
          "parent.deliveryStatusUpdatedAt",
          "parent.updatedAt",
          "parent.modifiedAt",
          "parent.shippedAt",
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
        orderProductId: firstText(row, [
          "orderProductId",
          "orderItemId",
          "shipmentItemId",
          "item.orderProductId",
          "item.orderItemId",
          "item.shipmentItemId",
          "parent.orderProductId",
          "parent.orderItemId",
          "parent.shipmentItemId",
        ]),
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
      method: "GET",
      path: "/api/operation/mappings/load",
      purpose: "Load only the shared product mappings for PC/mobile synchronization",
    },
    {
      method: "POST",
      path: "/api/operation/mappings/upsert",
      purpose: "Merge mapping changes and deletions without overwriting other persistent settings",
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

function normalizeMappingChannel(value: unknown) {
  return displayText(value) === "토스" ? "토스" : "쿠팡";
}

function mappingRecordKey(value: unknown) {
  const row = asPlainRecord(value);
  const optionId = displayText(row.optionId).trim();
  return optionId ? `${normalizeMappingChannel(row.channel)}|${optionId}` : "";
}

function normalizeMappingRecord(value: unknown, fallbackUpdatedAt = "") {
  const row = asPlainRecord(value);
  const optionId = displayText(row.optionId).trim();
  if (!optionId) return null;
  const cost = Number(row.cost || 0);
  const baseQty = Number(row.baseQty || 1);
  const shippingFee = Number(row.shippingFee || 0);
  const purchaseTimeRaw = displayText(row.purchaseTime || row.purchase_time || "09:00").trim();
  return {
    id: displayText(row.id) || `map-server-${crypto.randomUUID()}`,
    channel: normalizeMappingChannel(row.channel),
    optionId,
    vendorName: displayText(row.vendorName).trim(),
    vendorCode: displayText(row.vendorCode).trim(),
    vendorProductName: displayText(row.vendorProductName).trim(),
    cost: Number.isFinite(cost) ? Math.max(0, cost) : 0,
    baseQty: Number.isFinite(baseQty) ? Math.max(1, baseQty) : 1,
    shippingFee: Number.isFinite(shippingFee) ? Math.max(0, shippingFee) : 0,
    purchaseTime: normalizeOptionPurchaseTimeList(purchaseTimeRaw),
    updatedAt: displayText(row.updatedAt) || fallbackUpdatedAt || "1970-01-01T00:00:00.000Z",
  };
}

function normalizeMappingRecords(values: unknown[], fallbackUpdatedAt = "") {
  const byKey = new Map<string, Record<string, unknown>>();
  values.forEach((value) => {
    const row = normalizeMappingRecord(value, fallbackUpdatedAt);
    if (!row) return;
    const key = mappingRecordKey(row);
    const current = byKey.get(key);
    const currentTime = Date.parse(displayText(current?.updatedAt)) || 0;
    const nextTime = Date.parse(displayText(row.updatedAt)) || 0;
    if (!current || nextTime >= currentTime) byKey.set(key, row);
  });
  return Array.from(byKey.values());
}

function mergeMappingRecords(existing: unknown[], incoming: unknown[], deletedKeys: unknown[], existingFallbackUpdatedAt = "") {
  const byKey = new Map<string, Record<string, unknown>>();
  normalizeMappingRecords(existing, existingFallbackUpdatedAt).forEach((row) => byKey.set(mappingRecordKey(row), row));
  normalizeMappingRecords(incoming).forEach((row) => {
    const key = mappingRecordKey(row);
    const current = byKey.get(key);
    const currentTime = Date.parse(displayText(current?.updatedAt)) || 0;
    const nextTime = Date.parse(displayText(row.updatedAt)) || Date.now();
    if (!current || nextTime >= currentTime) byKey.set(key, row);
  });
  deletedKeys.map((key) => displayText(key).trim()).filter(Boolean).forEach((key) => byKey.delete(key));
  return Array.from(byKey.values()).sort((a, b) => {
    const channel = displayText(a.channel).localeCompare(displayText(b.channel), "ko");
    return channel || displayText(a.optionId).localeCompare(displayText(b.optionId), "ko", { numeric: true });
  });
}

function mergeAdminPlusProductLinkRecords(existing: unknown[], incoming: unknown[]) {
  const byId = new Map<string, Record<string, unknown>>();
  const add = (value: unknown, preferIncoming = false) => {
    const row = asPlainRecord(value);
    const channel = normalizeMappingChannel(row.channel);
    const optionId = displayText(row.optionId).trim();
    const id = displayText(row.id).trim() || (optionId ? `${channel}|${optionId}` : "");
    if (!id) return;
    const normalized: Record<string, unknown> = { ...row, id, channel, optionId };
    const current = byId.get(id);
    if (!current) { byId.set(id, normalized); return; }
    const currentTime = Date.parse(displayText(current.updatedAt)) || 0;
    const nextTime = Date.parse(displayText(normalized.updatedAt)) || 0;
    if (
      (!preferIncoming && nextTime >= currentTime) ||
      (preferIncoming && ((nextTime > 0 && nextTime >= currentTime) || (nextTime === 0 && currentTime === 0)))
    ) byId.set(id, { ...current, ...normalized });
  };
  existing.forEach((row) => add(row, false));
  incoming.forEach((row) => add(row, true));
  return Array.from(byId.values());
}

function normalizeMappingTombstones(value: unknown) {
  const record = asPlainRecord(value);
  const output: Record<string, string> = {};
  Object.entries(record).forEach(([key, timestamp]) => {
    const cleanKey = displayText(key).trim();
    const cleanTimestamp = displayText(timestamp).trim();
    if (cleanKey && Date.parse(cleanTimestamp)) output[cleanKey] = cleanTimestamp;
  });
  return output;
}

function incomingMappingsAfterTombstones(values: unknown[], tombstones: Record<string, string>) {
  const accepted: unknown[] = [];
  normalizeMappingRecords(values).forEach((row) => {
    const key = mappingRecordKey(row);
    const deletedAt = Date.parse(tombstones[key] || "") || 0;
    const updatedAt = Date.parse(displayText(row.updatedAt)) || 0;
    if (deletedAt && updatedAt <= deletedAt) return;
    if (deletedAt && updatedAt > deletedAt) delete tombstones[key];
    accepted.push(row);
  });
  return accepted;
}

function pruneMappingTombstones(tombstones: Record<string, string>) {
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  return Object.fromEntries(Object.entries(tombstones).filter(([, timestamp]) => (Date.parse(timestamp) || 0) >= cutoff));
}

async function loadMappingSettingsRow(env: Env, settingsKey: string) {
  const db = supabaseAdmin(env);
  const { data, error } = await db
    .from("operation_persistent_settings")
    .select("settings_key,payload,updated_at")
    .eq("settings_key", settingsKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadSharedMappings(url: URL, env: Env) {
  const settingsKey = sanitizeSettingsKey(url.searchParams.get("settingsKey"));
  if (!supabaseConfigured(env)) return supabaseNotConfiguredResponse("mappings_load");
  const row = await loadMappingSettingsRow(env, settingsKey);
  const payload = asPlainRecord(row?.payload);
  const mappings = normalizeMappingRecords(asArray(payload.mappings), displayText(row?.updated_at));
  return jsonResponse({
    ok: true,
    mode: "shared_mappings_loaded_v199",
    sessionKey: settingsKey,
    updatedAt: row?.updated_at || null,
    data: { mappings },
    summary: { mappingRows: mappings.length },
    safety: safetyStatus(env),
    message: row
      ? `서버 최신 매핑 ${mappings.length}건을 불러왔습니다.`
      : "서버 저장 매핑이 아직 없습니다.",
  });
}

async function upsertSharedMappings(request: Request, env: Env) {
  const body = await readJson<MappingSyncPayload>(request);
  const settingsKey = sanitizeSettingsKey(body.settingsKey);
  if (!supabaseConfigured(env)) return supabaseNotConfiguredResponse("mappings_upsert");
  const row = await loadMappingSettingsRow(env, settingsKey);
  const payload = asPlainRecord(row?.payload);
  const now = new Date().toISOString();
  const tombstones = normalizeMappingTombstones(payload.mappingTombstones);
  const deletedKeys = asArray(body.deletedKeys).map((key) => displayText(key).trim()).filter(Boolean);
  deletedKeys.forEach((key) => { tombstones[key] = now; });
  const acceptedIncoming = incomingMappingsAfterTombstones(asArray(body.mappings), tombstones);
  const mappings = mergeMappingRecords(
    asArray(payload.mappings),
    acceptedIncoming,
    deletedKeys,
    displayText(payload.savedAt) || displayText(row?.updated_at),
  );
  const nextPayload: Record<string, unknown> = {
    ...payload,
    mappings,
    mappingTombstones: pruneMappingTombstones(tombstones),
    settingsKey,
    savedAt: now,
    mappingSync: {
      version: "v199",
      source: displayText(body.source) || "web-auto-sync",
      mappingRows: mappings.length,
      deletedRows: deletedKeys.length,
      updatedAt: now,
    },
  };
  nextPayload.serverSaveSummary = makePersistentSettingsSummary(nextPayload);
  const saved = await upsertPersistentSettingsRow(env, settingsKey, nextPayload);
  if (saved.error) throw saved.error;
  return jsonResponse({
    ok: true,
    mode: "shared_mappings_upserted_v199",
    sessionKey: settingsKey,
    updatedAt: now,
    data: { mappings },
    summary: { mappingRows: mappings.length, deletedRows: deletedKeys.length },
    safety: safetyStatus(env),
    message: `서버 자동 저장 완료 · 매핑 ${mappings.length}건`,
  });
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
    adminplusPurchaseHistoryRows: asArray(data.adminplusPurchaseHistory).length,
    adminplusProductLinkRows: asArray(data.adminplusProductLinks).length,
    adminplusPriceAlertRows: asArray(data.adminplusPriceAlerts).filter((row) => !objectRecord(row).acknowledgedAt).length,
    operationalFailureRows: asArray(data.operationalFailures).filter((row) => objectRecord(row).status !== "해결").length,
    adminplusAutomationEnabled: asPlainRecord(data.adminplusAutomation).enabled === true,
    savedAt: data.savedAt,
    version: data.version,
    serverSaveMode: data.serverSaveMode || "settings-save-v175",
  };
}

function compactPersistentSettingsData(data: Record<string, unknown>, settingsKey: string) {
  const compact: Record<string, unknown> = {
    mappings: asArray(data.mappings),
    mappingTombstones: asPlainRecord(data.mappingTombstones),
    mappingSync: asPlainRecord(data.mappingSync),
    tossOptionIdRows: asArray(data.tossOptionIdRows),
    coupangOptionMasterRows: asArray(data.coupangOptionMasterRows),
    purchaseTemplates: asArray(data.purchaseTemplates),
    invoiceTemplates: asArray(data.invoiceTemplates),
    shipmentTemplates: asArray(data.shipmentTemplates),
    channelPurchaseTemplates: asArray(data.channelPurchaseTemplates),
    couponRows: asArray(data.couponRows),
    rollingCouponTemplates: asArray(data.rollingCouponTemplates),
    b2bVendorLinks: asArray(data.b2bVendorLinks),
    adminplusAutomation: asPlainRecord(data.adminplusAutomation),
    adminplusPurchaseHistory: asArray(data.adminplusPurchaseHistory).slice(-5000),
    adminplusProductLinks: asArray(data.adminplusProductLinks),
    adminplusPriceAlerts: asArray(data.adminplusPriceAlerts).slice(-1000),
    operationalFailures: asArray(data.operationalFailures).slice(-100),
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

  if (!supabaseConfigured(env))
    return supabaseNotConfiguredResponse("settings_save");

  // 전체 설정 저장에서도 매핑은 기존 서버 자료와 최신 수정시각 기준으로 병합합니다.
  // 오래 열어둔 모바일/PC가 다른 기기의 신규 매핑이나 삭제를 되돌리지 않게 합니다.
  const currentRow = await loadMappingSettingsRow(env, settingsKey);
  const currentPayload = asPlainRecord(currentRow?.payload);
  const tombstones = normalizeMappingTombstones(currentPayload.mappingTombstones);
  const incomingMappings = "mappings" in incoming
    ? incomingMappingsAfterTombstones(asArray(incoming.mappings), tombstones)
    : [];
  const mergedMappings = "mappings" in incoming
    ? mergeMappingRecords(
        asArray(currentPayload.mappings),
        incomingMappings,
        [],
        displayText(currentPayload.savedAt) || displayText(currentRow?.updated_at),
      )
    : normalizeMappingRecords(asArray(currentPayload.mappings), displayText(currentRow?.updated_at));
  const savedAt = new Date().toISOString();
  const mergedAdminPlusProductLinks = "adminplusProductLinks" in incoming
    ? mergeAdminPlusProductLinkRecords(asArray(currentPayload.adminplusProductLinks), asArray(incoming.adminplusProductLinks))
    : asArray(currentPayload.adminplusProductLinks);
  const data: Record<string, unknown> = {
    ...incoming,
    mappings: mergedMappings,
    adminplusProductLinks: mergedAdminPlusProductLinks,
    mappingTombstones: pruneMappingTombstones(tombstones),
    mappingSync: currentPayload.mappingSync || incoming.mappingSync || {},
    settingsKey,
    savedAt,
  };
  data.serverSaveSummary = makePersistentSettingsSummary(data);

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
    detail = `HTTP ${result.status} 정상 응답이지만 조회기간/상태값에 해당하는 주문이 없습니다. 쿠팡은 상태값을 ACCEPT 또는 INSTRUCT로 바꾸거나 날짜 범위를 넓혀 다시 확인하세요. 응답 구조: ${rootKeySummary(result.data)}, 배열 위치: ${arrayPathSummaries(result.data)}`;
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

    // Toss 계정/API 게이트웨이 차이로 status=PAID 필터가 0건을 반환하는 경우를 대비합니다.
    // 공식 API는 status 생략 시 전체 상태를 반환하므로 동일 기간을 전체조회한 뒤
    // 실제 orderProductStatus/status가 PAID인 주문만 로컬에서 안전하게 복구합니다.
    const requestedStatus = String(baseQuery.status || "").trim().toUpperCase();
    if (requestedStatus === "PAID" && allOrders.length === 0 && pageResults.every((row) => row.ok)) {
      diagnostics.push({
        step: "토스 PAID 0건 안전 재조회",
        status: "준비",
        detail: "status=PAID 조회가 0건이라 동일 기간을 status 없이 다시 조회하고 실제 orderProductStatus=PAID 주문만 복구합니다.",
      });
      let fallbackCursor = "";
      for (let page = 1; page <= maxPages; page += 1) {
        const fallbackQuery = { ...baseQuery } as Record<string, string | number | boolean | null | undefined>;
        delete fallbackQuery.status;
        if (fallbackCursor) fallbackQuery.nextCursor = fallbackCursor;
        else delete fallbackQuery.nextCursor;
        const result = await tossRequest(env, "GET", rawPath, fallbackQuery);
        pageResults.push(result);
        const fallbackRows = normalizedOrdersFromExternal(result.data, channel);
        const paidRows = fallbackRows.filter((row) => String(objectRecord(row).status || "").trim().toUpperCase() === "PAID");
        allOrders.push(...paidRows);
        diagnostics.push({
          step: `토스 전체상태 fallback ${page}페이지`,
          status: result.ok ? "정상" : "오류",
          detail: result.ok
            ? `표준 주문행 ${fallbackRows.length}건 중 PAID ${paidRows.length}건을 복구했습니다.`
            : `HTTP ${result.status}: ${diagnosticMessage(result.data)}`,
        });
        if (!result.ok) break;
        fallbackCursor = tossNextCursor(result.data);
        if (!fallbackCursor) break;
      }
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
      const rawBody = coupangAckRawJson(String(env.COUPANG_VENDOR_ID || ""), chunk);
      const result = await coupangSignedRequestWithRetry(
        env,
        "PATCH",
        path,
        undefined,
        coupangRawJsonBody(rawBody),
      );
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
  const knownCodes = new Set(Object.values(COUPANG_DELIVERY_COMPANY_CODES));
  if (knownCodes.has(upper)) return upper;

  const compact = normalizeShipmentText(raw)
    .replace(/\(주\)|㈜|주식회사/gi, "")
    .replace(/[()\[\]{}.,·_-]/g, "");

  if ((compact.includes("CJ") || compact.includes("씨제이")) && compact.includes("대한통운")) return "CJGLS";
  if (compact.includes("롯데") && (compact.includes("택배") || compact.includes("글로벌로지스"))) return "HYUNDAI";
  if (compact.includes("한진")) return "HANJIN";
  if (compact.includes("로젠")) return "KGB";
  if (compact.includes("우체국")) return "EPOST";
  if (compact.includes("경동")) return "KDEXP";
  if (compact.includes("합동")) return "HDEXP";
  if (compact.includes("대신")) return "DAESIN";
  if (compact.includes("일양")) return "ILYANG";
  if (compact.includes("천일")) return "CHUNIL";
  if (compact.includes("직접") || compact.includes("업체직송")) return "DIRECT";

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


function coupangShipmentMissingFields(row: ReturnType<typeof shipmentUploadPayloadRow>) {
  const missing: string[] = [];
  if (!row.shipmentBoxId) missing.push("shipmentBoxId");
  if (!row.orderId) missing.push("orderId");
  if (!row.vendorItemId) missing.push("vendorItemId");
  if (!coupangDeliveryCompanyCode(row.courier)) missing.push(`택배사코드(${row.courier || "없음"})`);
  if (!row.trackingNo) missing.push("운송장번호");
  return missing;
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
    ...coupangRows.filter((row) => !coupangReadyRows.some((ready) => ready.orderNo === row.orderNo && ready.trackingNo === row.trackingNo)).map((row) => ({ channel: "쿠팡", orderNo: row.orderNo, reason: `쿠팡 송장 필수값 누락: ${coupangShipmentMissingFields(row).join(", ") || "알 수 없음"}` })),
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
      const rawBody = coupangInvoiceRawJson(String(env.COUPANG_VENDOR_ID || ""), chunk);
      const result = await coupangSignedRequestWithRetry(
        env,
        "POST",
        path,
        undefined,
        coupangRawJsonBody(rawBody),
      );
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
      results.push({ channel: "쿠팡", ok: false, status: 0, requested: coupangRows.length, succeeded: 0, pathConfigured: true, message: `쿠팡 송장등록 필수값 부족: ${coupangRows.slice(0, 3).map((row) => `${row.orderNo || "주문번호없음"}[${coupangShipmentMissingFields(row).join(", ")}]`).join(" / ")}` });
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

function couponNameWithDateSuffix(value: unknown, dateText: string) {
  const base = displayText(value || "24시간 즉시할인")
    .replace(/\s+20\d{2}-\d{2}-\d{2}\s*$/g, "")
    .trim();
  return safeText(`${base || "24시간 즉시할인"} ${dateText}`.trim(), 45);
}

function buildCoupangCouponCreatePayload(rows: Record<string, unknown>[], env: Env, couponApiSettings?: CouponApiSettings) {
  const first = rows[0] || {};
  const discountType = displayText(first.discountType) === "율" || (!displayText(first.discountType) && couponApiSettings?.sourceDiscountType === "율") ? "율" : "금액";
  const rawDiscountValue = profitNumber(first.discountValue) || profitNumber(couponApiSettings?.sourceDiscountValue);
  const discountValue = discountType === "율"
    ? Math.max(1, Math.min(99, Math.trunc(rawDiscountValue)))
    : Math.max(10, Math.round(rawDiscountValue / 10) * 10);
  const maxDiscountPrice = discountType === "율"
    ? Math.max(10, Math.round(profitNumber(first.maxDiscountPrice || env.COUPANG_COUPON_MAX_DISCOUNT_PRICE || discountValue) / 10) * 10)
    : Math.max(10, discountValue);
  const defaultStart = `${todayDateText()} 00:00:00`;
  const defaultEnd = `${todayDateText()} 23:59:00`;
  const startAt = couponDateTime(first.startAt, defaultStart);
  const endAt = couponDateTime(first.endAt, defaultEnd);
  const endDate = endAt.slice(0, 10) || todayDateText();
  return {
    contractId: displayText(first.contractId) || couponApiSettings?.selectedContractId || env.COUPANG_COUPON_CONTRACT_ID,
    name: couponNameWithDateSuffix(displayText(first.baseCouponName || first.couponName) || displayText(couponApiSettings?.selectedCouponName), endDate),
    maxDiscountPrice,
    discount: discountValue,
    startAt,
    endAt,
    type: discountType === "율" ? "RATE" : "PRICE",
    wowExclusive: typeof first.wowExclusive === "boolean"
      ? first.wowExclusive
      : String(env.COUPANG_COUPON_WOW_EXCLUSIVE || "false").toLowerCase() === "true",
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
    "transactionStatusResponse.couponId",
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

function couponRequestStatusKind(value: unknown) {
  const status = displayText(value).trim().toUpperCase();
  if (["SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE", "DONE", "APPLIED"].includes(status)) return "success" as const;
  if (["FAIL", "FAILED", "ERROR", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"].includes(status)) return "failed" as const;
  return "pending" as const;
}

async function pollCoupangCouponRequestStatus(
  env: Env,
  requestedId: string,
  options: { requireCouponId?: boolean; delays?: number[] } = {},
) {
  const delays = options.delays || [0, 1_000, 2_000, 4_000, 8_000];
  const results: ExternalApiResult[] = [];
  let lastSummary = { requestedId, couponId: "", status: "", type: "", message: "", total: 0, succeeded: 0, failed: 0 };
  for (const delay of delays) {
    if (delay > 0) await sleepMs(delay);
    const result = await checkCoupangCouponRequestStatus(env, requestedId);
    results.push(result);
    if (!result.ok) continue;
    lastSummary = couponRequestStatusSummary(result.data);
    const kind = couponRequestStatusKind(lastSummary.status);
    const partialFailure = lastSummary.failed > 0 || (lastSummary.total > 0 && lastSummary.succeeded > 0 && lastSummary.succeeded < lastSummary.total);
    if (kind === "failed" || partialFailure) return { ok: false, pending: false, couponId: lastSummary.couponId, status: partialFailure ? `${lastSummary.status || "DONE"}_PARTIAL_FAIL` : lastSummary.status, summary: lastSummary, results };
    if (options.requireCouponId ? Boolean(lastSummary.couponId) && kind === "success" : kind === "success") {
      return { ok: true, pending: false, couponId: lastSummary.couponId, status: lastSummary.status, summary: lastSummary, results };
    }
  }
  return {
    ok: false,
    pending: true,
    couponId: lastSummary.couponId,
    status: lastSummary.status,
    summary: lastSummary,
    results,
  };
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
        maxDiscountPrice: profitNumber(firstText(flat, ["maxDiscountPrice", "maximumDiscountPrice", "discount.maxDiscountPrice"])),
        wowExclusive: firstText(flat, ["wowExclusive", "isWowExclusive", "wowOnly"]),
        startAt: firstText(flat, ["startAt", "startDate", "startDt"]),
        endAt: firstText(flat, ["endAt", "endDate", "endDt"]),
      });
    }
  }
  return rows;
}

function couponRequestStatusSummary(data: unknown) {
  const flat = flattenObject(objectRecord(data));
  const numeric = (keys: string[]) => {
    const value = firstText(flat, keys);
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };
  return {
    requestedId: firstText(flat, ["data.content.requestedId", "content.requestedId", "requestedId", "data.requestedId", "result.requestedId", "transactionStatusResponse.requestedId"]),
    couponId: couponIdFromCoupangStatus(data),
    status: firstText(flat, ["data.content.status", "content.status", "status", "data.status", "result.status", "transactionStatusResponse.status"]),
    type: firstText(flat, ["data.content.type", "content.type", "type", "data.type", "result.type", "transactionStatusResponse.type"]),
    message: firstText(flat, ["message", "data.message", "content.message", "result.message", "transactionStatusResponse.message"]),
    total: numeric(["data.content.total", "content.total", "total", "data.total", "result.total", "transactionStatusResponse.total"]),
    succeeded: numeric(["data.content.succeeded", "content.succeeded", "succeeded", "data.succeeded", "result.succeeded", "transactionStatusResponse.succeeded"]),
    failed: numeric(["data.content.failed", "content.failed", "failed", "data.failed", "result.failed", "transactionStatusResponse.failed"]),
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


async function couponItemsForAppliedVerification(env: Env, couponId: string) {
  const path = applyCoupangPathParams(
    configuredPath(env.COUPANG_COUPON_ITEM_LIST_PATH, COUPANG_DEFAULT_COUPON_ITEM_LIST_PATH),
    env,
    { couponId },
  );
  const rows: Array<Record<string, string | number>> = [];
  const results: ExternalApiResult[] = [];
  for (let page = 0; page < 20; page += 1) {
    const result = await coupangSignedRequestWithRetry(env, "GET", path, { status: "APPLIED", page, size: 1000, sort: "desc" });
    results.push(result);
    if (!result.ok) break;
    const found = collectCoupangCouponItems(result.data);
    rows.push(...found);
    if (found.length < 1000) break;
  }
  const ids = new Set(rows.map((row) => cleanDigitsOnly(row.vendorItemId)).filter(Boolean));
  return { ok: results.length > 0 && results[results.length - 1].ok, ids, rows, results };
}

async function verifyCouponItemsActuallyApplied(
  env: Env,
  couponId: string,
  expectedVendorItems: number[],
  delays: number[] = [0, 5_000, 5_000],
) {
  const expected = Array.from(new Set(expectedVendorItems.map((value) => cleanDigitsOnly(value)).filter(Boolean)));
  let last: Awaited<ReturnType<typeof couponItemsForAppliedVerification>> | null = null;
  let passes = 0;
  for (const delay of delays) {
    if (delay > 0) await sleepMs(delay);
    passes += 1;
    last = await couponItemsForAppliedVerification(env, couponId);
    if (last.ok && expected.every((id) => last!.ids.has(id))) {
      return { ok: true, passes, rows: last.rows, results: last.results };
    }
  }
  return { ok: false, passes, rows: last?.rows || [], results: last?.results || [] };
}

function normalizedCouponDateTimeForMatch(value: unknown) {
  return displayText(value).replace("T", " ").slice(0, 16);
}

function couponRowMatchesExpectedPayload(row: Record<string, string | number>, payload: Record<string, unknown>) {
  const expectedName = displayText(payload.name);
  if (!expectedName || displayText(row.couponName) !== expectedName) return false;
  const expectedContract = cleanDigitsOnly(payload.contractId);
  if (expectedContract && cleanDigitsOnly(row.contractId) && cleanDigitsOnly(row.contractId) !== expectedContract) return false;
  const expectedType = displayText(payload.type).toUpperCase();
  if (expectedType && displayText(row.type).toUpperCase() && displayText(row.type).toUpperCase() !== expectedType) return false;
  const expectedDiscount = profitNumber(payload.discount);
  if (expectedDiscount > 0 && profitNumber(row.discountValue) > 0 && profitNumber(row.discountValue) !== expectedDiscount) return false;
  const expectedStart = normalizedCouponDateTimeForMatch(payload.startAt);
  const expectedEnd = normalizedCouponDateTimeForMatch(payload.endAt);
  if (expectedStart && normalizedCouponDateTimeForMatch(row.startAt) && normalizedCouponDateTimeForMatch(row.startAt) !== expectedStart) return false;
  if (expectedEnd && normalizedCouponDateTimeForMatch(row.endAt) && normalizedCouponDateTimeForMatch(row.endAt) !== expectedEnd) return false;
  return true;
}

async function findActuallyAppliedCouponByPayload(
  env: Env,
  payload: Record<string, unknown>,
  delays: number[] = [0, 5_000, 5_000],
) {
  const path = configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH);
  let passes = 0;
  const results: ExternalApiResult[] = [];
  for (const delay of delays) {
    if (delay > 0) await sleepMs(delay);
    passes += 1;
    const result = await coupangSignedRequestWithRetry(env, "GET", path, { status: "APPLIED", page: 1, size: 100, sort: "desc" });
    results.push(result);
    if (!result.ok) continue;
    const matches = collectCoupangCoupons(result.data).filter((row) => couponRowMatchesExpectedPayload(row, payload));
    if (matches.length === 1) {
      return { ok: true, couponId: displayText(matches[0].couponId), row: matches[0], passes, results };
    }
  }
  return { ok: false, couponId: "", row: null, passes, results };
}

async function couponOptionExistsWithThreePasses(env: Env, optionId: string) {
  const attempts: ExternalApiResult[] = [];
  for (const delay of [0, 250, 750]) {
    if (delay > 0) await sleepMs(delay);
    const result = await couponOptionExistsForPreflight(env, optionId);
    attempts.push(result);
    if (result.ok) return { ok: true, result, attempts };
  }
  return { ok: false, result: attempts[attempts.length - 1], attempts };
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
  let operationOk = true;
  const generatedCouponIds: string[] = [];
  const generatedRequestedIds: string[] = [];
  const generatedCouponRecords: Array<Record<string, string>> = [];
  const itemRequestedIds: string[] = [];
  const pendingOperations: CouponPendingOperation[] = [];
  const rollingMode = dailyRollingCouponMode(couponApiSettings);
  const selectedCouponId = displayText(couponApiSettings?.selectedCouponId);
  const configuredCouponId = selectedCouponId || (configuredEnvValue(env.COUPANG_COUPON_ID) ? String(env.COUPANG_COUPON_ID) : "");
  if (configuredCouponId && !rollingMode) {
    const path = applyCoupangPathParams(itemCreatePath, env, { couponId: configuredCouponId });
    const result = await coupangSignedRequestWithRetry(env, "POST", path, undefined, { vendorItems });
    results.push(result);
    const requestedId = result.ok ? requestedIdFromCoupang(result.data) : "";
    let statusConfirmed = false;
    if (requestedId) {
      itemRequestedIds.push(requestedId);
      const itemStatusPoll = await pollCoupangCouponRequestStatus(env, requestedId, { requireCouponId: false });
      results.push(...itemStatusPoll.results);
      statusConfirmed = itemStatusPoll.ok;
    }
    const ok = result.ok && Boolean(requestedId) && statusConfirmed;
    return {
      ok,
      externalApiExecuted: true,
      results,
      generatedCouponIds,
      generatedRequestedIds,
      generatedCouponRecords,
      itemRequestedIds,
      message: ok
        ? `쿠팡 즉시할인쿠폰 아이템 등록과 비동기 요청상태 DONE을 확인했습니다. couponId=${configuredCouponId}, 옵션 ${vendorItems.length}건입니다.`
        : `쿠팡 즉시할인쿠폰 아이템 등록 요청은 실행됐지만 requestedId 요청상태 DONE 확인이 필요합니다. couponId=${configuredCouponId}.`,
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
    const ids = couponVendorItemIds(group);
    const createPayload = buildCoupangCouponCreatePayload(group, env, couponApiSettings);
    const createResult = await coupangSignedRequestWithRetry(env, "POST", createPath, undefined, createPayload);
    results.push(createResult);
    const requestedId = createResult.ok ? requestedIdFromCoupang(createResult.data) : "";
    if (!requestedId) {
      operationOk = false;
      continue;
    }
    generatedRequestedIds.push(requestedId);
    const statusPoll = await pollCoupangCouponRequestStatus(env, requestedId, { requireCouponId: true });
    results.push(...statusPoll.results);
    let couponId = statusPoll.ok ? statusPoll.couponId : "";
    if (!couponId) {
      // 쿠팡 비동기 상태조회가 늦더라도 실제 APPLIED 쿠폰이 이미 만들어졌는지 3회 교차검증합니다.
      const actual = await findActuallyAppliedCouponByPayload(env, createPayload);
      results.push(...actual.results);
      couponId = actual.ok ? actual.couponId : "";
      if (!couponId) {
        operationOk = false;
        if (statusPoll.pending) {
          pendingOperations.push({ stage: "create_status", requestedId, vendorItems: ids, templateId: templateIdFromRow(group[0] || {}) });
        }
        continue;
      }
    }
    generatedCouponIds.push(couponId);
    generatedCouponRecords.push({
      templateId: templateIdFromRow(group[0] || {}),
      sourceCouponId: displayText((group[0] || {}).sourceCouponId),
      couponName: displayText((group[0] || {}).couponName),
      couponId,
      requestedId,
    });
    const itemPath = applyCoupangPathParams(itemCreatePath, env, { couponId });
    const itemResult = await coupangSignedRequestWithRetry(env, "POST", itemPath, undefined, { vendorItems: ids });
    results.push(itemResult);
    const itemRequestedId = itemResult.ok ? requestedIdFromCoupang(itemResult.data) : "";
    let itemApplyConfirmed = false;
    let itemStatusPending = false;
    if (itemRequestedId) {
      itemRequestedIds.push(itemRequestedId);
      const itemStatusPoll = await pollCoupangCouponRequestStatus(env, itemRequestedId, { requireCouponId: false });
      results.push(...itemStatusPoll.results);
      itemStatusPending = itemStatusPoll.pending;
    }
    // requestedId가 DONE이어도 실제 쿠폰의 APPLIED 상품(옵션) 목록에 대상 vendorItemId가 존재해야만 성공입니다.
    const actualItems = await verifyCouponItemsActuallyApplied(env, couponId, ids);
    results.push(...actualItems.results);
    itemApplyConfirmed = actualItems.ok;
    if (!itemApplyConfirmed) {
      operationOk = false;
      if (itemRequestedId && itemStatusPending) {
        pendingOperations.push({ stage: "item_status", requestedId: itemRequestedId, couponId, vendorItems: ids, templateId: templateIdFromRow(group[0] || {}) });
      } else {
        // 상품 0건 등 불완전 신규 쿠폰은 현재 쿠폰으로 채택하지 않고 즉시 정리 요청합니다.
        const cleanup = await runCoupangCouponCancel(env, [{ sourceCouponId: couponId, latestCouponId: couponId }], { selectedCouponId: couponId } as CouponApiSettings);
        results.push(...cleanup.results);
      }
    }
  }

  const executed = results.length > 0;
  // 중간 폴링 HTTP가 일시 실패했더라도 최종 APPLIED 상태를 교차검증해 성공한 경우 전체 작업은 성공입니다.
  const allOk = executed && operationOk;
  return {
    ok: allOk,
    externalApiExecuted: executed,
    results,
    generatedCouponIds: uniqueCouponIdList(generatedCouponIds),
    generatedCouponRecords,
    generatedRequestedIds: uniqueCouponIdList(generatedRequestedIds),
    itemRequestedIds: uniqueCouponIdList(itemRequestedIds),
    pendingOperations,
    message: allOk
      ? `쿠팡 즉시할인쿠폰 생성·상품적용을 완료했습니다. requestedId 상태와 실제 APPLIED 쿠폰/옵션을 최대 3회 교차검증했습니다. 신규 couponId ${uniqueCouponIdList(generatedCouponIds).length}개, 옵션 ${vendorItems.length}건입니다.`
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

async function resolveActualAppliedCouponForOptions(env: Env, preferredCouponId: string, expectedVendorItems: Array<string | number>) {
  const expected = Array.from(new Set(expectedVendorItems.map(cleanDigitsOnly).filter(Boolean)));
  if (!expected.length) return { ok: true, lookupOk: true, couponId: preferredCouponId, ambiguous: false, matchedCount: preferredCouponId ? 1 : 0, results: [] as ExternalApiResult[] };
  const results: ExternalApiResult[] = [];
  async function matches(couponId: string) {
    if (!couponId) return false;
    const verified = await couponItemsForAppliedVerification(env, couponId);
    results.push(...verified.results);
    return verified.ok && expected.every((id) => verified.ids.has(id));
  }
  if (preferredCouponId && await matches(preferredCouponId)) {
    return { ok: true, lookupOk: true, couponId: preferredCouponId, ambiguous: false, matchedCount: 1, results };
  }
  const listPath = configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH);
  const listResult = await coupangSignedRequestWithRetry(env, "GET", listPath, { status: "APPLIED", page: 1, size: 100, sort: "desc" });
  results.push(listResult);
  if (!listResult.ok) return { ok: false, lookupOk: false, couponId: "", ambiguous: false, matchedCount: 0, results };
  const candidates = collectCoupangCoupons(listResult.data).map((row) => displayText(row.couponId)).filter(Boolean);
  const matchesFound: string[] = [];
  for (let index = 0; index < candidates.length; index += 5) {
    const batch = candidates.slice(index, index + 5);
    const checks = await Promise.all(batch.map(async (couponId) => ({ couponId, match: await matches(couponId) })));
    matchesFound.push(...checks.filter((row) => row.match).map((row) => row.couponId));
    if (matchesFound.length > 1) break;
  }
  const unique = uniqueCouponIdList(matchesFound);
  return {
    ok: unique.length === 1,
    lookupOk: true,
    couponId: unique[0] || "",
    ambiguous: unique.length > 1,
    matchedCount: unique.length,
    results,
  };
}

async function verifyCouponNoLongerApplied(env: Env, couponId: string) {
  const path = configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH);
  const attempts: ExternalApiResult[] = [];
  const delays = [0, 5_000, 5_000];
  for (const delay of delays) {
    if (delay) await sleepMs(delay);
    const result = await coupangSignedRequestWithRetry(env, "GET", path, { status: "APPLIED", page: 1, size: 100, sort: "desc" });
    attempts.push(result);
    if (!result.ok) continue;
    const stillApplied = collectCoupangCoupons(result.data).some((row) => displayText(row.couponId) === couponId);
    if (!stillApplied) return { ok: true, stillApplied: false, results: attempts };
  }
  return { ok: false, stillApplied: true, results: attempts };
}

async function runCoupangCouponCancel(env: Env, rows: unknown[], couponApiSettings?: CouponApiSettings) {
  let ids = configuredCouponIds(env, couponApiSettings, rows);
  if (!ids.length) {
    return {
      ok: false,
      pending: false,
      externalApiExecuted: false,
      results: [],
      canceledCouponIds: [],
      cancelRequestedIds: [],
      pendingCancelOperations: [],
      failedCouponIds: [],
      message: `쿠팡 쿠폰 취소 경로는 적용됐지만 화면에서 취소할 기존 쿠폰(couponId)을 선택하지 않아 실제 파기 API를 호출하지 않았습니다. 취소 대상 옵션 ${rows.length}건을 확인했습니다.`,
    };
  }

  const expectedVendorItems = couponVendorItemIds(rows);
  if (expectedVendorItems.length) {
    const preferredCouponId = ids[0] || "";
    const resolved = await resolveActualAppliedCouponForOptions(env, preferredCouponId, expectedVendorItems);
    if (resolved.ambiguous) {
      return { ok: false, pending: false, externalApiExecuted: true, results: resolved.results, canceledCouponIds: [], cancelRequestedIds: [], pendingCancelOperations: [], failedCouponIds: ids, alreadyInactive: false, noActiveAppliedCoupon: false, message: `같은 옵션ID가 적용된 APPLIED 쿠폰이 2개 이상 발견되어 안전을 위해 자동 교체를 중단했습니다. 중복 쿠폰을 확인하세요.` };
    }
    if (!resolved.lookupOk) {
      return { ok: false, pending: false, lookupFailed: true, externalApiExecuted: true, results: resolved.results, canceledCouponIds: [], cancelRequestedIds: [], pendingCancelOperations: [], failedCouponIds: ids, alreadyInactive: false, noActiveAppliedCoupon: false, message: `현재 APPLIED 쿠폰 조회에 실패했습니다. 반복대상은 유지하고 self-healing 재조회 후 자동 교체를 재개합니다.` };
    }
    if (!resolved.couponId) {
      return {
        ok: true,
        pending: false,
        externalApiExecuted: true,
        results: resolved.results,
        canceledCouponIds: [],
        cancelRequestedIds: [],
        pendingCancelOperations: [],
        failedCouponIds: [],
        alreadyInactive: true,
        noActiveAppliedCoupon: true,
        message: `대상 옵션ID에 실제 APPLIED 쿠폰이 없습니다. 저장된 couponId가 이미 종료된 것으로 판단해 취소 API를 생략하고 신규 발행 단계로 진행할 수 있습니다.`,
      };
    }
    ids = [resolved.couponId];
  }

  const rawPath = configuredPath(env.COUPANG_COUPON_CANCEL_PATH, COUPANG_DEFAULT_COUPON_EXPIRE_PATH);
  const results: ExternalApiResult[] = [];
  const canceledCouponIds: string[] = [];
  const cancelRequestedIds: string[] = [];
  const pendingCancelOperations: CouponCancelPendingOperation[] = [];
  const failedCouponIds: string[] = [];
  const templateId = templateIdFromRow(couponRowRecord(rows[0]));

  // 쿠폰 파기는 비동기 API입니다. 같은 couponId에 파기 요청을 반복 전송하지 않고,
  // 최초 요청에서 받은 requestedId의 상태를 즉시·10초·30초 시점에 확인합니다.
  for (const couponId of ids) {
    const path = applyCoupangPathParams(rawPath, env, { couponId });
    const result = await coupangSignedRequestWithRetry(env, "PUT", path, { action: "expire" });
    results.push(result);
    if (!result.ok) {
      failedCouponIds.push(couponId);
      continue;
    }

    const requestedId = requestedIdFromCoupang(result.data);
    if (!requestedId) {
      failedCouponIds.push(couponId);
      continue;
    }

    cancelRequestedIds.push(requestedId);
    const statusPoll = await pollCoupangCouponRequestStatus(env, requestedId, {
      requireCouponId: false,
      // 누적 대기 0초 → 10초 → 30초
      delays: [0, 5_000, 5_000],
    });
    results.push(...statusPoll.results);

    if (statusPoll.ok) {
      // requestedId DONE만으로 새 쿠폰을 만들지 않습니다. 실제 APPLIED 목록에서도 기존 couponId가 사라졌는지 3회 교차확인합니다.
      const disappearance = await verifyCouponNoLongerApplied(env, couponId);
      results.push(...disappearance.results);
      if (disappearance.ok) {
        canceledCouponIds.push(couponId);
      } else {
        pendingCancelOperations.push({ couponId, requestedId, templateId });
      }
    } else if (statusPoll.pending) {
      pendingCancelOperations.push({ couponId, requestedId, templateId });
    } else {
      failedCouponIds.push(couponId);
    }
  }

  const ok = canceledCouponIds.length === ids.length;
  const pending = pendingCancelOperations.length > 0;
  const message = ok
    ? `쿠팡 즉시할인쿠폰 파기 요청 DONE과 실제 APPLIED 목록 제거까지 확인했습니다. couponId ${canceledCouponIds.length}개입니다.`
    : pending && !failedCouponIds.length
      ? `쿠팡 파기 요청은 접수됐지만 30초 안에 DONE이 확인되지 않았습니다. 같은 파기 요청은 중복 전송하지 않고 requestedId ${pendingCancelOperations.length}건의 상태만 계속 확인합니다.`
      : `쿠팡 즉시할인쿠폰 파기 처리 중 실패 또는 확인대기가 있습니다. 완료 ${canceledCouponIds.length}개, 대기 ${pendingCancelOperations.length}개, 실패 ${failedCouponIds.length}개입니다.`;

  return {
    ok,
    pending,
    externalApiExecuted: true,
    results,
    canceledCouponIds,
    cancelRequestedIds: uniqueCouponIdList(cancelRequestedIds),
    pendingCancelOperations,
    failedCouponIds,
    message,
  };
}


type CouponAutomationPreflightRow = {
  templateId: string;
  couponId: string;
  couponName: string;
  nextCouponName: string;
  ok: boolean;
  issues: string[];
  notes: string[];
  checkedOptions: number;
  startAt: string;
  endAt: string;
  reconciledCouponId?: string;
  reconciliation?: "none" | "applied_verified";
  verificationPasses?: number;
};

type CouponPendingOperation = {
  stage: "create_status" | "item_status";
  requestedId: string;
  couponId?: string;
  vendorItems: number[];
  templateId: string;
};

type CouponCancelPendingOperation = {
  couponId: string;
  requestedId: string;
  templateId: string;
};

type CouponRetryStage = "reconcile" | "cancel" | "cancel_status" | "create_apply" | "cleanup" | "request_status" | "applied_verify_1m" | "applied_verify_30m";

function automationTemplateId(template: RollingCouponTemplate) {
  return displayText(template.id || template.sourceCouponId || template.couponName);
}

function automationTemplateName(template: RollingCouponTemplate) {
  return displayText(template.baseCouponName || template.couponName || `couponId ${template.sourceCouponId || ""}`);
}

function activeCouponTemplates(settings?: CouponApiSettings) {
  return normalizeRollingTemplates(settings?.rollingTemplates)
    .filter((template) => template.enabled === true && template.automationState === "active");
}

function couponTemplateScheduleStarted(template: RollingCouponTemplate, nowDate: string) {
  const startDate = displayText(template.scheduleStartDate).slice(0, 10);
  return !startDate || nowDate >= startDate;
}

function couponCancelExecutionTime(schedules: SchedulerConfig) {
  // 쿠폰 유효 종료시각(기본 23:50)과 API 파기 실행시각을 분리합니다.
  // 기본 실행은 다음 신규 발행분 시작시각(23:51)에 맞춰 기존 쿠폰을 정리합니다.
  return String(schedules.couponApply?.time || "23:51");
}

function kstDateTimeSecondText(date = new Date()) {
  const parts = kstParts(date);
  return `${kstPart(parts, "year")}-${kstPart(parts, "month")}-${kstPart(parts, "day")} ${kstPart(parts, "hour")}:${kstPart(parts, "minute")}:${kstPart(parts, "second")}`;
}

function couponAutomationWindow(_schedules: SchedulerConfig, _nowDate: string) {
  // R8.3: 신규 쿠폰은 실제 비활성 확인 후 즉시 시작하고 24시간 뒤 종료하도록 생성합니다.
  // 자연 종료시각 자체를 신뢰하지 않고 실제 APPLIED 상태가 사라진 뒤 재발행합니다.
  const start = new Date(Date.now() + 5_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startAt: kstDateTimeSecondText(start),
    endAt: kstDateTimeSecondText(end),
    couponDate: kstDateText(start),
  };
}

function couponKstDateTimeToMs(value: unknown) {
  const text = displayText(value).replace("T", " ").slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(text)) return NaN;
  const normalized = text.length === 16 ? `${text}:00` : text;
  return Date.parse(`${normalized.replace(" ", "T")}+09:00`);
}

function couponAdaptiveHealthIntervalMs(template: RollingCouponTemplate, nowMs = Date.now()) {
  const endMs = couponKstDateTimeToMs(template.endAt);
  if (!Number.isFinite(endMs)) return 15 * 60_000;
  const diff = endMs - nowMs;
  // 종료 1시간 전부터 종료 후 1시간까지는 매분 실제 상태를 확인합니다.
  if (diff <= 60 * 60_000 && diff >= -60 * 60_000) return 60_000;
  // 종료 예정시각을 1시간 넘겼는데도 살아 있으면 5분 간격으로 확인합니다.
  if (diff < -60 * 60_000) return 5 * 60_000;
  // 평상시는 15분 간격으로만 확인해 API/서버 부하를 줄입니다.
  return 15 * 60_000;
}

function couponAdaptiveHealthCheckDue(template: RollingCouponTemplate, nowMs = Date.now()) {
  const nextMs = Date.parse(displayText(template.nextCouponHealthCheckAtIso));
  return !Number.isFinite(nextMs) || nextMs <= nowMs;
}

function templateRowsForAutomation(template: RollingCouponTemplate, action: "apply" | "cancel", schedules: SchedulerConfig, nowDate: string) {
  const window = couponAutomationWindow(schedules, nowDate);
  return (template.options || []).map((option) => ({
    action,
    optionId: displayText(option.optionId),
    vendorItemId: displayText(option.optionId),
    productName: displayText(option.productName),
    couponName: automationTemplateName(template),
    baseCouponName: automationTemplateName(template),
    discountType: template.discountType || "금액",
    discountValue: profitNumber(template.discountValue),
    maxDiscountPrice: profitNumber(template.maxDiscountPrice),
    wowExclusive: Boolean(template.wowExclusive),
    startAt: action === "apply" ? window.startAt : template.startAt,
    endAt: action === "apply" ? window.endAt : template.endAt,
    rollingTemplateId: automationTemplateId(template),
    sourceCouponId: displayText(template.sourceCouponId),
    latestCouponId: displayText(template.latestCouponId || template.lastGeneratedCouponId || template.sourceCouponId),
    contractId: displayText(template.contractId),
    memo: action === "apply"
      ? `자동운영 ${window.startAt}~${window.endAt}`
      : `자동운영 ${schedules.couponCancel?.time || "23:50"} 취소`,
  }));
}

async function couponContractRowsForPreflight(env: Env) {
  const path = configuredPath(env.COUPANG_COUPON_CONTRACT_LIST_PATH, COUPANG_DEFAULT_COUPON_CONTRACT_LIST_PATH);
  const result = await coupangSignedRequestWithRetry(env, "GET", path, { page: 0, size: 100 });
  return { result, rows: result.ok ? collectCoupangCouponContracts(result.data) : [] };
}

async function couponRowsForPreflight(env: Env) {
  const path = configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH);
  const statuses = ["APPLIED", "STANDBY"];
  const rows: Array<Record<string, string | number>> = [];
  const results: ExternalApiResult[] = [];
  for (const status of statuses) {
    const result = await coupangSignedRequestWithRetry(env, "GET", path, { status, page: 1, size: 100, sort: "desc" });
    results.push(result);
    if (result.ok) rows.push(...collectCoupangCoupons(result.data));
  }
  return { results, rows };
}

async function couponOptionExistsForPreflight(env: Env, optionId: string) {
  const path = applyCoupangPathParams(
    configuredPath(env.COUPANG_VENDOR_ITEM_INVENTORY_PATH, COUPANG_DEFAULT_VENDOR_ITEM_INVENTORY_PATH),
    env,
    { vendorItemId: optionId },
  );
  return coupangSignedRequestWithRetry(env, "GET", path);
}

async function performCouponAutomationPreflight(
  env: Env,
  templates: RollingCouponTemplate[],
  schedules: SchedulerConfig,
  nowDate = kstDateText(),
) {
  const window = couponAutomationWindow(schedules, nowDate);
  const commonIssues: string[] = [];
  if (!coupangConfigured(env)) commonIssues.push("쿠팡 인증정보 미설정");
  if (!liveExecutionAllowed(env)) commonIssues.push("실 API 실행 Gate 미허용");
  if (!scheduledWritesAllowed(env)) commonIssues.push("스케줄 쓰기 Gate 미허용");
  if (!supabaseConfigured(env)) commonIssues.push("Supabase 미설정");
  if (supabaseConfigured(env)) {
    const db = supabaseAdmin(env);
    const [retryCheck, failureCheck] = await Promise.all([
      db.from("coupon_automation_retries").select("id").limit(1),
      db.from("coupon_automation_failures").select("id").limit(1),
    ]);
    if (retryCheck.error) commonIssues.push("Supabase coupon_automation_retries 테이블 미적용");
    if (failureCheck.error) commonIssues.push("Supabase coupon_automation_failures 테이블 미적용");
  }

  let contractRows: Array<Record<string, string | number>> = [];
  let couponRows: Array<Record<string, string | number>> = [];
  if (!commonIssues.length) {
    const [contracts, coupons] = await Promise.all([
      couponContractRowsForPreflight(env),
      couponRowsForPreflight(env),
    ]);
    if (!contracts.result.ok) commonIssues.push(`쿠폰 계약 조회 실패 HTTP ${contracts.result.status}`);
    if (coupons.results.every((result) => !result.ok)) commonIssues.push("쿠폰 목록 조회 실패");
    contractRows = contracts.rows;
    couponRows = coupons.rows;
  }

  const limit = Math.max(1, Math.min(500, Number(env.COUPANG_COUPON_PREFLIGHT_ITEM_LIMIT || 100)));
  const output: CouponAutomationPreflightRow[] = [];
  const appliedItemCache = new Map<string, Set<string>>();
  async function appliedItemIds(couponId: string) {
    if (appliedItemCache.has(couponId)) return appliedItemCache.get(couponId)!;
    const verified = await couponItemsForAppliedVerification(env, couponId);
    const ids = verified.ok ? verified.ids : new Set<string>();
    appliedItemCache.set(couponId, ids);
    return ids;
  }
  for (const template of templates) {
    const issues = [...commonIssues];
    const notes: string[] = [];
    const templateId = automationTemplateId(template);
    const couponId = displayText(template.latestCouponId || template.lastGeneratedCouponId || template.sourceCouponId);
    const contractId = displayText(template.contractId);
    const options = Array.isArray(template.options) ? template.options : [];
    const nextCouponName = couponNameWithDateSuffix(automationTemplateName(template), window.couponDate);
    let reconciledCouponId = "";
    let reconciliation: "none" | "applied_verified" = "none";
    let verificationPasses = 1;

    if (!templateId) issues.push("템플릿 ID 누락");
    if (!couponId) notes.push("현재 쿠폰ID 없음: 신규 쿠폰은 다음 발행 시 처음 생성하고 취소 단계는 건너뜁니다.");
    if (!contractId) issues.push("계약ID 누락");
    if (!automationTemplateName(template)) issues.push("쿠폰명 누락");
    if (!template.discountType) issues.push("할인방식 누락");
    const discountValue = profitNumber(template.discountValue);
    if (discountValue <= 0) issues.push("할인값 0 또는 누락");
    if (template.discountType === "율" && (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 99)) issues.push("정률 할인은 1~99 정수만 가능");
    if (template.discountType === "율" && profitNumber(template.maxDiscountPrice) < 10) issues.push("정률 최대할인금액은 10원 이상 필요");
    if (template.discountType !== "율" && (discountValue < 10 || discountValue % 10 !== 0)) issues.push("정액 할인은 10원 이상, 10원 단위 필요");
    if (!options.length) issues.push("대상 상품·옵션 없음");
    if (options.some((option) => !cleanDigitsOnly(option.optionId))) issues.push("유효하지 않은 옵션ID 포함");

    if (contractRows.length && contractId && !contractRows.some((row) => displayText(row.contractId) === contractId)) {
      issues.push(`계약ID ${contractId}를 현재 계약목록에서 찾지 못함`);
    }
    // V207: 쿠폰명은 사람이 바꿀 수 있고 서로 다른 옵션에서 같은 이름을 사용할 수 있으므로
    // 이름이 아니라 vendorItemId(옵션ID)의 실제 APPLIED 소유관계로 중복을 판정합니다.
    const expectedIds = Array.from(new Set(options.map((option) => cleanDigitsOnly(option.optionId)).filter(Boolean)));
    const optionOwners = new Map<string, string[]>();
    for (const optionId of expectedIds) optionOwners.set(optionId, []);

    const appliedCoupons = couponRows.filter((row) => displayText(row.status).toUpperCase() === "APPLIED");
    for (const couponRow of appliedCoupons) {
      const appliedCouponId = displayText(couponRow.couponId);
      if (!appliedCouponId) continue;
      const actualIds = await appliedItemIds(appliedCouponId);
      for (const optionId of expectedIds) {
        if (!actualIds.has(optionId)) continue;
        const owners = optionOwners.get(optionId) || [];
        if (!owners.includes(appliedCouponId)) owners.push(appliedCouponId);
        optionOwners.set(optionId, owners);
      }
    }

    const duplicatedOptions = expectedIds.filter((optionId) => (optionOwners.get(optionId) || []).length > 1);
    for (const optionId of duplicatedOptions) {
      const owners = optionOwners.get(optionId) || [];
      issues.push(`옵션ID ${optionId}가 APPLIED 쿠폰 ${owners.length}개(${owners.join(", ")})에 중복 적용됨`);
    }

    const ownerIds = Array.from(new Set(expectedIds.flatMap((optionId) => optionOwners.get(optionId) || [])));
    const missingIds = expectedIds.filter((optionId) => (optionOwners.get(optionId) || []).length === 0);
    const currentCouponIsApplied = Boolean(couponId && appliedCoupons.some((row) => displayText(row.couponId) === couponId));

    if (!duplicatedOptions.length && ownerIds.length === 1) {
      const candidateId = ownerIds[0];
      const allExpectedOnCandidate = expectedIds.length > 0 && expectedIds.every((optionId) => (optionOwners.get(optionId) || []).includes(candidateId));
      if (allExpectedOnCandidate) {
        if (candidateId !== couponId) {
          reconciledCouponId = candidateId;
          reconciliation = "applied_verified";
          verificationPasses = 3;
          notes.push(`옵션ID 기준으로 실제 APPLIED couponId ${candidateId} 및 대상 옵션 ${expectedIds.length}건을 확인해 현재 쿠폰ID를 자동 복구합니다.`);
        } else {
          notes.push(`현재 couponId ${candidateId}에 대상 옵션 ${expectedIds.length}건이 실제 APPLIED로 연결된 것을 확인했습니다.`);
        }
      } else if (currentCouponIsApplied && missingIds.length) {
        issues.push(`현재 APPLIED 쿠폰에 대상 옵션 ${missingIds.join(", ")}이 연결되어 있지 않음`);
      }
    } else if (!duplicatedOptions.length && ownerIds.length > 1) {
      issues.push(`대상 옵션들이 서로 다른 APPLIED 쿠폰(${ownerIds.join(", ")})에 분산되어 있어 자동 판정할 수 없음`);
    } else if (!duplicatedOptions.length && currentCouponIsApplied && missingIds.length) {
      issues.push(`현재 APPLIED couponId ${couponId}에 대상 옵션 ${missingIds.join(", ")}이 연결되어 있지 않음`);
    }

    const sameNameCount = couponRows.filter((row) => displayText(row.couponName) === nextCouponName).length;
    if (sameNameCount > 1) notes.push(`같은 쿠폰명 ${sameNameCount}건이 있으나 옵션ID가 중복되지 않아 정상으로 허용합니다.`);

    let checkedOptions = 0;
    if (!issues.length) {
      const optionIds = Array.from(new Set(options.map((option) => cleanDigitsOnly(option.optionId)).filter(Boolean))).slice(0, limit);
      const optionChecks: Array<{ optionId: string; result: ExternalApiResult }> = [];
      for (let index = 0; index < optionIds.length; index += 10) {
        const batch = optionIds.slice(index, index + 10);
        const checked = await Promise.all(batch.map(async (optionId) => {
          const verified = await couponOptionExistsWithThreePasses(env, optionId);
          verificationPasses = Math.max(verificationPasses, verified.attempts.length);
          if (verified.ok && verified.attempts.length > 1) notes.push(`옵션ID ${optionId}는 ${verified.attempts.length}회차 재검증에서 정상 확인됐습니다.`);
          return { optionId, result: verified.result };
        }));
        optionChecks.push(...checked);
        if (index + 10 < optionIds.length) await sleepMs(150);
      }
      checkedOptions = optionChecks.length;
      for (const check of optionChecks) {
        if (!check.result.ok) issues.push(`옵션ID ${check.optionId} 판매상태 확인 실패 HTTP ${check.result.status}`);
      }
      if (options.length > limit) notes.push(`대상 옵션 ${options.length}개 중 앞 ${limit}개를 API로 표본 점검했습니다. 나머지는 쿠폰 생성 직전 쿠팡 응답으로 최종 확인합니다.`);
    }

    output.push({
      templateId,
      couponId,
      couponName: automationTemplateName(template),
      nextCouponName,
      ok: issues.length === 0,
      issues,
      notes,
      checkedOptions,
      startAt: window.startAt,
      endAt: window.endAt,
      reconciledCouponId,
      reconciliation,
      verificationPasses,
    });
  }
  return output;
}

async function couponAutomationPreflight(request: Request, env: Env) {
  const body = await readJson<PreviewBody>(request).catch(() => ({} as PreviewBody));
  const settings = body.couponApiSettings || {};
  const schedules = normalizeScheduleConfig(body.schedules);
  const templates = normalizeRollingTemplates(settings.rollingTemplates || body.rows);
  if (!templates.length) return jsonResponse({ ok: false, message: "사전검증할 쿠폰이 없습니다." }, { status: 400 });
  const rows = await performCouponAutomationPreflight(env, templates, schedules);
  const passed = rows.filter((row) => row.ok).length;
  const reconciledTemplateIds = rows.filter((row) => row.reconciliation === "applied_verified").map((row) => row.templateId).filter(Boolean);
  if (reconciledTemplateIds.length && supabaseConfigured(env)) {
    const db = supabaseAdmin(env);
    const now = new Date().toISOString();
    await db.from("coupon_automation_failures")
      .update({ status: "resolved", resolved_at: now, acknowledged_at: now })
      .in("template_id", reconciledTemplateIds)
      .in("status", ["unacknowledged", "acknowledged"]);
  }
  return jsonResponse({
    ok: passed > 0,
    mode: "coupang_coupon_automation_preflight_v203_reconciled",
    summary: {
      rows,
      passed,
      failed: rows.length - passed,
      reconciled: rows.filter((row) => row.reconciliation === "applied_verified").length,
      threePassVerified: rows.filter((row) => (row.verificationPasses || 0) >= 3).length,
      checkedAtKst: `${kstDateText()} ${kstTimeText()}`,
    },
    safety: safetyStatus(env),
    message: `쿠폰 자동운영 사전검증: 통과 ${passed}개, 확인필요 ${rows.length - passed}개. 실제 APPLIED 상태 교차복구 ${rows.filter((row) => row.reconciliation === "applied_verified").length}개. 옵션 API는 실패 시 최대 3회 검증합니다.`,
  });
}

async function enqueueCouponRetry(env: Env, input: {
  retryKey: string;
  settingsKey: string;
  template: RollingCouponTemplate;
  stage: CouponRetryStage;
  runAt: string;
  payload: Record<string, unknown>;
  error: string;
  attempt?: number;
}) {
  if (!supabaseConfigured(env)) throw new Error("Supabase가 없어 30분 재시도 작업을 저장할 수 없습니다.");
  const db = supabaseAdmin(env);
  const now = new Date().toISOString();
  const { error } = await db.from("coupon_automation_retries").upsert({
    retry_key: input.retryKey,
    settings_key: input.settingsKey,
    platform: "coupang",
    template_id: automationTemplateId(input.template),
    stage: input.stage,
    attempt: Number.isFinite(input.attempt) ? Number(input.attempt) : 3,
    run_at: input.runAt,
    status: "pending",
    payload: { ...input.payload, template: input.template },
    last_error: input.error,
    updated_at: now,
  }, { onConflict: "retry_key" });
  if (error) throw error;
}

async function recordCouponAutomationFailure(env: Env, input: {
  failureKey: string;
  settingsKey: string;
  template: RollingCouponTemplate;
  couponId?: string;
  stage: string;
  attemptCount: number;
  errorCode?: string;
  errorMessage: string;
  payload?: Record<string, unknown>;
}) {
  if (!supabaseConfigured(env)) return;
  const db = supabaseAdmin(env);
  await db.from("coupon_automation_failures").upsert({
    failure_key: input.failureKey,
    settings_key: input.settingsKey,
    platform: "coupang",
    template_id: automationTemplateId(input.template),
    coupon_id: input.couponId || displayText(input.template.latestCouponId || input.template.sourceCouponId),
    coupon_name: automationTemplateName(input.template),
    stage: input.stage,
    status: "unacknowledged",
    attempt_count: input.attemptCount,
    error_code: input.errorCode || "",
    error_message: safeText(input.errorMessage, 800),
    payload: input.payload || {},
  }, { onConflict: "failure_key" });
}

async function couponAutomationFailures(request: Request, env: Env) {
  if (!supabaseConfigured(env)) return jsonResponse({ ok: false, message: "Supabase가 설정되지 않았습니다." }, { status: 400 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "unacknowledged";
  const db = supabaseAdmin(env);
  let query = db.from("coupon_automation_failures").select("id,template_id,coupon_id,coupon_name,stage,status,attempt_count,error_code,error_message,created_at").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") query = query.eq("status", status);
  const [{ data, error }, retryResult] = await Promise.all([
    query,
    db.from("coupon_automation_retries").select("template_id,stage,run_at,status").eq("status", "pending").order("run_at", { ascending: true }).limit(300),
  ]);
  if (error) throw error;
  const retryRows = retryResult.error ? [] : (retryResult.data || []);
  const nextRetryByTemplate = new Map<string, string>();
  for (const retry of retryRows) {
    const key = displayText((retry as Record<string, unknown>).template_id);
    const runAt = displayText((retry as Record<string, unknown>).run_at);
    if (key && runAt && !nextRetryByTemplate.has(key)) nextRetryByTemplate.set(key, runAt);
  }
  const grouped = new Map<string, Record<string, unknown>>();
  for (const raw of data || []) {
    const row = raw as Record<string, unknown>;
    const key = `${displayText(row.template_id)}|${displayText(row.stage)}`;
    const current = grouped.get(key);
    if (!current) grouped.set(key, { ...row, repeated_count: 1, next_retry_at: nextRetryByTemplate.get(displayText(row.template_id)) || "" });
    else current.repeated_count = Number(current.repeated_count || 1) + 1;
  }
  const rows = Array.from(grouped.values()).slice(0, 100);
  return jsonResponse({ ok: true, summary: { rows, count: rows.length, rawCount: (data || []).length }, message: `쿠폰 미확인 incident ${rows.length}건을 확인했습니다. 중복 실패 원문 ${(data || []).length}건은 incident별로 묶었습니다.` });
}

async function couponAutomationFailureAcknowledge(request: Request, env: Env) {
  const body = await readJson<Record<string, unknown>>(request);
  const id = Number(body.id);
  const templateId = displayText(body.templateId);
  const stage = displayText(body.stage);
  if (!Number.isFinite(id) && !templateId) return jsonResponse({ ok: false, message: "확인할 실패 ID 또는 반복대상 ID가 없습니다." }, { status: 400 });
  const db = supabaseAdmin(env);
  let query = db.from("coupon_automation_failures").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() });
  if (templateId) {
    query = query.eq("template_id", templateId).eq("status", "unacknowledged");
    if (stage) query = query.eq("stage", stage);
  } else query = query.eq("id", id);
  const { data, error } = await query.select("id");
  if (error) throw error;
  return jsonResponse({ ok: true, summary: { acknowledged: (data || []).length }, message: `같은 쿠폰·단계의 미확인 실패 ${(data || []).length || 1}건을 확인 완료로 처리했습니다. 운영이력은 보존됩니다.` });
}

async function couponAutomationStop(request: Request, env: Env) {
  const body = await readJson<Record<string, unknown>>(request).catch(() => ({} as Record<string, unknown>));
  const settingsKey = displayText(body.settingsKey) || "default";
  if (!supabaseConfigured(env)) return jsonResponse({ ok: false, message: "Supabase가 설정되지 않아 대기 중 재시도를 취소할 수 없습니다." }, { status: 400 });
  const db = supabaseAdmin(env);
  const now = new Date().toISOString();
  const templateIds = Array.isArray(body.templateIds)
    ? body.templateIds.map((value) => displayText(value)).filter(Boolean)
    : [];
  let retryQuery = db.from("coupon_automation_retries")
    .update({ status: "cancelled", last_error: templateIds.length ? "사용자가 선택 쿠폰을 취소하여 해당 쿠폰의 대기 재시도를 취소했습니다." : "사용자가 자동운영을 중지하여 대기 재시도를 취소했습니다.", updated_at: now })
    .eq("settings_key", settingsKey)
    .in("status", ["pending", "running"]);
  if (templateIds.length) retryQuery = retryQuery.in("template_id", templateIds);
  const { data, error } = await retryQuery.select("id");
  if (error) throw error;
  await saveSchedulerAudit(env, "coupon_automation_stopped_v187", { settingsKey, cancelledRetryIds: (data || []).map((row) => row.id), stoppedAt: now });
  return jsonResponse({ ok: true, mode: "coupon_automation_stop_v200", summary: { settingsKey, cancelledRetries: (data || []).length }, message: templateIds.length
    ? `선택 쿠폰의 대기 재시도 ${(data || []).length}건을 취소했습니다.`
    : `자동운영 대기 재시도 ${(data || []).length}건을 취소했습니다. 현재 활성 쿠폰은 자체 종료시각까지 유지됩니다.` });
}


async function couponAutomationManualRetry(request: Request, env: Env) {
  const body = await readJson<Record<string, unknown>>(request);
  const id = Number(body.id);
  if (!Number.isFinite(id)) return jsonResponse({ ok: false, message: "재실행할 실패 ID가 없습니다." }, { status: 400 });
  if (!supabaseConfigured(env)) return jsonResponse({ ok: false, message: "Supabase가 설정되지 않았습니다." }, { status: 400 });
  const db = supabaseAdmin(env);
  const { data, error } = await db.from("coupon_automation_failures").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return jsonResponse({ ok: false, message: "실패 기록을 찾지 못했습니다." }, { status: 404 });
  const failure = data as Record<string, unknown>;
  const savedPayload = await loadLatestSchedulerPayload(env);
  const settings = objectRecord(savedPayload.couponApiSettings) as CouponApiSettings;
  const schedules = normalizeScheduleConfig(savedPayload.schedules);
  const templates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || settings.rollingTemplates);
  const failurePayload = objectRecord(failure.payload);
  const templateFromPayload = objectRecord(failurePayload.template) as RollingCouponTemplate;
  const template = templates.find((item) => automationTemplateId(item) === displayText(failure.template_id)) || templateFromPayload;
  if (!automationTemplateId(template)) return jsonResponse({ ok: false, message: "실패 쿠폰 템플릿을 찾지 못했습니다." }, { status: 400 });
  const nowDate = kstDateText();
  const settingsKey = displayText(failure.settings_key) || displayText(savedPayload.settingsKey) || "default";
  let result: Record<string, unknown> = { ok: false, message: "지원하지 않는 실패 단계입니다." };

  if (failure.stage === "preflight") {
    const rows = await performCouponAutomationPreflight(env, [template], schedules, nowDate);
    const row = rows[0];
    result = { ok: Boolean(row?.ok), message: row?.ok ? "수동 사전검증을 통과했습니다." : `수동 사전검증 실패: ${(row?.issues || []).join(" / ")}`, row };
  } else if (failure.stage === "cancel") {
    result = await cancelOneAutomationTemplate(env, template, settings, schedules, nowDate, settingsKey) as unknown as Record<string, unknown>;
  } else if (failure.stage === "create_apply") {
    result = await applyOneAutomationTemplate(env, template, settings, schedules, nowDate, settingsKey, false) as unknown as Record<string, unknown>;
  } else if (failure.stage === "cleanup") {
    const couponIds = uniqueCouponIdList(normalizeCouponIdList(failure.coupon_id || failurePayload.couponIds));
    const cleanupSettings: CouponApiSettings = { selectedCouponId: couponIds.join(","), rollingTemplates: [{ ...template, latestCouponId: couponIds[0] }], dailyRollingEnabled: true, automationEnabled: true };
    const cleanupRows = [{ latestCouponId: couponIds.join(","), sourceCouponId: couponIds.join(","), rollingTemplateId: automationTemplateId(template) }];
    const cleanup = await runCoupangCouponCancel(env, cleanupRows, cleanupSettings);
    result = { ok: cleanup.ok, message: cleanup.message };
  }

  if (result.ok) {
    await db.from("coupon_automation_failures").update({ status: "resolved", resolved_at: new Date().toISOString(), acknowledged_at: new Date().toISOString() }).eq("id", id);
  }
  return jsonResponse({ ok: Boolean(result.ok), mode: "coupon_automation_manual_retry_v200", summary: { failureId: id, templateId: automationTemplateId(template), stage: failure.stage, result }, message: displayText(result.message) || (result.ok ? "수동 재실행에 성공했습니다." : "수동 재실행에 실패했습니다.") });
}

async function couponTemplateActionState(env: Env, dateText: string, templateId: string, action: string): Promise<"success" | "pending" | "failed" | "none"> {
  if (!supabaseConfigured(env)) return "none";
  const db = supabaseAdmin(env);
  const { data, error } = await db.from("operation_audit_logs")
    .select("payload,created_at")
    .eq("event_type", "coupon_template_action_v200")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const found = (data || []).find((row) => {
    const payload = objectRecord((row as { payload?: unknown }).payload);
    return payload.date === dateText && payload.templateId === templateId && payload.action === action;
  });
  if (!found) return "none";
  const payload = objectRecord((found as { payload?: unknown }).payload);
  if (payload.ok === true) return "success";
  if (payload.pending === true || payload.queued === true) return "pending";
  return "failed";
}

async function couponTemplateActionSucceeded(env: Env, dateText: string, templateId: string, action: string) {
  return (await couponTemplateActionState(env, dateText, templateId, action)) === "success";
}

async function recordCouponTemplateAction(env: Env, payload: Record<string, unknown>) {
  await saveSchedulerAudit(env, "coupon_template_action_v200", payload);
}

async function retryImmediate<T extends { ok: boolean; message?: string }>(
  runner: () => Promise<T>,
  delays: number[],
) {
  let last: T | null = null;
  const attempts: Array<Record<string, unknown>> = [];
  for (let index = 0; index < delays.length; index += 1) {
    const delay = delays[index];
    if (delay > 0) await sleepMs(delay);
    try {
      last = await runner();
      attempts.push({ attempt: index + 1, ok: last.ok, message: last.message || "" });
      if (last.ok) return { result: last, attempts };
    } catch (error) {
      attempts.push({ attempt: index + 1, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { result: last, attempts };
}

async function resolvePendingCouponCancelOperations(
  env: Env,
  operations: CouponCancelPendingOperation[],
) {
  const completedCouponIds: string[] = [];
  const pendingOperations: CouponCancelPendingOperation[] = [];
  const failedOperations: Array<CouponCancelPendingOperation & { status: string; message: string }> = [];

  for (const operation of operations) {
    const poll = await pollCoupangCouponRequestStatus(env, operation.requestedId, {
      requireCouponId: false,
      delays: [0, 3_000, 7_000],
    });
    if (poll.ok) {
      completedCouponIds.push(operation.couponId);
    } else if (poll.pending) {
      pendingOperations.push(operation);
    } else {
      failedOperations.push({
        ...operation,
        status: poll.status || "FAIL",
        message: poll.summary?.message || "쿠팡 쿠폰 파기 요청상태가 FAIL로 확인됐습니다.",
      });
    }
  }

  return {
    ok: operations.length > 0 && completedCouponIds.length === operations.length,
    pending: pendingOperations.length > 0,
    completedCouponIds,
    pendingOperations,
    failedOperations,
    message: completedCouponIds.length === operations.length
      ? `쿠팡 쿠폰 파기 요청 ${completedCouponIds.length}건이 DONE으로 확인됐습니다.`
      : `쿠팡 쿠폰 파기 상태확인: 완료 ${completedCouponIds.length}건, 대기 ${pendingOperations.length}건, 실패 ${failedOperations.length}건.`,
  };
}

async function cancelOneAutomationTemplate(env: Env, template: RollingCouponTemplate, settings: CouponApiSettings, schedules: SchedulerConfig, nowDate: string, settingsKey: string, allowLookupRetry = true) {
  const currentCouponId = displayText(template.latestCouponId || template.lastGeneratedCouponId || template.sourceCouponId);
  if (!currentCouponId) {
    const message = "현재 쿠폰ID가 없는 신규 예약 대상이므로 취소 단계를 건너뛰고 다음 발행 단계로 진행합니다.";
    await recordCouponTemplateAction(env, {
      date: nowDate,
      templateId: automationTemplateId(template),
      couponId: "",
      action: "cancel",
      ok: true,
      skipped: "no_current_coupon",
      message,
      nowKst: `${nowDate} ${kstTimeText()}`,
    });
    return { ok: true, skipped: "no_current_coupon", message, attempts: [] };
  }

  const rows = templateRowsForAutomation(template, "cancel", schedules, nowDate);
  const localSettings: CouponApiSettings = {
    ...settings,
    selectedCouponId: currentCouponId,
    rollingTemplates: [template],
    automationEnabled: true,
  };
  const result = await runCoupangCouponCancel(env, rows, localSettings);
  const attempts = [{
    attempt: 1,
    ok: result.ok,
    pending: result.pending,
    message: result.message || "",
    requestedIds: result.cancelRequestedIds || [],
  }];

  if (result.ok) {
    await recordCouponTemplateAction(env, {
      date: nowDate,
      templateId: automationTemplateId(template),
      couponId: currentCouponId,
      action: "cancel",
      ok: true,
      attempts,
      message: result.message,
      nowKst: `${nowDate} ${kstTimeText()}`,
    });
    return { ok: true, pending: false, queued: false, message: result.message, attempts };
  }

  if (result.pending && result.pendingCancelOperations?.length) {
    const runAt = new Date(Date.now() + 60_000).toISOString();
    await enqueueCouponRetry(env, {
      retryKey: `${nowDate}|${automationTemplateId(template)}|cancel_status|${result.cancelRequestedIds.join("-")}`,
      settingsKey,
      template,
      stage: "cancel_status",
      runAt,
      attempt: 1,
      payload: { pendingOperations: result.pendingCancelOperations, nowDate },
      error: result.message || "쿠폰 파기 요청상태 확인 대기",
    });
    await recordCouponTemplateAction(env, {
      date: nowDate,
      templateId: automationTemplateId(template),
      couponId: currentCouponId,
      action: "cancel",
      ok: false,
      pending: true,
      queued: true,
      attempts,
      message: `${result.message} 1분 뒤 requestedId 상태만 다시 확인합니다.`,
      nowKst: `${nowDate} ${kstTimeText()}`,
    });
    return {
      ok: false,
      pending: true,
      queued: true,
      message: `${result.message} 1분 뒤 상태확인을 예약했습니다.`,
      attempts,
    };
  }

  const lookupFailed = objectRecord(result).lookupFailed === true;
  if (lookupFailed && allowLookupRetry) {
    const runAt = new Date(Date.now() + 5 * 60_000).toISOString();
    await enqueueCouponRetry(env, { retryKey: `${nowDate}|${automationTemplateId(template)}|cancel`, settingsKey, template, stage: "cancel", runAt, attempt: 1, payload: { nowDate }, error: result.message || "APPLIED 쿠폰 조회 실패" });
    await recordCouponTemplateAction(env, { date: nowDate, templateId: automationTemplateId(template), couponId: currentCouponId, action: "cancel", ok: false, pending: true, queued: true, attempts, message: `${result.message} 5분 뒤 자동 재조회합니다.`, nowKst: `${nowDate} ${kstTimeText()}` });
    return { ok: false, pending: true, queued: true, lookupFailed: true, message: `${result.message} 5분 뒤 자동 재조회합니다.`, attempts };
  }

  const message = result.message || "쿠폰 취소 실패";
  await recordCouponTemplateAction(env, {
    date: nowDate,
    templateId: automationTemplateId(template),
    couponId: currentCouponId,
    action: "cancel",
    ok: false,
    attempts,
    message,
    nowKst: `${nowDate} ${kstTimeText()}`,
  });
  await recordCouponAutomationFailure(env, {
    failureKey: `${nowDate}|${automationTemplateId(template)}|cancel`,
    settingsKey,
    template,
    stage: "cancel",
    attemptCount: 1,
    errorMessage: message,
    payload: { attempts, failedCouponIds: result.failedCouponIds || [] },
  });
  return { ok: false, pending: false, queued: false, message, attempts };
}

async function cleanupGeneratedCoupons(env: Env, template: RollingCouponTemplate, couponIds: string[], settingsKey: string, nowDate: string) {
  if (!couponIds.length) return { ok: true, message: "정리할 신규 쿠폰 없음" };
  const cleanupTemplate = { ...template, latestCouponId: couponIds[0], lastGeneratedCouponId: couponIds[0] };
  const cleanupSettings: CouponApiSettings = { selectedCouponId: couponIds.join(","), rollingTemplates: [cleanupTemplate], dailyRollingEnabled: true, automationEnabled: true };
  const cleanupRows = [{ latestCouponId: couponIds.join(","), sourceCouponId: couponIds.join(","), rollingTemplateId: automationTemplateId(template) }];
  const cleanup = await runCoupangCouponCancel(env, cleanupRows, cleanupSettings);
  if (cleanup.ok) return { ok: true, pending: false, message: cleanup.message || "비정상 신규 쿠폰 정리 완료" };

  if (cleanup.pending && cleanup.pendingCancelOperations?.length) {
    const runAt = new Date(Date.now() + 60_000).toISOString();
    await enqueueCouponRetry(env, {
      retryKey: `${nowDate}|${automationTemplateId(template)}|cleanup_cancel_status|${cleanup.cancelRequestedIds.join("-")}`,
      settingsKey,
      template,
      stage: "cancel_status",
      runAt,
      payload: { pendingOperations: cleanup.pendingCancelOperations, nowDate, cleanup: true },
      error: cleanup.message,
    });
    return { ok: false, pending: true, message: "정리 쿠폰 파기 요청은 접수됐습니다. 요청을 다시 보내지 않고 상태만 재확인합니다." };
  }

  const runAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await enqueueCouponRetry(env, { retryKey: `${nowDate}|${automationTemplateId(template)}|cleanup|${couponIds.join("-")}`, settingsKey, template, stage: "cleanup", runAt, payload: { couponIds }, error: cleanup.message || "신규 쿠폰 정리 실패" });
  await recordCouponAutomationFailure(env, { failureKey: `${nowDate}|${automationTemplateId(template)}|cleanup`, settingsKey, template, couponId: couponIds.join(","), stage: "cleanup", attemptCount: 1, errorMessage: cleanup.message || "신규 쿠폰 정리 실패", payload: { couponIds, runAt } });
  return { ok: false, pending: false, message: "생성됐지만 적용되지 않은 쿠폰 정리가 실패해 30분 뒤 재시도를 예약했습니다." };
}

async function applyOneAutomationTemplate(env: Env, template: RollingCouponTemplate, settings: CouponApiSettings, schedules: SchedulerConfig, nowDate: string, settingsKey: string, allowQueue = true, guardContext?: CouponIssueGuardContext, recordDailyApplyState = true) {
  const allRows = templateRowsForAutomation(template, "apply", schedules, nowDate);
  const expectedIds = couponVendorItemIds(allRows).map((value) => cleanDigitsOnly(value)).filter(Boolean);
  const guard = guardContext || await couponAppliedOwnershipSnapshot(env, expectedIds);
  if (!guard.lookupOk) {
    const message = "실제 APPLIED 쿠폰/옵션 조회 실패로 중복 위험을 피하기 위해 신규 발행을 차단했습니다.";
    return { ok: false, pending: true, safeBlocked: true, skipped: "applied_lookup_failed", message, attempts: [], generatedCouponIds: [] };
  }
  const duplicateOptionIds = expectedIds.filter((id) => (guard.ownersByOption.get(id) || []).length > 1);
  if (duplicateOptionIds.length) {
    const message = `옵션ID ${duplicateOptionIds.join(", ")}에 활성(APPLIED) 쿠폰이 2개 이상 존재하여 신규 발행을 차단했습니다.`;
    return { ok: false, pending: false, safeBlocked: true, skipped: "duplicate_active_coupon", duplicateOptionIds, message, attempts: [], generatedCouponIds: [] };
  }
  const missingIds = expectedIds.filter((id) => (guard.ownersByOption.get(id) || []).length === 0);
  if (!missingIds.length) {
    const existingCouponIds = uniqueCouponIdList(expectedIds.flatMap((id) => guard.ownersByOption.get(id) || []));
    const message = `대상 옵션 ${expectedIds.length}건에 실제 활성(APPLIED) 쿠폰이 이미 1개씩 존재하여 신규 발행하지 않습니다.`;
    if (recordDailyApplyState) await recordCouponTemplateAction(env, { date: nowDate, templateId: automationTemplateId(template), action: "apply", ok: true, skipped: "already_active", couponIds: existingCouponIds, message, nowKst: `${nowDate} ${kstTimeText()}` });
    return { ok: true, skipped: "already_active", message, attempts: [], generatedCouponIds: [], existingCouponIds };
  }
  const allOptionsInactive = expectedIds.length > 0 && missingIds.length === expectedIds.length;
  if (allOptionsInactive) {
    const observedMs = Date.parse(displayText(template.inactiveObservedAtIso));
    if (!Number.isFinite(observedMs)) {
      return { ok: false, pending: true, safeBlocked: true, skipped: "inactive_observed_30s_wait", inactiveObservedAtIso: new Date().toISOString(), waitMs: 30_000, message: "실제 APPLIED 0개를 처음 확인했습니다. 자연종료 지연/상태전파를 고려해 30초 뒤 다시 조회한 후 즉시 발행합니다.", attempts: [], generatedCouponIds: [] };
    }
    const inactiveElapsedMs = Date.now() - observedMs;
    if (inactiveElapsedMs >= 0 && inactiveElapsedMs < 30_000) {
      return { ok: false, pending: true, safeBlocked: true, skipped: "inactive_observed_30s_wait", inactiveObservedAtIso: template.inactiveObservedAtIso, waitMs: 30_000 - inactiveElapsedMs, message: "실제 APPLIED 0개 확인 후 30초 안전대기 중입니다. 다음 scheduler tick에서 재확인합니다.", attempts: [], generatedCouponIds: [] };
    }
  }
  const canceledAtMs = Date.parse(displayText(template.lastCanceledAtIso));
  if (Number.isFinite(canceledAtMs)) {
    const elapsedMs = Date.now() - canceledAtMs;
    if (elapsedMs >= 0 && elapsedMs < 30_000) {
      const waitMs = 30_000 - elapsedMs;
      return { ok: false, pending: true, safeBlocked: true, skipped: "post_cancel_30s_wait", waitMs, message: `쿠폰 종료 확인 후 30초 안전대기 중입니다. ${Math.ceil(waitMs / 1000)}초 이후 실제 APPLIED 상태를 다시 조회한 뒤 발행합니다.`, attempts: [], generatedCouponIds: [] };
    }
  }
  const missingSet = new Set(missingIds);
  const rows = allRows.filter((row) => missingSet.has(cleanDigitsOnly(couponRowRecord(row).optionId || couponRowRecord(row).vendorItemId)));
  const localSettings: CouponApiSettings = { ...settings, selectedCouponId: "", selectedContractId: template.contractId, rollingTemplates: [template], dailyRollingEnabled: true, automationEnabled: true };
  let lastResult: Awaited<ReturnType<typeof runCoupangCouponApply>> | null = null;
  const attempts: Array<Record<string, unknown>> = [];
  for (let attemptNo = 1; attemptNo <= 2; attemptNo += 1) {
    if (attemptNo === 2) await sleepMs(10_000);
    lastResult = await runCoupangCouponApply(env, rows, localSettings);
    attempts.push({ attempt: attemptNo, ok: lastResult.ok, message: lastResult.message || "", generatedCouponIds: lastResult.generatedCouponIds || [], pendingOperations: lastResult.pendingOperations || [] });
    if (lastResult.ok) break;
    const pendingOperations = Array.isArray(lastResult.pendingOperations) ? lastResult.pendingOperations : [];
    if (pendingOperations.length) {
      const message = "쿠팡 비동기 요청이 처리 중이므로 중복 쿠폰을 만들지 않고 30분 뒤 요청상태만 최종 확인합니다.";
      if (allowQueue) {
        const runAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await enqueueCouponRetry(env, { retryKey: `${nowDate}|${automationTemplateId(template)}|request_status`, settingsKey, template, stage: "request_status", runAt, payload: { pendingOperations, schedules, couponApiSettings: settings, nowDate }, error: message });
        if (recordDailyApplyState) await recordCouponTemplateAction(env, { date: nowDate, templateId: automationTemplateId(template), action: "apply", ok: false, queued: true, pending: true, attempts, message, nowKst: `${kstDateText()} ${kstTimeText()}` });
        return { ok: false, queued: true, pending: true, message, attempts, generatedCouponIds: lastResult.generatedCouponIds || [] };
      }
      return { ok: false, queued: false, pending: true, message: "최종 요청상태 확인에서도 처리 중입니다. 중복 생성 방지를 위해 수동 확인 대상으로 전환합니다.", attempts, generatedCouponIds: lastResult.generatedCouponIds || [] };
    }
    const generated = uniqueCouponIdList(normalizeCouponIdList(lastResult.generatedCouponIds));
    if (generated.length) {
      const cleanup = await cleanupGeneratedCoupons(env, template, generated, settingsKey, nowDate);
      if (!cleanup.ok) return { ok: false, queued: true, message: cleanup.message, attempts, generatedCouponIds: generated };
    }
  }
  if (lastResult?.ok) {
    const generatedIds = uniqueCouponIdList(normalizeCouponIdList(lastResult.generatedCouponIds));
    if (guardContext && generatedIds[0]) {
      for (const optionId of missingIds) guardContext.ownersByOption.set(optionId, [generatedIds[0]]);
    }
    if (recordDailyApplyState) await recordCouponTemplateAction(env, { date: nowDate, templateId: automationTemplateId(template), action: "apply", ok: true, attempts, generatedCouponIds: generatedIds, generatedCouponRecords: lastResult.generatedCouponRecords || [], missingOptionIds: missingIds, nowKst: `${nowDate} ${kstTimeText()}` });
    const issuedStartAt = displayText(couponRowRecord(rows[0] || {}).startAt);
    const issuedEndAt = displayText(couponRowRecord(rows[0] || {}).endAt);
    return { ok: true, queued: false, message: `${lastResult.message || "쿠폰 발행 완료"} 활성쿠폰이 없던 옵션 ${missingIds.length}건만 발행했습니다.`, attempts, generatedCouponIds: generatedIds, generatedCouponRecords: lastResult.generatedCouponRecords || [], missingOptionIds: missingIds, issuedStartAt, issuedEndAt };
  }
  const message = lastResult?.message || "쿠폰 생성·적용 실패";
  if (allowQueue) {
    const runAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await enqueueCouponRetry(env, { retryKey: `${nowDate}|${automationTemplateId(template)}|create_apply`, settingsKey, template, stage: "create_apply", runAt, payload: { schedules, couponApiSettings: settings, nowDate }, error: message });
    await recordCouponAutomationFailure(env, { failureKey: `${nowDate}|${automationTemplateId(template)}|create_apply`, settingsKey, template, stage: "create_apply", attemptCount: 2, errorMessage: message, payload: { attempts, runAt } });
    if (recordDailyApplyState) await recordCouponTemplateAction(env, { date: nowDate, templateId: automationTemplateId(template), action: "apply", ok: false, queued: true, attempts, message, nowKst: `${kstDateText()} ${kstTimeText()}` });
    return { ok: false, queued: true, message: `${message} 30분 뒤 3차 최종 재시도를 예약했습니다.`, attempts, generatedCouponIds: [] };
  }
  if (recordDailyApplyState) {
    await recordCouponAutomationFailure(env, { failureKey: `${nowDate}|${automationTemplateId(template)}|create_apply_final`, settingsKey, template, stage: "create_apply", attemptCount: 3, errorMessage: message, payload: { attempts } });
    await recordCouponTemplateAction(env, { date: nowDate, templateId: automationTemplateId(template), action: "apply", ok: false, queued: false, attempts, message, nowKst: `${kstDateText()} ${kstTimeText()}` });
  }
  return { ok: false, queued: false, message, attempts, generatedCouponIds: [] };
}

type CouponIssueGuardContext = {
  lookupOk: boolean;
  ownersByOption: Map<string, string[]>;
  results: ExternalApiResult[];
  activeCouponCount: number;
  duplicateOptionIds: string[];
};

async function couponAppliedOwnershipSnapshot(env: Env, expectedVendorItems: Array<string | number>): Promise<CouponIssueGuardContext> {
  const expected = new Set(expectedVendorItems.map((value) => cleanDigitsOnly(value)).filter(Boolean));
  const ownersByOption = new Map<string, string[]>(Array.from(expected).map((id) => [id, []]));
  const listPath = configuredPath(env.COUPANG_COUPON_LIST_PATH, COUPANG_DEFAULT_COUPON_LIST_PATH);
  const results: ExternalApiResult[] = [];
  const couponIds: string[] = [];
  const seenCouponIds = new Set<string>();

  for (let page = 1; page <= 20; page += 1) {
    const listResult = await coupangSignedRequestWithRetry(env, "GET", listPath, { status: "APPLIED", page, size: 100, sort: "desc" });
    results.push(listResult);
    if (!listResult.ok) return { lookupOk: false, ownersByOption, results, activeCouponCount: couponIds.length, duplicateOptionIds: [] };
    const pageRows = collectCoupangCoupons(listResult.data);
    for (const row of pageRows) {
      const couponId = displayText(row.couponId);
      if (couponId && !seenCouponIds.has(couponId)) {
        seenCouponIds.add(couponId);
        couponIds.push(couponId);
      }
    }
    if (pageRows.length < 100) break;
  }

  // R8.3: 쿠팡 OpenAPI rate-limit 여유를 두기 위해 쿠폰별 옵션조회는 직렬화하고 호출 사이를 띄웁니다.
  for (let index = 0; index < couponIds.length; index += 1) {
    if (index > 0) await sleepMs(350);
    const couponId = couponIds[index];
    const itemResult = await couponItemsForAppliedVerification(env, couponId);
    results.push(...itemResult.results);
    // 하나의 APPLIED 쿠폰이라도 상품목록 조회에 실패하면 "활성 없음"으로 오판할 수 있으므로 신규 발행을 차단합니다.
    if (!itemResult.ok) return { lookupOk: false, ownersByOption, results, activeCouponCount: couponIds.length, duplicateOptionIds: [] };
    for (const optionId of expected) {
      if (!itemResult.ids.has(optionId)) continue;
      const owners = ownersByOption.get(optionId) || [];
      if (!owners.includes(couponId)) owners.push(couponId);
      ownersByOption.set(optionId, owners);
    }
  }

  const duplicateOptionIds = Array.from(ownersByOption.entries()).filter(([, owners]) => owners.length > 1).map(([optionId]) => optionId);
  return { lookupOk: true, ownersByOption, results, activeCouponCount: couponIds.length, duplicateOptionIds };
}

async function couponAppliedCoverage(env: Env, expectedVendorItems: number[]) {
  const snapshot = await couponAppliedOwnershipSnapshot(env, expectedVendorItems);
  const ownerMap = new Map<string, Set<string>>();
  for (const [optionId, owners] of snapshot.ownersByOption.entries()) {
    for (const couponId of owners) {
      const ids = ownerMap.get(couponId) || new Set<string>();
      ids.add(optionId);
      ownerMap.set(couponId, ids);
    }
  }
  const owners = Array.from(ownerMap.entries()).map(([couponId, ids]) => ({ couponId, ids }));
  return { ok: snapshot.lookupOk, lookupOk: snapshot.lookupOk, owners, results: snapshot.results, duplicateOptionIds: snapshot.duplicateOptionIds };
}

async function verifyAndRepairCouponApplied(
  env: Env,
  template: RollingCouponTemplate,
  settings: CouponApiSettings,
  schedules: SchedulerConfig,
  nowDate: string,
  settingsKey: string,
  finalAttempt = false,
) {
  const rows = templateRowsForAutomation(template, "apply", schedules, nowDate);
  const expectedIds = couponVendorItemIds(rows);
  const preferredCouponId = displayText(template.latestCouponId || template.lastGeneratedCouponId || template.sourceCouponId);
  const verified = await resolveActualAppliedCouponForOptions(env, preferredCouponId, expectedIds);
  if (verified.ok && verified.couponId) {
    return { ok: true, repaired: false, couponId: verified.couponId, message: `실제 APPLIED 쿠폰과 대상 옵션 ${expectedIds.length}건을 확인했습니다.` };
  }
  if (!verified.lookupOk || verified.ambiguous) {
    return { ok: false, pending: true, safeBlocked: true, message: verified.ambiguous ? "APPLIED 쿠폰이 중복되어 자동 재발행을 중단했습니다." : "APPLIED 쿠폰 조회 실패로 자동 재발행을 중단하고 다음 확인으로 넘깁니다." };
  }

  const coverage = await couponAppliedCoverage(env, expectedIds);
  if (!coverage.lookupOk) return { ok: false, pending: true, safeBlocked: true, message: "APPLIED 목록 조회 실패로 중복 위험을 피하기 위해 재발행하지 않습니다." };
  if (coverage.owners.length > 1) return { ok: false, pending: false, safeBlocked: true, message: `대상 옵션이 APPLIED 쿠폰 ${coverage.owners.length}개에 분산되어 자동 재발행을 중단했습니다.` };

  if (coverage.owners.length === 1) {
    const owner = coverage.owners[0];
    const missing = expectedIds.filter((id) => !owner.ids.has(cleanDigitsOnly(id)));
    if (!missing.length) return { ok: true, repaired: false, couponId: owner.couponId, message: "기존 APPLIED 쿠폰에서 모든 옵션을 확인했습니다." };
    const missingSet = new Set(missing.map((id) => cleanDigitsOnly(id)));
    const repairRows = rows.filter((row) => missingSet.has(cleanDigitsOnly(couponRowRecord(row).optionId || couponRowRecord(row).vendorItemId)));
    const repairSettings: CouponApiSettings = { ...settings, selectedMode: "existing", dailyRollingEnabled: false, selectedCouponId: owner.couponId, rollingTemplates: [template] };
    const repair = await runCoupangCouponApply(env, repairRows, repairSettings);
    if (repair.ok) {
      const check = await verifyCouponItemsActuallyApplied(env, owner.couponId, expectedIds, [0, 5_000, 5_000]);
      if (check.ok) return { ok: true, repaired: true, couponId: owner.couponId, message: `1분/30분 검증에서 누락 옵션 ${missing.length}건을 기존 쿠폰에 다시 적용했습니다.` };
    }
    return { ok: false, pending: !finalAttempt, message: `기존 쿠폰의 누락 옵션 ${missing.length}건 재적용에 실패했습니다.` };
  }

  // APPLIED 상태에 대상 옵션이 단 하나도 없을 때만 신규 쿠폰 생성을 허용합니다.
  // 이렇게 해야 1분/30분 재시도가 중복 쿠폰을 만들지 않습니다.
  const recreated = await applyOneAutomationTemplate(env, template, settings, schedules, nowDate, settingsKey, false);
  if (recreated.ok) {
    const ids = uniqueCouponIdList(normalizeCouponIdList(recreated.generatedCouponIds));
    return { ok: true, repaired: true, couponId: ids[0] || "", generatedCouponIds: ids, message: `APPLIED 쿠폰이 전혀 없어 안전 재발행을 완료했습니다. 신규 couponId ${ids[0] || "확인중"}.` };
  }
  return { ok: false, pending: !finalAttempt || Boolean(recreated.pending), message: displayText(recreated.message) || "안전 재발행에 실패했습니다." };
}

async function enqueueAppliedVerification(env: Env, template: RollingCouponTemplate, settingsKey: string, nowDate: string, stage: "applied_verify_1m" | "applied_verify_30m", delayMs: number) {
  const runAt = new Date(Date.now() + delayMs).toISOString();
  await enqueueCouponRetry(env, {
    retryKey: `${nowDate}|${automationTemplateId(template)}|${stage}`,
    settingsKey,
    template,
    stage,
    runAt,
    attempt: stage === "applied_verify_1m" ? 1 : 2,
    payload: { nowDate },
    error: stage === "applied_verify_1m" ? "1분 실제 APPLIED 검증 대기" : "30분 최종 APPLIED 검증 대기",
  });
  return runAt;
}

async function resolvePendingCouponOperations(
  env: Env,
  template: RollingCouponTemplate,
  pendingOperations: CouponPendingOperation[],
  settingsKey: string,
  nowDate: string,
) {
  const generatedCouponIds: string[] = [];
  const details: Array<Record<string, unknown>> = [];
  const itemCreatePath = configuredPath(env.COUPANG_COUPON_APPLY_PATH, COUPANG_DEFAULT_COUPON_ITEM_CREATE_PATH);
  for (const operation of pendingOperations) {
    const statusPoll = await pollCoupangCouponRequestStatus(env, operation.requestedId, { requireCouponId: operation.stage === "create_status", delays: [0, 2_000, 5_000] });
    details.push({ stage: operation.stage, requestedId: operation.requestedId, status: statusPoll.status, ok: statusPoll.ok, pending: statusPoll.pending });
    if (!statusPoll.ok) {
      if (!statusPoll.pending && operation.couponId) await cleanupGeneratedCoupons(env, template, [operation.couponId], settingsKey, nowDate);
      return { ok: false, pending: statusPoll.pending, message: statusPoll.pending ? "30분 뒤에도 쿠팡 요청이 처리 중입니다. 중복 생성 방지를 위해 수동 확인이 필요합니다." : `쿠팡 요청상태가 ${statusPoll.status || "FAIL"}로 확인됐습니다.`, generatedCouponIds, details };
    }
    if (operation.stage === "item_status") {
      if (operation.couponId) generatedCouponIds.push(operation.couponId);
      continue;
    }

    const couponId = statusPoll.couponId;
    if (!couponId) return { ok: false, pending: true, message: "쿠폰 생성 요청은 완료됐지만 couponId가 확인되지 않아 수동 확인이 필요합니다.", generatedCouponIds, details };
    generatedCouponIds.push(couponId);
    const itemPath = applyCoupangPathParams(itemCreatePath, env, { couponId });
    const itemResult = await coupangSignedRequestWithRetry(env, "POST", itemPath, undefined, { vendorItems: operation.vendorItems });
    const itemRequestedId = itemResult.ok ? requestedIdFromCoupang(itemResult.data) : "";
    if (!itemResult.ok || !itemRequestedId) {
      await cleanupGeneratedCoupons(env, template, [couponId], settingsKey, nowDate);
      return { ok: false, pending: false, message: "쿠폰 생성 후 상품 적용 요청에 실패해 신규 쿠폰 정리를 요청했습니다.", generatedCouponIds, details };
    }
    const itemPoll = await pollCoupangCouponRequestStatus(env, itemRequestedId, { requireCouponId: false, delays: [0, 2_000, 5_000] });
    details.push({ stage: "item_status", requestedId: itemRequestedId, couponId, status: itemPoll.status, ok: itemPoll.ok, pending: itemPoll.pending });
    if (!itemPoll.ok) {
      if (!itemPoll.pending) await cleanupGeneratedCoupons(env, template, [couponId], settingsKey, nowDate);
      return { ok: false, pending: itemPoll.pending, message: itemPoll.pending ? "상품 적용 요청이 계속 처리 중이므로 수동 확인이 필요합니다." : "상품 적용 요청이 실패해 신규 쿠폰 정리를 요청했습니다.", generatedCouponIds, details };
    }
  }
  return { ok: true, pending: false, message: "30분 뒤 최종 요청상태 확인에서 쿠폰 생성·상품 적용 완료를 확인했습니다.", generatedCouponIds: uniqueCouponIdList(generatedCouponIds), details };
}

async function processDueCouponRetries(env: Env, savedPayload: Record<string, unknown>, schedules: SchedulerConfig, actions: Array<Record<string, unknown>>) {
  if (!supabaseConfigured(env)) return;
  const db = supabaseAdmin(env);
  const nowIso = new Date().toISOString();
  const { data, error } = await db.from("coupon_automation_retries")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  const settings = objectRecord(savedPayload.couponApiSettings) as CouponApiSettings;
  const settingsKey = displayText(savedPayload.settingsKey) || "default";
  const currentTemplates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || settings.rollingTemplates);
  for (const row of data || []) {
    const retry = row as Record<string, unknown>;
    const id = Number(retry.id);
    const payload = objectRecord(retry.payload);
    const template = objectRecord(payload.template) as RollingCouponTemplate;
    const currentTemplate = currentTemplates.find((item) => automationTemplateId(item) === automationTemplateId(template));
    if (!settings.automationEnabled || !currentTemplate?.enabled || currentTemplate.automationState !== "active") {
      await db.from("coupon_automation_retries").update({ status: "cancelled", last_error: "자동운영 중지 또는 비활성 쿠폰으로 재시도를 실행하지 않았습니다.", updated_at: nowIso }).eq("id", id);
      actions.push({ action: "couponRetry", retryId: id, stage: retry.stage, templateId: retry.template_id, ok: true, skipped: "automation_stopped" });
      continue;
    }
    await db.from("coupon_automation_retries").update({ status: "running", updated_at: nowIso }).eq("id", id);
    let result: Record<string, unknown> = { ok: false, message: "지원하지 않는 재시도 단계" };
    try {
      if (retry.stage === "reconcile") {
        const retryDate = displayText(payload.nowDate) || kstDateText();
        const templateId = automationTemplateId(currentTemplate);
        const applyState = await couponTemplateActionState(env, retryDate, templateId, "apply");
        if (applyState === "success") {
          result = { ok: true, skipped: "already_applied", message: "해당 일자의 쿠폰 적용 성공 이력이 있어 self-healing을 종료합니다." };
        } else {
          const preflightRows = await performCouponAutomationPreflight(env, [currentTemplate], schedules, retryDate);
          const preflight = preflightRows[0];
          if (!preflight?.ok) {
            const attempt = Number(retry.attempt || 1);
            if (attempt < 6) {
              const backoff = [5, 10, 20, 30, 60][Math.min(attempt - 1, 4)];
              const runAt = new Date(Date.now() + backoff * 60_000).toISOString();
              await db.from("coupon_automation_retries").update({ status: "pending", attempt: attempt + 1, run_at: runAt, payload: { ...payload, template: currentTemplate, nowDate: retryDate }, last_error: (preflight?.issues || []).join(" / ") || "사전검증 실패", updated_at: new Date().toISOString() }).eq("id", id);
              actions.push({ action: "couponRetry", retryId: id, stage: retry.stage, templateId: retry.template_id, ok: false, pending: true, nextRunAt: runAt, message: `self-healing 사전검증 실패. ${backoff}분 뒤 다시 확인합니다.` });
              continue;
            }
            result = { ok: false, message: `self-healing 사전검증이 반복 실패했습니다: ${(preflight?.issues || []).join(" / ")}` };
            await recordCouponAutomationFailure(env, { failureKey: `${retryDate}|${templateId}|reconcile_final`, settingsKey, template: currentTemplate, stage: "reconcile", attemptCount: attempt, errorMessage: displayText(result.message), payload: { preflight } });
          } else {
            const cancelState = await couponTemplateActionState(env, retryDate, templateId, "cancel");
            if (cancelState !== "success") {
              const canceled = await cancelOneAutomationTemplate(env, currentTemplate, settings, schedules, retryDate, settingsKey, false);
              if (!canceled.ok) {
                const attempt = Number(retry.attempt || 1);
                const runAt = new Date(Date.now() + Math.min(60, 5 * Math.pow(2, Math.min(attempt - 1, 3))) * 60_000).toISOString();
                if (attempt < 6) {
                  await db.from("coupon_automation_retries").update({ status: "pending", attempt: attempt + 1, run_at: runAt, payload: { ...payload, template: currentTemplate, nowDate: retryDate }, last_error: displayText(canceled.message), updated_at: new Date().toISOString() }).eq("id", id);
                  actions.push({ action: "couponRetry", retryId: id, stage: retry.stage, templateId: retry.template_id, ok: false, pending: true, nextRunAt: runAt, message: `self-healing 취소/조회 확인대기: ${displayText(canceled.message)}` });
                  continue;
                }
                result = { ok: false, message: `self-healing 취소/조회가 반복 실패했습니다: ${displayText(canceled.message)}` };
              }
            }
            if (!result.ok) {
              const currentCancelState = await couponTemplateActionState(env, retryDate, templateId, "cancel");
              if (currentCancelState === "success") {
                const applied = await applyOneAutomationTemplate(env, currentTemplate, settings, schedules, retryDate, settingsKey, true);
                result = applied as unknown as Record<string, unknown>;
                if (applied.ok) {
                  const generatedIds = uniqueCouponIdList(normalizeCouponIdList(applied.generatedCouponIds));
                  const templates = normalizeRollingTemplates(settings.rollingTemplates).map((item) => automationTemplateId(item) === templateId && generatedIds[0] ? { ...item, latestCouponId: generatedIds[0], lastGeneratedCouponId: generatedIds[0], lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` } : item);
                  savedPayload.rollingCouponTemplates = templates;
                  savedPayload.couponApiSettings = { ...settings, rollingTemplates: templates, selectedCouponId: templates.map((item) => item.latestCouponId || item.sourceCouponId).filter(Boolean).join(","), lastGeneratedCouponIds: templates.map((item) => displayText(item.latestCouponId)).filter(Boolean), lastGeneratedCouponId: generatedIds[0] || settings.lastGeneratedCouponId, lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` };
                  await saveLatestSchedulerPayload(env, savedPayload);
                }
              }
            }
          }
        }
      } else if (retry.stage === "cancel") {
        const retryDate = displayText(payload.nowDate) || kstDateText();
        const canceled = await cancelOneAutomationTemplate(env, currentTemplate, settings, schedules, retryDate, settingsKey, false);
        result = canceled as unknown as Record<string, unknown>;
        if (!canceled.ok && Number(retry.attempt || 1) < 6) {
          const attempt = Number(retry.attempt || 1);
          const backoff = [5, 10, 20, 30, 60][Math.min(attempt - 1, 4)];
          const runAt = new Date(Date.now() + backoff * 60_000).toISOString();
          await db.from("coupon_automation_retries").update({ status: "pending", attempt: attempt + 1, run_at: runAt, payload: { ...payload, template: currentTemplate, nowDate: retryDate }, last_error: displayText(canceled.message), updated_at: new Date().toISOString() }).eq("id", id);
          actions.push({ action: "couponRetry", retryId: id, stage: retry.stage, templateId: retry.template_id, ok: false, pending: true, nextRunAt: runAt, message: `${displayText(canceled.message)} ${backoff}분 뒤 자동 재조회합니다.` });
          continue;
        }
      } else if (retry.stage === "cancel_status") {
        const pendingOperations = Array.isArray(payload.pendingOperations)
          ? payload.pendingOperations as CouponCancelPendingOperation[]
          : [];
        const retryDate = displayText(payload.nowDate) || kstDateText();
        const cancelStatus = await resolvePendingCouponCancelOperations(env, pendingOperations);
        result = cancelStatus as unknown as Record<string, unknown>;

        if (cancelStatus.ok) {
          await recordCouponTemplateAction(env, {
            date: retryDate,
            templateId: automationTemplateId(template),
            couponId: cancelStatus.completedCouponIds.join(","),
            action: "cancel",
            ok: true,
            attempts: Number(retry.attempt || 1) + 1,
            message: cancelStatus.message,
            nowKst: `${kstDateText()} ${kstTimeText()}`,
          });
        } else if (cancelStatus.pending && Number(retry.attempt || 1) < 6) {
          const nextAttempt = Number(retry.attempt || 1) + 1;
          const runAt = new Date(Date.now() + 60_000).toISOString();
          await db.from("coupon_automation_retries").update({
            status: "pending",
            attempt: nextAttempt,
            run_at: runAt,
            payload: { ...payload, pendingOperations: cancelStatus.pendingOperations, template },
            last_error: cancelStatus.message,
            updated_at: new Date().toISOString(),
          }).eq("id", id);
          actions.push({
            action: "couponRetry",
            retryId: id,
            stage: retry.stage,
            templateId: retry.template_id,
            ok: false,
            pending: true,
            nextRunAt: runAt,
            message: cancelStatus.message,
          });
          continue;
        } else {
          await recordCouponTemplateAction(env, {
            date: retryDate,
            templateId: automationTemplateId(template),
            action: "cancel",
            ok: false,
            pending: false,
            attempts: Number(retry.attempt || 1) + 1,
            message: cancelStatus.message,
            nowKst: `${kstDateText()} ${kstTimeText()}`,
          });
          await recordCouponAutomationFailure(env, {
            failureKey: `${retryDate}|${automationTemplateId(template)}|cancel_status_final`,
            settingsKey,
            template,
            stage: "cancel",
            attemptCount: Number(retry.attempt || 1) + 1,
            errorMessage: cancelStatus.message,
            payload: { pendingOperations, cancelStatus },
          });
        }
      } else if (retry.stage === "applied_verify_1m" || retry.stage === "applied_verify_30m") {
        const retryDate = displayText(payload.nowDate) || kstDateText();
        const finalAttempt = retry.stage === "applied_verify_30m";
        const repair = await verifyAndRepairCouponApplied(env, currentTemplate, settings, schedules, retryDate, settingsKey, finalAttempt);
        result = repair as unknown as Record<string, unknown>;
        if (repair.ok && displayText(repair.couponId)) {
          const repairedCouponId = displayText(repair.couponId);
          const templates = normalizeRollingTemplates(settings.rollingTemplates).map((item) => automationTemplateId(item) === automationTemplateId(currentTemplate) ? { ...item, latestCouponId: repairedCouponId, lastGeneratedCouponId: repairedCouponId, lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` } : item);
          const nextSettings = { ...settings, rollingTemplates: templates, selectedCouponId: templates.map((item) => item.latestCouponId || item.sourceCouponId).filter(Boolean).join(","), lastGeneratedCouponIds: templates.map((item) => displayText(item.latestCouponId)).filter(Boolean), lastGeneratedCouponId: repairedCouponId || settings.lastGeneratedCouponId, lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` };
          savedPayload.rollingCouponTemplates = templates;
          savedPayload.couponApiSettings = nextSettings;
          await saveLatestSchedulerPayload(env, savedPayload);
        } else if (!finalAttempt) {
          const nextRunAt = await enqueueAppliedVerification(env, currentTemplate, settingsKey, retryDate, "applied_verify_30m", 29 * 60_000);
          result = { ...result, pending: true, nextRunAt, message: `${displayText(result.message)} 30분 최종 검증을 예약했습니다.` };
        } else if (!repair.ok) {
          await recordCouponAutomationFailure(env, { failureKey: `${retryDate}|${automationTemplateId(currentTemplate)}|applied_verify_final`, settingsKey, template: currentTemplate, stage: "create_apply", attemptCount: 3, errorMessage: displayText(repair.message), payload: { repair } });
        }
      } else if (retry.stage === "create_apply") {
        const retryDate = displayText(payload.nowDate) || kstDateText();
        result = await applyOneAutomationTemplate(env, template, settings, schedules, retryDate, settingsKey, false) as unknown as Record<string, unknown>;
        if (result.ok) {
          const generatedIds = uniqueCouponIdList(normalizeCouponIdList(result.generatedCouponIds));
          const templates = normalizeRollingTemplates(settings.rollingTemplates).map((item) => {
            if (automationTemplateId(item) !== automationTemplateId(template) || !generatedIds[0]) return item;
            return { ...item, latestCouponId: generatedIds[0], lastGeneratedCouponId: generatedIds[0], lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` };
          });
          const nextSettings = { ...settings, rollingTemplates: templates, selectedCouponId: templates.map((item) => item.latestCouponId || item.sourceCouponId).filter(Boolean).join(","), lastGeneratedCouponIds: templates.map((item) => displayText(item.latestCouponId)).filter(Boolean), lastGeneratedCouponId: generatedIds[0] || settings.lastGeneratedCouponId, lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` };
          savedPayload.rollingCouponTemplates = templates;
          savedPayload.couponApiSettings = nextSettings;
          await saveLatestSchedulerPayload(env, savedPayload);
        }
      } else if (retry.stage === "cleanup") {
        const couponIds = uniqueCouponIdList(normalizeCouponIdList(payload.couponIds));
        const cleanupSettings: CouponApiSettings = { selectedCouponId: couponIds.join(","), rollingTemplates: [{ ...template, latestCouponId: couponIds[0] }], dailyRollingEnabled: true, automationEnabled: true };
        const cleanupRows = [{ latestCouponId: couponIds.join(","), sourceCouponId: couponIds.join(","), rollingTemplateId: automationTemplateId(template) }];
        const cleanup = await runCoupangCouponCancel(env, cleanupRows, cleanupSettings);
        if (cleanup.pending && cleanup.pendingCancelOperations?.length) {
          const runAt = new Date(Date.now() + 60_000).toISOString();
          await enqueueCouponRetry(env, {
            retryKey: `${kstDateText()}|${automationTemplateId(template)}|cleanup_cancel_status|${cleanup.cancelRequestedIds.join("-")}`,
            settingsKey,
            template,
            stage: "cancel_status",
            runAt,
            payload: { pendingOperations: cleanup.pendingCancelOperations, nowDate: kstDateText(), cleanup: true },
            error: cleanup.message,
          });
          result = { ok: true, pending: true, message: "정리 쿠폰 파기 요청 접수 후 상태 재확인을 예약했습니다." };
        } else {
          result = { ok: cleanup.ok, pending: false, message: cleanup.message };
        }
      } else if (retry.stage === "request_status") {
        const pendingOperations = Array.isArray(payload.pendingOperations) ? payload.pendingOperations as CouponPendingOperation[] : [];
        const retryDate = displayText(payload.nowDate) || kstDateText();
        result = await resolvePendingCouponOperations(env, template, pendingOperations, settingsKey, retryDate) as unknown as Record<string, unknown>;
        if (!result.ok) {
          await recordCouponAutomationFailure(env, { failureKey: `${retryDate}|${automationTemplateId(template)}|request_status_final`, settingsKey, template, stage: "create_apply", attemptCount: 3, errorMessage: displayText(result.message), payload: { pendingOperations, result } });
          await recordCouponTemplateAction(env, { date: retryDate, templateId: automationTemplateId(template), action: "apply", ok: false, pending: Boolean(result.pending), attempts: 3, message: displayText(result.message), nowKst: `${kstDateText()} ${kstTimeText()}` });
        } else {
          await recordCouponTemplateAction(env, { date: retryDate, templateId: automationTemplateId(template), action: "apply", ok: true, attempts: 3, generatedCouponIds: result.generatedCouponIds || [], message: displayText(result.message), nowKst: `${kstDateText()} ${kstTimeText()}` });
          const generatedIds = uniqueCouponIdList(normalizeCouponIdList(result.generatedCouponIds));
          const templates = normalizeRollingTemplates(settings.rollingTemplates).map((item) => automationTemplateId(item) === automationTemplateId(template) && generatedIds[0] ? { ...item, latestCouponId: generatedIds[0], lastGeneratedCouponId: generatedIds[0], lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` } : item);
          const nextSettings = { ...settings, rollingTemplates: templates, selectedCouponId: templates.map((item) => item.latestCouponId || item.sourceCouponId).filter(Boolean).join(","), lastGeneratedCouponIds: templates.map((item) => displayText(item.latestCouponId)).filter(Boolean), lastGeneratedCouponId: generatedIds[0] || settings.lastGeneratedCouponId, lastGeneratedAt: `${kstDateText()} ${kstTimeText()}` };
          savedPayload.rollingCouponTemplates = templates;
          savedPayload.couponApiSettings = nextSettings;
          await saveLatestSchedulerPayload(env, savedPayload);
        }
      }
      await db.from("coupon_automation_retries").update({ status: result.ok ? "success" : "failed", last_error: result.ok ? "" : displayText(result.message), updated_at: new Date().toISOString() }).eq("id", id);
      actions.push({ action: "couponRetry", retryId: id, stage: retry.stage, templateId: retry.template_id, ...result });
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : String(retryError);
      await db.from("coupon_automation_retries").update({ status: "failed", last_error: message, updated_at: new Date().toISOString() }).eq("id", id);
      actions.push({ action: "couponRetry", retryId: id, stage: retry.stage, ok: false, message });
    }
  }
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
        mode: `coupang_coupon_${action}_live_paths_v200`,
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
          cancelRequestedIds: action === "cancel" ? uniqueCouponIdList(normalizeCouponIdList(liveSummary.cancelRequestedIds)) : [],
          pendingCancelOperations: action === "cancel" && Array.isArray(liveSummary.pendingCancelOperations) ? liveSummary.pendingCancelOperations : [],
          failedCouponIds: action === "cancel" ? uniqueCouponIdList(normalizeCouponIdList(liveSummary.failedCouponIds)) : [],
          alreadyInactive: action === "cancel" ? Boolean(liveSummary.alreadyInactive) : false,
          noActiveAppliedCoupon: action === "cancel" ? Boolean(liveSummary.noActiveAppliedCoupon) : false,
          pending: action === "cancel" ? Boolean(liveSummary.pending) : Boolean(liveSummary.pendingOperations),
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
        "어드민플러스 설정시간별 주문 등록",
        "어드민플러스 운송장 회수·쿠팡/토스 등록",
        "서버 저장용량 점검·정리",
      ],
      manualButtons: "all core operations are available manually in the web app",
    },
    safety: safetyStatus(env),
    message: scheduledWritesAllowed(env)
      ? "스케줄러 Gate가 열려 있습니다. 저장된 시간 기준으로 쿠폰·어드민플러스 주문/송장·저장소 정리를 실행합니다."
      : "스케줄러 자동 실행 Preview를 완료했습니다. ALLOW_SCHEDULED_WRITES=false 상태입니다.",
  });
}

type SchedulerEntry = { enabled?: boolean; time?: string };
type SchedulerConfig = Record<string, SchedulerEntry>;

function normalizeScheduleConfig(value: unknown): SchedulerConfig {
  const input = value && typeof value === "object" ? (value as Record<string, SchedulerEntry>) : {};
  return {
    couponPreflight: { enabled: input.couponPreflight?.enabled !== false, time: input.couponPreflight?.time || "23:45" },
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
  options?: { retryOnFailure?: boolean },
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
  if (options?.retryOnFailure && result.ok === false) {
    await saveSchedulerAudit(env, "scheduler_action_retryable_failure_v208", auditPayload);
    actions.push({ action, runKey, status: "failed_retryable", ...result });
    return;
  }
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
  env = envWithApiEndpointSettings(env, savedPayload.apiEndpointSettings || manualBody?.apiEndpointSettings);
  const schedules = normalizeScheduleConfig(manualBody?.schedules || savedPayload.schedules);
  let couponApiSettings = objectRecord(savedPayload.couponApiSettings) as CouponApiSettings;
  let templates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);
  const nowDate = kstDateText();
  const nowText = kstTimeText();
  const settingsKey = displayText(savedPayload.settingsKey) || "default";
  const actions: Array<Record<string, unknown>> = [];

  if (!scheduledWritesAllowed(env)) {
    return jsonResponse({
      ok: true,
      mode: "scheduler_tick_gate_closed_v187",
      summary: { nowKst: `${nowDate} ${nowText}`, schedules, actions },
      safety: safetyStatus(env),
      message: "스케줄러 쓰기 Gate가 OFF라 자동 실행하지 않았습니다. 수동 버튼은 앱 화면에서 계속 사용할 수 있습니다.",
    });
  }

  if (!manualTick && !supabaseConfigured(env)) {
    return jsonResponse({
      ok: false,
      mode: "scheduler_tick_supabase_required_v187",
      summary: { nowKst: `${nowDate} ${nowText}`, schedules, actions },
      safety: safetyStatus(env),
      message: "자동 스케줄러 실행은 설정·재시도·중복실행 이력을 Supabase에 저장해야 사용할 수 있습니다.",
    });
  }

  await processDueCouponRetries(env, savedPayload, schedules, actions);
  couponApiSettings = objectRecord(savedPayload.couponApiSettings) as CouponApiSettings;
  templates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);

  const activeTemplates = activeCouponTemplates({ ...couponApiSettings, rollingTemplates: templates })
    .filter((template) => couponTemplateScheduleStarted(template, nowDate));
  const timePlus = (value: string, minutes: number) => {
    const base = timeToMinutes(value);
    if (!Number.isFinite(base)) return value;
    const total = (base + minutes + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const withinForwardWindow = (value: string, target: string, windowMinutes: number) => {
    const now = timeToMinutes(value);
    const start = timeToMinutes(target);
    if (!Number.isFinite(now) || !Number.isFinite(start)) return false;
    const diff = (now - start + 1440) % 1440;
    return diff >= 0 && diff <= windowMinutes;
  };

  const preflightTime = String(schedules.couponPreflight?.time || "23:45");
  const preflightAttempt = [preflightTime, timePlus(preflightTime, 2), timePlus(preflightTime, 4)].indexOf(nowText);
  if (couponApiSettings.automationEnabled && schedules.couponPreflight?.enabled !== false && activeTemplates.length && preflightAttempt >= 0) {
    const targetTemplates = preflightAttempt === 0
      ? activeTemplates
      : activeTemplates.filter((template) => template.preflightStatus !== "통과" || !displayText(template.preflightAt).startsWith(nowDate));
    if (targetTemplates.length) {
      const rows = await performCouponAutomationPreflight(env, targetTemplates, schedules, nowDate);
      const byId = new Map(rows.map((row) => [row.templateId, row]));
      templates = templates.map((template) => {
        const row = byId.get(automationTemplateId(template));
        if (!row) return template;
        return { ...template, preflightStatus: row.ok ? "통과" : "실패", preflightAt: `${nowDate} ${nowText}`, preflightIssues: row.issues, automationState: row.ok ? "active" : template.automationState };
      });
      couponApiSettings = { ...couponApiSettings, lastPreflightAt: `${nowDate} ${nowText}`, rollingTemplates: templates };
      savedPayload.rollingCouponTemplates = templates;
      savedPayload.couponApiSettings = couponApiSettings;
      await saveLatestSchedulerPayload(env, savedPayload);
      actions.push({ action: "couponPreflight", attempt: preflightAttempt + 1, passed: rows.filter((row) => row.ok).length, failed: rows.filter((row) => !row.ok).length, rows });
      if (preflightAttempt === 2) {
        for (const row of rows.filter((item) => !item.ok)) {
          const template = targetTemplates.find((item) => automationTemplateId(item) === row.templateId);
          if (!template) continue;
          await recordCouponAutomationFailure(env, { failureKey: `${nowDate}|${row.templateId}|preflight`, settingsKey, template, stage: "preflight", attemptCount: 3, errorMessage: row.issues.join(" / "), payload: { row } });
        }
      }
    }
  }

  // R8.3: 24시간 반복쿠폰은 매분 서버 tick은 유지하되, 쿠팡 API 조회는 적응형 간격으로 제한합니다.
  // 평상시 15분, 종료 전후 1시간은 1분, 종료 예정 +1시간 이후에도 APPLIED면 5분 간격입니다.
  if (couponApiSettings.automationEnabled && schedules.couponApply?.enabled !== false && activeTemplates.length) {
    const currentTemplates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);
    const nowMs = Date.now();
    const dueTemplates = currentTemplates.filter((item) => item.enabled && item.automationState === "active" && couponTemplateScheduleStarted(item, nowDate) && couponAdaptiveHealthCheckDue(item, nowMs));
    if (dueTemplates.length) {
      const allTargetIds = couponVendorItemIds(dueTemplates.flatMap((template) => templateRowsForAutomation(template, "apply", schedules, nowDate)));
      const guard = await couponAppliedOwnershipSnapshot(env, allTargetIds);
      const generatedByTemplate = new Map<string, { couponId: string; startAt: string; endAt: string }>();
      const resultByTemplate = new Map<string, Record<string, unknown>>();
      const gapResults: Array<Record<string, unknown>> = [];
      if (!guard.lookupOk) {
        for (const template of dueTemplates) {
          resultByTemplate.set(automationTemplateId(template), { ok: false, lookupFailed: true });
        }
        actions.push({ action: "couponAdaptiveHealthGuard", ok: false, safeBlocked: true, checkedTemplates: dueTemplates.length, message: "APPLIED 전수조회 실패로 신규 발행을 차단하고 5분 뒤 재확인합니다." });
      } else {
        for (const template of dueTemplates) {
          const templateId = automationTemplateId(template);
          const result = await applyOneAutomationTemplate(env, template, couponApiSettings, schedules, nowDate, settingsKey, false, guard, false);
          resultByTemplate.set(templateId, objectRecord(result));
          const generatedIds = uniqueCouponIdList(normalizeCouponIdList(result.generatedCouponIds));
          if (result.ok && generatedIds[0]) {
            generatedByTemplate.set(templateId, { couponId: generatedIds[0], startAt: displayText(result.issuedStartAt), endAt: displayText(result.issuedEndAt) });
            await enqueueAppliedVerification(env, { ...template, latestCouponId: generatedIds[0] }, settingsKey, nowDate, "applied_verify_1m", 60_000);
          }
          gapResults.push({ templateId, ...result });
        }
      }

      templates = currentTemplates.map((template) => {
        const templateId = automationTemplateId(template);
        if (!dueTemplates.some((item) => automationTemplateId(item) === templateId)) return template;
        const result = resultByTemplate.get(templateId) || {};
        const generated = generatedByTemplate.get(templateId);
        const lookupFailed = result.lookupFailed === true || result.skipped === "applied_lookup_failed";
        const observed = displayText(result.inactiveObservedAtIso);
        const alreadyActive = result.skipped === "already_active";
        const intervalMs = lookupFailed ? 5 * 60_000 : (result.skipped === "inactive_observed_30s_wait" ? 30_000 : couponAdaptiveHealthIntervalMs({ ...template, endAt: generated?.endAt || template.endAt }, nowMs));
        return {
          ...template,
          ...(generated ? { latestCouponId: generated.couponId, lastGeneratedCouponId: generated.couponId, lastGeneratedAt: `${nowDate} ${nowText}`, startAt: generated.startAt || template.startAt, endAt: generated.endAt || template.endAt } : {}),
          lastCouponHealthCheckedAtIso: new Date(nowMs).toISOString(),
          nextCouponHealthCheckAtIso: new Date(nowMs + intervalMs).toISOString(),
          inactiveObservedAtIso: generated || alreadyActive ? "" : (observed || template.inactiveObservedAtIso || ""),
          couponHealthBackoffMinutes: lookupFailed ? 5 : 0,
        };
      });
      couponApiSettings = { ...couponApiSettings, rollingTemplates: templates };
      savedPayload.rollingCouponTemplates = templates;
      savedPayload.couponApiSettings = couponApiSettings;
      await saveLatestSchedulerPayload(env, savedPayload);
      if (gapResults.length) {
        actions.push({
          action: "couponAdaptiveHealth",
          checkedTemplates: dueTemplates.length,
          issued: gapResults.filter((row) => Array.isArray(row.generatedCouponIds) && row.generatedCouponIds.length > 0).length,
          waiting30: gapResults.filter((row) => row.skipped === "inactive_observed_30s_wait").length,
          duplicateBlocked: gapResults.filter((row) => row.skipped === "duplicate_active_coupon").length,
          alreadyActive: gapResults.filter((row) => row.skipped === "already_active").length,
          results: gapResults,
        });
      }
    }
  }

  // R8.3: 24시간 반복쿠폰은 자연종료의 실제 APPLIED 해제를 기준으로 재발행하므로 정시 강제 파기는 사용하지 않습니다.
  const forceCouponExpireFor24hRollover = false;

  // 23:50~23:55: 오늘 사전점검을 통과한 쿠폰만 개별 취소합니다.
  if (forceCouponExpireFor24hRollover && couponApiSettings.automationEnabled && schedules.couponCancel?.enabled !== false && activeTemplates.length && withinForwardWindow(nowText, couponCancelExecutionTime(schedules), 5)) {
    const currentTemplates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);
    const eligible = currentTemplates.filter((template) => template.enabled && template.automationState === "active" && template.preflightStatus === "통과" && displayText(template.preflightAt).startsWith(nowDate));
    const results = await Promise.all(eligible.map(async (template) => {
      const state = await couponTemplateActionState(env, nowDate, automationTemplateId(template), "cancel");
      if (state !== "none") return { templateId: automationTemplateId(template), skipped: state, ok: state === "success" };
      return { templateId: automationTemplateId(template), ...(await cancelOneAutomationTemplate(env, template, couponApiSettings, schedules, nowDate, settingsKey)) };
    }));
    if (results.length) actions.push({ action: "couponCancel", results });
    const successful = new Set(results.filter((row) => row.ok).map((row) => row.templateId));
    if (successful.size) {
      const canceledAtIso = new Date().toISOString();
      templates = currentTemplates.map((template) => successful.has(automationTemplateId(template)) ? { ...template, lastCanceledAt: `${nowDate} ${nowText}`, lastCanceledAtIso: canceledAtIso } : template);
      couponApiSettings = { ...couponApiSettings, lastCanceledAt: `${nowDate} ${nowText}`, rollingTemplates: templates };
      savedPayload.rollingCouponTemplates = templates;
      savedPayload.couponApiSettings = couponApiSettings;
      await saveLatestSchedulerPayload(env, savedPayload);
    }
  }

  // 23:51~23:56: 해당 쿠폰의 취소 성공을 확인한 뒤에만 신규 쿠폰을 생성·적용합니다.
  if (forceCouponExpireFor24hRollover && couponApiSettings.automationEnabled && schedules.couponApply?.enabled !== false && activeTemplates.length && withinForwardWindow(nowText, String(schedules.couponApply?.time || "23:51"), 5)) {
    const currentTemplates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);
    const generatedByTemplate = new Map<string, string>();
    const results: Array<Record<string, unknown>> = [];
    const applyTemplates = currentTemplates.filter((item) => item.enabled && item.automationState === "active");
    const allTargetIds = couponVendorItemIds(applyTemplates.flatMap((template) => templateRowsForAutomation(template, "apply", schedules, nowDate)));
    const guardContext = await couponAppliedOwnershipSnapshot(env, allTargetIds);
    if (!guardContext.lookupOk) {
      actions.push({ action: "couponApplyGuard", ok: false, safeBlocked: true, message: "APPLIED 쿠폰/옵션 전수조회 실패로 전체 신규 발행을 차단했습니다." });
    }
    for (const template of applyTemplates) {
      const templateId = automationTemplateId(template);
      const applyState = await couponTemplateActionState(env, nowDate, templateId, "apply");
      if (applyState !== "none") {
        results.push({ templateId, skipped: applyState, ok: applyState === "success" });
        continue;
      }
      // 저장된 cancel 상태가 아니라 쿠팡의 실제 APPLIED 옵션 소유관계를 최종 기준으로 사용합니다.
      // 활성 쿠폰이 없고 방금 종료된 건이 아니면 즉시 발행하며, 방금 종료됐다면 최소 30초 후 다시 확인합니다.
      const result = await applyOneAutomationTemplate(env, template, couponApiSettings, schedules, nowDate, settingsKey, true, guardContext);
      const generatedIds = uniqueCouponIdList(normalizeCouponIdList(result.generatedCouponIds));
      if (result.ok) {
        if (generatedIds[0]) generatedByTemplate.set(templateId, generatedIds[0]);
        await enqueueAppliedVerification(env, { ...template, latestCouponId: generatedIds[0] || template.latestCouponId }, settingsKey, nowDate, "applied_verify_1m", 60_000);
      }
      results.push({ templateId, ...result });
    }
    if (results.length) actions.push({ action: "couponApply", results });
    if (generatedByTemplate.size) {
      templates = currentTemplates.map((template) => {
        const couponId = generatedByTemplate.get(automationTemplateId(template));
        return couponId ? { ...template, latestCouponId: couponId, lastGeneratedCouponId: couponId, lastGeneratedAt: `${nowDate} ${nowText}` } : template;
      });
      couponApiSettings = {
        ...couponApiSettings,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        selectedCouponId: templates.map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
        lastGeneratedCouponIds: templates.map((template) => displayText(template.latestCouponId)).filter(Boolean),
        lastGeneratedCouponId: templates.find((template) => generatedByTemplate.has(automationTemplateId(template)))?.latestCouponId || couponApiSettings.lastGeneratedCouponId,
        lastGeneratedAt: `${nowDate} ${nowText}`,
        rollingTemplates: templates,
      };
      savedPayload.rollingCouponTemplates = templates;
      savedPayload.couponApiSettings = couponApiSettings;
      await saveLatestSchedulerPayload(env, savedPayload);
    }
  }

  // 허용시간을 넘겼는데 실행 기록이 없으면 사용자 경고용 실패 이력을 남깁니다.
  const cancelMissedAt = timePlus(couponCancelExecutionTime(schedules), 6);
  if (couponApiSettings.automationEnabled && schedules.couponCancel?.enabled !== false && nowText === cancelMissedAt) {
    const currentTemplates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);
    for (const template of currentTemplates.filter((item) => item.enabled && item.automationState === "active" && item.preflightStatus === "통과" && displayText(item.preflightAt).startsWith(nowDate))) {
      const state = await couponTemplateActionState(env, nowDate, automationTemplateId(template), "cancel");
      if (state === "none") {
        const runAt = new Date(Date.now() + 60_000).toISOString();
        await enqueueCouponRetry(env, { retryKey: `${nowDate}|${automationTemplateId(template)}|reconcile`, settingsKey, template, stage: "reconcile", runAt, attempt: 1, payload: { nowDate }, error: "정규 롤오버 창을 놓쳐 self-healing 재조정을 예약했습니다." });
        actions.push({ action: "couponSelfHealing", templateId: automationTemplateId(template), stage: "reconcile", nextRunAt: runAt, reason: "cancel_window_missed" });
      }
    }
  }

  const applyMissedAt = timePlus(String(schedules.couponApply?.time || "23:51"), 6);
  if (couponApiSettings.automationEnabled && schedules.couponApply?.enabled !== false && nowText === applyMissedAt) {
    const currentTemplates = normalizeRollingTemplates(savedPayload.rollingCouponTemplates || couponApiSettings.rollingTemplates);
    for (const template of currentTemplates.filter((item) => item.enabled && item.automationState === "active")) {
      const cancelState = await couponTemplateActionState(env, nowDate, automationTemplateId(template), "cancel");
      const applyState = await couponTemplateActionState(env, nowDate, automationTemplateId(template), "apply");
      if (applyState === "none") {
        const runAt = new Date(Date.now() + 60_000).toISOString();
        await enqueueCouponRetry(env, { retryKey: `${nowDate}|${automationTemplateId(template)}|reconcile`, settingsKey, template, stage: "reconcile", runAt, attempt: 1, payload: { nowDate }, error: cancelState === "success" ? "생성·적용 보완창을 놓쳐 self-healing 발행을 예약했습니다." : "취소/발행 상태를 함께 재조정합니다." });
        actions.push({ action: "couponSelfHealing", templateId: automationTemplateId(template), stage: "reconcile", nextRunAt: runAt, reason: "apply_window_missed" });
      }
    }
  }

  const adminplusConfig = adminplusAutomationConfig(savedPayload.adminplusAutomation);
  if (adminplusConfig.enabled) {
    for (const time of adminplusPurchaseTimesFromMappings(savedPayload)) {
      const entry: SchedulerEntry = { enabled: true, time };
      if (!scheduleDue(entry, nowText, env)) continue;
      await runSchedulerActionOnce(env, actions, `adminplusPurchase-${time.replace(":", "")}`, entry, nowDate, nowText, async () => {
        const result = await adminplusPurchaseRun(env, savedPayload, false, time, false);
        if (result.history) savedPayload.adminplusPurchaseHistory = result.history;
        savedPayload.adminplusAutomation = {
          ...adminplusConfig,
          ...objectRecord(savedPayload.adminplusAutomation),
          lastPurchaseAt: new Date().toISOString(),
        };
        await saveLatestSchedulerPayload(env, savedPayload);
        const { history: _history, ...summary } = result;
        return { ...summary, message: `어드민플러스 발주·결제 자동화(${time}): 신규 ${result.created || 0}건 · 결제완료 ${result.paymentCompleted || 0}건 · 상품준비중 ${result.marketplacePreparing || 0}건` };
      }, { retryOnFailure: true });
    }

    if (adminplusConfig.priceWatchEnabled !== false) {
      for (const time of adminplusConfig.priceCheckTimes || []) {
        const entry: SchedulerEntry = { enabled: true, time };
        if (!scheduleDue(entry, nowText, env)) continue;
        await runSchedulerActionOnce(env, actions, `adminplusPrice-${time.replace(":", "")}`, entry, nowDate, nowText, async () => {
          const result = await adminplusPriceCheckRun(env, savedPayload);
          savedPayload.adminplusProductLinks = result.links;
          savedPayload.adminplusPriceAlerts = result.alerts;
          savedPayload.adminplusAutomation = { ...adminplusConfig, ...objectRecord(savedPayload.adminplusAutomation), lastPriceCheckAt: new Date().toISOString() };
          await saveLatestSchedulerPayload(env, savedPayload);
          return { ok: result.ok, checked: result.checked, changed: result.changed, errors: result.errors, message: `어드민플러스 공급가 자동확인: ${result.checked}건 / 변동 ${result.changed}건` };
        }, { retryOnFailure: true });
      }
    }

    for (const time of adminplusConfig.shipmentTimes || []) {
      const entry: SchedulerEntry = { enabled: true, time };
      if (!scheduleDue(entry, nowText, env)) continue;
      await runSchedulerActionOnce(env, actions, `adminplusShipment-${time.replace(":", "")}`, entry, nowDate, nowText, async () => {
        const result = await adminplusShipmentRun(env, savedPayload, false);
        if (result.history) savedPayload.adminplusPurchaseHistory = result.history;
        savedPayload.adminplusAutomation = {
          ...adminplusConfig,
          ...objectRecord(savedPayload.adminplusAutomation),
          ...(result.canAdvanceWatermark ? { lastShipmentAt: new Date().toISOString() } : {}),
        };
        await saveLatestSchedulerPayload(env, savedPayload);
        const { history: _history, ...summary } = result;
        return { ...summary, message: `어드민플러스 송장 자동회수·마켓등록: 대상 ${result.shipmentRows || 0}건` };
      }, { retryOnFailure: true });
    }
  }

  if (scheduleDue(schedules.storageCleanup, nowText, env)) {
    await runSchedulerActionOnce(env, actions, "storageCleanup", schedules.storageCleanup, nowDate, nowText, async () => {
      const response = await cleanupStorage(env);
      const result = await response.json() as Record<string, unknown>;
      return { ok: result.ok, message: result.message };
    });
  }

  if (actions.length) await saveSchedulerAudit(env, "scheduler_tick_v187", { nowKst: `${nowDate} ${nowText}`, actions });

  return jsonResponse({
    ok: true,
    mode: "scheduler_tick_v209_adminplus_product_price_watch",
    summary: { nowKst: `${nowDate} ${nowText}`, schedules, actions, activeCoupons: activeTemplates.length },
    safety: safetyStatus(env),
    message: actions.length
      ? `스케줄러 실행 대상 ${actions.length}개를 처리했습니다. 쿠폰과 어드민플러스 발주·송장 작업을 독립 실행하며 중복 이력을 차단합니다.`
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
    return jsonResponse({ ok: true, mode: "cloudflare_r2_purchase_folder_v187", folderPath: "R2://b2b-operation" });
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
      await env.B2B_FILES.put(key, bytes, { httpMetadata: { contentType: r2ContentType(filename) }, customMetadata: { kind, source: "b2b-web-v187" } });
      saved.push({ filename, filePath: `r2://${key}` });
    }
    return jsonResponse({ ...base, files: saved, opened: false });
  }
  if (url.pathname === "/api/local/save-blob") {
    const filename = cleanR2Filename(body.filename);
    const bytes = base64ToBytes(body.base64);
    if (!bytes.length) return jsonResponse({ ok: false, message: "빈 파일은 저장할 수 없습니다." }, { status: 400 });
    const key = `${prefix}${filename}`;
    await env.B2B_FILES.put(key, bytes, { httpMetadata: { contentType: r2ContentType(filename) }, customMetadata: { kind, source: "b2b-web-v187" } });
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
    env = envWithApiEndpointSettings(env, await apiEndpointSettingsFromRequest(request));
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        version: "v213-per-option-payment-toss-mapping",
        featureRevision: "option-baseqty-confirm-v217-20260809",
        hotfixRevision: "single-adminplus-option-v218-20260809",
        tossBridgeRevision: "toss-stock-productitem-v219-20260809",
        couponStateRevision: "coupon-actual-applied-state-v220-20260809",
        couponRolloverRevision: "coupon-rollover-reconcile-v225-20260810",
        adminplusOrderPayloadRevision: "adminplus-preflight-payload-parity-v226-20260810",
        coupangShipmentRevision: "coupang-shipment-bigint-courier-v227-20260810",
        automationPersistenceRevision: "automation-persist-selected-manual-v228-20260810",
        adminplusShipmentRecoveryRevision: "adminplus-shipment-direct-reconcile-v229-20260810",
        legacyShipmentRecoveryRevision: "legacy-coupang-shipment-recovery-v230-20260810",
        ordererReceiverRevision: "excel-orderer-business-receiver-customer-v231-20260810",
        excelFirstMappingRevision: "excel-first-mapping-global-catalog-v232-20260811",
        excelFirstMappingHotfixRevision: "v232-r1-async-pricecheck-build-fix-20260811",
        excelFirstMappingRuntimeHotfixRevision: "v232-r2-remove-stray-async-runtime-fix-20260811",
        excelFirstMappingTypeHotfixRevision: "v232-r3-pricecheck-mapping-payload-type-fix-20260811",
        mappingRecoveryRevision: "v233-orderphone-name-recovery-pricewatch-20260811",
        priceRefreshRevision: "v234-time-edit-soldout-price-refresh-20260811",
        uiSchemaRevision: "v235-excel-schema-ui-catalog-review-20260811",
        mappingStateRevision: "v236-latest-excel-reconfirm-current-state-20260811",
        matchValidationRevision: "v237-option-parser-validation-reconfirm-watch-20260811",
        matchDiagnosticRevision: "v238-ncloud-revision-guard-diagnostic-20260811",
        currentPolicyRevision: "v246-current-policy-verifier-alignment-20260812",
        operationsResilienceRevision: "v248-operations-resilience-20260812",
        adminplusVirtualPhoneRevision: "v248-r2-adminplus-virtual-phone-fix-20260812",
        adminplusOrdererParityRevision: "v248-r3-adminplus-orderer-parity-fix-20260812",
        scheduledShipmentRecoveryRevision: "v248-r4-scheduled-shipment-recovery-fix-20260812",
        shipmentSourceOfTruthRevision: "v248-r5-shipment-source-of-truth-fix-20260812",
        marketplacePreparingSourceRevision: "v248-r6-market-preparing-source-fix-20260812",
        manualOrderSafeRelinkRevision: "v248-r7r1-receiver-phone-address2-relink-20260812",
        couponSingleActiveRevision: "v248-r8-coupon-single-active-catalog-filter-20260813",
        couponGapRepairRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813",
        couponAdaptiveActualEndRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813",
        orderStateCollectionRevision: "v248-r9-payment-preparing-vendor-route-fix-20260813",
        shipmentSyncReconcileRevision: "v247-shipment-sync-reconcile-fix-20260812",
        automationPersistenceHotfixRevision: "v228-r1-shipment-row-type-fix-20260810",
        tossAutoPurchaseRevision: "toss-confirmed-link-alias-v220-20260809",
    tossPaidCollectionRevision: "toss-paid-collection-v221-20260809",
    manualPurchaseQueueRevision: "manual-backlog-server-source-v222-20260809",
    adminplusOrderRecoveryRevision: "adminplus-create-reconcile-v223-20260809",
    adminplusPaymentPolicyRevision: "adminplus-payment-policy-guard-v224-20260809",
        at: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/system/public-ip") {
      return publicIpCheck(request, env);
    }

    if (url.pathname === "/api/system/status") {
      return jsonResponse({
        ok: true,
        version: "v213-per-option-payment-toss-mapping",
        featureRevision: "option-baseqty-confirm-v217-20260809",
        hotfixRevision: "single-adminplus-option-v218-20260809",
        tossBridgeRevision: "toss-stock-productitem-v219-20260809",
        couponStateRevision: "coupon-actual-applied-state-v220-20260809",
        couponRolloverRevision: "coupon-rollover-reconcile-v225-20260810",
        adminplusOrderPayloadRevision: "adminplus-preflight-payload-parity-v226-20260810",
        coupangShipmentRevision: "coupang-shipment-bigint-courier-v227-20260810",
        automationPersistenceRevision: "automation-persist-selected-manual-v228-20260810",
        adminplusShipmentRecoveryRevision: "adminplus-shipment-direct-reconcile-v229-20260810",
        legacyShipmentRecoveryRevision: "legacy-coupang-shipment-recovery-v230-20260810",
        ordererReceiverRevision: "excel-orderer-business-receiver-customer-v231-20260810",
        excelFirstMappingRevision: "excel-first-mapping-global-catalog-v232-20260811",
        excelFirstMappingHotfixRevision: "v232-r1-async-pricecheck-build-fix-20260811",
        excelFirstMappingRuntimeHotfixRevision: "v232-r2-remove-stray-async-runtime-fix-20260811",
        excelFirstMappingTypeHotfixRevision: "v232-r3-pricecheck-mapping-payload-type-fix-20260811",
        mappingRecoveryRevision: "v233-orderphone-name-recovery-pricewatch-20260811",
        priceRefreshRevision: "v234-time-edit-soldout-price-refresh-20260811",
        uiSchemaRevision: "v235-excel-schema-ui-catalog-review-20260811",
        mappingStateRevision: "v236-latest-excel-reconfirm-current-state-20260811",
        matchValidationRevision: "v237-option-parser-validation-reconfirm-watch-20260811",
        matchDiagnosticRevision: "v238-ncloud-revision-guard-diagnostic-20260811",
        currentPolicyRevision: "v246-current-policy-verifier-alignment-20260812",
        operationsResilienceRevision: "v248-operations-resilience-20260812",
        adminplusVirtualPhoneRevision: "v248-r2-adminplus-virtual-phone-fix-20260812",
        adminplusOrdererParityRevision: "v248-r3-adminplus-orderer-parity-fix-20260812",
        scheduledShipmentRecoveryRevision: "v248-r4-scheduled-shipment-recovery-fix-20260812",
        shipmentSourceOfTruthRevision: "v248-r5-shipment-source-of-truth-fix-20260812",
        marketplacePreparingSourceRevision: "v248-r6-market-preparing-source-fix-20260812",
        manualOrderSafeRelinkRevision: "v248-r7r1-receiver-phone-address2-relink-20260812",
        couponSingleActiveRevision: "v248-r8-coupon-single-active-catalog-filter-20260813",
        couponGapRepairRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813",
        couponAdaptiveActualEndRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813",
        orderStateCollectionRevision: "v248-r9-payment-preparing-vendor-route-fix-20260813",
        shipmentSyncReconcileRevision: "v247-shipment-sync-reconcile-fix-20260812",
        statusRevisionExposeFix: "v229-r1-status-revision-expose-20260811",
        productChangeOptionFixRevision: "v239-product-change-option-leak-fix-20260811",
        priceWatchActiveFirstRevision: "v240-active-first-false-soldout-fix-20260811",
        priceWatchAccountRoutingRevision: "v241-pricewatch-account-routing-fix-20260811",
        shipmentContainerRecoveryRevision: "v242-order-container-tracking-recovery-20260811",
        shipmentTargetPaymentClarityRevision: "v243-shipment-target-payment-batch-clarity-20260811",
        shipmentTargetPaymentClarityHotfixRevision: "v243-r1-typescript-fix-20260811",
        automationPersistenceHotfixRevision: "v228-r1-shipment-row-type-fix-20260810",
        tossAutoPurchaseRevision: "toss-confirmed-link-alias-v220-20260809",
    tossPaidCollectionRevision: "toss-paid-collection-v221-20260809",
        manualPurchaseQueueRevision: "manual-backlog-server-source-v222-20260809",
    adminplusOrderRecoveryRevision: "adminplus-create-reconcile-v223-20260809",
    adminplusPaymentPolicyRevision: "adminplus-payment-policy-guard-v224-20260809",
        safety: safetyStatus(env),
        storage: {
          supabaseConfigured: supabaseConfigured(env),
          r2Configured: r2Configured(env),
          fileStorage: r2Configured(env) ? "Cloudflare R2" : "not_configured",
          tempTtlHours: 24,
          persistentSettings: "operation_persistent_settings",
        },
        credentials: credentialStatus(env),
        capabilities: {
          coupangCouponAutomation: true,
          tossCouponAutomation: false,
          tossCouponAutomationReason: "토스쇼핑 공개 API 문서에 쿠폰·프로모션 생성/취소 API가 없어 비활성화했습니다.",
        },
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
            name: "클라우드 저장용량 점검·정리",
            status: supabaseConfigured(env) ? "ready" : "needs_supabase",
            detail: "R2·Supabase의 임시자료와 만료자료를 보존정책에 따라 정리",
          },
        ],
        safety: safetyStatus(env),
      });
    }

    if (url.pathname === "/api/dashboard") {
      return jsonResponse({
        ok: true,
        version: "v213-per-option-payment-toss-mapping",
        featureRevision: "option-baseqty-confirm-v217-20260809",
        hotfixRevision: "single-adminplus-option-v218-20260809",
        tossBridgeRevision: "toss-stock-productitem-v219-20260809",
        couponStateRevision: "coupon-actual-applied-state-v220-20260809",
        couponRolloverRevision: "coupon-rollover-reconcile-v225-20260810",
        adminplusOrderPayloadRevision: "adminplus-preflight-payload-parity-v226-20260810",
        coupangShipmentRevision: "coupang-shipment-bigint-courier-v227-20260810",
        automationPersistenceRevision: "automation-persist-selected-manual-v228-20260810",
        adminplusShipmentRecoveryRevision: "adminplus-shipment-direct-reconcile-v229-20260810",
        legacyShipmentRecoveryRevision: "legacy-coupang-shipment-recovery-v230-20260810",
        ordererReceiverRevision: "excel-orderer-business-receiver-customer-v231-20260810",
        excelFirstMappingRevision: "excel-first-mapping-global-catalog-v232-20260811",
        excelFirstMappingHotfixRevision: "v232-r1-async-pricecheck-build-fix-20260811",
        excelFirstMappingRuntimeHotfixRevision: "v232-r2-remove-stray-async-runtime-fix-20260811",
        excelFirstMappingTypeHotfixRevision: "v232-r3-pricecheck-mapping-payload-type-fix-20260811",
        automationPersistenceHotfixRevision: "v228-r1-shipment-row-type-fix-20260810",
        tossAutoPurchaseRevision: "toss-confirmed-link-alias-v220-20260809",
    tossPaidCollectionRevision: "toss-paid-collection-v221-20260809",
        manualPurchaseQueueRevision: "manual-backlog-server-source-v222-20260809",
    adminplusOrderRecoveryRevision: "adminplus-create-reconcile-v223-20260809",
    adminplusPaymentPolicyRevision: "adminplus-payment-policy-guard-v224-20260809",
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
      url.pathname === "/api/operation/mappings/load" &&
      request.method === "GET"
    )
      return loadSharedMappings(url, env);
    if (
      url.pathname === "/api/operation/mappings/upsert" &&
      request.method === "POST"
    )
      return upsertSharedMappings(request, env);
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
    if (url.pathname === "/api/integrations/adminplus/accounts/status" && request.method === "POST")
      return adminplusAccountsStatus(request, env);
    if (url.pathname === "/api/integrations/adminplus/catalog/products" && request.method === "POST")
      return adminplusCatalogEndpoint(request, env, "products");
    if (url.pathname === "/api/integrations/adminplus/catalog/search" && request.method === "POST")
      return adminplusGlobalCatalogSearchEndpoint(request, env);
    if (url.pathname === "/api/integrations/adminplus/catalog/matches/list" && request.method === "POST")
      return adminplusCatalogEndpoint(request, env, "match-list");
    if (url.pathname === "/api/integrations/adminplus/catalog/matches/apply" && request.method === "POST")
      return adminplusCatalogEndpoint(request, env, "match-apply");
    if (url.pathname === "/api/integrations/adminplus/catalog/matches/delete" && request.method === "POST")
      return adminplusCatalogEndpoint(request, env, "match-delete");
    if (url.pathname === "/api/integrations/adminplus/prices/check" && request.method === "POST")
      return adminplusPriceCheckEndpoint(request, env);
    if (url.pathname === "/api/integrations/adminplus/purchase/preflight" && request.method === "POST")
      return adminplusPurchaseEndpoint(request, env, true);
    if (url.pathname === "/api/integrations/adminplus/purchase/execute" && request.method === "POST")
      return adminplusPurchaseEndpoint(request, env, false);
    if (url.pathname === "/api/integrations/adminplus/purchase/status" && request.method === "POST")
      return adminplusPurchaseStatusEndpoint(request, env);
    if (url.pathname === "/api/integrations/adminplus/shipments/preflight" && request.method === "POST")
      return adminplusShipmentEndpoint(request, env, true);
    if (url.pathname === "/api/integrations/adminplus/shipments/sync" && request.method === "POST")
      return adminplusShipmentEndpoint(request, env, false);
    if (url.pathname === "/api/integrations/adminplus/shipments/resolve" && request.method === "POST")
      return adminplusShipmentResolveEndpoint(request, env);
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
      url.pathname.startsWith("/api/integrations/toss/coupons/")
    )
      return jsonResponse({
        ok: false,
        mode: "toss_coupon_automation_unavailable_v187",
        capabilityAvailable: false,
        message: "토스쇼핑 공개 API 문서에 쿠폰·프로모션 생성·취소 기능이 확인되지 않아 동일 자동화를 실행하지 않습니다. 공식 API 제공 전에는 임의 호출이나 브라우저 자동조작으로 대체하지 않습니다.",
      }, { status: 501 });
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
      url.pathname === "/api/integrations/coupang/coupons/automation-preflight" &&
      request.method === "POST"
    )
      return couponAutomationPreflight(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/automation-failures" &&
      request.method === "GET"
    )
      return couponAutomationFailures(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/failure-acknowledge" &&
      request.method === "POST"
    )
      return couponAutomationFailureAcknowledge(request, env);
    if (
      url.pathname === "/api/integrations/coupang/coupons/manual-retry" &&
      request.method === "POST"
    )
      return couponAutomationManualRetry(request, env);
    if (
      url.pathname === "/api/operation/coupon-automation/stop" &&
      request.method === "POST"
    )
      return couponAutomationStop(request, env);
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
        headers: { "content-type": "application/json", "x-b2b-proxy": "cloudflare-cron-to-ncloud-fixed-ip-v187" },
        body: JSON.stringify({ source: "cloudflare-cron-v187" }),
      });
    } catch (error) {
      console.error("V187 scheduled task failed", error);
    }
  },
};
