# V228 R2 - manual export policy verifier compatibility

V228 intentionally changed selected-order behavior:

- Default export still separates AdminPlus API-linked vendors from manual vendors.
- But when the operator explicitly selects paid orders, API-linked mapped products are allowed into the manual export as a recovery/fallback path.

The legacy V209 verifier assumed API-linked products could never appear in a manual export, which conflicts with the new V228 requirement.

R2 updates the verifier to check both rules:
1. default separation remains intact;
2. explicit selected-order fallback is allowed only through `includeAdminPlusLinkedForManual`.

Runtime behavior is unchanged from V228.
