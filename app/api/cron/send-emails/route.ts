import { NextRequest, NextResponse } from 'next/server';
import { handleError, verifyCronSecret } from '@/lib/api-helpers';
import { processEmailBatch } from '@/lib/process-emails';

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processEmailBatch();
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err, 'POST /api/cron/send-emails');
  }
}
