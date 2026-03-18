const mockGenerateLink = jest.fn();
const mockListUsers = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createSupabaseAdmin: () => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
        generateLink: mockGenerateLink,
      },
    },
  }),
}));

const mockEmailsSend = jest.fn();

jest.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send: mockEmailsSend } }),
  getFromEmail: () => 'team@vmla.test',
}));

import { POST } from '@/app/api/team/route';
import { renderInviteEmail } from '@/lib/emails/invite-template';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/team', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mockGenerateLink.mockResolvedValue({
    data: { properties: { action_link: 'https://supabase.co/auth/v1/verify?token=abc123', hashed_token: 'hashed_abc123' } },
    error: null,
  });
  mockEmailsSend.mockResolvedValue({ error: null });
});

describe('POST /api/team (invite)', () => {
  it('returns 400 for invalid email', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/email/i);
  });

  it('returns 400 for missing email', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate email', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ email: 'existing@test.com' }] },
      error: null,
    });

    const res = await POST(makeRequest({ email: 'existing@test.com' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already exists/i);
  });

  it('returns 500 when generateLink fails', async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: new Error('Supabase link error'),
    });

    const res = await POST(makeRequest({ email: 'new@test.com' }));
    expect(res.status).toBe(500);
  });

  it('returns 500 when Resend send fails', async () => {
    mockEmailsSend.mockResolvedValue({ error: new Error('Resend failure') });

    const res = await POST(makeRequest({ email: 'new@test.com' }));
    expect(res.status).toBe(500);
  });

  it('succeeds and sends branded email', async () => {
    const res = await POST(makeRequest({ email: 'new@test.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'new@test.com',
      options: { data: { password_set: false } },
    });

    // Verify custom link uses hashed_token instead of Supabase's action_link
    const sendCall = mockEmailsSend.mock.calls[0][0];
    expect(sendCall.from).toBe('VMLA <team@vmla.test>');
    expect(sendCall.to).toBe('new@test.com');
    expect(sendCall.subject).toMatch(/invited/i);
    expect(sendCall.html).toContain('Accept Invitation');
    expect(sendCall.html).toContain('token_hash=hashed_abc123');
    expect(sendCall.html).toContain('type=invite');
    expect(sendCall.html).toContain('next=/set-password');
  });
});

describe('renderInviteEmail', () => {
  it('contains the invite link and key HTML elements', () => {
    const link = 'https://app.vmla.com/auth/callback?token_hash=abc123&type=invite&next=/set-password';
    const html = renderInviteEmail(link);

    expect(html).toContain('VMLA');
    expect(html).toContain('Accept Invitation');
    expect(html).toContain(encodeURI(link));
    expect(html).toContain('24 hours');
  });
});
