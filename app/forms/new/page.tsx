'use client';

import { useRouter } from 'next/navigation';
import { FormEditor } from '@/components/forms/FormEditor';

export default function NewFormPage() {
  const router = useRouter();

  async function handleSave(data: Record<string, unknown>) {
    const res = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const form = await res.json();
      router.push(`/forms/${form.id}`);
    }
  }

  return <FormEditor onSave={handleSave} />;
}
