import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { Webhook } from 'svix';

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error('RESEND_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.text();
    const headers = {
      'svix-id': request.headers.get('svix-id') || '',
      'svix-timestamp': request.headers.get('svix-timestamp') || '',
      'svix-signature': request.headers.get('svix-signature') || '',
    };

    // Verify webhook signature
    const wh = new Webhook(secret);
    let event: { type: string; data: { email_id?: string; [key: string]: unknown } };

    try {
      event = wh.verify(body, headers) as typeof event;
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const supabase = createSupabaseAdmin();
    const resendId = event.data.email_id;

    if (!resendId) {
      return NextResponse.json({ received: true });
    }

    switch (event.type) {
      case 'email.delivered': {
        await supabase
          .from('email_recipients')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .eq('resend_id', resendId);
        break;
      }

      case 'email.opened': {
        // Only upgrade status, don't downgrade from 'opened' to 'opened'
        await supabase
          .from('email_recipients')
          .update({
            status: 'opened',
            opened_at: new Date().toISOString(),
          })
          .eq('resend_id', resendId)
          .neq('status', 'opened');
        break;
      }

      case 'email.bounced': {
        await supabase
          .from('email_recipients')
          .update({
            status: 'failed',
            error: 'bounced',
          })
          .eq('resend_id', resendId);
        break;
      }

      default:
        // Ignore unknown events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    return handleError(err, 'POST /api/webhooks/resend');
  }
}
