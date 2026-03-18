import { NextRequest, NextResponse } from 'next/server';
import { renderBulkEmail } from '@/lib/emails/bulk-template';
import { handleError } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  try {
    const { template } = await request.json();
    if (!template) {
      return NextResponse.json({ error: 'template is required' }, { status: 400 });
    }

    const rendered = renderBulkEmail(template, {
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane.doe@example.com',
    });

    return NextResponse.json({ html: rendered });
  } catch (err) {
    return handleError(err, 'POST /api/email/preview');
  }
}
