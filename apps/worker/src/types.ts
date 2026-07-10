export interface Env {
  /** Cloudflare R2 bucket used as the shared B2B purchase folder. */
  B2B_FILES?: R2Bucket;
  APP_ENV: string;
  DEFAULT_TIMEZONE: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  COUPANG_VENDOR_ID: string;
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  COUPANG_ORDER_COLLECT_STATUS?: string;
  COUPANG_ORDER_MAX_RETRIES?: string;
  COUPANG_ORDER_RETRY_BASE_MS?: string;
  COUPANG_ORDER_DAY_SPLIT_DELAY_MS?: string;
  COUPANG_ORDER_MAX_PAGES?: string;
  COUPANG_ORDERS_PATH?: string;
  COUPANG_VENDOR_ITEM_INVENTORY_PATH?: string;
  COUPANG_SHIPMENT_UPLOAD_PATH?: string;
  COUPANG_ORDER_ACK_PATH?: string;
  COUPANG_COUPON_CREATE_PATH?: string;
  COUPANG_COUPON_APPLY_PATH?: string;
  COUPANG_COUPON_CANCEL_PATH?: string;
  COUPANG_COUPON_REQUEST_STATUS_PATH?: string;
  COUPANG_COUPON_CONTRACT_LIST_PATH?: string;
  COUPANG_COUPON_LIST_PATH?: string;
  COUPANG_COUPON_ITEM_LIST_PATH?: string;
  COUPANG_COUPON_CONTRACT_ID?: string;
  COUPANG_COUPON_ID?: string;
  COUPANG_COUPON_MAX_DISCOUNT_PRICE?: string;
  COUPANG_COUPON_WOW_EXCLUSIVE?: string;

  /** Toss Shopping */
  TOSS_SHOPPING_BASE_URL?: string;
  TOSS_TOKEN_URL?: string;
  TOSS_CLIENT_ID?: string;
  TOSS_CLIENT_SECRET?: string;
  TOSS_SCOPE?: string;
  TOSS_PARTNER_NAME?: string;
  TOSS_ORDERS_PATH?: string;
  TOSS_SHIPMENT_UPLOAD_PATH?: string;
  TOSS_ORDER_STATUS_PATH?: string;
  TOSS_ORDERS_CURSOR_PARAM?: string;
  TOSS_ORDER_MAX_PAGES?: string;

  /** Optional endpoint used only to display the current outbound public IP for marketplace allowlist checks. */
  PUBLIC_IP_CHECK_URL?: string;
  /** V172: optional HTTPS endpoint that proxies Cloudflare Worker requests to the Ncloud fixed-IP API server. */
  /** V175: set to true in the Ncloud Node server so it does not proxy back to itself. */
  NCLOUD_SERVER_MODE?: string;
  /** V181: optional Ncloud origin override. Defaults to the fixed sslip.io host on port 8080. */
  NCLOUD_API_BASE?: string;
  /** Optional pre-issued token for local tests only. Do not use in production when token API is available. */
  TOSS_SHOPPING_API_KEY?: string;

  /** Safety gates: API_CONNECTION_PAUSED defaults to true to prevent accidental live calls. */
  API_CONNECTION_PAUSED?: string;
  ALLOW_LIVE_EXTERNAL_API?: string;
  ALLOW_FINAL_EXECUTION?: string;
  ALLOW_SCHEDULED_WRITES?: string;
  SCHEDULER_MATCH_WINDOW_MINUTES?: string;
  STORAGE_AUDIT_LOG_RETENTION_DAYS?: string;
  R2_FILE_RETENTION_DAYS?: string;
}

export type Marketplace = "coupang" | "toss";

