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

    const { data: customFields } = await supabase
      .from('custom_fields')
      .select('*');

    let volQuery = supabase
      .from('volunteers')
      .select('id')
      .eq('status', 'active');

    const filters = body.filter_criteria || {};

    // New rules-based filtering
    const rules: FilterRule[] = filters.rules || [];
    volQuery = applyFilterRules(volQuery, rules, (customFields as CustomField[]) || []);

    // Backward-compat: legacy tag / source_form_id keys
    if (filters.tag) {
      volQuery = volQuery.contains('tags', [filters.tag]);
    }
    if (filters.source_form_id) {
      volQuery = volQuery.eq('source_form_id', filters.source_form_id);
    }

    const { data: volunteers, error: volError } = await volQuery;
    if (volError) throw volError;

    if (!volunteers || volunteers.length === 0) {
      return NextResponse.json({ error: 'No matching recipients' }, { status: 400 });
    }

    // from_address/cc/bcc are stored in filter_criteria JSONB to avoid a schema migration.
    // This is intentional — they are send-level metadata alongside the filter rules.
    const { from_address, cc, bcc } = body;
    const enrichedCriteria = {
      ...filters,
      ...(from_address ? { from_address } : {}),
      ...(Array.isArray(cc) && cc.length ? { cc } : {}),
      ...(Array.isArray(bcc) && bcc.length ? { bcc } : {}),
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
    }));

    for (let i = 0; i < recipientRows.length; i += 500) {
      const batch = recipientRows.slice(i, i + 500);
      const { error: insertError } = await supabase
        .from('email_recipients')
        .insert(batch);
      if (insertError) throw insertError;
    }

    return NextResponse.json(
      { id: emailSend.id, recipient_count: volunteers.length },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err, 'POST /api/email/send');
  }
}
