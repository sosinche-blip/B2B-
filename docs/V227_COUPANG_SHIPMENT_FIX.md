# V227 Coupang shipment registration fix

## Root causes fixed
1. Coupang `shipmentBoxId` can be 18 digits. Converting it to JavaScript `Number` can lose integer precision.
2. Coupang requires exact `shipmentBoxId`, `orderId`, `vendorItemId`, courier code and waybill number.
3. AdminPlus courier names can contain spacing/company suffix variants that were not normalized to Coupang courier codes.
4. Previous diagnostics only said "required value missing" without naming the field.

## Changes
- Keep Coupang IDs as digit strings and serialize them as exact JSON numeric literals.
- Apply the same exact-ID handling to the Product-in-Preparation acknowledgement call.
- Improve AdminPlus courier-name normalization (CJ/Lotte/Hanjin/Logen/Post/Kyungdong/etc.).
- Show exact missing fields per Coupang order.
- Keep Toss shipment behavior unchanged.

Revision: `coupang-shipment-bigint-courier-v227-20260810`
