export function parseMultiselect(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string' && raw.trim()) return raw.split(',').map(s => s.trim());
  return [];
}
