# V229 shipment recovery + payment-limit UI

- AdminPlus changed-order feed remains the fast path.
- Customer order code and tracking data are read from order-level or product-level fields.
- Outstanding paid/preparing history rows are directly reconciled by `customer_order_code`, so missed/old changed events can recover.
- Recovered Coupang rows continue through current live INSTRUCT ID refresh and V227 exact-integer shipment upload.
- Preflight/sync messages show direct recovery counts and Coupang ID refresh counts.
- Payment-limit input widths: one-time 70%, daily 100%.

Revision: `adminplus-shipment-direct-reconcile-v229-20260810`
