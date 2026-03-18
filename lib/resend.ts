import { Resend } from 'resend';

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('Missing RESEND_API_KEY');
    resendClient = new Resend(key);
  }
  return resendClient;
}

export function getFromEmail(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('Missing RESEND_FROM_EMAIL');
  return from;
}
