import React, { useEffect, useMemo, useState } from "react";
import "./style.css";
import {
  downloadExcelFile,
  makeExcelBlob,
  saveBlobWithDownload,
} from "./utils/csv";
import { createXlsxBlob, readSpreadsheetRows } from "./utils/spreadsheet";

type Channel = "쿠팡" | "토스";
type MenuKey =
  | "간편운영"
  | "주문관리"
  | "매핑관리"
  | "양식설정"
  | "발주관리"
    | "쿠폰관리"
  | "스케줄러"
  | "운영설정";
type MatchStatus = "매칭완료" | "미매핑";
type InvoiceStatus = "등록준비" | "확인필요" | "송장입력완료(업로드제외)";
type ScheduleKey =
  | "couponCancel"
  | "couponApply"
  | "storageCleanup";

type BrowserFolderKind = "purchase" | "invoice" | "upload";

type ManagedSaveResult = {
  kind: BrowserFolderKind;
  folderLabel: string;
  folderName: string;
  filename: string;
  method: "folder" | "download";
};

type LocalManagedFile = {
  filename: string;
  size: number;
  modifiedAt: string;
  base64?: string;
};

type FolderZipArtifact = {
  filename: string;
  blob: Blob;
};

type FileSystemAccessMode = "read" | "readwrite";
type FileSystemPermissionResult = "granted" | "denied" | "prompt";

type FileSystemPermissionDescriptor = { mode?: FileSystemAccessMode };
type FileSystemDirectoryPickerOptions = {
  id?: string;
  mode?: FileSystemAccessMode;
  startIn?: string;
};
type FileSystemFileHandleLike = {
  createWritable: () => Promise<{
    write: (data: Blob | BufferSource | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type FileSystemDirectoryHandleLike = {
  name: string;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileSystemFileHandleLike>;
  queryPermission?: (
    descriptor?: FileSystemPermissionDescriptor,
  ) => Promise<FileSystemPermissionResult>;
  requestPermission?: (
    descriptor?: FileSystemPermissionDescriptor,
  ) => Promise<FileSystemPermissionResult>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (
      options?: FileSystemDirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandleLike>;
  }
}

type MappingRow = {
  id: string;
  channel: Channel;
  optionId: string;
  vendorName: string;
  vendorCode: string;
  vendorProductName: string;
  cost: number;
  baseQty: number;
};

type TossOptionIdRow = {
  id: string;
  optionId: string;
  optionCode: string;
  productName: string;
  memo: string;
  productId: string;
  itemName: string;
  managementCode: string;
};

type CoupangOptionMasterRow = {
  id: string;
  optionId: string;
  productName: string;
  optionName: string;
  salePrice: number;
  status: string;
  source: "api" | "order" | "mapping" | "coupon";
  syncedAt: string;
};

type OrderRow = {
  id: string;
  channel: Channel;
  orderNo: string;
  orderedAt: string;
  shipmentBoxId?: string;
  orderProductId?: string;
  optionId: string;
  productName: string;
  optionName: string;
  qty: number;
  receiverName: string;
  receiverPhone: string;
  zip: string;
  address: string;
  memo: string;
  salePrice: number;
  orderStatus: string;
  courier?: string;
  trackingNo?: string;
  sourceFile: string;
  raw?: Record<string, string>;
};

type PurchaseRow = {
  id: string;
  channel: Channel;
  orderNo: string;
  orderedAt: string;
  optionId: string;
  vendorName: string;
  vendorCode: string;
  vendorProductName: string;
  orderProductName: string;
  orderOptionName: string;
  orderQty: number;
  baseQty: number;
  purchaseQty: number;
  cost: number;
  receiverName: string;
  receiverPhone: string;
  zip: string;
  address: string;
  memo: string;
  salePrice: number;
  matchStatus: MatchStatus;
};

type PurchaseHistoryRow = {
  id: string;
  channel: Channel;
  orderNo: string;
  orderedAt: string;
  optionId: string;
  vendorName: string;
  vendorProductName: string;
  purchaseQty: number;
  exportedAt: string;
  status: "발주완료";
};

type InvoiceRecord = {
  id: string;
  sourceFile: string;
  vendorName: string;
  channel: Channel | "";
  orderNo: string;
  receiverName: string;
  address: string;
  productName: string;
  courier: string;
  trackingNo: string;
};

type InvoicePreviewRow = {
  id: string;
  channel: Channel;
  orderNo: string;
  vendorName: string;
  productName: string;
  receiverName: string;
  courier: string;
  trackingNo: string;
  shipmentBoxId?: string;
  orderProductId?: string;
  orderId?: string;
  vendorItemId?: string;
  optionId?: string;
  orderStatus?: string;
  matchMethod: string;
  status: InvoiceStatus;
  sourceFile: string;
};

type ShipmentInputDataRow = {
  id: string;
  channel: Channel;
  sourceFile: string;
  rowIndex: number;
  orderNo: string;
  shipmentBoxId?: string;
  orderId?: string;
  vendorItemId?: string;
  orderProductId?: string;
  optionId?: string;
  orderStatus?: string;
  productName: string;
  optionName: string;
  receiverName: string;
  address: string;
  courier: string;
  trackingNo: string;
};

type ShipmentInputFile = {
  id: string;
  channel: Channel;
  sourceFile: string;
  sheetName: string;
  headerIndex: number;
  headers: string[];
  rows: string[][];
  dataRows: ShipmentInputDataRow[];
};

type PurchaseTemplateSetting = {
  id: string;
  vendorName: string;
  enabled: boolean;
  startRow: number;
  headerRows: string[][];
  columns: {
    channel: string;
    orderNo: string;
    optionId: string;
    vendorCode: string;
    vendorProductName: string;
    purchaseQty: string;
    receiverName: string;
    receiverPhone: string;
    zip: string;
    address: string;
    memo: string;
    cost: string;
    senderName: string;
    senderAddress: string;
    senderPhone: string;
    senderZip: string;
    senderAddress2: string;
  };
};

type InvoiceTemplateSetting = {
  id: string;
  vendorName: string;
  enabled: boolean;
  headerRow: number;
  startRow: number;
  columns: {
    channel: string;
    orderNo: string;
    receiverName: string;
    address: string;
    productName: string;
    courier: string;
    trackingNo: string;
  };
};

type ChannelShipmentTemplateSetting = {
  id: string;
  channel: Channel;
  enabled: boolean;
  startRow: number;
  headerRows: string[][];
};

type ChannelPurchaseTemplateSetting = {
  id: string;
  channel: Channel;
  enabled: boolean;
  startRow: number;
  headerRows: string[][];
  columns: {
    channel: string;
    orderNo: string;
    optionId: string;
    vendorName: string;
    vendorCode: string;
    vendorProductName: string;
    orderProductName: string;
    orderOptionName: string;
    purchaseQty: string;
    receiverName: string;
    receiverPhone: string;
    zip: string;
    address: string;
    memo: string;
    cost: string;
    salePrice: string;
  };
};

type ProfitSetting = {
  apiAuto: boolean;
  /** 판매수수료 또는 상품판매수수료 추정율. 쿠팡은 정산 API 우선, 토스는 기본 8%를 사용합니다. */
  marketplaceFeeRate: number;
  /** 토스 결제수수료율. 쿠팡에는 적용하지 않습니다. */
  paymentFeeRate: number;
  /** 매출 대비 광고료율. 보통 0으로 두고, 토스 광고는 기간 광고집행액을 입력합니다. */
  adFeeRate: number;
  /** 설정기간 광고집행액. 해당 채널 매출 비율로 주문별 배분합니다. */
  adFeeTotal: number;
  shippingFeeDefault: number;
};

type ProfitSettings = Record<Channel, ProfitSetting>;

type ProfitFilterSetting = {
  startDate: string;
  endDate: string;
  channel: "전체" | Channel;
};

type ProfitSummaryValue = {
  orders: number;
  sales: number;
  cost: number;
  marketplaceFee: number;
  adFee: number;
  shippingFee: number;
  profit: number;
  lossOrders: number;
  missingCostOrders: number;
};

type ProfitSnapshot = {
  generatedAt: string;
  filter: ProfitFilterSetting;
  summary: ProfitSummaryValue;
  channelSummary: Array<ProfitSummaryValue & { channel: Channel }>;
  totalRows: number;
  riskRows: number;
  memo: string;
};

type SettlementFeeRow = {
  channel?: Channel | string;
  orderNo?: string;
  optionId?: string;
  productName?: string;
  marketplaceFee?: number;
  adFee?: number;
  shippingFee?: number;
  sellerCoupon?: number;
  settlementAmount?: number;
  source?: string;
};

type CouponAction = "apply" | "cancel";

type CouponRow = {
  id: string;
  action: CouponAction;
  optionId: string;
  productName: string;
  couponName: string;
  discountType: "금액" | "율";
  discountValue: number;
  startAt: string;
  endAt: string;
  memo: string;
  salePrice?: number;
  salePriceSource?: "api" | "order" | "mapping" | "manual" | "";
  rollingTemplateId?: string;
  sourceCouponId?: string;
  latestCouponId?: string;
  contractId?: string;
};

type CouponHistoryRow = {
  id: string;
  action: CouponAction;
  optionId: string;
  productName: string;
  couponName: string;
  discountType: "금액" | "율";
  discountValue: number;
  startAt: string;
  endAt: string;
  recordedAt: string;
  source: "preview" | "manual" | "api";
  memo: string;
  salePrice?: number;
};

type CouponApiSettings = {
  selectedContractId: string;
  selectedCouponId: string;
  selectedCouponStatus: string;
  selectedCouponName: string;
  selectedCouponStartAt: string;
  selectedCouponEndAt: string;
  selectedMode: "existing" | "new" | "daily_new" | "";
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
  savedAt?: string;
};

type CoupangCouponContractRow = {
  contractId: string;
  vendorContractId: string;
  contractName: string;
  status: string;
  startAt: string;
  endAt: string;
  budget: string;
};

type CoupangCouponListRow = {
  couponId: string;
  contractId: string;
  couponName: string;
  status: string;
  type: string;
  discount: string;
  discountType: "금액" | "율" | "";
  discountValue: number;
  startAt: string;
  endAt: string;
};

type CoupangCouponItemRow = {
  couponItemId: string;
  couponId: string;
  vendorItemId: string;
  status: string;
  startAt: string;
  endAt: string;
};

type RollingCouponTemplateOption = {
  optionId: string;
  productName: string;
  optionName?: string;
  salePrice?: number;
  salePriceSource?: CouponRow["salePriceSource"];
};

type RollingCouponTemplate = {
  id: string;
  enabled: boolean;
  sourceCouponId: string;
  latestCouponId: string;
  contractId: string;
  couponName: string;
  status: string;
  type: string;
  discountType: "금액" | "율" | "";
  discountValue: number;
  startAt: string;
  endAt: string;
  itemCount: number;
  options: RollingCouponTemplateOption[];
  lastGeneratedCouponId?: string;
  lastGeneratedAt?: string;
  lastCanceledAt?: string;
  savedAt?: string;
};

type B2BVendorLink = {
  id: string;
  vendorName: string;
  url: string;
  memo: string;
  enabled: boolean;
};

type ProfitAnalysisRow = PurchaseRow & {
  costQty: number;
  costTotal: number;
  marketplaceFee: number;
  adFee: number;
  shippingFee: number;
  netProfit: number;
  profitStatus: "흑자" | "적자" | "확인필요";
  feeSource: string;
};

type ScheduleConfig = Record<ScheduleKey, { enabled: boolean; time: string }>;

type TempPayload = {
  mappings?: MappingRow[];
  tossOptionIdRows?: TossOptionIdRow[];
  coupangOptionMasterRows?: CoupangOptionMasterRow[];
  orders?: OrderRow[];
  invoiceRecords?: InvoiceRecord[];
  purchaseHistory?: PurchaseHistoryRow[];
  purchaseTemplates?: PurchaseTemplateSetting[];
  invoiceTemplates?: InvoiceTemplateSetting[];
  shipmentTemplates?: ChannelShipmentTemplateSetting[];
  channelPurchaseTemplates?: ChannelPurchaseTemplateSetting[];
  couponRows?: CouponRow[];
  couponHistory?: CouponHistoryRow[];
  couponApiSettings?: CouponApiSettings;
  rollingCouponTemplates?: RollingCouponTemplate[];
  b2bVendorLinks?: B2BVendorLink[];
  folderNames?: Partial<Record<BrowserFolderKind, string>>;
  localFolderPaths?: Partial<Record<BrowserFolderKind, string>>;
  schedules?: ScheduleConfig;
  sessionKey?: string;
  settingsKey?: string;
  savedAt?: string;
};

type PersistentSettingsPayload = {
  mappings?: MappingRow[];
  tossOptionIdRows?: TossOptionIdRow[];
  coupangOptionMasterRows?: CoupangOptionMasterRow[];
  purchaseHistory?: PurchaseHistoryRow[];
  purchaseTemplates?: PurchaseTemplateSetting[];
  invoiceTemplates?: InvoiceTemplateSetting[];
  shipmentTemplates?: ChannelShipmentTemplateSetting[];
  channelPurchaseTemplates?: ChannelPurchaseTemplateSetting[];
  couponRows?: CouponRow[];
  couponHistory?: CouponHistoryRow[];
  couponApiSettings?: CouponApiSettings;
  rollingCouponTemplates?: RollingCouponTemplate[];
  b2bVendorLinks?: B2BVendorLink[];
  folderNames?: Partial<Record<BrowserFolderKind, string>>;
  localFolderPaths?: Partial<Record<BrowserFolderKind, string>>;
  schedules?: ScheduleConfig;
  settingsKey?: string;
  savedAt?: string;
  version?: string;
};

type ApiResult = {
  ok?: boolean;
  message?: string;
  mode?: string;
  summary?: Record<string, unknown>;
  safety?: Record<string, unknown>;
  data?: TempPayload;
  sessionKey?: string;
  expiresAt?: string;
  updatedAt?: string;
  routes?: unknown[];
  externalApiExecuted?: boolean;
  requestedRows?: number;
  standardFeeRows?: SettlementFeeRow[];
};

type MappingCheckSummary = {
  sourceSession: string;
  totalOrders: number;
  matched: number;
  unmatched: number;
  vendors: number;
  checkedAt: string;
};

type OperationLogViewRow = {
  id: string;
  eventType: string;
  createdAt: string;
  summary: string;
};

type PublicIpViewRow = {
  item: string;
  status: string;
  detail: string;
};

type OrderCollectionSummaryRow = {
  item: string;
  status: string;
  detail: string;
};

type PurchasePreflightIssue = {
  level: "차단" | "확인";
  item: string;
  channel: string;
  orderNo: string;
  orderedAt: string;
  optionId: string;
  vendorName: string;
  detail: string;
};

type OrderApiFilter = {
  startDate: string;
  endDate: string;
  coupangStatus: string;
  tossStatus: string;
  limit: number;
};

type ApiDiagnosticRow = {
  channel: string;
  step: string;
  status: string;
  detail: string;
};

const APP_VERSION = "V170 모바일 매핑 운영 안정화";
const STORAGE_KEY = "b2b_operation_current_state";
const LEGACY_STORAGE_KEYS = ["b2b_operation_v45_state"];
const SETTINGS_STORAGE_KEY = "b2b_operation_persistent_settings";
const LEGACY_SETTINGS_STORAGE_KEYS = ["b2b_operation_v53_persistent_settings"];
const DEFAULT_SESSION_KEY = `b2b-${new Date().toISOString().slice(0, 10)}`;
const DEFAULT_SETTINGS_KEY = "b2b-master-settings";
const SHIPMENT_PREPARING_LOOKBACK_DAYS = 7;
const DEFAULT_ORDER_COLLECT_LOOKBACK_DAYS = 7;
function defaultDateText() {
  return new Date().toISOString().slice(0, 10);
}
function localDateText(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateRangeText(days: number) {
  const safeDays = Math.max(1, Math.floor(days));
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - safeDays + 1);
  return { startDate: localDateText(start), endDate: localDateText(end) };
}

const DEFAULT_ORDER_API_FILTER: OrderApiFilter = {
  ...dateRangeText(DEFAULT_ORDER_COLLECT_LOOKBACK_DAYS),
  coupangStatus: "ACCEPT",
  tossStatus: "PAID",
  limit: 50,
};
const MENUS: MenuKey[] = [
  "간편운영",
  "주문관리",
  "매핑관리",
  "양식설정",
  "발주관리",
  "쿠폰관리",
  "스케줄러",
  "운영설정",
];

const SAFETY = {
  externalApiExecuted: "API 연결 중단 상태",
  finalExecutionStillDisabled: "환경변수 Gate 기준",
  API_CONNECTION_PAUSED: "START_HERE=false / SAFE=true",
  ALLOW_LIVE_EXTERNAL_API: "START_HERE=true",
  ALLOW_FINAL_EXECUTION: "START_HERE=true",
  ALLOW_SCHEDULED_WRITES: "true 설정 시 자동 쿠폰·서버정리 실행",
};

const SERVER_PRE_STEP_ROWS: Array<[string, string, string]> = [
  [
    "1",
    "Supabase SQL 실행",
    "supabase/migrations/20260705_v58_server_operation_schema.sql을 Supabase SQL Editor에서 먼저 실행",
  ],
  [
    "1.1",
    "DB 확인",
    "GET /api/system/connection-check로 3개 테이블 연결 확인",
  ],
  [
    "1.2",
    "서버 점검",
    "GET /api/system/server-operation-check로 Supabase, API Gate, 스케줄·Gate 상태 점검",
  ],
  [
    "1.3",
    "로그 저장",
    "POST /api/operation/logs/save로 수동 점검 기록 저장",
  ],
  [
    "1.4",
    "로그 확인",
    "GET /api/operation/logs/latest로 저장된 운영기록 확인",
  ],
];

const SERVER_REQUIRED_API_ROWS: Array<[string, string, string]> = [
  [
    "서버 점검",
    "GET /api/system/server-operation-check",
    "서버 운영 전 필수 상태와 Gate 확인",
  ],
  [
    "로그 저장",
    "POST /api/operation/logs/save",
    "수동 점검·실행 기록 저장",
  ],
  [
    "로그 확인",
    "GET /api/operation/logs/latest",
    "최근 20건 운영로그 확인",
  ],
  [
    "DB 확인",
    "GET /api/system/connection-check",
    "필수 테이블 3개 연결 확인",
  ],
];

const SERVER_REQUIRED_TABLE_ROWS: Array<[string, string, string]> = [
  [
    "operation_temp_sessions",
    "주문·송장 등 당일 작업자료 1일 임시보관",
    "session_key, payload, expires_at, updated_at",
  ],
  [
    "operation_persistent_settings",
    "매핑·양식·쿠폰 설정 영구보관",
    "settings_key, payload, created_at, updated_at",
  ],
  [
    "operation_audit_logs",
    "서버 점검 및 수동 운영기록 저장",
    "id, event_type, payload, created_at",
  ],
];

const DEFAULT_BUSINESS_INFO = {
  name: "소신채",
  phone: "010-6880-9413",
  zip: "54922",
  address: "전북특별자치도 전주시 덕진구 매봉16길7,2층",
  address2: "",
};

const DEFAULT_SCHEDULES: ScheduleConfig = {
  couponCancel: { enabled: true, time: "23:50" },
  couponApply: { enabled: true, time: "23:51" },
  storageCleanup: { enabled: true, time: "03:20" },
};

function normalizeSchedules(value?: Partial<ScheduleConfig>): ScheduleConfig {
  const input = value || {};
  const merged = Object.fromEntries(
    (Object.keys(DEFAULT_SCHEDULES) as ScheduleKey[]).map((key) => [
      key,
      { ...DEFAULT_SCHEDULES[key], ...(input[key] || {}) },
    ]),
  ) as ScheduleConfig;
  return merged;
}

const LEGACY_ORDER_SCHEDULE_FIELDS = [
  "coupangOrder",
  "tossOrder",
  "autoPurchase",
  "orderCollect",
  "orderCollection",
];

function removeLegacyOrderScheduleFields(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  let changed = false;
  if (record.schedules && typeof record.schedules === "object") {
    const schedulesRecord = record.schedules as Record<string, unknown>;
    LEGACY_ORDER_SCHEDULE_FIELDS.forEach((key) => {
      if (key in schedulesRecord) {
        delete schedulesRecord[key];
        changed = true;
      }
    });
  }
  ["autoPurchase", "orderSchedule", "orderSchedules", "orderCollectSchedule", "orderCollectionSchedule"].forEach((key) => {
    if (key in record) {
      delete record[key];
      changed = true;
    }
  });
  return changed;
}

function purgeLegacyOrderScheduleStorage() {
  if (typeof window === "undefined") return;
  [STORAGE_KEY, SETTINGS_STORAGE_KEY, ...LEGACY_STORAGE_KEYS, ...LEGACY_SETTINGS_STORAGE_KEYS].forEach((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!removeLegacyOrderScheduleFields(parsed)) return;
      window.localStorage.setItem(key, JSON.stringify(parsed));
    } catch {
      // Local storage cleanup must never block app startup.
    }
  });
}

function readLocalStorageWithFallback(
  primaryKey: string,
  legacyKeys: string[],
) {
  const primary = window.localStorage.getItem(primaryKey);
  if (primary) return primary;
  for (const key of legacyKeys) {
    const legacy = window.localStorage.getItem(key);
    if (legacy) {
      window.localStorage.setItem(primaryKey, legacy);
      return legacy;
    }
  }
  return null;
}

const DEFAULT_PROFIT_SETTINGS: ProfitSettings = {
  쿠팡: {
    apiAuto: true,
    marketplaceFeeRate: 0,
    paymentFeeRate: 0,
    adFeeRate: 0,
    adFeeTotal: 0,
    shippingFeeDefault: 0,
  },
  토스: {
    apiAuto: true,
    // 토스 상품판매수수료 기본값. 결제수수료와 광고비는 운영자가 설정합니다.
    marketplaceFeeRate: 8,
    paymentFeeRate: 0,
    adFeeRate: 0,
    adFeeTotal: 0,
    shippingFeeDefault: 0,
  },
};

function isZeroProfitFeeSettings(settings?: Partial<Record<Channel, Partial<ProfitSetting>>> | ProfitSettings | null) {
  // V171: 매핑 엑셀 업로드 뒤 오래된 브라우저 저장값 또는 일부 설정 누락으로
  // settings["쿠팡"] 접근 중 화면 전체가 보호모드로 떨어지는 일을 방지합니다.
  const safeSettings = normalizeProfitSettings(settings || {});
  return (["쿠팡", "토스"] as Channel[]).every((channel) => {
    const setting = safeSettings[channel] || DEFAULT_PROFIT_SETTINGS[channel];
    return (
      toNumber(setting.marketplaceFeeRate, 0) === 0 &&
      toNumber(setting.paymentFeeRate, 0) === 0 &&
      toNumber(setting.adFeeRate, 0) === 0 &&
      toNumber(setting.adFeeTotal, 0) === 0 &&
      toNumber(setting.shippingFeeDefault, 0) === 0
    );
  });
}

const DEFAULT_PROFIT_FILTER: ProfitFilterSetting = {
  startDate: "",
  endDate: "",
  channel: "전체",
};

const COUPANG_COUPON_TEMPLATE_HEADERS = [
  "동작",
  "쿠팡 옵션ID",
  "상품명",
  "쿠폰명",
  "할인구분",
  "할인값",
  "현재판매가(선택)",
  "메모",
];

const COUPANG_COUPON_STATUS_OPTIONS = [
  "APPLIED",
  "STANDBY",
  "PAUSED",
  "EXPIRED",
  "DETACHED",
];

const DEFAULT_COUPON_API_SETTINGS: CouponApiSettings = {
  selectedContractId: "",
  selectedCouponId: "",
  selectedCouponStatus: "APPLIED",
  selectedCouponName: "",
  selectedCouponStartAt: "",
  selectedCouponEndAt: "",
  selectedMode: "",
  sourceCouponId: "",
  sourceDiscountType: "",
  sourceDiscountValue: 0,
  selectedCouponProductFilter: "",
  lastGeneratedCouponIds: [],
  lastGeneratedCouponId: "",
  lastGeneratedAt: "",
  lastCancelCouponIds: [],
  lastCanceledAt: "",
  dailyRollingEnabled: false,
  rollingTemplates: [],
};

const B2B_VENDOR_LINK_HEADERS = ["업체명", "주소", "메모", "사용"];

const DEFAULT_B2B_VENDOR_LINKS: B2BVendorLink[] = [
  makeB2BVendorLink(
    "에코앤팜",
    "https://econfarm.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink(
    "늘푸른",
    "https://hwanggs3.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink(
    "마루채움",
    "https://maruchaeum.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink(
    "덤덤몰",
    "https://dumdummall.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink(
    "PBFCOMPANY",
    "https://pbfcompany.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink(
    "과일방앗간",
    "https://cks0644.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink("신선천재 김사장", "https://www.fresh-king.com/index.html"),
  makeB2BVendorLink("진과", "https://www.jingwa.co.kr/"),
  makeB2BVendorLink(
    "프레쉬센터",
    "https://freshcenter.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink(
    "망고컴퍼니",
    "https://mgb2bmall.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2Fm%2F",
  ),
  makeB2BVendorLink(
    "꿈틀",
    "https://bbuugg1994.adminplus.co.kr/partner/?mod=product&actpage=prt.list",
  ),
  makeB2BVendorLink(
    "월억도전",
    "https://walldob2b.com/shop/search.php?q=%EC%96%91%ED%8C%8C",
  ),
  makeB2BVendorLink(
    "초록청년",
    "https://chfhrcjdsus.adminplus.co.kr/partner/login.html?rtnurl=%2Fpartner%2F",
  ),
  makeB2BVendorLink("대봉유통", "https://www.daebong.net/main"),
  makeB2BVendorLink(
    "몬딱제주",
    "https://monttakjeju.com/login?redirect_url=https%3A%2F%2Fmonttakjeju.com%2Fadmin%2F",
  ),
  makeB2BVendorLink("최고집", "https://partner.choigozip.co.kr/"),
];

const CHANNEL_PURCHASE_TEMPLATE_HEADERS = [
  "채널",
  "주문번호",
  "옵션ID",
  "업체명",
  "코드번호",
  "업체상품명",
  "주문상품명",
  "주문옵션명",
  "구매수량",
  "수취인",
  "전화번호",
  "우편번호",
  "주소",
  "배송메시지",
  "원가",
  "판매금액",
];

const DEFAULT_CHANNEL_PURCHASE_COLUMNS: ChannelPurchaseTemplateSetting["columns"] =
  {
    channel: "A",
    orderNo: "B",
    optionId: "C",
    vendorName: "D",
    vendorCode: "E",
    vendorProductName: "F",
    orderProductName: "G",
    orderOptionName: "H",
    purchaseQty: "I",
    receiverName: "J",
    receiverPhone: "K",
    zip: "L",
    address: "M",
    memo: "N",
    cost: "O",
    salePrice: "P",
  };

const DEFAULT_MAPPINGS: MappingRow[] = [
  makeMapping(
    "쿠팡",
    "95235689039",
    "늘푸른",
    "",
    "활 바지락 1kg (65~80미) 大",
    0,
    2,
  ),
  makeMapping(
    "토스",
    "1596392073",
    "늘푸른",
    "",
    "활 바지락 1kg (65~80미) 大",
    0,
    2,
  ),
  makeMapping(
    "쿠팡",
    "95570155714",
    "몬딱제주",
    "PLJMBHL",
    "제주 미니밤호박 정품 2kg (실중량1.5kg)",
    0,
    1,
  ),
  makeMapping(
    "쿠팡",
    "95570155716",
    "꿈틀",
    "PWJSOWP",
    "제주 미니밤호박 정품 3kg (실중량2.5kg)",
    0,
    1,
  ),
];

const DEFAULT_PURCHASE_TEMPLATES: PurchaseTemplateSetting[] = [
  purchaseTemplate(
    "늘푸른",
    [
      [
        "제품명",
        "옵션명(옵션 없을시 공란)",
        "수량",
        "수령인",
        "우편번호",
        " 주  소",
        "전화번호",
        "배송메세지",
        "업체명(필수)",
        "업체주소(필수)",
        "업체전화(필수)",
        "주문번호(없을시 공란)",
      ],
    ],
    {
      vendorProductName: "A",
      purchaseQty: "C",
      receiverName: "D",
      zip: "E",
      address: "F",
      receiverPhone: "G",
      memo: "H",
      senderName: "I",
      senderAddress: "J",
      senderPhone: "K",
      orderNo: "L",
    },
  ),
  purchaseTemplate(
    "몬딱제주",
    [
      [
        "주문번호",
        "상품코드",
        "상품명",
        "수량",
        "주문자명",
        "주문자전화",
        "수령인명",
        "수령인전화",
        "우편번호",
        "주소1",
        "주소2",
        "배송메모",
        "보내는분우편번호",
        "보내는분주소1",
        "보내는분주소2",
      ],
    ],
    {
      orderNo: "A",
      vendorCode: "B",
      vendorProductName: "C",
      purchaseQty: "D",
      receiverName: "G",
      receiverPhone: "H",
      zip: "I",
      address: "J",
      memo: "L",
      senderZip: "M",
      senderAddress: "N",
      senderAddress2: "O",
    },
  ),
  purchaseTemplate(
    "꿈틀",
    [
      [
        "상품명",
        "수량",
        "주문자 성명",
        "주문자 전화번호",
        "수취인 성명",
        "수취인 전화번호",
        "우편번호",
        "수취인 주소",
        "배송메시지",
        "판매사 주문번호",
      ],
    ],
    {
      vendorProductName: "A",
      purchaseQty: "B",
      receiverName: "E",
      receiverPhone: "F",
      zip: "G",
      address: "H",
      memo: "I",
      orderNo: "J",
    },
  ),
  purchaseTemplate(
    "마루채움",
    [
      [
        "상품명",
        "옵션명(옵션 없을시 공란)",
        "수량",
        "수령인",
        "우편번호",
        " 주  소",
        "전화번호",
        "배송메세지",
        "송하인명",
        "송하인주소",
        "송하인전화",
      ],
    ],
    {
      vendorProductName: "A",
      purchaseQty: "C",
      receiverName: "D",
      zip: "E",
      address: "F",
      receiverPhone: "G",
      memo: "H",
      senderName: "I",
      senderAddress: "J",
      senderPhone: "K",
    },
  ),
  purchaseTemplate(
    "에코앤팜",
    [
      [
        "받는사람",
        "전화번호1",
        "전화번호2",
        "우편번호",
        "주소",
        "보내는사람",
        "전화번호",
        "우편번호(지정)",
        "보내시는분 주소",
        "수량a",
        "수량b",
        "수량c",
        "운임",
        "상품명",
        "특기사항",
        "배송메시지",
        "상품주문번호",
      ],
    ],
    {
      receiverName: "A",
      receiverPhone: "B",
      zip: "D",
      address: "E",
      senderName: "F",
      senderPhone: "G",
      senderZip: "H",
      senderAddress: "I",
      purchaseQty: "J",
      vendorProductName: "N",
      memo: "P",
      orderNo: "Q",
    },
  ),
  purchaseTemplate(
    "PBF",
    [
      [
        "일자",
        "거래처명",
        "받는분성명",
        "받는분전화번호",
        "받는분기타연락처",
        "받는분주소",
        "품목명",
        "수량",
        "보내는분성명",
        "보내는분전화번호",
        "보내는분주소",
        "배송메시지",
        "주문번호",
      ],
    ],
    {
      receiverName: "C",
      receiverPhone: "D",
      address: "F",
      vendorProductName: "G",
      purchaseQty: "H",
      senderName: "I",
      senderPhone: "J",
      senderAddress: "K",
      memo: "L",
      orderNo: "M",
    },
  ),
  purchaseTemplate(
    "최고집",
    [
      [
        "업체주문번호",
        "품목명",
        "수량",
        "주문자성명",
        "주문자전화번호",
        "받는분성명",
        "받는분전화번호",
        "받는분우편번호",
        "받는분주소(전체, 분할)",
        "배송메세지1",
        "공급가",
        "택배사",
        "송장번호",
        "코드",
        "고객주문번호",
      ],
    ],
    {
      orderNo: "A",
      vendorProductName: "B",
      purchaseQty: "C",
      senderName: "D",
      senderPhone: "E",
      receiverName: "F",
      receiverPhone: "G",
      zip: "H",
      address: "I",
      memo: "J",
      cost: "K",
      vendorCode: "N",
    },
  ),
  purchaseTemplate(
    "과일 방앗간",
    [
      [
        "업체주문번호",
        "품목명",
        "수량",
        "주문자성명",
        "주문자전화번호",
        "받는분성명",
        "받는분전화번호",
        "받는분우편번호",
        "받는분주소(전체, 분할)",
        "배송메세지1",
        "공급가",
        "택배사",
        "송장번호",
        "코드",
        "고객주문번호",
      ],
    ],
    {
      orderNo: "A",
      vendorProductName: "B",
      purchaseQty: "C",
      senderName: "D",
      senderPhone: "E",
      receiverName: "F",
      receiverPhone: "G",
      zip: "H",
      address: "I",
      memo: "J",
      cost: "K",
      vendorCode: "N",
    },
  ),
  purchaseTemplate(
    "덤덤몰",
    [
      [
        "주문자명",
        "주문자 전화번호",
        "보내는분 주소",
        "상품명(옵션포함)",
        "주문건수",
        "받는분 성명",
        "받는분 전화번호",
        "받는분주소",
        "배송메세지",
        "택배사",
        "운송장",
        "주문번호",
      ],
    ],
    {
      senderName: "A",
      senderPhone: "B",
      senderAddress: "C",
      vendorProductName: "D",
      purchaseQty: "E",
      receiverName: "F",
      receiverPhone: "G",
      address: "H",
      memo: "I",
      orderNo: "L",
    },
  ),
  purchaseTemplate(
    "신선천재",
    [
      [
        "순서",
        "상품번호",
        "상품명",
        "옵션번호",
        "옵션명",
        "배송비조건",
        "판매가격",
        "수량",
        "주문자 성명",
        "주문자 전화번호",
        "수취인 성명",
        "수취인 전화번호",
        "수취인 주소",
        "배송메시지",
        "판매사 주문번호",
        "판매사 옵션번호",
      ],
      [
        "no",
        "goods_no",
        "goods_nm",
        "option_sno",
        "option_name",
        "delivery_sno",
        "option_price",
        "goods_cnt",
        "order_name",
        "order_phone",
        "receiver_name",
        "receiver_phone",
        "receiver_address",
        "order_memo",
        "order_goods_no",
        "order_option_no",
      ],
      [
        "읽기전용",
        "필수 입력값",
        "읽기전용",
        "필수 입력값",
        "읽기전용",
        "읽기전용",
        "읽기전용",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "선택 입력값",
        "선택 입력값",
        "선택 입력값",
      ],
    ],
    {
      vendorCode: "B",
      vendorProductName: "C",
      optionId: "D",
      purchaseQty: "H",
      senderName: "I",
      senderPhone: "J",
      receiverName: "K",
      receiverPhone: "L",
      address: "M",
      memo: "N",
      orderNo: "O",
    },
  ),
  purchaseTemplate(
    "진과유통",
    [
      ["※ 제주/도서산간 택배비는 업체 기준에 맞춰 확인"],
      [
        "순서",
        "상품번호",
        "택배사",
        "배송비조건",
        "입금액",
        "운송장번호",
        "상품명",
        "수량",
        "발송업체 상호",
        "발송업체 연락처",
        "수취인 성명",
        "수취인 전화번호",
        "우편번호",
        "수취인 주소",
        "배송메시지",
        "판매사 주문번호",
        "판매사 옵션번호",
      ],
      ["", "", "", "", ""],
      [
        "no",
        "goods_no",
        "delivery_sno",
        "delivery_sno",
        "option_price",
        "number",
        "goods_nm",
        "goods_cnt",
        "order_name",
        "order_phone",
        "receiver_name",
        "receiver_phone",
        "post",
        "receiver_address",
        "order_memo",
        "order_goods_no",
        "order_option_no",
      ],
      [
        "읽기전용",
        "읽기전용",
        "읽기전용",
        "읽기전용",
        "읽기전용",
        "읽기전용",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "필수 입력값",
        "선택 입력값",
        "필수 입력값",
        "선택 입력값",
        "선택 입력값",
        "선택 입력값",
      ],
    ],
    {
      vendorCode: "B",
      vendorProductName: "G",
      purchaseQty: "H",
      senderName: "I",
      senderPhone: "J",
      receiverName: "K",
      receiverPhone: "L",
      zip: "M",
      address: "N",
      memo: "O",
      orderNo: "P",
      optionId: "Q",
    },
  ),
];

const DEFAULT_INVOICE_TEMPLATES: InvoiceTemplateSetting[] = [
  invoiceTemplate("공통", {
    orderNo: "A",
    receiverName: "B",
    address: "C",
    productName: "D",
    courier: "E",
    trackingNo: "F",
    channel: "",
  }),
  invoiceTemplate("최고집", {
    orderNo: "A",
    receiverName: "F",
    address: "I",
    productName: "B",
    courier: "L",
    trackingNo: "M",
    channel: "",
  }),
  invoiceTemplate("과일 방앗간", {
    orderNo: "A",
    receiverName: "F",
    address: "I",
    productName: "B",
    courier: "L",
    trackingNo: "M",
    channel: "",
  }),
  invoiceTemplate("덤덤몰", {
    orderNo: "L",
    receiverName: "F",
    address: "H",
    productName: "D",
    courier: "J",
    trackingNo: "K",
    channel: "",
  }),
  invoiceTemplate("진과유통", {
    orderNo: "P",
    receiverName: "K",
    address: "N",
    productName: "G",
    courier: "C",
    trackingNo: "F",
    channel: "",
  }),
];

const EMPTY_MAPPING_CHECK: MappingCheckSummary = {
  sourceSession: "",
  totalOrders: 0,
  matched: 0,
  unmatched: 0,
  vendors: 0,
  checkedAt: "",
};

function makeId(prefix = "row") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeB2BVendorLink(
  vendorName: string,
  url: string,
  memo = "",
  enabled = true,
): B2BVendorLink {
  return { id: makeId("b2b-link"), vendorName, url, memo, enabled };
}

function makeMapping(
  channel: Channel,
  optionId: string,
  vendorName: string,
  vendorCode: string,
  vendorProductName: string,
  cost: number,
  baseQty: number,
): MappingRow {
  return {
    id: makeId("map"),
    channel,
    optionId,
    vendorName,
    vendorCode,
    vendorProductName,
    cost,
    baseQty,
  };
}

function purchaseTemplate(
  vendorName: string,
  headerRows: string[][],
  columns: Partial<PurchaseTemplateSetting["columns"]>,
): PurchaseTemplateSetting {
  return {
    id: makeId("purchase-template"),
    vendorName,
    enabled: true,
    startRow: headerRows.length + 1,
    headerRows,
    columns: {
      channel: "",
      orderNo: "",
      optionId: "",
      vendorCode: "",
      vendorProductName: "",
      purchaseQty: "",
      receiverName: "",
      receiverPhone: "",
      zip: "",
      address: "",
      memo: "",
      cost: "",
      senderName: "",
      senderAddress: "",
      senderPhone: "",
      senderZip: "",
      senderAddress2: "",
      ...columns,
    },
  };
}

function invoiceTemplate(
  vendorName: string,
  columns: Partial<InvoiceTemplateSetting["columns"]>,
): InvoiceTemplateSetting {
  return {
    id: makeId("invoice-template"),
    vendorName,
    enabled: true,
    headerRow: 1,
    startRow: 2,
    columns: {
      channel: "",
      orderNo: "",
      receiverName: "",
      address: "",
      productName: "",
      courier: "",
      trackingNo: "",
      ...columns,
    },
  };
}

function shipmentTemplate(
  channel: Channel,
  headerRows: string[][],
  startRow: number,
): ChannelShipmentTemplateSetting {
  return {
    id: makeId("shipment-template"),
    channel,
    enabled: true,
    startRow,
    headerRows,
  };
}

function channelPurchaseTemplate(
  channel: Channel,
  headerRows = [CHANNEL_PURCHASE_TEMPLATE_HEADERS],
  columns: Partial<ChannelPurchaseTemplateSetting["columns"]> = {},
): ChannelPurchaseTemplateSetting {
  return {
    id: makeId("channel-purchase-template"),
    channel,
    enabled: true,
    startRow: headerRows.length + 1,
    headerRows,
    columns: { ...DEFAULT_CHANNEL_PURCHASE_COLUMNS, ...columns },
  };
}

function text(value: unknown) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function cleanId(value: unknown) {
  return text(value)
    .replace(/^'/, "")
    .replace(/[\s,]/g, "")
    .replace(/\.0$/, "");
}


const DELIVERY_MESSAGE_EXACT_KEYS = new Set([
  "memo",
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

function normalizeDeliveryKey(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function isDeliveryMessageKey(key: string, path: string[]) {
  const normalizedKey = normalizeDeliveryKey(key);
  if (DELIVERY_MESSAGE_EXACT_KEYS.has(normalizedKey)) return true;
  if (normalizedKey === "message") {
    const normalizedPath = normalizeDeliveryKey(path.join("."));
    return /delivery|shipping|parcel|receiver|recipient|order|customer|buyer|request|memo|배송|수취|수령|주문|고객|요청|메모|메시지|메세지/.test(normalizedPath);
  }
  return (
    (normalizedKey.includes("delivery") || normalizedKey.includes("shipping") || normalizedKey.includes("parcel") || normalizedKey.includes("배송")) &&
    (normalizedKey.includes("memo") || normalizedKey.includes("message") || normalizedKey.includes("note") || normalizedKey.includes("request") || normalizedKey.includes("요청") || normalizedKey.includes("메모") || normalizedKey.includes("메시지") || normalizedKey.includes("메세지"))
  );
}

function displayApiText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return text(value);
  if (Array.isArray(value)) return value.map(displayApiText).filter(Boolean).join(" ").trim();
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["memo", "message", "parcelPrintMessage", "shippingNote", "deliveryMessage", "deliveryMemo", "shippingMessage"]) {
      const found = displayApiText(obj[key]);
      if (found) return found;
    }
  }
  return "";
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
      const candidate = displayApiText(inner);
      if (candidate) return candidate;
    }
  }
  for (const [key, inner] of Object.entries(obj)) {
    const found = extractDeliveryMessageDeep(inner, [...path, key], depth + 1);
    if (found) return found;
  }
  return "";
}

function expandScientificOrder(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^([0-9]+)(?:\.([0-9]+))?[eE]\+([0-9]+)$/);
  if (!match) return raw;
  const intPart = match[1];
  const fraction = match[2] || "";
  const exp = Number(match[3]);
  if (!Number.isFinite(exp) || exp > 30) return raw.toUpperCase();
  const digits = intPart + fraction;
  const shift = exp - fraction.length;
  return shift >= 0
    ? digits + "0".repeat(shift)
    : `${digits.slice(0, intPart.length + exp)}.${digits.slice(intPart.length + exp)}`;
}

function normalizeOrderKey(value: unknown) {
  return expandScientificOrder(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^[\s'’‘`]+/, "")
    .replace(/[’‘`]/g, "")
    .replace(/\.0+$/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function orderKeyVariants(value: unknown) {
  const raw = text(value);
  const set = new Set<string>();
  const add = (candidate: unknown) => {
    const key = normalizeOrderKey(candidate);
    if (key && key.length >= 5) set.add(key);
  };
  add(raw);
  const base = normalizeOrderKey(raw);
  add(
    base.replace(
      /^(업체주문번호|거래처주문번호|판매처주문번호|판매자주문번호|공급사주문번호|입점사주문번호|출고처주문번호|B2B주문번호|쇼핑몰주문번호|마켓주문번호|오픈마켓주문번호|외부주문번호|통합주문번호|주문번호|주문NO|주문ID|주문코드|ORDERNO|ORDERID|ORDERNUMBER|MALLORDERNO|MARKETORDERNO|SELLERORDERNO|VENDORORDERNO|PARTNERORDERNO)[:：#-]?/i,
      "",
    ),
  );
  add(base.replace(/[^0-9A-Z]/g, ""));
  const digits = base.replace(/[^0-9]/g, "");
  if (digits.length >= 8) add(digits);
  normalizeOrderKey(raw.replace(/[\r\n\t]+/g, " "))
    .split(/[^0-9A-Z]+/)
    .filter(Boolean)
    .forEach((part) => {
      add(part);
      const partDigits = part.replace(/[^0-9]/g, "");
      if (partDigits.length >= 8) add(partDigits);
    });
  return Array.from(set);
}

function looksLikeInstructionRow(row: string[]) {
  const joined = row.map(text).join(" ");
  const hitCount = row.filter((value) =>
    /수정\s*불가|읽기전용|입력값|수정가능/.test(text(value)),
  ).length;
  return (
    hitCount >= 2 ||
    (/수정\s*불가|읽기전용/.test(joined) && !/\d{5,}/.test(joined))
  );
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHeader(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]{}·.,:;_\-\/\\\n\r]/g, "");
}

function normalizeName(value: unknown) {
  return text(value)
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]{}·.,:;_\-\/\\]/g, "")
    .replace(/(고객님|님)$/g, "");
}

function normalizeAddress(value: unknown) {
  return text(value)
    .replace(/^\s*[\[(（]?[0-9]{5}[\])）]?\s*/g, "")
    .replace(/대한민국|한국/g, "")
    .replace(/서울특별시/g, "서울")
    .replace(/부산광역시/g, "부산")
    .replace(/대구광역시/g, "대구")
    .replace(/인천광역시/g, "인천")
    .replace(/광주광역시/g, "광주")
    .replace(/대전광역시/g, "대전")
    .replace(/울산광역시/g, "울산")
    .replace(/세종특별자치시/g, "세종")
    .replace(/경기도/g, "경기")
    .replace(/강원특별자치도|강원도/g, "강원")
    .replace(/충청북도/g, "충북")
    .replace(/충청남도/g, "충남")
    .replace(/전라북도|전북특별자치도/g, "전북")
    .replace(/전라남도/g, "전남")
    .replace(/경상북도/g, "경북")
    .replace(/경상남도/g, "경남")
    .replace(/제주특별자치도/g, "제주")
    .replace(/[\r\n\t,;]+/g, " ")
    .replace(/[()（）\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressPrefix(value: unknown) {
  const normalized = normalizeAddress(value);
  const words = normalized
    .split(/\s+/)
    .map((word) => word.replace(/[^0-9a-zA-Z가-힣]/g, ""))
    .filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).join("");
  const compact = normalized.replace(/[^0-9a-zA-Z가-힣]/g, "");
  return compact.slice(0, Math.min(10, compact.length));
}

function productBigrams(value: unknown) {
  const compact = text(value)
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣]+/g, "");
  const stop = new Set([
    "상품",
    "제품",
    "품목",
    "옵션",
    "무료",
    "배송",
    "특가",
    "세트",
    "단품",
  ]);
  const result = new Set<string>();
  for (let i = 0; i < compact.length - 1; i += 1) {
    const token = compact.slice(i, i + 2);
    if (!stop.has(token) && !/^\d{2}$/.test(token)) result.add(token);
  }
  return result;
}

function hasSharedProductToken(a: unknown, b: unknown) {
  const aTokens = productBigrams(a);
  const bTokens = productBigrams(b);
  return [...aTokens].some((token) => bTokens.has(token));
}

function findHeaderRow(rows: string[][], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex].map(normalizeHeader);
    if (normalizedAliases.some((alias) => row.includes(alias))) return rowIndex;
  }
  return 0;
}

function buildHeaderMap(headerRow: string[]) {
  const map = new Map<string, number>();
  headerRow.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function cell(row: string[], map: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const index = map.get(normalizeHeader(alias));
    if (index !== undefined) return text(row[index]);
  }
  return "";
}

function rawOrderValue(order: OrderRow | undefined, aliases: string[]) {
  if (!order?.raw) return "";
  for (const alias of aliases) {
    const value = order.raw[normalizeHeader(alias)];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function rawRowRecord(headerRow: string[], row: string[]) {
  return headerRow.reduce<Record<string, string>>((acc, header, index) => {
    const key = normalizeHeader(header);
    if (key && acc[key] === undefined) acc[key] = text(row[index]);
    return acc;
  }, {});
}

function parseChannel(value: unknown, fallback: Channel = "쿠팡"): Channel {
  const v = text(value).toLowerCase();
  if (v.includes("toss") || v.includes("토스")) return "토스";
  if (v.includes("coupang") || v.includes("쿠팡")) return "쿠팡";
  return fallback;
}

function columnToIndex(column: string) {
  const col = text(column).toUpperCase();
  if (!col) return -1;
  let n = 0;
  for (const ch of col) {
    if (ch < "A" || ch > "Z") return -1;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function indexToColumn(index: number) {
  if (!Number.isFinite(index) || index < 0) return "";
  let n = Math.floor(index) + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function columnLetterByAliases(headerRow: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const index = headerRow.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header)),
  );
  return index >= 0 ? indexToColumn(index) : "";
}

function cleanVendorNameFromFile(fileName: string) {
  return text(fileName)
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/[_-]?(발주양식|발주|송장엑셀|송장|운송장|택배|배송|양식).*$/i, "")
    .trim() || "새업체";
}

function maxNonEmptyRowIndex(rows: string[][]) {
  let last = 0;
  rows.forEach((row, index) => {
    if (row.some((cell) => text(cell))) last = index;
  });
  return last;
}

function headerRowsForTemplate(rows: string[][], headerIndex: number) {
  const end = Math.max(0, Math.min(headerIndex, maxNonEmptyRowIndex(rows)));
  const headerRows = rows.slice(0, end + 1);
  return headerRows.length ? headerRows : [rows[0] || []];
}

function inferPurchaseTemplateFromRows(
  rows: string[][],
  fileName: string,
) {
  const headerIndex = findHeaderRow(rows, [
    "주문번호",
    "옵션ID",
    "업체상품명",
    "품목명",
    "수량",
    "수취인",
    "받는분성명",
  ]);
  const headerRow = rows[headerIndex] || [];
  return purchaseTemplate(
    cleanVendorNameFromFile(fileName),
    headerRowsForTemplate(rows, headerIndex),
    {
      channel: columnLetterByAliases(headerRow, ["채널", "판매처", "마켓"]),
      orderNo: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.orderNo),
      optionId: columnLetterByAliases(headerRow, ["옵션ID", "옵션 ID", "판매처 옵션ID", "상품옵션ID"]),
      vendorCode: columnLetterByAliases(headerRow, ["코드번호", "코드", "업체상품코드", "상품코드", "관리코드"]),
      vendorProductName: columnLetterByAliases(headerRow, ["업체상품명", "품목명", "상품명", "제품명", "B2B상품명"]),
      purchaseQty: columnLetterByAliases(headerRow, ["구매수량", "발주수량", "수량", "주문수량", "구매수(수량)"]),
      receiverName: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.receiverName),
      receiverPhone: columnLetterByAliases(headerRow, ["수취인전화번호", "수령인 연락처", "받는분전화번호", "전화번호", "연락처"]),
      zip: columnLetterByAliases(headerRow, ["우편번호", "받는분우편번호", "수취인 우편번호"]),
      address: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.address),
      memo: columnLetterByAliases(headerRow, ["배송메시지", "배송메세지", "주문요청사항", "요청사항", "메모"]),
      cost: columnLetterByAliases(headerRow, ["원가", "공급가", "매입가", "단가"]),
      senderName: columnLetterByAliases(headerRow, ["보내는분성명", "보내는분", "주문자성명", "주문자명", "발송인"]),
      senderAddress: columnLetterByAliases(headerRow, ["보내는분주소", "주문자주소", "발송인주소"]),
      senderPhone: columnLetterByAliases(headerRow, ["보내는분전화번호", "주문자전화번호", "발송인전화번호"]),
      senderZip: columnLetterByAliases(headerRow, ["보내는분우편번호", "주문자우편번호"]),
    },
  );
}

function inferInvoiceTemplateFromRows(
  rows: string[][],
  fileName: string,
) {
  const headerIndex = findBestInvoiceHeaderRow(rows);
  const headerRow = rows[headerIndex] || [];
  return invoiceTemplate(cleanVendorNameFromFile(fileName), {
    channel: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.channel),
    orderNo: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.orderNo),
    receiverName: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.receiverName),
    address: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.address),
    productName: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.productName),
    courier: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.courier),
    trackingNo: columnLetterByAliases(headerRow, INVOICE_HEADER_ALIASES.trackingNo),
  });
}

function maxColumnFromLetters(letters: string[]) {
  return (
    Math.max(0, ...letters.map(columnToIndex).filter((idx) => idx >= 0)) + 1
  );
}

async function importRowsFromFile(file: File) {
  const rows = await readSpreadsheetRows(file);
  if (!rows.length)
    throw new Error(`${file.name}: 읽을 수 있는 행이 없습니다.`);
  return rows;
}

function parseMappingRows(rows: string[][]) {
  const headerIndex = findHeaderRow(rows, [
    "채널",
    "옵션ID",
    "쿠팡 옵션ID",
    "토스옵션ID",
    "업체명",
    "B2B업체",
  ]);
  const map = buildHeaderMap(rows[headerIndex]);
  const result: MappingRow[] = [];

  rows.slice(headerIndex + 1).forEach((row) => {
    if (looksLikeInstructionRow(row)) return;
    const activeFlag = normalizeHeader(cell(row, map, ["사용여부", "사용", "활성", "isActive", "active"]));
    if (["n", "no", "false", "0", "미사용", "중지", "사용안함"].includes(activeFlag)) return;
    const channelText = cell(row, map, ["채널", "판매처", "마켓"]);
    const genericOptionId = cleanId(
      cell(row, map, [
        "옵션ID",
        "옵션 ID",
        "판매처 옵션ID",
        "옵션관리코드",
        "옵션 관리 코드",
        "productItemManagementCode",
        "stockId",
      ]),
    );
    const coupangOptionId = cleanId(
      cell(row, map, ["쿠팡 옵션ID", "쿠팡옵션ID", "쿠팡 옵션 ID"]),
    );
    const tossOptionId = cleanId(
      cell(row, map, ["토스옵션ID", "토스 옵션ID", "토스 옵션 ID", "토스 stockId", "stockId"]),
    );
    const tossOptionManagementCode = cleanId(
      cell(row, map, [
        "토스 옵션관리코드",
        "토스 옵션 관리 코드",
        "토스옵션관리코드",
        "토스 productItemManagementCode",
        "productItemManagementCode",
      ]),
    );
    const common = {
      vendorName: cell(row, map, ["업체명", "B2B업체", "B2B 업체", "발주처", "공급처", "거래처", "vendor", "vendorName"]),
      vendorCode: cell(row, map, [
        "코드번호",
        "코드",
        "업체상품코드",
        "상품코드",
      ]),
      vendorProductName: cell(row, map, [
        "업체상품명",
        "업체상품 및 검색",
        "발주상품명",
        "발주처상품명",
        "B2B상품명",
        "상품명",
      ]),
      cost: toNumber(cell(row, map, ["원가", "공급가", "매입가"]), 0),
      baseQty: toNumber(cell(row, map, ["기본수량", "발주수량배수", "수량배수", "수량", "기준수량"]), 1),
    };
    const pushRow = (channel: Channel, optionId: string) => {
      if (!optionId && !common.vendorName && !common.vendorProductName) return;
      result.push({ id: makeId("map"), channel, optionId, ...common });
    };

    if (channelText || genericOptionId) {
      const channel = parseChannel(channelText, "쿠팡");
      pushRow(
        channel,
        genericOptionId ||
          (channel === "쿠팡" ? coupangOptionId : tossOptionId || tossOptionManagementCode),
      );
      if (channel === "토스" && tossOptionManagementCode && tossOptionManagementCode !== (genericOptionId || tossOptionId)) {
        pushRow("토스", tossOptionManagementCode);
      }
      return;
    }

    if (coupangOptionId) pushRow("쿠팡", coupangOptionId);
    if (tossOptionId) pushRow("토스", tossOptionId);
    if (tossOptionManagementCode && tossOptionManagementCode !== tossOptionId) pushRow("토스", tossOptionManagementCode);
  });

  return result.filter(
    (row) => row.vendorName || row.optionId || row.vendorProductName,
  );
}

function mappingImportSummary(rows: MappingRow[]) {
  const counts = rows.reduce<Record<Channel, number>>((acc, row) => {
    const channel = parseChannel(row.channel);
    acc[channel] = toNumber(acc[channel], 0) + 1;
    return acc;
  }, { 쿠팡: 0, 토스: 0 });
  const vendors = Array.from(new Set(rows.map((row) => text(row.vendorName)).filter(Boolean)));
  const missingOption = rows.filter((row) => !cleanId(row.optionId)).length;
  const missingVendor = rows.filter((row) => !text(row.vendorName) || !text(row.vendorProductName)).length;
  return `쿠팡 ${counts.쿠팡}행, 토스 ${counts.토스}행, 업체 ${vendors.length}곳${missingOption ? `, 옵션ID 누락 ${missingOption}행` : ""}${missingVendor ? `, 업체정보 확인 ${missingVendor}행` : ""}`;
}

function makeTossOptionIdRow(
  optionId: string,
  optionCode: string,
  productName = "",
  memo = "",
  productId = "",
  itemName = "",
  managementCode = "",
): TossOptionIdRow {
  const cleanManagementCode = text(managementCode);
  const cleanItemName = text(itemName);
  return {
    id: makeId("toss-option"),
    optionId: cleanId(optionId),
    optionCode: text(optionCode || cleanManagementCode || cleanItemName),
    productName: text(productName),
    memo: text(memo),
    productId: cleanId(productId),
    itemName: cleanItemName,
    managementCode: cleanManagementCode,
  };
}

function normalizeOptionCodeKey(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]{}·.,:;_\-\/\\]/g, "");
}

function optionWeightKey(value: unknown) {
  const compact = text(value).toLowerCase().replace(/\s+/g, "");
  const kg = compact.match(/([0-9]+(?:\.[0-9]+)?)\s*kg/);
  if (kg) return `${Number(kg[1])}kg`;
  const g = compact.match(/([0-9]+(?:\.[0-9]+)?)\s*g/);
  if (g) return `${Number(g[1])}g`;
  return "";
}

function parseTossOptionIdRows(rows: string[][]) {
  const headerIndex = findHeaderRow(rows, [
    "옵션 ID",
    "옵션ID",
    "옵션 관리 코드",
    "옵션관리코드",
  ]);
  const headerRow = rows[headerIndex] || [];
  const map = buildHeaderMap(headerRow);
  const result: TossOptionIdRow[] = [];
  rows.slice(headerIndex + 1).forEach((row) => {
    if (looksLikeInstructionRow(row)) return;
    const activeFlag = normalizeHeader(cell(row, map, ["사용여부", "사용", "활성", "isActive", "active"]));
    if (["n", "no", "false", "0", "미사용", "중지", "사용안함"].includes(activeFlag)) return;
    const optionId = cleanId(
      cell(row, map, [
        "옵션 ID",
        "옵션ID",
        "옵션 번호",
        "옵션번호",
        "판매자센터 옵션ID",
      ]),
    );
    const managementCode = cell(row, map, [
      "옵션 관리 코드",
      "옵션관리코드",
      "토스 옵션관리코드",
      "토스옵션관리코드",
      "관리코드",
      "managementCode",
      "productItemManagementCode",
    ]);
    const itemName = cell(row, map, [
      "옵션명",
      "아이템명",
      "상품아이템명",
      "itemName",
      "optionName",
    ]);
    const optionCode = managementCode || itemName || cell(row, map, ["옵션", "코드"]);
    const productName = cell(row, map, [
      "상품명",
      "상품 이름",
      "판매상품명",
      "등록상품명",
      "상품 관리명",
      "productName",
    ]);
    const productId = cell(row, map, ["상품ID", "상품 ID", "토스 상품ID", "productId"]);
    const memo = cell(row, map, ["메모", "비고", "상태"]);
    if (!optionId && !optionCode && !productName) return;
    if (!optionId || !optionCode) return;
    result.push(makeTossOptionIdRow(optionId, optionCode, productName, memo, productId, itemName, managementCode));
  });
  return normalizeTossOptionIdRows(result);
}

function normalizeTossOptionIdRows(rows: TossOptionIdRow[]) {
  const seen = new Set<string>();
  const result: TossOptionIdRow[] = [];
  rows.forEach((row) => {
    const optionId = cleanId(row.optionId);
    const optionCode = text(row.optionCode);
    if (!optionId || !optionCode) return;
    const key = `${optionId}|${normalizeOptionCodeKey(optionCode)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      id: row.id || makeId("toss-option"),
      optionId,
      optionCode,
      productName: text(row.productName),
      memo: text(row.memo),
      productId: cleanId(row.productId),
      itemName: text(row.itemName),
      managementCode: text(row.managementCode),
    });
  });
  return result;
}

type TossOptionLookup = {
  byProductCode: Map<string, TossOptionIdRow>;
  byCode: Map<string, TossOptionIdRow>;
  ambiguousCodes: Set<string>;
  byWeight: Map<string, TossOptionIdRow>;
  ambiguousWeights: Set<string>;
};

function tossMasterAliasKeys(row: TossOptionIdRow) {
  const values = [
    row.optionCode,
    row.managementCode,
    row.itemName,
    row.productName,
    `${row.productName} ${row.optionCode}`,
    `${row.productName} ${row.managementCode}`,
    `${row.productName} ${row.itemName}`,
  ];
  const seen = new Set<string>();
  return values
    .map((value) => normalizeOptionCodeKey(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function setUniqueTossOption(
  map: Map<string, TossOptionIdRow>,
  ambiguous: Set<string>,
  key: string,
  row: TossOptionIdRow,
) {
  if (!key || ambiguous.has(key)) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, row);
    return;
  }
  if (cleanId(existing.optionId) === cleanId(row.optionId)) return;
  map.delete(key);
  ambiguous.add(key);
}

function buildTossOptionLookup(rows: TossOptionIdRow[]): TossOptionLookup {
  const byProductCode = new Map<string, TossOptionIdRow>();
  const byCode = new Map<string, TossOptionIdRow>();
  const ambiguousCodes = new Set<string>();
  const weightBuckets = new Map<string, TossOptionIdRow[]>();
  normalizeTossOptionIdRows(rows).forEach((row) => {
    const keys = tossMasterAliasKeys(row);
    keys.forEach((key) => {
      setUniqueTossOption(byCode, ambiguousCodes, key, row);
      if (row.productId) setUniqueTossOption(byProductCode, ambiguousCodes, `${row.productId}|${key}`, row);
    });
    const weight = optionWeightKey(row.itemName) || optionWeightKey(row.optionCode) || optionWeightKey(row.productName);
    if (weight) {
      const bucket = weightBuckets.get(weight) || [];
      bucket.push(row);
      weightBuckets.set(weight, bucket);
    }
  });
  const byWeight = new Map<string, TossOptionIdRow>();
  const ambiguousWeights = new Set<string>();
  weightBuckets.forEach((bucket, weight) => {
    const uniqueIds = new Set(bucket.map((row) => row.optionId));
    if (uniqueIds.size === 1) byWeight.set(weight, bucket[0]);
    else ambiguousWeights.add(weight);
  });
  return { byProductCode, byCode, ambiguousCodes, byWeight, ambiguousWeights };
}

function tossOrderProductIdCandidates(order: OrderRow) {
  const raw = order.raw || {};
  const seen = new Set<string>();
  return [
    text(raw.tossProductId),
    text(raw.productId),
    text(raw.parentProductId),
  ]
    .map(cleanId)
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function tossOrderCodeCandidates(order: OrderRow) {
  const raw = order.raw || {};
  const values = [
    raw.tossProductItemManagementCode,
    raw.productItemManagementCode,
    raw.optionManagementCode,
    raw.tossOptionManagementCode,
    raw.tossProductItemName,
    raw.itemName,
    order.optionName,
    `${order.productName} ${order.optionName}`,
    raw.productManagementCode,
    raw.tossProductManagementCode,
  ];
  const seen = new Set<string>();
  return values
    .map((value) => normalizeOptionCodeKey(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function findTossOptionMasterForOrder(order: OrderRow, lookup: TossOptionLookup) {
  if (parseChannel(order.channel) !== "토스") return undefined;
  const codeCandidates = tossOrderCodeCandidates(order);
  const productIds = tossOrderProductIdCandidates(order);

  for (const productId of productIds) {
    for (const code of codeCandidates) {
      const row = lookup.byProductCode.get(`${productId}|${code}`);
      if (row) return row;
    }
  }

  for (const code of codeCandidates) {
    const row = lookup.byCode.get(code);
    if (row) return row;
  }

  const weight = optionWeightKey(order.optionName) || optionWeightKey(order.productName);
  if (weight && lookup.byWeight.has(weight)) return lookup.byWeight.get(weight);
  return undefined;
}

function applyTossOptionIdsToOrders(orders: OrderRow[], masters: TossOptionIdRow[]) {
  if (!masters.length) return { rows: orders, updated: 0, unresolved: 0 };
  const lookup = buildTossOptionLookup(masters);
  let updated = 0;
  let unresolved = 0;
  const rows = orders.map((order) => {
    if (parseChannel(order.channel) !== "토스") return order;
    const current = cleanId(order.optionId);
    const master = findTossOptionMasterForOrder(order, lookup);
    if (!master) {
      unresolved += 1;
      return order;
    }
    if (current === cleanId(master.optionId)) {
      return {
        ...order,
        optionName: order.optionName || master.optionCode,
        raw: {
          ...(order.raw || {}),
          tossselleroptionid: master.optionId,
          tossProductItemId: master.optionId,
          tossoptionmanagementcode: master.managementCode || master.optionCode,
          tossOptionManagementCode: master.managementCode || master.optionCode,
          tossProductItemManagementCode: master.managementCode || master.optionCode,
          tossProductItemName: master.itemName,
        },
      };
    }
    updated += 1;
    return {
      ...order,
      optionId: master.optionId,
      optionName: order.optionName || master.optionCode,
      raw: {
        ...(order.raw || {}),
        tossselleroptionid: master.optionId,
        tossProductItemId: master.optionId,
        tossoptionmanagementcode: master.managementCode || master.optionCode,
        tossOptionManagementCode: master.managementCode || master.optionCode,
        tossProductItemManagementCode: master.managementCode || master.optionCode,
        tossProductItemName: master.itemName,
      },
    };
  });
  return { rows, updated, unresolved };
}

function tossOptionIdRowsToSheet(rows: TossOptionIdRow[]) {
  return [
    ["상품ID", "옵션 ID", "옵션 관리 코드", "옵션명", "상품명", "메모"],
    ...normalizeTossOptionIdRows(rows).map((row) => [
      row.productId,
      row.optionId,
      row.managementCode || row.optionCode,
      row.itemName,
      row.productName,
      row.memo,
    ]),
  ];
}

function makeCoupangOptionMasterRow(
  optionId: string,
  productName = "",
  optionName = "",
  salePrice = 0,
  status = "",
  source: CoupangOptionMasterRow["source"] = "order",
): CoupangOptionMasterRow {
  return {
    id: makeId("coupang-option"),
    optionId: cleanId(optionId),
    productName: text(productName),
    optionName: text(optionName),
    salePrice: toNumber(salePrice, 0),
    status: text(status),
    source,
    syncedAt: new Date().toISOString(),
  };
}

function normalizeCoupangOptionMasterRows(rows?: CoupangOptionMasterRow[]) {
  const seen = new Set<string>();
  const normalized: CoupangOptionMasterRow[] = [];
  (rows || []).forEach((row) => {
    const optionId = cleanId(row.optionId);
    if (!optionId || seen.has(optionId)) return;
    seen.add(optionId);
    normalized.push({
      id: row.id || makeId("coupang-option"),
      optionId,
      productName: text(row.productName),
      optionName: text(row.optionName),
      salePrice: toNumber(row.salePrice, 0),
      status: text(row.status),
      source: row.source || "order",
      syncedAt: text(row.syncedAt) || new Date().toISOString(),
    });
  });
  return normalized;
}

function buildCoupangOptionMasterRowsFromLocal(
  orders: OrderRow[],
  mappings: MappingRow[],
  profitRows: ProfitAnalysisRow[],
  couponRows: CouponRow[],
) {
  const byId = new Map<string, CoupangOptionMasterRow>();
  const put = (row: CoupangOptionMasterRow) => {
    const optionId = cleanId(row.optionId);
    if (!optionId) return;
    const prev = byId.get(optionId);
    if (!prev) {
      byId.set(optionId, { ...row, optionId });
      return;
    }
    byId.set(optionId, {
      ...prev,
      productName: prev.productName || row.productName,
      optionName: prev.optionName || row.optionName,
      salePrice: prev.salePrice || row.salePrice,
      status: prev.status || row.status,
    });
  };

  orders
    .filter((row) => row.channel === "쿠팡")
    .slice()
    .sort((a, b) => text(b.orderedAt).localeCompare(text(a.orderedAt)))
    .forEach((row) =>
      put(
        makeCoupangOptionMasterRow(
          row.optionId,
          row.productName,
          row.optionName,
          row.salePrice,
          row.orderStatus,
          "order",
        ),
      ),
    );

  profitRows
    .filter((row) => row.channel === "쿠팡")
    .forEach((row) =>
      put(
        makeCoupangOptionMasterRow(
          row.optionId,
          row.orderProductName || row.vendorProductName,
          row.orderOptionName,
          row.salePrice,
          row.profitStatus,
          "order",
        ),
      ),
    );

  mappings
    .filter((row) => row.channel === "쿠팡")
    .forEach((row) =>
      put(
        makeCoupangOptionMasterRow(
          row.optionId,
          row.vendorProductName,
          row.vendorCode,
          0,
          row.vendorName,
          "mapping",
        ),
      ),
    );

  couponRows.forEach((row) =>
    put(
      makeCoupangOptionMasterRow(
        row.optionId,
        row.productName,
        "",
        row.salePrice || 0,
        couponActionLabel(row.action),
        row.salePriceSource === "api" ? "api" : "coupon",
      ),
    ),
  );

  return Array.from(byId.values()).sort((a, b) =>
    `${a.productName} ${a.optionName} ${a.optionId}`.localeCompare(
      `${b.productName} ${b.optionName} ${b.optionId}`,
      "ko",
    ),
  );
}

function coupangOptionMasterRowsToSheet(rows: CoupangOptionMasterRow[]) {
  return [
    ["쿠팡 옵션ID", "상품명", "옵션명", "현재판매가", "상태", "출처", "동기화일시"],
    ...normalizeCoupangOptionMasterRows(rows).map((row) => [
      row.optionId,
      row.productName,
      row.optionName,
      row.salePrice,
      row.status,
      row.source === "api"
        ? "쿠팡상품API"
        : row.source === "order"
          ? "주문자료"
          : row.source === "mapping"
            ? "매핑자료"
            : "쿠폰목록",
      row.syncedAt,
    ]),
  ];
}

function normalizeScheduleTime(value: unknown, fallback: string) {
  const raw = text(value);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateTimeText(date: Date, time: string) {
  return `${localDateText(date)} ${time}`;
}

function dailyCouponWindow(schedules: ScheduleConfig, startOffsetDays = 0) {
  const startTime = normalizeScheduleTime(schedules.couponApply.time, "23:51");
  const endTime = normalizeScheduleTime(schedules.couponCancel.time, "23:50");
  const startDate = addLocalDays(new Date(), startOffsetDays);
  const endDate = addLocalDays(startDate, endTime <= startTime ? 1 : 0);
  return {
    startAt: dateTimeText(startDate, startTime),
    endAt: dateTimeText(endDate, endTime),
    startTime,
    endTime,
  };
}

function findCouponTemplateRow(rows: CouponRow[], optionId: string, action: CouponAction) {
  const cleanOptionId = cleanId(optionId);
  return (
    rows.find((row) => row.action === action && cleanId(row.optionId) === cleanOptionId) ||
    rows.find((row) => cleanId(row.optionId) === cleanOptionId) ||
    rows.find((row) => row.action === action) ||
    rows[0]
  );
}

function buildDailyCouponRowsFromOptions(
  action: CouponAction,
  optionRows: CoupangOptionMasterRow[],
  existingRows: CouponRow[],
  schedules: ScheduleConfig,
) {
  const window = dailyCouponWindow(schedules, action === "cancel" ? -1 : 0);
  return normalizeCoupangOptionMasterRows(optionRows).map((option) => {
    const template = findCouponTemplateRow(existingRows, option.optionId, action);
    return makeCouponRow(
      action,
      option.optionId,
      option.productName || template?.productName || "",
      template?.couponName || "24시간 즉시할인",
      template?.discountType || "금액",
      template?.discountValue || 0,
      window.startAt,
      window.endAt,
      action === "cancel"
        ? `매일 ${window.endTime} 일괄 취소 대상`
        : `매일 ${window.startTime} 등록 후 다음 ${window.endTime} 취소 대상`,
      option.salePrice,
      option.source === "api" ? "api" : option.source === "order" ? "order" : "",
    );
  });
}

function couponOperationMemoRows(schedules: ScheduleConfig, optionCount: number) {
  const applyWindow = dailyCouponWindow(schedules, 0);
  const cancelWindow = dailyCouponWindow(schedules, -1);
  return [
    ["항목", "내용"],
    ["운영방식", "쿠팡 24시간 즉시할인쿠폰을 매일 같은 시간에 취소 후 다시 등록"],
    ["취소시간", schedules.couponCancel.time || "23:50"],
    ["등록시간", schedules.couponApply.time || "23:51"],
    ["취소대상기간", `${cancelWindow.startAt} ~ ${cancelWindow.endAt}`],
    ["신규등록기간", `${applyWindow.startAt} ~ ${applyWindow.endAt}`],
    ["옵션수", optionCount],
    ["주의", "쿠팡에서 24시간 쿠폰이 자동 종료되지 않는 경우를 대비해 등록 전 취소를 먼저 실행"],
  ];
}


function makeCouponRow(
  action: CouponAction,
  optionId: string,
  productName = "",
  couponName = "",
  discountType: "금액" | "율" = "금액",
  discountValue = 0,
  startAt = "",
  endAt = "",
  memo = "",
  salePrice = 0,
  salePriceSource: CouponRow["salePriceSource"] = "",
): CouponRow {
  return {
    id: makeId("coupon"),
    action,
    optionId,
    productName,
    couponName,
    discountType,
    discountValue,
    startAt,
    endAt,
    memo,
    salePrice: toNumber(salePrice, 0),
    salePriceSource,
  };
}

function parseCouponRows(rows: string[][]) {
  const headerIndex = findHeaderRow(rows, [
    "옵션ID",
    "쿠팡 옵션ID",
    "동작",
    "할인값",
    "할인금액",
    "할인율",
  ]);
  const map = buildHeaderMap(rows[headerIndex] || []);
  const result: CouponRow[] = [];
  rows.slice(headerIndex + 1).forEach((row) => {
    if (looksLikeInstructionRow(row)) return;
    const activeFlag = normalizeHeader(cell(row, map, ["사용여부", "사용", "활성", "isActive", "active"]));
    if (["n", "no", "false", "0", "미사용", "중지", "사용안함"].includes(activeFlag)) return;
    const optionId = cleanId(
      cell(row, map, [
        "쿠팡 옵션ID",
        "옵션ID",
        "옵션 ID",
        "vendorItemId",
        "벤더아이템ID",
      ]),
    );
    const actionText = cell(row, map, [
      "동작",
      "작업",
      "쿠폰동작",
      "적용/취소",
      "action",
    ]);
    const action: CouponAction = /취소|cancel|delete|remove/i.test(actionText)
      ? "cancel"
      : "apply";
    const discountTypeText = cell(row, map, [
      "할인구분",
      "할인타입",
      "할인유형",
      "discountType",
    ]);
    const discountType: "금액" | "율" = /율|%|percent|rate/i.test(
      discountTypeText,
    )
      ? "율"
      : "금액";
    const discountValue = toNumber(
      cell(row, map, ["할인값", "할인금액", "할인율", "discountValue", "할인"]),
      0,
    );
    const productName = cell(row, map, ["상품명", "제품명", "등록상품명"]);
    const couponName = cell(row, map, ["쿠폰명", "프로모션명", "할인쿠폰명"]);
    const salePrice = toNumber(cell(row, map, ["현재판매가", "현재판매가(선택)", "판매가", "판매가격", "salePrice"]), 0);
    const startAt = cell(row, map, [
      "시작일시",
      "시작일",
      "적용시작",
      "startAt",
    ]);
    const endAt = cell(row, map, ["종료일시", "종료일", "적용종료", "endAt"]);
    const memo = cell(row, map, ["메모", "비고", "memo"]);
    if (!optionId && !productName && !couponName) return;
    result.push(
      makeCouponRow(
        action,
        optionId,
        productName,
        couponName,
        discountType,
        discountValue,
        "",
        "",
        memo,
        salePrice,
        salePrice > 0 ? "manual" : "",
      ),
    );
  });
  return result;
}

function couponRowsToSheet(rows: CouponRow[]) {
  return [
    COUPANG_COUPON_TEMPLATE_HEADERS,
    ...rows.map((row) => [
      row.action === "apply" ? "등록" : "취소",
      row.optionId,
      row.productName,
      row.couponName,
      row.discountType,
      row.discountValue,
      toNumber(row.salePrice, 0) || "",
      row.memo,
    ]),
  ];
}

function normalizeCouponIdList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : String(value || "").split(/[;,\s]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  source.forEach((item) => {
    const id = cleanId(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}


function normalizeCouponSearchText(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/[\s_\-()\[\]{}·.,/\\]/g, "")
    .replace(/20\d{6}$/g, "")
    .replace(/\d{4}$/g, "");
}

function couponDiscountInfoFromTexts(typeText: unknown, valueText: unknown) {
  const typeRaw = text(typeText).toUpperCase();
  const valueRaw = text(valueText);
  const embedded = valueRaw || typeRaw;
  const discountType: "금액" | "율" | "" =
    /RATE|PERCENT|%|율/.test(typeRaw) || /%|율/.test(embedded)
      ? "율"
      : /PRICE|AMOUNT|FIXED|QUANTITY|WON|원|금액/.test(typeRaw) || /\d/.test(embedded)
        ? "금액"
        : "";
  const discountValue = toNumber(String(embedded).replace(/[^0-9.]/g, ""), 0);
  return { discountType, discountValue };
}

function couponProductTokens(value: unknown) {
  const raw = text(value).replace(/20\d{6}/g, "").replace(/\d{4}$/g, "");
  const compact = normalizeCouponSearchText(raw);
  const weightTokens = Array.from(compact.matchAll(/\d+(?:\.\d+)?(?:kg|g|개|미|봉|팩|박스|단|입)/g)).map((m) => m[0]);
  const wordTokens = raw
    .replace(/20\d{6}/g, " ")
    .replace(/\d{4}$/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:kg|g|개|미|봉|팩|박스|단|입)/gi, " ")
    .split(/[^가-힣A-Za-z0-9]+/)
    .map((item) => normalizeCouponSearchText(item))
    .filter((item) => item.length >= 2 && !/^\d+$/.test(item));
  const tokens = Array.from(new Set([...wordTokens.slice(0, 2), ...weightTokens]));
  if (!tokens.length && compact) tokens.push(compact);
  return tokens;
}

function optionMatchesCouponName(option: CoupangOptionMasterRow, couponName: unknown) {
  const tokens = couponProductTokens(couponName);
  if (!tokens.length) return false;
  const haystack = normalizeCouponSearchText(`${option.productName} ${option.optionName} ${option.optionId}`);
  const weightTokens = tokens.filter((token) => /\d/.test(token) && /(kg|g|개|미|봉|팩|박스|단|입)$/.test(token));
  const textTokens = tokens.filter((token) => !weightTokens.includes(token));
  const textOk = textTokens.length ? textTokens.some((token) => haystack.includes(token)) : true;
  const weightOk = weightTokens.length ? weightTokens.every((token) => haystack.includes(token)) : true;
  return textOk && weightOk;
}

function selectedCouponOptionRows(optionRows: CoupangOptionMasterRow[], settings: CouponApiSettings) {
  const normalized = normalizeCoupangOptionMasterRows(optionRows);
  if (settings.selectedMode !== "daily_new" || !settings.selectedCouponName) return [];
  const matched = normalized.filter((option) => optionMatchesCouponName(option, settings.selectedCouponName));
  return matched;
}

function applyCouponSourceToRows(rows: CouponRow[], settings: CouponApiSettings) {
  const discountType = settings.sourceDiscountType || "금액";
  const discountValue = toNumber(settings.sourceDiscountValue, 0);
  const couponName = settings.selectedCouponName || "24시간 즉시할인";
  return rows.map((row) => ({
    ...row,
    couponName,
    discountType: discountType || row.discountType,
    discountValue: discountValue || row.discountValue,
    memo: row.memo.includes("선택 쿠폰 기준") ? row.memo : `${row.memo} / 선택 쿠폰 기준`,
  }));
}

function buildDailyCouponRowsForSelectedCoupon(
  action: CouponAction,
  optionRows: CoupangOptionMasterRow[],
  existingRows: CouponRow[],
  schedules: ScheduleConfig,
  settings: CouponApiSettings,
) {
  const targets = selectedCouponOptionRows(optionRows, settings);
  if (!targets.length) return [];
  const rows = buildDailyCouponRowsFromOptions(action, targets, existingRows, schedules);
  return applyCouponSourceToRows(rows, settings);
}


function rollingCouponTemplateId(sourceCouponId: unknown) {
  const id = cleanId(sourceCouponId);
  return id ? `rolling-coupon-${id}` : makeId("rolling-coupon");
}

function normalizeRollingCouponTemplateOptions(rows?: RollingCouponTemplateOption[] | unknown): RollingCouponTemplateOption[] {
  const source = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  const out: RollingCouponTemplateOption[] = [];
  for (const row of source) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const optionId = cleanId(record.optionId || record.vendorItemId);
    if (!optionId || seen.has(optionId)) continue;
    seen.add(optionId);
    out.push({
      optionId,
      productName: text(record.productName),
      optionName: text(record.optionName),
      salePrice: toNumber(record.salePrice, 0),
      salePriceSource: record.salePriceSource === "api" || record.salePriceSource === "order" || record.salePriceSource === "mapping" || record.salePriceSource === "manual" ? record.salePriceSource : "",
    });
  }
  return out;
}

function normalizeRollingCouponTemplates(rows?: RollingCouponTemplate[] | unknown): RollingCouponTemplate[] {
  const source = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  const out: RollingCouponTemplate[] = [];
  for (const row of source) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const sourceCouponId = cleanId(record.sourceCouponId || record.couponId || record.selectedCouponId);
    const id = text(record.id) || rollingCouponTemplateId(sourceCouponId);
    if (!sourceCouponId || seen.has(id)) continue;
    seen.add(id);
    const discountType = record.discountType === "율" ? "율" : record.discountType === "금액" ? "금액" : "";
    const options = normalizeRollingCouponTemplateOptions(record.options);
    out.push({
      id,
      enabled: record.enabled !== false,
      sourceCouponId,
      latestCouponId: cleanId(record.latestCouponId || record.lastGeneratedCouponId || sourceCouponId),
      contractId: cleanId(record.contractId),
      couponName: text(record.couponName) || `couponId ${sourceCouponId}`,
      status: text(record.status),
      type: text(record.type),
      discountType,
      discountValue: toNumber(record.discountValue, 0),
      startAt: text(record.startAt),
      endAt: text(record.endAt),
      itemCount: toNumber(record.itemCount, options.length),
      options,
      lastGeneratedCouponId: cleanId(record.lastGeneratedCouponId),
      lastGeneratedAt: text(record.lastGeneratedAt),
      lastCanceledAt: text(record.lastCanceledAt),
      savedAt: text(record.savedAt),
    });
  }
  return out;
}

function rollingTemplateOptionsToMasterRows(template: RollingCouponTemplate): CoupangOptionMasterRow[] {
  return normalizeCoupangOptionMasterRows(template.options.map((option) =>
    makeCoupangOptionMasterRow(
      option.optionId,
      option.productName || template.couponName,
      option.optionName || "",
      toNumber(option.salePrice, 0),
      template.status || "APPLIED",
      option.salePriceSource === "api" ? "api" : "coupon",
    ),
  ));
}

function buildRollingTemplateCouponRows(template: RollingCouponTemplate, schedules: ScheduleConfig, existingRows: CouponRow[]) {
  const optionRows = rollingTemplateOptionsToMasterRows(template);
  const attach = (row: CouponRow): CouponRow => ({
    ...row,
    couponName: template.couponName,
    discountType: template.discountType || row.discountType,
    discountValue: toNumber(template.discountValue, 0) || row.discountValue,
    rollingTemplateId: template.id,
    sourceCouponId: template.sourceCouponId,
    latestCouponId: template.latestCouponId || template.lastGeneratedCouponId || template.sourceCouponId,
    contractId: template.contractId,
    memo: `${row.memo} / 반복기준 ${template.couponName}`,
  });
  return [
    ...buildDailyCouponRowsFromOptions("cancel", optionRows, existingRows, schedules).map(attach),
    ...buildDailyCouponRowsFromOptions("apply", optionRows, existingRows, schedules).map(attach),
  ];
}

function buildRollingTemplateCouponRowsForAll(templates: RollingCouponTemplate[], schedules: ScheduleConfig, existingRows: CouponRow[]) {
  return normalizeRollingCouponTemplates(templates)
    .filter((template) => template.enabled)
    .flatMap((template) => buildRollingTemplateCouponRows(template, schedules, existingRows));
}

function normalizeCouponApiSettings(value?: Partial<CouponApiSettings> | null): CouponApiSettings {
  const source = value || {};
  return {
    ...DEFAULT_COUPON_API_SETTINGS,
    selectedContractId: cleanId(source.selectedContractId),
    selectedCouponId: cleanId(source.selectedCouponId),
    selectedCouponStatus: text(source.selectedCouponStatus) || "APPLIED",
    selectedCouponName: text(source.selectedCouponName),
    selectedCouponStartAt: text(source.selectedCouponStartAt),
    selectedCouponEndAt: text(source.selectedCouponEndAt),
    selectedMode: source.selectedMode === "existing" || source.selectedMode === "new" || source.selectedMode === "daily_new" ? source.selectedMode : "",
    sourceCouponId: cleanId(source.sourceCouponId),
    sourceDiscountType: source.sourceDiscountType === "율" ? "율" : source.sourceDiscountType === "금액" ? "금액" : "",
    sourceDiscountValue: toNumber(source.sourceDiscountValue, 0),
    selectedCouponProductFilter: text(source.selectedCouponProductFilter),
    lastGeneratedCouponIds: normalizeCouponIdList(source.lastGeneratedCouponIds || source.lastGeneratedCouponId),
    lastGeneratedCouponId: cleanId(source.lastGeneratedCouponId) || normalizeCouponIdList(source.lastGeneratedCouponIds)[0] || "",
    lastGeneratedAt: text(source.lastGeneratedAt),
    lastCancelCouponIds: normalizeCouponIdList(source.lastCancelCouponIds),
    lastCanceledAt: text(source.lastCanceledAt),
    dailyRollingEnabled: Boolean(source.dailyRollingEnabled || source.selectedMode === "daily_new"),
    savedAt: text(source.savedAt),
  };
}

function couponContractRowsFromApiResult(result: ApiResult): CoupangCouponContractRow[] {
  const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows : [];
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      contractId: cleanId(record.contractId),
      vendorContractId: text(record.vendorContractId),
      contractName: text(record.contractName),
      status: text(record.status),
      startAt: text(record.startAt),
      endAt: text(record.endAt),
      budget: text(record.budget),
    };
  }).filter((row) => row.contractId);
}

function couponListRowsFromApiResult(result: ApiResult): CoupangCouponListRow[] {
  const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows : [];
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const parsed = couponDiscountInfoFromTexts(record.discountType || record.type, record.discountValue || record.discount);
    return {
      couponId: cleanId(record.couponId),
      contractId: cleanId(record.contractId),
      couponName: text(record.couponName),
      status: text(record.status),
      type: text(record.type),
      discount: text(record.discount),
      discountType: (text(record.discountType) === "율" || text(record.discountType) === "금액") ? text(record.discountType) as CoupangCouponListRow["discountType"] : parsed.discountType,
      discountValue: toNumber(record.discountValue, parsed.discountValue),
      startAt: text(record.startAt),
      endAt: text(record.endAt),
    };
  }).filter((row) => row.couponId);
}

function couponItemRowsFromApiResult(result: ApiResult): CoupangCouponItemRow[] {
  const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows : [];
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      couponItemId: cleanId(record.couponItemId),
      couponId: cleanId(record.couponId),
      vendorItemId: cleanId(record.vendorItemId || record.optionId),
      status: text(record.status),
      startAt: text(record.startAt),
      endAt: text(record.endAt),
    };
  }).filter((row) => row.vendorItemId);
}

function normalizeB2BVendorLinks(rows?: B2BVendorLink[]) {
  const source =
    Array.isArray(rows) && rows.length ? rows : DEFAULT_B2B_VENDOR_LINKS;
  return source
    .map((row) => ({
      id: row.id || makeId("b2b-link"),
      vendorName: text(row.vendorName),
      url: text(row.url),
      memo: text(row.memo),
      enabled: row.enabled !== false,
    }))
    .filter((row) => row.vendorName && row.url);
}

function parseB2BVendorLinks(rows: string[][]) {
  const headerIndex = findHeaderRow(rows, [
    "업체명",
    "B2B업체",
    "주소",
    "URL",
    "바로가기",
  ]);
  const map = buildHeaderMap(rows[headerIndex] || []);
  const result: B2BVendorLink[] = [];
  rows.slice(headerIndex + 1).forEach((row) => {
    if (looksLikeInstructionRow(row)) return;
    const activeFlag = normalizeHeader(cell(row, map, ["사용여부", "사용", "활성", "isActive", "active"]));
    if (["n", "no", "false", "0", "미사용", "중지", "사용안함"].includes(activeFlag)) return;
    const vendorName = cell(row, map, [
      "업체명",
      "B2B업체",
      "B2B 업체",
      "거래처",
      "공급사",
    ]);
    const url = cell(row, map, [
      "주소",
      "URL",
      "url",
      "바로가기",
      "사이트",
      "링크",
    ]);
    const memo = cell(row, map, ["메모", "비고", "설명"]);
    const enabledText = cell(row, map, ["사용", "사용여부", "활성", "표시"]);
    if (!vendorName && !url) return;
    if (!vendorName || !url) return;
    const enabled = !/false|n|no|미사용|숨김|비활성|0/i.test(enabledText);
    result.push(makeB2BVendorLink(vendorName, url, memo, enabled));
  });
  return normalizeB2BVendorLinks(result);
}

function b2bVendorLinksToSheet(rows: B2BVendorLink[]) {
  return [
    B2B_VENDOR_LINK_HEADERS,
    ...rows.map((row) => [
      row.vendorName,
      row.url,
      row.memo,
      row.enabled ? "Y" : "N",
    ]),
  ];
}

function parseOrderRows(
  rows: string[][],
  fileName: string,
  fallbackChannel: Channel,
) {
  const headerIndex = findHeaderRow(rows, ["옵션ID", "옵션 ID", "주문번호"]);
  const headerRow = rows[headerIndex] || [];
  const map = buildHeaderMap(headerRow);
  return rows
    .slice(headerIndex + 1)
    .filter((row) => !looksLikeInstructionRow(row))
    .map((row) => {
      const channel = parseChannel(
        cell(row, map, ["채널", "판매처", "마켓"]),
        fallbackChannel,
      );
      const orderNo = normalizeOrderKey(
        cell(row, map, [
          "주문번호",
          "주문 번호",
          "상품주문번호",
          "주문상품번호",
          "업체주문번호",
          "판매사 주문번호",
        ]),
      );
      const optionId = cleanId(
        cell(row, map, [
          "옵션ID",
          "옵션 ID",
          "옵션번호",
          "옵션 관리 코드",
          "판매사 옵션번호",
          "업체상품코드",
        ]),
      );
      return {
        id: makeId("order"),
        channel,
        orderNo,
        orderedAt: cell(row, map, [
          "주문일",
          "주문일시",
          "결제일",
          "결제일시",
          "orderedAt",
        ]),
        optionId,
        productName: cell(row, map, [
          "등록상품명",
          "노출상품명(옵션명)",
          "상품명",
          "상품",
          "제품명",
        ]),
        optionName: cell(row, map, ["등록옵션명", "옵션명", "옵션"]),
        qty: toNumber(
          cell(row, map, [
            "구매수(수량)",
            "주문건수",
            "수량",
            "구매수",
            "goods_cnt",
          ]),
          1,
        ),
        receiverName: cell(row, map, [
          "수취인이름",
          "수취인명",
          "수령인명",
          "받는분성명",
          "받는사람",
          "receiver_name",
        ]),
        receiverPhone: cell(row, map, [
          "수취인전화번호",
          "수령인 연락처",
          "받는분전화번호",
          "전화번호",
          "receiver_phone",
        ]),
        zip: cell(row, map, ["우편번호", "수취인 우편번호", "post"]),
        address: cell(row, map, [
          "수취인 주소",
          "수취인주소",
          "배송지",
          "받는분주소",
          "주소",
          "receiver_address",
        ]),
        memo: cell(row, map, [
          "배송메세지",
          "배송메시지",
          "상품별 추가메시지",
          "주문요청사항",
          "요청사항",
          "order_memo",
        ]),
        salePrice: toNumber(
          cell(row, map, [
            "결제액",
            "결제금액",
            "판매가",
            "판매금액",
            "상품금액",
            "주문금액",
            "option_price",
          ]),
          0,
        ),
        sourceFile: fileName,
        raw: rawRowRecord(headerRow, row),
      } satisfies OrderRow;
    })
    .filter((row) => row.orderNo || row.optionId || row.receiverName);
}

function getInvoiceTemplateForVendor(
  vendorName: string,
  templates: InvoiceTemplateSetting[],
) {
  const normalized = text(vendorName).replace(/\s+/g, "");
  return (
    templates.find(
      (tpl) => tpl.enabled && tpl.vendorName.replace(/\s+/g, "") === normalized,
    ) ||
    templates.find((tpl) => tpl.enabled && tpl.vendorName === "공통") ||
    DEFAULT_INVOICE_TEMPLATES[0]
  );
}

const INVOICE_HEADER_ALIASES = {
  orderNo: [
    "거래처주문번호",
    "거래처 주문번호",
    "업체주문번호",
    "업체 주문번호",
    "B2B주문번호",
    "판매처주문번호",
    "판매자주문번호",
    "판매사주문번호",
    "고객주문번호",
    "외부주문번호",
    "마켓주문번호",
    "쇼핑몰주문번호",
    "주문번호",
    "상품주문번호",
    "주문상품번호",
    "주문상세번호",
    "mallorderno",
    "marketorderno",
    "sellerorderno",
    "vendororderno",
    "orderno",
    "orderid",
    "order number",
  ],
  receiverName: [
    "수취인명",
    "수취인이름",
    "수취인성명",
    "수취인",
    "수령인명",
    "수령인이름",
    "수령인",
    "받는분성명",
    "받는분",
    "받는사람",
    "고객명",
    "성명",
    "이름",
    "receivername",
    "recipientname",
    "consigneename",
  ],
  address: [
    "수취인주소",
    "수취인 주소",
    "수령인주소",
    "수령인 주소",
    "받는분주소",
    "받는분 주소",
    "배송지주소",
    "배송지",
    "배송주소",
    "주소",
    "주소1",
    "주소2",
    "receiveraddress",
    "shippingaddress",
    "deliveryaddress",
    "address",
  ],
  productName: [
    "상품명",
    "상품 명",
    "상품",
    "제품명",
    "품목명",
    "옵션명",
    "상품옵션",
    "product",
    "productname",
    "item",
    "goods",
    "goodsname",
    "sku",
  ],
  courier: [
    "택배사",
    "택배사명",
    "택배회사",
    "배송사",
    "배송사명",
    "배송업체",
    "운송사",
    "운송사명",
    "물류사",
    "물류업체",
    "courier",
    "carrier",
    "deliverycompany",
  ],
  trackingNo: [
    "운송장번호",
    "운송장 번호",
    "운송장no",
    "운송장",
    "송장번호",
    "송장 번호",
    "송장no",
    "송장",
    "배송번호",
    "배송추적번호",
    "등기번호",
    "trackingno",
    "trackingnumber",
    "waybill",
    "invoice",
    "awb",
  ],
  channel: ["채널", "판매처", "마켓", "플랫폼", "channel", "market"],
};

function invoiceHeaderScore(row: string[]) {
  const normalized = row.map(normalizeHeader);
  const scoreField = (aliases: string[]) =>
    aliases.some((alias) => normalized.includes(normalizeHeader(alias)))
      ? 1
      : 0;
  return (
    scoreField(INVOICE_HEADER_ALIASES.trackingNo) * 4 +
    scoreField(INVOICE_HEADER_ALIASES.courier) * 3 +
    scoreField(INVOICE_HEADER_ALIASES.orderNo) * 3 +
    scoreField(INVOICE_HEADER_ALIASES.receiverName) * 2 +
    scoreField(INVOICE_HEADER_ALIASES.address) * 2 +
    scoreField(INVOICE_HEADER_ALIASES.productName)
  );
}

function findBestInvoiceHeaderRow(rows: string[][]) {
  let best = { index: 0, score: -1 };
  rows.slice(0, Math.min(45, rows.length)).forEach((row, index) => {
    const score = invoiceHeaderScore(row);
    if (score > best.score) best = { index, score };
  });
  return best.score > 0 ? best.index : 0;
}

function parseInvoiceRowsAuto(
  rows: string[][],
  fileName: string,
  vendorName: string,
) {
  const headerIndex = findBestInvoiceHeaderRow(rows);
  const map = buildHeaderMap(rows[headerIndex]);
  return rows
    .slice(headerIndex + 1)
    .filter((row) => !looksLikeInstructionRow(row))
    .map(
      (row) =>
        ({
          id: makeId("inv"),
          sourceFile: fileName,
          vendorName,
          channel: cell(row, map, INVOICE_HEADER_ALIASES.channel)
            ? parseChannel(cell(row, map, INVOICE_HEADER_ALIASES.channel))
            : "",
          orderNo: normalizeOrderKey(
            cell(row, map, INVOICE_HEADER_ALIASES.orderNo),
          ),
          receiverName: cell(row, map, INVOICE_HEADER_ALIASES.receiverName),
          address: cell(row, map, INVOICE_HEADER_ALIASES.address),
          productName: cell(row, map, INVOICE_HEADER_ALIASES.productName),
          courier: cell(row, map, INVOICE_HEADER_ALIASES.courier),
          trackingNo: cleanId(
            cell(row, map, INVOICE_HEADER_ALIASES.trackingNo),
          ),
        }) satisfies InvoiceRecord,
    )
    .filter((row) => row.trackingNo && (row.orderNo || row.receiverName));
}

function parseInvoiceRowsByTemplate(
  rows: string[][],
  fileName: string,
  template: InvoiceTemplateSetting,
) {
  const startIndex = Math.max(0, template.startRow - 1);
  const get = (row: string[], letter: string) => {
    const index = columnToIndex(letter);
    return index >= 0 ? text(row[index]) : "";
  };
  return rows
    .slice(startIndex)
    .filter((row) => !looksLikeInstructionRow(row))
    .map(
      (row) =>
        ({
          id: makeId("inv"),
          sourceFile: fileName,
          vendorName: template.vendorName === "공통" ? "" : template.vendorName,
          channel: get(row, template.columns.channel)
            ? parseChannel(get(row, template.columns.channel))
            : "",
          orderNo: normalizeOrderKey(get(row, template.columns.orderNo)),
          receiverName: get(row, template.columns.receiverName),
          address: get(row, template.columns.address),
          productName: get(row, template.columns.productName),
          courier: get(row, template.columns.courier),
          trackingNo: cleanId(get(row, template.columns.trackingNo)),
        }) satisfies InvoiceRecord,
    )
    .filter((row) => row.trackingNo && (row.orderNo || row.receiverName));
}


function parseInvoiceRowsByPurchaseTemplate(
  rows: string[][],
  fileName: string,
  template: PurchaseTemplateSetting,
) {
  const vendorName = template.vendorName === "공통" ? "" : template.vendorName;
  const startIndex = Math.max(
    0,
    (template.startRow || template.headerRows.length + 1) - 1,
  );
  const headerIndex = findBestInvoiceHeaderRow(rows);
  const headerMap = buildHeaderMap(rows[headerIndex] || []);
  const getByLetter = (row: string[], letter: string) => {
    const index = columnToIndex(letter);
    return index >= 0 ? text(row[index]) : "";
  };
  const getByHeader = (row: string[], aliases: string[]) => cell(row, headerMap, aliases);

  return rows
    .slice(startIndex)
    .filter((row) => !looksLikeInstructionRow(row))
    .map(
      (row) =>
        ({
          id: makeId("inv"),
          sourceFile: fileName,
          vendorName,
          channel: getByLetter(row, template.columns.channel)
            ? parseChannel(getByLetter(row, template.columns.channel))
            : "",
          orderNo: normalizeOrderKey(getByLetter(row, template.columns.orderNo)),
          receiverName: getByLetter(row, template.columns.receiverName),
          address: [
            getByLetter(row, template.columns.zip),
            getByLetter(row, template.columns.address),
          ]
            .filter(Boolean)
            .join(" "),
          productName: getByLetter(row, template.columns.vendorProductName),
          courier: getByHeader(row, INVOICE_HEADER_ALIASES.courier),
          trackingNo: cleanId(getByHeader(row, INVOICE_HEADER_ALIASES.trackingNo)),
        }) satisfies InvoiceRecord,
    )
    .filter((row) => row.trackingNo && (row.orderNo || row.receiverName));
}

function getPurchaseTemplateForInvoiceVendor(
  vendorName: string,
  templates: PurchaseTemplateSetting[],
) {
  const normalized = normalizeHeader(vendorName);
  if (!normalized) return undefined;
  return templates.find(
    (tpl) => tpl.enabled && normalizeHeader(tpl.vendorName) === normalized,
  );
}

function chooseParsedInvoiceRows(...groups: InvoiceRecord[][]) {
  return groups
    .filter((group) => group.length)
    .sort((a, b) => {
      const score = (rows: InvoiceRecord[]) =>
        rows.length * 10 +
        rows.filter((row) => row.courier && row.trackingNo).length * 3 +
        rows.filter((row) => row.orderNo).length * 2 +
        rows.filter((row) => row.receiverName && row.address).length;
      return score(b) - score(a);
    })[0] || [];
}

function shouldUseInvoiceFolderFile(fileName: string) {
  const normalized = normalizeHeader(fileName);
  if (!normalized) return false;
  if (normalized.startsWith("~$")) return false;
  if (normalized.includes("송장등록확인표")) return false;
  if (normalized.includes("상품준비중송장미입력")) return false;
  if (normalized.includes("송장상세확인")) return false;
  if (normalized.includes("쿠팡운송장입력")) return false;
  if (normalized.includes("토스운송장입력")) return false;
  if (normalized.includes("주문배송관리") && normalized.includes("송장등록")) return false;
  if (normalized.includes("preview") || normalized.includes("프리뷰")) return false;
  if (normalized.includes("발주매핑확인")) return false;
  return /\.(xlsx|xls|csv)$/i.test(fileName);
}

function inferInvoiceVendorNameFromFile(
  fileName: string,
  templates: InvoiceTemplateSetting[],
  mappings: MappingRow[],
) {
  const normalizedName = normalizeHeader(fileName);
  const candidates = Array.from(
    new Set([
      ...templates.map((tpl) => tpl.vendorName),
      ...mappings.map((row) => row.vendorName),
    ]
      .map((name) => text(name))
      .filter((name) => name && name !== "공통" && name !== "자동인식")),
  ).sort((a, b) => normalizeHeader(b).length - normalizeHeader(a).length);
  return candidates.find((name) => normalizedName.includes(normalizeHeader(name))) || "";
}

function mergeInvoiceRecords(records: InvoiceRecord[]) {
  const byKey = new Map<string, InvoiceRecord>();
  records.forEach((record) => {
    const key = [
      normalizeHeader(record.sourceFile),
      normalizeHeader(record.vendorName),
      record.channel || "전체",
      normalizeOrderKey(record.orderNo),
      normalizeName(record.receiverName),
      normalizeHeader(record.address),
      normalizeHeader(record.courier),
      cleanId(record.trackingNo),
    ].join("|");
    if (!byKey.has(key)) byKey.set(key, record);
  });
  return Array.from(byKey.values());
}

const SHIPMENT_INPUT_ALIASES = {
  orderNo: ["주문번호", "거래처주문번호", "마켓주문번호", "외부주문번호", "쇼핑몰주문번호", "orderId", "orderNo"],
  shipmentBoxId: ["묶음배송번호", "shipmentBoxId", "배송박스번호"],
  orderProductId: ["주문상품번호", "상품주문번호", "orderProductId", "주문상품ID"],
  orderStatus: ["주문상태", "상태"],
  courier: ["택배사", "택배사명", "배송사", "배송사명", "운송사", "배송업체"],
  trackingNo: ["운송장번호", "송장번호", "운송장", "송장", "trackingNumber", "invoiceNumber", "waybill"],
  productName: ["상품명", "등록상품명", "노출상품명(옵션명)", "최초등록등록상품명/옵션명"],
  optionName: ["옵션명", "등록옵션명", "상품옵션"],
  vendorItemId: ["옵션ID", "옵션 ID", "vendorItemId"],
  productId: ["상품ID", "노출상품ID", "상품 관리 코드"],
  optionManagementCode: ["옵션 관리 코드", "옵션관리코드"],
  receiverName: ["수취인이름", "수취인명", "수령인명", "받는분", "받는사람", "구매자", "구매자명"],
  address: ["수취인 주소", "수취인주소", "배송지", "배송주소", "주소"],
};

function shipmentInputHeaderScore(row: string[], channel?: Channel) {
  const normalized = row.map(normalizeHeader);
  const has = (aliases: string[]) => aliases.some((alias) => normalized.includes(normalizeHeader(alias)));
  let score = 0;
  if (has(SHIPMENT_INPUT_ALIASES.orderNo)) score += 3;
  if (has(SHIPMENT_INPUT_ALIASES.courier)) score += 3;
  if (has(SHIPMENT_INPUT_ALIASES.trackingNo)) score += 3;
  if (has(SHIPMENT_INPUT_ALIASES.productName)) score += 1;
  if (channel === "쿠팡" || !channel) {
    if (has(SHIPMENT_INPUT_ALIASES.shipmentBoxId)) score += 4;
    if (has(SHIPMENT_INPUT_ALIASES.vendorItemId)) score += 2;
  }
  if (channel === "토스" || !channel) {
    if (has(SHIPMENT_INPUT_ALIASES.orderProductId)) score += 4;
    if (has(SHIPMENT_INPUT_ALIASES.orderStatus)) score += 2;
    if (has(SHIPMENT_INPUT_ALIASES.optionManagementCode)) score += 1;
  }
  return score;
}

function detectShipmentInputChannel(fileName: string, rows: string[][]): Channel | "" {
  const normalizedName = normalizeHeader(fileName);
  if (normalizedName.includes("토스") || normalizedName.includes("주문배송관리")) return "토스";
  if (normalizedName.includes("쿠팡")) return "쿠팡";
  for (const row of rows.slice(0, Math.min(rows.length, 20))) {
    const normalized = row.map(normalizeHeader);
    const has = (aliases: string[]) => aliases.some((alias) => normalized.includes(normalizeHeader(alias)));
    const looksToss =
      has(["주문상품번호"]) &&
      has(["주문상태"]) &&
      (has(["송장번호"]) || has(["택배사"]) || has(["옵션 관리 코드"]));
    const looksCoupang =
      has(["묶음배송번호"]) &&
      has(["주문번호"]) &&
      has(["옵션ID"]) &&
      (has(["운송장번호"]) || has(["택배사"]));
    if (looksToss) return "토스";
    if (looksCoupang) return "쿠팡";
  }
  return "";
}

function findShipmentInputHeaderIndex(rows: string[][], channel: Channel) {
  let best = { index: 0, score: -1 };
  rows.slice(0, Math.min(rows.length, 45)).forEach((row, index) => {
    const score = shipmentInputHeaderScore(row, channel);
    if (score > best.score) best = { index, score };
  });
  return best.score >= 7 ? best.index : -1;
}

function shipmentCell(row: string[], map: Map<string, number>, aliases: string[]) {
  return cell(row, map, aliases);
}

function putShipmentCell(row: string[], map: Map<string, number>, aliases: string[], value: string) {
  for (const alias of aliases) {
    const index = map.get(normalizeHeader(alias));
    if (index !== undefined) {
      row[index] = value;
      return true;
    }
  }
  return false;
}

function isShipmentEditabilityRow(row: string[]) {
  const joined = row.map(text).join(" ");
  return /수정\s*(가능|불가)/.test(joined) && !/\d{5,}/.test(joined);
}

function parseShipmentInputFile(fileName: string, rows: string[][]): ShipmentInputFile | null {
  const channel = detectShipmentInputChannel(fileName, rows);
  if (!channel) return null;
  const headerIndex = findShipmentInputHeaderIndex(rows, channel);
  if (headerIndex < 0) return null;
  const headers = rows[headerIndex].map(text);
  const map = buildHeaderMap(headers);
  const dataRows: ShipmentInputDataRow[] = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ rowIndex }) => rowIndex > headerIndex)
    .filter(({ row }) => !looksLikeInstructionRow(row) && !isShipmentEditabilityRow(row))
    .map(({ row, rowIndex }) => {
      const orderNo = normalizeOrderKey(shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.orderNo));
      const shipmentBoxId = cleanId(shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.shipmentBoxId));
      const orderProductId = cleanId(shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.orderProductId));
      const vendorItemId = cleanId(shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.vendorItemId));
      const productName = shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.productName);
      const optionName = shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.optionName);
      return {
        id: makeId("ship-input"),
        channel,
        sourceFile: fileName,
        rowIndex,
        orderNo,
        shipmentBoxId: channel === "쿠팡" ? shipmentBoxId : undefined,
        orderId: channel === "쿠팡" ? orderNo : undefined,
        vendorItemId: channel === "쿠팡" ? vendorItemId : undefined,
        orderProductId: channel === "토스" ? orderProductId : undefined,
        optionId: vendorItemId,
        orderStatus: shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.orderStatus),
        productName: [productName, optionName].filter(Boolean).join(" ").trim(),
        optionName,
        receiverName: shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.receiverName),
        address: shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.address),
        courier: shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.courier),
        trackingNo: cleanId(shipmentCell(row, map, SHIPMENT_INPUT_ALIASES.trackingNo)),
      } satisfies ShipmentInputDataRow;
    })
    .filter((row) => row.orderNo || row.shipmentBoxId || row.orderProductId);
  if (!dataRows.length) return null;
  return {
    id: makeId("ship-file"),
    channel,
    sourceFile: fileName,
    sheetName: channel === "쿠팡" ? "Delivery" : "주문내역",
    headerIndex,
    headers,
    rows: rows.map((row) => [...row]),
    dataRows,
  };
}

function shipmentRecordIndexes(records: InvoiceRecord[]) {
  const byOrder = new Map<string, InvoiceRecord[]>();
  const byNameAddress = new Map<string, InvoiceRecord[]>();
  const byName = new Map<string, InvoiceRecord[]>();
  records.forEach((record) => {
    orderKeyVariants(record.orderNo).forEach((key) => {
      addRecordIndex(byOrder, record.channel ? `${record.channel}|${key}` : key, record);
      addRecordIndex(byOrder, key, record);
    });
    nameAddressKeys(record.receiverName, record.address).forEach((key) => addRecordIndex(byNameAddress, key, record));
    const name = normalizeName(record.receiverName);
    if (name) addRecordIndex(byName, name, record);
  });
  return { byOrder, byNameAddress, byName };
}

function selectInvoiceRecordForShipmentInput(
  row: ShipmentInputDataRow,
  records: InvoiceRecord[],
  indexes = shipmentRecordIndexes(records),
) {
  const orderKeys = orderKeyVariants(row.orderNo).flatMap((key) => [`${row.channel}|${key}`, key]);
  let candidates = orderKeys.flatMap((key) => indexes.byOrder.get(key) || []);
  let method = candidates.length ? "입력파일 주문번호" : "";
  if (!candidates.length) {
    const keys = nameAddressKeys(row.receiverName, row.address);
    candidates = keys.flatMap((key) => indexes.byNameAddress.get(key) || []);
    method = candidates.length ? "입력파일 성명+주소" : "";
  }
  if (!candidates.length) {
    candidates = indexes.byName.get(normalizeName(row.receiverName)) || [];
    method = candidates.length ? "입력파일 성명" : "";
  }
  const selected = chooseInvoiceCandidate(candidates, row.productName);
  const narrowed = invoiceDuplicateHint(candidates, row.productName);
  return {
    selected,
    method: selected ? `${method}${narrowed}` : candidates.length ? `${method}${narrowed || "→확인필요"}` : "미매칭",
  };
}

function shipmentInputRequiredMissing(row: ShipmentInputDataRow) {
  const missing: string[] = [];
  if (row.channel === "쿠팡") {
    if (!row.shipmentBoxId) missing.push("묶음배송번호");
    if (!row.orderNo) missing.push("주문번호");
    if (!row.vendorItemId) missing.push("옵션ID");
  } else {
    if (!row.orderProductId) missing.push("주문상품번호");
  }
  return missing;
}

function matchShipmentInputFiles(
  files: ShipmentInputFile[],
  records: InvoiceRecord[],
) {
  const indexes = shipmentRecordIndexes(records);
  const previewRows: InvoicePreviewRow[] = [];
  files.forEach((file) => {
    file.dataRows.forEach((inputRow) => {
      const alreadyComplete = Boolean(inputRow.courier && inputRow.trackingNo);
      const { selected, method } = alreadyComplete
        ? { selected: undefined, method: "입력파일 기존 송장입력완료" }
        : selectInvoiceRecordForShipmentInput(inputRow, records, indexes);
      const courier = alreadyComplete ? inputRow.courier : selected?.courier || "";
      const trackingNo = alreadyComplete ? inputRow.trackingNo : selected?.trackingNo || "";
      const requiredMissing = shipmentInputRequiredMissing(inputRow);
      const status: InvoiceStatus = alreadyComplete
        ? "송장입력완료(업로드제외)"
        : selected && courier && trackingNo && !requiredMissing.length
          ? "등록준비"
          : "확인필요";
      previewRows.push({
        id: `inv-preview-${file.id}-${inputRow.rowIndex}`,
        channel: inputRow.channel,
        orderNo: inputRow.orderNo,
        vendorName: selected?.vendorName || "",
        productName: inputRow.productName || selected?.productName || "",
        receiverName: inputRow.receiverName || selected?.receiverName || "",
        courier,
        trackingNo,
        shipmentBoxId: inputRow.shipmentBoxId,
        orderProductId: inputRow.orderProductId,
        orderId: inputRow.orderId || inputRow.orderNo,
        vendorItemId: inputRow.vendorItemId,
        optionId: inputRow.optionId,
        orderStatus: inputRow.channel === "토스" && status === "등록준비" ? "배송중" : inputRow.orderStatus,
        matchMethod: requiredMissing.length && status !== "송장입력완료(업로드제외)"
          ? `${method}→필수ID누락(${requiredMissing.join(",")})`
          : method,
        status,
        sourceFile: alreadyComplete ? inputRow.sourceFile : selected?.sourceFile || inputRow.sourceFile,
      });
    });
  });
  return previewRows;
}

function filledShipmentInputFileRows(
  file: ShipmentInputFile,
  previewRows: InvoicePreviewRow[],
) {
  const out = file.rows.map((row) => [...row]);
  const map = buildHeaderMap(file.headers);
  const rowsByOrder = new Map<string, InvoicePreviewRow[]>();
  const addPreview = (key: string, row: InvoicePreviewRow) => {
    if (!key) return;
    const list = rowsByOrder.get(key) || [];
    if (!list.some((item) => item.id === row.id)) list.push(row);
    rowsByOrder.set(key, list);
  };
  previewRows
    .filter((row) => row.channel === file.channel && row.status === "등록준비")
    .forEach((row) => {
      orderKeyVariants(row.orderNo).forEach((key) => addPreview(key, row));
    });
  file.dataRows.forEach((inputRow) => {
    const matches = orderKeyVariants(inputRow.orderNo).flatMap((key) => rowsByOrder.get(key) || []);
    const selected = matches.length === 1
      ? matches[0]
      : matches.find((row) => row.optionId && inputRow.optionId && row.optionId === inputRow.optionId);
    if (!selected) return;
    const target = out[inputRow.rowIndex];
    if (!target) return;
    putShipmentCell(target, map, SHIPMENT_INPUT_ALIASES.courier, selected.courier);
    putShipmentCell(target, map, SHIPMENT_INPUT_ALIASES.trackingNo, selected.trackingNo);
    if (file.channel === "토스") putShipmentCell(target, map, SHIPMENT_INPUT_ALIASES.orderStatus, "배송중");
  });
  return out;
}

function shipmentAutoFilledFilename(fileName: string, channel: Channel) {
  const base = safeFileName(fileName).replace(/\.(xlsx|xls|csv)$/i, "");
  return `${base}_자동입력_${today()}_${channel}.xlsx`;
}

function mappingKey(channel: Channel, optionId: unknown) {
  return `${parseChannel(channel)}|${cleanId(optionId)}`;
}

function isMappingComplete(mapping: MappingRow | undefined) {
  return Boolean(
    mapping &&
      cleanId(mapping.optionId) &&
      text(mapping.vendorName) &&
      text(mapping.vendorProductName),
  );
}

function orderMappingCandidateIds(order: OrderRow) {
  const raw = order.raw || {};
  const candidates = [text(order.optionId)];
  if (parseChannel(order.channel) === "토스") {
    // Toss order v2 returns both numeric stockId and seller-side management codes.
    // Mapping files in operation often use productItemManagementCode rather than stockId,
    // so we try all stable keys before marking the order as unmapped.
    candidates.push(
      text(raw.tossStockId),
      text(raw.stockId),
      text(raw.optionManagementCode),
      text(raw.tossProductItemManagementCode),
      text(raw.productItemManagementCode),
      text(raw.productManagementCode),
      text(raw.tossProductManagementCode),
      text(raw.orderProductId),
      text(raw.tossOrderProductId),
      text(order.optionName),
      text(order.productName),
      `${text(order.productName)} ${text(order.optionName)}`,
    );
  }
  const seen = new Set<string>();
  return candidates
    .map((value) => cleanId(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function displayOrderOptionKey(order: OrderRow) {
  const actual = text(order.optionId);
  if (actual) return actual;
  if (parseChannel(order.channel) === "토스") {
    const raw = order.raw || {};
    const code = text(raw.optionManagementCode || raw.tossProductItemManagementCode || raw.productItemManagementCode);
    if (code) return code;
    if (text(order.optionName)) return text(order.optionName);
  }
  return "";
}

type MappingLookup = {
  exact: Map<string, MappingRow>;
  optionOnly: Map<string, MappingRow[]>;
};

function buildMappingMap(mappings: MappingRow[]): MappingLookup {
  const exact = new Map<string, MappingRow>();
  const optionOnly = new Map<string, MappingRow[]>();
  mappings.forEach((mapping) => {
    const optionId = cleanId(mapping.optionId);
    if (!optionId) return;
    const normalized: MappingRow = {
      ...mapping,
      channel: parseChannel(mapping.channel),
      optionId,
    };
    exact.set(mappingKey(normalized.channel, optionId), normalized);
    const optionRows = optionOnly.get(optionId) || [];
    optionRows.push(normalized);
    optionOnly.set(optionId, optionRows);
  });
  return { exact, optionOnly };
}

function findMappingForOrder(order: OrderRow, lookup: MappingLookup) {
  const candidates = orderMappingCandidateIds(order);
  for (const optionId of candidates) {
    const exact = lookup.exact.get(mappingKey(order.channel, optionId));
    if (isMappingComplete(exact)) return exact;
  }

  // 채널 표기 차이, 엑셀의 숫자/문자 차이 때문에 놓치는 일을 줄이기 위한 안전장치입니다.
  // 같은 옵션키가 한 채널에만 존재하면 해당 매핑을 사용하고, 여러 채널에 있으면 정확 일치만 인정합니다.
  for (const optionId of candidates) {
    const optionMatches = (lookup.optionOnly.get(optionId) || []).filter(isMappingComplete);
    if (optionMatches.length === 1) return optionMatches[0];
  }
  return undefined;
}

function normalizeMappingRows(rows: MappingRow[]) {
  const seen = new Set<string>();
  const normalized: MappingRow[] = [];
  rows.forEach((row) => {
    const cleanOptionId = cleanId(row.optionId);
    const channel = parseChannel(row.channel);
    const key = mappingKey(channel, cleanOptionId);
    if (!cleanOptionId && !text(row.vendorName) && !text(row.vendorProductName)) return;
    if (seen.has(key) && cleanOptionId) return;
    seen.add(key);
    normalized.push({
      ...row,
      channel,
      optionId: cleanOptionId,
      vendorName: text(row.vendorName),
      vendorCode: text(row.vendorCode),
      vendorProductName: text(row.vendorProductName),
      cost: toNumber(row.cost, 0),
      baseQty: Math.max(1, toNumber(row.baseQty, 1)),
    });
  });
  return normalized;
}

function buildPurchaseRows(orders: OrderRow[], mappings: MappingRow[]) {
  const map = buildMappingMap(mappings);
  return orders.map((order) => {
    const mapping = findMappingForOrder(order, map);
    const baseQty = mapping?.baseQty || 1;
    return {
      id: order.id,
      channel: order.channel,
      orderNo: order.orderNo,
      orderedAt: order.orderedAt,
      optionId: displayOrderOptionKey(order),
      vendorName: mapping?.vendorName || "미매핑",
      vendorCode: mapping?.vendorCode || "",
      vendorProductName: mapping?.vendorProductName || "",
      orderProductName: order.productName,
      orderOptionName: order.optionName,
      orderQty: order.qty,
      baseQty,
      purchaseQty: order.qty * baseQty,
      cost: mapping?.cost || 0,
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      zip: order.zip,
      address: order.address,
      memo: order.memo,
      salePrice: order.salePrice,
      matchStatus: mapping ? "매칭완료" : "미매핑",
    } satisfies PurchaseRow;
  });
}

function uniqueMissingMappingTargets(rows: PurchaseRow[]) {
  const seen = new Set<string>();
  const targets: Array<{
    channel: Channel;
    optionId: string;
    productName: string;
    optionName: string;
    orderNo: string;
  }> = [];
  rows
    .filter((row) => row.matchStatus === "미매핑")
    .forEach((row) => {
      const optionId = cleanId(row.optionId);
      const key = mappingKey(row.channel, optionId);
      if (!optionId || seen.has(key)) return;
      seen.add(key);
      targets.push({
        channel: row.channel,
        optionId,
        productName: row.orderProductName || row.vendorProductName,
        optionName: row.orderOptionName || "",
        orderNo: row.orderNo,
      });
    });
  return targets;
}

function missingMappingDisplayRows(rows: PurchaseRow[]) {
  return rows
    .filter((row) => row.matchStatus === "미매핑")
    .map((row) => [
      row.channel,
      row.optionId || "옵션ID 없음",
      row.orderNo,
      row.orderProductName || row.vendorProductName,
      row.orderOptionName || "-",
      row.orderQty,
      money(row.salePrice),
      row.receiverName,
      row.address,
    ]);
}

function missingMappingTargetDisplayRows(rows: PurchaseRow[]) {
  return uniqueMissingMappingTargets(rows).map((row) => [
    row.channel,
    row.optionId || "옵션ID 없음",
    row.productName || "상품명 없음",
    row.optionName || "옵션명 없음",
    row.orderNo,
    "업체명·업체상품명·원가 입력 필요",
  ]);
}

function summarizeMappingCheck(
  orders: OrderRow[],
  mappings: MappingRow[],
  sourceSession = "",
): MappingCheckSummary {
  const purchaseRows = buildPurchaseRows(orders, mappings);
  const matchedRows = purchaseRows.filter(
    (row) => row.matchStatus === "매칭완료",
  );
  return {
    sourceSession,
    totalOrders: orders.length,
    matched: matchedRows.length,
    unmatched: purchaseRows.length - matchedRows.length,
    vendors: new Set(matchedRows.map((row) => row.vendorName).filter(Boolean))
      .size,
    checkedAt: new Date().toLocaleString("ko-KR"),
  };
}


function isPaymentOrderStatus(row: PurchaseRow) {
  const status = normalizeHeader(row.memo || "") || normalizeHeader((row as PurchaseRow & { orderStatus?: string }).orderStatus || "");
  const raw = normalizeHeader(row.orderOptionName || "");
  // PurchaseRow does not keep orderStatus directly in older data, so the function also
  // checks the original order through helper wrappers where possible.
  return true;
}

function orderStatusForPurchaseRow(row: PurchaseRow, orders: OrderRow[]) {
  const order = orders.find((item) => item.id === row.id || (item.channel === row.channel && normalizeOrderKey(item.orderNo) === normalizeOrderKey(row.orderNo)));
  return text(order?.orderStatus);
}

function isPaymentStatus(channel: Channel, status: string) {
  const normalized = normalizeHeader(status);
  if (!normalized) return true;
  if (channel === "쿠팡") {
    return normalized === "accept" || normalized === "결제완료" || normalized.includes("paid");
  }
  return normalized === "paid" || normalized === "결제완료" || normalized.includes("paymentcomplete");
}

function isPreparingStatus(channel: Channel, status: string) {
  const normalized = normalizeHeader(status);
  if (!normalized) return false;
  if (normalized === "상품준비중" || normalized.includes("상품준비")) return true;
  if (channel === "쿠팡") {
    return normalized === "instruct" || normalized.includes("instruct");
  }
  return normalized === "preparingproduct" || normalized.includes("preparingproduct") || normalized.includes("preparing");
}

const ORDER_SHIPMENT_FIELD_ALIASES = {
  courier: [
    "courier",
    "carrier",
    "deliveryCompany",
    "deliveryCompanyName",
    "invoiceCompany",
    "invoiceCompanyName",
    "shippingCompany",
    "shipmentCompany",
    "logisticsCompany",
  ],
  trackingNo: [
    "trackingNo",
    "trackingNumber",
    "invoiceNumber",
    "shipmentNumber",
    "waybillNo",
    "waybillNumber",
    "deliveryInvoiceNo",
    "deliveryInvoiceNumber",
    "trackingCode",
  ],
};

function rawOrderField(order: OrderRow, keys: string[]) {
  const raw = order.raw || {};
  for (const key of keys) {
    const direct = text(raw[key]);
    if (direct) return direct;
    const normalizedKey = normalizeHeader(key);
    const foundKey = Object.keys(raw).find((candidate) => normalizeHeader(candidate) === normalizedKey);
    if (foundKey && text(raw[foundKey])) return text(raw[foundKey]);
  }
  return "";
}

function orderCourierText(order: OrderRow) {
  return text(order.courier) || rawOrderField(order, ORDER_SHIPMENT_FIELD_ALIASES.courier);
}

function orderTrackingText(order: OrderRow) {
  return cleanId(order.trackingNo) || cleanId(rawOrderField(order, ORDER_SHIPMENT_FIELD_ALIASES.trackingNo));
}

function hasCompleteShipmentInfo(order: OrderRow) {
  return Boolean(orderCourierText(order) && orderTrackingText(order));
}

function isPreparingShipmentMissingOrder(order: OrderRow) {
  return isPreparingStatus(order.channel, order.orderStatus) && !hasCompleteShipmentInfo(order);
}

function filterPreparingShipmentMissingOrders(rows: OrderRow[]) {
  return rows.filter(isPreparingShipmentMissingOrder);
}

function preparingShipmentOrderRow(order: OrderRow, 판정: string): Array<string | number> {
  return [
    order.channel,
    order.orderNo,
    order.orderStatus || "상품준비중",
    orderCourierText(order),
    orderTrackingText(order),
    order.productName,
    order.optionName,
    order.optionId,
    order.qty,
    order.receiverName,
    order.receiverPhone,
    order.zip,
    order.address,
    order.memo,
    판정,
  ];
}

function preparingShipmentSheetHeader() {
  return [
    "채널",
    "주문번호",
    "주문상태",
    "택배사",
    "운송장번호",
    "상품명",
    "옵션명",
    "옵션ID",
    "수량",
    "수취인",
    "수취인전화",
    "우편번호",
    "주소",
    "배송메모",
    "판정",
  ];
}

function preparingShipmentMissingOrderSheets(rows: OrderRow[], scope: string) {
  const sheetRows: Array<Array<string | number>> = [
    preparingShipmentSheetHeader(),
    ...rows.map((order) =>
      preparingShipmentOrderRow(
        order,
        orderCourierText(order) || orderTrackingText(order)
          ? "택배사/운송장번호 일부 누락"
          : "택배사/운송장번호 미입력",
      ),
    ),
  ];
  return [
    { name: "상품준비중_송장미입력", rows: sheetRows, showTitle: false },
    {
      name: "작업메모",
      rows: [
        ["항목", "내용"],
        ["작업", scope],
        ["기준", "쿠팡/토스 상품준비중 중 택배사 또는 운송장번호가 비어 있는 주문"],
        ["후속", "발주폴더의 B2B 업체별 송장엑셀과 매칭 후 쿠팡/토스 송장등록 파일 생성"],
        ["매칭우선순위", "주문번호 강제 매칭 → 성명+주소 앞 2단어 → 성명 → 중복 시 상품명 2글자 이상 일치"],
        ["대상건수", rows.length],
        ["생성시각", new Date().toLocaleString("ko-KR")],
      ],
      showTitle: false,
    },
  ];
}

function preparingCurrentOrderSheets(rows: OrderRow[], scope: string) {
  const sheetRows: Array<Array<string | number>> = [
    preparingShipmentSheetHeader(),
    ...rows.map((order) =>
      preparingShipmentOrderRow(
        order,
        hasCompleteShipmentInfo(order)
          ? "송장입력완료(중복업로드 제외)"
          : orderCourierText(order) || orderTrackingText(order)
            ? "택배사/운송장번호 일부 누락"
            : "택배사/운송장번호 미입력",
      ),
    ),
  ];
  return [
    { name: "상품준비중_전체", rows: sheetRows, showTitle: false },
    {
      name: "작업메모",
      rows: [
        ["항목", "내용"],
        ["작업", scope],
        ["기준", "최근 7일 쿠팡/토스 상품준비중 전체 주문"],
        ["중복업로드방지", "택배사와 운송장번호가 모두 있는 주문은 확인 파일에는 남기되 업로드 대상에서 제외"],
        ["상품준비중전체", rows.length],
        ["송장미입력", rows.filter((order) => !hasCompleteShipmentInfo(order)).length],
        ["생성시각", new Date().toLocaleString("ko-KR")],
      ],
      showTitle: false,
    },
  ];
}

function purchaseHistoryKey(channel: Channel, orderNo: unknown, optionId: unknown) {
  return [parseChannel(channel), normalizeOrderKey(orderNo), cleanId(optionId)].join("|");
}

function purchaseRowHistoryKey(row: PurchaseRow) {
  return purchaseHistoryKey(row.channel, row.orderNo, row.optionId);
}

function buildPurchaseHistorySet(history: PurchaseHistoryRow[]) {
  return new Set(history.map((row) => purchaseHistoryKey(row.channel, row.orderNo, row.optionId)));
}

function isAlreadyPurchased(row: PurchaseRow, history: PurchaseHistoryRow[]) {
  return buildPurchaseHistorySet(history).has(purchaseRowHistoryKey(row));
}

function filterNewPurchaseTargetRows(rows: PurchaseRow[], orders: OrderRow[], history: PurchaseHistoryRow[]) {
  const historySet = buildPurchaseHistorySet(history);
  return rows.filter((row) => {
    const status = orderStatusForPurchaseRow(row, orders);
    return row.matchStatus === "매칭완료" && isPaymentStatus(row.channel, status) && !historySet.has(purchaseRowHistoryKey(row));
  });
}

function isVendorPurchaseExportable(row: PurchaseRow) {
  return (
    row.matchStatus === "매칭완료" &&
    text(row.vendorName) !== "" &&
    row.vendorName !== "미매핑" &&
    text(row.vendorProductName) !== "" &&
    toNumber(row.purchaseQty, 0) > 0
  );
}

function filterVendorPurchaseRowsForAutoExport(rows: PurchaseRow[]) {
  // 첨부된 발주 변환기와 동일하게 수집 버튼 실행 시에는 주문상태/발주이력보다
  // 옵션ID 매핑 성공 여부를 우선 기준으로 업체별 파일을 만듭니다.
  // 미매핑·업체명·업체상품명·수량 오류는 제외하고 검증표에 남깁니다.
  return rows.filter(isVendorPurchaseExportable);
}

function makePurchaseHistoryRows(rows: PurchaseRow[]) {
  const exportedAt = new Date().toISOString();
  return rows.map((row) => ({
    id: makeId("purchase-history"),
    channel: row.channel,
    orderNo: row.orderNo,
    optionId: row.optionId,
    vendorName: row.vendorName,
    vendorProductName: row.vendorProductName,
    purchaseQty: row.purchaseQty,
    exportedAt,
    status: "발주완료" as const,
  }));
}

function mergePurchaseHistory(prev: PurchaseHistoryRow[], rows: PurchaseHistoryRow[]) {
  const seen = new Set(prev.map((row) => purchaseHistoryKey(row.channel, row.orderNo, row.optionId)));
  const merged = [...prev];
  rows.forEach((row) => {
    const key = purchaseHistoryKey(row.channel, row.orderNo, row.optionId);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });
  return merged;
}

function purchaseHistoryDisplayRows(rows: PurchaseHistoryRow[]) {
  return rows
    .slice()
    .sort((a, b) => text(b.exportedAt).localeCompare(text(a.exportedAt)))
    .slice(0, 80)
    .map((row) => [
      row.channel,
      row.orderNo,
      row.optionId,
      row.vendorName,
      row.vendorProductName,
      row.purchaseQty,
      row.exportedAt ? new Date(row.exportedAt).toLocaleString("ko-KR") : "-",
      row.status,
    ]);
}

function validatePurchasePreflight(rows: PurchaseRow[], orders: OrderRow[] = [], history: PurchaseHistoryRow[] = []): PurchasePreflightIssue[] {
  const issues: PurchasePreflightIssue[] = [];
  const push = (row: PurchaseRow, level: "차단" | "확인", item: string, detail: string) => {
    issues.push({
      level,
      item,
      channel: row.channel,
      orderNo: row.orderNo,
      optionId: row.optionId || "-",
      vendorName: row.vendorName || "-",
      detail,
    });
  };

  const historySet = buildPurchaseHistorySet(history);
  rows.forEach((row) => {
    const orderStatus = orderStatusForPurchaseRow(row, orders);
    if (isPreparingStatus(row.channel, orderStatus)) {
      push(row, "확인", "상품준비중 발주 제외", "상품준비중 주문은 이미 발주됐거나 송장 입력 대기일 수 있어 발주 엑셀 대상에서 제외합니다.");
      return;
    }
    if (!isPaymentStatus(row.channel, orderStatus)) {
      push(row, "확인", "발주대상 상태 아님", `현재 주문상태 ${orderStatus || "미확인"}은 결제완료 발주 기준이 아닙니다.`);
      return;
    }
    if (historySet.has(purchaseRowHistoryKey(row))) {
      push(row, "확인", "이미 발주완료", "발주이력에 같은 채널+주문번호+옵션ID가 있어 중복 발주에서 제외합니다.");
      return;
    }
    if (row.matchStatus === "미매핑") {
      push(row, "차단", "미매핑", "매핑관리에서 업체명·업체상품명·원가·기본수량을 입력해야 발주 대상이 됩니다.");
      return;
    }
    if (!text(row.vendorName) || row.vendorName === "미매핑") {
      push(row, "차단", "업체명 누락", "B2B 발주처 업체명이 없습니다.");
    }
    if (!text(row.vendorProductName)) {
      push(row, "차단", "업체상품명 누락", "내 판매상품명이 아니라 B2B 발주처 상품명을 입력해야 합니다.");
    }
    if (toNumber(row.cost, 0) <= 0) {
      push(row, "확인", "원가 미입력", "원가가 비어 있어도 발주파일은 생성합니다. 쿠폰 안전검증 기준만 낮아질 수 있습니다.");
    }
    if (toNumber(row.orderQty, 0) <= 0 || toNumber(row.purchaseQty, 0) <= 0) {
      push(row, "차단", "수량 오류", "주문수량 또는 구매수량이 0 이하입니다.");
    }
    if (!text(row.receiverName)) {
      push(row, "확인", "수취인 누락", "수취인명이 비어 있습니다.");
    }
    if (!text(row.receiverPhone)) {
      push(row, "확인", "전화번호 누락", "업체 발주·송장에 필요한 전화번호가 비어 있습니다.");
    }
    if (!text(row.address)) {
      push(row, "차단", "주소 누락", "배송 주소가 비어 있어 발주 파일을 만들 수 없습니다.");
    }
  });

  return issues;
}

function purchasePreflightDisplayRows(issues: PurchasePreflightIssue[]) {
  return issues.map((issue) => [
    issue.level,
    issue.item,
    issue.channel,
    issue.orderNo,
    issue.optionId,
    issue.vendorName,
    issue.detail,
  ]);
}

function purchasePreflightSummaryRows(rows: PurchaseRow[], issues: PurchasePreflightIssue[], orders: OrderRow[] = [], history: PurchaseHistoryRow[] = []): OrderCollectionSummaryRow[] {
  const blocked = issues.filter((issue) => issue.level === "차단");
  const checks = issues.filter((issue) => issue.level === "확인");
  const newTargets = filterNewPurchaseTargetRows(rows, orders, history);
  const vendors = new Set(newTargets.map((row) => row.vendorName).filter(Boolean));
  const preparingCount = rows.filter((row) => isPreparingStatus(row.channel, orderStatusForPurchaseRow(row, orders))).length;
  const alreadyPurchasedCount = rows.filter((row) => buildPurchaseHistorySet(history).has(purchaseRowHistoryKey(row))).length;
  return [
    { item: "신규 발주대상", status: newTargets.length ? "확인" : "대기", detail: `결제완료+미발주 ${newTargets.length}건, 업체 ${vendors.size}곳` },
    { item: "이미 발주", status: alreadyPurchasedCount ? "확인" : "정상", detail: `${alreadyPurchasedCount}건은 발주이력 기준 중복 발주 제외` },
    { item: "송장대상", status: preparingCount ? "확인" : "대기", detail: `상품준비중 ${preparingCount}건은 발주가 아니라 송장 입력 확인 대상` },
    { item: "차단항목", status: blocked.length ? "차단" : "정상", detail: `${blocked.length}건` },
    { item: "확인항목", status: checks.length ? "확인필요" : "정상", detail: `${checks.length}건` },
    { item: "발주 다운로드", status: blocked.length ? "차단" : "준비", detail: blocked.length ? "신규 결제완료 주문의 미매핑·업체상품명·주소를 먼저 처리하세요." : "신규 결제완료·미발주 주문만 발주 엑셀로 생성됩니다." },
  ];
}

function daysSince(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}

function buildDailyOperationBoardRows(
  rows: PurchaseRow[],
  orders: OrderRow[],
  history: PurchaseHistoryRow[],
  readyInvoiceCount: number,
): OrderCollectionSummaryRow[] {
  const historyMap = new Map(history.map((row) => [purchaseHistoryKey(row.channel, row.orderNo, row.optionId), row]));
  const newTargets = filterNewPurchaseTargetRows(rows, orders, history);
  const paymentMissing = rows.filter((row) => {
    const status = orderStatusForPurchaseRow(row, orders);
    return isPaymentStatus(row.channel, status) && row.matchStatus === "미매핑" && !historyMap.has(purchaseRowHistoryKey(row));
  });
  const alreadyPurchased = rows.filter((row) => historyMap.has(purchaseRowHistoryKey(row)));
  const preparingRows = rows.filter((row) => isPreparingStatus(row.channel, orderStatusForPurchaseRow(row, orders)));
  const longWaiting = preparingRows.filter((row) => {
    const historyRow = historyMap.get(purchaseRowHistoryKey(row));
    return historyRow && daysSince(historyRow.exportedAt) >= 2;
  });
  const vendors = new Set(newTargets.map((row) => row.vendorName).filter(Boolean));
  return [
    {
      item: "수집",
      status: orders.length ? "완료" : "대기",
      detail: orders.length ? `현재 주문 ${orders.length}건이 있습니다.` : "쿠팡 수집·토스 수집부터 진행하세요.",
    },
    {
      item: "매핑",
      status: paymentMissing.length ? "필요" : "정상",
      detail: paymentMissing.length ? `결제완료 미매핑 ${paymentMissing.length}건을 먼저 처리하세요.` : "결제완료 발주대상 미매핑이 없습니다.",
    },
    {
      item: "발주",
      status: newTargets.length ? "준비" : "대기",
      detail: `신규 발주대상 ${newTargets.length}건, 업체 ${vendors.size}곳입니다.`,
    },
    {
      item: "중복",
      status: alreadyPurchased.length ? "차단" : "정상",
      detail: alreadyPurchased.length ? `발주이력 기준 ${alreadyPurchased.length}건은 재발주에서 제외됩니다.` : "중복발주 차단 대상이 없습니다.",
    },
    {
      item: "송장",
      status: preparingRows.length ? "확인" : "대기",
      detail: `상품준비중 ${preparingRows.length}건, 송장등록 준비 ${readyInvoiceCount}건입니다.`,
    },
    {
      item: "장기 송장대기",
      status: longWaiting.length ? "주의" : "정상",
      detail: longWaiting.length ? `발주 후 2일 이상 송장대기 ${longWaiting.length}건을 확인하세요.` : "장기 송장대기 위험이 없습니다.",
    },
  ];
}

function buildOrderCollectionSummaryRows(
  orders: OrderRow[],
  mappings: MappingRow[],
  collect?: { channel?: Channel | "전체"; received?: number; added?: number; skipped?: number; message?: string },
): OrderCollectionSummaryRow[] {
  const purchaseRows = buildPurchaseRows(orders, mappings);
  const matchedRows = purchaseRows.filter((row) => row.matchStatus === "매칭완료");
  const missingRows = purchaseRows.filter((row) => row.matchStatus === "미매핑");
  const costCheckRows = matchedRows.filter((row) => row.cost <= 0);
  const channelCounts = (["쿠팡", "토스"] as Channel[])
    .map((channel) => `${channel} ${orders.filter((row) => row.channel === channel).length}건`)
    .join(", ");
  const sales = orders.reduce((sum, row) => sum + toNumber(row.salePrice, 0), 0);
  const collectDetail = collect
    ? `${collect.channel || "전체"} 응답 ${collect.received ?? 0}건, 추가 ${collect.added ?? 0}건, 중복 제외 ${collect.skipped ?? 0}건`
    : "수집 실행 후 결과가 여기에 표시됩니다.";
  const tossMissing = missingRows.filter((row) => row.channel === "토스");
  const mappingDetail = `매칭완료 ${matchedRows.length}건, 미매핑 ${missingRows.length}건, 발주업체 ${new Set(matchedRows.map((row) => row.vendorName).filter(Boolean)).size}곳` +
    (tossMissing.length
      ? `. 토스 미매핑 ${tossMissing.length}건은 토스 옵션ID(stockId) 또는 옵션관리코드(productItemManagementCode)를 매핑자료에 추가하면 발주 대상이 됩니다.`
      : "");
  return [
    { item: "이번 수집", status: collect?.received ? "확인" : "대기", detail: collectDetail },
    { item: "현재 주문", status: orders.length ? "확인" : "대기", detail: `총 ${orders.length}건 (${channelCounts || "채널 없음"}), 판매금액 ${money(sales)}` },
    { item: "매핑 상태", status: missingRows.length ? "확인필요" : "정상", detail: mappingDetail },
    { item: "원가 확인", status: costCheckRows.length ? "확인필요" : "정상", detail: `원가 0원 또는 미입력 ${costCheckRows.length}건` },
    { item: "발주 가능", status: matchedRows.length ? "준비" : "대기", detail: `매칭완료 주문 ${matchedRows.length}건만 업체별 발주 대상입니다.` },
  ];
}

function addRecordIndex(
  map: Map<string, InvoiceRecord[]>,
  key: string,
  record: InvoiceRecord,
) {
  if (!key) return;
  const list = map.get(key) || [];
  const identity = `${record.sourceFile}|${record.courier}|${record.trackingNo}|${record.orderNo}|${record.receiverName}`;
  if (
    !list.some(
      (item) =>
        `${item.sourceFile}|${item.courier}|${item.trackingNo}|${item.orderNo}|${item.receiverName}` ===
        identity,
    )
  ) {
    map.set(key, [...list, record]);
  }
}

function addressKeyVariants(value: unknown) {
  const normalized = normalizeAddress(value);
  if (!normalized) return [];
  const words = normalized
    .split(/\s+/)
    .map((word) => word.replace(/[^0-9a-zA-Z가-힣]/g, ""))
    .filter(Boolean);
  const compact = normalized.replace(/[^0-9a-zA-Z가-힣]/g, "");
  return Array.from(
    new Set(
      [
        words.length >= 2 ? words.slice(0, 2).join("") : "",
        addressPrefix(value),
        compact.length >= 6
          ? compact.slice(0, Math.min(10, compact.length))
          : "",
      ].filter((key) => key.length >= 4),
    ),
  );
}

function nameAddressKeys(name: unknown, address: unknown) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) return [];
  return addressKeyVariants(address).map((addr) => `${normalizedName}|${addr}`);
}

function uniqueInvoiceRecords(candidates: InvoiceRecord[]) {
  return Array.from(
    new Map(
      candidates.map((candidate) => [
        `${candidate.courier}|${candidate.trackingNo}|${candidate.sourceFile}|${candidate.orderNo}`,
        candidate,
      ]),
    ).values(),
  );
}

function chooseInvoiceCandidate(
  candidates: InvoiceRecord[],
  productName: string,
) {
  const unique = uniqueInvoiceRecords(candidates).filter(
    (row) => row.trackingNo,
  );
  if (unique.length <= 1) return unique[0];
  const narrowed = unique.filter((candidate) =>
    hasSharedProductToken(candidate.productName, productName),
  );
  if (narrowed.length === 1) return narrowed[0];
  return undefined;
}

function invoiceDuplicateHint(candidates: InvoiceRecord[], productName: string) {
  const unique = uniqueInvoiceRecords(candidates).filter((row) => row.trackingNo);
  if (unique.length <= 1) return "";
  const narrowed = unique.filter((candidate) =>
    hasSharedProductToken(candidate.productName, productName),
  );
  if (narrowed.length === 1) return "→상품명2글자";
  return "→중복후보확인";
}

function matchInvoices(
  orders: OrderRow[],
  purchases: PurchaseRow[],
  records: InvoiceRecord[],
) {
  const byOrder = new Map<string, InvoiceRecord[]>();
  const byNameAddress = new Map<string, InvoiceRecord[]>();
  const byName = new Map<string, InvoiceRecord[]>();

  records.forEach((record) => {
    orderKeyVariants(record.orderNo).forEach((key) => {
      addRecordIndex(
        byOrder,
        record.channel ? `${record.channel}|${key}` : key,
        record,
      );
      addRecordIndex(byOrder, key, record);
    });
    nameAddressKeys(record.receiverName, record.address).forEach((key) =>
      addRecordIndex(byNameAddress, key, record),
    );
    const name = normalizeName(record.receiverName);
    if (name) addRecordIndex(byName, name, record);
  });

  return orders
    .filter(
      (order) =>
        !looksLikeInstructionRow([
          order.orderNo,
          order.optionId,
          order.receiverName,
          order.address,
          order.productName,
        ]),
    )
    .map((order) => {
      const purchase =
        purchases.find((row) => row.id === order.id) ||
        purchases.find(
          (row) =>
            row.orderNo === order.orderNo &&
            row.channel === order.channel &&
            (row.optionId === displayOrderOptionKey(order) ||
              hasSharedProductToken(row.orderProductName || row.vendorProductName, order.productName)),
        );
      const orderKeys = orderKeyVariants(order.orderNo).flatMap((key) => [
        `${order.channel}|${key}`,
        key,
      ]);
      let candidates = orderKeys.flatMap((key) => byOrder.get(key) || []);
      let method = candidates.length
        ? uniqueInvoiceRecords(candidates).length > 1
          ? "주문번호(강제)"
          : "주문번호"
        : "";

      if (!candidates.length) {
        const keys = nameAddressKeys(order.receiverName, order.address);
        candidates = keys.flatMap((key) => byNameAddress.get(key) || []);
        method = candidates.length ? "성명+주소앞2단어" : "";
      }
      if (!candidates.length) {
        candidates = byName.get(normalizeName(order.receiverName)) || [];
        method = candidates.length ? "성명" : "";
      }

      const selected = chooseInvoiceCandidate(candidates, order.productName);
      const narrowedByProduct = invoiceDuplicateHint(candidates, order.productName);
      const alreadyHasShipment = hasCompleteShipmentInfo(order);
      const selectedCourier = selected?.courier || "";
      const selectedTrackingNo = selected?.trackingNo || "";
      const currentCourier = orderCourierText(order);
      const currentTrackingNo = orderTrackingText(order);
      const baseMatchMethod = selected
        ? `${method}${narrowedByProduct}`
        : candidates.length
          ? `${method}${narrowedByProduct || "→확인필요"}`
          : "미매칭";

      return {
        id: `inv-preview-${order.id}`,
        channel: order.channel,
        orderNo: order.orderNo,
        vendorName: purchase?.vendorName || "",
        productName: purchase?.vendorProductName || order.productName,
        receiverName: order.receiverName,
        courier: alreadyHasShipment ? currentCourier : selectedCourier,
        trackingNo: alreadyHasShipment ? currentTrackingNo : selectedTrackingNo,
        shipmentBoxId: order.shipmentBoxId || rawOrderValue(order, ["shipmentBoxId", "shipmentBox.shipmentBoxId", "parent.shipmentBoxId", "item.shipmentBoxId"]),
        orderProductId: order.orderProductId || rawOrderValue(order, ["orderProductId", "tossOrderProductId", "item.orderProductId", "parent.orderProductId"]),
        orderId: rawOrderValue(order, ["orderId", "marketplaceOrderId"], order.orderNo),
        vendorItemId: rawOrderValue(order, ["vendorItemId", "vendorItemIdStr", "item.vendorItemId", "parent.vendorItemId"], order.optionId),
        optionId: order.optionId,
        orderStatus: order.orderStatus,
        matchMethod: alreadyHasShipment
          ? "현재상품준비중(기존 송장입력완료)"
          : baseMatchMethod,
        status: alreadyHasShipment
          ? "송장입력완료(업로드제외)"
          : selectedCourier && selectedTrackingNo
            ? "등록준비"
            : "확인필요",
        sourceFile: alreadyHasShipment ? "쿠팡/토스 현재 주문" : selected?.sourceFile || "",
      } satisfies InvoicePreviewRow;
    });
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = keyFn(row) || "미지정";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function money(value: number) {
  return `${Math.round(value).toLocaleString()}원`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function todayCompact() {
  return today().replace(/-/g, "");
}

function compactScopeName(value: string) {
  return safeFileName(text(value) || "작업").slice(0, 40) || "작업";
}

function purchaseVerificationSheets(
  scope: string,
  entries: Array<[string, PurchaseRow[]]>,
  issues: PurchasePreflightIssue[],
) {
  const summaryRows: Array<Array<string | number>> = [
    ["구분", "업체", "파일명", "발주건수", "채널", "총구매수량", "확인내용"],
    ...entries.map(([vendorName, rows]) => [
      "업체별 발주파일",
      vendorName,
      `${safeFileName(vendorName)}_발주양식_${today()}.xls`,
      rows.length,
      Array.from(new Set(rows.map((row) => row.channel))).join("+"),
      rows.reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0),
      "저장된 업체 발주양식 열 설정 기준으로 자동 입력",
    ]),
    [
      "검증표",
      "전체",
      `발주_매핑확인_${today()}_${compactScopeName(scope)}.xls`,
      entries.reduce((sum, [, rows]) => sum + rows.length, 0),
      Array.from(new Set(entries.flatMap(([, rows]) => rows.map((row) => row.channel)))).join("+"),
      entries.flatMap(([, rows]) => rows).reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0),
      issues.length ? `확인/차단 ${issues.length}건 포함` : "미매핑·원가·주소 차단 없음",
    ],
  ];

  const detailRows: Array<Array<string | number>> = [
    [
      "업체",
      "채널",
      "주문번호",
      "옵션ID/매핑기준",
      "업체상품명",
      "주문수량",
      "발주수량",
      "수취인",
      "주소",
      "매핑상태",
    ],
    ...entries.flatMap(([vendorName, rows]) =>
      rows.map((row) => [
        vendorName,
        row.channel,
        row.orderNo,
        row.optionId,
        row.vendorProductName,
        row.orderQty,
        row.purchaseQty,
        row.receiverName,
        row.address,
        row.matchStatus,
      ]),
    ),
  ];

  const issueRows: Array<Array<string | number>> = [
    ["수준", "항목", "채널", "주문번호", "옵션ID", "업체", "내용"],
    ...issues.map((issue) => [
      issue.level,
      issue.item,
      issue.channel,
      issue.orderNo,
      issue.optionId,
      issue.vendorName,
      issue.detail,
    ]),
  ];

  return [
    { name: "저장파일확인", rows: summaryRows, showTitle: false },
    { name: "발주상세확인", rows: detailRows, showTitle: false },
    { name: "확인필요", rows: issueRows, showTitle: false },
  ];
}

function shipmentVerificationSheets(
  scope: string,
  previewRows: InvoicePreviewRow[],
  counts: { coupang: number; toss: number },
) {
  const readyRows = previewRows.filter((row) => row.status === "등록준비");
  const excludedRows = previewRows.filter((row) => row.status === "송장입력완료(업로드제외)");
  const checkRows = previewRows.filter((row) => row.status !== "등록준비" && row.status !== "송장입력완료(업로드제외)");
  const summaryRows: Array<Array<string | number>> = [
    ["구분", "파일명", "건수", "확인내용"],
    ["쿠팡 송장등록", `쿠팡_운송장입력_${today()}_송장등록.xlsx`, counts.coupang, counts.coupang ? "미입력 주문만 택배사·운송장번호 입력" : "생성 대상 없음"],
    ["토스 송장등록", `토스_운송장입력_주문배송관리-${today()}.xlsx`, counts.toss, counts.toss ? "미입력 주문만 택배사·송장번호 입력" : "생성 대상 없음"],
    ["송장입력완료 제외", `송장등록_확인표_${today()}_${compactScopeName(scope)}.xls`, excludedRows.length, "상품준비중 전체 파일에는 저장, 쿠팡/토스 입력 대상에서는 제외"],
    ["확인필요", `송장등록_확인표_${today()}_${compactScopeName(scope)}.xls`, checkRows.length, checkRows.length ? "미매칭 또는 택배사/운송장번호 누락 확인" : "확인필요 없음"],
  ];
  const detailRows: Array<Array<string | number>> = [
    ["상태", "채널", "주문번호", "업체", "상품명", "수취인", "택배사", "운송장번호", "매칭방식", "송장파일"],
    ...previewRows.map((row) => [
      row.status,
      row.channel,
      row.orderNo,
      row.vendorName,
      row.productName,
      row.receiverName,
      row.courier,
      row.trackingNo,
      row.matchMethod,
      row.sourceFile,
    ]),
  ];
  return [
    { name: "저장파일확인", rows: summaryRows, showTitle: false },
    { name: "송장상세확인", rows: detailRows, showTitle: false },
  ];
}

function dateKey(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const normalized = raw.replace(/[.\/]/g, "-").replace(/\s+.*/, "");
  const match = normalized.match(/(20\d{2})-?(\d{1,2})-?(\d{1,2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function rowInProfitPeriod(
  row: Pick<PurchaseRow, "orderedAt" | "channel">,
  filter: ProfitFilterSetting,
) {
  const ordered = dateKey(row.orderedAt);
  const start = dateKey(filter.startDate);
  const end = dateKey(filter.endDate);
  if (filter.channel !== "전체" && row.channel !== filter.channel) return false;
  if (start && (!ordered || ordered < start)) return false;
  if (end && (!ordered || ordered > end)) return false;
  return true;
}

function summarizeProfitRows(rows: ProfitAnalysisRow[]) {
  return {
    orders: rows.length,
    sales: rows.reduce((sum, row) => sum + row.salePrice, 0),
    cost: rows.reduce((sum, row) => sum + row.costTotal, 0),
    marketplaceFee: rows.reduce((sum, row) => sum + row.marketplaceFee, 0),
    adFee: rows.reduce((sum, row) => sum + row.adFee, 0),
    shippingFee: rows.reduce((sum, row) => sum + row.shippingFee, 0),
    profit: rows.reduce((sum, row) => sum + row.netProfit, 0),
    lossOrders: rows.filter((row) => row.netProfit < 0).length,
    missingCostOrders: rows.filter((row) => row.cost <= 0).length,
  };
}

function couponActionLabel(action: CouponAction) {
  return action === "apply" ? "등록" : "취소";
}

function validateCouponRows(rows: CouponRow[]) {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.action}|${cleanId(row.optionId)}|${text(row.couponName)}`;
    if (cleanId(row.optionId)) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return rows.map((row) => {
    const issues: string[] = [];
    const key = `${row.action}|${cleanId(row.optionId)}|${text(row.couponName)}`;
    if (!cleanId(row.optionId)) issues.push("쿠팡 옵션ID 누락");
    if (row.action === "apply") {
      if (!text(row.couponName)) issues.push("쿠폰명 누락");
      if (row.discountValue <= 0) issues.push("할인값 0 이하");
      if (row.discountType === "율" && row.discountValue > 100)
        issues.push("할인율 100% 초과");
      if (!text(row.startAt)) issues.push("시작일시 누락");
      if (!text(row.endAt)) issues.push("종료일시 누락");
    }
    if (counts[key] > 1) issues.push("동일 옵션ID·동작·쿠폰명 중복");
    return {
      ...row,
      actionLabel: couponActionLabel(row.action),
      issues: issues.join(", "),
      status: issues.length ? "확인필요" : "정상",
    };
  });
}

function couponValidationRowsToSheet(
  rows: ReturnType<typeof validateCouponRows>,
) {
  return [
    [
      "상태",
      "확인사항",
      "동작",
      "쿠팡 옵션ID",
      "상품명",
      "쿠폰명",
      "할인구분",
      "할인값",
      "시작일시",
      "종료일시",
      "현재판매가",
      "메모",
    ],
    ...rows.map((row) => [
      row.status,
      row.issues,
      row.actionLabel,
      row.optionId,
      row.productName,
      row.couponName,
      row.discountType,
      row.discountValue,
      row.startAt,
      row.endAt,
      toNumber(row.salePrice, 0) || "",
      row.memo,
    ]),
  ];
}


type CouponProfitAnalysisRow = CouponRow & {
  actionLabel: string;
  basis: string;
  currentSalePrice: number;
  discountAmount: number;
  expectedSalePrice: number;
  expectedMarketplaceFee: number;
  expectedAdFee: number;
  expectedShippingFee: number;
  costTotal: number;
  expectedProfit: number;
  expectedMarginRate: number;
  riskLevel: "정상" | "주의" | "차단";
  riskReason: string;
};

type CouponMonthlyImpactRow = {
  id: string;
  optionId: string;
  productName: string;
  couponName: string;
  discountLabel: string;
  orderCount: number;
  periodDays: number;
  currentSales: number;
  afterCouponSales: number;
  currentProfit: number;
  afterCouponProfit: number;
  profitDelta: number;
  monthlyProfitDelta: number;
  projectedMonthlyProfit: number;
  expectedMarginRate: number;
  status: "정상" | "주의" | "차단" | "확인필요";
  reason: string;
};

function couponDiscountAmount(row: CouponRow, salePrice: number) {
  if (row.action === "cancel") return 0;
  if (row.discountType === "율") {
    return Math.round((salePrice * row.discountValue) / 100);
  }
  return Math.round(row.discountValue);
}

function buildCouponMappingProfitBasisRows(
  mappings: MappingRow[],
  optionRows: CoupangOptionMasterRow[],
  couponRows: CouponRow[],
  settings: ProfitSettings,
): ProfitAnalysisRow[] {
  const optionById = new Map<string, CoupangOptionMasterRow>();
  normalizeCoupangOptionMasterRows(optionRows).forEach((row) => {
    optionById.set(cleanId(row.optionId), row);
  });
  const couponPriceById = new Map<string, number>();
  couponRows.forEach((row) => {
    const optionId = cleanId(row.optionId);
    const salePrice = toNumber(row.salePrice, 0);
    if (optionId && salePrice > 0 && !couponPriceById.has(optionId)) {
      couponPriceById.set(optionId, salePrice);
    }
  });
  const requiredOptionIds = new Set([
    ...couponRows.map((row) => cleanId(row.optionId)).filter(Boolean),
    ...optionById.keys(),
  ]);
  const seen = new Set<string>();
  return mappings
    .filter((mapping) => mapping.channel === "쿠팡")
    .map((mapping) => {
      const optionId = cleanId(mapping.optionId);
      if (!optionId || seen.has(optionId) || !requiredOptionIds.has(optionId)) return null;
      seen.add(optionId);
      const option = optionById.get(optionId);
      const salePrice = toNumber(option?.salePrice, 0) || couponPriceById.get(optionId) || 0;
      if (salePrice <= 0) return null;
      const purchaseRow = {
        id: makeId("coupon-basis"),
        channel: "쿠팡" as Channel,
        orderNo: "판매가API",
        orderedAt: today(),
        optionId,
        vendorName: mapping.vendorName,
        vendorCode: mapping.vendorCode,
        vendorProductName: mapping.vendorProductName,
        orderProductName: option?.productName || mapping.vendorProductName,
        orderOptionName: option?.optionName || "",
        orderQty: 1,
        baseQty: mapping.baseQty || 1,
        purchaseQty: mapping.baseQty || 1,
        cost: mapping.cost,
        receiverName: "",
        receiverPhone: "",
        zip: "",
        address: "",
        memo: option?.source === "api" ? "쿠팡 판매가 API 기준" : "쿠폰 판매가 기준",
        salePrice,
        matchStatus: "매칭완료" as MatchStatus,
      } as PurchaseRow;
      return calculateProfitRow(purchaseRow, [], settings);
    })
    .filter((row): row is ProfitAnalysisRow => Boolean(row));
}

function latestProfitBasisForCoupon(
  row: CouponRow,
  profitRows: ProfitAnalysisRow[],
) {
  const optionId = cleanId(row.optionId);
  const candidates = profitRows
    .filter(
      (profitRow) =>
        profitRow.channel === "쿠팡" && cleanId(profitRow.optionId) === optionId,
    )
    .sort((a, b) => text(b.orderedAt).localeCompare(text(a.orderedAt)));
  return candidates[0];
}

function analyzeCouponProfitRows(
  rows: CouponRow[],
  profitRows: ProfitAnalysisRow[],
): CouponProfitAnalysisRow[] {
  return rows.map((row) => {
    const basis = latestProfitBasisForCoupon(row, profitRows);
    const currentSalePrice = toNumber(row.salePrice, 0) || basis?.salePrice || 0;
    const discountAmount = couponDiscountAmount(row, currentSalePrice);
    const expectedSalePrice = Math.max(0, currentSalePrice - discountAmount);
    const feeRatio = currentSalePrice > 0 ? expectedSalePrice / currentSalePrice : 0;
    const expectedMarketplaceFee = basis
      ? Math.round(basis.marketplaceFee * feeRatio)
      : 0;
    const expectedAdFee = basis ? Math.round(basis.adFee * feeRatio) : 0;
    const expectedShippingFee = basis?.shippingFee || 0;
    const costTotal = basis?.costTotal || 0;
    const expectedProfit =
      expectedSalePrice -
      costTotal -
      expectedMarketplaceFee -
      expectedAdFee -
      expectedShippingFee;
    const expectedMarginRate =
      expectedSalePrice > 0 ? (expectedProfit / expectedSalePrice) * 100 : 0;
    const issues: string[] = [];
    if (row.action === "apply") {
      if (!basis) issues.push("판매/원가 기준 없음");
      if (basis && basis.cost <= 0) issues.push("원가 미입력");
      if (currentSalePrice <= 0) issues.push("판매가 없음");
      if (discountAmount >= currentSalePrice && currentSalePrice > 0)
        issues.push("할인 후 판매가 0원");
      if (basis && expectedProfit < 0) issues.push("쿠폰 후 적자");
      if (basis && expectedProfit >= 0 && expectedMarginRate < 5)
        issues.push("마진 5% 미만");
    }
    const hardBlock = issues.some((issue) =>
      [
        "판매/원가 기준 없음",
        "원가 미입력",
        "판매가 없음",
        "할인 후 판매가 0원",
        "쿠폰 후 적자",
      ].includes(issue),
    );
    return {
      ...row,
      actionLabel: couponActionLabel(row.action),
      basis: basis
        ? `${basis.orderNo} / ${basis.vendorProductName || basis.orderProductName}`
        : "기준 없음",
      currentSalePrice,
      discountAmount,
      expectedSalePrice,
      expectedMarketplaceFee,
      expectedAdFee,
      expectedShippingFee,
      costTotal,
      expectedProfit,
      expectedMarginRate,
      riskLevel: hardBlock ? "차단" : issues.length ? "주의" : "정상",
      riskReason: issues.join(", "),
    };
  });
}

function couponProfitRowsToSheet(rows: CouponProfitAnalysisRow[]) {
  return [
    [
      "상태",
      "확인사항",
      "동작",
      "쿠팡 옵션ID",
      "상품명",
      "쿠폰명",
      "할인구분",
      "할인값",
      "현재판매가",
      "할인액",
      "쿠폰후판매가",
      "매입원가",
      "예상수수료",
      "예상광고료",
      "배송료",
      "쿠폰후수익",
      "쿠폰후마진율",
      "손익기준",
    ],
    ...rows.map((row) => [
      row.riskLevel,
      row.riskReason,
      row.actionLabel,
      row.optionId,
      row.productName,
      row.couponName,
      row.discountType,
      row.discountValue,
      row.currentSalePrice,
      row.discountAmount,
      row.expectedSalePrice,
      row.costTotal,
      row.expectedMarketplaceFee,
      row.expectedAdFee,
      row.expectedShippingFee,
      row.expectedProfit,
      `${row.expectedMarginRate.toFixed(1)}%`,
      row.basis,
    ]),
  ];
}

function inclusiveDateDays(start: string, end: string) {
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  if (!startKey || !endKey) return 0;
  const startTime = new Date(`${startKey}T00:00:00`).getTime();
  const endTime = new Date(`${endKey}T00:00:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return 0;
  return Math.floor((endTime - startTime) / 86400000) + 1;
}

function estimateProjectionPeriodDays(rows: ProfitAnalysisRow[], filter: ProfitFilterSetting) {
  const explicitDays = inclusiveDateDays(filter.startDate, filter.endDate);
  if (explicitDays > 0) return explicitDays;
  const uniqueDays = new Set(rows.map((row) => dateKey(row.orderedAt)).filter(Boolean));
  return Math.max(1, uniqueDays.size || 1);
}

function buildCouponMonthlyImpactRows(
  couponRows: CouponRow[],
  profitRows: ProfitAnalysisRow[],
  filter: ProfitFilterSetting,
): CouponMonthlyImpactRow[] {
  const coupangRows = profitRows.filter((row) => row.channel === "쿠팡");
  const periodDays = estimateProjectionPeriodDays(coupangRows, filter);
  const monthlyFactor = 30 / Math.max(1, periodDays);
  return couponRows
    .filter((coupon) => coupon.action === "apply")
    .map((coupon) => {
      const optionId = cleanId(coupon.optionId);
      const matchedRows = coupangRows.filter((row) => cleanId(row.optionId) === optionId);
      const currentSales = matchedRows.reduce((sum, row) => sum + row.salePrice, 0);
      const currentProfit = matchedRows.reduce((sum, row) => sum + row.netProfit, 0);
      let afterCouponSales = 0;
      let afterCouponProfit = 0;
      for (const row of matchedRows) {
        const discountAmount = couponDiscountAmount(coupon, row.salePrice);
        const expectedSalePrice = Math.max(0, row.salePrice - discountAmount);
        const feeRatio = row.salePrice > 0 ? expectedSalePrice / row.salePrice : 0;
        const marketplaceFee = Math.round(row.marketplaceFee * feeRatio);
        const adFee = Math.round(row.adFee * feeRatio);
        const expectedProfit =
          expectedSalePrice - row.costTotal - marketplaceFee - adFee - row.shippingFee;
        afterCouponSales += expectedSalePrice;
        afterCouponProfit += expectedProfit;
      }
      const profitDelta = afterCouponProfit - currentProfit;
      const monthlyProfitDelta = Math.round(profitDelta * monthlyFactor);
      const projectedMonthlyProfit = Math.round(afterCouponProfit * monthlyFactor);
      const expectedMarginRate =
        afterCouponSales > 0 ? (afterCouponProfit / afterCouponSales) * 100 : 0;
      const reasons: string[] = [];
      if (!optionId) reasons.push("옵션ID 없음");
      if (!matchedRows.length) reasons.push("기간 내 판매기준 없음");
      if (matchedRows.some((row) => row.cost <= 0)) reasons.push("원가 미입력 포함");
      if (matchedRows.length && afterCouponSales <= 0) reasons.push("쿠폰 후 판매가 0원");
      if (matchedRows.length && afterCouponProfit < 0) reasons.push("쿠폰 후 적자");
      if (matchedRows.length && afterCouponProfit >= 0 && expectedMarginRate < 5)
        reasons.push("마진 5% 미만");
      if (matchedRows.length && profitDelta < 0) reasons.push("이익 감소");
      const hardBlock = reasons.some((reason) =>
        [
          "옵션ID 없음",
          "기간 내 판매기준 없음",
          "원가 미입력 포함",
          "쿠폰 후 판매가 0원",
          "쿠폰 후 적자",
        ].includes(reason),
      );
      return {
        id: coupon.id,
        optionId: coupon.optionId,
        productName: coupon.productName,
        couponName: coupon.couponName,
        discountLabel: coupon.discountType === "율" ? `${coupon.discountValue}%` : money(coupon.discountValue),
        orderCount: matchedRows.length,
        periodDays,
        currentSales,
        afterCouponSales,
        currentProfit,
        afterCouponProfit,
        profitDelta,
        monthlyProfitDelta,
        projectedMonthlyProfit,
        expectedMarginRate,
        status: hardBlock ? (matchedRows.length ? "차단" : "확인필요") : reasons.length ? "주의" : "정상",
        reason: reasons.join(", "),
      };
    });
}

function summarizeCouponMonthlyImpactRows(rows: CouponMonthlyImpactRow[]) {
  return {
    couponCount: rows.length,
    orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
    currentProfit: rows.reduce((sum, row) => sum + row.currentProfit, 0),
    afterCouponProfit: rows.reduce((sum, row) => sum + row.afterCouponProfit, 0),
    monthlyProfitDelta: rows.reduce((sum, row) => sum + row.monthlyProfitDelta, 0),
    projectedMonthlyProfit: rows.reduce((sum, row) => sum + row.projectedMonthlyProfit, 0),
    riskCount: rows.filter((row) => row.status === "차단" || row.status === "확인필요").length,
    warningCount: rows.filter((row) => row.status === "주의").length,
  };
}

function couponMonthlyImpactRowsToSheet(rows: CouponMonthlyImpactRow[]) {
  return [
    [
      "상태",
      "확인사항",
      "옵션ID",
      "상품명",
      "쿠폰명",
      "할인",
      "분석주문수",
      "분석일수",
      "현재매출",
      "쿠폰후매출",
      "현재수익",
      "쿠폰후수익",
      "손익변동",
      "월예상변동",
      "월예상수익",
      "쿠폰후마진율",
    ],
    ...rows.map((row) => [
      row.status,
      row.reason,
      row.optionId,
      row.productName,
      row.couponName,
      row.discountLabel,
      row.orderCount,
      row.periodDays,
      row.currentSales,
      row.afterCouponSales,
      row.currentProfit,
      row.afterCouponProfit,
      row.profitDelta,
      row.monthlyProfitDelta,
      row.projectedMonthlyProfit,
      `${row.expectedMarginRate.toFixed(1)}%`,
    ]),
  ];
}

function couponHistoryKey(row: Pick<CouponRow | CouponHistoryRow, "action" | "optionId" | "couponName" | "discountType" | "discountValue" | "startAt" | "endAt">) {
  return [
    row.action,
    cleanId(row.optionId),
    text(row.couponName),
    row.discountType,
    String(toNumber(row.discountValue, 0)),
    text(row.startAt),
    text(row.endAt),
  ].join("|");
}

function makeCouponHistoryRow(row: CouponRow, source: CouponHistoryRow["source"] = "preview"): CouponHistoryRow {
  return {
    id: makeId("coupon-history"),
    action: row.action,
    optionId: row.optionId,
    productName: row.productName,
    couponName: row.couponName,
    discountType: row.discountType,
    discountValue: row.discountValue,
    startAt: row.startAt,
    endAt: row.endAt,
    recordedAt: new Date().toISOString(),
    source,
    memo: row.memo,
    salePrice: toNumber(row.salePrice, 0),
  };
}

function couponHistoryRowsToSheet(rows: CouponHistoryRow[]) {
  return [
    ["기록일시", "동작", "쿠팡 옵션ID", "상품명", "쿠폰명", "할인구분", "할인값", "현재판매가", "시작일시", "종료일시", "기록구분", "메모"],
    ...rows.map((row) => [
      row.recordedAt,
      couponActionLabel(row.action),
      row.optionId,
      row.productName,
      row.couponName,
      row.discountType,
      row.discountValue,
      toNumber(row.salePrice, 0) || "",
      row.startAt,
      row.endAt,
      row.source === "api" ? "API" : row.source === "manual" ? "수동" : "Preview",
      row.memo,
    ]),
  ];
}

function couponHistoryDisplayRows(rows: CouponHistoryRow[]) {
  return rows
    .slice()
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 50)
    .map((row) => [
      row.recordedAt.replace("T", " ").slice(0, 16),
      couponActionLabel(row.action),
      row.optionId,
      row.couponName,
      row.discountType === "율" ? `${row.discountValue}%` : money(row.discountValue),
      row.source === "api" ? "API" : row.source === "manual" ? "수동" : "Preview",
      row.memo,
    ]);
}

type CouponExecutionCheckRow = CouponRow & {
  actionLabel: string;
  executeStatus: "대기" | "차단" | "중복";
  executeReason: string;
};

function couponExecutionPlanRowsToSheet(rows: CouponExecutionCheckRow[]) {
  return [
    [
      "실행상태",
      "동작",
      "쿠팡옵션ID",
      "상품명",
      "쿠폰명",
      "할인구분",
      "할인값",
      "시작일시",
      "종료일시",
      "사유",
      "메모",
    ],
    ...rows.map((row) => [
      row.executeStatus,
      row.actionLabel,
      row.optionId,
      row.productName,
      row.couponName,
      row.discountType,
      row.discountValue,
      row.startAt,
      row.endAt,
      row.executeReason,
      row.memo,
    ]),
  ];
}

function buildCouponExecutionCheckRows(
  rows: CouponRow[],
  validationRows: ReturnType<typeof validateCouponRows>,
  profitRows: CouponProfitAnalysisRow[],
  monthlyRows: CouponMonthlyImpactRow[],
  history: CouponHistoryRow[],
): CouponExecutionCheckRow[] {
  const validationMap = new Map(validationRows.map((row) => [row.id, row]));
  const profitMap = new Map(profitRows.map((row) => [row.id, row]));
  const monthlyMap = new Map(monthlyRows.map((row) => [row.id, row]));
  const historyKeys = new Set(history.map((row) => couponHistoryKey(row)));
  return rows.map((row) => {
    const reasons: string[] = [];
    const validation = validationMap.get(row.id);
    const profit = profitMap.get(row.id);
    const monthly = monthlyMap.get(row.id);
    const key = couponHistoryKey(row);
    if (validation?.status === "확인필요") reasons.push(validation.issues || "기본검증 확인필요");
    if (row.action === "apply" && profit?.riskLevel === "차단") reasons.push(profit.riskReason || "쿠폰검증 차단");
    if (row.action === "apply" && monthly && ["차단", "확인필요"].includes(monthly.status)) reasons.push(monthly.reason || "월영향 위험");
    if (row.action === "apply" && historyKeys.has(key)) {
      return { ...row, actionLabel: couponActionLabel(row.action), executeStatus: "중복", executeReason: "쿠폰이력에 같은 옵션ID·쿠폰명·할인·기간 기록 있음" };
    }
    if (reasons.length) {
      return { ...row, actionLabel: couponActionLabel(row.action), executeStatus: "차단", executeReason: reasons.join(" / ") };
    }
    return { ...row, actionLabel: couponActionLabel(row.action), executeStatus: "대기", executeReason: "실행 가능" };
  });
}

function safeFileName(value: string) {
  return value
    .replace(/[\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function makeManagedWorkbookArtifact(
  filenameBase: string,
  sheets: Array<{ name: string; rows: Array<Array<string | number>>; showTitle?: boolean }>,
): Promise<FolderZipArtifact> {
  const safeBase = safeFileName(filenameBase.replace(/\.(xlsx|xls)$/i, ""));
  try {
    const xlsxSheets = sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows }));
    return { filename: `${safeBase}.xlsx`, blob: await createXlsxBlob(xlsxSheets) };
  } catch {
    return { filename: `${safeBase}.xls`, blob: makeExcelBlob(sheets) };
  }
}

function folderLabel(kind: BrowserFolderKind) {
  return kind === "purchase" ? "발주 폴더" : kind === "invoice" ? "발주 폴더" : "업로드 폴더";
}

function folderShortName(kind: BrowserFolderKind) {
  return kind === "purchase" ? "발주" : kind === "invoice" ? "송장" : "업로드";
}

function localFolderHelperOrigin() {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
  const explicit = env.VITE_LOCAL_FOLDER_HELPER_ORIGIN;
  if (explicit && explicit !== "__AUTO__") return explicit.replace(/\/$/, "");
  if (typeof window === "undefined") return "http://127.0.0.1:8791";
  const host = window.location.hostname && window.location.hostname !== "0.0.0.0"
    ? window.location.hostname
    : "127.0.0.1";
  const port = env.VITE_LOCAL_FOLDER_HELPER_PORT || "8791";
  return `http://${host}:${port}`;
}

const FOLDER_DB_NAME = "b2b_operation_folder_handles";
const FOLDER_STORE_NAME = "handles";

function folderApiSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function" &&
    typeof window.indexedDB !== "undefined"
  );
}

function openFolderDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(FOLDER_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FOLDER_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("폴더 저장소를 열지 못했습니다."));
  });
}

async function saveFolderHandle(
  kind: BrowserFolderKind,
  handle: FileSystemDirectoryHandleLike,
) {
  const db = await openFolderDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDER_STORE_NAME, "readwrite");
    tx.objectStore(FOLDER_STORE_NAME).put(handle, kind);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error("폴더 설정 저장에 실패했습니다."));
  });
  db.close();
}

async function loadFolderHandle(kind: BrowserFolderKind) {
  if (!folderApiSupported()) return null;
  const db = await openFolderDb();
  const handle = await new Promise<FileSystemDirectoryHandleLike | null>(
    (resolve, reject) => {
      const tx = db.transaction(FOLDER_STORE_NAME, "readonly");
      const request = tx.objectStore(FOLDER_STORE_NAME).get(kind);
      request.onsuccess = () =>
        resolve(
          (request.result as FileSystemDirectoryHandleLike | undefined) || null,
        );
      request.onerror = () =>
        reject(request.error || new Error("폴더 설정을 불러오지 못했습니다."));
    },
  );
  db.close();
  return handle;
}

async function ensureFolderPermission(handle: FileSystemDirectoryHandleLike) {
  const descriptor: FileSystemPermissionDescriptor = { mode: "readwrite" };
  if (handle.queryPermission) {
    const current = await handle.queryPermission(descriptor);
    if (current === "granted") return true;
  }
  if (handle.requestPermission) {
    return (await handle.requestPermission(descriptor)) === "granted";
  }
  return true;
}

async function writeBlobToFolder(
  handle: FileSystemDirectoryHandleLike,
  filename: string,
  blob: Blob,
) {
  const permitted = await ensureFolderPermission(handle);
  if (!permitted)
    throw new Error("선택한 폴더 쓰기 권한이 허용되지 않았습니다.");
  const fileHandle = await handle.getFileHandle(safeFileName(filename), {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function settlementChannel(value: unknown): Channel {
  return text(value).toLowerCase().includes("toss") || text(value).includes("토스")
    ? "토스"
    : "쿠팡";
}

function settlementOptionKey(value: unknown) {
  return cleanId(value).replace(/[^0-9A-Z가-힣]/gi, "").toUpperCase();
}

function settlementOrderKey(value: unknown) {
  return normalizeOrderKey(value);
}

function settlementFeeNumber(value: unknown) {
  const n = typeof value === "number" ? value : toNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function putRawFeeValue(raw: Record<string, string>, header: string, value: unknown, allowZero = false) {
  const n = settlementFeeNumber(value);
  if (n === null) return false;
  if (!allowZero && n <= 0) return false;
  raw[normalizeHeader(header)] = String(Math.round(n));
  return true;
}

function mergeSettlementFeeRowsIntoOrders(currentOrders: OrderRow[], feeRows: SettlementFeeRow[]) {
  const exact = new Map<string, SettlementFeeRow>();
  const byOrder = new Map<string, SettlementFeeRow[]>();
  for (const row of feeRows) {
    const channel = settlementChannel(row.channel);
    const orderNo = settlementOrderKey(row.orderNo);
    const optionId = settlementOptionKey(row.optionId);
    if (!orderNo) continue;
    const orderKey = `${channel}|${orderNo}`;
    const list = byOrder.get(orderKey) || [];
    list.push(row);
    byOrder.set(orderKey, list);
    if (optionId) exact.set(`${orderKey}|${optionId}`, row);
  }

  let updated = 0;
  const rows = currentOrders.map((order) => {
    const orderKey = `${order.channel}|${settlementOrderKey(order.orderNo)}`;
    const optionKey = settlementOptionKey(order.optionId);
    const matched = exact.get(`${orderKey}|${optionKey}`) || (byOrder.get(orderKey)?.length === 1 ? byOrder.get(orderKey)?.[0] : undefined);
    if (!matched) return order;
    const raw = { ...(order.raw || {}) };
    let changed = false;
    changed = putRawFeeValue(raw, "판매수수료", matched.marketplaceFee) || changed;
    changed = putRawFeeValue(raw, "marketplaceFee", matched.marketplaceFee) || changed;
    changed = putRawFeeValue(raw, "광고료", matched.adFee) || changed;
    changed = putRawFeeValue(raw, "adFee", matched.adFee) || changed;
    changed = putRawFeeValue(raw, "배송비", matched.shippingFee) || changed;
    changed = putRawFeeValue(raw, "shippingFee", matched.shippingFee) || changed;
    changed = putRawFeeValue(raw, "쿠폰할인", matched.sellerCoupon) || changed;
    changed = putRawFeeValue(raw, "정산금액", matched.settlementAmount, true) || changed;
    if (!changed) return order;
    updated += 1;
    return { ...order, raw };
  });
  return { rows, updated };
}

function firstRawNumber(order: OrderRow | undefined, aliases: string[]) {
  const raw = rawOrderValue(order, aliases);
  if (!raw) return null;
  const n = toNumber(raw, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function calculateProfitRow(
  row: PurchaseRow,
  orders: OrderRow[],
  settings: ProfitSettings | Partial<Record<Channel, Partial<ProfitSetting>>> | null | undefined,
  context?: { channelSales?: Partial<Record<Channel, number>> },
): ProfitAnalysisRow {
  const order = orders.find(
    (candidate) =>
      candidate.id === row.id ||
      (candidate.channel === row.channel && candidate.orderNo === row.orderNo),
  );
  const safeSettings = normalizeProfitSettings(settings || {});
  const setting = safeSettings[row.channel] || DEFAULT_PROFIT_SETTINGS[row.channel] || DEFAULT_PROFIT_SETTINGS.쿠팡;
  const costQty = row.orderQty;
  const costTotal = row.cost * costQty;
  const apiMarketplaceFee = firstRawNumber(order, [
    "판매수수료",
    "수수료",
    "마켓수수료",
    "서비스수수료",
    "commission",
    "marketplaceFee",
    "productFee",
    "productVat",
    "payFee",
    "payVat",
  ]);
  const apiAdFee = firstRawNumber(order, [
    "광고비",
    "광고료",
    "광고수수료",
    "광고집행액",
    "adFee",
    "adsFee",
    "advertisingFee",
    "advertisementFee",
    "adSpend",
  ]);
  const apiShippingFee = firstRawNumber(order, [
    "배송비",
    "운임",
    "shippingFee",
    "deliveryFee",
  ]);
  const marketplaceFeeRate = toNumber(setting.marketplaceFeeRate, 0);
  const paymentFeeRate = row.channel === "토스" ? toNumber(setting.paymentFeeRate, 0) : 0;
  const adFeeRate = toNumber(setting.adFeeRate, 0);
  const adFeeTotal = toNumber(setting.adFeeTotal, 0);
  const shippingFeeDefault = toNumber(setting.shippingFeeDefault, 0);
  const channelSales = Math.max(0, toNumber(context?.channelSales?.[row.channel], 0));
  const allocatedAdFee =
    adFeeTotal > 0 && channelSales > 0
      ? Math.round((adFeeTotal * row.salePrice) / channelSales)
      : 0;
  const marketplaceFee =
    setting.apiAuto && apiMarketplaceFee !== null
      ? apiMarketplaceFee
      : Math.round((row.salePrice * (marketplaceFeeRate + paymentFeeRate)) / 100);
  const adFee =
    setting.apiAuto && apiAdFee !== null
      ? apiAdFee
      : Math.round((row.salePrice * adFeeRate) / 100) + allocatedAdFee;
  const shippingFee =
    setting.apiAuto && apiShippingFee !== null
      ? apiShippingFee
      : shippingFeeDefault;
  const netProfit = row.salePrice - costTotal - marketplaceFee - adFee - shippingFee;
  const hasApiValue =
    setting.apiAuto &&
    (apiMarketplaceFee !== null || apiAdFee !== null || apiShippingFee !== null);
  const hasFallbackValue =
    marketplaceFeeRate > 0 || paymentFeeRate > 0 || adFeeRate > 0 || adFeeTotal > 0 || shippingFeeDefault > 0;
  return {
    ...row,
    marketplaceFee,
    adFee,
    shippingFee,
    costQty,
    costTotal,
    netProfit,
    profitStatus:
      row.cost <= 0
        ? "확인필요"
        : netProfit < 0
          ? "적자"
          : "흑자",
    feeSource: hasApiValue
      ? "API/원본값"
      : hasFallbackValue
        ? row.channel === "토스"
          ? "토스 설정값"
          : "설정값"
        : "수수료 미확정",
  };
}

function channelSalesMapForProfitRows(rows: PurchaseRow[]) {
  return rows.reduce<Partial<Record<Channel, number>>>((acc, row) => {
    acc[row.channel] = toNumber(acc[row.channel], 0) + Math.max(0, row.salePrice);
    return acc;
  }, {});
}

function calculateProfitRows(
  rows: PurchaseRow[],
  orders: OrderRow[],
  settings: ProfitSettings | Partial<Record<Channel, Partial<ProfitSetting>>> | null | undefined,
) {
  const channelSales = channelSalesMapForProfitRows(rows);
  return rows.map((row) => calculateProfitRow(row, orders, settings, { channelSales }));
}

const COUPANG_SHIPMENT_HEADERS = [
  "번호",
  "묶음배송번호",
  "주문번호",
  "택배사",
  "운송장번호",
  "분리배송 Y/N",
  "분리배송 출고예정일",
  "주문시 출고예정일",
  "출고일(발송일)",
  "주문일",
  "등록상품명",
  "등록옵션명",
  "노출상품명(옵션명)",
  "노출상품ID",
  "옵션ID",
  "최초등록등록상품명/옵션명",
  "업체상품코드",
  "바코드",
  "결제액",
  "배송비구분",
  "배송비",
  "도서산간 추가배송비",
  "구매수(수량)",
  "옵션판매가(판매단가)",
  "구매자",
  "구매자전화번호",
  "수취인이름",
  "수취인전화번호",
  "우편번호",
  "수취인 주소",
  "배송메세지",
  "상품별 추가메시지",
  "주문자 추가메시지",
  "배송완료일",
  "구매확정일자",
  "개인통관번호(PCCC)",
  "통관용수취인전화번호",
  "기타",
  "결제위치",
  "배송유형",
  "제휴택배사유형",
];

const TOSS_SHIPMENT_HEADERS = [
  "주문번호",
  "주문상품번호",
  "주문상태",
  "발송기한",
  "배송속성",
  "받은 혜택",
  "물류사",
  "택배사",
  "송장번호",
  "상품명",
  "옵션명",
  "주문건수",
  "상품ID",
  "상품 관리 코드",
  "옵션 ID",
  "옵션 관리 코드",
  "구매자명",
  "구매자 연락처",
  "수령인명",
  "수령인 연락처",
  "우편번호",
  "배송지",
  "주문요청사항",
  "주문일시",
  "구매확정일",
  "희망배송일",
  "발송처리일시",
  "배송완료일시",
  "주문금액",
  "배송비 묶음 번호",
  "배송비 합계",
];

const TOSS_EDITABILITY_ROW = [
  "수정 불가",
  "수정 불가",
  "수정 가능",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 가능",
  "수정 가능",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
  "수정 불가",
];

const DEFAULT_SHIPMENT_TEMPLATES: ChannelShipmentTemplateSetting[] = [
  shipmentTemplate("쿠팡", [COUPANG_SHIPMENT_HEADERS], 2),
  shipmentTemplate(
    "토스",
    [
      Array(TOSS_SHIPMENT_HEADERS.length).fill(""),
      TOSS_SHIPMENT_HEADERS,
      TOSS_EDITABILITY_ROW,
    ],
    4,
  ),
];

const DEFAULT_CHANNEL_PURCHASE_TEMPLATES: ChannelPurchaseTemplateSetting[] = [
  channelPurchaseTemplate("쿠팡"),
  channelPurchaseTemplate("토스"),
];

function normalizeShipmentTemplates(rows?: ChannelShipmentTemplateSetting[]) {
  const defaultsByChannel = new Map(
    DEFAULT_SHIPMENT_TEMPLATES.map((tpl) => [tpl.channel, tpl]),
  );
  const normalized = (rows || []).map((row) => {
    const fallback = defaultsByChannel.get(row.channel);
    const headerRows =
      Array.isArray(row.headerRows) && row.headerRows.length
        ? row.headerRows
        : fallback?.headerRows || [];
    return {
      ...row,
      id: row.id || makeId("shipment-template"),
      enabled: row.enabled !== false,
      startRow: Math.max(1, row.startRow || headerRows.length + 1),
      headerRows,
    } satisfies ChannelShipmentTemplateSetting;
  });
  const channels = new Set(normalized.map((row) => row.channel));
  DEFAULT_SHIPMENT_TEMPLATES.forEach((tpl) => {
    if (!channels.has(tpl.channel))
      normalized.push({ ...tpl, id: makeId("shipment-template") });
  });
  return normalized.sort((a, b) => a.channel.localeCompare(b.channel, "ko"));
}

function normalizeChannelPurchaseTemplates(
  rows?: ChannelPurchaseTemplateSetting[],
) {
  const defaultsByChannel = new Map(
    DEFAULT_CHANNEL_PURCHASE_TEMPLATES.map((tpl) => [tpl.channel, tpl]),
  );
  const normalized = (rows || []).map((row) => {
    const fallback = defaultsByChannel.get(row.channel);
    const headerRows =
      Array.isArray(row.headerRows) && row.headerRows.length
        ? row.headerRows
        : fallback?.headerRows || [CHANNEL_PURCHASE_TEMPLATE_HEADERS];
    return {
      ...row,
      id: row.id || makeId("channel-purchase-template"),
      enabled: row.enabled !== false,
      startRow: Math.max(1, row.startRow || headerRows.length + 1),
      headerRows,
      columns: { ...DEFAULT_CHANNEL_PURCHASE_COLUMNS, ...(row.columns || {}) },
    } satisfies ChannelPurchaseTemplateSetting;
  });
  const channels = new Set(normalized.map((row) => row.channel));
  DEFAULT_CHANNEL_PURCHASE_TEMPLATES.forEach((tpl) => {
    if (!channels.has(tpl.channel))
      normalized.push({ ...tpl, id: makeId("channel-purchase-template") });
  });
  return normalized.sort((a, b) => a.channel.localeCompare(b.channel, "ko"));
}

function normalizeOneProfitSetting(
  base: ProfitSetting,
  setting?: Partial<ProfitSetting>,
): ProfitSetting {
  return {
    apiAuto: typeof setting?.apiAuto === "boolean" ? setting.apiAuto : base.apiAuto,
    marketplaceFeeRate: Math.max(0, toNumber(setting?.marketplaceFeeRate, base.marketplaceFeeRate)),
    paymentFeeRate: Math.max(0, toNumber(setting?.paymentFeeRate, base.paymentFeeRate)),
    adFeeRate: Math.max(0, toNumber(setting?.adFeeRate, base.adFeeRate)),
    adFeeTotal: Math.max(0, toNumber(setting?.adFeeTotal, base.adFeeTotal)),
    shippingFeeDefault: Math.max(0, toNumber(setting?.shippingFeeDefault, base.shippingFeeDefault)),
  };
}

function normalizeProfitSettings(
  settings?: Partial<Record<Channel, Partial<ProfitSetting>>>,
): ProfitSettings {
  return {
    쿠팡: normalizeOneProfitSetting(DEFAULT_PROFIT_SETTINGS.쿠팡, settings?.쿠팡),
    토스: normalizeOneProfitSetting(DEFAULT_PROFIT_SETTINGS.토스, settings?.토스),
  };
}

function rowsToTextarea(rows: string[][]) {
  return rows.map((row) => row.join("\t")).join("\n");
}

function textareaToRows(value: string) {
  const rows = value
    .split(/\r?\n/)
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(",")))
    .map((row) => row.map((cell) => text(cell)));
  while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
  return rows;
}

function findOrderForInvoice(row: InvoicePreviewRow, orders: OrderRow[]) {
  const fromId = text(row.id).replace(/^inv-preview-/, "");
  const exactById = orders.find((order) => order.id === fromId);
  if (exactById) return exactById;
  const sameOrderRows = orders.filter(
    (order) =>
      order.channel === row.channel &&
      normalizeOrderKey(order.orderNo) === normalizeOrderKey(row.orderNo),
  );
  if (sameOrderRows.length <= 1) return sameOrderRows[0];
  const productMatched = sameOrderRows.find((order) =>
    hasSharedProductToken(order.productName || order.optionName, row.productName),
  );
  return productMatched || undefined;
}

function orderRawOr(
  order: OrderRow | undefined,
  aliases: string[],
  fallback: string | number = "",
) {
  const rawValue = rawOrderValue(order, aliases);
  return rawValue || fallback;
}

function getShipmentTemplate(
  channel: Channel,
  templates: ChannelShipmentTemplateSetting[],
) {
  return (
    templates.find((tpl) => tpl.enabled && tpl.channel === channel) ||
    DEFAULT_SHIPMENT_TEMPLATES.find((tpl) => tpl.channel === channel)!
  );
}

function shipmentHeaderScore(row: string[]) {
  const normalized = row.map(normalizeHeader);
  const mustHave = [
    "주문번호",
    "택배사",
    "운송장번호",
    "송장번호",
    "상품명",
    "수취인이름",
    "수령인명",
  ];
  return mustHave.reduce(
    (sum, alias) => sum + (normalized.includes(normalizeHeader(alias)) ? 1 : 0),
    0,
  );
}

function shipmentHeadersFromTemplate(template: ChannelShipmentTemplateSetting) {
  if (!template.headerRows.length)
    return template.channel === "쿠팡"
      ? COUPANG_SHIPMENT_HEADERS
      : TOSS_SHIPMENT_HEADERS;
  let best = { index: 0, score: -1 };
  template.headerRows.forEach((row, index) => {
    const score = shipmentHeaderScore(row);
    if (score > best.score) best = { index, score };
  });
  return (
    template.headerRows[best.index] ||
    (template.channel === "쿠팡"
      ? COUPANG_SHIPMENT_HEADERS
      : TOSS_SHIPMENT_HEADERS)
  );
}

function exactRawOrderValue(order: OrderRow | undefined, header: string) {
  if (!order?.raw) return "";
  const value = order.raw[normalizeHeader(header)];
  return value !== undefined ? value : "";
}

type ShipmentRowBuildOptions = {
  tossOrderStatus?: string;
};

function strictOrderShipmentValue(
  channel: Channel,
  header: string,
  row: InvoicePreviewRow,
  order: OrderRow | undefined,
  index: number,
  options: ShipmentRowBuildOptions = {},
) {
  const key = normalizeHeader(header);
  if (!key) return "";
  const has = (...aliases: string[]) => aliases.map(normalizeHeader).includes(key);
  const exact = (...aliases: string[]) => rawOrderValue(order, aliases.length ? aliases : [header]);
  const exactCurrentHeader = () => exact(header);
  const orderOnly = (value: string | number | undefined | null) => text(value);

  // B2B 업체 송장엑셀에서는 택배사/운송장번호만 사용합니다.
  // 그 외 모든 주문정보는 쿠팡/토스 상품준비중 주문 원본에서만 채웁니다.
  if (channel === "쿠팡" && has("제휴택배사유형", "제휴택배사", "제휴 택배사", "제휴택배사 타입")) return "";
  if (channel === "토스" && has("물류사", "물류사명")) return "";
  if (has("택배사", "배송사", "택배사명")) return row.courier;
  if (has("운송장번호", "송장번호", "운송장", "송장")) return row.trackingNo;

  // 토스 송장등록 업로드 파일은 배송중, 발주폴더에 보관하는 상품준비중 입력파일은 상품준비중으로 생성합니다.
  if (channel === "토스" && has("주문상태")) return options.tossOrderStatus || "배송중";

  // 화면 순번 외에는 같은 값을 여러 열에 임의 복사하지 않습니다.
  if (has("번호", "No", "순번")) return index + 1;

  // 플랫폼 주문 원본의 정확한 헤더값이 있으면 해당 값만 우선 사용합니다.
  const rawExact = exactCurrentHeader();
  if (rawExact) return rawExact;

  // 아래 fallback은 실제 업로드에 필요한 대표 필드만 허용합니다.
  // 플랫폼별 보조 ID/관리코드/묶음번호/구매자 정보는 정확한 원본 헤더값이 없으면 공란으로 둡니다.
  if (has("주문번호")) return orderOnly(order?.orderNo || row.orderNo);
  if (has("주문상품번호", "상품주문번호")) return orderOnly(row.orderProductId || order?.orderProductId || rawOrderValue(order, ["orderProductId", "tossOrderProductId", "item.orderProductId", "parent.orderProductId"]));
  if (has("묶음배송번호", "배송비 묶음 번호")) return orderOnly(row.shipmentBoxId || order?.shipmentBoxId || rawOrderValue(order, ["shipmentBoxId", "shipmentBox.shipmentBoxId", "parent.shipmentBoxId", "item.shipmentBoxId"]));
  if (has("주문상태")) return orderOnly(order?.orderStatus || row.orderStatus);

  if (has("주문일", "주문일시")) return orderOnly(order?.orderedAt);
  if (has("발송기한", "분리배송 출고예정일", "주문시 출고예정일", "희망배송일")) return "";
  if (has("출고일(발송일)", "발송처리일시")) return "";
  if (has("배송속성", "배송유형")) return "";
  if (has("분리배송 Y/N", "분리배송YN")) return "";
  if (has("배송완료일", "배송완료일시", "구매확정일자", "구매확정일")) return "";

  if (has("등록상품명", "상품명")) return orderOnly(order?.productName || row.productName);
  if (has("등록옵션명", "옵션명")) return orderOnly(order?.optionName);
  if (has("노출상품명(옵션명)", "최초등록등록상품명/옵션명")) return "";
  if (has("옵션ID", "옵션 ID")) return orderOnly(order?.optionId);
  if (has("노출상품ID", "상품ID")) return orderOnly(rawOrderValue(order, ["productId", "product.productId", "item.productId"]));
  if (has("상품 관리 코드")) return orderOnly(rawOrderValue(order, ["productManagementCode", "managementCode", "상품 관리 코드"]));
  if (has("옵션 관리 코드", "업체상품코드", "바코드")) return orderOnly(rawOrderValue(order, ["productItemManagementCode", "optionManagementCode", "item.managementCode", "vendorItemCode", "externalVendorSkuCode", "업체상품코드", "바코드"]));

  if (has("구매수(수량)", "주문건수", "수량")) return order?.qty || 1;
  if (has("결제액", "주문금액")) return order?.salePrice || "";
  if (has("옵션판매가(판매단가)", "판매가")) return "";
  if (has("배송비구분", "배송비", "배송비 합계", "도서산간 추가배송비", "받은 혜택")) return "";

  if (has("구매자", "구매자명", "구매자전화번호", "구매자 연락처")) return "";
  if (has("수취인이름", "수취인명", "수령인명")) return orderOnly(order?.receiverName || row.receiverName);
  if (has("수취인전화번호", "수취인 연락처", "수령인 연락처")) return orderOnly(order?.receiverPhone);
  if (has("우편번호")) return orderOnly(order?.zip);
  if (has("수취인 주소", "수취인주소", "배송지")) return orderOnly(order?.address);
  if (has("배송메세지", "배송메시지", "주문요청사항")) return orderOnly(order?.memo);
  if (has("상품별 추가메시지", "주문자 추가메시지")) return "";
  if (has("개인통관번호(PCCC)", "통관용수취인전화번호", "기타", "결제위치")) return "";

  // 의미를 확정할 수 없는 헤더에는 값을 반복 입력하지 않고 공란으로 둡니다.
  return "";
}

function shipmentValueByHeader(
  channel: Channel,
  header: string,
  row: InvoicePreviewRow,
  order: OrderRow | undefined,
  index: number,
  options: ShipmentRowBuildOptions = {},
) {
  return strictOrderShipmentValue(channel, header, row, order, index, options);
}

function shipmentRowsByTemplate(
  channel: Channel,
  rows: InvoicePreviewRow[],
  orders: OrderRow[],
  template: ChannelShipmentTemplateSetting,
  options: ShipmentRowBuildOptions = {},
) {
  const headers = shipmentHeadersFromTemplate(template);
  const headerWidth = Math.max(
    headers.length,
    ...template.headerRows.map((headerRow) => headerRow.length),
  );
  const normalizedHeaderRows: Array<Array<string | number>> =
    template.headerRows.map((headerRow) => {
      const out: Array<string | number> = Array(headerWidth).fill("");
      headerRow.forEach((cell, index) => {
        out[index] = cell;
      });
      return out;
    });
  const blankRows = Array.from(
    {
      length: Math.max(0, template.startRow - 1 - normalizedHeaderRows.length),
    },
    () => Array<string | number>(headerWidth).fill(""),
  );
  const bodyRows = rows.map((row, index) => {
    const order = findOrderForInvoice(row, orders);
    const out: Array<string | number> = Array(headerWidth).fill("");
    headers.forEach((header, cellIndex) => {
      out[cellIndex] = shipmentValueByHeader(
        channel,
        header,
        row,
        order,
        index,
        options,
      );
    });
    return out;
  });
  return [...normalizedHeaderRows, ...blankRows, ...bodyRows];
}

function coupangShipmentRows(
  rows: InvoicePreviewRow[],
  orders: OrderRow[],
  template = getShipmentTemplate("쿠팡", DEFAULT_SHIPMENT_TEMPLATES),
  options: ShipmentRowBuildOptions = {},
) {
  return shipmentRowsByTemplate("쿠팡", rows, orders, template, options);
}

function tossShipmentRows(
  rows: InvoicePreviewRow[],
  orders: OrderRow[],
  template = getShipmentTemplate("토스", DEFAULT_SHIPMENT_TEMPLATES),
  options: ShipmentRowBuildOptions = {},
) {
  return shipmentRowsByTemplate("토스", rows, orders, template, options);
}

function templateForVendor(
  vendorName: string,
  templates: PurchaseTemplateSetting[],
): PurchaseTemplateSetting {
  const normalized = text(vendorName).replace(/\s+/g, "");
  const found = templates.find(
    (tpl) => tpl.enabled && tpl.vendorName.replace(/\s+/g, "") === normalized,
  );
  if (found) return found;
  return purchaseTemplate(
    vendorName || "공통",
    [
      [
        "채널",
        "주문번호",
        "옵션ID",
        "코드번호",
        "업체상품명",
        "구매수량",
        "수취인",
        "전화번호",
        "우편번호",
        "주소",
        "배송메시지",
      ],
    ],
    {
      channel: "A",
      orderNo: "B",
      optionId: "C",
      vendorCode: "D",
      vendorProductName: "E",
      purchaseQty: "F",
      receiverName: "G",
      receiverPhone: "H",
      zip: "I",
      address: "J",
      memo: "K",
    },
  );
}

function valueByPurchaseField(
  row: PurchaseRow,
  field: keyof PurchaseTemplateSetting["columns"],
) {
  const values: Record<
    keyof PurchaseTemplateSetting["columns"],
    string | number
  > = {
    channel: row.channel,
    orderNo: row.orderNo,
    optionId: row.optionId,
    vendorCode: row.vendorCode,
    vendorProductName: row.vendorProductName,
    purchaseQty: row.purchaseQty,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    zip: row.zip,
    address: row.address,
    memo: row.memo,
    cost: row.cost,
    senderName: DEFAULT_BUSINESS_INFO.name,
    senderAddress: DEFAULT_BUSINESS_INFO.address,
    senderPhone: DEFAULT_BUSINESS_INFO.phone,
    senderZip: DEFAULT_BUSINESS_INFO.zip,
    senderAddress2: DEFAULT_BUSINESS_INFO.address2,
  };
  return values[field];
}

function purchaseRowsToTemplate(
  rows: PurchaseRow[],
  templates: PurchaseTemplateSetting[],
) {
  const template = templateForVendor(rows[0]?.vendorName || "", templates);
  const width = Math.max(
    ...template.headerRows.map((row) => row.length),
    maxColumnFromLetters(Object.values(template.columns)),
  );
  const body = rows.map((row) => {
    const out = Array<string | number>(width).fill("");
    (
      Object.keys(template.columns) as Array<
        keyof PurchaseTemplateSetting["columns"]
      >
    ).forEach((field) => {
      const index = columnToIndex(template.columns[field]);
      if (index >= 0) out[index] = valueByPurchaseField(row, field);
    });
    return out;
  });
  const blankRowCount = Math.max(
    0,
    (template.startRow || template.headerRows.length + 1) -
      1 -
      template.headerRows.length,
  );
  const blankRows = Array.from({ length: blankRowCount }, () =>
    Array<string | number>(width).fill(""),
  );
  return [...template.headerRows, ...blankRows, ...body];
}

function getChannelPurchaseTemplate(
  channel: Channel,
  templates: ChannelPurchaseTemplateSetting[],
) {
  return (
    templates.find((tpl) => tpl.enabled && tpl.channel === channel) ||
    DEFAULT_CHANNEL_PURCHASE_TEMPLATES.find((tpl) => tpl.channel === channel)!
  );
}

function valueByChannelPurchaseField(
  row: PurchaseRow,
  field: keyof ChannelPurchaseTemplateSetting["columns"],
) {
  const values: Record<
    keyof ChannelPurchaseTemplateSetting["columns"],
    string | number
  > = {
    channel: row.channel,
    orderNo: row.orderNo,
    optionId: row.optionId,
    vendorName: row.vendorName,
    vendorCode: row.vendorCode,
    vendorProductName: row.vendorProductName,
    orderProductName: row.orderProductName,
    orderOptionName: row.orderOptionName,
    purchaseQty: row.orderQty,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    zip: row.zip,
    address: row.address,
    memo: row.memo,
    cost: row.cost * row.orderQty,
    salePrice: row.salePrice,
  };
  return values[field];
}

function channelPurchaseRowsToTemplate(
  rows: PurchaseRow[],
  template: ChannelPurchaseTemplateSetting,
) {
  const width = Math.max(
    ...template.headerRows.map((row) => row.length),
    maxColumnFromLetters(Object.values(template.columns)),
  );
  const body = rows.map((row) => {
    const out = Array<string | number>(width).fill("");
    (
      Object.keys(template.columns) as Array<
        keyof ChannelPurchaseTemplateSetting["columns"]
      >
    ).forEach((field) => {
      const index = columnToIndex(template.columns[field]);
      if (index >= 0) out[index] = valueByChannelPurchaseField(row, field);
    });
    return out;
  });
  const blankRowCount = Math.max(
    0,
    (template.startRow || template.headerRows.length + 1) -
      1 -
      template.headerRows.length,
  );
  const blankRows = Array.from({ length: blankRowCount }, () =>
    Array<string | number>(width).fill(""),
  );
  return [...template.headerRows, ...blankRows, ...body];
}

function orderCollectRowsFromPreview(
  result: ApiResult,
  channel: Channel,
): OrderRow[] {
  const rows = Array.isArray(result.summary?.sampleOrders)
    ? result.summary?.sampleOrders
    : [];
  return rows.map((item) => {
    const raw = item as Record<string, unknown>;
    return {
      id: makeId("order-api"),
      channel,
      orderNo: text(raw.orderNo),
      orderedAt: text(raw.orderedAt),
      shipmentBoxId: cleanId(raw.shipmentBoxId || raw["shipmentBox.shipmentBoxId"] || raw["parent.shipmentBoxId"]),
      orderProductId: cleanId(raw.orderProductId || raw.tossOrderProductId || raw["item.orderProductId"] || raw["parent.orderProductId"]),
      optionId: cleanId(raw.optionId),
      productName: text(raw.productName),
      optionName: text(raw.optionName),
      qty: toNumber(raw.qty, 1),
      receiverName: text(raw.receiverName),
      receiverPhone: text(raw.receiverPhone),
      zip: text(raw.zip),
      address: text(raw.address),
      memo: text(
        raw.memo ||
          raw.parcelPrintMessage ||
          raw.shippingNote ||
          raw.deliveryMessage ||
          raw.deliveryMemo ||
          raw.shippingMessage ||
          raw.shippingMemo ||
          raw.orderMemo ||
          raw.orderMessage ||
          raw.requestMessage ||
          raw.requestMemo ||
          raw.customerRequest ||
          raw.customerMemo ||
          raw.buyerMemo ||
          extractDeliveryMessageDeep(raw),
      ),
      salePrice: toNumber(raw.salePrice, 0),
      orderStatus: text(raw.status || raw.orderStatus),
      courier: text(raw.courier || raw.carrier || raw.deliveryCompany || raw.deliveryCompanyName || raw.invoiceCompanyName || raw.shippingCompany),
      trackingNo: cleanId(raw.trackingNo || raw.invoiceNumber || raw.shipmentNumber || raw.waybillNo || raw.waybillNumber || raw.deliveryInvoiceNo || raw.trackingNumber),
      sourceFile: `${channel} API Preview`,
      raw: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, text(value)])),
    } satisfies OrderRow;
  });
}

function orderRowUniqueKey(row: OrderRow) {
  return [
    row.channel,
    normalizeOrderKey(row.orderNo),
    cleanId(row.optionId),
    normalizeHeader(row.productName),
    normalizeName(row.receiverName),
    normalizeAddress(row.address),
    String(row.qty || 0),
  ].join("|");
}

function uniqueOrderRows(rows: OrderRow[]) {
  const seen = new Set<string>();
  const unique: OrderRow[] = [];
  rows.forEach((row) => {
    const key = orderRowUniqueKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });
  return unique;
}

function mergeUniqueOrderRows(prev: OrderRow[], imported: OrderRow[]) {
  const seen = new Set(prev.map(orderRowUniqueKey));
  const added: OrderRow[] = [];
  uniqueOrderRows(imported).forEach((row) => {
    const key = orderRowUniqueKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    added.push(row);
  });
  return { rows: [...prev, ...added], addedCount: added.length, skippedCount: imported.length - added.length };
}

function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("간편운영");
  const [mappings, setMappings] = useState<MappingRow[]>(DEFAULT_MAPPINGS);
  const [tossOptionIdRows, setTossOptionIdRows] = useState<TossOptionIdRow[]>([]);
  const [coupangOptionMasterRows, setCoupangOptionMasterRows] = useState<CoupangOptionMasterRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [invoiceRecords, setInvoiceRecords] = useState<InvoiceRecord[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryRow[]>([]);
  const [purchaseTemplates, setPurchaseTemplates] = useState<
    PurchaseTemplateSetting[]
  >(DEFAULT_PURCHASE_TEMPLATES);
  const [invoiceTemplates, setInvoiceTemplates] = useState<
    InvoiceTemplateSetting[]
  >(DEFAULT_INVOICE_TEMPLATES);
  const [shipmentTemplates, setShipmentTemplates] = useState<
    ChannelShipmentTemplateSetting[]
  >(DEFAULT_SHIPMENT_TEMPLATES);
  const [channelPurchaseTemplates, setChannelPurchaseTemplates] = useState<
    ChannelPurchaseTemplateSetting[]
  >(DEFAULT_CHANNEL_PURCHASE_TEMPLATES);
  const profitSettings = DEFAULT_PROFIT_SETTINGS;
  const profitFilter = DEFAULT_PROFIT_FILTER;
  const [couponRows, setCouponRows] = useState<CouponRow[]>([]);
  const [couponHistory, setCouponHistory] = useState<CouponHistoryRow[]>([]);
  const [couponApiSettings, setCouponApiSettings] = useState<CouponApiSettings>(
    DEFAULT_COUPON_API_SETTINGS,
  );
  const [couponContractRows, setCouponContractRows] = useState<
    CoupangCouponContractRow[]
  >([]);
  const [couponListRows, setCouponListRows] = useState<CoupangCouponListRow[]>(
    [],
  );
  const [couponItemRows, setCouponItemRows] = useState<CoupangCouponItemRow[]>(
    [],
  );
  const [rollingCouponTemplates, setRollingCouponTemplates] = useState<RollingCouponTemplate[]>([]);
  const [selectedRollingCouponIds, setSelectedRollingCouponIds] = useState<string[]>([]);
  const [b2bVendorLinks, setB2BVendorLinks] = useState<B2BVendorLink[]>(
    DEFAULT_B2B_VENDOR_LINKS,
  );
  const [couponMessage, setCouponMessage] = useState(
    "쿠팡 할인쿠폰은 손익 검증을 통과한 뒤 Preview에 사용합니다.",
  );
  const [folderHandles, setFolderHandles] = useState<
    Partial<Record<BrowserFolderKind, FileSystemDirectoryHandleLike>>
  >({});
  const [folderNames, setFolderNames] = useState<
    Partial<Record<BrowserFolderKind, string>>
  >({});
  const [localFolderPaths, setLocalFolderPaths] = useState<
    Partial<Record<BrowserFolderKind, string>>
  >({});
  const [recentLocalFiles, setRecentLocalFiles] = useState<
    Partial<Record<BrowserFolderKind, LocalManagedFile[]>>
  >({});
  const [folderMessage, setFolderMessage] = useState(
    "발주 폴더 하나에서 업체별 발주엑셀, 쿠팡/토스 상품준비중 입력파일, 업체 송장엑셀, 자동입력 결과파일을 함께 관리합니다.",
  );
  const [schedules, setSchedules] =
    useState<ScheduleConfig>(normalizeSchedules());
  const [sessionKey, setSessionKey] = useState(DEFAULT_SESSION_KEY);
  const [settingsKey, setSettingsKey] = useState(DEFAULT_SETTINGS_KEY);
  const [message, setMessage] = useState(
    "서버 운영은 Supabase SQL 실행 → 연결 확인 → 운영점검 → 로그 저장/확인 순서로 먼저 점검합니다. 스케줄러 중복 실행은 운영로그 기준으로 차단합니다.",
  );
  const [serverMessage, setServerMessage] = useState("서버 점검 전입니다.");
  const [settingsMessage, setSettingsMessage] = useState(
    "매핑/발주양식/송장양식 설정 저장 전입니다.",
  );
  const [shipmentPreviewMessage, setShipmentPreviewMessage] = useState(
    "업체 송장엑셀을 발주폴더에 넣으면 쿠팡/토스 입력파일과 자동 매칭해 배송중 업로드까지 처리합니다.",
  );
  const [mappingCheckSummary, setMappingCheckSummary] =
    useState<MappingCheckSummary>(EMPTY_MAPPING_CHECK);
  const [mappingCheckMessage, setMappingCheckMessage] = useState(
    "Supabase 주문자료를 불러오면 현재 매핑 기준으로 즉시 매칭완료/미매핑을 검사합니다.",
  );
  const [serverOperationRows, setServerOperationRows] = useState<
    Array<{ item: string; status: string; detail: string }>
  >([]);
  const [operationLogRows, setOperationLogRows] = useState<
    OperationLogViewRow[]
  >([]);
  const [publicIpRows, setPublicIpRows] = useState<PublicIpViewRow[]>([]);
  const [orderApiFilter, setOrderApiFilter] = useState<OrderApiFilter>(
    DEFAULT_ORDER_API_FILTER,
  );
  const [apiDiagnosticRows, setApiDiagnosticRows] = useState<ApiDiagnosticRow[]>(
    [],
  );
  const [orderCollectSummaryRows, setOrderCollectSummaryRows] = useState<
    OrderCollectionSummaryRow[]
  >([]);
  const [lastPurchaseExportRows, setLastPurchaseExportRows] = useState<
    Array<Array<string | number>>
  >([]);
  const [lastShipmentExportRows, setLastShipmentExportRows] = useState<
    Array<Array<string | number>>
  >([]);

  useEffect(() => {
    purgeLegacyOrderScheduleStorage();
    try {
      const saved = readLocalStorageWithFallback(
        STORAGE_KEY,
        LEGACY_STORAGE_KEYS,
      );
      if (saved) {
        const parsed = JSON.parse(saved) as TempPayload;
        if (Array.isArray(parsed.mappings)) setMappings(normalizeMappingRows(parsed.mappings));
        if (Array.isArray(parsed.tossOptionIdRows)) setTossOptionIdRows(normalizeTossOptionIdRows(parsed.tossOptionIdRows));
        if (Array.isArray(parsed.coupangOptionMasterRows)) setCoupangOptionMasterRows(normalizeCoupangOptionMasterRows(parsed.coupangOptionMasterRows));
        if (Array.isArray(parsed.orders)) setOrders(parsed.orders);
        if (Array.isArray(parsed.invoiceRecords))
          setInvoiceRecords(parsed.invoiceRecords);
        if (Array.isArray(parsed.purchaseTemplates))
          setPurchaseTemplates(
            normalizePurchaseTemplates(parsed.purchaseTemplates),
          );
        if (Array.isArray(parsed.invoiceTemplates))
          setInvoiceTemplates(parsed.invoiceTemplates);
        if (Array.isArray(parsed.shipmentTemplates))
          setShipmentTemplates(
            normalizeShipmentTemplates(parsed.shipmentTemplates),
          );
        if (Array.isArray(parsed.channelPurchaseTemplates))
          setChannelPurchaseTemplates(
            normalizeChannelPurchaseTemplates(parsed.channelPurchaseTemplates),
          );
        if (Array.isArray(parsed.couponRows)) setCouponRows(parsed.couponRows);
        if (Array.isArray(parsed.couponHistory)) setCouponHistory(parsed.couponHistory);
        const restoredRollingTemplates = normalizeRollingCouponTemplates(parsed.rollingCouponTemplates || parsed.couponApiSettings?.rollingTemplates);
        if (restoredRollingTemplates.length) setRollingCouponTemplates(restoredRollingTemplates);
        if (parsed.couponApiSettings) setCouponApiSettings(normalizeCouponApiSettings({ ...parsed.couponApiSettings, rollingTemplates: restoredRollingTemplates.length ? restoredRollingTemplates : parsed.couponApiSettings.rollingTemplates }));
        if (Array.isArray(parsed.b2bVendorLinks))
          setB2BVendorLinks(normalizeB2BVendorLinks(parsed.b2bVendorLinks));
        if (parsed.folderNames) setFolderNames(parsed.folderNames);
        if (parsed.localFolderPaths) setLocalFolderPaths(parsed.localFolderPaths);
        if (parsed.schedules)
          setSchedules(normalizeSchedules(parsed.schedules));
        if (parsed.sessionKey) setSessionKey(parsed.sessionKey);
        if (parsed.settingsKey) setSettingsKey(parsed.settingsKey);
      }
    } catch {
      setMessage(
        "브라우저 작업자료를 읽지 못했습니다. 새 자료로 계속 진행할 수 있습니다.",
      );
    }

    try {
      const savedSettings = readLocalStorageWithFallback(
        SETTINGS_STORAGE_KEY,
        LEGACY_SETTINGS_STORAGE_KEYS,
      );
      if (!savedSettings) return;
      const parsedSettings = JSON.parse(
        savedSettings,
      ) as PersistentSettingsPayload;
      applyPersistentSettings(parsedSettings);
      if (parsedSettings.localFolderPaths) setLocalFolderPaths(parsedSettings.localFolderPaths);
      if (parsedSettings.settingsKey)
        setSettingsKey(parsedSettings.settingsKey);
      setSettingsMessage(
        "PC 로컬폴더 경로와 저장된 매핑/양식/쿠폰 설정을 자동 적용했습니다.",
      );
    } catch {
      setSettingsMessage(
        "브라우저 설정자료를 읽지 못했습니다. 기본 설정으로 계속 진행할 수 있습니다.",
      );
    }

    void Promise.all([
      loadFolderHandle("purchase"),
      loadFolderHandle("invoice"),
      loadFolderHandle("upload"),
    ])
      .then(([purchaseHandle, invoiceHandle, uploadHandle]) => {
        const nextHandles: Partial<
          Record<BrowserFolderKind, FileSystemDirectoryHandleLike>
        > = {};
        const nextNames: Partial<Record<BrowserFolderKind, string>> = {};
        if (purchaseHandle) {
          nextHandles.purchase = purchaseHandle;
          nextNames.purchase = purchaseHandle.name;
        }
        if (invoiceHandle) {
          nextHandles.invoice = invoiceHandle;
          nextNames.invoice = invoiceHandle.name;
        }
        if (uploadHandle) {
          nextHandles.upload = uploadHandle;
          nextNames.upload = uploadHandle.name;
        }
        if (purchaseHandle || invoiceHandle || uploadHandle) {
          setFolderHandles(nextHandles);
          setFolderNames((prev) => ({ ...prev, ...nextNames }));
          setFolderMessage(
            "저장된 발주 폴더 설정을 불러왔습니다. PC 로컬폴더 경로가 있으면 그 경로가 우선 사용됩니다.",
          );
        }
      })
      .catch(() => {
        setFolderMessage(
          "폴더 설정을 자동 복원하지 못했습니다. PC 로컬폴더 경로를 다시 확인해 주세요.",
        );
      });
  }, []);

  useEffect(() => {
    setOrderApiFilter((prev) => {
      if (prev.coupangStatus === "ACCEPT" && prev.tossStatus === "PAID") return prev;
      return { ...prev, coupangStatus: "ACCEPT", tossStatus: "PAID" };
    });
  }, []);

  useEffect(() => {
    const payload: TempPayload = {
      mappings,
      tossOptionIdRows,
      coupangOptionMasterRows,
      orders,
      invoiceRecords,
      purchaseHistory,
      purchaseTemplates,
      invoiceTemplates,
      shipmentTemplates,
      channelPurchaseTemplates,
      couponRows,
      couponHistory,
      couponApiSettings: normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: rollingCouponTemplates }),
      rollingCouponTemplates,
      b2bVendorLinks,
      folderNames,
      localFolderPaths,
      schedules,
      sessionKey,
      settingsKey,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 서버 저장 버튼으로 운영할 수 있습니다.
    }
  }, [
    mappings,
    tossOptionIdRows,
    coupangOptionMasterRows,
    orders,
    invoiceRecords,
    purchaseHistory,
    purchaseTemplates,
    invoiceTemplates,
    shipmentTemplates,
    channelPurchaseTemplates,
    profitSettings,
    profitFilter,
    couponRows,
    couponHistory,
    couponApiSettings,
    rollingCouponTemplates,
    b2bVendorLinks,
    folderNames,
    localFolderPaths,
    schedules,
    sessionKey,
    settingsKey,
  ]);

  const purchaseRows = useMemo(
    () => buildPurchaseRows(orders, mappings),
    [orders, mappings],
  );
  const invoiceOrdersForMatching = useMemo(() => {
    const hasAnyStatus = orders.some((order) => text(order.orderStatus));
    const preparingOrders = orders.filter((order) =>
      isPreparingStatus(order.channel, order.orderStatus),
    );
    // 송장등록은 원칙적으로 상품준비중 주문만 대상으로 합니다.
    // 다만 일부 API/엑셀 응답이 상태값을 비워 보내는 경우에는 직전 수집 목록 전체를 임시 대상으로 삼아 매칭 실패를 방지합니다.
    return preparingOrders.length || hasAnyStatus ? preparingOrders : orders;
  }, [orders]);

  const invoicePreviewRows = useMemo(
    () => matchInvoices(invoiceOrdersForMatching, purchaseRows, invoiceRecords),
    [invoiceOrdersForMatching, purchaseRows, invoiceRecords],
  );
  const vendorGroups = useMemo(
    () =>
      groupBy(
        filterNewPurchaseTargetRows(purchaseRows, orders, purchaseHistory),
        (row) => row.vendorName,
      ),
    [purchaseRows, orders, purchaseHistory],
  );
  const readyInvoiceRows = invoicePreviewRows.filter(
    (row) => row.status === "등록준비",
  );
  const missingMappings = purchaseRows.filter(
    (row) => row.matchStatus === "미매핑",
  );
  const purchasePreflightIssues = useMemo(
    () => validatePurchasePreflight(purchaseRows, orders, purchaseHistory),
    [purchaseRows, orders, purchaseHistory],
  );
  const purchasePreflightBlocked = useMemo(
    () => purchasePreflightIssues.filter((issue) => issue.level === "차단"),
    [purchasePreflightIssues],
  );
  const dailyOperationRows = useMemo(
    () => buildDailyOperationBoardRows(purchaseRows, orders, purchaseHistory, readyInvoiceRows.length),
    [purchaseRows, orders, purchaseHistory, readyInvoiceRows.length],
  );
  const purchasePreflightSummaryRowsMemo = useMemo(
    () => purchasePreflightSummaryRows(purchaseRows, purchasePreflightIssues, orders, purchaseHistory),
    [purchaseRows, purchasePreflightIssues, orders, purchaseHistory],
  );
  const vendorNames = useMemo(
    () =>
      Array.from(
        new Set([
          "공통",
          ...mappings.map((row) => row.vendorName).filter(Boolean),
          ...purchaseTemplates.map((row) => row.vendorName),
          ...invoiceTemplates.map((row) => row.vendorName),
        ]),
      ).sort(),
    [mappings, purchaseTemplates, invoiceTemplates],
  );
  const allProfitAnalysisRows = useMemo(
    () => calculateProfitRows(purchaseRows, orders, profitSettings),
    [purchaseRows, orders, profitSettings],
  );
  const profitAnalysisRows = useMemo(() => {
    const filteredPurchaseRows = purchaseRows.filter((row) => rowInProfitPeriod(row, profitFilter));
    return calculateProfitRows(filteredPurchaseRows, orders, profitSettings);
  }, [purchaseRows, orders, profitSettings, profitFilter]);
  const couponValidationRows = useMemo(
    () => validateCouponRows(couponRows),
    [couponRows],
  );
  const invalidCouponRows = useMemo(
    () => couponValidationRows.filter((row) => row.status === "확인필요"),
    [couponValidationRows],
  );
  const couponMonthlyImpactRows: CouponMonthlyImpactRow[] = [];
  const couponMonthlyRiskRows: CouponMonthlyImpactRow[] = [];

  const localCoupangOptionMasterRows = useMemo(
    () => buildCoupangOptionMasterRowsFromLocal(orders, mappings, allProfitAnalysisRows, couponRows),
    [orders, mappings, allProfitAnalysisRows, couponRows],
  );
  const currentCoupangOptionMasterRows = useMemo(
    () =>
      coupangOptionMasterRows.length
        ? normalizeCoupangOptionMasterRows(coupangOptionMasterRows)
        : localCoupangOptionMasterRows,
    [coupangOptionMasterRows, localCoupangOptionMasterRows],
  );
  const couponProfitSourceRows = useMemo(
    () => [
      ...allProfitAnalysisRows,
      ...buildCouponMappingProfitBasisRows(
        mappings,
        currentCoupangOptionMasterRows,
        couponRows,
        ),
    ],
    [allProfitAnalysisRows, mappings, currentCoupangOptionMasterRows, couponRows, profitSettings],
  );
  const couponProfitAnalysisRows = useMemo(
    () => analyzeCouponProfitRows(couponRows, couponProfitSourceRows),
    [couponRows, couponProfitSourceRows],
  );
  const couponProfitBlockRows = useMemo(
    () => couponProfitAnalysisRows.filter((row) => row.riskLevel === "차단"),
    [couponProfitAnalysisRows],
  );
  const couponProfitWarningRows = useMemo(
    () => couponProfitAnalysisRows.filter((row) => row.riskLevel === "주의"),
    [couponProfitAnalysisRows],
  );

  const selectedDailyCouponOptionRows = useMemo(
    () => selectedCouponOptionRows(currentCoupangOptionMasterRows, couponApiSettings),
    [currentCoupangOptionMasterRows, couponApiSettings],
  );
  const dailyCouponCancelRows = useMemo(
    () => couponApiSettings.selectedMode === "daily_new"
      ? buildDailyCouponRowsForSelectedCoupon("cancel", currentCoupangOptionMasterRows, couponRows, schedules, couponApiSettings)
      : buildDailyCouponRowsFromOptions("cancel", currentCoupangOptionMasterRows, couponRows, schedules),
    [currentCoupangOptionMasterRows, couponRows, schedules, couponApiSettings],
  );
  const dailyCouponApplyRows = useMemo(
    () => couponApiSettings.selectedMode === "daily_new"
      ? buildDailyCouponRowsForSelectedCoupon("apply", currentCoupangOptionMasterRows, couponRows, schedules, couponApiSettings)
      : buildDailyCouponRowsFromOptions("apply", currentCoupangOptionMasterRows, couponRows, schedules),
    [currentCoupangOptionMasterRows, couponRows, schedules, couponApiSettings],
  );

  const couponExecutionCheckRows = useMemo(
    () => buildCouponExecutionCheckRows(
      couponRows,
      couponValidationRows,
      couponProfitAnalysisRows,
      couponMonthlyImpactRows,
      couponHistory,
    ),
    [couponRows, couponValidationRows, couponProfitAnalysisRows, couponMonthlyImpactRows, couponHistory],
  );
  const couponExecutionReadyRows = useMemo(
    () => couponExecutionCheckRows.filter((row) => row.executeStatus === "대기"),
    [couponExecutionCheckRows],
  );
  const couponExecutionBlockedRows = useMemo(
    () => couponExecutionCheckRows.filter((row) => row.executeStatus === "차단"),
    [couponExecutionCheckRows],
  );
  const couponExecutionDuplicateRows = useMemo(
    () => couponExecutionCheckRows.filter((row) => row.executeStatus === "중복"),
    [couponExecutionCheckRows],
  );

  const operationPreflightRows = useMemo(() => {
    const enabledPurchaseTemplates = purchaseTemplates.filter((row) => row.enabled).length;
    const enabledInvoiceTemplates = invoiceTemplates.filter((row) => row.enabled).length;
    const enabledShipmentTemplates = shipmentTemplates.filter((row) => row.enabled).length;
    const readyPurchaseRows = filterNewPurchaseTargetRows(purchaseRows, orders, purchaseHistory).length;
    const couponCancelRows = couponExecutionReadyRows.filter((row) => row.action === "cancel").length;
    const couponApplyRows = couponExecutionReadyRows.filter((row) => row.action === "apply").length;
    return [
      ["쿠팡 주문 수집", "수동", "시간설정 없이 버튼 클릭 시 최근 7일 수집"],
      ["토스 주문 수집", "수동", "시간설정 없이 버튼 클릭 시 최근 7일 수집"],
      ["B2B 발주", readyPurchaseRows ? "준비" : "대기", `신규 발주대상 ${readyPurchaseRows}건 / 업체별 발주양식 ${enabledPurchaseTemplates}개`],
      ["B2B 운송장 회수", enabledInvoiceTemplates ? "준비" : "확인필요", `업체별 송장 회수양식 ${enabledInvoiceTemplates}개 / 업로드 수동`],
      ["쿠팡/토스 송장 등록", readyInvoiceRows.length ? "준비" : "대기", `송장등록 준비 ${readyInvoiceRows.length}건 / 채널양식 ${enabledShipmentTemplates}개`],
      ["쿠폰 23:50 취소", couponCancelRows ? "준비" : "대기", `${schedules.couponCancel.time} / 실행대상 ${couponCancelRows}건 / 중복 ${couponExecutionDuplicateRows.length}건`],
      ["쿠폰 23:51 적용", couponApplyRows ? "준비" : "대기", `${schedules.couponApply.time} / 실행대상 ${couponApplyRows}건 / 차단 ${couponExecutionBlockedRows.length}건`],
      ["스케줄러", schedules.couponCancel.enabled || schedules.couponApply.enabled || schedules.storageCleanup.enabled ? "사용" : "수동", "자동 실행은 쿠폰·저장소 정리만 사용"],
      ["서버 용량 점검·정리", schedules.storageCleanup.enabled ? "자동+수동" : "수동", `${schedules.storageCleanup.time} / 점검·정리 수동 버튼 있음`],
    ];
  }, [
    schedules,
    purchaseTemplates,
    invoiceTemplates,
    shipmentTemplates,
    purchaseRows,
    orders,
    purchaseHistory,
    readyInvoiceRows.length,
    couponExecutionReadyRows,
    couponExecutionDuplicateRows.length,
    couponExecutionBlockedRows.length,
  ]);
  function apiBaseUrl() {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
    return String(env.VITE_WORKER_URL || env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  }

  function apiTargetUrl(path: string) {
    if (/^https?:\/\//i.test(path)) return path;
    const base = apiBaseUrl();
    if (!base) return path;
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function callApi(path: string, payload?: Record<string, unknown>) {
    const target = apiTargetUrl(path);
    const response = await fetch(
      target,
      payload
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }
        : undefined,
    );
    const text = await response.text();
    let result: ApiResult = {
      ok: response.ok,
      message: text ? undefined : `API 응답 본문 없음: HTTP ${response.status} ${response.statusText} (${target})`,
    };
    if (text.trim()) {
      try {
        result = JSON.parse(text) as ApiResult;
      } catch {
        const preview = text.trim().replace(/\s+/g, " ").slice(0, 240);
        throw new Error(`API 응답 JSON 파싱 실패: HTTP ${response.status} ${response.statusText} (${target}) / ${preview}`);
      }
    }
    if (!response.ok) {
      throw new Error(result.message || `API 요청 실패: HTTP ${response.status} ${response.statusText} (${target})`);
    }
    return result;
  }

  function applyServerPayload(data: TempPayload) {
    if (Array.isArray(data.mappings)) setMappings(normalizeMappingRows(data.mappings));
    if (Array.isArray(data.tossOptionIdRows)) setTossOptionIdRows(normalizeTossOptionIdRows(data.tossOptionIdRows));
    if (Array.isArray(data.coupangOptionMasterRows)) setCoupangOptionMasterRows(normalizeCoupangOptionMasterRows(data.coupangOptionMasterRows));
    if (Array.isArray(data.orders)) setOrders(data.orders);
    if (Array.isArray(data.invoiceRecords))
      setInvoiceRecords(data.invoiceRecords);
    if (Array.isArray(data.purchaseHistory)) setPurchaseHistory(data.purchaseHistory);
    if (Array.isArray(data.purchaseTemplates))
      setPurchaseTemplates(normalizePurchaseTemplates(data.purchaseTemplates));
    if (Array.isArray(data.invoiceTemplates))
      setInvoiceTemplates(data.invoiceTemplates);
    if (Array.isArray(data.shipmentTemplates))
      setShipmentTemplates(normalizeShipmentTemplates(data.shipmentTemplates));
    if (Array.isArray(data.channelPurchaseTemplates))
      setChannelPurchaseTemplates(
        normalizeChannelPurchaseTemplates(data.channelPurchaseTemplates),
      );
    if (Array.isArray(data.couponRows)) setCouponRows(data.couponRows);
    if (Array.isArray(data.couponHistory)) setCouponHistory(data.couponHistory);
    const restoredRollingTemplates = normalizeRollingCouponTemplates(data.rollingCouponTemplates || data.couponApiSettings?.rollingTemplates);
    if (restoredRollingTemplates.length || Array.isArray(data.rollingCouponTemplates)) setRollingCouponTemplates(restoredRollingTemplates);
    if (data.couponApiSettings) setCouponApiSettings(normalizeCouponApiSettings({ ...data.couponApiSettings, rollingTemplates: restoredRollingTemplates.length ? restoredRollingTemplates : data.couponApiSettings.rollingTemplates }));
    if (Array.isArray(data.b2bVendorLinks))
      setB2BVendorLinks(normalizeB2BVendorLinks(data.b2bVendorLinks));
    if (data.folderNames) setFolderNames(data.folderNames);
    if (data.localFolderPaths) setLocalFolderPaths(data.localFolderPaths);
    if (data.schedules) setSchedules(normalizeSchedules(data.schedules));
    if (data.sessionKey) setSessionKey(data.sessionKey);
    if (data.settingsKey) setSettingsKey(data.settingsKey);
  }

  function normalizePurchaseTemplates(rows: PurchaseTemplateSetting[]) {
    return rows.map((row) => ({
      ...row,
      startRow: row.startRow || row.headerRows.length + 1,
    }));
  }

  function createPersistentSettingsPayload(): PersistentSettingsPayload {
    return {
      mappings,
      tossOptionIdRows: normalizeTossOptionIdRows(tossOptionIdRows),
      coupangOptionMasterRows: normalizeCoupangOptionMasterRows(coupangOptionMasterRows),
      purchaseHistory,
      purchaseTemplates: normalizePurchaseTemplates(purchaseTemplates),
      invoiceTemplates,
      shipmentTemplates: normalizeShipmentTemplates(shipmentTemplates),
      channelPurchaseTemplates: normalizeChannelPurchaseTemplates(
        channelPurchaseTemplates,
      ),
      couponRows,
      couponHistory,
      couponApiSettings: normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: rollingCouponTemplates }),
      rollingCouponTemplates,
      b2bVendorLinks: normalizeB2BVendorLinks(b2bVendorLinks),
      folderNames,
      localFolderPaths,
      schedules,
      settingsKey,
      savedAt: new Date().toISOString(),
      version: APP_VERSION,
    };
  }

  function applyPersistentSettings(data: PersistentSettingsPayload) {
    if (Array.isArray(data.mappings)) setMappings(normalizeMappingRows(data.mappings));
    if (Array.isArray(data.tossOptionIdRows)) setTossOptionIdRows(normalizeTossOptionIdRows(data.tossOptionIdRows));
    if (Array.isArray(data.coupangOptionMasterRows)) setCoupangOptionMasterRows(normalizeCoupangOptionMasterRows(data.coupangOptionMasterRows));
    if (Array.isArray(data.purchaseHistory)) setPurchaseHistory(data.purchaseHistory);
    if (Array.isArray(data.purchaseTemplates))
      setPurchaseTemplates(normalizePurchaseTemplates(data.purchaseTemplates));
    if (Array.isArray(data.invoiceTemplates))
      setInvoiceTemplates(data.invoiceTemplates);
    if (Array.isArray(data.shipmentTemplates))
      setShipmentTemplates(normalizeShipmentTemplates(data.shipmentTemplates));
    if (Array.isArray(data.channelPurchaseTemplates))
      setChannelPurchaseTemplates(
        normalizeChannelPurchaseTemplates(data.channelPurchaseTemplates),
      );
    if (Array.isArray(data.couponRows)) setCouponRows(data.couponRows);
    if (Array.isArray(data.couponHistory)) setCouponHistory(data.couponHistory);
    const restoredRollingTemplates = normalizeRollingCouponTemplates(data.rollingCouponTemplates || data.couponApiSettings?.rollingTemplates);
    if (restoredRollingTemplates.length || Array.isArray(data.rollingCouponTemplates)) setRollingCouponTemplates(restoredRollingTemplates);
    if (data.couponApiSettings) setCouponApiSettings(normalizeCouponApiSettings({ ...data.couponApiSettings, rollingTemplates: restoredRollingTemplates.length ? restoredRollingTemplates : data.couponApiSettings.rollingTemplates }));
    if (Array.isArray(data.b2bVendorLinks))
      setB2BVendorLinks(normalizeB2BVendorLinks(data.b2bVendorLinks));
    if (data.folderNames) setFolderNames(data.folderNames);
    if (data.localFolderPaths) setLocalFolderPaths(data.localFolderPaths);
    if (data.schedules) setSchedules(normalizeSchedules(data.schedules));
    if (data.settingsKey) setSettingsKey(data.settingsKey);
  }

  function saveSettingsToBrowser() {
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(createPersistentSettingsPayload()),
      );
      setSettingsMessage(
        "PC 로컬폴더 경로와 현재 매핑/토스 옵션ID/쿠팡 옵션마스터/발주양식/송장양식/쿠팡·토스 양식/쿠폰/API 선택값/B2B 바로가기 설정을 최신본으로 저장했습니다. 화면 목록에서 삭제한 항목은 다음 불러오기에도 제외됩니다.",
      );
      setMessage(
        "브라우저 저장을 완료했습니다. 현재 화면 설정이 최신본입니다.",
      );
    } catch {
      setSettingsMessage(
        "브라우저 저장공간 부족 또는 권한 문제로 설정 저장에 실패했습니다.",
      );
    }
  }

  async function saveSettingsToServer() {
    try {
      const result = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: createPersistentSettingsPayload(),
      });
      setSettingsMessage(
        result.message || "서버에 매핑/양식 설정을 저장했습니다.",
      );
      setMessage(result.message || "서버 설정 저장을 완료했습니다.");
    } catch (error) {
      setSettingsMessage(`서버 설정 저장 실패: ${String(error)}`);
    }
  }

  async function loadSettingsFromServer() {
    try {
      const result = await callApi(
        `/api/operation/settings/load?settingsKey=${encodeURIComponent(settingsKey)}`,
      );
      if (!result?.ok || !result?.data) {
        setSettingsMessage(
          result?.message || "서버에 저장된 매핑/양식 설정이 없습니다.",
        );
        return;
      }
      applyPersistentSettings({
        ...result.data,
        settingsKey:
          result.sessionKey || result.data.settingsKey || settingsKey,
      });
      setSettingsMessage(
        result.message || "서버 매핑/양식 설정을 불러왔습니다.",
      );
    } catch (error) {
      setSettingsMessage(`서버 설정 불러오기 실패: ${String(error)}`);
    }
  }

  async function loadLatestSettingsFromServer() {
    try {
      const result = await callApi("/api/operation/settings/latest");
      if (!result?.ok || !result?.data) {
        setSettingsMessage(
          result?.message || "서버에 저장된 최신 매핑/양식 설정이 없습니다.",
        );
        return;
      }
      applyPersistentSettings({
        ...result.data,
        settingsKey:
          result.sessionKey || result.data.settingsKey || settingsKey,
      });
      setSettingsMessage(
        result.message || "서버 최신 매핑/양식 설정을 불러왔습니다.",
      );
    } catch (error) {
      setSettingsMessage(`서버 최신 설정 불러오기 실패: ${String(error)}`);
    }
  }

  async function deleteSettingsFromServer() {
    try {
      const result = await callApi("/api/operation/settings/delete", {
        settingsKey,
      });
      setSettingsMessage(
        result.message ||
          "서버 매핑/양식 설정을 삭제했습니다. 현재 화면의 설정값은 유지됩니다.",
      );
    } catch (error) {
      setSettingsMessage(`설정 삭제 실패: ${String(error)}`);
    }
  }

  async function handleMappingImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importRowsFromFile(file);
      const imported = parseMappingRows(rows);
      if (!imported.length) throw new Error("가져올 매핑 행이 없습니다.");
      const normalized = normalizeMappingRows(imported);
      setMappings(normalized);
      const summaryText = mappingImportSummary(normalized);
      const summary = summarizeMappingCheck(orders, normalized, `${file.name} 매핑 업로드`);
      setMappingCheckSummary(summary);
      setMappingCheckMessage(`${file.name}에서 매핑 ${normalized.length}행을 적용했습니다. ${summaryText}. 운영 공용 설정으로 쓰려면 매핑관리의 서버 저장을 눌러 Supabase에 저장하세요.`);
      setMessage(`${file.name}에서 매핑 ${normalized.length}행을 적용했습니다. ${summaryText}. 현재 주문 기준으로 자동 재검사됩니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }


  async function handleTossOptionIdImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importRowsFromFile(file);
      const imported = parseTossOptionIdRows(rows);
      if (!imported.length) {
        throw new Error("토스 옵션ID 엑셀에서 옵션 ID와 옵션 관리 코드 열을 찾지 못했습니다.");
      }
      setTossOptionIdRows(imported);
      const applied = applyTossOptionIdsToOrders(orders, imported);
      if (applied.updated) setOrders(applied.rows);
      const messageText = `${file.name}에서 토스 실제 옵션ID ${imported.length}건을 적용했습니다. 현재 주문 ${applied.updated}건의 옵션ID를 보정했습니다.`;
      setSettingsMessage(messageText);
      setMappingCheckMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }



  function tossOptionRowsFromApiResult(result: ApiResult): TossOptionIdRow[] {
    const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows : [];
    return normalizeTossOptionIdRows(
      rows.map((row) => {
        const record = row as Record<string, unknown>;
        return makeTossOptionIdRow(
          text(record.optionId),
          text(record.optionCode || record.managementCode || record.itemName),
          text(record.productName),
          text(record.status || record.memo),
          text(record.productId),
          text(record.itemName),
          text(record.managementCode),
        );
      }),
    );
  }

  async function fetchTossOptionMastersFromApi(showMessage = true): Promise<TossOptionIdRow[]> {
    try {
      const result = await callApi("/api/integrations/toss/products/options-sync", {
        manual: true,
        limit: 50,
        maxPages: 20,
      });
      const imported = tossOptionRowsFromApiResult(result);
      if (!imported.length) {
        const msg = result.message || "토스 상품 API에서 실제 옵션ID를 가져오지 못했습니다. 진단 결과를 확인하세요.";
        if (showMessage) setMessage(msg);
        return [];
      }
      setTossOptionIdRows(imported);
      const applied = applyTossOptionIdsToOrders(orders, imported);
      if (applied.updated) setOrders(applied.rows);
      const msg = `${result.message || "토스 옵션를 완료했습니다."} 현재 주문 ${applied.updated}건을 실제 옵션ID 기준으로 보정했습니다.`;
      setSettingsMessage(msg);
      setMappingCheckMessage(msg);
      if (showMessage) setMessage(msg);
      return imported;
    } catch (error) {
      const msg = `토스 옵션 실패: ${String(error)}`;
      if (showMessage) setMessage(msg);
      return [];
    }
  }

  async function syncTossOptionIdsFromApi(showMessage = true) {
    await fetchTossOptionMastersFromApi(showMessage);
  }

  function buildCoupangSalePriceSyncTargets() {
    return normalizeCoupangOptionMasterRows([
      ...currentCoupangOptionMasterRows,
      ...localCoupangOptionMasterRows,
      ...couponRows.map((row) =>
        makeCoupangOptionMasterRow(
          row.optionId,
          row.productName,
          "",
          row.salePrice || 0,
          couponActionLabel(row.action),
          row.salePriceSource === "api" ? "api" : "coupon",
        ),
      ),
      ...rollingCouponTemplates.flatMap((template) => rollingTemplateOptionsToMasterRows(template)),
      ...mappings
        .filter((row) => row.channel === "쿠팡")
        .map((row) =>
          makeCoupangOptionMasterRow(
            row.optionId,
            row.vendorProductName,
            row.vendorCode,
            0,
            row.vendorName,
            "mapping",
          ),
        ),
    ]);
  }

  function coupangSalePriceRowsFromApiResult(result: ApiResult): CoupangOptionMasterRow[] {
    const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows : [];
    const previous = buildCoupangSalePriceSyncTargets();
    const previousById = new Map(previous.map((row) => [cleanId(row.optionId), row]));
    return normalizeCoupangOptionMasterRows(
      rows.map((row) => {
        const record = row as Record<string, unknown>;
        const optionId = cleanId(text(record.optionId));
        const prev = previousById.get(optionId);
        return makeCoupangOptionMasterRow(
          optionId,
          prev?.productName || "",
          prev?.optionName || "",
          toNumber(record.salePrice, 0),
          text(record.status || record.amountInStock || prev?.status),
          "api",
        );
      }),
    );
  }

  async function syncCoupangSalePricesFromApi() {
    try {
      const targets = buildCoupangSalePriceSyncTargets();
      if (!targets.length) {
        const msg = "판매가를 조회할 쿠팡 옵션ID가 없습니다. 쿠폰양식 또는 매핑자료에 쿠팡 옵션ID를 먼저 입력하세요.";
        setCouponMessage(msg);
        setMessage(msg);
        return [];
      }
      const result = await callApi("/api/integrations/coupang/products/prices-sync", {
        rows: targets,
        manual: true,
      });
      const imported = coupangSalePriceRowsFromApiResult(result);
      if (imported.length) {
        const byId = new Map(imported.map((row) => [cleanId(row.optionId), row]));
        const merged = normalizeCoupangOptionMasterRows([
          ...targets.map((row) => {
            const updated = byId.get(cleanId(row.optionId));
            return updated
              ? {
                  ...row,
                  productName: row.productName || updated.productName,
                  optionName: row.optionName || updated.optionName,
                  salePrice: updated.salePrice,
                  status: updated.status || row.status,
                  source: "api" as const,
                  syncedAt: updated.syncedAt,
                }
              : row;
          }),
          ...imported,
        ]);
        setCoupangOptionMasterRows(merged);
        setCouponRows((rows) =>
          rows.map((row) => {
            const updated = byId.get(cleanId(row.optionId));
            return updated && updated.salePrice > 0
              ? { ...row, salePrice: updated.salePrice, salePriceSource: "api" }
              : row;
          }),
        );
        setRollingCouponTemplates((templates) => normalizeRollingCouponTemplates(templates.map((template) => ({
          ...template,
          options: template.options.map((option) => {
            const updated = byId.get(cleanId(option.optionId));
            return updated && updated.salePrice > 0
              ? { ...option, salePrice: updated.salePrice, salePriceSource: "api" as const }
              : option;
          }),
        }))));
        const msg = `${result.message || "쿠팡 판매가 동기화를 완료했습니다."} 쿠폰목록 ${imported.length}건에 현재판매가를 반영했습니다.`;
        setCouponMessage(msg);
        setMessage(msg);
        return imported;
      }
      const msg = result.message || "쿠팡 판매가 API에서 반영 가능한 salePrice 값을 받지 못했습니다.";
      setCouponMessage(msg);
      setMessage(msg);
      return [];
    } catch (error) {
      const msg = `쿠팡 판매가 동기화 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
      return [];
    }
  }

  function exportTossOptionIdTemplate() {
    downloadExcelFile(`토스_옵션ID_엑셀양식_${today()}.xls`, [
      {
        name: "토스옵션ID",
        rows: tossOptionIdRows.length
          ? tossOptionIdRowsToSheet(tossOptionIdRows)
          : [
              ["상품ID", "옵션 ID", "옵션 관리 코드", "옵션명", "상품명", "메모"],
              ["", "1596392077", "OPT-BARIGAK-5KG", "활 바지락 5kg", "활 바지락", "토스 상품 API가 실패할 때만 보조 입력"],
              ["", "1596392075", "OPT-BARIGAK-3KG", "활 바지락 3kg", "활 바지락", ""],
              ["", "1596392073", "OPT-BARIGAK-2KG", "활 바지락 2kg", "활 바지락", ""],
            ],
      },
    ]);
  }

  async function handleOrderImport(
    event: React.ChangeEvent<HTMLInputElement>,
    channel: Channel,
  ) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const imported: OrderRow[] = [];
      for (const file of files) {
        const rows = await importRowsFromFile(file);
        imported.push(...parseOrderRows(rows, file.name, channel));
      }
      setOrders((prev) => [...prev, ...imported]);
      setMessage(`${channel} 주문 ${imported.length}건을 가져왔습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }

  function normalizeOrderStatusForApi(channel: Channel, value: string) {
    const raw = text(value);
    const normalized = normalizeHeader(raw);
    if (!normalized) return channel === "쿠팡" ? "ACCEPT" : "PAID";
    if (normalized === "전체" || normalized === "all") return "전체";
    if (
      normalized.includes("상품준비") ||
      normalized.includes("송장대상") ||
      normalized === "instruct" ||
      normalized === "preparingproduct"
    ) {
      return channel === "쿠팡" ? "INSTRUCT" : "PREPARING_PRODUCT";
    }
    if (
      normalized.includes("결제완료") ||
      normalized.includes("발주대상") ||
      normalized === "accept" ||
      normalized === "paid"
    ) {
      return channel === "쿠팡" ? "ACCEPT" : "PAID";
    }
    return raw;
  }

  function orderQueryForChannel(channel: Channel, mode: "current" | "purchase" | "invoice" = "current") {
    const currentStatus = channel === "쿠팡" ? orderApiFilter.coupangStatus : orderApiFilter.tossStatus;
    const status =
      mode === "purchase"
        ? channel === "쿠팡"
          ? "ACCEPT"
          : "PAID"
        : mode === "invoice"
          ? channel === "쿠팡"
            ? "INSTRUCT"
            : "PREPARING_PRODUCT"
          : normalizeOrderStatusForApi(channel, currentStatus);
    const range = mode === "invoice"
      ? dateRangeText(SHIPMENT_PREPARING_LOOKBACK_DAYS)
      : {
          startDate: orderApiFilter.startDate,
          endDate: orderApiFilter.endDate,
        };
    if (channel === "쿠팡") {
      return {
        startDate: range.startDate,
        endDate: range.endDate,
        status,
      };
    }
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      status,
      limit: Math.max(1, Math.min(50, Number(orderApiFilter.limit) || 50)),
    };
  }

  function apiDiagnosticsFromResult(
    result: ApiResult,
    channel: Channel,
  ): ApiDiagnosticRow[] {
    const diagnostics = Array.isArray(result.summary?.diagnostics)
      ? result.summary?.diagnostics
      : [];
    const request = result.summary?.request as
      | { method?: string; baseUrl?: string; path?: string; queryKeys?: string[] }
      | null
      | undefined;
    const baseRows: ApiDiagnosticRow[] = request
      ? [
          {
            channel,
            step: "요청 경로",
            status: "확인",
            detail: `${request.method || "GET"} ${request.baseUrl || ""}${request.path || ""} / query: ${(request.queryKeys || []).join(", ") || "없음"}`,
          },
        ]
      : [];
    const diagnosticRows = diagnostics.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        channel,
        step: text(row.step),
        status: text(row.status),
        detail: text(row.detail),
      } satisfies ApiDiagnosticRow;
    });
    const responseShape = text(result.summary?.responseShape);
    const responseArrayPaths = text(result.summary?.responseArrayPaths);
    const tossBusinessError = text(result.summary?.tossBusinessError);
    const errorKind = text(result.summary?.errorKind);
    if (responseShape) {
      baseRows.push({
        channel,
        step: "응답 구조",
        status: "확인",
        detail: responseShape,
      });
    }
    if (responseArrayPaths) {
      baseRows.push({
        channel,
        step: "배열 위치",
        status: "확인",
        detail: responseArrayPaths,
      });
    }
    if (tossBusinessError) {
      baseRows.push({
        channel,
        step: "토스 내부 오류",
        status: "확인필요",
        detail: tossBusinessError,
      });
    }
    if (errorKind) {
      baseRows.push({
        channel,
        step: "오류 분류",
        status: "확인필요",
        detail: errorKind,
      });
    }
    const errorPreview = result.summary?.errorPreview;
    if (errorPreview) {
      baseRows.push({
        channel,
        step: "응답 상세",
        status: "마스킹",
        detail: text(
          typeof errorPreview === "string"
            ? errorPreview
            : JSON.stringify(errorPreview),
        ),
      });
    }
    return [...baseRows, ...diagnosticRows];
  }

  async function diagnoseApiOrders(channel: Channel, mode: "current" | "purchase" | "invoice" = "current") {
    try {
      const result = await callApi("/api/integrations/orders/diagnose", {
        channel,
        schedules,
        manual: true,
        diagnosticOnly: true,
        query: orderQueryForChannel(channel, mode),
      });
      const rows = apiDiagnosticsFromResult(result, channel);
      setApiDiagnosticRows(rows.length ? rows : [
        { channel, step: "진단", status: result.ok ? "정상" : "확인필요", detail: result.message || "진단 결과가 비어 있습니다." },
      ]);
      setMessage(result.message || `${channel} API 진단을 완료했습니다.`);
    } catch (error) {
      setMessage(`${channel} API 진단 실패: ${String(error)}`);
    }
  }

  function applyOrderDateRange(days: number) {
    const range = dateRangeText(days);
    setOrderApiFilter((prev) => ({
      ...prev,
      ...range,
    }));
    setMessage(`조회기간을 최근 ${days}일(${range.startDate}~${range.endDate})로 설정했습니다.`);
  }

  function applyPaymentStatusPreset() {
    setOrderApiFilter((prev) => ({
      ...prev,
      coupangStatus: "ACCEPT",
      tossStatus: "PAID",
    }));
    setMessage("결제완료 상태값으로 설정했습니다.");
  }

  function applyPreparingStatusPreset() {
    setOrderApiFilter((prev) => ({
      ...prev,
      coupangStatus: "INSTRUCT",
      tossStatus: "PREPARING_PRODUCT",
    }));
    setMessage("상품준비중 상태값으로 설정했습니다.");
  }

  async function collectChannelOrderRows(
    channel: Channel,
    baseOrders: OrderRow[],
    mode: "current" | "purchase" | "invoice" = "purchase",
  ) {
    const result = await callApi("/api/integrations/orders/collect-preview", {
      channel,
      schedules,
      manual: true,
      query: orderQueryForChannel(channel, mode),
    });
    const diagnosticRows = apiDiagnosticsFromResult(result, channel);
    const collected = orderCollectRowsFromPreview(result, channel);
    const tossMasters = channel === "토스"
      ? (tossOptionIdRows.length ? tossOptionIdRows : await fetchTossOptionMastersFromApi(false))
      : [];
    const applied = channel === "토스"
      ? applyTossOptionIdsToOrders(collected, tossMasters)
      : { rows: collected, updated: 0, unresolved: 0 };
    const imported = applied.rows;
    const merged = mergeUniqueOrderRows(baseOrders, imported);
    const nextOrders = imported.length ? merged.rows : baseOrders;
    return {
      channel,
      result,
      diagnosticRows,
      imported,
      addedCount: merged.addedCount,
      skippedCount: merged.skippedCount,
      nextOrders,
      tossOptionUpdated: applied.updated,
    };
  }

  async function exportPurchaseGroupsFromOrders(
    sourceOrders: OrderRow[],
    scope: string,
    options: { ignoreHistory?: boolean; strictLocalFolder?: boolean; forceAllMapped?: boolean; includeChannelInputFiles?: boolean } = {},
  ) {
    const activeHistory = options.ignoreHistory ? [] : purchaseHistory;
    const sourcePurchaseRows = buildPurchaseRows(sourceOrders, mappings);
    const issues = validatePurchasePreflight(sourcePurchaseRows, sourceOrders, activeHistory);
    const blocked = issues.filter((issue) => issue.level === "차단");

    const targetRows = options.forceAllMapped
      ? filterVendorPurchaseRowsForAutoExport(sourcePurchaseRows)
      : blocked.length
        ? []
        : filterNewPurchaseTargetRows(sourcePurchaseRows, sourceOrders, activeHistory);
    const groups = groupBy(targetRows, (row) => row.vendorName);
    const entries = Object.entries(groups).filter(([, rows]) => rows.length > 0);

    const artifacts: FolderZipArtifact[] = [];
    const todayText = today();
    for (const [vendorName, rows] of entries) {
      artifacts.push(
        await makeManagedWorkbookArtifact(`${safeFileName(vendorName)}_발주양식_${todayText}`, [
          {
            name: vendorName,
            rows: purchaseRowsToTemplate(rows, purchaseTemplates),
            showTitle: false,
          },
        ]),
      );
    }

    const checkFilenameBase = `발주_매핑확인_${todayText}_${compactScopeName(scope)}`;
    const checkArtifact = await makeManagedWorkbookArtifact(checkFilenameBase, purchaseVerificationSheets(scope, entries, issues));
    const checkFilename = checkArtifact.filename;
    const channelInput = options.includeChannelInputFiles
      ? await makePurchaseFolderChannelInputArtifacts(sourceOrders, targetRows, scope)
      : { artifacts: [] as FolderZipArtifact[], infos: [] as Array<{ channel: Channel; filename: string; count: number }> };
    artifacts.push(...channelInput.artifacts, checkArtifact);

    if (blocked.length && !entries.length) {
      const detail = blocked
        .slice(0, 5)
        .map((issue) => `${issue.item}(${issue.channel} ${issue.orderNo})`)
        .join(", ");
      try {
        const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
        setLastPurchaseExportRows([
          ["검증표", checkFilename, 0, "전체", 0, `${saved.folderPath} 저장`],
        ]);
        setMappingCheckMessage(
          `${scope}: 발주 차단 ${blocked.length}건. 발주폴더에 ${checkFilename}을 저장했습니다. ${detail}`,
        );
        setFolderMessage(`발주폴더에 검증표 저장 완료: ${saved.folderPath}`);
      } catch (error) {
        setMappingCheckMessage(`${scope}: 발주 차단 ${blocked.length}건. ${detail}`);
        setFolderMessage(`발주폴더 저장 실패: ${String(error)}. START_HERE_WINDOWS.cmd로 실행했는지 확인하세요.`);
      }
      return { exportedRows: 0, vendors: 0, blocked: blocked.length, purchaseRows: [] as PurchaseRow[], channelInputFiles: 0 };
    }

    if (!entries.length) {
      try {
        const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
        setLastPurchaseExportRows([
          ["검증표", checkFilename, 0, "전체", 0, `${saved.folderPath} 저장`],
        ]);
        setMappingCheckMessage(
          `${scope}: 발주파일로 만들 결제완료 주문이 없습니다. 그래도 발주폴더에 ${checkFilename}을 저장했습니다. 수집 결과, 주문상태, 업체 매핑을 확인하세요.`,
        );
        setFolderMessage(`발주폴더에 검증표 저장 완료: ${saved.folderPath}`);
      } catch (error) {
        setMappingCheckMessage(`${scope}: 발주파일로 만들 결제완료 주문이 없습니다.`);
        setFolderMessage(`발주폴더 저장 실패: ${String(error)}. START_HERE_WINDOWS.cmd로 실행했는지 확인하세요.`);
      }
      return { exportedRows: 0, vendors: 0, blocked: 0, purchaseRows: [] as PurchaseRow[], channelInputFiles: 0 };
    }

    const exportedRows = entries.flatMap(([, rows]) => rows);
    const totalQty = exportedRows.reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0);

    try {
      const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
      setPurchaseHistory((prev) => mergePurchaseHistory(prev, makePurchaseHistoryRows(exportedRows)));
      const savedFileByPrefix = new Map(saved.files.map((file) => [file.filename.replace(/\.(xlsx|xls)$/i, ""), file.filename]));
      const savedRows: Array<Array<string | number>> = entries.map(([vendorName, rows]) => {
        const prefix = safeFileName(`${safeFileName(vendorName)}_발주양식_${todayText}`);
        return [
          vendorName,
          savedFileByPrefix.get(prefix) || `${safeFileName(vendorName)}_발주양식_${todayText}.xlsx`,
          rows.length,
          Array.from(new Set(rows.map((row) => row.channel))).join("+"),
          rows.reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0),
          `${saved.folderPath} 저장`,
        ];
      });
      const channelInputSavedRows: Array<Array<string | number>> = channelInput.infos.map((info) => [
        `${info.channel} 상품준비중 입력파일`,
        info.filename,
        info.count,
        info.channel,
        info.count,
        `${saved.folderPath} 저장`,
      ]);
      setLastPurchaseExportRows([
        ...savedRows,
        ...channelInputSavedRows,
        ["검증표", checkFilename, exportedRows.length, "전체", totalQty, `${saved.folderPath} 저장`],
      ]);
      setMappingCheckMessage(
        `${scope}: 업체 ${entries.length}곳, 발주 ${exportedRows.length}건을 발주폴더에 직접 저장했습니다.${channelInput.infos.length ? ` 쿠팡/토스 상품준비중 입력파일 ${channelInput.infos.length}개도 함께 생성했습니다.` : ""} ${blocked.length ? `확인필요 ${blocked.length}건은 발주_매핑확인 파일에 별도 표시했습니다.` : "발주_매핑확인 파일에서 업체별 양식 매핑 결과를 확인하세요."}`,
      );
      setFolderMessage(`발주폴더 저장 완료: ${saved.folderPath} · 파일 ${saved.files.length}개${channelInput.infos.length ? ` · 상품준비중 입력파일 ${channelInput.infos.length}개 포함` : ""}`);
      return { exportedRows: exportedRows.length, vendors: entries.length, blocked: 0, purchaseRows: exportedRows, channelInputFiles: channelInput.infos.length };
    } catch (error) {
      setFolderMessage(`발주폴더 직접 저장 실패: ${String(error)}. START_HERE_WINDOWS.cmd로 실행했는지 확인하세요.`);
      setMappingCheckMessage(`${scope}: 발주폴더 직접 저장 실패. ${String(error)}`);
      throw error;
    }
  }


  function purchaseRowsToAcknowledgementOrders(sourceOrders: OrderRow[], exportedPurchaseRows: PurchaseRow[] = []) {
    if (!exportedPurchaseRows.length) return [];
    const keys = new Set(
      exportedPurchaseRows.map((row) => [row.channel, normalizeOrderKey(row.orderNo), cleanId(row.optionId)].join("|")),
    );
    return sourceOrders.filter((order) => keys.has([order.channel, normalizeOrderKey(order.orderNo), cleanId(order.optionId)].join("|")));
  }

  function markOrdersAsPreparing(current: OrderRow[], ackRows: OrderRow[]) {
    const keys = new Set(ackRows.map((row) => orderRowUniqueKey(row)));
    return current.map((row) => {
      if (!keys.has(orderRowUniqueKey(row))) return row;
      return {
        ...row,
        orderStatus: row.channel === "쿠팡" ? "INSTRUCT" : "PREPARING_PRODUCT",
      };
    });
  }

  async function acknowledgeOrdersAfterPurchaseExport(sourceOrders: OrderRow[], exportedPurchaseRows: PurchaseRow[] = []) {
    const ackRows = purchaseRowsToAcknowledgementOrders(sourceOrders, exportedPurchaseRows);
    if (!ackRows.length) return { attempted: false, message: "상품준비중 변경 대상이 없습니다." };
    const result = await callApi("/api/integrations/orders/acknowledge-execute", {
      rows: ackRows,
      manual: true,
    });
    const rows = apiDiagnosticsFromResult(result, "전체");
    if (rows.length) setApiDiagnosticRows((prev) => [...prev, ...rows]);
    if (result.ok && result.externalApiExecuted) {
      setOrders((prev) => markOrdersAsPreparing(prev, ackRows));
    }
    return {
      attempted: true,
      ok: Boolean(result.ok),
      executed: Boolean(result.externalApiExecuted),
      message: result.message || "상품준비중 변경 결과가 비어 있습니다.",
    };
  }

  function purchaseFolderInputPreviewRows(sourceOrders: OrderRow[], exportedPurchaseRows: PurchaseRow[] = []) {
    const targetOrders = purchaseRowsToAcknowledgementOrders(sourceOrders, exportedPurchaseRows);
    return matchInvoices(targetOrders, exportedPurchaseRows, []).map((row) => ({
      ...row,
      courier: "",
      trackingNo: "",
      orderStatus: row.channel === "쿠팡" ? "INSTRUCT" : "PREPARING_PRODUCT",
      matchMethod: "발주폴더 상품준비중 입력파일 생성",
      status: "확인필요" as InvoiceStatus,
      sourceFile: "쿠팡+토스 수합",
    }));
  }

  async function makePurchaseFolderChannelInputArtifacts(
    sourceOrders: OrderRow[],
    exportedPurchaseRows: PurchaseRow[] = [],
    scope = "쿠팡+토스 수집",
  ) {
    const previewRows = purchaseFolderInputPreviewRows(sourceOrders, exportedPurchaseRows);
    const artifacts: FolderZipArtifact[] = [];
    const infos: Array<{ channel: Channel; filename: string; count: number }> = [];
    const ymd = todayCompact();
    const coupangRows = previewRows.filter((row) => row.channel === "쿠팡");
    const tossRows = previewRows.filter((row) => row.channel === "토스");
    if (coupangRows.length) {
      const filename = `${ymd}쿠팡_발주.xlsx`;
      artifacts.push({
        filename,
        blob: await createXlsxBlob([
          {
            name: "Delivery",
            rows: coupangShipmentRows(
              coupangRows,
              sourceOrders,
              getShipmentTemplate("쿠팡", shipmentTemplates),
            ),
          },
        ]),
      });
      infos.push({ channel: "쿠팡", filename, count: coupangRows.length });
    }
    if (tossRows.length) {
      const filename = `주문배송관리-상품준비중${today()}.xlsx`;
      artifacts.push({
        filename,
        blob: await createXlsxBlob([
          {
            name: "주문내역",
            rows: tossShipmentRows(
              tossRows,
              sourceOrders,
              getShipmentTemplate("토스", shipmentTemplates),
              { tossOrderStatus: "상품준비중" },
            ),
          },
        ]),
      });
      infos.push({ channel: "토스", filename, count: tossRows.length });
    }
    return { artifacts, infos, scope };
  }


  function purchaseExportMessage(
    result: { exportedRows: number; vendors: number; blocked: number; purchaseRows?: PurchaseRow[]; channelInputFiles?: number },
    importedCount: number,
  ) {
    if (result.exportedRows > 0) {
      return `업체 ${result.vendors}곳 발주양식 ${result.exportedRows}건을 발주폴더에 저장했습니다.${result.channelInputFiles ? ` 쿠팡/토스 상품준비중 입력파일 ${result.channelInputFiles}개도 함께 생성했습니다.` : ""}`;
    }
    if (result.blocked > 0) {
      return `수집은 정상이나 미매핑/업체명/업체상품명/수량 확인필요 ${result.blocked}건 때문에 업체별 발주파일은 생성하지 않았습니다. 발주폴더의 발주_매핑확인 파일과 매핑관리의 옵션ID를 확인하세요.`;
    }
    if (importedCount > 0) {
      return "수집은 정상이나 현재 조건에서 업체별 발주 대상이 없습니다. 주문상태와 옵션ID 매핑을 확인하세요.";
    }
    return "API 응답 주문이 0건입니다. 판매자센터의 주문상태, 조회기간, 계정 권한을 확인하세요.";
  }

  async function collectApiOrders(channel: Channel, mode: "current" | "purchase" | "invoice" = "current") {
    try {
      const collected = await collectChannelOrderRows(channel, orders, mode);
      if (collected.diagnosticRows.length) setApiDiagnosticRows(collected.diagnosticRows);
      if (collected.imported.length) setOrders(collected.nextOrders);
      setOrderCollectSummaryRows(
        buildOrderCollectionSummaryRows(collected.nextOrders, mappings, {
          channel,
          received: collected.imported.length,
          added: collected.addedCount,
          skipped: collected.skippedCount,
          message: channel === "토스" && collected.tossOptionUpdated
            ? `${collected.result.message || ""} 토스 옵션ID ${collected.tossOptionUpdated}건을 상품 API 기준으로 보정했습니다.`
            : collected.result.message,
        }),
      );
      const summary = summarizeMappingCheck(collected.nextOrders, mappings, "주문수집");
      setMappingCheckSummary(summary);
      const exportSourceOrders = collected.imported.length ? collected.imported : collected.nextOrders;
      const autoExport = mode !== "invoice"
        ? await exportPurchaseGroupsFromOrders(exportSourceOrders, `${channel} 수집 후 업체별 발주양식`, {
            ignoreHistory: true,
            strictLocalFolder: true,
            forceAllMapped: true,
            includeChannelInputFiles: true,
          })
        : { exportedRows: 0, vendors: 0, blocked: 0 };
      const ackResult = mode !== "invoice" && autoExport.exportedRows > 0
        ? await acknowledgeOrdersAfterPurchaseExport(exportSourceOrders, autoExport.purchaseRows || [])
        : { attempted: false, message: "" };
      const memoCount = collected.imported.filter((row) => text(row.memo)).length;
      setMessage(
        `${channel} 수집 완료: 응답 ${collected.imported.length}건, 추가 ${collected.addedCount}건, 중복 제외 ${collected.skippedCount}건, 배송메시지 ${memoCount}건 반영. ` +
          purchaseExportMessage(autoExport, collected.imported.length) +
          (ackResult.attempted ? ` ${ackResult.message}` : ""),
      );
    } catch (error) {
      setMessage(`${channel} 주문 수집 및 발주양식 자동 생성 실패: ${String(error)}`);
    }
  }

  async function collectBothApiOrders() {
    try {
      let baseOrders = orders;
      const coupang = await collectChannelOrderRows("쿠팡", baseOrders, "current");
      baseOrders = coupang.nextOrders;
      const toss = await collectChannelOrderRows("토스", baseOrders, "current");
      const nextOrders = toss.nextOrders;
      setApiDiagnosticRows([...coupang.diagnosticRows, ...toss.diagnosticRows]);
      if (coupang.imported.length || toss.imported.length) setOrders(nextOrders);
      const totalImported = coupang.imported.length + toss.imported.length;
      const totalAdded = coupang.addedCount + toss.addedCount;
      const totalSkipped = coupang.skippedCount + toss.skippedCount;
      setOrderCollectSummaryRows(
        buildOrderCollectionSummaryRows(nextOrders, mappings, {
          channel: "전체",
          received: totalImported,
          added: totalAdded,
          skipped: totalSkipped,
          message: `쿠팡+토스 수집 완료. 쿠팡 ${coupang.imported.length}건, 토스 ${toss.imported.length}건`,
        }),
      );
      const summary = summarizeMappingCheck(nextOrders, mappings, "쿠팡+토스 수집");
      setMappingCheckSummary(summary);
      const exportSourceOrders = [...coupang.imported, ...toss.imported];
      const autoExport = await exportPurchaseGroupsFromOrders(
        exportSourceOrders.length ? exportSourceOrders : nextOrders,
        "쿠팡+토스 수집 후 업체별 발주양식",
        { ignoreHistory: true, strictLocalFolder: true, forceAllMapped: true, includeChannelInputFiles: true },
      );
      const ackResult = autoExport.exportedRows > 0
        ? await acknowledgeOrdersAfterPurchaseExport(exportSourceOrders.length ? exportSourceOrders : nextOrders, autoExport.purchaseRows || [])
        : { attempted: false, message: "" };
      const memoCount = [...coupang.imported, ...toss.imported].filter((row) => text(row.memo)).length;
      setMessage(
        `쿠팡+토스 수집 완료: 응답 ${totalImported}건, 추가 ${totalAdded}건, 중복 제외 ${totalSkipped}건, 배송메시지 ${memoCount}건 반영. ` +
          purchaseExportMessage(autoExport, totalImported) +
          (ackResult.attempted ? ` ${ackResult.message}` : ""),
      );
    } catch (error) {
      setMessage(`쿠팡+토스 주문 수집 및 발주양식 자동 생성 실패: ${String(error)}`);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoCollect = params.get("autocollect");
    if (!autoCollect) return;
    const channel = autoCollect === "coupang" ? "쿠팡" : autoCollect === "toss" ? "토스" : autoCollect === "both" ? "전체" : "";
    if (!channel) return;
    const runKey = `b2b-auto-collect-${autoCollect}-${today()}`;
    if (window.sessionStorage.getItem(runKey)) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(runKey, "1");
      setActiveMenu("발주관리");
      setMessage(`${channel} 수동수집을 시작합니다. PC는 폴더 저장/열기, 모바일은 파일목록/다운로드로 운영합니다.`);
      if (autoCollect === "coupang") void collectApiOrders("쿠팡");
      else if (autoCollect === "toss") void collectApiOrders("토스");
      else void collectBothApiOrders();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mappings.length, purchaseTemplates.length, channelPurchaseTemplates.length]);

  function updateMapping(id: string, patch: Partial<MappingRow>) {
    setMappings((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        return {
          ...next,
          channel: parseChannel(next.channel),
          optionId: cleanId(next.optionId),
          cost: toNumber(next.cost, 0),
          baseQty: Math.max(1, toNumber(next.baseQty, 1)),
        };
      }),
    );
  }

  function addMappingRow() {
    setMappings((rows) => [makeMapping("쿠팡", "", "", "", "", 0, 1), ...rows]);
  }

  function addMissingMappingsFromCurrentOrders() {
    const targets = uniqueMissingMappingTargets(purchaseRows);
    if (!targets.length) {
      const summary = summarizeMappingCheck(orders, mappings, "현재 화면");
      setMappingCheckSummary(summary);
      setMappingCheckMessage("현재 주문 기준 미매핑 주문이 없습니다.");
      setMessage("미매핑 주문이 없습니다. 발주관리에서 발주 파일을 확인하세요.");
      setActiveMenu("발주관리");
      return;
    }
    setMappings((prev) => {
      const lookup = buildMappingMap(prev);
      const additions = targets
        .filter((target) => !lookup.exact.has(mappingKey(target.channel, target.optionId)))
        .map((target) =>
          makeMapping(
            target.channel,
            target.optionId,
            "",
            "",
            "",
            0,
            1,
          ),
        );
      if (!additions.length) return prev;
      return [...additions, ...prev];
    });
    const messageText = `미매핑 매핑기준 ${targets.length}개를 매핑관리 맨 위에 자동추가했습니다. 노란 안내표의 채널+매핑기준와 같은 행입니다. 업체명, 업체상품명, 원가, 기본수량을 입력한 뒤 재검사를 누르세요.`;
    setSettingsMessage(messageText);
    setMappingCheckMessage(messageText);
    setMessage(messageText);
    setActiveMenu("매핑관리");
  }

  function recheckCurrentMappings() {
    const summary = summarizeMappingCheck(orders, mappings, "현재 화면");
    setMappingCheckSummary(summary);
    const messageText = `현재 주문 ${summary.totalOrders}건 기준 재검사 완료: 매칭완료 ${summary.matched}건, 미매핑 ${summary.unmatched}건, 발주업체 ${summary.vendors}곳입니다.`;
    setMappingCheckMessage(messageText);
    setOrderCollectSummaryRows(buildOrderCollectionSummaryRows(orders, mappings));
    setMessage(messageText);
    setActiveMenu(summary.unmatched > 0 ? "매핑관리" : "발주관리");
  }

  function removeMappingRow(id: string) {
    setMappings((rows) => rows.filter((row) => row.id !== id));
  }

  function updatePurchaseTemplate(
    id: string,
    patch: Partial<PurchaseTemplateSetting>,
  ) {
    setPurchaseTemplates((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              columns: { ...row.columns, ...(patch.columns || {}) },
            }
          : row,
      ),
    );
  }

  function updateInvoiceTemplate(
    id: string,
    patch: Partial<InvoiceTemplateSetting>,
  ) {
    setInvoiceTemplates((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              columns: { ...row.columns, ...(patch.columns || {}) },
            }
          : row,
      ),
    );
  }

  function addPurchaseTemplate() {
    setPurchaseTemplates((rows) => [
      purchaseTemplate(
        "새업체",
        [
          [
            "채널",
            "주문번호",
            "옵션ID",
            "코드번호",
            "업체상품명",
            "구매수량",
            "수취인",
            "전화번호",
            "우편번호",
            "주소",
            "배송메시지",
          ],
        ],
        {
          channel: "A",
          orderNo: "B",
          optionId: "C",
          vendorCode: "D",
          vendorProductName: "E",
          purchaseQty: "F",
          receiverName: "G",
          receiverPhone: "H",
          zip: "I",
          address: "J",
          memo: "K",
        },
      ),
      ...rows,
    ]);
  }

  function addInvoiceTemplate() {
    setInvoiceTemplates((rows) => [
      invoiceTemplate("새업체", {
        orderNo: "A",
        receiverName: "B",
        address: "C",
        productName: "D",
        courier: "E",
        trackingNo: "F",
      }),
      ...rows,
    ]);
  }

  async function handlePurchaseTemplateImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const rows = await importRowsFromFile(file);
      const template = inferPurchaseTemplateFromRows(rows, file.name);
      setPurchaseTemplates((prev) => [template, ...prev]);
      const missing = Object.entries(template.columns)
        .filter(([, value]) => !text(value))
        .map(([key]) => key);
      const messageText = `${file.name} 발주 양식을 자동 분석했습니다. 업체명과 열 문자를 화면에서 확인·수정한 뒤 저장하세요.${missing.length ? ` 미매칭 열: ${missing.slice(0, 6).join(", ")}` : ""}`;
      setSettingsMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      const messageText = `업체 발주 양식 자동 분석 실패: ${String(error)}`;
      setSettingsMessage(messageText);
      setMessage(messageText);
    }
  }

  async function handleInvoiceTemplateImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const rows = await importRowsFromFile(file);
      const template = inferInvoiceTemplateFromRows(rows, file.name);
      setInvoiceTemplates((prev) => [template, ...prev]);
      const missing = Object.entries(template.columns)
        .filter(([, value]) => !text(value))
        .map(([key]) => key);
      const messageText = `${file.name} 송장 회수 양식을 자동 분석했습니다. 택배사와 운송장번호 열을 화면에서 확인·수정한 뒤 저장하세요.${missing.length ? ` 미매칭 열: ${missing.slice(0, 6).join(", ")}` : ""}`;
      setSettingsMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      const messageText = `업체 송장 양식 자동 분석 실패: ${String(error)}`;
      setSettingsMessage(messageText);
      setMessage(messageText);
    }
  }

  function updateShipmentTemplate(
    id: string,
    patch: Partial<ChannelShipmentTemplateSetting>,
  ) {
    setShipmentTemplates((rows) =>
      normalizeShipmentTemplates(
        rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      ),
    );
  }

  function updateChannelPurchaseTemplate(
    id: string,
    patch: Partial<ChannelPurchaseTemplateSetting>,
  ) {
    setChannelPurchaseTemplates((rows) =>
      normalizeChannelPurchaseTemplates(
        rows.map((row) =>
          row.id === id
            ? {
                ...row,
                ...patch,
                columns: { ...row.columns, ...(patch.columns || {}) },
              }
            : row,
        ),
      ),
    );
  }

  function resetChannelPurchaseTemplate(channel: Channel) {
    const fallback = DEFAULT_CHANNEL_PURCHASE_TEMPLATES.find(
      (tpl) => tpl.channel === channel,
    );
    if (!fallback) return;
    setChannelPurchaseTemplates((rows) =>
      normalizeChannelPurchaseTemplates(
        rows.map((row) =>
          row.channel === channel ? { ...fallback, id: row.id } : row,
        ),
      ),
    );
  }

  async function blobToBase64(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
  }

  async function callLocalFolderHelper<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${localFolderHelperOrigin()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & { message?: string };
    if (!response.ok) {
      throw new Error(data.message || `로컬 폴더 도우미 호출 실패: ${response.status}`);
    }
    return data;
  }

  function base64ToFile(base64: string, filename: string) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const lower = filename.toLowerCase();
    const type = lower.endsWith(".csv")
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new File([bytes], filename, { type });
  }

  function base64ToBlob(base64: string, filename: string) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const lower = filename.toLowerCase();
    const type = lower.endsWith(".zip")
      ? "application/zip"
      : lower.endsWith(".csv")
        ? "text/csv"
        : lower.endsWith(".xls")
          ? "application/vnd.ms-excel"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Blob([bytes], { type });
  }


  function zipU16(value: number) {
    const bytes = new Uint8Array(2);
    bytes[0] = value & 0xff;
    bytes[1] = (value >>> 8) & 0xff;
    return bytes;
  }

  function zipU32(value: number) {
    const bytes = new Uint8Array(4);
    bytes[0] = value & 0xff;
    bytes[1] = (value >>> 8) & 0xff;
    bytes[2] = (value >>> 16) & 0xff;
    bytes[3] = (value >>> 24) & 0xff;
    return bytes;
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
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
  }

  function concatUint8(parts: Uint8Array[]) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  async function createZipBlobFromArtifacts(artifacts: FolderZipArtifact[]) {
    const encoder = new TextEncoder();
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;
    const now = new Date();
    const { dosTime, dosDate } = zipDateTime(now);

    for (const artifact of artifacts) {
      const filename = safeFileName(artifact.filename || `B2B_${today()}.xlsx`);
      const nameBytes = encoder.encode(filename);
      const dataBytes = new Uint8Array(await artifact.blob.arrayBuffer());
      const crc = zipCrc32(dataBytes);
      const localHeader = concatUint8([
        zipU32(0x04034b50), zipU16(20), zipU16(0x0800), zipU16(0), zipU16(dosTime), zipU16(dosDate),
        zipU32(crc), zipU32(dataBytes.length), zipU32(dataBytes.length), zipU16(nameBytes.length), zipU16(0), nameBytes,
      ]);
      localParts.push(localHeader, dataBytes);
      const centralHeader = concatUint8([
        zipU32(0x02014b50), zipU16(20), zipU16(20), zipU16(0x0800), zipU16(0), zipU16(dosTime), zipU16(dosDate),
        zipU32(crc), zipU32(dataBytes.length), zipU32(dataBytes.length), zipU16(nameBytes.length), zipU16(0), zipU16(0),
        zipU16(0), zipU16(0), zipU32(0), zipU32(offset), nameBytes,
      ]);
      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = concatUint8([
      zipU32(0x06054b50), zipU16(0), zipU16(0), zipU16(artifacts.length), zipU16(artifacts.length),
      zipU32(centralSize), zipU32(offset), zipU16(0),
    ]);
    const zipBytes = concatUint8([...localParts, ...centralParts, end]);
    return new Blob([zipBytes], { type: "application/zip" });
  }

  function formatBytes(value: number) {
    const size = Number(value) || 0;
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
    if (size >= 1024) return `${Math.round(size / 1024)}KB`;
    return `${size}B`;
  }

  function formatDateTimeShort(value: string) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function isLikelyMobileDevice() {
    if (typeof window === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) || window.matchMedia("(max-width: 760px)").matches;
  }

  async function refreshManagedFiles(kind: BrowserFolderKind, silent = false) {
    try {
      const data = await callLocalFolderHelper<{
        ok: boolean;
        folderPath: string;
        folderName: string;
        files: LocalManagedFile[];
      }>("/api/local/list-files", {
        kind,
        folderPath: text(localFolderPaths[kind]),
        extensions: [".xlsx", ".xls", ".csv"],
        maxFiles: 30,
        maxBytes: 25 * 1024 * 1024,
        includeBase64: false,
      });
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      setRecentLocalFiles((prev) => ({ ...prev, [kind]: data.files || [] }));
      if (!silent) {
        setFolderMessage(`${folderLabel(kind)} 최근 파일 ${data.files?.length || 0}개를 불러왔습니다. 모바일에서는 아래 다운로드 버튼을 사용하세요.`);
      }
      return data.files || [];
    } catch (error) {
      if (!silent) {
        setFolderMessage(`${folderLabel(kind)} 파일목록 불러오기 실패: ${String(error)}. 모바일은 PC와 같은 와이파이에 있고 Windows 방화벽이 8791 포트를 허용해야 합니다.`);
      }
      return [];
    }
  }

  async function downloadManagedFile(kind: BrowserFolderKind, filename: string) {
    try {
      const data = await callLocalFolderHelper<{
        ok: boolean;
        folderPath: string;
        folderName: string;
        filename: string;
        size: number;
        modifiedAt: string;
        base64: string;
      }>("/api/local/read-file", {
        kind,
        folderPath: text(localFolderPaths[kind]),
        filename,
        extensions: [".xlsx", ".xls", ".csv"],
        maxBytes: 25 * 1024 * 1024,
      });
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      setRecentLocalFiles((prev) => ({
        ...prev,
        [kind]: (prev[kind] || []).map((item) =>
          item.filename === data.filename
            ? { ...item, size: data.size, modifiedAt: data.modifiedAt }
            : item,
        ),
      }));
      saveBlobWithDownload(data.filename, base64ToBlob(data.base64, data.filename));
      setFolderMessage(`${folderLabel(kind)} 파일 다운로드: ${data.filename}`);
    } catch (error) {
      setFolderMessage(`${folderLabel(kind)} 파일 다운로드 실패: ${String(error)}`);
    }
  }

  async function downloadManagedZip(kind: BrowserFolderKind) {
    try {
      const data = await callLocalFolderHelper<{
        ok: boolean;
        folderPath: string;
        folderName: string;
        filename: string;
        count: number;
        size: number;
        base64: string;
      }>("/api/local/download-zip", {
        kind,
        folderPath: text(localFolderPaths[kind]),
        extensions: [".xlsx", ".xls", ".csv"],
        maxFiles: 80,
        maxBytes: 25 * 1024 * 1024,
        filename: `B2B_${folderShortName(kind)}파일_${today()}.zip`,
      });
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      saveBlobWithDownload(data.filename, base64ToBlob(data.base64, data.filename));
      setFolderMessage(`${folderLabel(kind)} ${data.count}개 파일을 ZIP으로 다운로드했습니다.`);
    } catch (error) {
      setFolderMessage(`${folderLabel(kind)} ZIP 다운로드 실패: ${String(error)}. 이 버튼은 PC 로컬폴더에 이미 저장된 파일을 묶는 기능입니다. 클라우드/모바일에서는 발주관리의 전체 발주 버튼을 누르면 즉시 ZIP 다운로드로 전환됩니다.`);
    }
  }

  function parseInvoiceRowsFromFolderFile(fileName: string, rows: string[][]) {
    const inferredVendor = inferInvoiceVendorNameFromFile(
      fileName,
      invoiceTemplates,
      mappings,
    );
    const invoiceTemplate = inferredVendor
      ? getInvoiceTemplateForVendor(inferredVendor, invoiceTemplates)
      : getInvoiceTemplateForVendor("공통", invoiceTemplates);
    const configuredRows = inferredVendor
      ? parseInvoiceRowsByTemplate(rows, fileName, invoiceTemplate)
      : [];
    const autoRows = parseInvoiceRowsAuto(rows, fileName, inferredVendor);
    const purchaseTemplate = getPurchaseTemplateForInvoiceVendor(
      inferredVendor,
      purchaseTemplates,
    );
    const learnedVendorRows = purchaseTemplate
      ? parseInvoiceRowsByPurchaseTemplate(rows, fileName, purchaseTemplate)
      : [];
    const selected = chooseParsedInvoiceRows(
      configuredRows,
      learnedVendorRows,
      autoRows,
    );
    return selected.map((row) => ({
      ...row,
      vendorName: row.vendorName || inferredVendor,
    }));
  }

  async function readInvoiceRecordsFromLocalFolder() {
    const data = await callLocalFolderHelper<{
      ok: boolean;
      folderPath: string;
      folderName: string;
      files: Array<{ filename: string; base64: string; size: number; modifiedAt: string }>;
    }>("/api/local/list-files", {
      kind: "purchase",
      folderPath: text(localFolderPaths.purchase),
      extensions: [".xlsx", ".xls", ".csv"],
      maxFiles: 120,
      maxBytes: 25 * 1024 * 1024,
      includeBase64: true,
    });
    setLocalFolderPaths((prev) => ({ ...prev, purchase: data.folderPath }));
    setFolderNames((prev) => ({ ...prev, purchase: data.folderPath }));
    const sourceFiles = data.files.filter((file) => shouldUseInvoiceFolderFile(file.filename));
    const parsed: InvoiceRecord[] = [];
    const skipped: string[] = [];
    for (const item of sourceFiles) {
      try {
        const file = base64ToFile(item.base64, item.filename);
        const rows = await importRowsFromFile(file);
        parsed.push(...parseInvoiceRowsFromFolderFile(item.filename, rows));
      } catch (error) {
        skipped.push(`${item.filename}: ${String(error)}`);
      }
    }
    if (!parsed.length) {
      const detail = sourceFiles.length
        ? `읽은 파일 ${sourceFiles.length}개에서 운송장번호/택배사/주문정보를 찾지 못했습니다.`
        : `발주폴더(${data.folderPath})에서 읽을 B2B 업체 송장엑셀을 찾지 못했습니다.`;
      throw new Error(`${detail} 쿠팡_운송장입력, 토스_운송장입력, 송장등록_확인표 파일은 자동 제외됩니다.`);
    }
    if (skipped.length) {
      setShipmentPreviewMessage(`발주폴더 ${sourceFiles.length}개 파일 중 ${parsed.length}행을 읽었습니다. 일부 파일 확인 필요: ${skipped.slice(0, 3).join(" / ")}`);
    }
    return mergeInvoiceRecords(parsed);
  }


  async function readShipmentFolderDataFromLocalFolder() {
    const data = await callLocalFolderHelper<{
      ok: boolean;
      folderPath: string;
      folderName: string;
      files: Array<{ filename: string; base64: string; size: number; modifiedAt: string }>;
    }>("/api/local/list-files", {
      kind: "purchase",
      folderPath: text(localFolderPaths.purchase),
      extensions: [".xlsx", ".xls", ".csv"],
      maxFiles: 150,
      maxBytes: 35 * 1024 * 1024,
      includeBase64: true,
    });
    setLocalFolderPaths((prev) => ({ ...prev, purchase: data.folderPath }));
    setFolderNames((prev) => ({ ...prev, purchase: data.folderPath }));

    const invoiceRecords: InvoiceRecord[] = [];
    const shipmentInputFiles: ShipmentInputFile[] = [];
    const skipped: string[] = [];
    const candidateFiles = data.files.filter((file) => {
      const normalized = normalizeHeader(file.filename);
      return normalized && !normalized.startsWith("~$") && /\.(xlsx|xls|csv)$/i.test(file.filename);
    });

    for (const item of candidateFiles) {
      try {
        const file = base64ToFile(item.base64, item.filename);
        const rows = await importRowsFromFile(file);
        const shipmentInput = parseShipmentInputFile(item.filename, rows);
        if (shipmentInput) {
          shipmentInputFiles.push(shipmentInput);
          continue;
        }
        if (shouldUseInvoiceFolderFile(item.filename)) {
          invoiceRecords.push(...parseInvoiceRowsFromFolderFile(item.filename, rows));
        }
      } catch (error) {
        skipped.push(`${item.filename}: ${String(error)}`);
      }
    }

    return {
      folderPath: data.folderPath,
      folderName: data.folderName,
      invoiceRecords: mergeInvoiceRecords(invoiceRecords),
      shipmentInputFiles,
      sourceFiles: candidateFiles.length,
      skipped,
    };
  }

  async function exportFilledShipmentInputFiles(
    files: ShipmentInputFile[],
    previewRows: InvoicePreviewRow[],
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ) {
    const saved: Array<{ channel: Channel; filename: string; count: number }> = [];
    for (const file of files) {
      const readyCount = previewRows.filter((row) => row.channel === file.channel && row.status === "등록준비" && row.sourceFile).length;
      const fileReadyCount = file.dataRows.filter((inputRow) =>
        previewRows.some((row) => row.channel === file.channel && row.orderNo === inputRow.orderNo && row.status === "등록준비"),
      ).length;
      if (!fileReadyCount) continue;
      const filename = shipmentAutoFilledFilename(file.sourceFile, file.channel);
      const blob = await createXlsxBlob([
        {
          name: file.sheetName,
          rows: filledShipmentInputFileRows(file, previewRows),
        },
      ]);
      await saveBlobManaged("purchase", filename, blob, handleOverride);
      saved.push({ channel: file.channel, filename, count: fileReadyCount || readyCount });
    }
    return saved;
  }

  async function collectPreparingOrdersForShipmentUpload() {
    let baseOrders = orders;
    try {
      const coupang = await collectChannelOrderRows("쿠팡", baseOrders, "invoice");
      baseOrders = coupang.nextOrders;
      const toss = await collectChannelOrderRows("토스", baseOrders, "invoice");
      const nextOrders = toss.nextOrders;
      setApiDiagnosticRows([...coupang.diagnosticRows, ...toss.diagnosticRows]);
      if (coupang.imported.length || toss.imported.length) setOrders(nextOrders);
      const imported = [...coupang.imported, ...toss.imported];
      const preparingSource = imported.length
        ? imported
        : nextOrders.filter((order) => isPreparingStatus(order.channel, order.orderStatus));
      const ordersForMatch = filterPreparingShipmentMissingOrders(preparingSource);
      return {
        ordersForMatch,
        preparingOrders: preparingSource,
        allOrders: nextOrders,
        importedCount: imported.length,
        addedCount: coupang.addedCount + toss.addedCount,
        skippedCount: coupang.skippedCount + toss.skippedCount,
        preparingCount: preparingSource.length,
        alreadyShippedCount: preparingSource.length - ordersForMatch.length,
      };
    } catch (error) {
      const fallback = orders.filter((order) => isPreparingStatus(order.channel, order.orderStatus));
      const ordersForMatch = filterPreparingShipmentMissingOrders(fallback);
      if (fallback.length) {
        setShipmentPreviewMessage(`상품준비중 주문 API 재수집 실패로 현재 화면의 상품준비중 ${fallback.length}건을 기준으로 발주폴더 파일을 생성합니다: ${String(error)}`);
        return {
          ordersForMatch,
          preparingOrders: fallback,
          allOrders: orders,
          importedCount: 0,
          addedCount: 0,
          skippedCount: 0,
          preparingCount: fallback.length,
          alreadyShippedCount: fallback.length - ordersForMatch.length,
        };
      }
      throw error;
    }
  }

  async function saveArtifactsStrictlyToLocalFolder(
    kind: BrowserFolderKind,
    artifacts: FolderZipArtifact[],
  ): Promise<{ folderPath: string; folderName: string; files: Array<{ filename: string; filePath: string }>; opened: boolean }> {
    if (!artifacts.length) throw new Error("저장할 파일이 없습니다.");
    const files = await Promise.all(
      artifacts.map(async (artifact) => ({
        filename: safeFileName(artifact.filename),
        base64: await blobToBase64(artifact.blob),
      })),
    );

    try {
      const data = await callLocalFolderHelper<{
        ok: boolean;
        folderPath: string;
        folderName: string;
        files: Array<{ filename: string; filePath: string }>;
        opened: boolean;
      }>("/api/local/save-many", {
        kind,
        folderPath: text(localFolderPaths[kind]),
        files,
        openFolder: !isLikelyMobileDevice(),
      });
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      // save-many 내부에서만 폴더를 한 번 열도록 합니다.
      // 별도 2차 open-folder 호출은 탐색기가 여러 번 뜨는 원인이므로 제거했습니다.
      setRecentLocalFiles((prev) => ({
        ...prev,
        [kind]: data.files.map((file) => ({ filename: file.filename, size: 0, modifiedAt: new Date().toISOString() })),
      }));
      await refreshManagedFiles(kind, true);
      setFolderMessage(isLikelyMobileDevice()
        ? `${folderLabel(kind)} PC 로컬폴더에 ${data.files.length}개 파일 저장 완료. 모바일에서는 파일목록/다운로드를 사용하세요.`
        : `${folderLabel(kind)} PC 로컬폴더에 ${data.files.length}개 파일 저장 완료: ${data.folderPath}`);
      return data;
    } catch (error) {
      const zipFilename = `B2B_${folderShortName(kind)}파일_${today()}.zip`;
      const zipBlob = await createZipBlobFromArtifacts(artifacts);
      saveBlobWithDownload(zipFilename, zipBlob);
      const fallbackFiles = artifacts.map((artifact) => ({
        filename: safeFileName(artifact.filename),
        filePath: `browser-download://${safeFileName(artifact.filename)}`,
      }));
      setFolderNames((prev) => ({ ...prev, [kind]: "브라우저 다운로드" }));
      setRecentLocalFiles((prev) => ({
        ...prev,
        [kind]: artifacts.map((artifact) => ({
          filename: safeFileName(artifact.filename),
          size: artifact.blob.size,
          modifiedAt: new Date().toISOString(),
        })),
      }));
      setFolderMessage(
        `${folderLabel(kind)} PC 자동저장이 불가하여 ${artifacts.length}개 파일을 ${zipFilename}으로 브라우저 다운로드했습니다. 원인: ${String(error)}`,
      );
      return {
        folderPath: "브라우저 다운로드",
        folderName: "브라우저 다운로드",
        files: fallbackFiles,
        opened: false,
      };
    }
  }

  async function handleVendorShipmentFilesToPurchase(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
      .filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name) && !file.name.startsWith("~$"));
    event.currentTarget.value = "";
    if (!files.length) {
      setFolderMessage("발주폴더에 복사할 업체 송장엑셀을 선택하지 않았습니다.");
      return;
    }
    try {
      setShipmentPreviewMessage(`업체 송장엑셀 ${files.length}개를 발주폴더에 복사 중입니다...`);
      const saved = await saveArtifactsStrictlyToLocalFolder(
        "purchase",
        files.map((file) => ({ filename: file.name, blob: file })),
      );
      const fileNames = saved.files.map((file) => file.filename).join(" / ");
      const messageText = `업체 송장엑셀 ${saved.files.length}개를 발주폴더에 복사했습니다. 이제 쿠팡+토스 업로드를 누르면 발주폴더의 쿠팡/토스 입력파일과 자동 매칭합니다.`;
      setFolderMessage(`${messageText} 저장위치: ${saved.folderPath}`);
      setShipmentPreviewMessage(`${messageText} 파일: ${fileNames}`);
      setMessage(messageText);
    } catch (error) {
      const messageText = `업체 송장엑셀 발주폴더 복사 실패: ${String(error)}. START_HERE_WINDOWS.cmd로 실행 중인지, 발주폴더 경로가 올바른지 확인하세요.`;
      setFolderMessage(messageText);
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
    }
  }

  async function saveLocalFolderPath(kind: BrowserFolderKind) {
    const rawPath = text(localFolderPaths[kind]);
    try {
      const data = await callLocalFolderHelper<{ ok: boolean; folderPath: string; folderName: string }>(
        "/api/local/ensure-folder",
        { kind, folderPath: rawPath },
      );
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderMessage(`${folderLabel(kind)}를 PC 로컬폴더로 설정했습니다: ${data.folderPath}`);
    } catch (error) {
      setFolderMessage(
        `PC 로컬폴더 설정 실패: ${String(error)}. START_HERE_WINDOWS.cmd로 실행 중인지 확인하세요.`,
      );
    }
  }

  async function openManagedFolder(kind: BrowserFolderKind) {
    if (isLikelyMobileDevice()) {
      await refreshManagedFiles(kind, true);
      setFolderMessage(`${folderLabel(kind)}는 PC에 저장됩니다. 모바일에서는 PC 탐색기 대신 최근 파일 다운로드 또는 ZIP 다운로드를 사용하세요.`);
      return true;
    }
    try {
      const data = await callLocalFolderHelper<{ ok: boolean; folderPath: string; opened: boolean }>(
        "/api/local/open-folder",
        { kind, folderPath: text(localFolderPaths[kind]) },
      );
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      await refreshManagedFiles(kind, true);
      setFolderMessage(`${folderLabel(kind)}를 PC에서 열었습니다: ${data.folderPath}`);
      return true;
    } catch (error) {
      setFolderMessage(
        `${folderLabel(kind)} 자동 열기 실패: ${String(error)}. 모바일에서는 파일목록 새로고침 후 다운로드를 사용하세요.`,
      );
      return false;
    }
  }

  async function saveBlobToLocalFolder(
    kind: BrowserFolderKind,
    filename: string,
    blob: Blob,
  ): Promise<ManagedSaveResult | null> {
    try {
      const data = await callLocalFolderHelper<{
        ok: boolean;
        folderPath: string;
        folderName: string;
        filename: string;
        filePath: string;
      }>("/api/local/save-blob", {
        kind,
        folderPath: text(localFolderPaths[kind]),
        filename: safeFileName(filename),
        base64: await blobToBase64(blob),
      });
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      await refreshManagedFiles(kind, true);
      return {
        kind,
        folderLabel: folderLabel(kind),
        folderName: data.folderPath,
        filename: data.filename,
        method: "folder",
      };
    } catch {
      return null;
    }
  }

  async function saveBlobManagedStrictLocal(
    kind: BrowserFolderKind,
    filename: string,
    blob: Blob,
  ): Promise<ManagedSaveResult> {
    const safeName = safeFileName(filename);
    const data = await callLocalFolderHelper<{
      ok: boolean;
      folderPath: string;
      folderName: string;
      filename: string;
      filePath: string;
    }>("/api/local/save-blob", {
      kind,
      folderPath: text(localFolderPaths[kind]),
      filename: safeName,
      base64: await blobToBase64(blob),
    });
    setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
    setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
    const result: ManagedSaveResult = {
      kind,
      folderLabel: folderLabel(kind),
      folderName: data.folderPath,
      filename: data.filename,
      method: "folder",
    };
    await refreshManagedFiles(kind, true);
    setFolderMessage(`${result.folderLabel} PC 로컬폴더에 ${result.filename} 저장 완료: ${result.folderName}`);
    return result;
  }

  async function pickManagedFolder(kind: BrowserFolderKind) {
    setFolderMessage(
      `${folderLabel(kind)} PC 로컬폴더를 설정합니다. 경로 입력 저장이 우선이며, 미지원 환경에서는 폴더 선택창을 사용합니다.`,
    );
    if (!folderApiSupported() || !window.showDirectoryPicker) {
      setFolderMessage(
        "현재 브라우저는 폴더 선택 직접저장을 지원하지 않습니다. PC 로컬폴더 경로를 입력하고 START_HERE_WINDOWS.cmd로 실행하세요.",
      );
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: kind === "purchase" ? "b2b-purchase-folder" : kind === "invoice" ? "b2b-invoice-folder" : "b2b-upload-folder",
        mode: "readwrite",
      });
      const permitted = await ensureFolderPermission(handle);
      if (!permitted) {
        setFolderMessage(
          `${folderLabel(kind)} 쓰기 권한이 허용되지 않았습니다.`,
        );
        return null;
      }
      await saveFolderHandle(kind, handle);
      setFolderHandles((prev) => ({ ...prev, [kind]: handle }));
      setFolderNames((prev) => ({ ...prev, [kind]: handle.name }));
      setFolderMessage(
        `${folderLabel(kind)}를 '${handle.name}'로 설정했습니다. 이 방식도 PC의 실제 선택 폴더에 직접 저장합니다.`,
      );
      return handle;
    } catch (error) {
      setFolderMessage(`폴더 설정을 완료하지 못했습니다: ${String(error)}`);
      return null;
    }
  }

  async function ensureManagedFolder(kind: BrowserFolderKind) {
    const current = folderHandles[kind];
    if (current && !text(localFolderPaths[kind])) return current;
    setFolderMessage(
      `${folderLabel(kind)}는 PC 로컬폴더로 저장합니다. 경로가 비어 있으면 다운로드 폴더 아래 B2B_${folderShortName(kind)}폴더를 자동 생성합니다.`,
    );
    return null;
  }

  async function saveBlobManaged(
    kind: BrowserFolderKind,
    filename: string,
    blob: Blob,
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ): Promise<ManagedSaveResult> {
    const safeName = safeFileName(filename);
    const localSaved = await saveBlobToLocalFolder(kind, safeName, blob);
    if (localSaved) {
      setFolderMessage(
        `${localSaved.folderLabel} PC 로컬폴더에 ${localSaved.filename} 저장 완료: ${localSaved.folderName}`,
      );
      return localSaved;
    }
    const handle = handleOverride || folderHandles[kind];
    if (handle) {
      try {
        await writeBlobToFolder(handle, filename, blob);
        const result: ManagedSaveResult = {
          kind,
          folderLabel: folderLabel(kind),
          folderName: handle.name,
          filename: safeName,
          method: "folder",
        };
        setFolderMessage(
          `${result.folderLabel} '${result.folderName}'에 ${result.filename} 저장 완료`,
        );
        return result;
      } catch (error) {
        setFolderMessage(
          `${folderLabel(kind)} 직접 저장 실패로 일반 다운로드로 전환했습니다: ${String(error)}`,
        );
      }
    }
    saveBlobWithDownload(filename, blob);
    return {
      kind,
      folderLabel: folderLabel(kind),
      folderName: "브라우저 기본 다운로드 폴더",
      filename: safeName,
      method: "download",
    };
  }

  function resetShipmentTemplate(channel: Channel) {
    const fallback = DEFAULT_SHIPMENT_TEMPLATES.find(
      (tpl) => tpl.channel === channel,
    );
    if (!fallback) return;
    setShipmentTemplates((rows) =>
      normalizeShipmentTemplates(
        rows.map((row) =>
          row.channel === channel ? { ...fallback, id: row.id } : row,
        ),
      ),
    );
  }

  function downloadMappingTemplate() {
    downloadExcelFile("B2B_모바일_매핑양식_V170.xls", [
      {
        name: "매핑",
        rows: [
          [
            "채널",
            "옵션ID",
            "쿠팡 옵션ID",
            "토스옵션ID",
            "토스 옵션관리코드",
            "내 판매상품명",
            "판매옵션명",
            "발주처",
            "코드번호",
            "발주상품명",
            "발주옵션명",
            "원가",
            "발주수량배수",
            "발주양식",
            "사용여부",
            "메모",
          ],
          ["쿠팡", "", "", "", "", "예시 판매상품", "예시 옵션", "예시업체", "", "업체가 받을 상품명", "", 0, 1, "기본", "Y", ""],
          ["토스", "", "", "", "", "예시 판매상품", "예시 옵션", "예시업체", "", "업체가 받을 상품명", "", 0, 1, "기본", "Y", "토스는 optionId/tossStockId 우선, 없으면 옵션관리코드 사용"],
        ],
      },
      {
        name: "작성기준",
        rows: [
          ["항목", "설명"],
          ["채널", "쿠팡 또는 토스"],
          ["옵션ID", "가장 우선 매핑키입니다. 쿠팡은 vendorItemId/optionId, 토스는 optionId/tossStockId를 넣습니다."],
          ["토스 옵션관리코드", "토스 실제 optionId가 없을 때 보조 매핑키로 사용합니다."],
          ["발주처", "업체명/공급처/거래처라는 열 이름도 인식합니다."],
          ["발주상품명", "업체에 보낼 상품명입니다. 내 판매상품명이 아닙니다."],
          ["발주수량배수", "주문수량에 곱해 발주수량을 계산합니다. 기본 1입니다."],
          ["사용여부", "Y는 사용, N/미사용/중지는 업로드 시 제외합니다."],
        ],
      },
    ]);
  }

  function exportMapping() {
    downloadExcelFile("B2B_매핑자료_V46.xls", [
      {
        name: "매핑",
        rows: [
          [
            "채널",
            "옵션ID",
            "업체명",
            "코드번호",
            "업체상품명",
            "원가",
            "기본수량",
          ],
          ...mappings.map((row) => [
            row.channel,
            row.optionId,
            row.vendorName,
            row.vendorCode,
            row.vendorProductName,
            row.cost,
            row.baseQty,
          ]),
        ],
      },
    ]);
  }

  function exportMissingMappings() {
    const targets = uniqueMissingMappingTargets(purchaseRows);
    if (!targets.length) {
      setMessage("현재 주문 기준 미매핑 주문이 없습니다.");
      return;
    }
    downloadExcelFile(`B2B_미매핑_주문_${today()}.xls`, [
      {
        name: "미매핑주문",
        rows: [
          [
            "채널",
            "매핑기준",
            "주문번호",
            "주문상품명",
            "주문옵션명",
            "주문수량",
            "판매금액",
            "수취인",
            "주소",
          ],
          ...missingMappings.map((row) => [
            row.channel,
            row.optionId,
            row.orderNo,
            row.orderProductName || row.vendorProductName,
            row.orderOptionName,
            row.orderQty,
            row.salePrice,
            row.receiverName,
            row.address,
          ]),
        ],
      },
      {
        name: "매핑등록용",
        rows: [
          ["채널", "매핑기준", "업체명", "코드번호", "업체상품명", "원가", "기본수량", "참고 주문번호", "내 판매상품명", "옵션명/옵션관리코드"],
          ...targets.map((row) => [
            row.channel,
            row.optionId,
            "",
            "",
            "",
            0,
            1,
            row.orderNo,
            row.productName,
            row.optionName,
          ]),
        ],
      },
    ]);
    setMessage(`미매핑 주문 ${missingMappings.length}건과 매핑등록용 매핑기준 ${targets.length}개를 엑셀로 내보냈습니다.`);
  }

  function runPurchasePreflight() {
    const blocked = purchasePreflightIssues.filter((issue) => issue.level === "차단");
    const checks = purchasePreflightIssues.filter((issue) => issue.level === "확인");
    const messageText = blocked.length
      ? `발주 검증: 차단 ${blocked.length}건, 확인 ${checks.length}건입니다. 차단항목을 먼저 처리해야 발주 엑셀을 만들 수 있습니다.`
      : `발주 검증 통과: 확인 ${checks.length}건, 발주가 가능합니다.`;
    setMappingCheckMessage(messageText);
    setMessage(messageText);
    setActiveMenu("발주관리");
  }

  function canExportPurchaseRows(rows: PurchaseRow[], scope: string) {
    const issues = validatePurchasePreflight(rows, orders, purchaseHistory);
    const blocked = issues.filter((issue) => issue.level === "차단");
    if (blocked.length) {
      const detail = blocked.slice(0, 3).map((issue) => `${issue.item}(${issue.channel} ${issue.orderNo})`).join(", ");
      setMessage(`${scope} 발주 엑셀 생성 차단: ${blocked.length}건 확인 필요. ${detail}`);
      setActiveMenu("발주관리");
      return false;
    }
    return true;
  }

  async function exportPurchaseForVendor(vendorName: string) {
    const rows = vendorGroups[vendorName] || [];
    if (!rows.length) return;
    if (!canExportPurchaseRows(rows, `${vendorName}`)) return;
    const artifact = await makeManagedWorkbookArtifact(`${vendorName}_발주양식_${today()}`, [
      {
        name: vendorName,
        rows: purchaseRowsToTemplate(rows, purchaseTemplates),
        showTitle: false,
      },
    ]);
    await saveBlobManaged("purchase", artifact.filename, artifact.blob);
    setPurchaseHistory((prev) => mergePurchaseHistory(prev, makePurchaseHistoryRows(rows)));
  }

  async function exportAllPurchases() {
    const entries = Object.entries(vendorGroups) as Array<[string, PurchaseRow[]]>;
    if (!entries.length) {
      setMessage("다운로드할 매칭완료 발주자료가 없습니다. 매핑관리에서 미매핑을 먼저 처리하세요.");
      return;
    }
    if (purchasePreflightBlocked.length) {
      const detail = purchasePreflightBlocked.slice(0, 3).map((issue) => `${issue.item}(${issue.channel} ${issue.orderNo})`).join(", ");
      setMessage(`전체 발주 차단: 차단항목 ${purchasePreflightBlocked.length}건이 있습니다. ${detail}`);
      setActiveMenu("발주관리");
      return;
    }

    const artifacts: FolderZipArtifact[] = [];
    for (const [vendorName, rows] of entries) {
      artifacts.push(
        await makeManagedWorkbookArtifact(`${vendorName}_발주양식_${today()}`, [
          {
            name: vendorName,
            rows: purchaseRowsToTemplate(rows, purchaseTemplates),
            showTitle: false,
          },
        ]),
      );
    }
    const exportedRows = entries.flatMap(([, rows]) => rows);
    const checkArtifact = await makeManagedWorkbookArtifact(`발주_매핑확인_${today()}_전체`, purchaseVerificationSheets("전체발주", entries, purchasePreflightIssues));
    artifacts.push(checkArtifact);

    const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
    setPurchaseHistory((prev) => mergePurchaseHistory(prev, makePurchaseHistoryRows(exportedRows)));
    const totalQty = exportedRows.reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0);
    setLastPurchaseExportRows([
      ...entries.map(([vendorName, rows]) => [
        vendorName,
        `${safeFileName(vendorName)}_발주양식_${today()}.xlsx`,
        rows.length,
        Array.from(new Set(rows.map((row) => row.channel))).join("+"),
        rows.reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0),
        saved.folderPath,
      ] as Array<string | number>),
      ["검증표", checkArtifact.filename, exportedRows.length, "전체", totalQty, saved.folderPath],
    ]);
    setMessage(`${entries.length}개 업체, 발주 ${exportedRows.length}건을 생성했습니다. 모바일/클라우드에서는 브라우저 ZIP 다운로드, PC에서는 로컬폴더 저장을 우선합니다.`);
  }

  async function exportChannelPurchase(channel: Channel) {
    const rows = purchaseRows.filter(
      (row) => row.channel === channel && row.matchStatus === "매칭완료",
    );
    if (!rows.length) {
      setMessage(`${channel} 발주양식으로 저장할 매칭완료 자료가 없습니다.`);
      return;
    }
    if (!canExportPurchaseRows(rows, `${channel}`)) return;
    const template = getChannelPurchaseTemplate(
      channel,
      channelPurchaseTemplates,
    );
    const artifact = await makeManagedWorkbookArtifact(`${channel}_발주양식_${today()}`, [
      {
        name: `${channel}발주`,
        rows: channelPurchaseRowsToTemplate(rows, template),
        showTitle: false,
      },
    ]);
    await saveBlobManaged("purchase", artifact.filename, artifact.blob);
    setPurchaseHistory((prev) => mergePurchaseHistory(prev, makePurchaseHistoryRows(rows)));
    setMessage(`${channel} 발주양식 ${rows.length}건을 저장하고 발주이력을 기록했습니다.`);
  }

  async function exportShipmentRegistrationFiles(
    rows: InvoicePreviewRow[],
    handleOverride?: FileSystemDirectoryHandleLike | null,
    sourceOrdersForOutput?: OrderRow[],
  ) {
    const coupangRows = rows.filter(
      (row) => row.channel === "쿠팡" && row.status === "등록준비",
    );
    const tossRows = rows.filter(
      (row) => row.channel === "토스" && row.status === "등록준비",
    );

    if (coupangRows.length) {
      const filename = `쿠팡_운송장입력_${today()}_송장등록.xlsx`;
      const blob = await createXlsxBlob([
        {
          name: "Delivery",
          rows: coupangShipmentRows(
            coupangRows,
            sourceOrdersForOutput || orders,
            getShipmentTemplate("쿠팡", shipmentTemplates),
          ),
        },
      ]);
      await saveBlobManaged("purchase", filename, blob, handleOverride);
    }
    if (tossRows.length) {
      const filename = `토스_운송장입력_주문배송관리-${today()}.xlsx`;
      const blob = await createXlsxBlob([
        {
          name: "주문내역",
          rows: tossShipmentRows(
            tossRows,
            sourceOrdersForOutput || orders,
            getShipmentTemplate("토스", shipmentTemplates),
          ),
        },
      ]);
      await saveBlobManaged("purchase", filename, blob, handleOverride);
    }

    return { coupang: coupangRows.length, toss: tossRows.length };
  }

  async function savePreparingShipmentMissingOrdersFile(
    rows: OrderRow[],
    scope: string,
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ) {
    const filename = `상품준비중_송장미입력_${today()}_${compactScopeName(scope)}.xls`;
    const result = await saveBlobManaged(
      "purchase",
      filename,
      makeExcelBlob(preparingShipmentMissingOrderSheets(rows, scope)),
      handleOverride,
    );
    return { ...result, filename };
  }

  async function savePreparingShipmentMissingOrdersByChannel(
    rows: OrderRow[],
    scope: string,
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ) {
    const channels: Channel[] = ["쿠팡", "토스"];
    const saved: Array<{ channel: Channel; filename: string; count: number }> = [];
    for (const channel of channels) {
      const channelRows = rows.filter((row) => row.channel === channel);
      const filename = `${channel}_상품준비중_송장미입력_${today()}_${compactScopeName(scope)}.xls`;
      await saveBlobManaged(
        "purchase",
        filename,
        makeExcelBlob(preparingShipmentMissingOrderSheets(channelRows, `${scope}_${channel}`)),
        handleOverride,
      );
      saved.push({ channel, filename, count: channelRows.length });
    }
    return saved;
  }


  async function savePreparingCurrentOrdersFile(
    rows: OrderRow[],
    scope: string,
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ) {
    const filename = `상품준비중_전체_${today()}_${compactScopeName(scope)}.xls`;
    const result = await saveBlobManaged(
      "purchase",
      filename,
      makeExcelBlob(preparingCurrentOrderSheets(rows, scope)),
      handleOverride,
    );
    return { ...result, filename, count: rows.length };
  }

  async function savePreparingCurrentOrdersByChannel(
    rows: OrderRow[],
    scope: string,
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ) {
    const channels: Channel[] = ["쿠팡", "토스"];
    const saved: Array<{ channel: Channel; filename: string; count: number }> = [];
    for (const channel of channels) {
      const channelRows = rows.filter((row) => row.channel === channel);
      const filename = `${channel}_상품준비중_전체_${today()}_${compactScopeName(scope)}.xls`;
      await saveBlobManaged(
        "purchase",
        filename,
        makeExcelBlob(preparingCurrentOrderSheets(channelRows, `${scope}_${channel}`)),
        handleOverride,
      );
      saved.push({ channel, filename, count: channelRows.length });
    }
    return saved;
  }

  async function saveShipmentVerification(
    scope: string,
    previewRows: InvoicePreviewRow[],
    counts: { coupang: number; toss: number },
    handleOverride?: FileSystemDirectoryHandleLike | null,
  ) {
    const filename = `송장등록_확인표_${today()}_${compactScopeName(scope)}.xls`;
    const result = await saveBlobManaged(
      "purchase",
      filename,
      makeExcelBlob(shipmentVerificationSheets(scope, previewRows, counts)),
      handleOverride,
    );
    const readyRows = previewRows.filter((row) => row.status === "등록준비");
    const excludedRows = previewRows.filter((row) => row.status === "송장입력완료(업로드제외)");
    const checkRows = previewRows.filter((row) => row.status !== "등록준비" && row.status !== "송장입력완료(업로드제외)");
    setLastShipmentExportRows([
      ["쿠팡", `쿠팡_운송장입력_${today()}_송장등록.xlsx`, counts.coupang, counts.coupang ? "생성" : "대상없음", "미입력 주문만 송장 입력"],
      ["토스", `토스_운송장입력_주문배송관리-${today()}.xlsx`, counts.toss, counts.toss ? "생성" : "대상없음", "미입력 주문만 송장 입력"],
      ["입력완료제외", result.filename, excludedRows.length, result.method === "folder" ? `${result.folderName} 저장` : "발주폴더 저장 확인 필요", "상품준비중 전체 파일에는 저장"],
      ["확인표", result.filename, readyRows.length, result.method === "folder" ? `${result.folderName} 저장` : "발주폴더 저장 확인 필요", checkRows.length ? `확인필요 ${checkRows.length}건` : "확인필요 없음"],
    ]);
    return result;
  }

  function shipmentUploadApiRows(rows: InvoicePreviewRow[], sourceOrders: OrderRow[]) {
    return rows.map((row) => {
      const order = findOrderForInvoice(row, sourceOrders);
      return {
        ...row,
        orderNo: order?.orderNo || row.orderNo,
        shipmentBoxId: row.shipmentBoxId || order?.shipmentBoxId || rawOrderValue(order, ["shipmentBoxId", "shipmentBox.shipmentBoxId", "parent.shipmentBoxId", "item.shipmentBoxId"]),
        orderProductId: row.orderProductId || order?.orderProductId || rawOrderValue(order, ["orderProductId", "tossOrderProductId", "item.orderProductId", "parent.orderProductId"]),
        orderId: row.orderId || rawOrderValue(order, ["orderId", "marketplaceOrderId"], order?.orderNo || row.orderNo),
        vendorItemId: row.vendorItemId || rawOrderValue(order, ["vendorItemId", "vendorItemIdStr", "item.vendorItemId", "parent.vendorItemId"], order?.optionId || row.optionId || ""),
        optionId: row.optionId || order?.optionId || "",
        orderStatus: row.orderStatus || order?.orderStatus || "",
        raw: order?.raw || {},
      };
    });
  }

  async function runShipmentUploadAll() {
    try {
      setShipmentPreviewMessage("발주폴더의 업체 송장엑셀과 쿠팡/토스 입력파일을 함께 읽어 택배사·운송장번호를 자동 매칭 중입니다...");
      const purchaseHandle = await ensureManagedFolder("purchase");
      const folderData = await readShipmentFolderDataFromLocalFolder();

      if (folderData.shipmentInputFiles.length) {
        if (!folderData.invoiceRecords.length) {
          await openManagedFolder("purchase");
          const messageText = `쿠팡/토스 입력파일 ${folderData.shipmentInputFiles.length}개는 확인했지만, 발주폴더의 업체 송장엑셀에서 택배사와 운송장번호를 찾지 못했습니다. 업체 파일에는 거래처주문번호 또는 주문번호, 택배사, 운송장번호가 필요합니다.`;
          setShipmentPreviewMessage(messageText);
          setMessage(messageText);
          return;
        }

        const previewRows = matchShipmentInputFiles(folderData.shipmentInputFiles, folderData.invoiceRecords);
        const rows = previewRows.filter((row) => row.status === "등록준비");
        const counts = {
          coupang: rows.filter((row) => row.channel === "쿠팡").length,
          toss: rows.filter((row) => row.channel === "토스").length,
        };
        const savedInputs = await exportFilledShipmentInputFiles(folderData.shipmentInputFiles, previewRows, purchaseHandle);
        await saveShipmentVerification("쿠팡토스송장자동매칭", previewRows, counts, purchaseHandle);
        await openManagedFolder("purchase");
        setInvoiceRecords(folderData.invoiceRecords);
        setLastShipmentExportRows([
          ...savedInputs.map((row) => [row.channel, row.filename, row.count, "자동입력", "발주폴더 입력파일의 빈 택배사·운송장번호를 채움"] as Array<string | number>),
          ["쿠팡", "API 업로드", counts.coupang, counts.coupang ? "대기" : "대상없음", "묶음배송번호·주문번호·옵션ID 기준"],
          ["토스", "API 업로드", counts.toss, counts.toss ? "대기" : "대상없음", "주문상품번호 기준, 주문상태 배송중 입력"],
        ]);

        if (!rows.length) {
          const checkCount = previewRows.filter((row) => row.status === "확인필요").length;
          const messageText = `발주폴더의 쿠팡/토스 입력파일 ${folderData.shipmentInputFiles.length}개와 업체 송장엑셀 ${folderData.invoiceRecords.length}행을 비교했지만, 업로드 가능한 등록준비 건이 없습니다. 확인필요 ${checkCount}건은 송장등록 확인표에서 주문번호·수취인·필수ID를 확인하세요.`;
          setShipmentPreviewMessage(messageText);
          setMessage(messageText);
          return;
        }

        const result = await callApi("/api/integrations/shipments/upload-execute", {
          rows: shipmentUploadApiRows(rows, []),
          manual: true,
          source: "purchase_folder_input_files_v160",
        });
        const messageText = result.message ||
          `발주폴더 입력파일 기준 자동 매칭 완료: 쿠팡 ${counts.coupang}건, 토스 ${counts.toss}건. 자동입력 파일을 저장했고 쿠팡/토스 배송중 업로드를 실행했습니다.`;
        setShipmentPreviewMessage(`${messageText} 자동입력 저장파일: ${savedInputs.map((row) => row.filename).join(" / ") || "없음"}`);
        setMessage(messageText);
        return;
      }

      setShipmentPreviewMessage("쿠팡/토스 입력파일이 발주폴더에 없어 최근 7일 상품준비중 주문을 API로 수집한 뒤 업체 송장엑셀과 매칭합니다...");
      const collected = await collectPreparingOrdersForShipmentUpload();

      if (!collected.ordersForMatch.length) {
        await openManagedFolder("purchase");
        const messageText = `최근 7일 상품준비중 주문 ${collected.preparingOrders.length}건은 확인됐지만, 택배사/운송장번호 미입력 주문이 없어 쿠팡/토스 운송장 입력파일은 생성하지 않았습니다.`;
        setShipmentPreviewMessage(messageText);
        setMessage(messageText);
        return;
      }

      let folderRecords: InvoiceRecord[] = [];
      try {
        folderRecords = folderData.invoiceRecords.length ? folderData.invoiceRecords : await readInvoiceRecordsFromLocalFolder();
      } catch (folderError) {
        await openManagedFolder("purchase");
        const messageText = `택배사/운송장번호 미입력 상품준비중 주문 ${collected.ordersForMatch.length}건은 확인됐지만, 발주폴더의 B2B 업체 송장엑셀에서 택배사/운송장번호를 읽지 못해 운송장 입력파일을 생성하지 않았습니다: ${String(folderError)}`;
        setShipmentPreviewMessage(messageText);
        setMessage(messageText);
        return;
      }

      const previewRows = matchInvoices(
        collected.ordersForMatch,
        buildPurchaseRows(collected.allOrders, mappings),
        folderRecords,
      );
      const rows = previewRows.filter((row) => row.status === "등록준비");
      const counts = await exportShipmentRegistrationFiles(rows, purchaseHandle, collected.allOrders);
      await openManagedFolder("purchase");
      setInvoiceRecords(folderRecords);
      setLastShipmentExportRows([
        ["쿠팡", `쿠팡_운송장입력_${today()}_송장등록.xlsx`, counts.coupang, counts.coupang ? "생성" : "대상없음", "운송장 입력파일만 저장"],
        ["토스", `토스_운송장입력_주문배송관리-${today()}.xlsx`, counts.toss, counts.toss ? "생성" : "대상없음", "운송장 입력파일만 저장"],
      ]);

      if (!rows.length) {
        const messageText = `택배사/운송장번호 미입력 상품준비중 ${collected.ordersForMatch.length}건과 발주폴더 B2B 송장엑셀의 택배사/운송장번호를 비교했지만 등록준비 매칭 건이 없어 운송장 입력파일을 생성하지 않았습니다. 주문번호 강제 매칭, 성명+주소 앞 2단어, 성명 기준을 확인하세요.`;
        setShipmentPreviewMessage(messageText);
        setMessage(messageText);
        return;
      }

      const result = await callApi("/api/integrations/shipments/upload-execute", {
        rows: shipmentUploadApiRows(rows, collected.allOrders),
        manual: true,
        source: "api_collected_preparing_orders_v160",
      });
      const messageText = result.message ||
        `최근 7일 상품준비중 중 택배사/운송장번호 미입력 주문만 처리했습니다. B2B 송장엑셀에서는 택배사/운송장번호만 사용했고, 나머지 항목은 정확히 매칭된 상품준비중 주문 원본 기준으로 채웠습니다. 토스 주문상태는 배송중, 토스 물류사와 쿠팡 제휴택배사는 공란입니다. 쿠팡 ${counts.coupang}건·토스 ${counts.toss}건을 발주폴더에 저장하고 업로드를 실행했습니다.`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      const messageText = `쿠팡+토스 송장 업로드 실패: ${String(error)}`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
    }
  }

  function downloadCouponTemplate() {
    const optionRows = currentCoupangOptionMasterRows.length
      ? currentCoupangOptionMasterRows
      : [makeCoupangOptionMasterRow("쿠팡옵션ID", "상품명 예시", "옵션명 예시", 0, "예시", "coupon")];
    const cancelRows = optionRows.length === currentCoupangOptionMasterRows.length
      ? dailyCouponCancelRows
      : buildDailyCouponRowsFromOptions("cancel", optionRows, couponRows, schedules);
    const applyRows = optionRows.length === currentCoupangOptionMasterRows.length
      ? dailyCouponApplyRows
      : buildDailyCouponRowsFromOptions("apply", optionRows, couponRows, schedules);
    downloadExcelFile(`쿠팡_24시간쿠폰_자동양식_${today()}.xls`, [
      {
        name: "전체양식",
        rows: couponRowsToSheet([...cancelRows, ...applyRows]),
        showTitle: false,
      },
      {
        name: "일괄취소",
        rows: couponRowsToSheet(cancelRows),
        showTitle: false,
      },
      {
        name: "일괄등록",
        rows: couponRowsToSheet(applyRows),
        showTitle: false,
      },
      {
        name: "현재옵션",
        rows: coupangOptionMasterRowsToSheet(optionRows),
        showTitle: false,
      },
    ]);
    setCouponMessage(`쿠폰양식 다운로드 완료: 전체 ${cancelRows.length + applyRows.length}건`);
  }

  function applyDailyCouponRowsFromCurrentOptions() {
    if (couponApiSettings.selectedMode !== "daily_new" || !couponApiSettings.selectedCouponName) {
      setCouponMessage("먼저 쿠폰 목록에서 24시간 반복 기준을 선택하세요. 전체 옵션을 임의로 반영하지 않도록 차단했습니다.");
      return;
    }
    void loadSelectedCouponItemsAndApply(couponApiSettings, true, selectedDailyCouponOptionRows.length);
  }

  function exportCouponRows() {
    downloadExcelFile(`쿠팡_할인쿠폰_일괄등록취소_${today()}.xls`, [
      {
        name: "쿠팡쿠폰",
        rows: couponRowsToSheet(couponRows.length ? couponRows : []),
        showTitle: false,
      },
    ]);
  }

  function exportCouponValidationRows() {
    downloadExcelFile(`쿠팡_할인쿠폰_검증결과_${today()}.xls`, [
      {
        name: "쿠폰검증",
        rows: couponValidationRowsToSheet(couponValidationRows),
        showTitle: false,
      },
    ]);
  }

  function exportCouponProfitRows() {
    downloadExcelFile(`쿠팡_할인쿠폰_쿠폰검증_${today()}.xls`, [
      {
        name: "쿠폰검증",
        rows: couponProfitRowsToSheet(couponProfitAnalysisRows),
        showTitle: false,
      },
    ]);
  }

  function exportCouponMonthlyImpactRows() {
    downloadExcelFile(`쿠팡_할인쿠폰_월영향예측_${today()}.xls`, [
      {
        name: "월영향예측",
        rows: couponMonthlyImpactRowsToSheet(couponMonthlyImpactRows),
        showTitle: false,
      },
    ]);
  }

  function exportCouponExecutionPlanRows() {
    const readyRows = couponExecutionCheckRows.filter((row) => row.executeStatus === "대기");
    const blockedRows = couponExecutionCheckRows.filter((row) => row.executeStatus === "차단");
    const duplicateRows = couponExecutionCheckRows.filter((row) => row.executeStatus === "중복");
    downloadExcelFile(`쿠팡_할인쿠폰_실행리허설_${today()}.xls`, [
      {
        name: "전체점검",
        rows: couponExecutionPlanRowsToSheet(couponExecutionCheckRows),
        showTitle: false,
      },
      {
        name: "실행대기",
        rows: couponExecutionPlanRowsToSheet(readyRows),
        showTitle: false,
      },
      {
        name: "차단",
        rows: couponExecutionPlanRowsToSheet(blockedRows),
        showTitle: false,
      },
      {
        name: "중복",
        rows: couponExecutionPlanRowsToSheet(duplicateRows),
        showTitle: false,
      },
    ]);
    setCouponMessage(`쿠폰 실행 리허설 파일을 생성했습니다. 실행대기 ${readyRows.length}건, 차단 ${blockedRows.length}건, 중복 ${duplicateRows.length}건입니다.`);
  }

  function exportCouponHistoryRows() {
    downloadExcelFile(`쿠팡_할인쿠폰_실행이력_${today()}.xls`, [
      {
        name: "쿠폰실행이력",
        rows: couponHistoryRowsToSheet(couponHistory),
        showTitle: false,
      },
    ]);
  }

  async function handleCouponImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importRowsFromFile(file);
      const imported = parseCouponRows(rows);
      if (!imported.length)
        throw new Error(
          "가져올 쿠폰 행이 없습니다. 쿠팡 옵션ID와 동작/할인값을 확인해 주세요.",
        );
      setCouponRows(imported);
      setCouponMessage(
        `${file.name}에서 쿠폰 양식 ${imported.length}행을 적용했습니다. 옵션별 할인값을 Preview에 전달합니다.`,
      );
    } catch (error) {
      setCouponMessage(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }

  async function handleB2BVendorLinkImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await importRowsFromFile(file);
      const imported = parseB2BVendorLinks(rows);
      if (!imported.length)
        throw new Error(
          "가져올 B2B 바로가기 행이 없습니다. 업체명과 주소(URL)를 확인해 주세요.",
        );
      setB2BVendorLinks(imported);
      setMessage(
        `${file.name}에서 B2B 바로가기 ${imported.length}개 업체를 적용했습니다. 현재 목록이 최신본입니다.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = "";
    }
  }

  function downloadB2BVendorLinkTemplate() {
    downloadExcelFile("B2B_업체바로가기_일괄등록_양식_V59.xls", [
      {
        name: "B2B바로가기",
        rows: b2bVendorLinksToSheet(DEFAULT_B2B_VENDOR_LINKS),
        showTitle: false,
      },
    ]);
  }

  function exportB2BVendorLinks() {
    downloadExcelFile(`B2B_업체바로가기_${today()}.xls`, [
      {
        name: "B2B바로가기",
        rows: b2bVendorLinksToSheet(b2bVendorLinks),
        showTitle: false,
      },
    ]);
  }

  function resetB2BVendorLinks() {
    setB2BVendorLinks(DEFAULT_B2B_VENDOR_LINKS);
    setMessage(
      "B2B 바로가기를 기본 업체 목록으로 복원했습니다. 브라우저 저장 또는 서버 저장을 누르면 최신본으로 유지됩니다.",
    );
  }

  function openB2BVendorLink(link: B2BVendorLink) {
    if (!link.url) return;
    window.open(link.url, "_blank", "noopener,noreferrer");
  }

  function updateCouponRow(id: string, patch: Partial<CouponRow>) {
    setCouponRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }


  function updateCouponApiSettings(patch: Partial<CouponApiSettings>) {
    setCouponApiSettings((prev) =>
      normalizeCouponApiSettings({
        ...prev,
        ...patch,
        savedAt: new Date().toISOString(),
      }),
    );
  }


  function couponApiSettingsForRun(nextTemplates = rollingCouponTemplates) {
    return normalizeCouponApiSettings({
      ...couponApiSettings,
      selectedMode: nextTemplates.some((template) => template.enabled) ? "daily_new" : couponApiSettings.selectedMode,
      dailyRollingEnabled: nextTemplates.some((template) => template.enabled) || couponApiSettings.dailyRollingEnabled,
      rollingTemplates: nextTemplates,
      selectedCouponId: nextTemplates.map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(",") || couponApiSettings.selectedCouponId,
    });
  }

  function refreshCouponRowsFromRollingTemplates(nextTemplates = rollingCouponTemplates) {
    const rows = buildRollingTemplateCouponRowsForAll(nextTemplates, schedules, couponRows);
    setCouponRows(rows);
    setCouponApiSettings((prev) => normalizeCouponApiSettings({
      ...prev,
      selectedMode: nextTemplates.some((template) => template.enabled) ? "daily_new" : prev.selectedMode,
      dailyRollingEnabled: nextTemplates.some((template) => template.enabled),
      selectedCouponId: nextTemplates.map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
      selectedContractId: nextTemplates[0]?.contractId || prev.selectedContractId,
      rollingTemplates: nextTemplates,
      savedAt: new Date().toISOString(),
    }));
    return rows;
  }

  function toggleRollingCouponSelection(couponId: string) {
    const id = cleanId(couponId);
    if (!id) return;
    setSelectedRollingCouponIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  }

  function selectedCouponListRowsForRolling() {
    const selected = new Set(selectedRollingCouponIds.map(cleanId));
    return couponListRows.filter((row) => selected.has(cleanId(row.couponId)));
  }

  function makeRollingTemplateFromCoupon(row: CoupangCouponListRow, options: CoupangOptionMasterRow[]): RollingCouponTemplate {
    const parsed = couponDiscountInfoFromTexts(row.discountType || row.type, row.discountValue || row.discount);
    const normalizedOptions = normalizeCoupangOptionMasterRows(options);
    return {
      id: rollingCouponTemplateId(row.couponId),
      enabled: true,
      sourceCouponId: row.couponId,
      latestCouponId: row.couponId,
      contractId: row.contractId || couponApiSettings.selectedContractId,
      couponName: row.couponName || `couponId ${row.couponId}`,
      status: row.status || couponApiSettings.selectedCouponStatus,
      type: row.type,
      discountType: row.discountType || parsed.discountType || "금액",
      discountValue: toNumber(row.discountValue, parsed.discountValue),
      startAt: row.startAt,
      endAt: row.endAt,
      itemCount: normalizedOptions.length,
      options: normalizedOptions.map((option) => ({
        optionId: option.optionId,
        productName: option.productName,
        optionName: option.optionName,
        salePrice: option.salePrice,
        salePriceSource: option.source === "api" ? "api" : "",
      })),
      savedAt: new Date().toISOString(),
    };
  }

  async function loadCouponOptionsForTemplate(row: CoupangCouponListRow) {
    const settings = normalizeCouponApiSettings({
      ...couponApiSettings,
      selectedCouponId: row.couponId,
      sourceCouponId: row.couponId,
      selectedContractId: row.contractId || couponApiSettings.selectedContractId,
      selectedCouponName: row.couponName,
      selectedCouponStatus: row.status || couponApiSettings.selectedCouponStatus,
      selectedMode: "daily_new",
      sourceDiscountType: row.discountType || "금액",
      sourceDiscountValue: row.discountValue,
      dailyRollingEnabled: true,
    });
    try {
      const result = await callApi("/api/integrations/coupang/coupons/items-list", {
        query: { couponId: row.couponId, status: row.status || couponApiSettings.selectedCouponStatus || "APPLIED", page: 0, size: 1000 },
        couponApiSettings: settings,
        manual: true,
      });
      const items = couponItemRowsFromApiResult(result);
      if (items.length) {
        const options = couponItemOptionsFromRows(items, settings);
        setCouponItemRows((prev) => {
          const seen = new Set(prev.map((item) => `${item.couponId}|${item.vendorItemId}`));
          const merged = [...prev];
          for (const item of items) {
            const key = `${item.couponId}|${item.vendorItemId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
          return merged;
        });
        setCoupangOptionMasterRows((prev) => normalizeCoupangOptionMasterRows([...prev, ...options]));
        return options;
      }
      const byName = selectedCouponOptionRows(currentCoupangOptionMasterRows, settings);
      return byName;
    } catch {
      return selectedCouponOptionRows(currentCoupangOptionMasterRows, settings);
    }
  }

  async function applySelectedCouponsAsRollingTemplates() {
    const selectedRows = selectedCouponListRowsForRolling();
    if (!selectedRows.length) {
      setCouponMessage("반복 운영할 쿠폰을 체크한 뒤 선택 쿠폰 일괄 반영을 누르세요.");
      return;
    }
    const importedTemplates: RollingCouponTemplate[] = [];
    const failed: string[] = [];
    for (const row of selectedRows) {
      const options = await loadCouponOptionsForTemplate(row);
      if (!options.length) {
        failed.push(`${row.couponName || row.couponId}: 적용상품 없음`);
        continue;
      }
      importedTemplates.push(makeRollingTemplateFromCoupon(row, options));
    }
    setRollingCouponTemplates((prev) => {
      const byId = new Map(normalizeRollingCouponTemplates(prev).map((template) => [template.id, template]));
      for (const template of importedTemplates) {
        const previous = byId.get(template.id);
        byId.set(template.id, {
          ...template,
          latestCouponId: previous?.latestCouponId || template.latestCouponId,
          lastGeneratedCouponId: previous?.lastGeneratedCouponId,
          lastGeneratedAt: previous?.lastGeneratedAt,
          lastCanceledAt: previous?.lastCanceledAt,
        });
      }
      const next = normalizeRollingCouponTemplates(Array.from(byId.values()));
      refreshCouponRowsFromRollingTemplates(next);
      return next;
    });
    const successCount = importedTemplates.length;
    const optionCount = importedTemplates.reduce((sum, template) => sum + template.options.length, 0);
    const zeroDiscount = importedTemplates.filter((template) => toNumber(template.discountValue, 0) <= 0).length;
    const msg = `선택 쿠폰 ${successCount}개를 24시간 반복 대상으로 반영했습니다. 적용상품 ${optionCount}개를 쿠폰별로 분리 저장했습니다.${zeroDiscount ? ` 할인값 0인 쿠폰 ${zeroDiscount}개는 실행 전 보정이 필요합니다.` : ""}${failed.length ? ` 확인필요: ${failed.join(" / ")}` : ""}`;
    setCouponMessage(msg);
    setMessage(msg);
  }

  function deleteRollingCouponTemplate(templateId: string) {
    setRollingCouponTemplates((prev) => {
      const next = normalizeRollingCouponTemplates(prev).filter((template) => template.id !== templateId);
      refreshCouponRowsFromRollingTemplates(next);
      return next;
    });
    setCouponRows((rows) => rows.filter((row) => row.rollingTemplateId !== templateId));
    setCouponMessage("선택한 쿠폰 반복 설정을 삭제했습니다. 자동 스케줄러에서도 제외하려면 서버 저장을 눌러주세요.");
  }

  function clearAllRollingCouponTemplates() {
    setRollingCouponTemplates([]);
    setSelectedRollingCouponIds([]);
    setCouponRows([]);
    setCouponApiSettings(normalizeCouponApiSettings({ ...DEFAULT_COUPON_API_SETTINGS, rollingTemplates: [] }));
    setCouponMessage("모든 24시간 반복 쿠폰 설정을 삭제했습니다. 서버 저장을 누르면 자동 스케줄러에서도 제외됩니다.");
  }

  function updateRollingTemplatesFromGeneratedRecords(records: unknown[], generatedCouponIds: string[]) {
    const recordRows = Array.isArray(records) ? records : [];
    setRollingCouponTemplates((prev) => {
      let next = normalizeRollingCouponTemplates(prev);
      if (recordRows.length) {
        next = next.map((template) => {
          const record = recordRows.find((item) => item && typeof item === "object" && text((item as Record<string, unknown>).templateId) === template.id) as Record<string, unknown> | undefined;
          const couponId = cleanId(record?.couponId);
          return couponId ? { ...template, latestCouponId: couponId, lastGeneratedCouponId: couponId, lastGeneratedAt: new Date().toISOString() } : template;
        });
      } else if (generatedCouponIds.length) {
        let cursor = 0;
        next = next.map((template) => {
          const couponId = generatedCouponIds[cursor++];
          return couponId ? { ...template, latestCouponId: couponId, lastGeneratedCouponId: couponId, lastGeneratedAt: new Date().toISOString() } : template;
        });
      }
      setCouponApiSettings((prevSettings) => normalizeCouponApiSettings({
        ...prevSettings,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        selectedCouponId: next.map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
        lastGeneratedCouponIds: next.map((template) => template.latestCouponId).filter(Boolean),
        lastGeneratedCouponId: next[0]?.latestCouponId || "",
        lastGeneratedAt: new Date().toISOString(),
        rollingTemplates: next,
      }));
      return next;
    });
  }

  function clearCouponApiSelection() {
    setCouponApiSettings(DEFAULT_COUPON_API_SETTINGS);
    setCouponMessage("쿠폰 API 선택값을 초기화했습니다. 계약서 목록 또는 쿠폰 목록을 다시 조회해 선택하세요.");
  }

  async function fetchCoupangCouponContracts() {
    try {
      const result = await callApi("/api/integrations/coupang/coupons/contracts-list", {
        query: { page: 0, size: 100 },
        manual: true,
      });
      const rows = couponContractRowsFromApiResult(result);
      setCouponContractRows(rows);
      const msg = result.message || `쿠팡 계약서 목록 ${rows.length}건을 확인했습니다.`;
      setCouponMessage(msg);
      setMessage(msg);
      return rows;
    } catch (error) {
      const msg = `쿠팡 계약서 목록 조회 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
      return [];
    }
  }

  async function fetchCoupangCouponList(status = couponApiSettings.selectedCouponStatus || "APPLIED") {
    try {
      const result = await callApi("/api/integrations/coupang/coupons/list", {
        query: { status, page: 1, size: 50 },
        couponApiSettings: { ...couponApiSettings, selectedCouponStatus: status },
        manual: true,
      });
      const rows = couponListRowsFromApiResult(result);
      setCouponListRows(rows);
      const msg = result.message || `쿠팡 쿠폰 목록 ${rows.length}건을 확인했습니다.`;
      setCouponMessage(msg);
      setMessage(msg);
      return rows;
    } catch (error) {
      const msg = `쿠팡 쿠폰 목록 조회 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
      return [];
    }
  }

  function selectCoupangContract(row: CoupangCouponContractRow) {
    updateCouponApiSettings({
      selectedContractId: row.contractId,
      selectedCouponId: "",
      selectedCouponName: row.contractName || `contractId ${row.contractId}`,
      selectedCouponStartAt: row.startAt,
      selectedCouponEndAt: row.endAt,
      selectedMode: "new",
    });
    setCouponMessage(`신규 쿠폰 생성용 contractId=${row.contractId}를 선택하고 브라우저에 자동저장했습니다. 실제 서버 예약실행까지 쓰려면 서버 저장도 눌러주세요.`);
  }

  function selectCoupangCoupon(row: CoupangCouponListRow) {
    updateCouponApiSettings({
      selectedCouponId: row.couponId,
      selectedContractId: row.contractId || couponApiSettings.selectedContractId,
      selectedCouponName: row.couponName || `couponId ${row.couponId}`,
      selectedCouponStartAt: row.startAt,
      selectedCouponEndAt: row.endAt,
      selectedCouponStatus: row.status || couponApiSettings.selectedCouponStatus,
      selectedMode: "existing",
      dailyRollingEnabled: false,
    });
    setCouponMessage(`기존 쿠폰 couponId=${row.couponId}를 선택하고 브라우저에 자동저장했습니다. 이 쿠폰에 상품을 붙이거나 취소할 수 있습니다.`);
  }

  function selectCoupangCouponAsDailyTemplate(row: CoupangCouponListRow) {
    const parsed = couponDiscountInfoFromTexts(row.discountType || row.type, row.discountValue || row.discount);
    const nextSettings = normalizeCouponApiSettings({
      ...couponApiSettings,
      selectedCouponId: row.couponId,
      sourceCouponId: row.couponId,
      selectedContractId: row.contractId || couponApiSettings.selectedContractId,
      selectedCouponName: row.couponName || `couponId ${row.couponId}`,
      selectedCouponStartAt: row.startAt,
      selectedCouponEndAt: row.endAt,
      selectedCouponStatus: row.status || couponApiSettings.selectedCouponStatus,
      selectedMode: "daily_new",
      dailyRollingEnabled: true,
      sourceDiscountType: row.discountType || parsed.discountType || "금액",
      sourceDiscountValue: toNumber(row.discountValue, parsed.discountValue),
      selectedCouponProductFilter: row.couponName || "",
      lastGeneratedCouponIds: couponApiSettings.lastGeneratedCouponIds?.length ? couponApiSettings.lastGeneratedCouponIds : [row.couponId],
      lastGeneratedCouponId: couponApiSettings.lastGeneratedCouponId || row.couponId,
      savedAt: new Date().toISOString(),
    });
    setCouponApiSettings(nextSettings);
    const matched = selectedCouponOptionRows(currentCoupangOptionMasterRows, nextSettings);
    setCouponMessage(`24시간 반복 기준 쿠폰으로 couponId=${row.couponId} / ${row.couponName || "쿠폰명 없음"}을 선택했습니다. 운영 중 할인값 ${nextSettings.sourceDiscountType || "금액"} ${toNumber(nextSettings.sourceDiscountValue, 0).toLocaleString()}을 불러왔습니다. 쿠팡 적용상품 목록을 조회해 선택한 쿠폰 상품만 자동 반영합니다.`);
    void loadSelectedCouponItemsAndApply(nextSettings, false, matched.length);
  }

  function couponItemOptionsFromRows(items: CoupangCouponItemRow[], settings: CouponApiSettings) {
    const currentById = new Map(currentCoupangOptionMasterRows.map((row) => [cleanId(row.optionId), row]));
    const localById = new Map(localCoupangOptionMasterRows.map((row) => [cleanId(row.optionId), row]));
    return normalizeCoupangOptionMasterRows(items.map((item) => {
      const optionId = cleanId(item.vendorItemId);
      const known = currentById.get(optionId) || localById.get(optionId);
      return makeCoupangOptionMasterRow(
        optionId,
        known?.productName || settings.selectedCouponName || `쿠폰 적용상품 ${optionId}`,
        known?.optionName || "",
        known?.salePrice || 0,
        item.status || settings.selectedCouponStatus || "APPLIED",
        known?.source || "coupon",
      );
    }));
  }

  function applyCouponRowsFromExactOptions(options: CoupangOptionMasterRow[], settings: CouponApiSettings, sourceLabel: string) {
    const cancelRows = applyCouponSourceToRows(buildDailyCouponRowsFromOptions("cancel", options, couponRows, schedules), settings);
    const applyRows = applyCouponSourceToRows(buildDailyCouponRowsFromOptions("apply", options, couponRows, schedules), settings);
    setCouponRows([...cancelRows, ...applyRows]);
    const discountValue = toNumber(settings.sourceDiscountValue, 0);
    const zeroNote = discountValue <= 0 ? " 할인값이 0이므로 쿠폰 목록 응답에 할인값이 없었을 가능성이 있습니다. 실제 할인금액을 입력해야 실행됩니다." : "";
    const msg = `${sourceLabel} 기준으로 취소 ${cancelRows.length}건 + 등록 ${applyRows.length}건만 반영했습니다. 운영할인 ${settings.sourceDiscountType || "금액"} ${discountValue.toLocaleString()}을 적용했습니다.${zeroNote}`;
    setCouponMessage(msg);
    setMessage(msg);
    return cancelRows.length + applyRows.length;
  }

  async function loadSelectedCouponItemsAndApply(settings = couponApiSettings, showMessage = true, fallbackMatchCount = 0) {
    const couponId = settings.sourceCouponId || settings.selectedCouponId;
    if (!couponId) {
      if (showMessage) setCouponMessage("쿠폰 목록에서 24시간 반복 기준을 먼저 선택하세요.");
      return false;
    }
    try {
      const result = await callApi("/api/integrations/coupang/coupons/items-list", {
        query: { couponId, status: settings.selectedCouponStatus || "APPLIED", page: 0, size: 1000 },
        couponApiSettings: settings,
        manual: true,
      });
      const items = couponItemRowsFromApiResult(result);
      setCouponItemRows(items);
      if (items.length) {
        const options = couponItemOptionsFromRows(items, settings);
        setCoupangOptionMasterRows((prev) => normalizeCoupangOptionMasterRows([...prev, ...options]));
        applyCouponRowsFromExactOptions(options, settings, `선택 couponId=${couponId}의 쿠팡 적용상품 ${items.length}건`);
        return true;
      }
      const fallback = buildDailyCouponRowsForSelectedCoupon("apply", currentCoupangOptionMasterRows, couponRows, schedules, settings);
      const msg = result.message || `선택 couponId=${couponId}의 적용상품 목록을 가져오지 못했습니다.`;
      if (fallback.length || fallbackMatchCount) {
        const options = selectedCouponOptionRows(currentCoupangOptionMasterRows, settings);
        applyCouponRowsFromExactOptions(options, settings, `${msg} 대신 쿠폰명·매핑자료 매칭 ${options.length}건`);
        return Boolean(options.length);
      }
      if (showMessage) {
        setCouponMessage(`${msg} 현재 주문·매핑자료에서도 선택 쿠폰명과 일치하는 옵션을 찾지 못했습니다.`);
        setMessage(`${msg} 현재 주문·매핑자료에서도 선택 쿠폰명과 일치하는 옵션을 찾지 못했습니다.`);
      }
      return false;
    } catch (error) {
      const options = selectedCouponOptionRows(currentCoupangOptionMasterRows, settings);
      if (options.length) {
        applyCouponRowsFromExactOptions(options, settings, `쿠팡 적용상품 API 실패: ${String(error)} / 쿠폰명·매핑자료 매칭 ${options.length}건`);
        return true;
      }
      if (showMessage) {
        const msg = `쿠팡 적용상품 조회 실패: ${String(error)}. 선택 쿠폰명과 일치하는 옵션도 없습니다.`;
        setCouponMessage(msg);
        setMessage(msg);
      }
      return false;
    }
  }

  function deleteDailyCouponSelection() {
    clearAllRollingCouponTemplates();
    setMessage("모든 쿠폰 반복 설정을 삭제했습니다. 서버 저장 전까지는 현재 브라우저 화면 기준 변경입니다.");
  }

  async function checkCoupangCouponRequestedId() {
    const requestedId = window.prompt("확인할 쿠팡 requestedId를 입력하세요. 신규 쿠폰 생성 후 응답받은 작업번호입니다.");
    if (!requestedId) return;
    try {
      const result = await callApi("/api/integrations/coupang/coupons/request-status", {
        query: { requestedId },
        manual: true,
      });
      const row = result.summary?.row as Record<string, unknown> | undefined;
      const couponId = cleanId(row?.couponId);
      if (couponId) {
        updateCouponApiSettings({
          selectedCouponId: couponId,
          selectedCouponName: text(row?.type) || `couponId ${couponId}`,
          selectedMode: "existing",
        });
      }
      const msg = result.message || "쿠팡 요청상태 확인을 완료했습니다.";
      setCouponMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `쿠팡 요청상태 확인 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
    }
  }

  function removeCouponRow(id: string) {
    setCouponRows((rows) => rows.filter((row) => row.id !== id));
  }

  function addCouponRow(action: CouponAction = "apply") {
    setCouponRows((rows) => [
      makeCouponRow(action, "", "", "", "금액", 0, "", "", ""),
      ...rows,
    ]);
  }

  function recordCouponHistory(action?: CouponAction) {
    const targets = couponExecutionCheckRows.filter(
      (row) => row.executeStatus === "대기" && (!action || row.action === action),
    );
    if (!targets.length) {
      const label = action ? couponActionLabel(action) : "실행";
      setCouponMessage(`쿠폰 ${label} 기록 대상이 없습니다. 기본검증·쿠폰검증·중복이력을 확인하세요.`);
      return;
    }
    setCouponHistory((prev) => {
      const seen = new Set(prev.map((row) => couponHistoryKey(row)));
      const added: CouponHistoryRow[] = [];
      for (const row of targets) {
        const key = couponHistoryKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        added.push(makeCouponHistoryRow(row, "preview"));
      }
      setCouponMessage(`쿠폰 실행이력 ${added.length}건을 기록했습니다. 같은 쿠폰은 다음 실행에서 중복으로 차단됩니다.`);
      setMessage(`쿠폰 실행이력 ${added.length}건 기록, 중복 쿠폰 자동 차단 기준을 갱신했습니다.`);
      return [...prev, ...added];
    });
  }

  async function runCouponAction(action: "cancel" | "apply") {
    try {
      const generatedRows = action === "cancel" ? dailyCouponCancelRows : dailyCouponApplyRows;
      const fallbackRows = couponRows
        .filter((row) => row.action === action)
        .map((row) => {
          const window = dailyCouponWindow(schedules, action === "cancel" ? -1 : 0);
          return {
            ...row,
            action,
            startAt: window.startAt,
            endAt: window.endAt,
            memo: action === "cancel"
              ? `매일 ${window.endTime} 강제 취소 대상`
              : `매일 ${window.startTime} 등록 후 다음 ${window.endTime} 취소 대상`,
          };
        });
      const manualRows = couponRows.filter((row) => row.action === action);
      const selectedRows = manualRows.length ? fallbackRows : generatedRows;

      if (!selectedRows.length) {
        const label = action === "cancel" ? "강제 취소" : "등록";
        setCouponMessage(`쿠팡 즉시할인쿠폰 ${label} 대상 행이 없습니다. 쿠폰양식을 등록하거나 현재옵션 반영을 먼저 실행하세요.`);
        setMessage(`쿠팡 즉시할인쿠폰 ${label} 대상 행이 없습니다.`);
        return;
      }

      const validationRows = validateCouponRows(selectedRows);
      const profitRowsForAction = analyzeCouponProfitRows(selectedRows, couponProfitSourceRows);
      const monthlyRowsForAction: CouponMonthlyImpactRow[] = [];
      const selectedCheckRows = buildCouponExecutionCheckRows(
        selectedRows,
        validationRows,
        profitRowsForAction,
        monthlyRowsForAction,
        couponHistory,
      );
      const blockedRows = selectedCheckRows.filter((row) => row.executeStatus === "차단");
      const duplicateRows = selectedCheckRows.filter((row) => row.executeStatus === "중복");
      const readyRows = selectedCheckRows.filter((row) => row.executeStatus === "대기");

      if (blockedRows.length) {
        const label = action === "cancel" ? "강제 취소" : "등록";
        setCouponMessage(
          `쿠팡 즉시할인쿠폰 ${label} 실행 차단: 기본검증·쿠폰검증 확인필요 ${blockedRows.length}건이 있습니다.`,
        );
        setMessage(`쿠폰 ${label} 차단: 확인필요 ${blockedRows.length}건`);
        return;
      }
      if (action === "apply" && duplicateRows.length && !readyRows.length) {
        setCouponMessage("쿠팡 즉시할인쿠폰 등록 대상이 모두 오늘 설정시간 기준 중복입니다. 재등록하지 않습니다.");
        setMessage(`쿠폰 등록 중복 차단: ${duplicateRows.length}건`);
        return;
      }

      const apiSettingsForAction = couponApiSettingsForRun();
      const result = await callApi("/api/integrations/coupons/action-preview", {
        action,
        rows: readyRows,
        skippedDuplicateRows: duplicateRows.length,
        scheduledTime:
          action === "cancel"
            ? schedules.couponCancel.time
            : schedules.couponApply.time,
        forceCancel: action === "cancel",
        daily24h: true,
        manual: true,
        couponApiSettings: apiSettingsForAction,
      });
      const generatedCouponIds = normalizeCouponIdList(result.summary?.generatedCouponIds);
      const generatedCouponRecords = Array.isArray(result.summary?.generatedCouponRecords) ? result.summary?.generatedCouponRecords : [];
      const canceledCouponIds = normalizeCouponIdList(result.summary?.canceledCouponIds);
      if (generatedCouponIds.length || generatedCouponRecords.length) {
        updateRollingTemplatesFromGeneratedRecords(generatedCouponRecords, generatedCouponIds);
      }
      if (canceledCouponIds.length) {
        const canceledSet = new Set(canceledCouponIds.map(cleanId));
        setRollingCouponTemplates((templates) => normalizeRollingCouponTemplates(templates.map((template) =>
          canceledSet.has(cleanId(template.latestCouponId || template.sourceCouponId))
            ? { ...template, lastCanceledAt: new Date().toISOString() }
            : template,
        )));
        updateCouponApiSettings({
          lastCancelCouponIds: canceledCouponIds,
          lastCanceledAt: new Date().toISOString(),
        });
      }

      if (result.ok !== false && readyRows.length) {
        const historySource: CouponHistoryRow["source"] = result.externalApiExecuted ? "api" : "preview";
        setCouponHistory((prev) => {
          const seen = new Set(prev.map((row) => couponHistoryKey(row)));
          const added: CouponHistoryRow[] = [];
          for (const row of readyRows) {
            const key = couponHistoryKey(row);
            if (seen.has(key)) continue;
            seen.add(key);
            added.push(makeCouponHistoryRow(row, historySource));
          }
          return added.length ? [...prev, ...added] : prev;
        });
      }
      const label = action === "cancel" ? "강제 취소" : "일괄 적용";
      const historyNote = readyRows.length
        ? ` 실행이력 ${readyRows.length}건도 자동 기록했습니다.`
        : "";
      const generatedNote = generatedCouponIds.length
        ? ` 신규 couponId ${generatedCouponIds.join(", ")}가 저장되었습니다. 다음 취소 기준으로 사용됩니다.`
        : "";
      const messageText = result.message
        ? `${result.message}${historyNote}${generatedNote}`
        : `쿠팡 즉시할인쿠폰 ${label} 실행 완료. 설정시간 ${action === "cancel" ? schedules.couponCancel.time : schedules.couponApply.time}, 실행대상 ${readyRows.length}건, 중복제외 ${duplicateRows.length}건입니다.${historyNote}${generatedNote}`;
      setCouponMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      setCouponMessage(`쿠폰 실행 실패: ${String(error)}`);
      setMessage(`쿠폰 실행 실패: ${String(error)}`);
    }
  }

  async function runSchedulerPreview() {
    try {
      const result = await callApi("/api/scheduler/run-preview", {
        schedules,
        manual: true,
      });
      setMessage(
        result.message || "스케줄러 자동 실행 Preview를 완료했습니다.",
      );
    } catch (error) {
      setMessage(`스케줄러 Preview 실패: ${String(error)}`);
    }
  }

  async function checkStorage() {
    try {
      const result = await callApi("/api/storage/status");
      setServerMessage(
        result.message || "서버 용량 점검 Preview를 완료했습니다.",
      );
    } catch (error) {
      setServerMessage(`서버 용량 점검 실패: ${String(error)}`);
    }
  }

  async function cleanupStorage() {
    try {
      const result = await callApi("/api/storage/cleanup", {
        sessionKey,
        manual: true,
      });
      setServerMessage(
        result.message || "서버 만료 정리 요청을 완료했습니다.",
      );
    } catch (error) {
      setServerMessage(`서버 정리 실패: ${String(error)}`);
    }
  }

  async function saveToServer() {
    try {
      const data: TempPayload = {
        mappings,
        tossOptionIdRows: normalizeTossOptionIdRows(tossOptionIdRows),
        coupangOptionMasterRows: normalizeCoupangOptionMasterRows(coupangOptionMasterRows),
        orders,
        invoiceRecords,
        purchaseHistory,
        purchaseTemplates: normalizePurchaseTemplates(purchaseTemplates),
        invoiceTemplates,
        shipmentTemplates: normalizeShipmentTemplates(shipmentTemplates),
        channelPurchaseTemplates: normalizeChannelPurchaseTemplates(channelPurchaseTemplates),
              couponRows,
        couponHistory,
        b2bVendorLinks: normalizeB2BVendorLinks(b2bVendorLinks),
        folderNames,
        schedules,
        sessionKey,
        settingsKey,
        savedAt: new Date().toISOString(),
      };
      const result = await callApi("/api/operation/simple-temp/save", {
        sessionKey,
        expiresInHours: 24,
        data,
      });
      setServerMessage(
        result.message || "서버에 1일 임시저장 요청을 완료했습니다.",
      );
    } catch (error) {
      setServerMessage(`서버 저장 실패: ${String(error)}`);
    }
  }

  async function loadFromServer() {
    try {
      const result = await callApi(
        `/api/operation/simple-temp/load?sessionKey=${encodeURIComponent(sessionKey)}`,
      );
      if (!result?.ok || !result?.data) {
        setServerMessage(result?.message || "불러올 서버 임시자료가 없습니다.");
        return;
      }
      applyServerPayload(result.data);
      setServerMessage(result.message || "서버 임시자료를 불러왔습니다.");
    } catch (error) {
      setServerMessage(`서버 불러오기 실패: ${String(error)}`);
    }
  }

  async function loadLatestFromServer() {
    try {
      const result = await callApi("/api/operation/simple-temp/latest");
      if (!result?.ok || !result?.data) {
        setServerMessage(
          result?.message || "Supabase에 불러올 최신 임시자료가 없습니다.",
        );
        return;
      }
      applyServerPayload({
        ...result.data,
        sessionKey: result.sessionKey || result.data.sessionKey,
      });
      setServerMessage(
        result.message || "Supabase 최신 임시자료를 불러왔습니다.",
      );
    } catch (error) {
      setServerMessage(`최신 불러오기 실패: ${String(error)}`);
    }
  }

  async function loadSupabaseOrdersAndCheckMapping() {
    try {
      const result = await callApi("/api/operation/simple-temp/latest-orders");
      const loadedOrders = Array.isArray(result?.data?.orders)
        ? result.data.orders
        : [];
      if (!result?.ok || !loadedOrders.length) {
        const fallbackMessage =
          result?.message ||
          "Supabase에서 매핑검사용 주문자료를 찾지 못했습니다.";
        setMappingCheckSummary(EMPTY_MAPPING_CHECK);
        setMappingCheckMessage(fallbackMessage);
        setServerMessage(fallbackMessage);
        return;
      }
      setOrders(loadedOrders);
      const summary = summarizeMappingCheck(
        loadedOrders,
        mappings,
        result.sessionKey || result.data?.sessionKey || "",
      );
      setMappingCheckSummary(summary);
      const checkMessage = `Supabase 주문 ${summary.totalOrders}건을 불러와 현재 매핑 기준으로 검사했습니다. 매칭완료 ${summary.matched}건, 미매핑 ${summary.unmatched}건, 발주업체 ${summary.vendors}곳입니다.`;
      setMappingCheckMessage(checkMessage);
      setServerMessage(
        `${checkMessage} 기준 키: ${summary.sourceSession || "최신 주문자료"}`,
      );
      setMessage(checkMessage);
      setActiveMenu("발주관리");
    } catch (error) {
      const errorMessage = `Supabase 주문자료 매핑검사 실패: ${String(error)}`;
      setMappingCheckMessage(errorMessage);
      setServerMessage(errorMessage);
    }
  }

  async function syncAndCleanupServer() {
    try {
      const loaded = await callApi("/api/operation/simple-temp/latest");
      let loadMessage = loaded?.message || "Supabase 최신자료 확인 완료";
      if (loaded?.ok && loaded?.data) {
        applyServerPayload({
          ...loaded.data,
          sessionKey: loaded.sessionKey || loaded.data.sessionKey,
        });
      }
      const cleaned = await callApi("/api/storage/cleanup", {
        sessionKey,
        manual: true,
      });
      setServerMessage(
        `${loadMessage} / ${cleaned.message || "만료 정리를 완료했습니다."}`,
      );
    } catch (error) {
      setServerMessage(`Supabase 불러오기·정리 실패: ${String(error)}`);
    }
  }

  async function checkPublicIp() {
    try {
      const result = await callApi("/api/system/public-ip");
      const rawRows = Array.isArray(result.summary?.rows)
        ? result.summary?.rows
        : [];
      const rows = rawRows.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          item: String(row.item || ""),
          status: String(row.status || ""),
          detail: String(row.detail || ""),
        } satisfies PublicIpViewRow;
      });
      setPublicIpRows(rows);
      setServerMessage(result.message || "IP 확인을 완료했습니다.");
      setMessage(result.message || "IP 확인을 완료했습니다.");
      const ip = String(result.summary?.outboundIp || "");
      if (ip) {
        setApiDiagnosticRows([
          {
            channel: "공통",
            step: "현재 API 호출 IP",
            status: "등록필요",
            detail: `${ip} / 쿠팡·토스 허용 IP에 등록 후 다시 진단하세요.`,
          },
          {
            channel: "쿠팡",
            step: "IP 허용",
            status: "확인필요",
            detail: `쿠팡 Open API 연동정보 허용 IP에 ${ip} 등록이 필요합니다.`,
          },
          {
            channel: "토스",
            step: "IP 허용",
            status: "확인필요",
            detail: `토스쇼핑 FEP 자체개발/API 호출 허용 IP에 ${ip} 등록이 필요합니다.`,
          },
        ]);
      }
    } catch (error) {
      const detail = `IP 확인 실패: ${String(error)}`;
      setPublicIpRows([{ item: "현재 API 호출 IP", status: "실패", detail }]);
      setServerMessage(detail);
      setMessage(detail);
    }
  }

  async function checkSupabaseConnection() {
    try {
      const result = await callApi("/api/system/connection-check");
      setServerMessage(result.message || "DB 확인을 완료했습니다.");
      setMessage(result.message || "DB 확인을 완료했습니다.");
    } catch (error) {
      setServerMessage(`DB 확인 실패: ${String(error)}`);
      setMessage(`DB 확인 실패: ${String(error)}`);
    }
  }

  async function checkServerOperation() {
    try {
      const result = await callApi("/api/system/server-operation-check");
      const rawChecks = Array.isArray(result.summary?.checks)
        ? result.summary?.checks
        : [];
      const rows = rawChecks.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          item: String(row.name || ""),
          status: String(row.status || ""),
          detail: String(row.detail || ""),
        };
      });
      setServerOperationRows(rows);
      setServerMessage(result.message || "서버 점검을 완료했습니다.");
      setMessage(result.message || "서버 점검을 완료했습니다.");
    } catch (error) {
      setServerOperationRows([
        { item: "서버 점검", status: "실패", detail: String(error) },
      ]);
      setServerMessage(`서버 점검 실패: ${String(error)}`);
      setMessage(`서버 점검 실패: ${String(error)}`);
    }
  }

  async function saveOperationLog() {
    try {
      const result = await callApi("/api/operation/logs/save", {
        eventType: "manual_operation_checkpoint",
        payload: {
          appVersion: APP_VERSION,
          orders: orders.length,
          matched: purchaseRows.filter((row) => row.matchStatus === "매칭완료")
            .length,
          unmatched: missingMappings.length,
          invoiceReady: readyInvoiceRows.length,
          couponRisk: invalidCouponRows.length + couponProfitBlockRows.length + couponMonthlyRiskRows.length,
          checkedAt: new Date().toISOString(),
        },
      });
      setServerMessage(result.message || "서버 운영로그를 저장했습니다.");
      setMessage(result.message || "서버 운영로그를 저장했습니다.");
    } catch (error) {
      setServerMessage(`서버 로그 저장 실패: ${String(error)}`);
      setMessage(`서버 로그 저장 실패: ${String(error)}`);
    }
  }

  async function loadLatestOperationLogs() {
    try {
      const result = await callApi("/api/operation/logs/latest");
      const rawLogs = Array.isArray(result.data) ? result.data : [];
      const rows = rawLogs.map((item) => {
        const row = item as Record<string, unknown>;
        const payload =
          row.payload && typeof row.payload === "object"
            ? (row.payload as Record<string, unknown>)
            : {};
        const summary =
          [
            payload.orders !== undefined ? `주문 ${payload.orders}` : "",
            payload.matched !== undefined ? `매칭 ${payload.matched}` : "",
            payload.unmatched !== undefined
              ? `미매핑 ${payload.unmatched}`
              : "",
            payload.couponRisk !== undefined
              ? `쿠폰확인 ${payload.couponRisk}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ") || JSON.stringify(payload).slice(0, 80);
        return {
          id: String(row.id || ""),
          eventType: String(row.event_type || row.eventType || ""),
          createdAt: String(row.created_at || row.createdAt || ""),
          summary,
        };
      });
      setOperationLogRows(rows);
      setServerMessage(
        result.message || `최근 운영로그 ${rows.length}건을 확인했습니다.`,
      );
      setMessage(
        result.message || `최근 운영로그 ${rows.length}건을 확인했습니다.`,
      );
    } catch (error) {
      setOperationLogRows([
        {
          id: "-",
          eventType: "logs_latest_failed",
          createdAt: new Date().toISOString(),
          summary: String(error),
        },
      ]);
      setServerMessage(`로그 확인 실패: ${String(error)}`);
      setMessage(`로그 확인 실패: ${String(error)}`);
    }
  }

  function clearOneDayWork() {
    setOrders([]);
    setInvoiceRecords([]);
    setMessage(
      "주문/송장 임시자료를 초기화했습니다. 매핑과 양식설정은 유지했습니다.",
    );
  }

  function updateSchedule(
    key: ScheduleKey,
    patch: Partial<ScheduleConfig[ScheduleKey]>,
  ) {
    setSchedules((prev) => {
      const next = {
        ...prev,
        [key]: { ...prev[key], ...patch },
      } as ScheduleConfig;
      return normalizeSchedules(next);
    });
  }

  function pauseSchedulerTemporarily() {
    setSchedules((prev) =>
      normalizeSchedules({
        couponCancel: { ...prev.couponCancel, enabled: false },
        couponApply: { ...prev.couponApply, enabled: false },
        storageCleanup: { ...prev.storageCleanup, enabled: false },
      }),
    );
    setMessage("스케줄러 자동 실행을 모두 잠시 OFF로 전환했습니다. 수동 실행 버튼은 계속 사용할 수 있습니다.");
  }

  function restoreRecommendedSchedules() {
    setSchedules(normalizeSchedules(DEFAULT_SCHEDULES));
    setMessage("권장 자동시간을 복원했습니다. 쿠폰 23:50 취소, 23:51 적용, 저장소 03:20 정리 기준입니다.");
  }

  function saveScheduleSettingsToBrowser() {
    const payload = createPersistentSettingsPayload();
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...payload, schedules }),
    );
    setSettingsMessage("스케줄 시간을 브라우저 최신 설정으로 저장했습니다. 서버 자동 실행에도 쓰려면 서버 저장도 눌러 주세요.");
    setMessage("스케줄 시간 저장 완료: 수동 버튼은 항상 사용 가능하고 자동 실행은 사용/OFF 값에 따릅니다.");
  }

  function renderFileAccessPanel(kind: BrowserFolderKind, title: string) {
    const files = recentLocalFiles[kind] || [];
    return (
      <section className="file-access-panel">
        <div className="file-access-head">
          <div>
            <strong>{title}</strong>
            <span>{folderNames[kind] ? `PC 저장위치: ${folderNames[kind]}` : "PC 폴더 미확인"}</span>
          </div>
          <div className="file-access-actions">
            <button type="button" className="secondary" onClick={() => refreshManagedFiles(kind)}>
              파일목록
            </button>
            <button type="button" className="btn-download" onClick={() => downloadManagedZip(kind)}>
              ZIP 다운로드
            </button>
            <button type="button" className="btn-folder desktop-only" onClick={() => openManagedFolder(kind)}>
              PC 폴더 열기
            </button>
          </div>
        </div>
        {files.length > 0 ? (
          <div className="file-list-grid">
            {files.slice(0, 12).map((file) => (
              <article className="file-list-item" key={`${kind}-${file.filename}-${file.modifiedAt}`}>
                <div>
                  <strong>{file.filename}</strong>
                  <span>{formatDateTimeShort(file.modifiedAt)} · {formatBytes(file.size)}</span>
                </div>
                <button type="button" className="btn-download" onClick={() => downloadManagedFile(kind, file.filename)}>
                  다운로드
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="mobile-file-help">PC에서는 폴더 열기를 사용할 수 있고, 모바일에서는 파일목록을 누른 뒤 개별 다운로드 또는 ZIP 다운로드를 사용합니다.</p>
        )}
      </section>
    );
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">B2B Operation ERP</p>
          <h1>{APP_VERSION}</h1>
          <p>
            모바일 기본 흐름은 주문수집 → 매핑확인 → 발주 ZIP 다운로드 → 송장처리입니다. PC 로컬폴더 저장은 보조 기능이며, 모바일·클라우드에서는 브라우저 다운로드와 Supabase 저장을 우선 사용합니다.
          </p>
        </div>
        <div className="gate-card">
          <strong>안전 Gate</strong>
          <span>외부 API 실행 {String(SAFETY.externalApiExecuted)}</span>
          <span>
            최종등록 차단 {String(SAFETY.finalExecutionStillDisabled)}
          </span>
          <span>스케줄 쓰기 차단 {String(SAFETY.ALLOW_SCHEDULED_WRITES)}</span>
        </div>
      </header>

      <nav className="tabs" aria-label="주요 메뉴">
        {MENUS.map((menu) => (
          <button
            key={menu}
            type="button"
            className={activeMenu === menu ? "active" : ""}
            onClick={() => setActiveMenu(menu)}
          >
            {menu}
          </button>
        ))}
      </nav>

      <section className="notice" aria-live="polite">
        {message}
      </section>

      {activeMenu === "간편운영" && (
        <>
          <section className="panel hero-panel">
            <div>
              <h2>운영 흐름</h2>
              <p>
                모바일 운영은 쿠팡·토스 수집 → 미매핑 확인 → 매핑 저장 → 발주 ZIP 다운로드 순서입니다. PC 전용 폴더 저장, 폴더 열기, START_HERE_WINDOWS.cmd는 보조 기능으로만 사용합니다.
              </p>
            </div>
            <div className="flow-grid">
              <button
                type="button"
                className="btn-api"
                onClick={() => collectApiOrders("쿠팡")}
              >
                쿠팡 수집
              </button>
              <button
                type="button"
                className="btn-api"
                onClick={() => collectApiOrders("토스")}
              >
                토스 수집
              </button>
              <button
                type="button"
                className="btn-api"
                onClick={collectBothApiOrders}
              >
                쿠팡+토스 수집
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => refreshManagedFiles("purchase")}
              >
                발주파일
              </button>
              <label className="file-button btn-upload">
                업체송장
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv"
                  multiple
                  onChange={handleVendorShipmentFilesToPurchase}
                />
              </label>
              <button
                type="button"
                className="btn-run"
                onClick={() => setActiveMenu("주문관리")}
              >
                업로드
              </button>
              <button
                type="button"
                className="btn-warning"
                onClick={() => runCouponAction("cancel")}
              >
                쿠폰 취소
              </button>
              <button
                type="button"
                className="btn-run"
                onClick={() => runCouponAction("apply")}
              >
                쿠폰 적용
              </button>
              <button
                type="button"
                className="secondary"
                onClick={pauseSchedulerTemporarily}
              >
                스케줄 OFF
              </button>
            </div>
          </section>
          <section className="panel daily-board-panel">
            <PanelHead
              title="오늘 할 일"
              desc="주요 운영 상태를 확인합니다."
            />
            <DataTable
              headers={["단계", "상태", "내용"]}
              rows={dailyOperationRows.map((row) => [row.item, row.status, row.detail])}
            />
            <div className="actions mobile-priority-actions">
              <button type="button" className="btn-api" onClick={() => collectApiOrders("쿠팡")}>쿠팡 수집</button>
              <button type="button" className="btn-api" onClick={() => collectApiOrders("토스")}>토스 수집</button>
              <button type="button" className="btn-api" onClick={collectBothApiOrders}>쿠팡+토스 수집</button>
              <button type="button" className="secondary" onClick={() => refreshManagedFiles("purchase")}>발주파일</button>
              <label className="file-button btn-upload">업체송장<input type="file" accept=".xlsx,.xls,.csv,text/csv" multiple onChange={handleVendorShipmentFilesToPurchase} /></label>
                            <button type="button" className="btn-warning" onClick={addMissingMappingsFromCurrentOrders}>미매핑</button>
              <button type="button" className="btn-check" onClick={runPurchasePreflight}>검증</button>
              <button type="button" className="btn-run" onClick={() => setActiveMenu("주문관리")}>주문관리</button>
              <button type="button" className="btn-warning" onClick={() => setActiveMenu("쿠폰관리")}>쿠폰</button>
            </div>
          </section>
          <section className="metrics">
            <div>
              <span>주문</span>
              <strong>{orders.length}</strong>
            </div>
            <div>
              <span>매핑완료</span>
              <strong>
                {
                  purchaseRows.filter((row) => row.matchStatus === "매칭완료")
                    .length
                }
              </strong>
            </div>
            <div>
              <span>미매핑</span>
              <strong>{missingMappings.length}</strong>
            </div>
            <div>
              <span>발주업체</span>
              <strong>{Object.keys(vendorGroups).length}</strong>
            </div>
            <div>
              <span>송장등록 준비</span>
              <strong>{readyInvoiceRows.length}</strong>
            </div>
            <div>
              <span>쿠폰검증</span>
              <strong>{couponProfitBlockRows.length}</strong>
            </div>
          </section>
          <section className="panel mobile-check-panel">
            <PanelHead
              title="모바일 빠른 점검"
              desc="모바일 핵심 확인 항목입니다."
            />
            <section className="metrics compact-metrics">
              <div>
                <span>미매핑</span>
                <strong>{missingMappings.length.toLocaleString()}건</strong>
              </div>
              <div>
                <span>송장필요</span>
                <strong>
                  {invoicePreviewRows
                    .filter((row) => row.status === "확인필요")
                    .length.toLocaleString()}
                  건
                </strong>
              </div>
              <div>
                <span>쿠폰필요</span>
                <strong>{(invalidCouponRows.length + couponProfitBlockRows.length + couponMonthlyRiskRows.length).toLocaleString()}건</strong>
              </div>
            </section>
            <div className="actions mobile-priority-actions">
              <button
                type="button"
                className="btn-nav"
                onClick={addMissingMappingsFromCurrentOrders}
              >
                미매핑 추가
              </button>
              <button
                type="button"
                className="btn-nav"
                onClick={() => setActiveMenu("주문관리")}
              >
                송장
              </button>
              <button
                type="button"
                className="btn-warning"
                onClick={() => setActiveMenu("쿠폰관리")}
              >
                쿠폰
              </button>
              <button
                type="button"
                className="btn-download"
                onClick={exportMissingMappings}
              >
                미매핑 파일
              </button>
              <button
                type="button"
                className="btn-run"
                onClick={recheckCurrentMappings}
              >
                재검사
              </button>
            </div>
          </section>
          {missingMappings.length > 0 && (
            <section className="panel missing-panel">
              <PanelHead
                title={`미매핑 주문 바로 확인 ${missingMappings.length}건`}
                desc="발주에서 제외되는 미매핑 주문입니다."
              />
              <div className="actions compact-actions">
                <button type="button" className="btn-warning" onClick={addMissingMappingsFromCurrentOrders}>
                  미매핑 추가
                </button>
                <button type="button" className="btn-download" onClick={exportMissingMappings}>
                  미매핑 파일
                </button>
                <button type="button" className="btn-run" onClick={recheckCurrentMappings}>
                  재검사
                </button>
              </div>
              <DataTable
                headers={["채널", "매핑기준", "주문번호", "내 판매상품명", "옵션명/옵션관리코드", "수량", "판매금액", "수취인", "주소"]}
                rows={missingMappingDisplayRows(purchaseRows)}
              />
            </section>
          )}
          <ServerPanel
            sessionKey={sessionKey}
            setSessionKey={setSessionKey}
            saveToServer={saveToServer}
            loadFromServer={loadFromServer}
            loadLatestFromServer={loadLatestFromServer}
            syncAndCleanupServer={syncAndCleanupServer}
            checkSupabaseConnection={checkSupabaseConnection}
            checkServerOperation={checkServerOperation}
            checkPublicIp={checkPublicIp}
            publicIpRows={publicIpRows}
            saveOperationLog={saveOperationLog}
            loadLatestOperationLogs={loadLatestOperationLogs}
            checkStorage={checkStorage}
            cleanupStorage={cleanupStorage}
            serverMessage={serverMessage}
            operationRows={serverOperationRows}
            operationLogRows={operationLogRows}
          />
          <SettingsPanel
            settingsKey={settingsKey}
            setSettingsKey={setSettingsKey}
            saveSettingsToBrowser={saveSettingsToBrowser}
            saveSettingsToServer={saveSettingsToServer}
            loadSettingsFromServer={loadSettingsFromServer}
            loadLatestSettingsFromServer={loadLatestSettingsFromServer}
            deleteSettingsFromServer={deleteSettingsFromServer}
            settingsMessage={settingsMessage}
          />
        </>
      )}

      {activeMenu === "주문관리" && (
        <section className="panel">
          <PanelHead
            title="주문관리"
            desc="수집·발주·송장 업로드"
          />
          <section className="folder-panel folder-panel-wide">
            <strong>발주 폴더</strong>
            <span>
              {folderNames.purchase
                ? `현재 PC 폴더: ${folderNames.purchase}`
                : "현재 PC 폴더: 미설정 · 미입력 시 다운로드/B2B_발주폴더 자동 생성"}
            </span>
            <input
              className="folder-path-input"
              value={localFolderPaths.purchase || ""}
              placeholder="예: C:\Users\LG\Downloads\B2B_발주폴더"
              onChange={(event) => setLocalFolderPaths((prev) => ({ ...prev, purchase: event.target.value }))}
            />
            <button type="button" className="btn-folder" onClick={() => saveLocalFolderPath("purchase")}>
              PC 폴더 저장
            </button>
            <button type="button" className="btn-folder desktop-only" onClick={() => openManagedFolder("purchase")}>
              PC 폴더 열기
            </button>
          </section>
          {renderFileAccessPanel("purchase", "발주파일 PC·모바일 다운로드")}
          <section className="notice">{folderMessage}</section>
          <div className="filter-box api-filter-box">
            <label>
              조회 시작일
              <input
                type="date"
                value={orderApiFilter.startDate}
                onChange={(event) =>
                  setOrderApiFilter((prev) => ({
                    ...prev,
                    startDate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              조회 종료일
              <input
                type="date"
                value={orderApiFilter.endDate}
                onChange={(event) =>
                  setOrderApiFilter((prev) => ({
                    ...prev,
                    endDate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              쿠팡 상태값
              <input
                value={orderApiFilter.coupangStatus}
                onChange={(event) =>
                  setOrderApiFilter((prev) => ({
                    ...prev,
                    coupangStatus: event.target.value,
                  }))
                }
                placeholder="결제완료: ACCEPT / 상품준비중: INSTRUCT"
              />
            </label>
            <label>
              토스 상태값
              <input
                value={orderApiFilter.tossStatus}
                onChange={(event) =>
                  setOrderApiFilter((prev) => ({
                    ...prev,
                    tossStatus: event.target.value,
                  }))
                }
                placeholder="결제완료: PAID / 상품준비중: PREPARING_PRODUCT"
              />
            </label>
            <label>
              토스 limit
              <input
                type="number"
                min={1}
                max={50}
                value={orderApiFilter.limit}
                onChange={(event) =>
                  setOrderApiFilter((prev) => ({
                    ...prev,
                    limit: Math.max(1, Math.min(50, Number(event.target.value) || 50)),
                  }))
                }
              />
            </label>
            <div className="quick-range-actions">
              <button type="button" className="secondary" onClick={() => applyOrderDateRange(1)}>오늘</button>
              <button type="button" className="secondary" onClick={() => applyOrderDateRange(7)}>최근 7일</button>
              <button type="button" className="btn-save" onClick={applyPaymentStatusPreset}>결제완료</button>
              <button type="button" className="btn-run" onClick={applyPreparingStatusPreset}>상품준비중</button>
            </div>
          </div>
          <div className="actions operation-actions">
            <button
              type="button"
              className="btn-api"
              onClick={() => collectApiOrders("쿠팡")}
            >
              쿠팡 수집
            </button>
            <button
              type="button"
              className="btn-api"
              onClick={() => collectApiOrders("토스")}
            >
              토스 수집
            </button>
            <button
              type="button"
              className="btn-api"
              onClick={collectBothApiOrders}
            >
              쿠팡+토스 수집
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => refreshManagedFiles("purchase")}
            >
              발주파일
            </button>
            <label className="file-button btn-upload">
              업체송장
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                multiple
                onChange={handleVendorShipmentFilesToPurchase}
              />
            </label>
            <button
              type="button"
              className="btn-warning"
              onClick={addMissingMappingsFromCurrentOrders}
            >
              미매핑
            </button>

            <button
              type="button"
              className="btn-api"
              onClick={runShipmentUploadAll}
            >
              쿠팡+토스 업로드
            </button>
            <button
              type="button"
              className="secondary"
              onClick={clearOneDayWork}
            >
              초기화
            </button>
          </div>
          <AdvancedDetails title="고급진단">
            <div className="actions advanced-actions">
              <button
                type="button"
                className="btn-server"
                onClick={() => diagnoseApiOrders("쿠팡", "purchase")}
              >
                쿠팡 진단
              </button>
              <button
                type="button"
                className="btn-server"
                onClick={() => diagnoseApiOrders("토스", "purchase")}
              >
                토스 진단
              </button>
              <button
                type="button"
                className="btn-server"
                onClick={() => diagnoseApiOrders("쿠팡", "invoice")}
              >
                쿠팡 송장진단
              </button>
              <button
                type="button"
                className="btn-server"
                onClick={() => diagnoseApiOrders("토스", "invoice")}
              >
                토스 송장진단
              </button>
              <button type="button" className="btn-check" onClick={checkPublicIp}>
                IP 확인
              </button>
              <button
                type="button"
                className="btn-run"
                onClick={() => collectApiOrders("쿠팡", "invoice")}
              >
                쿠팡 송장
              </button>
              <button
                type="button"
                className="btn-run"
                onClick={() => collectApiOrders("토스", "invoice")}
              >
                토스 송장
              </button>
              <button type="button" className="btn-download" onClick={exportAllPurchases}>
                전체 발주
              </button>
              <button type="button" className="btn-run" onClick={runShipmentUploadAll}>
                쿠팡+토스 업로드
              </button>
              <label className="file-button btn-upload">
                쿠팡 업로드
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv"
                  multiple
                  onChange={(event) => handleOrderImport(event, "쿠팡")}
                />
              </label>
              <label className="file-button btn-upload">
                토스 업로드
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv"
                  multiple
                  onChange={(event) => handleOrderImport(event, "토스")}
                />
              </label>
            </div>
          </AdvancedDetails>
          {apiDiagnosticRows.length > 0 && (
            <div className="diagnostic-panel">
              <h2>진단 결과</h2>
              <DataTable
                headers={["채널", "단계", "상태", "내용"]}
                rows={apiDiagnosticRows.map((row) => [
                  row.channel,
                  row.step,
                  row.status,
                  row.detail,
                ])}
              />
            </div>
          )}
          {orderCollectSummaryRows.length > 0 && (
            <div className="diagnostic-panel collect-summary-panel">
              <h2>주문수집 후 운영 요약</h2>
              <DataTable
                headers={["항목", "상태", "내용"]}
                rows={orderCollectSummaryRows.map((row) => [
                  row.item,
                  row.status,
                  row.detail,
                ])}
              />
            </div>
          )}
          {lastPurchaseExportRows.length > 0 && (
            <div className="diagnostic-panel collect-summary-panel">
              <h2>발주파일 생성 확인</h2>
              <DataTable
                headers={["업체/구분", "파일명", "건수", "채널", "발주수량", "저장/다운로드"]}
                rows={lastPurchaseExportRows}
              />
              <div className="actions">
                <button type="button" className="secondary" onClick={() => refreshManagedFiles("purchase")}>
                  발주파일 목록
                </button>
                <button type="button" className="btn-download" onClick={() => downloadManagedZip("purchase")}>
                  발주 ZIP
                </button>
              </div>
            </div>
          )}
          <DataTable
            headers={[
              "채널",
              "주문번호",
              "옵션ID/매핑기준",
              "상품명",
              "수량",
              "판매금액",
              "주문상태",
              "수취인",
              "주소",
              "파일",
            ]}
            rows={orders
              .slice(0, 300)
              .map((row) => [
                row.channel,
                row.orderNo,
                row.optionId,
                row.productName,
                row.qty,
                row.salePrice,
                row.orderStatus,
                row.receiverName,
                row.address,
                row.sourceFile,
              ])}
          />
        </section>
      )}

      {activeMenu === "매핑관리" && (
        <section className="panel">
          <PanelHead
            title="매핑관리"
            desc="매핑 엑셀 업로드, 미매핑 카드 확인, Supabase 서버 저장까지 한 화면에서 처리합니다."
          />
          <SettingsPanel
            settingsKey={settingsKey}
            setSettingsKey={setSettingsKey}
            saveSettingsToBrowser={saveSettingsToBrowser}
            saveSettingsToServer={saveSettingsToServer}
            loadSettingsFromServer={loadSettingsFromServer}
            loadLatestSettingsFromServer={loadLatestSettingsFromServer}
            deleteSettingsFromServer={deleteSettingsFromServer}
            settingsMessage={settingsMessage}
            compact
          />
          <div className="actions operation-actions">
            <label className="file-button btn-upload">
              매핑 업로드
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                onChange={handleMappingImport}
              />
            </label>
            <button type="button" className="btn-run" onClick={() => syncTossOptionIdsFromApi(true)}>
              토스 옵션
            </button>
            <button type="button" className="btn-warning" onClick={addMissingMappingsFromCurrentOrders}>
              미매핑
            </button>
            <button type="button" className="btn-run" onClick={recheckCurrentMappings}>
              재검사
            </button>
            <button type="button" className="btn-add" onClick={addMappingRow}>
              추가
            </button>
            <button type="button" className="btn-download" onClick={exportMissingMappings}>
              미매핑 파일
            </button>
          </div>
          {mappingCheckMessage && (
            <section className="info-box">
              <strong>매핑 검사</strong> <span className="muted">{mappingCheckMessage}</span>
              {mappingCheckSummary.length > 0 && (
                <DataTable
                  headers={["항목", "상태", "내용"]}
                  rows={mappingCheckSummary.map((row) => [row.item, row.status, row.detail])}
                />
              )}
            </section>
          )}
          <AdvancedDetails title="고급도구">
            <div className="actions advanced-actions">
              <button type="button" className="btn-download" onClick={downloadMappingTemplate}>
                양식 받기
              </button>
              <button type="button" className="btn-download" onClick={exportMapping}>
                매핑 받기
              </button>
              <label className="file-button btn-upload">
                옵션 보조
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv"
                  onChange={handleTossOptionIdImport}
                />
              </label>
              <button type="button" className="btn-download" onClick={exportTossOptionIdTemplate}>
                옵션 목록
              </button>
            </div>
          </AdvancedDetails>
          {missingMappings.length > 0 && (
            <section className="warning-box missing-guide-box">
              <strong>미매핑 {missingMappings.length}건이 발주에서 제외됩니다.</strong> 토스는 먼저 <strong>토스 옵션</strong>를 누르세요. 앱이 토스 상품 API에서 실제 옵션ID와 옵션관리코드를 가져와 주문을 자동 보정합니다. 엑셀 업로드는 API 동기화가 실패할 때만 쓰는 보조수단입니다. 업체상품명에는 내 판매상품명이 아니라 B2B 발주처 상품명을 입력하세요.
              <DataTable
                headers={["채널", "매핑기준", "내 판매상품명", "옵션명/옵션관리코드", "대표 주문번호", "입력할 내용"]}
                rows={missingMappingTargetDisplayRows(purchaseRows)}
              />
            </section>
          )}
          {tossOptionIdRows.length > 0 && (
            <section className="info-box">
              <strong>토스 실제 옵션ID 기준표 {tossOptionIdRows.length}건 적용 중</strong> <span className="muted">토스 상품 API 자동동기화 또는 보조 엑셀에서 가져온 기준입니다.</span>
              <DataTable
                headers={["상품ID", "실제 옵션ID", "옵션관리코드", "옵션명", "상품명"]}
                rows={tossOptionIdRows.slice(0, 20).map((row) => [row.productId || "-", row.optionId, row.managementCode || row.optionCode || "-", row.itemName || "-", row.productName || "-"])}
              />
            </section>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>채널</th>
                  <th>매핑기준<br />(옵션ID/옵션관리코드)</th>
                  <th>업체명</th>
                  <th>코드번호</th>
                  <th>업체상품명</th>
                  <th>원가</th>
                  <th>기본수량</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <select
                        value={row.channel}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            channel: event.target.value as Channel,
                          })
                        }
                      >
                        <option>쿠팡</option>
                        <option>토스</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.optionId}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            optionId: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.vendorName}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            vendorName: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.vendorCode}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            vendorCode: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.vendorProductName}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            vendorProductName: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.cost}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            cost: toNumber(event.target.value, 0),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={row.baseQty}
                        onChange={(event) =>
                          updateMapping(row.id, {
                            baseQty: toNumber(event.target.value, 1),
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeMappingRow(row.id)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeMenu === "양식설정" && (
        <section className="panel">
          <PanelHead
            title="양식설정"
            desc="발주·송장 양식을 등록·수정합니다."
          />
          <SettingsPanel
            settingsKey={settingsKey}
            setSettingsKey={setSettingsKey}
            saveSettingsToBrowser={saveSettingsToBrowser}
            saveSettingsToServer={saveSettingsToServer}
            loadSettingsFromServer={loadSettingsFromServer}
            loadLatestSettingsFromServer={loadLatestSettingsFromServer}
            deleteSettingsFromServer={deleteSettingsFromServer}
            settingsMessage={settingsMessage}
            compact
          />
          <div className="actions">
            <button
              type="button"
              className="btn-save"
              onClick={saveSettingsToBrowser}
            >
              브라우저 저장
            </button>
            <button
              type="button"
              className="btn-save"
              onClick={saveSettingsToServer}
            >
              서버 저장
            </button>
            <label className="file-button btn-add">
              업체 엑셀 추가
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                onChange={handlePurchaseTemplateImport}
              />
            </label>
            <label className="file-button btn-add">
              송장엑셀 양식 추가
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                onChange={handleInvoiceTemplateImport}
              />
            </label>
          </div>
          <h2>발주 양식 열 설정</h2>
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>사용</th>
                  <th>업체명</th>
                  <th>시작행</th>
                  <th>주문번호</th>
                  <th>옵션ID</th>
                  <th>코드번호</th>
                  <th>업체상품명</th>
                  <th>수량</th>
                  <th>수취인</th>
                  <th>전화</th>
                  <th>우편</th>
                  <th>주소</th>
                  <th>메모</th>
                  <th>내 업체명</th>
                  <th>내 주소</th>
                  <th>내 전화</th>
                  <th>내 우편</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {purchaseTemplates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={tpl.enabled}
                        onChange={(event) =>
                          updatePurchaseTemplate(tpl.id, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={tpl.vendorName}
                        onChange={(event) =>
                          updatePurchaseTemplate(tpl.id, {
                            vendorName: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={tpl.startRow || tpl.headerRows.length + 1}
                        onChange={(event) =>
                          updatePurchaseTemplate(tpl.id, {
                            startRow: toNumber(
                              event.target.value,
                              tpl.headerRows.length + 1,
                            ),
                          })
                        }
                      />
                    </td>
                    {(
                      [
                        "orderNo",
                        "optionId",
                        "vendorCode",
                        "vendorProductName",
                        "purchaseQty",
                        "receiverName",
                        "receiverPhone",
                        "zip",
                        "address",
                        "memo",
                        "senderName",
                        "senderAddress",
                        "senderPhone",
                        "senderZip",
                      ] as Array<keyof PurchaseTemplateSetting["columns"]>
                    ).map((field) => (
                      <td key={field}>
                        <input
                          value={tpl.columns[field]}
                          onChange={(event) =>
                            updatePurchaseTemplate(tpl.id, {
                              columns: {
                                [field]: event.target.value,
                              } as Partial<PurchaseTemplateSetting["columns"]>,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setPurchaseTemplates((rows) =>
                            rows.filter((row) => row.id !== tpl.id),
                          )
                        }
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>쿠팡·토스 발주양식 설정</h2>
          <section className="notice">
            쿠팡/토스 채널별 발주자료를 한 파일로 따로 내려받을 때 쓰는
            양식입니다. 업체별 B2B 발주양식과 별도로 저장됩니다.
          </section>
          <div className="template-card-grid">
            {channelPurchaseTemplates.map((tpl) => (
              <article key={tpl.id} className="template-editor">
                <div className="template-editor-head">
                  <strong>{tpl.channel} 발주양식</strong>
                  <label>
                    사용{" "}
                    <input
                      type="checkbox"
                      checked={tpl.enabled}
                      onChange={(event) =>
                        updateChannelPurchaseTemplate(tpl.id, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="inline-form">
                  <label>
                    데이터 시작행
                    <input
                      type="number"
                      min="1"
                      value={tpl.startRow}
                      onChange={(event) =>
                        updateChannelPurchaseTemplate(tpl.id, {
                          startRow: toNumber(
                            event.target.value,
                            tpl.headerRows.length + 1,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => resetChannelPurchaseTemplate(tpl.channel)}
                  >
                    기본 복원
                  </button>
                  <button
                    type="button"
                    className="btn-save"
                    onClick={saveSettingsToBrowser}
                  >
                    브라우저 저장
                  </button>
                  <button
                    type="button"
                    className="btn-save"
                    onClick={saveSettingsToServer}
                  >
                    서버 저장
                  </button>
                </div>
                <label className="textarea-label">
                  헤더/안내행
                  <textarea
                    rows={4}
                    value={rowsToTextarea(tpl.headerRows)}
                    onChange={(event) =>
                      updateChannelPurchaseTemplate(tpl.id, {
                        headerRows: textareaToRows(event.target.value),
                      })
                    }
                  />
                </label>
                <div className="field-grid">
                  {(
                    [
                      "channel",
                      "orderNo",
                      "optionId",
                      "vendorName",
                      "vendorCode",
                      "vendorProductName",
                      "purchaseQty",
                      "receiverName",
                      "receiverPhone",
                      "zip",
                      "address",
                      "memo",
                      "cost",
                      "salePrice",
                    ] as Array<keyof ChannelPurchaseTemplateSetting["columns"]>
                  ).map((field) => (
                    <label key={field}>
                      {field}
                      <input
                        value={tpl.columns[field]}
                        onChange={(event) =>
                          updateChannelPurchaseTemplate(tpl.id, {
                            columns: { [field]: event.target.value } as Partial<
                              ChannelPurchaseTemplateSetting["columns"]
                            >,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="muted">
                  열 문자는 A, B, C 형식으로 입력합니다. 현재 목록 그대로
                  저장되며 삭제된 항목은 다음 불러오기에도 제외됩니다.
                </p>
              </article>
            ))}
          </div>
          <h2>송장 회수 양식 열 설정</h2>
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>사용</th>
                  <th>업체명</th>
                  <th>헤더행</th>
                  <th>시작행</th>
                  <th>채널</th>
                  <th>주문번호</th>
                  <th>수취인</th>
                  <th>주소</th>
                  <th>상품명</th>
                  <th>택배사</th>
                  <th>운송장번호</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {invoiceTemplates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={tpl.enabled}
                        onChange={(event) =>
                          updateInvoiceTemplate(tpl.id, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={tpl.vendorName}
                        onChange={(event) =>
                          updateInvoiceTemplate(tpl.id, {
                            vendorName: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={tpl.headerRow}
                        onChange={(event) =>
                          updateInvoiceTemplate(tpl.id, {
                            headerRow: toNumber(event.target.value, 1),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={tpl.startRow}
                        onChange={(event) =>
                          updateInvoiceTemplate(tpl.id, {
                            startRow: toNumber(event.target.value, 2),
                          })
                        }
                      />
                    </td>
                    {(
                      [
                        "channel",
                        "orderNo",
                        "receiverName",
                        "address",
                        "productName",
                        "courier",
                        "trackingNo",
                      ] as Array<keyof InvoiceTemplateSetting["columns"]>
                    ).map((field) => (
                      <td key={field}>
                        <input
                          value={tpl.columns[field]}
                          onChange={(event) =>
                            updateInvoiceTemplate(tpl.id, {
                              columns: {
                                [field]: event.target.value,
                              } as Partial<InvoiceTemplateSetting["columns"]>,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setInvoiceTemplates((rows) =>
                            rows.filter((row) => row.id !== tpl.id),
                          )
                        }
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>쿠팡·토스 송장등록 양식 설정</h2>
          <section className="notice">
            쿠팡/토스에 등록할 최종 송장 입력 파일의 헤더와 시작행을 설정합니다.
            엑셀에서 복사한 여러 줄 헤더를 그대로 붙여넣을 수 있고, 저장 시 현재
            값이 최신본이 됩니다.
          </section>
          <div className="template-card-grid">
            {shipmentTemplates.map((tpl) => (
              <article key={tpl.id} className="template-editor">
                <div className="template-editor-head">
                  <strong>{tpl.channel} 송장등록 양식</strong>
                  <label>
                    사용{" "}
                    <input
                      type="checkbox"
                      checked={tpl.enabled}
                      onChange={(event) =>
                        updateShipmentTemplate(tpl.id, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="inline-form">
                  <label>
                    데이터 시작행
                    <input
                      type="number"
                      min="1"
                      value={tpl.startRow}
                      onChange={(event) =>
                        updateShipmentTemplate(tpl.id, {
                          startRow: toNumber(
                            event.target.value,
                            tpl.headerRows.length + 1,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => resetShipmentTemplate(tpl.channel)}
                  >
                    기본 복원
                  </button>
                  <button
                    type="button"
                    className="btn-save"
                    onClick={saveSettingsToBrowser}
                  >
                    브라우저 저장
                  </button>
                  <button
                    type="button"
                    className="btn-save"
                    onClick={saveSettingsToServer}
                  >
                    서버 저장
                  </button>
                </div>
                <label className="textarea-label">
                  헤더/안내행
                  <textarea
                    rows={tpl.channel === "토스" ? 5 : 4}
                    value={rowsToTextarea(tpl.headerRows)}
                    onChange={(event) =>
                      updateShipmentTemplate(tpl.id, {
                        headerRows: textareaToRows(event.target.value),
                      })
                    }
                  />
                </label>
                <p className="muted">
                  쿠팡/토스 운송장 입력파일은 정확히 매칭된 상품준비중 주문값만 채웁니다.
                  B2B 송장엑셀에서는 택배사와 운송장번호만 사용합니다. 토스 물류사와 쿠팡 제휴택배사는 공란, 토스 주문상태는 배송중으로 고정합니다.
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeMenu === "발주관리" && (
        <section className="panel">
          <PanelHead
            title="발주관리"
            desc="옵션ID 기준으로 업체별 발주양식에 분류합니다."
          />
          <section className="folder-panel">
            <strong>발주 폴더</strong>
            <span>
              {folderNames.purchase
                ? `현재 폴더: ${folderNames.purchase}`
                : "현재 폴더: 미설정 · PC 로컬폴더 사용"}
            </span>
            <button
              type="button"
              className="btn-folder"
              onClick={() => pickManagedFolder("purchase")}
            >
              발주 폴더
            </button>
          </section>
          <section className="b2b-shortcut-panel">
            <div className="b2b-shortcut-head">
              <div>
                <h2>B2B 바로가기</h2>
                <p>
                  업체 사이트를 3개 업체씩 한 줄로 표시합니다. 엑셀 일괄 업로드
                  시 현재 목록을 최신본으로 교체합니다.
                </p>
              </div>
              <div className="actions b2b-link-actions">
                <label className="file-button btn-upload">
                  바로가기 등록
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,text/csv"
                    onChange={handleB2BVendorLinkImport}
                  />
                </label>
                <button
                  type="button"
                  className="btn-download"
                  onClick={downloadB2BVendorLinkTemplate}
                >
                  양식 받기
                </button>
                <button
                  type="button"
                  className="btn-download"
                  onClick={exportB2BVendorLinks}
                >
                  목록 받기
                </button>
                <button
                  type="button"
                  className="btn-save"
                  onClick={saveSettingsToBrowser}
                >
                  브라우저 저장
                </button>
                <button
                  type="button"
                  className="btn-save"
                  onClick={saveSettingsToServer}
                >
                  서버 저장
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={resetB2BVendorLinks}
                >
                  기본 복원
                </button>
              </div>
            </div>
            <div className="b2b-link-grid">
              {b2bVendorLinks
                .filter((link) => link.enabled)
                .map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className="btn-link b2b-link-button"
                    onClick={() => openB2BVendorLink(link)}
                    title={link.url}
                  >
                    {link.vendorName}
                  </button>
                ))}
            </div>
          </section>
          <div className="actions">
            <button
              type="button"
              className="btn-run"
              onClick={runPurchasePreflight}
            >
              발주 검증
            </button>
            <button
              type="button"
              className="btn-download"
              onClick={exportAllPurchases}
            >
              전체 발주
            </button>
            <button
              type="button"
              className="btn-download"
              onClick={() => exportChannelPurchase("쿠팡")}
            >
              쿠팡 발주
            </button>
            <button
              type="button"
              className="btn-download"
              onClick={() => exportChannelPurchase("토스")}
            >
              토스 발주
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => { if (window.confirm("발주이력을 초기화하면 중복발주 차단 기준도 사라집니다. 계속할까요?")) setPurchaseHistory([]); }}
            >
              이력 초기화
            </button>
          </div>
          <section className="notice">{folderMessage}</section>

          <section className="info-box">
            <h2>발주이력·중복발주 차단</h2>
            <p className="muted">같은 채널+주문번호+옵션ID가 발주이력에 있으면 다음 발주 엑셀에서 제외됩니다. 수집 버튼 실행 후에는 수집된 주문의 옵션ID 매핑 성공 여부를 기준으로 업체별 발주양식 저장 여부가 결정됩니다.</p>
            <DataTable
              headers={["채널", "주문번호", "옵션ID", "업체", "업체상품명", "구매수량", "발주기록시각", "상태"]}
              rows={purchaseHistoryDisplayRows(purchaseHistory)}
            />
          </section>
          <section className={purchasePreflightBlocked.length ? "warning-box" : "info-box"}>
            <h2>발주 검증</h2>
            <DataTable
              headers={["항목", "상태", "내용"]}
              rows={purchasePreflightSummaryRowsMemo.map((row) => [row.item, row.status, row.detail])}
            />
            {purchasePreflightIssues.length > 0 && (
              <DataTable
                headers={["등급", "항목", "채널", "주문번호", "옵션ID", "업체", "내용"]}
                rows={purchasePreflightDisplayRows(purchasePreflightIssues).slice(0, 50)}
              />
            )}
          </section>
          <div className="vendor-cards">
            {(Object.entries(vendorGroups) as Array<[string, PurchaseRow[]]>).map(([vendor, rows]) => (
              <article key={vendor} className="vendor-card">
                <strong>{vendor}</strong>
                <span>
                  {rows.length}건 /{" "}
                  {rows.reduce((sum, row) => sum + row.purchaseQty, 0)}개
                </span>
                <em>
                  {templateForVendor(vendor, purchaseTemplates).vendorName ===
                  vendor
                    ? "업체별 실제 발주양식 적용"
                    : "공통 발주양식 적용"}
                </em>
                <button
                  type="button"
                  className="btn-download"
                  onClick={() => exportPurchaseForVendor(vendor)}
                >
                  발주
                </button>
              </article>
            ))}
          </div>
          {missingMappings.length > 0 && (
            <section className="warning-box missing-guide-box">
              <strong>미매핑 주문 {missingMappings.length}건은 발주 파일에 포함되지 않습니다.</strong> 아래 표에서 채널과 옵션ID를 확인한 뒤 자동추가를 누르면 매핑관리 맨 위에 입력행이 생깁니다.
              <div className="actions compact-actions">
                <button type="button" className="btn-warning" onClick={addMissingMappingsFromCurrentOrders}>
                  미매핑 추가
                </button>
                <button type="button" className="btn-download" onClick={exportMissingMappings}>
                  미매핑 파일
                </button>
                <button type="button" className="btn-run" onClick={recheckCurrentMappings}>
                  재검사
                </button>
              </div>
              <DataTable
                headers={["채널", "옵션ID", "주문번호", "상품명", "옵션", "수량", "판매금액", "수취인", "주소"]}
                rows={missingMappingDisplayRows(purchaseRows)}
              />
            </section>
          )}
          <DataTable
            headers={[
              "상태",
              "채널",
              "주문번호",
              "옵션ID",
              "업체",
              "업체상품명",
              "주문수량",
              "기본수량",
              "구매수량",
              "수취인",
            ]}
            rows={purchaseRows
              .slice(0, 300)
              .map((row) => [
                row.matchStatus,
                row.channel,
                row.orderNo,
                row.optionId,
                row.vendorName,
                row.vendorProductName,
                row.orderQty,
                row.baseQty,
                row.purchaseQty,
                row.receiverName,
              ])}
          />
        </section>
      )}

      {activeMenu === "쿠폰관리" && (
        <section className="panel coupon-automation-panel simple-coupon-panel">
          <PanelHead
            title="쿠폰관리"
            desc=""
          />
          <div className="actions mobile-priority-actions">
            <button type="button" className="btn-download" onClick={downloadCouponTemplate}>쿠폰양식 다운로드</button>
            <button type="button" className="btn-run" onClick={applySelectedCouponsAsRollingTemplates}>선택 쿠폰 일괄 반영</button>
            <button type="button" className="btn-api" onClick={syncCoupangSalePricesFromApi}>쿠팡 판매가 동기화</button>
            <label className="file-button btn-upload">
              쿠폰양식 등록
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                onChange={handleCouponImport}
              />
            </label>
            <button type="button" className="btn-run" onClick={() => runCouponAction("apply")}>즉시 24시간 쿠폰 생성</button>
            <button type="button" className="btn-warning" onClick={() => runCouponAction("cancel")}>즉시 직전쿠폰 취소</button>
            <button type="button" className="btn-download" onClick={exportCouponRows}>현황 다운로드</button>
          </div>
          <section className="notice compact-notice">
            24시간 즉시할인쿠폰 반복운영은 스케줄러 시간값을 사용합니다. 현재 설정: 매일 {schedules.couponCancel.time} 직전 생성 쿠폰 파기 → {schedules.couponApply.time} 신규 쿠폰 생성, 다음날 {schedules.couponCancel.time} 만료/파기.
          </section>
          <section className="info-box coupon-api-select-box">
            <h2>쿠팡 쿠폰 발행 기준 선택</h2>
            <p className="muted">현재 운영 중인 쿠폰을 여러 개 체크한 뒤 <strong>선택 쿠폰 일괄 반영</strong>을 누르세요. 앱은 쿠폰별 contractId·할인값·적용상품을 분리 저장하고, 매일 각 쿠폰을 독립적으로 새로 생성한 뒤 직전 couponId를 다음날 취소합니다. 서버 예약실행에는 서버 저장이 필요합니다.</p>
            <div className="inline-form server-actions operation-actions">
              <label>
                쿠폰 상태
                <select
                  value={couponApiSettings.selectedCouponStatus}
                  onChange={(event) => {
                    updateCouponApiSettings({ selectedCouponStatus: event.target.value });
                    fetchCoupangCouponList(event.target.value);
                  }}
                >
                  {COUPANG_COUPON_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn-api" onClick={fetchCoupangCouponContracts}>계약서 목록 조회</button>
              <button type="button" className="btn-api" onClick={() => fetchCoupangCouponList()}>쿠폰 목록 조회</button>
              <button type="button" className="btn-run" onClick={applySelectedCouponsAsRollingTemplates}>선택 쿠폰 일괄 반영</button>
              <button type="button" className="btn-check" onClick={checkCoupangCouponRequestedId}>요청상태 확인</button>
              <button type="button" className="secondary" onClick={() => setSelectedRollingCouponIds(couponListRows.map((row) => row.couponId))}>목록 전체체크</button>
              <button type="button" className="secondary" onClick={() => setSelectedRollingCouponIds([])}>체크 해제</button>
              <button type="button" className="danger" onClick={deleteDailyCouponSelection}>반복설정 전체삭제</button>
              <button type="button" className="btn-save" onClick={saveSettingsToBrowser}>브라우저 저장</button>
              <button type="button" className="btn-save" onClick={saveSettingsToServer}>서버 저장</button>
            </div>
            <DataTable
              headers={["사용방식", "체크한 쿠폰", "반복대상 쿠폰", "현재/직전 couponId", "총 적용상품", "할인값 0", "마지막 신규생성", "저장시각"]}
              rows={[[
                rollingCouponTemplates.length ? "여러 쿠폰 24시간 반복" : "미설정",
                `${selectedRollingCouponIds.length}개`,
                `${rollingCouponTemplates.filter((row) => row.enabled).length}개`,
                rollingCouponTemplates.map((row) => row.latestCouponId || row.sourceCouponId).filter(Boolean).join(", "),
                `${rollingCouponTemplates.reduce((sum, row) => sum + row.options.length, 0)}건`,
                `${rollingCouponTemplates.filter((row) => toNumber(row.discountValue, 0) <= 0).length}개`,
                couponApiSettings.lastGeneratedAt || rollingCouponTemplates.map((row) => row.lastGeneratedAt).filter(Boolean).slice(-1)[0] || "",
                couponApiSettings.savedAt || "",
              ]]}
            />
            <section className="notice compact-notice">
              24시간 반복 기준: 체크한 쿠폰별로 적용상품 목록을 조회해 각각 별도 쿠폰으로 새로 생성합니다. 23:50에는 쿠폰별 직전 생성 couponId를 일괄 파기하고, 23:51에는 쿠폰별 할인값·상품목록으로 신규 쿠폰을 다시 생성합니다. 일괄 반영 후 서버 저장해야 자동 스케줄러가 같은 대상만 반복합니다.
            </section>
            {couponContractRows.length > 0 && (
              <>
                <h2>계약서 목록</h2>
                <div className="table-wrap data-table-wrap">
                  <table>
                    <thead>
                      <tr><th>선택</th><th>contractId</th><th>계약명</th><th>상태</th><th>예산</th><th>기간</th></tr>
                    </thead>
                    <tbody>
                      {couponContractRows.map((row) => (
                        <tr key={row.contractId}>
                          <td><button type="button" className="btn-run" onClick={() => selectCoupangContract(row)}>신규생성 선택</button></td>
                          <td>{row.contractId}</td>
                          <td>{row.contractName || row.vendorContractId}</td>
                          <td>{row.status}</td>
                          <td>{row.budget}</td>
                          <td>{row.startAt} ~ {row.endAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {couponListRows.length > 0 && (
              <>
                <h2>쿠폰 목록</h2>
                <div className="table-wrap data-table-wrap">
                  <table>
                    <thead>
                      <tr><th>선택</th><th>반영상태</th><th>couponId</th><th>contractId</th><th>쿠폰명</th><th>상태</th><th>유형</th><th>운영할인값</th><th>기간</th></tr>
                    </thead>
                    <tbody>
                      {couponListRows.map((row) => (
                        <tr key={row.couponId}>
                          <td><input type="checkbox" checked={selectedRollingCouponIds.includes(row.couponId)} onChange={() => toggleRollingCouponSelection(row.couponId)} /></td>
                          <td>{rollingCouponTemplates.some((template) => template.sourceCouponId === row.couponId) ? "반복대상" : ""}</td>
                          <td>{row.couponId}</td>
                          <td>{row.contractId}</td>
                          <td>{row.couponName}</td>
                          <td>{row.status}</td>
                          <td>{row.type || row.discountType}</td>
                          <td>{`${row.discountType || ""} ${toNumber(row.discountValue, 0).toLocaleString()}`.trim() || row.discount}</td>
                          <td>{row.startAt} ~ {row.endAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          {rollingCouponTemplates.length > 0 && (
            <section className="info-box compact-notice">
              <h2>24시간 반복대상 목록</h2>
              <div className="table-wrap data-table-wrap">
                <table>
                  <thead>
                    <tr><th>삭제</th><th>사용</th><th>기준 couponId</th><th>현재/직전 couponId</th><th>contractId</th><th>쿠폰명</th><th>할인</th><th>상품수</th><th>마지막 생성</th></tr>
                  </thead>
                  <tbody>
                    {rollingCouponTemplates.map((template) => (
                      <tr key={template.id}>
                        <td><button type="button" className="danger" onClick={() => deleteRollingCouponTemplate(template.id)}>삭제</button></td>
                        <td>{template.enabled ? "사용" : "중지"}</td>
                        <td>{template.sourceCouponId}</td>
                        <td>{template.latestCouponId}</td>
                        <td>{template.contractId}</td>
                        <td>{template.couponName}</td>
                        <td>{`${template.discountType || "금액"} ${toNumber(template.discountValue, 0).toLocaleString()}`}</td>
                        <td>{template.options.length.toLocaleString()}건</td>
                        <td>{template.lastGeneratedAt || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {couponMessage && <section className="notice compact-notice">{couponMessage}</section>}
          <section className="metrics compact-metrics coupon-simple-metrics">
            <div>
              <span>전체</span>
              <strong>{couponRows.length.toLocaleString()}건</strong>
            </div>
            <div>
              <span>등록</span>
              <strong>{couponRows.filter((row) => row.action === "apply").length.toLocaleString()}건</strong>
            </div>
            <div>
              <span>취소</span>
              <strong>{couponRows.filter((row) => row.action === "cancel").length.toLocaleString()}건</strong>
            </div>
            <div>
              <span>실행대기</span>
              <strong>{couponExecutionReadyRows.length.toLocaleString()}건</strong>
            </div>
          </section>
          <div className="table-wrap coupon-status-table">
            <table>
              <thead>
                <tr>
                  <th>동작</th>
                  <th>쿠팡 옵션ID</th>
                  <th>상품명</th>
                  <th>쿠폰명</th>
                  <th>할인구분</th>
                  <th>할인값</th>
                  <th>현재판매가</th>
                  <th>메모</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {couponRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <select
                        value={row.action}
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            action: event.target.value as CouponAction,
                          })
                        }
                      >
                        <option value="apply">등록</option>
                        <option value="cancel">취소</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.optionId}
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            optionId: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.productName}
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            productName: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.couponName}
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            couponName: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={row.discountType}
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            discountType: event.target.value as CouponRow["discountType"],
                          })
                        }
                      >
                        <option>금액</option>
                        <option>율</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.discountValue}
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            discountValue: toNumber(event.target.value, 0),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={toNumber(row.salePrice, 0) || ""}
                        placeholder="API 자동"
                        onChange={(event) =>
                          updateCouponRow(row.id, {
                            salePrice: toNumber(event.target.value, 0),
                            salePriceSource: event.target.value ? "manual" : "",
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.memo}
                        onChange={(event) =>
                          updateCouponRow(row.id, { memo: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeCouponRow(row.id)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeMenu === "스케줄러" && (
        <section className="panel scheduler-panel">
          <PanelHead
            title="스케줄러"
            desc="쿠폰과 서버 정리 자동 실행만 관리합니다."
          />
          <h2>운영 사전점검</h2>
          <div className="actions">
            <button type="button" className="btn-check" onClick={saveOperationLog}>운영점검 로그저장</button>
            <button type="button" className="btn-check" onClick={checkStorage}>서버 용량 점검</button>
            <button type="button" className="secondary" onClick={cleanupStorage}>만료자료 정리</button>
          </div>
          <DataTable
            headers={["기능", "상태", "점검내용"]}
            rows={operationPreflightRows}
          />
          <ScheduleEditor
            schedules={schedules}
            updateSchedule={updateSchedule}
          />
          <div className="actions scheduler-control-actions">
            <button type="button" className="btn-warning" onClick={pauseSchedulerTemporarily}>
              스케줄러 잠시 OFF
            </button>
            <button type="button" className="btn-run" onClick={restoreRecommendedSchedules}>
              권장시간 복원
            </button>
            <button type="button" className="btn-save" onClick={saveScheduleSettingsToBrowser}>
              시간 브라우저 저장
            </button>
            <button type="button" className="btn-save" onClick={saveSettingsToServer}>
              시간 서버 저장
            </button>
            <button type="button" className="btn-run" onClick={runSchedulerPreview}>
              자동 미리보기
            </button>
          </div>
          <div className="manual-action-grid">
            <article>
              <strong>B2B 발주</strong>
              <span>수동 발주파일 생성</span>
              <button type="button" className="btn-download" onClick={exportAllPurchases}>수동 발주파일</button>
            </article>
            <article>
              <strong>B2B 운송장 회수</strong>
              <span>업체송장 버튼으로 발주폴더에 회신 파일 복사</span>
              <button type="button" className="btn-nav" onClick={() => setActiveMenu("주문관리")}>주문관리</button>
            </article>
            <article>
              <strong>쿠팡/토스 송장 등록</strong>
              <span>미입력 주문만 운송장 입력</span>
              <button type="button" className="btn-run" onClick={runShipmentUploadAll}>쿠팡+토스 업로드</button>
            </article>
            <article>
              <strong>쿠팡 쿠폰 취소</strong>
              <span>{schedules.couponCancel.time} / {schedules.couponCancel.enabled ? "자동 사용" : "자동 중지"}</span>
              <button type="button" className="btn-warning" onClick={() => runCouponAction("cancel")}>수동 실행</button>
            </article>
            <article>
              <strong>쿠팡 쿠폰 적용</strong>
              <span>{schedules.couponApply.time} / {schedules.couponApply.enabled ? "자동 사용" : "자동 중지"}</span>
              <button type="button" className="btn-run" onClick={() => runCouponAction("apply")}>수동 실행</button>
            </article>
            <article>
              <strong>쿠폰 실행 리허설</strong>
              <span>실행대기·차단·중복을 엑셀로 분리 확인</span>
              <button type="button" className="btn-check" onClick={exportCouponExecutionPlanRows}>실행계획 확인</button>
            </article>
            <article>
              <strong>쿠폰양식 다운로드</strong>
              <span>선택쿠폰 기준 등록/취소 양식</span>
              <button type="button" className="btn-download" onClick={downloadCouponTemplate}>다운로드</button>
            </article>
            <article>
              <strong>쿠팡 판매가 동기화</strong>
              <span>옵션ID별 현재 판매가를 API로 받아 쿠폰 안전검증에 반영</span>
              <button type="button" className="btn-api" onClick={syncCoupangSalePricesFromApi}>수동 동기화</button>
            </article>
            <article>
              <strong>서버 저장용량 점검</strong>
              <span>{schedules.storageCleanup.time} / {schedules.storageCleanup.enabled ? "자동 사용" : "자동 중지"}</span>
              <button type="button" className="btn-check" onClick={checkStorage}>수동 점검</button>
            </article>
            <article>
              <strong>서버 만료자료 정리</strong>
              <span>영구 설정은 삭제하지 않고 만료자료만 정리</span>
              <button type="button" className="secondary" onClick={cleanupStorage}>수동 정리</button>
            </article>
          </div>
          <DataTable
            headers={["항목", "자동시간", "사용", "수동버튼"]}
            rows={[
              ["B2B 운송장 회수", "수시", "수동", "있음"],
              ["쿠팡/토스 송장 등록", "수시", "수동", "있음"],
              ["쿠폰 취소", schedules.couponCancel.time, schedules.couponCancel.enabled ? "사용" : "중지", "있음"],
              ["쿠폰 적용", schedules.couponApply.time, schedules.couponApply.enabled ? "사용" : "중지", "있음"],
              ["쿠폰양식 다운로드", "수시", "선택쿠폰 기준", "있음"],
              ["쿠팡 판매가 동기화", "수시", "쿠팡 옵션ID별 현재 판매가", "있음"],
              ["서버 용량 점검·정리", schedules.storageCleanup.time, schedules.storageCleanup.enabled ? "사용" : "중지", "있음"],
            ]}
          />
        </section>
      )}

      {activeMenu === "운영설정" && (
        <section className="panel">
          <PanelHead
            title="운영설정"
            desc="서버 저장, 용량 점검, 안전 상태를 확인합니다."
          />
          <ServerPreflightPanel />
          <ServerPanel
            sessionKey={sessionKey}
            setSessionKey={setSessionKey}
            saveToServer={saveToServer}
            loadFromServer={loadFromServer}
            loadLatestFromServer={loadLatestFromServer}
            syncAndCleanupServer={syncAndCleanupServer}
            checkSupabaseConnection={checkSupabaseConnection}
            checkServerOperation={checkServerOperation}
            checkPublicIp={checkPublicIp}
            publicIpRows={publicIpRows}
            saveOperationLog={saveOperationLog}
            loadLatestOperationLogs={loadLatestOperationLogs}
            checkStorage={checkStorage}
            cleanupStorage={cleanupStorage}
            serverMessage={serverMessage}
            operationRows={serverOperationRows}
            operationLogRows={operationLogRows}
          />
          <SettingsPanel
            settingsKey={settingsKey}
            setSettingsKey={setSettingsKey}
            saveSettingsToBrowser={saveSettingsToBrowser}
            saveSettingsToServer={saveSettingsToServer}
            loadSettingsFromServer={loadSettingsFromServer}
            loadLatestSettingsFromServer={loadLatestSettingsFromServer}
            deleteSettingsFromServer={deleteSettingsFromServer}
            settingsMessage={settingsMessage}
          />
          <section className="safe-list">
            <strong>기본 차단 상태</strong>
            {Object.entries(SAFETY).map(([key, value]) => (
              <span key={key}>
                {key}: {String(value)}
              </span>
            ))}
          </section>
        </section>
      )}
    </main>
  );
}

function PanelHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function AdvancedDetails({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="advanced-details">
      <summary>{title}</summary>
      <div className="advanced-details-body">{children}</div>
    </details>
  );
}

function ScheduleEditor({
  schedules,
  updateSchedule,
}: {
  schedules: ScheduleConfig;
  updateSchedule: (
    key: ScheduleKey,
    patch: Partial<ScheduleConfig[ScheduleKey]>,
  ) => void;
}) {
  const labels: Array<[ScheduleKey, string]> = [
    ["couponCancel", "쿠폰 취소"],
    ["couponApply", "쿠폰 적용"],
    ["storageCleanup", "서버 용량 점검·정리"],
  ];
  return (
    <div className="schedule-grid">
      {labels.map(([key, label]) => (
        <label key={key} className="schedule-item">
          <span>{label}</span>
          <input
            type="time"
            value={schedules[key].time}
            onChange={(event) =>
              updateSchedule(key, { time: event.target.value })
            }
          />
          <select
            value={schedules[key].enabled ? "on" : "off"}
            onChange={(event) =>
              updateSchedule(key, { enabled: event.target.value === "on" })
            }
          >
            <option value="on">자동 사용</option>
            <option value="off">자동 중지</option>
          </select>
        </label>
      ))}
    </div>
  );
}

function ServerPreflightPanel() {
  return (
    <section className="panel preflight-panel">
      <PanelHead
        title="서버 운영 사전절차"
        desc="1단계 실행 전에 Supabase SQL, 필수 테이블, 서버 API 4개를 순서대로 먼저 확인합니다."
      />
      <section className="notice">
        먼저 SQL을 실행한 뒤 연결 확인 → 서버 점검 → 로그 저장 → 최근
        로그 확인 순서로 진행합니다.
      </section>
      <h2>진행 순서</h2>
      <DataTable
        headers={["순서", "작업", "확인내용"]}
        rows={SERVER_PRE_STEP_ROWS}
      />
      <h2>추가된 서버 기능 API</h2>
      <DataTable
        headers={["기능", "API", "목적"]}
        rows={SERVER_REQUIRED_API_ROWS}
      />
      <h2>Supabase 필수 테이블</h2>
      <DataTable
        headers={["테이블", "목적", "주요 컬럼"]}
        rows={SERVER_REQUIRED_TABLE_ROWS}
      />
      <section className="warning-box">
        SQL 파일: supabase/migrations/20260705_v58_server_operation_schema.sql
      </section>
    </section>
  );
}

function SettingsPanel({
  settingsKey,
  setSettingsKey,
  saveSettingsToBrowser,
  saveSettingsToServer,
  loadSettingsFromServer,
  loadLatestSettingsFromServer,
  deleteSettingsFromServer,
  settingsMessage,
  compact = false,
}: {
  settingsKey: string;
  setSettingsKey: (value: string) => void;
  saveSettingsToBrowser: () => void;
  saveSettingsToServer: () => void;
  loadSettingsFromServer: () => void;
  loadLatestSettingsFromServer: () => void;
  deleteSettingsFromServer: () => void;
  settingsMessage: string;
  compact?: boolean;
}) {
  return (
    <section
      className={
        compact
          ? "panel settings-panel compact-settings"
          : "panel settings-panel"
      }
    >
      {!compact && (
        <PanelHead
          title="매핑·양식·쿠폰 영구 설정"
          desc="매핑, 업체별 발주양식, 쿠팡·토스 발주양식, 송장양식, 쿠팡·토스 송장등록 양식, 쿠폰 설정은 현재 화면 목록 그대로 최신본으로 저장합니다."
        />
      )}
      <div className="inline-form server-actions operation-actions">
        <button type="button" className="btn-save" onClick={saveSettingsToBrowser}>
          브라우저 저장
        </button>
        <button type="button" className="btn-save" onClick={saveSettingsToServer}>
          서버 저장
        </button>
        <button type="button" className="btn-load" onClick={loadLatestSettingsFromServer}>
          최신 불러오기
        </button>
      </div>
      <AdvancedDetails title="설정 고급">
        <div className="inline-form server-actions advanced-actions">
          <label>
            설정 키
            <input
              value={settingsKey}
              onChange={(event) => setSettingsKey(event.target.value)}
            />
          </label>
          <button type="button" className="btn-load" onClick={loadSettingsFromServer}>
            키 불러오기
          </button>
          <button type="button" className="danger" onClick={deleteSettingsFromServer}>
            설정 삭제
          </button>
        </div>
      </AdvancedDetails>
      <p>{settingsMessage}</p>
    </section>
  );
}

function ServerPanel({
  sessionKey,
  setSessionKey,
  saveToServer,
  loadFromServer,
  loadLatestFromServer,
  syncAndCleanupServer,
  checkSupabaseConnection,
  checkServerOperation,
  checkPublicIp,
  publicIpRows,
  saveOperationLog,
  loadLatestOperationLogs,
  checkStorage,
  cleanupStorage,
  serverMessage,
  operationRows,
  operationLogRows,
}: {
  sessionKey: string;
  setSessionKey: (value: string) => void;
  saveToServer: () => void;
  loadFromServer: () => void;
  loadLatestFromServer: () => void;
  syncAndCleanupServer: () => void;
  checkSupabaseConnection: () => void;
  checkServerOperation: () => void;
  checkPublicIp: () => void;
  publicIpRows: PublicIpViewRow[];
  saveOperationLog: () => void;
  loadLatestOperationLogs: () => void;
  checkStorage: () => void;
  cleanupStorage: () => void;
  serverMessage: string;
  operationRows: Array<{ item: string; status: string; detail: string }>;
  operationLogRows: OperationLogViewRow[];
}) {
  return (
    <section className="panel server-panel">
      <PanelHead
        title="서버 운영·Supabase 정리"
        desc="배포 전 서버 점검, Supabase 연결, 1일 임시보관, 영구설정, 운영로그를 확인합니다."
      />
      <div className="inline-form server-actions operation-actions">
        <button type="button" className="btn-check" onClick={checkSupabaseConnection}>
          DB 확인
        </button>
        <button type="button" className="btn-check" onClick={checkServerOperation}>
          서버 점검
        </button>
        <button type="button" className="btn-save" onClick={saveToServer}>
          1일 저장
        </button>
        <button type="button" className="btn-load" onClick={loadLatestFromServer}>
          최신 불러오기
        </button>
      </div>
      <AdvancedDetails title="서버 고급">
        <div className="inline-form server-actions advanced-actions">
          <label>
            임시보관 키
            <input
              value={sessionKey}
              onChange={(event) => setSessionKey(event.target.value)}
            />
          </label>
          <button type="button" className="btn-warning" onClick={checkPublicIp}>
            IP 확인
          </button>
          <button type="button" className="btn-save" onClick={saveOperationLog}>
            로그 저장
          </button>
          <button type="button" className="btn-load" onClick={loadLatestOperationLogs}>
            로그 확인
          </button>
          <button type="button" className="btn-load" onClick={loadFromServer}>
            키 불러오기
          </button>
          <button type="button" className="btn-run" onClick={syncAndCleanupServer}>
            불러오기+정리
          </button>
          <button type="button" className="btn-check" onClick={checkStorage}>
            용량 점검
          </button>
          <button type="button" className="secondary" onClick={cleanupStorage}>
            만료 정리
          </button>
        </div>
      </AdvancedDetails>
      <p>{serverMessage}</p>
      <div className="warning-box ip-allowlist-box">
        쿠팡·토스에서 IP 제한 오류가 나오면 먼저 현재 API 호출 IP를 확인한 뒤, 양쪽 관리자 화면의 자체개발/API 허용 IP에 등록하세요. 로컬 인터넷 IP가 바뀌면 다시 등록이 필요할 수 있습니다.
      </div>
      {publicIpRows.length > 0 && (
        <>
          <h2>현재 API 호출 IP·허용목록 점검</h2>
          <DataTable
            headers={["항목", "상태", "내용"]}
            rows={publicIpRows.map((row) => [row.item, row.status, row.detail])}
          />
        </>
      )}
      {operationRows.length > 0 && (
        <DataTable
          headers={["점검항목", "상태", "내용"]}
          rows={operationRows.map((row) => [row.item, row.status, row.detail])}
        />
      )}
      {operationLogRows.length > 0 && (
        <>
          <h2>최근 운영로그</h2>
          <DataTable
            headers={["ID", "유형", "저장시각", "요약"]}
            rows={operationLogRows.map((row) => [
              row.id,
              row.eventType,
              row.createdAt,
              row.summary,
            ])}
          />
        </>
      )}
    </section>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="table-wrap data-table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={String(row[0] ?? "") === "미매핑" || /확인필요|차단필요|실패/.test(String(row[1] ?? "")) ? "row-warning" : ""}>
                {row.map((value, cellIndex) => (
                  <td key={cellIndex} data-label={headers[cellIndex]}>
                    {String(value ?? "")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>자료가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;
