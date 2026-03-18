import type { Volunteer } from '@/lib/types';

type SelectedVol = Pick<Volunteer, 'id' | 'first_name' | 'last_name' | 'email'>;

export function filterVolunteersWithEmail(
  volunteers: Volunteer[],
  selectedIds: Set<string>,
): SelectedVol[] {
  return volunteers
    .filter(v => selectedIds.has(v.id) && v.email)
    .map(v => ({ id: v.id, first_name: v.first_name, last_name: v.last_name, email: v.email }));
}
