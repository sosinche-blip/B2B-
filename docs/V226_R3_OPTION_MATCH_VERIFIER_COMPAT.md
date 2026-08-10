# V226 R3 - option-match verifier compatibility

GitHub Actions failed at the legacy V217 verifier because it expected the old direct
`product_string: matchString` source form. V226 still preserves:
`confirmedLink.matchString -> candidate.matchString -> product_string`.

R3 updates the verifier only and adds a regression check. Runtime mapping/quantity behavior is unchanged.
