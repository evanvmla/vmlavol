/**
 * Tests for processEmailBatch().
 * Validates atomic row claiming via RPC,
 * per-recipient error handling, and completion checks.
 */

// --- Supabase mock setup ---
const mockRpc = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainable(): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const m of ['select', 'eq', 'in', 'lt', 'limit', 'update', 'single', 'not', 'contains', 'order']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  return chain;
}

// Returns a jest.fn() for update() that tracks calls and returns a properly chainable, thenable object
function trackingUpdate() {
  return jest.fn().mockImplementation(() => {
    const c = chainable();
    c.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve);
    return c;
  });
}

const mockFrom = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

// --- Resend mock ---
const mockSendEmail = jest.fn();
jest.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send: mockSendEmail } }),
  getFromEmail: () => 'test@example.com',
}));

// --- Template mock ---
jest.mock('@/lib/emails/bulk-template', () => ({
  renderBulkEmail: (template: string) => template,
}));

import { processEmailBatch } from '@/lib/process-emails';

const SEND = { id: 'send-1', subject: 'Test', body: '<p>Hello</p>', filter_criteria: {} };
const RECIPIENT = { id: 'rec-1', volunteer_id: 'vol-1', retry_count: 0, email_send_id: 'send-1', status: 'processing' };
const VOLUNTEER = { id: 'vol-1', email: 'alice@test.com', first_name: 'Alice', last_name: 'Smith' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendsChain(): Record<string, any> {
  const c = chainable();
  c.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [SEND], error: null }).then(resolve);
  c.update = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
  return c;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recipientsChain(updateMock: jest.Mock, inMock?: jest.Mock): Record<string, any> {
  const _inMock = inMock || jest.fn().mockResolvedValue({ count: 0 });
  return {
    update: updateMock,
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        in: _inMock,
      }),
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function volsChain(data: unknown[] = [VOLUNTEER]): Record<string, any> {
  const c = chainable();
  c.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return c;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultChain(): Record<string, any> {
  const c = chainable();
  c.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return c;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('processEmailBatch', () => {
  it('calls RPC with correct params', async () => {
    const updateMock = trackingUpdate();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock);
      if (table === 'volunteers') return volsChain();
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [RECIPIENT], error: null });
    mockSendEmail.mockResolvedValue({ data: { id: 'resend-1' } });

    await processEmailBatch();

    expect(mockRpc).toHaveBeenCalledWith('claim_email_recipients', {
      p_send_id: 'send-1',
      p_batch_size: 25,
    });
  });

  it('marks vol-not-found recipients as failed', async () => {
    const recipientMissingVol = { ...RECIPIENT, volunteer_id: 'vol-missing' };
    const updateMock = trackingUpdate();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock);
      if (table === 'volunteers') return volsChain([]);
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [recipientMissingVol], error: null });

    await processEmailBatch();

    const failedCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg.status === 'failed' && arg.error === 'Volunteer not found';
      }
    );
    expect(failedCall).toBeTruthy();
  });

  it('marks successful send with status sent and resend_id', async () => {
    const updateMock = trackingUpdate();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock);
      if (table === 'volunteers') return volsChain();
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [RECIPIENT], error: null });
    mockSendEmail.mockResolvedValue({ data: { id: 'resend-abc' } });

    const result = await processEmailBatch();

    expect(result.processed).toBe(1);
    const sentCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg.status === 'sent' && arg.resend_id === 'resend-abc';
      }
    );
    expect(sentCall).toBeTruthy();
  });

  it('handles Resend 429 by setting pending and breaking loop', async () => {
    const recipient2 = { ...RECIPIENT, id: 'rec-2', volunteer_id: 'vol-2' };
    const vol2 = { ...VOLUNTEER, id: 'vol-2', email: 'bob@test.com' };
    const updateMock = trackingUpdate();
    const inMock = jest.fn().mockResolvedValue({ count: 1 });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock, inMock);
      if (table === 'volunteers') return volsChain([VOLUNTEER, vol2]);
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [RECIPIENT, recipient2], error: null });

    const rateLimitError = Object.assign(new Error('Rate limited'), { statusCode: 429 });
    mockSendEmail.mockRejectedValueOnce(rateLimitError);

    await processEmailBatch();

    // Should only have called send once (broke after 429)
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    // First recipient should be set back to pending
    const pendingCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg.status === 'pending' && arg.retry_count === 1;
      }
    );
    expect(pendingCall).toBeTruthy();
  });

  it('increments retry_count on non-429 error and fails after max retries', async () => {
    const recipientAtMaxRetries = { ...RECIPIENT, retry_count: 2 };
    const updateMock = trackingUpdate();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock);
      if (table === 'volunteers') return volsChain();
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [recipientAtMaxRetries], error: null });
    mockSendEmail.mockRejectedValue(new Error('SMTP failure'));

    await processEmailBatch();

    // retry_count 2 + 1 = 3 >= MAX_RETRIES -> status should be 'failed'
    const failedCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg.status === 'failed' && arg.retry_count === 3;
      }
    );
    expect(failedCall).toBeTruthy();
  });

  it('completion check uses pending and processing statuses', async () => {
    const updateMock = trackingUpdate();
    const inMock = jest.fn().mockResolvedValue({ count: 0 });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock, inMock);
      if (table === 'volunteers') return volsChain();
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [RECIPIENT], error: null });
    mockSendEmail.mockResolvedValue({ data: { id: 'resend-1' } });

    await processEmailBatch();

    // The completion check should use .in('status', ['pending', 'processing'])
    expect(inMock).toHaveBeenCalledWith('status', ['pending', 'processing']);
  });

  it('handles Resend result.error by retrying or failing', async () => {
    const recipientAtRetry1 = { ...RECIPIENT, retry_count: 1 };
    const updateMock = trackingUpdate();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock);
      if (table === 'volunteers') return volsChain();
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [recipientAtRetry1], error: null });
    mockSendEmail.mockResolvedValue({ data: null, error: { message: 'validation_error' } });

    const result = await processEmailBatch();

    // Should not count as processed
    expect(result.processed).toBe(0);

    // retry_count 1 + 1 = 2 < MAX_RETRIES -> status should be 'pending'
    const pendingCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg.status === 'pending' && arg.retry_count === 2 && arg.error === 'validation_error';
      }
    );
    expect(pendingCall).toBeTruthy();
  });

  it('handles Resend result.error with max retries as failed', async () => {
    const recipientAtMaxRetries = { ...RECIPIENT, retry_count: 2 };
    const updateMock = trackingUpdate();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'email_sends') return sendsChain();
      if (table === 'email_recipients') return recipientsChain(updateMock);
      if (table === 'volunteers') return volsChain();
      return defaultChain();
    });
    mockRpc.mockResolvedValue({ data: [recipientAtMaxRetries], error: null });
    mockSendEmail.mockResolvedValue({ data: null, error: { message: 'validation_error' } });

    await processEmailBatch();

    // retry_count 2 + 1 = 3 >= MAX_RETRIES -> status should be 'failed'
    const failedCall = updateMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as Record<string, unknown>;
        return arg.status === 'failed' && arg.retry_count === 3 && arg.error === 'validation_error';
      }
    );
    expect(failedCall).toBeTruthy();
  });

  it('returns processed: 0 when no active sends', async () => {
    mockFrom.mockImplementation(() => {
      const c = chainable();
      c.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return c;
    });

    const result = await processEmailBatch();
    expect(result.processed).toBe(0);
  });
});
