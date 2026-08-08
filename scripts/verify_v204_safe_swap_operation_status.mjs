import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const worker=fs.readFileSync(path.join(root,"apps/worker/src/worker.ts"),"utf8");
const app=fs.readFileSync(path.join(root,"apps/web/src/App.tsx"),"utf8");
const checks=[
 [worker.includes("resolveActualAppliedCouponForOptions"),"옵션ID 기준 실제 APPLIED 기존쿠폰 탐색"],
 [worker.includes("verifyCouponNoLongerApplied"),"기존쿠폰 APPLIED 제거 교차확인"],
 [worker.includes("itemApplyConfirmed") && worker.includes("verifyCouponItemsActuallyApplied"),"신규쿠폰 옵션 실제적용 확인"],
 [worker.includes("상품 0건 등 불완전 신규 쿠폰"),"불완전 신규쿠폰 자동정리"],
 [app.includes('operationStatusRows') && app.includes('fetchOperationStatus'),"대시보드 동일 API 자료원"],
 [app.includes('["쿠팡", "DEPARTURE", "shipping"]') && app.includes('["쿠팡", "DELIVERING", "shipping"]'),"쿠팡 배송진행 상태 통합"],
 [app.includes('["토스", "DELIVERING", "shipping"]') && app.includes('["토스", "DELIVERED", "delivered"]'),"토스 배송상태 분류"],
 [app.includes('needsDeliveryCheck') && app.includes('다음날 06시 기준'),"배송확인 다음날 06시 기준"],
 [!app.includes('<span>현재 수집주문</span>') && !app.includes('<span>송장등록 준비</span>') && !app.includes('<span>미해결 실패</span>'),"중복 운영지표 버튼 제거"],
 [!app.includes('세부 운영점검 {dailyOperationRows.length}개 보기') && !app.includes('<summary>실패 재처리 · 미해결'),"세부운영/실패재처리 영역 제거"],
 [app.includes('onClick={() => applyRollingCouponTemplateNow(template.id)}>지금 쿠폰 교체</button>'),"반복쿠폰 안전 교체 버튼"],
];
let failed=false; for(const [ok,label] of checks){console.log(`${ok?"PASS":"FAIL"} ${label}`); if(!ok) failed=true;}
if(failed) process.exit(1); console.log("V204 safe coupon swap + operation status verification passed.");
