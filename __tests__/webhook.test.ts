/**
 * Tests for the Resend webhook handler.
 */

const mockWUpdate = jest.fn().mockReturnThis();
const mockWeq = jest.fn().mockReturnThis();
const mockWneq = jest.fn().mockReturnThis();

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      update: mockWUpdate,
      eq: mockWeq,
      neq: mockWneq,
    }),
  }),
}));

// Mock svix webhook verification
const mockVerify = jest.fn();
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
}));

import { POST } from '@/app/api/webhooks/resend/route';
import { NextRequest } from 'next/server';

function makeWebhookRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/webhooks/resend', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'svix-id': 'test-id',
      'svix-timestamp': '1234567890',
      'svix-signature': 'test-sig',
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
});

describe('POST /api/webhooks/resend', () => {
  it('rejects invalid signature', async () => {
    mockVerify.mockImplementationOnce(() => {
      throw new Error('Invalid signature');
    });

    const res = await POST(makeWebhookRequest({ type: 'email.delivered' }));
    expect(res.status).toBe(401);
  });

  it('handles email.delivered event', async () => {
    mockVerify.mockReturnValueOnce({
      type: 'email.delivered',
      data: { email_id: 'resend-123' },
    });

    const res = await POST(makeWebhookRequest({}));
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(mockWUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' })
    );
  });

  it('handles email.opened event', async () => {
    mockVerify.mockReturnValueOnce({
      type: 'email.opened',
      data: { email_id: 'resend-456' },
    });

    const res = await POST(makeWebhookRequest({}));
    expect(res.status).toBe(200);
    expect(mockWUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'opened' })
    );
  });

  it('handles email.bounced event', async () => {
    mockVerify.mockReturnValueOnce({
      type: 'email.bounced',
      data: { email_id: 'resend-789' },
    });

    const res = await POST(makeWebhookRequest({}));
    expect(res.status).toBe(200);
    expect(mockWUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'bounced' })
    );
  });

  it('ignores unknown event types', async () => {
    mockVerify.mockReturnValueOnce({
      type: 'email.clicked',
      data: { email_id: 'resend-999' },
    });

    const res = await POST(makeWebhookRequest({}));
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it('handles events without email_id gracefully', async () => {
    mockVerify.mockReturnValueOnce({
      type: 'email.delivered',
      data: {},
    });

    const res = await POST(makeWebhookRequest({}));
    expect(res.status).toBe(200);
    expect(mockWUpdate).not.toHaveBeenCalled();
  });
});
