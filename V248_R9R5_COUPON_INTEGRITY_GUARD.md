# V248 R9.5 Coupon Integrity Guard

- 0-option / payload-mismatch coupon creation no longer immediately creates a second couponId.
- A per-template runtime hold plus pending cleanup/request-status guard blocks reissue until cleanup is resolved.
- Coupon item attach remains max 3 attempts; coupon creation itself is one attempt per cycle.
- Success requires actual APPLIED option verification and exact discount/type/start/end payload match for the returned couponId.
- Existing healthy legacy +24h coupons are preserved during the day and migrated only in the 23:50 rollover window after same-day preflight; next health check is held to 23:52.
- Global forced rollover remains disabled, preserving R8.3 safety.
- Manual “지금 쿠폰 교체” success refreshes coupon list and coupon items so actual/repeat counts update.
- R9.4 anchor/gap-repair, R8.3 adaptive actual-end logic, and AdminPlus R9.2 are retained.
