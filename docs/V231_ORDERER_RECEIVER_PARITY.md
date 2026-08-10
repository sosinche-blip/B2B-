# V231 Orderer / receiver parity

Existing purchase Excel templates separate orderer/sender/business fields from receiver/customer fields.
The Excel exporter already uses the business profile for sender/orderer fields.

V231 fixes AdminPlus API order creation so:
- `order_name` = business/orderer name
- `order_phone` = business/orderer phone
- `receiver_*` = marketplace customer's delivery data

It also fixes missing sender column mappings in the default `몬딱제주` and `꿈틀` templates, and expands learned-template aliases for sender/orderer headers.

Revision: `excel-orderer-business-receiver-customer-v231-20260810`
