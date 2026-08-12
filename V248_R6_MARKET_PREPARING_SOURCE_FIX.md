# V248 R6 — Marketplace Preparing Source Fix

- Shipment source of truth is the marketplace's **current preparing orders**: Coupang `INSTRUCT`, Toss `PREPARING_PRODUCT`.
- AdminPlus is used as the tracking/courier lookup source only after a current marketplace preparing order is identified.
- Historical/manual purchase rows that are no longer currently preparing are excluded from shipment recovery and the pending UI.
- Manual/external orders can still recover through `customer_order_code` when the same order is currently preparing in the marketplace.
- Existing R5 tracking evidence parsing, R4 designated schedule, R3 orderer parity, duplicate-upload guards and marketplace upload safety remain intact.
