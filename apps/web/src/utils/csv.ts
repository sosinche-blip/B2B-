export function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  return '"' + text.replace(/"/g, '""') + '"';
}

export function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export function saveBlobWithDownload(filename: string, blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
}

export function downloadCsvFile(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  saveBlobWithDownload(filename, blob);
}

export function makeExcelBlob(sheets: Array<{ name: string; rows: Array<Array<string | number>>; showTitle?: boolean }>) {
  const escapeHtml = (value: string | number) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const html = `<!doctype html><html><head><meta charset="utf-8" />
  <style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px;mso-number-format:'\\@';}th{background:#eef4fd;font-weight:bold}.num{mso-number-format:'0';}</style>
  </head><body>${sheets.map((sheet) => `
    ${sheet.showTitle === false ? "" : `<h2>${escapeHtml(sheet.name)}</h2>`}
    <table>${sheet.rows.map((row, rowIndex) => `<tr>${row.map((cell) => rowIndex === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>
  `).join("<br />")}</body></html>`;

  return new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
}

export function downloadExcelFile(filename: string, sheets: Array<{ name: string; rows: Array<Array<string | number>>; showTitle?: boolean }>) {
  saveBlobWithDownload(filename, makeExcelBlob(sheets));
}
