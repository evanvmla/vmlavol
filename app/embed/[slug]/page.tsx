import { createSupabaseAdmin } from '@/lib/supabase-server';
import { PublicSignupForm } from '@/components/embed/PublicSignupForm';
import type { CustomField } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EmbedFormPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseAdmin();
  const { data: form } = await supabase
    .from('forms')
    .select('id, name, slug, description, confirmation_message, welcome_email_subject, welcome_email_body, field_ids, hidden_fields, is_active')
    .eq('slug', params.slug)
    .single();

  if (!form) {
    return (
      <div className="p-8 text-center text-gray-500">
        Form not found.
      </div>
    );
  }

  if (!form.is_active) {
    return (
      <div className="p-8 text-center text-gray-500">
        This form is no longer accepting submissions.
      </div>
    );
  }

  let customFields: CustomField[] = [];
  if (form.field_ids && form.field_ids.length > 0) {
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .in('id', form.field_ids)
      .order('display_order', { ascending: true });
    customFields = data || [];
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <PublicSignupForm
        slug={form.slug}
        name={form.name}
        description={form.description}
        confirmationMessage={form.confirmation_message}
        hiddenFields={form.hidden_fields || []}
        customFields={customFields}
      />
    </div>
  );
}
