# V228 R1 - shipment row TypeScript hotfix

GitHub/Local TypeScript check failed because the new Coupang identifier refresh path caused
`shipmentRows` to be inferred as a union containing a narrow object shape with only
`shipmentBoxId/orderId/vendorItemId`.

The common shipment loop later reads `channel`, `orderNo`, and `optionId`, so TypeScript rejected it.

R1:
- fixes the refresh helper return type to `Array<Record<string, unknown>>`,
- normalizes pending rows before refresh,
- casts refreshed rows to the generic shipment shape,
- normalizes each row with `objectRecord()` before common upload processing.

Runtime shipment behavior is unchanged.
