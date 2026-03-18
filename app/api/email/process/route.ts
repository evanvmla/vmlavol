import { NextResponse } from 'next/server';
import { handleError } from '@/lib/api-helpers';
import { processEmailBatch } from '@/lib/process-emails';

// Auth-protected proxy for client-side polling.
// Middleware already verifies the user is authenticated for this path.
export async function POST() {
  try {
    const result = await processEmailBatch();
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err, 'POST /api/email/process');
  }
}
