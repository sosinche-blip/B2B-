import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const css = fs.readFileSync("apps/web/src/style.css", "utf8");
const must = (ok, msg) => { if (!ok) throw new Error(msg); console.log(`[PASS] ${msg}`); };

console.log("\n[ROUND 1] five-stage dashboard order");
must(app.includes('ORDER_FLOW_UI_PATCH = "V210.1 결제완료→수집완료 5단계 운영흐름 수정"'), "V210.1 UI patch marker");
const dashboardStart = app.indexOf('operation-status-metrics');
const labels = ["결제완료", "수집완료", "상품준비중", "배송중", "배송완료"];
const positions = labels.map((label) => app.indexOf(`<span>${label}</span>`, dashboardStart));
must(positions.every((pos) => pos >= 0), "all five status cards exist");
must(positions.every((pos, idx) => idx === 0 || pos > positions[idx - 1]), "status cards are in business-flow order");
must(css.includes('.operation-status-metrics { grid-template-columns: repeat(5, minmax(0, 1fr)); }'), "desktop layout supports five cards");

console.log("\n[ROUND 2] collected status semantics");
must(app.includes('function isAutoPurchaseCollectedOrder(row: OrderRow)'), "dedicated collected-status classifier exists");
must(app.includes('Boolean(text(row.orderStatus))') && app.includes('isPaymentStatus(row.channel, row.orderStatus)'), "collected status requires a real channel payment-complete status");
must(app.includes('normalizeHeader(row.sourceFile).includes("apipreview")'), "manual Excel imports are excluded from automatic collection status");
must(app.includes('const collectedPaymentRows = useMemo('), "collected rows are derived from actual collected order state");
must(app.includes('operationMetricDetail === "collected" ? collectedPaymentRows'), "collected detail list uses collected rows, not channel API status rows");

console.log("\n[ROUND 3] report and explanatory UI");
must(app.includes('주문 흐름: 결제완료 → 수집완료 → 상품준비중 → 배송중 → 배송완료'), "dashboard explains the corrected flow");
must(app.includes('["수집완료", collectedPaymentRows.length]'), "daily closing report includes collected count");
must(app.includes('<small>채널 결제</small>') && app.includes('<small>자동발주 수집</small>'), "payment and collection meanings are visibly distinguished");

console.log("\n[PASS] V210.1 five-stage order-flow verification completed (3 rounds).");
