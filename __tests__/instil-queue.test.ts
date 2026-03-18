/**
 * Tests for Instil queue insert in the submit route.
 * Verifies 3 paths: env not set, success, and queue insert failure.
 */

const mockSingle = jest.fn();
const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockIn = jest.fn().mockReturnValue({ data: [{ key: 'spoken-language', field_type: 'multiselect', is_required: false }, { key: 'how-would-you-like-to-help', field_type: 'multiselect', is_required: false }], error: null });

const mockFrom = jest.fn().mockImplementation((table: string) => {
  if (table === 'forms') {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single: mockSingle }),
      }),
    };
  }
  if (table === 'custom_fields') {
    return { select: jest.fn().mockReturnValue({ in: mockIn }) };
  }
  if (table === 'volunteers') {
    return {
      upsert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'v1', email: 'test@example.com', first_name: 'Test', last_name: 'User' },
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === 'instil_sync_queue') {
    return { insert: mockInsert };
  }
  if (table === 'interactions') {
    return { insert: jest.fn().mockResolvedValue({ error: null }) };
  }
  return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn() };
});

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}));

jest.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send: jest.fn().mockResolvedValue({}) } }),
  getFromEmail: () => 'noreply@example.com',
}));

import { POST } from '@/app/api/submit/[slug]/route';
import { NextRequest } from 'next/server';

const form = {
  id: 'f1', slug: 'test-form', name: 'Test', is_active: true,
  field_ids: ['cf1', 'cf2'],
  welcome_email_subject: null, welcome_email_body: null,
};

const params = { slug: 'test-form' };

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/submit/test-form', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const defaultBody = {
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  phone: '3105551234',
  zip_code: '90001',
  custom_data: { 'spoken-language': ['English', 'Spanish'], 'how-would-you-like-to-help': ['Driving'] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSingle.mockResolvedValue({ data: form, error: null });
  mockInsert.mockResolvedValue({ error: null });
  delete process.env.INSTIL_FORM_URL;
});

describe('Instil queue insert', () => {
  it('skips queue insert when INSTIL_FORM_URL is not set', async () => {
    const res = await POST(makeRequest(defaultBody), { params });
    expect(res.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalledWith('instil_sync_queue');
  });

  it('inserts into instil_sync_queue with correct volunteer_data', async () => {
    process.env.INSTIL_FORM_URL = 'https://forms.instil.io/test';

    const res = await POST(makeRequest(defaultBody), { params });
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('instil_sync_queue');
    expect(mockInsert).toHaveBeenCalledWith({
      volunteer_data: {
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
        phone: '3105551234',
        zip_code: '90001',
        spoken_language: ['English', 'Spanish'],
        how_to_help: ['Driving'],
      },
    });
  });

  it('still returns 200 when queue insert throws', async () => {
    process.env.INSTIL_FORM_URL = 'https://forms.instil.io/test';
    mockInsert.mockRejectedValueOnce(new Error('DB error'));

    const res = await POST(makeRequest(defaultBody), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
