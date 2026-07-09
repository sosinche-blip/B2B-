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

let xlsxLoadingPromise: Promise<void> | null = null;

export function isSpreadsheetFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("csv") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type.startsWith("text/")
  );
}

function isCsvFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".csv") || file.type.includes("csv") || file.type.startsWith("text/");
}

async function loadXlsxLibrary() {
  if (window.XLSX) return;
  if (!xlsxLoadingPromise) {
    xlsxLoadingPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-b2b-xlsx="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("엑셀 읽기 라이브러리를 불러오지 못했습니다.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      script.dataset.b2bXlsx = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("엑셀 읽기 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV로 등록해 주세요."));
      document.head.appendChild(script);
    });
  }
  await xlsxLoadingPromise;
  if (!window.XLSX) throw new Error("엑셀 읽기 라이브러리가 준비되지 않았습니다.");
}

function rowsFromCsvText(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseCsvLine(line).map((cell) => String(cell ?? "").trim()));
}

export async function readSpreadsheetRows(file: File): Promise<string[][]> {
  if (!isSpreadsheetFile(file)) {
    throw new Error("엑셀(.xlsx/.xls) 또는 CSV 파일만 가져올 수 있습니다.");
  }

  if (isCsvFile(file)) {
    const text = await file.text();
    return rowsFromCsvText(text);
  }

  await loadXlsxLibrary();
  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX!.read(buffer, { type: "array", cellDates: false, raw: false });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const aoa = window.XLSX!.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
  return aoa
    .map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function spreadsheetKind(file: File) {
  return file.name.toLowerCase().endsWith(".csv") ? "CSV" : "엑셀";
}


export async function createXlsxBlob(sheets: Array<{ name: string; rows: Array<Array<string | number>> }>) {
  await loadXlsxLibrary();
  const workbook = window.XLSX!.utils.book_new();
  sheets.forEach((sheet) => {
    const worksheet = window.XLSX!.utils.aoa_to_sheet(sheet.rows);
    window.XLSX!.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || "Sheet1");
  });
  const buffer = window.XLSX!.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function downloadXlsxFile(filename: string, sheets: Array<{ name: string; rows: Array<Array<string | number>> }>) {
  saveBlobWithDownload(filename, await createXlsxBlob(sheets));
}
