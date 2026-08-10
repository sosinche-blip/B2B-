# V232 R3 price-check mapping payload fix

GitHub Worker TypeScript check failed with TS2345 because V232 called:

`adminplusMappingRows(payload.mappings)`

but `adminplusMappingRows` accepts the full `Record<string, unknown>` settings payload and internally reads
`payload.mappings`.

R3 changes the call to:

`adminplusMappingRows(payload)`

This fixes both the TypeScript contract and the intended runtime semantics.
