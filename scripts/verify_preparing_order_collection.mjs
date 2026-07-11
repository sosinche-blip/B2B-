import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "apps/web/src/App.tsx"), "utf8");
let failed = false;

function pass(message) { console.log(`[PASS] ${message}`); }
function fail(message) { console.error(`[FAIL] ${message}`); failed = true; }
function requireAll(label, snippets) {
  const missing = snippets.filter((snippet) => !source.includes(snippet));
  if (missing.length) fail(`${label}: ${missing.join(" | ")}`);
  else pass(label);
}
function requireAbsent(label, snippets) {
  const found = snippets.filter((snippet) => source.includes(snippet));
  if (found.length) fail(`${label}: ${found.join(" | ")}`);
  else pass(label);
}

requireAll("1. 상품준비중 상태 선택", [
  'coupangStatus: "INSTRUCT"',
  'tossStatus: "PREPARING_PRODUCT"',
  'orderSelectionModeFromStatus',
]);

requireAll("2. 현재 선택 상태로 주문조회", [
  'collectChannelOrderRows(channel, [], "current")',
  'orderMatchesSelectionMode(channel, row.orderStatus, mode)',
  'setSelectableOrderMode(mode)',
]);

requireAll("3. 결제완료 발주 흐름 유지", [
  'if (mode === "purchase")',
  'exportPurchaseGroupsFromOrders(selectedRows',
  'acknowledgeOrdersAfterPurchaseExport(selectedRows',
]);

requireAll("4. 상품준비중 중복업무 차단", [
  '상품준비중 주문을 업체송장 매칭·송장업로드 대상에 반영했습니다.',
  '발주양식 생성과 상품준비중 상태변경은 실행하지 않았습니다.',
]);

requireAll("5. 기존 주문 최신 상태 갱신", [
  'function mergeLatestOrderRows',
  'rows[index] = { ...previous, ...row, raw: row.raw || previous.raw };',
  '상태·주소 갱신',
]);

requireAbsent("과거 결제완료 전용 함수 제거", [
  'previewSelectablePaymentOrders',
  'collectSelectedPaymentOrders',
]);

if (failed) process.exit(1);
console.log("[PASS] Preparing-order selection regression verification completed.");
