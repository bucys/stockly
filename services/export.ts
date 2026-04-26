export interface ExportRow {
  category: string;
  product: string;
  unit: string;
  previousQty: number | null;
  currentQty: number | null;
}

function escapeCSV(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function formatDifference(previousQty: number | null, currentQty: number | null): string {
  // Parse through Number() because Supabase's numeric columns can arrive as strings at runtime
  const prev = previousQty !== null && previousQty !== undefined ? Number(previousQty) : null;
  const curr = currentQty !== null && currentQty !== undefined ? Number(currentQty) : null;

  if (prev === null || curr === null || isNaN(prev) || isNaN(curr)) return '';

  // Round to 6 decimal places to eliminate floating-point drift (e.g. 5.100000000000001)
  const diff = Math.round((curr - prev) * 1_000_000) / 1_000_000;

  if (!isFinite(diff)) return '';
  if (diff > 0) return `+${diff}`;
  if (diff < 0) return String(diff);
  return '0';
}

export function buildCSV(
  rows: ExportRow[],
  sessionCreatedAt: string,
  locationName: string,
): string {
  const sessionDt = formatDateTime(new Date(sessionCreatedAt));
  const exportedDt = formatDateTime(new Date());

  const header = [
    'Inventory Export',
    `Session: Inventory Session (${sessionDt})`,
    `Location: ${locationName}`,
    `Exported: ${exportedDt}`,
    '',
    'Category,Product,Unit,Previous Qty,Current Qty,Difference',
  ];

  const lines = rows.map((row) => {
    return [
      escapeCSV(row.category),
      escapeCSV(row.product),
      escapeCSV(row.unit),
      escapeCSV(row.previousQty),
      escapeCSV(row.currentQty),
      escapeCSV(formatDifference(row.previousQty, row.currentQty)),
    ].join(',');
  });

  // UTF-8 BOM prefix — ensures Excel/Sheets recognises encoding for special characters
  return '﻿' + [...header, ...lines].join('\n');
}
