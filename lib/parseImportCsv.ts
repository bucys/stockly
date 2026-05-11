import type { ParsedImportRow, ParseError, ParseResult } from './parseImportText';

export type ColumnKey = 'name' | 'category' | 'unit' | 'qty';

// Aliases are matched after lowercasing + stripping diacritics + collapsing
// whitespace, so e.g. "Produkto Pavadinimas" and "produkto pavadinimas" both
// map to the same token.
const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  name: ['name', 'product', 'product name', 'produkto pavadinimas', 'pavadinimas'],
  category: ['category', 'kategorija'],
  unit: ['unit', 'vienetas'],
  qty: ['qty', 'quantity', 'kiekis'],
};

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchHeader(raw: string): ColumnKey | null {
  const norm = normalizeHeader(raw);
  for (const key of Object.keys(HEADER_ALIASES) as ColumnKey[]) {
    if (HEADER_ALIASES[key].includes(norm)) return key;
  }
  return null;
}

export function detectHeaderMap(parts: string[]): Record<ColumnKey, number> | null {
  const map: Partial<Record<ColumnKey, number>> = {};
  let matches = 0;
  for (let i = 0; i < parts.length; i++) {
    const key = matchHeader(parts[i]);
    if (key && map[key] == null) {
      map[key] = i;
      matches++;
    }
  }
  // Require at least name + category + unit to consider it a header row.
  if (map.name != null && map.category != null && map.unit != null) {
    return {
      name: map.name,
      category: map.category,
      unit: map.unit,
      qty: map.qty ?? -1,
    };
  }
  // Fallback: at least 2 strong matches → still treat as header (qty optional).
  if (matches >= 3) {
    return {
      name: map.name ?? 0,
      category: map.category ?? 1,
      unit: map.unit ?? 2,
      qty: map.qty ?? 3,
    };
  }
  return null;
}

export function trimEdges(parts: string[]): string[] {
  let start = 0;
  let end = parts.length;
  while (start < end && parts[start] === '') start++;
  while (end > start && parts[end - 1] === '') end--;
  return parts.slice(start, end);
}

function detectDelimiter(sample: string): ',' | ';' | '\t' {
  if (sample.includes('\t')) return '\t';
  // Outside of quotes, count commas vs semicolons in the first non-empty line.
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  for (const ch of sample) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  if (semis > commas) return ';';
  return ',';
}

function splitCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  // We don't know the delimiter yet — collect on first pass with a placeholder,
  // then re-tokenize after detection. Simpler: detect delimiter from the first
  // line ignoring quoted regions, then tokenize the whole text in one pass.
  const firstLineEnd = (() => {
    let q = false;
    for (let k = 0; k < input.length; k++) {
      const c = input[k];
      if (c === '"') q = !q;
      else if (!q && (c === '\n' || c === '\r')) return k;
    }
    return input.length;
  })();
  const delim = detectDelimiter(input.slice(0, firstLineEnd));

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === delim) {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r') {
      if (input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      i++;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush trailing field/row.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseQuantity(
  raw: string,
  delim: ',' | ';' | '\t',
  wasQuoted: boolean,
): { value: number | null; valid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, valid: true };
  // Decimal comma is only safe to convert when delimiter isn't comma,
  // or when the field was quoted (so the comma can't be a delimiter).
  const allowDecimalComma = delim !== ',' || wasQuoted;
  const normalized = allowDecimalComma ? trimmed.replace(',', '.') : trimmed;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return { value: null, valid: false };
  return { value: n, valid: true };
}

export function parseImportCsv(input: string): ParseResult {
  const rows: ParsedImportRow[] = [];
  let skippedLines = 0;

  if (typeof input !== 'string' || input.length === 0) {
    return { rows: [], skippedLines: 0 };
  }

  // Strip UTF-8 BOM if present.
  const cleaned = input.replace(/^﻿/, '');

  // Reject obviously binary content (e.g. user picked an XLSX/PDF while
  // expecting CSV). Sample the first 1KB and bail if >5% control chars.
  const sample = cleaned.slice(0, 1024);
  if (sample.length > 0) {
    let control = 0;
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      if (code === 0) return { rows: [], skippedLines: 0 };
      if (code < 9 || (code > 13 && code < 32)) control++;
    }
    if (control / sample.length > 0.05) return { rows: [], skippedLines: 0 };
  }

  // Detect delimiter from first non-empty line for the qty-decimal logic below.
  const firstNonEmpty =
    cleaned.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const delim = detectDelimiter(firstNonEmpty);

  // Track which fields were quoted so we can decide decimal-comma handling.
  // splitCsvRows strips quotes; re-detect by looking at the raw line for the qty cell.
  const rawLines = cleaned.split(/\r?\n/);
  const tokenized = splitCsvRows(cleaned);

  // Trim empty leading/trailing columns. Spreadsheet exports often pad rows
  // with trailing empty cells (e.g. ";;;;") and may include a leading empty
  // column too. We strip those before header detection and column mapping.
  const trimmedRows: string[][] = tokenized.map((row) =>
    trimEdges(row.map((p) => p.trim())),
  );

  // Detect header from the first non-empty trimmed row.
  let headerMap: Record<ColumnKey, number> | null = null;
  let headerRowIndex = -1;
  for (let r = 0; r < trimmedRows.length; r++) {
    if (trimmedRows[r].length === 0) continue;
    headerMap = detectHeaderMap(trimmedRows[r]);
    if (headerMap) headerRowIndex = r;
    break;
  }

  const get = (parts: string[], idx: number): string =>
    idx >= 0 && idx < parts.length ? parts[idx] : '';

  let lineNumber = 0;

  for (let r = 0; r < trimmedRows.length; r++) {
    lineNumber = r + 1;
    const parts = trimmedRows[r];
    const rawLine = rawLines[r] ?? parts.join(String(delim));

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

    // A qty cell counts as quoted if its raw form in the source line begins
    // with a double quote after stripping leading delimiters/whitespace.
    // Cheap heuristic: if the raw line contains `"…,…"` patterns, treat any
    // quoted occurrence as wasQuoted=true. We approximate by checking whether
    // the qty value as parsed differs from a naive comma-split (i.e. quoting
    // changed the result). Good enough: if rawLine has a `"` we allow decimal
    // comma in the qty cell.
    const wasQuoted = rawLine.includes('"');
    const { value: quantity, valid: qtyValid } = parseQuantity(qtyRaw, delim, wasQuoted);
    if (!qtyValid) errors.push('invalid_quantity');

    rows.push({
      lineNumber,
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
