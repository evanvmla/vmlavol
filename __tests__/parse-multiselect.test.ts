import { parseMultiselect } from '@/lib/parse-multiselect';

describe('parseMultiselect', () => {
  it('passes through array input', () => {
    expect(parseMultiselect(['A', 'B'])).toEqual(['A', 'B']);
  });

  it('splits comma-separated string', () => {
    expect(parseMultiselect('A, B, C')).toEqual(['A', 'B', 'C']);
  });

  it('handles single-item string', () => {
    expect(parseMultiselect('SingleValue')).toEqual(['SingleValue']);
  });

  it('returns empty array for empty string', () => {
    expect(parseMultiselect('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseMultiselect('   ')).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseMultiselect(undefined)).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(parseMultiselect(null)).toEqual([]);
  });
});
