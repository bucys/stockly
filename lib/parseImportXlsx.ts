import * as XLSX from 'xlsx';
import type { ParsedImportRow, ParseError, ParseResult } from './parseImportText';
import { detectHeaderMap, trimEdges, type ColumnKey } from './parseImportCsv';

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : '';
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function parseQuantity(raw: string): { value: number | null; valid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, valid: true };
  // XLSX cells preserve number type; for string cells we accept decimal comma too.
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return { value: null, valid: false };
  return { value: n, valid: true };
}

export function parseImportXlsx(base64: string): ParseResult {
  if (!base64 || typeof base64 !== 'string') return { rows: [], skippedLines: 0 };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(base64, { type: 'base64' });
  } catch (err) {
    console.warn('[parseImportXlsx] read error:', err);
    return { rows: [], skippedLines: 0 };
  }
  const firstSheetName = wb.SheetNames?.[0];
  if (!firstSheetName) return { rows: [], skippedLines: 0 };
  const sheet = wb.Sheets?.[firstSheetName];
  if (!sheet) return { rows: [], skippedLines: 0 };
  // header: 1 → array of arrays. defval: '' → keep empty cells as ''. blankrows: false → drop fully empty rows.
  let aoa: unknown[][];
  try {
    aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: true,
    });
  } catch (err) {
    console.warn('[parseImportXlsx] sheet_to_json error:', err);
    return { rows: [], skippedLines: 0 };
  }
  if (!Array.isArray(aoa) || aoa.length === 0) return { rows: [], skippedLines: 0 };

  const rowsTrimmed: string[][] = aoa.map((row) =>
    trimEdges((Array.isArray(row) ? row : []).map((c) => cellToString(c).trim())),
  );

  let headerMap: Record<ColumnKey, number> | null = null;
  let headerRowIndex = -1;
  for (let r = 0; r < rowsTrimmed.length; r++) {
    if (rowsTrimmed[r].length === 0) continue;
    headerMap = detectHeaderMap(rowsTrimmed[r]);
    if (headerMap) headerRowIndex = r;
    break;
  }

  const get = (parts: string[], idx: number): string =>
    idx >= 0 && idx < parts.length ? parts[idx] : '';

  const rows: ParsedImportRow[] = [];
  let skippedLines = 0;

  for (let r = 0; r < rowsTrimmed.length; r++) {
    const parts = rowsTrimmed[r];
    const rawLine = parts.join('\t');

    if (parts.length === 0) {
      skippedLines++;
      continue;
    }
    if (r === headerRowIndex) {
      skippedLines++;
      continue;
    }

    const errors: ParseError[] = [];
    if (parts.length < 3) errors.push('too_few_fields');

    const name = headerMap ? get(parts, headerMap.name) : (parts[0] ?? '');
    const categoryName = headerMap ? get(parts, headerMap.category) : (parts[1] ?? '');
    const unit = headerMap ? get(parts, headerMap.unit) : (parts[2] ?? '');
    const qtyRaw = headerMap ? get(parts, headerMap.qty) : (parts[3] ?? '');

    if (name === '') errors.push('missing_name');
    if (categoryName === '') errors.push('missing_category');
    if (unit === '') errors.push('missing_unit');

    const { value: quantity, valid: qtyValid } = parseQuantity(qtyRaw);
    if (!qtyValid) errors.push('invalid_quantity');

    rows.push({
      lineNumber: r + 1,
      raw: rawLine,
      name,
      categoryName,
      unit,
      quantity,
      errors,
    });
  }

  return { rows, skippedLines };
}
