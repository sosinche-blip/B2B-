import React, { useEffect, useMemo, useRef, useState } from "react";
import "./style.css";
import {
  downloadExcelFile,
  makeExcelBlob,
  saveBlobWithDownload,
} from "./utils/csv";
import { createXlsxBlob, readSpreadsheetRows } from "./utils/spreadsheet";
import { joinAddressParts } from "./utils/address";

type Channel = "쿠팡" | "토스";
type MenuKey = "간편운영" | "매핑관리" | "쿠폰관리" | "스케줄러" | "운영설정";
type MappingWorkspaceView = "mapping" | "adminplus" | "catalogSearch" | "forms" | "purchase";
type MatchStatus = "매칭완료" | "미매핑";
type InvoiceStatus = "등록준비" | "확인필요" | "송장입력완료(업로드제외)";
type ScheduleKey =
  | "couponPreflight"
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
  shippingFee: number;
  /** AdminPlus 자동발주 실행시각(KST HH:MM). 쉼표로 최대 2개까지 설정합니다. */
  purchaseTime: string;
  matchAuthority?: "excel" | "api";
  matchConfirmedAt?: string;
  updatedAt?: string;
};


type TossOptionIdRow = {
  id: string;
  /** Toss productItemId: 상품 API에서 사용하는 실제 상품 옵션 ID */
  optionId: string;
  /** Toss stockId: 주문 API에서 내려오는 재고/판매 옵션 식별자 */
  stockId: string;
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
  vendorItemId?: string;
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
  statusUpdatedAt?: string;
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

type ShipmentUploadPreviewState = {
  createdAt: string;
  sourceFileNames: string[];
  invoiceRecordCount: number;
  preparingOrderCount: number;
  alreadyShippedCount: number;
  sourceOrders: OrderRow[];
  previewRows: InvoicePreviewRow[];
  readyRows: InvoicePreviewRow[];
  counts: {
    coupang: number;
    toss: number;
    unmatched: number;
    excluded: number;
  };
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
  baseCouponName?: string;
  maxDiscountPrice?: number;
  wowExclusive?: boolean;
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
  lastCanceledAtIso?: string;
  dailyRollingEnabled?: boolean;
  automationEnabled?: boolean;
  automationValidatedAt?: string;
  automationActivatedAt?: string;
  automationStoppedAt?: string;
  lastPreflightAt?: string;
  unacknowledgedFailureCount?: number;
  tossCouponAutomationAvailable?: boolean;
  rollingTemplates?: RollingCouponTemplate[];
  savedAt?: string;
  r10VendorItemIds?: string[];
  r10State?: "IDLE" | "RUNNING" | "WAITING_EXTERNAL" | "CLEANUP" | "FAILED" | "VERIFIED";
  r10LastVerifiedCouponId?: string;
  r10LastVerifiedAt?: string;
  r10LastError?: string;
};

type ApiEndpointSettings = {
  COUPANG_ORDERS_PATH: string;
  COUPANG_VENDOR_ITEM_INVENTORY_PATH: string;
  COUPANG_SHIPMENT_UPLOAD_PATH: string;
  COUPANG_ORDER_ACK_PATH: string;
  COUPANG_COUPON_CREATE_PATH: string;
  COUPANG_COUPON_APPLY_PATH: string;
  COUPANG_COUPON_CANCEL_PATH: string;
  COUPANG_COUPON_REQUEST_STATUS_PATH: string;
  COUPANG_COUPON_CONTRACT_LIST_PATH: string;
  COUPANG_COUPON_LIST_PATH: string;
  COUPANG_COUPON_ITEM_LIST_PATH: string;
  TOSS_ORDERS_PATH: string;
  TOSS_ORDER_STATUS_PATH: string;
  TOSS_SHIPMENT_UPLOAD_PATH: string;
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
  maxDiscountPrice?: number;
  wowExclusive?: boolean;
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
  baseCouponName?: string;
  maxDiscountPrice?: number;
  wowExclusive?: boolean;
  automationState?: "draft" | "validated" | "active" | "stopped" | "failed";
  preflightStatus?: "미검증" | "통과" | "실패";
  preflightAt?: string;
  preflightIssues?: string[];
  failureAcknowledgedAt?: string;
  scheduleStartDate?: string;
  savedAt?: string;
};

type CouponAutomationFailureRow = {
  id: string;
  templateId: string;
  couponId: string;
  couponName: string;
  stage: string;
  status: string;
  attemptCount: number;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
  repeatedCount?: number;
  nextRetryAt?: string;
};

type CouponOptionLookupRow = {
  optionId: string;
  productName: string;
  optionName: string;
  vendorProductName: string;
  couponProductName: string;
  couponName: string;
  discountType: "금액" | "율";
  discountValue: number;
  salePrice: number;
  status: string;
  amountInStock: string;
  sellerItemId: string;
  apiVerified: boolean;
  selected: boolean;
  error: string;
};

type NewCouponDraft = {
  contractId: string;
  maxDiscountPrice: number;
  startAt: string;
  endAt: string;
};

type B2BVendorLink = {
  id: string;
  vendorName: string;
  url: string;
  loginId: string;
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

type AddressQualityLevel = "차단" | "주의";

type AddressQualityIssue = {
  id: string;
  orderId: string;
  channel: Channel;
  orderNo: string;
  receiverName: string;
  address: string;
  level: AddressQualityLevel;
  item: string;
  detail: string;
};

type OperationalFailureKind =
  | "order_lookup"
  | "order_collect"
  | "purchase_export"
  | "shipment_preview"
  | "shipment_upload"
  | "adminplus_watch_save";

type OperationalFailureStatus = "대기" | "재시도중" | "해결" | "수동확인";

type OperationalFailureRow = {
  id: string;
  kind: OperationalFailureKind;
  category: string;
  title: string;
  detail: string;
  status: OperationalFailureStatus;
  channel?: Channel;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};


type AdminPlusAccountStatusRow = {
  id: string;
  label: string;
  vendorName: string;
  enabled: boolean;
  clientIdMasked?: string;
  tokenOk?: boolean | null;
  tokenStatus?: number | null;
  tokenExpiresAt?: string | null;
  tokenExpiresIn?: number | null;
  orderReadScopeOk?: boolean | null;
  productReadScopeOk?: boolean | null;
  paymentReadScopeOk?: boolean | null;
  balanceReadScopeOk?: boolean | null;
  depositBalance?: number | null;
  pointBalance?: number | null;
  updatedAt?: string | null;
  message?: string;
};

type AdminPlusAccountRule = {
  accountId: string;
  vendorName: string;
  enabled: boolean;
  autoPurchase: boolean;
  /** 예치금 자동결제. 반드시 사용자가 업체별로 켜야 합니다. */
  autoPayment: boolean;
  /** 한 번의 AdminPlus 결제접수에 허용할 최대 금액. 0이면 자동결제 차단. */
  paymentMaxPerBatch: number;
  /** KST 기준 하루 자동결제 누적 한도. 0이면 자동결제 차단. */
  paymentDailyLimit: number;
  autoShipment: boolean;
};

type AdminPlusAutomationConfig = {
  enabled: boolean;
  shipmentTimes: string[];
  priceWatchEnabled: boolean;
  priceCheckTimes: string[];
  startedAt: string;
  lastPurchaseAt: string;
  lastShipmentAt: string;
  lastPriceCheckAt: string;
  accountRules: AdminPlusAccountRule[];
};

type AdminPlusCatalogOption = {
  optionCode: string;
  optionName: string;
  stock: string;
};

type AdminPlusCatalogProduct = {
  productCode: string;
  name: string;
  price: number;
  stock: string;
  status: string;
  lastUpdatedAt: string;
  options: AdminPlusCatalogOption[];
};

type AdminPlusGlobalCatalogRow = AdminPlusCatalogProduct & {
  accountId: string;
  accountLabel: string;
  vendorName: string;
};

type AdminPlusProductLink = {
  id: string;
  channel: Channel;
  optionId: string;
  vendorName: string;
  accountId: string;
  matchString: string;
  productCode: string;
  optionCode: string;
  productName: string;
  optionName: string;
  qty: number;
  shippingFee: number;
  purchaseTime: string;
  baselinePrice: number;
  currentPrice: number;
  baselineConfiguredCost: number;
  currentConfiguredCost: number;
  priceStatus: "정상" | "변동" | "확인필요" | "품절" | "미확인";
  lastCheckedAt: string;
  priceChangedAt: string;
  /** 서버 확정 링크 충돌 병합용 수정시각 */
  matchAuthority?: "excel" | "api";
  matchConfirmedAt?: string;
  updatedAt?: string;
};

type AdminPlusProductLinkDraft = {
  qty: number;
  shippingFee: number;
  purchaseTime: string;
};

type AdminPlusWatchSaveState = {
  status: "idle" | "saving" | "success" | "error";
  message: string;
  savedAt: string;
};

type AdminPlusMatchListProduct = {
  product_code?: string | number;
  option_code?: string | number | null;
  qty?: number;
};

type AdminPlusMatchListRow = {
  match_string?: string;
  memo?: string;
  is_temp?: boolean;
  product_count?: number;
  is_one_to_many?: boolean;
  products?: AdminPlusMatchListProduct[];
};

type AdminPlusMatchSuggestion = {
  id: string;
  mappingId: string;
  channel: Channel;
  optionId: string;
  vendorName: string;
  vendorCode: string;
  vendorProductName: string;
  accountId: string;
  matchString: string;
  productCode: string;
  optionCode: string;
  productName: string;
  optionName: string;
  qty: number;
  shippingFee: number;
  purchaseTime: string;
  price: number;
  configuredCost: number;
  source: "기존 AdminPlus 매칭" | "기존 확정매칭 재사용" | "업체상품코드 일치" | "업체상품명 일치" | "없음";
  reason: string;
  status: "확정가능" | "확정됨" | "검색필요" | "복합매칭확인";
  needsWrite: boolean;
  changeSummary?: string;
  priorProductName?: string;
  priorOptionName?: string;
  priorBaselinePrice?: number;
  excelBaselinePrice?: number;
};

type AdminPlusPriceAlert = {
  id: string;
  linkId: string;
  alertKind?: "가격변동" | "상품명변경" | "상품없음" | "품절" | "재확정대기" | "조회확인필요" | "계정확인필요";
  message?: string;
  expectedProductName?: string;
  actualProductName?: string;
  accountId: string;
  vendorName: string;
  channel: Channel;
  optionId: string;
  productCode: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
  baseQty?: number;
  shippingFee?: number;
  oldConfiguredCost?: number;
  newConfiguredCost?: number;
  configuredDifference?: number;
  configuredDifferenceRate?: number;
  difference: number;
  differenceRate: number;
  detectedAt: string;
  acknowledgedAt?: string;
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
  shipmentBoxId?: string;
  orderProductId?: string;
  vendorItemId?: string;
  receiverName?: string;
  submittedAt?: string;
  orderAmount?: number;
  paymentKey?: string;
  paymentStatus?: "대기" | "완료" | "실패" | string;
  paymentAmount?: number;
  paymentCompletedAt?: string;
  /** AdminPlus 실제 주문상태: 입금전/주문접수/배송준비중/배송 */
  adminplusStatus?: string;
  adminplusStatusCheckedAt?: string;
  marketplacePreparingAt?: string;
  paymentError?: string;
  shipmentUploadedAt?: string;
  operatorResolvedAt?: string;
  operatorResolveReason?: string;
  marketRecheckedAt?: string;
  marketRecheckedStatus?: string;
  trackingNo?: string;
  courier?: string;
  error?: string;
};

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
  apiEndpointSettings?: ApiEndpointSettings;
  rollingCouponTemplates?: RollingCouponTemplate[];
  operationalFailures?: OperationalFailureRow[];
  b2bVendorLinks?: B2BVendorLink[];
  folderNames?: Partial<Record<BrowserFolderKind, string>>;
  localFolderPaths?: Partial<Record<BrowserFolderKind, string>>;
  schedules?: ScheduleConfig;
  adminplusAutomation?: AdminPlusAutomationConfig;
  adminplusPurchaseHistory?: AdminPlusPurchaseHistoryRow[];
  adminplusProductLinks?: AdminPlusProductLink[];
  adminplusPriceAlerts?: AdminPlusPriceAlert[];
  sessionKey?: string;
  settingsKey?: string;
  savedAt?: string;
};

type PersistentSettingsPayload = {
  ordererBusinessInfo?: {
    name: string;
    phone: string;
    zip?: string;
    address?: string;
    address2?: string;
  };
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
  apiEndpointSettings?: ApiEndpointSettings;
  rollingCouponTemplates?: RollingCouponTemplate[];
  operationalFailures?: OperationalFailureRow[];
  b2bVendorLinks?: B2BVendorLink[];
  folderNames?: Partial<Record<BrowserFolderKind, string>>;
  localFolderPaths?: Partial<Record<BrowserFolderKind, string>>;
  schedules?: ScheduleConfig;
  adminplusAutomation?: AdminPlusAutomationConfig;
  adminplusPurchaseHistory?: AdminPlusPurchaseHistoryRow[];
  adminplusProductLinks?: AdminPlusProductLink[];
  adminplusPriceAlerts?: AdminPlusPriceAlert[];
  settingsKey?: string;
  savedAt?: string;
  version?: string;
  serverSaveMode?: string;
  serverSaveSummary?: Record<string, number>;
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
  matchValidationRevision?: string;
  matchDiagnosticRevision?: string;
  mappingStateRevision?: string;
  requestedRows?: number;
  standardFeeRows?: SettlementFeeRow[];
  vendorId?: string;
  accessKeyMasked?: string;
  saved?: boolean;
  backupFile?: string;
  appliedAt?: string;
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

function compactApiDiagnosticRows(rows: ApiDiagnosticRow[]) {
  if (rows.length <= 10) return rows;

  const output: ApiDiagnosticRow[] = [];
  const finalCollectGroups = new Map<string, {
    channel: string;
    statusCode: string;
    dates: string[];
    total: number;
    nonZero: string[];
    hasError: boolean;
  }>();
  const technicalGroups = new Map<string, { channel: string; count: number; hasError: boolean }>();
  const selectionGroups = new Map<string, { channel: string; statusCode: string; dates: string[]; detail: string; hasError: boolean }>();
  const exactSeen = new Set<string>();

  for (const row of rows) {
    const finalMatch = row.step.match(/^(.+?) (\d{4}-\d{2}-\d{2}) ([A-Z_]+) 최종수집$/);
    if (finalMatch) {
      const [, channel, date, statusCode] = finalMatch;
      const key = `${channel}|${statusCode}`;
      const countMatch = row.detail.match(/표준 주문행\s*(\d+)건/);
      const count = Number(countMatch?.[1] || 0);
      const group = finalCollectGroups.get(key) || { channel, statusCode, dates: [], total: 0, nonZero: [], hasError: false };
      group.dates.push(date);
      group.total += count;
      if (count > 0) group.nonZero.push(`${date.slice(5)} ${count}건`);
      if (row.status === "오류" || row.status === "확인필요") group.hasError = true;
      finalCollectGroups.set(key, group);
      continue;
    }

    const selectionMatch = row.step.match(/^(.+?) (\d{4}-\d{2}-\d{2}) ([A-Z_]+) 선택방식$/);
    if (selectionMatch) {
      const [, channel, date, statusCode] = selectionMatch;
      const key = `${channel}|${statusCode}`;
      const group = selectionGroups.get(key) || { channel, statusCode, dates: [], detail: row.detail.split(" / 시도요약")[0], hasError: false };
      group.dates.push(date);
      if (row.status === "오류" || row.status === "확인필요") group.hasError = true;
      selectionGroups.set(key, group);
      continue;
    }

    if (/^.+? \d{4}-\d{2}-\d{2} [A-Z_]+ v\d+/.test(row.step)) {
      if (row.status === "오류" || row.status === "확인필요") output.push(row);
      continue;
    }

    if (/^(쿠팡 요청 준비|쿠팡 HMAC 서명|쿠팡 주문조회 응답|쿠팡 재시도 요약|토스 토큰 요청 준비|토스 토큰 발급 응답|토스 주문조회 요청 준비|토스 주문조회 응답)$/.test(row.step)) {
      const key = row.channel;
      const group = technicalGroups.get(key) || { channel: row.channel, count: 0, hasError: false };
      group.count += 1;
      if (row.status === "오류" || row.status === "확인필요") group.hasError = true;
      technicalGroups.set(key, group);
      if (row.status === "오류" || row.status === "확인필요") output.push(row);
      continue;
    }

    const fingerprint = `${row.channel}|${row.step}|${row.status}|${row.detail}`;
    if (!exactSeen.has(fingerprint)) {
      exactSeen.add(fingerprint);
      output.push(row);
    }
  }

  for (const group of finalCollectGroups.values()) {
    const dates = [...group.dates].sort();
    const range = dates.length > 1 ? `${dates[0]}~${dates[dates.length - 1]}` : dates[0] || "조회기간";
    const nonZeroText = group.nonZero.length ? ` 주문 발생일: ${group.nonZero.join(", ")}.` : "";
    output.push({
      channel: group.channel,
      step: `${group.statusCode} 수집요약`,
      status: group.hasError ? "확인필요" : "정상",
      detail: `${range} ${dates.length}일 조회, 표준 주문행 총 ${group.total}건.${nonZeroText}`,
    });
  }

  for (const group of selectionGroups.values()) {
    const dates = [...group.dates].sort();
    const range = dates.length > 1 ? `${dates[0]}~${dates[dates.length - 1]}` : dates[0] || "조회기간";
    output.push({
      channel: group.channel,
      step: `${group.statusCode} 조회방식`,
      status: group.hasError ? "확인필요" : "정상",
      detail: `${range}: ${group.detail}`,
    });
  }

  for (const group of technicalGroups.values()) {
    if (!group.hasError) {
      output.push({
        channel: group.channel,
        step: "API 호출 확인",
        status: "정상",
        detail: `인증·요청·HTTP 응답 ${group.count}단계를 정상 확인했습니다.`,
      });
    }
  }

  const priority = (row: ApiDiagnosticRow) => {
    if (row.step === "요청 경로") return 0;
    if (row.step.includes("수집요약")) return 1;
    if (row.step.includes("조회방식")) return 2;
    if (row.step === "API 호출 확인") return 3;
    if (row.step === "표준 주문 변환") return 4;
    return 5;
  };
  return output.sort((a, b) => priority(a) - priority(b));
}

// Regression markers retained for release verification: V213 API매핑 서버확정·옵션별 2회 발주시간·자동감시 알림 보강 / V218 R1 API매핑 옵션ID·기본수량 서버확정
const UI_RELEASE_REVISION = "V258";
const MAPPING_OPTION_CLEAR_DELETE_REVISION = "v259-r5-2a-option-clear-delete-20260826";
const MAPPING_OPTION_DELETE_REVISION = "v259-r5-2-option-delete-cascade-20260826";
const MAPPING_BIDIRECTIONAL_LATEST_REVISION = "v259-r5-3-safe-bidirectional-latest-confirmed-20260827";
const MAPPING_AUTO_UNLINK_REVISION = "v259-r5-3-1-auto-unlink-adminplus-match-20260827";
const MAPPING_IDENTITY_CHANGE_ONLY_REVISION = "v259-r5-3-2-identity-change-only-20260828";
// v259-r5-4-price-final-change-time-20260828
// v259-r5-5-system-stability-20260828
const APP_VERSION = `${UI_RELEASE_REVISION} 무료운영 최적화 · UI 정렬 통합 · V257 현황기간/집계 · V256 매핑정책 · 쿠폰 R10 유지`;
// 회귀검증 호환 표식: V208 어드민플러스 다계정·자동발주·송장자동화
const STORAGE_KEY = "b2b_operation_current_state";
const LEGACY_STORAGE_KEYS = ["b2b_operation_v45_state"];
const SETTINGS_STORAGE_KEY = "b2b_operation_persistent_settings";
const LEGACY_SETTINGS_STORAGE_KEYS = ["b2b_operation_v53_persistent_settings"];
const DEFAULT_SESSION_KEY = `b2b-${new Date().toISOString().slice(0, 10)}`;
const DEFAULT_SETTINGS_KEY = "b2b-master-settings";
const SHIPMENT_PREPARING_LOOKBACK_DAYS = 7;
const DEFAULT_ORDER_COLLECT_LOOKBACK_DAYS = 7;
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

// v259-r5-9-dashboard-catalog-performance-20260901
const DEFAULT_OPERATION_LOOKBACK_DAYS = 4;
const DEFAULT_ORDER_API_FILTER: OrderApiFilter = {
  ...dateRangeText(DEFAULT_OPERATION_LOOKBACK_DAYS),
  coupangStatus: "ACCEPT",
  tossStatus: "PAID",
  limit: 50,
};
const MENUS: Array<{ key: MenuKey; label: string }> = [
  { key: "간편운영", label: "오늘운영" },
  { key: "매핑관리", label: "매핑·발주" },
  { key: "쿠폰관리", label: "쿠폰" },
  { key: "스케줄러", label: "자동화" },
  { key: "운영설정", label: "설정" },
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

const ORDERER_RECEIVER_POLICY_REVISION = "excel-orderer-business-receiver-customer-v231-20260810";
const EXCEL_FIRST_MAPPING_REVISION = "excel-first-mapping-global-catalog-v232-20260811";
const MAPPING_RECOVERY_REVISION = "v233-orderphone-name-recovery-pricewatch-20260811";
const PRICE_REFRESH_REVISION = "v234-time-edit-soldout-price-refresh-20260811";
const EXCEL_SCHEMA_UI_REVISION = "v235-excel-schema-ui-catalog-review-20260811";
const MAPPING_STATE_UI_REVISION = "v236-latest-excel-reconfirm-current-state-20260811";
const MATCH_VALIDATION_UI_REVISION = "v237-option-parser-validation-reconfirm-watch-20260811";
const MATCH_DIAGNOSTIC_UI_REVISION = "v238-ncloud-revision-guard-diagnostic-20260811";
const PRODUCT_CHANGE_OPTION_FIX_REVISION = "v239-product-change-option-leak-fix-20260811";
const PRICEWATCH_ACTIVE_FIRST_REVISION = "v240-active-first-false-soldout-fix-20260811";
const COUPON_SINGLE_ACTIVE_REVISION = "v248-r8-coupon-single-active-catalog-filter-20260813";
const PRICEWATCH_ACCOUNT_ROUTING_REVISION = "v241-pricewatch-account-routing-fix-20260811";
const SHIPMENT_CONTAINER_RECOVERY_UI_REVISION = "v242-order-container-tracking-recovery-20260811";
const SHIPMENT_TARGET_PAYMENT_CLARITY_UI_REVISION = "v243-shipment-target-payment-batch-clarity-20260811";
const SHIPMENT_PENDING_QUEUE_UI_REVISION = "v244-shipment-pending-queue-ui-20260811";
const PAYMENT_PERMISSION_GUIDE_UI_REVISION = "v245-payment-permission-guide-ui-20260811";
const COUPON_PREFLIGHT_STATUS_UI_REVISION = "v250r1.3-preflight-status-ui-cleanup-20260816";
const ADMINPLUS_GLOBAL_REPLACEMENT_UI_REVISION = "v251-adminplus-global-replacement-ui-20260817";
const ADMINPLUS_UNLINKED_ENROLLMENT_UI_REVISION = "v252-adminplus-unlinked-enrollment-ui-20260817";
const ADMINPLUS_MANUAL_GLOBAL_SEARCH_UI_REVISION = "v252r1-adminplus-manual-search-ui-20260817";
const ADMINPLUS_FLOW_INTEGRATION_REVISION = "v253-adminplus-flow-integration-20260817";
const ADMINPLUS_SOURCE_OF_TRUTH_REVISION = "v254-adminplus-source-of-truth-20260817";
const ADMINPLUS_LINK_STATUS_FIX_REVISION = "v255-adminplus-link-status-fix-20260817";
const MANUAL_MAPPING_NONAPI_REVISION = "v256-manual-mapping-nonapi-transition-20260817";
const STATUS_RANGE_COUNT_REVISION = "v257-status-range-count-fix-20260817";
const FREE_TIER_CLEANUP_REVISION = "v258-free-tier-cleanup-ui-20260817";

const DEFAULT_BUSINESS_INFO = {
  name: "소신채",
  phone: "010-6880-9413",
  zip: "54922",
  address: "전북특별자치도 전주시 덕진구 매봉16길7,2층",
  address2: "",
};

const DEFAULT_SCHEDULES: ScheduleConfig = {
  couponPreflight: { enabled: true, time: "23:45" },
  couponCancel: { enabled: true, time: "23:50" },
  couponApply: { enabled: true, time: "23:52" },
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


const DEFAULT_ADMINPLUS_AUTOMATION: AdminPlusAutomationConfig = {
  enabled: false,
  shipmentTimes: ["14:00", "18:00", "23:00"],
  priceWatchEnabled: true,
  priceCheckTimes: ["08:30", "13:30", "18:30"],
  startedAt: "",
  lastPurchaseAt: "",
  lastShipmentAt: "",
  lastPriceCheckAt: "",
  accountRules: [],
};

function normalizeAutomationTimes(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;|]+/);
  const seen = new Set<string>();
  const times = source
    .map((item) => String(item || "").trim())
    .filter((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .sort()
    .slice(0, 12);
  return times.length ? times : [...fallback];
}

function normalizeShipmentAutomationTimes(value: unknown) {
  const times = normalizeAutomationTimes(value, DEFAULT_ADMINPLUS_AUTOMATION.shipmentTimes)
    .filter((time) => time !== "10:00");
  if (!times.includes("23:00")) times.push("23:00");
  return Array.from(new Set(times)).sort().slice(0, 12);
}

const OPTION_PURCHASE_TIME_FALLBACK = "09:00";

type OptionPurchaseTimeParse = {
  ok: boolean;
  normalized: string;
  times: string[];
  error: string;
};

function parseOptionPurchaseTimes(value: unknown): OptionPurchaseTimeParse {
  const raw = String(value ?? "").trim();
  const parts = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (!parts.length) {
    return { ok: false, normalized: "", times: [], error: "발주시간을 입력하세요. 예: 09:00 또는 09:00,14:00" };
  }
  if (parts.length > 2) {
    return { ok: false, normalized: "", times: [], error: "발주시간은 최대 2개까지만 입력할 수 있습니다." };
  }
  if (parts.some((item) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(item))) {
    return { ok: false, normalized: "", times: [], error: "발주시간은 HH:MM 형식으로 입력하세요. 예: 09:00,14:00" };
  }
  const times = Array.from(new Set(parts));
  if (times.length !== parts.length) {
    return { ok: false, normalized: "", times: [], error: "같은 발주시간을 중복 입력할 수 없습니다." };
  }
  return { ok: true, normalized: times.join(","), times, error: "" };
}

function normalizeOptionPurchaseTimes(value: unknown, fallback = OPTION_PURCHASE_TIME_FALLBACK) {
  const parsed = parseOptionPurchaseTimes(value);
  return parsed.ok ? parsed.normalized : fallback;
}

function normalizeAdminPlusAutomation(value?: Partial<AdminPlusAutomationConfig>): AdminPlusAutomationConfig {
  const input = value || {};
  const shipmentTimes = normalizeShipmentAutomationTimes(input.shipmentTimes);
  const priceCheckTimes = normalizeAutomationTimes(input.priceCheckTimes, DEFAULT_ADMINPLUS_AUTOMATION.priceCheckTimes);
  return {
    enabled: input.enabled === true,
    shipmentTimes: shipmentTimes.length ? shipmentTimes : [...DEFAULT_ADMINPLUS_AUTOMATION.shipmentTimes],
    priceWatchEnabled: input.priceWatchEnabled !== false,
    priceCheckTimes: priceCheckTimes.length ? priceCheckTimes : [...DEFAULT_ADMINPLUS_AUTOMATION.priceCheckTimes],
    startedAt: text(input.startedAt),
    lastPurchaseAt: text(input.lastPurchaseAt),
    lastShipmentAt: text(input.lastShipmentAt),
    lastPriceCheckAt: text(input.lastPriceCheckAt),
    accountRules: Array.isArray(input.accountRules)
      ? input.accountRules.map((row) => ({
          accountId: text(row.accountId),
          vendorName: text(row.vendorName),
          enabled: row.enabled !== false,
          autoPurchase: row.autoPurchase !== false,
          autoPayment: row.autoPayment === true,
          paymentMaxPerBatch: Math.max(0, toNumber(row.paymentMaxPerBatch, 0)),
          paymentDailyLimit: Math.max(0, toNumber(row.paymentDailyLimit, 0)),
          autoShipment: row.autoShipment !== false,
        })).filter((row) => row.accountId || row.vendorName)
      : [],
  };
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
  [SETTINGS_STORAGE_KEY, ...LEGACY_SETTINGS_STORAGE_KEYS].forEach((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!removeLegacyOrderScheduleFields(parsed)) return;
      window.localStorage.setItem(key, JSON.stringify(parsed));
    } catch {
      // Persistent settings cleanup must never block app startup.
    }
  });
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (removeLegacyOrderScheduleFields(parsed)) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Runtime session cleanup must never block app startup.
  }
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

const DEFAULT_NEW_COUPON_DRAFT: NewCouponDraft = {
  contractId: "",
  maxDiscountPrice: 0,
  startAt: "",
  endAt: "",
};

function parseCouponOptionIds(value: unknown) {
  const seen = new Set<string>();
  return String(value || "")
    .split(/[\s,;|]+/)
    .map((item) => cleanId(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 200);
}

function couponNameWithDateSuffixForUi(value: unknown, dateText: string) {
  const base = text(value || "24시간 즉시할인")
    .replace(/\s+20\d{2}-\d{2}-\d{2}\s*$/g, "")
    .trim();
  return `${base || "24시간 즉시할인"} ${dateText}`.trim().slice(0, 45);
}

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
  automationEnabled: false,
  automationValidatedAt: "",
  automationActivatedAt: "",
  automationStoppedAt: "",
  lastPreflightAt: "",
  unacknowledgedFailureCount: 0,
  tossCouponAutomationAvailable: false,
  rollingTemplates: [],
};

const DEFAULT_API_ENDPOINT_SETTINGS: ApiEndpointSettings = {
  COUPANG_ORDERS_PATH: "/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets",
  COUPANG_VENDOR_ITEM_INVENTORY_PATH: "/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/{vendorItemId}/inventories",
  COUPANG_SHIPMENT_UPLOAD_PATH: "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/orders/invoices",
  COUPANG_ORDER_ACK_PATH: "/v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets/acknowledgement",
  COUPANG_COUPON_CREATE_PATH: "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupon",
  COUPANG_COUPON_APPLY_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items",
  COUPANG_COUPON_CANCEL_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}",
  COUPANG_COUPON_REQUEST_STATUS_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/requested/{requestedId}",
  COUPANG_COUPON_CONTRACT_LIST_PATH: "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/contract/list",
  COUPANG_COUPON_LIST_PATH: "/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupons",
  COUPANG_COUPON_ITEM_LIST_PATH: "/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items",
  TOSS_ORDERS_PATH: "/api/v3/shopping-fep/orders/v2",
  TOSS_ORDER_STATUS_PATH: "/api/v3/shopping-fep/orders/products/status",
  TOSS_SHIPMENT_UPLOAD_PATH: "/api/v3/shopping-fep/orders/products/delivery",
  savedAt: "",
};

type ApiEndpointKey = Exclude<keyof ApiEndpointSettings, "savedAt">;

const API_ENDPOINT_FIELDS: Array<{ key: ApiEndpointKey; channel: Channel; label: string; requiredTokens?: string[] }> = [
  { key: "COUPANG_ORDERS_PATH", channel: "쿠팡", label: "주문조회", requiredTokens: ["{vendorId}"] },
  { key: "COUPANG_VENDOR_ITEM_INVENTORY_PATH", channel: "쿠팡", label: "옵션·재고조회", requiredTokens: ["{vendorItemId}"] },
  { key: "COUPANG_SHIPMENT_UPLOAD_PATH", channel: "쿠팡", label: "송장등록", requiredTokens: ["{vendorId}"] },
  { key: "COUPANG_ORDER_ACK_PATH", channel: "쿠팡", label: "주문확인", requiredTokens: ["{vendorId}"] },
  { key: "COUPANG_COUPON_CREATE_PATH", channel: "쿠팡", label: "쿠폰생성", requiredTokens: ["{vendorId}"] },
  { key: "COUPANG_COUPON_APPLY_PATH", channel: "쿠팡", label: "쿠폰상품적용", requiredTokens: ["{vendorId}", "{couponId}"] },
  { key: "COUPANG_COUPON_CANCEL_PATH", channel: "쿠팡", label: "쿠폰취소", requiredTokens: ["{vendorId}", "{couponId}"] },
  { key: "COUPANG_COUPON_REQUEST_STATUS_PATH", channel: "쿠팡", label: "쿠폰요청상태", requiredTokens: ["{vendorId}", "{requestedId}"] },
  { key: "COUPANG_COUPON_CONTRACT_LIST_PATH", channel: "쿠팡", label: "쿠폰계약서목록", requiredTokens: ["{vendorId}"] },
  { key: "COUPANG_COUPON_LIST_PATH", channel: "쿠팡", label: "쿠폰목록", requiredTokens: ["{vendorId}"] },
  { key: "COUPANG_COUPON_ITEM_LIST_PATH", channel: "쿠팡", label: "쿠폰상품목록", requiredTokens: ["{vendorId}", "{couponId}"] },
  { key: "TOSS_ORDERS_PATH", channel: "토스", label: "주문조회" },
  { key: "TOSS_ORDER_STATUS_PATH", channel: "토스", label: "주문상태변경" },
  { key: "TOSS_SHIPMENT_UPLOAD_PATH", channel: "토스", label: "송장등록" },
];

function normalizeApiPath(value: unknown, fallback: string) {
  const raw = text(value).trim();
  if (!raw) return fallback;
  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const pathOnly = withoutOrigin.split("?")[0].trim();
  if (!pathOnly.startsWith("/") || pathOnly.includes("\n") || pathOnly.includes("\r")) return fallback;
  return pathOnly;
}

function normalizeApiEndpointSettings(value?: Partial<ApiEndpointSettings> | null): ApiEndpointSettings {
  const source = value || {};
  const normalized = { ...DEFAULT_API_ENDPOINT_SETTINGS };
  API_ENDPOINT_FIELDS.forEach(({ key }) => {
    normalized[key] = normalizeApiPath(source[key], DEFAULT_API_ENDPOINT_SETTINGS[key]);
  });
  normalized.savedAt = text(source.savedAt);
  return normalized;
}

function apiEndpointValidationIssues(value: ApiEndpointSettings) {
  const issues: string[] = [];
  API_ENDPOINT_FIELDS.forEach((field) => {
    const pathValue = value[field.key];
    if (!pathValue.startsWith("/")) issues.push(`${field.channel} ${field.label}: 경로는 /로 시작해야 합니다.`);
    (field.requiredTokens || []).forEach((token) => {
      if (!pathValue.includes(token)) issues.push(`${field.channel} ${field.label}: ${token} 자리표시자가 필요합니다.`);
    });
  });
  return issues;
}

const B2B_VENDOR_LINK_HEADERS = ["업체명", "주소", "로그인ID", "메모", "사용"];

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
      senderName: "E",
      senderPhone: "F",
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
      senderName: "C",
      senderPhone: "D",
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

function stableTextHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableOrderRowId(channel: Channel, values: unknown[]) {
  const source = [channel, ...values.map((value) => text(value))].join("|");
  return `order-api-${stableTextHash(source)}`;
}

function makeB2BVendorLink(
  vendorName: string,
  url: string,
  memo = "",
  enabled = true,
  loginId = "",
): B2BVendorLink {
  return { id: makeId("b2b-link"), vendorName, url, loginId, memo, enabled };
}

function makeMapping(
  channel: Channel,
  optionId: string,
  vendorName: string,
  vendorCode: string,
  vendorProductName: string,
  cost: number,
  baseQty: number,
  shippingFee = 0,
  purchaseTime = "09:00",
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
    shippingFee: Math.max(0, toNumber(shippingFee, 0)),
    purchaseTime: normalizeOptionPurchaseTimes(purchaseTime),
    updatedAt: new Date().toISOString(),
  };
}


function mappingServerKey(channel: Channel, optionId: unknown) {
  const cleanOptionId = cleanId(optionId);
  return cleanOptionId ? `${parseChannel(channel)}|${cleanOptionId}` : "";
}

function completeMappingRowsForServer(rows: MappingRow[]) {
  return normalizeMappingRows(rows).filter((row) => Boolean(mappingServerKey(row.channel, row.optionId)));
}

function mappingRowsFingerprint(rows: MappingRow[]) {
  return completeMappingRowsForServer(rows)
    .map((row) => [
      mappingServerKey(row.channel, row.optionId),
      text(row.vendorName),
      text(row.vendorCode),
      text(row.vendorProductName),
      toNumber(row.cost, 0),
      Math.max(1, toNumber(row.baseQty, 1)),
      Math.max(0, toNumber(row.shippingFee, 0)),
      normalizeOptionPurchaseTimes(row.purchaseTime),
      text(row.updatedAt),
    ].join("|"))
    .sort()
    .join("\n");
}

function mergeMappingRows(localRows: MappingRow[], serverRows: MappingRow[]) {
  const merged = new Map<string, MappingRow>();
  completeMappingRowsForServer(serverRows).forEach((row) => {
    merged.set(mappingServerKey(row.channel, row.optionId), row);
  });
  completeMappingRowsForServer(localRows).forEach((row) => {
    const key = mappingServerKey(row.channel, row.optionId);
    const server = merged.get(key);
    const localUpdated = Date.parse(text(row.updatedAt)) || 0;
    const serverUpdated = Date.parse(text(server?.updatedAt)) || 0;
    if (!server || localUpdated > serverUpdated) merged.set(key, row);
  });
  const incompleteLocal = normalizeMappingRows(localRows).filter((row) => !mappingServerKey(row.channel, row.optionId));
  return normalizeMappingRows([...incompleteLocal, ...merged.values()]);
}

function mappingTombstones(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, timestamp]) => [text(key), text(timestamp)] as const)
      .filter(([key, timestamp]) => Boolean(key) && Boolean(Date.parse(timestamp))),
  );
}

function mergeMappingRowsWithTombstones(
  localRows: MappingRow[],
  serverRows: MappingRow[],
  tombstones: Record<string, string>,
) {
  const alive = (row: MappingRow) => {
    const key = mappingServerKey(row.channel, row.optionId);
    if (!key) return true;
    const deletedAt = Date.parse(tombstones[key] || "") || 0;
    const updatedAt = Date.parse(text(row.updatedAt)) || 0;
    return !deletedAt || updatedAt > deletedAt;
  };
  return mergeMappingRows(localRows.filter(alive), serverRows.filter(alive));
}

function isHttp404(error: unknown) {
  return /HTTP\s+404\b/i.test(String(error));
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


const ADDRESS_BASE_ALIASES = [
  "수취인 주소1",
  "수취인주소1",
  "받는분주소1",
  "배송지주소1",
  "배송주소1",
  "기본주소",
  "주소1",
  "receiver_addr1",
  "receiverAddress1",
  "addr1",
  "address1",
];

const ADDRESS_DIRECT_ALIASES = [
  "수취인 주소",
  "수취인주소",
  "수령인 주소",
  "수령인주소",
  "배송지",
  "배송지주소",
  "받는분주소",
  "배송주소",
  "전체주소",
  "주소",
  "receiver_address",
  "receiverAddress",
  "shippingAddress",
  "deliveryAddress",
  "fullAddress",
  "address",
];

const ADDRESS_DETAIL_ALIASES = [
  "수취인 주소2",
  "수취인주소2",
  "받는분주소2",
  "배송지주소2",
  "배송주소2",
  "상세주소",
  "세부주소",
  "주소2",
  "receiver_addr2",
  "receiverAddress2",
  "addr2",
  "address2",
  "detailAddress",
  "detailedAddress",
  "addressDetail",
];

function addressCell(row: string[], map: Map<string, number>) {
  return joinAddressParts(
    cell(row, map, ADDRESS_BASE_ALIASES),
    cell(row, map, ADDRESS_DIRECT_ALIASES),
    cell(row, map, ADDRESS_DETAIL_ALIASES),
  );
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
      senderName: columnLetterByAliases(headerRow, ["보내는분성명", "보내는분", "주문자성명", "주문자명", "발송인", "업체명", "업체명(필수)", "발송업체 상호", "송하인명", "보내는사람"]),
      senderAddress: columnLetterByAliases(headerRow, ["보내는분주소", "주문자주소", "발송인주소"]),
      senderPhone: columnLetterByAliases(headerRow, ["보내는분전화번호", "주문자전화번호", "주문자전화", "발송인전화번호", "업체전화", "업체전화(필수)", "발송업체 연락처", "송하인전화"]),
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
      cost: toNumber(cell(row, map, ["기준단가", "원가", "공급가", "매입가"]), 0),
      baseQty: toNumber(cell(row, map, ["기본수량", "발주수량배수", "수량배수", "수량", "기준수량"]), 1),
      shippingFee: toNumber(cell(row, map, ["배송비", "기본배송비", "발주배송비", "공급처배송비"]), 0),
      purchaseTime: cell(row, map, ["발주시간", "발주 시간", "자동발주시간", "주문등록시간"]) || "09:00",
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
  stockId = "",
): TossOptionIdRow {
  const cleanManagementCode = text(managementCode);
  const cleanItemName = text(itemName);
  return {
    id: makeId("toss-option"),
    optionId: cleanId(optionId),
    stockId: cleanId(stockId),
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
    const stockId = cleanId(cell(row, map, [
      "stockId",
      "토스 stockId",
      "토스 Stock ID",
      "재고 ID",
      "재고ID",
    ]));
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
    result.push(makeTossOptionIdRow(optionId, optionCode, productName, memo, productId, itemName, managementCode, stockId));
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
      stockId: cleanId(row.stockId),
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
  /** order.stockId -> productItemId master bridge */
  byStockId: Map<string, TossOptionIdRow>;
  byProductStockId: Map<string, TossOptionIdRow>;
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
  const byStockId = new Map<string, TossOptionIdRow>();
  const byProductStockId = new Map<string, TossOptionIdRow>();
  const ambiguousStockIds = new Set<string>();
  const byProductCode = new Map<string, TossOptionIdRow>();
  const byCode = new Map<string, TossOptionIdRow>();
  const ambiguousCodes = new Set<string>();
  const weightBuckets = new Map<string, TossOptionIdRow[]>();
  normalizeTossOptionIdRows(rows).forEach((row) => {
    if (row.stockId) {
      setUniqueTossOption(byStockId, ambiguousStockIds, row.stockId, row);
      if (row.productId) setUniqueTossOption(byProductStockId, ambiguousStockIds, `${row.productId}|${row.stockId}`, row);
    }
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
  return { byStockId, byProductStockId, byProductCode, byCode, ambiguousCodes, byWeight, ambiguousWeights };
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

function tossOrderStockIdCandidates(order: OrderRow) {
  const raw = order.raw || {};
  const seen = new Set<string>();
  return [
    text(raw.tossStockId),
    text(raw.stockId),
    // collect-preview가 stockId를 임시 optionId로 사용한 구버전 자료도 호환합니다.
    text(order.optionId),
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
  const stockIds = tossOrderStockIdCandidates(order);
  const codeCandidates = tossOrderCodeCandidates(order);
  const productIds = tossOrderProductIdCandidates(order);

  // 토스 주문 API의 stockId는 상품 API의 productItemId와 다른 식별자입니다.
  // 상품 상세 API stocks[].id(stockId) -> stocks[].itemId(productItemId)를 최우선으로 연결합니다.
  for (const productId of productIds) {
    for (const stockId of stockIds) {
      const row = lookup.byProductStockId.get(`${productId}|${stockId}`);
      if (row) return row;
    }
  }
  for (const stockId of stockIds) {
    const row = lookup.byStockId.get(stockId);
    if (row) return row;
  }

  // stockId bridge가 없을 때는 판매자 옵션관리코드(productItemManagementCode)를 사용합니다.
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
    ["상품ID", "상품 옵션 ID(productItemId)", "주문 stockId", "옵션 관리 코드", "옵션명", "상품명", "메모"],
    ...normalizeTossOptionIdRows(rows).map((row) => [
      row.productId,
      row.optionId,
      row.stockId,
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
  const startTime = normalizeScheduleTime(schedules.couponApply.time, "23:52");
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

function kstDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function addDateTextDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function immediateCouponWindowForUi(schedules: ScheduleConfig) {
  const now = kstDateTimeParts();
  const cancelTime = normalizeScheduleTime(schedules.couponCancel.time, "23:50");
  const endDate = now.time < cancelTime ? now.date : addDateTextDays(now.date, 1);
  return { startAt: `${now.date} ${now.time}`, endAt: `${endDate} ${cancelTime}`, scheduleStartDate: now.date };
}

function nextCouponIssueWindowForUi(schedules: ScheduleConfig) {
  const now = kstDateTimeParts();
  const preflightTime = normalizeScheduleTime(schedules.couponPreflight.time, "23:45");
  const applyTime = normalizeScheduleTime(schedules.couponApply.time, "23:52");
  const cancelTime = normalizeScheduleTime(schedules.couponCancel.time, "23:50");
  const issueDate = now.time < preflightTime ? now.date : addDateTextDays(now.date, 1);
  const endDate = addDateTextDays(issueDate, cancelTime <= applyTime ? 1 : 0);
  return {
    startAt: `${issueDate} ${applyTime}`,
    endAt: `${endDate} ${cancelTime}`,
    scheduleStartDate: issueDate,
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
      baseCouponName: text(record.baseCouponName) || text(record.couponName) || `couponId ${sourceCouponId}`,
      maxDiscountPrice: toNumber(record.maxDiscountPrice, 0),
      wowExclusive: Boolean(record.wowExclusive),
      automationState: record.automationState === "validated" || record.automationState === "active" || record.automationState === "stopped" || record.automationState === "failed" ? record.automationState : "draft",
      preflightStatus: record.preflightStatus === "통과" || record.preflightStatus === "실패" ? record.preflightStatus : "미검증",
      preflightAt: text(record.preflightAt),
      preflightIssues: Array.isArray(record.preflightIssues) ? record.preflightIssues.map((item) => text(item)).filter(Boolean) : [],
      failureAcknowledgedAt: text(record.failureAcknowledgedAt),
      scheduleStartDate: dateKey(record.scheduleStartDate),
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
    baseCouponName: template.baseCouponName || template.couponName,
    maxDiscountPrice: toNumber(template.maxDiscountPrice, 0),
    wowExclusive: Boolean(template.wowExclusive),
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
    automationEnabled: Boolean(source.automationEnabled),
    automationValidatedAt: text(source.automationValidatedAt),
    automationActivatedAt: text(source.automationActivatedAt),
    automationStoppedAt: text(source.automationStoppedAt),
    lastPreflightAt: text(source.lastPreflightAt),
    unacknowledgedFailureCount: toNumber(source.unacknowledgedFailureCount, 0),
    tossCouponAutomationAvailable: Boolean(source.tossCouponAutomationAvailable),
    rollingTemplates: normalizeRollingCouponTemplates(source.rollingTemplates),
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
      maxDiscountPrice: toNumber(record.maxDiscountPrice, 0),
      wowExclusive: /true|1|yes|y/i.test(text(record.wowExclusive)),
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
      loginId: text((row as B2BVendorLink & { loginId?: string }).loginId),
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
    const loginId = cell(row, map, ["로그인ID", "로그인 아이디", "아이디", "ID", "userId", "loginId"]);
    const memo = cell(row, map, ["메모", "비고", "설명"]);
    const enabledText = cell(row, map, ["사용", "사용여부", "활성", "표시"]);
    if (!vendorName && !url) return;
    if (!vendorName || !url) return;
    const enabled = !/false|n|no|미사용|숨김|비활성|0/i.test(enabledText);
    result.push(makeB2BVendorLink(vendorName, url, memo, enabled, loginId));
  });
  return normalizeB2BVendorLinks(result);
}

function b2bVendorLinksToSheet(rows: B2BVendorLink[]) {
  return [
    B2B_VENDOR_LINK_HEADERS,
    ...rows.map((row) => [
      row.vendorName,
      row.url,
      row.loginId,
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
        address: addressCell(row, map),
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
          address: addressCell(row, map),
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
      shippingFee: Math.max(0, toNumber(row.shippingFee, 0)),
      purchaseTime: normalizeOptionPurchaseTimes(row.purchaseTime),
      updatedAt: text(row.updatedAt) || undefined,
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

function isShippingStatus(channel: Channel, status: string) {
  const normalized = normalizeHeader(status);
  if (!normalized) return false;
  if (normalized === "배송중" || normalized.includes("배송중")) return true;
  if (channel === "쿠팡") return normalized === "departure" || normalized === "delivering" || normalized.includes("배송지시");
  return normalized === "delivering" || normalized === "shipping";
}

function isDeliveredStatus(channel: Channel, status: string) {
  const normalized = normalizeHeader(status);
  if (!normalized) return false;
  if (normalized === "배송완료" || normalized.includes("배송완료")) return true;
  if (channel === "쿠팡") return normalized === "finaldelivery";
  return normalized === "delivered" || normalized === "confirmedorder";
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

function purchaseHistoryKey(channel: Channel, orderNo: unknown, optionId: unknown) {
  return [parseChannel(channel), normalizeOrderKey(orderNo), cleanId(optionId)].join("|");
}

function purchaseRowHistoryKey(row: PurchaseRow) {
  return purchaseHistoryKey(row.channel, row.orderNo, row.optionId);
}

function buildPurchaseHistorySet(history: PurchaseHistoryRow[]) {
  return new Set(history.map((row) => purchaseHistoryKey(row.channel, row.orderNo, row.optionId)));
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

function rawAddressField(order: OrderRow, aliases: string[]) {
  const raw = order.raw || {};
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const direct = text(raw[alias]);
    if (direct) return direct;
    const found = Object.entries(raw).find(([key, value]) =>
      normalizeHeader(key) === normalizedAlias && Boolean(text(value)),
    );
    if (found) return text(found[1]);
  }
  return "";
}

function addressIncludes(container: unknown, part: unknown) {
  const target = normalizeAddress(container).replace(/[^0-9a-zA-Z가-힣]/g, "");
  const fragment = normalizeAddress(part).replace(/[^0-9a-zA-Z가-힣]/g, "");
  return Boolean(target && fragment && target.includes(fragment));
}

function analyzeOrderAddress(order: OrderRow): AddressQualityIssue[] {
  const issues: AddressQualityIssue[] = [];
  const address = text(order.address);
  const compact = normalizeAddress(address).replace(/[^0-9a-zA-Z가-힣]/g, "");
  const detail = rawAddressField(order, [
    ...ADDRESS_DETAIL_ALIASES,
    "receiver.addr2",
    "parent.receiver.addr2",
    "shipmentBox.receiver.addr2",
    "shippingAddress.detailAddress",
    "deliveryAddress.detailAddress",
  ]);
  const push = (level: AddressQualityLevel, item: string, detailText: string) => {
    issues.push({
      id: `${order.id}-${normalizeHeader(item)}`,
      orderId: order.id,
      channel: order.channel,
      orderNo: order.orderNo,
      receiverName: order.receiverName,
      address,
      level,
      item,
      detail: detailText,
    });
  };

  if (!address) {
    push("차단", "주소 누락", "배송 주소가 비어 있어 발주·송장 처리를 진행할 수 없습니다.");
    return issues;
  }
  if (/^(없음|미입력|주소없음|null|undefined|-+)$/i.test(address.trim())) {
    push("차단", "주소값 오류", "실제 배송지가 아닌 빈 값 또는 임시 문구가 입력돼 있습니다.");
  }
  const openCount = (address.match(/\(/g) || []).length;
  const closeCount = (address.match(/\)/g) || []).length;
  if (openCount !== closeCount) {
    push("차단", "괄호 불일치", "주소의 여는 괄호와 닫는 괄호 수가 달라 원문 손상 가능성이 있습니다.");
  }
  if (detail && !addressIncludes(address, detail)) {
    push("차단", "상세주소 누락", `API 원문 상세주소 '${detail}'가 최종 주소에 포함되지 않았습니다.`);
  }
  if (/\)\s*$/.test(address) && !detail) {
    push("주의", "괄호 뒤 상세주소 확인", "주소가 괄호로 끝납니다. 동·호수·층 등 상세주소가 원래 없는 주문인지 확인하세요.");
  }
  if (compact.length < 10) {
    push("주의", "주소 길이 확인", "주소가 지나치게 짧아 기본주소 또는 상세주소 누락 가능성이 있습니다.");
  }
  if (!/\d/.test(address)) {
    push("주의", "번지 확인", "주소에 숫자가 없어 도로명 번지·건물번호 누락 가능성이 있습니다.");
  }
  if (!text(order.zip)) {
    push("주의", "우편번호 누락", "우편번호가 비어 있습니다. 업체 발주양식에서 필수인지 확인하세요.");
  }
  if (!text(order.receiverPhone)) {
    push("주의", "연락처 누락", "수취인 연락처가 비어 있어 배송 처리에 문제가 생길 수 있습니다.");
  }
  return issues;
}

function analyzeAddressQuality(orders: OrderRow[]) {
  return orders.flatMap(analyzeOrderAddress);
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
    const sourceOrder = orders.find((order) => order.id === row.id || (
      order.channel === row.channel &&
      normalizeOrderKey(order.orderNo) === normalizeOrderKey(row.orderNo) &&
      cleanId(order.optionId) === cleanId(row.optionId)
    ));
    if (sourceOrder) {
      analyzeOrderAddress(sourceOrder).forEach((issue) => {
        push(row, issue.level === "차단" ? "차단" : "확인", issue.item, issue.detail);
      });
    } else if (!text(row.address)) {
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
type CouponExecutionCheckRow = CouponRow & {
  actionLabel: string;
  executeStatus: "대기" | "차단" | "중복";
  executeReason: string;
};
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
  // 운영 환경은 Cloudflare Worker의 동일 HTTPS 출처만 사용합니다.
  return "";
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
    const orderNo = text(raw.orderNo);
    const orderedAt = text(raw.orderedAt);
    const shipmentBoxId = cleanId(raw.shipmentBoxId || raw["shipmentBox.shipmentBoxId"] || raw["parent.shipmentBoxId"]);
    const orderProductId = cleanId(raw.orderProductId || raw.tossOrderProductId || raw.orderItemId || raw.shipmentItemId || raw["item.orderProductId"] || raw["parent.orderProductId"]);
    const optionId = cleanId(raw.optionId);
    const productName = text(raw.productName);
    const optionName = text(raw.optionName);
    const qty = toNumber(raw.qty, 1);
    return {
      id: stableOrderRowId(channel, [orderNo, shipmentBoxId, orderProductId, optionId, productName, optionName, qty, orderedAt]),
      channel,
      orderNo,
      orderedAt,
      statusUpdatedAt: text(raw.statusUpdatedAt || raw.deliveryStatusUpdatedAt || raw.updatedAt || raw.shippedAt),
      shipmentBoxId,
      orderProductId,
      optionId,
      productName,
      optionName,
      qty,
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
    cleanId(row.shipmentBoxId),
    cleanId(row.orderProductId),
    cleanId(row.optionId),
    normalizeHeader(row.productName),
    normalizeHeader(row.optionName),
    normalizeName(row.receiverName),
    normalizeAddress(row.address),
    String(row.qty || 0),
    text(row.orderedAt),
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

function upsertSelectedOrderRows(prev: OrderRow[], selected: OrderRow[]) {
  const selectedByKey = new Map(uniqueOrderRows(selected).map((row) => [orderRowUniqueKey(row), row]));
  const kept = prev.filter((row) => !selectedByKey.has(orderRowUniqueKey(row)));
  const rows = [...kept, ...selectedByKey.values()];
  const previousKeys = new Set(prev.map(orderRowUniqueKey));
  const addedCount = Array.from(selectedByKey.keys()).filter((key) => !previousKeys.has(key)).length;
  return {
    rows,
    addedCount,
    updatedCount: selectedByKey.size - addedCount,
    skippedCount: selected.length - selectedByKey.size,
  };
}

function rollingCouponStatusBucket(template: RollingCouponTemplate) {
  if (template.automationState === "failed" || template.preflightStatus === "실패") return "attention" as const;
  if (template.enabled && template.automationState === "active" && template.preflightStatus === "통과") return "active" as const;
  if (template.automationState === "validated" && template.preflightStatus === "통과") return "validated" as const;
  return "unverified" as const;
}

function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("간편운영");
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [operationMetricDetail, setOperationMetricDetail] = useState("");
  const operationOverviewCacheRef = useRef<{
    key: string;
    at: number;
    results: Array<{
      ok: boolean;
      rows: OrderRow[];
      rawRows: number;
      normalizedRows: number;
      channel: Channel;
      status: string;
      bucket: "payment" | "preparing" | "shipping" | "delivered";
      error?: string;
    }>;
    serverHistory: AdminPlusPurchaseHistoryRow[];
  } | null>(null);
  const [mappingWorkspaceView, setMappingWorkspaceView] = useState<MappingWorkspaceView>("mapping");
  const [credentialAdminToken, setCredentialAdminToken] = useState(() => {
    try { return window.sessionStorage.getItem("b2b-ncloud-admin-token-session") || ""; } catch { return ""; }
  });
  const [credentialVendorId, setCredentialVendorId] = useState("");
  const [credentialAccessKey, setCredentialAccessKey] = useState("");
  const [credentialSecretKey, setCredentialSecretKey] = useState("");
  const [credentialSecretConfirm, setCredentialSecretConfirm] = useState("");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState("새 Secret Key는 브라우저에 저장하지 않습니다.");
  const [tossCredentialAccessKey, setTossCredentialAccessKey] = useState("");
  const [tossCredentialSecretKey, setTossCredentialSecretKey] = useState("");
  const [tossCredentialSecretConfirm, setTossCredentialSecretConfirm] = useState("");
  const [tossCredentialBusy, setTossCredentialBusy] = useState(false);
  const [tossCredentialMessage, setTossCredentialMessage] = useState("토스쇼핑 Access Token은 Ncloud에서 자동 갱신합니다.");
  const [tossCredentialStatus, setTossCredentialStatus] = useState<Record<string, unknown> | null>(null);
  const [adminplusAccounts, setAdminplusAccounts] = useState<AdminPlusAccountStatusRow[]>([]);
  const [adminplusAccountId, setAdminplusAccountId] = useState("");
  const [adminplusAccountLabel, setAdminplusAccountLabel] = useState("");
  const [adminplusVendorName, setAdminplusVendorName] = useState("");
  const [adminplusClientId, setAdminplusClientId] = useState("");
  const [adminplusClientSecret, setAdminplusClientSecret] = useState("");
  const [adminplusClientSecretConfirm, setAdminplusClientSecretConfirm] = useState("");
  const [adminplusAccountEnabled, setAdminplusAccountEnabled] = useState(true);
  const [adminplusCredentialBusy, setAdminplusCredentialBusy] = useState(false);
  const [adminplusCredentialMessage, setAdminplusCredentialMessage] = useState("협력사별 Client ID/Secret은 Ncloud 보안 저장소에만 보관합니다.");
  const [mappings, setMappings] = useState<MappingRow[]>(DEFAULT_MAPPINGS);
  const [manualMappingOpen, setManualMappingOpen] = useState(false);
  const [manualMappingDraft, setManualMappingDraft] = useState({
    channel: "쿠팡" as Channel,
    optionId: "",
    vendorName: "",
    vendorCode: "",
    vendorProductName: "",
    baseQty: 1,
    shippingFee: 0,
    cost: 0,
    purchaseTime: "08:40",
  });
  const [mappingSyncMessage, setMappingSyncMessage] = useState("서버 최신 매핑을 확인하는 중입니다.");
  const [mappingSyncBusy, setMappingSyncBusy] = useState(false);
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
  const [apiEndpointSettings, setApiEndpointSettings] = useState<ApiEndpointSettings>(
    DEFAULT_API_ENDPOINT_SETTINGS,
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
  const [couponAutomationBusy, setCouponAutomationBusy] = useState(false);
  const [couponAutomationFailures, setCouponAutomationFailures] = useState<CouponAutomationFailureRow[]>([]);
  const [couponOptionLookupText, setCouponOptionLookupText] = useState("");
  const [couponOptionLookupRows, setCouponOptionLookupRows] = useState<CouponOptionLookupRow[]>([]);
  const [couponOptionLookupBusy, setCouponOptionLookupBusy] = useState(false);
  const [newCouponDraft, setNewCouponDraft] = useState<NewCouponDraft>(DEFAULT_NEW_COUPON_DRAFT);
  const [newCouponPreflightIssues, setNewCouponPreflightIssues] = useState<string[]>([]);
  const [newCouponPreflightAt, setNewCouponPreflightAt] = useState("");
  const [newCouponBusy, setNewCouponBusy] = useState(false);
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
  const [adminplusAutomation, setAdminplusAutomation] = useState<AdminPlusAutomationConfig>(normalizeAdminPlusAutomation());
  const [adminplusShipmentTimesText, setAdminplusShipmentTimesText] = useState(DEFAULT_ADMINPLUS_AUTOMATION.shipmentTimes.join(", "));
  const [adminplusPurchaseHistory, setAdminplusPurchaseHistory] = useState<AdminPlusPurchaseHistoryRow[]>([]);
  const [adminplusPreflightRows, setAdminplusPreflightRows] = useState<Array<Record<string, unknown>>>([]);
  const [adminplusProductLinks, setAdminplusProductLinks] = useState<AdminPlusProductLink[]>([]);
  const [adminplusProductLinkDrafts, setAdminplusProductLinkDrafts] = useState<Record<string, AdminPlusProductLinkDraft>>({});
  const [adminplusPriceAlerts, setAdminplusPriceAlerts] = useState<AdminPlusPriceAlert[]>([]);
  const [adminplusWatchSaveState, setAdminplusWatchSaveState] = useState<AdminPlusWatchSaveState>({ status: "idle", message: "서버 저장 상태를 확인하세요.", savedAt: "" });
  const [showAdminPlusFailureDetails, setShowAdminPlusFailureDetails] = useState(false);
  const [adminplusPriceCheckTimesText, setAdminplusPriceCheckTimesText] = useState(DEFAULT_ADMINPLUS_AUTOMATION.priceCheckTimes.join(", "));
  const [adminplusCatalogAccountId, setAdminplusCatalogAccountId] = useState("");
  const [adminplusCatalogMappingId, setAdminplusCatalogMappingId] = useState("");
  const [adminplusCatalogProducts, setAdminplusCatalogProducts] = useState<AdminPlusCatalogProduct[]>([]);
  const [adminplusCatalogProductCode, setAdminplusCatalogProductCode] = useState("");
  const [adminplusCatalogOptionCode, setAdminplusCatalogOptionCode] = useState("");
  const [adminplusCatalogQty, setAdminplusCatalogQty] = useState(1);
  const [adminplusCatalogShippingFee, setAdminplusCatalogShippingFee] = useState(0);
  const [adminplusCatalogBusy, setAdminplusCatalogBusy] = useState(false);
  const [adminplusCatalogMessage, setAdminplusCatalogMessage] = useState("어드민플러스 계정을 선택하고 상품목록을 불러오세요.");
  const [adminplusMappingSearch, setAdminplusMappingSearch] = useState("");
  const [adminplusProductSearch, setAdminplusProductSearch] = useState("");
  const [adminplusGlobalSearchQuery, setAdminplusGlobalSearchQuery] = useState("");
  const [adminplusGlobalSearchRows, setAdminplusGlobalSearchRows] = useState<AdminPlusGlobalCatalogRow[]>([]);
  const [adminplusGlobalSearchActiveUnlimitedOnly, setAdminplusGlobalSearchActiveUnlimitedOnly] = useState(true);
  const [adminplusGlobalSearchBusy, setAdminplusGlobalSearchBusy] = useState(false);
  const [adminplusGlobalSearchMessage, setAdminplusGlobalSearchMessage] = useState("연결된 모든 AdminPlus 업체 상품을 상품명으로 통합검색합니다.");
  const [adminplusReplacementTargetLinkId, setAdminplusReplacementTargetLinkId] = useState("");
  const [adminplusEnrollmentTargetMappingId, setAdminplusEnrollmentTargetMappingId] = useState("");
  const [adminplusGlobalReplacementOptionCodes, setAdminplusGlobalReplacementOptionCodes] = useState<Record<string, string>>({});
  const [adminplusSuggestionSearch, setAdminplusSuggestionSearch] = useState("");
  const [adminplusMatchSuggestions, setAdminplusMatchSuggestions] = useState<AdminPlusMatchSuggestion[]>([]);
  const [adminplusAutomationBusy, setAdminplusAutomationBusy] = useState(false);
  const [adminplusShipmentMarketKeys, setAdminplusShipmentMarketKeys] = useState<string[] | null>(null);
  const [showAdminPlusPaymentPermissionGuide, setShowAdminPlusPaymentPermissionGuide] = useState(false);
  const [adminplusAutomationMessage, setAdminplusAutomationMessage] = useState("어드민플러스 계정과 시간을 저장하면 주문등록·송장회수를 자동 실행할 수 있습니다.");
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
    "업체송장 선택 파일은 브라우저 앱에만 임시 보관됩니다. 쿠팡+토스 업로드를 누르면 상품준비중 주문과 매칭 결과를 먼저 확인하고, 최종 업로드에서 채널 반영과 결과 파일 다운로드를 실행합니다.",
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
  const [temporaryVendorShipmentFiles, setTemporaryVendorShipmentFiles] = useState<File[]>([]);
  const [temporaryVendorInvoiceRecords, setTemporaryVendorInvoiceRecords] = useState<InvoiceRecord[]>([]);
  const [shipmentUploadPreview, setShipmentUploadPreview] = useState<ShipmentUploadPreviewState | null>(null);
  const [shipmentUploadBusy, setShipmentUploadBusy] = useState(false);
  const [lastShipmentResultArtifacts, setLastShipmentResultArtifacts] = useState<FolderZipArtifact[]>([]);
  const [apiOverviewCounts, setApiOverviewCounts] = useState({
    coupangPayment: 0,
    tossPayment: 0,
    coupangPreparing: 0,
    tossPreparing: 0,
  });
  const [apiOverviewBusy, setApiOverviewBusy] = useState(false);
  const [apiOverviewMessage, setApiOverviewMessage] = useState("앱 시작 시 쿠팡·토스 현황을 API에서 조회합니다.");
  const [operationStatusRows, setOperationStatusRows] = useState<{ collected: OrderRow[]; payment: OrderRow[]; preparing: OrderRow[]; shipping: OrderRow[]; delivered: OrderRow[] }>({ collected: [], payment: [], preparing: [], shipping: [], delivered: [] });
  const [selectableOrderRows, setSelectableOrderRows] = useState<OrderRow[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectableOrderChannel, setSelectableOrderChannel] = useState<Channel | "전체" | null>(null);
  const [selectableOrderDiagnostics, setSelectableOrderDiagnostics] = useState<ApiDiagnosticRow[]>([]);
  const [orderSelectionBusy, setOrderSelectionBusy] = useState(false);
  const [orderSelectionMessage, setOrderSelectionMessage] = useState("쿠팡+토스 주문조회를 눌러 결제완료 상품을 한 번에 선택하세요.");
  const [operationalFailures, setOperationalFailures] = useState<OperationalFailureRow[]>([]);
  const [failureCenterBusyId, setFailureCenterBusyId] = useState("");
  const mappingsRef = useRef<MappingRow[]>(mappings);
  const mappingSyncReadyRef = useRef(false);
  const mappingSyncBusyRef = useRef(false);
  const mappingServerFingerprintRef = useRef("");
  const mappingDeletedKeysRef = useRef<Set<string>>(new Set());
  const mappingSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    purgeLegacyOrderScheduleStorage();
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY) || readLocalStorageWithFallback(
        STORAGE_KEY,
        LEGACY_STORAGE_KEYS,
      );
      if (saved && !window.sessionStorage.getItem(STORAGE_KEY)) {
        window.sessionStorage.setItem(STORAGE_KEY, saved);
        window.localStorage.removeItem(STORAGE_KEY);
        LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
      }
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
        if (Array.isArray(parsed.operationalFailures)) setOperationalFailures(parsed.operationalFailures);
        const restoredRollingTemplates = normalizeRollingCouponTemplates(parsed.rollingCouponTemplates || parsed.couponApiSettings?.rollingTemplates);
        if (restoredRollingTemplates.length) setRollingCouponTemplates(restoredRollingTemplates);
        if (parsed.couponApiSettings) setCouponApiSettings(normalizeCouponApiSettings({ ...parsed.couponApiSettings, rollingTemplates: restoredRollingTemplates.length ? restoredRollingTemplates : parsed.couponApiSettings.rollingTemplates }));
        if (parsed.apiEndpointSettings) setApiEndpointSettings(normalizeApiEndpointSettings(parsed.apiEndpointSettings));
        if (Array.isArray(parsed.b2bVendorLinks))
          setB2BVendorLinks(normalizeB2BVendorLinks(parsed.b2bVendorLinks));
        if (parsed.folderNames) setFolderNames(parsed.folderNames);
        if (parsed.localFolderPaths) setLocalFolderPaths(parsed.localFolderPaths);
        if (parsed.schedules)
          setSchedules(normalizeSchedules(parsed.schedules));
        if (parsed.adminplusAutomation) setAdminplusAutomation(normalizeAdminPlusAutomation(parsed.adminplusAutomation));
        if (Array.isArray(parsed.adminplusPurchaseHistory)) setAdminplusPurchaseHistory(parsed.adminplusPurchaseHistory.slice(-5000));
        if (Array.isArray(parsed.adminplusProductLinks)) setAdminplusProductLinks(normalizeAdminPlusServerLinks(parsed.adminplusProductLinks));
        if (Array.isArray(parsed.adminplusPriceAlerts)) setAdminplusPriceAlerts(parsed.adminplusPriceAlerts.slice(-1000));
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
        "클라우드 발주폴더 경로와 저장된 매핑/양식/쿠폰 설정을 자동 적용했습니다.",
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
            "저장된 발주 폴더 설정을 불러왔습니다. 클라우드 발주폴더 경로가 있으면 그 경로가 우선 사용됩니다.",
          );
        }
      })
      .catch(() => {
        setFolderMessage(
          "폴더 설정을 자동 복원하지 못했습니다. 클라우드 발주폴더 경로를 다시 확인해 주세요.",
        );
      });
  }, []);

  useEffect(() => {
    mappingsRef.current = mappings;
  }, [mappings]);

  useEffect(() => {
    try {
      const value = credentialAdminToken.trim();
      if (value) window.sessionStorage.setItem("b2b-ncloud-admin-token-session", value);
      else window.sessionStorage.removeItem("b2b-ncloud-admin-token-session");
    } catch { /* sessionStorage unavailable */ }
  }, [credentialAdminToken]);

  useEffect(() => {
    setAdminplusShipmentTimesText(adminplusAutomation.shipmentTimes.join(", "));
    setAdminplusPriceCheckTimesText(adminplusAutomation.priceCheckTimes.join(", "));
  }, [adminplusAutomation.shipmentTimes.join("|"), adminplusAutomation.priceCheckTimes.join("|")]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMappingsFromServer(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [settingsKey]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const result = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(DEFAULT_SETTINGS_KEY)}`);
        if (result?.ok && result?.data) {
          applyPersistentSettings({
            ...result.data,
            settingsKey: result.sessionKey || result.data.settingsKey || settingsKey,
          });
        }
      } catch { /* browser/local settings remain fallback */ }
      try { await loadAdminPlusAccounts(true); } catch { /* status is non-critical */ }
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mappingSyncReadyRef.current) return;
    const fingerprint = mappingRowsFingerprint(mappings);
    const hasDeletes = mappingDeletedKeysRef.current.size > 0;
    if (!hasDeletes && fingerprint === mappingServerFingerprintRef.current) return;
    if (mappingSaveTimerRef.current) window.clearTimeout(mappingSaveTimerRef.current);
    setMappingSyncMessage("매핑 변경 감지 · 1초 후 서버에 자동 저장합니다.");
    mappingSaveTimerRef.current = window.setTimeout(() => {
      void syncMappingsToServer();
    }, 1000);
    return () => {
      if (mappingSaveTimerRef.current) window.clearTimeout(mappingSaveTimerRef.current);
    };
  }, [mappings, settingsKey]);

  useEffect(() => {
    setOrderApiFilter((prev) => {
      if (prev.coupangStatus === "ACCEPT" && prev.tossStatus === "PAID") return prev;
      return { ...prev, coupangStatus: "ACCEPT", tossStatus: "PAID" };
    });
  }, []);

  useEffect(() => {
    if (activeMenu !== "쿠폰관리" && activeMenu !== "간편운영") return;
    void fetchCouponAutomationFailures();
  }, [activeMenu]);

  useEffect(() => {
    if (activeMenu !== "매핑관리" || mappingWorkspaceView !== "adminplus") return;
    void loadAdminPlusConfirmedStateFromServer({ preserveLocalMappings: true })
      .then((state) => {
        setAdminplusWatchSaveState({
          status: "success",
          message: `서버 확정 AdminPlus 링크 ${state.links.length}건을 불러왔습니다. 최신 엑셀 편집값은 유지하며, 재확정 전 자동발주는 마지막 서버 확정링크를 사용합니다.`,
          savedAt: new Date().toISOString(),
        });
        resolveOperationalFailureKind("adminplus_watch_save");
      })
      .catch((error) => {
        const msg = `서버 확정 매핑 불러오기 실패: ${String(error)}`;
        setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
        recordOperationalFailure("adminplus_watch_save", "API 매핑", "서버 확정 매핑 불러오기", error);
      });
  }, [activeMenu, mappingWorkspaceView, settingsKey]);

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
      apiEndpointSettings: normalizeApiEndpointSettings(apiEndpointSettings),
      rollingCouponTemplates,
      operationalFailures,
      b2bVendorLinks,
      folderNames,
      localFolderPaths,
      schedules,
      adminplusAutomation: normalizeAdminPlusAutomation(adminplusAutomation),
      adminplusPurchaseHistory: adminplusPurchaseHistory.slice(-5000),
      adminplusProductLinks,
      adminplusPriceAlerts: adminplusPriceAlerts.slice(-1000),
      sessionKey,
      settingsKey,
      savedAt: new Date().toISOString(),
    };
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
    apiEndpointSettings,
    rollingCouponTemplates,
    operationalFailures,
    b2bVendorLinks,
    folderNames,
    localFolderPaths,
    schedules,
    adminplusAutomation,
    adminplusPurchaseHistory,
    adminplusProductLinks,
    adminplusPriceAlerts,
    sessionKey,
    settingsKey,
  ]);

  const managedRollingOptionIds = useMemo(() => new Set(
    rollingCouponTemplates.flatMap((template) => template.options.map((option) => cleanId(option.optionId))).filter(Boolean),
  ), [rollingCouponTemplates]);
  const managedRollingCouponIds = useMemo(() => new Set(
    rollingCouponTemplates.flatMap((template) => [template.sourceCouponId, template.latestCouponId, template.lastGeneratedCouponId || ""]).map(cleanId).filter(Boolean),
  ), [rollingCouponTemplates]);
  const actualCouponStatusByTemplate = useMemo(() => {
    const couponById = new Map(couponListRows.map((row) => [cleanId(row.couponId), row]));
    const counts = new Map<string, number>();
    for (const item of couponItemRows) {
      const id = cleanId(item.couponId);
      if (id && text(item.status).toUpperCase() === "APPLIED") counts.set(id, (counts.get(id) || 0) + 1);
    }
    return new Map(rollingCouponTemplates.map((template) => {
      const id = cleanId(template.latestCouponId || template.lastGeneratedCouponId || template.sourceCouponId);
      const row = couponById.get(id);
      const actualItems = counts.get(id) || 0;
      const applied = Boolean(row && text(row.status).toUpperCase() === "APPLIED" && actualItems > 0);
      return [template.id, { exists: Boolean(row), applied, actualItems }];
    }));
  }, [rollingCouponTemplates, couponListRows, couponItemRows]);
  const couponCandidateRows = useMemo(() => couponListRows.filter((row) => {
    const couponId = cleanId(row.couponId);
    if (!couponId || managedRollingCouponIds.has(couponId)) return false;
    const itemIds = couponItemRows.filter((item) => cleanId(item.couponId) === couponId).map((item) => cleanId(item.vendorItemId)).filter(Boolean);
    if (!itemIds.length) return false;
    return itemIds.every((optionId) => !managedRollingOptionIds.has(optionId));
  }), [couponListRows, couponItemRows, managedRollingCouponIds, managedRollingOptionIds]);

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
  const channelPaymentCounts = useMemo(() => ({
    coupang: orders.filter((row) => row.channel === "쿠팡" && Boolean(text(row.orderStatus)) && isPaymentStatus(row.channel, row.orderStatus)).length,
    toss: orders.filter((row) => row.channel === "토스" && Boolean(text(row.orderStatus)) && isPaymentStatus(row.channel, row.orderStatus)).length,
  }), [orders]);
  const channelPreparingCounts = useMemo(() => ({
    coupang: orders.filter((row) => row.channel === "쿠팡" && isPreparingStatus(row.channel, row.orderStatus)).length,
    toss: orders.filter((row) => row.channel === "토스" && isPreparingStatus(row.channel, row.orderStatus)).length,
  }), [orders]);
  const purchasePreflightIssues = useMemo(
    () => validatePurchasePreflight(purchaseRows, orders, purchaseHistory),
    [purchaseRows, orders, purchaseHistory],
  );
  const purchasePreflightBlocked = useMemo(
    () => purchasePreflightIssues.filter((issue) => issue.level === "차단"),
    [purchasePreflightIssues],
  );
  const addressQualityIssues = useMemo(() => analyzeAddressQuality(orders), [orders]);
  const addressQualityBlocked = useMemo(
    () => addressQualityIssues.filter((issue) => issue.level === "차단"),
    [addressQualityIssues],
  );
  const addressQualityWarnings = useMemo(
    () => addressQualityIssues.filter((issue) => issue.level === "주의"),
    [addressQualityIssues],
  );
  const unresolvedOperationalFailures = useMemo(
    () => operationalFailures.filter((row) => row.status !== "해결"),
    [operationalFailures],
  );
  const unresolvedAdminPlusWatchSaveFailures = useMemo(
    () => operationalFailures.filter((row) => row.kind === "adminplus_watch_save" && row.status !== "해결"),
    [operationalFailures],
  );
  const openAdminPlusPriceAlerts = useMemo(
    () => adminplusPriceAlerts.filter((row) => !row.acknowledgedAt),
    [adminplusPriceAlerts],
  );
  const todayPurchaseHistoryCount = useMemo(() => {
    const key = today();
    return purchaseHistory.filter((row) => text(row.exportedAt).slice(0, 10) === key).length;
  }, [purchaseHistory]);
  const dailyOperationRows = useMemo(
    () => [
      ...buildDailyOperationBoardRows(purchaseRows, orders, purchaseHistory, readyInvoiceRows.length),
      {
        item: "주소 품질",
        status: addressQualityBlocked.length ? "차단" : addressQualityWarnings.length ? "주의" : "정상",
        detail: `차단 ${addressQualityBlocked.length}건, 주의 ${addressQualityWarnings.length}건입니다.`,
      },
      {
        item: "자동감시",
        status: unresolvedAdminPlusWatchSaveFailures.length ? "차단" : openAdminPlusPriceAlerts.length ? "주의" : "정상",
        detail: `서버 저장 실패 ${unresolvedAdminPlusWatchSaveFailures.length}건, 가격 변동 감지 ${openAdminPlusPriceAlerts.length}건입니다.`,
      },
      {
        item: "실패 재처리",
        status: unresolvedOperationalFailures.length || couponAutomationFailures.length ? "필요" : "정상",
        detail: `일반 실패 ${unresolvedOperationalFailures.length}건, 쿠폰 실패 ${couponAutomationFailures.length}건입니다.`,
      },
    ],
    [purchaseRows, orders, purchaseHistory, readyInvoiceRows.length, addressQualityBlocked.length, addressQualityWarnings.length, unresolvedOperationalFailures.length, couponAutomationFailures.length, unresolvedAdminPlusWatchSaveFailures.length, openAdminPlusPriceAlerts.length],
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
      ["쿠폰 23:52 발행", couponApplyRows ? "준비" : "대기", `${schedules.couponApply.time} / 실행대상 ${couponApplyRows}건 / 차단 ${couponExecutionBlockedRows.length}건`],
      ["스케줄러", schedules.couponCancel.enabled || schedules.couponApply.enabled || schedules.storageCleanup.enabled || adminplusAutomation.enabled ? "사용" : "수동", "Ncloud 단일 스케줄러: 발주·가격확인·송장·쿠폰·저장소 정리"],
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
  const DEFAULT_NCLOUD_TUNNEL_API_BASE = "";
  const DEFAULT_WORKER_API_BASE = "https://coupang-toss-b2b-automation.sosinche.workers.dev";

  function cleanApiBase(value: unknown) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function uniqueApiBases(values: unknown[]) {
    const seen = new Set<string>();
    return values
      .map(cleanApiBase)
      .filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }

  function apiBaseCandidates() {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
    let browserOverride = "";
    try {
      browserOverride = window.localStorage.getItem("b2b_api_base_override") || "";
    } catch {
      browserOverride = "";
    }
    // V179: Worker는 임시 trycloudflare 환경변수와 IP 리터럴을 피하고 sslip.io DNS 호스트를 사용합니다.
    // 모바일/PC 화면은 기본적으로 Cloudflare Worker를 호출하고,
    // Worker가 Ncloud DNS 호스트(101.79.27.234.sslip.io:8080)로 서버 측 프록시합니다.
    // 별도 임시 Tunnel 주소는 운영자가 명시한 경우에만 보조 경로로 사용합니다.
    return uniqueApiBases([
      browserOverride,
      env.VITE_WORKER_URL,
      DEFAULT_WORKER_API_BASE,
      env.VITE_NCLOUD_TUNNEL_URL,
      env.VITE_API_BASE_URL,
      DEFAULT_NCLOUD_TUNNEL_API_BASE,
    ]);
  }

  function apiBaseUrl() {
    return apiBaseCandidates()[0] || "";
  }

  function apiTargetUrl(path: string, base?: string) {
    if (/^https?:\/\//i.test(path)) return path;
    const resolvedBase = cleanApiBase(base || apiBaseUrl());
    if (!resolvedBase) return path;
    return `${resolvedBase}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function isGatewayFailure(status: number, text: string) {
    const preview = text.trim().toLowerCase();
    return (
      [0, 403, 521, 502, 503, 504].includes(status) ||
      preview.includes("error code: 1003") ||
      preview.includes("direct ip access not allowed") ||
      preview.includes("cloudflare") ||
      preview.includes("bad gateway") ||
      preview.includes("gateway")
    );
  }

  async function callApi(
    path: string,
    payload?: Record<string, unknown>,
    requestOptions?: { authorizationToken?: string; secureWorkerOnly?: boolean },
  ) {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
    const secureWorkerBases = uniqueApiBases([env.VITE_WORKER_URL, DEFAULT_WORKER_API_BASE])
      .filter((base) => /^https:\/\//i.test(base));
    const bases = /^https?:\/\//i.test(path)
      ? [""]
      : requestOptions?.secureWorkerOnly
        ? secureWorkerBases
        : apiBaseCandidates();
    const targets = bases.length ? bases.map((base) => apiTargetUrl(path, base)) : [apiTargetUrl(path)];
    const failures: string[] = [];

    for (const target of targets) {
      let response: Response;
      try {
        if (requestOptions?.authorizationToken && !/^https:\/\//i.test(target)) {
          failures.push(`${target} / 인증키 관리 요청은 HTTPS Cloudflare Worker에서만 실행합니다.`);
          continue;
        }
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (requestOptions?.authorizationToken) headers.authorization = `Bearer ${requestOptions.authorizationToken.trim()}`;
        response = await fetch(
          target,
          payload
            ? {
                method: "POST",
                headers,
                body: JSON.stringify({
                  ...payload,
                  apiEndpointSettings: normalizeApiEndpointSettings(apiEndpointSettings),
                }),
              }
            : undefined,
        );
      } catch (error) {
        failures.push(`${target} / fetch 실패: ${String(error)}`);
        continue;
      }

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
          const message = `API 응답 JSON 파싱 실패: HTTP ${response.status} ${response.statusText} (${target}) / ${preview}`;
          failures.push(message);
          if (isGatewayFailure(response.status, text)) continue;
          throw new Error(message);
        }
      }

      if (!response.ok) {
        const message = result.message || `API 요청 실패: HTTP ${response.status} ${response.statusText} (${target})`;
        failures.push(message);
        if (isGatewayFailure(response.status, text || message)) continue;
        throw new Error(message);
      }

      return result;
    }

    throw new Error(`API Gateway 연결 실패. Cloudflare Worker가 Ncloud DNS 호스트 API(http://101.79.27.234.sslip.io:8080)로 프록시되는지 확인하세요. Ncloud 서버가 0.0.0.0:8080에서 실행 중이고 ACG에서 TCP 8080이 허용되어야 합니다. 시도: ${failures.join(" | ")}`);
  }

  function recordOperationalFailure(
    kind: OperationalFailureKind,
    category: string,
    title: string,
    error: unknown,
    channel?: Channel,
  ) {
    const now = new Date().toISOString();
    const detail = String(error instanceof Error ? error.message : error);
    setOperationalFailures((prev) => {
      const existing = prev.find((row) =>
        row.kind === kind && row.channel === channel && row.title === title && row.status !== "해결",
      );
      const next = existing
        ? prev.map((row) => row.id === existing.id ? {
            ...row,
            detail,
            status: "대기" as const,
            updatedAt: now,
          } : row)
        : [{
            id: makeId("operation-failure"),
            kind,
            category,
            title,
            detail,
            status: "대기" as const,
            channel,
            attemptCount: 0,
            createdAt: now,
            updatedAt: now,
          }, ...prev];
      return next.slice(0, 100);
    });
    void callApi("/api/operation/logs/save", {
      eventType: `operation_failure_${kind}`,
      payload: { category, title, detail, channel: channel || "", occurredAt: now },
    }).catch(() => undefined);
  }

  function resolvedOperationalFailureSnapshot(kind: OperationalFailureKind, channel?: Channel) {
    const now = new Date().toISOString();
    return operationalFailures.map((row) =>
      row.kind === kind && (channel === undefined || row.channel === channel) && row.status !== "해결"
        ? { ...row, status: "해결" as const, updatedAt: now }
        : row,
    );
  }

  function resolveOperationalFailureKind(kind: OperationalFailureKind, channel?: Channel) {
    setOperationalFailures(resolvedOperationalFailureSnapshot(kind, channel));
  }

  function updateOperationalFailure(id: string, patch: Partial<OperationalFailureRow>) {
    setOperationalFailures((prev) => prev.map((row) =>
      row.id === id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row,
    ));
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
    if (data.apiEndpointSettings) setApiEndpointSettings(normalizeApiEndpointSettings(data.apiEndpointSettings));
    if (Array.isArray(data.b2bVendorLinks))
      setB2BVendorLinks(normalizeB2BVendorLinks(data.b2bVendorLinks));
    if (Array.isArray(data.operationalFailures)) setOperationalFailures(data.operationalFailures);
    if (data.folderNames) setFolderNames(data.folderNames);
    if (data.localFolderPaths) setLocalFolderPaths(data.localFolderPaths);
    if (data.schedules) setSchedules(normalizeSchedules(data.schedules));
    if (data.adminplusAutomation) setAdminplusAutomation(normalizeAdminPlusAutomation(data.adminplusAutomation));
    if (Array.isArray(data.adminplusPurchaseHistory)) setAdminplusPurchaseHistory(data.adminplusPurchaseHistory.slice(-5000));
    if (Array.isArray(data.adminplusProductLinks)) setAdminplusProductLinks(restoredLinks);
    if (Array.isArray(data.adminplusPriceAlerts)) setAdminplusPriceAlerts(data.adminplusPriceAlerts.slice(-1000));
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
      ordererBusinessInfo: { ...DEFAULT_BUSINESS_INFO },
      mappings: syncMappingsFromConfirmedAdminPlusLinks(mappings, adminplusProductLinks).rows,
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
      apiEndpointSettings: normalizeApiEndpointSettings(apiEndpointSettings),
      rollingCouponTemplates,
      operationalFailures,
      b2bVendorLinks: normalizeB2BVendorLinks(b2bVendorLinks),
      folderNames,
      localFolderPaths,
      schedules,
      adminplusAutomation: normalizeAdminPlusAutomation(adminplusAutomation),
      adminplusPurchaseHistory: adminplusPurchaseHistory.slice(-5000),
      adminplusProductLinks,
      adminplusPriceAlerts: adminplusPriceAlerts.slice(-1000),
      settingsKey,
      savedAt: new Date().toISOString(),
      version: APP_VERSION,
    };
  }

  function createServerSettingsPayload(): PersistentSettingsPayload {
    // V177: 서버 영구저장은 운영에 꼭 필요한 매핑/양식 중심으로 저장합니다.
    // 발주/쿠폰 실행 이력처럼 계속 커지는 자료는 브라우저 저장에 남기고 서버 저장에서는 제외해
    // Supabase jsonb 저장 실패(HTTP 500)를 방지합니다.
    return {
      ordererBusinessInfo: { ...DEFAULT_BUSINESS_INFO },
      mappings: syncMappingsFromConfirmedAdminPlusLinks(mappings, adminplusProductLinks).rows,
      tossOptionIdRows: normalizeTossOptionIdRows(tossOptionIdRows),
      coupangOptionMasterRows: normalizeCoupangOptionMasterRows(coupangOptionMasterRows),
      purchaseTemplates: normalizePurchaseTemplates(purchaseTemplates),
      invoiceTemplates,
      shipmentTemplates: normalizeShipmentTemplates(shipmentTemplates),
      channelPurchaseTemplates: normalizeChannelPurchaseTemplates(
        channelPurchaseTemplates,
      ),
      couponRows,
      couponApiSettings: normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: rollingCouponTemplates }),
      apiEndpointSettings: normalizeApiEndpointSettings(apiEndpointSettings),
      rollingCouponTemplates,
      operationalFailures,
      b2bVendorLinks: normalizeB2BVendorLinks(b2bVendorLinks),
      folderNames,
      schedules,
      adminplusAutomation: normalizeAdminPlusAutomation(adminplusAutomation),
      adminplusPurchaseHistory: adminplusPurchaseHistory.slice(-5000),
      adminplusProductLinks,
      adminplusPriceAlerts: adminplusPriceAlerts.slice(-1000),
      settingsKey,
      savedAt: new Date().toISOString(),
      version: APP_VERSION,
      serverSaveMode: "compact-settings-v175",
      serverSaveSummary: {
        mappingRows: mappings.length,
        tossOptionIdRows: tossOptionIdRows.length,
        coupangOptionMasterRows: coupangOptionMasterRows.length,
        purchaseTemplates: purchaseTemplates.length,
        invoiceTemplates: invoiceTemplates.length,
        shipmentTemplates: shipmentTemplates.length,
        channelPurchaseTemplates: channelPurchaseTemplates.length,
        couponRows: couponRows.length,
        adminplusAccounts: adminplusAccounts.length,
        adminplusPurchaseHistory: adminplusPurchaseHistory.length,
        adminplusProductLinks: adminplusProductLinks.length,
        adminplusPriceAlerts: adminplusPriceAlerts.filter((row) => !row.acknowledgedAt).length,
      },
    };
  }

  function applyPersistentSettings(data: PersistentSettingsPayload) {
    const restoredLinks = normalizeAdminPlusServerLinks(data.adminplusProductLinks);
    if (Array.isArray(data.mappings)) {
      const synced = syncMappingsFromConfirmedAdminPlusLinks(normalizeMappingRows(data.mappings), restoredLinks);
      mappingsRef.current = synced.rows;
      setMappings(synced.rows);
    }
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
    if (data.apiEndpointSettings) setApiEndpointSettings(normalizeApiEndpointSettings(data.apiEndpointSettings));
    if (Array.isArray(data.b2bVendorLinks))
      setB2BVendorLinks(normalizeB2BVendorLinks(data.b2bVendorLinks));
    if (Array.isArray(data.operationalFailures)) setOperationalFailures(data.operationalFailures);
    if (data.folderNames) setFolderNames(data.folderNames);
    if (data.localFolderPaths) setLocalFolderPaths(data.localFolderPaths);
    if (data.schedules) setSchedules(normalizeSchedules(data.schedules));
    if (data.adminplusAutomation) setAdminplusAutomation(normalizeAdminPlusAutomation(data.adminplusAutomation));
    if (Array.isArray(data.adminplusPurchaseHistory)) setAdminplusPurchaseHistory(data.adminplusPurchaseHistory.slice(-5000));
    if (Array.isArray(data.adminplusProductLinks)) setAdminplusProductLinks(normalizeAdminPlusServerLinks(data.adminplusProductLinks));
    if (Array.isArray(data.adminplusPriceAlerts)) setAdminplusPriceAlerts(data.adminplusPriceAlerts.slice(-1000));
    if (data.settingsKey) setSettingsKey(data.settingsKey);
  }

  function saveSettingsToBrowser() {
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(createPersistentSettingsPayload()),
      );
      setSettingsMessage(
        "클라우드 발주폴더 경로와 현재 매핑/토스 옵션ID/쿠팡 옵션마스터/발주양식/송장양식/쿠팡·토스 양식/쿠폰/API 선택값/B2B 바로가기 설정을 최신본으로 저장했습니다. 화면 목록에서 삭제한 항목은 다음 불러오기에도 제외됩니다.",
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

  async function loadMappingsFromServer(silent = false): Promise<MappingRow[]> {
    if (mappingSyncBusyRef.current) return mappingsRef.current;
    mappingSyncBusyRef.current = true;
    setMappingSyncBusy(true);
    if (!silent) setMappingSyncMessage("Supabase에서 최신 매핑을 불러오는 중입니다.");
    try {
      let result: ApiResult;
      let compatibilityMode = false;
      try {
        result = await callApi(`/api/operation/mappings/load?settingsKey=${encodeURIComponent(settingsKey)}`);
      } catch (error) {
        if (!isHttp404(error)) throw error;
        compatibilityMode = true;
        result = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(settingsKey)}`);
      }
      const data = (result?.data || {}) as TempPayload & { mappingTombstones?: Record<string, string> };
      const serverRows = Array.isArray(data.mappings) ? normalizeMappingRows(data.mappings) : [];
      const tombstones = mappingTombstones(data.mappingTombstones);
      const merged = mergeMappingRowsWithTombstones(mappingsRef.current, serverRows, tombstones);
      const synced = syncMappingsFromConfirmedAdminPlusLinks(merged, adminplusProductLinks);
      mappingsRef.current = synced.rows;
      setMappings(synced.rows);
      mappingDeletedKeysRef.current.clear();
      mappingServerFingerprintRef.current = mappingRowsFingerprint(serverRows);
      mappingSyncReadyRef.current = true;
      const messageText = serverRows.length
        ? `서버 최신 매핑 ${serverRows.length}건을 불러와 현재 기기와 병합했습니다.${compatibilityMode ? " 기존 설정 API 호환모드로 연결했습니다." : ""}`
        : `서버 저장 매핑이 없어 현재 기기 매핑을 유지합니다.${compatibilityMode ? " 기존 설정 API 호환모드로 연결했습니다." : ""}`;
      setMappingSyncMessage(messageText);
      return synced.rows;
    } catch (error) {
      mappingSyncReadyRef.current = true;
      mappingServerFingerprintRef.current = mappingRowsFingerprint(mappingsRef.current);
      setMappingSyncMessage(`서버 매핑 불러오기 실패 · 현재 기기 자료로 계속합니다: ${String(error)}`);
      return mappingsRef.current;
    } finally {
      mappingSyncBusyRef.current = false;
      setMappingSyncBusy(false);
    }
  }

  async function syncMappingsToServer(rowsOverride?: MappingRow[]) {
    if (mappingSyncBusyRef.current) return;
    mappingSyncBusyRef.current = true;
    setMappingSyncBusy(true);
    const snapshot = completeMappingRowsForServer(rowsOverride || mappingsRef.current);
    const deletedKeys = Array.from(mappingDeletedKeysRef.current);
    setMappingSyncMessage("매핑을 Supabase 서버에 자동 저장하는 중입니다.");
    try {
      let result: ApiResult;
      let compatibilityMode = false;
      try {
        result = await callApi("/api/operation/mappings/upsert", {
          settingsKey,
          mappings: snapshot,
          deletedKeys,
          source: "web-v199-auto-sync",
        });
      } catch (error) {
        if (!isHttp404(error)) throw error;
        compatibilityMode = true;
        const loaded = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(settingsKey)}`);
        const currentData = ((loaded?.data || {}) as TempPayload & {
          mappingTombstones?: Record<string, string>;
          mappingSync?: Record<string, unknown>;
        });
        const tombstones = mappingTombstones(currentData.mappingTombstones);
        const now = new Date().toISOString();
        deletedKeys.forEach((key) => { if (key) tombstones[key] = now; });
        const serverRows = Array.isArray(currentData.mappings) ? normalizeMappingRows(currentData.mappings) : [];
        const mergedRows = mergeMappingRowsWithTombstones(snapshot, serverRows, tombstones)
          .filter((row) => !deletedKeys.includes(mappingServerKey(row.channel, row.optionId)));
        result = await callApi("/api/operation/settings/save", {
          settingsKey,
          data: {
            ...currentData,
            mappings: completeMappingRowsForServer(mergedRows),
            mappingTombstones: tombstones,
            mappingSync: {
              version: "v199-compat",
              source: "web-v199-auto-sync",
              mappingRows: mergedRows.length,
              deletedRows: deletedKeys.length,
              updatedAt: now,
            },
            settingsKey,
            savedAt: now,
            version: APP_VERSION,
          },
        });
      }
      const serverRows = Array.isArray(result?.data?.mappings)
        ? normalizeMappingRows(result.data.mappings)
        : snapshot.filter((row) => !deletedKeys.includes(mappingServerKey(row.channel, row.optionId)));
      const merged = mergeMappingRows(mappingsRef.current, serverRows)
        .filter((row) => !deletedKeys.includes(mappingServerKey(row.channel, row.optionId)));
      mappingsRef.current = merged;
      setMappings(merged);
      const latestLinkSync =
        syncAdminPlusLinksFromLatestMappings(
          snapshot,
          adminplusProductLinks,
        );

      if (latestLinkSync.changed) {
        const removedLinkIds = new Set(
          latestLinkSync.removedLinks.map(
            (row) => row.id,
          ),
        );

        const now =
          new Date().toISOString();

        const nextAlerts =
          adminplusPriceAlerts.map((alert) =>
            removedLinkIds.has(alert.linkId) &&
            !alert.acknowledgedAt
              ? {
                  ...alert,
                  acknowledgedAt: now,
                }
              : alert,
          );

        // 먼저 B2B 서버의 확정 링크를 제거합니다.
        // 따라서 실제 AdminPlus cleanup이 실패해도
        // stale 상품으로 자동발주되지는 않습니다.
        const linkedSave = await callApi(
          "/api/operation/settings/save",
          {
            settingsKey,
            data: {
              ...createServerSettingsPayload(),
              mappings: snapshot,
              adminplusProductLinks:
                latestLinkSync.rows,
              adminplusProductLinkDeletedIds:
                latestLinkSync.removedLinks.map(
                  (row) => row.id,
                ),
              adminplusPriceAlerts:
                nextAlerts.slice(-1000),
              savedAt: now,
              version: APP_VERSION,
            },
          },
        );

        if (linkedSave.ok !== true) {
          throw new Error(
            linkedSave.message ||
              "상품매칭 → AdminPlus 미연결 서버 저장 실패",
          );
        }

        setAdminplusProductLinks(
          latestLinkSync.rows,
        );

        setAdminplusPriceAlerts(
          nextAlerts,
        );

        for (
          const staleLink
          of latestLinkSync.removedLinks
        ) {
          if (
            !text(staleLink.accountId) ||
            !text(staleLink.matchString)
          ) {
            continue;
          }

          try {
            const deleted = await callApi(
              "/api/integrations/adminplus/catalog/matches/delete",
              {
                accountId:
                  staleLink.accountId,
                matchString:
                  staleLink.matchString,
                confirm: true,
              },
            );

            if (deleted.ok !== true) {
              throw new Error(
                deleted.message ||
                  "AdminPlus 실제 match 삭제 실패",
              );
            }
          } catch (error) {
            recordOperationalFailure(
              "adminplus_watch_save",
              "API 매핑",
              `상품매칭 변경 후 기존 AdminPlus match 삭제 ${staleLink.channel} ${staleLink.optionId}`,
              error,
              staleLink.channel,
            );
          }
        }

        if (latestLinkSync.removedLinks.length) {
          setMessage(
            `상품매칭 변경으로 기존 API상품매칭 ${latestLinkSync.removedLinks.length}건을 해제했습니다. 해당 옵션은 AdminPlus 미연결로 이동했으며 필요한 상품을 다시 검색해 연결하세요.`,
          );
        }
      }

      mappingDeletedKeysRef.current.clear();
      mappingServerFingerprintRef.current = mappingRowsFingerprint(merged);
      mappingSyncReadyRef.current = true;
      const summary = result.summary as Record<string, unknown> | undefined;
      setMappingSyncMessage(
        result.message || `서버 자동 저장 완료 · 매핑 ${summary?.mappingRows ?? merged.length}건${compatibilityMode ? " · 기존 설정 API 호환모드" : ""}`,
      );
      if (mappingRowsFingerprint(mappingsRef.current) !== mappingServerFingerprintRef.current) {
        window.setTimeout(() => void syncMappingsToServer(), 300);
      }
    } catch (error) {
      setMappingSyncMessage(`서버 자동 저장 실패 · 변경사항은 이 기기에 유지됩니다: ${String(error)}`);
    } finally {
      mappingSyncBusyRef.current = false;
      setMappingSyncBusy(false);
    }
  }

  async function saveSettingsToServer() {
    try {
      const result = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: createServerSettingsPayload(),
      });
      const summary = result.summary as Record<string, unknown> | undefined;
      const mappingRows = summary?.mappingRows ?? mappings.length;
      const message =
        result.message ||
        `서버에 매핑/양식 설정을 저장했습니다. 매핑 ${mappingRows}건`;
      setSettingsMessage(message);
      setMessage(message);
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
      const result = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(DEFAULT_SETTINGS_KEY)}`);
      if (!result?.ok || !result?.data) {
        setSettingsMessage(
          result?.message || "서버에 저장된 운영 매핑/양식 설정이 없습니다.",
        );
        return;
      }
      applyPersistentSettings({
        ...result.data,
        settingsKey:
          result.sessionKey || result.data.settingsKey || settingsKey,
      });
      setSettingsMessage(
        result.message || "서버 운영 매핑/양식 설정을 불러왔습니다.",
      );
    } catch (error) {
      setSettingsMessage(`서버 운영 설정 불러오기 실패: ${String(error)}`);
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
      const now = new Date().toISOString();

      const normalized =
        normalizeMappingRows(imported).map(
          (incoming) => {
            const key = mappingServerKey(
              incoming.channel,
              incoming.optionId,
            );

            const current =
              mappingsRef.current.find(
                (row) =>
                  mappingServerKey(
                    row.channel,
                    row.optionId,
                  ) === key,
              );

            const confirmedLink =
              adminplusProductLinks.find(
                (row) => row.id === key,
              );

            // 신규 옵션ID만 최초 Excel 확정으로 기록합니다.
            if (!current) {
              return {
                ...incoming,
                matchAuthority: "excel" as const,
                matchConfirmedAt: now,
                updatedAt: now,
              };
            }

            const incomingVendor =
              normalizedVendorName(
                incoming.vendorName,
              );

            const currentVendor =
              normalizedVendorName(
                confirmedLink?.vendorName ||
                  current.vendorName,
              );

            const incomingCode =
              cleanId(incoming.vendorCode);

            const currentApiCode =
              cleanId(
                confirmedLink?.productCode ||
                  current.vendorCode,
              );

            /*
             * 기존 API 연결이 있을 때:
             *
             * 업체 변경
             *   → 실제 identity 변경
             *
             * Excel 코드번호가 명시돼 있고
             * 기존 API productCode와 다름
             *   → 실제 identity 변경
             *
             * Excel 코드번호가 빈칸
             *   → API productCode 삭제 요청으로 보지 않음
             *
             * 상품명 표기만 다름
             *   → 기존 API 연결을 삭제하지 않음
             */
            const vendorChanged =
              Boolean(incomingVendor) &&
              incomingVendor !== currentVendor;

            const explicitCodeChanged =
              Boolean(confirmedLink) &&
              Boolean(incomingCode) &&
              Boolean(currentApiCode) &&
              incomingCode !== currentApiCode;

            /*
             * API 연결이 없는 일반 상품매칭에서는
             * 기존 Excel identity끼리 비교합니다.
             */
            const nonApiVendorChanged =
              !confirmedLink &&
              normalizedVendorName(
                incoming.vendorName,
              ) !==
                normalizedVendorName(
                  current.vendorName,
                );

            const nonApiCodeChanged =
              !confirmedLink &&
              cleanId(incoming.vendorCode) !==
                cleanId(current.vendorCode);

            const nonApiProductChanged =
              !confirmedLink &&
              normalizeHeader(
                incoming.vendorProductName,
              ) !==
                normalizeHeader(
                  current.vendorProductName,
                );

            const identityChanged =
              vendorChanged ||
              explicitCodeChanged ||
              nonApiVendorChanged ||
              nonApiCodeChanged ||
              nonApiProductChanged;

            if (identityChanged) {
              return {
                ...current,
                ...incoming,
                matchAuthority: "excel" as const,
                matchConfirmedAt: now,
                updatedAt: now,
              };
            }

            /*
             * R5.3.2:
             * 같은 옵션ID의 실제 상품 identity가
             * 바뀌지 않았다면 API 확정정보를 보존합니다.
             *
             * Excel에서는 운영값만 갱신합니다.
             */
            return {
              ...current,

              cost: toNumber(
                incoming.cost,
                current.cost,
              ),

              baseQty: Math.max(
                1,
                toNumber(
                  incoming.baseQty,
                  current.baseQty || 1,
                ),
              ),

              shippingFee: Math.max(
                0,
                toNumber(
                  incoming.shippingFee,
                  current.shippingFee || 0,
                ),
              ),

              purchaseTime:
                normalizeOptionPurchaseTimes(
                  incoming.purchaseTime ||
                    current.purchaseTime,
                ),

              vendorName:
                confirmedLink?.vendorName ||
                current.vendorName,

              vendorCode:
                confirmedLink?.productCode ||
                current.vendorCode,

              vendorProductName:
                confirmedLink?.productName ||
                current.vendorProductName,

              matchAuthority:
                current.matchAuthority,

              matchConfirmedAt:
                current.matchConfirmedAt,

              updatedAt: now,
            };
          },
        );

      const merged = mergeMappingRows(
        mappingsRef.current,
        normalized,
      );
      mappingsRef.current = merged;
      setMappings(merged);
      const summaryText = mappingImportSummary(normalized);
      const summary = summarizeMappingCheck(orders, merged, `${file.name} 매핑 병합 업로드`);
      setMappingCheckSummary(summary);
      setMappingCheckMessage(`${file.name}에서 매핑 ${normalized.length}행을 기존 매핑과 병합했습니다. ${summaryText}. 변경사항은 Supabase에 자동 저장됩니다.`);
      setMessage(`${file.name}에서 매핑 ${normalized.length}행을 병합했습니다. 현재 주문 기준으로 자동 재검사하고 서버에도 자동 저장합니다.`);
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
          text(record.stockId),
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
  function exportTossOptionIdTemplate() {
    downloadExcelFile(`토스_옵션ID_엑셀양식_${today()}.xls`, [
      {
        name: "토스옵션ID",
        rows: tossOptionIdRows.length
          ? tossOptionIdRowsToSheet(tossOptionIdRows)
          : [
              ["상품ID", "상품 옵션 ID(productItemId)", "주문 stockId", "옵션 관리 코드", "옵션명", "상품명", "메모"],
              ["", "1596392077", "", "OPT-BARIGAK-5KG", "활 바지락 5kg", "활 바지락", "토스 상품 API가 실패할 때만 보조 입력"],
              ["", "1596392075", "", "OPT-BARIGAK-3KG", "활 바지락 3kg", "활 바지락", ""],
              ["", "1596392073", "", "OPT-BARIGAK-2KG", "활 바지락 2kg", "활 바지락", ""],
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
        // V259 R3: 수동 주문조회도 일일운영/Worker 자동발주와 동일한 paging을 사용합니다.
        maxPerPage: 50,
        maxPages: 10,
      };
    }
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      status,
      limit: Math.max(1, Math.min(50, Number(orderApiFilter.limit) || 50)),
      maxPages: 20,
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

  async function fetchApiOverviewRows(channel: Channel, mode: "purchase" | "invoice") {
    const result = await callApi("/api/integrations/orders/collect-preview", {
      channel,
      schedules,
      manual: true,
      query: orderQueryForChannel(channel, mode),
    });
    return orderCollectRowsFromPreview(result, channel);
  }

  async function fetchOperationStatus(
    channel: Channel,
    status: string,
    startDate = orderApiFilter.startDate,
    endDate = orderApiFilter.endDate,
  ) {
    const query: Record<string, unknown> = { startDate, endDate, status };
    if (channel === "쿠팡") {
      // V257: Ncloud 단독 진단과 동일한 paging 조건을 명시해 화면 현황과 서버 현황을 일치시킵니다.
      query.maxPerPage = 50;
      query.maxPages = 10;
    } else {
      query.limit = Math.max(1, Math.min(50, Number(orderApiFilter.limit) || 50));
      query.maxPages = 20;
    }
    const result = await callApi("/api/integrations/orders/collect-preview", { channel, schedules, manual: true, query });
    const rows = uniqueOrderRows(orderCollectRowsFromPreview(result, channel));
    return {
      rows,
      rawRows: Number(result.summary?.rawRows || rows.length),
      normalizedRows: Number(result.summary?.normalizedRows || rows.length),
    };
  }

  function adminPlusPaymentHistoryForOrder(row: OrderRow, history: AdminPlusPurchaseHistoryRow[] = adminplusPurchaseHistory) {
    const sameOrder = history.filter((hist) => text(hist.channel) === row.channel && text(hist.orderNo) === text(row.orderNo));
    const exact = sameOrder.find((hist) => {
      if (row.orderProductId && hist.orderProductId && text(row.orderProductId) === text(hist.orderProductId)) return true;
      if (row.channel === "쿠팡" && row.optionId && hist.vendorItemId && text(row.optionId) === text(hist.vendorItemId)) return true;
      return orderMappingCandidateIds(row).includes(cleanId(hist.optionId));
    });
    if (exact) return exact;
    return sameOrder.length === 1 ? sameOrder[0] : undefined;
  }

  function isAdminPlusOrderSubmitted(hist?: AdminPlusPurchaseHistoryRow) {
    if (!hist) return false;
    return Boolean(text(hist.submittedAt) || text(hist.orderKey) || text(hist.customerOrderCode) || text(hist.adminplusOrderCode));
  }

  function adminPlusPaymentBatchRows(row: AdminPlusPurchaseHistoryRow) {
    const orderKey = text(row.orderKey);
    if (!orderKey) return [row];
    return adminplusPurchaseHistory.filter((item) =>
      text(item.accountId) === text(row.accountId) &&
      text(item.orderKey) === orderKey
    );
  }

  function adminPlusPaymentDisplay(row: AdminPlusPurchaseHistoryRow) {
    const batchRows = adminPlusPaymentBatchRows(row);
    const amount = Number(row.paymentAmount || row.orderAmount || 0) || 0;
    const status = row.paymentStatus || "대기";
    const amountText = amount > 0
      ? batchRows.length > 1
        ? `배치합계 ${amount.toLocaleString()}원 · ${batchRows.length}건`
        : `1건 결제 ${amount.toLocaleString()}원`
      : "";
    return { status, amountText, batchSize: batchRows.length };
  }

  function adminPlusFlowStatusFromActualStatus(value: unknown) {
    const raw = text(value).trim();
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
    if (!normalized) return "";
    // 순서 중요: 배송준비중은 '배송'보다 먼저 판정합니다.
    if (/배송준비중|deliverypreparing|preparingdelivery|shippingready|readytoship/.test(normalized)) return "상품준비중";
    if (/^배송$|배송중|shipping|shipped|delivering|intransit/.test(normalized)) return "배송중";
    if (/주문접수|orderreceived|received|accepted|orderaccepted/.test(normalized)) return "발주완료";
    if (/입금전|unpaid|paymentpending|pendingpayment|^pending$|^draft$/.test(normalized)) return "수집완료";
    return "";
  }

  function adminPlusOrderFlowStatus(row: AdminPlusPurchaseHistoryRow) {
    const actual = adminPlusFlowStatusFromActualStatus(row.adminplusStatus);
    if (actual) return actual;
    // V255 fallback: AdminPlus API의 generic `active` 같은 활성여부 값은 업무단계가 아닙니다.
    // 실제상태 문자열이 없거나 인식불가일 때는 확정 증거만 사용합니다:
    // 송장/택배사 존재 -> 배송중, 결제완료+주문등록 -> 발주완료, 주문등록만 -> 수집완료.
    if (text(row.trackingNo) || text(row.courier)) return "배송중";
    if (isAdminPlusOrderSubmitted(row) && isAdminPlusPaymentCompleted(row)) return "발주완료";
    if (isAdminPlusOrderSubmitted(row)) return "수집완료";
    return "결제완료";
  }

  function operationRangeIncludes(value: unknown) {
    const raw = text(value).trim();
    if (!raw) return true;
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return true;
    const start = Date.parse(`${orderApiFilter.startDate}T00:00:00`);
    const end = Date.parse(`${orderApiFilter.endDate}T23:59:59.999`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
    return time >= Math.min(start, end) && time <= Math.max(start, end);
  }

  function adminPlusOrderFlowRows() {
    const byKey = new Map<string, Record<string, unknown>>();
    for (const row of adminplusPurchaseHistory) {
      const key = text(row.sourceKey) || `${text(row.channel)}|${text(row.orderNo)}|${text(row.optionId || row.vendorItemId)}`;
      const recognizedActual = adminPlusFlowStatusFromActualStatus(row.adminplusStatus);
      byKey.set(key, { ...row, flowStatus: adminPlusOrderFlowStatus(row), flowNote: [recognizedActual ? `AdminPlus ${text(row.adminplusStatus)}` : "", text(row.paymentError)].filter(Boolean).join(" · ") });
    }
    for (const row of adminplusPreflightRows) {
      const key = text(row.sourceKey) || `${text(row.channel)}|${text(row.orderNo)}|${text(row.optionId)}`;
      if (byKey.has(key)) continue;
      byKey.set(key, { ...row, flowStatus: "결제완료", flowNote: [text(row.status), text(row.reason)].filter(Boolean).join(" · ") });
    }
    return Array.from(byKey.values())
      .filter((row) => operationRangeIncludes(row.submittedAt || row.orderedAt))
      .sort((a, b) => Date.parse(text(b.submittedAt || b.orderedAt) || "1970-01-01") - Date.parse(text(a.submittedAt || a.orderedAt) || "1970-01-01"))
      .slice(0, 150);
  }

  function isAdminPlusPaymentCompleted(hist?: AdminPlusPurchaseHistoryRow) {
    const status = text(hist?.paymentStatus).toLowerCase();
    return status === "완료" || status === "completed";
  }

  async function resolveAdminPlusShipmentRow(row: AdminPlusPurchaseHistoryRow, action: "recheck_market" | "acknowledge") {
    if (adminplusAutomationBusy) return;
    const sourceKey = text(row.sourceKey) || `${text(row.channel)}|${text(row.orderNo)}|${text(row.optionId)}`;
    if (action === "acknowledge" && !window.confirm(`주문 ${row.orderNo}을 운영자 수동처리 완료로 확인할까요?\n\n실제 마켓 송장등록 완료값을 위조하지 않고 운영확인 이력만 저장하며 대기목록에서 제외합니다.`)) return;
    try {
      setAdminplusAutomationBusy(true);
      const result = await callApi("/api/integrations/adminplus/shipments/resolve", { sourceKey, action });
      const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows as unknown as AdminPlusPurchaseHistoryRow[] : [];
      if (rows.length || adminplusPurchaseHistory.length === 0) setAdminplusPurchaseHistory(rows);
      const msg = result.message || (action === "acknowledge" ? "수동처리 확인을 저장했습니다." : "마켓 상태를 다시 조회했습니다.");
      setAdminplusAutomationMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `${action === "acknowledge" ? "수동처리 확인" : "마켓 상태 재조회"} 실패: ${String(error)}`;
      setAdminplusAutomationMessage(msg);
      setMessage(msg);
    } finally {
      setAdminplusAutomationBusy(false);
    }
  }

  async function refreshAdminPlusPurchaseHistoryForDashboard() {
    try {
      const result = await callApi("/api/integrations/adminplus/purchase/status", {});
      const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows as unknown as AdminPlusPurchaseHistoryRow[] : [];
      if (rows.length || adminplusPurchaseHistory.length === 0) setAdminplusPurchaseHistory(rows);
      return rows;
    } catch {
      return adminplusPurchaseHistory;
    }
  }

  async function refreshApiOverview(showMessage = true, forceRefresh = false) {
    if (apiOverviewBusy) return;
    setApiOverviewBusy(true);
    try {
      type OperationFetchResult = {
        ok: boolean;
        rows: OrderRow[];
        rawRows: number;
        normalizedRows: number;
        channel: Channel;
        status: string;
        bucket: "payment" | "preparing" | "shipping" | "delivered";
        error?: string;
      };

      const specs: Array<[Channel, string, OperationFetchResult["bucket"]]> = [
        ["쿠팡", "ACCEPT", "payment"],
        ["토스", "PAID", "payment"],
        ["쿠팡", "INSTRUCT", "preparing"],
        ["토스", "PREPARING_PRODUCT", "preparing"],
        ["쿠팡", "DEPARTURE", "shipping"],
        ["쿠팡", "DELIVERING", "shipping"],
        ["토스", "DELIVERING", "shipping"],
        ["쿠팡", "FINAL_DELIVERY", "delivered"],
        ["토스", "DELIVERED", "delivered"],
        ["토스", "CONFIRMED_ORDER", "delivered"],
      ];

      // R5.9:
      // 같은 채널 안에서는 V257의 순차조회 정책을 그대로 유지합니다.
      // 쿠팡 그룹과 토스 그룹만 서로 병렬 실행해 전체 대기시간을 단축합니다.
      const runOperationSpecsSequentially = async (
        specs: Array<[Channel, string, OperationFetchResult["bucket"]]>,
      ) => {
        const rows: OperationFetchResult[] = [];

        for (const [channel, status, bucket] of specs) {
          try {
            const fetched = await fetchOperationStatus(
              channel,
              status,
              orderApiFilter.startDate,
              orderApiFilter.endDate,
            );

            rows.push({
              ok: true,
              channel,
              status,
              bucket,
              ...fetched,
            });
          } catch (error) {
            rows.push({
              ok: false,
              channel,
              status,
              bucket,
              rows: [],
              rawRows: 0,
              normalizedRows: 0,
              error: String(error),
            });
          }
        }

        return rows;
      };

      const cacheKey =
        orderApiFilter.startDate + "|" + orderApiFilter.endDate;

      const cached = operationOverviewCacheRef.current;
      const cacheUsable =
        !forceRefresh &&
        cached &&
        cached.key === cacheKey &&
        Date.now() - cached.at < 45 * 1000;

      let results: OperationFetchResult[];
      let serverHistory: AdminPlusPurchaseHistoryRow[];

      if (cacheUsable && cached) {
        results = cached.results;
        serverHistory = cached.serverHistory;
      } else {
        const serverHistoryPromise =
          refreshAdminPlusPurchaseHistoryForDashboard();

        const coupangSpecs = specs.filter(
          ([channel]) => channel === "쿠팡",
        );

        const tossSpecs = specs.filter(
          ([channel]) => channel === "토스",
        );

        const [coupangResults, tossResults] = await Promise.all([
          runOperationSpecsSequentially(coupangSpecs),
          runOperationSpecsSequentially(tossSpecs),
        ]);

        results = [...coupangResults, ...tossResults];
        serverHistory = await serverHistoryPromise;

        operationOverviewCacheRef.current = {
          key: cacheKey,
          at: Date.now(),
          results,
          serverHistory,
        };
      }
      const grouped = { collected: [] as OrderRow[], payment: [] as OrderRow[], preparing: [] as OrderRow[], shipping: [] as OrderRow[], delivered: [] as OrderRow[] };
      results.forEach((result) => { if (result.ok) grouped[result.bucket].push(...result.rows); });
      const marketplacePaidRows = uniqueOrderRows(grouped.payment).filter((row) => isPaymentStatus(row.channel, row.orderStatus));
      const historySnapshot = serverHistory.length ? serverHistory : adminplusPurchaseHistory;
      // 운영단계 정의:
      // 1) 결제완료 = 쿠팡 ACCEPT / 토스 PAID 상태이며 아직 AdminPlus 미결제 발주 단계가 아닌 주문
      // 2) 수집완료 = AdminPlus 주문등록(발주) 성공 + AdminPlus 결제 미완료인 주문만
      // 3) AdminPlus 결제가 완료되면 자동화가 마켓을 상품준비중으로 전환하므로 별도 "AdminPlus 결제완료" 단계를 만들지 않습니다.
      grouped.collected = marketplacePaidRows.filter((row) => {
        const hist = adminPlusPaymentHistoryForOrder(row, historySnapshot);
        return isAdminPlusOrderSubmitted(hist) && !isAdminPlusPaymentCompleted(hist);
      });
      // V259 R3: 결제완료 카드는 마켓의 실제 ACCEPT/PAID 전체를 Source-of-Truth로 표시합니다.
      // 수집완료(AdminPlus 입금전)는 별도 운영상태이므로 마켓 결제완료에서 차감하지 않습니다.
      grouped.payment = marketplacePaidRows;
      grouped.preparing = uniqueOrderRows(grouped.preparing).filter((row) => isPreparingStatus(row.channel, row.orderStatus));
      grouped.shipping = uniqueOrderRows(grouped.shipping).filter((row) => isShippingStatus(row.channel, row.orderStatus));
      grouped.delivered = uniqueOrderRows(grouped.delivered).filter((row) => isDeliveredStatus(row.channel, row.orderStatus));
      setOperationStatusRows(grouped);
      setApiOverviewCounts({
        // 채널별 주문현황의 결제완료는 실제 마켓 ACCEPT/PAID 전체 건수를 표시합니다.
        coupangPayment: marketplacePaidRows.filter((row) => row.channel === "쿠팡").length,
        tossPayment: marketplacePaidRows.filter((row) => row.channel === "토스").length,
        coupangPreparing: grouped.preparing.filter((row) => row.channel === "쿠팡").length,
        tossPreparing: grouped.preparing.filter((row) => row.channel === "토스").length,
      });
      const failed = results.filter((result) => !result.ok).length;
      const preparingApi = results
        .filter((result) => result.ok && result.bucket === "preparing")
        .map((result) => `${result.channel} ${result.normalizedRows}건`)
        .join(" · ");
      const summary = `현재상태 API 갱신 (${orderApiFilter.startDate}~${orderApiFilter.endDate}): 결제완료 ${grouped.payment.length}건 · 수집완료 ${grouped.collected.length}건 · 상품준비중 ${grouped.preparing.length}건${preparingApi ? ` [${preparingApi}]` : ""} · 배송중 ${grouped.shipping.length}건 · 배송완료 ${grouped.delivered.length}건${failed ? ` · 조회실패 ${failed}건` : ""}`;
      setApiOverviewMessage(summary); if (showMessage) setMessage(summary);
    } catch (error) {
      const summary = `쿠팡·토스 현재상태 자동조회 실패: ${String(error)}`;
      setApiOverviewMessage(summary); if (showMessage) setMessage(summary);
    } finally { setApiOverviewBusy(false); }
  }

  async function previewSelectablePaymentOrders() {
    if (orderSelectionBusy) return;
    setOrderSelectionBusy(true);
    setSelectableOrderChannel("전체");
    setSelectedOrderIds([]);
    setSelectableOrderRows([]);
    setSelectableOrderDiagnostics([]);
    setOrderSelectionMessage("쿠팡과 토스 결제완료 주문을 함께 조회하고 있습니다.");
    try {
      const results = await Promise.allSettled([
        collectChannelOrderRows("쿠팡", [], "purchase"),
        collectChannelOrderRows("토스", [], "purchase"),
      ]);
      const successful = results
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof collectChannelOrderRows>>> => result.status === "fulfilled")
        .map((result) => result.value);
      const rows = uniqueOrderRows(successful.flatMap((result) =>
        result.imported.filter((row) => isPaymentStatus(row.channel, row.orderStatus)),
      ));
      const diagnostics = successful.flatMap((result) => result.diagnosticRows);
      const failedChannels = results.flatMap<Channel>((result, index) =>
        result.status === "rejected" ? [index === 0 ? "쿠팡" : "토스"] : [],
      );
      setSelectableOrderRows(rows);
      setSelectableOrderDiagnostics(diagnostics);
      const coupangCount = rows.filter((row) => row.channel === "쿠팡").length;
      const tossCount = rows.filter((row) => row.channel === "토스").length;
      const failedText = failedChannels.length ? ` · ${failedChannels.join("·")} 조회 실패` : "";
      setOrderSelectionMessage(rows.length
        ? `결제완료 상품 ${rows.length}건을 조회했습니다. 쿠팡 ${coupangCount}건 · 토스 ${tossCount}건${failedText}. 필요한 상품을 체크하세요.`
        : `쿠팡·토스 결제완료 상품이 없습니다${failedText}.`);
      successful.forEach((result) => resolveOperationalFailureKind("order_lookup", result.channel));
      if (failedChannels.length) {
        failedChannels.forEach((channel) => {
          const failed = results[channel === "쿠팡" ? 0 : 1];
          const reason = failed.status === "rejected" ? failed.reason : "조회 실패";
          recordOperationalFailure("order_lookup", "주문조회", `${channel} 결제완료 주문조회`, reason, channel);
        });
      }
      return successful.length > 0;
    } catch (error) {
      setOrderSelectionMessage(`쿠팡·토스 결제완료 주문조회 실패: ${String(error)}`);
      recordOperationalFailure("order_lookup", "주문조회", "쿠팡·토스 결제완료 주문조회", error);
      return false;
    } finally {
      setOrderSelectionBusy(false);
    }
  }

  function toggleSelectableOrder(id: string) {
    setSelectedOrderIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  async function collectSelectedPaymentOrders() {
    if (orderSelectionBusy) return;
    if (!selectableOrderRows.length) {
      setOrderSelectionMessage("먼저 쿠팡+토스 주문조회를 실행하세요.");
      return;
    }
    const selectedRows = selectableOrderRows.filter((row) => selectedOrderIds.includes(row.id));
    if (!selectedRows.length) {
      setOrderSelectionMessage("수집할 결제완료 상품을 1개 이상 체크하세요.");
      return;
    }
    const selectedChannels = Array.from(new Set(selectedRows.map((row) => row.channel)));
    const scope: Channel | "전체" = selectedChannels.length === 1 ? selectedChannels[0] : "전체";
    const channelCounts = {
      coupang: selectedRows.filter((row) => row.channel === "쿠팡").length,
      toss: selectedRows.filter((row) => row.channel === "토스").length,
    };
    setOrderSelectionBusy(true);
    try {
      setOrderSelectionMessage("서버 최신 매핑을 확인한 뒤 선택 주문을 처리합니다.");
      const latestMappings = await loadMappingsFromServer(true);
      resetOrderCollectionUiBeforeRun(scope === "전체" ? "all" : scope);
      // 선택한 신규 상품을 기존 주문에서 제거하지 않고 안정적으로 추가·갱신합니다.
      // 모바일에서도 처리 직전에 Supabase 최신 매핑을 병합합니다.
      // 미매핑 상품은 앱에서 임시 매핑행을 만들지 않고 엑셀 보완 대상으로 남깁니다.
      const merged = upsertSelectedOrderRows(orders, selectedRows);
      const nextOrders = merged.rows;
      const effectiveMappings = normalizeMappingRows(latestMappings);
      const selectedPurchaseRows = buildPurchaseRows(selectedRows, effectiveMappings);
      const missingSelectedRows = selectedPurchaseRows.filter((row) => row.matchStatus === "미매핑");
      setOrders(nextOrders);
      setApiDiagnosticRows(selectableOrderDiagnostics);
      setOrderCollectSummaryRows(buildOrderCollectionSummaryRows(nextOrders, effectiveMappings, {
        channel: scope,
        received: selectedRows.length,
        added: merged.addedCount,
        skipped: merged.skippedCount,
        message: `${scope} 선택 주문 ${selectedRows.length}건 수집`,
      }));
      const summary = summarizeMappingCheck(nextOrders, effectiveMappings, `${scope} 선택 주문수집`);
      setMappingCheckSummary(summary);
      const autoExport = await exportPurchaseGroupsFromOrders(selectedRows, `${scope} 선택 주문 발주양식`, {
        ignoreHistory: true,
        strictLocalFolder: true,
        forceAllMapped: true,
        includeChannelInputFiles: true,
        downloadZip: true,
        mappingRows: effectiveMappings,
        includeAdminPlusLinkedForManual: true,
      });
      const ackResult = autoExport.exportedRows > 0
        ? await acknowledgeOrdersAfterPurchaseExport(selectedRows, autoExport.purchaseRows || [])
        : { attempted: false, message: "" };
      const newProductText = missingSelectedRows.length
        ? ` 신규·미매핑 ${missingSelectedRows.length}건은 주문목록에 수집했고 상품준비중 변경은 보류했습니다. 미매핑 엑셀을 내려받아 보완 후 다시 업로드하세요.`
        : "";
      const summaryText = `선택 주문 ${selectedRows.length}건 수집 완료(쿠팡 ${channelCounts.coupang}건 · 토스 ${channelCounts.toss}건). 추가 ${merged.addedCount}건 · 갱신 ${merged.updatedCount}건. ${purchaseExportMessage(autoExport, selectedRows.length)} AdminPlus API 연동상품도 명시적으로 선택한 경우 수동 발주파일에 포함합니다.${newProductText}${ackResult.attempted ? ` ${ackResult.message}` : ""}`;
      setMessage(summaryText);
      setOrderSelectionMessage(summaryText);
      setSelectedOrderIds([]);
      await refreshApiOverview(false);
      selectedChannels.forEach((channel) => resolveOperationalFailureKind("order_collect", channel));
      return true;
    } catch (error) {
      const summary = `쿠팡·토스 선택 주문 수집 실패: ${String(error)}`;
      setOrderSelectionMessage(summary);
      setMessage(summary);
      recordOperationalFailure("order_collect", "주문수집·발주", "쿠팡·토스 선택 주문 수집", error);
      return false;
    } finally {
      setOrderSelectionBusy(false);
    }
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
    options: { ignoreHistory?: boolean; strictLocalFolder?: boolean; forceAllMapped?: boolean; includeChannelInputFiles?: boolean; downloadZip?: boolean; mappingRows?: MappingRow[]; includeAdminPlusLinkedForManual?: boolean } = {},
  ) {
    const activeHistory = options.ignoreHistory ? [] : purchaseHistory;
    const activeMappings = options.mappingRows || mappings;
    const sourcePurchaseRows = buildPurchaseRows(sourceOrders, activeMappings);
    const issues = validatePurchasePreflight(sourcePurchaseRows, sourceOrders, activeHistory);
    const blocked = issues.filter((issue) => issue.level === "차단");

    const targetRows = options.forceAllMapped
      ? filterVendorPurchaseRowsForAutoExport(sourcePurchaseRows)
      : blocked.length
        ? []
        : filterNewPurchaseTargetRows(sourcePurchaseRows, sourceOrders, activeHistory);
    const apiAutoRows = targetRows.filter((row) => isAdminPlusAutoPurchaseVendor(row.vendorName));
    const manualTargetRows = options.includeAdminPlusLinkedForManual
      ? targetRows
      : targetRows.filter((row) => !isAdminPlusAutoPurchaseVendor(row.vendorName));
    const groups = groupBy(manualTargetRows, (row) => row.vendorName);
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
      ? await makePurchaseFolderChannelInputArtifacts(sourceOrders, manualTargetRows, scope)
      : { artifacts: [] as FolderZipArtifact[], infos: [] as Array<{ channel: Channel; filename: string; count: number }> };
    artifacts.push(...channelInput.artifacts, checkArtifact);

    const downloadArtifactsIfRequested = async (savedFolderPath: string) => {
      if (!options.downloadZip || savedFolderPath === "브라우저 다운로드") return "";
      const zipFilename = `B2B_${compactScopeName(scope)}_${todayText}.zip`;
      const zipBlob = await createZipBlobFromArtifacts(artifacts);
      saveBlobWithDownload(zipFilename, zipBlob);
      return zipFilename;
    };

    if (blocked.length && !entries.length) {
      const detail = blocked
        .slice(0, 5)
        .map((issue) => `${issue.item}(${issue.channel} ${issue.orderNo})`)
        .join(", ");
      try {
        const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
        const downloaded = await downloadArtifactsIfRequested(saved.folderPath);
        setLastPurchaseExportRows([
          ["검증표", checkFilename, 0, "전체", 0, `${saved.folderPath} 저장${downloaded ? ` · ${downloaded} 다운로드` : ""}`],
        ]);
        setMappingCheckMessage(
          `${scope}: 발주 차단 ${blocked.length}건. 발주폴더에 ${checkFilename}을 저장했습니다.${downloaded ? ` ${downloaded}도 다운로드했습니다.` : ""} ${detail}`,
        );
        setFolderMessage(`발주폴더에 검증표 저장 완료: ${saved.folderPath}${downloaded ? ` · ${downloaded} 다운로드` : ""}`);
      } catch (error) {
        setMappingCheckMessage(`${scope}: 발주 차단 ${blocked.length}건. ${detail}`);
        setFolderMessage(`발주폴더 저장 실패: ${String(error)}. Cloudflare Worker와 R2 연결 상태를 확인하세요.`);
      }
      return { exportedRows: 0, vendors: 0, blocked: blocked.length, purchaseRows: [] as PurchaseRow[], channelInputFiles: 0 };
    }

    if (!entries.length) {
      try {
        const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
        const downloaded = await downloadArtifactsIfRequested(saved.folderPath);
        setLastPurchaseExportRows([
          ["검증표", checkFilename, 0, "전체", 0, `${saved.folderPath} 저장${downloaded ? ` · ${downloaded} 다운로드` : ""}`],
        ]);
        setMappingCheckMessage(
          `${scope}: 발주파일로 만들 결제완료 주문이 없습니다. 그래도 발주폴더에 ${checkFilename}을 저장했습니다.${downloaded ? ` ${downloaded}도 다운로드했습니다.` : ""} 수집 결과, 주문상태, 업체 매핑을 확인하세요.`,
        );
        setFolderMessage(`발주폴더에 검증표 저장 완료: ${saved.folderPath}${downloaded ? ` · ${downloaded} 다운로드` : ""}`);
      } catch (error) {
        setMappingCheckMessage(`${scope}: 발주파일로 만들 결제완료 주문이 없습니다.`);
        setFolderMessage(`발주폴더 저장 실패: ${String(error)}. Cloudflare Worker와 R2 연결 상태를 확인하세요.`);
      }
      return { exportedRows: 0, vendors: 0, blocked: 0, purchaseRows: [] as PurchaseRow[], channelInputFiles: 0 };
    }

    const exportedRows = entries.flatMap(([, rows]) => rows);
    const totalQty = exportedRows.reduce((sum, row) => sum + toNumber(row.purchaseQty, 0), 0);

    try {
      const saved = await saveArtifactsStrictlyToLocalFolder("purchase", artifacts);
      const downloaded = await downloadArtifactsIfRequested(saved.folderPath);
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
          `${saved.folderPath} 저장${downloaded ? ` · ${downloaded} 다운로드` : ""}`,
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
        `${scope}: 수동/엑셀 업체 ${entries.length}곳, 발주 ${exportedRows.length}건을 업체별 발주양식으로 자동 분류했습니다.${apiAutoRows.length ? ` AdminPlus API 자동발주 대상 ${apiAutoRows.length}건은 수동 발주파일에서 제외했습니다.` : ""}${channelInput.infos.length ? ` 쿠팡/토스 상품준비중 입력파일 ${channelInput.infos.length}개도 함께 생성했습니다.` : ""}${downloaded ? ` ${downloaded} 다운로드를 시작했습니다.` : ""} ${blocked.length ? `확인필요 ${blocked.length}건은 발주_매핑확인 파일에 별도 표시했습니다.` : "발주_매핑확인 파일에서 업체별 양식 매핑 결과를 확인하세요."}`,
      );
      setFolderMessage(`발주폴더 저장 완료: ${saved.folderPath} · 파일 ${saved.files.length}개${channelInput.infos.length ? ` · 상품준비중 입력파일 ${channelInput.infos.length}개 포함` : ""}${downloaded ? ` · ${downloaded} 다운로드` : ""}`);
      return { exportedRows: exportedRows.length, vendors: entries.length, blocked: blocked.length, purchaseRows: exportedRows, channelInputFiles: channelInput.infos.length, downloadFilename: downloaded, apiSkipped: apiAutoRows.length };
    } catch (error) {
      setFolderMessage(`발주폴더 직접 저장 실패: ${String(error)}. Cloudflare Worker와 R2 연결 상태를 확인하세요.`);
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
    result: { exportedRows: number; vendors: number; blocked: number; purchaseRows?: PurchaseRow[]; channelInputFiles?: number; downloadFilename?: string },
    importedCount: number,
  ) {
    if (result.exportedRows > 0) {
      return `업체 ${result.vendors}곳 발주양식 ${result.exportedRows}건을 자동 분류했습니다.${result.blocked ? ` 신규·미매핑 확인필요 ${result.blocked}건은 수집했지만 발주와 상태변경에서 제외했습니다.` : ""}${result.channelInputFiles ? ` 쿠팡/토스 상품준비중 입력파일 ${result.channelInputFiles}개도 함께 생성했습니다.` : ""}${result.downloadFilename ? ` ${result.downloadFilename} 다운로드를 시작했습니다.` : ""}`;
    }
    if (result.blocked > 0) {
      return `수집은 정상이나 미매핑/업체명/업체상품명/수량 확인필요 ${result.blocked}건 때문에 업체별 발주파일은 생성하지 않았습니다. 발주폴더의 발주_매핑확인 파일과 매핑관리의 옵션ID를 확인하세요.`;
    }
    if (importedCount > 0) {
      return "수집은 정상이나 현재 조건에서 업체별 발주 대상이 없습니다. 주문상태와 옵션ID 매핑을 확인하세요.";
    }
    return "API 응답 주문이 0건입니다. 판매자센터의 주문상태, 조회기간, 계정 권한을 확인하세요.";
  }

  function resetOrderCollectionUiBeforeRun(scope: "all" | Channel) {
    setApiDiagnosticRows([]);
    setOrderCollectSummaryRows([]);
    setLastPurchaseExportRows([]);
    setMappingCheckSummary(EMPTY_MAPPING_CHECK);
    setMappingCheckMessage(
      scope === "all"
        ? "쿠팡+토스 주문수집을 새로 시작합니다. 이전 수집결과와 발주파일 표시를 초기화했습니다."
        : `${scope} 주문수집을 새로 시작합니다. 해당 채널의 이전 수집결과와 발주파일 표시를 초기화했습니다.`,
    );
    setRecentLocalFiles((prev) => ({ ...prev, purchase: [] }));
    setFolderMessage("");
  }

  async function collectApiOrders(channel: Channel, mode: "current" | "purchase" | "invoice" = "current") {
    try {
      resetOrderCollectionUiBeforeRun(channel);
      const baseOrders = orders.filter((row) => row.channel !== channel);
      const collected = await collectChannelOrderRows(channel, baseOrders, mode);
      if (collected.diagnosticRows.length) setApiDiagnosticRows(collected.diagnosticRows);
      setOrders(collected.nextOrders);
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
        : { exportedRows: 0, vendors: 0, blocked: 0, purchaseRows: [] as PurchaseRow[], channelInputFiles: 0 };
      const ackResult = mode !== "invoice" && autoExport.exportedRows > 0
        ? await acknowledgeOrdersAfterPurchaseExport(exportSourceOrders, autoExport.purchaseRows || [])
        : { attempted: false, message: "" };
      const memoCount = collected.imported.filter((row) => text(row.memo)).length;
      setMessage(
        `${channel} 수집 완료: 응답 ${collected.imported.length}건, 추가 ${collected.addedCount}건, 중복 제외 ${collected.skippedCount}건, 배송메시지 ${memoCount}건 반영. ` +
          purchaseExportMessage(autoExport, collected.imported.length) +
          (ackResult.attempted ? ` ${ackResult.message}` : ""),
      );
      resolveOperationalFailureKind("order_collect", channel);
      return true;
    } catch (error) {
      setMessage(`${channel} 주문 수집 및 발주양식 자동 생성 실패: ${String(error)}`);
      recordOperationalFailure("order_collect", "주문수집·발주", `${channel} 주문 수집 및 발주양식 생성`, error, channel);
      return false;
    }
  }

  async function collectBothApiOrders() {
    try {
      resetOrderCollectionUiBeforeRun("all");
      let baseOrders: OrderRow[] = [];
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
    const timer = window.setTimeout(() => { void refreshApiOverview(false); }, 900);
    return () => window.clearTimeout(timer);
  }, []);

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
      openMappingWorkspace("purchase");
      setMessage(`${channel} 수동수집을 시작합니다. PC는 폴더 저장/열기, 모바일은 파일목록/다운로드로 운영합니다.`);
      if (autoCollect === "coupang") void collectApiOrders("쿠팡");
      else if (autoCollect === "toss") void collectApiOrders("토스");
      else void collectBothApiOrders();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mappings.length, purchaseTemplates.length, channelPurchaseTemplates.length]);

  function updateMapping(id: string, patch: Partial<MappingRow>) {

    if ("optionId" in patch && !cleanId(patch.optionId)) {
      const current = mappingsRef.current.find((row) => row.id === id);
      if (current && cleanId(current.optionId)) {
        void removeMappingRow(id);
        return;
      }
    }

    setMappings((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        const previousKey = mappingServerKey(row.channel, row.optionId);
        const next = {
          ...row,
          ...patch,
        };

        const identityChanged =
          parseChannel(next.channel) !==
            parseChannel(row.channel) ||
          cleanId(next.optionId) !==
            cleanId(row.optionId) ||
          normalizedVendorName(
            next.vendorName,
          ) !==
            normalizedVendorName(
              row.vendorName,
            ) ||
          cleanId(next.vendorCode) !==
            cleanId(row.vendorCode) ||
          normalizeHeader(
            next.vendorProductName,
          ) !==
            normalizeHeader(
              row.vendorProductName,
            );

        const now =
          new Date().toISOString();
        const normalized = {
          ...next,
          channel: parseChannel(next.channel),
          optionId: cleanId(next.optionId),
          cost: toNumber(next.cost, 0),
          baseQty: Math.max(1, toNumber(next.baseQty, 1)),
          shippingFee: Math.max(0, toNumber(next.shippingFee, 0)),
          purchaseTime: normalizeOptionPurchaseTimes(next.purchaseTime),
          ...(identityChanged
            ? {
                matchAuthority: "excel" as const,
                matchConfirmedAt: now,
              }
            : {}),
          updatedAt: now,
        };
        const nextKey = mappingServerKey(normalized.channel, normalized.optionId);
        if (previousKey && previousKey !== nextKey) mappingDeletedKeysRef.current.add(previousKey);
        return normalized;
      }),
    );
  }

  function commitMappingPurchaseTimes(id: string, raw: string) {
    const parsed = parseOptionPurchaseTimes(raw);
    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }
    updateMapping(id, { purchaseTime: parsed.normalized });
    setMessage(`발주시간 ${parsed.normalized} 입력 완료 · 최대 2회 발주시간이 서버 매핑에 자동 저장됩니다.`);
  }

  function addMappingRow() {
    setMappings((rows) => [makeMapping("쿠팡", "", "", "", "", 0, 1), ...rows]);
  }

  function resetManualMappingDraft() {
    setManualMappingDraft({ channel: "쿠팡", optionId: "", vendorName: "", vendorCode: "", vendorProductName: "", baseQty: 1, shippingFee: 0, cost: 0, purchaseTime: "08:40" });
  }

  function saveManualNewMapping() {
    const channel = parseChannel(manualMappingDraft.channel);
    const optionId = cleanId(manualMappingDraft.optionId);
    if (!/^\d+$/.test(optionId)) {
      setMessage("신규 상품은 쿠팡/토스의 실제 숫자 옵션ID를 입력해야 합니다.");
      return;
    }
    const key = mappingServerKey(channel, optionId);
    const duplicate = mappingsRef.current.find((row) => mappingServerKey(row.channel, row.optionId) === key);
    if (duplicate) {
      setMessage(`${channel} 옵션ID ${optionId}는 이미 상품매핑에 있습니다. 신규추가하지 않고 기존 행을 수정하세요.`);
      return;
    }
    const vendorName = text(manualMappingDraft.vendorName);
    const vendorProductName = text(manualMappingDraft.vendorProductName);
    if (!vendorName || !vendorProductName) {
      setMessage("신규 상품의 업체명과 업체상품명을 입력하세요.");
      return;
    }
    const parsedTime = parseOptionPurchaseTimes(manualMappingDraft.purchaseTime);
    if (!parsedTime.ok) { setMessage(parsedTime.error); return; }
    const row = makeMapping(
      channel, optionId, vendorName, text(manualMappingDraft.vendorCode), vendorProductName,
      Math.max(0, toNumber(manualMappingDraft.cost, 0)),
      Math.max(1, toNumber(manualMappingDraft.baseQty, 1)),
      Math.max(0, toNumber(manualMappingDraft.shippingFee, 0)),
      parsedTime.normalized,
    );
    const next = normalizeMappingRows([row, ...mappingsRef.current]);
    mappingsRef.current = next;
    setMappings(next);
    resetManualMappingDraft();
    setManualMappingOpen(false);
    setMessage(`${channel} 실제 옵션ID ${optionId} 신규 상품매핑을 추가했습니다. 1초 후 서버에 자동 저장됩니다.${adminPlusRuleForVendor(vendorName)?.accountId ? " AdminPlus 업체이면 API 상품매핑에서 실제 상품을 확정하세요." : " API 미연결 업체이므로 수동/엑셀 발주 대상으로 운영됩니다."}`);
  }

  async function commitMappingVendorTransition(mappingId: string, rawVendorName: string) {
    const mapping = mappingsRef.current.find((row) => row.id === mappingId);
    if (!mapping) return;
    const vendorName = text(rawVendorName);
    const linkId = `${mapping.channel}|${cleanId(mapping.optionId)}`;
    const link = adminplusProductLinks.find((row) => row.id === linkId);
    if (!link || normalizedVendorName(vendorName) === normalizedVendorName(link.vendorName)) return;

    const nextRule = adminPlusRuleForVendor(vendorName);

    if (nextRule?.accountId) {
      setMessage(
        `${mapping.channel} ${mapping.optionId}: 상품매칭의 ${vendorName} 변경을 최신값으로 적용했습니다. 같은 채널·옵션ID의 기존 API상품매칭이 새 상품매칭과 다르면 기존 연결과 실제 AdminPlus match를 자동 해제하고 AdminPlus 미연결로 이동합니다. 필요한 경우 API상품매칭에서 새 업체·상품을 다시 검색해 연결하세요.`,
      );
      return;
    }

    const now = new Date().toISOString();
    const transitioned = normalizeMappingRows(mappingsRef.current.map((row) => row.id === mappingId ? {
      ...row, vendorName, vendorCode: "", vendorProductName: "", matchAuthority: "excel" as const, matchConfirmedAt: now, updatedAt: now,
    } : row));
    const nextLinks = adminplusProductLinks.filter((row) => row.id !== linkId);
    const nextAlerts = adminplusPriceAlerts.map((row) => row.linkId === linkId && !row.acknowledgedAt ? { ...row, acknowledgedAt: now } : row);

    mappingsRef.current = transitioned;
    setMappings(transitioned);
    setAdminplusProductLinks(nextLinks);
    setAdminplusPriceAlerts(nextAlerts);

    try {
      const saved = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: transitioned,
          adminplusProductLinks: nextLinks,
          adminplusPriceAlerts: nextAlerts.slice(-1000),
          savedAt: now,
          version: APP_VERSION,
        },
      });
      if (saved.ok !== true) throw new Error(saved.message || "API→비API 업체 전환 서버 저장 실패");

      let cleanup = "";
      const oldAccount = adminplusAccounts.find((row) => row.id === link.accountId || normalizedVendorName(row.vendorName) === normalizedVendorName(link.vendorName));
      if (oldAccount && text(link.matchString)) {
        try {
          const deleted = await callApi("/api/integrations/adminplus/catalog/matches/delete", {
            accountId: oldAccount.id,
            matchString: link.matchString,
            confirm: true,
          });
          cleanup = deleted.ok === true ? " · 기존 AdminPlus 매칭도 정리됨" : " · 기존 AdminPlus 매칭 정리는 확인필요";
        } catch { cleanup = " · 기존 AdminPlus 매칭 정리는 확인필요"; }
      }
      setMessage(`${mapping.channel} ${mapping.optionId}: ${link.vendorName} API 연결을 해제하고 ${vendorName} 수동/엑셀 업체로 전환했습니다. 새 업체의 코드번호·업체상품명을 입력하세요.${cleanup}`);
    } catch (error) {
      recordOperationalFailure("adminplus_watch_save", "상품매핑", `API→비API 업체 전환 ${mapping.channel} ${mapping.optionId}`, error, mapping.channel);
      setMessage(`API→비API 업체 전환 저장 실패: ${String(error)} · 화면 변경은 유지되지만 서버 저장을 다시 확인하세요.`);
    }
  }


  function recheckCurrentMappings() {
    const summary = summarizeMappingCheck(orders, mappings, "현재 화면");
    setMappingCheckSummary(summary);
    const messageText = `현재 주문 ${summary.totalOrders}건 기준 재검사 완료: 매칭완료 ${summary.matched}건, 미매핑 ${summary.unmatched}건, 발주업체 ${summary.vendors}곳입니다.`;
    setMappingCheckMessage(messageText);
    setOrderCollectSummaryRows(buildOrderCollectionSummaryRows(orders, mappings));
    setMessage(messageText);
    openMappingWorkspace(summary.unmatched > 0 ? "mapping" : "purchase");
  }

  async function removeMappingRow(id: string) {
    const target = mappingsRef.current.find((row) => row.id === id);
    if (!target) return;

    const key = mappingServerKey(target.channel, target.optionId);
    const existingApiLink = key
      ? adminplusProductLinks.find((row) => row.id === key)
      : undefined;

    if (key) {
      mappingDeletedKeysRef.current.add(key);
    }

    const nextMappings = mappingsRef.current.filter(
      (row) => row.id !== id,
    );

    const nextLinks = key
      ? adminplusProductLinks.filter((row) => row.id !== key)
      : adminplusProductLinks;

    const now = new Date().toISOString();

    const nextAlerts = key
      ? adminplusPriceAlerts.map((row) =>
          row.linkId === key && !row.acknowledgedAt
            ? { ...row, acknowledgedAt: now }
            : row,
        )
      : adminplusPriceAlerts;

    mappingsRef.current = nextMappings;
    setMappings(nextMappings);
    setAdminplusProductLinks(nextLinks);
    setAdminplusPriceAlerts(nextAlerts);

    if (!key) {
      setMessage("빈 상품매핑 행을 삭제했습니다.");
      return;
    }

    try {
      await syncMappingsToServer(nextMappings);

      const saved = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: nextMappings,
          adminplusProductLinks: nextLinks,
          adminplusProductLinkDeletedIds: [key],
          adminplusPriceAlerts: nextAlerts.slice(-1000),
          savedAt: now,
          version: APP_VERSION,
        },
      });

      if (saved.ok !== true) {
        throw new Error(
          saved.message || "옵션ID 삭제 서버 저장 실패",
        );
      }

      let adminPlusCleanup = "";

      if (
        existingApiLink?.accountId &&
        existingApiLink?.matchString
      ) {
        try {
          const deleted = await callApi(
            "/api/integrations/adminplus/catalog/matches/delete",
            {
              accountId: existingApiLink.accountId,
              matchString: existingApiLink.matchString,
              confirm: true,
            },
          );

          adminPlusCleanup =
            deleted.ok === true
              ? " · 실제 AdminPlus 상품매칭도 삭제됨"
              : " · 실제 AdminPlus 상품매칭 삭제 확인필요";
        } catch {
          adminPlusCleanup =
            " · 실제 AdminPlus 상품매칭 삭제 확인필요";
        }
      }

      setMessage(
        `${key}: 상품매핑과 연결된 API상품매칭을 삭제했습니다. 자동발주에서도 제외됩니다.${adminPlusCleanup}`,
      );
    } catch (error) {
      recordOperationalFailure(
        "mapping_delete",
        "상품매핑",
        `옵션ID 삭제 ${key}`,
        error,
        target.channel,
      );

      setMessage(
        `옵션ID 삭제 서버 반영 실패: ${String(error)} · 화면에서는 삭제됐지만 서버 동기화를 다시 확인하세요.`,
      );
    }
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
      throw new Error(data.message || `클라우드 발주폴더 호출 실패: ${response.status}`);
    }
    return data;
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
        setFolderMessage(`${folderLabel(kind)} 최근 파일 ${data.files?.length || 0}개를 불러왔습니다. 선택한 업체 송장과 생성된 입력파일을 이 발주폴더에서 관리합니다.`);
      }
      return data.files || [];
    } catch (error) {
      if (!silent) {
        setFolderMessage(`${folderLabel(kind)} 파일목록 불러오기 실패: ${String(error)}. Cloudflare R2 발주폴더 연결과 Worker 배포 상태를 확인하세요.`);
      }
      return [];
    }
  }

  async function downloadManagedZip(kind: BrowserFolderKind, filenames: string[] = []) {
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
        filename: `B2B_${folderShortName(kind)}_송장업로드결과_${today()}.zip`,
        filenames: Array.from(new Set(filenames.filter(Boolean))),
      });
      setLocalFolderPaths((prev) => ({ ...prev, [kind]: data.folderPath }));
      setFolderNames((prev) => ({ ...prev, [kind]: data.folderPath }));
      saveBlobWithDownload(data.filename, base64ToBlob(data.base64, data.filename));
      setFolderMessage(`${folderLabel(kind)} ${data.count}개 파일을 ZIP으로 다운로드했습니다.`);
    } catch (error) {
      setFolderMessage(`${folderLabel(kind)} ZIP 다운로드 실패: ${String(error)}. 이 버튼은 클라우드 발주폴더에 이미 저장된 파일을 묶는 기능입니다. 클라우드/모바일에서는 발주관리의 전체 발주 버튼을 누르면 즉시 ZIP 다운로드로 전환됩니다.`);
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
        setShipmentPreviewMessage(`상품준비중 주문 API 재수집 실패로 현재 화면의 상품준비중 ${fallback.length}건을 기준으로 임시 송장과 매칭합니다: ${String(error)}`);
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
        ? `${folderLabel(kind)} Cloudflare R2 발주폴더에 ${data.files.length}개 파일 저장 완료: ${data.folderPath}`
        : `${folderLabel(kind)} 발주폴더에 ${data.files.length}개 파일 저장 완료: ${data.folderPath}`);
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
        `${folderLabel(kind)} 발주폴더 자동저장이 불가하여 ${artifacts.length}개 파일을 ${zipFilename}으로 브라우저 다운로드했습니다. 원인: ${String(error)}`,
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
      setShipmentPreviewMessage("앱에 임시 보관할 업체 송장엑셀을 선택하지 않았습니다.");
      return;
    }

    setShipmentUploadBusy(true);
    setShipmentUploadPreview(null);
    setLastShipmentResultArtifacts([]);
    try {
      const parsed: InvoiceRecord[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        try {
          const rows = await importRowsFromFile(file);
          const records = parseInvoiceRowsFromFolderFile(file.name, rows);
          if (records.length) parsed.push(...records);
          else skipped.push(`${file.name}: 택배사·운송장번호·주문정보를 찾지 못함`);
        } catch (error) {
          skipped.push(`${file.name}: ${String(error)}`);
        }
      }

      const merged = mergeInvoiceRecords(parsed);
      if (!merged.length) {
        throw new Error(`선택한 ${files.length}개 파일에서 사용할 송장 행을 찾지 못했습니다. 주문번호 또는 수취인, 택배사, 운송장번호 열을 확인하세요.${skipped.length ? ` 확인: ${skipped.slice(0, 3).join(" / ")}` : ""}`);
      }

      setTemporaryVendorShipmentFiles(files);
      setTemporaryVendorInvoiceRecords(merged);
      const messageText = `업체 송장엑셀 ${files.length}개·유효 송장 ${merged.length}행을 앱에 임시 보관했습니다. 서버·R2·Supabase에는 저장하지 않으며 새로고침하면 삭제됩니다. 쿠팡+토스 업로드를 눌러 매칭 결과를 확인하세요.`;
      setShipmentPreviewMessage(`${messageText} 파일: ${files.map((file) => file.name).join(" / ")}${skipped.length ? ` / 확인필요: ${skipped.slice(0, 3).join(" / ")}` : ""}`);
      setMessage(messageText);
    } catch (error) {
      setTemporaryVendorShipmentFiles([]);
      setTemporaryVendorInvoiceRecords([]);
      const messageText = `업체 송장엑셀 임시저장 실패: ${String(error)}`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
    } finally {
      setShipmentUploadBusy(false);
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
  async function pickManagedFolder(kind: BrowserFolderKind) {
    setFolderMessage(
      `${folderLabel(kind)} 클라우드 발주폴더를 설정합니다. 경로 입력 저장이 우선이며, 미지원 환경에서는 폴더 선택창을 사용합니다.`,
    );
    if (!folderApiSupported() || !window.showDirectoryPicker) {
      setFolderMessage(
        "현재 브라우저는 폴더 선택 직접저장을 지원하지 않습니다. Cloudflare Worker/R2 저장 또는 브라우저 다운로드를 사용하세요.",
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
      const errorName = error instanceof DOMException ? error.name : "";
      if (errorName === "AbortError" || String(error).includes("AbortError")) {
        setFolderMessage("폴더 선택을 취소했습니다. 기존 저장방식은 변경되지 않았습니다.");
        return null;
      }
      setFolderMessage(`폴더 설정을 완료하지 못했습니다: ${String(error)}`);
      return null;
    }
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
        `${localSaved.folderLabel} 클라우드 발주폴더에 ${localSaved.filename} 저장 완료: ${localSaved.folderName}`,
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
    downloadExcelFile("B2B_매핑자료_V47.xls", [
      {
        name: "B2B_매핑자료_V47",
        rows: [
          ["매핑"],
          [""],
          ["채널", "옵션ID", "업체명", "코드번호", "업체상품명", "기본수량", "배송비", "기준단가", "기준구성원가", "발주시간"],
          ["쿠팡", "95185230665", "늘푸른", "", "하프절단 암꽃게 4kg (24-40조각)", 1, 0, 44000, 44000, "08:40, 13:30"],
          ["쿠팡", "95235689038", "늘푸른", "", "활 바지락 1kg (65~80미) 大", 5, 4000, 3500, 21500, "08:40, 13:30"],
        ],
      },
      {
        name: "작성기준",
        rows: [
          ["항목", "설명"],
          ["채널", "쿠팡 또는 토스"],
          ["옵션ID", "엑셀 매핑의 최우선 기준키입니다."],
          ["업체명", "최신 엑셀 업체명이 AdminPlus 확정 업체와 다르면 기존 API 확정링크를 초기화합니다."],
          ["코드번호", "수동/엑셀 업체의 발주 상품코드입니다. AdminPlus API 업체는 비워둘 수 있습니다."],
          ["업체상품명", "발주처/AdminPlus에서 실제 사용하는 상품명입니다."],
          ["기본수량", "옵션ID별 발주 기본수량입니다."],
          ["배송비", "구성원가 계산에 더하는 기준 배송비입니다."],
          ["기준단가", "엑셀 기준 공급단가입니다."],
          ["기준구성원가", "기준단가 × 기본수량 + 배송비입니다. 웹앱에서는 자동 계산합니다."],
          ["발주시간", "HH:MM 또는 HH:MM, HH:MM 형식으로 최대 2개까지 입력합니다."],
        ],
      },
    ]);
  }

  function exportMapping() {
    downloadExcelFile("B2B_매핑자료_V47.xls", [
      {
        name: "B2B_매핑자료_V47",
        rows: [
          ["매핑"],
          [""],
          ["채널", "옵션ID", "업체명", "코드번호", "업체상품명", "기본수량", "배송비", "기준단가", "기준구성원가", "발주시간"],
          ...mappings.map((row) => [
            row.channel,
            row.optionId,
            row.vendorName,
            row.vendorCode,
            row.vendorProductName,
            row.baseQty,
            row.shippingFee,
            row.cost,
            adminPlusConfiguredCost(row.cost, row.baseQty, row.shippingFee),
            normalizeOptionPurchaseTimes(row.purchaseTime).replace(",", ", "),
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
          ["채널", "매핑기준", "업체명", "코드번호", "업체상품명", "원가", "기본수량", "배송비", "참고 주문번호", "내 판매상품명", "옵션명/옵션관리코드"],
          ...targets.map((row) => [
            row.channel,
            row.optionId,
            "",
            "",
            "",
            0,
            1,
            0,
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
    openMappingWorkspace("purchase");
  }

  function canExportPurchaseRows(rows: PurchaseRow[], scope: string) {
    const issues = validatePurchasePreflight(rows, orders, purchaseHistory);
    const blocked = issues.filter((issue) => issue.level === "차단");
    if (blocked.length) {
      const detail = blocked.slice(0, 3).map((issue) => `${issue.item}(${issue.channel} ${issue.orderNo})`).join(", ");
      setMessage(`${scope} 발주 엑셀 생성 차단: ${blocked.length}건 확인 필요. ${detail}`);
      openMappingWorkspace("purchase");
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
      openMappingWorkspace("purchase");
      return;
    }
    try {
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
      resolveOperationalFailureKind("purchase_export");
      return true;
    } catch (error) {
      setMessage(`전체 발주파일 생성 실패: ${String(error)}`);
      recordOperationalFailure("purchase_export", "발주", "전체 업체별 발주파일 생성", error);
      return false;
    }
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

  function shipmentResultSummaryRows(
    preview: ShipmentUploadPreviewState,
    result: ApiResult,
  ): Array<Array<string | number>> {
    const summary = result.summary || {};
    const requested = Number(summary.requested || result.requestedRows || preview.readyRows.length || 0);
    const succeeded = Number(summary.succeeded || 0);
    return [
      ["항목", "건수/내용"],
      ["선택 송장파일", preview.sourceFileNames.length],
      ["송장 유효행", preview.invoiceRecordCount],
      ["상품준비중 조회", preview.preparingOrderCount],
      ["쿠팡 업로드대상", preview.counts.coupang],
      ["토스 업로드대상", preview.counts.toss],
      ["미매칭·확인필요", preview.counts.unmatched],
      ["기등록 제외", preview.counts.excluded],
      ["API 요청", requested],
      ["API 성공", succeeded],
      ["API 결과", result.message || "결과 메시지 없음"],
      ["처리시각", new Date().toLocaleString("ko-KR")],
    ];
  }

  function shipmentResultDetailRows(rows: InvoicePreviewRow[], result: ApiResult) {
    return [
      ["상태", "채널", "주문번호", "업체", "상품명", "수취인", "택배사", "운송장번호", "매칭방식", "송장파일", "API 처리요약"],
      ...rows.map((row) => [
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
        row.status === "등록준비" ? (result.message || "API 요청 완료") : "업로드 제외",
      ]),
    ];
  }

  async function buildShipmentResultArtifacts(
    preview: ShipmentUploadPreviewState,
    result: ApiResult,
  ): Promise<FolderZipArtifact[]> {
    const coupangRows = preview.readyRows.filter((row) => row.channel === "쿠팡");
    const tossRows = preview.readyRows.filter((row) => row.channel === "토스");
    const unmatchedRows = preview.previewRows.filter((row) => row.status !== "등록준비");
    const allBlob = await createXlsxBlob([
      { name: "처리요약", rows: shipmentResultSummaryRows(preview, result) },
      { name: "전체처리결과", rows: shipmentResultDetailRows(preview.previewRows, result) },
      { name: "쿠팡업로드", rows: coupangShipmentRows(coupangRows, preview.sourceOrders, getShipmentTemplate("쿠팡", shipmentTemplates)) },
      { name: "토스업로드", rows: tossShipmentRows(tossRows, preview.sourceOrders, getShipmentTemplate("토스", shipmentTemplates)) },
      { name: "미매칭확인", rows: shipmentResultDetailRows(unmatchedRows, result) },
    ]);
    return [{ filename: `쿠팡_토스_전체처리결과_${today()}.xlsx`, blob: allBlob }];
  }

  async function downloadShipmentResultArtifacts(artifacts: FolderZipArtifact[]) {
    const artifact = artifacts[0];
    if (!artifact) return;
    saveBlobWithDownload(artifact.filename, artifact.blob);
  }

  async function runShipmentUploadAll() {
    if (shipmentUploadBusy) return;
    if (!temporaryVendorShipmentFiles.length || !temporaryVendorInvoiceRecords.length) {
      const messageText = "먼저 업체송장 선택을 눌러 택배사와 운송장번호가 입력된 업체별 엑셀을 앱에 임시 저장하세요.";
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
      return;
    }

    setShipmentUploadBusy(true);
    setShipmentUploadPreview(null);
    try {
      setShipmentPreviewMessage("쿠팡·토스 상품준비중 주문을 조회하고 앱 임시 송장과 매칭 중입니다. 이 단계에서는 실제 채널에 업로드하지 않습니다...");
      const collected = await collectPreparingOrdersForShipmentUpload();
      const previewRows = matchInvoices(
        collected.ordersForMatch,
        buildPurchaseRows(collected.allOrders, mappings),
        temporaryVendorInvoiceRecords,
      );
      const readyRows = previewRows.filter((row) => row.status === "등록준비");
      const preview: ShipmentUploadPreviewState = {
        createdAt: new Date().toISOString(),
        sourceFileNames: temporaryVendorShipmentFiles.map((file) => file.name),
        invoiceRecordCount: temporaryVendorInvoiceRecords.length,
        preparingOrderCount: collected.preparingOrders.length,
        alreadyShippedCount: collected.alreadyShippedCount,
        sourceOrders: collected.allOrders,
        previewRows,
        readyRows,
        counts: {
          coupang: readyRows.filter((row) => row.channel === "쿠팡").length,
          toss: readyRows.filter((row) => row.channel === "토스").length,
          unmatched: previewRows.filter((row) => row.status === "확인필요").length,
          excluded: previewRows.filter((row) => row.status === "송장입력완료(업로드제외)").length,
        },
      };
      setShipmentUploadPreview(preview);
      const messageText = readyRows.length
        ? `매칭 미리보기 완료: 쿠팡 ${preview.counts.coupang}건, 토스 ${preview.counts.toss}건 업로드 준비 / 확인필요 ${preview.counts.unmatched}건. 정상 매칭 건만 업로드되며 확인필요 건은 별도 엑셀로 내려받습니다. 내용을 확인한 뒤 최종 업로드를 누르세요.`
        : `상품준비중 ${preview.preparingOrderCount}건과 임시 송장 ${preview.invoiceRecordCount}행을 비교했지만 업로드 가능한 매칭 건이 없습니다. 확인필요 ${preview.counts.unmatched}건의 주문번호·수취인·주소·상품명·택배사·운송장번호를 확인하세요.`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
      resolveOperationalFailureKind("shipment_preview");
      return true;
    } catch (error) {
      const messageText = `쿠팡+토스 송장 매칭 미리보기 실패: ${String(error)}`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
      recordOperationalFailure("shipment_preview", "송장", "쿠팡+토스 송장 매칭 미리보기", error);
      return false;
    } finally {
      setShipmentUploadBusy(false);
    }
  }

  async function finalizeShipmentUpload() {
    const preview = shipmentUploadPreview;
    if (!preview || !preview.readyRows.length || shipmentUploadBusy) return;
    setShipmentUploadBusy(true);
    try {
      setShipmentPreviewMessage(`최종 업로드 중입니다. 정상 매칭 ${preview.readyRows.length}건만 쿠팡·토스 채널로 전송합니다...`);
      const result = await callApi("/api/integrations/shipments/upload-execute", {
        rows: shipmentUploadApiRows(preview.readyRows, preview.sourceOrders),
        manual: true,
        source: "browser_temporary_vendor_shipments_v187",
      });
      const artifacts = await buildShipmentResultArtifacts(preview, result);
      setLastShipmentResultArtifacts(artifacts);
      await downloadShipmentResultArtifacts(artifacts);

      const apiOk = result.ok !== false;
      const messageText = `${result.message || `쿠팡 ${preview.counts.coupang}건·토스 ${preview.counts.toss}건 업로드 요청을 완료했습니다.`} 날짜가 포함된 전체처리 결과 엑셀 1개를 다운로드했습니다.${preview.counts.unmatched ? ` 확인필요 ${preview.counts.unmatched}건은 같은 파일의 미매칭확인 시트에 포함했습니다.` : ""}`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);

      if (apiOk) {
        setTemporaryVendorShipmentFiles([]);
        setTemporaryVendorInvoiceRecords([]);
        setShipmentUploadPreview(null);
      }
      resolveOperationalFailureKind("shipment_upload");
      return true;
    } catch (error) {
      const messageText = `최종 쿠팡+토스 송장 업로드 실패: ${String(error)}. 임시 송장과 매칭 미리보기는 유지되므로 원인을 확인한 뒤 다시 최종 업로드할 수 있습니다.`;
      setShipmentPreviewMessage(messageText);
      setMessage(messageText);
      recordOperationalFailure("shipment_upload", "송장", "최종 쿠팡+토스 송장 업로드", error);
      return false;
    } finally {
      setShipmentUploadBusy(false);
    }
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
      "B2B 바로가기를 기본 업체 목록으로 복원했습니다. 로그인ID는 앱 설정에 저장하고 비밀번호는 브라우저 비밀번호 관리자를 사용하세요.",
    );
  }

  function openB2BVendorLink(link: B2BVendorLink) {
    if (!link.url) return;
    window.open(link.url, "_blank", "noopener,noreferrer");
    if (link.loginId && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(link.loginId).then(() => {
        setMessage(`${link.vendorName} 로그인 페이지를 열고 로그인ID를 복사했습니다. 비밀번호는 모바일 브라우저 비밀번호 관리자의 자동완성을 사용하세요.`);
      }).catch(() => {
        setMessage(`${link.vendorName} 로그인 페이지를 열었습니다. 저장된 로그인ID와 브라우저 비밀번호 자동완성을 사용하세요.`);
      });
    } else {
      setMessage(`${link.vendorName} 로그인 페이지를 열었습니다. 비밀번호는 모바일 브라우저 비밀번호 관리자의 자동완성을 사용하세요.`);
    }
  }

  function selectedNewCouponOptionRows() {
    return couponOptionLookupRows.filter((row) => row.selected && row.apiVerified);
  }

  function toggleNewCouponOption(optionId: string) {
    setCouponOptionLookupRows((rows) => rows.map((row) =>
      row.optionId === optionId && row.apiVerified ? { ...row, selected: !row.selected } : row,
    ));
    setNewCouponPreflightIssues([]);
    setNewCouponPreflightAt("");
  }

  function updateNewCouponOption(optionId: string, patch: Partial<CouponOptionLookupRow>) {
    setCouponOptionLookupRows((rows) => rows.map((row) =>
      row.optionId === optionId ? { ...row, ...patch } : row,
    ));
    setNewCouponPreflightIssues([]);
    setNewCouponPreflightAt("");
  }

  function updateNewCouponDraft(patch: Partial<NewCouponDraft>) {
    setNewCouponDraft((prev) => ({ ...prev, ...patch }));
    setNewCouponPreflightIssues([]);
    setNewCouponPreflightAt("");
  }

  async function lookupCouponOptionIds() {
    const optionIds = parseCouponOptionIds(couponOptionLookupText);
    if (!optionIds.length) {
      setCouponMessage("조회할 쿠팡 API 옵션ID(vendorItemId)를 입력하세요. 여러 개는 줄바꿈 또는 쉼표로 구분할 수 있습니다.");
      return;
    }
    setCouponOptionLookupBusy(true);
    setNewCouponPreflightIssues([]);
    setNewCouponPreflightAt("");
    try {
      const result = await callApi("/api/integrations/coupang/products/prices-sync", {
        rows: optionIds.map((optionId) => ({ optionId })),
        manual: true,
      });
      const apiRows = Array.isArray(result.summary?.rows) ? result.summary?.rows as Array<Record<string, unknown>> : [];
      const apiErrors = Array.isArray(result.summary?.errors) ? result.summary?.errors as Array<Record<string, unknown>> : [];
      const apiById = new Map(apiRows.map((row) => [cleanId(row.optionId), row]));
      const errorById = new Map(apiErrors.map((row) => [cleanId(row.optionId), row]));
      const knownById = new Map(currentCoupangOptionMasterRows.map((row) => [cleanId(row.optionId), row]));
      const mappingById = new Map(
        mappings
          .filter((row) => row.channel === "쿠팡" && cleanId(row.optionId))
          .map((row) => [cleanId(row.optionId), row]),
      );
      const previousById = new Map(couponOptionLookupRows.map((row) => [cleanId(row.optionId), row]));
      const rows: CouponOptionLookupRow[] = optionIds.map((optionId) => {
        const api = apiById.get(optionId);
        const error = errorById.get(optionId);
        const known = knownById.get(optionId);
        const mapping = mappingById.get(optionId);
        const previous = previousById.get(optionId);
        const vendorProductName = text(mapping?.vendorProductName);
        const apiProductName =
          known?.productName ||
          text(api?.productName) ||
          `쿠팡 옵션 ${optionId}`;
        const salePrice = toNumber(api?.salePrice, known?.salePrice || 0);
        const apiVerified = Boolean(api);
        return {
          optionId,
          productName: apiProductName,
          optionName: known?.optionName || text(api?.optionName),
          vendorProductName,
          couponProductName:
            previous?.couponProductName ||
            vendorProductName ||
            apiProductName,
          couponName: previous?.couponName || couponNameWithDateSuffixForUi(
            vendorProductName ||
              previous?.couponProductName ||
              apiProductName,
            immediateCouponWindowForUi(schedules).endAt.slice(0, 10),
          ),
          discountType: previous?.discountType || "금액",
          discountValue: toNumber(previous?.discountValue, 0),
          salePrice,
          status: text(api?.status) || known?.status || (apiVerified ? "API 확인" : "확인필요"),
          amountInStock: text(api?.amountInStock),
          sellerItemId: cleanId(api?.sellerItemId),
          apiVerified,
          selected: apiVerified,
          error: text(error?.message) || (apiVerified ? "" : "쿠팡 API에서 옵션을 확인하지 못했습니다."),
        };
      });
      setCouponOptionLookupRows(rows);
      const verified = rows.filter((row) => row.apiVerified);
      if (verified.length) {
        const synced = verified.map((row) => makeCoupangOptionMasterRow(
          row.optionId,
          row.productName,
          row.optionName,
          row.salePrice,
          row.status,
          "api",
        ));
        setCoupangOptionMasterRows((prev) => normalizeCoupangOptionMasterRows([...synced, ...prev]));
      }
      const missingMapping = rows.filter((row) => !row.vendorProductName).length;
      const msg = `쿠팡 API 옵션ID ${rows.length}건 중 ${verified.length}건을 확인했습니다.${missingMapping ? ` 매칭자료 없는 신규 옵션 ${missingMapping}건도 API 확인 완료 시 쿠폰 발행할 수 있습니다.` : ""}${rows.length !== verified.length ? ` 확인필요 ${rows.length - verified.length}건은 옵션ID·API 권한을 점검하세요.` : ""}`;
      setCouponMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `쿠팡 API 옵션ID 조회 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
    } finally {
      setCouponOptionLookupBusy(false);
    }
  }

  function validateNewCouponDraft() {
    const selected = selectedNewCouponOptionRows();
    const window = immediateCouponWindowForUi(schedules);
    const startAt = window.startAt;
    const endAt = window.endAt;
    const contractId = cleanId(newCouponDraft.contractId || couponApiSettings.selectedContractId);
    const issues: string[] = [];
    if (!contractId) issues.push("계약서 목록에서 신규생성 계약을 선택하세요.");
    if (!selected.length) issues.push("API 조회에 성공한 옵션ID를 1개 이상 선택하세요.");

    const items = selected.map((row) => {
      const couponName = text(row.couponName);
      const targetName = couponNameWithDateSuffixForUi(couponName, endAt.slice(0, 10));
      // R5.9.1:
      // 신규 쿠팡 옵션은 발주 매핑이 아직 없어도 API 옵션ID가 확인되면 쿠폰 발행할 수 있습니다.
      // 업체상품명은 발주/매핑용 정보이며 쿠폰 발행의 필수조건으로 사용하지 않습니다.
      if (!text(row.couponProductName)) issues.push(`${row.optionId}: 상품명을 입력하세요.`);
      if (!couponName) issues.push(`${row.optionId}: 쿠폰명을 입력하세요.`);
      if (toNumber(row.discountValue, 0) <= 0) issues.push(`${row.optionId}: 할인값은 0보다 커야 합니다.`);
      if (row.discountType === "율" && toNumber(row.discountValue, 0) >= 100) issues.push(`${row.optionId}: 정률 할인은 100% 미만이어야 합니다.`);
      if (row.discountType === "율" && toNumber(newCouponDraft.maxDiscountPrice, 0) <= 0) issues.push(`${row.optionId}: 정률 쿠폰의 최대 할인금액을 입력하세요.`);
      if (row.salePrice > 0 && row.discountType === "금액" && row.salePrice <= row.discountValue) issues.push(`${row.optionId}: 할인값이 현재 판매가 이상입니다.`);
      // 같은 쿠폰명은 다른 옵션에서 사용할 수 있습니다. 실제 중복은 서버 사전검증에서 옵션ID 기준으로 판정합니다.
      return { ...row, couponName, targetName };
    });

    return {
      issues: Array.from(new Set(issues)),
      selected,
      items,
      startAt,
      endAt,
      scheduleStartDate: window.scheduleStartDate,
      contractId,
    };
  }

  function runNewCouponPreflight() {
    const check = validateNewCouponDraft();
    const checkedAt = new Date().toLocaleString("ko-KR");
    setNewCouponPreflightIssues(check.issues);
    setNewCouponPreflightAt(checkedAt);
    const msg = check.issues.length
      ? `신규 쿠폰 사전검증 실패 ${check.issues.length}건: ${check.issues.join(" / ")}`
      : `신규 쿠폰 사전검증 통과: 옵션별 쿠폰 ${check.items.length}개입니다. 사전검증은 실제 쿠폰을 발행하지 않습니다. ‘즉시 적용’을 실행하면 발행과 동시에 24시간 반복대상으로 등록됩니다.`;
    setCouponMessage(msg);
    setMessage(msg);
    return check.issues.length === 0;
  }

  async function createImmediateNewCouponTemplates(check: ReturnType<typeof validateNewCouponDraft>) {
    const templates: RollingCouponTemplate[] = [];
    const failures: Array<{ optionId: string; couponName: string; reason: string }> = [];
    const generatedCouponIds: string[] = [];

    for (const option of check.items) {
      const templateKey = `new-${option.optionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const draftRow: CouponRow = {
        ...makeCouponRow(
          "apply",
          option.optionId,
          option.couponProductName,
          option.couponName,
          option.discountType,
          option.discountValue,
          check.startAt,
          check.endAt,
          "자동운영 시작 즉시 신규 쿠폰 생성·적용",
          option.salePrice,
          option.salePrice > 0 ? "api" : "",
        ),
        rollingTemplateId: templateKey,
        contractId: check.contractId,
        baseCouponName: option.couponName,
        maxDiscountPrice: option.discountType === "율" ? toNumber(newCouponDraft.maxDiscountPrice, 0) : option.discountValue,
        wowExclusive: false,
      };
      const validationRows = validateCouponRows([draftRow]);
      const profitRows = analyzeCouponProfitRows([draftRow], couponProfitSourceRows);
      const executionRows = buildCouponExecutionCheckRows([draftRow], validationRows, profitRows, [], couponHistory);
      const blocked = executionRows.filter((row) => row.executeStatus !== "대기");
      if (blocked.length) {
        failures.push({ optionId: option.optionId, couponName: option.couponName, reason: blocked.map((row) => row.executeReason).join(" / ") });
        continue;
      }

      const settings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedContractId: check.contractId,
        selectedCouponId: "",
        sourceCouponId: "",
        selectedCouponName: option.couponName,
        selectedCouponStartAt: check.startAt,
        selectedCouponEndAt: check.endAt,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        sourceDiscountType: option.discountType,
        sourceDiscountValue: option.discountValue,
      });
      try {
        const result = await callApi("/api/integrations/coupons/action-preview", {
          action: "apply",
          rows: executionRows,
          scheduledTime: kstDateTimeParts().time,
          daily24h: true,
          manual: true,
          couponApiSettings: settings,
        });
        const ids = normalizeCouponIdList(result.summary?.generatedCouponIds);
        const couponId = ids[0] || "";
        if (result.ok === false || !couponId) {
          const generatedNote = ids.length ? ` 생성된 couponId ${ids.join(", ")}는 쿠팡 요청상태를 확인하세요.` : "";
          failures.push({ optionId: option.optionId, couponName: option.couponName, reason: `${result.message || "쿠팡 신규 쿠폰 생성 또는 옵션 적용이 완료되지 않았습니다."}${generatedNote}` });
          continue;
        }
        generatedCouponIds.push(couponId);
        templates.push({
          id: rollingCouponTemplateId(couponId),
          enabled: true,
          sourceCouponId: couponId,
          latestCouponId: couponId,
          contractId: check.contractId,
          couponName: option.couponName,
          baseCouponName: option.couponName,
          status: "APPLIED",
          type: option.discountType === "율" ? "RATE" : "PRICE",
          discountType: option.discountType,
          discountValue: option.discountValue,
          maxDiscountPrice: option.discountType === "율" ? toNumber(newCouponDraft.maxDiscountPrice, 0) : option.discountValue,
          wowExclusive: false,
          startAt: check.startAt,
          endAt: check.endAt,
          itemCount: 1,
          options: [{
            optionId: option.optionId,
            productName: option.couponProductName,
            optionName:
              option.vendorProductName ||
              option.optionName ||
              option.couponProductName,
            salePrice: option.salePrice,
            salePriceSource: option.salePrice > 0 ? "api" : "",
          }],
          automationState: "active",
          preflightStatus: "통과",
          preflightAt: new Date().toISOString(),
          preflightIssues: [],
          scheduleStartDate: check.scheduleStartDate,
          lastGeneratedCouponId: couponId,
          lastGeneratedAt: new Date().toISOString(),
          savedAt: new Date().toISOString(),
        });
      } catch (error) {
        failures.push({ optionId: option.optionId, couponName: option.couponName, reason: String(error) });
      }
    }

    if (!templates.length) {
      throw new Error(`신규 쿠폰을 생성하지 못했습니다. ${failures.map((row) => `${row.optionId} ${row.reason}`).join(" / ")}`);
    }
    return { templates, failures, generatedCouponIds };
  }


  function currentNewCouponPreflightCheck() {
    const check = validateNewCouponDraft();
    if (!newCouponPreflightAt || newCouponPreflightIssues.length || check.issues.length) {
      const reasons = check.issues.length ? ` ${check.issues.join(" / ")}` : "";
      setCouponMessage(`먼저 신규 쿠폰 사전검증을 통과해야 합니다.${reasons}`);
      return null;
    }
    return check;
  }

  function clearCreatedNewCouponRows(optionIds: string[]) {
    const completed = new Set(optionIds.map(cleanId));
    const remainingRows = couponOptionLookupRows.filter((row) => !completed.has(cleanId(row.optionId)));
    setCouponOptionLookupRows(remainingRows);
    if (!remainingRows.length) {
      setCouponOptionLookupText("");
      setNewCouponDraft(DEFAULT_NEW_COUPON_DRAFT);
    }
    setNewCouponPreflightIssues([]);
    setNewCouponPreflightAt("");
  }


  async function applyNewCouponNow() {
    if (couponAutomationBusy || newCouponBusy) return;
    const check = currentNewCouponPreflightCheck();
    if (!check) return;
    const confirmed = window.confirm(
      `신규 쿠폰 ${check.items.length}개를 지금 생성하고 옵션에 즉시 적용합니다.\n\n` +
      `적용 후 24시간 반복대상에도 등록하며, 첫 정기 교체는 ${check.scheduleStartDate} ${schedules.couponCancel.time}/${schedules.couponApply.time}부터 시작합니다.`,
    );
    if (!confirmed) return;

    setCouponAutomationBusy(true);
    setNewCouponBusy(true);
    try {
      const created = await createImmediateNewCouponTemplates(check);
      const nextSchedules = normalizeSchedules({
        ...schedules,
        couponPreflight: { enabled: true, time: schedules.couponPreflight.time || "23:45" },
        couponCancel: { enabled: true, time: schedules.couponCancel.time || "23:50" },
        couponApply: { enabled: true, time: schedules.couponApply.time || "23:52" },
      });
      const nextTemplates = normalizeRollingCouponTemplates([
        ...rollingCouponTemplates,
        ...created.templates,
      ]);
      const now = new Date().toISOString();
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        automationEnabled: true,
        automationActivatedAt: now,
        automationStoppedAt: "",
        selectedCouponId: nextTemplates.map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
        rollingTemplates: nextTemplates,
      });
      await persistCouponAutomationState(nextTemplates, nextSettings, nextSchedules);
      clearCreatedNewCouponRows(created.templates.flatMap((template) => template.options.map((option) => option.optionId)));
      // 목록뿐 아니라 couponId별 실제 상품옵션까지 다시 읽어 "쿠팡 n건 / 반복 n건"을 즉시 갱신합니다.
      window.setTimeout(() => { void fetchCancelableCouponList(); }, 500);
      const failureText = created.failures.length
        ? ` 일부 실패 ${created.failures.length}건: ${created.failures.map((row) => `${row.optionId} ${row.reason}`).join(" / ")}`
        : "";
      const msg = `신규 쿠폰 ${created.templates.length}개를 즉시 생성·적용하고 24시간 반복대상에 등록했습니다.${failureText}`;
      setCouponMessage(msg);
      setMessage(msg);
    } catch (error) {
      setCouponMessage(`신규 쿠폰 쿠폰 교체 실패: ${String(error)}`);
    } finally {
      setNewCouponBusy(false);
      setCouponAutomationBusy(false);
    }
  }


  function updateRollingCouponTemplate(templateId: string, patch: Partial<RollingCouponTemplate>) {
    setRollingCouponTemplates((templates) => normalizeRollingCouponTemplates(templates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            ...patch,
            preflightStatus: "미검증",
            preflightAt: "",
            preflightIssues: [],
            savedAt: new Date().toISOString(),
          }
        : template,
    )));
  }


  async function applyRollingCouponTemplateNow(templateId: string) {
    if (couponAutomationBusy) return;
    const template = rollingCouponTemplates.find((row) => row.id === templateId);
    if (!template) return;

    const discountValue = toNumber(template.discountValue, 0);
    const issues: string[] = [];
    if (!cleanId(template.contractId)) issues.push("contractId가 없습니다.");
    if (!template.options.length) issues.push("적용 옵션이 없습니다.");
    if (template.discountType === "율") {
      if (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 99) issues.push("정률 할인은 1~99 사이의 정수로 입력하세요.");
      if (toNumber(template.maxDiscountPrice, 0) < 10) issues.push("정률 할인 최대할인금액은 10원 이상이어야 합니다.");
    } else if (discountValue < 10 || discountValue % 10 !== 0) {
      issues.push("정액 할인은 10원 이상, 10원 단위로 입력하세요.");
    }
    if (issues.length) {
      setCouponMessage(`쿠폰 교체 실패: ${issues.join(" / ")}`);
      return;
    }

    const label = template.discountType === "율"
      ? `${discountValue}% (최대 ${toNumber(template.maxDiscountPrice, 0).toLocaleString()}원)`
      : `${discountValue.toLocaleString()}원`;
    const confirmed = window.confirm(
      `${template.couponName}의 할인조건을 ${label}으로 지금 적용합니다.\n\n` +
      "현재 대상 옵션에 APPLIED 쿠폰이 있으면 실제 옵션ID를 확인해 종료한 뒤 새 쿠폰을 발행합니다. " +
      "이미 종료됐거나 현재 APPLIED 쿠폰이 없으면 종료 단계를 생략하고 즉시 새 쿠폰을 발행합니다. " +
      "성공은 신규 couponId와 대상 옵션ID의 실제 APPLIED 적용까지 확인된 경우에만 확정합니다."
    );
    if (!confirmed) return;

    setCouponAutomationBusy(true);
    try {
      const editedTemplates = normalizeRollingCouponTemplates(
        rollingCouponTemplates.map((row) => row.id === templateId
          ? { ...template, enabled: true, savedAt: new Date().toISOString() }
          : row),
      );
      await persistCouponAutomationState(
        editedTemplates,
        normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: editedTemplates }),
      );

      const result = await callApi("/api/integrations/coupang/coupons/v250-immediate-replace", {
        templateId,
        manual: true,
      });

      const state = text(result.summary?.state);
      const newCouponId = cleanId(result.summary?.couponId);
      const canceledCouponIds = normalizeCouponIdList(result.summary?.canceledCouponIds);
      const now = new Date().toISOString();

      if (result.ok !== true || !newCouponId) {
        const waiting = state === "WAITING_EXTERNAL";
        const retryableTemplates = normalizeRollingCouponTemplates(
          editedTemplates.map((row) => row.id === templateId ? {
            ...row,
            enabled: true,
            automationState: couponApiSettings.automationEnabled ? "active" as const : row.automationState,
            r10State: waiting ? "WAITING_EXTERNAL" as const : "FAILED" as const,
            r10LastError: result.message || "즉시 교체가 완료되지 않았습니다.",
            preflightStatus: "실패" as const,
            preflightAt: now,
            preflightIssues: [result.message || "즉시 교체가 완료되지 않았습니다."],
            ...(newCouponId ? { latestCouponId: newCouponId } : {}),
            savedAt: now,
          } : row),
        );
        setRollingCouponTemplates(retryableTemplates);
        setCouponApiSettings((previous) => normalizeCouponApiSettings({ ...previous, rollingTemplates: retryableTemplates }));
        setCouponMessage(
          waiting
            ? `${template.couponName}: 기존 쿠폰 종료 또는 쿠팡 비동기 처리를 확인 중입니다. 중복 발행 없이 V250 자동복구가 이어집니다. ${result.message || ""}`
            : `${template.couponName}: 즉시 교체를 완료하지 못했습니다. 반복대상은 유지됩니다. ${result.message || ""}`,
        );
        window.setTimeout(() => { void fetchCancelableCouponList(); }, 5_000);
        return;
      }

      const windowRange = immediateCouponWindowForUi(schedules);
      const nextTemplates = normalizeRollingCouponTemplates(
        editedTemplates.map((row) => row.id === templateId ? {
          ...row,
          enabled: true,
          latestCouponId: newCouponId,
          lastGeneratedCouponId: newCouponId,
          lastGeneratedAt: now,
          lastCanceledAt: canceledCouponIds.length ? now : row.lastCanceledAt,
          startAt: windowRange.startAt,
          endAt: windowRange.endAt,
          type: row.discountType === "율" ? "RATE" : "PRICE",
          automationState: couponApiSettings.automationEnabled ? "active" as const : "validated" as const,
          r10State: "VERIFIED" as const,
          r10LastError: "",
          r10LastVerifiedCouponId: newCouponId,
          r10LastVerifiedAt: now,
          preflightStatus: "통과" as const,
          preflightAt: now,
          preflightIssues: [],
          savedAt: now,
        } : row),
      );
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        selectedCouponId: nextTemplates.map((row) => row.latestCouponId || row.sourceCouponId).filter(Boolean).join(","),
        lastGeneratedCouponId: newCouponId,
        lastGeneratedCouponIds: [newCouponId],
        lastGeneratedAt: now,
        lastCancelCouponIds: canceledCouponIds,
        lastCanceledAt: canceledCouponIds.length ? now : couponApiSettings.lastCanceledAt,
        rollingTemplates: nextTemplates,
      });

      setRollingCouponTemplates(nextTemplates);
      setCouponApiSettings(nextSettings);
      window.setTimeout(() => { void fetchCancelableCouponList(); }, 500);

      const prefix = canceledCouponIds.length
        ? `기존 APPLIED couponId ${canceledCouponIds.join(", ")} 종료 후`
        : "현재 APPLIED 쿠폰이 없어 종료 단계를 생략하고";
      const msg = `${template.couponName}: ${prefix} 신규 couponId ${newCouponId} 즉시 발행·옵션ID APPLIED 검증을 완료했습니다.`;
      setCouponMessage(msg);
      setMessage(msg);
    } catch (error) {
      const retryableTemplates = normalizeRollingCouponTemplates(
        rollingCouponTemplates.map((row) => row.id === templateId ? {
          ...row,
          enabled: true,
          automationState: couponApiSettings.automationEnabled ? "active" as const : row.automationState,
          preflightStatus: "실패" as const,
          preflightAt: new Date().toISOString(),
          preflightIssues: [`지금 쿠폰 교체 실패: ${String(error)}`],
          r10LastError: String(error),
          savedAt: new Date().toISOString(),
        } : row),
      );
      setRollingCouponTemplates(retryableTemplates);
      setCouponApiSettings((previous) => normalizeCouponApiSettings({ ...previous, rollingTemplates: retryableTemplates }));
      setCouponMessage(`지금 쿠폰 교체에 실패했습니다. 반복대상은 유지되고 V250 자동복구는 계속됩니다: ${String(error)}`);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  function updateApiEndpointSetting(key: ApiEndpointKey, value: string) {
    setApiEndpointSettings((previous) => ({
      ...previous,
      [key]: value,
      savedAt: new Date().toISOString(),
    }));
  }

  function restoreDefaultApiEndpointSettings() {
    if (!window.confirm("쿠팡·토스 API 경로를 프로그램 기본값으로 되돌릴까요? API 키와 판매자ID는 변경하지 않습니다.")) return;
    setApiEndpointSettings({ ...DEFAULT_API_ENDPOINT_SETTINGS, savedAt: new Date().toISOString() });
    setSettingsMessage("API 경로를 기본값으로 복원했습니다. 서버 저장을 눌러야 Ncloud 자동운영에도 적용됩니다.");
  }

  async function diagnoseConfiguredCoupangApi() {
    const issues = apiEndpointValidationIssues(apiEndpointSettings);
    if (issues.length) {
      setSettingsMessage(`API 경로 검증 실패: ${issues.join(" / ")}`);
      return;
    }
    try {
      const today = kstDateTimeParts().date;
      const result = await callApi("/api/integrations/orders/diagnose", {
        channel: "쿠팡",
        diagnosticOnly: true,
        manual: true,
        query: { startDate: today, endDate: today, status: "ACCEPT", maxPerPage: 10, maxPages: 1 },
      });
      const status = toNumber(result.summary?.status, 0);
      const messageText = status === 200 || result.ok
        ? `API 경로 진단 성공: 쿠팡 주문조회 HTTP ${status || 200}. 현재 화면 경로가 Ncloud 요청에 적용됩니다.`
        : result.message || "API 경로 진단 결과를 확인하세요.";
      setSettingsMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      setSettingsMessage(`API 경로 진단 실패: ${String(error)}`);
    }
  }

  function coupangCredentialPayload() {
    const token = credentialAdminToken.trim();
    const secretKey = credentialSecretKey.trim();
    if (!token) throw new Error("Ncloud 관리 토큰을 입력하세요.");
    if (!secretKey) throw new Error("새 Secret Key를 입력하세요.");
    if (secretKey !== credentialSecretConfirm.trim()) throw new Error("새 Secret Key와 확인값이 일치하지 않습니다.");
    return {
      token,
      payload: {
        secretKey,
        ...(credentialVendorId.trim() ? { vendorId: credentialVendorId.trim() } : {}),
        ...(credentialAccessKey.trim() ? { accessKey: credentialAccessKey.trim() } : {}),
      },
    };
  }

  async function testCoupangCredentialDraft() {
    if (credentialBusy) return;
    try {
      const { token, payload } = coupangCredentialPayload();
      setCredentialBusy(true);
      setCredentialMessage("새 인증키로 쿠팡 주문조회 연결을 테스트하고 있습니다.");
      const result = await callApi("/api/admin/coupang-credentials/test", payload, { authorizationToken: token, secureWorkerOnly: true });
      setCredentialMessage(`${result.message || "연결 테스트 성공"} Vendor ID ${text(result.vendorId)}, Access Key ${text(result.accessKeyMasked)}`);
    } catch (error) {
      setCredentialMessage(`연결 테스트 실패: ${String(error)}`);
    } finally {
      setCredentialBusy(false);
    }
  }

  async function applyCoupangCredentialDraft() {
    if (credentialBusy) return;
    try {
      const { token, payload } = coupangCredentialPayload();
      const confirmed = window.confirm("새 쿠팡 인증키를 연결 테스트한 뒤 Ncloud 운영 설정에 저장하고 즉시 적용할까요? 실패하면 기존 키를 유지합니다.");
      if (!confirmed) return;
      setCredentialBusy(true);
      setCredentialMessage("새 인증키를 검증하고 Ncloud에 적용하고 있습니다.");
      const result = await callApi("/api/admin/coupang-credentials/apply", payload, { authorizationToken: token, secureWorkerOnly: true });
      setCredentialSecretKey("");
      setCredentialSecretConfirm("");
      setCredentialAccessKey("");
      setCredentialVendorId("");
      const messageText = `${result.message || "저장 및 즉시 적용 완료"} Access Key ${text(result.accessKeyMasked)}`;
      setCredentialMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      setCredentialMessage(`저장 및 적용 실패: ${String(error)}`);
    } finally {
      setCredentialBusy(false);
    }
  }


  function requiredCredentialAdminToken() {
    const token = credentialAdminToken.trim();
    if (!token) throw new Error("Ncloud 관리 토큰을 입력하세요.");
    return token;
  }

  function formatCredentialExpiry(value: unknown) {
    const raw = text(value);
    if (!raw) return "확인 전";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  }

  async function loadTossCredentialStatus() {
    if (tossCredentialBusy) return;
    try {
      const token = requiredCredentialAdminToken();
      setTossCredentialBusy(true);
      setTossCredentialMessage("토스쇼핑 Access Token 만료일을 확인하고 있습니다.");
      const result = await callApi("/api/admin/toss-credentials/status", {}, { authorizationToken: token, secureWorkerOnly: true });
      setTossCredentialStatus(result as unknown as Record<string, unknown>);
      setTossCredentialMessage(`${result.message || "토스쇼핑 인증 상태를 확인했습니다."}${result.expiresAt ? ` · Access Token 만료예정 ${formatCredentialExpiry(result.expiresAt)}` : ""}`);
    } catch (error) {
      setTossCredentialMessage(`토스쇼핑 인증 상태 확인 실패: ${String(error)}`);
    } finally {
      setTossCredentialBusy(false);
    }
  }

  function tossCredentialPayload() {
    const token = requiredCredentialAdminToken();
    const secret = tossCredentialSecretKey.trim();
    if (!secret) throw new Error("새 토스쇼핑 Secret Key를 입력하세요.");
    if (secret !== tossCredentialSecretConfirm.trim()) throw new Error("토스쇼핑 Secret Key 확인값이 일치하지 않습니다.");
    return {
      token,
      payload: {
        clientSecret: secret,
        ...(tossCredentialAccessKey.trim() ? { clientId: tossCredentialAccessKey.trim() } : {}),
      },
    };
  }

  async function testTossCredentialDraft() {
    if (tossCredentialBusy) return;
    try {
      const { token, payload } = tossCredentialPayload();
      setTossCredentialBusy(true);
      setTossCredentialMessage("새 토스쇼핑 키로 Access Token 발급을 시험하고 있습니다.");
      const result = await callApi("/api/admin/toss-credentials/test", payload, { authorizationToken: token, secureWorkerOnly: true });
      setTossCredentialStatus(result as unknown as Record<string, unknown>);
      setTossCredentialMessage(`${result.message || "연결 테스트 성공"}${result.expiresAt ? ` · 토큰 만료예정 ${formatCredentialExpiry(result.expiresAt)}` : ""}`);
    } catch (error) {
      setTossCredentialMessage(`토스쇼핑 연결 테스트 실패: ${String(error)}`);
    } finally {
      setTossCredentialBusy(false);
    }
  }

  async function applyTossCredentialDraft() {
    if (tossCredentialBusy) return;
    try {
      const { token, payload } = tossCredentialPayload();
      if (!window.confirm("새 토스쇼핑 Access/Secret Key를 테스트한 뒤 Ncloud에 저장하고 즉시 적용할까요?")) return;
      setTossCredentialBusy(true);
      const result = await callApi("/api/admin/toss-credentials/apply", payload, { authorizationToken: token, secureWorkerOnly: true });
      setTossCredentialAccessKey("");
      setTossCredentialSecretKey("");
      setTossCredentialSecretConfirm("");
      setTossCredentialStatus(result as unknown as Record<string, unknown>);
      const messageText = `${result.message || "토스쇼핑 인증키 적용 완료"}${result.expiresAt ? ` · 토큰 만료예정 ${formatCredentialExpiry(result.expiresAt)}` : ""}`;
      setTossCredentialMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      setTossCredentialMessage(`토스쇼핑 저장 및 적용 실패: ${String(error)}`);
    } finally {
      setTossCredentialBusy(false);
    }
  }

  function reconcileAdminPlusRules(accounts: AdminPlusAccountStatusRow[], config = adminplusAutomation) {
    const current = new Map<string, AdminPlusAccountRule>(config.accountRules.map((row) => [row.accountId, row] as [string, AdminPlusAccountRule]));
    return accounts.map((account) => {
      const existing = current.get(account.id);
      return {
        accountId: account.id,
        vendorName: account.vendorName,
        enabled: existing?.enabled ?? account.enabled,
        autoPurchase: existing?.autoPurchase ?? true,
        autoPayment: existing?.autoPayment ?? false,
        paymentMaxPerBatch: existing?.paymentMaxPerBatch ?? 0,
        paymentDailyLimit: existing?.paymentDailyLimit ?? 0,
        autoShipment: existing?.autoShipment ?? true,
      } satisfies AdminPlusAccountRule;
    });
  }

  async function loadAdminPlusAccounts(testTokens = true) {
    if (adminplusCredentialBusy) return;
    try {
      setAdminplusCredentialBusy(true);
      setAdminplusCredentialMessage(testTokens ? "어드민플러스 운영 계정과 API 권한을 확인하고 있습니다." : "어드민플러스 운영 계정목록을 불러오고 있습니다.");
      const result = await callApi("/api/integrations/adminplus/accounts/status", { testTokens });
      const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows as unknown as AdminPlusAccountStatusRow[] : [];
      setAdminplusAccounts(rows);
      setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, accountRules: reconcileAdminPlusRules(rows, prev) }));
      setAdminplusCredentialMessage(result.message || `어드민플러스 운영 계정 ${rows.length}개를 불러왔습니다.`);
    } catch (error) {
      setAdminplusCredentialMessage(`어드민플러스 운영 계정 조회 실패: ${String(error)}`);
    } finally {
      setAdminplusCredentialBusy(false);
    }
  }

  function resetAdminPlusCredentialDraft() {
    setAdminplusAccountId("");
    setAdminplusAccountLabel("");
    setAdminplusVendorName("");
    setAdminplusClientId("");
    setAdminplusClientSecret("");
    setAdminplusClientSecretConfirm("");
    setAdminplusAccountEnabled(true);
  }

  function editAdminPlusAccount(account: AdminPlusAccountStatusRow) {
    setAdminplusAccountId(account.id);
    setAdminplusAccountLabel(account.label);
    setAdminplusVendorName(account.vendorName);
    setAdminplusClientId("");
    setAdminplusClientSecret("");
    setAdminplusClientSecretConfirm("");
    setAdminplusAccountEnabled(account.enabled);
    setAdminplusCredentialMessage(`${account.label} 수정모드입니다. 기존 Client ID/Secret을 유지하려면 입력칸을 비워두세요.`);
  }

  function adminPlusCredentialPayload() {
    const token = requiredCredentialAdminToken();
    const label = adminplusAccountLabel.trim();
    const vendorName = adminplusVendorName.trim();
    if (!label) throw new Error("어드민플러스 계정명을 입력하세요.");
    if (!vendorName) throw new Error("협력사명을 입력하세요. 현재 웹앱 매핑 업체명과 같은 협력사로 연결되며 공백·법인표기 차이는 정규화해 처리합니다.");
    if (adminplusClientSecret.trim() !== adminplusClientSecretConfirm.trim()) throw new Error("Client Secret 확인값이 일치하지 않습니다.");
    const id = adminplusAccountId.trim() || `adminplus-${Date.now()}`;
    return {
      token,
      payload: {
        id,
        label,
        vendorName,
        enabled: adminplusAccountEnabled,
        ...(adminplusClientId.trim() ? { clientId: adminplusClientId.trim() } : {}),
        ...(adminplusClientSecret.trim() ? { clientSecret: adminplusClientSecret.trim() } : {}),
      },
    };
  }

  async function testAdminPlusCredentialDraft() {
    if (adminplusCredentialBusy) return;
    try {
      const { token, payload } = adminPlusCredentialPayload();
      setAdminplusCredentialBusy(true);
      setAdminplusCredentialMessage("어드민플러스 토큰 발급과 주문조회 권한을 확인하고 있습니다.");
      const result = await callApi("/api/admin/adminplus-credentials/test", payload, { authorizationToken: token, secureWorkerOnly: true });
      setAdminplusCredentialMessage(`${result.message || "연결 테스트 성공"}${result.expiresAt ? ` · 토큰 만료예정 ${formatCredentialExpiry(result.expiresAt)}` : ""}`);
    } catch (error) {
      setAdminplusCredentialMessage(`어드민플러스 연결 테스트 실패: ${String(error)}`);
    } finally {
      setAdminplusCredentialBusy(false);
    }
  }

  async function applyAdminPlusCredentialDraft() {
    if (adminplusCredentialBusy) return;
    try {
      const { token, payload } = adminPlusCredentialPayload();
      if (!window.confirm(`${text(payload.label)} 계정 인증정보를 테스트한 뒤 Ncloud 보안 저장소에 저장할까요?`)) return;
      setAdminplusCredentialBusy(true);
      const result = await callApi("/api/admin/adminplus-credentials/apply", payload, { authorizationToken: token, secureWorkerOnly: true });
      setAdminplusCredentialMessage(`${result.message || "어드민플러스 계정 저장 완료"}${result.expiresAt ? ` · 토큰 만료예정 ${formatCredentialExpiry(result.expiresAt)}` : ""}`);
      resetAdminPlusCredentialDraft();
      window.setTimeout(() => void loadAdminPlusAccounts(true), 150);
    } catch (error) {
      setAdminplusCredentialMessage(`어드민플러스 저장 실패: ${String(error)}`);
    } finally {
      setAdminplusCredentialBusy(false);
    }
  }

  async function deleteAdminPlusAccount(account: AdminPlusAccountStatusRow) {
    if (adminplusCredentialBusy) return;
    try {
      const token = requiredCredentialAdminToken();
      if (!window.confirm(`${account.label} 인증정보를 Ncloud에서 삭제할까요? 자동발주/송장회수도 중단됩니다.`)) return;
      setAdminplusCredentialBusy(true);
      const result = await callApi("/api/admin/adminplus-credentials/delete", { id: account.id }, { authorizationToken: token, secureWorkerOnly: true });
      setAdminplusCredentialMessage(result.message || "계정을 삭제했습니다.");
      setAdminplusAccounts((prev) => prev.filter((row) => row.id !== account.id));
      setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, accountRules: prev.accountRules.filter((row) => row.accountId !== account.id) }));
    } catch (error) {
      setAdminplusCredentialMessage(`어드민플러스 계정 삭제 실패: ${String(error)}`);
    } finally {
      setAdminplusCredentialBusy(false);
    }
  }

  function adminPlusConfiguredCost(unitPrice: unknown, baseQty: unknown, shippingFee: unknown) {
    return Math.max(0, toNumber(unitPrice, 0)) * Math.max(1, toNumber(baseQty, 1)) + Math.max(0, toNumber(shippingFee, 0));
  }

  function normalizedVendorName(value: unknown) {
    return text(value).replace(/\s+/g, "").toLowerCase();
  }

  // AdminPlus의 match_string은 업체상품명 전체에서 공유되므로, 같은 업체상품명을 여러 마켓 옵션ID가
  // 서로 다른 기본수량으로 사용할 때 하나의 qty를 서로 덮어쓰는 충돌이 생길 수 있습니다.
  // B2B 자동발주용 매칭은 채널+옵션ID별 독립 문자열을 사용해 엑셀 매핑의 옵션ID/기본수량을 그대로 보존합니다.
  function adminPlusOptionScopedMatchString(mapping: Pick<MappingRow, "channel" | "optionId">) {
    const channelCode = mapping.channel === "쿠팡" ? "CP" : "TS";
    return `B2B:${channelCode}:${cleanId(mapping.optionId)}`;
  }

  function adminPlusRuleForVendor(vendorName: unknown) {
    const key = normalizedVendorName(vendorName);
    return adminplusAutomation.accountRules.find((rule) => normalizedVendorName(rule.vendorName) === key);
  }

  function isAdminPlusAutoPurchaseVendor(vendorName: unknown) {
    const rule = adminPlusRuleForVendor(vendorName);
    return Boolean(adminplusAutomation.enabled && rule && rule.enabled !== false && rule.autoPurchase !== false && rule.accountId);
  }

  function vendorIntegrationStatus(vendorName: string) {
    const rule = adminPlusRuleForVendor(vendorName);
    if (!rule?.accountId) return { mode: "수동/엑셀", detail: "AdminPlus 계정 미연결" };
    const account = adminplusAccounts.find((row) => row.id === rule.accountId);
    if (!account) return { mode: "API 확인필요", detail: "연결된 AdminPlus 계정 정보를 다시 불러오세요." };
    if (account.tokenOk === false || account.orderReadScopeOk === false || account.productReadScopeOk === false) return { mode: "API 확인필요", detail: account.message || "계정 또는 order.read/product.read 권한 확인필요" };
    if (!adminplusAutomation.enabled || rule.enabled === false || rule.autoPurchase === false) return { mode: "API 연결·중지", detail: account.label || rule.accountId };
    return { mode: "AdminPlus API", detail: account.label || rule.accountId };
  }

  function b2bConnectionForVendor(vendorName: unknown) {
    const key = normalizedVendorName(vendorName);
    const link = b2bVendorLinks.find((row) => normalizedVendorName(row.vendorName) === key);
    const url = text(link?.url);
    let hostname = "";
    try { hostname = url ? new URL(url).hostname : ""; } catch { hostname = ""; }
    return {
      url,
      hostname,
      loginId: text(link?.loginId),
      adminPlusUrl: /(^|\.)adminplus\.co\.kr/i.test(hostname),
    };
  }

  function adminPlusMappingSearchText(row: MappingRow) {
    return normalizeHeader([
      row.channel,
      row.optionId,
      row.vendorName,
      row.vendorCode,
      row.vendorProductName,
    ].join(" "));
  }

  function adminPlusCatalogSearchText(row: AdminPlusCatalogProduct) {
    return normalizeHeader([
      row.productCode,
      row.name,
      ...row.options.flatMap((option) => [option.optionCode, option.optionName]),
    ].join(" "));
  }

  function adminPlusSuggestionSearchText(row: AdminPlusMatchSuggestion) {
    return normalizeHeader([
      row.status,
      row.channel,
      row.optionId,
      row.vendorName,
      row.vendorCode,
      row.vendorProductName,
      row.source,
      row.productCode,
      row.productName,
      row.optionCode,
      row.qty,
      row.shippingFee,
      row.configuredCost,
      row.optionName,
      row.reason,
    ].join(" "));
  }

  function mappingRowsForAdminPlusAccount(accountId = adminplusCatalogAccountId) {
    const account = adminplusAccounts.find((row) => row.id === accountId);
    const query = normalizeHeader(adminplusMappingSearch);
    return mappings.filter((row) => {
      if (account && normalizedVendorName(row.vendorName) !== normalizedVendorName(account.vendorName)) return false;
      return !query || adminPlusMappingSearchText(row).includes(query);
    });
  }

  function filteredAdminPlusCatalogRows() {
    const query = normalizeHeader(adminplusProductSearch);
    if (!query) return adminplusCatalogProducts;
    return adminplusCatalogProducts.filter((row) => adminPlusCatalogSearchText(row).includes(query));
  }

  function filteredAdminPlusSuggestionRows() {
    const query = normalizeHeader(adminplusSuggestionSearch);
    if (!query) return adminplusMatchSuggestions;
    return adminplusMatchSuggestions.filter((row) => adminPlusSuggestionSearchText(row).includes(query));
  }

  function updateAdminPlusSuggestionCostFields(
    suggestionId: string,
    patch: Partial<Pick<AdminPlusMatchSuggestion, "qty" | "shippingFee" | "purchaseTime">>,
  ) {
    setAdminplusMatchSuggestions((prev) => prev.map((row) => {
      if (row.id !== suggestionId) return row;
      const previousQty = Math.max(1, Number(row.qty || 1) || 1);
      const previousShippingFee = Math.max(0, Number(row.shippingFee || 0) || 0);
      const previousPurchaseTime = text(row.purchaseTime) || OPTION_PURCHASE_TIME_FALLBACK;
      const nextQty = patch.qty === undefined ? previousQty : Math.max(1, Number(patch.qty || 1) || 1);
      const nextShippingFee = patch.shippingFee === undefined
        ? previousShippingFee
        : Math.max(0, Number(patch.shippingFee || 0) || 0);
      // 입력 중에는 draft 문자열 그대로 유지하고, 확정 직전에만 HH:MM 1~2개 형식을 엄격 검증합니다.
      const nextPurchaseTime = patch.purchaseTime === undefined
        ? previousPurchaseTime
        : text(patch.purchaseTime);
      const nextRow = {
        ...row,
        qty: nextQty,
        shippingFee: nextShippingFee,
        purchaseTime: nextPurchaseTime,
        configuredCost: adminPlusConfiguredCost(row.price, nextQty, nextShippingFee),
      };
      const mapping = mappings.find((item) => item.id === row.mappingId);
      const account = adminplusAccounts.find((item) => item.id === row.accountId);
      const confirmedLink = mapping && account
        ? confirmedAdminPlusLinkForMapping(adminplusProductLinks, mapping, account)
        : undefined;
      const sameAsConfirmed = adminPlusSuggestionMatchesConfirmedValues(nextRow, mapping, confirmedLink);
      const hasConfirmed = Boolean(confirmedLink && row.productCode);
      const editableChanged = !sameAsConfirmed && Boolean(row.productCode);
      return {
        ...nextRow,
        status: row.status === "복합매칭확인"
          ? row.status
          : editableChanged
            ? "확정가능"
            : hasConfirmed
              ? "확정됨"
              : row.status,
        // AdminPlus 실제 매칭을 다시 써야 하는 것은 수량/상품/옵션 변경일 때뿐입니다.
        needsWrite: confirmedLink
          ? nextQty !== Math.max(1, Number(confirmedLink.qty || 1) || 1)
          : row.needsWrite,
        reason: editableChanged
          ? "발주시간/기본수량/배송비를 임시 수정했습니다. 발주시간·배송비만 바뀐 경우 AdminPlus 상품매칭을 다시 쓰지 않고 서버 확정값만 안전하게 갱신합니다."
          : hasConfirmed
            ? "서버 확정값과 동일합니다."
            : row.reason,
      };
    }));
  }

  function adminPlusProductLinkDraft(row: AdminPlusProductLink): AdminPlusProductLinkDraft {
    return adminplusProductLinkDrafts[row.id] || {
      qty: Math.max(1, Number(row.qty || 1) || 1),
      shippingFee: Math.max(0, Number(row.shippingFee || 0) || 0),
      purchaseTime: normalizeOptionPurchaseTimes(row.purchaseTime),
    };
  }

  function updateAdminPlusProductLinkCostDraft(
    linkId: string,
    patch: Partial<Pick<AdminPlusProductLinkDraft, "qty" | "shippingFee" | "purchaseTime">>,
  ) {
    const confirmed = adminplusProductLinks.find((row) => row.id === linkId);
    if (!confirmed) return;
    setAdminplusProductLinkDrafts((prev) => {
      const current = prev[linkId] || {
        qty: Math.max(1, Number(confirmed.qty || 1) || 1),
        shippingFee: Math.max(0, Number(confirmed.shippingFee || 0) || 0),
        purchaseTime: normalizeOptionPurchaseTimes(confirmed.purchaseTime),
      };
      return {
        ...prev,
        [linkId]: {
          qty: patch.qty === undefined ? current.qty : Math.max(1, Number(patch.qty || 1) || 1),
          shippingFee: patch.shippingFee === undefined ? current.shippingFee : Math.max(0, Number(patch.shippingFee || 0) || 0),
          purchaseTime: patch.purchaseTime === undefined ? current.purchaseTime : text(patch.purchaseTime),
        },
      };
    });
  }

  function normalizeAdminPlusServerLinks(value: unknown): AdminPlusProductLink[] {
    if (!Array.isArray(value)) return [];
    return (value as AdminPlusProductLink[]).map((row) => ({
      ...row,
      qty: Math.max(1, Number(row.qty || 1) || 1),
      shippingFee: Math.max(0, Number(row.shippingFee || 0) || 0),
      purchaseTime: normalizeOptionPurchaseTimes(row.purchaseTime),
      baselineConfiguredCost: adminPlusConfiguredCost(row.baselinePrice, row.qty, row.shippingFee),
      currentConfiguredCost: adminPlusConfiguredCost(row.currentPrice, row.qty, row.shippingFee),
      updatedAt: text(row.updatedAt) || undefined,
    }));
  }

  async function loadAdminPlusConfirmedStateFromServer(options: { preserveLocalMappings?: boolean } = {}) {
    const result = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(settingsKey)}`);
    if (result.ok !== true || !result.data) throw new Error(result.message || "서버 확정매핑을 불러오지 못했습니다.");
    const data = result.data as TempPayload;
    const serverMappings = Array.isArray(data.mappings) ? normalizeMappingRows(data.mappings) : [];
    const serverLinks = normalizeAdminPlusServerLinks(data.adminplusProductLinks);
    const serverAlerts = Array.isArray(data.adminplusPriceAlerts) ? data.adminplusPriceAlerts.slice(-1000) as AdminPlusPriceAlert[] : [];
    const serverSynced = syncMappingsFromConfirmedAdminPlusLinks(serverMappings, serverLinks);
    const uiBaseMappings = options.preserveLocalMappings ? mappingsRef.current : (serverMappings.length ? serverMappings : mappingsRef.current);
    const uiSynced = syncMappingsFromConfirmedAdminPlusLinks(uiBaseMappings, serverLinks);

    // V255: V253 이전에 만들어진 확정 AdminPlus 링크도 기존 엑셀매칭의 업체/상품 정체성에 1회 자동 반영합니다.
    // 운영값(optionId/baseQty/shippingFee/purchaseTime/cost)은 서버 매핑값을 그대로 보존합니다.
    if (serverSynced.changed) {
      const migrateResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: { ...data, mappings: serverSynced.rows, adminplusProductLinks: serverLinks, savedAt: new Date().toISOString(), version: APP_VERSION },
      });
      if (migrateResult.ok !== true) throw new Error(migrateResult.message || "기존 AdminPlus 확정링크 → 엑셀매칭 자동동기화 저장 실패");
    }

    mappingsRef.current = uiSynced.rows;
    setMappings(uiSynced.rows);
    mappingServerFingerprintRef.current = mappingRowsFingerprint(serverSynced.rows.length ? serverSynced.rows : serverMappings);
    mappingSyncReadyRef.current = true;
    setAdminplusProductLinks(serverLinks);
    setAdminplusProductLinkDrafts({});
    setAdminplusPriceAlerts(serverAlerts);
    if (Array.isArray(data.operationalFailures)) {
      setOperationalFailures((prev) => {
        const merged = new Map<string, OperationalFailureRow>();
        (data.operationalFailures as OperationalFailureRow[]).forEach((row) => merged.set(row.id, row));
        prev.forEach((row) => merged.set(row.id, row));
        return Array.from(merged.values()).slice(-100);
      });
    }
    if (data.adminplusAutomation) setAdminplusAutomation(normalizeAdminPlusAutomation(data.adminplusAutomation));

    return {
      mappings: uiSynced.rows,
      links: serverLinks,
      alerts: serverAlerts,
      data,
    };
  }

  async function verifyAdminPlusConfirmedPersistence(expectedMapping: MappingRow, expectedLink: AdminPlusProductLink) {
    const serverState = await loadAdminPlusConfirmedStateFromServer();
    const persistedMapping = serverState.mappings.find((row) => row.channel === expectedMapping.channel && row.optionId === expectedMapping.optionId);
    const persistedLink = serverState.links.find((row) => row.id === expectedLink.id && row.accountId === expectedLink.accountId);
    if (!persistedMapping || !persistedLink) throw new Error("서버 재조회에서 확정 매핑을 찾지 못했습니다.");
    if (
      Math.max(1, Number(persistedMapping.baseQty || 1) || 1) !== Math.max(1, Number(expectedMapping.baseQty || 1) || 1) ||
      Math.max(0, Number(persistedMapping.shippingFee || 0) || 0) !== Math.max(0, Number(expectedMapping.shippingFee || 0) || 0) ||
      normalizeOptionPurchaseTimes(persistedMapping.purchaseTime) !== normalizeOptionPurchaseTimes(expectedMapping.purchaseTime) ||
      normalizedVendorName(persistedMapping.vendorName) !== normalizedVendorName(expectedMapping.vendorName) ||
      cleanId(persistedMapping.vendorCode) !== cleanId(expectedMapping.vendorCode) ||
      text(persistedMapping.vendorProductName) !== text(expectedMapping.vendorProductName) ||
      Math.max(1, Number(persistedLink.qty || 1) || 1) !== Math.max(1, Number(expectedLink.qty || 1) || 1) ||
      Math.max(0, Number(persistedLink.shippingFee || 0) || 0) !== Math.max(0, Number(expectedLink.shippingFee || 0) || 0) ||
      normalizeOptionPurchaseTimes(persistedLink.purchaseTime) !== normalizeOptionPurchaseTimes(expectedLink.purchaseTime) ||
      cleanId(persistedLink.productCode) !== cleanId(expectedLink.productCode) ||
      cleanId(persistedLink.optionCode) !== cleanId(expectedLink.optionCode)
    ) {
      throw new Error("서버 재조회 검증에서 업체/상품/발주시간/기본수량/배송비 매핑값이 일치하지 않습니다.");
    }
    return { mapping: persistedMapping, link: persistedLink };
  }

  async function saveAdminPlusProductLinkCost(linkId: string) {
    if (adminplusCatalogBusy) return;
    const link = adminplusProductLinks.find((row) => row.id === linkId);
    if (!link) return;
    const draft = adminPlusProductLinkDraft(link);
    try {
      const mapping = mappings.find((row) => row.channel === link.channel && row.optionId === link.optionId);
      if (!mapping) throw new Error("기존 엑셀 매핑 행을 찾지 못했습니다.");
      if (!link.matchString || !link.productCode) throw new Error("AdminPlus 상품매칭 정보가 없습니다.");
      const parsedTime = parseOptionPurchaseTimes(draft.purchaseTime);
      if (!parsedTime.ok) throw new Error(parsedTime.error);
      const qty = Math.max(1, Number(draft.qty || 1) || 1);
      const shippingFee = Math.max(0, Number(draft.shippingFee || 0) || 0);
      const purchaseTime = parsedTime.normalized;
      setAdminplusCatalogBusy(true);
      setAdminplusWatchSaveState({ status: "saving", message: `${mapping.channel} ${mapping.optionId} 감시기준을 서버에 저장 중입니다.`, savedAt: "" });

      const confirmedQty = Math.max(1, Number(link.qty || 1) || 1);
      const qtyChanged = qty !== confirmedQty;
      if (qtyChanged) {
        const applyResult = await callApi("/api/integrations/adminplus/catalog/matches/apply", {
          accountId: link.accountId,
          confirm: true,
          matchString: link.matchString,
          products: [{ productCode: link.productCode, optionCode: link.optionCode || "", qty }],
        });
        if (applyResult.ok !== true) throw new Error(applyResult.message || "AdminPlus 매칭 수량 재적용 검증에 실패했습니다.");
      }

      const now = new Date().toISOString();
      const nextMapping: MappingRow = { ...mapping, baseQty: qty, shippingFee, purchaseTime, updatedAt: now };
      const nextMappings = mappings.map((row) => row.id === mapping.id ? nextMapping : row);
      const nextLink: AdminPlusProductLink = {
        ...link,
        qty,
        shippingFee,
        purchaseTime,
        baselineConfiguredCost: adminPlusConfiguredCost(link.baselinePrice, qty, shippingFee),
        currentConfiguredCost: adminPlusConfiguredCost(link.currentPrice, qty, shippingFee),
        updatedAt: now,
      };
      const nextLinks = adminplusProductLinks.map((row) => row.id === linkId ? nextLink : row);
      const saveResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: normalizeMappingRows(nextMappings),
          adminplusProductLinks: nextLinks,
          adminplusPriceAlerts: adminplusPriceAlerts.slice(-1000),
        },
      });
      if (saveResult.ok !== true) throw new Error(saveResult.message || "발주시간/기본수량/배송비 서버 저장에 실패했습니다.");

      await verifyAdminPlusConfirmedPersistence(nextMapping, nextLink);
      setAdminplusProductLinkDrafts((prev) => {
        const next = { ...prev };
        delete next[linkId];
        return next;
      });
      resolveOperationalFailureKind("adminplus_watch_save");
      const msg = `${mapping.channel} ${mapping.optionId} 감시기준 서버 저장·재조회 검증 완료 · 발주시간 ${purchaseTime} · 기본수량 ${qty} · 배송비 ${shippingFee.toLocaleString()}원`;
      setAdminplusWatchSaveState({ status: "success", message: msg, savedAt: now });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `자동감시 저장 실패: ${String(error)}`;
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      recordOperationalFailure("adminplus_watch_save", "자동감시", `감시기준 서버 저장 ${link.channel} ${link.optionId}`, error, link.channel);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  function resolveAdminPlusCatalogSelection(
    products: AdminPlusCatalogProduct[],
    productCode: unknown,
    optionCode: unknown,
  ) {
    const productKey = cleanId(productCode);
    const optionKey = cleanId(optionCode);
    const product = products.find((row) => cleanId(row.productCode) === productKey);
    if (!product) return null;
    const option = optionKey
      ? product.options.find((row) => cleanId(row.optionCode) === optionKey)
      : product.options.length === 1
        ? product.options[0]
        : undefined;
    if (optionKey && !option) return null;
    // 기존 B2B 링크에 AdminPlus optionCode가 비어 있어도 상품에 실제 옵션이 하나뿐이면 그 옵션을 자동복구합니다.
    // 옵션이 2개 이상이면 임의 선택하지 않고 undefined를 유지해 사용자가 정확한 옵션을 고르게 합니다.
    return { product, option };
  }

  function confirmedAdminPlusLinkForMapping(
    links: AdminPlusProductLink[],
    mapping: MappingRow,
    account: AdminPlusAccountStatusRow,
  ) {
    const linkId = `${mapping.channel}|${mapping.optionId}`;

    return links.find((row) => {
      if (
        row.id !== linkId ||
        !(
          row.accountId === account.id ||
          normalizedVendorName(row.vendorName) ===
            normalizedVendorName(account.vendorName)
        )
      ) {
        return false;
      }

      const mappingAuthority =
        text(mapping.matchAuthority).toLowerCase();

      const linkAuthority =
        text(row.matchAuthority).toLowerCase();

      const mappingTime =
        Date.parse(
          text(
            mapping.matchConfirmedAt ||
              (!mappingAuthority ? mapping.updatedAt : ""),
          ),
        ) || 0;

      const linkTime =
        Date.parse(
          text(
            row.matchConfirmedAt ||
              (!linkAuthority ? row.updatedAt : ""),
          ),
        ) || 0;

      // 상품매칭이 더 최근이면 과거 API 링크를
      // 자동발주용 확정 링크로 사용하지 않습니다.
      if (mappingTime > linkTime) return false;

      if (
        mappingAuthority === "excel" &&
        linkAuthority !== "api" &&
        mappingTime >= linkTime
      ) {
        return false;
      }

      return true;
    });
  }

  function adminPlusSuggestionMatchesConfirmedValues(
    row: AdminPlusMatchSuggestion,
    mapping: MappingRow | undefined,
    link: AdminPlusProductLink | undefined,
  ) {
    if (!mapping || !link) return false;
    return (
      Math.max(1, Number(row.qty || 1) || 1) === Math.max(1, Number(link.qty || mapping.baseQty || 1) || 1) &&
      Math.max(0, Number(row.shippingFee || 0) || 0) === Math.max(0, Number(mapping.shippingFee ?? link.shippingFee ?? 0) || 0) &&
      normalizeOptionPurchaseTimes(row.purchaseTime) === normalizeOptionPurchaseTimes(mapping.purchaseTime || link.purchaseTime) &&
      cleanId(row.productCode) === cleanId(link.productCode) &&
      cleanId(row.optionCode) === cleanId(link.optionCode)
    );
  }


  async function reconcileAdminPlusLinksToLatestExcel(
    serverMappings: MappingRow[],
    serverLinks: AdminPlusProductLink[],
    serverAlerts: AdminPlusPriceAlert[],
  ) {
    // V255: 확정 AdminPlus 링크가 업체/상품 정체성의 Source-of-Truth입니다.
    // 엑셀 업체명이 과거값과 다르다는 이유만으로 확정 API 링크를 삭제하거나 AdminPlus match를 되돌리지 않습니다.
    // 불일치는 확정 링크 -> mapping 방향으로만 동기화하며, link 삭제는 사용자의 명시적 해제/교체에서만 수행합니다.
    const synced = syncMappingsFromConfirmedAdminPlusLinks(serverMappings, serverLinks);
    if (synced.changed) {
      const saveResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: synced.rows,
          adminplusProductLinks: serverLinks,
          adminplusPriceAlerts: serverAlerts.slice(-1000),
        },
      });
      if (saveResult.ok !== true) throw new Error(saveResult.message || "확정 AdminPlus 링크 → 엑셀매칭 동기화 서버 저장 실패");
      mappingsRef.current = synced.rows;
      setMappings(synced.rows);
    }
    return { links: serverLinks, alerts: serverAlerts, resetCount: 0, deleteFailures: 0 };
  }

  async function searchAllAdminPlusProducts(queryOverride?: string) {
    if (adminplusGlobalSearchBusy) return;
    const query = text(queryOverride === undefined ? adminplusGlobalSearchQuery : queryOverride).trim();
    if (queryOverride !== undefined) setAdminplusGlobalSearchQuery(query);
    if (!query) {
      setAdminplusGlobalSearchRows([]);
      setAdminplusGlobalSearchMessage("검색어를 1글자 이상 입력하세요. 예: 복, 복숭아");
      return;
    }
    try {
      setAdminplusGlobalSearchBusy(true);
      setAdminplusGlobalSearchMessage(`"${query}" 포함 상품을 연결된 전체 업체에서 검색 중입니다.`);
      const result = await callApi("/api/integrations/adminplus/catalog/search", { query, limit: 100, activeUnlimitedOnly: adminplusGlobalSearchActiveUnlimitedOnly });
      const rows = Array.isArray(result.summary?.rows)
        ? result.summary.rows as unknown as AdminPlusGlobalCatalogRow[]
        : [];
      setAdminplusGlobalSearchRows(rows);
      setAdminplusGlobalSearchMessage(
        result.message || `"${query}" 검색 결과 ${rows.length}건`,
      );
    } catch (error) {
      setAdminplusGlobalSearchRows([]);
      setAdminplusGlobalSearchMessage(`전체 상품검색 실패: ${String(error)}`);
    } finally {
      setAdminplusGlobalSearchBusy(false);
    }
  }

  function adminPlusGlobalReplacementKey(row: AdminPlusGlobalCatalogRow) {
    return `${row.accountId}|${row.productCode}`;
  }

  function adminPlusUnlinkedMappings() {
    const linkedIds = new Set(adminplusProductLinks.map((row) => row.id));
    return mappings.filter((mapping) => !linkedIds.has(`${mapping.channel}|${mapping.optionId}`));
  }

  function adminPlusMappingKey(row: Pick<MappingRow, "channel" | "optionId">) {
    return `${parseChannel(row.channel)}|${cleanId(row.optionId)}`;
  }

  function syncMappingsFromConfirmedAdminPlusLinks(
    mappingRows: MappingRow[],
    links: AdminPlusProductLink[],
  ) {
    const linkByKey = new Map(
      links.map((link) => [
        `${parseChannel(link.channel)}|${cleanId(link.optionId)}`,
        link,
      ] as const),
    );

    let changed = false;

    const next = normalizeMappingRows(mappingRows).map((mapping) => {
      const link = linkByKey.get(adminPlusMappingKey(mapping));
      if (!link) return mapping;

      const mappingAuthority = text(mapping.matchAuthority).toLowerCase();
      const linkAuthority = text(link.matchAuthority).toLowerCase();

      const sameIdentity =
        normalizedVendorName(mapping.vendorName) === normalizedVendorName(link.vendorName) &&
        (
          !cleanId(mapping.vendorCode) ||
          !cleanId(link.productCode) ||
          cleanId(mapping.vendorCode) === cleanId(link.productCode)
        ) &&
        (
          !text(mapping.vendorProductName) ||
          !text(link.productName) ||
          normalizeHeader(mapping.vendorProductName) === normalizeHeader(link.productName)
        );

      const mappingTime =
        Date.parse(text(mapping.matchConfirmedAt || mapping.updatedAt)) || 0;

      const linkTime =
        Date.parse(text(link.matchConfirmedAt || link.updatedAt)) || 0;

      let apiWins = false;

      // R5.3: 사용자가 실제로 마지막 확정한 시각이 최우선입니다.
      if (linkTime > mappingTime) apiWins = true;
      else if (mappingTime > linkTime) apiWins = false;
      else if (linkAuthority === "api") apiWins = true;
      else if (mappingAuthority === "excel") apiWins = false;
      else if (mappingAuthority === "api") apiWins = true;
      else apiWins = sameIdentity;

      if (!apiWins) {
        if (!mappingAuthority && !sameIdentity) {
          changed = true;
          return {
            ...mapping,
            matchAuthority: "excel" as const,
            matchConfirmedAt:
              mapping.matchConfirmedAt ||
              mapping.updatedAt ||
              new Date().toISOString(),
          };
        }
        return mapping;
      }

      const vendorName = text(link.vendorName) || mapping.vendorName;
      const vendorCode = text(link.productCode) || mapping.vendorCode;
      const vendorProductName = text(link.productName) || mapping.vendorProductName;

      const confirmedAt =
        text(link.matchConfirmedAt || link.updatedAt) ||
        mapping.matchConfirmedAt ||
        mapping.updatedAt ||
        new Date().toISOString();

      changed = true;

      return {
        ...mapping,
        vendorName,
        vendorCode,
        vendorProductName,
        matchAuthority: "api" as const,
        matchConfirmedAt: confirmedAt,
        updatedAt: text(link.updatedAt) || mapping.updatedAt || confirmedAt,
      };
    });

    return { rows: normalizeMappingRows(next), changed };
  }


  function syncAdminPlusLinksFromLatestMappings(
    mappingRows: MappingRow[],
    links: AdminPlusProductLink[],
  ) {
    const mappingByKey = new Map(
      normalizeMappingRows(mappingRows).map((mapping) => [
        adminPlusMappingKey(mapping),
        mapping,
      ] as const),
    );

    let changed = false;

    const removedLinks: AdminPlusProductLink[] = [];

    const nextLinks = links.flatMap((link) => {
      const mapping = mappingByKey.get(
        `${parseChannel(link.channel)}|${cleanId(link.optionId)}`,
      );

      if (!mapping) return [link];

      const mappingAuthority =
        text(mapping.matchAuthority).toLowerCase();

      const linkAuthority =
        text(link.matchAuthority).toLowerCase();

      const mappingTime =
        Date.parse(
          text(
            mapping.matchConfirmedAt ||
              (!mappingAuthority ? mapping.updatedAt : ""),
          ),
        ) || 0;

      const linkTime =
        Date.parse(
          text(
            link.matchConfirmedAt ||
              (!linkAuthority ? link.updatedAt : ""),
          ),
        ) || 0;

      const mappingWins =
        mappingTime > linkTime ||
        (
          mappingTime === linkTime &&
          mappingAuthority === "excel" &&
          linkAuthority !== "api"
        );

      if (!mappingWins) return [link];

      const rule =
        adminPlusRuleForVendor(mapping.vendorName);

      const sameVendor =
        Boolean(rule?.accountId) &&
        (
          link.accountId === rule?.accountId ||
          normalizedVendorName(link.vendorName) ===
            normalizedVendorName(mapping.vendorName)
        );

      const sameProduct =
        Boolean(cleanId(mapping.vendorCode)) &&
        cleanId(mapping.vendorCode) ===
          cleanId(link.productCode) &&
        normalizeHeader(mapping.vendorProductName) ===
          normalizeHeader(link.productName);

      // 실제 API 상품과 최신 상품매칭이 정확히 같으면
      // 기존 확정링크를 유지합니다.
      if (sameVendor && sameProduct) {
        const confirmedAt =
          text(mapping.matchConfirmedAt) ||
          link.matchConfirmedAt ||
          new Date().toISOString();

        const nextLink: AdminPlusProductLink = {
          ...link,

          vendorName: mapping.vendorName,

          accountId:
            rule?.accountId ||
            link.accountId,

          qty: Math.max(
            1,
            Number(mapping.baseQty || link.qty || 1) || 1,
          ),

          shippingFee: Math.max(
            0,
            Number(
              mapping.shippingFee ??
                link.shippingFee ??
                0,
            ) || 0,
          ),

          purchaseTime:
            normalizeOptionPurchaseTimes(
              mapping.purchaseTime ||
                link.purchaseTime,
            ),

          matchAuthority: "excel" as const,
          matchConfirmedAt: confirmedAt,
          updatedAt: confirmedAt,
        };

        const differs =
          nextLink.vendorName !== link.vendorName ||
          nextLink.accountId !== link.accountId ||
          nextLink.qty !== link.qty ||
          nextLink.shippingFee !== link.shippingFee ||
          nextLink.purchaseTime !== link.purchaseTime ||
          nextLink.matchAuthority !== link.matchAuthority ||
          nextLink.matchConfirmedAt !== link.matchConfirmedAt;

        if (differs) changed = true;

        return [nextLink];
      }

      // R5.3.1:
      // 최신 상품매칭과 기존 API 상품이 다르면
      // stale API 링크를 보존하지 않고 완전히 미연결로 전환합니다.
      removedLinks.push(link);
      changed = true;

      return [];
    });

    return {
      rows: normalizeAdminPlusServerLinks(nextLinks),
      removedLinks,
      changed,
    };
  }

  function updateMappingForAdminPlusSelection(mapping: MappingRow, selected: AdminPlusGlobalCatalogRow, now: string) {
    const key = adminPlusMappingKey(mapping);
    const duplicates = mappings.filter((row) => adminPlusMappingKey(row) === key);
    if (duplicates.length > 1) throw new Error(`${key} 중복 매핑 ${duplicates.length}건이 있습니다. 기존 중복을 먼저 정리하세요.`);
    const nextMapping: MappingRow = {
      ...mapping,
      vendorName: selected.vendorName || mapping.vendorName,
      vendorCode: selected.productCode || mapping.vendorCode,
      vendorProductName: selected.name || mapping.vendorProductName,
      // 옵션ID/기본수량/배송비/발주시간/기준단가는 기존 엑셀 기준값을 유지합니다.
      matchAuthority: "api" as const,
      matchConfirmedAt: now,
      updatedAt: now,
    };
    const nextMappings = normalizeMappingRows(mappings.map((row) => adminPlusMappingKey(row) === key ? nextMapping : row));
    if (nextMappings.filter((row) => adminPlusMappingKey(row) === key).length !== 1) throw new Error(`${key} 확정 매핑을 1건으로 유지하지 못했습니다.`);
    return { nextMapping, nextMappings };
  }

  function openAdminPlusGlobalEnrollment(mappingId: string) {
    const mapping = mappings.find((row) => row.id === mappingId);
    if (!mapping) return;
    setAdminplusReplacementTargetLinkId("");
    setAdminplusEnrollmentTargetMappingId(mappingId);
    setAdminplusGlobalReplacementOptionCodes({});
    setAdminplusGlobalSearchRows([]);
    setAdminplusGlobalSearchQuery("");
    setAdminplusGlobalSearchMessage(`편입 대상 ${mapping.channel} ${mapping.optionId} · 엑셀 ${mapping.vendorName} / ${mapping.vendorProductName || "상품명 없음"}. 자동검색하지 않습니다. 검색어를 직접 입력한 뒤 전체 업체 상품검색을 눌러 연결할 상품을 선택하세요.`);
    setMappingWorkspaceView("catalogSearch");
  }

  async function enrollAdminPlusProductLinkFromGlobal(row: AdminPlusGlobalCatalogRow) {
    if (adminplusGlobalSearchBusy || adminplusCatalogBusy) return;
    const mapping = mappings.find((item) => item.id === adminplusEnrollmentTargetMappingId);
    if (!mapping) {
      setAdminplusGlobalSearchMessage("AdminPlus에 편입할 미연결 엑셀매핑을 먼저 선택하세요.");
      return;
    }
    const linkId = `${mapping.channel}|${mapping.optionId}`;
    if (adminplusProductLinks.some((item) => item.id === linkId)) {
      setAdminplusGlobalSearchMessage("이미 AdminPlus에 연결된 옵션ID입니다. 감시화면에서 업체·AdminPlus 상품 교체를 사용하세요.");
      return;
    }
    try {
      const optionKey = adminPlusGlobalReplacementKey(row);
      const selectedOptionCode = cleanId(adminplusGlobalReplacementOptionCodes[optionKey]);
      const selectedOption = selectedOptionCode
        ? row.options.find((option) => cleanId(option.optionCode) === selectedOptionCode)
        : row.options.length === 1
          ? row.options[0]
          : undefined;
      if (row.options.length > 1 && !selectedOption) throw new Error("선택한 AdminPlus 상품에 옵션이 여러 개입니다. 편입할 옵션을 선택하세요.");
      const parsedTime = parseOptionPurchaseTimes(mapping.purchaseTime);
      if (!parsedTime.ok) throw new Error(parsedTime.error);
      const matchString = adminPlusOptionScopedMatchString(mapping);
      if (!matchString) throw new Error("AdminPlus 매칭 문자열을 확인할 수 없습니다.");

      const qty = Math.max(1, Number(mapping.baseQty || 1) || 1);
      const shippingFee = Math.max(0, Number(mapping.shippingFee || 0) || 0);
      const purchaseTime = parsedTime.normalized;

      setAdminplusCatalogBusy(true);
      setAdminplusGlobalSearchMessage(`${row.vendorName} · ${row.productCode} ${row.name}으로 신규 편입 저장·검증 중입니다.`);
      setAdminplusWatchSaveState({ status: "saving", message: `${mapping.channel} ${mapping.optionId} 미연결 엑셀매핑을 AdminPlus에 편입 중입니다.`, savedAt: "" });

      const applyResult = await callApi("/api/integrations/adminplus/catalog/matches/apply", {
        accountId: row.accountId,
        confirm: true,
        matchString,
        products: [{ productCode: row.productCode, optionCode: selectedOption?.optionCode || "", qty }],
      });
      if (applyResult.ok !== true) throw new Error(applyResult.message || "AdminPlus 신규 상품매칭 저장 후 검증에 실패했습니다.");

      const resolvedOptionCode = cleanId(selectedOption?.optionCode) || cleanId(applyResult.summary?.resolvedOptionCode);
      const resolvedOption = resolvedOptionCode
        ? row.options.find((option) => cleanId(option.optionCode) === resolvedOptionCode)
        : undefined;
      const now = new Date().toISOString();
      const { nextMapping, nextMappings } = updateMappingForAdminPlusSelection(mapping, row, now);
      const baselinePrice = Math.max(0, Number(mapping.cost || 0) || 0);
      const currentPrice = Math.max(0, Number(row.price || 0) || 0);
      const link: AdminPlusProductLink = {
        id: linkId,
        channel: mapping.channel,
        optionId: mapping.optionId,
        vendorName: row.vendorName || mapping.vendorName,
        accountId: row.accountId,
        matchString,
        productCode: row.productCode,
        optionCode: resolvedOptionCode,
        productName: row.name,
        optionName: resolvedOption?.optionName || selectedOption?.optionName || "",
        qty,
        shippingFee,
        purchaseTime,
        baselinePrice,
        currentPrice,
        baselineConfiguredCost: adminPlusConfiguredCost(baselinePrice, qty, shippingFee),
        currentConfiguredCost: adminPlusConfiguredCost(currentPrice, qty, shippingFee),
        priceStatus: baselinePrice > 0 && baselinePrice !== currentPrice ? "변동" : "정상",
        lastCheckedAt: now,
        priceChangedAt: baselinePrice > 0 && baselinePrice !== currentPrice ? now : "",
        matchAuthority: "api" as const,
        matchConfirmedAt: now,
        updatedAt: now,
      };
      const nextLinks = [...adminplusProductLinks.filter((item) => item.id !== linkId), link];
      const saveResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: nextMappings,
          adminplusProductLinks: nextLinks,
          adminplusPriceAlerts: adminplusPriceAlerts.slice(-1000),
        },
      });
      if (saveResult.ok !== true) throw new Error(saveResult.message || "AdminPlus 신규 편입 서버 저장에 실패했습니다.");

      await verifyAdminPlusConfirmedPersistence(nextMapping, link);
      resolveOperationalFailureKind("adminplus_watch_save");
      const msg = `${mapping.channel} ${mapping.optionId} · 기존 옵션ID 매핑 갱신 · AdminPlus 신규 편입 완료: ${link.vendorName} / ${link.productCode} ${link.productName}${link.optionName ? ` / ${link.optionName}` : ""}`;
      setAdminplusWatchSaveState({ status: "success", message: msg, savedAt: now });
      setAdminplusCatalogMessage(msg);
      setAdminplusGlobalSearchMessage(msg);
      setMessage(msg);
      setAdminplusEnrollmentTargetMappingId("");
      setMappingWorkspaceView("adminplus");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const msg = `AdminPlus 신규 편입 실패: ${detail}`;
      setAdminplusGlobalSearchMessage(msg);
      setAdminplusCatalogMessage(msg);
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setMessage(msg);
      recordOperationalFailure("adminplus_watch_save", "API 매핑", `미연결 AdminPlus 편입 ${mapping.channel} ${mapping.optionId}`, error, mapping.channel);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  function openAdminPlusGlobalReplacement(linkId: string) {
    const link = adminplusProductLinks.find((row) => row.id === linkId);
    if (!link) return;
    if (adminplusProductLinkDrafts[linkId]) {
      const msg = "미저장 발주시간/기본수량/배송비 수정이 있습니다. 먼저 감시기준 저장을 완료한 뒤 업체·AdminPlus 상품을 교체하세요.";
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      return;
    }
    const mapping = mappings.find((row) => row.channel === link.channel && row.optionId === link.optionId);
    setAdminplusEnrollmentTargetMappingId("");
    setAdminplusReplacementTargetLinkId(linkId);
    setAdminplusGlobalReplacementOptionCodes({});
    setAdminplusGlobalSearchRows([]);
    setAdminplusGlobalSearchQuery("");
    setAdminplusGlobalSearchMessage(`교체 대상 ${link.channel} ${link.optionId} · ${link.vendorName} / ${link.productCode} ${link.productName}. 자동검색하지 않습니다. 검색어를 직접 입력한 뒤 전체 업체 상품검색을 눌러 새 업체·상품을 선택하세요.`);
    setMappingWorkspaceView("catalogSearch");
  }

  async function replaceAdminPlusProductLinkFromGlobal(row: AdminPlusGlobalCatalogRow) {
    if (adminplusGlobalSearchBusy || adminplusCatalogBusy) return;
    const link = adminplusProductLinks.find((item) => item.id === adminplusReplacementTargetLinkId);
    if (!link) {
      setAdminplusGlobalSearchMessage("교체할 공급가 감시 행을 먼저 선택하세요.");
      return;
    }
    if (adminplusProductLinkDrafts[link.id]) {
      setAdminplusGlobalSearchMessage("미저장 발주시간/기본수량/배송비 수정이 있습니다. 감시화면에서 먼저 저장하세요.");
      return;
    }
    try {
      const mapping = mappings.find((item) => item.channel === link.channel && item.optionId === link.optionId);
      if (!mapping) throw new Error("기존 엑셀매핑 행을 찾지 못했습니다.");
      const optionKey = adminPlusGlobalReplacementKey(row);
      const selectedOptionCode = cleanId(adminplusGlobalReplacementOptionCodes[optionKey]);
      const selectedOption = selectedOptionCode
        ? row.options.find((option) => cleanId(option.optionCode) === selectedOptionCode)
        : row.options.length === 1
          ? row.options[0]
          : undefined;
      if (row.options.length > 1 && !selectedOption) throw new Error("선택한 AdminPlus 상품에 옵션이 여러 개입니다. 교체할 옵션을 선택하세요.");
      const parsedTime = parseOptionPurchaseTimes(link.purchaseTime);
      if (!parsedTime.ok) throw new Error(parsedTime.error);
      const matchString = text(link.matchString) || adminPlusOptionScopedMatchString(mapping);
      if (!matchString) throw new Error("AdminPlus 매칭 문자열을 확인할 수 없습니다.");

      setAdminplusCatalogBusy(true);
      setAdminplusGlobalSearchMessage(`${row.vendorName} · ${row.productCode} ${row.name}으로 교체 저장·검증 중입니다.`);
      setAdminplusWatchSaveState({ status: "saving", message: `${link.channel} ${link.optionId} AdminPlus 업체·상품 교체를 서버에 저장 중입니다.`, savedAt: "" });

      const applyResult = await callApi("/api/integrations/adminplus/catalog/matches/apply", {
        accountId: row.accountId,
        confirm: true,
        matchString,
        products: [{ productCode: row.productCode, optionCode: selectedOption?.optionCode || "", qty: Math.max(1, Number(link.qty || 1) || 1) }],
      });
      if (applyResult.ok !== true) throw new Error(applyResult.message || "새 AdminPlus 업체 상품매칭 저장 후 검증에 실패했습니다.");

      const resolvedOptionCode = cleanId(selectedOption?.optionCode) || cleanId(applyResult.summary?.resolvedOptionCode);
      const resolvedOption = resolvedOptionCode
        ? row.options.find((option) => cleanId(option.optionCode) === resolvedOptionCode)
        : undefined;
      const now = new Date().toISOString();
      const { nextMapping, nextMappings } = updateMappingForAdminPlusSelection(mapping, row, now);
      const baselinePrice = Math.max(0, Number(link.baselinePrice || 0) || 0);
      const qty = Math.max(1, Number(link.qty || 1) || 1);
      const shippingFee = Math.max(0, Number(link.shippingFee || 0) || 0);
      const nextLink: AdminPlusProductLink = {
        ...link,
        vendorName: row.vendorName || link.vendorName,
        accountId: row.accountId,
        matchString,
        productCode: row.productCode,
        optionCode: resolvedOptionCode,
        productName: row.name,
        optionName: resolvedOption?.optionName || selectedOption?.optionName || "",
        currentPrice: Math.max(0, Number(row.price || 0) || 0),
        baselineConfiguredCost: adminPlusConfiguredCost(baselinePrice, qty, shippingFee),
        currentConfiguredCost: adminPlusConfiguredCost(Math.max(0, Number(row.price || 0) || 0), qty, shippingFee),
        priceStatus: baselinePrice > 0 && baselinePrice !== Number(row.price || 0) ? "변동" : "정상",
        lastCheckedAt: now,
        priceChangedAt: baselinePrice > 0 && baselinePrice !== Number(row.price || 0) ? now : "",
        matchAuthority: "api" as const,
        matchConfirmedAt: now,
        updatedAt: now,
      };
      const nextLinks = adminplusProductLinks.map((item) => item.id === link.id ? nextLink : item);
      const nextAlerts = adminplusPriceAlerts.map((alert) => alert.linkId === link.id && !alert.acknowledgedAt ? { ...alert, acknowledgedAt: now } : alert);
      const saveResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: nextMappings,
          adminplusProductLinks: nextLinks,
          adminplusPriceAlerts: nextAlerts.slice(-1000),
        },
      });
      if (saveResult.ok !== true) throw new Error(saveResult.message || "교체된 AdminPlus 업체·상품 서버 저장에 실패했습니다.");

      await verifyAdminPlusConfirmedPersistence(nextMapping, nextLink);
      resolveOperationalFailureKind("adminplus_watch_save");
      const msg = `${link.channel} ${link.optionId} · 기존 옵션ID 매핑 갱신 · AdminPlus 교체 완료: ${nextLink.vendorName} / ${nextLink.productCode} ${nextLink.productName}${nextLink.optionName ? ` / ${nextLink.optionName}` : ""} · 현재단가 ${nextLink.currentPrice.toLocaleString()}원`;
      setAdminplusWatchSaveState({ status: "success", message: msg, savedAt: now });
      setAdminplusCatalogMessage(msg);
      setAdminplusGlobalSearchMessage(msg);
      setMessage(msg);
      setAdminplusReplacementTargetLinkId("");
      setMappingWorkspaceView("adminplus");
    } catch (error) {
      const msg = `AdminPlus 업체·상품 교체 실패: ${String(error)}`;
      setAdminplusGlobalSearchMessage(msg);
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      const link = adminplusProductLinks.find((item) => item.id === adminplusReplacementTargetLinkId);
      recordOperationalFailure("adminplus_watch_save", "API 매핑", `AdminPlus 업체·상품 교체 ${link?.channel || ""} ${link?.optionId || ""}`.trim(), error, link?.channel);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  async function loadAdminPlusExcelMatchSuggestions() {
    if (adminplusCatalogBusy) return;
    try {
      const account = adminplusAccounts.find((row) => row.id === adminplusCatalogAccountId);
      if (!account) throw new Error("어드민플러스 계정을 먼저 선택하세요.");
      setAdminplusCatalogBusy(true);
      setAdminplusCatalogMessage("서버의 확정 매핑을 먼저 불러온 뒤 AdminPlus 실제 매칭과 비교하고 있습니다.");
      const serverState = await loadAdminPlusConfirmedStateFromServer({ preserveLocalMappings: true });
      const latestExcelMappings = mappingsRef.current;
      const excelPriority = await reconcileAdminPlusLinksToLatestExcel(
        latestExcelMappings,
        serverState.links,
        serverState.alerts,
      );
      const confirmedMappings = latestExcelMappings;
      const confirmedLinks = excelPriority.links;

      const [catalogResult, matchResult] = await Promise.all([
        callApi("/api/integrations/adminplus/catalog/products", { accountId: account.id, limit: 500 }),
        callApi("/api/integrations/adminplus/catalog/matches/list", { accountId: account.id }),
      ]);
      const products = Array.isArray(catalogResult.summary?.rows)
        ? catalogResult.summary?.rows as unknown as AdminPlusCatalogProduct[]
        : [];
      const matchRows = Array.isArray(matchResult.summary?.rows)
        ? matchResult.summary?.rows as unknown as AdminPlusMatchListRow[]
        : [];
      setAdminplusCatalogProducts(products);

      const accountMappings = confirmedMappings.filter(
        (row) => normalizedVendorName(row.vendorName) === normalizedVendorName(account.vendorName),
      );
      const exactMatchMap = new Map<string, AdminPlusMatchListRow>();
      matchRows.forEach((row) => {
        const key = normalizeHeader(row.match_string || "");
        if (key && !exactMatchMap.has(key)) exactMatchMap.set(key, row);
      });
      const confirmedByMatchString = new Map<string, AdminPlusProductLink>();
      confirmedLinks
        .filter((row) => row.accountId === account.id || normalizedVendorName(row.vendorName) === normalizedVendorName(account.vendorName))
        .forEach((row) => {
          const key = normalizeHeader(row.matchString);
          if (key && !confirmedByMatchString.has(key)) confirmedByMatchString.set(key, row);
        });

      const recoveredLinks: AdminPlusProductLink[] = [];
      const recoveredLinkIds = new Set<string>();
      const recoveryNow = new Date().toISOString();
      const queueRecoveredLink = (mapping: MappingRow, selected: { product: AdminPlusCatalogProduct; option?: AdminPlusCatalogOption }, matchString: string, qty: number, prior?: AdminPlusProductLink) => {
        const id = `${mapping.channel}|${mapping.optionId}`;
        if (recoveredLinkIds.has(id)) return;
        recoveredLinkIds.add(id);
        recoveredLinks.push({
          id,
          channel: mapping.channel,
          optionId: mapping.optionId,
          vendorName: mapping.vendorName,
          accountId: account.id,
          matchString,
          productCode: selected.product.productCode,
          optionCode: selected.option?.optionCode || "",
          productName: selected.product.name,
          optionName: selected.option?.optionName || "",
          qty: Math.max(1, qty),
          shippingFee: Math.max(0, Number(mapping.shippingFee ?? prior?.shippingFee ?? 0) || 0),
          purchaseTime: normalizeOptionPurchaseTimes(mapping.purchaseTime || prior?.purchaseTime),
          baselinePrice: Number(prior?.baselinePrice ?? selected.product.price) || selected.product.price,
          currentPrice: selected.product.price,
          baselineConfiguredCost: adminPlusConfiguredCost(Number(prior?.baselinePrice ?? selected.product.price) || selected.product.price, Math.max(1, qty), Math.max(0, Number(mapping.shippingFee ?? prior?.shippingFee ?? 0) || 0)),
          currentConfiguredCost: adminPlusConfiguredCost(selected.product.price, Math.max(1, qty), Math.max(0, Number(mapping.shippingFee ?? prior?.shippingFee ?? 0) || 0)),
          priceStatus: prior?.priceStatus || "정상",
          lastCheckedAt: prior?.lastCheckedAt || recoveryNow,
          priceChangedAt: prior?.priceChangedAt || "",
          updatedAt: recoveryNow,
        });
      };

      const suggestions: AdminPlusMatchSuggestion[] = accountMappings.map((mapping) => {
        const base: AdminPlusMatchSuggestion = {
          id: `${account.id}|${mapping.id}`,
          mappingId: mapping.id,
          channel: mapping.channel,
          optionId: mapping.optionId,
          vendorName: mapping.vendorName,
          vendorCode: mapping.vendorCode,
          vendorProductName: mapping.vendorProductName,
          accountId: account.id,
          matchString: adminPlusOptionScopedMatchString(mapping),
          productCode: "",
          optionCode: "",
          productName: "",
          optionName: "",
          qty: Math.max(1, Number(mapping.baseQty || 1) || 1),
          shippingFee: Math.max(0, Number(mapping.shippingFee || 0) || 0),
          purchaseTime: normalizeOptionPurchaseTimes(mapping.purchaseTime),
          price: 0,
          configuredCost: Math.max(0, Number(mapping.shippingFee || 0) || 0),
          source: "없음",
          reason: "자동으로 확정할 연결정보를 찾지 못했습니다. 검색으로 상품을 선택하세요.",
          status: "검색필요",
          needsWrite: true,
          excelBaselinePrice: Math.max(0, Number(mapping.cost || 0) || 0),
        };

        const scopedMatchString = adminPlusOptionScopedMatchString(mapping);
        const sharedVendorProductMappings = accountMappings.filter((row) =>
          normalizeHeader(row.vendorProductName) === normalizeHeader(mapping.vendorProductName),
        );
        const alreadyLinked = confirmedAdminPlusLinkForMapping(confirmedLinks, mapping, account);
        const excelBaselinePrice = Math.max(0, Number(mapping.cost || 0) || 0);
        if (alreadyLinked) {
          const selected = resolveAdminPlusCatalogSelection(products, alreadyLinked.productCode, alreadyLinked.optionCode);
          const priorProductName = selected?.product.name || alreadyLinked.productName;
          const priorOptionName = selected?.option?.optionName || alreadyLinked.optionName || "";
          const excelProductChanged = Boolean(
            text(mapping.vendorProductName) &&
            normalizeHeader(mapping.vendorProductName) !== normalizeHeader(priorProductName)
          );
          const excelBaselineChanged = excelBaselinePrice > 0 &&
            Number(alreadyLinked.baselinePrice || 0) !== excelBaselinePrice;

          if (!excelProductChanged) {
            if (selected && alreadyLinked.accountId !== account.id) {
              queueRecoveredLink(mapping, selected, alreadyLinked.matchString || text(mapping.vendorProductName), Math.max(1, Number(alreadyLinked.qty || mapping.baseQty || 1) || 1), alreadyLinked);
            }
            const expectedQty = Math.max(1, Number(mapping.baseQty || 1) || 1);
            const linkedQty = Math.max(1, Number(alreadyLinked.qty || 1) || 1);
            const sameProductMappings = accountMappings.filter((row) => normalizeHeader(row.vendorProductName) === normalizeHeader(mapping.vendorProductName));
            const legacySharedMatch = sameProductMappings.length > 1 &&
              normalizeHeader(alreadyLinked.matchString) === normalizeHeader(mapping.vendorProductName);
            const liveLegacyMatch = legacySharedMatch ? exactMatchMap.get(normalizeHeader(mapping.vendorProductName)) : undefined;
            const liveProducts = Array.isArray(liveLegacyMatch?.products) ? liveLegacyMatch.products : [];
            const liveQty = liveProducts.length === 1 ? Math.max(1, Number(liveProducts[0]?.qty || 1) || 1) : 0;
            const needsOptionScopedMigration = linkedQty !== expectedQty || (legacySharedMatch && liveQty !== expectedQty);
            const needsReconfirm = needsOptionScopedMigration || excelBaselineChanged;
            const currentUnitPrice = Number(selected?.product.price ?? alreadyLinked.currentPrice ?? alreadyLinked.baselinePrice ?? 0) || 0;
            const changes = [
              needsOptionScopedMigration ? "기본수량/옵션별 매칭 재확정" : "",
              excelBaselineChanged ? `기준단가 ${Number(alreadyLinked.baselinePrice || 0).toLocaleString()}원 → ${excelBaselinePrice.toLocaleString()}원` : "",
            ].filter(Boolean);
            return {
              ...base,
              matchString: needsOptionScopedMigration ? scopedMatchString : alreadyLinked.matchString,
              productCode: selected?.product.productCode || alreadyLinked.productCode,
              optionCode: selected?.option?.optionCode || alreadyLinked.optionCode || "",
              productName: priorProductName,
              optionName: priorOptionName,
              qty: expectedQty,
              shippingFee: Math.max(0, Number(mapping.shippingFee ?? alreadyLinked.shippingFee ?? 0) || 0),
              purchaseTime: normalizeOptionPurchaseTimes(mapping.purchaseTime || alreadyLinked.purchaseTime),
              price: currentUnitPrice,
              configuredCost: adminPlusConfiguredCost(currentUnitPrice, expectedQty, Math.max(0, Number(mapping.shippingFee ?? alreadyLinked.shippingFee ?? 0) || 0)),
              source: "기존 확정매칭 재사용",
              reason: needsReconfirm
                ? `최신 엑셀 기준값이 현재 서버 확정값과 달라 재확정이 필요합니다. ${changes.join(" · ")}`
                : "최신 엑셀과 현재 서버 확정매핑이 일치합니다.",
              status: needsReconfirm ? "확정가능" : "확정됨",
              needsWrite: needsReconfirm,
              changeSummary: needsReconfirm ? changes.join(" · ") : "변경 없음",
              priorProductName,
              priorOptionName,
              priorBaselinePrice: Number(alreadyLinked.baselinePrice || 0) || 0,
              excelBaselinePrice,
            };
          }

          base.changeSummary = `상품변경: ${priorProductName || "기존상품"} → ${mapping.vendorProductName}`;
          base.priorProductName = priorProductName;
          base.priorOptionName = priorOptionName;
          base.priorBaselinePrice = Number(alreadyLinked.baselinePrice || 0) || 0;
          base.excelBaselinePrice = excelBaselinePrice;
          base.reason = "같은 옵션ID의 최신 엑셀 상품명이 변경되었습니다. 과거 확정상품과 과거 옵션코드를 재사용하지 않고 최신 AdminPlus 상품/옵션으로 다시 추천·확정합니다.";
        }

        const matchKey = normalizeHeader(mapping.vendorProductName);
        const existingMatch = exactMatchMap.get(matchKey);
        if (existingMatch) {
          const rawProducts = Array.isArray(existingMatch.products) ? existingMatch.products : [];
          const complex = existingMatch.is_temp === true || Number(existingMatch.product_count || rawProducts.length || 0) !== 1 || rawProducts.length !== 1;
          if (complex) {
            return {
              ...base,
              source: "기존 AdminPlus 매칭",
              reason: existingMatch.is_temp === true
                ? "AdminPlus에 임시매칭으로 등록되어 있어 상품 지정이 필요합니다."
                : "AdminPlus에 여러 상품이 연결된 1:N 복합매칭이 있어 자동 확정하지 않습니다.",
              status: existingMatch.is_temp === true ? "검색필요" : "복합매칭확인",
              needsWrite: false,
            };
          }
          const raw = rawProducts[0];
          const selected = resolveAdminPlusCatalogSelection(products, raw?.product_code, raw?.option_code);
          if (selected) {
            const actualQty = Math.max(1, Number(raw?.qty || 1) || 1);
            const expectedQty = Math.max(1, Number(mapping.baseQty || 1) || 1);
            if (actualQty === expectedQty && sharedVendorProductMappings.length === 1) {
              // 단 하나의 옵션만 이 업체상품명을 사용하는 경우에는 기존 AdminPlus 매칭을 그대로 안전하게 복구합니다.
              queueRecoveredLink(mapping, selected, text(existingMatch.match_string) || text(mapping.vendorProductName), expectedQty);
              return {
                ...base,
                matchString: text(existingMatch.match_string) || text(mapping.vendorProductName),
                productCode: selected.product.productCode,
                optionCode: selected.option?.optionCode || "",
                productName: selected.product.name,
                optionName: selected.option?.optionName || "",
                qty: expectedQty,
                shippingFee: Math.max(0, Number(mapping.shippingFee || 0) || 0),
                price: selected.product.price,
                configuredCost: adminPlusConfiguredCost(selected.product.price, expectedQty, Math.max(0, Number(mapping.shippingFee || 0) || 0)),
                source: "기존 AdminPlus 매칭",
                reason: "AdminPlus 실제 1:1 매칭과 엑셀 옵션 기본수량이 일치합니다. 누락된 B2B 확정 링크만 자동 복구합니다.",
                status: "확정됨",
                needsWrite: false,
              };
            }
            return {
              ...base,
              productCode: selected.product.productCode,
              optionCode: selected.option?.optionCode || "",
              productName: selected.product.name,
              optionName: selected.option?.optionName || "",
              qty: expectedQty,
              shippingFee: Math.max(0, Number(mapping.shippingFee || 0) || 0),
              price: selected.product.price,
              configuredCost: adminPlusConfiguredCost(selected.product.price, expectedQty, Math.max(0, Number(mapping.shippingFee || 0) || 0)),
              source: "기존 AdminPlus 매칭",
              reason: sharedVendorProductMappings.length > 1
                ? `같은 업체상품명을 ${sharedVendorProductMappings.length}개 옵션ID가 공유합니다. 엑셀 옵션ID ${mapping.optionId}·기본수량 ${expectedQty}을 독립 보존하도록 옵션별 B2B 매칭으로 전환한 뒤 확정합니다.`
                : `기존 AdminPlus 수량 ${actualQty}개와 엑셀 기본수량 ${expectedQty}개가 다릅니다. 상품은 그대로 두고 엑셀 기본수량을 기준으로 수정 확정합니다.`,
              status: "확정가능",
              needsWrite: true,
            };
          }
        }

        const confirmed = confirmedByMatchString.get(matchKey);
        if (confirmed) {
          const selected = resolveAdminPlusCatalogSelection(products, confirmed.productCode, confirmed.optionCode);
          if (selected) {
            return {
              ...base,
              productCode: selected.product.productCode,
              optionCode: selected.option?.optionCode || "",
              productName: selected.product.name,
              optionName: selected.option?.optionName || "",
              matchString: scopedMatchString,
              qty: Math.max(1, Number(mapping.baseQty || 1) || 1),
              shippingFee: Math.max(0, Number(mapping.shippingFee ?? confirmed.shippingFee ?? 0) || 0),
              price: selected.product.price,
              configuredCost: adminPlusConfiguredCost(selected.product.price, Math.max(1, Number(mapping.baseQty || 1) || 1), Math.max(0, Number(mapping.shippingFee ?? confirmed.shippingFee ?? 0) || 0)),
              source: "기존 확정매칭 재사용",
              reason: `같은 상품/옵션 선택은 재사용하되, 엑셀 옵션ID ${mapping.optionId}·기본수량 ${Math.max(1, Number(mapping.baseQty || 1) || 1)}을 독립 매칭으로 확정합니다.`,
              status: "확정가능",
              needsWrite: true,
            };
          }
        }

        const historicalSameProductLinks = confirmedLinks.filter((link) =>
          normalizedVendorName(link.vendorName) === normalizedVendorName(mapping.vendorName) &&
          normalizeHeader(link.productName) === normalizeHeader(mapping.vendorProductName),
        );
        const uniqueHistoricalSelections = Array.from(new Map(
          historicalSameProductLinks
            .filter((link) => text(link.productCode))
            .map((link) => [`${cleanId(link.productCode)}|${cleanId(link.optionCode)}`, link]),
        ).values());
        if (uniqueHistoricalSelections.length === 1) {
          const prior = uniqueHistoricalSelections[0];
          const selected = resolveAdminPlusCatalogSelection(products, prior.productCode, prior.optionCode);
          if (selected) {
            const reuseQty = Math.max(1, Number(mapping.baseQty || prior.qty || 1) || 1);
            const reuseFee = Math.max(0, Number(mapping.shippingFee ?? prior.shippingFee ?? 0) || 0);
            return {
              ...base,
              productCode: selected.product.productCode,
              optionCode: selected.option?.optionCode || "",
              productName: selected.product.name,
              optionName: selected.option?.optionName || "",
              matchString: scopedMatchString,
              qty: reuseQty,
              shippingFee: reuseFee,
              price: selected.product.price,
              configuredCost: adminPlusConfiguredCost(selected.product.price, reuseQty, reuseFee),
              source: "기존 동일상품 매핑 재사용",
              reason: `같은 업체에서 이전에 확정한 동일 AdminPlus 상품/옵션을 새 엑셀 옵션ID ${mapping.optionId}의 후보로 재사용합니다. 엑셀 기본수량을 우선 적용하고 확인 후 확정하세요.`,
              status: "확정가능",
              needsWrite: true,
            };
          }
        }

        const vendorCode = cleanId(mapping.vendorCode);
        if (vendorCode) {
          const codeMatches = products.filter((row) => cleanId(row.productCode) === vendorCode);
          if (codeMatches.length === 1 && codeMatches[0].options.length === 0) {
            const product = codeMatches[0];
            return {
              ...base,
              productCode: product.productCode,
              productName: product.name,
              price: product.price,
              configuredCost: adminPlusConfiguredCost(product.price, base.qty, base.shippingFee),
              source: "업체상품코드 일치",
              reason: "엑셀 업체상품코드와 AdminPlus 상품코드가 정확히 일치합니다. 확인 후 확정하세요.",
              status: "확정가능",
              needsWrite: true,
            };
          }
        }

        const normalizedProductName = normalizeHeader(mapping.vendorProductName);
        if (normalizedProductName) {
          const nameMatches = products.filter((row) => normalizeHeader(row.name) === normalizedProductName);
          if (nameMatches.length === 1 && nameMatches[0].options.length <= 1) {
            const product = nameMatches[0];
            const soleOption = product.options.length === 1 ? product.options[0] : undefined;
            return {
              ...base,
              productCode: product.productCode,
              optionCode: soleOption?.optionCode || "",
              productName: product.name,
              optionName: soleOption?.optionName || "",
              price: product.price,
              configuredCost: adminPlusConfiguredCost(product.price, base.qty, base.shippingFee),
              source: "업체상품명 일치",
              reason: "엑셀 업체상품명과 AdminPlus 상품명이 정확히 일치합니다. 확인 후 확정하세요.",
              status: "확정가능",
              needsWrite: true,
            };
          }
        }
        return base;
      });

      if (recoveredLinks.length) {
        const mergedById = new Map<string, AdminPlusProductLink>();
        confirmedLinks.forEach((row) => mergedById.set(row.id, row));
        recoveredLinks.forEach((row) => mergedById.set(row.id, row));
        const recoveredAllLinks = Array.from(mergedById.values());
        const recoverySave = await callApi("/api/operation/settings/save", {
          settingsKey,
          data: {
            ...createServerSettingsPayload(),
            mappings: normalizeMappingRows(confirmedMappings),
            adminplusProductLinks: recoveredAllLinks,
          },
        });
        if (recoverySave.ok !== true) throw new Error(recoverySave.message || "기존 확정매칭 서버 링크 자동복구에 실패했습니다.");
        setAdminplusProductLinks(recoveredAllLinks);
      }

      setAdminplusMatchSuggestions(suggestions);
      const ready = suggestions.filter((row) => row.status === "확정가능").length;
      const confirmed = suggestions.filter((row) => row.status === "확정됨").length;
      const complex = suggestions.filter((row) => row.status === "복합매칭확인").length;
      setAdminplusCatalogMessage(
        `${account.vendorName} 엑셀매핑 ${suggestions.length}건 비교 완료 · 확정 API매칭→엑셀매칭 동기화 완료 · 확정가능 ${ready}건 · 기존확정 ${confirmed}건 · 자동복구 ${recoveredLinks.length}건 · 복합확인 ${complex}건 · 실제 미매핑만 검색으로 찾으세요.`,
      );
    } catch (error) {
      setAdminplusCatalogMessage(`자동 매칭후보 조회 실패: ${String(error)}`);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }


  async function requireCurrentNcloudMatchRevision() {
    const status = await callApi("/api/system/status");
    const matchRevision = text(status.matchValidationRevision);
    const diagnosticRevision = text(status.matchDiagnosticRevision);
    const requiredMatchRevision = "v237-option-parser-validation-reconfirm-watch-20260811";
    const requiredDiagnosticRevision = "v238-ncloud-revision-guard-diagnostic-20260811";
    if (matchRevision !== requiredMatchRevision && diagnosticRevision !== requiredDiagnosticRevision) {
      throw new Error(
        `Ncloud 매칭 서버가 구버전입니다. 현재 matchValidationRevision=${matchRevision || "없음"}, ` +
        `matchDiagnosticRevision=${diagnosticRevision || "없음"}. ` +
        `Ncloud V229 이상을 먼저 배포한 뒤 다시 수정 확정하세요.`
      );
    }
    return { matchRevision, diagnosticRevision };
  }

  async function confirmAdminPlusSuggestedMatch(suggestion: AdminPlusMatchSuggestion) {
    if (adminplusCatalogBusy || suggestion.status !== "확정가능") return;
    try {
      const mapping = mappings.find((row) => row.id === suggestion.mappingId);
      if (!mapping) throw new Error("기존 엑셀 매핑 행을 찾지 못했습니다.");
      const parsedTime = parseOptionPurchaseTimes(suggestion.purchaseTime);
      if (!parsedTime.ok) throw new Error(parsedTime.error);
      const purchaseTime = parsedTime.normalized;
      const account = adminplusAccounts.find((row) => row.id === suggestion.accountId);
      const confirmedLink = account ? confirmedAdminPlusLinkForMapping(adminplusProductLinks, mapping, account) : undefined;
      const product = adminplusCatalogProducts.find((row) => cleanId(row.productCode) === cleanId(suggestion.productCode));
      const effectiveProductCode = cleanId(suggestion.productCode) || cleanId(confirmedLink?.productCode);
      const sameConfirmedProduct = Boolean(
        confirmedLink &&
        effectiveProductCode &&
        cleanId(confirmedLink.productCode) === effectiveProductCode
      );
      // 상품이 바뀐 경우 이전 상품의 optionCode를 절대 재사용하지 않습니다.
      let effectiveOptionCode = cleanId(suggestion.optionCode) || (sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "");

      const tentativeMatchChanged = !confirmedLink ||
        text(confirmedLink.matchString) !== text(suggestion.matchString) ||
        cleanId(confirmedLink.productCode) !== effectiveProductCode ||
        cleanId(confirmedLink.optionCode) !== (sameConfirmedProduct ? effectiveOptionCode : "") ||
        Math.max(1, Number(confirmedLink.qty || 1) || 1) !== Math.max(1, suggestion.qty);

      // 발주시간/배송비만 수정하는 경우에는 AdminPlus 상품목록 캐시가 없어도 기존 확정링크로 서버 저장합니다.
      if (tentativeMatchChanged && !product) throw new Error("상품/옵션/기본수량 변경에는 AdminPlus 상품목록 재조회가 필요합니다. 상품목록을 다시 불러오세요.");

      const option = product
        ? (suggestion.optionCode
          ? product.options.find((row) => cleanId(row.optionCode) === cleanId(suggestion.optionCode))
          : product.options.length === 1
            ? product.options[0]
            : undefined)
        : undefined;
      if (product && product.options.length > 1 && !option && tentativeMatchChanged) throw new Error("AdminPlus 옵션이 여러 개입니다. 검색 후 정확한 옵션을 선택해 주세요.");
      if (option?.optionCode) effectiveOptionCode = option.optionCode;

      setAdminplusCatalogBusy(true);
      setAdminplusWatchSaveState({ status: "saving", message: `${mapping.channel} ${mapping.optionId} 수정 매핑을 확정·서버 저장 중입니다.`, savedAt: "" });

      const adminPlusMatchChanged = !confirmedLink ||
        text(confirmedLink.matchString) !== text(suggestion.matchString) ||
        cleanId(confirmedLink.productCode) !== effectiveProductCode ||
        cleanId(confirmedLink.optionCode) !== cleanId(effectiveOptionCode) ||
        Math.max(1, Number(confirmedLink.qty || 1) || 1) !== Math.max(1, suggestion.qty);

      // 발주시간/배송비는 B2B 서버 확정값입니다. 이 두 값만 바뀐 경우 AdminPlus 상품매칭 API를 다시 쓰지 않습니다.
      // 상품/옵션/기본수량이 바뀐 경우에만 AdminPlus를 재적용하고 실제 재조회까지 검증합니다.
      if (adminPlusMatchChanged) {
        await requireCurrentNcloudMatchRevision();
        const applyResult = await callApi("/api/integrations/adminplus/catalog/matches/apply", {
          accountId: suggestion.accountId,
          confirm: true,
          matchString: suggestion.matchString,
          products: [{ productCode: effectiveProductCode, optionCode: effectiveOptionCode, qty: Math.max(1, suggestion.qty) }],
        });
        if (applyResult.ok !== true) {
          const requestedProduct = cleanId(applyResult.summary?.requestedProductCode) || effectiveProductCode;
          const requestedOption = cleanId(applyResult.summary?.requestedOptionCode) || effectiveOptionCode || "미지정";
          const requestedQty = Number(applyResult.summary?.requestedQty || suggestion.qty || 1) || 1;
          const message = text(applyResult.message);
          const genericValidation = /^validation failed$/i.test(message.trim());
          throw new Error(
            genericValidation
              ? `AdminPlus validation failed · 요청 상품 ${requestedProduct} · 옵션 ${requestedOption} · 수량 ${requestedQty}. ` +
                `Ncloud 매칭 진단 리비전은 정상이나 AdminPlus가 상세 필드를 반환하지 않았습니다. API 상품검색에서 실제 옵션을 선택해 다시 확정하세요.`
              : (message || `AdminPlus 매칭 재적용 검증 실패 · 상품 ${requestedProduct} · 옵션 ${requestedOption} · 수량 ${requestedQty}`)
          );
        }

        const verifiedMatch = (applyResult.summary?.match || {}) as AdminPlusMatchListRow;
        const verifiedProducts = Array.isArray(verifiedMatch.products) ? verifiedMatch.products : [];
        const verifiedProduct = verifiedProducts.length === 1 ? verifiedProducts[0] : undefined;
        const resolvedOptionCode = cleanId(applyResult.summary?.resolvedOptionCode) || cleanId(verifiedProduct?.option_code);
        // Ncloud가 POST 후 실제 AdminPlus 재조회까지 검증해 반환한 resolved optionCode를 최종 확정값으로 사용합니다.
        // 상품목록 API가 옵션목록을 제공하지 않아 UI에서 optionCode를 미리 알 수 없었던 경우에도
        // 실제 AdminPlus 옵션코드(예: 1484)를 서버 확정링크에 보존합니다.
        if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;
        const verifiedOptionCode = cleanId(verifiedProduct?.option_code);
        if (
          verifiedMatch.is_temp === true ||
          verifiedProducts.length !== 1 ||
          cleanId(verifiedProduct?.product_code) !== effectiveProductCode ||
          (effectiveOptionCode ? verifiedOptionCode !== cleanId(effectiveOptionCode) : false) ||
          Math.max(1, Number(verifiedProduct?.qty || 1) || 1) !== Math.max(1, suggestion.qty)
        ) {
          throw new Error(`AdminPlus 재조회 결과가 수정값과 일치하지 않습니다. 요청 상품 ${effectiveProductCode} / 확정 옵션 ${effectiveOptionCode || "미지정"} / 수량 ${Math.max(1, suggestion.qty)} / 재조회 상품 ${cleanId(verifiedProduct?.product_code) || "없음"} / 옵션 ${verifiedOptionCode || "없음"} / 수량 ${Math.max(1, Number(verifiedProduct?.qty || 1) || 1)}. 서버 확정값은 변경하지 않았습니다.`);
        }
      }

      const now = new Date().toISOString();
      const link: AdminPlusProductLink = {
        id: `${mapping.channel}|${mapping.optionId}`,
        channel: mapping.channel,
        optionId: mapping.optionId,
        vendorName: mapping.vendorName,
        accountId: suggestion.accountId,
        matchString: suggestion.matchString,
        productCode: product?.productCode || confirmedLink?.productCode || suggestion.productCode,
        optionCode: effectiveOptionCode,
        productName: product?.name || confirmedLink?.productName || suggestion.productName,
        optionName: option?.optionName || confirmedLink?.optionName || suggestion.optionName || "",
        qty: Math.max(1, suggestion.qty),
        shippingFee: Math.max(0, Number(suggestion.shippingFee || 0) || 0),
        purchaseTime,
        baselinePrice: Math.max(0, Number(mapping.cost || suggestion.excelBaselinePrice || product?.price || confirmedLink?.baselinePrice || suggestion.price || 0) || 0),
        currentPrice: Number(product?.price ?? suggestion.price ?? confirmedLink?.currentPrice ?? confirmedLink?.baselinePrice ?? 0) || 0,
        baselineConfiguredCost: adminPlusConfiguredCost(Math.max(0, Number(mapping.cost || suggestion.excelBaselinePrice || product?.price || confirmedLink?.baselinePrice || suggestion.price || 0) || 0), Math.max(1, suggestion.qty), Math.max(0, Number(suggestion.shippingFee || 0) || 0)),
        currentConfiguredCost: adminPlusConfiguredCost(Number(product?.price ?? suggestion.price ?? confirmedLink?.currentPrice ?? confirmedLink?.baselinePrice ?? 0) || 0, Math.max(1, suggestion.qty), Math.max(0, Number(suggestion.shippingFee || 0) || 0)),
        priceStatus: Math.max(0, Number(mapping.cost || suggestion.excelBaselinePrice || 0) || 0) > 0 &&
          Math.max(0, Number(mapping.cost || suggestion.excelBaselinePrice || 0) || 0) !== (Number(product?.price ?? suggestion.price ?? confirmedLink?.currentPrice ?? 0) || 0) ? "변동" : "정상",
        lastCheckedAt: now,
        priceChangedAt: "",
        matchAuthority: "api" as const,
        matchConfirmedAt: now,
        updatedAt: now,
      };
      const nextMapping: MappingRow = {
        ...mapping,
        vendorName: link.vendorName || mapping.vendorName,
        vendorCode: link.productCode || mapping.vendorCode,
        vendorProductName: link.productName || mapping.vendorProductName,
        baseQty: Math.max(1, suggestion.qty),
        shippingFee: Math.max(0, Number(suggestion.shippingFee || 0) || 0),
        purchaseTime,
        matchAuthority: "api",
        matchConfirmedAt: now,
        updatedAt: now,
      };
      const nextMappings = mappings.map((row) => row.id === mapping.id ? nextMapping : row);
      const nextLinks = [...adminplusProductLinks.filter((row) => row.id !== link.id), link];
      const nextAlerts = adminplusPriceAlerts.map((row) => row.linkId === link.id && !row.acknowledgedAt ? { ...row, acknowledgedAt: now } : row);
      const saveResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: normalizeMappingRows(nextMappings),
          adminplusProductLinks: nextLinks,
          adminplusPriceAlerts: nextAlerts.slice(-1000),
          operationalFailures: resolvedOperationalFailureSnapshot("adminplus_watch_save"),
        },
      });
      if (saveResult.ok !== true) throw new Error(saveResult.message || "수정된 매핑의 서버 저장에 실패했습니다.");

      await verifyAdminPlusConfirmedPersistence(nextMapping, link);
      setAdminplusMatchSuggestions((prev) => prev.map((row) => row.id === suggestion.id ? {
        ...row,
        optionCode: effectiveOptionCode,
        optionName: option?.optionName || row.optionName || "",
        qty: Math.max(1, suggestion.qty),
        shippingFee: Math.max(0, Number(suggestion.shippingFee || 0) || 0),
        purchaseTime,
        configuredCost: adminPlusConfiguredCost(Number(product?.price ?? confirmedLink?.currentPrice ?? suggestion.price ?? 0) || 0, Math.max(1, suggestion.qty), Math.max(0, Number(suggestion.shippingFee || 0) || 0)),
        status: "확정됨",
        needsWrite: false,
        priorProductName: product?.name || row.productName,
        priorOptionName: option?.optionName || row.optionName || "",
        priorBaselinePrice: Math.max(0, Number(mapping.cost || row.excelBaselinePrice || 0) || 0),
        excelBaselinePrice: Math.max(0, Number(mapping.cost || row.excelBaselinePrice || 0) || 0),
        changeSummary: "재확정 완료",
        reason: adminPlusMatchChanged
          ? "상품/옵션/수량 변경을 AdminPlus 재조회로 검증하고 서버 확정값까지 재조회했습니다."
          : "발주시간/배송비 수정은 AdminPlus 상품매칭을 건드리지 않고 서버 확정값 저장·재조회만 완료했습니다.",
      } : row));
      resolveOperationalFailureKind("adminplus_watch_save");
      const msg = `${mapping.channel} ${mapping.optionId} 수정 확정 완료 · ${adminPlusMatchChanged ? "AdminPlus 재검증 + " : ""}서버 재조회 검증 완료 · 발주시간 ${purchaseTime} · 기본수량 ${Math.max(1, suggestion.qty)} · 배송비 ${Math.max(0, Number(suggestion.shippingFee || 0) || 0).toLocaleString()}원`;
      setAdminplusWatchSaveState({ status: "success", message: msg, savedAt: now });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const msg = `추천 매핑 확정 실패: ${detail}`;
      setAdminplusCatalogMessage(msg);
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setMessage(msg);
      recordOperationalFailure("adminplus_watch_save", "API 매핑", `수정 매핑 확정 ${suggestion.channel} ${suggestion.optionId}`, error, suggestion.channel);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  function useSuggestionInManualSelector(suggestion: AdminPlusMatchSuggestion) {
    setAdminplusCatalogMappingId(suggestion.mappingId);
    setAdminplusCatalogProductCode(suggestion.productCode);
    setAdminplusCatalogOptionCode(suggestion.optionCode);
    setAdminplusCatalogQty(Math.max(1, suggestion.qty));
    setAdminplusCatalogShippingFee(Math.max(0, Number(suggestion.shippingFee || 0) || 0));
    setAdminplusProductSearch(suggestion.productName || suggestion.vendorProductName);
    setAdminplusCatalogMessage("후보를 수동 선택영역에 불러왔습니다. 상품·옵션을 확인한 뒤 ‘매칭 저장·검증’을 누르세요.");
  }

  async function loadAdminPlusCatalogProducts() {
    if (adminplusCatalogBusy) return;
    try {
      if (!adminplusCatalogAccountId) throw new Error("어드민플러스 계정을 선택하세요.");
      setAdminplusCatalogBusy(true);
      if (adminplusCatalogAccountId === "__all__") {
        const accounts = adminplusAccounts.filter((row) => row.enabled);
        if (!accounts.length) throw new Error("활성화된 어드민플러스 계정이 없습니다.");
        setAdminplusCatalogMessage(`전체계정 ${accounts.length}개 상품목록을 불러오고 있습니다.`);
        const results = await Promise.all(accounts.map((account) => callApi("/api/integrations/adminplus/catalog/products", { accountId: account.id, limit: 500 })));
        const rows = results.flatMap((result) => Array.isArray(result.summary?.rows) ? result.summary.rows as unknown as AdminPlusCatalogProduct[] : []);
        setAdminplusCatalogProducts(rows);
        setAdminplusCatalogMessage(`전체계정 ${accounts.length}개 · 상품 ${rows.length}건을 불러왔습니다.`);
        return;
      }
      setAdminplusCatalogMessage("어드민플러스 상품목록을 불러오고 있습니다.");
      const result = await callApi("/api/integrations/adminplus/catalog/products", { accountId: adminplusCatalogAccountId, limit: 500 });
      const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows as unknown as AdminPlusCatalogProduct[] : [];
      setAdminplusCatalogProducts(rows);
      setAdminplusCatalogMessage(result.message || `상품 ${rows.length}건을 불러왔습니다.`);
    } catch (error) {
      setAdminplusCatalogMessage(`상품목록 조회 실패: ${String(error)}`);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  async function applyAdminPlusDirectProductMatch() {
    if (adminplusCatalogBusy) return;
    try {
      const mapping = mappings.find((row) => row.id === adminplusCatalogMappingId);
      if (!mapping) throw new Error("웹앱 상품매핑 행을 선택하세요.");
      if (!adminplusCatalogAccountId) throw new Error("어드민플러스 계정을 선택하세요.");
      if (adminplusCatalogAccountId === "__all__") throw new Error("전체계정 조회 상태에서는 매칭 저장을 할 수 없습니다. 실제 어드민플러스 계정을 선택하세요.");
      const parsedTime = parseOptionPurchaseTimes(mapping.purchaseTime);
      if (!parsedTime.ok) throw new Error(parsedTime.error);
      const purchaseTime = parsedTime.normalized;
      const product = adminplusCatalogProducts.find((row) => row.productCode === adminplusCatalogProductCode);
      if (!product) throw new Error("어드민플러스 상품을 선택하세요.");
      const selectedOption = adminplusCatalogOptionCode
        ? product.options.find((row) => row.optionCode === adminplusCatalogOptionCode)
        : product.options.length === 1
          ? product.options[0]
          : undefined;
      if (product.options.length > 1 && !selectedOption) throw new Error("AdminPlus 옵션이 여러 개입니다. 정확한 옵션을 선택하세요.");
      if (!text(mapping.vendorProductName)) throw new Error("기존 매핑의 업체상품명이 없습니다.");
      const matchString = adminPlusOptionScopedMatchString(mapping);
      setAdminplusCatalogBusy(true);
      setAdminplusWatchSaveState({ status: "saving", message: `${mapping.channel} ${mapping.optionId} 신규 매핑을 서버에 확정 저장 중입니다.`, savedAt: "" });

      const result = await callApi("/api/integrations/adminplus/catalog/matches/apply", {
        accountId: adminplusCatalogAccountId,
        confirm: true,
        matchString,
        products: [{ productCode: product.productCode, optionCode: selectedOption?.optionCode || "", qty: Math.max(1, adminplusCatalogQty) }],
      });
      if (result.ok !== true) throw new Error(result.message || "AdminPlus 상품매칭 저장 후 검증에 실패했습니다.");
      const manualResolvedOptionCode = cleanId(selectedOption?.optionCode) || cleanId(result.summary?.resolvedOptionCode);
      const manualResolvedOption = manualResolvedOptionCode
        ? product.options.find((row) => cleanId(row.optionCode) === manualResolvedOptionCode)
        : undefined;

      const now = new Date().toISOString();
      const link: AdminPlusProductLink = {
        id: `${mapping.channel}|${mapping.optionId}`,
        channel: mapping.channel,
        optionId: mapping.optionId,
        vendorName: mapping.vendorName,
        accountId: adminplusCatalogAccountId,
        matchString,
        productCode: product.productCode,
        optionCode: manualResolvedOptionCode,
        productName: product.name,
        optionName: manualResolvedOption?.optionName || selectedOption?.optionName || "",
        qty: Math.max(1, adminplusCatalogQty),
        shippingFee: Math.max(0, adminplusCatalogShippingFee),
        purchaseTime,
        baselinePrice: Math.max(0, Number(mapping.cost || product.price) || product.price),
        currentPrice: product.price,
        baselineConfiguredCost: adminPlusConfiguredCost(Math.max(0, Number(mapping.cost || product.price) || product.price), Math.max(1, adminplusCatalogQty), Math.max(0, adminplusCatalogShippingFee)),
        currentConfiguredCost: adminPlusConfiguredCost(product.price, Math.max(1, adminplusCatalogQty), Math.max(0, adminplusCatalogShippingFee)),
        priceStatus: Math.max(0, Number(mapping.cost || 0) || 0) > 0 && Number(mapping.cost || 0) !== product.price ? "변동" : "정상",
        lastCheckedAt: now,
        priceChangedAt: "",
        matchAuthority: "api" as const,
        matchConfirmedAt: now,
        updatedAt: now,
      };
      const selectedAccount =
        adminplusAccounts.find(
          (row) => row.id === adminplusCatalogAccountId,
        );

      const nextMapping: MappingRow = {
        ...mapping,
        vendorName: selectedAccount?.vendorName || mapping.vendorName,
        vendorCode: product.productCode || mapping.vendorCode,
        vendorProductName: product.name || mapping.vendorProductName,
        baseQty: Math.max(1, adminplusCatalogQty),
        shippingFee: Math.max(0, adminplusCatalogShippingFee),
        purchaseTime,
        matchAuthority: "api",
        matchConfirmedAt: now,
        updatedAt: now,
      };
      const nextMappings = mappings.map((row) => row.id === mapping.id ? nextMapping : row);
      const nextLinks = [...adminplusProductLinks.filter((row) => row.id !== link.id), link];
      const nextAlerts = adminplusPriceAlerts.map((row) => row.linkId === link.id && !row.acknowledgedAt ? { ...row, acknowledgedAt: now } : row);
      const saveResult = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: {
          ...createServerSettingsPayload(),
          mappings: normalizeMappingRows(nextMappings),
          adminplusProductLinks: nextLinks,
          adminplusPriceAlerts: nextAlerts.slice(-1000),
          operationalFailures: resolvedOperationalFailureSnapshot("adminplus_watch_save"),
        },
      });
      if (saveResult.ok !== true) throw new Error(saveResult.message || "상품매칭 운영설정 서버 저장에 실패했습니다.");
      await verifyAdminPlusConfirmedPersistence(nextMapping, link);
      setAdminplusMatchSuggestions((prev) => prev.map((row) => row.mappingId === mapping.id ? {
        ...row,
        status: "확정됨",
        productCode: product.productCode,
        optionCode: manualResolvedOptionCode,
        productName: product.name,
        optionName: manualResolvedOption?.optionName || selectedOption?.optionName || "",
        price: product.price,
        qty: Math.max(1, adminplusCatalogQty),
        shippingFee: Math.max(0, adminplusCatalogShippingFee),
        purchaseTime,
        configuredCost: adminPlusConfiguredCost(product.price, Math.max(1, adminplusCatalogQty), Math.max(0, adminplusCatalogShippingFee)),
        needsWrite: false,
        reason: "검색 후 매칭을 확정하고 서버 재조회까지 검증했습니다.",
      } : row));
      resolveOperationalFailureKind("adminplus_watch_save");
      const msg = `${result.message || "매칭 저장 완료"} · 서버 재조회 검증 완료 · 발주시간 ${purchaseTime} · 기본수량 ${Math.max(1, adminplusCatalogQty)} · 배송비 ${Math.max(0, adminplusCatalogShippingFee).toLocaleString()}원`;
      setAdminplusWatchSaveState({ status: "success", message: msg, savedAt: now });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `상품매칭 저장 실패: ${String(error)}`;
      setAdminplusCatalogMessage(msg);
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setMessage(msg);
      const mapping = mappings.find((row) => row.id === adminplusCatalogMappingId);
      recordOperationalFailure("adminplus_watch_save", "API 매핑", `신규 매핑 서버 저장 ${mapping?.channel || "쿠팡"} ${mapping?.optionId || ""}`.trim(), error, mapping?.channel);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  async function checkAdminPlusPricesNow() {
    if (adminplusCatalogBusy) return;
    try {
      setAdminplusCatalogBusy(true);
      const result = await callApi("/api/integrations/adminplus/prices/check", { data: adminPlusAutomationPayload() });
      if (result.ok === false) throw new Error(result.message || "가격 확인 API가 실패했습니다.");
      const hasServerLinks = Array.isArray(result.summary?.links);
      const links = hasServerLinks ? normalizeAdminPlusServerLinks(result.summary?.links) : adminplusProductLinks;
      const alerts = Array.isArray(result.summary?.alerts) ? result.summary?.alerts as unknown as AdminPlusPriceAlert[] : [];
      if (hasServerLinks) setAdminplusProductLinks(links);
      setAdminplusProductLinkDrafts({});
      setAdminplusPriceAlerts(alerts.slice(-1000));
      setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, lastPriceCheckAt: new Date().toISOString() }));
      const openCount = alerts.filter((row) => !row.acknowledgedAt).length;
      const correctionCount = Array.isArray(result.accountCorrections) ? result.accountCorrections.length : Array.isArray(result.summary?.accountCorrections) ? result.summary.accountCorrections.length : 0;
      const unresolvedAccountCount = Array.isArray(result.unresolvedAccountLinks) ? result.unresolvedAccountLinks.length : Array.isArray(result.summary?.unresolvedAccountLinks) ? result.summary.unresolvedAccountLinks.length : 0;
      const accountNote = correctionCount || unresolvedAccountCount
        ? ` · 계정경로 교정 ${correctionCount}건 · 계정확인필요 ${unresolvedAccountCount}건`
        : "";
      const msg = `${result.message || `어드민플러스 가격 확인 완료 · 미확인 ${openCount}건`}${accountNote} · 현재시각 기준으로 이전 미확인 현황을 갱신했습니다.`;
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `가격 확인 실패: ${String(error)}`;
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      recordOperationalFailure("adminplus_watch_save", "자동감시", "공급가 자동감시 실행", error);
    } finally {
      setAdminplusCatalogBusy(false);
    }
  }

  async function acceptAdminPlusPrice(linkId: string) {
    const link = adminplusProductLinks.find((row) => row.id === linkId);
    if (!link) return;
    if (adminplusProductLinkDrafts[linkId]) {
      const msg = "미저장 수량/배송비/시간 수정이 있습니다. 먼저 ‘감시기준 저장’을 완료한 뒤 현재가를 기준가로 적용하세요.";
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      return;
    }
    const now = new Date().toISOString();
    const nextLink: AdminPlusProductLink = {
      ...link,
      baselinePrice: link.currentPrice,
      baselineConfiguredCost: adminPlusConfiguredCost(link.currentPrice, link.qty, link.shippingFee),
      currentConfiguredCost: adminPlusConfiguredCost(link.currentPrice, link.qty, link.shippingFee),
      priceStatus: "정상",
      priceChangedAt: "",
      updatedAt: now,
    };
    const nextLinks = adminplusProductLinks.map((row) => row.id === linkId ? nextLink : row);
    const nextAlerts = adminplusPriceAlerts.map((row) => row.linkId === linkId && !row.acknowledgedAt ? { ...row, acknowledgedAt: now } : row);
    try {
      setAdminplusWatchSaveState({ status: "saving", message: `${link.channel} ${link.optionId} 현재가를 새 기준가로 서버 저장 중입니다.`, savedAt: "" });
      const result = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: { ...createServerSettingsPayload(), adminplusProductLinks: nextLinks, adminplusPriceAlerts: nextAlerts.slice(-1000) },
      });
      if (result.ok !== true) throw new Error(result.message || "기준가격 서버 저장 실패");
      const serverState = await loadAdminPlusConfirmedStateFromServer();
      const persisted = serverState.links.find((row) => row.id === linkId);
      if (!persisted || persisted.baselinePrice !== nextLink.baselinePrice || persisted.priceStatus !== "정상") {
        throw new Error("기준가격 서버 재조회 검증이 일치하지 않습니다.");
      }
      resolveOperationalFailureKind("adminplus_watch_save");
      const msg = "현재 어드민플러스 가격을 새 기준가격으로 승인하고 서버 재조회까지 확인했습니다.";
      setAdminplusWatchSaveState({ status: "success", message: msg, savedAt: now });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `기준가격 서버 저장 실패: ${String(error)}`;
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      recordOperationalFailure("adminplus_watch_save", "자동감시", `현재가 기준 적용 ${link.channel} ${link.optionId}`, error, link.channel);
    }
  }

  function updateAdminPlusRule(accountId: string, patch: Partial<AdminPlusAccountRule>) {
    setAdminplusAutomation((prev) => {
      const account = adminplusAccounts.find((row) => row.id === accountId);
      const current = prev.accountRules.find((row) => row.accountId === accountId) || {
        accountId,
        vendorName: account?.vendorName || "",
        enabled: true,
        autoPurchase: true,
        autoPayment: false,
        paymentMaxPerBatch: 0,
        paymentDailyLimit: 0,
        autoShipment: true,
      };
      const nextRules = [...prev.accountRules.filter((row) => row.accountId !== accountId), { ...current, ...patch }];
      return normalizeAdminPlusAutomation({ ...prev, accountRules: nextRules });
    });
  }

  function adminPlusAutomationPayload(config = adminplusAutomation) {
    const normalizedBase = normalizeAdminPlusAutomation({
      ...config,
      shipmentTimes: normalizeShipmentAutomationTimes(adminplusShipmentTimesText),
      priceCheckTimes: normalizeAutomationTimes(adminplusPriceCheckTimesText, DEFAULT_ADMINPLUS_AUTOMATION.priceCheckTimes),
    });
    const normalized = normalizeAdminPlusAutomation({ ...normalizedBase, accountRules: adminplusAccounts.length ? reconcileAdminPlusRules(adminplusAccounts, normalizedBase) : normalizedBase.accountRules });
    return {
      ...createServerSettingsPayload(),
      adminplusAutomation: normalized,
      adminplusPurchaseHistory: adminplusPurchaseHistory.slice(-5000),
      adminplusProductLinks,
      adminplusPriceAlerts: adminplusPriceAlerts.slice(-1000),
    };
  }

  async function saveAdminPlusAutomationSettings() {
    if (adminplusAutomationBusy) return;
    try {
      let nextBase = normalizeAdminPlusAutomation({
        ...adminplusAutomation,
        shipmentTimes: normalizeShipmentAutomationTimes(adminplusShipmentTimesText),
        priceCheckTimes: normalizeAutomationTimes(adminplusPriceCheckTimesText, DEFAULT_ADMINPLUS_AUTOMATION.priceCheckTimes),
      });
      let next = normalizeAdminPlusAutomation({ ...nextBase, accountRules: adminplusAccounts.length ? reconcileAdminPlusRules(adminplusAccounts, nextBase) : nextBase.accountRules });
      // 일반 자동화 저장은 자동발주/송장/공통 스케줄만 확정합니다. 업체별 결제정책은 각 행의 전용 저장 버튼으로만 확정합니다.
      const loadedForPolicy = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(settingsKey)}`);
      const serverAutomationForPolicy = normalizeAdminPlusAutomation(loadedForPolicy.data?.adminplusAutomation);
      const serverPolicyById = new Map(serverAutomationForPolicy.accountRules.map((rule) => [rule.accountId, rule] as const));
      next = normalizeAdminPlusAutomation({
        ...next,
        accountRules: next.accountRules.map((rule) => {
          const savedPolicy = serverPolicyById.get(rule.accountId);
          return savedPolicy ? {
            ...rule,
            autoPayment: savedPolicy.autoPayment,
            paymentMaxPerBatch: savedPolicy.paymentMaxPerBatch,
            paymentDailyLimit: savedPolicy.paymentDailyLimit,
          } : rule;
        }),
      });
      if (next.enabled && !next.startedAt) next = { ...next, startedAt: new Date().toISOString() };
      setAdminplusAutomationBusy(true);
      setAdminplusWatchSaveState({ status: "saving", message: "자동감시 설정 전체를 서버에 저장하고 재조회 검증 중입니다.", savedAt: "" });
      const expectedLinks = adminplusProductLinks.map((row) => ({ ...row, purchaseTime: normalizeOptionPurchaseTimes(row.purchaseTime) }));
      const result = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: { ...adminPlusAutomationPayload(next), adminplusProductLinks: expectedLinks },
      });
      if (result.ok !== true) throw new Error(result.message || "자동감시 설정 서버 저장 실패");
      const serverState = await loadAdminPlusConfirmedStateFromServer();
      const serverLinkKeys = new Set(serverState.links.map((row) => `${row.id}|${row.accountId}|${row.qty}|${row.shippingFee}|${normalizeOptionPurchaseTimes(row.purchaseTime)}`));
      const missing = expectedLinks.find((row) => !serverLinkKeys.has(`${row.id}|${row.accountId}|${row.qty}|${row.shippingFee}|${normalizeOptionPurchaseTimes(row.purchaseTime)}`));
      if (missing) throw new Error(`서버 재조회에서 ${missing.channel} ${missing.optionId} 확정 감시기준이 일치하지 않습니다.`);
      setAdminplusAutomation(next);
      try {
        const localSnapshot = { ...createPersistentSettingsPayload(), adminplusAutomation: next, adminplusProductLinks: expectedLinks };
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(localSnapshot));
      } catch { /* server save remains source of truth */ }
      resolveOperationalFailureKind("adminplus_watch_save");
      const draftCount = Object.keys(adminplusProductLinkDrafts).length;
      const textMessage = `${result.message || "어드민플러스 자동화 설정을 서버에 저장했습니다."} · 서버 재조회 검증 완료${draftCount ? ` · 미확정 편집 ${draftCount}건은 저장하지 않았습니다.` : ""}`;
      setAdminplusWatchSaveState({ status: "success", message: textMessage, savedAt: new Date().toISOString() });
      setAdminplusAutomationMessage(textMessage);
      setAdminplusCatalogMessage(textMessage);
      setMessage(textMessage);
    } catch (error) {
      const msg = `어드민플러스 자동화 설정 저장 실패: ${String(error)}`;
      setAdminplusWatchSaveState({ status: "error", message: msg, savedAt: "" });
      setAdminplusAutomationMessage(msg);
      setAdminplusCatalogMessage(msg);
      setMessage(msg);
      recordOperationalFailure("adminplus_watch_save", "자동감시", "자동감시 설정 전체 서버저장", error);
    } finally {
      setAdminplusAutomationBusy(false);
    }
  }

  function adminPlusPaymentPermissionState(account: AdminPlusCredentialAccount) {
    if (account.paymentReadScopeOk === false && account.balanceReadScopeOk === true) {
      return {
        status: "API 결제권한 필요",
        detail: "계정 연결과 잔액조회는 정상입니다. 결제 조회/실행 API 권한만 제한된 상태입니다.",
      };
    }
    if (account.paymentReadScopeOk === false && account.balanceReadScopeOk === false) {
      return {
        status: "API 권한 확인 필요",
        detail: "결제조회와 잔액조회 권한을 모두 확인해야 합니다.",
      };
    }
    if (account.paymentReadScopeOk !== true || account.balanceReadScopeOk !== true) {
      return {
        status: "권한 확인 전",
        detail: "‘계정목록·권한 확인’을 먼저 실행하세요.",
      };
    }
    return {
      status: "API 권한 정상",
      detail: "결제조회와 잔액조회 권한이 정상입니다.",
    };
  }

  function adminPlusPaymentSetupState(account: AdminPlusCredentialAccount, rule: AdminPlusAutomationRule) {
    const permission = adminPlusPaymentPermissionState(account);
    if (account.balanceReadScopeOk === false) return permission.status;
    if (rule.autoPayment !== true) return "자동결제 OFF";
    if (Number(rule.paymentMaxPerBatch || 0) <= 0 || Number(rule.paymentDailyLimit || 0) <= 0) return "한도 설정 필요";
    if (account.paymentReadScopeOk === false) return "결제조회 제한 · 실행결과로 확인";
    return "결제 준비완료";
  }

  function adminPlusPaymentPolicyProblems() {
    return adminplusAccounts
      .map((account) => {
        const rule = adminplusAutomation.accountRules.find((row) => row.accountId === account.id);
        if (!account.enabled || rule?.enabled === false) return null;
        const problems: string[] = [];
        if (rule?.autoPayment !== true) problems.push("예치금 자동결제 OFF");
        if (Math.max(0, Number(rule?.paymentMaxPerBatch || 0)) <= 0) problems.push("1회 한도 0원");
        if (Math.max(0, Number(rule?.paymentDailyLimit || 0)) <= 0) problems.push("일일 한도 0원");
        if (account.paymentReadScopeOk === false) problems.push("결제조회 제한(결제실행 후 주문상태 재확인)");
        if (account.balanceReadScopeOk === false) problems.push("잔액조회 권한 없음");
        return problems.length ? { accountId: account.id, vendorName: account.vendorName, problems } : null;
      })
      .filter(Boolean) as Array<{ accountId: string; vendorName: string; problems: string[] }>;
  }

  async function saveAdminPlusPaymentPolicyForAccount(accountId: string) {
    if (adminplusAutomationBusy) return;
    const account = adminplusAccounts.find((row) => row.id === accountId);
    const localRule = adminplusAutomation.accountRules.find((row) => row.accountId === accountId);
    if (!account || !localRule) return;
    try {
      setAdminplusAutomationBusy(true);
      const loaded = await callApi(`/api/operation/settings/load?settingsKey=${encodeURIComponent(settingsKey)}`);
      const serverData = loaded.data && typeof loaded.data === "object" ? loaded.data as Record<string, unknown> : {};
      const serverAutomation = normalizeAdminPlusAutomation(serverData.adminplusAutomation);
      const nextRules = [
        ...serverAutomation.accountRules.filter((rule) => rule.accountId !== accountId),
        { ...localRule, vendorName: account.vendorName },
      ];
      const nextAutomation = normalizeAdminPlusAutomation({ ...serverAutomation, accountRules: nextRules });
      const saved = await callApi("/api/operation/settings/save", {
        settingsKey,
        data: { ...serverData, adminplusAutomation: nextAutomation },
      });
      if (saved.ok !== true) throw new Error(saved.message || "결제정책 서버 저장 실패");
      setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, accountRules: [
        ...prev.accountRules.filter((rule) => rule.accountId !== accountId),
        { ...localRule, vendorName: account.vendorName },
      ] }));
      const msg = `${account.vendorName} 결제정책을 서버에 저장했습니다.`;
      setAdminplusAutomationMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `${account.vendorName} 결제정책 저장 실패: ${String(error)}`;
      setAdminplusAutomationMessage(msg);
      setMessage(msg);
    } finally {
      setAdminplusAutomationBusy(false);
    }
  }

  async function runAdminPlusAutomation(kind: "purchase-preflight" | "purchase-execute" | "shipment-preflight" | "shipment-sync") {
    if (adminplusAutomationBusy) return;
    const routes = {
      "purchase-preflight": "/api/integrations/adminplus/purchase/preflight",
      "purchase-execute": "/api/integrations/adminplus/purchase/execute",
      "shipment-preflight": "/api/integrations/adminplus/shipments/preflight",
      "shipment-sync": "/api/integrations/adminplus/shipments/sync",
    } as const;
    const labels = {
      "purchase-preflight": "발주·결제 사전검증",
      "purchase-execute": "주문등록·예치금결제 실행",
      "shipment-preflight": "송장 사전확인",
      "shipment-sync": "송장 회수·마켓등록",
    } as const;
    try {
      setAdminplusAutomationBusy(true);
      setAdminplusAutomationMessage(`어드민플러스 ${labels[kind]} 중입니다.`);
      if (kind === "purchase-execute") {
        const localProblems = adminPlusPaymentPolicyProblems();
        const preflight = await callApi(routes["purchase-preflight"], { data: adminPlusAutomationPayload() });
        const preflightSummary = (preflight.summary || {}) as Record<string, unknown>;
        if (Array.isArray(preflightSummary.preflightRows)) setAdminplusPreflightRows(preflightSummary.preflightRows as Array<Record<string, unknown>>);
        const blockers = Array.isArray(preflightSummary.paymentBlockers)
          ? preflightSummary.paymentBlockers as Array<Record<string, unknown>>
          : [];
        if (localProblems.length || blockers.length) {
          const parts = [
            ...localProblems.map((row) => `${row.vendorName}: ${row.problems.join(", ")}`),
            ...blockers.map((row) => `${String(row.vendorName || row.accountId || "협력사")}: ${String(row.reason || "결제정책 미설정")}`),
          ];
          const unique = Array.from(new Set(parts)).slice(0, 6);
          setAdminplusAutomationMessage(`결제는 보류될 수 있지만 AdminPlus 주문등록은 계속 진행합니다. ${unique.join(" / ")}`);
        }
      }
      if ((kind === "purchase-execute" || kind === "shipment-sync") && !window.confirm(`${labels[kind]}을 실제 실행할까요?`)) return;
      const runtimePayload = adminPlusAutomationPayload();
      const result = await callApi(routes[kind], {
        data: (kind === "shipment-preflight" || kind === "shipment-sync")
          ? {
              ...runtimePayload,
              manualShipmentRange: {
                startDate: orderApiFilter.startDate,
                endDate: orderApiFilter.endDate,
              },
            }
          : runtimePayload,
      });
      const summary = (result.summary || {}) as Record<string, unknown>;
      if (Array.isArray(summary.history)) setAdminplusPurchaseHistory((summary.history as AdminPlusPurchaseHistoryRow[]).slice(-5000));
      if (kind === "purchase-execute") await refreshAdminPlusPurchaseHistoryForDashboard();
      if (kind === "purchase-preflight" && Array.isArray(summary.preflightRows)) setAdminplusPreflightRows(summary.preflightRows as Array<Record<string, unknown>>);
      if (kind === "shipment-preflight" || kind === "shipment-sync") {
        const market = summary.marketplacePreparing && typeof summary.marketplacePreparing === "object" ? summary.marketplacePreparing as Record<string, unknown> : {};
        if (Array.isArray(market.keys)) setAdminplusShipmentMarketKeys((market.keys as unknown[]).map((value) => String(value || "")).filter(Boolean));
      }
      let messageText = result.message || `어드민플러스 ${labels[kind]} 완료`;
      if (kind === "purchase-preflight" || kind === "purchase-execute") {
        const skipCounts = summary.skipReasonCounts && typeof summary.skipReasonCounts === "object" ? summary.skipReasonCounts as Record<string, unknown> : {};
        const topSkips = Object.entries(skipCounts)
          .filter(([, count]) => Number(count || 0) > 0)
          .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
          .slice(0, 3)
          .map(([reason, count]) => `${reason} ${Number(count || 0)}건`)
          .join(" · ");
        const issueCount = Array.isArray(summary.issues) ? summary.issues.length : 0;
        const executionErrors = Array.isArray(summary.errors) ? (summary.errors as Array<Record<string, unknown>>) : [];
        const paymentErrors = Array.isArray(summary.paymentErrors) ? (summary.paymentErrors as Array<Record<string, unknown>>) : [];
        const errorText = [...executionErrors, ...paymentErrors]
          .slice(0, 3)
          .map((row) => {
            const orderNo = String(row.orderNo || "").trim();
            const stage = String(row.stage || "").trim();
            const reason = String(row.reason || row.message || "오류").trim();
            return `${orderNo ? `${orderNo}: ` : ""}${stage ? `[${stage}] ` : ""}${reason}`;
          })
          .join(" / ");
        if (topSkips || issueCount || executionErrors.length || paymentErrors.length) messageText += `${topSkips ? ` · 제외: ${topSkips}` : ""}${issueCount ? ` · 확인필요 ${issueCount}건` : ""}${executionErrors.length ? ` · 실행오류 ${executionErrors.length}건` : ""}${paymentErrors.length ? ` · 결제확인필요 ${paymentErrors.length}건` : ""}${errorText ? ` (${errorText})` : ""}`;
      }
      setAdminplusAutomationMessage(messageText);
      setMessage(messageText);
      if ((kind === "purchase-execute" || kind === "shipment-sync") && result.ok === false) {
        setAdminplusAutomationMessage(`${messageText} · 일부 항목은 확인/재시도가 필요합니다.`);
      } else if (kind === "purchase-execute" && result.ok !== false) {
        setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, lastPurchaseAt: new Date().toISOString() }));
      } else if (kind === "shipment-sync" && result.ok !== false && summary.canAdvanceWatermark !== false) {
        setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, lastShipmentAt: new Date().toISOString() }));
      }
    } catch (error) {
      setAdminplusAutomationMessage(`어드민플러스 ${labels[kind]} 실패: ${String(error)}`);
    } finally {
      setAdminplusAutomationBusy(false);
    }
  }

  function openMappingWorkspace(view: MappingWorkspaceView) {
    setMappingWorkspaceView(view);
    setActiveMenu("매핑관리");
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
  function toggleRollingCouponSelection(couponId: string) {
    const id = cleanId(couponId);
    if (!id) return;
    setSelectedRollingCouponIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  }

  function selectedCouponListRowsForRolling() {
    const selected = new Set(selectedRollingCouponIds.map(cleanId));
    return couponCandidateRows.filter((row) => selected.has(cleanId(row.couponId)));
  }

  async function refreshCouponWorkspace() {
    if (couponAutomationBusy) return;
    await fetchCoupangCouponContracts();
    await fetchCancelableCouponList();
    await fetchCouponAutomationFailures();
  }

  async function fetchCancelableCouponList() {
    if (couponAutomationBusy) return;
    setCouponAutomationBusy(true);
    try {
      const statuses = ["APPLIED", "STANDBY"];
      const results = await Promise.all(statuses.map((status) => callApi("/api/integrations/coupang/coupons/list", {
        query: { status, page: 1, size: 50 },
        couponApiSettings: { ...couponApiSettings, selectedCouponStatus: status },
        manual: true,
      })));
      const rows = results.flatMap((result) => couponListRowsFromApiResult(result));
      const deduped = Array.from(new Map(rows.map((row) => [cleanId(row.couponId), row])).values()).filter((row) => row.couponId);
      const itemResults = await Promise.allSettled(deduped.map((row) => callApi("/api/integrations/coupang/coupons/items-list", {
        query: { couponId: row.couponId, status: row.status || "APPLIED", page: 0, size: 1000 },
        couponApiSettings: { ...couponApiSettings, selectedCouponId: row.couponId, sourceCouponId: row.couponId },
        manual: true,
      })));
      const loadedItems = itemResults.flatMap((result) => result.status === "fulfilled" ? couponItemRowsFromApiResult(result.value) : []);
      setCouponItemRows((previous) => {
        const byKey = new Map(previous.map((item) => [`${cleanId(item.couponId)}|${cleanId(item.vendorItemId)}`, item]));
        loadedItems.forEach((item) => byKey.set(`${cleanId(item.couponId)}|${cleanId(item.vendorItemId)}`, item));
        return Array.from(byKey.values());
      });
      setCouponListRows(deduped);
      setSelectedRollingCouponIds([]);
      const applied = deduped.filter((row) => text(row.status).toUpperCase() === "APPLIED").length;
      const standby = deduped.filter((row) => text(row.status).toUpperCase() === "STANDBY").length;
      const msg = `취소 가능한 쿠폰 ${deduped.length}개를 조회했습니다. 활성 ${applied}개, 대기 ${standby}개입니다.`;
      setCouponMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `활성·대기 쿠폰 조회 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  async function cancelSelectedActiveOrStandbyCoupons() {
    if (couponAutomationBusy) return;
    const selectedRows = selectedCouponListRowsForRolling();
    const eligible = selectedRows.filter((row) => ["APPLIED", "STANDBY"].includes(text(row.status).toUpperCase()));
    if (!eligible.length) {
      setCouponMessage("활성(APPLIED) 또는 대기(STANDBY) 쿠폰을 체크한 뒤 선택 쿠폰 취소를 누르세요.");
      return;
    }
    const ids = eligible.map((row) => cleanId(row.couponId)).filter(Boolean);
    const names = eligible.map((row) => `${row.couponName || row.couponId} (${row.status})`).join("\n");
    const confirmed = window.confirm(`선택한 활성·대기 쿠폰 ${ids.length}개를 실제 취소합니다.\n\n${names}\n\n반복운영 중인 쿠폰이면 해당 쿠폰의 자동운영과 대기 재시도도 함께 중지합니다.`);
    if (!confirmed) return;
    setCouponAutomationBusy(true);
    try {
      const rows = eligible.map((row) => ({
        ...makeCouponRow("cancel", "", row.couponName || `couponId ${row.couponId}`, row.couponName || `couponId ${row.couponId}`, "금액", 1, row.startAt, row.endAt, "사용자 선택 활성·대기 쿠폰 취소"),
        couponId: row.couponId,
        cancelCouponId: row.couponId,
      }));
      const requestSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedCouponId: ids.join(","),
        sourceCouponId: "",
        selectedMode: "existing",
        dailyRollingEnabled: false,
      });
      const result = await callApi("/api/integrations/coupons/action-preview", {
        action: "cancel",
        rows,
        scheduledTime: schedules.couponCancel.time,
        forceCancel: true,
        daily24h: false,
        manual: true,
        couponApiSettings: requestSettings,
      });
      const pendingCancel = Boolean(result.summary?.pending);
      if (result.ok === false && !pendingCancel) throw new Error(result.message || "선택 쿠폰 취소 API가 완료되지 않았습니다.");
      const canceledIds = normalizeCouponIdList(result.summary?.canceledCouponIds);
      const canceledSet = new Set((canceledIds.length ? canceledIds : ids).map(cleanId));
      const now = new Date().toISOString();
      const affectedTemplateIds: string[] = [];
      const nextTemplates = normalizeRollingCouponTemplates(rollingCouponTemplates.map((template) => {
        const linked = [template.sourceCouponId, template.latestCouponId, template.lastGeneratedCouponId].some((value) => canceledSet.has(cleanId(value)));
        if (!linked) return template;
        affectedTemplateIds.push(template.id);
        return { ...template, enabled: false, automationState: "stopped" as const, lastCanceledAt: pendingCancel ? template.lastCanceledAt : now, savedAt: now };
      }));
      if (affectedTemplateIds.length) {
        await callApi("/api/operation/coupon-automation/stop", { settingsKey, templateIds: affectedTemplateIds });
      }
      const remainingActive = nextTemplates.filter((template) => template.enabled && template.automationState === "active");
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedCouponId: remainingActive.map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
        dailyRollingEnabled: remainingActive.length > 0,
        automationEnabled: remainingActive.length > 0,
        lastCancelCouponIds: Array.from(canceledSet),
        lastCanceledAt: now,
        rollingTemplates: nextTemplates,
      });
      await persistCouponAutomationState(nextTemplates, nextSettings);
      setCouponListRows((current) => current.map((row) =>
        canceledSet.has(cleanId(row.couponId))
          ? { ...row, status: pendingCancel ? "취소 확인중" : "EXPIRED" }
          : row,
      ));
      setSelectedRollingCouponIds((current) => current.filter((id) => !canceledSet.has(cleanId(id))));
      if (pendingCancel) {
        const requestedIds = normalizeCouponIdList(result.summary?.cancelRequestedIds);
        const msg = `선택 쿠폰 ${canceledSet.size}개의 파기 요청은 접수됐지만 30초 안에 DONE이 확인되지 않았습니다. 같은 요청은 다시 보내지 않습니다.${requestedIds.length ? ` requestedId ${requestedIds.join(", ")}` : ""} 1분 뒤 쿠폰 목록을 다시 확인하세요.`;
        setCouponMessage(msg);
        setMessage(msg);
        window.setTimeout(() => { void fetchCancelableCouponList(); }, 65_000);
      } else {
        const msg = `선택 쿠폰 ${canceledSet.size}개의 파기와 요청상태 DONE을 확인했습니다.${affectedTemplateIds.length ? ` 연결된 자동운영 ${affectedTemplateIds.length}개와 대기 재시도도 중지했습니다.` : ""}`;
        setCouponMessage(msg);
        setMessage(msg);
      }
    } catch (error) {
      const msg = `선택 쿠폰 취소 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  function makeRollingTemplateFromCoupon(row: CoupangCouponListRow, options: CoupangOptionMasterRow[]): RollingCouponTemplate {
    const parsed = couponDiscountInfoFromTexts(row.discountType || row.type, row.discountValue || row.discount);
    const normalizedOptions = normalizeCoupangOptionMasterRows(options);
    return {
      id: rollingCouponTemplateId(row.couponId),
      enabled: false,
      sourceCouponId: row.couponId,
      latestCouponId: row.couponId,
      contractId: row.contractId || couponApiSettings.selectedContractId,
      couponName: row.couponName || `couponId ${row.couponId}`,
      baseCouponName: row.couponName || `couponId ${row.couponId}`,
      status: row.status || couponApiSettings.selectedCouponStatus,
      type: row.type,
      discountType: row.discountType || parsed.discountType || "금액",
      discountValue: toNumber(row.discountValue, parsed.discountValue),
      maxDiscountPrice: toNumber(row.maxDiscountPrice, 0),
      wowExclusive: Boolean(row.wowExclusive),
      automationState: "draft",
      preflightStatus: "미검증",
      preflightAt: "",
      preflightIssues: [],
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
      setCouponMessage("24시간 반복을 시작할 쿠폰을 체크하세요.");
      return;
    }
    setCouponAutomationBusy(true);
    try {
      const importedTemplates: RollingCouponTemplate[] = [];
      const failed: string[] = [];
      const scheduleStartDate = nextCouponIssueWindowForUi(schedules).scheduleStartDate;
      for (const row of selectedRows) {
        const options = await loadCouponOptionsForTemplate(row);
        if (!options.length) {
          failed.push(`${row.couponName || row.couponId}: 적용상품 없음`);
          continue;
        }
        importedTemplates.push({ ...makeRollingTemplateFromCoupon(row, options), scheduleStartDate });
      }
      if (!importedTemplates.length) {
        const msg = `24시간 반복을 시작할 수 있는 쿠폰이 없습니다.${failed.length ? ` 확인필요: ${failed.join(" / ")}` : ""}`;
        setCouponMessage(msg);
        setMessage(msg);
        return;
      }

      // 사용자가 '24시간 관리에 추가'를 단순 저장으로 오해하지 않도록,
      // 추가 시 바로 사전검증까지 수행하고 통과 항목은 자동운영을 활성화합니다.
      const preflightResult = await callApi("/api/integrations/coupang/coupons/automation-preflight", {
        couponApiSettings: normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: importedTemplates }),
        schedules,
        manual: true,
      });
      const preflightRows = Array.isArray(preflightResult.summary?.rows)
        ? preflightResult.summary?.rows as Array<Record<string, unknown>>
        : [];
      const checkedAt = text(preflightResult.summary?.checkedAtKst) || new Date().toISOString();
      const preflightById = new Map(preflightRows.map((row) => [text(row.templateId), row]));
      const byId = new Map(normalizeRollingCouponTemplates(rollingCouponTemplates).map((template) => [template.id, template]));
      let activated = 0;
      for (const template of importedTemplates) {
        const row = preflightById.get(template.id);
        const ok = Boolean(row?.ok);
        const reconciledCouponId = text(row?.reconciledCouponId);
        const previous = byId.get(template.id);
        if (ok) activated += 1;
        byId.set(template.id, {
          ...template,
          latestCouponId: reconciledCouponId || previous?.latestCouponId || template.latestCouponId,
          lastGeneratedCouponId: previous?.lastGeneratedCouponId,
          lastGeneratedAt: previous?.lastGeneratedAt,
          lastCanceledAt: previous?.lastCanceledAt,
          enabled: ok,
          automationState: ok ? "active" : "failed",
          preflightStatus: ok ? "통과" : "실패",
          preflightAt: checkedAt,
          preflightIssues: Array.isArray(row?.issues) ? row!.issues.map((item) => text(item)).filter(Boolean) : [],
          scheduleStartDate,
          savedAt: new Date().toISOString(),
        });
      }
      const nextTemplates = normalizeRollingCouponTemplates(Array.from(byId.values()));
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        automationEnabled: activated > 0 || couponApiSettings.automationEnabled,
        automationActivatedAt: activated > 0 ? new Date().toISOString() : couponApiSettings.automationActivatedAt,
        selectedCouponId: nextTemplates.filter((template) => template.enabled).map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
        rollingTemplates: nextTemplates,
      });
      await persistCouponAutomationState(nextTemplates, nextSettings);
      const optionCount = importedTemplates.reduce((sum, template) => sum + template.options.length, 0);
      const msg = `선택 쿠폰 ${importedTemplates.length}개 중 ${activated}개가 사전검증을 통과해 24시간 자동운영을 시작했습니다. 첫 정기 교체는 ${scheduleStartDate} ${schedules.couponCancel.time || "23:50"} 취소 → ${schedules.couponApply.time || "23:52"} 신규 발행 순서입니다. 적용상품 ${optionCount}개.${failed.length ? ` 확인필요: ${failed.join(" / ")}` : ""}`;
      setCouponMessage(msg);
      setMessage(msg);
    } catch (error) {
      const msg = `24시간 반복 시작 실패: ${String(error)}`;
      setCouponMessage(msg);
      setMessage(msg);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  function couponAutomationFailureRowsFromApi(result: ApiResult): CouponAutomationFailureRow[] {
    const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows : [];
    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: text(record.id),
        templateId: text(record.template_id || record.templateId),
        couponId: text(record.coupon_id || record.couponId),
        couponName: text(record.coupon_name || record.couponName),
        stage: text(record.stage),
        status: text(record.status),
        attemptCount: toNumber(record.attempt_count || record.attemptCount, 0),
        errorCode: text(record.error_code || record.errorCode),
        errorMessage: text(record.error_message || record.errorMessage),
        createdAt: text(record.created_at || record.createdAt),
        repeatedCount: toNumber(record.repeated_count || record.repeatedCount, 1),
        nextRetryAt: text(record.next_retry_at || record.nextRetryAt),
      };
    });
  }

  async function persistCouponAutomationState(
    nextTemplates: RollingCouponTemplate[],
    nextSettings: CouponApiSettings,
    nextSchedules = schedules,
  ) {
    const normalizedTemplates = normalizeRollingCouponTemplates(nextTemplates);
    const normalizedSettings = normalizeCouponApiSettings({ ...nextSettings, rollingTemplates: normalizedTemplates, savedAt: new Date().toISOString() });
    const nextRows = buildRollingTemplateCouponRowsForAll(normalizedTemplates, nextSchedules, couponRows);
    const payload: PersistentSettingsPayload = {
      ...createServerSettingsPayload(),
      couponRows: nextRows,
      couponApiSettings: normalizedSettings,
      rollingCouponTemplates: normalizedTemplates,
      schedules: nextSchedules,
      savedAt: new Date().toISOString(),
      version: APP_VERSION,
    };
    const result = await callApi("/api/operation/settings/save", { settingsKey, data: payload });
    setRollingCouponTemplates(normalizedTemplates);
    setCouponApiSettings(normalizedSettings);
    setCouponRows(nextRows);
    setSchedules(nextSchedules);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 서버 저장이 성공하면 자동운영에는 영향이 없으므로 브라우저 저장 실패는 무시합니다.
    }
    return result;
  }

  async function runCouponAutomationPreflight() {
    if (couponAutomationBusy) return;
    const targets = normalizeRollingCouponTemplates(rollingCouponTemplates);
    if (!targets.length) {
      setCouponMessage("먼저 쿠폰 목록에서 반복 운영할 쿠폰을 체크하고 선택 쿠폰 일괄 반영을 누르세요.");
      return;
    }
    setCouponAutomationBusy(true);
    try {
      const result = await callApi("/api/integrations/coupang/coupons/automation-preflight", {
        couponApiSettings: normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: targets }),
        schedules,
        manual: true,
      });
      const rows = Array.isArray(result.summary?.rows) ? result.summary?.rows as Array<Record<string, unknown>> : [];
      const checkedAt = text(result.summary?.checkedAtKst) || new Date().toISOString();
      const byId = new Map(rows.map((row) => [text(row.templateId), row]));
      const nextTemplates = targets.map((template) => {
        const row = byId.get(template.id);
        if (!row) return template;
        const ok = Boolean(row.ok);
        const reconciledCouponId = text(row.reconciledCouponId);
        const actualAppliedRecovered = Boolean(reconciledCouponId);
        const shouldRemainActive = template.automationState === "active" || (couponApiSettings.automationEnabled && actualAppliedRecovered);
        return {
          ...template,
          latestCouponId: reconciledCouponId || template.latestCouponId,
          lastGeneratedCouponId: reconciledCouponId || template.lastGeneratedCouponId,
          enabled: shouldRemainActive ? true : false,
          automationState: shouldRemainActive ? "active" : ok ? "validated" : "failed",
          preflightStatus: ok ? "통과" : "실패",
          preflightAt: checkedAt,
          preflightIssues: Array.isArray(row.issues) ? row.issues.map((item) => text(item)).filter(Boolean) : [],
        } as RollingCouponTemplate;
      });
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        automationValidatedAt: checkedAt,
        lastPreflightAt: checkedAt,
        rollingTemplates: nextTemplates,
      });
      await persistCouponAutomationState(nextTemplates, nextSettings);
      const passed = nextTemplates.filter((template) => template.preflightStatus === "통과").length;
      const reconciled = Number(result.summary?.reconciled || 0);
      const messageText = result.message || `쿠폰 자동운영 사전검증: 통과 ${passed}개, 확인필요 ${nextTemplates.length - passed}개${reconciled ? ` · 실제 적용상태 자동복구 ${reconciled}개` : ""}`;
      setCouponMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      const messageText = `쿠폰 자동운영 사전검증 실패: ${String(error)}`;
      setCouponMessage(messageText);
      setMessage(messageText);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  async function issueAllMissingRollingCouponsNow() {
    if (couponAutomationBusy) return;

    const targets = normalizeRollingCouponTemplates(
      rollingCouponTemplates,
    ).filter(
      (template) =>
        template.enabled &&
        template.automationState !== "stopped",
    );

    if (!targets.length) {
      setCouponMessage(
        "현재 발행 가능한 24시간 반복대상이 없습니다.",
      );
      return;
    }

    const visibleOperating =
      targets.filter(
        (template) =>
          actualCouponStatusByTemplate.get(
            template.id,
          )?.applied,
      ).length;

    const visiblePending =
      targets.length -
      visibleOperating;

    const confirmed =
      window.confirm(
        `반복 전체 쿠폰발행을 실행합니다.\n\n` +
        `현재 반복대상 ${targets.length}개\n` +
        `화면상 실제 운영중 ${visibleOperating}개\n` +
        `화면상 발행대기 ${visiblePending}개\n\n` +
        `서버에서 실제 APPLIED 옵션ID를 다시 확인한 뒤 ` +
        `기존 운영 쿠폰은 종료하거나 교체하지 않고, ` +
        `APPLIED가 없는 반복대상만 신규 발행합니다.`,
      );

    if (!confirmed) return;

    setCouponAutomationBusy(true);

    try {
      const result =
        await callApi(
          "/api/integrations/coupang/coupons/v250-immediate-replace",
          {
            bulkMissingOnly: true,
            manual: true,
          },
        );

      const targetOptionCount =
        toNumber(
          result.summary?.targetOptionCount,
          0,
        );

      const existingOptionCount =
        toNumber(
          result.summary?.existingOptionCount,
          0,
        );

      const missingOptionCount =
        toNumber(
          result.summary?.missingOptionCount,
          0,
        );

      const issuedOptionCount =
        toNumber(
          result.summary?.issuedOptionCount,
          0,
        );

      const finalOperatingCount =
        toNumber(
          result.summary?.finalOperatingCount,
          0,
        );

      const remainingMissingIds =
        normalizeCouponIdList(
          result.summary?.remainingMissingIds,
        );

      const generatedCouponIds =
        normalizeCouponIdList(
          result.summary?.generatedCouponIds,
        );

      const messageText =
        result.message ||
        (
          `반복 전체 쿠폰발행: ` +
          `대상 ${targetOptionCount} · ` +
          `기존 운영 ${existingOptionCount} · ` +
          `발행대기 ${missingOptionCount} · ` +
          `신규발행 ${issuedOptionCount} · ` +
          `현재 운영 ${finalOperatingCount}/${targetOptionCount}` +
          (
            remainingMissingIds.length
              ? ` · 미발행 옵션 ${remainingMissingIds.join(", ")}`
              : ""
          ) +
          (
            generatedCouponIds.length
              ? ` · 신규 couponId ${generatedCouponIds.join(", ")}`
              : ""
          )
        );

      setCouponMessage(messageText);
      setMessage(messageText);

      // 실제 쿠팡 APPLIED 상태를 다시 읽어 상단 17/20/37 집계를 갱신합니다.
      window.setTimeout(
        () => {
          void fetchCancelableCouponList();
        },
        800,
      );

      // 발행 기능이 없는 사전검증으로 서버 상태도 다시 reconcile 합니다.
      window.setTimeout(
        () => {
          void runCouponAutomationPreflight();
        },
        2_000,
      );
    } catch (error) {
      const messageText =
        `반복 전체 쿠폰발행 실패: ${String(error)}`;

      setCouponMessage(messageText);
      setMessage(messageText);
    } finally {
      setCouponAutomationBusy(false);
    }
  }
  async function activateCouponAutomation(templateIds?: string[]) {
    if (couponAutomationBusy) return;
    const requestedIds = Array.isArray(templateIds) && templateIds.length ? new Set(templateIds) : null;
    const existingPassed = normalizeRollingCouponTemplates(rollingCouponTemplates)
      .filter((template) => template.preflightStatus === "통과" && (!requestedIds || requestedIds.has(template.id)));
    if (!existingPassed.length) {
      setCouponMessage("자동운영을 시작할 준비완료 반복대상이 없습니다. 먼저 전체 사전검증을 실행하세요.");
      return;
    }
    const summaryRows = existingPassed.map((template) => `• ${template.couponName} / 상품 ${template.options.length}건`);
    const confirmed = window.confirm(
      `자동운영 시작 대상 ${summaryRows.length}개

${summaryRows.join("\n")}

현재 쿠폰은 예정시간까지 유지하고, 신규 예약 대상은 다음 발행시간에 처음 생성합니다.`,
    );
    if (!confirmed) return;

    setCouponAutomationBusy(true);
    try {
      const now = new Date().toISOString();
      const nextSchedules = normalizeSchedules({
        ...schedules,
        couponPreflight: { enabled: true, time: schedules.couponPreflight.time || "23:45" },
        couponCancel: { enabled: true, time: schedules.couponCancel.time || "23:50" },
        couponApply: { enabled: true, time: schedules.couponApply.time || "23:52" },
      });
      const passedIds = new Set(existingPassed.map((template) => template.id));
      const nextTemplates = normalizeRollingCouponTemplates(rollingCouponTemplates.map((template) =>
        passedIds.has(template.id)
          ? { ...template, enabled: true, automationState: "active" as const, savedAt: now }
          : template,
      ));
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        selectedMode: "daily_new",
        dailyRollingEnabled: true,
        automationEnabled: true,
        automationActivatedAt: now,
        automationStoppedAt: "",
        selectedCouponId: nextTemplates.filter((template) => template.enabled).map((template) => template.latestCouponId || template.sourceCouponId).filter(Boolean).join(","),
        rollingTemplates: nextTemplates,
      });
      const result = await persistCouponAutomationState(nextTemplates, nextSettings, nextSchedules);
      const messageText = result.message || `자동운영 대상 ${nextTemplates.filter((template) => template.enabled).length}개의 설정을 저장했습니다.`;
      setCouponMessage(messageText);
      setMessage(messageText);
    } catch (error) {
      const messageText = `쿠폰 자동운영 시작 실패: ${String(error)}`;
      setCouponMessage(messageText);
      setMessage(messageText);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  async function stopCouponAutomation() {
    if (couponAutomationBusy) return;
    const activeCount = rollingCouponTemplates.filter((template) => template.enabled && template.automationState === "active").length;
    if (!activeCount) {
      setCouponMessage("현재 활성화된 쿠폰 자동운영이 없습니다.");
      return;
    }
    const confirmed = window.confirm("향후 자동 취소·생성·적용과 대기 중 재시도를 중지합니다. 현재 활성 쿠폰은 설정된 종료시각까지 유지합니다.");
    if (!confirmed) return;
    setCouponAutomationBusy(true);
    try {
      const now = new Date().toISOString();
      const nextTemplates = normalizeRollingCouponTemplates(rollingCouponTemplates).map((template) => template.enabled
        ? { ...template, enabled: false, automationState: "stopped" as const }
        : template);
      const nextSettings = normalizeCouponApiSettings({
        ...couponApiSettings,
        dailyRollingEnabled: false,
        automationEnabled: false,
        automationStoppedAt: now,
        rollingTemplates: nextTemplates,
      });
      const stopResult = await callApi("/api/operation/coupon-automation/stop", { settingsKey });
      await persistCouponAutomationState(nextTemplates, nextSettings);
      setCouponMessage(`${stopResult.message || "자동운영 대기 재시도를 중지했습니다."} 현재 활성 쿠폰은 자체 종료시각까지 유지되고 신규 쿠폰은 생성하지 않습니다.`);
      setMessage("쿠폰 자동운영 중지 완료");
    } catch (error) {
      setCouponMessage(`쿠폰 자동운영 중지 실패: ${String(error)}`);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  async function fetchCouponAutomationFailures() {
    try {
      const result = await callApi("/api/integrations/coupang/coupons/automation-failures?status=unacknowledged");
      const rows = couponAutomationFailureRowsFromApi(result);
      setCouponAutomationFailures(rows);
      setCouponApiSettings((prev) => normalizeCouponApiSettings({ ...prev, unacknowledgedFailureCount: rows.length }));
      return rows;
    } catch {
      return [];
    }
  }

  async function acknowledgeCouponAutomationFailure(id: string, templateId = "", stage = "") {
    try {
      const result = await callApi("/api/integrations/coupang/coupons/failure-acknowledge", { id, templateId, stage });
      await fetchCouponAutomationFailures();
      setCouponMessage(result.message || "실패 알림을 확인 완료로 처리했습니다.");
    } catch (error) {
      setCouponMessage(`실패 알림 확인 처리 실패: ${String(error)}`);
    }
  }

  async function manualRetryCouponAutomationFailure(id: string) {
    if (couponAutomationBusy) return;
    setCouponAutomationBusy(true);
    try {
      const result = await callApi("/api/integrations/coupang/coupons/manual-retry", { id });
      await fetchCouponAutomationFailures();
      setCouponMessage(result.message || "실패 단계부터 수동 재실행했습니다.");
      setMessage(result.message || "쿠폰 수동 재실행 완료");
    } catch (error) {
      setCouponMessage(`쿠폰 수동 재실행 실패: ${String(error)}`);
    } finally {
      setCouponAutomationBusy(false);
    }
  }

  async function deleteRollingCouponTemplate(templateId: string) {
    const target = rollingCouponTemplates.find((template) => template.id === templateId);
    if (!window.confirm(`반복대상 ${target?.couponName || templateId}을 삭제할까요? 현재 쿠팡 쿠폰 자체는 취소되지 않습니다.`)) return;
    const nextTemplates = normalizeRollingCouponTemplates(rollingCouponTemplates).filter((template) => template.id !== templateId);
    const nextSettings = normalizeCouponApiSettings({ ...couponApiSettings, rollingTemplates: nextTemplates });
    try {
      await persistCouponAutomationState(nextTemplates, nextSettings);
      setCouponMessage("선택한 쿠폰 반복 설정을 삭제하고 Supabase에 자동 저장했습니다.");
    } catch (error) {
      setCouponMessage(`쿠폰 반복 설정 삭제 저장 실패: ${String(error)}`);
    }
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
    const nextSettings = normalizeCouponApiSettings({ ...couponApiSettings,
      selectedContractId: row.contractId,
      selectedCouponId: "",
      selectedCouponName: row.contractName || `contractId ${row.contractId}`,
      selectedCouponStartAt: row.startAt,
      selectedCouponEndAt: row.endAt,
      selectedMode: "new",
    });
    setCouponApiSettings(nextSettings);
    updateNewCouponDraft({ contractId: row.contractId });
    void persistCouponAutomationState(rollingCouponTemplates, nextSettings).then(() => {
      setCouponMessage(`신규 쿠폰 생성용 contractId=${row.contractId}를 선택하고 Supabase에 자동 저장했습니다.`);
    }).catch((error) => setCouponMessage(`계약 선택 자동저장 실패: ${String(error)}`));
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
        operationalFailures,
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
            status: "확인",
            detail: `${ip} / 이 IP가 쿠팡·토스 API 호출 출구입니다. 쿠팡·토스 진단이 HTTP 200이면 허용 IP는 실질 통과입니다.`,
          },
          {
            channel: "쿠팡",
            step: "IP 허용",
            status: "확인",
            detail: `쿠팡 진단을 실행해 HTTP 200이면 ${ip} 허용이 반영된 상태입니다. 401/403이면 허용 IP·인증정보를 확인하세요.`,
          },
          {
            channel: "토스",
            step: "IP 허용",
            status: "확인",
            detail: `토스 진단을 실행해 HTTP 200이면 ${ip} 허용이 반영된 상태입니다. 401/403이면 허용 IP·Bearer 인증을 확인하세요.`,
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
    setTemporaryVendorShipmentFiles([]);
    setTemporaryVendorInvoiceRecords([]);
    setShipmentUploadPreview(null);
    setLastShipmentResultArtifacts([]);
    setShipmentPreviewMessage("업체송장 임시자료를 초기화했습니다.");
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
    setMessage("권장 자동시간을 복원했습니다. 쿠폰 23:50 종료, 23:52 신규 발행, 저장소 03:20 정리 기준입니다.");
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

  async function retryOperationalFailure(row: OperationalFailureRow) {
    if (failureCenterBusyId) return;
    setFailureCenterBusyId(row.id);
    updateOperationalFailure(row.id, {
      status: "재시도중",
      attemptCount: row.attemptCount + 1,
    });
    let success = false;
    try {
      if (row.kind === "order_lookup" && row.channel) {
        success = Boolean(await previewSelectablePaymentOrders());
      } else if (row.kind === "order_collect" && row.channel) {
        success = Boolean(await collectApiOrders(row.channel, "purchase"));
      } else if (row.kind === "purchase_export") {
        success = Boolean(await exportAllPurchases());
      } else if (row.kind === "shipment_preview") {
        success = Boolean(await runShipmentUploadAll());
      } else if (row.kind === "shipment_upload") {
        success = Boolean(await finalizeShipmentUpload());
      }
      updateOperationalFailure(row.id, {
        status: success ? "해결" : "수동확인",
        detail: success ? "재시도에 성공했습니다." : "재시도 조건이 부족하거나 같은 오류가 반복됐습니다. 입력자료를 확인하세요.",
      });
    } catch (error) {
      updateOperationalFailure(row.id, {
        status: "수동확인",
        detail: String(error),
      });
    } finally {
      setFailureCenterBusyId("");
    }
  }

  function resolveOperationalFailureManually(id: string) {
    updateOperationalFailure(id, { status: "해결", detail: "운영자가 확인 완료로 처리했습니다." });
  }

  function clearResolvedOperationalFailures() {
    setOperationalFailures((prev) => prev.filter((row) => row.status !== "해결"));
    setMessage("해결 완료된 일반 실패기록을 화면에서 정리했습니다. 서버 운영로그는 유지됩니다.");
  }

  async function refreshOperationControl() {
    await Promise.allSettled([refreshApiOverview(false, true), fetchCouponAutomationFailures()]);
    setMessage("쿠팡·토스 현재 주문상태를 새로고침했습니다.");
  }

  async function exportDailyOperationReport() {
    const blob = await createXlsxBlob([
      {
        name: "오늘운영요약",
        rows: [
          ["기준일", today()],
          ["결제완료", operationStatusRows.payment.length],
          ["수집완료", operationStatusRows.collected.length],
          ["상품준비중", operationStatusRows.preparing.length],
          ["배송중", operationStatusRows.shipping.length],
          ["배송완료", operationStatusRows.delivered.length],
          ["주소 차단", addressQualityBlocked.length],
          ["주소 주의", addressQualityWarnings.length],
          ["자동감시 저장 실패", unresolvedAdminPlusWatchSaveFailures.length],
          ["가격 변동 감지", openAdminPlusPriceAlerts.length],
        ],
      },
      {
        name: "운영점검",
        rows: [["항목", "상태", "내용"], ...dailyOperationRows.map((row) => [row.item, row.status, row.detail])],
      },
      {
        name: "주소품질",
        rows: [
          ["등급", "채널", "주문번호", "수취인", "검사항목", "주소", "내용"],
          ...addressQualityIssues.map((row) => [row.level, row.channel, row.orderNo, row.receiverName, row.item, row.address, row.detail]),
        ],
      },
      {
        name: "실패재처리",
        rows: [
          ["상태", "분류", "작업", "채널", "시도", "발생시각", "최근내용"],
          ...operationalFailures.map((row) => [row.status, row.category, row.title, row.channel || "공통", row.attemptCount, row.createdAt, row.detail]),
        ],
      },
    ]);
    saveBlobWithDownload(`B2B_일일운영점검_${today()}.xlsx`, blob);
    setMessage("일일 운영점검 보고서를 다운로드했습니다.");
  }

  async function exportAddressQualityReport() {
    const blob = await createXlsxBlob([{
      name: "주소품질검사",
      rows: [
        ["등급", "채널", "주문번호", "수취인", "검사항목", "주소", "내용"],
        ...addressQualityIssues.map((row) => [row.level, row.channel, row.orderNo, row.receiverName, row.item, row.address, row.detail]),
      ],
    }]);
    saveBlobWithDownload(`주소품질검사_${today()}.xlsx`, blob);
    setMessage(`주소 품질검사 ${addressQualityIssues.length}건을 다운로드했습니다.`);
  }

  function renderOrderSelectionPanel() {
    if (!selectableOrderChannel && !selectableOrderRows.length) return null;
    const mappingLookup = buildMappingMap(mappings);
    const selectedCoupang = selectableOrderRows.filter((row) => row.channel === "쿠팡" && selectedOrderIds.includes(row.id)).length;
    const selectedToss = selectableOrderRows.filter((row) => row.channel === "토스" && selectedOrderIds.includes(row.id)).length;
    return (
      <section className="order-selection-panel">
        <div className="order-selection-head">
          <strong>쿠팡+토스 결제완료 선택수집</strong>
          <span>{orderSelectionMessage}</span>
        </div>
        <div className="order-selection-actions">
          <button type="button" className="secondary" disabled={!selectableOrderRows.length || orderSelectionBusy} onClick={() => setSelectedOrderIds(selectableOrderRows.map((row) => row.id))}>전체체크</button>
          <button type="button" className="secondary" disabled={!selectedOrderIds.length || orderSelectionBusy} onClick={() => setSelectedOrderIds([])}>체크해제</button>
          <button type="button" className="btn-run" disabled={!selectedOrderIds.length || orderSelectionBusy} onClick={collectSelectedPaymentOrders}>선택 수집 {selectedOrderIds.length}건</button>
        </div>
        {!!selectedOrderIds.length && <p className="order-selection-counts">선택: 쿠팡 {selectedCoupang}건 · 토스 {selectedToss}건</p>}
        {selectableOrderRows.length > 0 && (
          <div className="order-selection-list">
            {selectableOrderRows.map((row) => {
              const mapped = Boolean(findMappingForOrder(row, mappingLookup));
              return (
                <label key={row.id} className={`order-selection-item${mapped ? "" : " order-selection-item-new"}`}>
                  <input type="checkbox" checked={selectedOrderIds.includes(row.id)} onChange={() => toggleSelectableOrder(row.id)} />
                  <span>
                    <b className={`order-channel-badge ${row.channel === "쿠팡" ? "coupang" : "toss"}`}>{row.channel}</b>
                    {!mapped && <b className="new-product-badge">신규·미매핑</b>}
                    {`${[row.productName, row.optionName].filter(Boolean).join(" / ") || "상품명 없음"} · 구매수량 ${Math.max(1, toNumber(row.qty, 1)).toLocaleString()}개`}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderTemporaryShipmentPanel() {
    const selectedCount = temporaryVendorShipmentFiles.length;
    const readyCount = shipmentUploadPreview?.readyRows.length || 0;
    if (!selectedCount && !shipmentUploadPreview) return null;
    return (
      <section className="shipment-temp-panel shipment-temp-panel-compact" aria-live="polite">
        <div className="shipment-temp-summary">
          <div>
            <strong>선택 업체송장 {selectedCount}개</strong>
            <span>유효 송장 {temporaryVendorInvoiceRecords.length}행</span>
          </div>
          {selectedCount > 0 && (
            <button
              type="button"
              className="secondary"
              disabled={shipmentUploadBusy}
              onClick={() => {
                setTemporaryVendorShipmentFiles([]);
                setTemporaryVendorInvoiceRecords([]);
                setShipmentUploadPreview(null);
                setShipmentPreviewMessage("임시 업체송장을 삭제했습니다.");
              }}
            >
              임시파일 삭제
            </button>
          )}
        </div>
        {selectedCount > 0 && <p className="shipment-temp-files">{temporaryVendorShipmentFiles.map((file) => file.name).join(" / ")}</p>}
        <p className="shipment-temp-message">{shipmentPreviewMessage}</p>
        {shipmentUploadPreview && (
          <div className="shipment-preview-confirm">
            <div className="shipment-preview-metrics">
              <span>상품준비중 <strong>{shipmentUploadPreview.preparingOrderCount}건</strong></span>
              <span>쿠팡 준비 <strong>{shipmentUploadPreview.counts.coupang}건</strong></span>
              <span>토스 준비 <strong>{shipmentUploadPreview.counts.toss}건</strong></span>
              <span>확인필요 <strong>{shipmentUploadPreview.counts.unmatched}건</strong></span>
            </div>
            <div className="shipment-preview-table-wrap">
              <table className="shipment-preview-table">
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>채널</th>
                    <th>주문번호</th>
                    <th>수취인</th>
                    <th>택배사</th>
                    <th>운송장번호</th>
                    <th>매칭방식</th>
                  </tr>
                </thead>
                <tbody>
                  {shipmentUploadPreview.previewRows.slice(0, 50).map((row) => (
                    <tr key={row.id}>
                      <td>{row.status}</td>
                      <td>{row.channel}</td>
                      <td>{row.orderNo}</td>
                      <td>{row.receiverName}</td>
                      <td>{row.courier}</td>
                      <td>{row.trackingNo}</td>
                      <td>{row.matchMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shipmentUploadPreview.previewRows.length > 50 && (
                <p className="muted">화면에는 50건만 표시하며 전체 결과는 다운로드 엑셀에 포함됩니다.</p>
              )}
            </div>
            <div className="actions shipment-final-actions">
              <button
                type="button"
                className="btn-run"
                disabled={!readyCount || shipmentUploadBusy}
                onClick={finalizeShipmentUpload}
              >
                {shipmentUploadBusy ? "업로드 처리 중" : `최종 업로드 ${readyCount}건`}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={shipmentUploadBusy}
                onClick={() => {
                  setShipmentUploadPreview(null);
                  setShipmentPreviewMessage("매칭 미리보기를 취소했습니다. 임시 송장파일은 유지됩니다.");
                }}
              >
                미리보기 취소
              </button>
            </div>
          </div>
        )}
        {lastShipmentResultArtifacts.length > 0 && (
          <button
            type="button"
            className="btn-download shipment-redownload"
            disabled={shipmentUploadBusy}
            onClick={() => downloadShipmentResultArtifacts(lastShipmentResultArtifacts)}
          >
            전체처리 결과파일 다시 다운로드
          </button>
        )}
      </section>
    );
  }

  function renderOperationMetricDetail() {
    if (!operationMetricDetail) return null;
    const source = operationMetricDetail === "collected" ? operationStatusRows.collected
      : operationMetricDetail === "payment" ? operationStatusRows.payment
      : operationMetricDetail === "preparing" ? operationStatusRows.preparing
      : operationMetricDetail === "shipping" ? operationStatusRows.shipping
      : operationMetricDetail === "delivered" ? operationStatusRows.delivered : [];
    const title = operationMetricDetail === "collected" ? "수집완료(AdminPlus 발주완료·결제 전)" : operationMetricDetail === "payment" ? "결제완료(쿠팡 ACCEPT·토스 PAID)" : operationMetricDetail === "preparing" ? "상품준비중" : operationMetricDetail === "shipping" ? "배송중" : "배송완료";
    const headers = ["채널", "주문번호", "상품", "옵션", "수량", "현재상태"];
    const rows = source.map((row) => [row.channel, row.orderNo, row.productName, row.optionName || "-", row.qty, row.orderStatus || "-"]);
    return <section className="operation-metric-detail" aria-live="polite"><div className="operation-section-head"><div><h3>{title}</h3><p className="muted">상단 숫자와 동일한 API 현재상태 자료 {rows.length.toLocaleString()}건입니다.</p></div><button type="button" className="secondary" onClick={() => setOperationMetricDetail("")}>목록 닫기</button></div>{rows.length ? <DataTable headers={headers} rows={rows.slice(0, 300)} /> : <p className="operation-empty">해당 현황이 없습니다.</p>}</section>;
  }

  function renderOperationControlPanel() {
    return (
      <section className="panel operation-control-panel">
        <div className="operation-control-head"><div><p className="eyebrow">Daily Operation Control</p><h2>일일 운영 점검판</h2><p className="muted">결제완료(쿠팡 ACCEPT·토스 PAID) → 수집완료(AdminPlus 발주 성공·결제 전) → 상품준비중 → 배송중 → 배송완료 흐름을 표시합니다.</p></div><div className="actions"><button type="button" className="btn-check" disabled={apiOverviewBusy} onClick={refreshOperationControl}>{apiOverviewBusy ? "조회중" : "주문상태 새로고침"}</button><button type="button" className="btn-download" onClick={exportDailyOperationReport}>마감보고서 다운로드</button></div></div>
        <div className="operation-control-metrics operation-status-metrics">
          <button type="button" onClick={() => setOperationMetricDetail(operationMetricDetail === "payment" ? "" : "payment")}><span>결제완료</span><strong>{operationStatusRows.payment.length.toLocaleString()}건</strong><small>마켓 결제완료</small></button>
          <button type="button" onClick={() => setOperationMetricDetail(operationMetricDetail === "collected" ? "" : "collected")}><span>수집완료</span><strong>{operationStatusRows.collected.length.toLocaleString()}건</strong><small>AdminPlus 발주·미결제</small></button>
          <button type="button" onClick={() => setOperationMetricDetail(operationMetricDetail === "preparing" ? "" : "preparing")}><span>상품준비중</span><strong>{operationStatusRows.preparing.length.toLocaleString()}건</strong><small>목록 보기</small></button>
          <button type="button" onClick={() => setOperationMetricDetail(operationMetricDetail === "shipping" ? "" : "shipping")}><span>배송중</span><strong>{operationStatusRows.shipping.length.toLocaleString()}건</strong><small>목록 보기</small></button>
          <button type="button" onClick={() => setOperationMetricDetail(operationMetricDetail === "delivered" ? "" : "delivered")}><span>배송완료</span><strong>{operationStatusRows.delivered.length.toLocaleString()}건</strong><small>목록 보기</small></button>
        </div>
        <div className="operation-control-metrics operation-watch-metrics">
          <button type="button" className={unresolvedAdminPlusWatchSaveFailures.length ? "metric-danger" : ""} onClick={() => { setActiveMenu("매핑관리"); setMappingWorkspaceView("adminplus"); }}>
            <span>자동감시 저장 실패</span><strong>{unresolvedAdminPlusWatchSaveFailures.length.toLocaleString()}건</strong><small>{unresolvedAdminPlusWatchSaveFailures.length ? "확인 필요" : "정상"}</small>
          </button>
          <button type="button" className={openAdminPlusPriceAlerts.length ? "metric-warning" : ""} onClick={() => { setActiveMenu("매핑관리"); setMappingWorkspaceView("adminplus"); }}>
            <span>가격 변동 감지</span><strong>{openAdminPlusPriceAlerts.length.toLocaleString()}건</strong><small>{openAdminPlusPriceAlerts.length ? "가격 확인" : "정상"}</small>
          </button>
        </div>
        {renderOperationMetricDetail()}
        <details className="advanced-details operation-detail-section"><summary>주소 품질검사 · 차단 {addressQualityBlocked.length}건 / 주의 {addressQualityWarnings.length}건</summary><div className="advanced-details-body"><div className="operation-control-section"><div className="operation-section-head"><div><h3>주소 품질검사</h3><p className="muted">발주 전 주소 이상 여부를 별도 확인합니다.</p></div><button type="button" className="btn-download" disabled={!addressQualityIssues.length} onClick={exportAddressQualityReport}>검사결과 다운로드</button></div>{addressQualityIssues.length ? <DataTable headers={["등급", "채널", "주문번호", "수취인", "검사항목", "주소", "내용"]} rows={addressQualityIssues.slice(0,100).map((row) => [row.level,row.channel,row.orderNo,row.receiverName,row.item,row.address,row.detail])} /> : <p className="operation-empty">현재 주소 품질 문제가 없습니다.</p>}</div></div></details>
      </section>
    );
  }

  return (
    <main>
      <header className="app-header simplified-header">
        <div>
          <p className="eyebrow">B2B</p>
          <h1>B2B 자동화 시스템</h1>
          <p className="header-version">{APP_VERSION}</p>
        </div>
        <span className="service-status-pill">Ncloud API 연결 운영</span>
      </header>

      <nav className="tabs" aria-label="주요 메뉴">
        {MENUS.map((menu) => (
          <button
            key={menu.key}
            type="button"
            className={activeMenu === menu.key ? "active" : ""}
            onClick={() => setActiveMenu(menu.key)}
          >
            {menu.label}
          </button>
        ))}
      </nav>

      <section className="notice" aria-live="polite">
        {message}
      </section>
      {unresolvedAdminPlusWatchSaveFailures.length > 0 && (
        <section className="warning-box compact-notice adminplus-save-failure-notice">
          <div className="notice-copy">
            <strong>서버 저장 미확인 {unresolvedAdminPlusWatchSaveFailures.length}건</strong>
            <span>새 편집값의 서버 저장을 확인하지 못했습니다. 자동발주·가격감시는 <strong>마지막 서버 확정값</strong>을 계속 사용합니다.</span>
            <small>{unresolvedAdminPlusWatchSaveFailures.slice(0,3).map((row)=>`${row.title}${row.channel ? ` · ${row.channel}` : ""}`).join(" / ")}</small>
          </div>
          <button type="button" className="btn-check" onClick={() => { setShowAdminPlusFailureDetails((prev) => !prev); setActiveMenu("매핑관리"); setMappingWorkspaceView("adminplus"); }}>{showAdminPlusFailureDetails ? "실패 상세 닫기" : "실패 상세 확인"}</button>
        </section>
      )}
      {showAdminPlusFailureDetails && unresolvedAdminPlusWatchSaveFailures.length > 0 && (
        <section className="panel adminplus-failure-detail-panel" aria-live="polite">
          <div className="operation-section-head"><div><h3>서버 저장 실패 상세</h3><p className="muted">아래는 실패 로그입니다. 자동발주에는 마지막 서버 확정값이 계속 사용됩니다.</p></div></div>
          <DataTable headers={["발생/갱신시각","작업","채널","상태","시도","오류내용"]} rows={unresolvedAdminPlusWatchSaveFailures.map((row) => [formatCredentialExpiry(row.updatedAt || row.createdAt), row.title, row.channel || "공통", row.status, row.attemptCount, row.detail])} />
        </section>
      )}
      {adminplusPriceAlerts.some((row) => !row.acknowledgedAt) && (
        <section className="warning-box compact-notice">
          <div className="notice-copy">
            <strong>AdminPlus 상품상태·가격 확인 {adminplusPriceAlerts.filter((row)=>!row.acknowledgedAt).length}건</strong>
            <span>
              가격변동 {adminplusPriceAlerts.filter((row)=>!row.acknowledgedAt && (!row.alertKind || row.alertKind==="가격변동")).length}건 ·
              품절/판매중지 {adminplusPriceAlerts.filter((row)=>!row.acknowledgedAt && row.alertKind==="품절").length}건 ·
              재확정대기 {adminplusPriceAlerts.filter((row)=>!row.acknowledgedAt && row.alertKind==="재확정대기").length}건 ·
              조회확인필요 {adminplusPriceAlerts.filter((row)=>!row.acknowledgedAt && row.alertKind==="조회확인필요").length}건 ·
              상품명변경 {adminplusPriceAlerts.filter((row)=>!row.acknowledgedAt && row.alertKind==="상품명변경").length}건
            </span>
          </div>
          <button type="button" className="btn-check" onClick={() => { setActiveMenu("매핑관리"); setMappingWorkspaceView("adminplus"); }}>상품상태·가격 확인</button>
        </section>
      )}

      {activeMenu === "매핑관리" && (
        <nav className="workspace-subtabs" aria-label="매핑·발주 작업 선택">
          <button type="button" className={mappingWorkspaceView === "mapping" ? "active" : ""} onClick={() => setMappingWorkspaceView("mapping")}>상품 매핑</button>
          <button type="button" className={mappingWorkspaceView === "adminplus" ? "active" : ""} onClick={() => setMappingWorkspaceView("adminplus")}>API 상품매칭</button>
          <button type="button" className={mappingWorkspaceView === "catalogSearch" ? "active" : ""} onClick={() => setMappingWorkspaceView("catalogSearch")}>API 상품검색</button>
          <button type="button" className={mappingWorkspaceView === "forms" ? "active" : ""} onClick={() => setMappingWorkspaceView("forms")}>엑셀 양식</button>
          <button type="button" className={mappingWorkspaceView === "purchase" ? "active" : ""} onClick={() => setMappingWorkspaceView("purchase")}>발주 파일</button>
        </nav>
      )}

      {activeMenu === "간편운영" && (
        <>
          <section className="panel simple-operation-panel">
            <div className="flow-grid simple-operation-actions">
              <button type="button" className="btn-api unified-order-lookup" disabled={orderSelectionBusy} onClick={previewSelectablePaymentOrders}>{orderSelectionBusy ? "쿠팡+토스 조회중" : "쿠팡+토스 주문조회"}</button>
              <button type="button" className="btn-run" disabled={!selectedOrderIds.length || orderSelectionBusy} onClick={collectSelectedPaymentOrders}>선택 주문 수집</button>
              <label className="file-button btn-upload">
                업체송장 선택
                <input type="file" accept=".xlsx,.xls,.csv,text/csv" multiple disabled={shipmentUploadBusy} onChange={handleVendorShipmentFilesToPurchase} />
              </label>
              <button type="button" className="btn-run" disabled={shipmentUploadBusy} onClick={runShipmentUploadAll}>쿠팡+토스 업로드</button>
              <button type="button" className="secondary" onClick={() => setShowOrderDetails((value) => !value)}>{showOrderDetails ? "상세 주문 닫기" : "상세 주문 열기"}</button>
            </div>
          </section>

          {renderOrderSelectionPanel()}
          {renderTemporaryShipmentPanel()}

          <section className="api-overview-toolbar api-overview-toolbar-inline">
            <span>{apiOverviewMessage}</span>
            <div className="actions api-overview-inline-controls">
              <label>시작일 <input type="date" value={orderApiFilter.startDate} onChange={(event) => setOrderApiFilter((prev) => ({ ...prev, startDate: event.target.value }))} /></label>
              <span>~</span>
              <label>종료일 <input type="date" value={orderApiFilter.endDate} onChange={(event) => setOrderApiFilter((prev) => ({ ...prev, endDate: event.target.value }))} /></label>
              <button type="button" className="btn-check" disabled={apiOverviewBusy} onClick={() => refreshApiOverview(true, true)}>{apiOverviewBusy ? "조회중" : "현황 새로고침"}</button>
            </div>
          </section>
          <details className="advanced-details channel-overview-details">
            <summary>채널별 주문현황 보기</summary>
            <div className="advanced-details-body">
          <section className="metrics channel-operation-metrics">
            <div>
              <span>쿠팡 결제완료</span>
              <strong>{apiOverviewCounts.coupangPayment.toLocaleString()}건</strong>
            </div>
            <div>
              <span>토스 결제완료</span>
              <strong>{apiOverviewCounts.tossPayment.toLocaleString()}건</strong>
            </div>
            <div>
              <span>쿠팡 상품준비중</span>
              <strong>{apiOverviewCounts.coupangPreparing.toLocaleString()}건</strong>
            </div>
            <div>
              <span>토스 상품준비중</span>
              <strong>{apiOverviewCounts.tossPreparing.toLocaleString()}건</strong>
            </div>
          </section>            </div>
          </details>

          {renderOperationControlPanel()}
        </>
      )}

      {activeMenu === "간편운영" && showOrderDetails && (
        <section className="panel">
          <PanelHead
            title="주문관리"
            desc="수집·발주·송장 업로드"
          />
          <section className="info-box compact-order-flow-note">
            <strong>주문수집 운영</strong>
            <span className="muted">주문수집 버튼을 누르면 이전 수집결과와 발주파일 표시를 자동 초기화한 뒤, 현재 조회조건 기준으로 새 주문만 표시합니다.</span>
          </section>
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
              className="btn-api unified-order-lookup"
              disabled={orderSelectionBusy}
              onClick={previewSelectablePaymentOrders}
            >
              {orderSelectionBusy ? "쿠팡+토스 조회중" : "쿠팡+토스 주문조회"}
            </button>
            <button
              type="button"
              className="btn-run"
              disabled={!selectedOrderIds.length || orderSelectionBusy}
              onClick={collectSelectedPaymentOrders}
            >
              선택 주문 수집
            </button>
            <label className="file-button btn-upload">
              업체송장 선택
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                multiple
                disabled={shipmentUploadBusy}
                onChange={handleVendorShipmentFilesToPurchase}
              />
            </label>
            <button
              type="button"
              className="btn-download"
              onClick={exportMissingMappings}
            >
              미매핑 엑셀
            </button>

            <button
              type="button"
              className="btn-api"
              disabled={shipmentUploadBusy}
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
          {renderOrderSelectionPanel()}
          {renderTemporaryShipmentPanel()}
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
              <h2>진단 결과 요약</h2>
              <DataTable
                headers={["채널", "단계", "상태", "내용"]}
                rows={compactApiDiagnosticRows(apiDiagnosticRows).map((row) => [
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

      {activeMenu === "매핑관리" && mappingWorkspaceView === "mapping" && (
        <section className="panel">
          <PanelHead
            title="매핑관리"
            desc="매핑 엑셀을 업로드·병합하면 Supabase에 자동 저장되고, PC와 모바일에서 같은 매핑을 사용합니다."
          />

          <section className={`mapping-sync-banner${mappingSyncMessage.includes("실패") ? " error" : ""}`}>
            <div>
              <strong>{mappingSyncBusy ? "매핑 동기화 중" : "매핑 자동동기화"}</strong>
              <span>{mappingSyncMessage}</span>
            </div>
            <button type="button" className="secondary" disabled={mappingSyncBusy} onClick={() => void loadMappingsFromServer(false)}>
              서버 최신 매핑
            </button>
          </section>


          <div className="actions operation-actions">
            <label className="file-button btn-upload">
              매핑 엑셀 업로드·병합
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                onChange={handleMappingImport}
              />
            </label>
            <button type="button" className="btn-run" onClick={() => syncTossOptionIdsFromApi(true)}>
              토스 옵션
            </button>

            <button type="button" className="btn-run" onClick={recheckCurrentMappings}>
              재검사
            </button>
            <button type="button" className="btn-download" onClick={exportMissingMappings}>
              미매핑 파일
            </button>
          </div>
          <section className="info-box mapping-manual-section">
            <div className="operation-section-head">
              <div>
                <strong>수동 신규상품 추가</strong>
                <p className="muted">엑셀 없이 상품매핑을 직접 추가합니다. 쿠팡/토스의 실제 옵션ID가 필수이며 채널+옵션ID 중복은 저장하지 않습니다.</p>
              </div>
              <button type="button" className="btn-run" onClick={() => setManualMappingOpen((value) => !value)}>{manualMappingOpen ? "신규추가 닫기" : "신규 상품 추가"}</button>
            </div>
            {manualMappingOpen && (
              <div className="filter-box api-filter-box">
                <label>채널<select value={manualMappingDraft.channel} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,channel:event.target.value as Channel}))}><option>쿠팡</option><option>토스</option></select></label>
                <label>실제 옵션ID<input inputMode="numeric" value={manualMappingDraft.optionId} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,optionId:event.target.value.replace(/\D/g,"")}))} placeholder="쿠팡/토스 실제 옵션ID" /></label>
                <label>업체명<input value={manualMappingDraft.vendorName} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,vendorName:event.target.value}))} placeholder="발주업체명" /></label>
                <label>코드번호<input value={manualMappingDraft.vendorCode} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,vendorCode:event.target.value}))} placeholder="선택" /></label>
                <label>업체상품명<input value={manualMappingDraft.vendorProductName} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,vendorProductName:event.target.value}))} placeholder="B2B 발주처 상품명" /></label>
                <label>기본수량<input type="number" min="1" value={manualMappingDraft.baseQty} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,baseQty:Math.max(1,toNumber(event.target.value,1))}))} /></label>
                <label>배송비<input type="number" min="0" value={manualMappingDraft.shippingFee} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,shippingFee:Math.max(0,toNumber(event.target.value,0))}))} /></label>
                <label>기준단가<input type="number" min="0" value={manualMappingDraft.cost} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,cost:Math.max(0,toNumber(event.target.value,0))}))} /></label>
                <label>발주시간<input value={manualMappingDraft.purchaseTime} onChange={(event)=>setManualMappingDraft((prev)=>({...prev,purchaseTime:event.target.value}))} placeholder="08:40 또는 08:40, 13:30" /></label>
                <div className="actions"><button type="button" className="btn-save" onClick={saveManualNewMapping}>신규 상품 저장</button><button type="button" className="secondary" onClick={resetManualMappingDraft}>입력 초기화</button></div>
              </div>
            )}
            <p className="muted">API상품매핑된 옵션을 API 미연결 업체로 변경하면 기존 AdminPlus 확정링크를 해제하고 수동/엑셀 발주로 전환합니다. 새 업체의 코드번호·업체상품명은 다시 입력해야 하며, 기존 옵션ID·기본수량·배송비·기준단가·발주시간은 유지됩니다.</p>
          </section>
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
              <strong>미매핑 {missingMappings.length}건이 발주에서 제외됩니다.</strong> 토스는 먼저 <strong>토스 옵션</strong>를 누르세요. 앱이 토스 상품 API에서 실제 옵션ID와 옵션관리코드를 가져와 주문을 자동 보정합니다. 미매핑 파일을 내려받아 업체 정보를 입력한 뒤 매핑 엑셀 업로드·병합으로 반영하세요. 업체상품명에는 내 판매상품명이 아니라 B2B 발주처 상품명을 입력하세요.
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
                rows={tossOptionIdRows.slice(0, 20).map((row) => [row.productId || "-", row.optionId, row.stockId || "-", row.managementCode || row.optionCode || "-", row.itemName || "-", row.productName || "-"])}
              />
            </section>
          )}
          <section className="info-box mapping-schema-guide">
            <strong>엑셀 기준 UI</strong>
            <span>첨부한 `01-B2B 매핑양식.xlsx`와 같은 순서로 표시합니다. 기준구성원가는 기준단가 × 기본수량 + 배송비로 자동 계산하며 직접 입력하지 않습니다.</span>
          </section>
          <div className="table-wrap mapping-master-wrap">
            <table className="mapping-master-table">
              <thead>
                <tr>
                  <th>채널</th><th>옵션ID</th><th>업체명</th><th>코드번호</th><th>업체상품명</th>
                  <th>기본수량</th><th>배송비</th><th>기준단가</th><th>기준구성원가</th><th>발주시간</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((row) => {
                  const vendorStatus = vendorIntegrationStatus(row.vendorName);
                  const configuredCost = adminPlusConfiguredCost(row.cost, row.baseQty, row.shippingFee);
                  return (
                    <tr key={row.id}>
                      <td><select value={row.channel} onChange={(event) => updateMapping(row.id,{channel:event.target.value as Channel})}><option>쿠팡</option><option>토스</option></select></td>
                      <td><input className="mapping-option-input" value={row.optionId} onChange={(event)=>updateMapping(row.id,{optionId:event.target.value})}/></td>
                      <td>
                        <div className="mapping-vendor-cell">
                          <input value={row.vendorName} onChange={(event)=>updateMapping(row.id,{vendorName:event.target.value})} onBlur={(event)=>void commitMappingVendorTransition(row.id,event.currentTarget.value)}/>
                          <span className="service-status-pill mapping-vendor-status">{vendorStatus.mode}</span>
                          <button type="button" className="mapping-row-delete" title="매핑 행 삭제" aria-label={`${row.optionId} 매핑 삭제`} onClick={()=>void removeMappingRow(row.id)}>×</button>
                        </div>
                      </td>
                      <td><input className="mapping-code-input" value={row.vendorCode} onChange={(event)=>updateMapping(row.id,{vendorCode:event.target.value})}/></td>
                      <td><input className="mapping-product-input" value={row.vendorProductName} onChange={(event)=>updateMapping(row.id,{vendorProductName:event.target.value})}/></td>
                      <td><input className="mapping-qty-input" type="number" min="1" value={row.baseQty} onChange={(event)=>updateMapping(row.id,{baseQty:toNumber(event.target.value,1)})}/></td>
                      <td><input className="mapping-fee-input" type="number" min="0" value={row.shippingFee} onChange={(event)=>updateMapping(row.id,{shippingFee:toNumber(event.target.value,0)})}/></td>
                      <td><input className="mapping-price-input" type="number" min="0" value={row.cost} onChange={(event)=>updateMapping(row.id,{cost:toNumber(event.target.value,0)})}/></td>
                      <td><strong className="mapping-configured-cost">{configuredCost.toLocaleString()}원</strong></td>
                      <td><input className="mapping-time-input" type="text" defaultValue={normalizeOptionPurchaseTimes(row.purchaseTime).replace(",", ", ")} key={`${row.id}|${row.purchaseTime}`} placeholder="08:40, 13:30" onBlur={(event)=>commitMappingPurchaseTimes(row.id,event.target.value)}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeMenu === "매핑관리" && mappingWorkspaceView === "adminplus" && (
        <section className="panel">
          <PanelHead title="어드민플러스 API 상품매칭" desc="쿠팡·토스의 기존 옵션ID 매핑을 어드민플러스 실제 상품·옵션과 연결하고 공급가 변동을 감시합니다." />
          <section className="info-box">
            <strong>업체 발주방식 구분</strong>
            <p className="muted">AdminPlus 계정이 연결되고 자동발주가 켜진 업체는 API 발주, 나머지는 기존 수동/엑셀 발주를 유지합니다. API 업체 주문은 수동 발주파일에서 자동 제외해 중복발주를 막습니다.</p>
            <DataTable
              headers={["업체명", "매핑상품수", "발주방식", "연결정보"]}
              rows={Array.from(new Set(mappings.map((row) => row.vendorName).filter(Boolean))).sort().map((vendorName: string) => {
                const status = vendorIntegrationStatus(vendorName);
                return [vendorName, mappings.filter((row) => row.vendorName === vendorName).length, status.mode, status.detail];
              })}
            />
          </section>

          <div className="filter-box api-filter-box">
            <label>
              어드민플러스 계정
              <select value={adminplusCatalogAccountId} onChange={(event) => { setAdminplusCatalogAccountId(event.target.value); setAdminplusCatalogProducts([]); setAdminplusCatalogProductCode(""); setAdminplusCatalogOptionCode(""); setAdminplusCatalogMappingId(""); setAdminplusMatchSuggestions([]); setAdminplusMappingSearch(""); setAdminplusProductSearch(""); setAdminplusSuggestionSearch(""); }}>
                <option value="">계정 선택</option>
                <option value="__all__">전체계정 선택</option>
                {adminplusAccounts.filter((row) => row.enabled).map((row) => <option key={row.id} value={row.id}>{row.label} · {row.vendorName}</option>)}
              </select>
            </label>
            <label>
              웹앱 상품/옵션
              <select value={adminplusCatalogMappingId} onChange={(event) => {
                const mappingId = event.target.value;
                setAdminplusCatalogMappingId(mappingId);
                const mapping = mappings.find((row) => row.id === mappingId);
                if (mapping) {
                  setAdminplusCatalogQty(Math.max(1, Number(mapping.baseQty || 1) || 1));
                  setAdminplusCatalogShippingFee(Math.max(0, Number(mapping.shippingFee || 0) || 0));
                }
                const matchedAccount = mapping ? adminplusAccounts.find((row) => row.enabled && normalizedVendorName(row.vendorName) === normalizedVendorName(mapping.vendorName)) : undefined;
                if (matchedAccount && matchedAccount.id !== adminplusCatalogAccountId) {
                  setAdminplusCatalogAccountId(matchedAccount.id);
                  setAdminplusCatalogProducts([]);
                  setAdminplusCatalogProductCode("");
                  setAdminplusCatalogOptionCode("");
                  setAdminplusMatchSuggestions([]);
                }
              }}>
                <option value="">매핑 선택</option>
                {mappingRowsForAdminPlusAccount().map((row) => <option key={row.id} value={row.id}>{row.channel} · {row.optionId} · {row.vendorProductName || row.vendorName}</option>)}
              </select>
            </label>
            <label>
              엑셀매핑 검색
              <input value={adminplusMappingSearch} onChange={(event) => setAdminplusMappingSearch(event.target.value)} placeholder="업체명·상품명·옵션ID·코드 검색" />
            </label>
            <button type="button" className="btn-check" disabled={adminplusCatalogBusy} onClick={() => void loadAdminPlusAccounts(false)}>계정 새로고침</button>
            <button type="button" className="btn-api" disabled={adminplusCatalogBusy || !adminplusCatalogAccountId || adminplusCatalogAccountId === "__all__"} onClick={() => void loadAdminPlusExcelMatchSuggestions()}>엑셀매핑 자동추천</button>
            <button type="button" className="btn-api adminplus-catalog-load-button" disabled={adminplusCatalogBusy || !adminplusCatalogAccountId} onClick={() => void loadAdminPlusCatalogProducts()}>상품목록 불러오기</button>
          </div>

          <section className="info-box adminplus-suggestion-box">
            <div className="actions">
              <strong>기존 엑셀매핑 자동추천 · 확인 후 확정</strong>
              <input className="adminplus-inline-search" value={adminplusSuggestionSearch} onChange={(event) => setAdminplusSuggestionSearch(event.target.value)} placeholder="후보 검색: 업체·상품·옵션ID·코드" />
            </div>
            <p className="muted">서버에 저장된 <strong>확정 매핑</strong>을 먼저 불러온 뒤 AdminPlus 실제 매칭과 비교합니다. <strong>옵션ID와 기본수량은 엑셀 매핑자료를 기준값</strong>으로 사용합니다. 같은 업체상품명을 여러 옵션ID가 공유하더라도 B2B는 옵션ID별 독립 매칭을 사용해 서로 다른 기본수량이 덮어써지지 않습니다. 표에서 발주시간·기본수량·배송비를 바꾸는 동안에는 <strong>임시 편집값</strong>일 뿐 실제 자동발주 값은 변경되지 않습니다. <strong>‘수정 확정’</strong>을 눌렀을 때만 AdminPlus 재검증 → 서버 저장 → 서버 재조회 검증을 통과한 값으로 교체됩니다. 발주시간은 <strong>09:00 또는 09:00,14:00처럼 최대 2개</strong>까지 입력할 수 있습니다.</p>
            {adminplusMatchSuggestions.length > 0 && (
              <div className="table-wrap adminplus-suggestion-wrap">
                <table className="adminplus-suggestion-table">
                  <thead><tr><th>채널</th><th>옵션ID</th><th>재확정 상태</th><th>발주시간</th><th>업체</th><th>최신 엑셀 기준</th><th>AdminPlus 추천/현재확정</th><th>변경사항</th><th>기본수량</th><th>배송비</th><th>현재구성원가</th></tr></thead>
                  <tbody>
                    {filteredAdminPlusSuggestionRows().map((row) => (
                      <tr key={row.id} className={row.status === "검색필요" || row.status === "복합매칭확인" ? "row-warning" : ""}>
                        <td>{row.channel}</td>
                        <td><strong>{row.optionId || "-"}</strong></td>
                        <td>
                          {row.status === "확정가능" ? <button type="button" className="btn-save" disabled={adminplusCatalogBusy} onClick={() => void confirmAdminPlusSuggestedMatch(row)}>{adminplusProductLinks.some((link) => link.id === `${row.channel}|${row.optionId}` && (link.accountId === row.accountId || normalizedVendorName(link.vendorName) === normalizedVendorName(row.vendorName))) ? "수정 확정" : "매칭 확정"}</button> : null}
                          {row.status === "검색필요" ? <button type="button" className="btn-check" disabled={adminplusCatalogBusy} onClick={() => useSuggestionInManualSelector(row)}>검색해서 선택</button> : null}
                          {row.status === "복합매칭확인" ? <span className="muted">1:N 확인</span> : null}
                          {row.status === "확정됨" ? <span>확정 완료</span> : null}
                        </td>
                        <td><input className="adminplus-time-input" type="text" value={row.purchaseTime || OPTION_PURCHASE_TIME_FALLBACK} placeholder="09:00,14:00" onChange={(event) => updateAdminPlusSuggestionCostFields(row.id, { purchaseTime: event.target.value })} /></td>
                        <td>{row.vendorName}</td>
                        <td><strong>{row.vendorProductName || "업체상품명 없음"}</strong>{row.vendorCode ? <><br /><span className="muted">코드 {row.vendorCode}</span></> : null}<br /><span className="muted">기준단가 {Number(row.excelBaselinePrice || 0).toLocaleString()}원</span></td>
                        <td>{row.productCode ? <>{row.productCode} · {row.productName}{row.optionCode ? <><br />옵션 {row.optionCode} · {row.optionName}</> : null}<br /><span className="muted">현재단가 {row.price.toLocaleString()}원</span></> : <span className="muted">추천 상품 없음 · 검색 필요</span>}{row.priorProductName && row.priorProductName !== row.productName ? <><br /><span className="draft-status">이전확정 {row.priorProductName}</span></> : null}</td>
                        <td><strong>{row.changeSummary || (row.status === "확정됨" ? "변경 없음" : "재확정 필요")}</strong><br /><span className="muted">{row.reason}</span></td>
                        <td><input className="adminplus-number-input" type="number" min={1} value={row.qty} onChange={(event) => updateAdminPlusSuggestionCostFields(row.id, { qty: Math.max(1, Number(event.target.value) || 1) })} /></td>
                        <td><input className="adminplus-number-input" type="number" min={0} value={row.shippingFee} onChange={(event) => updateAdminPlusSuggestionCostFields(row.id, { shippingFee: Math.max(0, Number(event.target.value) || 0) })} /></td>
                        <td>{row.productCode ? `${adminPlusConfiguredCost(row.price, row.qty, row.shippingFee).toLocaleString()}원` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {adminplusCatalogProducts.length > 0 && (
            <div className="filter-box api-filter-box">
              <label>
                AdminPlus 상품 검색
                <input value={adminplusProductSearch} onChange={(event) => setAdminplusProductSearch(event.target.value)} placeholder="상품명·상품코드·옵션명·옵션코드" />
              </label>
              <label>
                AdminPlus 상품
                <select value={adminplusCatalogProductCode} onChange={(event) => { setAdminplusCatalogProductCode(event.target.value); setAdminplusCatalogOptionCode(""); }}>
                  <option value="">상품 선택</option>
                  {filteredAdminPlusCatalogRows().map((row) => <option key={row.productCode} value={row.productCode}>{row.productCode} · {row.name} · {row.price.toLocaleString()}원</option>)}
                </select>
              </label>
              <label>
                AdminPlus 옵션
                <select value={adminplusCatalogOptionCode} onChange={(event) => setAdminplusCatalogOptionCode(event.target.value)}>
                  <option value="">{adminplusCatalogProducts.find((row) => row.productCode === adminplusCatalogProductCode)?.options.length ? "옵션 선택" : "옵션 없음"}</option>
                  {(adminplusCatalogProducts.find((row) => row.productCode === adminplusCatalogProductCode)?.options || []).map((row) => <option key={row.optionCode} value={row.optionCode}>{row.optionCode} · {row.optionName} · {row.stock}</option>)}
                </select>
              </label>
              <label className="compact-api-field">기본수량<input type="number" min={1} value={adminplusCatalogQty} onChange={(event) => setAdminplusCatalogQty(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label className="compact-api-field">배송비(원)<input type="number" min={0} value={adminplusCatalogShippingFee} onChange={(event) => setAdminplusCatalogShippingFee(Math.max(0, Number(event.target.value) || 0))} /></label>
              <label>구성원가<input value={adminPlusConfiguredCost(adminplusCatalogProducts.find((row) => row.productCode === adminplusCatalogProductCode)?.price || 0, adminplusCatalogQty, adminplusCatalogShippingFee).toLocaleString() + "원"} readOnly /></label>
              <button type="button" className="btn-save" disabled={adminplusCatalogBusy || !adminplusCatalogProductCode || !adminplusCatalogMappingId} onClick={() => void applyAdminPlusDirectProductMatch()}>매칭 저장·검증</button>
            </div>
          )}
          <p className="credential-message">{adminplusCatalogMessage}</p>
          {adminplusCatalogMessage.includes("추천 매핑 확정 실패") && (
            <p className="muted">
              수정 확정 실패 시 먼저 <strong>Ncloud 매칭 서버 리비전</strong>을 확인합니다. 구버전이면 Ncloud V229 이상을 배포해야 하며,
              리비전이 정상인데 validation 오류가 나면 아래 <strong>AdminPlus 상품 검색</strong>에서 상품과 실제 옵션을 직접 선택한 뒤 다시 확정하세요.
            </p>
          )}

          <section className="info-box adminplus-watch-box">
            <div className="actions">
              <strong>공급가 변동 감시</strong>
              <span className="muted">AdminPlus 미연결 {adminPlusUnlinkedMappings().length}건</span>
              <button type="button" className="btn-check" disabled={adminplusCatalogBusy || !adminplusProductLinks.length} onClick={() => void checkAdminPlusPricesNow()}>지금 가격확인</button>
              <button type="button" className="btn-save" disabled={adminplusAutomationBusy} onClick={() => void saveAdminPlusAutomationSettings()}>자동감시 설정 전체 서버저장</button>
            </div>
            <p className="muted"><strong>기준단가</strong>는 최신 엑셀에서 확정한 기준값입니다. <strong>현재단가</strong>는 마지막 <strong>지금 가격확인</strong>에서 AdminPlus API로 조회한 값입니다. <strong>엑셀매핑은 기준정보로 유지</strong>합니다. AdminPlus 연결이 없는 쿠팡/토스 옵션ID는 아래 <strong>AdminPlus 미연결</strong> 행의 업체·상품 영역을 눌러 전체 AdminPlus 상품에서 신규 편입할 수 있습니다. 이미 연결된 상품은 같은 영역을 눌러 공급처·상품을 교체합니다. 편입/교체해도 채널·옵션ID·엑셀매핑·발주시간·기본수량·배송비·기준단가는 유지됩니다. 아직 수정 확정되지 않은 엑셀상품은 옛 확정상품을 품절로 표시하지 않고 <strong>재확정대기</strong>로 표시하며, AdminPlus 상품조회가 0건이거나 보조조회가 실패한 경우에는 품절로 단정하지 않고 <strong>조회확인필요</strong>로 표시합니다.</p>
            <div className={`adminplus-save-status ${adminplusWatchSaveState.status}`} role="status" aria-live="polite">
              <strong>{adminplusWatchSaveState.status === "error" ? "저장 실패" : adminplusWatchSaveState.status === "success" ? "서버 저장 완료" : adminplusWatchSaveState.status === "saving" ? "서버 저장 중" : "서버 저장 상태"}</strong>
              <span>{adminplusWatchSaveState.message}{adminplusWatchSaveState.savedAt ? ` · ${formatCredentialExpiry(adminplusWatchSaveState.savedAt)}` : ""}</span>
            </div>
            <div className="table-wrap adminplus-watch-table-wrap">
              <table className="adminplus-watch-table">
                <thead><tr><th>채널</th><th>옵션ID</th><th>발주시간</th><th colSpan={2}>업체 · AdminPlus 상품 (클릭 교체)</th><th>옵션</th><th>기본수량</th><th>배송비</th><th>기준단가</th><th>현재단가</th><th>기준 구성원가</th><th>현재 구성원가</th><th>상태</th><th>확인</th></tr></thead>
                <tbody>
                  {adminplusProductLinks.map((row) => {
                    const draft = adminPlusProductLinkDraft(row);
                    const dirty = Boolean(adminplusProductLinkDrafts[row.id]);
                    return <tr key={row.id} className={dirty ? "row-warning" : ""}>
                      <td>{row.channel}</td>
                      <td>{row.optionId}</td>
                      <td><input className="adminplus-time-input" type="text" value={draft.purchaseTime} placeholder="09:00,14:00" onChange={(event) => updateAdminPlusProductLinkCostDraft(row.id, { purchaseTime: event.target.value })} /></td>
                      <td colSpan={2}>
                        <button
                          type="button"
                          className="btn-check"
                          style={{ width: "100%", textAlign: "left", whiteSpace: "normal" }}
                          disabled={adminplusCatalogBusy}
                          title="엑셀매핑은 유지하고 연결된 모든 AdminPlus 업체 상품에서 공급처·상품을 교체합니다."
                          onClick={() => openAdminPlusGlobalReplacement(row.id)}
                        >
                          <strong>{row.vendorName}</strong> · {row.productCode} · {row.productName}
                          <br /><small>클릭 → 전체 AdminPlus 업체 상품검색 · 엑셀매핑 유지</small>
                        </button>
                      </td>
                      <td>{row.optionName || "-"}</td>
                      <td><input className="adminplus-number-input" type="number" min={1} value={draft.qty} onChange={(event) => updateAdminPlusProductLinkCostDraft(row.id, { qty: Math.max(1, Number(event.target.value) || 1) })} /></td>
                      <td><input className="adminplus-number-input" type="number" min={0} value={draft.shippingFee} onChange={(event) => updateAdminPlusProductLinkCostDraft(row.id, { shippingFee: Math.max(0, Number(event.target.value) || 0) })} /></td>
                      <td>{row.baselinePrice.toLocaleString()}원</td>
                      <td>{row.currentPrice.toLocaleString()}원</td>
                      <td>{adminPlusConfiguredCost(row.baselinePrice, draft.qty, draft.shippingFee).toLocaleString()}원</td>
                      <td>{adminPlusConfiguredCost(row.currentPrice, draft.qty, draft.shippingFee).toLocaleString()}원</td>
                      <td>{row.priceStatus}{row.priceChangedAt ? ` · ${formatCredentialExpiry(row.priceChangedAt)}` : ""}{dirty ? <><br /><span className="draft-status">미저장 수정</span></> : null}</td>
                      <td><div className="actions vertical-actions"><button type="button" className="btn-save" disabled={adminplusCatalogBusy || !dirty} onClick={() => void saveAdminPlusProductLinkCost(row.id)}>감시기준 저장</button><button type="button" className="btn-check" disabled={row.priceStatus !== "변동" || dirty} onClick={() => void acceptAdminPlusPrice(row.id)}>현재가를 새 기준가로 적용</button></div></td>
                    </tr>;
                  })}
                  {adminPlusUnlinkedMappings().map((mapping) => (
                    <tr key={`unlinked|${mapping.id}`} className="row-warning">
                      <td>{mapping.channel}</td>
                      <td><strong>{mapping.optionId}</strong></td>
                      <td>{normalizeOptionPurchaseTimes(mapping.purchaseTime) || OPTION_PURCHASE_TIME_FALLBACK}</td>
                      <td colSpan={2}>
                        <button
                          type="button"
                          className="btn-check"
                          style={{ width: "100%", textAlign: "left", whiteSpace: "normal" }}
                          disabled={adminplusCatalogBusy}
                          title="엑셀매핑은 유지한 채 연결된 모든 AdminPlus 계정의 전체 상품에서 새 상품을 선택해 편입합니다."
                          onClick={() => openAdminPlusGlobalEnrollment(mapping.id)}
                        >
                          <strong>AdminPlus 미연결</strong> · 엑셀업체 {mapping.vendorName || "-"} · {mapping.vendorProductName || "상품명 없음"}
                          <br /><small>클릭 → 전체 AdminPlus 업체 상품검색 · 신규 편입 · 엑셀매핑 유지</small>
                        </button>
                      </td>
                      <td>-</td>
                      <td>{Math.max(1, Number(mapping.baseQty || 1) || 1)}</td>
                      <td>{Math.max(0, Number(mapping.shippingFee || 0) || 0).toLocaleString()}원</td>
                      <td>{Math.max(0, Number(mapping.cost || 0) || 0).toLocaleString()}원</td>
                      <td>-</td>
                      <td>{adminPlusConfiguredCost(mapping.cost, mapping.baseQty, mapping.shippingFee).toLocaleString()}원</td>
                      <td>-</td>
                      <td><strong>AdminPlus 미연결</strong></td>
                      <td><span className="muted">업체·상품 영역에서 편입</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openAdminPlusPriceAlerts.length > 0 && <DataTable headers={["최종변경시각","상태","업체","채널","옵션ID","엑셀 기준상품","AdminPlus 현재상품","안내","기본수량","배송비","기준단가","현재단가","기준구성원가","현재구성원가","차액"]} rows={openAdminPlusPriceAlerts.slice().reverse().map((row) => [formatCredentialExpiry(row.detectedAt), row.alertKind === "품절" ? "품절" : row.alertKind === "재확정대기" ? "재확정대기" : row.alertKind === "조회확인필요" ? "조회확인필요" : (row.alertKind || "가격변동"), row.vendorName, row.channel, row.optionId, row.expectedProductName || row.productName, row.actualProductName || "-", row.message || (row.alertKind === "상품명변경" ? "품절·대체상품 여부 확인" : "가격 변동 확인"), row.baseQty || 1, `${Number(row.shippingFee || 0).toLocaleString()}원`, `${row.oldPrice.toLocaleString()}원`, `${row.newPrice.toLocaleString()}원`, `${Number(row.oldConfiguredCost ?? adminPlusConfiguredCost(row.oldPrice, row.baseQty || 1, row.shippingFee || 0)).toLocaleString()}원`, `${Number(row.newConfiguredCost ?? adminPlusConfiguredCost(row.newPrice, row.baseQty || 1, row.shippingFee || 0)).toLocaleString()}원`, `${Number(row.configuredDifference ?? (adminPlusConfiguredCost(row.newPrice, row.baseQty || 1, row.shippingFee || 0) - adminPlusConfiguredCost(row.oldPrice, row.baseQty || 1, row.shippingFee || 0))).toLocaleString()}원`])} />}
          </section>
        </section>
      )}


      {activeMenu === "매핑관리" && mappingWorkspaceView === "catalogSearch" && (
        <section className="panel">
          <PanelHead
            title={adminplusReplacementTargetLinkId ? "AdminPlus 업체·상품 교체" : adminplusEnrollmentTargetMappingId ? "AdminPlus 미연결 상품 편입" : "AdminPlus 전체 업체 상품검색"}
            desc={adminplusReplacementTargetLinkId ? "공급가 감시 행의 엑셀매핑은 유지하고, 연결된 모든 AdminPlus 계정에서 새 업체·상품만 찾아 교체합니다." : adminplusEnrollmentTargetMappingId ? "쿠팡/토스 옵션ID와 엑셀매핑은 그대로 유지하고, 연결된 모든 AdminPlus 계정에서 신규로 연결할 업체·상품을 선택합니다." : "연결된 모든 AdminPlus API 업체 상품을 통합검색합니다. 기본값은 status=active 이면서 stock=unlimited인 상품만 표시하며 필요하면 전체 보기로 전환할 수 있습니다."}
          />
          {adminplusReplacementTargetLinkId ? (() => {
            const target = adminplusProductLinks.find((row) => row.id === adminplusReplacementTargetLinkId);
            return target ? <div className="adminplus-save-status saving" role="status">
              <strong>교체 대상</strong>
              <span>{target.channel} {target.optionId} · 기존 {target.vendorName} / {target.productCode} {target.productName} · 엑셀매핑/기준단가/수량/배송비/발주시간 유지</span>
              <button type="button" className="btn-check" disabled={adminplusCatalogBusy || adminplusGlobalSearchBusy} onClick={() => { setAdminplusReplacementTargetLinkId(""); setMappingWorkspaceView("adminplus"); }}>교체 취소 · 감시화면으로</button>
            </div> : null;
          })() : adminplusEnrollmentTargetMappingId ? (() => {
            const target = mappings.find((row) => row.id === adminplusEnrollmentTargetMappingId);
            return target ? <div className="adminplus-save-status saving" role="status">
              <strong>신규 편입 대상</strong>
              <span>{target.channel} {target.optionId} · 엑셀 {target.vendorName} / {target.vendorProductName || "상품명 없음"} · 엑셀매핑/기준단가/수량/배송비/발주시간 유지</span>
              <button type="button" className="btn-check" disabled={adminplusCatalogBusy || adminplusGlobalSearchBusy} onClick={() => { setAdminplusEnrollmentTargetMappingId(""); setMappingWorkspaceView("adminplus"); }}>편입 취소 · 감시화면으로</button>
            </div> : null;
          })() : null}
          <div className="filter-box api-filter-box adminplus-global-catalog-search">
            <label>
              상품명 직접검색
              <input
                autoFocus
                value={adminplusGlobalSearchQuery}
                onChange={(event) => setAdminplusGlobalSearchQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void searchAllAdminPlusProducts(); }}
                placeholder="1글자 이상 입력하세요. 예: 배, 귤, 복숭아"
              />
            </label>
            <button type="button" className="btn-api" disabled={adminplusGlobalSearchBusy || !text(adminplusGlobalSearchQuery).trim()} onClick={() => void searchAllAdminPlusProducts()}>
              {adminplusGlobalSearchBusy ? "전체 업체 검색중" : "전체 업체 상품검색"}
            </button>
            <label className="checkbox-row">
              <input type="checkbox" checked={adminplusGlobalSearchActiveUnlimitedOnly} onChange={(event) => setAdminplusGlobalSearchActiveUnlimitedOnly(event.target.checked)} />
              active + unlimited만 보기
            </label>
            <button type="button" className="btn-check" disabled={adminplusGlobalSearchBusy} onClick={() => { setAdminplusGlobalSearchQuery(""); setAdminplusGlobalSearchRows([]); setAdminplusGlobalSearchMessage("연결된 모든 AdminPlus 업체 상품을 상품명으로 통합검색합니다."); }}>
              검색초기화
            </button>
          </div>
          <p className="credential-message">{adminplusGlobalSearchMessage}</p>
          {adminplusGlobalSearchRows.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>업체</th><th>계정</th><th>상품코드</th><th>상품명</th><th>현재단가</th><th>재고</th><th>상태</th><th>옵션</th>{adminplusReplacementTargetLinkId || adminplusEnrollmentTargetMappingId ? <th>{adminplusEnrollmentTargetMappingId ? "편입" : "교체"}</th> : null}</tr></thead>
                <tbody>
                  {adminplusGlobalSearchRows.map((row, index) => {
                    const replacementKey = adminPlusGlobalReplacementKey(row);
                    const selectedOptionCode = adminplusGlobalReplacementOptionCodes[replacementKey] || (row.options?.length === 1 ? row.options[0].optionCode : "");
                    return <tr key={`${row.accountId}|${row.productCode}|${index}`}>
                      <td><strong>{row.vendorName || "-"}</strong></td>
                      <td>{row.accountLabel || row.accountId}</td>
                      <td>{row.productCode}</td>
                      <td><strong>{row.name}</strong></td>
                      <td>{Number(row.price || 0).toLocaleString()}원</td>
                      <td>{row.stock || "-"}</td>
                      <td>{row.status || "-"}</td>
                      <td>{(adminplusReplacementTargetLinkId || adminplusEnrollmentTargetMappingId) && row.options?.length > 1 ? <select value={selectedOptionCode} onChange={(event) => setAdminplusGlobalReplacementOptionCodes((prev) => ({ ...prev, [replacementKey]: event.target.value }))}><option value="">옵션 선택</option>{row.options.map((option) => <option key={option.optionCode} value={option.optionCode}>{option.optionCode} · {option.optionName} · {option.stock || "-"}</option>)}</select> : row.options?.length ? row.options.map((option) => `${option.optionCode} ${option.optionName}${option.stock ? `(${option.stock})` : ""}`).join(" / ") : "-"}</td>
                      {adminplusReplacementTargetLinkId ? <td><button type="button" className="btn-save" disabled={adminplusCatalogBusy || adminplusGlobalSearchBusy || (row.options?.length > 1 && !selectedOptionCode)} onClick={() => void replaceAdminPlusProductLinkFromGlobal(row)}>이 상품으로 교체</button></td> : adminplusEnrollmentTargetMappingId ? <td><button type="button" className="btn-save" disabled={adminplusCatalogBusy || adminplusGlobalSearchBusy || (row.options?.length > 1 && !selectedOptionCode)} onClick={() => void enrollAdminPlusProductLinkFromGlobal(row)}>이 상품으로 편입</button></td> : null}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">검색 결과가 없습니다. 1글자 이상 입력해 검색하세요.</p>
          )}
        </section>
      )}

      {activeMenu === "매핑관리" && mappingWorkspaceView === "forms" && (
        <section className="panel">
          <PanelHead
            title="양식설정"
            desc="발주·송장 양식을 등록·수정합니다."
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

      {activeMenu === "매핑관리" && mappingWorkspaceView === "purchase" && (
        <section className="panel">
          <PanelHead
            title="발주관리"
            desc="옵션ID 기준으로 업체별 발주양식에 분류합니다."
          />
          <section className="info-box purchase-guide-box">
            <h2>발주 작업 순서</h2>
            <ol className="purchase-guide-list">
              <li><strong>1. 발주 전 검사</strong> — 미매핑, 주소 오류, 이미 발주한 주문을 확인합니다.</li>
              <li><strong>2. 발주파일 만들기</strong> — 검사 통과 주문만 업체별 엑셀로 생성합니다.</li>
              <li><strong>3. 발주이력 기록</strong> — 생성된 주문을 기록해 같은 채널+주문번호+옵션ID가 다시 발주되는 것을 막습니다.</li>
            </ol>
            <p className="muted">발주 폴더는 생성된 업체별 발주엑셀과 채널 입력파일을 한곳에 모으는 선택 기능입니다. 폴더를 지정하지 않아도 브라우저 다운로드로 발주할 수 있습니다.</p>
          </section>
          <section className="folder-panel">
            <strong>발주파일 저장 위치(선택)</strong>
            <span>
              {folderNames.purchase
                ? `현재 폴더: ${folderNames.purchase}`
                : "현재 폴더: 미설정 · 클라우드 발주폴더 사용"}
            </span>
            <button
              type="button"
              className="btn-folder"
              onClick={() => pickManagedFolder("purchase")}
            >
              저장 폴더 선택
            </button>
          </section>
          <section className="b2b-shortcut-panel">
            <div className="b2b-shortcut-head">
              <div>
                <h2>B2B 바로가기</h2>
                <p>
                  모바일에서 업체를 누르면 로그인 페이지를 열고 저장된 로그인ID를 복사합니다. 비밀번호는 Chrome·삼성 인터넷의 비밀번호 관리자 자동완성을 사용합니다.
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
                    title={`${link.url}${link.loginId ? ` · 로그인ID 저장됨` : ""}`}
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
              1. 발주 전 검사
            </button>
            <button
              type="button"
              className="btn-download"
              onClick={exportAllPurchases}
            >
              2. 전체 발주파일 만들기
            </button>
            <button
              type="button"
              className="btn-download"
              onClick={() => exportChannelPurchase("쿠팡")}
            >
              쿠팡만 발주파일 만들기
            </button>
            <button
              type="button"
              className="btn-download"
              onClick={() => exportChannelPurchase("토스")}
            >
              토스만 발주파일 만들기
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => { if (window.confirm("발주이력을 초기화하면 중복발주 차단 기준도 사라집니다. 계속할까요?")) setPurchaseHistory([]); }}
            >
              발주이력 초기화(주의)
            </button>
          </div>
          <section className="notice">{folderMessage}</section>

          <section className="info-box">
            <h2>3. 발주완료 기록과 중복 차단</h2>
            <p className="muted">발주파일을 만든 주문을 기록합니다. 같은 채널+주문번호+옵션ID가 다시 조회돼도 다음 발주파일에서는 자동 제외되어 이중 주문을 막습니다. 정상 운영 중에는 초기화하지 마세요.</p>
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
              <strong>미매핑 주문 {missingMappings.length}건은 발주 파일에 포함되지 않습니다.</strong> 미매핑 엑셀을 내려받아 업체 정보를 입력한 뒤 매핑관리에서 다시 업로드하세요.
              <div className="actions compact-actions">
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
            title="쿠폰"
            desc="새 쿠폰 발행, 기존 쿠폰 반복등록, 24시간 자동운영을 작업 순서대로 배치했습니다."
          />

          <section className="notice compact-notice">
            <strong>운영 순서</strong> · 새 쿠폰은 옵션조회 → 사전검증 → 즉시 적용 순서입니다. 즉시 적용이 성공하면 24시간 반복대상으로 등록되고 이후 self-healing 스케줄러가 교체를 유지합니다. 사전검증은 입력값과 API 준비상태만 확인하며 쿠폰을 발행하지 않습니다.
          </section>

          <section className="info-box coupon-workflow-section coupon-new-registration-box">
            <div className="coupon-section-head">
              <div>
                <span className="coupon-step-number">1</span>
                <h2>새 쿠폰 직접 등록</h2>
                <p className="muted">계약과 옵션을 확인한 뒤 같은 영역에서 검증과 실제 적용까지 진행합니다.</p>
              </div>
              <button type="button" className="btn-api" disabled={couponAutomationBusy} onClick={fetchCoupangCouponContracts}>계약서 목록 불러오기</button>
            </div>

            {couponContractRows.length > 0 && (
              <div className="coupon-inline-subsection">
                <h3>계약서 선택</h3>
                <div className="table-wrap data-table-wrap">
                  <table>
                    <thead>
                      <tr><th>선택</th><th>contractId</th><th>계약명</th><th>상태</th><th>예산</th><th>기간</th></tr>
                    </thead>
                    <tbody>
                      {couponContractRows.map((row) => (
                        <tr key={row.contractId}>
                          <td><button type="button" className="btn-run" onClick={() => selectCoupangContract(row)}>이 계약 사용</button></td>
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
              </div>
            )}

            <div className="coupon-new-grid coupon-new-grid-compact">
              <label className="coupon-option-id-input">
                쿠팡 API 옵션ID
                <textarea
                  value={couponOptionLookupText}
                  onChange={(event) => {
                    setCouponOptionLookupText(event.target.value);
                    setNewCouponPreflightIssues([]);
                    setNewCouponPreflightAt("");
                  }}
                  placeholder={"95414687218\n95414687219"}
                  rows={4}
                />
              </label>
              <div className="coupon-selected-contract">
                <span>선택 계약</span>
                <strong>{newCouponDraft.contractId || couponApiSettings.selectedContractId || "계약서를 선택하세요"}</strong>
              </div>
              <label>
                최대 할인금액
                <input type="number" min="0" value={newCouponDraft.maxDiscountPrice || ""} onChange={(event) => updateNewCouponDraft({ maxDiscountPrice: toNumber(event.target.value, 0) })} placeholder="정률 할인일 때 입력" />
              </label>
              <div className="coupon-immediate-window">
                <span>즉시 적용기간</span>
                <strong>{immediateCouponWindowForUi(schedules).startAt} ~ {immediateCouponWindowForUi(schedules).endAt}</strong>
              </div>
            </div>

            <div className="actions coupon-new-actions coupon-linked-actions">
              <button type="button" className="btn-api" disabled={couponOptionLookupBusy || couponAutomationBusy} onClick={lookupCouponOptionIds}>{couponOptionLookupBusy ? "옵션 조회 중" : "API 옵션ID 조회"}</button>
              <button type="button" className="btn-check" disabled={couponOptionLookupBusy || newCouponBusy || couponAutomationBusy} onClick={runNewCouponPreflight}>신규 쿠폰 사전검증</button>
              <button type="button" className="btn-run" disabled={couponOptionLookupBusy || newCouponBusy || couponAutomationBusy} onClick={applyNewCouponNow}>즉시 적용</button>
            </div>

            {newCouponPreflightAt && (
              <p className={newCouponPreflightIssues.length ? "coupon-preflight-fail" : "coupon-preflight-pass"}>
                {newCouponPreflightIssues.length
                  ? `사전검증 실패: ${newCouponPreflightIssues.join(" / ")}`
                  : `사전검증 통과 (${newCouponPreflightAt}) · 아직 쿠폰은 발행되지 않았습니다. ‘즉시 적용’을 실행하면 24시간 반복대상으로 등록됩니다.`}
              </p>
            )}

            {couponOptionLookupRows.length > 0 && (
              <div className="coupon-inline-subsection">
                <h3>조회된 옵션별 쿠폰 조건</h3>
                <div className="table-wrap data-table-wrap coupon-option-entry-table">
                  <table>
                    <thead><tr><th>선택</th><th>API 옵션ID</th><th>매칭자료 업체상품명</th><th>판매가</th><th>상품명</th><th>쿠폰명</th><th>할인값</th><th>할인방식</th></tr></thead>
                    <tbody>
                      {couponOptionLookupRows.map((row) => (
                        <tr key={row.optionId} className={!row.apiVerified ? "row-warning" : ""}>
                          <td><input type="checkbox" checked={row.selected} disabled={!row.apiVerified} onChange={() => toggleNewCouponOption(row.optionId)} /></td>
                          <td>
                            <strong>{row.optionId}</strong>
                            <small>{row.apiVerified ? "API 확인" : row.error}</small>
                          </td>
                          <td>{row.vendorProductName || "매칭자료 없음 · 쿠폰 가능"}</td>
                          <td>{row.salePrice ? `${row.salePrice.toLocaleString()}원` : "-"}</td>
                          <td><input value={row.couponProductName} disabled={!row.apiVerified} onChange={(event) => updateNewCouponOption(row.optionId, { couponProductName: event.target.value })} placeholder="상품명" /></td>
                          <td><input value={row.couponName} disabled={!row.apiVerified} onChange={(event) => updateNewCouponOption(row.optionId, { couponName: event.target.value })} placeholder="쿠폰명" /></td>
                          <td><input type="number" min={row.discountType === "율" ? 1 : 10} max={row.discountType === "율" ? 99 : undefined} step={row.discountType === "율" ? 1 : 10} value={row.discountValue || ""} disabled={!row.apiVerified} onChange={(event) => updateNewCouponOption(row.optionId, { discountValue: toNumber(event.target.value, 0) })} placeholder={row.discountType === "율" ? "할인률 1~99" : "할인금액(10원 단위)"} /></td>
                          <td>
                            <select value={row.discountType} disabled={!row.apiVerified} onChange={(event) => updateNewCouponOption(row.optionId, { discountType: event.target.value as CouponOptionLookupRow["discountType"] })}>
                              <option value="금액">금액</option>
                              <option value="율">율</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="info-box coupon-workflow-section coupon-existing-registration-box">
            <div className="coupon-section-head">
              <div>
                <span className="coupon-step-number">2</span>
                <h2>24시간 관리에 아직 없는 기존 쿠폰</h2>
                <p className="muted">현재 24시간 반복대상과 옵션ID가 겹치지 않는 쿠폰만 표시합니다. 추가하면 원래 쿠폰 기간과 관계없이 이후부터 매일 24시간 단위로 취소·재발행합니다.</p>
              </div>
              <button type="button" className="btn-api" disabled={couponAutomationBusy} onClick={refreshCouponWorkspace}>{couponAutomationBusy ? "조회중" : "쿠폰 목록 새로고침"}</button>
            </div>

            <div className="coupon-filter-row">
              <label>
                표시 상태
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
              <span className="muted">활성·대기 쿠폰은 새로고침 시 함께 조회합니다.</span>
            </div>

            {couponCandidateRows.length > 0 ? (
              <div className="table-wrap data-table-wrap">
                <table>
                  <thead>
                    <tr><th>선택</th><th>반영상태</th><th>couponId</th><th>contractId</th><th>쿠폰명</th><th>상태</th><th>유형</th><th>운영할인값</th><th>기간</th></tr>
                  </thead>
                  <tbody>
                    {couponCandidateRows.map((row) => (
                      <tr key={row.couponId}>
                        <td><input type="checkbox" checked={selectedRollingCouponIds.includes(row.couponId)} onChange={() => toggleRollingCouponSelection(row.couponId)} /></td>
                        <td>추가 가능</td>
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
            ) : (
              <p className="muted coupon-empty-message">새로고침 후에도 목록이 비어 있으면 모든 활성 쿠폰이 이미 24시간 관리 중이거나 옵션ID를 확인하지 못한 상태입니다.</p>
            )}

            <div className="actions coupon-list-actions coupon-linked-actions">
              <button type="button" className="btn-run" disabled={couponAutomationBusy || !selectedRollingCouponIds.length} onClick={applySelectedCouponsAsRollingTemplates}>선택 항목 24시간 반복 시작</button>
              <button type="button" className="danger" disabled={couponAutomationBusy || !selectedRollingCouponIds.length} onClick={cancelSelectedActiveOrStandbyCoupons}>선택 쿠폰 실제 취소</button>
              <button type="button" className="btn-download" onClick={exportCouponRows}>쿠폰 현황 다운로드</button>
            </div>
            <p className="muted coupon-action-help">
              선택 항목 24시간 반복 시작은 적용상품 조회 → 사전검증 → 자동운영 활성화까지 한 번에 처리합니다. 옵션ID마다 실제 APPLIED 쿠폰 1개만 허용하며, 종료 직후에는 최소 30초 대기 후 다시 조회해 0개일 때만 발행합니다. 활성 쿠폰이 없는 옵션은 안전조회가 성공하면 즉시 발행합니다.
            </p>
          </section>

          <section className="info-box coupon-workflow-section coupon-rolling-section">
            <div className="coupon-section-head">
              <div>
                <span className="coupon-step-number">3</span>
                <h2>24시간 반복대상 관리</h2>
                <p className="muted">이 목록에 들어온 상품은 기존 쿠폰의 원래 기간과 무관하게 24시간 단위 자동운영 대상으로 관리됩니다.</p>
              </div>
              <div className="actions coupon-automation-actions">
                <button type="button" className="btn-check" title="설정·옵션ID·API 연결상태만 점검하며 쿠팡 쿠폰은 발행하지 않습니다." disabled={couponAutomationBusy || !rollingCouponTemplates.length} onClick={runCouponAutomationPreflight}>전체 사전검증(발행 안 함)</button>
                <button
                  type="button"
                  className="btn-run"
                  title="옵션ID 기준 실제 APPLIED를 확인하고 쿠폰이 없는 반복대상만 발행합니다. 기존 운영중 쿠폰은 종료하거나 교체하지 않습니다."
                  disabled={couponAutomationBusy || !rollingCouponTemplates.length}
                  onClick={issueAllMissingRollingCouponsNow}
                >
                  반복 전체 쿠폰발행
                </button>
                {rollingCouponTemplates.some((row) => rollingCouponStatusBucket(row) === "validated") ? (
                  <button type="button" className="btn-save" disabled={couponAutomationBusy} onClick={() => activateCouponAutomation()}>준비완료 자동운영 시작</button>
                ) : null}
                {couponApiSettings.automationEnabled ? (
                  <button type="button" className="danger" disabled={couponAutomationBusy} onClick={stopCouponAutomation}>자동운영 중지</button>
                ) : null}
              </div>
            </div>

            <DataTable
              headers={["자동운영", "실제 운영중", "발행대기", "확인필요", "미검증", "반복대상"]}
              rows={[[
                couponApiSettings.automationEnabled ? "사용" : "중지",
                `${rollingCouponTemplates.filter((row) => actualCouponStatusByTemplate.get(row.id)?.applied).length}개`,
                `${rollingCouponTemplates.filter((row) => { const bucket=rollingCouponStatusBucket(row); const actual=actualCouponStatusByTemplate.get(row.id); return !actual?.applied && row.enabled && (bucket === "active" || bucket === "validated"); }).length}개`,
                `${rollingCouponTemplates.filter((row) => !actualCouponStatusByTemplate.get(row.id)?.applied && rollingCouponStatusBucket(row) === "attention").length}개`,
                `${rollingCouponTemplates.filter((row) => !actualCouponStatusByTemplate.get(row.id)?.applied && rollingCouponStatusBucket(row) === "unverified").length}개`,
                `${rollingCouponTemplates.length}개 / 상품 ${rollingCouponTemplates.reduce((sum, row) => sum + row.options.length, 0)}건`,
              ]]}
            />

            <section className="notice compact-notice">
              쿠팡 자동운영: 매일 {schedules.couponPreflight.time} 사전점검 → 쿠폰은 {schedules.couponCancel.time} 종료 → {schedules.couponApply.time} 신규 발행 → 23:57 재확인 → 23:58 최종확인. 실제 APPLIED 쿠폰과 옵션ID를 기준으로 누락 옵션만 보완 발행하며 기존 운영 옵션은 중복 발행하지 않습니다. ‘반복 전체 쿠폰발행’은 정식 스케줄을 변경하지 않고 현재 APPLIED가 없는 반복대상만 즉시 발행합니다.
            </section>

            {rollingCouponTemplates.length > 0 ? (
              <div className="table-wrap data-table-wrap">
                <table>
                  <thead>
                    <tr><th>상태</th><th>다음 발행 쿠폰명</th><th>할인방식</th><th>할인값</th><th>정률 최대할인</th><th>변경 적용</th><th>상품수</th><th>확인사항</th></tr>
                  </thead>
                  <tbody>
                    {rollingCouponTemplates.map((template) => (
                      <tr key={template.id}>
                        <td>{(() => { const bucket=rollingCouponStatusBucket(template); const actual=actualCouponStatusByTemplate.get(template.id); const label=actual?.applied ? "운영중" : bucket === "attention" ? "확인필요" : template.automationState === "stopped" ? "중지" : template.enabled && (bucket === "active" || bucket === "validated") ? "발행대기" : "미검증"; return <><strong>{label}</strong><br /><small>{template.preflightStatus || "미검증"} {template.preflightAt || ""}</small></>; })()}</td>
                        <td>
                          <input
                            value={template.couponName}
                            aria-label={`${template.couponName || "쿠폰"} 반복발행 쿠폰명`}
                            placeholder="교체할 쿠폰명"
                            onChange={(event) => updateRollingCouponTemplate(template.id, { couponName: event.target.value, baseCouponName: event.target.value })}
                          />
                          <small className="coupon-technical-id">입력 변경은 ‘지금 쿠폰 교체’ 실행 시 서버에 확정 적용</small>
                          <small className="coupon-technical-id">기준 {template.sourceCouponId || "첫 발행 대기"} · 현재 {template.latestCouponId || "-"} · 계약 {template.contractId}</small>
                        </td>
                        <td>
                          <select value={template.discountType || "금액"} onChange={(event) => updateRollingCouponTemplate(template.id, { discountType: event.target.value as RollingCouponTemplate["discountType"] })}>
                            <option value="금액">정액(원)</option>
                            <option value="율">정률(%)</option>
                          </select>
                        </td>
                        <td><input type="number" min={template.discountType === "율" ? 1 : 10} max={template.discountType === "율" ? 99 : undefined} step={template.discountType === "율" ? 1 : 10} value={toNumber(template.discountValue, 0) || ""} title={template.discountType === "율" ? "1~99 정수(%)" : "10원 단위"} onChange={(event) => updateRollingCouponTemplate(template.id, { discountValue: toNumber(event.target.value, 0) })} /></td>
                        <td>
                          {template.discountType === "율" ? (
                            <input
                              type="number"
                              min="10"
                              step="10"
                              placeholder="최대 할인원"
                              value={toNumber(template.maxDiscountPrice, 0) > 0 ? toNumber(template.maxDiscountPrice, 0) : ""}
                              title="정률할인 시 실제 할인금액의 최대 한도(원)"
                              aria-label={`${template.couponName || "쿠폰"} 정률 최대할인금액`}
                              onChange={(event) =>
                                updateRollingCouponTemplate(template.id, {
                                  maxDiscountPrice: toNumber(event.target.value, 0),
                                })
                              }
                            />
                          ) : (
                            <span
                              className="coupon-rate-max-disabled"
                              title="정액할인에는 정률 최대할인 한도를 사용하지 않습니다."
                            >
                              -
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="stacked-action-buttons">
                            {rollingCouponStatusBucket(template) === "validated" ? (
                              <button type="button" className="btn-save" disabled={couponAutomationBusy} onClick={() => activateCouponAutomation([template.id])}>자동운영 시작</button>
                            ) : null}
                            <button type="button" className="btn-run" disabled={couponAutomationBusy} onClick={() => applyRollingCouponTemplateNow(template.id)}>지금 쿠폰 교체</button>
                            <button type="button" className="danger coupon-delete-small" disabled={couponAutomationBusy} onClick={() => deleteRollingCouponTemplate(template.id)}>반복대상 삭제</button>
                          </div>
                        </td>
                        <td>{(() => { const actual=actualCouponStatusByTemplate.get(template.id); return actual?.exists ? `쿠팡 ${actual.actualItems.toLocaleString()}건 / 반복 ${template.options.length.toLocaleString()}건` : `쿠팡 미확인 / 반복 ${template.options.length.toLocaleString()}건`; })()}</td>
                        <td>{(() => { const actual=actualCouponStatusByTemplate.get(template.id); const base=(template.preflightIssues||[]).join(" / "); if(actual?.exists && actual.actualItems===0) return [base,"실제 쿠팡 상품옵션 0건 — 자동 gap-repair 대상"].filter(Boolean).join(" / "); if(!actual?.exists && template.enabled) return [base,"현재 쿠팡 쿠폰 없음 — 반복대상 유지, 자동 재발행 대상"].filter(Boolean).join(" / "); return base; })()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted coupon-empty-message">새 쿠폰을 적용하거나 기존 쿠폰을 선택해 반복대상에 추가하면 이곳에 표시됩니다.</p>
            )}
          </section>

          {couponMessage && <section className="notice compact-notice">{couponMessage}</section>}
        </section>
      )}

      {activeMenu === "스케줄러" && (
        <section className="panel scheduler-panel">
          <PanelHead
            title="자동화"
            desc="쿠폰 반복발행, 어드민플러스 발주·송장 자동화, 저장소 정리 시간을 관리합니다."
          />
          <h2>자동화 상태</h2>
          <div className="actions">
            <button type="button" className="btn-check" onClick={saveOperationLog}>현재 상태 기록</button>
            <button type="button" className="btn-run" onClick={runSchedulerPreview}>실행 미리보기</button>
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
            <button type="button" className="btn-save" onClick={saveSettingsToServer}>
              변경시간 서버 저장
            </button>
          </div>

          <section className="credential-management-card adminplus-automation-card">
            <div className="panel-head compact-panel-head">
              <div>
                <h2>어드민플러스 설정시간별 발주·운송장 자동화</h2>
                <p>쿠팡·토스 결제완료 주문을 협력사별 어드민플러스 주문으로 등록하고, 어드민플러스에 생긴 송장을 다시 쿠팡·토스에 등록합니다.</p>
              </div>
            </div>
            <section className="warning-box compact-notice">
              결제정책: 옵션별 발주시간에 주문을 등록한 뒤, 업체별 <strong>예치금 자동결제</strong>가 켜져 있고 결제한도·잔액 검증을 통과한 경우에만 결제합니다. <strong>결제완료 확인 후에만</strong> 쿠팡·토스를 상품준비중으로 변경합니다.
            </section>
            <div className="credential-grid adminplus-automation-grid">
              <label>
                자동화 상태
                <select value={adminplusAutomation.enabled ? "on" : "off"} onChange={(event) => setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, enabled: event.target.value === "on", startedAt: event.target.value === "on" ? (prev.startedAt || new Date().toISOString()) : prev.startedAt }))}>
                  <option value="off">중지</option>
                  <option value="on">사용</option>
                </select>
              </label>
              <label>
                송장 회수·등록 시간
                <input value={adminplusShipmentTimesText} onChange={(event) => setAdminplusShipmentTimesText(event.target.value)} placeholder="14:00, 18:00, 23:00" />
              </label>
              <label>
                공급가 확인 시간
                <input value={adminplusPriceCheckTimesText} onChange={(event) => setAdminplusPriceCheckTimesText(event.target.value)} placeholder="08:30, 13:30, 18:30" />
              </label>
              <label>
                공급가 변동감시
                <select value={adminplusAutomation.priceWatchEnabled ? "on" : "off"} onChange={(event) => setAdminplusAutomation((prev) => normalizeAdminPlusAutomation({ ...prev, priceWatchEnabled: event.target.value === "on" }))}>
                  <option value="on">사용</option><option value="off">중지</option>
                </select>
              </label>
            </div>
            <p className="muted">발주시간은 ‘매핑·발주 → API 상품매칭’에서 옵션별로 입력합니다. 송장·가격확인 시간만 이 화면에서 공통 설정합니다. 송장 지정시간은 10:00 슬롯을 사용하지 않고 23:00 슬롯을 포함하도록 저장합니다. 예치금 자동결제는 업체별 ON + 1회/일일 한도 + 잔액조회가 안전조건이며, 결제조회 API가 제한된 계정은 결제실행 후 주문상태 재조회로 완료를 확인하며, 결제완료 확인 후에만 쿠팡·토스를 상품준비중으로 변경합니다. 강제 현금영수증 가맹은 별도 정보가 필요해 자동결제가 실패할 수 있으므로 먼저 소액 테스트하세요.</p>

            <section className="credential-management-card adminplus-payment-policy-card">
              <div className="panel-head compact-panel-head">
                <div>
                  <h3>예치금 결제정책</h3>
                  <p><strong>결제수단: AdminPlus 예치금</strong> · ‘지금 발주·결제 실행’은 먼저 AdminPlus 주문등록을 진행하고, 업체별 자동결제가 ON이며 1회/일일 한도·잔액·권한 검증을 통과한 주문만 이어서 예치금 결제를 시도합니다. <strong>결제조회 권한은 이 웹앱에서 켜는 설정이 아니라 AdminPlus 계정/API 권한입니다.</strong></p>
                </div>
              </div>
              {adminplusAccounts.length > 0 ? (
                <div className="table-wrap data-table-wrap">
                  <table>
                    <thead><tr><th>협력사</th><th>예치금 잔액</th><th>예치금 자동결제</th><th>1회 결제한도(원)</th><th>일일 결제한도(원)</th><th>결제권한 / 저장</th></tr></thead>
                    <tbody>
                      {adminplusAccounts.map((account) => {
                        const rule = adminplusAutomation.accountRules.find((row) => row.accountId === account.id) || { accountId: account.id, vendorName: account.vendorName, enabled: account.enabled, autoPurchase: true, autoPayment: false, paymentMaxPerBatch: 0, paymentDailyLimit: 0, autoShipment: true };
                        const paymentPermission = adminPlusPaymentPermissionState(account);
                        const paymentSetupState = adminPlusPaymentSetupState(account, rule);
                        return (
                          <tr key={`payment-${account.id}`}>
                            <td><strong>{account.vendorName}</strong></td>
                            <td>{typeof account.depositBalance === "number" ? `${account.depositBalance.toLocaleString()}원` : account.balanceReadScopeOk === false ? "조회권한 없음" : "새로고침 필요"}</td>
                            <td><input type="checkbox" checked={rule.autoPayment === true} disabled={account.balanceReadScopeOk === false} onChange={(event) => updateAdminPlusRule(account.id, { autoPayment: event.target.checked })} /></td>
                            <td><input className="adminplus-number-input payment-limit-input payment-limit-input-once" type="number" min={0} step={1000} value={rule.paymentMaxPerBatch || 0} onChange={(event) => updateAdminPlusRule(account.id, { paymentMaxPerBatch: Math.max(0, Number(event.target.value) || 0) })} /></td>
                            <td><input className="adminplus-number-input payment-limit-input payment-limit-input-daily" type="number" min={0} step={1000} value={rule.paymentDailyLimit || 0} onChange={(event) => updateAdminPlusRule(account.id, { paymentDailyLimit: Math.max(0, Number(event.target.value) || 0) })} /></td>
                            <td>
                              <strong>{paymentSetupState}</strong><br />
                              <span className="muted">{account.paymentReadScopeOk === false ? "결제조회 API 제한 · 실제 결제실행/주문상태로 완료 확인" : paymentPermission.detail}</span>
                              <div className="stacked-action-buttons">
                                {account.paymentReadScopeOk === false || account.balanceReadScopeOk === false ? <button type="button" className="btn-check" onClick={() => setShowAdminPlusPaymentPermissionGuide(true)}>권한안내</button> : null}
                                <button type="button" className="btn-save" disabled={adminplusAutomationBusy} onClick={() => void saveAdminPlusPaymentPolicyForAccount(account.id)}>결제정책 서버저장</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">먼저 '계정목록·권한 확인'을 눌러 AdminPlus 계정을 불러오세요.</p>
              )}

              <p className="muted">발주와 결제는 분리됩니다. 자동결제 OFF·한도 0원·잔액 부족·결제 API 권한 제한이어도 AdminPlus 주문등록까지 진행하고 ‘수집완료(결제대기)’로 유지합니다. 결제수단은 예치금이며 결제가 실제 완료된 주문만 상품준비중으로 전환합니다.</p>

              {showAdminPlusPaymentPermissionGuide && (
                <section className="info-box adminplus-payment-permission-guide" aria-live="polite">
                  <div className="panel-head compact-panel-head">
                    <div>
                      <h4>AdminPlus 결제 API 권한 안내</h4>
                      <p className="muted">
                        <strong>중요:</strong> 이 화면에서 설정할 수 있는 것은 자동결제 ON/OFF와 1회·일일 한도입니다.
                        <strong> 결제조회/결제실행 API 권한은 AdminPlus 계정 쪽 권한</strong>이라 웹앱에서 직접 활성화할 수 없습니다.
                      </p>
                    </div>
                    <button type="button" className="btn-check" onClick={() => setShowAdminPlusPaymentPermissionGuide(false)}>닫기</button>
                  </div>
                  <ol className="permission-guide-list">
                    <li><strong>AdminPlus 예치금 기능 확인:</strong> 해당 협력사 계정에서 예치금 기능이 사용 가능한지 확인합니다.</li>
                    <li><strong>수동 결제 확인:</strong> AdminPlus의 결제 대기 주문 화면에서 예치금 수동결제가 가능한지 확인합니다.</li>
                    <li><strong>API 권한 요청:</strong> 잔액조회는 정상인데 결제조회가 ‘권한없음’이면 계정 연결은 정상이고 결제 API 권한만 제한된 상태입니다.</li>
                    <li><strong>AdminPlus에 요청할 내용:</strong> “예치금 잔액 조회는 정상이나 결제조회/결제실행 API가 권한없음으로 반환됩니다. 해당 협력사 API 계정의 결제 조회 및 결제 실행 권한을 확인·활성화해 주세요.”</li>
                    <li><strong>권한 반영 후:</strong> 이 화면에서 ‘계정목록·권한 확인’을 다시 눌러 결제조회가 ‘정상’으로 바뀌는지 확인한 다음 자동결제를 켭니다.</li>
                  </ol>
                  <p className="muted">
                    잔액조회 권한이 없으면 자동결제를 차단합니다. 결제조회 API만 제한된 경우에는 자동결제를 허용하되 결제실행 응답과 AdminPlus 주문상태를 함께 확인해 완료 여부를 판정합니다.
                  </p>
                </section>
              )}
            </section>

            {adminplusAccounts.length > 0 ? (
              <div className="table-wrap data-table-wrap">
                <table>
                  <thead><tr><th>사용</th><th>협력사</th><th>계정</th><th>주문조회</th><th>상품조회</th><th>결제조회</th><th>잔액조회</th><th>자동발주</th><th>예치금 자동결제</th><th>1회 한도</th><th>일일 한도</th><th>송장자동등록</th><th>토큰 만료</th></tr></thead>
                  <tbody>
                    {adminplusAccounts.map((account) => {
                      const rule = adminplusAutomation.accountRules.find((row) => row.accountId === account.id) || { accountId: account.id, vendorName: account.vendorName, enabled: account.enabled, autoPurchase: true, autoPayment: false, paymentMaxPerBatch: 0, paymentDailyLimit: 0, autoShipment: true };
                      return (
                        <tr key={account.id}>
                          <td><input type="checkbox" checked={rule.enabled !== false} onChange={(event) => updateAdminPlusRule(account.id, { enabled: event.target.checked })} /></td>
                          <td>{account.vendorName}</td>
                          <td>{account.label}</td>
                          <td>{account.orderReadScopeOk === false ? "권한없음" : account.orderReadScopeOk === true ? "정상" : "확인 전"}</td>
                          <td>{account.productReadScopeOk === false ? "권한없음" : account.productReadScopeOk === true ? "정상" : "확인 전"}</td>
                          <td>{account.paymentReadScopeOk === false ? "API 권한없음" : account.paymentReadScopeOk === true ? "정상" : "확인 전"}</td>
                          <td>{typeof account.depositBalance === "number" ? `${account.depositBalance.toLocaleString()}원` : account.balanceReadScopeOk === false ? "권한없음" : "확인 전"}</td>
                          <td><input type="checkbox" checked={rule.autoPurchase !== false} onChange={(event) => updateAdminPlusRule(account.id, { autoPurchase: event.target.checked })} /></td>
                          <td><input type="checkbox" checked={rule.autoPayment === true} disabled={account.balanceReadScopeOk === false} onChange={(event) => updateAdminPlusRule(account.id, { autoPayment: event.target.checked })} /></td>
                          <td><input className="adminplus-number-input" type="number" min={0} value={rule.paymentMaxPerBatch || 0} onChange={(event) => updateAdminPlusRule(account.id, { paymentMaxPerBatch: Math.max(0, Number(event.target.value) || 0) })} /></td>
                          <td><input className="adminplus-number-input" type="number" min={0} value={rule.paymentDailyLimit || 0} onChange={(event) => updateAdminPlusRule(account.id, { paymentDailyLimit: Math.max(0, Number(event.target.value) || 0) })} /></td>
                          <td><input type="checkbox" checked={rule.autoShipment !== false} onChange={(event) => updateAdminPlusRule(account.id, { autoShipment: event.target.checked })} /></td>
                          <td>{formatCredentialExpiry(account.tokenExpiresAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">설정에서 어드민플러스 계정을 등록한 뒤 ‘계정목록 불러오기’를 누르면 협력사별 자동화 스위치가 표시됩니다.</p>
            )}

            <div className="actions adminplus-runtime-actions">
              <button type="button" className="btn-check" disabled={adminplusCredentialBusy} onClick={() => void loadAdminPlusAccounts(true)}>계정·API 상태 새로고침</button>
              <button type="button" className="btn-save" disabled={adminplusAutomationBusy} onClick={saveAdminPlusAutomationSettings}>자동발주·송장 설정 저장</button>
              <button type="button" className="btn-check" disabled={adminplusAutomationBusy} onClick={() => void runAdminPlusAutomation("purchase-preflight")}>발주·결제 사전검증</button>
              <button type="button" className="btn-run" disabled={adminplusAutomationBusy} onClick={() => void runAdminPlusAutomation("purchase-execute")}>지금 발주·결제 실행</button>
              <button type="button" className="btn-check" disabled={adminplusAutomationBusy} onClick={() => void runAdminPlusAutomation("shipment-preflight")}>송장 사전확인</button>
              <button type="button" className="btn-run" disabled={adminplusAutomationBusy} onClick={() => void runAdminPlusAutomation("shipment-sync")}>지금 송장 회수·등록</button>
            </div>

            {adminplusPreflightRows.length > 0 ? (
              <details className="advanced-details inline-advanced-details" open>
                <summary>발주·결제 사전검증 목록 {adminplusPreflightRows.length}건</summary>
                <div className="advanced-details-body">
                  <div className="table-wrap data-table-wrap">
                    <table>
                      <thead><tr><th>채널</th><th>주문번호</th><th>옵션ID</th><th>협력사</th><th>상품</th><th>매칭경로</th><th>API확정 후보</th><th>상태</th><th>사유</th></tr></thead>
                      <tbody>{adminplusPreflightRows.map((row, index) => <tr key={`${text(row.sourceKey)}-${index}`}><td>{text(row.channel)}</td><td>{text(row.orderNo)}</td><td>{text(row.mappingOptionId || row.optionId) || "-"}</td><td>{text(row.vendorName) || "-"}</td><td>{text(row.vendorProductName || row.productName) || "-"}</td><td>{text(row.matchedVia) || "-"}</td><td>{Array.isArray(row.confirmedLinkCandidates) ? row.confirmedLinkCandidates.map((value) => text(value)).filter(Boolean).join(", ") || "-" : Array.isArray(row.mappingCandidates) ? row.mappingCandidates.map((value) => text(value)).filter(Boolean).join(", ") || "-" : "-"}</td><td><strong>{text(row.status) || "결제완료"}</strong></td><td>{text(row.reason) || "-"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              </details>
            ) : null}

            <section className="notice compact-notice" aria-live="polite">{adminplusAutomationMessage}</section>
            <p className="muted">최근 발주: {adminplusAutomation.lastPurchaseAt ? formatCredentialExpiry(adminplusAutomation.lastPurchaseAt) : "없음"} · 최근 송장회수: {adminplusAutomation.lastShipmentAt ? formatCredentialExpiry(adminplusAutomation.lastShipmentAt) : "없음"} · 최근 가격확인: {adminplusAutomation.lastPriceCheckAt ? formatCredentialExpiry(adminplusAutomation.lastPriceCheckAt) : "없음"} · 미확인 가격변동 {adminplusPriceAlerts.filter((row) => !row.acknowledgedAt).length}건 · 진행현황 {adminPlusOrderFlowRows().length.toLocaleString()}건</p>
            {adminPlusOrderFlowRows().length > 0 ? (
              <details className="advanced-details inline-advanced-details" open>
                <summary>주문 진행상태 현황 {adminPlusOrderFlowRows().length}건</summary>
                <div className="advanced-details-body">
                  <div className="filter-box api-filter-box order-flow-range-toolbar">
                    <label>조회 시작일 <input type="date" value={orderApiFilter.startDate} onChange={(event) => setOrderApiFilter((prev) => ({ ...prev, startDate: event.target.value }))} /></label>
                    <label>조회 종료일 <input type="date" value={orderApiFilter.endDate} onChange={(event) => setOrderApiFilter((prev) => ({ ...prev, endDate: event.target.value }))} /></label>
                    <div className="quick-range-actions">
                      <button type="button" className="secondary" onClick={() => applyOrderDateRange(1)}>오늘</button>
                      <button type="button" className="secondary" onClick={() => applyOrderDateRange(7)}>최근 7일</button>
                      <button type="button" className="btn-check" disabled={apiOverviewBusy} onClick={() => void refreshAdminPlusPurchaseHistoryForDashboard()}>진행상태 새로고침</button>
                    </div>
                  </div>
                  <p className="muted">상태 Source-of-Truth: <strong>결제완료</strong>=쿠팡/토스 고객결제 · <strong>수집완료</strong>=AdminPlus <strong>입금전</strong> · <strong>발주완료</strong>=AdminPlus <strong>주문접수</strong> · <strong>상품준비중</strong>=AdminPlus <strong>배송준비중</strong> · <strong>배송중</strong>=AdminPlus <strong>배송</strong>. 마켓 상품준비중 전환값은 이 상태 판정에 사용하지 않습니다.</p>
                  <div className="table-wrap data-table-wrap">
                    <table>
                      <thead><tr><th>채널</th><th>주문번호</th><th>협력사</th><th>상품</th><th>주문등록</th><th>상태</th><th>택배사</th><th>송장번호</th><th>다음조치</th></tr></thead>
                      <tbody>
                        {adminPlusOrderFlowRows().map((row, index) => {
                          const status = text(row.flowStatus) || "결제완료";
                          const nextAction = status === "결제완료" ? "AdminPlus 주문등록을 진행합니다." : status === "수집완료" ? "AdminPlus 입금전 → 주문접수를 확인합니다." : status === "발주완료" ? "AdminPlus 배송준비중 전환을 확인합니다." : status === "상품준비중" ? "AdminPlus 배송 전환과 송장 입력을 기다립니다." : "택배사·송장번호와 배송상태를 확인합니다.";
                          return <tr key={text(row.sourceKey) || `${text(row.channel)}-${text(row.orderNo)}-${index}`}><td>{text(row.channel)}</td><td>{text(row.orderNo)}</td><td>{text(row.vendorName) || "-"}</td><td>{text(row.vendorProductName || row.productName) || "-"}</td><td>{row.submittedAt ? formatCredentialExpiry(text(row.submittedAt)) : "-"}</td><td><strong>{status}</strong>{text(row.flowNote) ? <><br /><span className="muted">{text(row.flowNote)}</span></> : null}</td><td>{text(row.courier) || "-"}</td><td>{text(row.trackingNo) || "-"}</td><td>{nextAction}</td></tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ) : <section className="notice success">현재 표시할 주문 진행상태가 없습니다. 발주·결제 사전검증을 실행하면 마켓 결제완료 후보도 함께 표시됩니다.</section>}
          </section>

          <AdvancedDetails title="클라우드 저장소 점검·정리">
            <div className="actions">
              <button type="button" className="btn-check" onClick={checkStorage}>용량 점검</button>
              <button type="button" className="secondary" onClick={cleanupStorage}>만료자료 정리</button>
            </div>
            <p className="muted">영구 설정은 보존하고 만료된 임시자료만 정리합니다. 자동 정리시간은 {schedules.storageCleanup.time}입니다.</p>
          </AdvancedDetails>
        </section>
      )}

      {activeMenu === "운영설정" && (
        <section className="panel simplified-settings-panel">
          <PanelHead
            title="설정"
            desc="쿠팡·토스쇼핑·어드민플러스 인증정보와 고급 운영설정을 관리합니다. API Secret은 브라우저에 저장하지 않습니다."
          />
          <section className="credential-management-card credential-admin-token-card">
            <div className="panel-head compact-panel-head">
              <div>
                <h2>Ncloud 보안 인증관리</h2>
                <p>쿠팡·토스쇼핑·어드민플러스 키를 바꿀 때만 사용하는 공통 관리 토큰입니다.</p>
              </div>
            </div>
            <div className="credential-grid credential-grid-single">
              <label>
                Ncloud 관리 토큰
                <input type="password" autoComplete="off" value={credentialAdminToken} onChange={(event) => setCredentialAdminToken(event.target.value)} placeholder="서버의 B2B_CREDENTIAL_ADMIN_TOKEN.txt 값" />
              </label>
            </div>
            <p className="muted">Ncloud 관리 토큰은 쿠팡/Toss/AdminPlus 인증키를 추가·수정·삭제할 때만 사용합니다. 일상 운영의 계정목록·권한확인·발주·결제·송장 자동화에는 다시 입력할 필요가 없습니다.</p>
          </section>

          <section className="credential-management-card">
            <div className="panel-head compact-panel-head">
              <div>
                <h2>쿠팡 API 인증키 교체</h2>
                <p>키 재발급 시 새 Secret Key를 입력해 연결 테스트 후 Ncloud에 즉시 적용합니다.</p>
              </div>
            </div>
            <div className="credential-grid credential-grid-two">
              <label>
                새 Secret Key
                <input type="password" autoComplete="new-password" value={credentialSecretKey} onChange={(event) => setCredentialSecretKey(event.target.value)} placeholder="쿠팡 Wing에서 새로 발급된 Secret Key" />
              </label>
              <label>
                새 Secret Key 확인
                <input type="password" autoComplete="new-password" value={credentialSecretConfirm} onChange={(event) => setCredentialSecretConfirm(event.target.value)} placeholder="같은 값을 한 번 더 입력" />
              </label>
            </div>
            <details className="advanced-details inline-advanced-details">
              <summary>Access Key 또는 Vendor ID도 변경된 경우</summary>
              <div className="credential-grid credential-grid-two advanced-details-body">
                <label>
                  새 Access Key
                  <input autoComplete="off" value={credentialAccessKey} onChange={(event) => setCredentialAccessKey(event.target.value)} placeholder="변경되지 않았다면 비워두기" />
                </label>
                <label>
                  새 Vendor ID
                  <input autoComplete="off" value={credentialVendorId} onChange={(event) => setCredentialVendorId(event.target.value)} placeholder="변경되지 않았다면 비워두기" />
                </label>
              </div>
            </details>
            <div className="actions credential-actions">
              <button type="button" className="btn-check" disabled={credentialBusy} onClick={testCoupangCredentialDraft}>{credentialBusy ? "확인중" : "연결 테스트"}</button>
              <button type="button" className="btn-save" disabled={credentialBusy} onClick={applyCoupangCredentialDraft}>저장하고 즉시 적용</button>
            </div>
            <p className="credential-message" aria-live="polite">{credentialMessage}</p>
            <p className="muted">Secret Key는 브라우저 저장소에 보관하지 않으며, Cloudflare에서 Ncloud로 전달할 때도 암호화됩니다.</p>
          </section>

          <section className="credential-management-card">
            <div className="panel-head compact-panel-head">
              <div>
                <h2>토스쇼핑 API 인증키·토큰 관리</h2>
                <p>Access Token은 expires_in 기준으로 Ncloud가 자동 갱신합니다. 토스쇼핑 공식 문서에는 Access/Secret Key 자체의 고정 만료기간은 명시되지 않아, 키를 재발급·교체한 경우에만 여기서 변경합니다.</p>
              </div>
            </div>
            <div className="actions credential-actions">
              <button type="button" className="btn-check" disabled={tossCredentialBusy} onClick={loadTossCredentialStatus}>현재 토큰 만료일 확인</button>
            </div>
            {tossCredentialStatus && (
              <section className="notice compact-notice">
                Access Key {text(tossCredentialStatus.accessKeyMasked) || "설정확인"} · Access Token 만료예정 {formatCredentialExpiry(tossCredentialStatus.expiresAt)}
              </section>
            )}
            <div className="credential-grid">
              <label>
                새 Access Key (변경 시만)
                <input autoComplete="off" value={tossCredentialAccessKey} onChange={(event) => setTossCredentialAccessKey(event.target.value)} placeholder="변경되지 않았다면 비워두기" />
              </label>
              <label>
                새 Secret Key
                <input type="password" autoComplete="new-password" value={tossCredentialSecretKey} onChange={(event) => setTossCredentialSecretKey(event.target.value)} placeholder="토스쇼핑 파트너스 Secret Key" />
              </label>
              <label>
                새 Secret Key 확인
                <input type="password" autoComplete="new-password" value={tossCredentialSecretConfirm} onChange={(event) => setTossCredentialSecretConfirm(event.target.value)} placeholder="같은 값을 한 번 더 입력" />
              </label>
            </div>
            <div className="actions credential-actions">
              <button type="button" className="btn-check" disabled={tossCredentialBusy} onClick={testTossCredentialDraft}>연결 테스트</button>
              <button type="button" className="btn-save" disabled={tossCredentialBusy} onClick={applyTossCredentialDraft}>저장하고 즉시 적용</button>
            </div>
            <p className="credential-message" aria-live="polite">{tossCredentialMessage}</p>
            <p className="muted">Access Token은 Ncloud 메모리에서 캐시하고 만료 5분 전 또는 HTTP 401 감지 시 자동으로 다시 발급합니다.</p>
          </section>

          <section className="credential-management-card adminplus-credential-card">
            <div className="panel-head compact-panel-head">
              <div>
                <h2>어드민플러스 셀러 API 다계정 관리</h2>
                <p>협력사별 셀러 계정을 각각 등록합니다. 협력사명은 현재 상품매핑의 업체명과 정확히 맞춰주세요.</p>
              </div>
              <button type="button" className="btn-check" disabled={adminplusCredentialBusy} onClick={() => void loadAdminPlusAccounts(true)}>전체 연결·만료 확인</button>
            </div>
            {adminplusAccounts.length > 0 && (
              <div className="table-wrap data-table-wrap">
                <table>
                  <thead><tr><th>계정명</th><th>협력사명</th><th>Client ID</th><th>토큰</th><th>만료예정</th><th>자동화</th><th>관리</th></tr></thead>
                  <tbody>
                    {adminplusAccounts.map((account) => {
                      const rule = adminplusAutomation.accountRules.find((row) => row.accountId === account.id);
                      return (
                        <tr key={account.id}>
                          <td>{account.label}</td>
                          <td>{account.vendorName}</td>
                          <td>{account.clientIdMasked || "설정됨"}</td>
                          <td>{account.tokenOk === true ? "정상" : account.tokenOk === false ? "오류" : "미확인"}</td>
                          <td>{formatCredentialExpiry(account.tokenExpiresAt)}</td>
                          <td>{rule?.enabled === false ? "중지" : "사용"}</td>
                          <td className="actions-cell">
                            <button type="button" className="btn-check" onClick={() => editAdminPlusAccount(account)}>수정</button>
                            <button type="button" className="danger" disabled={adminplusCredentialBusy} onClick={() => void deleteAdminPlusAccount(account)}>삭제</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="credential-grid adminplus-account-form">
              <label>
                계정 ID (선택)
                <input value={adminplusAccountId} onChange={(event) => setAdminplusAccountId(event.target.value)} placeholder="예: vendor-01 · 신규는 비워도 됨" />
              </label>
              <label>
                계정 표시명
                <input value={adminplusAccountLabel} onChange={(event) => setAdminplusAccountLabel(event.target.value)} placeholder="예: A농산 어드민플러스" />
              </label>
              <label>
                협력사명 = 웹앱 업체명
                <input value={adminplusVendorName} onChange={(event) => setAdminplusVendorName(event.target.value)} placeholder="매핑의 업체명과 정확히 동일" />
              </label>
              <label>
                Client ID
                <input autoComplete="off" value={adminplusClientId} onChange={(event) => setAdminplusClientId(event.target.value)} placeholder="수정 시 유지하려면 비워두기" />
              </label>
              <label>
                Client Secret
                <input type="password" autoComplete="new-password" value={adminplusClientSecret} onChange={(event) => setAdminplusClientSecret(event.target.value)} placeholder="수정 시 유지하려면 비워두기" />
              </label>
              <label>
                Client Secret 확인
                <input type="password" autoComplete="new-password" value={adminplusClientSecretConfirm} onChange={(event) => setAdminplusClientSecretConfirm(event.target.value)} placeholder="새 Secret을 넣은 경우 동일하게 입력" />
              </label>
              <label>
                계정 사용
                <select value={adminplusAccountEnabled ? "on" : "off"} onChange={(event) => setAdminplusAccountEnabled(event.target.value === "on")}>
                  <option value="on">사용</option><option value="off">중지</option>
                </select>
              </label>
            </div>
            <div className="actions credential-actions">
              <button type="button" className="secondary" onClick={resetAdminPlusCredentialDraft}>새 계정 입력</button>
              <button type="button" className="btn-check" disabled={adminplusCredentialBusy} onClick={testAdminPlusCredentialDraft}>연결 테스트</button>
              <button type="button" className="btn-save" disabled={adminplusCredentialBusy} onClick={applyAdminPlusCredentialDraft}>계정 저장·즉시 적용</button>
            </div>
            <p className="credential-message" aria-live="polite">{adminplusCredentialMessage}</p>
            <p className="muted">어드민플러스 Access Token은 30일 유효기간을 기준으로 Ncloud에서 자동 재사용·갱신합니다. Client ID/Secret이 바뀐 경우 이 화면에서 교체하세요. 단, AdminPlus가 401 access token expired로 계약 만료를 알리는 경우에는 AdminPlus에서 계약을 먼저 갱신해야 합니다.</p>
          </section>

          <AdvancedDetails title="서버 저장·백업·연결 점검">
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
          </AdvancedDetails>

          <AdvancedDetails title="고급: API 경로 — 쿠팡 공식 주소가 바뀐 경우만">
            <ApiEndpointSettingsPanel
              settings={apiEndpointSettings}
              updateSetting={updateApiEndpointSetting}
              restoreDefaults={restoreDefaultApiEndpointSettings}
              saveToBrowser={saveSettingsToBrowser}
              saveToServer={saveSettingsToServer}
              diagnoseCoupang={diagnoseConfiguredCoupangApi}
              message={settingsMessage}
            />
          </AdvancedDetails>

          <AdvancedDetails title="안전 Gate 상태">
            <section className="safe-list">
              {Object.entries(SAFETY).map(([key, value]) => (
                <span key={key}>{key}: {String(value)}</span>
              ))}
            </section>
          </AdvancedDetails>
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

function ApiEndpointSettingsPanel({
  settings,
  updateSetting,
  restoreDefaults,
  saveToBrowser,
  saveToServer,
  diagnoseCoupang,
  message,
}: {
  settings: ApiEndpointSettings;
  updateSetting: (key: ApiEndpointKey, value: string) => void;
  restoreDefaults: () => void;
  saveToBrowser: () => void;
  saveToServer: () => Promise<void>;
  diagnoseCoupang: () => Promise<void>;
  message: string;
}) {
  const issues = apiEndpointValidationIssues(settings);
  return (
    <section className="info-box api-endpoint-settings-panel">
      <h2>API 경로 관리</h2>
      <p className="muted">API 버전이나 경로만 바뀐 경우 여기를 수정하면 코드와 API 키를 다시 바꾸지 않아도 됩니다. <code>{`{vendorId}`}</code>, <code>{`{couponId}`}</code>, <code>{`{requestedId}`}</code>, <code>{`{vendorItemId}`}</code>는 실제 값으로 자동 치환되므로 삭제하지 마세요.</p>
      <section className={issues.length ? "warning-box compact-notice" : "notice compact-notice"}>
        {issues.length ? `경로 확인필요: ${issues.join(" / ")}` : "경로 형식 정상 · 서버 저장 후 Ncloud 수동호출과 자동 스케줄러에 함께 적용됩니다."}
      </section>
      <div className="table-wrap data-table-wrap">
        <table>
          <thead><tr><th>채널</th><th>기능</th><th>API 경로</th></tr></thead>
          <tbody>
            {API_ENDPOINT_FIELDS.map((field) => (
              <tr key={field.key}>
                <td>{field.channel}</td>
                <td>{field.label}</td>
                <td><input className="api-path-input" value={settings[field.key]} onChange={(event) => updateSetting(field.key, event.target.value)} spellCheck={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="secondary" onClick={restoreDefaults}>기본 경로 복원</button>
        <button type="button" className="btn-save" disabled={Boolean(issues.length)} onClick={saveToBrowser}>브라우저 저장</button>
        <button type="button" className="btn-save" disabled={Boolean(issues.length)} onClick={() => void saveToServer()}>Ncloud 자동운영용 서버 저장</button>
        <button type="button" className="btn-api" disabled={Boolean(issues.length)} onClick={() => void diagnoseCoupang()}>쿠팡 주문 API 진단</button>
      </div>
      {message && <p className="muted">{message}</p>}
      <p className="muted">경로·버전 변경은 화면에서 처리할 수 있습니다. 요청 본문이나 응답 구조 자체가 바뀌는 큰 개편은 변환 코드 수정이 필요합니다.</p>
    </section>
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
