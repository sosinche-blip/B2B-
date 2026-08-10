# V232 Excel-first mapping + product-change alert + global catalog

## Excel mapping is authoritative
- Key: `channel + optionId`.
- If the newest Excel mapping says the vendor changed, the prior B2B/AdminPlus confirmed link is reset.
- The old vendor's AdminPlus match is deleted when possible.
- Runtime price/automation paths also ignore vendor-mismatched stale links.

## Same vendor, different product name
- The mapping is NOT silently switched.
- Supply-price monitoring creates a `상품명변경` alert.
- The alert shows Excel expected product name vs current AdminPlus product name and asks the operator to check sold-out/replacement/spec changes.

## Global AdminPlus product search
- New page: `매핑·발주 → API 상품검색`.
- Searches all enabled AdminPlus accounts.
- One-character substring search is supported, e.g. `복`, `복숭아`.
- Results show vendor, account, product code, product name, price, stock/status, and options.

Revision: `excel-first-mapping-global-catalog-v232-20260811`
