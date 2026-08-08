import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const required=[
  'async function activateCouponAutomation(templateIds?: string[])',
  '준비완료 자동운영 시작',
  'onClick={() => activateCouponAutomation([template.id])}>자동운영 시작</button>',
  '자동운영 준비완료',
  'rollingCouponStatusBucket(row) === "validated"'
];
for(const token of required){if(!app.includes(token)) throw new Error(`자동운영 시작 기능 누락: ${token}`);}
if(app.includes('검증완료·미시작')) throw new Error('이전 상태명이 남아 있습니다.');
console.log("V206 자동운영 시작 UI/연결 검증 통과");
