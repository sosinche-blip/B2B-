# V249 R10 CLEAN Coupon Automation Rebuild

- Scheduled coupon execution is replaced by one R10 state-machine path.
- vendorItemId is the source of truth; legacy optionId is accepted only as migration fallback and is persisted into r10VendorItemIds after a run.
- Flow: validate vendorItemId -> atomic claim -> APPLIED ownership check -> create -> requestedId/couponId confirm -> attach -> actual APPLIED item + payload verify.
- Any generated coupon that fails attach/verification enters cleanup; reissue is blocked until cleanup is actually confirmed.
- 23:52 issue / retry through 01:00; end is anchored to 23:50.
- Existing order, AdminPlus R9.2, Toss, shipment R7.1 and address logic are retained.
- Legacy R8/R9 coupon scheduler/retry code remains compatibility-only for manual historical endpoints and is not called from schedulerTick.
