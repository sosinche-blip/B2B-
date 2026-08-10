# V226 R1 verifier compatibility

GitHub Actions failed in the legacy V208 verifier because it expected the obsolete source literal
`customer_order_code: adminplusCustomerOrderCode`.

V226 still deterministically generates the code with `adminplusCustomerOrderCode(...)`, stores it
in `customerOrderCode`, and writes `customer_order_code: customerOrderCode` in the shared payload builder.

R1 updates the legacy verifier only; runtime order-code behavior is unchanged.
