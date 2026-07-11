import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();

async function loadTypeScriptModule(relativePath) {
  const filename = resolve(root, relativePath);
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
    },
    fileName: filename,
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(url);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`[FAIL] ${label}`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] ${label}`);
}

const workerAddress = await loadTypeScriptModule("apps/worker/src/address.ts");
const webAddress = await loadTypeScriptModule("apps/web/src/utils/address.ts");

const cases = [
  {
    label: "괄호 뒤 상세주소 보존",
    values: [
      "경남 남해군 남해읍 화전로 10 (남해리)",
      "",
      "101동 1203호",
    ],
    expected: "경남 남해군 남해읍 화전로 10 (남해리) 101동 1203호",
  },
  {
    label: "전체주소가 기본주소보다 길면 전체주소 우선",
    values: [
      "서울 강남구 테헤란로 1 (역삼동)",
      "서울 강남구 테헤란로 1 (역삼동) 2층 201호",
      "",
    ],
    expected: "서울 강남구 테헤란로 1 (역삼동) 2층 201호",
  },
  {
    label: "토스 address + detailAddress 결합",
    values: ["", "부산 해운대구 센텀로 20 (우동)", "A동 502호"],
    expected: "부산 해운대구 센텀로 20 (우동) A동 502호",
  },
  {
    label: "이미 포함된 상세주소 중복 방지",
    values: [
      "전남 순천시 중앙로 5 (중앙동)",
      "전남 순천시 중앙로 5 (중앙동) 3층",
      "3층",
    ],
    expected: "전남 순천시 중앙로 5 (중앙동) 3층",
  },
  {
    label: "줄바꿈 주소 정규화",
    values: ["제주 제주시 연북로 1 (연동)", "", "101호\n안쪽"],
    expected: "제주 제주시 연북로 1 (연동) 101호 안쪽",
  },
];

for (const testCase of cases) {
  assertEqual(
    workerAddress.joinAddressParts(...testCase.values),
    testCase.expected,
    `Worker ${testCase.label}`,
  );
  assertEqual(
    webAddress.joinAddressParts(...testCase.values),
    testCase.expected,
    `Web ${testCase.label}`,
  );
}

const workerSource = readFileSync(resolve(root, "apps/worker/src/worker.ts"), "utf8");
const appSource = readFileSync(resolve(root, "apps/web/src/App.tsx"), "utf8");

for (const [label, source, snippets] of [
  [
    "Worker API 주소 결합 경로",
    workerSource,
    [
      '"detailAddress"',
      '"parent.receiver.addr2"',
      "return joinAddressParts(baseAddress, directAddress, detailAddress);",
    ],
  ],
  [
    "Web 엑셀 주소1·주소2 결합 경로",
    appSource,
    [
      "function addressCell",
      "ADDRESS_DETAIL_ALIASES",
      "address: addressCell(row, map)",
    ],
  ],
]) {
  const missing = snippets.filter((snippet) => !source.includes(snippet));
  if (missing.length) {
    console.error(`[FAIL] ${label}: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`[PASS] ${label}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("[PASS] Address integrity regression verification completed.");
