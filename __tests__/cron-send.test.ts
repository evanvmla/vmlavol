/**
 * Tests for the cron email sender endpoint.
 */

const mockEmailRecipients: Record<string, unknown>[] = [];
const mockUpdate = jest.fn().mockReturnThis();
const mockIn2 = jest.fn().mockReturnThis();

const mockFrom2 = jest.fn().mockImplementation((table: string) => {
  if (table === 'email_sends') {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: mockUpdate,
      then: jest.fn(),
    };
  }
  if (table === 'email_recipients') {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: mockEmailRecipients, error: null }),
      update: mockUpdate,
      in: mockIn2,
      neq: jest.fn().mockReturnThis(),
    };
  }
  if (table === 'volunteers') {
    return {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: 'v1', email: 'a@test.com', first_name: 'A', last_name: 'B' },
        ],
        error: null,
      }),
    };
  }
  return {};
});

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom2 }),
}));

const mockSendEmail2 = jest.fn();
jest.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send: mockSendEmail2 } }),
  getFromEmail: () => 'noreply@example.com',
}));

jest.mock('@/lib/api-helpers', () => ({
  verifyCronSecret: (req: Request) => req.headers.get('authorization') === 'Bearer test-secret',
  handleError: jest.fn().mockImplementation((err, ctx) => {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }),
}));

import { POST } from '@/app/api/cron/send-emails/route';
import { NextRequest } from 'next/server';

function makeCronRequest(authorized = true) {
  return new NextRequest('http://localhost:3000/api/cron/send-emails', {
    method: 'POST',
    headers: authorized ? { Authorization: 'Bearer test-secret' } : {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmailRecipients.length = 0;
});

describe('POST /api/cron/send-emails', () => {
  it('returns 401 if not authorized', async () => {
    const res = await POST(makeCronRequest(false));
    expect(res.status).toBe(401);
  });

  it('returns 0 processed when no active sends', async () => {
    // Mock email_sends returning empty
    mockFrom2.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const res = await POST(makeCronRequest());
    const json = await res.json();
    expect(json.processed).toBe(0);
  });
});
