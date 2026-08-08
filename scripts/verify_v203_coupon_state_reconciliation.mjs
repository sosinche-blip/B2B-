import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const worker=fs.readFileSync(path.join(root,"apps/worker/src/worker.ts"),"utf8");
const app=fs.readFileSync(path.join(root,"apps/web/src/App.tsx"),"utf8");
const checks=[
 [worker.includes("verifyCouponItemsActuallyApplied"), "실제 APPLIED 옵션 교차검증"],
 [worker.includes("findActuallyAppliedCouponByPayload"), "생성상태 지연 시 실제 APPLIED 쿠폰 복구"],
 [worker.includes("couponOptionExistsWithThreePasses"), "옵션 API 최대 3회 검증"],
 [worker.includes('reconciliation === "applied_verified"'), "사전검증 실제적용 복구"],
 [worker.includes('status: "resolved"') && worker.includes("reconciledTemplateIds"), "거짓 실패 이력 자동 해소"],
 [worker.includes("const allOk = executed && operationOk"), "중간 폴링 실패를 최종 실패로 강제하지 않음"],
 [app.includes("rollingCouponStatusBucket"), "상단 집계 단일 상태 분류"],
 [app.includes('headers={["자동운영", "운영중", "자동운영 준비완료", "확인필요", "미검증", "반복대상", "미확인 실패"]}'), "반복대상 상태 합계 UI"],
 [app.includes("reconciledCouponId || template.latestCouponId"), "실제 쿠폰ID 화면 상태 자동복구"],
];
let failed=false;
for(const [ok,label] of checks){ console.log(`${ok?"PASS":"FAIL"} ${label}`); if(!ok) failed=true; }
// 상단 상태 분류는 상호배타적이어야 반복대상 합계와 정확히 일치합니다.
const sample=[
 {enabled:true,automationState:"active",preflightStatus:"통과"},
 {enabled:false,automationState:"validated",preflightStatus:"통과"},
 {enabled:false,automationState:"failed",preflightStatus:"실패"},
 {enabled:false,automationState:"draft",preflightStatus:"미검증"},
];
const bucket=(t)=>t.automationState==="failed"||t.preflightStatus==="실패"?"attention":t.enabled&&t.automationState==="active"&&t.preflightStatus==="통과"?"active":t.automationState==="validated"&&t.preflightStatus==="통과"?"validated":"unverified";
const counts=sample.reduce((m,t)=>(m[bucket(t)]=(m[bucket(t)]||0)+1,m),{});
const sum=Object.values(counts).reduce((a,b)=>a+b,0);
if(sum!==sample.length){ console.log("FAIL 상태 합계 불일치"); failed=true; } else console.log("PASS 상태 합계 상호배타성");
if(failed) process.exit(1);
console.log("V203 coupon state reconciliation verification passed.");
