# V228 automation persistence / selected manual fallback / Coupang shipment refresh

## 1. Daily operation no longer requires Ncloud admin token
- Read-only AdminPlus account/status/permission checks use the operational integration endpoint.
- Ncloud admin token remains required only for credential add/change/delete.
- The token is no longer cleared after a successful Coupang credential update during the same browser session.

## 2. Payment/automation settings persist
- Latest server settings are automatically loaded after startup.
- A successful automation/payment-policy save also updates local fallback storage.

## 3. Explicit selected-order collection supports manual fallback
- When the operator explicitly selects paid orders, AdminPlus API-linked mapped products are also allowed into the manual purchase export.
- This prevents an API-linked product from being impossible to order manually when automation is being repaired.

## 4. Coupang shipment sync refreshes exact current IDs
- Exact Coupang orderId/vendorItemId/shipmentBoxId are preserved in normalized rows and purchase history.
- Before shipment upload, current INSTRUCT orders are re-read and identifiers are reconciled.
- Existing V227 large-integer-safe JSON serialization remains.

Revision: `automation-persist-selected-manual-v228-20260810`
