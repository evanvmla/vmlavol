'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEditor } from '@/components/forms/FormEditor';
import type { Form } from '@/lib/types';

function NewFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get('from');
  const [initialData, setInitialData] = useState<Partial<Form> | undefined>(
    fromId ? undefined : {}
  );

  useEffect(() => {
    if (!fromId) return;
    fetch(`/api/forms/${fromId}`)
      .then((r) => r.json())
      .then((form: Form) => {
        setInitialData({
          name: `${form.name} (Copy)`,
          slug: '',
          description: form.description,
          confirmation_message: form.confirmation_message,
          welcome_email_subject: form.welcome_email_subject,
          welcome_email_body: form.welcome_email_body,
          field_ids: form.field_ids,
          hidden_fields: form.hidden_fields,
          is_active: form.is_active,
        });
      });
  }, [fromId]);

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

  if (initialData === undefined) {
    return <p className="text-gray-500">Loading...</p>;
  }

  return <FormEditor initialData={initialData} onSave={handleSave} />;
}

export default function NewFormPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading...</p>}>
      <NewFormInner />
    </Suspense>
  );
}
