import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { applyFilterRules } from '@/lib/filter-volunteers';
import type { FilterRule } from '@/lib/filter-volunteers';
import type { CustomField } from '@/lib/types';

// POST /api/email/send/[id] — trigger sending of a saved draft
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseAdmin();

    // Load the draft
    const { data: draft, error: fetchError } = await supabase
      .from('email_sends')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !draft) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }
    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Email is not a draft' }, { status: 400 });
    }

    const { data: customFields } = await supabase.from('custom_fields').select('*');

    // Resolve recipients from stored filter_criteria
    const criteria = (draft.filter_criteria || {}) as Record<string, unknown>;
    const volunteerIds = criteria.volunteer_ids as string[] | undefined;

    let volunteers: { id: string }[] | null = null;
    let volError: unknown = null;

    if (Array.isArray(volunteerIds) && volunteerIds.length > 0) {
      const result = await supabase
        .from('volunteers')
        .select('id')
        .eq('status', 'active')
        .not('email', 'is', null)
        .in('id', volunteerIds)
        .limit(50000);
      volunteers = result.data;
      volError = result.error;
    } else {
      let volQuery = supabase
        .from('volunteers')
        .select('id')
        .eq('status', 'active')
        .not('email', 'is', null)
        .limit(50000);

      const rules: FilterRule[] = (criteria.rules as FilterRule[]) || [];
      volQuery = applyFilterRules(volQuery, rules, (customFields as CustomField[]) || []);

      if (criteria.tag) volQuery = volQuery.contains('tags', [criteria.tag as string]);
      if (criteria.source_form_id) volQuery = volQuery.eq('source_form_id', criteria.source_form_id as string);

      const result = await volQuery;
      volunteers = result.data;
      volError = result.error;
    }

    if (volError) throw volError;
    if (!volunteers || volunteers.length === 0) {
      return NextResponse.json({ error: 'No matching recipients' }, { status: 400 });
    }

    // Update email_sends to sending
    const { error: updateError } = await supabase
      .from('email_sends')
      .update({
        status: 'sending',
        recipient_count: volunteers.length,
        sent_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (updateError) throw updateError;

    // Create recipient rows in batches
    const recipientRows = volunteers.map((vol) => ({
      email_send_id: params.id,
      volunteer_id: vol.id,
      status: 'pending',
      retry_count: 0,
    }));

    for (let i = 0; i < recipientRows.length; i += 500) {
      const { error: insertError } = await supabase
        .from('email_recipients')
        .insert(recipientRows.slice(i, i + 500));
      if (insertError) throw insertError;
    }

    // Log interactions (non-fatal)
    try {
      const interactionRows = volunteers.map((vol) => ({
        volunteer_id: vol.id,
        type: 'email',
        description: draft.subject,
        metadata: { email_send_id: params.id },
        created_by: 'system',
      }));
      for (let i = 0; i < interactionRows.length; i += 500) {
        await supabase.from('interactions').insert(interactionRows.slice(i, i + 500));
      }
    } catch (interactionErr) {
      console.error('[email-send/[id]/interactions]', interactionErr);
    }

    return NextResponse.json({ id: params.id, recipient_count: volunteers.length });
  } catch (err) {
    return handleError(err, 'POST /api/email/send/[id]');
  }
}
