# V226 R2 - V211 verifier compatibility

Cloudflare/GitHub verification failed at the legacy V211 shipping/baseQty test because it expected
the old source expression using `order.qty`.

V226 refactored AdminPlus order payload creation into `adminplusBuildOrderPayload()` and now uses
`row.order.qty || row.order.quantity` while preserving the exact same runtime semantics:
marketplace quantity is sent once and `baseQty` is not multiplied again.

R2 updates only the legacy verifier and adds a regression check. Runtime purchase quantity behavior
is unchanged.
