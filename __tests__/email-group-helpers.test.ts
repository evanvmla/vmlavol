import { filterVolunteersWithEmail } from '@/lib/email-group-helpers';
import type { Volunteer } from '@/lib/types';

function makeVol(overrides: Partial<Volunteer> & { id: string }): Volunteer {
  return {
    first_name: 'Test',
    last_name: 'User',
    email: null,
    phone: null,
    zip_code: null,
    source_form_id: null,
    custom_data: {},
    tags: [],
    notes: null,
    status: 'active',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

describe('filterVolunteersWithEmail', () => {
  const volunteers: Volunteer[] = [
    makeVol({ id: '1', first_name: 'Alice', email: 'alice@example.com' }),
    makeVol({ id: '2', first_name: 'Bob', email: null }),
    makeVol({ id: '3', first_name: 'Carol', email: 'carol@example.com' }),
    makeVol({ id: '4', first_name: 'Dave', email: 'dave@example.com' }),
  ];

  it('includes selected volunteers that have emails', () => {
    const result = filterVolunteersWithEmail(volunteers, new Set(['1', '3']));
    expect(result).toEqual([
      { id: '1', first_name: 'Alice', last_name: 'User', email: 'alice@example.com' },
      { id: '3', first_name: 'Carol', last_name: 'User', email: 'carol@example.com' },
    ]);
  });

  it('excludes volunteers without emails', () => {
    const result = filterVolunteersWithEmail(volunteers, new Set(['1', '2']));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('only includes selected IDs', () => {
    const result = filterVolunteersWithEmail(volunteers, new Set(['4']));
    expect(result).toEqual([
      { id: '4', first_name: 'Dave', last_name: 'User', email: 'dave@example.com' },
    ]);
  });

  it('returns empty array when no selected volunteers have email', () => {
    const result = filterVolunteersWithEmail(volunteers, new Set(['2']));
    expect(result).toEqual([]);
  });
});
