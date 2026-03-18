import { redirect } from 'next/navigation';

export default function FieldsPage() {
  redirect('/settings?tab=fields');
}
