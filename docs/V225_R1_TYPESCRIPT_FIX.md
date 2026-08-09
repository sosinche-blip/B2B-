# V225 R1 TypeScript Fix

GitHub Actions V225 failed at Worker TypeScript check because the runtime introduced
`applied_verify_1m` and `applied_verify_30m`, but `CouponRetryStage` did not include them.

R1 fixes:
- Adds both APPLIED verification stages to `CouponRetryStage`.
- Updates V221/V222 legacy UI release verifiers so current V225 releases do not false-fail.
- Strengthens V225 verification to assert the retry-stage type members exist.

All static V203~V225 regression verification scripts pass after the patch.
