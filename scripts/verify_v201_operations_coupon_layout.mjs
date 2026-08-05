import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const app=fs.readFileSync(path.join(root,"apps/web/src/App.tsx"),"utf8");
const style=fs.readFileSync(path.join(root,"apps/web/src/style.css"),"utf8");
const checks=[
 [app.includes('V201 운영현황·발주·쿠폰구조 개선본'), 'V201 화면 버전'],
 [app.includes('renderOperationMetricDetail') && app.includes('목록 보기'), '운영점검 8개 박스 상세목록'],
 [style.includes('.operation-control-metrics > button'), '운영현황 클릭 UI'],
 [app.includes('발주 작업 순서') && app.includes('발주파일 저장 위치(선택)'), '발주 역할 설명'],
 [app.includes('발주완료 기록과 중복 차단'), '중복발주 차단 설명'],
 [app.includes('errorName === "AbortError"'), '폴더 선택 취소 정상 처리'],
 [app.includes('couponCandidateRows') && app.includes('managedRollingOptionIds'), '옵션ID 기준 쿠폰 후보 제외'],
 [app.includes('24시간 관리에 아직 없는 기존 쿠폰'), '쿠폰 후보/관리 목록 구조'],
 [app.includes('원래 쿠폰 기간과 관계없이 24시간 반복관리 기준'), '기존 기간 무관 24시간 관리'],
];
let failed=false;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failed=true;}
if(failed) process.exit(1);
console.log('V201 verification passed.');
