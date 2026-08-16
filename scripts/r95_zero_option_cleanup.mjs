const BASE = process.env.R95_LOCAL_API_BASE || "http://127.0.0.1:8080";
const execute = process.argv.includes("--execute");

async function api(path, body) {
  const response = await fetch(`${BASE}${path}`, body === undefined ? {} : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, message: text }; }
  if (!response.ok && data.ok !== false) data.ok = false;
  return data;
}

function text(value) { return String(value ?? "").trim(); }
function baseName(value) { return text(value).replace(/\s+20\d{2}-\d{2}-\d{2}\s*$/g, "").trim(); }
function rows(result) { return Array.isArray(result?.summary?.rows) ? result.summary.rows : []; }

console.log(`=== R9.5 0옵션 orphan 쿠폰 ${execute ? "실제 정리" : "DRY-RUN"} ===`);
const settingsResult = await api("/api/operation/settings/latest");
const data = settingsResult?.data && typeof settingsResult.data === "object" ? settingsResult.data : {};
const templates = Array.isArray(data.rollingCouponTemplates)
  ? data.rollingCouponTemplates
  : Array.isArray(data?.couponApiSettings?.rollingTemplates) ? data.couponApiSettings.rollingTemplates : [];
const managedNames = new Set(templates.flatMap((template) => [baseName(template?.couponName), baseName(template?.baseCouponName)]).filter(Boolean));
console.log(`반복대상 ${templates.length}개 / 이름기준 ${managedNames.size}개`);

const list = await api("/api/integrations/coupang/coupons/list", { query: { status: "APPLIED", page: 1, size: 100 } });
const applied = rows(list);
const targets = [];
for (let index = 0; index < applied.length; index += 1) {
  const coupon = applied[index];
  const couponId = text(coupon?.couponId);
  if (!couponId) continue;
  const itemResult = await api("/api/integrations/coupang/coupons/items-list", {
    query: { couponId, status: "APPLIED", page: 0, size: 1000 },
  });
  const itemRows = rows(itemResult);
  const managed = managedNames.has(baseName(coupon?.couponName));
  if (managed && itemRows.length === 0) targets.push(coupon);
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
}

console.log(`APPLIED ${applied.length}건 / 반복대상 0옵션 orphan ${targets.length}건`);
for (const coupon of targets) {
  console.log(`[TARGET] ${coupon.couponId} | ${coupon.couponName} | ${coupon.startAt || ""} -> ${coupon.endAt || ""} | 할인 ${coupon.discountValue ?? coupon.discount ?? ""}`);
}

if (!execute) {
  console.log("[DRY-RUN] 실제 쿠폰은 변경하지 않았습니다. 검토 후 --execute로만 정리합니다.");
  process.exit(0);
}

let done = 0;
let pending = 0;
let failed = 0;
for (const coupon of targets) {
  const couponId = text(coupon?.couponId);
  const result = await api("/api/integrations/coupons/action-preview", {
    action: "cancel",
    rows: [{ couponId, cancelCouponId: couponId, sourceCouponId: couponId, latestCouponId: couponId }],
    forceCancel: true,
    daily24h: false,
    manual: true,
    couponApiSettings: { selectedCouponId: couponId, selectedMode: "existing", dailyRollingEnabled: false },
  });
  if (result?.ok === true) { done += 1; console.log(`[DONE] ${couponId}`); }
  else if (result?.summary?.pending) { pending += 1; console.log(`[PENDING] ${couponId} requested=${(result.summary.cancelRequestedIds || []).join(",")}`); }
  else { failed += 1; console.log(`[FAIL] ${couponId} ${result?.message || ""}`); }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.log(`정리요청 완료 ${done} / 처리중 ${pending} / 실패 ${failed}`);
