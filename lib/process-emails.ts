import { createSupabaseAdmin } from '@/lib/supabase-server';
import { getResend, getFromEmail } from '@/lib/resend';
import { renderBulkEmail } from '@/lib/emails/bulk-template';

const BATCH_SIZE = 25;
const MAX_RETRIES = 3;

export async function processEmailBatch(): Promise<{ processed: number }> {
  const supabase = createSupabaseAdmin();

  // Find email sends that are in 'sending' status
  const { data: activeSends } = await supabase
    .from('email_sends')
    .select('id, subject, body, filter_criteria')
    .eq('status', 'sending');

  if (!activeSends || activeSends.length === 0) {
    return { processed: 0 };
  }

  let totalProcessed = 0;
  const resend = getResend();
  const defaultFromEmail = getFromEmail();

  for (const send of activeSends) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const criteria: Record<string, any> = send.filter_criteria || {};
    const fromEmail: string = criteria.from_address || defaultFromEmail;
    const sendCc: string[] | undefined = Array.isArray(criteria.cc) && criteria.cc.length ? criteria.cc : undefined;
    const sendBcc: string[] | undefined = Array.isArray(criteria.bcc) && criteria.bcc.length ? criteria.bcc : undefined;

    // Atomically claim pending rows via RPC (FOR UPDATE SKIP LOCKED)
    // Crash recovery: the RPC also reclaims rows stuck in 'processing' for >5 min
    const { data: recipients, error: claimError } = await supabase
      .rpc('claim_email_recipients', {
        p_send_id: send.id,
        p_batch_size: BATCH_SIZE,
      });

    if (claimError || !recipients || recipients.length === 0) continue;

    // Get volunteer details
    const volIds = recipients.map((r: { volunteer_id: string }) => r.volunteer_id);
    const { data: volunteers } = await supabase
      .from('volunteers')
      .select('id, email, first_name, last_name')
      .in('id', volIds);

    if (!volunteers) continue;

    const volMap = new Map(volunteers.map((v) => [v.id, v]));

    // Send emails individually
    for (const recipient of recipients) {
      const vol = volMap.get(recipient.volunteer_id);
      if (!vol) {
        // Mark as failed if volunteer not found
        await supabase
          .from('email_recipients')
          .update({ status: 'failed', error: 'Volunteer not found' })
          .eq('id', recipient.id);
        continue;
      }

      try {
        const html = renderBulkEmail(send.body, {
          first_name: vol.first_name,
          last_name: vol.last_name,
          email: vol.email,
        });

        const subject = renderBulkEmail(send.subject, {
          first_name: vol.first_name,
          last_name: vol.last_name,
          email: vol.email,
        });

        const result = await resend.emails.send({
          from: fromEmail,
          to: vol.email,
          subject,
          html,
          ...(sendCc && { cc: sendCc }),
          ...(sendBcc && { bcc: sendBcc }),
        });

        if (result.error) {
          const newRetry = recipient.retry_count + 1;
          await supabase
            .from('email_recipients')
            .update({
              status: newRetry >= MAX_RETRIES ? 'failed' : 'pending',
              retry_count: newRetry,
              error: result.error.message || 'Resend API error',
            })
            .eq('id', recipient.id);
        } else {
          await supabase
            .from('email_recipients')
            .update({
              status: 'sent',
              resend_id: result.data?.id || null,
              sent_at: new Date().toISOString(),
            })
            .eq('id', recipient.id);

          totalProcessed++;
        }

        // Rate-limit buffer between Resend API calls
        await new Promise(r => setTimeout(r, 100));
      } catch (emailErr: unknown) {
        // Handle rate limiting
        if (emailErr && typeof emailErr === 'object' && 'statusCode' in emailErr && (emailErr as { statusCode: number }).statusCode === 429) {
          // Put back to pending for next batch
          await supabase
            .from('email_recipients')
            .update({ status: 'pending', retry_count: recipient.retry_count + 1 })
            .eq('id', recipient.id);
          break; // Stop processing this send
        }

        await supabase
          .from('email_recipients')
          .update({
            status: recipient.retry_count + 1 >= MAX_RETRIES ? 'failed' : 'pending',
            retry_count: recipient.retry_count + 1,
            error: emailErr instanceof Error ? emailErr.message : 'Unknown error',
          })
          .eq('id', recipient.id);
      }
    }

    // Check if all recipients for this send are done
    const { count: remainingCount } = await supabase
      .from('email_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('email_send_id', send.id)
      .in('status', ['pending', 'processing']);

    if (remainingCount === 0) {
      await supabase
        .from('email_sends')
        .update({ status: 'sent' })
        .eq('id', send.id);
    }
  }

  return { processed: totalProcessed };
}