export interface NormalizedOrderItem {
  coupang_option_id?: string | null;
  toss_option_id?: string | null;
  coupangOptionId?: string | null;
  tossOptionId?: string | null;
  marketplace: Marketplace;
  marketplaceOrderId: string;
  shipmentBoxId?: string;
  marketplaceItemId: string;
  vendorItemId?: string;
  optionId: string;
  productId?: string;
  productItemId?: string;
  managementCode?: string;
  productManagementCode?: string;
  productName?: string;
  optionName?: string;
  quantity: number;
  price?: number;
  originPrice?: number;
  discountPrice?: number;
  receiverName?: string;
  receiverPhone?: string;
  zipCode?: string;
  address?: string;
  memo?: string;
  orderedAt?: string;
  status?: string;
  raw: unknown;
}

export interface ProductMapping {
  id: string;
  b2b_vendor_code: string | null;
  b2b_vendor_name: string;
  coupang_option_id: string | null;
  toss_option_id: string | null;
  toss_stock_id?: string | null;
  toss_product_item_management_code?: string | null;
  b2b_product_code: string | null;
  b2b_product_name: string | null;
  base_quantity: number;
}

export type TossResult<T> = {
  resultType: "SUCCESS" | "FAIL" | string;
  error?: {
    errorType?: number | string;
    errorCode?: string;
    reason?: string;
    data?: unknown;
    title?: string | null;
  } | null;
  success?: T | null;
};

export type TossOrderStatus =
  | "BEFORE_PAYMENT"
  | "PAID"
  | "PREPARING_PRODUCT"
  | "DELIVERING"
  | "DELIVERED"
  | "CONFIRMED_ORDER"
  | "CLAIM_REQUESTED_CANCEL"
  | "CANCELED_PAYMENT"
  | "CLAIM_REJECTED_CANCEL"
  | "REQUESTED_EXCHANGE"
  | "ONGOING_EXCHANGE"
  | "COMPLETED_EXCHANGE"
  | "CLAIM_REJECTED_EXCHANGE"
  | "REQUESTED_RETURN"
  | "ONGOING_RETURN"
  | "COMPLETED_RETURN"
  | "CLAIM_REJECTED_RETURN"
  | "CLAIM_COLLECTING"
  | "CLAIM_COLLECTED"
  | "CLAIM_DELIVERING"
  | "REVOKED_REQUEST";

export interface TossOrderProduct {
  orderedAt?: string;
  canceledAt?: string;
  confirmedAt?: string;
  shippingDeadlineAt?: string;
  orderId: number | string;
  orderProductId: number | string;
  productId: number | string;
  stockId: number | string;
  ordererName?: string;
  ordererPhone?: string;
  ordererRealPhone?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverRealPhone?: string;
  address?: string;
  detailAddress?: string;
  zipCode?: string;
  shippingNote?: string;
  productName?: string;
  optionName?: string;
  quantity?: number;
  price?: number;
  originPrice?: number;
  totalDiscountPrice?: number;
  tossShoppingDiscount?: number;
  tossPayDiscount?: number;
  tossPayPoint?: number;
  orderProductStatus?: TossOrderStatus | string;
  deliveryCompanyCode?: string;
  shippingTrackingNumber?: string;
  deliveryFeeGroupId?: number | string;
  deliveryFee?: number;
  deliveryLocationType?: string;
  normalDeliveryFee?: number;
  jejuDeliveryFee?: number;
  mountainDeliveryFee?: number;
  productManagementCode?: string;
  productItemManagementCode?: string;
}

export interface TossProductListItem {
  id: number | string;
  name: string;
  brandName?: string;
  salePrice?: number;
  inspectionStatus?: string;
  exposureStatus?: string;
  regTs?: string;
  images?: unknown[];
}

export interface TossProductItem {
  itemId: number | string;
  itemName: string;
  quantity?: number;
  isMainOption?: boolean;
  status?: { code?: string; label?: string };
  originPrice?: number;
  salePrice?: number;
  isAdultProduct?: boolean;
  rejectReasons?: { title: string; message: string }[];
}

export interface TossDeliveryCompany {
  id?: number;
  name: string;
  code?: string;
  isEnabled?: boolean;
}
