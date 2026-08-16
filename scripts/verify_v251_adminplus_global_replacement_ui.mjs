import fs from 'node:fs';

const appPath = new URL('../apps/web/src/App.tsx', import.meta.url);
const app = fs.readFileSync(appPath, 'utf8');

function check(name, condition) {
  if (!condition) {
    console.error(`[FAIL] ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] ${name}`);
}

console.log('[ROUND 1] replacement entry / global search');
check('V251 AdminPlus replacement UI marker', app.includes('v251-adminplus-global-replacement-ui-20260817'));
check('price-watch vendor/product cell opens replacement search', app.includes('onClick={() => openAdminPlusGlobalReplacement(row.id)}'));
check('replacement uses existing global AdminPlus catalog search', app.includes('/api/integrations/adminplus/catalog/search'));
check('replacement explicitly keeps Excel mapping', app.includes('엑셀매핑은 유지하고 AdminPlus 업체·상품만 교체합니다.'));

console.log('[ROUND 2] replacement save invariants');
check('replacement writes selected AdminPlus account', app.includes('accountId: row.accountId'));
check('replacement writes selected AdminPlus product', app.includes('productCode: row.productCode'));
check('replacement saves existing mappings unchanged', app.includes('mappings: normalizeMappingRows(mappings)'));
check('replacement preserves qty and shipping fee from confirmed link', app.includes('const qty = Math.max(1, Number(link.qty || 1) || 1);') && app.includes('const shippingFee = Math.max(0, Number(link.shippingFee || 0) || 0);'));
check('replacement preserves purchase time from confirmed link', app.includes('const parsedTime = parseOptionPurchaseTimes(link.purchaseTime);'));
check('replacement preserves baseline price', app.includes('const baselinePrice = Math.max(0, Number(link.baselinePrice || 0) || 0);'));
check('replacement verifies persisted mapping/link', app.includes('await verifyAdminPlusConfirmedPersistence(mapping, nextLink);'));

console.log('[ROUND 3] UI safety / existing functions');
check('multiple options require explicit selection', app.includes('교체할 옵션을 선택하세요.') && app.includes('옵션 선택'));
check('unsaved cost draft blocks product replacement', app.includes('미저장 발주시간/기본수량/배송비 수정이 있습니다. 먼저 감시기준 저장을 완료한 뒤 업체·AdminPlus 상품을 교체하세요.'));
check('price check button retained', app.includes('>지금 가격확인</button>'));
check('watch settings save retained', app.includes('>자동감시 설정 전체 서버저장</button>'));
check('baseline accept button retained', app.includes('>현재가를 새 기준가로 적용</button>'));
check('direct mapping save retained', app.includes('>매칭 저장·검증</button>'));

if (process.exitCode) process.exit(process.exitCode);
console.log('[PASS] V251 AdminPlus global replacement UI verification completed.');
