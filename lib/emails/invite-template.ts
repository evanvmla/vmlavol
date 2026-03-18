export function renderInviteEmail(actionLink: string): string {
  const safeLink = encodeURI(actionLink);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to VMLA</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#111827;">VMLA</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Volunteer Management</p>
              <p style="margin:0 0 8px;font-size:15px;color:#374151;">You've been invited to join the VMLA team.</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Click the button below to accept your invitation and set up your password.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#2563eb;border-radius:8px;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">This invitation expires in 24 hours.</p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">If you didn't expect this email, you can safely ignore it.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
