import fs from "node:fs";

const app = fs.readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);

const checks = [
  [
    "R5.3 marker",
    app.includes(
      "v259-r5-3-safe-bidirectional-latest-confirmed-20260827",
    ),
  ],
  [
    "latest confirmed time wins",
    app.includes(
      "if (linkTime > mappingTime) apiWins = true;",
    ) &&
    app.includes(
      "else if (mappingTime > linkTime) apiWins = false;",
    ),
  ],
  [
    "stale confirmed API link blocked",
    app.includes(
      "if (mappingTime > linkTime) return false;",
    ),
  ],
  [
    "mapping to API sync helper",
    app.includes(
      "function syncAdminPlusLinksFromLatestMappings(",
    ),
  ],
  [
    "mapping display overwrites API display",
    app.includes(
      "vendorName: mapping.vendorName",
    ) &&
    app.includes(
      "text(mapping.vendorProductName)",
    ),
  ],
  [
    "stale API link removed instead of shadow retained",
    app.includes(
      "removedLinks.push(link)",
    ) &&
    app.includes(
      "return [];",
    ),
  ],
  [
    "actual AdminPlus stale match is deleted",
    app.includes(
      '"/api/integrations/adminplus/catalog/matches/delete"',
    ) &&
    app.includes(
      "staleLink.matchString",
    ),
  ],
  [
    "unlink moves option to AdminPlus unlinked state",
    app.includes(
      "AdminPlus 미연결로 이동",
    ),
  ],
  [
    "excel winner stamped",
    app.includes(
      'matchAuthority: "excel" as const',
    ),
  ],
  [
    "API confirmation retained",
    app.includes(
      'matchAuthority: "api" as const',
    ) &&
    app.includes(
      "vendorCode: selected.productCode || mapping.vendorCode",
    ),
  ],
  [
    "autosave persists latest API links",
    app.includes(
      "latestLinkSync.changed",
    ) &&
    app.includes(
      "latestLinkSync.rows",
    ),
  ],
  [
    "old record-only message removed",
    !app.includes(
      "기존 API상품매칭은 기록만 유지하며 자동발주에는 사용하지 않습니다.",
    ),
  ],
  [
    "R5.3.1 marker",
    app.includes(
      "v259-r5-3-1-auto-unlink-adminplus-match-20260827",
    ),
  ],
  [
    "R5.3.2 marker",
    app.includes(
      "v259-r5-3-2-identity-change-only-20260828",
    ),
  ],
  [
    "Excel import no longer blanket stamps authority",
    !app.includes(
      'normalizeMappingRows(imported).map((row) => ({ ...row, matchAuthority: "excel" as const, matchConfirmedAt: now, updatedAt: now }))',
    ),
  ],
  [
    "Excel import compares existing option identity",
    app.includes(
      "const confirmedLink =",
    ) &&
    app.includes(
      "const vendorChanged =",
    ) &&
    app.includes(
      "const explicitCodeChanged =",
    ),
  ],
  [
    "blank Excel code keeps confirmed API product",
    app.includes(
      "Boolean(confirmedLink) &&",
    ) &&
    app.includes(
      "Boolean(incomingCode) &&",
    ) &&
    app.includes(
      "incomingCode !== currentApiCode",
    ),
  ],
  [
    "unchanged Excel import preserves API authority",
    app.includes(
      "matchAuthority:" +
        "\n                current.matchAuthority",
    ) &&
    app.includes(
      "matchConfirmedAt:" +
        "\n                current.matchConfirmedAt",
    ),
  ],
  [
    "bulk Excel product-name display difference does not unlink confirmed API",
    app.includes(
      "const nonApiProductChanged =",
    ) &&
    app.includes(
      "!confirmedLink &&",
    ),
  ],
  [
    "manual identity change compares actual values",
    app.includes(
      "parseChannel(next.channel) !==",
    ) &&
    app.includes(
      "parseChannel(row.channel)",
    ) &&
    app.includes(
      "cleanId(next.vendorCode) !==",
    ) &&
    app.includes(
      "cleanId(row.vendorCode)",
    ) &&
    app.includes(
      "normalizeHeader(",
    ) &&
    app.includes(
      "next.vendorProductName",
    ) &&
    app.includes(
      "row.vendorProductName",
    ),
  ],
];

let failures = 0;

for (const [name, ok] of checks) {
  console.log(ok ? "[PASS]" : "[FAIL]", name);
  if (!ok) failures += 1;
}

if (failures) {
  console.error(
    "\nR5.3 verifier failures:",
    failures,
  );
  process.exit(1);
}

console.log(
  "\n[PASS] V259 R5.3 bidirectional latest-confirmed verification completed.",
);
