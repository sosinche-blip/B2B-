# V225 Coupon Rollover Resilience

- Old coupon remains valid through 23:50. New coupon is requested at 23:51 and uses next-day 00:00~23:50 validity, matching Coupang instant-coupon startAt constraints.
- Rollover cancellation executes at the new issue minute (23:51), not at validity-end 23:50.
- One cancel API request per coupon; never send three duplicate expire requests.
- Poll requestedId/APPLIED state at 5-second intervals three times.
- After issuance, verify actual APPLIED coverage after 1 minute.
- If options are missing, add only missing items to the single existing coupon.
- Only when no target option is APPLIED at all may a new coupon be recreated.
- A final 30-minute reconciliation retries safely and records a failure if still unresolved.
