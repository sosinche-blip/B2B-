# V171 Mapping Upload Guard Patch

Date: 2026-07-10

## Fixes
- Prevents full-screen crash after mapping Excel upload caused by missing channel/profit setting objects.
- Adds safe fallback for profit/channel settings when browser-stored settings are old or incomplete.
- Adds mapping upload summary: Coupang row count, Toss row count, vendor count, missing option/vendor checks.
- Immediately refreshes mapping check summary after Excel upload.

## Verified
- Web production build PASS
- Worker TypeScript check PASS
- V170 service verification PASS

## Mapping file compatibility
The uploaded mapping file columns are supported:
- 채널
- 옵션ID
- 업체명
- 코드번호
- 업체상품명
- 원가
- 기본수량

Primary matching key: 채널 + 옵션ID.
