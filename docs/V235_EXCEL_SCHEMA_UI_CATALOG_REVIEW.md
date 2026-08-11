# V235 Excel schema / UI / catalog review
- UI/export/template: 채널, 옵션ID, 업체명, 코드번호, 업체상품명, 기본수량, 배송비, 기준단가, 기준구성원가, 발주시간
- product name comparison: Unicode NFKC + remove punctuation/symbols such as ★
- catalog pagination: cursor up to 100 pages with duplicate-cursor protection
- global search includes inactive/sold-out products
- mapping compact fields: 코드번호/기본수량/배송비 ~50%
- unified top notices for server-save uncertainty and product-status/price alerts
