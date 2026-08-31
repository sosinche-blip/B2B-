import fs from "node:fs";

const workerPath = "apps/worker/src/worker.ts";
const r57VerifierPath =
  "scripts/verify_v259_r5_7_same_vendor_link_recovery.mjs";

let worker = fs.readFileSync(workerPath, "utf8");
let r57 = fs.readFileSync(r57VerifierPath, "utf8");

/* ============================================================
   ROUND 1 PATCH
   R5.7 same-vendor recovery -> same-product identity recovery
   ============================================================ */

const oldGate = `      const sameVendor =
        normalizeAdminPlusVendorName(mapping.vendorName) ===
        normalizeAdminPlusVendorName(row.vendorName);

      const mappingTime =
        Date.parse(String(mapping.matchConfirmedAt || mapping.updatedAt || "")) || 0;

      const linkTime =
        Date.parse(String(row.matchConfirmedAt || row.updatedAt || "")) || 0;

      // R5.7: 동일 업체의 살아 있는 서버 확정 API 링크는
      // Excel authority라는 이유만으로 차단하지 않습니다.
      if (sameVendor) return true;

      // 업체가 실제로 달라졌고 Excel이 마지막 사용자 확정값이면
      // 과거 API 링크는 계속 차단합니다.
      if (mappingAuthority === "excel") return false;
      return linkTime >= mappingTime;`;

const newGate = `      const sameVendor =
        normalizeAdminPlusVendorName(mapping.vendorName) ===
        normalizeAdminPlusVendorName(row.vendorName);

      const mappingCode =
        String(mapping.vendorCode || "").trim();

      const linkCode =
        String(row.productCode || "").trim();

      const sameProductCode =
        Boolean(mappingCode) &&
        Boolean(linkCode) &&
        mappingCode === linkCode;

      const normalizeProductIdentity = (value: unknown) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\\s+/g, "");

      const mappingProduct =
        normalizeProductIdentity(mapping.vendorProductName);

      const linkProduct =
        normalizeProductIdentity(row.productName);

      const sameProductName =
        Boolean(mappingProduct) &&
        Boolean(linkProduct) &&
        mappingProduct === linkProduct;

      const sameIdentity =
        sameVendor &&
        (sameProductCode || sameProductName);

      const mappingTime =
        Date.parse(String(mapping.matchConfirmedAt || mapping.updatedAt || "")) || 0;

      const linkTime =
        Date.parse(String(row.matchConfirmedAt || row.updatedAt || "")) || 0;

      // R5.8:
      // 같은 업체라는 이유만으로 과거 API 링크를 복구하지 않습니다.
      // 상품코드 또는 상품명까지 동일한 경우에만 현재 확정링크로 인정합니다.
      if (sameIdentity) return true;

      // Excel이 마지막 사용자 확정값이고 상품 identity가 다르면
      // 같은 업체의 과거 API 링크도 차단합니다.
      if (mappingAuthority === "excel") return false;

      return linkTime >= mappingTime;`;

const gateCount = worker.split(oldGate).length - 1;

if (gateCount !== 1) {
  throw new Error(
    "R5.7 authority gate count expected 1, found " + gateCount
  );
}

worker = worker.replace(oldGate, newGate);


/* ============================================================
   SOURCE MARKER
   ============================================================ */

const r57Marker =
  "// v259-r5-7-same-vendor-confirmed-link-recovery-20260831";

const r58Marker =
  "// v259-r5-8-system-stability-hardening-20260831";

if (!worker.includes(r57Marker)) {
  throw new Error("R5.7 source marker missing");
}

if (!worker.includes(r58Marker)) {
  worker = worker.replace(
    r57Marker,
    r57Marker + "\n" + r58Marker
  );
}


/* ============================================================
   ROUND 3 PATCH
   Expose R5.8 on every health/status diagnostic block
   ============================================================ */

const healthAnchor =
  'systemStabilityRevision: "v259-r5-5-system-stability-20260828",';

const healthAddition =
  'systemStabilityHardeningRevision: "v259-r5-8-system-stability-hardening-20260831",';

const healthCount =
  worker.split(healthAnchor).length - 1;

if (healthCount < 1) {
  throw new Error("R5.5 stability health anchor missing");
}

if (!worker.includes(healthAddition)) {
  worker = worker
    .split(healthAnchor)
    .join(
      healthAnchor +
        "\n        " +
        healthAddition
    );
}


/* ============================================================
   Update all current R5.5 release version labels.
   Current source legitimately has multiple diagnostic endpoints.
   ============================================================ */

const oldVersion =
  'version: "v259-r5-5-system-stability",';

const newVersion =
  'version: "v259-r5-8-system-stability-hardening",';

const versionCount =
  worker.split(oldVersion).length - 1;

if (versionCount < 1) {
  throw new Error(
    "R5.5 release version label missing"
  );
}

worker = worker
  .split(oldVersion)
  .join(newVersion);


/* ============================================================
   Upgrade R5.7 verifier wording/ordering to R5.8 semantics
   ============================================================ */

const replacements = [
  [
    'block.indexOf("if (sameVendor) return true;")',
    'block.indexOf("if (sameIdentity) return true;")',
  ],
  [
    '"same vendor recovery exists"',
    '"same product identity recovery exists"',
  ],
  [
    '"same vendor recovery runs before Excel rejection"',
    '"same product identity recovery runs before Excel rejection"',
  ],
  [
    '"old Excel-before-vendor ordering removed"',
    '"old Excel-before-identity ordering removed"',
  ],
];

for (const [from, to] of replacements) {
  if (!r57.includes(from)) {
    throw new Error(
      "R5.7 verifier anchor missing: " + from
    );
  }

  r57 = r57.replace(from, to);
}


/* ============================================================
   FINAL IN-MEMORY ASSERTIONS BEFORE ANY FILE WRITE
   ============================================================ */

const assertions = [
  [
    "R5.8 marker",
    worker.includes(r58Marker),
  ],
  [
    "sameIdentity",
    worker.includes("if (sameIdentity) return true;"),
  ],
  [
    "sameVendor legacy gate removed",
    !worker.includes("if (sameVendor) return true;"),
  ],
  [
    "product code guard",
    worker.includes("mappingCode === linkCode"),
  ],
  [
    "R5.8 health marker",
    worker.includes(healthAddition),
  ],
  [
    "old R5.5 version removed",
    !worker.includes(oldVersion),
  ],
  [
    "new R5.8 version present",
    worker.includes(newVersion),
  ],
];

for (const [name, ok] of assertions) {
  if (!ok) {
    throw new Error(
      "pre-write assertion failed: " + name
    );
  }
}

fs.writeFileSync(workerPath, worker, "utf8");
fs.writeFileSync(r57VerifierPath, r57, "utf8");

console.log("[PASS] R5.8 corrected source patch applied");
console.log("HEALTH_ANCHOR_COUNT=" + healthCount);
console.log("VERSION_LABEL_COUNT=" + versionCount);