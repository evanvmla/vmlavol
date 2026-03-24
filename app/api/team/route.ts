import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { getResend, getFromEmail } from '@/lib/resend';
import { renderInviteEmail } from '@/lib/emails/invite-template';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) throw error;

    const users = (data.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      email_confirmed_at: u.email_confirmed_at,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));

    return NextResponse.json(users);
  } catch (error) {
    return handleError(error, 'team.list');
  }
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // Check if user already exists
    const { data: existing } = await supabase.auth.admin.listUsers();
    if (existing?.users?.some((u) => u.email === email)) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    if (process.env.NODE_ENV === 'production' && (!APP_URL || APP_URL.includes('localhost'))) {
      console.warn('[team.invite] NEXT_PUBLIC_APP_URL is unset or contains localhost in production');
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: { password_set: false } },
    });

    if (linkError) throw linkError;

    const hashedToken = linkData.properties.hashed_token;
    const inviteLink = `${APP_URL}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=invite&next=/set-password`;
    const html = renderInviteEmail(inviteLink);

    const { error: sendError } = await getResend().emails.send({
      from: `VMLA <${getFromEmail().match(/<(.+)>/)?.[1] || getFromEmail()}>`,
      to: email,
      subject: "You're invited to VMLA",
      html,
    });

    if (sendError) throw sendError;

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'team.invite');
  }
}
