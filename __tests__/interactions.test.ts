/**
 * Tests for the interactions API endpoints.
 */

const mockFrom = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { GET, POST } from '@/app/api/interactions/route';
import { DELETE } from '@/app/api/interactions/[id]/route';
import { NextRequest } from 'next/server';

function makeGetRequest(params?: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/interactions');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/interactions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeDeleteRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/interactions/${id}`, {
    method: 'DELETE',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/interactions', () => {
  it('returns interactions ordered by created_at desc', async () => {
    const interactions = [
      { id: '1', volunteer_id: 'v1', type: 'note', description: 'Called', created_at: '2024-01-02' },
      { id: '2', volunteer_id: 'v1', type: 'signup', description: 'Signed up', created_at: '2024-01-01' },
    ];

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: interactions, error: null }),
        }),
      }),
    });

    const res = await GET(makeGetRequest({ volunteer_id: 'v1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].id).toBe('1');
  });

  it('returns 400 if no volunteer_id', async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/volunteer_id/i);
  });

  it('returns 500 on supabase error', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
      }),
    });

    const res = await GET(makeGetRequest({ volunteer_id: 'v1' }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/interactions', () => {
  it('creates interaction and returns 201', async () => {
    const created = {
      id: 'i1',
      volunteer_id: 'v1',
      type: 'note',
      description: 'Test note',
      metadata: {},
      created_by: 'user@test.com',
      created_at: '2024-01-01',
    };

    mockFrom.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    });

    const res = await POST(makePostRequest({
      volunteer_id: 'v1',
      type: 'note',
      description: 'Test note',
      created_by: 'user@test.com',
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('i1');
    expect(json.type).toBe('note');
  });

  it('returns 400 if missing volunteer_id', async () => {
    const res = await POST(makePostRequest({
      type: 'note',
      description: 'Test',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/volunteer_id/i);
  });

  it('returns 400 if missing description', async () => {
    const res = await POST(makePostRequest({
      volunteer_id: 'v1',
      type: 'note',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/description/i);
  });

  it('returns 400 if type is email (system-only)', async () => {
    const res = await POST(makePostRequest({
      volunteer_id: 'v1',
      type: 'email',
      description: 'Test',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/type must be/i);
  });

  it('returns 400 if type is signup (system-only)', async () => {
    const res = await POST(makePostRequest({
      volunteer_id: 'v1',
      type: 'signup',
      description: 'Test',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/type must be/i);
  });

  it('returns 400 if type is invalid string', async () => {
    const res = await POST(makePostRequest({
      volunteer_id: 'v1',
      type: 'invalid_type',
      description: 'Test',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/type must be/i);
  });
});

describe('DELETE /api/interactions/[id]', () => {
  it('returns success', async () => {
    mockFrom.mockReturnValue({
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    const res = await DELETE(makeDeleteRequest('i1'), { params: { id: 'i1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
