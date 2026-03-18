'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FormEditor } from '@/components/forms/FormEditor';
import type { Form } from '@/lib/types';

export default function EditFormPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    fetch(`/api/forms/${id}`)
      .then((r) => r.json())
      .then(setForm);
  }, [id]);

  async function handleSave(data: Record<string, unknown>) {
    const res = await fetch(`/api/forms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setForm(updated);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this form?')) return;
    await fetch(`/api/forms/${id}`, { method: 'DELETE' });
    router.push('/forms');
  }

  if (!form) return <p className="text-gray-500">Loading...</p>;

  return <FormEditor form={form} onSave={handleSave} onDelete={handleDelete} />;
}
