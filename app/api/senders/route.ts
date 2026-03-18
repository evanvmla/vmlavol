import { NextResponse } from 'next/server';

export async function GET() {
  const raw = process.env.RESEND_FROM_ADDRESSES || process.env.RESEND_FROM_EMAIL || '';
  const senders = raw.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  return NextResponse.json(senders);
}
