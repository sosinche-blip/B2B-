import fs from "node:fs";

const path = "apps/worker/src/worker.ts";
let worker = fs.readFileSync(path, "utf8");

const startAnchor =
  "// R5.3.3: surviving server-confirmed API link wins.";

const endAnchor =
  '    const matchString = String(confirmedLink?.matchString || "").trim();';

const start = worker.indexOf(startAnchor);
const end = worker.indexOf(endAnchor, start);

if (start < 0) {
  throw new Error("R5.3.3 authority block start missing");
}

if (end < 0 || end <= start) {
  throw new Error("purchase authority block end missing");
}

const before = worker.slice(0, start);
let block = worker.slice(start, end);
const after = worker.slice(end);

const oldSequence =
`      if (linkAuthority === "api") return true;
      if (mappingAuthority === "api") return true;
      if (mappingAuthority === "excel") return false;

      const sameVendor =`;

const newSequence =
`      if (linkAuthority === "api") return true;
      if (mappingAuthority === "api") return true;

      const sameVendor =`;

if (!block.includes(oldSequence)) {
  throw new Error(
    "current R5.3.3 Excel-first sequence not found"
  );
}

if (
  (block.split(oldSequence).length - 1) !== 1
) {
  throw new Error(
    "R5.3.3 sequence count is not exactly 1"
  );
}

block = block.replace(
  oldSequence,
  newSequence
);

const sameVendorGate =
  "      if (sameVendor) return true;";

if (!block.includes(sameVendorGate)) {
  throw new Error(
    "sameVendor legacy recovery gate missing"
  );
}

if (
  (block.split(sameVendorGate).length - 1) !== 1
) {
  throw new Error(
    "sameVendor gate count is not exactly 1"
  );
}

block = block.replace(
  sameVendorGate,
`      // R5.7: 동일 업체의 살아 있는 서버 확정 API 링크는
      // Excel authority라는 이유만으로 차단하지 않습니다.
      if (sameVendor) return true;

      // 업체가 실제로 달라졌고 Excel이 마지막 사용자 확정값이면
      // 과거 API 링크는 계속 차단합니다.
      if (mappingAuthority === "excel") return false;`
);

worker = before + block + after;

const markerAnchor =
  "// v259-r5-6-delete-tombstone-guard-20260828";

if (!worker.includes(markerAnchor)) {
  throw new Error("R5.6 marker missing");
}

if (
  !worker.includes(
    "v259-r5-7-same-vendor-confirmed-link-recovery-20260831"
  )
) {
  worker = worker.replace(
    markerAnchor,
    markerAnchor +
      "\n// v259-r5-7-same-vendor-confirmed-link-recovery-20260831"
  );
}

fs.writeFileSync(path, worker, "utf8");

console.log(
  "[PASS] R5.7 corrected Worker patch applied"
);