/**
 * Tests for the email send endpoint.
 * Covers two recipient resolution paths:
 *   1. volunteer_ids[] → send to specific volunteers
 *   2. filter_criteria  → bulk filter-based (existing)
 */

// Mock Supabase
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockInsert = jest.fn();
const mockIn = jest.fn();
const mockContains = jest.fn();
const mockOrder = jest.fn();

const mockFrom = jest.fn().mockReturnValue({
  select: mockSelect.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  single: mockSingle,
  insert: mockInsert.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  contains: mockContains.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
});

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

jest.mock('@/lib/filter-volunteers', () => ({
  applyFilterRules: (query: unknown) => query,
}));

import { POST } from '@/app/api/email/send/route';
import { NextRequest } from 'next/server';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/email/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default: custom_fields returns empty
  mockFrom.mockImplementation((table: string) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
      insert: jest.fn().mockReturnThis(),
    };

    if (table === 'custom_fields') {
      chain.select = jest.fn().mockResolvedValue({ data: [], error: null });
      return chain;
    }

    if (table === 'volunteers') {
      // Default: return the chain for further calls
      const volChain = {
        ...chain,
        select: jest.fn().mockReturnValue(chain),
      };
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.in = jest.fn().mockReturnValue(chain);
      return volChain;
    }

    return chain;
  });
});

describe('POST /api/email/send', () => {
  it('returns 400 if subject is missing', async () => {
    const res = await POST(makeRequest({ body: '<p>hi</p>' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/subject/i);
  });

  it('returns 400 if body is missing', async () => {
    const res = await POST(makeRequest({ subject: 'Hello' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/body/i);
  });

  it('sends to specific volunteer_ids', async () => {
    const volunteerIds = ['v1', 'v2'];
    const emailSend = { id: 'es1' };

    // Setup chain for this specific test
    const volResult = { data: [{ id: 'v1' }, { id: 'v2' }], error: null };
    const mockRecipientsInsert = jest.fn().mockResolvedValue({ error: null });
    const emailResult = { data: emailSend, error: null };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'custom_fields') {
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'volunteers') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue(volResult),
              }),
            }),
          }),
        };
      }
      if (table === 'email_sends') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue(emailResult),
            }),
          }),
        };
      }
      if (table === 'email_recipients') {
        callCount++;
        return { insert: mockRecipientsInsert };
      }
      if (table === 'interactions') {
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const res = await POST(makeRequest({
      subject: 'Hello',
      body: '<p>Test</p>',
      volunteer_ids: volunteerIds,
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.recipient_count).toBe(2);
    expect(json.id).toBe('es1');

    // Assert retry_count: 0 is explicitly set on recipient rows
    expect(mockRecipientsInsert).toHaveBeenCalled();
    const insertedRows = mockRecipientsInsert.mock.calls[0][0];
    for (const row of insertedRows) {
      expect(row).toHaveProperty('retry_count', 0);
    }
  });

  it('returns 400 when volunteer_ids are all inactive', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'custom_fields') {
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'volunteers') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const res = await POST(makeRequest({
      subject: 'Hello',
      body: '<p>Test</p>',
      volunteer_ids: ['inactive-v1'],
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no matching/i);
  });

  it('filters out inactive volunteers from volunteer_ids', async () => {
    const emailSend = { id: 'es2' };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'custom_fields') {
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'volunteers') {
        // Only v1 is active, v2 is inactive (not returned)
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: [{ id: 'v1' }], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'email_sends') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: emailSend, error: null }),
            }),
          }),
        };
      }
      if (table === 'email_recipients') {
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'interactions') {
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const res = await POST(makeRequest({
      subject: 'Hello',
      body: '<p>Test</p>',
      volunteer_ids: ['v1', 'v2'],
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    // Only 1 recipient because v2 is inactive
    expect(json.recipient_count).toBe(1);
  });

  it('auto-logs interactions for each recipient', async () => {
    const volunteerIds = ['v1', 'v2'];
    const emailSend = { id: 'es-int' };
    const mockInteractionsInsert = jest.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'custom_fields') {
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'volunteers') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: [{ id: 'v1' }, { id: 'v2' }], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'email_sends') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: emailSend, error: null }),
            }),
          }),
        };
      }
      if (table === 'email_recipients') {
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'interactions') {
        return { insert: mockInteractionsInsert };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const res = await POST(makeRequest({
      subject: 'March Newsletter',
      body: '<p>Hello</p>',
      volunteer_ids: volunteerIds,
    }));

    expect(res.status).toBe(201);
    expect(mockInteractionsInsert).toHaveBeenCalledTimes(1);
    const insertedRows = mockInteractionsInsert.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      volunteer_id: 'v1',
      type: 'email',
      description: 'March Newsletter',
      created_by: 'system',
    });
    expect(insertedRows[0].metadata).toEqual({ email_send_id: 'es-int' });
  });

  it('falls back to filter flow when no volunteer_ids', async () => {
    const emailSend = { id: 'es3' };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'custom_fields') {
        return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'volunteers') {
        // Filter flow: select → eq → (applyFilterRules returns query as-is) → awaited
        // Build a thenable that also responds to any chained Supabase method
        const volData = { data: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }], error: null };
        const makeThenable = (): Record<string, unknown> => {
          const obj: Record<string, unknown> = {};
          // Make it thenable so `await` works
          obj.then = (resolve: (v: unknown) => unknown) => Promise.resolve(volData).then(resolve);
          // Any chained method returns itself
          for (const m of ['select', 'eq', 'in', 'contains', 'order', 'not', 'or', 'ilike', 'gte', 'lte', 'is']) {
            obj[m] = jest.fn().mockReturnValue(obj);
          }
          return obj;
        };
        return { select: jest.fn().mockReturnValue(makeThenable()) };
      }
      if (table === 'email_sends') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: emailSend, error: null }),
            }),
          }),
        };
      }
      if (table === 'email_recipients') {
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }
      return { select: jest.fn().mockReturnThis() };
    });

    const res = await POST(makeRequest({
      subject: 'Hello',
      body: '<p>Test</p>',
      filter_criteria: { rules: [] },
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.recipient_count).toBe(3);
  });
});
