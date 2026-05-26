import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError, corsHeaders } from '@/lib/api-helpers';
import { isValidEmail } from '@/lib/validation';
import { getResend, getFromEmail } from '@/lib/resend';
import { renderWelcomeEmail } from '@/lib/emails/welcome';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = createSupabaseAdmin();

    // Fetch form
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('*')
      .eq('slug', params.slug)
      .single();

    if (formError || !form) {
      return NextResponse.json(
        { error: 'Form not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    if (!form.is_active) {
      return NextResponse.json(
        { error: 'This form is no longer accepting submissions' },
        { status: 410, headers: corsHeaders() }
      );
    }

    const body = await request.json();

    // Honeypot check
    if (body._hp) {
      // Silently reject but return success to bots
      return NextResponse.json({ success: true }, { headers: corsHeaders() });
    }

    // Validate required core fields
    if (!body.email || !body.first_name || !body.last_name) {
      return NextResponse.json(
        { error: 'Email, first name, and last name are required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    if (!isValidEmail(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Fetch custom fields (used for validation and Instil forwarding)
    let fields: Record<string, unknown>[] | null = null;
    if (form.field_ids && form.field_ids.length > 0) {
      const { data } = await supabase
        .from('custom_fields')
        .select('*')
        .in('id', form.field_ids);
      fields = data;
    }

    // Validate required custom fields
    if (fields) {
      for (const field of fields) {
        if (field.is_required) {
          const val = body.custom_data?.[field.key as string];
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            return NextResponse.json(
              { error: `${(field as { name: string }).name} is required` },
              { status: 400, headers: corsHeaders() }
            );
          }
        }
      }
    }

    // Fetch existing volunteer to merge custom_data and preserve source_form_id
    const normalizedEmail = body.email.toLowerCase().trim();
    const { data: existing } = await supabase
      .from('volunteers')
      .select('source_form_id, custom_data')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const existingCustom = (existing?.custom_data as Record<string, unknown>) || {};
    const incomingCustom = (body.custom_data || {}) as Record<string, unknown>;

    // Merge: new values win, but blank/empty values don't erase existing data
    const mergedCustomData = { ...existingCustom };
    for (const [key, value] of Object.entries(incomingCustom)) {
      const isBlank = value === '' || value === null || value === undefined
        || (Array.isArray(value) && value.length === 0);
      if (!isBlank) {
        mergedCustomData[key] = value;
      }
    }

    // Upsert volunteer
    const { data: volunteer, error: volError } = await supabase
      .from('volunteers')
      .upsert(
        {
          email: normalizedEmail,
          first_name: body.first_name.trim(),
          last_name: body.last_name.trim(),
          phone: body.phone || null,
          zip_code: body.zip_code || null,
          source_form_id: existing?.source_form_id || form.id,
          custom_data: mergedCustomData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (volError) throw volError;

    // Queue for Instil sync (non-fatal)
    try {
      if (process.env.INSTIL_FORM_URL) {
        await supabase.from('instil_sync_queue').insert({
          volunteer_data: {
            first_name: body.first_name.trim(),
            last_name: body.last_name.trim(),
            email: body.email.toLowerCase().trim(),
            phone: body.phone || '',
            zip_code: body.zip_code || '',
            spoken_language: body.custom_data?.['spoken-language'] || [],
            how_to_help: body.custom_data?.['how-would-you-like-to-help'] || [],
          },
        });
      }
    } catch (queueErr) {
      console.error('[submit/instil-queue]', queueErr);
    }

    // Auto-log signup interaction
    try {
      await supabase.from('interactions').insert({
        volunteer_id: volunteer.id,
        type: 'signup',
        description: `Signed up via ${form.name}`,
        metadata: { form_id: form.id, form_slug: form.slug },
        created_by: 'system',
      });
    } catch (interactionErr) {
      console.error('[submit/interaction]', interactionErr);
      // Non-fatal
    }

    // Send welcome email if configured
    if (form.welcome_email_subject && form.welcome_email_body && volunteer) {
      try {
        const resend = getResend();
        const htmlBody = renderWelcomeEmail(form.welcome_email_body, {
          first_name: volunteer.first_name,
          last_name: volunteer.last_name,
          email: volunteer.email,
        });
        const subject = renderWelcomeEmail(form.welcome_email_subject, {
          first_name: volunteer.first_name,
          last_name: volunteer.last_name,
          email: volunteer.email,
        });

        await resend.emails.send({
          from: getFromEmail(),
          to: volunteer.email,
          bcc: form.notification_email ? [form.notification_email] : undefined,
          subject,
          html: htmlBody,
        });
      } catch (emailErr) {
        console.error('[submit/welcome-email]', emailErr);
        // Don't fail the submission if email fails
      }
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (err) {
    return handleError(err, `POST /api/submit/${params.slug}`);
  }
}
