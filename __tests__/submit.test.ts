/**
 * Tests for the public form submission endpoint.
 * We mock supabase and resend to test the route handler logic.
 */

// Mock Supabase
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockUpsert = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn();

const mockFrom = jest.fn().mockReturnValue({
  select: mockSelect.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  single: mockSingle,
  upsert: mockUpsert.mockReturnThis(),
  in: mockIn.mockReturnThis(),
  order: mockOrder.mockReturnThis(),
});

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

// Mock Resend
const mockSendEmail = jest.fn();
jest.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send: mockSendEmail } }),
  getFromEmail: () => 'noreply@example.com',
}));

// Import after mocks
import { POST } from '@/app/api/submit/[slug]/route';
import { NextRequest } from 'next/server';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/submit/test-form', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/submit/[slug]', () => {
  const params = { slug: 'test-form' };

  it('returns 404 if form not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await POST(makeRequest({ email: 'a@b.com' }), { params });
    expect(res.status).toBe(404);
  });

  it('returns 410 if form is inactive', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: '1', slug: 'test-form', is_active: false, field_ids: [] },
      error: null,
    });

    const res = await POST(makeRequest({ email: 'a@b.com' }), { params });
    expect(res.status).toBe(410);
  });

  it('silently accepts honeypot submissions', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: '1', slug: 'test-form', is_active: true, field_ids: [] },
      error: null,
    });

    const res = await POST(
      makeRequest({ email: 'a@b.com', first_name: 'A', last_name: 'B', _hp: 'bot-filled' }),
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Should NOT have called upsert (volunteer was not created)
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 if required fields missing', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: '1', slug: 'test-form', is_active: true, field_ids: [] },
      error: null,
    });

    const res = await POST(makeRequest({ email: 'a@b.com' }), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: '1', slug: 'test-form', is_active: true, field_ids: [] },
      error: null,
    });

    const res = await POST(
      makeRequest({ email: 'not-an-email', first_name: 'A', last_name: 'B' }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('successfully creates volunteer and sends welcome email', async () => {
    const form = {
      id: '1',
      slug: 'test-form',
      is_active: true,
      field_ids: [],
      welcome_email_subject: 'Welcome {{first_name}}!',
      welcome_email_body: '<p>Hi {{first_name}}</p>',
    };
    const volunteer = {
      id: 'v1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
    };

    // Form lookup
    mockSingle.mockResolvedValueOnce({ data: form, error: null });
    // Volunteer upsert
    mockSingle.mockResolvedValueOnce({ data: volunteer, error: null });
    mockSendEmail.mockResolvedValueOnce({ data: { id: 'email-1' } });

    const res = await POST(
      makeRequest({
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      }),
      { params }
    );

    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('auto-logs signup interaction', async () => {
    const form = {
      id: 'f1',
      name: 'Main Form',
      slug: 'test-form',
      is_active: true,
      field_ids: [],
      welcome_email_subject: null,
      welcome_email_body: null,
    };
    const volunteer = {
      id: 'v1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
    };

    const mockInteractionsInsert = jest.fn().mockResolvedValue({ error: null });

    // Form lookup
    mockFrom.mockImplementation((table: string) => {
      if (table === 'forms') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: form, error: null }),
            }),
          }),
        };
      }
      if (table === 'volunteers') {
        return {
          upsert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: volunteer, error: null }),
            }),
          }),
        };
      }
      if (table === 'interactions') {
        return { insert: mockInteractionsInsert };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const res = await POST(
      makeRequest({
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      }),
      { params }
    );

    expect(res.status).toBe(200);
    expect(mockInteractionsInsert).toHaveBeenCalledTimes(1);
    const inserted = mockInteractionsInsert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      volunteer_id: 'v1',
      type: 'signup',
      description: 'Signed up via Main Form',
      created_by: 'system',
    });
    expect(inserted.metadata).toEqual({ form_id: 'f1', form_slug: 'test-form' });
  });

  it('succeeds even if welcome email fails', async () => {
    const form = {
      id: '1',
      slug: 'test-form',
      is_active: true,
      field_ids: [],
      welcome_email_subject: 'Welcome!',
      welcome_email_body: '<p>Hi</p>',
    };
    const volunteer = {
      id: 'v1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
    };

    mockSingle.mockResolvedValueOnce({ data: form, error: null });
    mockSingle.mockResolvedValueOnce({ data: volunteer, error: null });
    mockSendEmail.mockRejectedValueOnce(new Error('Resend error'));

    const res = await POST(
      makeRequest({
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      }),
      { params }
    );

    expect(res.status).toBe(200);
  });
});
