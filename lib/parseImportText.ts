export interface ParsedImportRow {
  lineNumber: number;
  raw: string;
  name: string;
  categoryName: string;
  unit: string;
  quantity: number | null;
  errors: ParseError[];
}

export type ParseError =
  | 'missing_name'
  | 'missing_category'
  | 'missing_unit'
  | 'invalid_quantity'
  | 'too_few_fields';

export interface ParseResult {
  rows: ParsedImportRow[];
  skippedLines: number;
}

const COMMENT_PREFIXES = ['#', '//'];

function detectDelimiter(line: string): ',' | ';' | '\t' {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
}

function parseQuantity(raw: string): { value: number | null; valid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, valid: true };
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return { value: null, valid: false };
  return { value: n, valid: true };
}

export function parseImportText(input: string): ParseResult {
  const rows: ParsedImportRow[] = [];
  let skippedLines = 0;

  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '') {
      skippedLines++;
      continue;
    }
    if (COMMENT_PREFIXES.some((p) => trimmed.startsWith(p))) {
      skippedLines++;
      continue;
    }

    const delim = detectDelimiter(trimmed);
    const parts = trimmed.split(delim).map((p) => p.trim());
    const errors: ParseError[] = [];

    if (parts.length < 3) errors.push('too_few_fields');

    const name = parts[0] ?? '';
    const categoryName = parts[1] ?? '';
    const unit = parts[2] ?? '';
    const qtyRaw = parts[3] ?? '';

    if (name === '') errors.push('missing_name');
    if (categoryName === '') errors.push('missing_category');
    if (unit === '') errors.push('missing_unit');

    const { value: quantity, valid: qtyValid } = parseQuantity(qtyRaw);
    if (!qtyValid) errors.push('invalid_quantity');

    rows.push({
      lineNumber: i + 1,
      raw,
      name,
      categoryName,
      unit,
      quantity,
      errors,
    });
  }

  return { rows, skippedLines };
}
