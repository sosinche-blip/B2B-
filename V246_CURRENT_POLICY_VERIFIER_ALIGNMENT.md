# V246 Current Policy / Verifier Alignment

Date: 2026-08-12

## Scope
- No large-scale refactor.
- Cloudflare/Ncloud shared Worker source aligned to the same current policy implementation.
- V228 R1 / V243 R1 shipment TypeScript safety fixes retained.
- Added `currentPolicyRevision: v246-current-policy-verifier-alignment-20260812` to status revision surfaces.
- Added V246 current-policy regression verifier.
- Existing Excel-first, option-specific mapping, baseQty semantics, conservative soldout detection, account routing, payment guard, and shipment recovery logic were preserved.

## Validation in analysis environment
- Cloudflare/Ncloud worker SHA256 parity: PASS.
- V246 policy guard: PASS.
- Cloudflare static verifier sweep: 72 PASS / 0 FAIL; build-dependent `verify_local_project` and address/build validation excluded because npm install execution is unavailable in the analysis container.
- Final deployment gate remains mandatory on Windows: `npm.cmd ci` then `npm.cmd run verify:all`.
