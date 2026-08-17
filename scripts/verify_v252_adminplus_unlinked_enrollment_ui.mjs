import fs from 'node:fs';

const app = fs.readFileSync('apps/web/src/App.tsx', 'utf8');

function check(name, condition) {
  if (!condition) {
    console.error(`[FAIL] ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] ${name}`);
}

console.log('[ROUND 1] unlinked mapping detection / entry');
check('V252 AdminPlus unlinked enrollment UI marker', app.includes('v252-adminplus-unlinked-enrollment-ui-20260817'));
check('unlinked mappings are derived from Excel mappings minus confirmed links', app.includes('function adminPlusUnlinkedMappings()') && app.includes('!linkedIds.has(`${mapping.channel}|${mapping.optionId}`)'));
check('unlinked row opens global AdminPlus enrollment', app.includes('openAdminPlusGlobalEnrollment(mapping.id)'));
check('UI labels AdminPlus unlinked rows', app.includes('AdminPlus 미연결'));

console.log('[ROUND 2] enrollment save invariants');
check('enrollment uses existing global AdminPlus catalog search', app.includes('async function enrollAdminPlusProductLinkFromGlobal(row: AdminPlusGlobalCatalogRow)'));
check('enrollment writes selected AdminPlus account', app.includes('accountId: row.accountId'));
check('enrollment writes selected product and option', app.includes('productCode: row.productCode') && app.includes('optionCode: resolvedOptionCode'));
check('enrollment uses option-scoped match string', app.includes('const matchString = adminPlusOptionScopedMatchString(mapping);'));
check('Excel mappings remain unchanged during enrollment', app.includes('mappings: normalizeMappingRows(mappings)'));
check('Excel base quantity is preserved', app.includes('const qty = Math.max(1, Number(mapping.baseQty || 1) || 1);'));
check('Excel shipping fee is preserved', app.includes('const shippingFee = Math.max(0, Number(mapping.shippingFee || 0) || 0);'));
check('Excel purchase time is preserved', app.includes('const parsedTime = parseOptionPurchaseTimes(mapping.purchaseTime);'));
check('Excel baseline price is preserved', app.includes('const baselinePrice = Math.max(0, Number(mapping.cost || 0) || 0);'));
check('server persistence verification retained', app.includes('await verifyAdminPlusConfirmedPersistence(mapping, link);'));

console.log('[ROUND 3] safety / existing V251 behavior');
check('multiple AdminPlus options require explicit selection', app.includes('편입할 옵션을 선택하세요.'));
check('duplicate link enrollment is blocked', app.includes('이미 AdminPlus에 연결된 옵션ID입니다.'));
check('existing replacement flow retained', app.includes('function openAdminPlusGlobalReplacement(linkId: string)') && app.includes('replaceAdminPlusProductLinkFromGlobal(row)'));
check('price check retained', app.includes('checkAdminPlusPricesNow()'));
check('watch settings save retained', app.includes('saveAdminPlusAutomationSettings()'));
check('baseline accept retained', app.includes('acceptAdminPlusPrice(row.id)'));


console.log('[ROUND 4] manual global search entry');
check('V252 R1 manual-search UI marker', app.includes('v252r1-adminplus-manual-search-ui-20260817'));
check('enrollment opens with blank manual search', app.includes('function openAdminPlusGlobalEnrollment(mappingId: string)') && app.includes('setAdminplusGlobalSearchQuery("");') && app.includes('자동검색하지 않습니다. 검색어를 직접 입력한 뒤 전체 업체 상품검색'));
check('replacement opens with blank manual search', app.includes('function openAdminPlusGlobalReplacement(linkId: string)') && app.includes('자동검색하지 않습니다. 검색어를 직접 입력한 뒤 전체 업체 상품검색을 눌러 새 업체·상품을 선택하세요.'));
check('entry functions do not trigger automatic catalog search', !/function openAdminPlusGlobalEnrollment[\s\S]*?if \(query\) void searchAllAdminPlusProducts\(query\);/.test(app) && !/function openAdminPlusGlobalReplacement[\s\S]*?if \(query\) void searchAllAdminPlusProducts\(query\);/.test(app));
check('manual search field is focused and explicit', app.includes('autoFocus') && app.includes('상품명 직접검색') && app.includes('검색어를 직접 입력하세요.'));
check('manual search still supports Enter and button', app.includes('if (event.key === "Enter") void searchAllAdminPlusProducts();') && app.includes('onClick={() => void searchAllAdminPlusProducts()}'));

if (process.exitCode) process.exit(process.exitCode);
console.log('[PASS] V252 AdminPlus unlinked enrollment UI verification completed.');
