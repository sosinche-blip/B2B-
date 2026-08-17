# V258 Free-tier / Cleanup / UI Audit — 2026-08-17

## Review 1 — Repository structure
- Removed 4 stale root artifacts from the V249/Ncloud rebuild era.
- Kept current runtime, schema/migrations, and all active regression verifiers.
- Updated README to the actual V258 architecture.

## Review 2 — Dead code / dependencies
- Removed unused Web declarations/helpers and legacy Worker functions with no identifier references.
- Removed direct dependencies `zod` and `@types/node` from Worker because current source does not import/use them.
- Package lock updated consistently.

## Review 3 — Free-tier request/storage pressure
- Scheduler now reads only settings_key/updated_at each minute and downloads the large Supabase payload only after a change.
- R2 retention listing reduced from every minute (~43,200 scans/30 days) to once daily (~30 scans/30 days).
- JSON API response indentation removed.
- Worker cron stays every minute because business purchase/coupon schedules require minute accuracy.

## Review 4 — Deployment/build pressure
- Worker GitHub Action no longer runs for web-only changes.
- Concurrency cancels an obsolete in-progress Worker deployment.
- Pages remains separately deployable.

## Review 5 — UI consistency
- Shared 40px form control baseline and 34px table control baseline.
- Today status-range toolbar remains inline on desktop and becomes a predictable grid on mobile.
- Common filter labels/action groups/table inputs vertically align without changing mapping column widths.

## Review 6 — Security / public repository
- No real .dev.vars is present in the downloaded repository.
- Root historical Ncloud env example removed; Worker example remains.
- Follow-up recommended: move hard-coded business phone/address and default Ncloud endpoint out of public source where operationally possible.

## Review 7 — Cost boundary
- Cloudflare/Supabase can plausibly remain inside free quotas after these reductions at the current small operational scale.
- Ncloud fixed-IP Server is a separate cost boundary; code cleanup cannot make a paid server free.
- Confirm with actual Usage/Billing screenshots before claiming 0 KRW/month.
