import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
let failed = false;
function check(name, condition) { console.log(`${condition ? "[PASS]" : "[FAIL]"} ${name}`); if (!condition) failed = true; }

console.log("[ROUND 1] manual vs scheduled purchase policy");
check("V253 marker web", app.includes("v253-adminplus-flow-integration-20260817"));
check("V253 marker worker", worker.includes("v253-adminplus-flow-integration-20260817"));
check("manual execute bypasses autoPurchase OFF", worker.includes("if (!manualRun && adminplusRuleForAccount(config, account)?.autoPurchase === false)"));
check("scheduled autoPurchase OFF still blocks", worker.includes('reason: "자동발주 OFF(예약 실행 제외)"'));
check("manual endpoint passes manualRun true", worker.includes("adminplusPurchaseRun(env, payload, dryRun, \"\", true)"));

console.log("[ROUND 2] payment resilience / multi-account parity");
check("balance amount exposed per account", worker.includes("depositBalance:") && app.includes("account.depositBalance.toLocaleString()"));
check("payment key supports nested aliases", worker.includes('adminplusScalarFromDeep(paymentData, ["payment_key", "paymentKey", "key"])'));
check("payment GET restriction falls back to order state", worker.includes("completed_by_order") && worker.includes("adminplusFindOrderByCustomerCode"));
check("payment execution keeps deposit default with adaptive cash-receipt fallback", worker.includes('{ method: "deposit", amount }') && worker.includes('{ method: "point", amount: 0 }') && worker.includes("adminplusForceCashReceiptRequired") && worker.includes('method: "bank"') && worker.includes('type: "BUSINESS"'));
check("autoPayment UI only hard-blocked by balance scope", app.includes('disabled={account.balanceReadScopeOk === false}'));
check("per-account payment policy save", app.includes("saveAdminPlusPaymentPolicyForAccount") && app.includes(">결제정책 서버저장</button>"));
check("duplicate payment action removed", !app.includes(">결제 포함 사전검증</button>") && !app.includes(">결제정책 서버 저장</button>"));

console.log("[ROUND 3] business status flow / preflight list");
check("status flow semantics", app.includes("adminPlusFlowStatusFromActualStatus") && app.includes('if (actual) return actual') && app.includes('if (isAdminPlusOrderSubmitted(row)) return "수집완료"'));
check("preflight rows surfaced", worker.includes("preflightRows") && app.includes("발주·결제 사전검증 목록"));
check("flow table uses 상태", app.includes("주문 진행상태 현황") && app.includes("<th>상태</th>"));
check("legacy 처리 column removed from flow table", !app.includes("<th>송장상태</th>") && !app.includes("<th>처리</th>"));
check("courier and tracking remain visible", app.includes("<th>택배사</th>") && app.includes("<th>송장번호</th>"));
check("execution message avoids conflicting derived state labels", worker.includes("AdminPlus 주문등록") && worker.includes("예치금 결제확인") && worker.includes("업무상태는 AdminPlus 실제"));

console.log("[ROUND 4] mapping enrollment / duplicate protection");
check("mapping key channel+option", app.includes("function adminPlusMappingKey") && app.includes('`${parseChannel(row.channel)}|${cleanId(row.optionId)}`'));
check("enrollment updates existing mapping", app.includes("updateMappingForAdminPlusSelection(mapping, row, now)") && app.includes("mappings: nextMappings"));
check("selected AdminPlus vendor/product reflected in mapping", app.includes("vendorName: selected.vendorName || mapping.vendorName") && app.includes("vendorCode: selected.productCode || mapping.vendorCode") && app.includes("vendorProductName: selected.name || mapping.vendorProductName"));
check("Excel operational values preserved", app.includes("옵션ID/기본수량/배송비/발주시간/기준단가는 기존 엑셀 기준값을 유지합니다."));
check("duplicate mapping blocks", app.includes("중복 매핑") && app.includes("확정 매핑을 1건으로 유지하지 못했습니다"));
check("worker keeps channel+option dedupe", worker.includes("function mappingRecordKey") && worker.includes("const byKey = new Map"));

console.log("[ROUND 5] UI cleanup / management controls");
check("account/API refresh moved and renamed", app.includes(">계정·API 상태 새로고침</button>"));
check("automation save scope clarified", app.includes(">자동발주·송장 설정 저장</button>") && app.includes("업체별 결제정책은 각 행의 전용 저장 버튼으로만 확정합니다."));
check("payment failures surfaced separately", app.includes("결제확인필요"));
check("runtime buttons still present", app.includes(">발주·결제 사전검증</button>") && app.includes(">지금 발주·결제 실행</button>") && app.includes(">송장 사전확인</button>") && app.includes(">지금 송장 회수·등록</button>"));

if (failed) process.exit(1);
console.log("[PASS] V253 AdminPlus integrated flow verification completed.");
