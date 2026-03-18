import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { computeSummary } from '@/lib/email-summary';
import type { EmailSend, RecipientStat, RecipientTagStat } from '@/lib/email-summary';

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();

    // Fetch non-draft sends (50 most recent)
    const { data: sends, error: sendsError } = await supabase
      .from('email_sends')
      .select('id, subject, body, filter_criteria, recipient_count, status, sent_at, created_at')
      .neq('status', 'draft')
      .order('sent_at', { ascending: false })
      .limit(50);

    if (sendsError) throw sendsError;

    // Aggregated recipient stats via RPC
    const { data: stats, error: statsError } = await supabase.rpc('email_recipient_stats');
    if (statsError) throw statsError;

    // Actual recipient tags from volunteers table
    const { data: tagStats, error: tagStatsError } = await supabase.rpc('email_recipient_tags');
    if (tagStatsError) throw tagStatsError;

    const result = computeSummary(
      (sends || []) as EmailSend[],
      (stats || []) as RecipientStat[],
      (tagStats || []) as RecipientTagStat[],
    );

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err, 'GET /api/email/summary');
  }
}
