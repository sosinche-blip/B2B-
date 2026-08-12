# V248 Operations Resilience

- Shipment queue: Toss market recheck + operator acknowledge without forging shipmentUploadedAt.
- AdminPlus: order registration continues even when automatic deposit payment is unavailable; payment remains pending/error and marketplace preparing still requires completed payment.
- Coupang coupon automation: missed-window/APPLIED lookup failures schedule self-healing reconciliation with backoff; repeat targets stay active.
- Removed obsolete “다음 발행부터” UI/handlers.
- UI release headline follows V248 instead of stale V236 text.
