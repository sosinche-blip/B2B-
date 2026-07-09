import * as XLSX from "xlsx";
import { parseCsvLine, saveBlobWithDownload } from "./csv";

declare global {
  interface Window {
    XLSX?: {
      read: (data: ArrayBuffer, options: Record<string, unknown>) => any;
      write: (workbook: unknown, options: Record<string, unknown>) => ArrayBuffer;
      utils: {
        sheet_to_json: (sheet: unknown, options: Record<string, unknown>) => unknown[][];
        aoa_to_sheet: (rows: Array<Array<string | number>>) => unknown;
        book_new: () => unknown;
        book_append_sheet: (workbook: unknown, worksheet: unknown, name: string) => void;
      };
    };
  }
}

function bundledXlsx() {
  return XLSX;
}

async function loadXlsxLibrary() {
  // V180: SheetJS is bundled into the web build. Do not rely on an external CDN,
  // because mobile networks, CSP, or ad blockers can block jsdelivr and make
  // mapping upload fail even when the file itself is valid.
  return bundledXlsx();
}

function rowsFromCsvText(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseCsvLine(line).map((cell) => String(cell ?? "").trim()));
}

function textDecoder() {
  return new TextDecoder("utf-8");
}

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(view: DataView) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === signature) return offset;
  }
  throw new Error("엑셀 ZIP 구조를 찾지 못했습니다.");
}

function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const decoder = textDecoder();
  const eocd = findEndOfCentralDirectory(view);
  const totalEntries = readUint16(view, eocd + 10);
  const centralDirectoryOffset = readUint32(view, eocd + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (readUint32(view, offset) !== 0x02014b50) break;
    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameBytes = new Uint8Array(buffer, offset + 46, fileNameLength);
    entries.push({ name: decoder.decode(nameBytes), method, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array) {
  const DecompressionStreamCtor = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new Error("브라우저가 엑셀 압축 해제를 지원하지 않습니다. CSV로 저장 후 업로드하거나 최신 Chrome/Edge에서 다시 시도하세요.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buffer: ArrayBuffer, entry: ZipEntry) {
  const view = new DataView(buffer);
  const localOffset = entry.localHeaderOffset;
  if (readUint32(view, localOffset) !== 0x04034b50) {
    throw new Error(`엑셀 ZIP 로컬 헤더 오류: ${entry.name}`);
  }
  const fileNameLength = readUint16(view, localOffset + 26);
  const extraLength = readUint16(view, localOffset + 28);
  const start = localOffset + 30 + fileNameLength + extraLength;
  const compressed = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRaw(compressed);
  throw new Error(`지원하지 않는 엑셀 압축 방식입니다: ${entry.method}`);
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error("엑셀 XML 파싱 실패");
  return doc;
}

function columnIndexFromRef(ref: string) {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] || "A").toUpperCase();
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function cellXmlText(element: Element) {
  return Array.from(element.getElementsByTagName("t")).map((node) => node.textContent || "").join("");
}

async function readXlsxRowsWithFallback(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = listZipEntries(buffer);
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  const decoder = textDecoder();
  const sharedEntry = entryMap.get("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];
  if (sharedEntry) {
    const sharedXml = decoder.decode(await readZipEntry(buffer, sharedEntry));
    const sharedDoc = parseXml(sharedXml);
    Array.from(sharedDoc.getElementsByTagName("si")).forEach((si) => {
      sharedStrings.push(cellXmlText(si));
    });
  }

  const sheetEntry =
    entryMap.get("xl/worksheets/sheet1.xml") ||
    entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  if (!sheetEntry) throw new Error("엑셀 첫 번째 시트를 찾지 못했습니다.");
  const sheetXml = decoder.decode(await readZipEntry(buffer, sheetEntry));
  const sheetDoc = parseXml(sheetXml);
  const rows: string[][] = [];
  Array.from(sheetDoc.getElementsByTagName("row")).forEach((rowElement) => {
    const row: string[] = [];
    Array.from(rowElement.getElementsByTagName("c")).forEach((cellElement) => {
      const ref = cellElement.getAttribute("r") || "A1";
      const colIndex = columnIndexFromRef(ref);
      const type = cellElement.getAttribute("t") || "";
      let value = "";
      if (type === "inlineStr") {
        value = cellXmlText(cellElement);
      } else {
        const v = cellElement.getElementsByTagName("v")[0]?.textContent || "";
        value = type === "s" ? sharedStrings[Number(v)] || "" : v;
      }
      row[colIndex] = String(value ?? "").trim();
    });
    if (row.some((cell) => String(cell ?? "").trim())) rows.push(row.map((cell) => String(cell ?? "").trim()));
  });
  return rows;
}

export async function readSpreadsheetRows(file: File): Promise<string[][]> {
  if (!isSpreadsheetFile(file)) {
    throw new Error("엑셀(.xlsx/.xls) 또는 CSV 파일만 가져올 수 있습니다.");
  }

  if (isCsvFile(file)) {
    const text = await file.text();
    return rowsFromCsvText(text);
  }

  const buffer = await file.arrayBuffer();
  if (isXlsxFile(file)) {
    try {
      return await readXlsxRowsWithFallback(buffer);
    } catch (fallbackError) {
      try {
        const xlsx = await loadXlsxLibrary();
        const workbook = xlsx.read(buffer, { type: "array", cellDates: false, raw: false });
        const sheetName = workbook.SheetNames?.[0];
        if (!sheetName) return [];
        const worksheet = workbook.Sheets[sheetName];
        const aoa = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as unknown[][];
        return aoa
          .map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])
          .filter((row) => row.some((cell) => cell.length > 0));
      } catch (libraryError) {
        throw new Error(`엑셀 업로드 오류: 파일을 읽지 못했습니다. 원인: ${String(libraryError || fallbackError)}. 가능하면 '채널, 옵션ID, 업체명, 코드번호, 업체상품명, 원가, 기본수량' 7개 열의 xlsx 또는 CSV로 저장해 다시 업로드하세요.`);
      }
    }
  }

  try {
    const xlsx = await loadXlsxLibrary();
    const workbook = xlsx.read(buffer, { type: "array", cellDates: false, raw: false });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) return [];
    const worksheet = workbook.Sheets[sheetName];
    const aoa = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as unknown[][];
    return aoa
      .map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])
      .filter((row) => row.some((cell) => cell.length > 0));
  } catch (error) {
    throw new Error(`엑셀 업로드 오류: ${String(error)}`);
  }
}

export function spreadsheetKind(file: File) {
  return file.name.toLowerCase().endsWith(".csv") ? "CSV" : "엑셀";
}

export async function createXlsxBlob(sheets: Array<{ name: string; rows: Array<Array<string | number>> }>) {
  const xlsx = await loadXlsxLibrary();
  const workbook = xlsx.utils.book_new();
  sheets.forEach((sheet) => {
    const worksheet = xlsx.utils.aoa_to_sheet(sheet.rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || "Sheet1");
  });
  const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function downloadXlsxFile(filename: string, sheets: Array<{ name: string; rows: Array<Array<string | number>> }>) {
  saveBlobWithDownload(filename, await createXlsxBlob(sheets));
}
