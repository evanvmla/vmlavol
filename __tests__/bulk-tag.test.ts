const mockSelect = jest.fn();
const mockIn = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();

const mockFrom = jest.fn().mockReturnValue({
  select: mockSelect.mockReturnThis(),
  in: mockIn,
  update: mockUpdate.mockReturnThis(),
  eq: mockEq,
});

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

import { POST, DELETE } from '@/app/api/volunteers/bulk-tag/route';
import { NextRequest } from 'next/server';

function makeRequest(method: string, body: unknown) {
  return new NextRequest('http://localhost:3000/api/volunteers/bulk-tag', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset chain
  mockFrom.mockReturnValue({
    select: mockSelect.mockReturnThis(),
    in: mockIn,
    update: mockUpdate.mockReturnThis(),
    eq: mockEq,
  });
});

describe('POST /api/volunteers/bulk-tag (add)', () => {
  it('adds tag to volunteers that do not have it', async () => {
    mockIn.mockResolvedValueOnce({
      data: [
        { id: '1', tags: ['existing'] },
        { id: '2', tags: [] },
        { id: '3', tags: ['newtag'] }, // already has tag
      ],
      error: null,
    });
    mockEq.mockResolvedValue({ error: null });

    const res = await POST(makeRequest('POST', { ids: ['1', '2', '3'], tag: 'newtag' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.updated).toBe(2);
    // Should only update vol 1 and 2, not 3
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('returns 400 for empty ids', async () => {
    const res = await POST(makeRequest('POST', { ids: [], tag: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty/whitespace tag', async () => {
    const res = await POST(makeRequest('POST', { ids: ['1'], tag: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids exceeds 200', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i));
    const res = await POST(makeRequest('POST', { ids, tag: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on supabase error', async () => {
    mockIn.mockResolvedValueOnce({
      data: null,
      error: { message: 'db error' },
    });

    const res = await POST(makeRequest('POST', { ids: ['1'], tag: 'test' }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/volunteers/bulk-tag (remove)', () => {
  it('removes tag from volunteers that have it', async () => {
    mockIn.mockResolvedValueOnce({
      data: [
        { id: '1', tags: ['a', 'removeme'] },
        { id: '2', tags: ['b'] }, // doesn't have tag
        { id: '3', tags: ['removeme', 'c'] },
      ],
      error: null,
    });
    mockEq.mockResolvedValue({ error: null });

    const res = await DELETE(makeRequest('DELETE', { ids: ['1', '2', '3'], tag: 'removeme' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.updated).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('returns 400 for empty ids', async () => {
    const res = await DELETE(makeRequest('DELETE', { ids: [], tag: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty/whitespace tag', async () => {
    const res = await DELETE(makeRequest('DELETE', { ids: ['1'], tag: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids exceeds 200', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i));
    const res = await DELETE(makeRequest('DELETE', { ids, tag: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on supabase error', async () => {
    mockIn.mockResolvedValueOnce({
      data: null,
      error: { message: 'db error' },
    });

    const res = await DELETE(makeRequest('DELETE', { ids: ['1'], tag: 'test' }));
    expect(res.status).toBe(500);
  });
});
