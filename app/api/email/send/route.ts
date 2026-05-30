import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { validateRequired } from '@/lib/validation';
import { applyFilterRules } from '@/lib/filter-volunteers';
import type { FilterRule } from '@/lib/filter-volunteers';
import type { CustomField } from '@/lib/types';

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error, count } = await supabase
      .from('email_sends')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data, total: count });
  } catch (err) {
    return handleError(err, 'GET /api/email/send');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const missing = validateRequired(body, ['subject', 'body']);
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // Save-only: store as draft without resolving recipients
    if (body.save_only === true) {
      const { from_address, cc, bcc } = body;
      const volunteerIds: string[] | undefined = body.volunteer_ids;
      const filters = body.filter_criteria || {};
      const enrichedCriteria = {
        ...filters,
        ...(from_address ? { from_address } : {}),
        ...(Array.isArray(cc) && cc.length ? { cc } : {}),
        ...(Array.isArray(bcc) && bcc.length ? { bcc } : {}),
        ...(Array.isArray(volunteerIds) && volunteerIds.length ? { volunteer_ids: volunteerIds } : {}),
      };
      const { data: draft, error: draftError } = await supabase
        .from('email_sends')
        .insert({
          subject: body.subject,
          body: body.body,
          filter_criteria: enrichedCriteria,
          recipient_count: 0,
          status: 'draft',
          sent_at: null,
        })
        .select()
        .single();
      if (draftError) throw draftError;
      return NextResponse.json({ id: draft.id }, { status: 201 });
    }

    const { data: customFields } = await supabase
      .from('custom_fields')
      .select('*');

    // Two paths: specific volunteer IDs or filter-based resolution
    //   volunteer_ids[] → query by .in('id', ids).eq('status', 'active')
    //   filter_criteria  → applyFilterRules() (existing bulk flow)
    let volunteers: { id: string }[] | null = null;
    let volError: unknown = null;

    const volunteerIds: string[] | undefined = body.volunteer_ids;

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

      const filters = body.filter_criteria || {};

      // Rules-based filtering
      const rules: FilterRule[] = filters.rules || [];
      volQuery = applyFilterRules(volQuery, rules, (customFields as CustomField[]) || []);

      // Backward-compat: legacy tag / source_form_id keys
      if (filters.tag) {
        volQuery = volQuery.contains('tags', [filters.tag]);
      }
      if (filters.source_form_id) {
        volQuery = volQuery.eq('source_form_id', filters.source_form_id);
      }

      const result = await volQuery.limit(50000);
      volunteers = result.data;
      volError = result.error;
    }

    if (volError) throw volError;

    if (!volunteers || volunteers.length === 0) {
      return NextResponse.json({ error: 'No matching recipients' }, { status: 400 });
    }

    // from_address/cc/bcc/volunteer_ids are stored in filter_criteria JSONB for audit trail.
    const { from_address, cc, bcc } = body;
    const filters = body.filter_criteria || {};
    const enrichedCriteria = {
      ...filters,
      ...(from_address ? { from_address } : {}),
      ...(Array.isArray(cc) && cc.length ? { cc } : {}),
      ...(Array.isArray(bcc) && bcc.length ? { bcc } : {}),
      ...(Array.isArray(volunteerIds) && volunteerIds.length ? { volunteer_ids: volunteerIds } : {}),
    };

    // Create email send record
    const { data: emailSend, error: sendError } = await supabase
      .from('email_sends')
      .insert({
        subject: body.subject,
        body: body.body,
        filter_criteria: enrichedCriteria,
        recipient_count: volunteers.length,
        status: 'sending',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sendError) throw sendError;

    // Create recipient rows in batches of 500
    const recipientRows = volunteers.map(vol => ({
      email_send_id: emailSend.id,
      volunteer_id: vol.id,
      status: 'pending',
      retry_count: 0,
    }));

    for (let i = 0; i < recipientRows.length; i += 500) {
      const batch = recipientRows.slice(i, i + 500);
      const { error: insertError } = await supabase
        .from('email_recipients')
        .insert(batch);
      if (insertError) throw insertError;
    }

    // Auto-log interactions for email send
    try {
      const interactionRows = volunteers.map(vol => ({
        volunteer_id: vol.id,
        type: 'email',
        description: body.subject,
        metadata: { email_send_id: emailSend.id },
        created_by: 'system',
      }));
      for (let i = 0; i < interactionRows.length; i += 500) {
        const batch = interactionRows.slice(i, i + 500);
        await supabase.from('interactions').insert(batch);
      }
    } catch (interactionErr) {
      console.error('[email-send/interactions]', interactionErr);
      // Non-fatal: email still sends even if interaction logging fails
    }

    return NextResponse.json(
      { id: emailSend.id, recipient_count: volunteers.length },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err, 'POST /api/email/send');
  }
}
