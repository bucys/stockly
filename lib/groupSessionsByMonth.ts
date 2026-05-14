// Pure helper — keep the History screen focused on data fetching and the
// row component focused on presentation. No React, no Supabase here.

export interface MonthGroup<T> {
  key: string; // YYYY-MM
  label: string; // e.g. "May 2026"
  items: T[];
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function groupSessionsByMonth<T>(
  entries: T[],
  getIso: (entry: T) => string,
): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const key = monthKey(getIso(e));
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([key, items]) => ({ key, label: monthLabel(key), items }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}
