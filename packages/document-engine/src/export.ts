export type Cell = string | number | boolean | Date | null | undefined;

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  // Prevent spreadsheet formula injection from third-party text (e.g. company names from emails)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export async function toXlsx(sheetName: string, headers: string[], rows: Cell[][]): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "CareerFlow AI";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows)
    ws.addRow(
      r.map((v) => {
        if (typeof v === "string" && /^[=+\-@]/.test(v)) return `'${v}`;
        return v ?? null;
      }),
    );
  ws.columns.forEach((c) => (c.width = 20));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
